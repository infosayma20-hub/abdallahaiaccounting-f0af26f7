import { supabase } from "@/integrations/supabase/client";
import { format, eachMonthOfInterval, startOfMonth, endOfMonth } from "date-fns";

type SetData = (data: any[]) => void;

const APPROX_ZERO = 0.01;
const FALLBACK_OUTPUT_VAT = "2190";
const FALLBACK_INPUT_VAT = "1180";
const FALLBACK_POS_REVENUE_PREFIX = "4";
const FALLBACK_POS_CASH_PREFIX = "111";
const FALLBACK_POS_BANK_PREFIX = "112";

// ── helpers ─────────────────────────────────────────────────────────────────

async function getTaxAccounts(uid: string): Promise<{ output: string; input: string }> {
  const { data } = await supabase
    .from("tax_settings")
    .select("output_tax_account_code, input_tax_account_code")
    .eq("user_id", uid)
    .maybeSingle();
  return {
    output: (data?.output_tax_account_code || FALLBACK_OUTPUT_VAT).trim(),
    input: (data?.input_tax_account_code || FALLBACK_INPUT_VAT).trim(),
  };
}

// Resolve POS cash & bank account codes from terminals + company_settings.
// Returns sets of exact codes; matcher also accepts prefix fallback.
async function getPOSAccountCodes(uid: string): Promise<{
  cashCodes: Set<string>;
  bankCodes: Set<string>;
  cashUsedFallback: boolean;
  bankUsedFallback: boolean;
}> {
  const cashCodes = new Set<string>();
  const bankCodes = new Set<string>();

  const [{ data: terminals }, { data: settings }] = await Promise.all([
    supabase
      .from("pos_terminals")
      .select("cash_account_code")
      .eq("user_id", uid),
    supabase
      .from("company_settings")
      .select("default_cash_account, default_bank_account")
      .eq("user_id", uid)
      .maybeSingle(),
  ]);

  (terminals || []).forEach((t: any) => {
    const c = (t.cash_account_code || "").trim();
    if (c) cashCodes.add(c);
  });
  if (settings?.default_cash_account) cashCodes.add(String(settings.default_cash_account).trim());
  if (settings?.default_bank_account) bankCodes.add(String(settings.default_bank_account).trim());

  const cashUsedFallback = cashCodes.size === 0;
  const bankUsedFallback = bankCodes.size === 0;
  return { cashCodes, bankCodes, cashUsedFallback, bankUsedFallback };
}

// Match account code against a resolved set, with prefix fallback when set is empty.
function matchesAccount(code: string, set: Set<string>, fallbackPrefix: string): boolean {
  if (!code) return false;
  if (set.size === 0) return code.startsWith(fallbackPrefix);
  for (const c of set) {
    if (code === c || code.startsWith(c)) return true;
  }
  return false;
}

// Net movement on a given account code (and its sub-accounts via LIKE prefix)
// "credit_minus_debit" → typical for liability/output VAT (credit-natured)
// "debit_minus_credit" → typical for asset/input VAT (debit-natured)
function netMovement(
  txns: Array<{ debit_account_code: string | null; credit_account_code: string | null; amount: number | null }>,
  code: string,
  direction: "credit_minus_debit" | "debit_minus_credit",
): number {
  let total = 0;
  for (const t of txns) {
    const dc = t.debit_account_code || "";
    const cc = t.credit_account_code || "";
    const amt = Number(t.amount) || 0;
    const debitHit = dc === code || dc.startsWith(code);
    const creditHit = cc === code || cc.startsWith(code);
    if (direction === "credit_minus_debit") {
      if (creditHit) total += amt;
      if (debitHit) total -= amt;
    } else {
      if (debitHit) total += amt;
      if (creditHit) total -= amt;
    }
  }
  return total;
}

// ── 1. VAT Reconciliation ───────────────────────────────────────────────────

