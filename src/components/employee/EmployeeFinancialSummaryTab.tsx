import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, HandCoins,
  Utensils, Banknote, AlertTriangle, Receipt, XCircle, ListFilter,
  Pencil, PiggyBank,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useEmployeeMovements, tCategory, type EmployeeMovement,
} from "@/hooks/hr/useEmployeeFinancialMovements";
import { formatCurrency, safeNum } from "@/lib/employeeFinancialDisplay";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Props { employeeId: string; }

/**
 * Wallet chips — no emojis, clean lucide icons only. Each chip filters the
 * movements list below without touching KPIs/loan/category totals (those
 * always reflect approved reality).
 */
type ChipKey = "all" | "food" | "advance" | "loan" | "penalty" | "shortage" | "voucher" | "rejected";
const CHIPS: { key: ChipKey; label: string; icon: typeof Utensils }[] = [
  { key: "all",       label: "الكل",          icon: ListFilter },
  { key: "food",      label: "الأكل",         icon: Utensils },
  { key: "advance",   label: "السلف",         icon: Banknote },
  { key: "loan",      label: "القرض الحسن",   icon: PiggyBank },
  { key: "penalty",   label: "المخالفات",     icon: AlertTriangle },
  { key: "shortage",  label: "عجز/فائض",      icon: Wallet },
  { key: "voucher",   label: "سندات الصرف",   icon: Receipt },
  { key: "rejected",  label: "الملغاة",       icon: XCircle },
];

/** Classify a movement into the chip taxonomy above. */
function chipOf(m: EmployeeMovement): ChipKey {
  if (m.status === "rejected") return "rejected";
  if (m.source_type === "pos_meal" || m.category === "food") return "food";
  if (m.category === "penalty") return "penalty";
  if (m.category === "cash_shortage" || m.category === "cash_surplus" || m.source_type === "pos_shortage") return "shortage";
  if (m.category === "loan_installment" || m.source_type === "loan" || /قرض/.test(m.description || "") || /قرض/.test(m.source_reference || "")) return "loan";
  if (m.category === "advance") return "advance";
  // finance_manual entries with an explicit voucher reference are cash disbursements
  if (m.source_type === "finance_manual" && (m.source_reference?.match(/^PV[- ]?/i) || /سند\s*صرف/.test(m.description || ""))) return "voucher";
  return "all";
}

/** Friendly Arabic source badge label. */
function sourceBadge(m: EmployeeMovement): { label: string; tone: "pos" | "voucher" | "manual" } | null {
  if (m.source_type === "pos_meal") return { label: "نقطة بيع", tone: "pos" };
  if (m.source_type === "pos_shortage") return { label: "جرد نقطة بيع", tone: "pos" };
  if (m.source_reference?.match(/^PV[- ]?/i)) return { label: "سند صرف", tone: "voucher" };
  if (m.source_type === "loan") return { label: "قرض حسن", tone: "voucher" };
  if (m.source_type === "payroll") return { label: "خصم راتب", tone: "manual" };
  if (m.source_type === "finance_manual") return { label: "قيد يدوي", tone: "manual" };
  return null;
}

/** Arabic status label — never expose raw English status codes to the user. */
function statusLabel(status?: string | null): { text: string; tone: "warn" | "ok" | "muted" | "bad" } | null {
  switch (status) {
    case "pending":  return { text: "قيد المراجعة", tone: "warn" };
    case "approved": return null; // default — no chip needed
    case "deducted": return { text: "مخصومة", tone: "ok" };
    case "settled":  return { text: "مسددة", tone: "ok" };
    case "rejected": return { text: "ملغاة", tone: "bad" };
    case "cancelled":return { text: "ملغاة", tone: "bad" };
    case "posted":   return { text: "مرحّلة", tone: "ok" };
    case "draft":    return { text: "مسودة", tone: "muted" };
    default: return null;
  }
}

/** Detect edits: updated_at meaningfully after created_at. */
function wasEdited(m: EmployeeMovement): boolean {
  if (!m.updated_at || !m.created_at) return false;
  return new Date(m.updated_at).getTime() - new Date(m.created_at).getTime() > 60_000;
}

