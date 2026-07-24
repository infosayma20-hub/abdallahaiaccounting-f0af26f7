import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, FileJson, FileSpreadsheet, Loader2, CheckCircle, Database } from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

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

// ينفّذ مهام بشكل متوازي بتحكم بعدد الاتصالات المتزامنة
async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency = 6,
) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

const BackupSettingsSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ table: string; done: boolean }[]>([]);

  const fetchAllData = async () => {
    if (!user) return {};
    const allData: Record<string, any[]> = {};
    const progressList: { table: string; done: boolean }[] = BACKUP_TABLES.map(t => ({
      table: t.label,
      done: false,
    }));
    setProgress([...progressList]);

    await runWithConcurrency(
      BACKUP_TABLES,
      async (t, i) => {
        try {
          const rows: any[] = [];
          const pageSize = 1000;
          let from = 0;
          // نُطبِّق فلتر user_id صراحةً عندما يتوفر — يُسرِّع الاستعلام عبر الفهارس
          // ويوفّر طبقة أمان إضافية فوق سياسات RLS (RLS يبقى المصدر الوحيد للحقيقة).
          while (true) {
            let q = supabase.from(t.key as any).select("*").range(from, from + pageSize - 1);
            if (t.scoped) q = q.eq("user_id", user.id);
            const { data, error } = await q;
            if (error) {
              console.warn(`[backup] skip ${t.key}:`, error.message);
              break;
            }
            rows.push(...(data || []));
            if ((data?.length || 0) < pageSize) break;
            from += pageSize;
          }
          allData[t.key] = rows;
        } catch (e) {
          console.warn(`[backup] error ${t.key}`, e);
          allData[t.key] = [];
        }
        progressList[i].done = true;
        setProgress([...progressList]);
      },
      6,
    );

    return allData;
  };

  const getTimestamp = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const exportJSON = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const allData = await fetchAllData();
      const backup = {
        _meta: {
          exported_at: new Date().toISOString(),
          user_id: user.id,
          tables: Object.keys(allData).length,
          total_rows: Object.values(allData).reduce((s, a) => s + a.length, 0),
        },
        ...allData,
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      saveAs(blob, `amwali_backup_${getTimestamp()}.json`);
      localStorage.setItem(`amwali_last_backup_${user.id}`, new Date().toISOString());

      toast({ title: "تم تصدير النسخة الاحتياطية", description: `${backup._meta.total_rows} سجل في ${backup._meta.tables} جدول` });
    } catch (err: any) {
      toast({ title: "خطأ في التصدير", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setProgress([]);
    }
  };

  const exportExcel = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const allData = await fetchAllData();
      const wb = XLSX.utils.book_new();

      // Meta sheet
      const metaData = BACKUP_TABLES.map(t => ({
        "الجدول": t.label,
        "المفتاح": t.key,
        "عدد السجلات": (allData[t.key] || []).length,
      }));
      const metaSheet = XLSX.utils.json_to_sheet(metaData);
      XLSX.utils.book_append_sheet(wb, metaSheet, "ملخص");

      // Data sheets
      for (const t of BACKUP_TABLES) {
        const rows = allData[t.key] || [];
        if (rows.length === 0) continue;
        // Truncate sheet name to 31 chars (Excel limit)
        const sheetName = t.label.substring(0, 31);
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }

      const excelBuf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([excelBuf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      saveAs(blob, `amwali_backup_${getTimestamp()}.xlsx`);
      localStorage.setItem(`amwali_last_backup_${user.id}`, new Date().toISOString());

      const totalRows = Object.values(allData).reduce((s, a) => s + a.length, 0);
      toast({ title: "تم تصدير النسخة الاحتياطية", description: `${totalRows} سجل في ملف Excel` });
    } catch (err: any) {
      toast({ title: "خطأ في التصدير", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setProgress([]);
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
          تصدير كامل بيانات النظام كملف محلي على جهازك. يشمل الحسابات، القيود، الفواتير، جهات الاتصال، المنتجات، والمزيد.
        </p>
      </div>

      <Separator />

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
              <p className="text-xs text-muted-foreground">ملف بأوراق متعددة للمراجعة</p>
            </div>
          </div>
          <Button onClick={exportExcel} disabled={loading} className="w-full gap-2" variant="outline">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            تحميل Excel
          </Button>
        </div>
      </div>

      {/* Progress */}
      {progress.length > 0 && (
        <div className="border rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <Database className="w-4 h-4" />
            جارِ تصدير البيانات...
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