export async function loadVATReconciliation(
  uid: string,
  dateFrom: string,
  dateTo: string,
  setData: SetData,
) {
  const accounts = await getTaxAccounts(uid);

  const [{ data: ledgerRows }, { data: txns }, { data: invs }] = await Promise.all([
    supabase
      .from("tax_ledger")
      .select("transaction_date, tax_type, tax_amount")
      .eq("user_id", uid)
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo),
    supabase
      .from("transactions")
      .select("transaction_date, debit_account_code, credit_account_code, amount")
      .eq("user_id", uid)
      .eq("is_deleted", false)
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo)
      .or(
        `debit_account_code.like.${accounts.output}%,credit_account_code.like.${accounts.output}%,` +
        `debit_account_code.like.${accounts.input}%,credit_account_code.like.${accounts.input}%`,
      ),
    supabase
      .from("invoices")
      .select("invoice_date, invoice_type, tax_amount, is_voided, status")
      .eq("user_id", uid)
      .gte("invoice_date", dateFrom)
      .lte("invoice_date", dateTo),
  ]);

  // Bucket per period (YYYY-MM)
  type Bucket = {
    period: string;
    vat_output_ledger: number;
    vat_output_gl: number;
    vat_output_invoice: number;
    diff_output: number;
    diff_output_invoice: number;
    vat_input_ledger: number;
    vat_input_gl: number;
    vat_input_invoice: number;
    diff_input: number;
    diff_input_invoice: number;
    status: string;
    output_account: string;
    input_account: string;
  };
  const buckets = new Map<string, Bucket>();
  const ensure = (key: string): Bucket => {
    if (!buckets.has(key)) {
      buckets.set(key, {
        period: key,
        vat_output_ledger: 0,
        vat_output_gl: 0,
        vat_output_invoice: 0,
        diff_output: 0,
        diff_output_invoice: 0,
        vat_input_ledger: 0,
        vat_input_gl: 0,
        vat_input_invoice: 0,
        diff_input: 0,
        diff_input_invoice: 0,
        status: "",
        output_account: accounts.output,
        input_account: accounts.input,
      });
    }
    return buckets.get(key)!;
  };

  // Pre-create buckets for every month in range so empty months still appear
  try {
    const months = eachMonthOfInterval({ start: new Date(dateFrom), end: new Date(dateTo) });
    months.forEach(m => ensure(format(m, "yyyy-MM")));
  } catch { /* invalid date range — ignore */ }

  // Ledger side
  (ledgerRows || []).forEach((r: any) => {
    const key = (r.transaction_date || "").slice(0, 7);
    if (!key) return;
    const b = ensure(key);
    const amt = Number(r.tax_amount) || 0;
    if (r.tax_type === "output") b.vat_output_ledger += amt;
    else if (r.tax_type === "input") b.vat_input_ledger += amt;
  });

  // GL side — group txns by month then compute net movement per bucket
  const txnByMonth = new Map<string, typeof txns>();
  (txns || []).forEach(t => {
    const key = ((t as any).transaction_date || "").slice(0, 7);
    if (!key) return;
    if (!txnByMonth.has(key)) txnByMonth.set(key, [] as any);
    (txnByMonth.get(key) as any[]).push(t);
  });
  for (const [key, list] of txnByMonth) {
    const b = ensure(key);
    b.vat_output_gl = netMovement(list as any, accounts.output, "credit_minus_debit");
    b.vat_input_gl = netMovement(list as any, accounts.input, "debit_minus_credit");
  }

  // Invoice side: SUM(invoices.tax_amount) per month, excluding voided/cancelled/reversed.
  (invs || []).forEach((i: any) => {
    const key = (i.invoice_date || "").slice(0, 7);
    if (!key) return;
    if (i.is_voided === true) return;
    if (["cancelled", "void", "reversed"].includes(String(i.status || ""))) return;
    const b = ensure(key);
    const tax = Number(i.tax_amount) || 0;
    if (i.invoice_type === "sale") b.vat_output_invoice += tax;
    else if (i.invoice_type === "purchase") b.vat_input_invoice += tax;
  });

  // Finalize diffs + status
  const rows = Array.from(buckets.values())
    .map(b => {
      b.diff_output = b.vat_output_gl - b.vat_output_ledger;
      b.diff_input = b.vat_input_gl - b.vat_input_ledger;
      b.diff_output_invoice = b.vat_output_invoice - b.vat_output_ledger;
      b.diff_input_invoice = b.vat_input_invoice - b.vat_input_ledger;
      const ok =
        Math.abs(b.diff_output) < APPROX_ZERO &&
        Math.abs(b.diff_input) < APPROX_ZERO &&
        Math.abs(b.diff_output_invoice) < APPROX_ZERO &&
        Math.abs(b.diff_input_invoice) < APPROX_ZERO;
      b.status = ok ? "✅ مطابق" : "⚠️ فرق";
      return b;
    })
    .sort((a, b) => a.period.localeCompare(b.period));

  setData(rows);
}

