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

import { getBridgeUrl } from "@/lib/pos-device-auth";

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

function bridgeBase(): string {
  const url = getBridgeUrl();
  if (!url) throw new Error("Print Bridge is not available on this device.");
  return url.replace(/\/+$/, "");
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${bridgeBase()}${path}`, {
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
    const res = await fetch(`${bridgeBase()}/pinpad/ping`);
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false };
  }
}

export async function pinpadSale(req: PinPadSaleRequest): Promise<PinPadSaleResponse> {
  return post<PinPadSaleResponse>("/pinpad/sale", req);
}

export async function pinpadVoid(req: PinPadVoidRequest): Promise<PinPadSaleResponse> {
  return post<PinPadSaleResponse>("/pinpad/void", req);
}

export async function pinpadReturn(req: PinPadVoidRequest): Promise<PinPadSaleResponse> {
  return post<PinPadSaleResponse>("/pinpad/return", req);
}

export async function pinpadQuery(terminalId: string, seq: string): Promise<PinPadSaleResponse> {
  return post<PinPadSaleResponse>("/pinpad/query", { terminalId, seq });
}

export async function pinpadBatchClose(terminalId: string): Promise<{ ok: boolean; errorMsg?: string }> {
  return post("/pinpad/batch", { terminalId });
}