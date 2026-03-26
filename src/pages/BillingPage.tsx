import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, Calendar, CheckCircle, AlertTriangle, Crown, Zap, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  name_ar: string;
  plan_key: string;
  monthly_price: number;
  annual_discount_pct: number;
  max_users: number;
  max_companies: number;
  features: any;
}

const BillingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscription, loading } = useSubscription();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [plansLoading, setPlansLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("plans")
      .select("*")
      .eq("is_active", true)
      .order("display_order")
      .then(({ data }) => {
        setPlans((data as Plan[]) || []);
        setPlansLoading(false);
      });
  }, []);

  const daysElapsed = subscription ? subscription.totalDays - subscription.daysLeft : 0;
  const progressPct = subscription ? Math.min(100, (daysElapsed / subscription.totalDays) * 100) : 0;

  const expiryDate = subscription
    ? new Date(subscription.current_period_end).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })
    : "";
  const startDate = subscription
    ? new Date(subscription.current_period_start).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })
    : "";

  const statusLabel: Record<string, { text: string; color: string; bg: string }> = {
    active: { text: "نشط", color: "hsl(142 76% 36%)", bg: "hsl(142 76% 36% / 0.1)" },
    trial: { text: "تجربة", color: "hsl(217 91% 60%)", bg: "hsl(217 91% 60% / 0.1)" },
    expired: { text: "منتهي", color: "hsl(0 72% 51%)", bg: "hsl(0 72% 51% / 0.1)" },
    grace: { text: "فترة سماح", color: "hsl(38 92% 50%)", bg: "hsl(38 92% 50% / 0.1)" },
    cancelled: { text: "ملغي", color: "hsl(0 0% 45%)", bg: "hsl(0 0% 45% / 0.1)" },
  };

  const planIcons: Record<string, React.ElementType> = {
    starter: Zap,
    growth: Crown,
    business: Building2,
  };

  const isExpiringSoon = subscription && subscription.daysLeft <= 7 && subscription.daysLeft > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12" dir="rtl">
      {/* Page Header */}
      <div className="rounded-2xl px-8 py-6 text-white" style={{ background: "linear-gradient(135deg, #0D1B2A 0%, #1E3A5F 100%)" }}>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "Tajawal, sans-serif" }}>إعدادات الاشتراكات</h1>
      </div>

      {/* Current Plan Card */}
      {subscription && (
        <div
          className={cn("rounded-2xl p-6 relative overflow-hidden", isExpiringSoon && "ring-2 ring-destructive/50 animate-pulse-subtle")}
          style={{ background: "linear-gradient(135deg, hsl(215 78% 15%), hsl(192 100% 28%))" }}
        >
          <div className="relative z-10 text-white space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">{subscription.plan_name_ar}</h2>
                <span
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{
                    background: statusLabel[subscription.status]?.bg || "rgba(255,255,255,0.1)",
                    color: statusLabel[subscription.status]?.color || "white",
                  }}
                >
                  {statusLabel[subscription.status]?.text || subscription.status}
                </span>
              </div>
              {isExpiringSoon && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20">
                  <AlertTriangle className="h-4 w-4 text-red-300" />
                  <span className="text-[11px] font-bold text-red-200">ينتهي قريباً</span>
                </div>
              )}
            </div>

            <p className="text-sm opacity-60">
              {subscription.isTrial ? "فترة تجربة" : subscription.billing_cycle === "annual" ? "اشتراك سنوي" : "اشتراك شهري"}
            </p>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-white/50 text-[11px]">تاريخ البدء</span>
                <p className="font-mono font-bold text-white/90">{startDate}</p>
              </div>
              <div>
                <span className="text-white/50 text-[11px]">تاريخ الانتهاء</span>
                <p className="font-mono font-bold text-white/90">{expiryDate}</p>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-[10px] mb-1.5 opacity-60">
                <span>متبقي {Math.max(0, subscription.daysLeft)} يوم من أصل {subscription.totalDays} يوم</span>
                <span>{Math.round(progressPct)}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${progressPct}%`,
                    background: progressPct > 80 ? "hsl(0 72% 51%)" : progressPct > 60 ? "hsl(38 92% 50%)" : "hsl(142 76% 36%)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Renewal Section */}
      <div className="bg-card rounded-2xl border border-border/30 p-6 space-y-5">
        <h3 className="text-xl font-bold text-foreground text-center" style={{ fontFamily: "Tajawal, sans-serif" }}>ما الباقة التي تناسبك؟</h3>

        {/* Savings notice */}
        {billingCycle === "annual" && (
          <p className="text-center text-sm text-info bg-info/5 rounded-lg py-2 px-4 mx-auto w-fit">
            توفير يصل حتى 20% على الاشتراكات السنوية
          </p>
        )}

        {/* Billing cycle toggle */}
        <div className="flex items-center gap-2 justify-center">
          <button
            onClick={() => setBillingCycle("monthly")}
            className={cn(
              "px-6 py-2.5 rounded-full text-sm font-medium transition-all",
              billingCycle === "monthly" ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary text-muted-foreground"
            )}
          >
            شهري
          </button>
          <button
            onClick={() => setBillingCycle("annual")}
            className={cn(
              "px-6 py-2.5 rounded-full text-sm font-medium transition-all",
              billingCycle === "annual" ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary text-muted-foreground"
            )}
          >
            سنوي
          </button>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {plansLoading
            ? [1, 2, 3].map(i => (
                <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
              ))
            : plans.map(plan => {
                const PlanIcon = planIcons[plan.plan_key] || CreditCard;
                const price = billingCycle === "annual"
                  ? Math.round(plan.monthly_price * 12 * (1 - plan.annual_discount_pct / 100))
                  : plan.monthly_price;
                const isCurrent = subscription?.plan_key === plan.plan_key;

                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "rounded-xl p-5 border-2 transition-all relative",
                      isCurrent
                        ? "border-primary bg-primary/5"
                        : "border-border/30 bg-card hover:border-primary/30"
                    )}
                  >
                    {isCurrent && (
            <span className="absolute -top-3 right-3 text-[10px] px-3 py-1 rounded-full bg-primary text-primary-foreground font-bold shadow-sm">
                        الحزمة الحالية
                      </span>
                    )}
                    <PlanIcon className="h-6 w-6 text-primary mb-3" />
                    <h4 className="text-sm font-bold text-foreground">{plan.name_ar}</h4>
                    <div className="mt-2">
                      <span className="text-2xl font-bold text-foreground" style={{ fontFamily: "JetBrains Mono" }}>
                        ₪{price}
                      </span>
                      <span className="text-xs text-muted-foreground mr-1">
                        /{billingCycle === "annual" ? "سنة" : "شهر"}
                      </span>
                    </div>
                    <ul className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
                      <li className="flex items-center gap-1.5">
                        <CheckCircle className="h-3 w-3 text-emerald-500" />
                        حتى {plan.max_users} مستخدمين
                      </li>
                      <li className="flex items-center gap-1.5">
                        <CheckCircle className="h-3 w-3 text-emerald-500" />
                        {plan.max_companies} شركة
                      </li>
                    </ul>
                    <button
                      className={cn(
                        "w-full mt-4 py-2 rounded-lg text-[12px] font-bold transition-all",
                        isCurrent
                          ? "bg-secondary text-muted-foreground cursor-default"
                          : "bg-primary text-primary-foreground hover:opacity-90"
                      )}
                      disabled={isCurrent}
                    >
                      {isCurrent ? "الحزمة الحالية" : "ترقية"}
                    </button>
                  </div>
                );
              })}
        </div>
      </div>

      {/* Payment History */}
      <div className="bg-card rounded-2xl border border-border/30 p-6 space-y-4">
        <h3 className="text-base font-bold text-foreground flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          سجل المدفوعات
        </h3>
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">لا توجد مدفوعات سابقة</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">ستظهر هنا عند تجديد اشتراكك</p>
        </div>
      </div>
    </div>
  );
};

export default BillingPage;
