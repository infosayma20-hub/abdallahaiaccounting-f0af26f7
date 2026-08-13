import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, FileJson, FileSpreadsheet, Loader2, CheckCircle, Database } from "lucide-react";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";

// جميع جداول بيانات المستأجر — RLS يحصر النتائج على بيانات المستخدم الحالي فقط
const BACKUP_TABLES: { key: string; label: string; scoped?: boolean }[] = [
  // المحاسبة الأساسية
  { key: "accounts", label: "شجرة الحسابات", scoped: true },
  { key: "transactions", label: "القيود المحاسبية", scoped: true },
  { key: "journal_books", label: "دفاتر اليومية", scoped: true },
  { key: "journal_templates", label: "قوالب القيود", scoped: true },
  { key: "fiscal_periods", label: "الفترات المحاسبية", scoped: true },
  { key: "opening_balance_batches", label: "دفعات الأرصدة الافتتاحية", scoped: true },
  { key: "opening_balance_entries", label: "بنود الأرصدة الافتتاحية", scoped: true },
  { key: "cost_centers", label: "مراكز التكلفة", scoped: true },
  { key: "financial_dimensions", label: "الأبعاد المالية", scoped: true },
  { key: "financial_dimension_values", label: "قيم الأبعاد المالية", scoped: true },
  // جهات الاتصال والعملاء والموردين
  { key: "contacts", label: "جهات الاتصال", scoped: true },
  { key: "suppliers", label: "الموردون" },
  // الفواتير والمبيعات
  { key: "invoices", label: "فواتير المبيعات", scoped: true },
  { key: "invoice_items", label: "بنود فواتير المبيعات" },
  { key: "purchase_invoices", label: "فواتير المشتريات", scoped: true },
  { key: "quotations", label: "عروض الأسعار", scoped: true },
  { key: "delivery_notes", label: "إشعارات التسليم", scoped: true },
  { key: "recurring_invoices", label: "الفواتير المتكررة", scoped: true },
  { key: "returns", label: "المرتجعات", scoped: true },
  { key: "return_items", label: "بنود المرتجعات" },
  // السندات والمدفوعات
  { key: "receipt_vouchers", label: "سندات القبض", scoped: true },
  { key: "vouchers", label: "سندات الصرف والقيد" },
  { key: "payment_invoice_links", label: "روابط الدفعات بالفواتير" },
  // الشيكات
  { key: "cheques", label: "الشيكات", scoped: true },
  { key: "cheque_status_history", label: "تاريخ حالات الشيكات", scoped: true },
  // البنوك والصناديق
  { key: "bank_accounts", label: "الحسابات البنكية", scoped: true },
  { key: "cash_boxes", label: "الصناديق", scoped: true },
  { key: "cash_transfers", label: "التحويلات النقدية", scoped: true },
  { key: "currencies", label: "العملات", scoped: true },
  { key: "exchange_rates", label: "أسعار الصرف", scoped: true },
  { key: "currency_conversions", label: "تحويلات العملات", scoped: true },
  // المخزون والمنتجات
  { key: "products", label: "المنتجات", scoped: true },
  { key: "item_categories", label: "تصنيفات الأصناف", scoped: true },
  { key: "product_units", label: "وحدات المنتجات", scoped: true },
  { key: "product_barcodes", label: "باركود المنتجات", scoped: true },
  { key: "product_price_tiers", label: "شرائح أسعار المنتجات", scoped: true },
  { key: "product_warehouse_stock", label: "أرصدة المستودعات", scoped: true },
  { key: "product_warehouse_settings", label: "إعدادات مستودع المنتج", scoped: true },
  { key: "stock_movements", label: "حركات المخزون" },
  { key: "stock_transfers", label: "التحويلات المخزنية", scoped: true },
  { key: "stock_transfer_items", label: "بنود التحويلات المخزنية" },
  { key: "inventory_period_counts", label: "جرد نهاية المدة", scoped: true },
  { key: "import_shipments", label: "شحنات الاستيراد", scoped: true },
  // الأصول
  { key: "assets", label: "الأصول الثابتة", scoped: true },
  { key: "asset_categories", label: "فئات الأصول", scoped: true },
  { key: "asset_depreciation_entries", label: "قيود الإهلاك", scoped: true },
  { key: "asset_disposals", label: "استبعاد الأصول", scoped: true },
  { key: "asset_maintenance", label: "صيانة الأصول", scoped: true },
  { key: "asset_transfers", label: "تحويلات الأصول", scoped: true },
  { key: "asset_revaluations", label: "إعادة تقييم الأصول", scoped: true },
  // الموارد البشرية
  { key: "employees", label: "الموظفون", scoped: true },
  { key: "departments", label: "الأقسام", scoped: true },
  { key: "job_titles", label: "المسميات الوظيفية", scoped: true },
  { key: "employee_payroll", label: "الرواتب", scoped: true },
  { key: "payroll_batches", label: "دفعات الرواتب", scoped: true },
  { key: "employee_advances", label: "السلف", scoped: true },
  { key: "employee_advance_installments", label: "أقساط السلف" },
  { key: "employee_deductions", label: "الاستقطاعات", scoped: true },
  { key: "employee_allowances", label: "البدلات", scoped: true },
  { key: "employee_loans", label: "القروض", scoped: true },
  { key: "loan_installments", label: "أقساط القروض" },
  { key: "employee_leaves", label: "الإجازات" },
  { key: "employee_forms", label: "نماذج الموظفين", scoped: true },
  { key: "employee_financial_movements", label: "الحركات المالية للموظفين", scoped: true },
  { key: "attendance_days", label: "أيام الحضور" },
  { key: "attendance_events", label: "أحداث الحضور" },
  { key: "attendance_breaks", label: "استراحات الحضور" },
  { key: "commissions", label: "العمولات", scoped: true },
  // الطلبات وخدمة العملاء
  { key: "orders", label: "الطلبات" },
  { key: "order_items", label: "بنود الطلبات" },
  { key: "order_status_log", label: "سجل حالات الطلبات" },
  { key: "call_center_orders", label: "طلبات مركز الاتصال", scoped: true },
  { key: "delivery_zones", label: "مناطق التوصيل", scoped: true },
  // نقطة البيع
  { key: "pos_orders", label: "طلبات نقطة البيع", scoped: true },
  { key: "pos_order_lines", label: "بنود طلبات POS", scoped: true },
  { key: "pos_payments", label: "مدفوعات نقطة البيع", scoped: true },
  { key: "pos_order_discounts", label: "خصومات طلبات POS", scoped: true },
  { key: "pos_sessions", label: "جلسات نقطة البيع", scoped: true },
  { key: "pos_shift_audits", label: "تدقيق العهدات", scoped: true },
  { key: "pos_shift_foreign_adjustments", label: "تسويات العملات في العهدات", scoped: true },
  { key: "pos_expenses", label: "مصاريف نقطة البيع", scoped: true },
  { key: "pos_expense_categories", label: "فئات مصاريف POS", scoped: true },
  { key: "pos_categories", label: "فئات نقطة البيع", scoped: true },
  { key: "pos_customers", label: "عملاء نقطة البيع", scoped: true },
  { key: "pos_devices", label: "أجهزة نقطة البيع", scoped: true },
  { key: "pos_terminals", label: "طرفيات نقطة البيع", scoped: true },
  { key: "pos_printers", label: "طابعات نقطة البيع", scoped: true },
  { key: "pos_users", label: "مستخدمو نقطة البيع", scoped: true },
  { key: "pos_cancel_reasons", label: "أسباب إلغاء POS", scoped: true },
  { key: "pos_inventory_movements", label: "حركات مخزون POS", scoped: true },
  { key: "pos_purchases", label: "مشتريات POS", scoped: true },
  { key: "pos_suppliers", label: "موردو POS", scoped: true },
  // الفروع والإعدادات
  { key: "branches", label: "الفروع", scoped: true },
  { key: "company_settings", label: "إعدادات الشركة", scoped: true },
  { key: "tax_settings", label: "إعدادات الضريبة", scoped: true },
  { key: "tax_ledger", label: "سجل الضريبة", scoped: true },
  // CRM
  { key: "crm_leads", label: "العملاء المحتملون", scoped: true },
  { key: "crm_opportunities", label: "الفرص البيعية", scoped: true },
  { key: "crm_activities", label: "أنشطة CRM", scoped: true },
  // المشاريع والمقاولات
  { key: "contractor_projects", label: "مشاريع المقاولات", scoped: true },
  { key: "contractor_transactions", label: "حركات المقاولات", scoped: true },
  { key: "project_contracts", label: "عقود المشاريع", scoped: true },
  // الإنتاج
  { key: "production_orders", label: "أوامر الإنتاج", scoped: true },
  { key: "production_formulas", label: "صيغ الإنتاج", scoped: true },
  // التسلسلات والوثائق
  { key: "invoice_sequences", label: "تسلسلات الفواتير", scoped: true },
  { key: "document_sequences", label: "تسلسلات المستندات", scoped: true },
];

