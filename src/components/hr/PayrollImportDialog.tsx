import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Upload, Loader2, AlertCircle, CheckCircle2, FileSpreadsheet, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/* ---------- Helpers ---------- */

const normalizeName = (s: any): string =>
  String(s ?? "")
    .replace(/\s+/g, "")
    .replace(/ة/g, "ه")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .trim();

/** Excel branch text → DB branch name candidates (first match wins). */
const BRANCH_ALIASES: Record<string, string[]> = {
  "الطيرة": ["رام الله"],
  "طيرة":   ["رام الله"],
  "مركزي":  ["المركزي"],
  "المركزي": ["المركزي"],
  "سفيان":  ["سفيان"],
  "فيصل":   ["فيصل"],
};

const num = (v: any): number => {
  if (v == null || v === "" || v === "-") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Pull period_month / period_year from "عن شهر 05 2026" or "عن شهر 052026". */
function parsePeriod(s: any): { month: number; year: number } | null {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  const m = t.match(/(\d{1,2})\s*(\d{4})/) || t.match(/(\d{2})(\d{4})/);
  if (!m) return null;
  const month = Number(m[1]);
  const year = Number(m[2]);
  if (month < 1 || month > 12 || year < 2020 || year > 2100) return null;
  return { month, year };
}

/* ---------- Required column headers ---------- */
const COLS = {
  name: "اسم الموظف",
  empNo: "رقم الموظف",
  branch: "الفرع",
  period: "عن شهر",
  workingDays: "أيام العمل",
  workingHours: "ساعات العمل مع إضافي",
  overtime: "إضافي",
  annualLeave: "اجازات سنوية",
  sickLeave: "اجازات مرضية",
  attendanceSalary: "مبلغ ساعات الدوام",
  // Fixed salary components
  food: "علاوة اكل ومواصلات",
  annual: "علاوة سنوية",
  family: "علاوة الزوجة والابناء",
  others: "علاوات أخرى",
  fixedDeduction: "الخصم من الثابت",
  // Other earnings
  vacationAllowance: "بدل دوام اضافي واجازات",
  settlement: "مخالصة ومستحقات",
  // Deductions
  carryOver: "رصيد اول الشهر",
  loan: "القرض الحسن",
  cashAdvance: "مسحوبات سلف",
  foodTotal: "مجموع خصم الاكل",
  cashShortage: "عجز صندوق",
  surplus: "فائض",
  delivery: "توصيل",
  purchases: "مشتريات",
  other: "أخرى",
  violations: "مخالفات",
  net: "مجموع",
} as const;

/* ---------- Row builder ---------- */

type ParsedRow = {
  excelRow: number;
  excelName: string;
  excelEmpNo: string;
  excelBranch: string;
  period: { month: number; year: number } | null;
  // matched
  employee_id: string | null;
  matched_branch_id: string | null;
  matchedName: string;
  matchedBranchName: string;
  matchError: string | null;
  // amounts (computed)
  payload: Record<string, any>;
  selected: boolean;
};

/* "next month salary" header looks like "راتب من شهر 062026" — find by prefix. */
function findNextMonthKey(headers: string[]): string | undefined {
  return headers.find((h) => /^راتب من شهر/i.test(String(h).trim()));
}

/* "مجموع" column appears twice (إجمالي الاستحقاقات + الصافي). Take the LAST one as net. */
function findNetKey(headers: string[]): string | undefined {
  const indices = headers
    .map((h, i) => ({ h: String(h).trim(), i }))
    .filter((x) => x.h === "مجموع");
  return indices.length ? headers[indices[indices.length - 1].i] : undefined;
}

export default function PayrollImportDialog({ open, onClose, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const reset = () => {
    setStep("upload");
    setRows([]);
    setParseErrors([]);
    setSearch("");
    setDoneCount(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  /* ---------- Parse + match ---------- */

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const errs: string[] = [];
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null });
      if (!json.length) {
        toast.error("الملف فارغ");
        return;
      }

      // Validate critical headers
      const headers = Object.keys(json[0]);
      const missing = [COLS.name, COLS.branch, COLS.period].filter((c) => !headers.includes(c));
      if (missing.length) {
        toast.error(`أعمدة ناقصة بالملف: ${missing.join("، ")}`);
        return;
      }
      const nextMonthKey = findNextMonthKey(headers);
      const netKey = findNetKey(headers);

      // Load employees + branches once for matching
      const [empRes, brRes] = await Promise.all([
        supabase
          .from("employees")
          .select("id, full_name, branch_id, company_id, employee_number, is_active")
          .eq("is_active", true),
        supabase.from("branches").select("id, name"),
      ]);
      if (empRes.error) throw empRes.error;
      if (brRes.error) throw brRes.error;

      const branches = brRes.data || [];
      const branchByName = new Map<string, { id: string; name: string }>(
        branches.map((b) => [normalizeName(b.name), b]),
      );
      const employees = empRes.data || [];

      const parsed: ParsedRow[] = [];
      json.forEach((r, idx) => {
        const excelName = String(r[COLS.name] ?? "").trim();
        if (!excelName) return; // skip blank rows

        const excelBranch = String(r[COLS.branch] ?? "").trim();
        const period = parsePeriod(r[COLS.period]);
        const excelEmpNo = String(r[COLS.empNo] ?? "").trim();

        // Resolve branch
        const aliases = BRANCH_ALIASES[excelBranch] || [excelBranch];
        let matched_branch_id: string | null = null;
        let matchedBranchName = "";
        for (const candidate of aliases) {
          const hit = branchByName.get(normalizeName(candidate));
          if (hit) {
            matched_branch_id = hit.id;
            matchedBranchName = hit.name;
            break;
          }
        }

        // Resolve employee: name + (matched branch when possible)
        const nName = normalizeName(excelName);
        let cands = employees.filter((e) => normalizeName(e.full_name) === nName);
        if (cands.length > 1 && matched_branch_id) {
          const narrowed = cands.filter((e) => e.branch_id === matched_branch_id);
          if (narrowed.length) cands = narrowed;
        }
        const employee_id = cands.length === 1 ? cands[0].id : null;
        const matchedName = cands.length === 1 ? cands[0].full_name : "";

        let matchError: string | null = null;
        if (!period) matchError = "تعذّر قراءة الشهر/السنة من عمود \"عن شهر\"";
        else if (!matched_branch_id) matchError = `الفرع "${excelBranch}" غير معروف`;
        else if (cands.length === 0) matchError = "لا يوجد موظف بهذا الاسم في النظام";
        else if (cands.length > 1) matchError = `${cands.length} موظفين بنفس الاسم — لا يمكن التحديد تلقائياً`;

        // Compute amounts
        const food = num(r[COLS.food]);
        const annual = num(r[COLS.annual]);
        const family = num(r[COLS.family]);
        const others = num(r[COLS.others]);
        const fixedDed = num(r[COLS.fixedDeduction]);
        const baseSalary = food + annual + family + others - fixedDed;

        const attendanceSalary = num(r[COLS.attendanceSalary]);
        const vacationAllowance = num(r[COLS.vacationAllowance]);
        const settlement = num(r[COLS.settlement]);
        const nextMonth = nextMonthKey ? num(r[nextMonthKey]) : 0;

        const carryOver = num(r[COLS.carryOver]);
        const loan = num(r[COLS.loan]);
        const cashAdvance = num(r[COLS.cashAdvance]);
        const foodTotal = num(r[COLS.foodTotal]);
        const cashShortage = num(r[COLS.cashShortage]);
        const surplus = num(r[COLS.surplus]);
        const delivery = num(r[COLS.delivery]);
        const purchases = num(r[COLS.purchases]);
        const otherDed = num(r[COLS.other]);
        const violations = num(r[COLS.violations]);

        const totalDeductions =
          carryOver + loan + cashAdvance + foodTotal + cashShortage + surplus +
          delivery + purchases + otherDed + violations;

        const totalAllowances = vacationAllowance + settlement + nextMonth;
        const totalOvertime = 0; // overtime is already inside attendanceSalary in this sheet
        const entitlements = attendanceSalary + baseSalary + totalAllowances;
        const netFromExcel = netKey ? num(r[netKey]) : entitlements - totalDeductions;

        const payload: Record<string, any> = {
          period_month: period?.month,
          period_year: period?.year,
          branch_id: matched_branch_id,
          working_days: num(r[COLS.workingDays]),
          working_hours: num(r[COLS.workingHours]),
          overtime_hours_val: num(r[COLS.overtime]),
          annual_leave_days_taken: num(r[COLS.annualLeave]),
          sick_leave_days: num(r[COLS.sickLeave]),
          attendance_salary: attendanceSalary,
          // Fixed components
          food_transport_net: food,
          annual_allowance: annual,
          family_allowance: family,
          other_allowances_val: others,
          deduction_fixed_component: fixedDed,
          base_salary: baseSalary,
          // Other earnings
          vacation_work_allowance: vacationAllowance,
          settlement_amount: settlement,
          next_month_salary_advance: nextMonth,
          // Totals
          total_allowances: totalAllowances,
          total_overtime: totalOvertime,
          entitlements,
          // Deductions
          carry_over_balance: carryOver,
          deduction_loan: loan,
          deduction_cash_advance: cashAdvance,
          deduction_food_group: foodTotal,
          deduction_cash_shortage: cashShortage,
          surplus_amount: surplus,
          deduction_delivery: delivery,
          deduction_purchases: purchases,
          deduction_other: otherDed,
          deduction_violations: violations,
          total_deductions: totalDeductions,
          net_salary: netFromExcel,
          status: "submitted",
          is_paid: false,
          notes: `مُستورد من Excel — كشف رواتب يدوي`,
        };

        parsed.push({
          excelRow: idx + 2,
          excelName,
          excelEmpNo,
          excelBranch,
          period,
          employee_id,
          matched_branch_id,
          matchedName,
          matchedBranchName,
          matchError,
          payload,
          selected: !matchError, // pre-select only valid rows
        });
      });

      setRows(parsed);
      setParseErrors(errs);
      setStep("preview");
    } catch (err: any) {
      toast.error(`فشل قراءة الملف: ${err.message}`);
    }
  };

  /* ---------- Filtered preview ---------- */
  const filtered = useMemo(() => {
    const s = normalizeName(search);
    if (!s) return rows;
    return rows.filter(
      (r) => normalizeName(r.excelName).includes(s) || normalizeName(r.matchedName).includes(s),
    );
  }, [rows, search]);

  const selectedCount = rows.filter((r) => r.selected).length;
  const errorCount = rows.filter((r) => r.matchError).length;
  const validCount = rows.length - errorCount;

  const toggleRow = (i: number, v: boolean) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, selected: v } : r)));
  };
  const selectAllValid = () =>
    setRows((prev) => prev.map((r) => ({ ...r, selected: !r.matchError })));
  const selectNone = () => setRows((prev) => prev.map((r) => ({ ...r, selected: false })));
  const selectOnlyAbdullah = () =>
    setRows((prev) =>
      prev.map((r) => {
        const n = normalizeName(r.matchedName || r.excelName);
        const isHim = n.includes("عبدالله") && n.includes("صايم");
        return { ...r, selected: isHim && !r.matchError };
      }),
    );

  /* ---------- Import ---------- */

  const handleImport = async () => {
    const toImport = rows.filter((r) => r.selected && !r.matchError && r.employee_id && r.period);
    if (!toImport.length) {
      toast.error("لا يوجد صفوف صالحة محددة للاستيراد");
      return;
    }

    // Resolve user_id + company_id once
    const { data: au } = await supabase.auth.getUser();
    const userId = au.user?.id;
    if (!userId) {
      toast.error("الجلسة منتهية — يرجى تسجيل الدخول");
      return;
    }
    const { data: prof } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    const companyId = prof?.company_id;

    setImporting(true);
    setStep("importing");
    let ok = 0;
    let fail = 0;
    const errs: string[] = [];

    for (const r of toImport) {
      try {
        // Delete-and-recreate keyed by (employee_id, period_month, period_year)
        await supabase
          .from("employee_payroll")
          .delete()
          .eq("employee_id", r.employee_id!)
          .eq("period_month", r.period!.month)
          .eq("period_year", r.period!.year);

        const insertPayload = {
          ...r.payload,
          employee_id: r.employee_id,
          user_id: userId,
          company_id: companyId,
        };
        const { error } = await supabase.from("employee_payroll").insert(insertPayload as any);
        if (error) throw error;
        ok++;
        setDoneCount(ok);
      } catch (err: any) {
        fail++;
        errs.push(`${r.excelName}: ${err.message}`);
      }
    }

    setImporting(false);
    setStep("done");
    if (ok) toast.success(`تم استيراد ${ok} قسيمة بنجاح`);
    if (fail) toast.error(`فشل ${fail} صف. ${errs.slice(0, 3).join(" | ")}`);
    onSuccess();
  };

  /* ---------- Render ---------- */

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            استيراد قسائم رواتب من Excel
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="space-y-4 py-4">
            <div className="rounded-xl border-2 border-dashed border-border p-8 text-center space-y-3 bg-muted/20">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">ارفع كشف الرواتب الشهري</p>
                <p className="text-xs text-muted-foreground mt-1">
                  ملف Excel بنفس تنسيق الكشف اليدوي المعتمد
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFile}
                className="hidden"
              />
              <Button onClick={() => fileRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" /> اختر الملف
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg p-3 space-y-1">
              <p className="font-semibold">قواعد المطابقة:</p>
              <ul className="list-disc pr-5 space-y-0.5">
                <li>الموظف يُطابَق بالاسم + الفرع.</li>
                <li>فرع "الطيرة" يُربط تلقائياً بفرع "رام الله".</li>
                <li>إعادة الرفع لنفس الشهر يستبدل القسيمة القديمة (Upsert).</li>
              </ul>
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === "preview" && (
          <>
            <div className="flex items-center gap-2 flex-wrap pb-2 border-b border-border">
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3 ml-1" /> صالح: {validCount}
              </Badge>
              {errorCount > 0 && (
                <Badge variant="outline" className="bg-rose-500/10 text-rose-700 border-rose-500/30">
                  <AlertCircle className="h-3 w-3 ml-1" /> أخطاء: {errorCount}
                </Badge>
              )}
              <Badge variant="outline">محدد: {selectedCount}</Badge>
              <div className="flex-1" />
              <div className="relative">
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث بالاسم"
                  className="h-8 pr-7 text-xs w-44"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap py-2 text-xs">
              <Button size="sm" variant="outline" onClick={selectAllValid}>تحديد كل الصالحين</Button>
              <Button size="sm" variant="outline" onClick={selectNone}>إلغاء الكل</Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={selectOnlyAbdullah}
                className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 border border-amber-500/30"
              >
                وضع التجربة — عبد الله صايمة فقط
              </Button>
            </div>

            <div className="overflow-auto flex-1 border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-right">
                    <th className="p-2 w-10"></th>
                    <th className="p-2">الموظف (Excel)</th>
                    <th className="p-2">المطابقة بالنظام</th>
                    <th className="p-2">الفرع</th>
                    <th className="p-2 text-left">صافي</th>
                    <th className="p-2">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const i = rows.indexOf(r);
                    return (
                      <tr
                        key={i}
                        className={`border-t border-border ${
                          r.matchError ? "bg-rose-500/5" : r.selected ? "bg-emerald-500/5" : ""
                        }`}
                      >
                        <td className="p-2">
                          <Checkbox
                            checked={r.selected}
                            disabled={!!r.matchError}
                            onCheckedChange={(v) => toggleRow(i, !!v)}
                          />
                        </td>
                        <td className="p-2">
                          <div className="font-medium">{r.excelName}</div>
                          <div className="text-[10px] text-muted-foreground">صف {r.excelRow}</div>
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {r.matchedName || <span className="text-rose-600">—</span>}
                        </td>
                        <td className="p-2">
                          <div>{r.matchedBranchName || r.excelBranch}</div>
                          {r.excelBranch !== r.matchedBranchName && r.matchedBranchName && (
                            <div className="text-[10px] text-amber-700">من: {r.excelBranch}</div>
                          )}
                        </td>
                        <td className="p-2 text-left tabular-nums font-semibold">
                          {Number(r.payload.net_salary || 0).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="p-2">
                          {r.matchError ? (
                            <span className="text-rose-600 text-[11px]">{r.matchError}</span>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-[10px]">
                              جاهز
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Step 3: Importing */}
        {step === "importing" && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
            <p className="text-sm font-semibold">جاري الاستيراد… ({doneCount}/{selectedCount})</p>
            <p className="text-xs text-muted-foreground">لا تغلق النافذة حتى يكتمل</p>
          </div>
        )}

        {step === "done" && (
          <div className="py-12 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-600" />
            <p className="text-sm font-semibold">تم الاستيراد بنجاح</p>
            <p className="text-xs text-muted-foreground">{doneCount} قسيمة مرفوعة</p>
          </div>
        )}

        <DialogFooter>
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={reset}>إعادة اختيار ملف</Button>
              <Button onClick={handleImport} disabled={!selectedCount || importing} className="bg-primary">
                استيراد {selectedCount} قسيمة
              </Button>
            </>
          )}
          {(step === "done" || step === "upload") && (
            <Button variant="outline" onClick={onClose}>إغلاق</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}