// ── 2. POS GL Reconciliation ────────────────────────────────────────────────

export async function loadPOSGLReconciliation(
  uid: string,
  dateFrom: string,
  dateTo: string,
  setData: SetData,
) {
  const taxAccounts = await getTaxAccounts(uid);
  const posAccounts = await getPOSAccountCodes(uid);

  // Pull POS data + GL transactions tagged with pos_* types in parallel
  const [ordersRes, paymentsRes, txnsRes] = await Promise.all([
    supabase
      .from("pos_orders")
      .select("id, paid_at, created_at, subtotal, tax_amount, total, is_return, state, ils_equivalent")
      .eq("user_id", uid)
      .in("state", ["paid", "closed", "completed", "settled"])
      .gte("paid_at", `${dateFrom}T00:00:00`)
      .lte("paid_at", `${dateTo}T23:59:59`),
    supabase
      .from("pos_payments")
      .select("amount, payment_method, currency, exchange_rate, order_id, created_at"),
    supabase
      .from("transactions")
      .select("transaction_date, transaction_type, debit_account_code, credit_account_code, amount")
      .eq("user_id", uid)
      .eq("is_deleted", false)
      .in("transaction_type", ["pos_sale", "pos_return", "pos_sale_vat", "pos_return_vat"])
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo),
  ]);

  const orders = ordersRes.data || [];
  const payments = paymentsRes.data || [];
  const txns = txnsRes.data || [];

  // Index payments by order_id
  const orderIds = new Set(orders.map(o => o.id));
  const paymentsByOrder = new Map<string, any[]>();
  for (const p of payments) {
    if (!orderIds.has(p.order_id)) continue;
    if (!paymentsByOrder.has(p.order_id)) paymentsByOrder.set(p.order_id, []);
    paymentsByOrder.get(p.order_id)!.push(p);
  }

  type Row = {
    date: string;
    pos_revenue: number;
    gl_revenue: number;
    diff_revenue: number;
    pos_vat: number;
    gl_vat: number;
    diff_vat: number;
    pos_cash: number;
    gl_cash: number;
    diff_cash: number;
    pos_bank: number;
    gl_bank: number;
    diff_bank: number;
    status: string;
  };
  const map = new Map<string, Row>();
  const ensure = (date: string): Row => {
    if (!map.has(date)) {
      map.set(date, {
        date,
        pos_revenue: 0, gl_revenue: 0, diff_revenue: 0,
        pos_vat: 0, gl_vat: 0, diff_vat: 0,
        pos_cash: 0, gl_cash: 0, diff_cash: 0,
        pos_bank: 0, gl_bank: 0, diff_bank: 0,
        status: "",
      });
    }
    return map.get(date)!;
  };

  // POS side: revenue net of returns (subtotal), VAT net of returns
  for (const o of orders) {
    const day = (o.paid_at || o.created_at || "").slice(0, 10);
    if (!day) continue;
    const r = ensure(day);
    const sign = o.is_return ? -1 : 1;
    r.pos_revenue += sign * (Number(o.subtotal) || 0);
    r.pos_vat += sign * (Number(o.tax_amount) || 0);

    const opays = paymentsByOrder.get(o.id) || [];
    for (const p of opays) {
      // Convert non-ILS payments to ILS using exchange_rate; payment.amount is in payment currency
      const ils = (Number(p.amount) || 0) * (Number(p.exchange_rate) || 1);
      const amt = sign * ils;
      const m = (p.payment_method || "").toLowerCase();
      if (m === "cash") r.pos_cash += amt;
      else if (m === "card" || m === "bank" || m === "credit_card" || m === "visa" || m === "mastercard") r.pos_bank += amt;
      else r.pos_bank += amt; // unknown methods → bank-side bucket (cheque/other)
    }
  }

  // GL side: classify by transaction_type and account
  for (const t of txns) {
    const day = ((t as any).transaction_date || "").slice(0, 10);
    if (!day) continue;
    const r = ensure(day);
    const amt = Number(t.amount) || 0;
    const dc = t.debit_account_code || "";
    const cc = t.credit_account_code || "";
    const sign = t.transaction_type === "pos_return" || t.transaction_type === "pos_return_vat" ? -1 : 1;

    // Revenue: credits on 4xxx for pos_sale, debits on 4xxx for pos_return
    if (t.transaction_type === "pos_sale") {
      if (cc.startsWith(FALLBACK_POS_REVENUE_PREFIX)) r.gl_revenue += amt;
      if (dc.startsWith(FALLBACK_POS_REVENUE_PREFIX)) r.gl_revenue -= amt;
    } else if (t.transaction_type === "pos_return") {
      if (dc.startsWith(FALLBACK_POS_REVENUE_PREFIX)) r.gl_revenue -= amt;
      if (cc.startsWith(FALLBACK_POS_REVENUE_PREFIX)) r.gl_revenue += amt;
    }

    // VAT: credits on output VAT acct (sale) - debits (return)
    if (t.transaction_type === "pos_sale_vat" || t.transaction_type === "pos_return_vat") {
      if (cc === taxAccounts.output || cc.startsWith(taxAccounts.output)) r.gl_vat += sign * amt;
      if (dc === taxAccounts.output || dc.startsWith(taxAccounts.output)) r.gl_vat -= sign * amt;
    }

    // Cash / Bank movement: include sale + return + their VAT legs.
    // Sign comes from debit/credit side directly (sale debits cash; return credits cash),
    // not from transaction_type — so VAT legs net correctly.
    if (
      t.transaction_type === "pos_sale" ||
      t.transaction_type === "pos_return" ||
      t.transaction_type === "pos_sale_vat" ||
      t.transaction_type === "pos_return_vat"
    ) {
      if (matchesAccount(dc, posAccounts.cashCodes, FALLBACK_POS_CASH_PREFIX)) r.gl_cash += amt;
      if (matchesAccount(cc, posAccounts.cashCodes, FALLBACK_POS_CASH_PREFIX)) r.gl_cash -= amt;
      if (matchesAccount(dc, posAccounts.bankCodes, FALLBACK_POS_BANK_PREFIX)) r.gl_bank += amt;
      if (matchesAccount(cc, posAccounts.bankCodes, FALLBACK_POS_BANK_PREFIX)) r.gl_bank -= amt;
    }
  }

  // Finalize diffs + status
  const rows = Array.from(map.values())
    .map(r => {
      r.diff_revenue = r.gl_revenue - r.pos_revenue;
      r.diff_vat = r.gl_vat - r.pos_vat;
      r.diff_cash = r.gl_cash - r.pos_cash;
      r.diff_bank = r.gl_bank - r.pos_bank;
      const ok =
        Math.abs(r.diff_revenue) < APPROX_ZERO &&
        Math.abs(r.diff_vat) < APPROX_ZERO &&
        Math.abs(r.diff_cash) < APPROX_ZERO &&
        Math.abs(r.diff_bank) < APPROX_ZERO;
      r.status = ok ? "✅ مطابق" : "⚠️ فرق";
      return r;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  setData(rows);
}
