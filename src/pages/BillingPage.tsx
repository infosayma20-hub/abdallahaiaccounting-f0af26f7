import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, CheckCircle, AlertTriangle, Crown, Zap, Building2, Shield, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import PaymentModal from "@/components/billing/PaymentModal";

interface Plan {
  id: string;
  name: string;
  name_ar: string;
  plan_key: string;
  tier?: string;
  monthly_price: number;
  annual_price?: number;
  annual_discount_pct: number;
  max_users: number;
  max_companies: number;
  features: any;
  enabled_modules?: string[];
  is_featured?: boolean;
  sort_order?: number;
}

const TIER_TAGLINES: Record<string, string> = {
  basic: "للأعمال الصغيرة والناشئة",
  pro: "للشركات المتوسطة والنامية",
  enterprise: "للمؤسسات الكبيرة",
};

const TIER_ICONS: Record<string, { Icon: React.ElementType; color: string }> = {
  basic: { Icon: Zap, color: "#10B981" },
  pro: { Icon: Crown, color: "#3B82F6" },
  enterprise: { Icon: Building2, color: "#8B5CF6" },
};

const FAQ_ITEMS = [
  { q: "هل يمكنني تغيير باقتي في أي وقت؟", a: "نعم، يمكنك الترقية أو التخفيض في أي وقت. عند الترقية يُحتسب الفرق تناسبياً." },
  { q: "ماذا يحدث بعد انتهاء التجربة؟", a: "بياناتك تبقى محفوظة، لكن بعض الميزات تصبح محدودة (Read-Only) حتى تشترك." },
  { q: "ما هي طرق الدفع المتاحة؟", a: "نقبل بطاقات Visa و Mastercard والتحويل البنكي للباقات السنوية." },
  { q: "هل بياناتي آمنة؟", a: "بالتأكيد — تشفير SSL 256-bit ونسخ احتياطية يومية." },
];