/** Arabic label for loan status coming from HR. */
function loanStatusLabel(s?: string | null): string {
  if (!s) return "";
  switch (s) {
    case "active": return "نشط";
    case "pending": return "قيد الاعتماد";
    case "completed": case "closed": case "settled": return "مسدد";
    case "cancelled": case "rejected": return "ملغي";
    case "suspended": return "موقوف";
    default: return s;
  }
}

export default function EmployeeFinancialSummaryTab({ employeeId }: Props) {
  const [activeChip, setActiveChip] = useState<ChipKey>("all");
  // Always pull approved history for KPIs/summary, plus rejected once so we
  // can render the "الملغاة" chip transparently without a second round-trip.
  const { data: movements = [], isLoading } = useEmployeeMovements(employeeId, { includeRejected: true });

  // ---- القرض الحسن: مصدر الحقيقة الوحيد هو employee_loans + loan_installments
  // يُقرأ مباشرةً وليس من employee_forms، ويُشترك بالتغييرات الحيّة حتى تنعكس
  // أي تعديلات يجريها قسم الموارد البشرية على شاشة الموظف فوراً.
  const qc = useQueryClient();
  const loanQuery = useQuery({
    queryKey: ["employee-loans", employeeId],
    enabled: !!employeeId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data: loans, error } = await supabase
        .from("employee_loans")
        .select("id, total_amount, monthly_installment, total_months, paid_months, remaining_amount, first_payment_date, last_payment_date, status, notes, created_at, approval_date")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const activeIds = (loans || [])
        .filter((l: any) => ["active", "pending", "نشط", "قيد الاعتماد"].includes(l.status))
        .map((l: any) => l.id);
      let installments: any[] = [];
      if (activeIds.length > 0) {
        const { data: inst } = await supabase
          .from("loan_installments")
          .select("id, loan_id, due_date, amount, paid_amount, status, paid_date")
          .in("loan_id", activeIds)
          .order("due_date", { ascending: true });
        installments = inst || [];
      }
      return { loans: loans || [], installments };
    },
  });

  // اشتراك حي: أي تعديل من HR على القرض أو الأقساط يُعيد التحميل تلقائياً.
  useEffect(() => {
    if (!employeeId) return;
    const channel = supabase
      .channel(`emp-loans-${employeeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_loans", filter: `employee_id=eq.${employeeId}` },
        () => qc.invalidateQueries({ queryKey: ["employee-loans", employeeId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "loan_installments" },
        () => qc.invalidateQueries({ queryKey: ["employee-loans", employeeId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_financial_movements", filter: `employee_id=eq.${employeeId}` },
        () => qc.invalidateQueries({ queryKey: ["employee-movements", employeeId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [employeeId, qc]);

  const loans = loanQuery.data?.loans || [];
  const loanInstallments = loanQuery.data?.installments || [];
  const activeLoan = loans.find((l: any) => ["active", "نشط"].includes(l.status))
    || loans.find((l: any) => ["pending", "قيد الاعتماد"].includes(l.status))
    || null;

  // KPI/summary numbers must ignore rejected/cancelled rows so the employee
  // sees the same balance the payroll will use.
  const activeMovements = useMemo(
    () => movements.filter((m) => m.status !== "rejected"),
    [movements],
  );

  const summary = useMemo(() => {
    let owesCompany = 0; // employee debit
    let owedToEmployee = 0; // credit
    const byCategory: Record<string, { debit: number; credit: number }> = {};
    let loanInstallmentsPaid = 0;

    for (const m of activeMovements) {
      const amt = safeNum(m.amount);
      const cat = m.category || "other";
      if (!byCategory[cat]) byCategory[cat] = { debit: 0, credit: 0 };
      if (m.movement_type === "debit") {
        owesCompany += amt;
        byCategory[cat].debit += amt;
        if (cat === "loan_installment") loanInstallmentsPaid += amt;
      } else if (m.movement_type === "credit") {
        owedToEmployee += amt;
        byCategory[cat].credit += amt;
      }
    }
    return {
      owesCompany, owedToEmployee, net: owesCompany - owedToEmployee, byCategory, loanInstallmentsPaid,
    };
  }, [activeMovements]);

  // Chip counts (for the small superscript badges).
  const chipCounts = useMemo(() => {
    const c: Record<ChipKey, number> = { all: 0, food: 0, advance: 0, loan: 0, penalty: 0, shortage: 0, voucher: 0, rejected: 0 };
    for (const m of movements) {
      const k = chipOf(m);
      c[k]++;
      if (m.status !== "rejected") c.all++;
    }
    return c;
  }, [movements]);

  const filteredMovements = useMemo(() => {
    if (activeChip === "rejected") return movements.filter((m) => m.status === "rejected");
    const src = activeMovements;
    if (activeChip === "all") return src;
    return src.filter((m) => chipOf(m) === activeChip);
  }, [movements, activeMovements, activeChip]);

  // احتساب أقساط القرض (المدفوعة/المتبقية) من مصدر HR مباشرة.
  const paidInstallmentsCount = loanInstallments.filter((i: any) =>
    ["paid", "settled", "deducted", "مدفوع", "مسدد"].includes(i.status)
  ).length;
  const paidInstallmentsAmount = loanInstallments
    .filter((i: any) => ["paid", "settled", "deducted", "مدفوع", "مسدد"].includes(i.status))
    .reduce((s: number, i: any) => s + safeNum(i.paid_amount ?? i.amount), 0);
  const nextInstallment = loanInstallments.find((i: any) => !["paid", "settled", "deducted", "مدفوع", "مسدد"].includes(i.status));
  const loanRemaining = activeLoan ? safeNum(activeLoan.remaining_amount ?? (activeLoan.total_amount - paidInstallmentsAmount)) : null;

  return (
    <div className="space-y-4 px-4 pt-3" dir="rtl" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>
      <h2 className="text-lg font-bold pt-2 flex items-center gap-2">
        <Wallet className="h-5 w-5 text-primary" />
        ملخصي المالي
      </h2>

      {/* Top KPI cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-rose-500/20 bg-rose-500/5">
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-rose-700 dark:text-rose-400">
              <ArrowDownCircle className="h-3.5 w-3.5" /> على ذمتي
            </div>
            <div className="text-sm font-bold text-rose-700 dark:text-rose-400">{formatCurrency(summary.owesCompany)}</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400">
              <ArrowUpCircle className="h-3.5 w-3.5" /> مستحق لي
            </div>
            <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(summary.owedToEmployee)}</div>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 space-y-1">
            <div className="text-[10px] text-primary">صافي الرصيد</div>
            <div className={`text-sm font-bold ${summary.net >= 0 ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
              {formatCurrency(Math.abs(summary.net))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loan card */}
      <Card className="border-border bg-card">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HandCoins className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-semibold">القرض الحسن</span>
            </div>
            {activeLoan && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/40">
                {loanStatusLabel(activeLoan.status)}
              </span>
            )}
          </div>
          {activeLoan ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Field label="قيمة القرض" value={formatCurrency(activeLoan.total_amount)} />
              <Field label="القسط الشهري" value={formatCurrency(activeLoan.monthly_installment)} />
              <Field label="عدد الأقساط" value={`${activeLoan.total_months || "-"} قسط`} />
              <Field label="أقساط مسددة" value={`${paidInstallmentsCount} من ${activeLoan.total_months || "-"}`} accent="ok" />
              <Field label="ما تم دفعه" value={formatCurrency(paidInstallmentsAmount || summary.loanInstallmentsPaid)} accent="ok" />
              <Field label="المتبقي" value={formatCurrency(loanRemaining ?? 0)} accent="bad" />
              {activeLoan.first_payment_date && (
                <Field label="أول قسط" value={new Date(activeLoan.first_payment_date).toLocaleDateString("ar-EG-u-ca-gregory")} />
              )}
              {activeLoan.last_payment_date && (
                <Field label="آخر قسط" value={new Date(activeLoan.last_payment_date).toLocaleDateString("ar-EG-u-ca-gregory")} />
              )}
              {nextInstallment && (
                <Field
                  label="القسط القادم"
                  value={`${formatCurrency(nextInstallment.amount)} • ${new Date(nextInstallment.due_date).toLocaleDateString("ar-EG-u-ca-gregory")}`}
                />
              )}
              {activeLoan.notes && (
                <div className="col-span-2 rounded-lg bg-muted/30 p-2">
                  <div className="text-[10px] text-muted-foreground">ملاحظات</div>
                  <div className="text-[11px] text-foreground">{activeLoan.notes}</div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">لا يوجد قرض حسن نشط حالياً.</p>
          )}
          {loans.length > 1 && (
            <div className="text-[10px] text-muted-foreground pt-1 border-t border-border">
              يوجد {loans.length - (activeLoan ? 1 : 0)} قرض سابق في السجل.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category breakdown */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-semibold">تفصيل حسب البند</div>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 rounded-full border-2 border-muted animate-spin" style={{ borderTopColor: "hsl(var(--primary))" }} />
            </div>
          ) : Object.keys(summary.byCategory).length === 0 ? (
            <p className="text-xs text-muted-foreground p-4 text-center">لا توجد حركات مالية</p>
          ) : (
            <ul className="divide-y divide-border">
              {Object.entries(summary.byCategory).map(([cat, totals]) => (
                <li key={cat} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="text-muted-foreground">{tCategory(cat)}</span>
                  <div className="flex items-center gap-3">
                    {totals.debit > 0 && <span className="text-rose-600">-{formatCurrency(totals.debit)}</span>}
                    {totals.credit > 0 && <span className="text-emerald-600">+{formatCurrency(totals.credit)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Filter chips + Latest movements */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-xs font-semibold">الحركات</span>
            <span className="text-[10px] text-muted-foreground">{filteredMovements.length} حركة</span>
          </div>
          {/* Chips row — scrollable, no emojis, subtle lucide icons */}
          <div className="px-2 py-2 border-b border-border overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 w-max">
              {CHIPS.map((c) => {
                const active = activeChip === c.key;
                const count = chipCounts[c.key];
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setActiveChip(c.key)}
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted/50",
                      c.key === "rejected" && !active && "text-rose-600 border-rose-200 dark:border-rose-900/40",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{c.label}</span>
                    {count > 0 && (
                      <span className={cn(
                        "inline-flex items-center justify-center rounded-full px-1.5 text-[10px] leading-4 min-w-4",
                        active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                      )}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {filteredMovements.length === 0 ? (
            <p className="text-xs text-muted-foreground p-6 text-center">
              {activeChip === "rejected" ? "لا توجد حركات ملغاة." : "لا توجد حركات في هذا التصنيف."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filteredMovements.slice(0, 60).map((m: EmployeeMovement) => {
                const badge = sourceBadge(m);
                const rejected = m.status === "rejected";
                const edited = wasEdited(m);
                return (
                  <li key={m.id} className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={cn("font-semibold text-[13px] truncate", rejected && "line-through text-muted-foreground")}>
                            {tCategory(m.category)}
                          </span>
                          {badge && (
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded-full border",
                              badge.tone === "pos" && "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/40",
                              badge.tone === "voucher" && "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900/40",
                              badge.tone === "manual" && "bg-muted text-muted-foreground border-border",
                            )}>{badge.label}</span>
                          )}
                          {rejected && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/40 inline-flex items-center gap-0.5">
                              <XCircle className="h-2.5 w-2.5" /> ملغاة
                            </span>
                          )}
                          {edited && !rejected && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40 inline-flex items-center gap-0.5">
                              <Pencil className="h-2.5 w-2.5" /> عُدِّلت
                            </span>
                          )}
                          {(() => {
                            const sl = statusLabel(m.status);
                            if (!sl || rejected) return null;
                            const tone = sl.tone === "warn"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : sl.tone === "ok"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : sl.tone === "bad"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-muted text-muted-foreground border-border";
                            return (
                              <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border", tone)}>{sl.text}</span>
                            );
                          })()}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          {new Date(m.movement_date).toLocaleDateString("ar-EG-u-ca-gregory")}
                          {m.source_reference ? ` • ${m.source_reference}` : ""}
                          {m.description ? ` • ${m.description}` : ""}
                        </div>
                        {rejected && m.notes && (
                          <div className="text-[10px] text-rose-600 mt-0.5 truncate">سبب الإلغاء: {m.notes}</div>
                        )}
                      </div>
                      <span className={cn(
                        "shrink-0 font-bold text-[13px] tabular-nums",
                        rejected ? "text-muted-foreground line-through"
                          : m.movement_type === "debit" ? "text-rose-600" : "text-emerald-600",
                      )}>
                        {m.movement_type === "debit" ? "-" : "+"}{formatCurrency(m.amount)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: "ok" | "bad" }) {
  return (
    <div className="rounded-lg bg-muted/30 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`font-semibold ${accent === "ok" ? "text-emerald-600" : accent === "bad" ? "text-rose-600" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
