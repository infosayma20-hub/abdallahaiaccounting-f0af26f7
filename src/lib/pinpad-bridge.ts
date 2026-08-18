/**
 * Bank of Palestine X990 PinPad — thin client to Print Bridge.
 *
 * ⚠️  IMPORTANT (NDA / اتفاقية الربط مع بنك فلسطين — بند السرية):
 *     تفاصيل بروتوكول TCP:7800، مفاتيح RSA/AES، وصيغة الرسائل المشفّرة
 *     يجب أن تبقى فقط داخل Print Bridge (ريبو خاص محلي على أجهزة الكاشير).
 *     هذا الملف لا يحتوي على أي منطق تشفير — بس واجهة استدعاء عامة.
 *
 * Flow: POS (browser) → Print Bridge (localhost:3001) → X990 (LAN:7800)
 */

import { checkBridgeAuthorized } from "@/lib/pos-device-auth";
import { supabase } from "@/integrations/supabase/client";

export type PinPadCurrency = "ILS" | "USD" | "JOD";

export interface PinPadSaleRequest {
  terminalId: string;        // bop_pinpad_terminals.id
  amount: number;            // major units, e.g. 12.95
  currency: PinPadCurrency;
  receipt: string;           // internal invoice/receipt number
  printSlip?: "customer" | "customer_merchant" | "none";
  cashback?: number;         // major units, for SALE_CB
  installments?: number;     // for LOAN
}

export interface PinPadSaleResponse {
  ok: boolean;
  respCode: string;           // "000" = success
  authCode?: string;
  seq?: string;
  stan?: string;
  cardMasked?: string;
  cardType?: string;          // VISA / MASTERCARD / ...
  entry?: string;             // ICC / CTLS / MSR
  aid?: string;
  datim?: string;             // yyMMddHHmmss (needed for later VOID)
  amount?: number;
  currency?: PinPadCurrency;
  errorMsg?: string;
  raw?: unknown;
}

export interface PinPadVoidRequest {
  terminalId: string;
  amount: number;
  currency: PinPadCurrency;
  origSeq: string;
  origDatim: string;          // yyMMddHHmmss (V5 mandatory)
  origAuthCode: string;       // V5 mandatory
  receipt: string;
}

type OpType = "SALE" | "SALE_CB" | "LOAN" | "VOID" | "RETURN" | "QUERY" | "BATCH" | "BATCH_TIME" | "QR";

/**
 * Immutable audit log — inserts one row per PinPad call.
 * Failures here are swallowed so they never break the payment flow;
 * the console is the fallback trail.
 */
async function logPinpadCall(args: {
  terminalId: string;
  opType: OpType;
  receipt?: string;
  amount?: number;
  currency?: PinPadCurrency;
  durationMs: number;
  response?: PinPadSaleResponse;
  errorMsg?: string;
}) {
  try {
    const { data: term } = await supabase
      .from("bop_pinpad_terminals" as any)
      .select("data_owner_id, branch_id, pos_terminal_id")
      .eq("id", args.terminalId)
      .maybeSingle();
    if (!term) return;
    const t = term as any;
    const { data: auth } = await supabase.auth.getUser();
    const r = args.response;
    await supabase.from("bop_pinpad_transactions" as any).insert({
      data_owner_id: t.data_owner_id,
      terminal_id: args.terminalId,
      branch_id: t.branch_id,
      pos_terminal_id: t.pos_terminal_id,
      op_type: args.opType,
      receipt_no: args.receipt ?? null,
      amount: args.amount ?? null,
      currency: args.currency ?? null,
      resp_code: r?.respCode ?? null,
      auth_code: r?.authCode ?? null,
      seq: r?.seq ?? null,
      stan: r?.stan ?? null,
      card_masked: r?.cardMasked ?? null,
      card_type: r?.cardType ?? null,
      entry_mode: r?.entry ?? null,
      aid: r?.aid ?? null,
      datim: r?.datim ?? null,
      is_success: !!(r?.ok && r?.respCode === "000"),
      error_msg: args.errorMsg ?? r?.errorMsg ?? null,
      duration_ms: args.durationMs,
      requested_by: auth?.user?.id ?? null,
      raw_response: r ? (r as any) : null,
    });
  } catch (e) {
    console.warn("[pinpad] audit log failed:", e);
  }
}

