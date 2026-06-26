/**
 * Microsoft Dynamics 365 Finance-styled expense entry dialog for POS.
 *
 * Two modes:
 *  1. حساب موظف  → cash out as employee advance / loan; creates an
 *     `employee_advances` row + installments (when قرض حسن), and posts a
 *     journal entry DR <employee sub-account> / CR 1110 (cash). Records
 *     a `pos_expenses` row linked to both the session and the advance so
 *     it flows into the shift-close summary AND the employee statement.
 *  2. مصاريف عامة → pick an expense leaf account from the chart of
 *     accounts (5xxx) and post DR <expense_account> / CR 1110.
 *
 * Manager-mode gating happens in the caller (POSPage). The dialog itself
 * trusts that the active manager id was passed in.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Save,
  X,
  Banknote,
  Receipt,
  Users,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Search,
  Loader2,
  Wallet,
  CalendarDays,
  FileText,
  Hash,
} from "lucide-react";
import { addMonths, format } from "date-fns";

type Mode = "employee" | "account";
type EmployeeKind = "employee_advance" | "employee_loan";

interface Employee {
  id: string;
  full_name: string;
  job_title?: string | null;
  account_code?: string | null;
}

interface AccountRow {
  account_code: string;
  account_name: string;
  parent_code: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dataOwnerId: string;
  userId: string;
  sessionId?: string;
  sessionBalance?: number;
  managerUserId: string | null;
  managerName?: string | null;
  cashierName?: string | null;
  branchId?: string | null;
  onSuccess?: () => void;
}

// Microsoft Dynamics 365 Finance palette
const D365 = {
  bg: "#F8F8F8",
  surface: "#FFFFFF",
  border: "#E1DFDD",
  borderStrong: "#C8C6C4",
  brand: "#0078D4",
  brandDark: "#106EBE",
  brandSoft: "#DEECF9",
  text: "#201F1E",
  subtle: "#605E5C",
  success: "#107C10",
  danger: "#A4262C",
  warn: "#797673",
  navy: "#0D1B2E",
};

const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

export default function POSExpenseDialog({
  open,
  onOpenChange,
  dataOwnerId,
  userId,
  sessionId,
  sessionBalance = 0,
  managerUserId,
  managerName,
  cashierName,
  branchId,
  onSuccess,
}: Props) {
  const [mode, setMode] = useState<Mode>("account");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // shared
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");

  // employee mode
  const [employeeId, setEmployeeId] = useState("");
  const [empKind, setEmpKind] = useState<EmployeeKind>("employee_advance");
  const [installments, setInstallments] = useState(3);
  const [startMonth, setStartMonth] = useState(() =>
    format(addMonths(new Date(), 1), "yyyy-MM-01")
  );
  const [empSearch, setEmpSearch] = useState("");

  // account mode
  const [accountCode, setAccountCode] = useState("");
  const [accountSearch, setAccountSearch] = useState("");

  // collapsible FastTabs
  const [openHeader, setOpenHeader] = useState(true);
  const [openDetails, setOpenDetails] = useState(true);
  const [openTerms, setOpenTerms] = useState(true);

  useEffect(() => {
    if (!open) return;
    void loadData();
    // reset
    setAmount(""); setDescription(""); setReference("");
    setEmployeeId(""); setAccountCode("");
    setEmpSearch(""); setAccountSearch("");
    setDate(new Date().toISOString().split("T")[0]);
    setEmpKind("employee_advance");
    setInstallments(3);
  }, [open, dataOwnerId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const sb: any = supabase;
      const empsP = sb
        .from("employees")
        .select("id, full_name, job_title")
        .eq("user_id", dataOwnerId)
        .eq("status", "نشط")
        .order("full_name");
      const accsP = sb
        .from("accounts")
        .select("account_code, account_name, parent_code")
        .eq("user_id", dataOwnerId)
        .eq("is_active", true)
        .order("account_code");
      const [emps, accs]: any = await Promise.all([empsP, accsP]);

      const allAccounts = (accs.data || []) as AccountRow[];
      setAccounts(allAccounts);

      // Best-effort: look up each employee's sub-account by name match.
      const empList: Employee[] = (emps.data || []).map((e: any) => {
        const match = allAccounts.find(
          (a) => a.account_name.includes(e.full_name) && a.account_code.length >= 4
        );
        return { ...e, account_code: match?.account_code || null };
      });
      setEmployees(empList);
    } catch (e) {
      console.error("[POSExpenseDialog] load failed", e);
    } finally {
      setLoading(false);
    }
  };

  // Only expense leaves (5xxx that are NOT a parent of something else),
  // plus 1146 (دفعات مقدمة للموردين) for advances. We allow children of any
  // depth so the user can post directly to فروع التشغيل / الإدارة / etc.
  const expenseAccounts = useMemo(() => {
    const parents = new Set(accounts.map((a) => a.parent_code).filter(Boolean));
    const leaves = accounts.filter(
      (a) =>
        (a.account_code.startsWith("5") || a.account_code === "1146") &&
        !parents.has(a.account_code)
    );
    const q = accountSearch.trim();
    if (!q) return leaves;
    return leaves.filter(
      (a) => a.account_code.includes(q) || a.account_name.includes(q)
    );
  }, [accounts, accountSearch]);

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim();
    if (!q) return employees;
    return employees.filter((e) => e.full_name.includes(q));
  }, [employees, empSearch]);

  const selectedEmployee = employees.find((e) => e.id === employeeId);
  const selectedAccount = accounts.find((a) => a.account_code === accountCode);

  const amt = parseFloat(amount) || 0;
  const overdraft = amt > sessionBalance && sessionBalance > 0;

  const installmentAmount = useMemo(() => {
    if (empKind !== "employee_loan" || installments <= 0) return amt;
    return Math.ceil((amt / installments) * 100) / 100;
  }, [amt, installments, empKind]);

  const handleSave = async () => {
    if (!managerUserId) {
      toast.error("يجب تفعيل وضع المدير قبل تسجيل المصروف");
      return;
    }
    if (!amt || amt <= 0) {
      toast.error("أدخل مبلغاً صحيحاً");
      return;
    }
    if (overdraft) {
      toast.error(`المبلغ أكبر من رصيد العهدة (₪${sessionBalance.toFixed(2)})`);
      return;
    }

    setSaving(true);
    try {
      const stamp = Date.now();
      const ref = reference.trim() || `POS-EXP-${stamp}`;
      let txDebitAccount: string | null = null;
      let advanceId: string | null = null;
      let expenseKind: string = "account";
      let txDescription = "";

      if (mode === "employee") {
        if (!employeeId) {
          toast.error("اختر الموظف");
          setSaving(false);
          return;
        }
        if (!selectedEmployee?.account_code) {
          toast.error(
            `لا يوجد حساب فرعي مرتبط بالموظف "${selectedEmployee?.full_name}". أنشئ حسابه من شجرة الحسابات أولاً.`
          );
          setSaving(false);
          return;
        }
        txDebitAccount = selectedEmployee.account_code;
        expenseKind = empKind;
        const kindLabel = empKind === "employee_loan" ? "قرض حسن" : "سلفة راتب";
        txDescription = `${kindLabel} — ${selectedEmployee.full_name}${
          description ? ` — ${description}` : ""
        }`;

        // 1) employee_advances row
        const count = empKind === "employee_loan" ? installments : 1;
        const instAmt = empKind === "employee_loan" ? installmentAmount : amt;
        const startDed =
          empKind === "employee_advance"
            ? format(addMonths(new Date(date), 1), "yyyy-MM-01")
            : startMonth;

        const { data: adv, error: advErr } = await supabase
          .from("employee_advances")
          .insert({
            user_id: dataOwnerId,
            employee_id: employeeId,
            advance_type: empKind === "employee_loan" ? "قرض_حسن" : "سلفة_راتب",
            amount: amt,
            request_date: date,
            payment_method: "نقداً",
            installments_count: count,
            installment_amount: instAmt,
            start_deduction_month: startDed,
            status: "approved",
            approved_date: date,
            approved_by: managerUserId,
            notes: [
              `صُرفت من نقطة البيع — كاشير: ${cashierName || "—"} — مدير: ${managerName || "—"}`,
              description,
            ]
              .filter(Boolean)
              .join(" | "),
            created_by: userId,
          } as any)
          .select("id")
          .single();

        if (advErr) throw advErr;
        advanceId = adv.id;

        // installments
        const start = new Date(startDed);
        let remaining = amt;
        const rows = [];
        for (let i = 0; i < count; i++) {
          const m = addMonths(start, i);
          const a = i === count - 1 ? remaining : instAmt;
          remaining -= a;
          rows.push({
            advance_id: adv.id,
            employee_id: employeeId,
            user_id: dataOwnerId,
            installment_number: i + 1,
            due_month: format(m, "yyyy-MM-01"),
            amount: a,
            status: "pending",
          });
        }
        if (rows.length > 0) {
          await supabase.from("employee_advance_installments").insert(rows as any);
        }
      } else {
        if (!accountCode) {
          toast.error("اختر حساب المصروف من شجرة الحسابات");
          setSaving(false);
          return;
        }
        txDebitAccount = accountCode;
        expenseKind = "account";
        txDescription = `مصروف — ${selectedAccount?.account_name || accountCode}${
          description ? ` — ${description}` : ""
        }`;
      }

      // 2) Journal entry — DR <txDebitAccount> / CR 1110 cash
      const { data: txRow, error: txErr } = await supabase
        .from("transactions")
        .insert({
          user_id: dataOwnerId,
          transaction_date: date,
          description: txDescription,
          debit_account_code: txDebitAccount,
          credit_account_code: "1110",
          amount: amt,
          currency: "شيكل",
          transaction_type: mode === "employee" ? "employee_advance" : "expense",
          reference: ref,
          payment_method: "نقدي",
          idempotency_key: `POS-EXP-${stamp}`,
        } as any)
        .select("id")
        .single();
      if (txErr) throw txErr;

      // 3) pos_expenses for shift-close attribution
      await supabase.from("pos_expenses").insert({
        user_id: dataOwnerId,
        category_id: null,
        amount: amt,
        description: txDescription,
        shift_id: sessionId || null,
        created_by: userId,
        expense_kind: expenseKind,
        account_code: txDebitAccount,
        employee_id: mode === "employee" ? employeeId : null,
        advance_id: advanceId,
        manager_user_id: managerUserId,
        transaction_id: txRow?.id || null,
        payment_method: "cash",
      } as any);

      // 4) audit
      try {
        await (supabase.from("pos_sensitive_actions_log" as any) as any).insert({
          action: "pos_expense_recorded",
          manager_user_id: managerUserId,
          session_id: sessionId || null,
          notes: txDescription,
          metadata: {
            mode,
            amount: amt,
            account_code: txDebitAccount,
            employee_id: mode === "employee" ? employeeId : null,
            advance_id: advanceId,
            reference: ref,
          },
        });
      } catch {
        /* non-fatal */
      }

      const newBalance = sessionBalance - amt;
      toast.success(
        `✅ تم تسجيل ${
          mode === "employee" ? "صرف لموظف" : "مصروف"
        } بقيمة ₪${amt.toFixed(2)} — رصيد العهدة: ₪${newBalance.toFixed(2)}`
      );
      onSuccess?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error("[POSExpenseDialog] save failed", e);
      toast.error(e?.message || "تعذّر تسجيل المصروف");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => onOpenChange(v)}>
      <DialogContent
        className="max-w-4xl p-0 gap-0 overflow-hidden"
        dir="rtl"
        style={{ background: D365.bg, border: `1px solid ${D365.borderStrong}` }}
      >
        {/* ═══ Action Pane (D365 toolbar) ═══ */}
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{ background: D365.surface, borderColor: D365.border }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !amt}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-sm transition-all disabled:opacity-50"
              style={{
                background: saving || !amt ? D365.bg : D365.brand,
                color: saving || !amt ? D365.subtle : "#fff",
                border: `1px solid ${saving || !amt ? D365.border : D365.brandDark}`,
              }}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              حفظ
            </button>
            <button
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-sm hover:bg-gray-100"
              style={{ color: D365.text, border: `1px solid ${D365.border}` }}
            >
              <X className="w-3.5 h-3.5" />
              إلغاء
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: D365.subtle }}>
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-sm"
              style={{ background: "#FFF4CE", border: "1px solid #F4B408", color: "#8A5300" }}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="font-semibold">وضع المدير</span>
              <span>· {managerName || "—"}</span>
            </div>
            <span>رصيد العهدة:</span>
            <span className="font-mono font-bold" style={{ color: D365.text }}>
              ₪{sessionBalance.toFixed(2)}
            </span>
          </div>
        </div>

        {/* ═══ Title strip ═══ */}
        <div className="px-5 py-3 border-b" style={{ background: D365.surface, borderColor: D365.border }}>
          <div className="text-[11px] font-semibold tracking-wide" style={{ color: D365.subtle }}>
            النقد &gt; نقطة البيع &gt; حركات الصندوق
          </div>
          <h2 className="text-lg font-bold mt-0.5" style={{ color: D365.text }}>
            صرف مصروف من العهدة
          </h2>
        </div>

        <div className="flex" style={{ minHeight: 520 }}>
          {/* ═══ Left rail: mode selector ═══ */}
          <div
            className="w-52 shrink-0 border-l py-2"
            style={{ background: D365.surface, borderColor: D365.border }}
          >
            <div className="px-3 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: D365.subtle }}>
              نوع الحركة
            </div>
            <RailItem
              active={mode === "employee"}
              icon={<Users className="w-4 h-4" />}
              label="حساب موظف"
              hint="سلفة / قرض حسن"
              onClick={() => setMode("employee")}
            />
            <RailItem
              active={mode === "account"}
              icon={<Receipt className="w-4 h-4" />}
              label="مصروف عام"
              hint="من شجرة الحسابات"
              onClick={() => setMode("account")}
            />
          </div>

          {/* ═══ Main content ═══ */}
          <div className="flex-1 overflow-y-auto" style={{ background: D365.bg, maxHeight: "70vh" }}>
            <div className="p-4 space-y-2">
              {/* FastTab: Header */}
              <FastTab
                title="رأس المستند"
                summary={
                  <>
                    <SummaryChip label="التاريخ" value={date} />
                    <SummaryChip label="المرجع" value={reference || "تلقائي"} />
                  </>
                }
                open={openHeader}
                onToggle={() => setOpenHeader(!openHeader)}
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field icon={<CalendarDays className="w-3.5 h-3.5" />} label="تاريخ الحركة">
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </Field>
                  <Field icon={<Hash className="w-3.5 h-3.5" />} label="مرجع المستند">
                    <Input
                      placeholder="اختياري — يولّد تلقائياً"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </Field>
                </div>
              </FastTab>

              {/* FastTab: Allocation (mode-specific) */}
              <FastTab
                title={mode === "employee" ? "بيانات الموظف" : "تخصيص الحساب"}
                summary={
                  mode === "employee" ? (
                    <SummaryChip
                      label="موظف"
                      value={selectedEmployee?.full_name || "—"}
                    />
                  ) : (
                    <SummaryChip
                      label="حساب"
                      value={
                        selectedAccount
                          ? `${selectedAccount.account_code} — ${selectedAccount.account_name}`
                          : "—"
                      }
                    />
                  )
                }
                open={openDetails}
                onToggle={() => setOpenDetails(!openDetails)}
              >
                {mode === "employee" ? (
                  <div className="space-y-3">
                    <Field icon={<Search className="w-3.5 h-3.5" />} label="بحث الموظف">
                      <Input
                        placeholder="اكتب اسم الموظف…"
                        value={empSearch}
                        onChange={(e) => setEmpSearch(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </Field>
                    <Field label="الموظف *">
                      <Select value={employeeId} onValueChange={setEmployeeId}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder={loading ? "جارٍ التحميل..." : "اختر الموظف"} />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {filteredEmployees.map((e) => (
                            <SelectItem key={e.id} value={e.id} className="text-sm">
                              <div className="flex flex-col items-start">
                                <span className="font-medium">{e.full_name}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {e.job_title || ""} {e.account_code ? `· ${e.account_code}` : "· بدون حساب فرعي"}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                          {filteredEmployees.length === 0 && (
                            <div className="p-3 text-xs text-muted-foreground text-center">
                              لا يوجد موظفين مطابقين
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </Field>
                    {selectedEmployee && !selectedEmployee.account_code && (
                      <div className="text-[11px] p-2 rounded-sm" style={{ background: "#FDE7E9", color: D365.danger, border: "1px solid #F1707B" }}>
                        ⚠ الموظف لا يملك حساباً فرعياً في شجرة الحسابات — أنشئه من صفحة الحسابات قبل الصرف ليظهر في كشف حسابه.
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="طبيعة الصرف *">
                        <Select value={empKind} onValueChange={(v) => setEmpKind(v as EmployeeKind)}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="employee_advance">💵 سلفة راتب (تُخصم من الراتب القادم)</SelectItem>
                            <SelectItem value="employee_loan">🤝 قرض حسن (تقسيط شهري)</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      {empKind === "employee_loan" && (
                        <Field label="عدد الأقساط">
                          <Input
                            type="number"
                            min={1}
                            max={24}
                            value={installments || ""}
                            onChange={(e) => setInstallments(Number(e.target.value))}
                            className="h-8 text-sm"
                          />
                        </Field>
                      )}
                    </div>
                    {empKind === "employee_loan" && (
                      <Field label="شهر بداية الاستقطاع">
                        <Input
                          type="month"
                          value={startMonth.slice(0, 7)}
                          onChange={(e) => setStartMonth(e.target.value + "-01")}
                          className="h-8 text-sm"
                        />
                      </Field>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Field icon={<Search className="w-3.5 h-3.5" />} label="بحث الحساب">
                      <Input
                        placeholder="رقم الحساب أو الاسم… (مثال: 5510 أو صيانة)"
                        value={accountSearch}
                        onChange={(e) => setAccountSearch(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </Field>
                    <Field label="حساب المصروف *">
                      <div
                        className="max-h-56 overflow-y-auto rounded-sm border"
                        style={{ background: "#fff", borderColor: D365.border }}
                      >
                        {loading && (
                          <div className="p-4 text-xs text-center text-muted-foreground">
                            جارٍ التحميل…
                          </div>
                        )}
                        {!loading && expenseAccounts.length === 0 && (
                          <div className="p-4 text-xs text-center text-muted-foreground">
                            لا توجد حسابات مطابقة
                          </div>
                        )}
                        {expenseAccounts.map((a) => (
                          <button
                            key={a.account_code}
                            type="button"
                            onClick={() => setAccountCode(a.account_code)}
                            className="w-full text-right px-3 py-1.5 text-xs flex justify-between items-center transition-colors"
                            style={{
                              background:
                                accountCode === a.account_code ? D365.brandSoft : "transparent",
                              borderBottom: `1px solid ${D365.border}`,
                              color: D365.text,
                            }}
                          >
                            <span className="font-medium">{a.account_name}</span>
                            <span className="font-mono text-[10px]" style={{ color: D365.subtle }}>
                              {a.account_code}
                            </span>
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                )}
              </FastTab>

              {/* FastTab: Amount & narration */}
              <FastTab
                title="المبلغ والوصف"
                summary={
                  <SummaryChip
                    label="القيمة"
                    value={amt ? `₪${amt.toFixed(2)}` : "—"}
                    danger={overdraft}
                  />
                }
                open={openTerms}
                onToggle={() => setOpenTerms(!openTerms)}
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field icon={<Banknote className="w-3.5 h-3.5" />} label="المبلغ (شيكل) *">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="h-8 text-sm font-mono"
                    />
                    {overdraft && (
                      <div className="text-[10px] mt-1" style={{ color: D365.danger }}>
                        تجاوز رصيد العهدة (₪{sessionBalance.toFixed(2)})
                      </div>
                    )}
                  </Field>
                  <Field icon={<Wallet className="w-3.5 h-3.5" />} label="طريقة الدفع">
                    <Input value="نقدي من الصندوق" disabled className="h-8 text-sm bg-muted" />
                  </Field>
                </div>
                <div className="mt-3">
                  <Field icon={<FileText className="w-3.5 h-3.5" />} label="الوصف / الملاحظات">
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="بيان توضيحي يظهر في القيد المحاسبي وكشف الحساب…"
                      rows={2}
                      className="text-sm resize-none"
                    />
                  </Field>
                </div>

                {/* Journal preview */}
                {amt > 0 && (mode === "account" ? accountCode : selectedEmployee?.account_code) && (
                  <div
                    className="mt-3 rounded-sm border p-2 text-[11px]"
                    style={{ background: D365.brandSoft, borderColor: D365.brand, color: D365.text }}
                  >
                    <div className="font-bold mb-1">معاينة القيد المحاسبي:</div>
                    <div className="font-mono">
                      <div>
                        مدين {mode === "account" ? accountCode : selectedEmployee?.account_code} —{" "}
                        {mode === "account"
                          ? selectedAccount?.account_name
                          : selectedEmployee?.full_name}{" "}
                        ₪{amt.toFixed(2)}
                      </div>
                      <div>دائن 1110 — الصندوق ₪{amt.toFixed(2)}</div>
                    </div>
                  </div>
                )}
              </FastTab>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────── building blocks ───────── */

function RailItem({
  active,
  icon,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-right px-3 py-2 flex items-start gap-2 transition-all"
      style={{
        background: active ? D365.brandSoft : "transparent",
        borderRight: active ? `3px solid ${D365.brand}` : "3px solid transparent",
        color: active ? D365.brandDark : D365.text,
      }}
    >
      <span className="mt-0.5" style={{ color: active ? D365.brand : D365.subtle }}>
        {icon}
      </span>
      <span className="flex flex-col items-start">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-[10px]" style={{ color: D365.subtle }}>
          {hint}
        </span>
      </span>
    </button>
  );
}

function FastTab({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border" style={{ background: D365.surface, borderColor: D365.border }}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="w-3.5 h-3.5" style={{ color: D365.subtle }} />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" style={{ color: D365.subtle }} />
          )}
          <span className="text-sm font-bold" style={{ color: D365.text }}>
            {title}
          </span>
        </div>
        {!open && summary && <div className="flex gap-2 items-center">{summary}</div>}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: D365.border }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold flex items-center gap-1" style={{ color: D365.subtle }}>
        {icon}
        {label}
      </Label>
      {children}
    </div>
  );
}

function SummaryChip({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <span className="text-[11px]" style={{ color: D365.subtle }}>
      {label}:{" "}
      <span className="font-semibold" style={{ color: danger ? D365.danger : D365.text }}>
        {value}
      </span>
    </span>
  );
}