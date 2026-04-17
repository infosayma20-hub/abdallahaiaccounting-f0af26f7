/**
 * منطق تصنيف القيود في دفتر اليومية:
 * - "linked": قيد ناتج عن مستند (فاتورة / سند / شيك / مخزون / راتب / إهلاك)
 * - "manual": قيد يدوي بدون مستند مرتبط
 *
 * الهدف: حماية النزاهة المحاسبية بمنع حذف القيود المرتبطة من دفتر اليومية،
 * وتوجيه المستخدم للمستند الأصلي ليتم الإلغاء بقيد عكسي تلقائياً (IFRS).
 */

export type LinkedDocType =
  | "invoice_sale"
  | "invoice_purchase"
  | "voucher_receipt"
  | "voucher_payment"
  | "cheque"
  | "stock_movement"
  | "payroll"
  | "depreciation"
  | "transfer"
  | "opening_balance"
  | "pos_session"
  | null;

export interface LinkageInfo {
  isLinked: boolean;
  docType: LinkedDocType;
  label: string;          // شارة "🔗 من فاتورة مبيعات"
  navigatePath: string | null; // المسار للذهاب للمستند
}

const SALE_TYPES = new Set([
  "sale", "sale_cash", "sale_credit", "sale_bank", "sale_cheque",
  "pos_sale", "pos_cogs", "pos_transfer", "sale_return",
  "فاتورة مبيعات", "مبيعات", "بيع",
]);

const PURCHASE_TYPES = new Set([
  "purchase", "purchase_invoice", "purchase_cash", "purchase_credit",
  "purchase_bank", "purchase_cheque", "purchase_return", "pos_purchase",
  "فاتورة مشتريات", "مشتريات", "شراء",
]);

const RECEIPT_TYPES = new Set(["receipt", "سند قبض", "قبض", "workshop_receipt"]);
const PAYMENT_TYPES = new Set([
  "payment", "expense", "pos_expense", "pos_meal", "journal",
  "سند صرف", "صرف", "مصروف", "workshop_cost", "workshop_payment",
]);

const CHEQUE_TYPES = new Set([
  "cheque_register", "cheque_deposit", "cheque_collection",
  "cheque_bounce", "cheque_endorsement", "cheque_return", "cheque_cancel",
]);

const STOCK_TYPES = new Set([
  "inventory_in", "inventory_out", "import_cost", "return",
]);

const PAYROLL_TYPES = new Set([
  "salary", "employee_payment", "employee_advance", "employee_salary",
  "employee_deduction", "loan_payment", "loan_disbursement",
]);

const DEPRECIATION_TYPES = new Set([
  "depreciation", "asset_purchase", "asset_disposal",
]);

const TRANSFER_TYPES = new Set([
  "cash_transfer", "bank_transfer", "exchange_diff", "bank_fee",
  "pos_currency_exchange",
]);

const MANUAL_TYPES = new Set(["manual", "manual_entry", "journal_entry"]);

export function classifyTransaction(tx: {
  transaction_type?: string | null;
  reference?: string | null;
  is_opening_balance?: boolean | null;
}): LinkageInfo {
  const t = (tx.transaction_type || "").toLowerCase();
  const ref = tx.reference || "";

  // قيود المحاسب الذكي (Haseeb) — تبدأ بـ AI- ولا يوجد لها مستند فعلي
  // تُعامل كقيود يدوية قابلة للتعديل/الحذف من دفتر اليومية
  if (ref.startsWith("AI-")) {
    return { isLinked: false, docType: null, label: "🤖 محاسب ذكي", navigatePath: null };
  }

  // قيد افتتاحي
  if (tx.is_opening_balance || t === "opening_balance") {
    return {
      isLinked: true,
      docType: "opening_balance",
      label: "🏦 رصيد افتتاحي",
      navigatePath: "/accounts",
    };
  }

  // فاتورة مبيعات
  if (SALE_TYPES.has(t)) {
    return {
      isLinked: true,
      docType: "invoice_sale",
      label: "🔗 من فاتورة مبيعات",
      navigatePath: ref ? `/invoices?search=${encodeURIComponent(ref)}` : "/invoices",
    };
  }

  // فاتورة مشتريات
  if (PURCHASE_TYPES.has(t)) {
    return {
      isLinked: true,
      docType: "invoice_purchase",
      label: "🔗 من فاتورة مشتريات",
      navigatePath: ref ? `/invoices?search=${encodeURIComponent(ref)}` : "/invoices",
    };
  }

  // سند قبض
  if (RECEIPT_TYPES.has(t)) {
    return {
      isLinked: true,
      docType: "voucher_receipt",
      label: "🔗 من سند قبض",
      navigatePath: ref ? `/finance/receipts?search=${encodeURIComponent(ref)}&status=all` : "/finance/receipts",
    };
  }

  // سند صرف
  if (PAYMENT_TYPES.has(t)) {
    return {
      isLinked: true,
      docType: "voucher_payment",
      label: "🔗 من سند صرف",
      navigatePath: ref ? `/finance/payments?search=${encodeURIComponent(ref)}&status=all` : "/finance/payments",
    };
  }

  // شيكات
  if (CHEQUE_TYPES.has(t)) {
    return {
      isLinked: true,
      docType: "cheque",
      label: "🔗 من شيك",
      navigatePath: "/finance/cheques",
    };
  }

  // مخزون
  if (STOCK_TYPES.has(t)) {
    return {
      isLinked: true,
      docType: "stock_movement",
      label: "🔗 من حركة مخزون",
      navigatePath: "/inventory-movements",
    };
  }

  // رواتب
  if (PAYROLL_TYPES.has(t)) {
    return {
      isLinked: true,
      docType: "payroll",
      label: "🔗 من الرواتب",
      navigatePath: "/employees",
    };
  }

  // إهلاك / أصول
  if (DEPRECIATION_TYPES.has(t)) {
    return {
      isLinked: true,
      docType: "depreciation",
      label: "🔗 من الأصول الثابتة",
      navigatePath: "/assets",
    };
  }

  // تحويلات
  if (TRANSFER_TYPES.has(t)) {
    return {
      isLinked: true,
      docType: "transfer",
      label: "🔗 تحويل/عمولة",
      navigatePath: "/finance/cash-boxes",
    };
  }

  // قيد يدوي صريح
  if (MANUAL_TYPES.has(t)) {
    return { isLinked: false, docType: null, label: "✍️ يدوي", navigatePath: null };
  }

  // افتراضي: إذا فيه reference نعتبره مرتبط، وإلا يدوي
  if (ref && ref.trim()) {
    return {
      isLinked: true,
      docType: null,
      label: "🔗 مرتبط بمستند",
      navigatePath: null,
    };
  }

  return { isLinked: false, docType: null, label: "✍️ يدوي", navigatePath: null };
}
