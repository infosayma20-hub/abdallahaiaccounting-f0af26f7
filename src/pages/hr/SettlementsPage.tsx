import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";
import { differenceInCalendarDays, format, parseISO, startOfMonth } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, RefreshCw, CheckCircle2, AlertTriangle, FileText, Search, Wallet, Users as UsersIcon, ChevronsUpDown, Check, Save, ArrowRight, ChevronDown, Archive, ArchiveRestore } from "lucide-react";
import { calculateLeaveBalance } from "@/lib/hr-utils";
import { Printer, Award, Landmark } from "lucide-react";
import { openSettlementPrint, openExperienceCertificate } from "@/lib/hr/settlement-print";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";

// ────────────── Types ──────────────
type Employee = {
  id: string;
  full_name: string;
  department: string | null;
  branch_id: string | null;
  start_date: string | null;
  end_date: string | null;
  base_salary: number | null;
  is_active: boolean;
  is_terminated: boolean | null;
  annual_leave_balance: number | null;
  annual_leave_days: number | null;
  previous_year_balance: number | null;
  job_title?: string | null;
  id_number?: string | null;
  gender?: string | null;
  hourly_rate?: number | null;
};

type TerminationRow = {
  id: string;
  employee_id: string;
  termination_date: string;
  termination_reason: string;
  years_worked: number;
  severance_pay: number;
  unused_leave_pay: number;
  current_month_salary: number;
  advance_balance: number;
  other_deductions: number;
  income_tax: number;
  total_dues: number;
  is_paid: boolean;
  paid_date: string | null;
  notes: string | null;
  created_at: string;
  journal_voucher_id?: string | null;
  journal_posted_at?: string | null;
  payment_method?: string | null;
  bank_account_id?: string | null;
  cheque_number?: string | null;
};

const REASONS: { value: string; label: string }[] = [
  { value: "resignation", label: "استقالة" },
  { value: "termination", label: "فصل" },
  { value: "end_of_contract", label: "نهاية عقد" },
  { value: "probation_end", label: "نهاية فترة تجربة" },
  { value: "retirement", label: "تقاعد" },
  { value: "death", label: "وفاة" },
  { value: "mutual", label: "اتفاق طرفين" },
];

const fmtILS = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );

// ────────────── Palestinian labor-law helpers ──────────────
function computeServiceYears(hireIso: string, endIso: string): { years: number; months: number; totalDays: number } {
  const totalDays = Math.max(0, differenceInCalendarDays(parseISO(endIso), parseISO(hireIso)));
  const years = totalDays / 365.25;
  const months = totalDays / 30.4375;
  return { years: +years.toFixed(4), months: +months.toFixed(2), totalDays };
}

/** End-of-service gratuity per Palestinian labor law (approximation). */
function computeSeverance(opts: {
  reason: string;
  years: number;
  monthlySalary: number;
  totalDays: number;
}): { amount: number; note: string } {
  const { reason, years, monthlySalary, totalDays } = opts;
  if (totalDays < 90) return { amount: 0, note: "أقل من 3 شهور — لا مكافأة نهاية خدمة (فترة تجربة)" };
  const full = monthlySalary * years; // شهر عن كل سنة، متناسب للكسور
  if (reason === "resignation") {
    if (years < 1) return { amount: 0, note: "استقالة قبل إتمام سنة — لا مكافأة" };
    if (years < 5) return { amount: full / 3, note: "استقالة (1–5 سنوات): ⅓ المكافأة" };
    if (years < 10) return { amount: (full * 2) / 3, note: "استقالة (5–10 سنوات): ⅔ المكافأة" };
    return { amount: full, note: "استقالة (+10 سنوات): مكافأة كاملة" };
  }
  return { amount: full, note: "مكافأة كاملة (فصل / نهاية عقد / تقاعد / اتفاق)" };
}

/**
 * حساب ضريبة الدخل الفلسطينية على المخالصة (تقريب — الشرائح السنوية 2026).
 * الشرائح: 5% حتى 75,000 · 10% حتى 150,000 · 15% ما فوق.
 * الإعفاء الشخصي التقديري: 36,000 شيكل/سنة.
 */
function computePalestinianIncomeTax(taxableThisMonth: number): number {
  if (taxableThisMonth <= 0) return 0;
  const EXEMPT = 36000;
  const annual = taxableThisMonth * 12;
  const taxable = Math.max(0, annual - EXEMPT);
  let tax = 0;
  const b1 = Math.min(taxable, 75000);
  tax += b1 * 0.05;
  const b2 = Math.min(Math.max(taxable - 75000, 0), 75000);
  tax += b2 * 0.10;
  const b3 = Math.max(taxable - 150000, 0);
  tax += b3 * 0.15;
  return +(tax / 12).toFixed(2);
}

