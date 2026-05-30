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

const BACKUP_TABLES = [
  { key: "accounts", label: "شجرة الحسابات" },
  { key: "contacts", label: "جهات الاتصال" },
  { key: "transactions", label: "القيود المحاسبية" },
  { key: "invoices", label: "فواتير المبيعات" },
  { key: "invoice_items", label: "بنود الفواتير" },
  { key: "purchase_invoices", label: "فواتير المشتريات" },
  { key: "receipt_vouchers", label: "سندات القبض" },
  { key: "vouchers", label: "سندات الصرف والقيد" },
  { key: "products", label: "المنتجات" },
  { key: "cheques", label: "الشيكات" },
  { key: "bank_accounts", label: "الحسابات البنكية" },
  { key: "cash_boxes", label: "الصناديق" },
  { key: "cash_transfers", label: "التحويلات النقدية" },
  { key: "employees", label: "الموظفين" },
  { key: "employee_payroll", label: "الرواتب" },
  { key: "attendance_days", label: "الحضور" },
  { key: "pos_orders", label: "طلبات نقطة البيع" },
  { key: "pos_order_lines", label: "بنود طلبات POS" },
  { key: "fiscal_periods", label: "الفترات المحاسبية" },
  { key: "company_settings", label: "إعدادات الشركة" },
];

const BackupSettingsSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ table: string; done: boolean }[]>([]);

  const fetchAllData = async () => {
    const allData: Record<string, any[]> = {};
    const progressList: { table: string; done: boolean }[] = BACKUP_TABLES.map(t => ({ table: t.label, done: false }));
    setProgress([...progressList]);

    for (let i = 0; i < BACKUP_TABLES.length; i++) {
      const t = BACKUP_TABLES[i];
      try {
        // Fetch all rows (handle >1000 with pagination)
        let rows: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from(t.key as any)
            .select("*")
            .range(from, from + pageSize - 1);

          if (error) {
            console.warn(`Skipping ${t.key}:`, error.message);
            hasMore = false;
          } else {
            rows = rows.concat(data || []);
            hasMore = (data?.length || 0) === pageSize;
            from += pageSize;
          }
        }

        allData[t.key] = rows;
      } catch {
        allData[t.key] = [];
      }

      progressList[i].done = true;
      setProgress([...progressList]);
    }

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
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <FileJson className="w-5 h-5 text-blue-600 dark:text-blue-400" />
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
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-green-600 dark:text-green-400" />
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
