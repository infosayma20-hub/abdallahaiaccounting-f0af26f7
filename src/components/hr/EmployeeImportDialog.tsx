import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, Loader2, AlertCircle, CheckCircle2, ArrowDownToLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { EMPLOYEE_IMPORT_COLUMNS, mapExcelRowToEmployee } from "@/lib/hr-utils";

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  onSuccess: () => void;
}

export default function EmployeeImportDialog({ open, onClose, userId, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [validCount, setValidCount] = useState(0);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([EMPLOYEE_IMPORT_COLUMNS]);
    // Add sample row
    const sampleRow = [
      "محمد أحمد", "123456789", "ذكر", "1990-01-15",
      "فلسطينية", "0599123456", "m@email.com", "نابلس",
      "2024-01-01", "محاسب", "المالية", "دائم",
      "3000", "شهري", "6", "8", "15", "10",
      "متزوج", "2", "100", "50", "14",
      "بنك فلسطين", "PS001234", "أحمد محمد", "0598765432",
    ];
    XLSX.utils.sheet_add_aoa(ws, [sampleRow], { origin: "A2" });
    ws["!cols"] = EMPLOYEE_IMPORT_COLUMNS.map(() => ({ wch: 18 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الموظفون");
    XLSX.writeFile(wb, "قالب_استيراد_الموظفين.xlsx");
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setErrors([]);
    setValidCount(0);

    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws) as Record<string, any>[];

      if (data.length === 0) {
        setErrors(["الملف فارغ"]);
        setImporting(false);
        return;
      }

      const errs: string[] = [];
      const valid: any[] = [];

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row["اسم الموظف"]) {
          errs.push(`صف ${i + 2}: اسم الموظف مطلوب`);
          continue;
        }
        valid.push(mapExcelRowToEmployee(row, userId));
      }

      if (errs.length > 0) {
        setErrors(errs);
        setValidCount(valid.length);
        if (valid.length === 0) {
          setImporting(false);
          return;
        }
      }

      // Insert valid rows
      const { error } = await supabase.from("employees").insert(valid as any);
      if (error) {
        setErrors(prev => [...prev, `خطأ في الحفظ: ${error.message}`]);
      } else {
        toast.success(`تم استيراد ${valid.length} موظف بنجاح ✅`);
        onSuccess();
        if (errs.length === 0) onClose();
      }
    } catch (err: any) {
      setErrors([`خطأ في قراءة الملف: ${err.message}`]);
    }

    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>استيراد موظفين من Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            نزّل القالب أولاً على جهازك، عبّي بيانات الموظفين، ثم ارفع الملف هنا.
          </p>

          <Button variant="outline" onClick={downloadTemplate} className="w-full gap-2">
            <ArrowDownToLine className="h-4 w-4" /> تنزيل القالب (Excel)
          </Button>

          <div className="border-2 border-dashed border-border rounded-xl p-6 text-center">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="gap-2"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing ? "جاري الاستيراد..." : "رفع الملف المعبّأ"}
            </Button>
          </div>

          {errors.length > 0 && (
            <div className="bg-destructive/10 rounded-xl p-3 space-y-1 max-h-40 overflow-y-auto">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium text-destructive">أخطاء ({errors.length})</span>
              </div>
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-destructive/80">{e}</p>
              ))}
              {validCount > 0 && (
                <p className="text-xs text-emerald-600 mt-2">
                  <CheckCircle2 className="h-3 w-3 inline ml-1" />
                  تم استيراد {validCount} موظف بنجاح
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
