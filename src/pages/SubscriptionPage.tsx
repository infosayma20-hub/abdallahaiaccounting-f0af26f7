import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Check, AlertTriangle, Users, Building2, Monitor, DollarSign, MapPin, ChevronDown, Minus, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import PaymentModal from "@/components/billing/PaymentModal";
import PageHeader from "@/components/layout/PageHeader";

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

type BillingCycle = "monthly" | "annual";

const addonsConfig = [
  { key: "extra_payroll", icon: DollarSign, label: "كشف رواتب", desc: "عدد الموظفين من الموارد البشرية", priceMonth: 10, priceYear: 120, unit: "موظف" },
  { key: "extra_pos", icon: Monitor, label: "نقاط البيع", desc: "عدد مستخدمي نقاط البيع", priceMonth: 50, priceYear: 600, unit: "مستخدم" },
  { key: "extra_users", icon: Users, label: "مستخدمين", desc: "عدد مستخدمي النظام الإضافيين", priceMonth: 20, priceYear: 240, unit: "مستخدم" },
  { key: "extra_branches", icon: MapPin, label: "مواقع", desc: "عدد المواقع الإضافية", priceMonth: 40, priceYear: 480, unit: "موقع" },
];

const planFeatures: Record<string, string[]> = {
  starter: [
    "عدد المستخدمين (1 مستخدم)",
    "عدد الفروع (1 فرع)",
    "الفوترة الإلكترونية (المرحلة الأولى)",
    "إدارة مبيعات أساسية",
    "إدارة المنتجات والخدمات",
    "شجرة الحسابات",
    "قيود محاسبية يدوية",
    "تقارير أساسية",
    "دعم 24/7",
  ],
  professional: [
    "عدد المستخدمين (3 مستخدمين)",
    "عدد الفروع (3 فروع)",
    "الفوترة الإلكترونية (المرحلة الأولى والثانية)",
    "إدارة المبيعات",
    "إدارة المنتجات والخدمات",
    "إدارة المشتريات",
    "إدارة الفروع والمخزون",
    "جميع التقارير",
    "الربط الإلكتروني",
  ],
  enterprise: [
    "عدد المستخدمين (5 مستخدمين)",
    "عدد الفروع (5 فروع)",
    "الفوترة الإلكترونية (المرحلة الأولى والثانية)",
    "إدارة أوامر التصنيع والمنتجات المجمعة",
    "إدارة الأصول الثابتة",
    "إدارة الموازنات",
    "الأبعاد المحاسبية",
    "المعاملات المتكررة",
  ],
};

const faqItems = [
  { q: "هل يمكنني تجربة الباقات قبل الاشتراك؟", a: "نعم! نقدم تجربة مجانية لمدة 14 يوماً تشمل جميع الميزات. يمكنك الاشتراك في أي وقت خلال أو بعد الفترة التجريبية." },
  { q: "كيفية الاشتراك في البرنامج في حال كنت استخدم التجربة المجانية؟", a: "يمكنك الترقية مباشرة من هذه الصفحة باختيار الباقة المناسبة والضغط على 'اشترك الآن'. سيتم تحويلك لإتمام الدفع." },
  { q: "هل يمكنني تغيير باقتي في أي وقت؟", a: "بالتأكيد! يمكنك الترقية أو تخفيض باقتك في أي وقت. سيتم احتساب الفرق تلقائياً." },
  { q: "ما هي طرق الدفع المتاحة؟", a: "نقبل بطاقات الائتمان (Visa, MasterCard)، التحويل البنكي، وخدمات الدفع الإلكتروني المحلية." },
  { q: "هل الأسعار شاملة ضريبة القيمة المضافة؟", a: "الأسعار المعروضة غير شاملة ضريبة القيمة المضافة. سيتم إضافة الضريبة عند إتمام الدفع حسب البلد." },
];

const SubscriptionPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscription, loading, refresh } = useSubscription();
  const [plans, setPlans] = useState<any[]>([]);
  const [showCancel, setShowCancel] = useState(false);
  const [paymentModal, setPaymentModal] = useState<any>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("annual");
  const [addonCounts, setAddonCounts] = useState<Record<string, number>>({});
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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
      trial: { bg: "bg-info/10", text: "text-info", label: "تجربة مجانية 🎁" },
      trialing: { bg: "bg-info/10", text: "text-info", label: "تجربة مجانية 🎁" },
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

  const updateAddon = (key: string, delta: number) => {
    setAddonCounts(prev => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) + delta) }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Order plans: starter on right, professional middle, enterprise left (RTL)
  const orderedPlans = [...plans].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  return (
    <div className="min-h-full pb-20" dir="rtl" style={{ fontFamily: "Tajawal, sans-serif" }}>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-10">

        {/* Breadcrumb + Banner */}
        <PageHeader title="ما الباقة التي تناسبك؟" breadcrumb={["إعدادات", "إعدادات الاشتراكات", "ما الباقة التي تناسبك؟"]} />

        {/* Current Plan Hero */}
        {subscription && (
          <div className="rounded-2xl p-7 text-white" style={{ backgroundColor: "#1B3A5C" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-medium">{subscription.plan_name_ar}</h2>
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
              <div className="h-2.5 bg-white/15 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: "#5B9BD5" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 1 }}
                />
              </div>
              <p className="text-xs text-white/50 mt-1.5">
                {subscription.daysLeft > 0 ? `متبقي ${subscription.daysLeft} يوم` : "انتهت الفترة"}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-5">
              {subscription.isTrial && (
                <button
                  onClick={() => document.getElementById("plans-section")?.scrollIntoView({ behavior: "smooth" })}
                  className="text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: "#5B9BD5" }}
                >
                  اشترك الآن — عرض الخطط
                </button>
              )}
              {subscription.isExpired && (
                <button
                  onClick={() => document.getElementById("plans-section")?.scrollIntoView({ behavior: "smooth" })}
                  className="bg-destructive text-destructive-foreground px-6 py-2.5 rounded-xl text-sm font-medium"
                >
                  تجديد الاشتراك الآن
                </button>
              )}
            </div>
          </div>
        )}

        {/* Billing Cycle Toggle */}
        <div id="plans-section" className="flex flex-col items-center gap-3">
          <div className="flex items-center bg-muted/50 rounded-full p-1 border border-border/30">
            <button
              onClick={() => setBillingCycle("annual")}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                billingCycle === "annual"
                  ? "text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={billingCycle === "annual" ? { backgroundColor: "#1B3A5C" } : {}}
            >
              سنوي
            </button>
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                billingCycle === "monthly"
                  ? "text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={billingCycle === "monthly" ? { backgroundColor: "#1B3A5C" } : {}}
            >
              شهري
            </button>
          </div>
          {billingCycle === "annual" && (
            <p className="text-sm px-4 py-1.5 rounded-full border border-border/30 bg-card" style={{ color: "#1B3A5C" }}>
              توفير يصل حتى 20% على الاشتراكات السنوية
            </p>
          )}
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {orderedPlans.map((plan, idx) => {
            const isCurrent = subscription?.plan_key === plan.plan_key;
            const isPro = plan.plan_key === "professional";
            const features = planFeatures[plan.plan_key] || plan.features || [];
            const price = billingCycle === "annual" ? plan.annual_price : plan.monthly_price;
            const monthlyEquiv = billingCycle === "annual" ? (plan.annual_price / 12).toFixed(2) : null;
            const originalMonthly = plan.monthly_price;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`rounded-2xl border-2 bg-card flex flex-col transition-all ${
                  isPro
                    ? "border-[#5B9BD5] shadow-lg relative"
                    : isCurrent
                    ? "border-[#5B9BD5]/50"
                    : "border-border/30 hover:border-[#5B9BD5]/30"
                }`}
              >
                {/* Recommended badge */}
                {isPro && (
                  <div className="text-white text-center py-1.5 text-xs font-medium rounded-t-xl" style={{ backgroundColor: "#5B9BD5" }}>
                    ⭐ موصى به
                  </div>
                )}

                <div className="p-6 flex flex-col flex-1">
                  {/* Plan name */}
                  <h3 className="text-xl font-medium text-foreground">{plan.name_ar}</h3>

                  {/* Savings badge */}
                  {billingCycle === "annual" && (
                    <span className="inline-block mt-2 w-fit text-[11px] px-3 py-0.5 rounded-full font-medium text-white" style={{ backgroundColor: "#5B9BD5" }}>
                      وفر حتى 20% سنوياً
                    </span>
                  )}

                  {/* Price */}
                  <div className="mt-4 mb-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-medium text-foreground tabular-nums">
                        {billingCycle === "annual" ? price.toLocaleString("en-US", { minimumFractionDigits: 2 }) : price}
                      </span>
                      <span className="text-sm text-muted-foreground mr-1">₪</span>
                      <span className="text-sm text-muted-foreground">/ {billingCycle === "annual" ? "سنوياً" : "شهر"}</span>
                    </div>
                    {billingCycle === "annual" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="line-through text-muted-foreground/50">{originalMonthly}</span>
                        {" "}
                        <span style={{ color: "#5B9BD5" }}>{monthlyEquiv} ₪</span>
                        {" / شهرياً"}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">غير شامل ضريبة القيمة المضافة</p>
                  </div>

                  {/* CTA Button */}
                  <button
                    onClick={() => !isCurrent && setPaymentModal({ plan, cycle: billingCycle })}
                    disabled={isCurrent}
                    className={`w-full py-3 rounded-xl text-sm font-medium mt-4 mb-5 transition-all border-2 ${
                      isCurrent
                        ? "border-[#5B9BD5]/30 text-[#5B9BD5] bg-[#5B9BD5]/5 cursor-default"
                        : "border-[#1B3A5C] text-[#1B3A5C] hover:bg-[#1B3A5C] hover:text-white"
                    }`}
                  >
                    {isCurrent ? "خطتك الحالية ✓" : "اشترك الآن"}
                  </button>

                  {/* Intro text */}
                  <p className="text-xs font-medium mb-3" style={{ color: "#5B9BD5" }}>
                    {plan.plan_key === "starter"
                      ? "الأنسب للأعمال الصغيرة جداً ورواد الأعمال المستقلين والمبتدئين."
                      : plan.plan_key === "professional"
                      ? "جميع مزايا الباقة الأساسية بالإضافة إلى:"
                      : "جميع مزايا الباقة الاحترافية بالإضافة إلى:"}
                  </p>

                  {/* Features list */}
                  <div className="space-y-2.5 flex-1">
                    {features.map((f, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "#5B9BD5" }} />
                        <span className="text-sm text-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Addons Section */}
        <div className="space-y-5">
          <h2 className="text-2xl font-medium text-center text-foreground">إضافات أموالي</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {addonsConfig.map((addon) => {
              const count = addonCounts[addon.key] || 0;
              const price = billingCycle === "annual" ? addon.priceYear : addon.priceMonth;
              return (
                <div key={addon.key} className="rounded-2xl border border-border/30 bg-card p-6 flex items-center gap-5">
                  {/* Icon */}
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#1B3A5C10" }}>
                    <addon.icon className="h-7 w-7" style={{ color: "#1B3A5C" }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-medium text-foreground">{addon.label}</h4>
                    <p className="text-xs text-muted-foreground">{addon.desc}</p>
                  </div>

                  {/* Price */}
                  <div className="text-left flex-shrink-0">
                    <p className="text-lg font-medium text-foreground tabular-nums">
                      {price.toFixed(2)} <span className="text-xs text-muted-foreground">₪</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {addon.unit} / {billingCycle === "annual" ? "سنة" : "شهر"}
                    </p>
                  </div>

                  {/* Counter */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => updateAddon(addon.key, -1)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white transition-opacity"
                      style={{ backgroundColor: "#5B9BD5" }}
                      disabled={count === 0}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-10 text-center text-base font-medium tabular-nums text-foreground">{count}</span>
                    <button
                      onClick={() => updateAddon(addon.key, 1)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white transition-opacity"
                      style={{ backgroundColor: "#5B9BD5" }}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Continue button */}
          <div className="flex justify-center">
            <button
              className="px-12 py-3 rounded-xl text-white text-sm font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: Object.values(addonCounts).some(v => v > 0) ? "#1B3A5C" : "#A0AEC0" }}
              disabled={!Object.values(addonCounts).some(v => v > 0)}
            >
              استمرار إلى المعاينة
            </button>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="space-y-5 pt-6">
          <div className="text-center">
            <h2 className="text-2xl font-medium text-foreground">الأسئلة الأكثر شيوعاً</h2>
            <p className="text-sm text-muted-foreground mt-1">كل ما تريد معرفته حول مزايا الاشتراك في أموالي</p>
          </div>

          <div className="max-w-3xl mx-auto space-y-3">
            {faqItems.map((item, i) => (
              <div key={i} className="rounded-2xl border border-border/30 bg-card overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-right"
                >
                  <span className="text-sm font-medium text-foreground">{item.q}</span>
                  <ChevronDown className={`h-5 w-5 text-muted-foreground flex-shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
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
                className="flex-1 text-white py-3 rounded-xl font-medium text-sm"
                style={{ backgroundColor: "#1B3A5C" }}
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
