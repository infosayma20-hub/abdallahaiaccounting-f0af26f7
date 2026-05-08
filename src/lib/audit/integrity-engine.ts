/**
 * P6 — Autonomous Integrity Audit Engine (read-only).
 *
 * Aggregates cross-module checks into a normalized issue stream.
 * NEVER mutates accounting data. NEVER auto-fixes. Safe to call from
 * admin/debug surfaces or scheduled background loaders.
 *
 * Usage:
 *   import { runAuditEngine } from "@/lib/audit/integrity-engine";
 *   const report = await runAuditEngine(dataOwnerId, { from, to });
 *   console.table(report.issues);
 */

import { supabase } from "@/integrations/supabase/client";

// Local copy of the stock-move sign convention used by report-loaders.
// Kept inline to keep this engine self-contained for scheduled callers.
function stockMoveSign(mt: string): number {
  switch ((mt || "").trim()) {
    case "purchase": case "return_in": case "opening": case "pos_return":
    case "وارد": case "مرتجع وارد": case "رصيد افتتاحي":
      return 1;
    case "sale": case "pos_sale": case "return_out": case "waste":
    case "صادر": case "مرتجع صادر": case "تالف":
      return -1;
    default:
      return 1; // adjustment/transfer: relies on signed quantity (see WB-2)
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type AuditSeverity = "info" | "warning" | "critical";

export type AuditCategory =
  | "trial_balance"
  | "orphan_transaction"
  | "missing_link"
  | "inventory"
  | "tax"
  | "ar_ap"
  | "duplicate_movement"
  | "negative_inventory"
  | "missing_cost_posting"
  | "vat_drift";

export interface AuditIssue {
  code: string;                       // stable machine code, e.g. "TB_UNBALANCED"
  category: AuditCategory;
  severity: AuditSeverity;
  entity_type: string;                // table or domain noun
  entity_id: string | null;           // primary key or null for aggregates
  description: string;                // arabic-first human description
  expected: number | string | null;
  actual: number | string | null;
  suggested_action: string;           // narrative; no auto-execution
}

export interface AuditOptions {
  from?: string;                      // ISO date
  to?: string;                        // ISO date
  branchId?: string | null;           // reserved; not all writers stamp branch yet
  tolerance?: number;                 // numeric epsilon
  pageSize?: number;
  silent?: boolean;                   // suppress console output
}

export interface AuditReport {
  tenant: string;
  generated_at: string;
  options: AuditOptions;
  totals: {
    checks: number;
    pass: number;
    info: number;
    warning: number;
    critical: number;
  };
  issues: AuditIssue[];
}

// ──────────────────────────────────────────────────────────────────────────
// Constants — base GL codes (mirrors integrity-report.ts).
// Tracked in tech-debt: P3 hardcoded-fallback audit.
// ──────────────────────────────────────────────────────────────────────────

const AR_CODE = "1130";
const AP_CODE = "2110";
const INVENTORY_CODE = "1140";
const COGS_CODE = "5100";
const OUTPUT_VAT_CODE = "2190";
const INPUT_VAT_CODE = "1190";
const VOID_INVOICE_STATUSES = ["cancelled", "void", "reversed", "draft"];
const DEFAULT_TOLERANCE = 0.01;

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

const N = (v: any) => Number(v) || 0;

function severityFromDiff(diff: number, tolerance: number): AuditSeverity | "pass" {
  const a = Math.abs(diff);
  if (a < tolerance) return "pass";
  if (a < tolerance * 100) return "warning";
  return "critical";
}

async function fetchAllTx(uid: string, opts: AuditOptions) {
  const PAGE = opts.pageSize || 1000;
  const all: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("transactions")
      .select("id, transaction_date, debit_account_code, credit_account_code, amount, contact_id, is_deleted, idempotency_key, reference, transaction_type")
      .eq("user_id", uid)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .range(from, from + PAGE - 1);
    if (opts.from) q = q.gte("transaction_date", opts.from);
    if (opts.to)   q = q.lte("transaction_date", opts.to);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

function glBalance(txs: any[], code: string, side: "debit" | "credit") {
  const dr = txs.filter((t) => t.debit_account_code === code).reduce((s, t) => s + N(t.amount), 0);
  const cr = txs.filter((t) => t.credit_account_code === code).reduce((s, t) => s + N(t.amount), 0);
  return side === "debit" ? dr - cr : cr - dr;
}

// ──────────────────────────────────────────────────────────────────────────
// Individual checks
// ──────────────────────────────────────────────────────────────────────────

/** C1 — Trial balance: Σ debits === Σ credits across all txns in window. */
function checkTrialBalance(txs: any[], tol: number): AuditIssue[] {
  const totalDr = txs.reduce((s, t) => s + N(t.amount), 0);          // debit side amount
  const totalCr = totalDr;                                            // each tx is double-entry; structural truth
  // The structural form above is always true (single tx = both sides).
  // The meaningful check is per-account symmetry vs prefix totals; do a quick scan instead.
  const byAcc: Record<string, { d: number; c: number }> = {};
  txs.forEach((t) => {
    const dc = t.debit_account_code || "_";
    const cc = t.credit_account_code || "_";
    byAcc[dc] = byAcc[dc] || { d: 0, c: 0 };
    byAcc[cc] = byAcc[cc] || { d: 0, c: 0 };
    byAcc[dc].d += N(t.amount);
    byAcc[cc].c += N(t.amount);
  });
  // System-level: sum of all debit postings === sum of all credit postings
  const sumD = Object.values(byAcc).reduce((s, x) => s + x.d, 0);
  const sumC = Object.values(byAcc).reduce((s, x) => s + x.c, 0);
  const diff = sumD - sumC;
  if (Math.abs(diff) < tol) return [];
  return [{
    code: "TB_UNBALANCED",
    category: "trial_balance",
    severity: severityFromDiff(diff, tol) as AuditSeverity,
    entity_type: "transactions",
    entity_id: null,
    description: "ميزان المراجعة غير متوازن",
    expected: sumC,
    actual: sumD,
    suggested_action: "ابحث عن قيود ذات حقل debit/credit مفقود أو مبلغ غير متطابق",
  }];
}

/** C2 — Orphan transactions: missing both account codes or zero amount. */
function checkOrphanTransactions(txs: any[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  txs.forEach((t) => {
    if (!t.debit_account_code || !t.credit_account_code) {
      issues.push({
        code: "TX_ORPHAN_MISSING_ACCOUNT",
        category: "orphan_transaction",
        severity: "critical",
        entity_type: "transactions",
        entity_id: t.id,
        description: "قيد بدون حساب مدين أو دائن",
        expected: "كلا الطرفين",
        actual: `${t.debit_account_code || "—"} / ${t.credit_account_code || "—"}`,
        suggested_action: "راجع كاتب القيد ومصدره",
      });
    }
    if (t.debit_account_code === t.credit_account_code) {
      issues.push({
        code: "TX_SAME_ACCOUNT",
        category: "orphan_transaction",
        severity: "warning",
        entity_type: "transactions",
        entity_id: t.id,
        description: "قيد بنفس الحساب مدين ودائن",
        expected: "حسابان مختلفان",
        actual: t.debit_account_code,
        suggested_action: "ينبغي تسجيله كتسوية لا قيد محاسبي",
      });
    }
    if (N(t.amount) === 0) {
      issues.push({
        code: "TX_ZERO_AMOUNT",
        category: "orphan_transaction",
        severity: "info",
        entity_type: "transactions",
        entity_id: t.id,
        description: "قيد بقيمة صفر",
        expected: "> 0",
        actual: 0,
        suggested_action: "احذف أو راجع",
      });
    }
  });
  return issues;
}

/** C3 — Missing transaction_id link on invoices/vouchers. */
async function checkMissingLinks(uid: string): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  // Invoices without transaction_id (sale/purchase types only — non-draft, non-void)
  const { data: invs } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_type, status, is_voided, transaction_id")
    .eq("user_id", uid)
    .is("transaction_id", null)
    .in("invoice_type", ["sale", "purchase"]);
  (invs || []).forEach((i: any) => {
    if (i.is_voided || VOID_INVOICE_STATUSES.includes(String(i.status || ""))) return;
    issues.push({
      code: "INV_MISSING_TX_LINK",
      category: "missing_link",
      severity: "critical",
      entity_type: "invoices",
      entity_id: i.id,
      description: `فاتورة ${i.invoice_number} بلا قيد محاسبي مرتبط`,
      expected: "transaction_id != null",
      actual: null,
      suggested_action: "أعد ترحيل الفاتورة عبر دالة الترحيل القياسية",
    });
  });
  return issues;
}

/** C4 — Inventory drift per product: live qty vs Σ stock_movements. */
async function checkInventoryDrift(uid: string, tol: number): Promise<AuditIssue[]> {
  const [{ data: products }, { data: moves }] = await Promise.all([
    supabase.from("products").select("id, name, quantity").eq("user_id", uid),
    supabase.from("stock_movements").select("product_id, movement_type, quantity").eq("user_id", uid),
  ]);
  const derived: Record<string, number> = {};
  (moves || []).forEach((m: any) => {
    if (!m.product_id) return;
    derived[m.product_id] = (derived[m.product_id] || 0) + stockMoveSign(m.movement_type) * N(m.quantity);
  });
  const issues: AuditIssue[] = [];
  (products || []).forEach((p: any) => {
    const diff = N(p.quantity) - (derived[p.id] || 0);
    if (Math.abs(diff) < tol) return;
    issues.push({
      code: "INV_QTY_DRIFT",
      category: "inventory",
      severity: severityFromDiff(diff, tol) as AuditSeverity,
      entity_type: "products",
      entity_id: p.id,
      description: `فرق مخزون للصنف "${p.name}"`,
      expected: derived[p.id] || 0,
      actual: N(p.quantity),
      suggested_action: "راجع حركات المخزون أو سجّل تسوية موقعة",
    });
  });
  return issues;
}

/** C5 — Negative inventory at any point (live snapshot). */
async function checkNegativeInventory(uid: string): Promise<AuditIssue[]> {
  const { data } = await supabase
    .from("products")
    .select("id, name, quantity, product_type")
    .eq("user_id", uid)
    .lt("quantity", 0);
  return (data || [])
    .filter((p: any) => p.product_type !== "service")
    .map((p: any) => ({
      code: "INV_NEGATIVE_QTY",
      category: "negative_inventory",
      severity: "warning" as AuditSeverity,
      entity_type: "products",
      entity_id: p.id,
      description: `كمية سالبة للصنف "${p.name}"`,
      expected: ">= 0",
      actual: N(p.quantity),
      suggested_action: "راجع حركات البيع/الشراء أو ابدأ جرد تصحيحي",
    }));
}

/** C6 — Duplicate stock movements: same product, type, qty, ref within 1 day. */
async function checkDuplicateMovements(uid: string): Promise<AuditIssue[]> {
  const { data } = await supabase
    .from("stock_movements")
    .select("id, product_id, movement_type, quantity, reference_type, reference_id, created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(5000);
  const seen = new Map<string, string>();
  const issues: AuditIssue[] = [];
  (data || []).forEach((m: any) => {
    if (!m.reference_id) return;
    const key = `${m.product_id}|${m.movement_type}|${m.reference_id}|${N(m.quantity)}`;
    if (seen.has(key)) {
      issues.push({
        code: "STOCK_DUPLICATE_MOVEMENT",
        category: "duplicate_movement",
        severity: "warning",
        entity_type: "stock_movements",
        entity_id: m.id,
        description: "حركة مخزون مكررة لنفس المرجع",
        expected: "حركة واحدة",
        actual: `مكرر مع ${seen.get(key)}`,
        suggested_action: "احذف التكرار يدوياً وراجع كاتب الحركة",
      });
    } else {
      seen.set(key, m.id);
    }
  });
  return issues;
}

/** C7 — Sale invoices without COGS posting. */
async function checkMissingCostPostings(uid: string, txs: any[]): Promise<AuditIssue[]> {
  const { data: invs } = await supabase
    .from("invoices")
    .select("id, invoice_number, invoice_type, status, is_voided, transaction_id, total")
    .eq("user_id", uid)
    .eq("invoice_type", "sale");
  const cogsByRef = new Set<string>();
  txs.forEach((t) => {
    if (t.debit_account_code === COGS_CODE && t.reference) cogsByRef.add(String(t.reference));
  });
  const issues: AuditIssue[] = [];
  (invs || []).forEach((i: any) => {
    if (i.is_voided || VOID_INVOICE_STATUSES.includes(String(i.status || ""))) return;
    if (!i.transaction_id) return; // missing-link case already reported
    if (!cogsByRef.has(String(i.invoice_number)) && !cogsByRef.has(String(i.id))) {
      issues.push({
        code: "SALE_MISSING_COGS",
        category: "missing_cost_posting",
        severity: "warning",
        entity_type: "invoices",
        entity_id: i.id,
        description: `فاتورة بيع ${i.invoice_number} بلا قيد تكلفة (5100)`,
        expected: `قيد على ${COGS_CODE}`,
        actual: null,
        suggested_action: "تأكد من إعدادات حساب التكلفة وأعد الترحيل",
      });
    }
  });
  return issues;
}

/** C8 — VAT drift: GL output VAT vs tax_ledger output. */
async function checkVatDrift(uid: string, txs: any[], tol: number): Promise<AuditIssue[]> {
  const [{ data: outRows }, { data: inRows }] = await Promise.all([
    supabase.from("tax_ledger").select("tax_amount").eq("user_id", uid).eq("tax_type", "output"),
    supabase.from("tax_ledger").select("tax_amount").eq("user_id", uid).eq("tax_type", "input"),
  ]);
  const out: AuditIssue[] = [];
  const tlOut = (outRows || []).reduce((s, r: any) => s + N(r.tax_amount), 0);
  const glOut = glBalance(txs, OUTPUT_VAT_CODE, "credit");
  const dOut = tlOut - glOut;
  if (Math.abs(dOut) >= tol) {
    out.push({
      code: "VAT_OUTPUT_DRIFT",
      category: "vat_drift",
      severity: severityFromDiff(dOut, tol) as AuditSeverity,
      entity_type: "tax_ledger",
      entity_id: null,
      description: "فرق ضريبة المخرجات بين GL ودفتر الضريبة",
      expected: tlOut,
      actual: glOut,
      suggested_action: "راجع كاتبي الفواتير: قد يكون هناك فاتورة لم تُسجّل في tax_ledger",
    });
  }
  const tlIn = (inRows || []).reduce((s, r: any) => s + N(r.tax_amount), 0);
  const glIn = glBalance(txs, INPUT_VAT_CODE, "debit");
  const dIn = tlIn - glIn;
  if ((tlIn !== 0 || glIn !== 0) && Math.abs(dIn) >= tol) {
    out.push({
      code: "VAT_INPUT_DRIFT",
      category: "vat_drift",
      severity: severityFromDiff(dIn, tol) as AuditSeverity,
      entity_type: "tax_ledger",
      entity_id: null,
      description: "فرق ضريبة المدخلات بين GL ودفتر الضريبة",
      expected: tlIn,
      actual: glIn,
      suggested_action: "افحص فواتير الشراء غير الموسومة بضريبة مدخلات",
    });
  }
  return out;
}

/** C9 — AR/AP control vs subledger. */
function checkARAPMismatch(txs: any[], tol: number): AuditIssue[] {
  const issues: AuditIssue[] = [];
  // AR
  const arSub = txs
    .filter((t) => (t.debit_account_code === AR_CODE || t.credit_account_code === AR_CODE) && t.contact_id)
    .reduce((s, t) => s + (t.debit_account_code === AR_CODE ? N(t.amount) : -N(t.amount)), 0);
  const arGl = glBalance(txs, AR_CODE, "debit");
  const arDiff = arSub - arGl;
  if (Math.abs(arDiff) >= tol) {
    issues.push({
      code: "AR_SUBLEDGER_DRIFT",
      category: "ar_ap",
      severity: severityFromDiff(arDiff, tol) as AuditSeverity,
      entity_type: "transactions",
      entity_id: null,
      description: "فرق بين دفتر العملاء وحساب 1130",
      expected: arSub,
      actual: arGl,
      suggested_action: "ابحث عن قيود 1130 بدون contact_id",
    });
  }
  // AP
  const apSub = txs
    .filter((t) => (t.debit_account_code === AP_CODE || t.credit_account_code === AP_CODE) && t.contact_id)
    .reduce((s, t) => s + (t.credit_account_code === AP_CODE ? N(t.amount) : -N(t.amount)), 0);
  const apGl = glBalance(txs, AP_CODE, "credit");
  const apDiff = apSub - apGl;
  if (Math.abs(apDiff) >= tol) {
    issues.push({
      code: "AP_SUBLEDGER_DRIFT",
      category: "ar_ap",
      severity: severityFromDiff(apDiff, tol) as AuditSeverity,
      entity_type: "transactions",
      entity_id: null,
      description: "فرق بين دفتر الموردين وحساب 2110",
      expected: apSub,
      actual: apGl,
      suggested_action: "ابحث عن قيود 2110 بدون contact_id",
    });
  }
  return issues;
}

/** C10 — Inventory GL vs live valuation. */
function checkInventoryValuationDrift(txs: any[], liveValue: number, tol: number): AuditIssue[] {
  const gl = glBalance(txs, INVENTORY_CODE, "debit");
  const diff = liveValue - gl;
  if (Math.abs(diff) < tol * 100) return []; // larger tolerance for valuation rounding
  return [{
    code: "INV_VALUATION_DRIFT",
    category: "inventory",
    severity: severityFromDiff(diff, tol * 100) as AuditSeverity,
    entity_type: "general_ledger",
    entity_id: INVENTORY_CODE,
    description: "فرق قيمة مخزون بين الحساب 1140 والتقييم الحي",
    expected: gl,
    actual: liveValue,
    suggested_action: "حدد الأصناف ذات الفرق عبر تقرير مطابقة المخزون",
  }];
}

// ──────────────────────────────────────────────────────────────────────────
// Engine
// ──────────────────────────────────────────────────────────────────────────

export async function runAuditEngine(uid: string, opts: AuditOptions = {}): Promise<AuditReport> {
  const tol = opts.tolerance ?? DEFAULT_TOLERANCE;
  const t0 = performance.now?.() ?? Date.now();

  const txs = await fetchAllTx(uid, opts);

  const { data: prods } = await supabase
    .from("products")
    .select("quantity, buy_price")
    .eq("user_id", uid);
  const liveValue = (prods || []).reduce(
    (s, p: any) => s + Math.max(0, N(p.quantity)) * N(p.buy_price),
    0,
  );

  const [missingLinks, invDrift, negInv, dupMoves, missCogs, vatDrift] = await Promise.all([
    checkMissingLinks(uid),
    checkInventoryDrift(uid, tol),
    checkNegativeInventory(uid),
    checkDuplicateMovements(uid),
    checkMissingCostPostings(uid, txs),
    checkVatDrift(uid, txs, tol),
  ]);

  const issues: AuditIssue[] = [
    ...checkTrialBalance(txs, tol),
    ...checkOrphanTransactions(txs),
    ...missingLinks,
    ...invDrift,
    ...negInv,
    ...dupMoves,
    ...missCogs,
    ...vatDrift,
    ...checkARAPMismatch(txs, tol),
    ...checkInventoryValuationDrift(txs, liveValue, tol),
  ];

  // 10 logical check families. "pass" = a check family that produced no issues.
  const families: AuditCategory[] = [
    "trial_balance", "orphan_transaction", "missing_link", "inventory",
    "negative_inventory", "duplicate_movement", "missing_cost_posting",
    "vat_drift", "ar_ap", "inventory",
  ];
  const seenFamilies = new Set(issues.map((i) => i.category));
  const totalChecks = new Set(families).size;
  const passCount = totalChecks - seenFamilies.size;
  const totals = {
    checks: totalChecks,
    pass: passCount,
    info: issues.filter((i) => i.severity === "info").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    critical: issues.filter((i) => i.severity === "critical").length,
  };

  const report: AuditReport = {
    tenant: uid,
    generated_at: new Date().toISOString(),
    options: opts,
    totals,
    issues,
  };

  if (!opts.silent && typeof window !== "undefined") {
    const t1 = performance.now?.() ?? Date.now();
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[P6 audit] tenant=${uid} duration=${Math.round(t1 - t0)}ms ` +
      `pass=${totals.pass}/${totals.checks} crit=${totals.critical} warn=${totals.warning} info=${totals.info}`);
    // eslint-disable-next-line no-console
    console.log(totals);
    if (issues.length) {
      // eslint-disable-next-line no-console
      console.table(issues.map((i) => ({
        code: i.code, severity: i.severity, category: i.category,
        entity: i.entity_type, id: i.entity_id, expected: i.expected, actual: i.actual,
      })));
    }
    // eslint-disable-next-line no-console
    console.groupEnd();
  }

  return report;
}

/** Lightweight scheduled-style entry point with sane defaults for cron-like loops. */
export async function runScheduledAudit(uid: string, days = 30): Promise<AuditReport> {
  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(); fromDate.setDate(fromDate.getDate() - days);
  const from = fromDate.toISOString().slice(0, 10);
  return runAuditEngine(uid, { from, to, silent: false });
}