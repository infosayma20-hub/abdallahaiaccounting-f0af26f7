import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle, AlertTriangle, Lock, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  parent_code: string | null;
  is_system_protected?: boolean | null;
}

interface ImportPreviewRow {
  code: string;
  name: string;
  account_type: string;
  parent_code: string;
  description_ar: string;
  status: "NEW" | "EXISTS_PROTECTED" | "EXISTS_UPDATABLE" | "ERROR";
  error?: string;
}

interface ImportAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingAccounts: Account[];
  userId: string;
}

const validTypes = ["أصول", "Asset", "التزامات", "Liability", "حقوق ملكية", "Owner's Equity", "إيرادات", "Revenue", "مشتريات", "Purchases", "مصروفات", "Expenses", "مصاريف"];

export const ImportAccountsModal = ({ isOpen, onClose, onSuccess, existingAccounts, userId }: ImportAccountsModalProps) => {
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; errors: string[] } | null>(null);
  const { toast } = useToast();

  const existingCodes = new Set(existingAccounts.map(a => a.account_code));
  const protectedCodes = new Set(existingAccounts.filter(a => a.is_system_protected).map(a => a.account_code));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setIsLoading(true);
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

      const preview: ImportPreviewRow[] = rows.map(row => {
        const code = String(row["رمز الحساب"] ?? "").trim();
        const name = String(row["اسم الحساب"] ?? "").trim();
        const accountType = String(row["نوع الحساب"] ?? "").trim();
        const parentCode = String(row["حساب الأب"] ?? "").trim();
        const descAr = String(row["الوصف"] ?? "").trim();

        if (!code) return { code, name, account_type: accountType, parent_code: parentCode, description_ar: descAr, status: "ERROR" as const, error: "رمز الحساب مطلوب" };
        if (!name) return { code, name, account_type: accountType, parent_code: parentCode, description_ar: descAr, status: "ERROR" as const, error: "اسم الحساب مطلوب" };
        if (!validTypes.includes(accountType)) return { code, name, account_type: accountType, parent_code: parentCode, description_ar: descAr, status: "ERROR" as const, error: `نوع الحساب غير صالح` };

        let status: ImportPreviewRow["status"] = "NEW";
        if (existingCodes.has(code)) {
          status = protectedCodes.has(code) ? "EXISTS_PROTECTED" : "EXISTS_UPDATABLE";
        }

        return { code, name, account_type: accountType, parent_code: parentCode, description_ar: descAr, status };
      });

      setPreviewRows(preview);
      setStep("preview");
    } catch {
      toast({ title: "خطأ", description: "تعذر قراءة الملف", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    setIsLoading(true);
    const errors: string[] = [];
    let inserted = 0, updated = 0;

    try {
      const toInsert = previewRows.filter(r => r.status === "NEW" && !r.error).map(r => ({
        user_id: userId,
        account_code: r.code,
        account_name: r.name,
        account_type: r.account_type,
        parent_code: r.parent_code || null,
        description_ar: r.description_ar || null,
        is_system_protected: false,
      }));

      if (toInsert.length > 0) {
        const { error } = await supabase.from("accounts").insert(toInsert);
        if (error) errors.push(`خطأ في الإضافة: ${error.message}`);
        else inserted = toInsert.length;
      }

      const toUpdate = previewRows.filter(r => r.status === "EXISTS_UPDATABLE" && !r.error);
      for (const row of toUpdate) {
        const { error } = await supabase.from("accounts")
          .update({ account_name: row.name, description_ar: row.description_ar || null })
          .eq("account_code", row.code).eq("user_id", userId);
        if (error) errors.push(`خطأ ${row.code}: ${error.message}`);
        else updated++;
      }

      setResult({ inserted, updated, errors });
      setStep("done");
    } finally {
      setIsLoading(false);
    }
  };

  const newCount = previewRows.filter(r => r.status === "NEW" && !r.error).length;
  const updateCount = previewRows.filter(r => r.status === "EXISTS_UPDATABLE" && !r.error).length;
  const protectedCount = previewRows.filter(r => r.status === "EXISTS_PROTECTED").length;
  const errorCount = previewRows.filter(r => r.error).length;

  const handleClose = () => {
    setStep("upload");
    setPreviewRows([]);
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-[650px] p-0 gap-0 overflow-hidden" dir="rtl">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Upload className="w-4 h-4" />
            استيراد الحسابات من Excel
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {step === "upload" && (
            <div className="text-center space-y-4 py-8">
              <div className="w-16 h-16 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                <FileSpreadsheet className="w-8 h-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">اختر ملف Excel بنفس تنسيق ملف التصدير</p>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-[#1B3A5C] text-white rounded-lg cursor-pointer hover:bg-[#1B3A5C]/90 transition text-sm">
                <Upload className="w-4 h-4" />
                اختيار ملف
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
              </label>
            </div>
          )}

          {step === "preview" && (
            <>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-green-50 rounded-lg p-2"><p className="text-lg font-bold text-green-700">{newCount}</p><p className="text-[10px] text-green-600">جديد</p></div>
                <div className="bg-blue-50 rounded-lg p-2"><p className="text-lg font-bold text-blue-700">{updateCount}</p><p className="text-[10px] text-blue-600">تحديث</p></div>
                <div className="bg-amber-50 rounded-lg p-2"><p className="text-lg font-bold text-amber-700">{protectedCount}</p><p className="text-[10px] text-amber-600">محمي</p></div>
                <div className="bg-red-50 rounded-lg p-2"><p className="text-lg font-bold text-red-700">{errorCount}</p><p className="text-[10px] text-red-600">أخطاء</p></div>
              </div>

              <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[hsl(210,20%,97%)] sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-right font-semibold">الرمز</th>
                      <th className="px-3 py-2 text-right font-semibold">الاسم</th>
                      <th className="px-3 py-2 text-right font-semibold">النوع</th>
                      <th className="px-3 py-2 text-right font-semibold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previewRows.map((row, i) => (
                      <tr key={i} className={cn(row.error && "bg-red-50/50")}>
                        <td className="px-3 py-1.5 font-mono">{row.code}</td>
                        <td className="px-3 py-1.5 truncate max-w-[180px]">{row.name}</td>
                        <td className="px-3 py-1.5">{row.account_type}</td>
                        <td className="px-3 py-1.5">
                          {row.error ? (
                            <span className="text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{row.error}</span>
                          ) : row.status === "NEW" ? (
                            <span className="text-green-600 font-semibold">✚ جديد</span>
                          ) : row.status === "EXISTS_UPDATABLE" ? (
                            <span className="text-blue-600 font-semibold">↻ تحديث</span>
                          ) : (
                            <span className="text-amber-600 flex items-center gap-1"><Lock className="w-3 h-3" />محمي</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={handleImport} disabled={isLoading || (newCount + updateCount === 0)} className="flex-1 bg-[#1B3A5C] hover:bg-[#1B3A5C]/90">
                  {isLoading ? "جاري الاستيراد..." : `استيراد ${newCount + updateCount} حساب`}
                </Button>
                <Button variant="outline" onClick={() => setStep("upload")}>رجوع</Button>
              </div>
            </>
          )}

          {step === "done" && result && (
            <div className="text-center space-y-4 py-6">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <h3 className="text-base font-bold">اكتمل الاستيراد</h3>
              <div className="flex justify-center gap-6">
                <div><p className="text-xl font-bold text-green-600">{result.inserted}</p><p className="text-[10px] text-muted-foreground">أُضيف</p></div>
                <div><p className="text-xl font-bold text-blue-600">{result.updated}</p><p className="text-[10px] text-muted-foreground">حُدِّث</p></div>
              </div>
              {result.errors.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3 text-xs text-red-700 text-right space-y-1">
                  {result.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              <Button onClick={() => { onSuccess(); handleClose(); }} className="bg-[#1B3A5C] hover:bg-[#1B3A5C]/90">
                إغلاق وتحديث الشجرة
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
