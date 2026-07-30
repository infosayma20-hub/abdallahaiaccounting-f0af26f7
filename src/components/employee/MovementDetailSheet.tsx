import { useMemo } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertTriangle, Utensils, Banknote, PiggyBank, Receipt, Wallet,
  Info, ShieldCheck, CalendarDays, Hash, FileText, XCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { decodeHRMessage, penaltyLabel } from "@/lib/hrMessages";
import { formatCurrency } from "@/lib/employeeFinancialDisplay";
import { tCategory, type EmployeeMovement } from "@/hooks/hr/useEmployeeFinancialMovements";
import { cn } from "@/lib/utils";

const AR_MONTHS = [
  "يناير","فبراير","مارس","إبريل","مايو","يونيو",
  "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
];

/**
 * شرح مبسّط لكل بند يظهر في محفظة الموظف.
 * الهدف: يفهم الموظف "شو هاي الحركة؟ ومن وين إجت؟ وشو أثرها على راتبي؟"
 * لا يوجد أي منطق مالي هنا — عرض توضيحي فقط.
 */
export const CATEGORY_INFO: Record<string, {
  label: string;
  icon: typeof Utensils;
  tone: string;
  what: string;
  how: string;
  effect: string;
}> = {
  penalty: {
    label: "مخالفة",
    icon: AlertTriangle,
    tone: "text-rose-600 bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300",
    what: "خصم ناتج عن إجراء إداري (تنبيه شفهي أو خطي، تأخّر عن الدوام، غياب بدون إذن، أو مخالفة لتعليمات العمل).",
    how: "يُسجَّل من قسم الموارد البشرية أو الإدارة بقيمة محددة وبوصف يوضّح سبب المخالفة وتاريخها، ثم يظهر لك هنا للشفافية.",
    effect: "يُخصم المبلغ من راتب الشهر المذكور في الحركة. إذا عندك اعتراض، تواصل مع الموارد البشرية مباشرة مع رقم المرجع الظاهر بالأسفل.",
  },
  food: {
    label: "وجبات / أكل",
    icon: Utensils,
    tone: "text-violet-600 bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300",
    what: "قيمة الوجبات التي تم صرفها لك عبر نقطة البيع على حساب الموظف.",
    how: "تُسجَّل تلقائياً لحظة إصدار الفاتورة على نقطة البيع، وتُطبَّق نسبة الدعم المعتمدة (خصم الموظف) إن وجدت.",
    effect: "تُخصم من راتب الشهر المذكور في الحركة.",
  },
  advance: {
    label: "سلفة",
    icon: Banknote,
    tone: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300",
    what: "مبلغ نقدي استلمته مقدَّماً على حساب راتبك.",
    how: "تُصرف بعد اعتماد طلب السلفة، ويصدر لها سند صرف برقم مرجعي.",
    effect: "تُخصم بالكامل من راتب شهر الاستحقاق المذكور في الحركة.",
  },
  loan_installment: {
    label: "قسط قرض حسن",
    icon: PiggyBank,
    tone: "text-amber-600 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300",
    what: "قسط شهري من قرض حسن معتمد لك.",
    how: "يُقسَّم مبلغ القرض على عدد الأشهر المتفق عليها، ويُستحق قسط واحد كل شهر.",
    effect: "يُخصم القسط من راتب الشهر المستحق حتى سداد كامل القرض.",
  },
  purchase: {
    label: "مشتريات على الحساب",
    icon: Receipt,
    tone: "text-blue-600 bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300",
    what: "بضاعة أو مواد اشتريتها من الشركة على حسابك الشخصي.",
    how: "تُسجَّل عند إصدار الفاتورة أو القيد على حسابك.",
    effect: "تُخصم من راتب الشهر المذكور في الحركة.",
  },
  transport: {
    label: "مواصلات",
    icon: Wallet,
    tone: "text-slate-600 bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300",
    what: "بدل أو خصم متعلّق بالمواصلات.",
    how: "يُسجَّل من الموارد البشرية حسب سياسة الشركة.",
    effect: "ينعكس على راتب الشهر المذكور في الحركة.",
  },
  adjustment: {
    label: "تسوية",
    icon: ShieldCheck,
    tone: "text-teal-600 bg-teal-100 dark:bg-teal-950/40 dark:text-teal-300",
    what: "تصحيح محاسبي لحركة سابقة (زيادة أو تخفيض).",
    how: "تُسجَّل من المحاسبة عند اكتشاف فرق أو خطأ في تسجيل سابق.",
    effect: "تعدّل الرصيد النهائي للشهر المذكور.",
  },
  previous_balance: {
    label: "رصيد سابق",
    icon: Wallet,
    tone: "text-slate-600 bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300",
    what: "رصيد مُرحَّل من فترة سابقة قبل تفعيل المحفظة.",
    how: "يُسجَّل مرة واحدة كرصيد افتتاحي.",
    effect: "يظهر ضمن إجمالي ما عليك أو ما لك.",
  },
  other: {
    label: "أخرى",
    icon: Wallet,
    tone: "text-slate-600 bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300",
    what: "حركة مالية غير مصنّفة ضمن البنود القياسية.",
    how: "تُسجَّل من الموارد البشرية أو المحاسبة مع وصف يوضّح سببها.",
    effect: "ينعكس أثرها على راتب الشهر المذكور.",
  },
};