async function callAndLog(
  opType: OpType,
  path: string,
  body: any,
  meta: { terminalId: string; receipt?: string; amount?: number; currency?: PinPadCurrency },
): Promise<PinPadSaleResponse> {
  const started = Date.now();
  try {
    const res = await post<PinPadSaleResponse>(path, body);
    await logPinpadCall({ ...meta, opType, durationMs: Date.now() - started, response: res });
    return res;
  } catch (e: any) {
    const errorMsg = e?.message ?? String(e);
    await logPinpadCall({ ...meta, opType, durationMs: Date.now() - started, errorMsg });
    throw e;
  }
}

async function bridgeBase(): Promise<string> {
  const res = await checkBridgeAuthorized();
  if (!res.authorized || !res.bridgeUrl) {
    throw new Error("Print Bridge is not available on this device.");
  }
  return res.bridgeUrl.replace(/\/+$/, "");
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const base = await bridgeBase();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`PinPad bridge ${path} failed [${res.status}]: ${txt}`);
  }
  return res.json() as Promise<T>;
}

/** Health probe — checks the bridge exposes the pinpad module. */
export async function pinpadPing(): Promise<{ ok: boolean; version?: string }> {
  try {
    const base = await bridgeBase();
    const res = await fetch(`${base}/pinpad/ping`);
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false };
  }
}

export async function pinpadSale(req: PinPadSaleRequest): Promise<PinPadSaleResponse> {
  return callAndLog(req.cashback ? "SALE_CB" : req.installments ? "LOAN" : "SALE", "/pinpad/sale", req, {
    terminalId: req.terminalId, receipt: req.receipt, amount: req.amount, currency: req.currency,
  });
}

export async function pinpadVoid(req: PinPadVoidRequest): Promise<PinPadSaleResponse> {
  return callAndLog("VOID", "/pinpad/void", req, {
    terminalId: req.terminalId, receipt: req.receipt, amount: req.amount, currency: req.currency,
  });
}

export async function pinpadReturn(req: PinPadVoidRequest): Promise<PinPadSaleResponse> {
  return callAndLog("RETURN", "/pinpad/return", req, {
    terminalId: req.terminalId, receipt: req.receipt, amount: req.amount, currency: req.currency,
  });
}

export async function pinpadQuery(terminalId: string, seq: string): Promise<PinPadSaleResponse> {
  return callAndLog("QUERY", "/pinpad/query", { terminalId, seq }, { terminalId });
}

/**
 * Kiosk (anonymous) SALE.
 * The kiosk page runs without a login, so it cannot write to
 * `bop_pinpad_transactions` directly — auditing goes through the
 * `log_kiosk_pinpad_tx` RPC, which resolves the terminal from the
 * kiosk access code server-side.
 */
export async function pinpadKioskSale(args: {
  accessCode: string;
  terminalId: string;
  ipAddress?: string | null;
  port?: number | null;
  amount: number;
  currency?: PinPadCurrency;
  receipt: string;
}): Promise<PinPadSaleResponse> {
  const currency: PinPadCurrency = args.currency || "ILS";
  const started = Date.now();
  let res: PinPadSaleResponse | undefined;
  let errorMsg: string | undefined;
  try {
    res = await post<PinPadSaleResponse>("/pinpad/sale", {
      terminalId: args.terminalId,
      ipAddress: args.ipAddress ?? undefined,
      port: args.port ?? undefined,
      amount: args.amount,
      currency,
      receipt: args.receipt,
      printSlip: "customer",
    });
    return res;
  } catch (e: any) {
    errorMsg = e?.message ?? String(e);
    throw e;
  } finally {
    try {
      await supabase.rpc("log_kiosk_pinpad_tx" as any, {
        p_access_code: args.accessCode,
        p_op_type: "SALE",
        p_receipt: args.receipt,
        p_amount: args.amount,
        p_currency: currency,
        p_response: (res as any) ?? null,
        p_duration_ms: Date.now() - started,
        p_error_msg: errorMsg ?? null,
      });
    } catch (e) {
      console.warn("[pinpad] kiosk audit log failed:", e);
    }
  }
}

export async function pinpadBatchClose(terminalId: string): Promise<{ ok: boolean; errorMsg?: string }> {
  const started = Date.now();
  try {
    const res = await post<{ ok: boolean; errorMsg?: string }>("/pinpad/batch", { terminalId });
    await logPinpadCall({
      terminalId, opType: "BATCH", durationMs: Date.now() - started,
      response: { ok: res.ok, respCode: res.ok ? "000" : "999", errorMsg: res.errorMsg } as PinPadSaleResponse,
    });
    return res;
  } catch (e: any) {
    await logPinpadCall({ terminalId, opType: "BATCH", durationMs: Date.now() - started, errorMsg: e?.message ?? String(e) });
    throw e;
  }
}