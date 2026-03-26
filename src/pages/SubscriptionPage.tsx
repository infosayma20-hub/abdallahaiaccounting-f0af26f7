import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, Calendar, CheckCircle, AlertTriangle, Crown, X, Users, Building2, Monitor } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import PaymentModal from "@/components/billing/PaymentModal";

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  invoice_number: string;
  paid_at: string;
  payment_method: string;
  card_last4: string;
  card_brand: string;
}

const addons = [
  { key: "extra_users", icon: Users, label: "مستخدمون إضافيون", desc: "أضف مستخدمين لفريقك", price: 5, unit: "/مستخدم/شهر" },
  { key: "extra_branches", icon: Building2, label: "فروع إضافية", desc: "أضف فروعاً لنشاطك", price: 10, unit: "/فرع/شهر" },
  { key: "pos_terminal", icon: Monitor, label: "نقطة بيع POS", desc: "نظام نقطة بيع متكامل", price: 15, unit: "/جهاز/شهر" },
];

const SubscriptionPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscription, loading, refresh } = useSubscription();
  const [plans, setPlans] = useState<any[]>([]);
  const [showCancel, setShowCancel] = useState(false);
  const [paymentModal, setPaymentModal] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("plans")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setPlans(data || []));
  }, [user]);

  const statusBadge = () => {
    if (!subscription) return null;
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      trial: { bg: "bg-accent/10", text: "text-accent", label: "تجربة مجانية 🎁" },
      trialing: { bg: "bg-accent/10", text: "text-accent", label: "تجربة مجانية 🎁" },
      active: { bg: "bg-success/10", text: "text-success", label: "نشط ✓" },
      expired: { bg: "bg-destructive/10", text: "text-destructive", label: "منتهي" },
      cancelled: { bg: "bg-muted", text: "text-muted-foreground", label: "ملغي" },
      past_due: { bg: "bg-warning/10", text: "text-warning", label: "دفع متأخر ⚠️" },
      grace: { bg: "bg-warning/10", text: "text-warning", label: "فترة سماح ⚠️" },
    };
    const s = styles[subscription.status] || styles.active;
    return <span className={`${s.bg} ${s.text} px-3 py-1 rounded-full text-xs font-medium`}>{s.label}</span>;
  };

  const handleCancel = async () => {
    if (!subscription) return;
    await supabase
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", subscription.id);
    toast.success("تم إلغاء الاشتراك. ستستمر في الوصول حتى نهاية الفترة الحالية.");
    setShowCancel(false);
    refresh();
  };

  const progressPct = subscription ? Math.min(100, ((subscription.totalDays - subscription.daysLeft) / subscription.totalDays) * 100) : 0;
  const progressColor = subscription
    ? subscription.daysLeft > subscription.totalDays * 0.5 ? "hsl(var(--info))"
      : subscription.daysLeft > subscription.totalDays * 0.2 ? "hsl(var(--warning))"
      : "hsl(var(--destructive))"
    : "hsl(var(--info))";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-full pb-20" dir="rtl" style={{ fontFamily: "Tajawal, sans-serif" }}>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <h1 className="text-2xl font-medium text-foreground">إدارة الاشتراك</h1>

        {/* Current Plan Hero */}
        {subscription && (
          <div className="rounded-2xl p-7 text-primary-foreground" style={{ background: "linear-gradient(135deg, hsl(213 50% 11%) 0%, hsl(192 100% 28%) 100%)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-medium">{subscription.plan_name_ar}</h2>
                <p className="text-sm opacity-60 mt-1">
                  {subscription.billing_cycle === "annual" ? "اشتراك سنوي" : subscription.isTrial ? "تجربة مجانية" : "اشتراك شهري"}
                </p>
              </div>
              {statusBadge()}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm opacity-70 mb-5">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>بدأ في: {new Date(subscription.current_period_start).toLocaleDateString("ar-EG")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>ينتهي في: {new Date(subscription.current_period_end).toLocaleDateString("ar-EG")}</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-2">
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: progressColor }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 1 }}
                />
              </div>
              <p className="text-xs opacity-60 mt-1.5">
                {subscription.daysLeft > 0 ? `متبقي ${subscription.daysLeft} يوم` : "انتهت الفترة"}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-5">
              {subscription.isTrial && (
                <button
                  onClick={() => navigate("/pricing")}
                  className="bg-accent text-accent-foreground px-6 py-2.5 rounded-xl text-sm font-medium hover:scale-[1.02] transition-transform"
                >
                  اشترك الآن — عرض الخطط
                </button>
              )}
              {subscription.status === "active" && subscription.billing_cycle === "monthly" && (
                <button
                  onClick={() => navigate("/pricing")}
                  className="border border-accent text-accent px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-accent/10"
                >
                  التحويل للسنوي وتوفير 20%
                </button>
              )}
              {subscription.isExpired && (
                <button
                  onClick={() => navigate("/pricing")}
                  className="bg-destructive text-destructive-foreground px-6 py-2.5 rounded-xl text-sm font-medium animate-pulse"
                >
                  تجديد الاشتراك الآن
                </button>
              )}
            </div>
          </div>
        )}

        {!subscription && (
          <div className="bg-card border border-border/30 rounded-2xl p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground mb-2">لا يوجد اشتراك نشط</h3>
            <p className="text-sm text-muted-foreground mb-4">اشترك الآن للوصول إلى جميع ميزات QOYOD قيود</p>
            <button
              onClick={() => navigate("/pricing")}
              className="bg-accent text-accent-foreground px-8 py-3 rounded-xl font-medium"
            >
              عرض الخطط
            </button>
          </div>
        )}

        {/* Change Plan */}
        <div>
          <h3 className="text-lg font-medium text-foreground mb-4">تغيير خطتك</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrent = subscription?.plan_key === plan.plan_key;
              const isPro = plan.plan_key === "professional";
              return (
                <div
                  key={plan.id}
                  className={`rounded-2xl border-2 p-5 transition-all cursor-pointer ${
                    isCurrent ? "border-accent bg-accent/5" : isPro ? "border-primary/30 bg-card hover:border-accent/50" : "border-border/30 bg-card hover:border-primary/20"
                  }`}
                  onClick={() => !isCurrent && setPaymentModal({ plan, cycle: "monthly" })}
                >
                  {isPro && !isCurrent && (
                    <span className="inline-block mb-2 text-[10px] bg-accent/10 text-accent px-2.5 py-0.5 rounded-full font-medium">
                      ⭐ موصى به
                    </span>
                  )}
                  <h4 className="font-medium text-foreground">{plan.name_ar}</h4>
                  <p className="text-2xl font-medium text-foreground mt-2" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <span className="text-sm text-muted-foreground">$</span>
                    {plan.monthly_price}
                    <span className="text-sm text-muted-foreground">/شهر</span>
                  </p>
                  {isCurrent && (
                    <span className="inline-block mt-2 text-xs bg-accent/10 text-accent px-3 py-1 rounded-full font-medium">
                      خطتك الحالية ✓
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Addons */}
        <div>
          <h3 className="text-lg font-medium text-foreground mb-4">إضافات منفصلة</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {addons.map((addon) => (
              <div key={addon.key} className="rounded-2xl border border-border/30 bg-card p-5 hover:border-primary/20 transition-all">
                <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center mb-3">
                  <addon.icon className="h-5 w-5 text-primary" />
                </div>
                <h4 className="text-sm font-medium text-foreground">{addon.label}</h4>
                <p className="text-xs text-muted-foreground mt-1">{addon.desc}</p>
                <p className="text-lg font-medium text-foreground mt-3" style={{ fontVariantNumeric: "tabular-nums" }}>
                  ${addon.price}
                  <span className="text-xs text-muted-foreground mr-1">{addon.unit}</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Cancel */}
        {subscription && subscription.status !== "cancelled" && subscription.status !== "expired" && (
          <div className="text-center pt-8 border-t border-border/20">
            <button onClick={() => setShowCancel(true)} className="text-sm text-destructive hover:text-destructive/80">
              إلغاء الاشتراك
            </button>
          </div>
        )}
      </div>

      {/* Cancel confirmation */}
      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-3xl p-8 max-w-md mx-4 text-center" style={{ fontFamily: "Tajawal" }}>
            <h3 className="text-xl font-medium text-foreground mb-3">هل أنت متأكد من إلغاء اشتراكك؟</h3>
            <p className="text-sm text-muted-foreground mb-6">ستفقد الوصول إلى جميع المميزات بعد انتهاء الفترة الحالية</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancel(false)}
                className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-medium text-sm"
              >
                لا، أبقِ اشتراكي
              </button>
              <button
                onClick={handleCancel}
                className="flex-1 border-2 border-destructive text-destructive py-3 rounded-xl font-medium text-sm hover:bg-destructive/5"
              >
                نعم، إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentModal && (
        <PaymentModal
          plan={paymentModal.plan}
          billingCycle={paymentModal.cycle}
          onClose={() => setPaymentModal(null)}
          onSuccess={() => {
            setPaymentModal(null);
            refresh();
          }}
        />
      )}
    </div>
  );
};

export default SubscriptionPage;