export function infoForCategory(cat?: string | null) {
  return CATEGORY_INFO[cat || "other"] || CATEGORY_INFO.other;
}

function Row({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Hash }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/60 last:border-0">
      <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </span>
      <span className="text-[12px] font-semibold text-right break-words">{value}</span>
    </div>
  );
}

interface Props {
  movement: EmployeeMovement | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * ورقة تفاصيل الحركة المالية للموظف — عرض للقراءة فقط.
 * تربط حركة "المخالفة" بالإجراء الإداري المسجّل عليها (إن وُجد) حتى يعرف
 * الموظف سبب الخصم بدقة بدون الحاجة للسؤال.
 */
export default function MovementDetailSheet({ movement, open, onOpenChange }: Props) {
  const info = infoForCategory(movement?.category);
  const Icon = info.icon;

  const isPenalty = movement?.category === "penalty";

  // ربط المخالفة بالإجراء الإداري: نبحث عن إجراء بنفس الفترة الزمنية (±10 أيام).
  const { data: linkedAction } = useQuery({
    queryKey: ["movement-linked-penalty", movement?.id],
    enabled: !!movement && !!isPenalty && open,
    staleTime: 60_000,
    queryFn: async () => {
      const d = new Date(movement!.movement_date);
      const from = new Date(d); from.setDate(from.getDate() - 10);
      const to = new Date(d); to.setDate(to.getDate() + 10);
      const iso = (x: Date) => x.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("correction_requests")
        .select("id, attendance_date, request_type, reason, status, created_at")
        .eq("employee_id", movement!.employee_id)
        .in("request_type", ["penalty", "hr_message"])
        .gte("created_at", `${iso(from)}T00:00:00`)
        .lte("created_at", `${iso(to)}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) return null;
      const rows = (data || []).map((r: any) => ({ ...r, meta: decodeHRMessage(r.reason) }));
      return rows.find((r: any) => r.request_type === "penalty" || r.meta?.type === "penalty" || r.meta?.type === "warning") || null;
    },
  });

  const salaryPeriod = useMemo(() => {
    if (!movement) return "";
    const m = movement.salary_month ? Number(movement.salary_month) : new Date(movement.movement_date).getMonth() + 1;
    const y = movement.salary_year ? Number(movement.salary_year) : new Date(movement.movement_date).getFullYear();
    return `${AR_MONTHS[m - 1]} ${y}`;
  }, [movement]);

  if (!movement) return null;

  const rejected = movement.status === "rejected";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" dir="rtl" className="max-h-[88vh] overflow-y-auto rounded-t-2xl px-4 pb-8">
        <SheetHeader className="text-right space-y-2">
          <div className="flex items-center gap-3">
            <div className={cn("h-11 w-11 rounded-full flex items-center justify-center shrink-0", info.tone)}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base text-right">{tCategory(movement.category)}</SheetTitle>
              <SheetDescription className="text-[11px] text-right">
                {new Date(movement.movement_date).toLocaleDateString("ar-EG-u-ca-gregory")}
              </SheetDescription>
            </div>
            <div className={cn(
              "ms-auto text-lg font-extrabold tabular-nums",
              rejected ? "text-muted-foreground line-through"
                : movement.movement_type === "debit" ? "text-rose-600" : "text-emerald-600",
            )}>
              {movement.movement_type === "debit" ? "-" : "+"}{formatCurrency(movement.amount)}
            </div>
          </div>
        </SheetHeader>

        {rejected && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900/40 p-2.5 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>هذه الحركة ملغاة ولن تُخصم من راتبك.{movement.notes ? ` سبب الإلغاء: ${movement.notes}` : ""}</span>
          </div>
        )}

        {/* شرح البند */}
        <div className="mt-4 space-y-2.5">
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="text-[11px] font-bold flex items-center gap-1.5 mb-1">
              <Info className="h-3.5 w-3.5 text-primary" /> شو يعني «{info.label}»؟
            </div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">{info.what}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="text-[11px] font-bold mb-1">كيف تم تسجيلها؟</div>
            <p className="text-[12px] leading-relaxed text-muted-foreground">{info.how}</p>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <div className="text-[11px] font-bold mb-1">أثرها على راتبك</div>
            <p className="text-[12px] leading-relaxed">{info.effect}</p>
          </div>
        </div>

        {/* تفاصيل الحركة */}
        <div className="mt-4 rounded-xl border border-border bg-card p-3">
          <div className="text-[11px] font-bold mb-1">تفاصيل الحركة</div>
          <Row label="المبلغ" value={formatCurrency(movement.amount)} icon={Wallet} />
          <Row label="التاريخ" value={new Date(movement.movement_date).toLocaleDateString("ar-EG-u-ca-gregory")} icon={CalendarDays} />
          <Row label="شهر الخصم" value={salaryPeriod} icon={CalendarDays} />
          {movement.description && <Row label="الوصف" value={movement.description} icon={FileText} />}
          {movement.source_reference && <Row label="رقم المرجع" value={movement.source_reference} icon={Hash} />}
          {movement.reference_number && <Row label="رقم إضافي" value={movement.reference_number} icon={Hash} />}
          {movement.notes && !rejected && <Row label="ملاحظات" value={movement.notes} icon={FileText} />}
        </div>

        {/* الإجراء الإداري المرتبط (للمخالفات) */}
        {isPenalty && linkedAction && (
          <div className="mt-3 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20 p-3">
            <div className="text-[11px] font-bold mb-1.5 flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" /> الإجراء الإداري المرتبط
            </div>
            {linkedAction.meta?.penalty_kind && (
              <Row label="نوع الإجراء" value={penaltyLabel(linkedAction.meta.penalty_kind)} />
            )}
            {linkedAction.meta?.subject && <Row label="الموضوع" value={linkedAction.meta.subject} />}
            {linkedAction.meta?.body && <Row label="التفاصيل" value={linkedAction.meta.body} />}
            {linkedAction.meta?.violation_date && (
              <Row label="تاريخ المخالفة" value={new Date(linkedAction.meta.violation_date).toLocaleDateString("ar-EG-u-ca-gregory")} />
            )}
          </div>
        )}

        <p className="mt-4 text-[10.5px] text-muted-foreground leading-relaxed text-center">
          لأي استفسار أو اعتراض على هذه الحركة، تواصل مع قسم الموارد البشرية وزوّدهم برقم المرجع والتاريخ الظاهرين أعلاه.
        </p>
      </SheetContent>
    </Sheet>
  );
}
