import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, Calendar, CheckCircle, AlertTriangle, Download, Crown, X } from "lucide-react";
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

const SubscriptionPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscription, loading, refresh } = useSubscription();
  const [payments, setPayments] = useState<Payment[]>([]);
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
      trial: { bg: "bg-[#C9A84C]/10", text: "text-[#C9A84C]", label: "تجربة مجانية 🎁" },
      trialing: { bg: "bg-[#C9A84C]/10", text: "text-[#C9A84C]", label: "تجربة مجانية 🎁" },
      active: { bg: "bg-green-100", text: "text-green-700", label: "نشط ✓" },
      expired: { bg: "bg-red-100", text: "text-red-700", label: "منتهي" },
      cancelled: { bg: "bg-gray-100", text: "text-gray-700", label: "ملغي" },
      past_due: { bg: "bg-orange-100", text: "text-orange-700", label: "دفع متأخر ⚠️" },
      grace: { bg: "bg-orange-100", text: "text-orange-700", label: "فترة سماح ⚠️" },
    };
    const s = styles[subscription.status] || styles.active;
    return <span className={`${s.bg} ${s.text} px-3 py-1 rounded-full text-xs font-bold`}>{s.label}</span>;
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
    ? subscription.daysLeft > subscription.totalDays * 0.5 ? "#00B4D8"
      : subscription.daysLeft > subscription.totalDays * 0.2 ? "#C9A84C"
      : "#DC2626"
    : "#00B4D8";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="animate-spin w-8 h-8 border-2 border-[#0A2342] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-full pb-20" dir="rtl" style={{ fontFamily: "Tajawal, sans-serif" }}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">إدارة الاشتراك</h1>

        {/* Current Plan Hero */}
        {subscription && (
          <div className="rounded-[20px] p-7 text-white mb-8" style={{ background: "linear-gradient(135deg, #0A2342 0%, #006D8F 100%)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold">{subscription.plan_name_ar}</h2>
                <p className="text-sm text-white/60 mt-1">
                  {subscription.billing_cycle === "annual" ? "اشتراك سنوي" : subscription.isTrial ? "تجربة مجانية" : "اشتراك شهري"}
                </p>
              </div>
              {statusBadge()}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm text-white/70 mb-5">
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
              <p className="text-xs text-white/60 mt-1.5">
                {subscription.daysLeft > 0
                  ? `متبقي ${subscription.daysLeft} يوم`
                  : "انتهت الفترة"
                }
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-5">
              {subscription.isTrial && (
                <button
                  onClick={() => navigate("/pricing")}
                  className="bg-gradient-to-r from-[#C9A84C] to-[#B8972E] text-[#0A2342] px-6 py-2.5 rounded-xl text-sm font-bold hover:scale-[1.02] transition-transform"
                >
                  اشترك الآن — عرض الخطط
                </button>
              )}
              {subscription.status === "active" && subscription.billing_cycle === "monthly" && (
                <button
                  onClick={() => navigate("/pricing")}
                  className="border border-[#C9A84C] text-[#C9A84C] px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-[#C9A84C]/10"
                >
                  التحويل للسنوي وتوفير 24%
                </button>
              )}
              {subscription.isExpired && (
                <button
                  onClick={() => navigate("/pricing")}
                  className="bg-red-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold animate-pulse"
                >
                  تجديد الاشتراك الآن
                </button>
              )}
            </div>
          </div>
        )}

        {!subscription && (
          <div className="bg-card border border-border rounded-2xl p-8 text-center mb-8">
            <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-3" />
            <h3 className="text-lg font-bold text-foreground mb-2">لا يوجد اشتراك نشط</h3>
            <p className="text-sm text-muted-foreground mb-4">اشترك الآن للوصول إلى جميع ميزات QOYOD قيود</p>
            <button
              onClick={() => navigate("/pricing")}
              className="bg-gradient-to-r from-[#C9A84C] to-[#B8972E] text-white px-8 py-3 rounded-xl font-bold"
            >
              عرض الخطط
            </button>
          </div>
        )}

        {/* Change Plan */}
        <h3 className="text-lg font-bold text-foreground mb-4">تغيير خطتك</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {plans.map((plan) => {
            const isCurrent = subscription?.plan_key === plan.plan_key;
            return (
              <div
                key={plan.id}
                className={`rounded-2xl border-2 p-5 transition-all ${
                  isCurrent ? "border-[#C9A84C] bg-[#C9A84C]/5" : "border-border bg-card hover:border-primary/30 cursor-pointer"
                }`}
                onClick={() => !isCurrent && setPaymentModal({ plan, cycle: "monthly" })}
              >
                <h4 className="font-bold text-foreground">{plan.name_ar}</h4>
                <p className="text-2xl font-extrabold text-foreground mt-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  {plan.monthly_price}
                  <span className="text-sm text-muted-foreground">/شهر</span>
                </p>
                {isCurrent && (
                  <span className="inline-block mt-2 text-xs bg-[#C9A84C]/10 text-[#C9A84C] px-3 py-1 rounded-full font-bold">
                    خطتك الحالية ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Cancel */}
        {subscription && subscription.status !== "cancelled" && subscription.status !== "expired" && (
          <div className="text-center pt-8 border-t border-border">
            <button onClick={() => setShowCancel(true)} className="text-sm text-red-500 hover:text-red-700">
              إلغاء الاشتراك
            </button>
          </div>
        )}
      </div>

      {/* Cancel confirmation */}
      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-md mx-4 text-center" style={{ fontFamily: "Tajawal" }}>
            <h3 className="text-xl font-bold text-[#0A2342] mb-3">هل أنت متأكد من إلغاء اشتراكك؟</h3>
            <p className="text-sm text-gray-500 mb-6">ستفقد الوصول إلى جميع المميزات بعد انتهاء الفترة الحالية</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancel(false)}
                className="flex-1 bg-[#0A2342] text-white py-3 rounded-xl font-bold text-sm"
              >
                لا، أبقِ اشتراكي
              </button>
              <button
                onClick={handleCancel}
                className="flex-1 border-2 border-red-500 text-red-500 py-3 rounded-xl font-bold text-sm hover:bg-red-50"
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
