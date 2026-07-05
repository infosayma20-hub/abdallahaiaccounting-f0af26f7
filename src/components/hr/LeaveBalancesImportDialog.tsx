import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

/**
 * Excel columns (0-indexed, after skipping 2 header rows):
 *  0: idx      1: emp_no    2: name         3: hire_date
 *  4: prev     5: annual_entl 6: total       7: accrued
 *  8: used_annual  9: current_annual
 * 10: sick_yearly 11: sick_accrued 12: used_sick 13: current_sick 14: paid_days
 */
type ParsedRow = {
  rowIdx: number;
  empNo: string;
  name: string;
  prevBalance: number;
  usedAnnual: number;
  usedSick: number;
  matchedEmployeeId: string | null;
  matchedEmployeeName?: string;
  manualEmpNo?: string; // for unmatched re-entry
};

const IMPORT_MARKER = "رصيد افتتاحي مستورد Excel 1/7/2026";

function toNum(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).trim());
  return isNaN(n) ? 0 : n;
}

export function LeaveBalancesImportDialog({
  open,
  onOpenChange,
  dataOwnerId,
  employees,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dataOwnerId: string;
  employees: { id: string; full_name: string; employee_number: string | null }[];
  onDone: () => void;
}) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const empByNumber = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const e of employees) {
      const n = (e.employee_number || "").toString().trim();
      if (n) m.set(n, { id: e.id, name: e.full_name });
    }
    return m;
  }, [employees]);

  const parseFile = async (file: File) => {
    setParsing(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
      const parsed: ParsedRow[] = [];
      for (let i = 2; i < data.length; i++) {
        const r = data[i];
        const empNoRaw = r?.[1];
        if (empNoRaw === "" || empNoRaw === null || empNoRaw === undefined) continue;
        const empNo = String(empNoRaw).replace(/\.0$/, "").trim();
        const name = String(r?.[2] || "").trim();
        if (!empNo || empNo === "NaN") continue;
        // Skip totals row (no name)
        if (!name) continue;
        const match = empByNumber.get(empNo);
        parsed.push({
          rowIdx: i + 1,
          empNo,
          name,
          prevBalance: toNum(r?.[4]),
          usedAnnual: toNum(r?.[8]),
          usedSick: toNum(r?.[12]),
          matchedEmployeeId: match?.id || null,
          matchedEmployeeName: match?.name,
        });
      }
      setRows(parsed);
      toast.success(`تم قراءة ${parsed.length} صف`);
    } catch (e: any) {
      toast.error("فشل قراءة الملف: " + (e?.message || ""));
    } finally {
      setParsing(false);
    }
  };

  const updateManualEmpNo = (idx: number, v: string) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const trimmed = v.trim();
        const match = trimmed ? empByNumber.get(trimmed) : undefined;
        return {
          ...r,
          manualEmpNo: v,
          matchedEmployeeId: match?.id || null,
          matchedEmployeeName: match?.name,
        };
      })
    );
  };

  const matched = rows.filter((r) => !!r.matchedEmployeeId);
  const unmatched = rows.filter((r) => !r.matchedEmployeeId);

  const runImport = async () => {
    if (matched.length === 0) {
      toast.error("لا يوجد موظفين مطابقين للاستيراد");
      return;
    }
    setImporting(true);
    setProgress({ done: 0, total: matched.length });
    let success = 0;
    let failed = 0;
    for (const r of matched) {
      try {
        // 1) Overwrite previous_year_balance
        const { error: upErr } = await supabase
          .from("employees")
          .update({ previous_year_balance: r.prevBalance } as any)
          .eq("id", r.matchedEmployeeId!);
        if (upErr) throw upErr;

        // 2) Delete prior import markers for this employee to avoid duplicates
        await supabase
          .from("employee_leaves")
          .delete()
          .eq("employee_id", r.matchedEmployeeId!)
          .eq("notes", IMPORT_MARKER);

        // 3) Insert opening-usage entries for annual + sick
        const inserts: any[] = [];
        if (r.usedAnnual > 0) {
          inserts.push({
            user_id: dataOwnerId,
            employee_id: r.matchedEmployeeId,
            leave_type: "سنوية",
            start_date: "2026-01-01",
            end_date: "2026-06-30",
            days_count: r.usedAnnual,
            status: "approved",
            notes: IMPORT_MARKER,
          });
        }
        if (r.usedSick > 0) {
          inserts.push({
            user_id: dataOwnerId,
            employee_id: r.matchedEmployeeId,
            leave_type: "مرضية",
            start_date: "2026-01-01",
            end_date: "2026-06-30",
            days_count: r.usedSick,
            status: "approved",
            notes: IMPORT_MARKER,
          });
        }
        if (inserts.length > 0) {
          const { error: lvErr } = await supabase.from("employee_leaves").insert(inserts);
          if (lvErr) throw lvErr;
        }
        success++;
      } catch (e: any) {
        failed++;
        console.error("Import failed for", r.name, e);
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : null));
    }
    setImporting(false);
    setProgress(null);
    if (failed === 0) {
      toast.success(`تم استيراد ${success} موظف بنجاح ✅`);
    } else {
      toast.error(`نجح ${success} / فشل ${failed}. تحقق من الـ console للتفاصيل.`);
    }
    onDone();
    onOpenChange(false);
    setRows([]);
    setFileName("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            استيراد أرصدة الإجازات من Excel
          </DialogTitle>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-10">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                ارفع ملف Excel (.xls/.xlsx) بصيغة قائمة الأرصدة الرسمية.
              </p>
              <p className="text-[11px] text-muted-foreground">
                الأعمدة: الرقم / الاسم / تاريخ التعيين / رصيد سابق / استحقاق السنة / ... / أيام مستوفاة سنوية / ... / أيام مستوفاة مرضية.
              </p>
            </div>
            <label className="border-2 border-dashed border-primary/40 rounded-xl p-8 cursor-pointer hover:bg-primary/5 transition-colors flex flex-col items-center gap-2">
              {parsing ? (
                <>
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <span className="text-sm">جاري القراءة…</span>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-primary" />
                  <span className="text-sm font-medium">اضغط لاختيار الملف</span>
                  <span className="text-[11px] text-muted-foreground">.xls / .xlsx</span>
                </>
              )}
              <input
                type="file"
                accept=".xls,.xlsx"
                className="hidden"
                disabled={parsing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) parseFile(f);
                }}
              />
            </label>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="text-xs">📄 {fileName}</Badge>
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1">
                <CheckCircle2 className="h-3 w-3" /> مطابق: {matched.length}
              </Badge>
              <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1">
                <AlertTriangle className="h-3 w-3" /> غير مطابق: {unmatched.length}
              </Badge>
              <Badge variant="outline">إجمالي: {rows.length}</Badge>
              <Button
                variant="ghost"
                size="sm"
                className="mr-auto"
                onClick={() => {
                  setRows([]);
                  setFileName("");
                }}
              >
                اختيار ملف آخر
              </Button>
            </div>

            {unmatched.length > 0 && (
              <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-2">
                <p className="text-xs font-semibold text-amber-700 mb-2">
                  ⚠️ {unmatched.length} موظف غير مطابق — عدّل الرقم الوظيفي للربط:
                </p>
                <div className="max-h-40 overflow-auto space-y-1">
                  {unmatched.map((r) => {
                    const idx = rows.indexOf(r);
                    return (
                      <div key={r.rowIdx} className="grid grid-cols-[80px_1fr_140px_100px] gap-2 items-center text-xs">
                        <span className="text-muted-foreground">صف {r.rowIdx}</span>
                        <span className="font-medium truncate">{r.name}</span>
                        <Input
                          value={r.manualEmpNo ?? r.empNo}
                          onChange={(e) => updateManualEmpNo(idx, e.target.value)}
                          placeholder="الرقم الوظيفي"
                          className="h-7 text-xs"
                        />
                        <span className="text-[11px] text-muted-foreground truncate">
                          {r.matchedEmployeeName || "لا يوجد"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-right">الرقم</th>
                    <th className="px-2 py-1.5 text-right">الاسم</th>
                    <th className="px-2 py-1.5 text-right">الموظف في النظام</th>
                    <th className="px-2 py-1.5 text-center">رصيد سابق</th>
                    <th className="px-2 py-1.5 text-center">مستخدم سنوي</th>
                    <th className="px-2 py-1.5 text-center">مستخدم مرضي</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rowIdx} className="border-t hover:bg-muted/30">
                      <td className="px-2 py-1.5 tabular-nums">{r.empNo}</td>
                      <td className="px-2 py-1.5">{r.name}</td>
                      <td className="px-2 py-1.5">
                        {r.matchedEmployeeId ? (
                          <span className="text-emerald-600">{r.matchedEmployeeName}</span>
                        ) : (
                          <span className="text-amber-600">— غير مطابق —</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{r.prevBalance}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{r.usedAnnual}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{r.usedSick}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {progress && (
            <span className="text-xs text-muted-foreground ml-auto">
              جارٍ الاستيراد: {progress.done} / {progress.total}
            </span>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            إلغاء
          </Button>
          <Button onClick={runImport} disabled={importing || matched.length === 0}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
            استيراد {matched.length} موظف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LeaveBalancesImportDialog;