type TableDef = { key: string; label: string; scoped?: boolean };
type TableRows = { key: string; label: string; rows: any[] };

// تقييد فترة التصدير: يُطبَّق فقط على الجداول الحركية الضخمة (لها created_at)
const PERIOD_FILTERABLE = new Set([
  "transactions", "pos_orders", "pos_order_lines", "pos_payments", "pos_order_discounts",
  "order_items", "orders", "order_status_log", "invoice_items", "invoices",
  "purchase_invoices", "stock_movements", "attendance_events", "attendance_days",
  "attendance_breaks", "call_center_orders", "pos_inventory_movements", "kitchen_tickets",
  "receipt_vouchers", "vouchers", "payment_invoice_links",
]);

// مجمّع تنفيذ متوازٍ بسقف ثابت — يمنع إغراق الخادم مع تسريع التصدير عدة أضعاف
async function pool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// عدّ سريع (HEAD) لكل جدول — الجداول الفارغة تُستبعد فوراً بدل جلبها صفحة صفحة
async function countTable(t: TableDef, userId: string, since: string | null): Promise<number | null> {
  let q = supabase.from(t.key as any).select("id", { count: "exact", head: true });
  if (t.scoped) q = q.eq("user_id", userId);
  if (since && PERIOD_FILTERABLE.has(t.key)) q = q.gte("created_at", since);
  let { count, error } = await q;
  if (error) {
    // بعض الجداول بلا عمود id — أعد المحاولة بعدّ عام
    let q2 = supabase.from(t.key as any).select("*", { count: "exact", head: true });
    if (t.scoped) q2 = q2.eq("user_id", userId);
    if (since && PERIOD_FILTERABLE.has(t.key)) q2 = q2.gte("created_at", since);
    const r2 = await q2;
    if (r2.error) return null;
    count = r2.count;
  }
  return count ?? 0;
}

