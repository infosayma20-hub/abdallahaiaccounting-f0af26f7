/**
 * invoiceDraftsRegistry — قراءة مسودات الفواتير المحفوظة في localStorage
 * ────────────────────────────────────────────────────────────────────
 * المسودات تُحفظ بواسطة useFormDraft تحت مفتاح:
 *   amwali_draft_<scope>_invoice_<sales|purchase>_new
 * هذا الـ helper يعدّد المفاتيح الخاصة بالمستخدم/الشركة الحالية،
 * ويستخرج metadata قابلة للعرض في DraftsHistoryDialog.
 * مدة الاحتفاظ الافتراضية: 7 أيام (يحذف الأقدم تلقائياً عند القراءة).
 */

const PREFIX = "amwali_draft_";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface InvoiceDraftMeta {
  storageKey: string;
  formId: string;          // e.g. "invoice_sales_new"
  type: "sales" | "purchase";
  contactName: string;
  itemCount: number;
  totalApprox: number;
  savedAt: number;
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function calcApproxTotal(items: any[]): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, it) => {
    const qty = Number(it?.quantity || 0);
    const price = Number(it?.unitPrice || 0);
    const discount = Number(it?.discount || 0);
    const discountType = it?.discountType === "amount" ? "amount" : "percent";
    const gross = qty * price;
    const disc = discountType === "percent" ? gross * (discount / 100) : discount;
    const net = Math.max(0, gross - disc);
    const taxRate = Number(it?.taxRate || 0);
    return sum + net * (1 + taxRate / 100);
  }, 0);
}

export function listInvoiceDrafts(scope: string): InvoiceDraftMeta[] {
  const out: InvoiceDraftMeta[] = [];
  const now = Date.now();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      // Match keys belonging to this scope and ending with invoice_*_new
      if (!key.includes(scope)) continue;
      if (!/invoice_(sales|purchase)_new$/.test(key)) continue;

      const env = safeJsonParse<{ data: any; savedAt: number; version: number }>(localStorage.getItem(key));
      if (!env || !env.savedAt) continue;
      // Cleanup expired drafts on read
      if (now - env.savedAt > MAX_AGE_MS) {
        try { localStorage.removeItem(key); } catch { /* noop */ }
        continue;
      }
      const formData = env.data?.form || env.data || {};
      const items = formData?.items || [];
      const type: "sales" | "purchase" = formData?.type === "purchase" ? "purchase" : "sales";
      out.push({
        storageKey: key,
        formId: key.endsWith("invoice_purchase_new") ? "invoice_purchase_new" : "invoice_sales_new",
        type,
        contactName: formData?.contactName?.toString().trim() || "—",
        itemCount: Array.isArray(items)
          ? items.filter((it: any) => it?.productId || it?.description?.trim()).length
          : 0,
        totalApprox: calcApproxTotal(items),
        savedAt: env.savedAt,
      });
    }
  } catch {
    /* noop */
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export function getInvoiceDraft(storageKey: string): any | null {
  const env = safeJsonParse<{ data: any }>(localStorage.getItem(storageKey));
  return env?.data ?? null;
}

export function removeInvoiceDraft(storageKey: string) {
  try { localStorage.removeItem(storageKey); } catch { /* noop */ }
}