const BillingPage = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { subscription, loading, refresh } = useSubscription();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");
  const [plansLoading, setPlansLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [paymentModal, setPaymentModal] = useState<{ plan: Plan; cycle: "monthly" | "annual" } | null>(null);

  const reason = searchParams.get("reason");

  useEffect(() => {
    supabase
      .from("plans")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        setPlans((data as Plan[]) || []);
        setPlansLoading(false);
      });
  }, []);

  // Group plans by tier — show one card per tier (best plan per tier)
  const tieredPlans = useMemo(() => {
    const tiers: Record<string, Plan> = {};
    plans.forEach((p) => {
      const tier = p.tier || "basic";
      // Pick the highest-priced plan within each tier as the representative
      if (!tiers[tier] || p.monthly_price > tiers[tier].monthly_price) {
        tiers[tier] = p;
      }
    });
    return ["basic", "pro", "enterprise"]
      .map((t) => tiers[t])
      .filter(Boolean);
  }, [plans]);

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
    trialing: { text: "تجربة", color: "hsl(217 91% 60%)", bg: "hsl(217 91% 60% / 0.1)" },
    expired: { text: "منتهي", color: "hsl(0 72% 51%)", bg: "hsl(0 72% 51% / 0.1)" },
    grace: { text: "فترة سماح", color: "hsl(38 92% 50%)", bg: "hsl(38 92% 50% / 0.1)" },
    cancelled: { text: "ملغي", color: "hsl(0 0% 45%)", bg: "hsl(0 0% 45% / 0.1)" },
  };

  const isExpiringSoon = subscription && subscription.daysLeft <= 7 && subscription.daysLeft > 0;

  const handleCancel = async () => {
    if (!subscription) return;
    if (!confirm("هل أنت متأكد من إلغاء اشتراكك؟ ستستمر في الوصول حتى نهاية الفترة الحالية.")) return;
    await supabase
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", subscription.id);
    toast.success("تم إلغاء الاشتراك");
    refresh();
  };

  const handleSubscribe = (plan: Plan) => {
    if (!user) return;
    setPaymentModal({ plan, cycle: billingCycle });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12" dir="rtl">
      {/* Page Header */}
      <div
        className="w-full flex items-center"
        style={{ backgroundColor: "#1B3A5C", borderRadius: 12, borderTop: "3px solid #5B9BD5", padding: "10px 20px", height: 44 }}
      >
        <h1 className="text-right text-white" style={{ fontFamily: "Tajawal, sans-serif", fontSize: 18, fontWeight: 500 }}>
          إعدادات الاشتراكات
        </h1>
      </div>

      {/* Trial Expired Notice */}
      {reason === "trial_expired" && (
        <div className="rounded-2xl p-4 flex items-center gap-3 bg-destructive/10 border border-destructive/30">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-destructive">انتهت فترتك التجريبية</p>
            <p className="text-xs text-muted-foreground mt-0.5">اختر باقة لاستعادة الوصول الكامل لجميع الميزات</p>
          </div>
        </div>
      )}

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

      {/* Plans Section */}
      <div className="bg-card rounded-2xl border border-border/30 p-6 space-y-5">
        <div className="text-center">
          <h3 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Tajawal, sans-serif" }}>اختر الباقة المناسبة لعملك</h3>
          <p className="text-sm text-muted-foreground mt-1">3 باقات مرنة — يمكنك الترقية أو التخفيض في أي وقت</p>
        </div>

        {/* Billing cycle toggle */}
        <div className="flex flex-col items-center gap-2">
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
                "px-6 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2",
                billingCycle === "annual" ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary text-muted-foreground"
              )}
            >
              سنوي
              <span className="bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-full">وفر 20%</span>
            </button>
          </div>
        </div>

        {/* Plan cards — 3 tiers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plansLoading
            ? [1, 2, 3].map((i) => <div key={i} className="h-96 rounded-2xl bg-muted animate-pulse" />)
            : tieredPlans.map((plan, idx) => {
                const tier = plan.tier || "basic";
                const tierConfig = TIER_ICONS[tier] || TIER_ICONS.basic;
                const { Icon } = tierConfig;
                const isFeatured = tier === "pro";
                const isCurrent = subscription?.plan_key === plan.plan_key;
                const monthlyEquiv = billingCycle === "annual" && plan.annual_price
                  ? Math.round((plan.annual_price / 12) * 100) / 100
                  : plan.monthly_price;
                const displayPrice = billingCycle === "annual"
                  ? (plan.annual_price || Math.round(plan.monthly_price * 12 * (1 - (plan.annual_discount_pct || 20) / 100)))
                  : plan.monthly_price;
                const moduleCount = plan.enabled_modules?.length || 0;

                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={cn(
                      "rounded-2xl p-6 border-2 bg-card flex flex-col relative transition-all",
                      isFeatured ? "border-primary shadow-lg md:scale-[1.03] z-10" : "border-border/30 hover:border-primary/40",
                      isCurrent && "ring-2 ring-emerald-500/50"
                    )}
                  >
                    {isFeatured && (
                      <div
                        className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[11px] font-bold text-white whitespace-nowrap shadow-md"
                        style={{ background: tierConfig.color }}
                      >
                        ⭐ الأكثر شيوعاً
                      </div>
                    )}
                    {isCurrent && (
                      <span className="absolute -top-3 right-3 text-[10px] px-3 py-1 rounded-full bg-emerald-500 text-white font-bold shadow-sm">
                        ✓ الباقة الحالية
                      </span>
                    )}

                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="text-lg font-bold text-foreground">{plan.name_ar}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">{TIER_TAGLINES[tier]}</p>
                      </div>
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${tierConfig.color}15` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: tierConfig.color }} />
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-extrabold text-foreground" style={{ fontFamily: "JetBrains Mono" }}>
                          ₪{billingCycle === "annual" ? monthlyEquiv : displayPrice}
                        </span>
                        <span className="text-xs text-muted-foreground">/شهر</span>
                      </div>
                      {billingCycle === "annual" && (
                        <p className="text-[11px] text-emerald-600 mt-1">
                          يُدفع ₪{displayPrice} سنوياً
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">غير شامل ضريبة القيمة المضافة</p>
                    </div>

                    <ul className="space-y-2 mb-5 flex-1">
                      <li className="flex items-center gap-2 text-xs text-foreground">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                        حتى {plan.max_users === -1 ? "غير محدود" : plan.max_users} مستخدمين
                      </li>
                      <li className="flex items-center gap-2 text-xs text-foreground">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                        {plan.max_companies === -1 ? "شركات غير محدودة" : `${plan.max_companies} شركة`}
                      </li>
                      <li className="flex items-center gap-2 text-xs text-foreground">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                        {moduleCount > 0 ? `${moduleCount} موديول مفعّل` : "ميزات أساسية"}
                      </li>
                      {tier === "pro" && (
                        <>
                          <li className="flex items-center gap-2 text-xs text-foreground">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                            نقطة البيع POS + الموارد البشرية
                          </li>
                          <li className="flex items-center gap-2 text-xs text-foreground">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                            المحاسب الذكي بلا حدود
                          </li>
                        </>
                      )}
                      {tier === "enterprise" && (
                        <>
                          <li className="flex items-center gap-2 text-xs text-foreground">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                            جميع الموديولات (الورشات، السياحة، التجارة الإلكترونية)
                          </li>
                          <li className="flex items-center gap-2 text-xs text-foreground">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                            إدارة متعددة الفروع + API
                          </li>
                        </>
                      )}
                    </ul>

                    <button
                      onClick={() => !isCurrent && handleSubscribe(plan)}
                      disabled={isCurrent}
                      className={cn(
                        "w-full py-3 rounded-xl text-sm font-bold transition-all border-2",
                        isCurrent
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default"
                          : isFeatured
                            ? "bg-primary text-primary-foreground border-primary hover:brightness-110 shadow-md"
                            : "bg-white text-primary border-primary hover:bg-primary hover:text-primary-foreground"
                      )}
                    >
                      {isCurrent ? "✓ الباقة الحالية" : "اشترك الآن"}
                    </button>
                  </motion.div>
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

      {/* FAQ */}
      <div className="bg-card rounded-2xl border border-border/30 p-6 space-y-4">
        <h3 className="text-base font-bold text-foreground">الأسئلة الشائعة</h3>
        <div className="space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="border border-border/30 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between p-4 text-right hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium text-foreground">{item.q}</span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", openFaq === i && "rotate-180")} />
              </button>
              <AnimatePresence>
                {openFaq === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <p className="px-4 pb-4 text-xs text-muted-foreground leading-relaxed">{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      {/* Cancel subscription */}
      {subscription && !subscription.isTrial && subscription.status !== "cancelled" && subscription.status !== "expired" && (
        <div className="text-center">
          <button onClick={handleCancel} className="text-xs text-destructive hover:underline">
            إلغاء الاشتراك
          </button>
        </div>
      )}

      {/* Security footer */}
      <div className="flex items-center justify-center gap-3 text-[11px] text-muted-foreground pt-4">
        <Shield className="h-3 w-3" />
        <span>مشفر SSL 256-bit</span>
        <span>•</span>
        <span>نسخ احتياطية يومية</span>
      </div>

      {/* Payment Modal */}
      {paymentModal && (
        <PaymentModal
          plan={paymentModal.plan as any}
          billingCycle={paymentModal.cycle}
          onClose={() => setPaymentModal(null)}
          onSuccess={() => {
            setPaymentModal(null);
            refresh();
            toast.success("تم تفعيل الاشتراك بنجاح!");
          }}
        />
      )}
    </div>
  );
};

export default BillingPage;