// جلب كامل جدول واحد بترتيب ثابت (بدون ORDER BY تصير الصفحات غير حتمية → تكرار/نقص صفوف)
async function fetchTable(
  t: TableDef,
  userId: string,
  since: string | null,
  knownTotal?: number | null,
): Promise<{ rows: any[]; failed: boolean }> {
  const pageSize = 1000;
  const usePeriod = !!since && PERIOD_FILTERABLE.has(t.key);
  const build = (from: number, to: number, withCount: boolean, orderBy: string | null) => {
    let q = supabase
      .from(t.key as any)
      .select("*", withCount ? { count: "exact" } : undefined as any)
      .range(from, to);
    if (orderBy) q = q.order(orderBy, { ascending: true });
    if (t.scoped) q = q.eq("user_id", userId);
    if (usePeriod) q = q.gte("created_at", since as string);
    return q;
  };

  // ترتيب حتمي إجباري: بدونه الصفحات بترجع صفوف مكررة/ناقصة
  let orderBy: string | null = "id";
  const needCount = knownTotal == null;
  let first = await build(0, pageSize - 1, needCount, orderBy);
  for (const alt of ["created_at", null] as (string | null)[]) {
    if (!first.error) break;
    orderBy = alt;
    first = await build(0, pageSize - 1, needCount, orderBy);
  }
  if (first.error) {
    console.warn(`[backup] skip ${t.key}:`, first.error.message);
    return { rows: [], failed: true };
  }

  const rows: any[] = [...(first.data || [])];
  const total = knownTotal ?? first.count ?? rows.length;
  let failed = false;
  if (total > pageSize) {
    // صفحات متوازية على دفعات — يسرّع الجداول الضخمة دون تضخّم الذاكرة
    for (let start = pageSize; start < total; start += pageSize * 4) {
      const batch: number[] = [];
      for (let s2 = start; s2 < Math.min(start + pageSize * 4, total); s2 += pageSize) batch.push(s2);
      const pages = await Promise.all(batch.map(s2 => build(s2, s2 + pageSize - 1, false, orderBy)));
      for (const pg of pages) {
        if (pg.error) { failed = true; console.warn(`[backup] page error ${t.key}:`, pg.error.message); continue; }
        if (pg.data) rows.push(...pg.data);
      }
    }
  }
  return { rows, failed };
}

function toCsv(rows: any[]): string {
  const headerSet = new Set<string>();
  for (const r of rows) Object.keys(r || {}).forEach(k => headerSet.add(k));
  const headers: string[] = Array.from(headerSet);
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out: string[] = [headers.join(",")];
  for (const r of rows) out.push(headers.map(h => esc(r?.[h])).join(","));
  return "\uFEFF" + out.join("\r\n");
}

const BackupSettingsSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ table: string; done: boolean }[]>([]);
  const [phase, setPhase] = useState<string>("");
  const [months, setMonths] = useState<number>(0); // 0 = كل البيانات

  // 1) عدّ سريع متوازٍ لكل الجداول → استبعاد الفارغ.
  // 2) جلب الجداول غير الفارغة بالتوازي (سقف 4) وتسليمها للمستهلك ثم تحريرها فوراً.
  const streamTables = async (onTable: (t: TableRows) => Promise<void> | void) => {
    if (!user) return { totalRows: 0, failedTables: [] as string[], skipped: 0 };
    const since = months > 0
      ? new Date(Date.now() - months * 30.44 * 24 * 3600 * 1000).toISOString()
      : null;

    setPhase("فحص الجداول...");
    setProgress([]);
    const counts = await pool(BACKUP_TABLES, 10, t => countTable(t, user.id, since));

    const active: { t: TableDef; total: number | null }[] = [];
    let skipped = 0;
    BACKUP_TABLES.forEach((t, i) => {
      const c = counts[i];
      if (c === 0) { skipped++; return; }
      active.push({ t, total: c });
    });

    const progressList = active.map(a => ({ table: a.t.label, done: false }));
    setProgress([...progressList]);
    setPhase(`جارِ تصدير ${active.length} جدول (تم تخطي ${skipped} جدول فارغ)`);

    let totalRows = 0;
    const failedTables: string[] = [];
    let writing: Promise<void> = Promise.resolve();

    await pool(active, 4, async ({ t, total }, i) => {
      let rows: any[] = [];
      try {
        const res = await fetchTable(t, user.id, since, total);
        rows = res.rows;
        if (res.failed) failedTables.push(t.label);
      } catch (e) {
        console.warn(`[backup] error ${t.key}`, e);
        failedTables.push(t.label);
      }
      totalRows += rows.length;
      // الكتابة متسلسلة لضمان سلامة ملف JSON/ZIP رغم الجلب المتوازي
      writing = writing.then(async () => {
        await onTable({ key: t.key, label: t.label, rows });
        rows.length = 0; // تحرير فوري
        progressList[i].done = true;
        setProgress([...progressList]);
      });
      await writing;
    });

    await writing;
    return { totalRows, failedTables, skipped };
  };

  const getTimestamp = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const exportJSON = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // نبني الملف كأجزاء نصية — بدون تجميع كل البيانات في كائن/نص واحد ضخم
      // (هذا كان سبب خطأ "Invalid array length" عند الحسابات الكبيرة مثل الملكي).
      const parts: string[] = ["{"];
      const counts: Record<string, number> = {};
      let first = true;

      const { totalRows, failedTables, skipped } = await streamTables(({ key, rows }) => {
        counts[key] = rows.length;
        // تسلسل على دفعات: JSON.stringify لمصفوفة ضخمة وحدها قد يتجاوز حد النص في المتصفح
        parts.push(`${first ? "" : ","}${JSON.stringify(key)}:[`);
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500).map(r => JSON.stringify(r)).join(",");
          parts.push(i === 0 ? chunk : `,${chunk}`);
        }
        parts.push("]");
        first = false;
      });

      parts.push(
        `,"_meta":${JSON.stringify({
          exported_at: new Date().toISOString(),
          user_id: user.id,
          tables: Object.keys(counts).length,
          total_rows: totalRows,
          row_counts: counts,
        })}}`,
      );

      const blob = new Blob(parts, { type: "application/json" });
      saveAs(blob, `amwali_backup_${getTimestamp()}.json`);
      localStorage.setItem(`amwali_last_backup_${user.id}`, new Date().toISOString());

      toast({
        title: "تم تصدير النسخة الاحتياطية",
        description: `${totalRows} سجل في ${Object.keys(counts).length} جدول (تخطي ${skipped} فارغ)${failedTables.length ? ` — تعذّر جلب: ${failedTables.join("، ")}` : ""}`,
        variant: failedTables.length ? "destructive" : undefined,
      });
    } catch (err: any) {
      toast({ title: "خطأ في التصدير", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setProgress([]);
      setPhase("");
    }
  };

  // ملف Excel واحد (.xlsx) فيه شيت لكل جدول
  const exportExcel = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const wb = XLSX.utils.book_new();
      const summaryRows: any[][] = [["الجدول", "المفتاح", "عدد السجلات"]];
      const used = new Set<string>();
      const MAX_ROWS = 500000; // تقسيم الجداول الضخمة على أكثر من شيت
      const sheetName = (base: string) => {
        let n = base.replace(/[\\/:*?[\]]/g, "-").slice(0, 31).trim() || "Sheet";
        let i = 2;
        while (used.has(n)) {
          const suffix = `_${i++}`;
          n = `${base.slice(0, 31 - suffix.length)}${suffix}`;
        }
        used.add(n);
        return n;
      };

      const { totalRows, failedTables, skipped } = await streamTables(({ key, label, rows }) => {
        summaryRows.push([label, key, rows.length]);
        if (rows.length === 0) return;
        for (let i = 0; i < rows.length; i += MAX_ROWS) {
          const part = rows.slice(i, i + MAX_ROWS);
          const base = rows.length > MAX_ROWS ? `${label} ${i / MAX_ROWS + 1}` : `${label}`;
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(part), sheetName(base || key));
        }
      });

      // شيت الملخص أولاً
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "00_الملخص");
      wb.SheetNames.unshift(wb.SheetNames.pop() as string);

      const out = XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true });
      saveAs(
        new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `amwali_backup_${getTimestamp()}.xlsx`,
      );
      localStorage.setItem(`amwali_last_backup_${user.id}`, new Date().toISOString());

      toast({
        title: "تم تصدير النسخة الاحتياطية",
        description: `${totalRows} سجل (تخطي ${skipped} جدول فارغ) — ملف Excel واحد بشيتات${failedTables.length ? ` — تعذّر جلب: ${failedTables.join("، ")}` : ""}`,
        variant: failedTables.length ? "destructive" : undefined,
      });
    } catch (err: any) {
      toast({ title: "خطأ في التصدير", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setProgress([]);
      setPhase("");
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          النسخ الاحتياطي
        </h3>
        <p className="text-sm text-muted-foreground">
          تصدير كامل لبيانات شركتك فقط كملف محلي على جهازك — بيانات الشركات والمستخدمين الآخرين مستثناة تلقائياً بواسطة سياسات الأمان (RLS).
          يشمل جميع الحركات: القيود، الفواتير، السندات، الشيكات، المخزون، الأصول، الرواتب، نقطة البيع، والمزيد.
        </p>
      </div>

      <Separator />

      {/* فترة التصدير */}
      <div className="space-y-2">
        <p className="text-sm font-medium">فترة الحركات</p>
        <p className="text-xs text-muted-foreground">
          البيانات الأساسية (الحسابات، المنتجات، الموظفون، الإعدادات) تُصدَّر كاملة دائماً. الاختيار يحدّ الجداول الحركية الضخمة فقط (نقطة البيع، القيود، الفواتير، الحضور) — ويختصر وقت التصدير كثيراً.
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { v: 3, l: "آخر 3 أشهر" },
            { v: 12, l: "آخر سنة" },
            { v: 0, l: "كل البيانات" },
          ].map(o => (
            <Button
              key={o.v}
              type="button"
              size="sm"
              variant={months === o.v ? "default" : "outline"}
              disabled={loading}
              onClick={() => setMonths(o.v)}
            >
              {o.l}
            </Button>
          ))}
        </div>
      </div>

      {/* Export Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* JSON */}
        <div className="border rounded-xl p-5 space-y-3 bg-muted/20 hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <FileJson className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">تصدير JSON</p>
              <p className="text-xs text-muted-foreground">ملف منظم قابل لإعادة الاستيراد</p>
            </div>
          </div>
          <Button onClick={exportJSON} disabled={loading} className="w-full gap-2" variant="outline">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            تحميل JSON
          </Button>
        </div>

        {/* Excel */}
        <div className="border rounded-xl p-5 space-y-3 bg-muted/20 hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">تصدير Excel</p>
              <p className="text-xs text-muted-foreground">ملف مضغوط: CSV لكل جدول يفتح بـ Excel</p>
            </div>
          </div>
          <Button onClick={exportExcel} disabled={loading} className="w-full gap-2" variant="outline">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            تحميل Excel (ZIP)
          </Button>
        </div>
      </div>

      {/* Progress */}
      {(loading || progress.length > 0) && (
        <div className="border rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <Database className="w-4 h-4" />
            {phase || "جارِ تصدير البيانات..."}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
            {progress.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                {p.done ? (
                  <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
                ) : (
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />
                )}
                <span className={p.done ? "text-muted-foreground" : "text-foreground"}>{p.table}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Tables included */}
      <div>
        <p className="text-sm font-medium mb-3">الجداول المشمولة ({BACKUP_TABLES.length})</p>
        <div className="flex flex-wrap gap-2">
          {BACKUP_TABLES.map(t => (
            <Badge key={t.key} variant="secondary" className="text-xs">{t.label}</Badge>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BackupSettingsSection;
