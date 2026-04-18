import { useState, useEffect, useMemo } from "react";
import { format, addMonths, differenceInDays } from "date-fns";
import { ArrowLeft, Calendar as CalendarIcon, Crown, Users, Sparkles, AlertTriangle, CheckCircle2, Zap, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";

const MODULE_LABELS: Record<string, string> = {
  dashboard: "لوحة المعلومات",
  finance: "المالية",
  sales: "المبيعات",
  purchases: "المشتريات",
  inventory: "المخزون",
  accounting: "المحاسبة",
  reports: "التقارير",
  contacts: "جهات الاتصال",
  tax: "الضريبة",
  "fixed-assets": "الأصول الثابتة",
  currencies: "العملات",
  pos: "نقطة البيع",
  hr: "الموارد البشرية",
  tasks: "المهام",
  "ai-accountant": "المحاسب الذكي",
  workshops: "الورشات",
  contracting: "المقاولات",
  warranty: "الكفالات",
  tourism: "السياحة",
  ecommerce: "التجارة الإلكترونية",
  "call-center": "مركز الاتصال",
  stores: "تعدد المتاجر",
};

const STATUS_OPTS = [
  { v: "trial", l: "تجريبي", color: "bg-blue-500" },
  { v: "active", l: "نشط", color: "bg-emerald-500" },
  { v: "expired", l: "منتهي", color: "bg-red-500" },
  { v: "cancelled", l: "ملغي", color: "bg-gray-500" },
  { v: "suspended", l: "موقوف", color: "bg-amber-500" },
];

const AGREEMENT_OPTS = [
  { v: "one_time", l: "مرة واحدة", months: 0 },
  { v: "monthly", l: "شهري", months: 1 },
  { v: "annual", l: "سنوي", months: 12 },
];

const CURRENCY_OPTS = [
  { v: "ILS", l: "₪ شيكل" },
  { v: "USD", l: "$ دولار" },
  { v: "JOD", l: "د.أ دينار" },
  { v: "EUR", l: "€ يورو" },
];

interface Plan {
  id: string;
  name: string;
  name_ar?: string;
  plan_key: string;
  tier: string;
  monthly_price: number;
  annual_price?: number;
  enabled_modules: string[];
  max_users?: number;
  max_invoices_per_month?: number;
}

interface Sub {
  id: string;
  plan_id: string;
  status: string;
  billing_cycle: string;
  current_period_start?: string;
  current_period_end?: string;
  trial_ends_at?: string | null;
  custom_amount?: number | null;
  custom_currency?: string | null;
  agreement_type?: string | null;
  display_name?: string;
  email?: string;
  user_id?: string;
  plans?: Plan;
}

interface Props {
  sub: Sub | null;
  plans: Plan[];
  open: boolean;
  onClose: () => void;
  onSave: (payload: any) => Promise<{ cascaded_count?: number } | void>;
}

const fmtDate = (s?: string | null) => (s ? format(new Date(s), "dd/MM/yyyy") : "—");

export default function SubscriptionEditDialog({ sub, plans, open, onClose, onSave }: Props) {
  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState("");
  const [billing, setBilling] = useState("monthly");
  const [agreement, setAgreement] = useState("monthly");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [customCurrency, setCustomCurrency] = useState("ILS");
  const [teamCount, setTeamCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Initialize from sub
  useEffect(() => {
    if (!sub) return;
    setPlanId(sub.plan_id);
    setStatus(sub.status);
    setBilling(sub.billing_cycle || "monthly");
    setAgreement(sub.agreement_type || sub.billing_cycle || "monthly");
    setPeriodStart(sub.current_period_start ? sub.current_period_start.split("T")[0] : new Date().toISOString().split("T")[0]);
    setPeriodEnd(sub.current_period_end ? sub.current_period_end.split("T")[0] : "");
    setCustomAmount(sub.custom_amount ? String(sub.custom_amount) : "");
    setCustomCurrency(sub.custom_currency || "ILS");

    // Fetch team size
    if (sub.user_id) {
      supabase.from("profiles").select("user_id", { count: "exact", head: true }).eq("invited_by", sub.user_id)
        .then(({ count }) => setTeamCount(count ?? 0));
    }
  }, [sub]);

  const currentPlan = useMemo(() => plans.find(p => p.id === sub?.plan_id), [plans, sub]);
  const newPlan = useMemo(() => plans.find(p => p.id === planId), [plans, planId]);

  // Auto-recompute period_end when start or agreement changes
  const recomputeEnd = (startStr: string, agr: string) => {
    if (!startStr) return;
    const m = AGREEMENT_OPTS.find(a => a.v === agr)?.months ?? 0;
    if (m === 0) return; // one_time keeps user-entered
    const d = new Date(startStr + "T00:00:00Z");
    const end = addMonths(d, m);
    end.setUTCDate(end.getUTCDate() - 1); // inclusive period
    setPeriodEnd(end.toISOString().split("T")[0]);
  };

  const handleAgreementChange = (v: string) => {
    setAgreement(v);
    if (v === "annual") setBilling("annual");
    else if (v === "monthly") setBilling("monthly");
    recomputeEnd(periodStart, v);
  };

  const handleStartChange = (v: string) => {
    setPeriodStart(v);
    recomputeEnd(v, agreement);
  };

  // Quick actions
  const extendOneYear = () => {
    const today = new Date().toISOString().split("T")[0];
    setPeriodStart(today);
    setAgreement("annual");
    setBilling("annual");
    setStatus("active");
    recomputeEnd(today, "annual");
  };
  const extendOneMonth = () => {
    const today = new Date().toISOString().split("T")[0];
    setPeriodStart(today);
    setAgreement("monthly");
    setBilling("monthly");
    setStatus("active");
    recomputeEnd(today, "monthly");
  };

  // Diff calculation
  const diff = useMemo(() => {
    if (!sub) return [];
    const items: { label: string; from: string; to: string; impact?: "up" | "down" | "neutral" }[] = [];
    if (sub.plan_id !== planId) {
      const oldP = currentPlan?.name ?? "—";
      const newP = newPlan?.name ?? "—";
      const oldTier = currentPlan?.tier ?? "";
      const newTier = newPlan?.tier ?? "";
      const tierRank: Record<string, number> = { basic: 0, pro: 1, enterprise: 2 };
      const impact = tierRank[newTier] > tierRank[oldTier] ? "up" : tierRank[newTier] < tierRank[oldTier] ? "down" : "neutral";
      items.push({ label: "الباقة", from: oldP, to: newP, impact });
    }
    if (sub.status !== status) {
      items.push({ label: "الحالة", from: STATUS_OPTS.find(s => s.v === sub.status)?.l ?? sub.status, to: STATUS_OPTS.find(s => s.v === status)?.l ?? status });
    }
    if ((sub.billing_cycle || "") !== billing) {
      items.push({ label: "الدورة", from: sub.billing_cycle === "annual" ? "سنوي" : "شهري", to: billing === "annual" ? "سنوي" : "شهري" });
    }
    if ((sub.agreement_type || sub.billing_cycle || "") !== agreement) {
      items.push({ label: "نوع الاتفاق", from: AGREEMENT_OPTS.find(a => a.v === (sub.agreement_type || sub.billing_cycle))?.l ?? "—", to: AGREEMENT_OPTS.find(a => a.v === agreement)?.l ?? "—" });
    }
    const oldStart = sub.current_period_start?.split("T")[0] ?? "";
    if (oldStart !== periodStart) {
      items.push({ label: "تاريخ البداية", from: fmtDate(sub.current_period_start), to: periodStart ? format(new Date(periodStart), "dd/MM/yyyy") : "—" });
    }
    const oldEnd = sub.current_period_end?.split("T")[0] ?? "";
    if (oldEnd !== periodEnd) {
      items.push({ label: "تاريخ الانتهاء", from: fmtDate(sub.current_period_end), to: periodEnd ? format(new Date(periodEnd), "dd/MM/yyyy") : "—" });
    }
    const oldAmt = sub.custom_amount ? String(sub.custom_amount) : "";
    if (oldAmt !== customAmount) {
      items.push({ label: "المبلغ", from: oldAmt || "—", to: customAmount || "—" });
    }
    if ((sub.custom_currency || "ILS") !== customCurrency) {
      items.push({ label: "العملة", from: sub.custom_currency || "ILS", to: customCurrency });
    }
    return items;
  }, [sub, planId, status, billing, agreement, periodStart, periodEnd, customAmount, customCurrency, currentPlan, newPlan]);

  // Module changes
  const moduleChanges = useMemo(() => {
    const oldSet = new Set(currentPlan?.enabled_modules ?? []);
    const newSet = new Set(newPlan?.enabled_modules ?? []);
    const added = [...newSet].filter(m => !oldSet.has(m));
    const removed = [...oldSet].filter(m => !newSet.has(m));
    return { added, removed };
  }, [currentPlan, newPlan]);

  // Days remaining preview
  const daysRemaining = useMemo(() => {
    if (!periodEnd) return null;
    return differenceInDays(new Date(periodEnd), new Date());
  }, [periodEnd]);

  const oldDaysRemaining = useMemo(() => {
    if (!sub?.current_period_end) return null;
    return differenceInDays(new Date(sub.current_period_end), new Date());
  }, [sub]);

  const hasChanges = diff.length > 0;

  const handleSave = async () => {
    if (!sub) return;
    setSaving(true);
    try {
      await onSave({
        subscription_id: sub.id,
        plan_id: planId,
        status,
        billing_cycle: billing,
        agreement_type: agreement,
        period_start: periodStart || undefined,
        period_end: periodEnd || undefined,
        custom_amount: customAmount ? Number(customAmount) : null,
        custom_currency: customCurrency,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!sub) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] p-0 overflow-hidden bg-white" dir="rtl">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-200 bg-gradient-to-l from-amber-50 to-white">
          <DialogTitle className="text-xl text-gray-900 flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            تعديل اشتراك
            <span className="text-sm font-normal text-gray-500">— {sub.display_name || sub.email}</span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(92vh-180px)]">
          <div className="px-6 py-5 space-y-5">
            {/* ── Current State Snapshot ── */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">الحالة الحالية</h4>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-[11px] text-gray-500 mb-0.5">الباقة</div>
                  <div className="font-semibold text-gray-900">{currentPlan?.name ?? "—"}</div>
                  <div className="text-[11px] text-gray-500">₪{currentPlan?.monthly_price ?? 0}/شهر</div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500 mb-0.5">الحالة</div>
                  <Badge className={`${STATUS_OPTS.find(s => s.v === sub.status)?.color ?? "bg-gray-500"} text-white text-[10px]`}>
                    {STATUS_OPTS.find(s => s.v === sub.status)?.l ?? sub.status}
                  </Badge>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500 mb-0.5">الفترة</div>
                  <div className="font-medium text-gray-900 text-xs">{fmtDate(sub.current_period_start)} → {fmtDate(sub.current_period_end)}</div>
                  {oldDaysRemaining !== null && (
                    <div className={`text-[11px] ${oldDaysRemaining > 30 ? "text-emerald-600" : oldDaysRemaining > 0 ? "text-amber-600" : "text-red-600"}`}>
                      {oldDaysRemaining > 0 ? `${oldDaysRemaining} يوم متبقي` : "منتهية"}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] text-gray-500 mb-0.5 flex items-center gap-1"><Users className="w-3 h-3" />الفريق</div>
                  <div className="font-semibold text-gray-900">{teamCount === null ? "..." : `${teamCount} عضو`}</div>
                  {teamCount && teamCount > 0 && <div className="text-[11px] text-amber-600">سيتم تحديثهم</div>}
                </div>
              </div>
            </div>

            {/* ── Quick Actions ── */}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={extendOneYear} className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                <Zap className="w-3.5 h-3.5" /> تفعيل سنة كاملة
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={extendOneMonth} className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50">
                <CalendarIcon className="w-3.5 h-3.5" /> تفعيل شهر
              </Button>
            </div>

            <Separator />

            {/* ── Plan ── */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-2">الباقة</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {plans.map(p => {
                  const selected = planId === p.id;
                  const isCurrent = sub.plan_id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlanId(p.id)}
                      className={`text-right px-3 py-2.5 rounded-lg border-2 transition-all ${
                        selected
                          ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`font-bold text-sm ${selected ? "text-amber-700" : "text-gray-900"}`}>{p.name}</span>
                        {isCurrent && <Badge variant="secondary" className="text-[9px] h-4 px-1.5">حالي</Badge>}
                      </div>
                      <div className="text-[11px] text-gray-500">₪{p.monthly_price}/شهر · {p.tier}</div>
                    </button>
                  );
                })}
              </div>

              {/* Module changes preview */}
              {(moduleChanges.added.length > 0 || moduleChanges.removed.length > 0) && (
                <div className="mt-3 p-3 rounded-lg bg-gradient-to-l from-blue-50 to-purple-50 border border-blue-100">
                  {moduleChanges.added.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[11px] font-semibold text-emerald-700 mb-1.5 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> ميزات ستُفعَّل ({moduleChanges.added.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {moduleChanges.added.map(m => (
                          <Badge key={m} className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">
                            + {MODULE_LABELS[m] ?? m}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {moduleChanges.removed.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold text-red-700 mb-1.5 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> ميزات ستُقفَل ({moduleChanges.removed.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {moduleChanges.removed.map(m => (
                          <Badge key={m} variant="outline" className="border-red-200 text-red-700 text-[10px]">
                            − {MODULE_LABELS[m] ?? m}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Status ── */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-2">الحالة</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTS.map(s => (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setStatus(s.v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all flex items-center gap-1.5 ${
                      status === s.v ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${s.color}`} />
                    {s.l}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Agreement type ── */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-2">نوع الاتفاق</label>
              <div className="flex flex-wrap gap-2">
                {AGREEMENT_OPTS.map(a => (
                  <button
                    key={a.v}
                    type="button"
                    onClick={() => handleAgreementChange(a.v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                      agreement === a.v ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {a.l}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Dates ── */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5">تاريخ البداية</label>
                <Input type="date" value={periodStart} onChange={e => handleStartChange(e.target.value)} className="text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5 flex items-center justify-between">
                  <span>تاريخ الانتهاء</span>
                  {daysRemaining !== null && (
                    <span className={`text-[10px] font-normal ${daysRemaining > 30 ? "text-emerald-600" : daysRemaining > 0 ? "text-amber-600" : "text-red-600"}`}>
                      {daysRemaining > 0 ? `${daysRemaining} يوم` : "منتهية"}
                    </span>
                  )}
                </label>
                <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="text-sm" />
              </div>
            </div>

            {/* ── Amount + Currency ── */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5">المبلغ المتفق عليه</label>
                <Input type="number" value={customAmount} onChange={e => setCustomAmount(e.target.value)} placeholder={newPlan ? String(billing === "annual" ? newPlan.annual_price ?? newPlan.monthly_price * 12 : newPlan.monthly_price) : "0"} className="text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-700 block mb-1.5">العملة</label>
                <div className="flex flex-wrap gap-2">
                  {CURRENCY_OPTS.map(c => (
                    <button
                      key={c.v}
                      type="button"
                      onClick={() => setCustomCurrency(c.v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                        customCurrency === c.v ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {c.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── What will change ── */}
            {hasChanges && (
              <div className="rounded-xl border-2 border-amber-200 bg-amber-50/50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-amber-600" />
                  <h4 className="text-sm font-bold text-amber-900">ملخّص التغييرات ({diff.length})</h4>
                </div>
                <div className="space-y-1.5">
                  {diff.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-white rounded-md px-3 py-1.5 border border-amber-100">
                      <span className="font-semibold text-gray-700 min-w-[90px]">{d.label}:</span>
                      <span className="text-gray-500 line-through">{d.from}</span>
                      <ArrowLeft className="w-3 h-3 text-amber-500" />
                      <span className="font-bold text-amber-700">{d.to}</span>
                      {d.impact === "up" && <Badge className="bg-emerald-100 text-emerald-700 text-[9px] h-4">ترقية ↑</Badge>}
                      {d.impact === "down" && <Badge className="bg-red-100 text-red-700 text-[9px] h-4">تخفيض ↓</Badge>}
                    </div>
                  ))}
                </div>
                {teamCount && teamCount > 0 && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-amber-800 bg-amber-100/70 rounded-md px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    سيتم تطبيق نفس التغييرات على <strong>{teamCount} عضو</strong> من الفريق تلقائياً.
                  </div>
                )}
                {moduleChanges.removed.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-red-800 bg-red-100/70 rounded-md px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    سيفقد المستخدم الوصول إلى <strong>{moduleChanges.removed.length}</strong> ميزة.
                  </div>
                )}
              </div>
            )}

            {!hasChanges && (
              <div className="text-center text-xs text-gray-400 py-3">لا توجد تغييرات بعد</div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <Button variant="ghost" onClick={onClose} disabled={saving} className="text-gray-600">إلغاء</Button>
          <Button onClick={handleSave} disabled={!hasChanges || saving} className="bg-amber-500 hover:bg-amber-600 text-black gap-1.5">
            {saving ? "جارٍ الحفظ..." : hasChanges ? `حفظ ${diff.length} تغيير` : "لا تغييرات"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