// ────────────── List Page ──────────────
export default function SettlementsPage() {
  const { dataOwnerId } = useDataOwnerId();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editId, setEditId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["termination-records", dataOwnerId, showArchived],
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const base: any = supabase
        .from("termination_records")
        .select("*")
        .eq("user_id", dataOwnerId!);
      const filtered = showArchived
        ? base.eq("is_deleted", true)
        : base.or("is_deleted.is.null,is_deleted.eq.false");
      const { data, error } = await filtered.order("termination_date", { ascending: false });
      if (error) throw error;
      return (data || []) as TerminationRow[];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr-settlement-employees", dataOwnerId],
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select(
          "id,full_name,department,branch_id,start_date,end_date,base_salary,is_active,is_terminated,annual_leave_balance,annual_leave_days,previous_year_balance,job_title,id_number,gender,hourly_rate",
        )
        .eq("user_id", dataOwnerId!);
      if (error) throw error;
      return (data || []) as Employee[];
    },
  });

  // Company header info for printouts
  const { data: company } = useQuery({
    queryKey: ["settlement-company", dataOwnerId],
    enabled: !!dataOwnerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("name, address, phone, tax_number")
        .eq("owner_id", dataOwnerId!)
        .maybeSingle();
      const { data: cs } = await supabase
        .from("company_settings")
        .select("logo_url")
        .eq("user_id", dataOwnerId!)
        .maybeSingle();
      return {
        name: data?.name ?? null,
        address: data?.address ?? null,
        phone: data?.phone ?? null,
        tax_number: data?.tax_number ?? null,
        logo_url: (cs as any)?.logo_url ?? null,
      };
    },
  });

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const emp = empById.get(r.employee_id);
      return (
        (emp?.full_name || "").toLowerCase().includes(q) ||
        (r.termination_reason || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, empById]);

  const totals = useMemo(
    () => ({
      count: rows.length,
      paid: rows.filter((r) => r.is_paid).length,
      pending: rows.filter((r) => !r.is_paid).length,
      sumNet: rows.reduce((s, r) => s + Number(r.total_dues || 0), 0),
      sumPending: rows.filter((r) => !r.is_paid).reduce((s, r) => s + Number(r.total_dues || 0), 0),
    }),
    [rows],
  );

  const actionTabs: ActionTab[] = useMemo(() => ([{
    key: "general",
    label: "عام",
    groups: [
      { key: "new", label: "جديد", items: [
        { key: "new", label: "مخالصة جديدة", icon: Plus, variant: "primary",
          shortcut: "Alt+N", onClick: () => { setEditId(null); setMode("form"); } },
      ]},
      { key: "actions", label: "إجراءات", items: [
        { key: "refresh", label: "تحديث", icon: RefreshCw, shortcut: "F5", onClick: () => refetch() },
        { key: "toggle-archived", label: showArchived ? "عرض النشطة" : "عرض المؤرشفة",
          icon: showArchived ? ArchiveRestore : Archive,
          onClick: () => setShowArchived((v) => !v) },
      ]},
      { key: "print", label: "طباعة", items: [
        { key: "print", label: "طباعة الصفحة", icon: Printer, onClick: () => window.print() },
      ]},
    ],
  }]), [refetch, showArchived]);

  if (mode === "form") {
    return (
      <SettlementFormPage
        employees={employees.filter((e) => e.is_active || !!e.end_date)}
        existingId={editId}
        existingRow={editId ? rows.find((r) => r.id === editId) || null : null}
        dataOwnerId={dataOwnerId!}
        company={company || {}}
        onBack={() => setMode("list")}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["termination-records"] });
          setMode("list");
        }}
      />
    );
  }

  return (
    <div dir="rtl" className="-mx-5 lg:-mx-8 -my-5 lg:-my-8 h-[calc(100dvh-56px)]">
    <FinanceShell
      title="المخالصات ونهاية الخدمة"
      subtitle="حساب المستحقات القانونية للموظفين المنتهية خدماتهم وفق قانون العمل الفلسطيني"
      breadcrumb={[
        { label: "الموارد البشرية", href: "/hr" },
        { label: "المخالصات" },
      ]}
      actionTabs={actionTabs}
      compact
      rightSlot={
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <UsersIcon className="h-3.5 w-3.5" />
          <span>{rows.length} سجل</span>
        </div>
      }
    >
      <div className="space-y-3" dir="rtl">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="p-3"><div className="text-[11px] text-muted-foreground">إجمالي المخالصات</div><div className="text-lg font-bold mt-1">{totals.count}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted-foreground">مدفوعة</div><div className="text-lg font-bold mt-1 text-emerald-600">{totals.paid}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted-foreground">قيد الدفع</div><div className="text-lg font-bold mt-1 text-amber-600">{totals.pending}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted-foreground">صافي المستحقات المعلّقة</div><div className="text-sm font-bold mt-1 text-primary">{fmtILS(totals.sumPending)}</div></Card>
      </div>

      <Card className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input dir="rtl" className="pr-8 h-9" placeholder="بحث بالاسم أو السبب…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="overflow-auto rounded-md border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-right px-3 py-2 font-medium">الموظف</th>
                <th className="text-right px-3 py-2 font-medium">تاريخ الترك</th>
                <th className="text-right px-3 py-2 font-medium">السبب</th>
                <th className="text-right px-3 py-2 font-medium">مدة الخدمة</th>
                <th className="text-right px-3 py-2 font-medium">مكافأة</th>
                <th className="text-right px-3 py-2 font-medium">إجازات</th>
                <th className="text-right px-3 py-2 font-medium">شهر أخير</th>
                <th className="text-right px-3 py-2 font-medium">ض. دخل</th>
                <th className="text-right px-3 py-2 font-medium">خصومات</th>
                <th className="text-right px-3 py-2 font-medium">الصافي</th>
                <th className="text-right px-3 py-2 font-medium">الحالة</th>
                <th className="text-right px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={12} className="text-center py-8 text-muted-foreground">جاري التحميل…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-8 text-muted-foreground">لا توجد مخالصات مسجلة</td></tr>
              ) : filtered.map((r) => {
                const emp = empById.get(r.employee_id);
                const reasonLabel = REASONS.find((x) => x.value === r.termination_reason)?.label || r.termination_reason;
                const deductions = Number(r.advance_balance || 0) + Number(r.other_deductions || 0);
                return (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{emp?.full_name || "—"}</td>
                    <td className="px-3 py-2">{format(parseISO(r.termination_date), "yyyy-MM-dd")}</td>
                    <td className="px-3 py-2">{reasonLabel}</td>
                    <td className="px-3 py-2">{Number(r.years_worked).toFixed(2)} سنة</td>
                    <td className="px-3 py-2">{fmtILS(Number(r.severance_pay))}</td>
                    <td className="px-3 py-2">{fmtILS(Number(r.unused_leave_pay))}</td>
                    <td className="px-3 py-2">{fmtILS(Number(r.current_month_salary))}</td>
                    <td className="px-3 py-2 text-rose-600">{Number(r.income_tax || 0) > 0 ? `− ${fmtILS(Number(r.income_tax))}` : "—"}</td>
                    <td className="px-3 py-2 text-rose-600">− {fmtILS(deductions)}</td>
                    <td className="px-3 py-2 font-bold text-primary">{fmtILS(Number(r.total_dues))}</td>
                    <td className="px-3 py-2">
                      {r.is_paid ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3 ml-1" /> مدفوعة</Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 text-amber-700">قيد الدفع</Badge>
                      )}
                      {r.journal_voucher_id && (
                        <Badge variant="outline" className="border-blue-300 text-blue-700 ml-1"><Landmark className="h-3 w-3 ml-1" /> مُرحّل</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" title="تعديل" onClick={() => { setEditId(r.id); setMode("form"); }}>
                          <FileText className="h-4 w-4" />
                        </Button>
                        {!r.journal_voucher_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="ترحيل قيد محاسبي"
                            onClick={async () => {
                              const method = window.prompt("طريقة الدفع: cash / bank / cheque", "cash");
                              if (!method || !["cash","bank","cheque"].includes(method)) return;
                              try {
                                const { error } = await supabase.rpc("post_settlement_journal", {
                                  _termination_id: r.id,
                                  _payment_method: method,
                                  _payment_date: format(new Date(), "yyyy-MM-dd"),
                                });
                                if (error) throw error;
                                toast.success("تم ترحيل القيد المحاسبي وإصدار سند الصرف");
                                qc.invalidateQueries({ queryKey: ["termination-records"] });
                              } catch (e: any) {
                                toast.error(e?.message || "فشل الترحيل");
                              }
                            }}
                          >
                            <Landmark className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          title="طباعة المخالصة"
                          onClick={() => {
                            if (!emp) return;
                            // Recompute مدة الخدمة من تاريخ التعيين الفعلي (بدل الاعتماد على قيمة مخزنة قديمة)
                            const hireIso = emp.start_date || "";
                            const yearsFresh = hireIso
                              ? computeServiceYears(hireIso, r.termination_date).years
                              : Number(r.years_worked);
                            // راتب الشهر الأخير: إذا وضع الساعات مستخدم يكون المخزن = 0،
                            // فنعوّض بجمع أجور الساعات (عادية + إضافي عادي + إضافي عيد).
                            const hoursPay =
                              Number((r as any).regular_hours_pay || 0) +
                              Number((r as any).overtime_normal_pay || 0) +
                              Number((r as any).overtime_holiday_pay || 0);
                            const lastMonthPay = Number(r.current_month_salary) > 0
                              ? Number(r.current_month_salary)
                              : hoursPay;
                            openSettlementPrint({
                              company: company || {},
                              employee: {
                                full_name: emp.full_name,
                                department: emp.department,
                                job_title: emp.job_title || null,
                                start_date: emp.start_date,
                                national_id: emp.id_number || null,
                              },
                              data: {
                                id: r.id,
                                termination_date: r.termination_date,
                                termination_reason_label: reasonLabel,
                                years_worked: yearsFresh,
                                severance_pay: Number(r.severance_pay),
                                unused_leave_pay: Number(r.unused_leave_pay),
                                current_month_salary: lastMonthPay,
                                advance_balance: Number(r.advance_balance),
                                other_deductions: Number(r.other_deductions),
                                total_dues: Number(r.total_dues),
                                is_paid: r.is_paid,
                                paid_date: r.paid_date,
                                notes: r.notes,
                              },
                            });
                          }}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="شهادة خبرة"
                          onClick={() => {
                            if (!emp) return;
                            openExperienceCertificate({
                              company: company || {},
                              employee: {
                                full_name: emp.full_name,
                                department: emp.department,
                                job_title: emp.job_title || null,
                                start_date: emp.start_date,
                              },
                              endDate: r.termination_date,
                              gender: (emp.gender === "female" ? "female" : "male"),
                            });
                          }}
                        >
                          <Award className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={(r as any).is_deleted ? "استعادة من الأرشيف" : "أرشفة (حذف ناعم)"}
                          className={(r as any).is_deleted ? "text-emerald-600" : "text-rose-600"}
                          onClick={async () => {
                            const archiving = !(r as any).is_deleted;
                            if (archiving && !window.confirm("سيتم أرشفة المخالصة وإخفاؤها من القائمة. المتابعة؟")) return;
                            try {
                              const { data: u } = await supabase.auth.getUser();
                              const { error } = await supabase
                                .from("termination_records")
                                .update({
                                  is_deleted: archiving,
                                  deleted_at: archiving ? new Date().toISOString() : null,
                                  deleted_by: archiving ? (u.user?.id ?? null) : null,
                                } as any)
                                .eq("id", r.id);
                              if (error) throw error;
                              toast.success(archiving ? "تمت الأرشفة" : "تمت الاستعادة");
                              qc.invalidateQueries({ queryKey: ["termination-records"] });
                            } catch (e: any) {
                              toast.error(e?.message || "تعذّر التنفيذ");
                            }
                          }}
                        >
                          {(r as any).is_deleted
                            ? <ArchiveRestore className="h-4 w-4" />
                            : <Archive className="h-4 w-4" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      </div>
    </FinanceShell>
    </div>
  );
}

// ────────────── Full-page Form ──────────────
function SettlementFormPage(props: {
  employees: Employee[];
  existingId: string | null;
  existingRow: TerminationRow | null;
  onSaved: () => void;
  onBack: () => void;
  dataOwnerId: string;
  company: any;
}) {
  const { employees, existingRow, onSaved, onBack, dataOwnerId } = props;
  const [empPickerOpen, setEmpPickerOpen] = useState(false);

  const [employeeId, setEmployeeId] = useState<string>(existingRow?.employee_id || "");
  const [terminationDate, setTerminationDate] = useState<string>(existingRow?.termination_date || format(new Date(), "yyyy-MM-dd"));
  const [reason, setReason] = useState<string>(existingRow?.termination_reason || "resignation");
  const [notes, setNotes] = useState<string>(existingRow?.notes || "");
  const [isPaid, setIsPaid] = useState<boolean>(existingRow?.is_paid || false);
  const [paidDate, setPaidDate] = useState<string>(existingRow?.paid_date || "");

  // Editable amounts (auto-computed but overridable)
  const [salary, setSalary] = useState<number>(0);
  const [severance, setSeverance] = useState<number>(existingRow?.severance_pay || 0);
  const [unusedLeavePay, setUnusedLeavePay] = useState<number>(existingRow?.unused_leave_pay || 0);
  const [currentMonthSalary, setCurrentMonthSalary] = useState<number>(existingRow?.current_month_salary || 0);
  const [noticePay, setNoticePay] = useState<number>(0);
  const [advanceBalance, setAdvanceBalance] = useState<number>(existingRow?.advance_balance || 0);
  const [otherDeductions, setOtherDeductions] = useState<number>(existingRow?.other_deductions || 0);
  const [incomeTax, setIncomeTax] = useState<number>(existingRow?.income_tax || 0);
  const [severanceNote, setSeveranceNote] = useState<string>("");
  const [autoRecalc, setAutoRecalc] = useState<boolean>(!existingRow);
  const [saving, setSaving] = useState(false);

  // Hours-based settlement (Malaky: 9.6 ₪/hr default, Riham: 11)
  const [useHoursMode, setUseHoursMode] = useState<boolean>(false);
  const [hoursFromDate, setHoursFromDate] = useState<string>("");
  const [hoursData, setHoursData] = useState<any>(null);
  const [regularHoursPay, setRegularHoursPay] = useState<number>(0);
  const [otNormalPay, setOtNormalPay] = useState<number>(0);
  const [otHolidayPay, setOtHolidayPay] = useState<number>(0);

  // Meals & audit items from POS/deductions
  const [mealsDeduction, setMealsDeduction] = useState<number>(0);
  const [excludedAuditIds, setExcludedAuditIds] = useState<Set<string>>(new Set());

  // Editable hire date (synced back to employees table on save)
  const [hireDate, setHireDate] = useState<string>("");
  const [includeLeavePay, setIncludeLeavePay] = useState<boolean>(true);

  // Unpaid salary period (e.g. months 5 & 6 already paid → user picks only 7)
  const [unpaidFrom, setUnpaidFrom] = useState<string>("");
  const [unpaidTo, setUnpaidTo] = useState<string>("");

  // Collapsible sections to reduce visual noise
  const [showHours, setShowHours] = useState<boolean>(false);
  const [showAudit, setShowAudit] = useState<boolean>(false);

  const emp = useMemo(() => employees.find((e) => e.id === employeeId) || null, [employees, employeeId]);

  // Default hours-from-date = employee start date; also hydrate editable hire date
  useEffect(() => {
    if (emp?.start_date && !hoursFromDate) setHoursFromDate(emp.start_date);
    if (emp) setHireDate(emp.start_date || "");
    if (emp && (emp.hourly_rate || 0) > 0) { setUseHoursMode(true); setShowHours(true); }
  }, [emp]);

  // Fetch outstanding balances (advances + remaining loan installments) when employee changes
  const { data: financials } = useQuery({
    queryKey: ["settlement-financials", employeeId, dataOwnerId],
    enabled: !!employeeId && !!dataOwnerId,
    queryFn: async () => {
      const [advQ, loanQ, empPolQ, posQ, dedQ] = await Promise.all([
        supabase
          .from("employee_advances")
          .select("id,amount,status,advance_date,reason")
          .eq("user_id", dataOwnerId)
          .eq("employee_id", employeeId)
          .in("status", ["approved", "active", "pending"]),
        supabase
          .from("loan_installments")
          .select("id,installment_amount,status,due_date")
          .eq("user_id", dataOwnerId)
          .eq("employee_id", employeeId)
          .neq("status", "paid"),
        supabase
          .from("employee_leaves")
          .select("days_count,leave_type,status")
          .eq("user_id", dataOwnerId)
          .eq("employee_id", employeeId)
          .eq("status", "approved"),
        supabase
          .from("pos_expenses")
          .select("id,amount,description,expense_kind,created_at")
          .eq("employee_id", employeeId),
        supabase
          .from("employee_deductions")
          .select("id,amount,deduction_type,description,deduction_date,status")
          .eq("employee_id", employeeId),
      ]);
      const advances = (advQ.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const loans = (loanQ.data || []).reduce((s: number, r: any) => s + Number(r.installment_amount || 0), 0);
      const usedAnnual = (empPolQ.data || [])
        .filter((r: any) => r.leave_type === "annual")
        .reduce((s: number, r: any) => s + Number(r.days_count || 0), 0);
      return {
        advances,
        loans,
        usedAnnual,
        advancesList: advQ.data || [],
        loansList: loanQ.data || [],
        posList: posQ.data || [],
        deductionsList: dedQ.data || [],
      };
    },
  });

  // Fetch hours breakdown from RPC when period is set
  useEffect(() => {
    if (!employeeId || !hoursFromDate || !terminationDate) { setHoursData(null); return; }
    (async () => {
      const { data, error } = await supabase.rpc("calculate_settlement_hours", {
        p_employee_id: employeeId,
        p_from: hoursFromDate,
        p_to: terminationDate,
      });
      if (error) { console.warn("calculate_settlement_hours", error); return; }
      setHoursData(data);
      if (useHoursMode && autoRecalc) {
        setRegularHoursPay(Number((data as any)?.regular_pay || 0));
        setOtNormalPay(Number((data as any)?.overtime_normal_pay || 0));
        setOtHolidayPay(Number((data as any)?.overtime_holiday_pay || 0));
      }
    })();
  }, [employeeId, hoursFromDate, terminationDate, useHoursMode, autoRecalc]);

  // Auto-fill meals deduction = sum of non-excluded POS charges
  useEffect(() => {
    if (!financials?.posList) return;
    const total = (financials.posList as any[])
      .filter((r) => !excludedAuditIds.has(`pos:${r.id}`))
      .reduce((s, r) => s + Number(r.amount || 0), 0);
    setMealsDeduction(+total.toFixed(2));
  }, [financials?.posList, excludedAuditIds]);

  // Auto-recalculate whenever inputs change (only until user disables auto)
  useEffect(() => {
    if (!autoRecalc || !emp) return;
    const monthly = Number(emp.base_salary || 0);
    setSalary(monthly);
    const hire = hireDate || emp.start_date;
    if (!hire) {
      setSeverance(0);
      setSeveranceNote("لا يوجد تاريخ تعيين — لا يمكن حساب المكافأة");
    } else {
      const svc = computeServiceYears(hire, terminationDate);
      const sev = computeSeverance({ reason, years: svc.years, monthlySalary: monthly, totalDays: svc.totalDays });
      setSeverance(+sev.amount.toFixed(2));
      setSeveranceNote(sev.note);
    }
    // Unpaid salary period — user chooses which portion is still owed
    // (default: from first day of termination month → termination date).
    const term = parseISO(terminationDate);
    const defaultFrom = format(startOfMonth(term), "yyyy-MM-dd");
    const from = unpaidFrom || defaultFrom;
    const to = unpaidTo || terminationDate;
    if (!unpaidFrom) setUnpaidFrom(defaultFrom);
    if (!unpaidTo) setUnpaidTo(terminationDate);
    const unpaidDays = Math.max(0, differenceInCalendarDays(parseISO(to), parseISO(from)) + 1);
    setCurrentMonthSalary(+((monthly * unpaidDays) / 30).toFixed(2));
    // Unused leave pay: balance × daily wage (26 working days convention).
    // Reference date = termination date (not "today"), and probation (90 days)
    // is honored per Palestinian Labor Law — no accrual before probation ends.
    const carriedOver = Number(emp.previous_year_balance || 0);
    const used = Number(financials?.usedAnnual || 0);
    const bal = calculateLeaveBalance(hire || "", carriedOver, used, {
      asOf: terminationDate,
      honorProbation: true,
    });
    const dailyWage = monthly / 26;
    const leavePay = includeLeavePay
      ? +(Math.max(0, Number(bal.available || 0)) * dailyWage).toFixed(2)
      : 0;
    setUnusedLeavePay(leavePay);
    setAdvanceBalance(+Number(financials?.advances || 0).toFixed(2) + +Number(financials?.loans || 0).toFixed(2));
    // ضريبة الدخل: تُحتسب على (راتب الشهر الأخير + بدل الإجازات) — المكافأة معفاة عادةً
    const taxable = +((monthly * unpaidDays) / 30).toFixed(2) + leavePay;
    setIncomeTax(computePalestinianIncomeTax(taxable));
  }, [autoRecalc, emp, terminationDate, reason, financials, hireDate, includeLeavePay, unpaidFrom, unpaidTo]);

  const totalDues = useMemo(() => {
    const monthlyPart = useHoursMode ? 0 : currentMonthSalary;
    const gross = severance + unusedLeavePay + monthlyPart + noticePay
      + regularHoursPay + otNormalPay + otHolidayPay;
    const deductions = advanceBalance + otherDeductions + incomeTax + mealsDeduction;
    return +(gross - deductions).toFixed(2);
  }, [severance, unusedLeavePay, currentMonthSalary, noticePay, advanceBalance,
      otherDeductions, incomeTax, useHoursMode, regularHoursPay, otNormalPay,
      otHolidayPay, mealsDeduction]);

  const service = useMemo(() => {
    const hire = hireDate || emp?.start_date;
    if (!hire) return null;
    return computeServiceYears(hire, terminationDate);
  }, [emp, terminationDate, hireDate]);

  const probationWarning = service && service.totalDays < 90;

  const save = async () => {
    if (!employeeId) { toast.error("يجب اختيار الموظف"); return; }
    if (!terminationDate) { toast.error("يجب تحديد تاريخ الترك"); return; }
    setSaving(true);
    try {
      // Sync hire date back to the employee record so every other screen
      // (attendance, payroll, leaves, profile) sees the corrected value.
      if (emp && hireDate && hireDate !== emp.start_date) {
        const { error: hireErr } = await supabase
          .from("employees")
          .update({ start_date: hireDate })
          .eq("id", emp.id)
          .eq("user_id", dataOwnerId);
        if (hireErr) throw hireErr;
      }
      const payload = {
        user_id: dataOwnerId,
        employee_id: employeeId,
        termination_date: terminationDate,
        termination_reason: reason,
        years_worked: Number(service?.years || 0),
        severance_pay: severance,
        unused_leave_pay: unusedLeavePay,
        current_month_salary: (useHoursMode ? 0 : currentMonthSalary) + noticePay,
        advance_balance: advanceBalance,
        other_deductions: otherDeductions,
        income_tax: incomeTax,
        total_dues: totalDues,
        is_paid: isPaid,
        paid_date: isPaid ? (paidDate || format(new Date(), "yyyy-MM-dd")) : null,
        notes: notes || null,
        hourly_rate_used: emp?.hourly_rate ?? null,
        regular_hours: Number(hoursData?.regular_hours || 0),
        overtime_normal_hours: Number(hoursData?.overtime_normal_hours || 0),
        overtime_holiday_hours: Number(hoursData?.overtime_holiday_hours || 0),
        regular_hours_pay: regularHoursPay,
        overtime_normal_pay: otNormalPay,
        overtime_holiday_pay: otHolidayPay,
        hours_breakdown: hoursData || null,
        meals_deduction: mealsDeduction,
        audit_items: {
          excluded: Array.from(excludedAuditIds),
          advances: financials?.advancesList || [],
          loans: financials?.loansList || [],
          pos: financials?.posList || [],
          deductions: financials?.deductionsList || [],
        },
      };
      let error;
      if (props.existingId) {
        ({ error } = await supabase.from("termination_records").update(payload).eq("id", props.existingId));
      } else {
        ({ error } = await supabase.from("termination_records").insert(payload));
      }
      if (error) throw error;
      // When marked as paid, also flag the employee as terminated
      if (isPaid && emp) {
        await supabase
          .from("employees")
          .update({ is_terminated: true, is_active: false, end_date: terminationDate })
          .eq("id", emp.id)
          .eq("user_id", dataOwnerId);
      }
      toast.success(props.existingId ? "تم تحديث المخالصة" : "تم حفظ المخالصة");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const formActionTabs: ActionTab[] = [{
    key: "general", label: "عام",
    groups: [
      { key: "save", label: "حفظ", items: [
        { key: "save", label: saving ? "جاري الحفظ…" : "حفظ المخالصة", icon: Save, variant: "primary",
          shortcut: "Ctrl+S", disabled: saving || !employeeId, onClick: () => save() },
      ]},
      { key: "nav", label: "التنقل", items: [
        { key: "back", label: "رجوع للقائمة", icon: ArrowRight, onClick: onBack },
      ]},
    ],
  }];

  return (
    <div dir="rtl" className="-mx-5 lg:-mx-8 -my-5 lg:-my-8 h-[calc(100dvh-56px)]">
    <FinanceShell
      title={props.existingId ? "تعديل مخالصة" : "مخالصة جديدة"}
      subtitle="حساب المستحقات القانونية للموظف وفق قانون العمل الفلسطيني"
      breadcrumb={[
        { label: "الموارد البشرية", href: "/hr" },
        { label: "المخالصات", href: "/hr/settlements" },
        { label: props.existingId ? "تعديل" : "جديدة" },
      ]}
      actionTabs={formActionTabs}
      compact
    >
      <div className="max-w-4xl mx-auto pb-20 space-y-4" dir="rtl">

        {/* ── 1. Header card: employee, reason, dates, service ── */}
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">الموظف *</Label>
              <Popover open={empPickerOpen} onOpenChange={setEmpPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    disabled={!!props.existingId}
                    className="h-10 w-full justify-between font-normal"
                  >
                    <span className={emp ? "font-medium" : "text-muted-foreground"}>
                      {emp?.full_name || "اختر الموظف…"}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent dir="rtl" className="p-0 w-[340px]" align="start">
                  <Command>
                    <CommandInput placeholder="ابحث بالاسم أو المسمى…" />
                    <CommandList>
                      <CommandEmpty>لا نتائج</CommandEmpty>
                      <CommandGroup>
                        {employees.map((e) => (
                          <CommandItem
                            key={e.id}
                            value={`${e.full_name} ${e.job_title || ""} ${e.department || ""}`}
                            onSelect={() => { setEmployeeId(e.id); setEmpPickerOpen(false); }}
                          >
                            <Check className={`ml-2 h-4 w-4 ${employeeId === e.id ? "opacity-100" : "opacity-0"}`} />
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{e.full_name}</span>
                              <span className="text-[11px] text-muted-foreground">{e.job_title || e.department || "—"}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs mb-1 block">سبب الترك</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dates + service duration — the most important block */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t">
            <div>
              <Label className="text-xs mb-1 block">تاريخ التعيين</Label>
              <Input
                type="date"
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
                className="h-10 font-medium"
              />
              {hireDate && emp?.start_date && hireDate !== emp.start_date && (
                <div className="text-[10px] text-amber-700 mt-1">سيتم تحديثه في ملف الموظف عند الحفظ.</div>
              )}
            </div>
            <div>
              <Label className="text-xs mb-1 block">تاريخ انتهاء الخدمة *</Label>
              <Input
                type="date"
                value={terminationDate}
                onChange={(e) => setTerminationDate(e.target.value)}
                className="h-10 font-medium"
              />
            </div>
            <div className="flex flex-col justify-end">
              <Label className="text-xs mb-1 block text-muted-foreground">مدة الخدمة</Label>
              <div className="h-10 flex items-center px-3 rounded-md bg-primary/5 border border-primary/20">
                <span className="text-sm font-bold text-primary">
                  {service ? `${service.years.toFixed(2)} سنة · ${Math.floor(service.months)} شهر` : "—"}
                </span>
              </div>
            </div>
          </div>

          {probationWarning && (
            <div className="flex items-center gap-2 text-amber-800 text-xs bg-amber-50 border border-amber-200 rounded p-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              الموظف ضمن فترة التجربة (أقل من 3 شهور) — لا يستحق مكافأة نهاية خدمة.
            </div>
          )}

          {emp && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground pt-2 border-t">
              <span>الراتب الشهري: <b className="text-foreground">{fmtILS(Number(emp.base_salary || 0))}</b></span>
              <span>القسم: <b className="text-foreground">{emp.department || "—"}</b></span>
              {emp.hourly_rate ? <span>سعر الساعة: <b className="text-foreground">{fmtILS(Number(emp.hourly_rate))}</b></span> : null}
            </div>
          )}
        </Card>

        {/* ── 2. Dues card ── */}
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">المستحقات</h3>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={autoRecalc} onChange={(e) => setAutoRecalc(e.target.checked)} />
              إعادة حساب تلقائي
            </label>
          </div>

          {/* Unpaid salary period — replaces "current month" */}
          {!useHoursMode && (
            <div className="p-3 rounded-md bg-muted/30 border">
              <div className="text-xs font-medium mb-2">الراتب المستحق (الفترة غير المدفوعة)</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 items-end">
                <div>
                  <Label className="text-[11px]">من تاريخ</Label>
                  <Input type="date" value={unpaidFrom} onChange={(e) => setUnpaidFrom(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-[11px]">إلى تاريخ</Label>
                  <Input type="date" value={unpaidTo} onChange={(e) => setUnpaidTo(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-[11px]">القيمة</Label>
                  <Input
                    type="number" step="0.01" inputMode="decimal"
                    value={Number.isFinite(currentMonthSalary) ? currentMonthSalary : 0}
                    onChange={(e) => { setAutoRecalc(false); setCurrentMonthSalary(Number(e.target.value) || 0); }}
                    className="h-9 text-sm font-medium"
                  />
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground mt-2">
                حدّد الفترة التي لم يستلم عنها الموظف راتباً بعد. مثلاً: إذا استلم شهر 5 و 6، ضع "من" = 07/01 و "إلى" = تاريخ الترك.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <NumField label="مكافأة نهاية الخدمة" value={severance} onChange={(v) => { setAutoRecalc(false); setSeverance(v); }} />
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">بدل الإجازات غير المستنفدة</Label>
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={includeLeavePay}
                    onChange={(e) => { setIncludeLeavePay(e.target.checked); if (!e.target.checked) setUnusedLeavePay(0); }} />
                  احتسب البدل
                </label>
              </div>
              <Input type="number" step="0.01" inputMode="decimal" disabled={!includeLeavePay}
                value={Number.isFinite(unusedLeavePay) ? unusedLeavePay : 0}
                onChange={(e) => { setAutoRecalc(false); setUnusedLeavePay(Number(e.target.value) || 0); }}
                className="h-9 text-sm" />
            </div>
            <NumField label="بدل إشعار (اختياري)" value={noticePay} onChange={setNoticePay} />
          </div>

          {/* Hours mode — collapsible */}
          <div className="border-t pt-3">
            <button type="button" onClick={() => setShowHours((s) => !s)}
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showHours ? "" : "-rotate-90"}`} />
              أجر الساعات {useHoursMode ? "(مفعّل)" : "(اختياري)"}
            </button>
            {showHours && (
              <div className="mt-3 space-y-3">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={useHoursMode} onChange={(e) => setUseHoursMode(e.target.checked)} />
                  احتساب على أساس الساعات (بدل الراتب الشهري) — سعر الساعة: {fmtILS(Number(emp?.hourly_rate || 9.6))}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-[11px]">من تاريخ</Label>
                    <Input type="date" value={hoursFromDate} onChange={(e) => setHoursFromDate(e.target.value)} className="h-9 text-sm" /></div>
                  <div><Label className="text-[11px]">إلى تاريخ</Label>
                    <Input type="date" value={terminationDate} disabled className="h-9 text-sm" /></div>
                </div>
                {hoursData && (
                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-3">
                    <span>عادية: <b>{Number(hoursData.regular_hours || 0).toFixed(2)}</b></span>
                    <span>150%: <b>{Number(hoursData.overtime_normal_hours || 0).toFixed(2)}</b></span>
                    <span>250%: <b>{Number(hoursData.overtime_holiday_hours || 0).toFixed(2)}</b></span>
                    <span className="text-emerald-700">الإجمالي: <b>{fmtILS(Number(hoursData.total_hours_pay || 0))}</b></span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <NumField label="عادية" value={regularHoursPay} onChange={(v) => { setAutoRecalc(false); setRegularHoursPay(v); }} />
                  <NumField label="150%" value={otNormalPay} onChange={(v) => { setAutoRecalc(false); setOtNormalPay(v); }} />
                  <NumField label="250%" value={otHolidayPay} onChange={(v) => { setAutoRecalc(false); setOtHolidayPay(v); }} />
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ── 3. Deductions card ── */}
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-bold">الخصومات</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <NumField label="سلف وقروض قائمة" value={advanceBalance} onChange={(v) => { setAutoRecalc(false); setAdvanceBalance(v); }} />
            <NumField label="ضريبة الدخل" value={incomeTax} onChange={(v) => { setAutoRecalc(false); setIncomeTax(v); }} />
            <NumField label="خصم الأكل (نقطة البيع)" value={mealsDeduction} onChange={setMealsDeduction} />
            <NumField label="خصومات أخرى" value={otherDeductions} onChange={setOtherDeductions} />
          </div>

          {/* Audit table — collapsible */}
          {financials && ((financials.advancesList?.length || 0) + (financials.loansList?.length || 0)
            + (financials.posList?.length || 0) + (financials.deductionsList?.length || 0) > 0) && (
            <div className="border-t pt-3">
              <button type="button" onClick={() => setShowAudit((s) => !s)}
                className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAudit ? "" : "-rotate-90"}`} />
                بنود قيد التدقيق ({(financials.advancesList?.length || 0) + (financials.loansList?.length || 0)
                  + (financials.posList?.length || 0) + (financials.deductionsList?.length || 0)})
              </button>
              {showAudit && (
                <div className="mt-2 border rounded-md max-h-64 overflow-auto">
                  <table className="w-full text-[12px]">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-right px-2 py-1.5 w-8"></th>
                        <th className="text-right px-2 py-1.5">النوع</th>
                        <th className="text-right px-2 py-1.5">التاريخ</th>
                        <th className="text-right px-2 py-1.5">الوصف</th>
                        <th className="text-right px-2 py-1.5">المبلغ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...(financials.advancesList || []).map((r: any) => ({ key: `adv:${r.id}`, type: "سلفة", date: r.advance_date, desc: r.reason || "—", amt: r.amount })),
                        ...(financials.loansList || []).map((r: any) => ({ key: `loan:${r.id}`, type: "قسط قرض", date: r.due_date, desc: "قسط قرض", amt: r.installment_amount })),
                        ...(financials.posList || []).map((r: any) => ({ key: `pos:${r.id}`, type: "نقطة بيع", date: r.created_at?.slice(0,10), desc: r.description || r.expense_kind, amt: r.amount })),
                        ...(financials.deductionsList || []).map((r: any) => ({ key: `ded:${r.id}`, type: "خصم يدوي", date: r.deduction_date, desc: r.description || r.deduction_type, amt: r.amount })),
                      ].map((row) => {
                        const excluded = excludedAuditIds.has(row.key);
                        return (
                          <tr key={row.key} className={`border-t ${excluded ? "opacity-40 line-through" : ""}`}>
                            <td className="px-2 py-1">
                              <input type="checkbox" checked={!excluded}
                                onChange={(e) => {
                                  const s = new Set(excludedAuditIds);
                                  if (e.target.checked) s.delete(row.key); else s.add(row.key);
                                  setExcludedAuditIds(s);
                                }} />
                            </td>
                            <td className="px-2 py-1">{row.type}</td>
                            <td className="px-2 py-1">{row.date || "—"}</td>
                            <td className="px-2 py-1">{row.desc}</td>
                            <td className="px-2 py-1 font-medium">{fmtILS(Number(row.amt || 0))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── 4. Notes + payment ── */}
        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs mb-1 block">ملاحظات</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm mb-2">
                <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />
                تم الدفع
              </label>
              {isPaid && (
                <div>
                  <Label className="text-xs mb-1 block">تاريخ الدفع</Label>
                  <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className="h-9" />
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* ── Sticky bottom summary + save ── */}
        <div className="sticky bottom-0 -mx-4 md:mx-0 z-10">
          <Card className="p-3 bg-background border-primary/40 shadow-lg">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-6 text-xs flex-wrap">
                <div>
                  <div className="text-muted-foreground">المستحقات</div>
                  <div className="text-sm font-bold text-emerald-700">
                    {fmtILS(severance + unusedLeavePay + (useHoursMode ? 0 : currentMonthSalary) + noticePay + regularHoursPay + otNormalPay + otHolidayPay)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">الخصومات</div>
                  <div className="text-sm font-bold text-rose-700">− {fmtILS(advanceBalance + otherDeductions + incomeTax + mealsDeduction)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">الصافي</div>
                  <div className="text-xl font-bold text-primary">{fmtILS(totalDues)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onBack} disabled={saving}>إلغاء</Button>
                <Button onClick={save} disabled={saving || !employeeId}>
                  <Save className="h-4 w-4 ml-1" />
                  {saving ? "جاري الحفظ…" : "حفظ المخالصة"}
                </Button>
              </div>
            </div>
          </Card>
        </div>

      </div>
    </FinanceShell>
    </div>
  );
}

function NumField(props: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-xs">{props.label}</Label>
      <Input
        type="number"
        step="0.01"
        inputMode="decimal"
        value={Number.isFinite(props.value) ? props.value : 0}
        onChange={(e) => props.onChange(Number(e.target.value) || 0)}
        className="h-9 text-sm"
      />
    </div>
  );
}