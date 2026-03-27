import { useState, useEffect } from "react";
import BackButton from "@/components/BackButton";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { Check, X, ChevronDown, ChevronUp, Shield, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PaymentModal from "@/components/billing/PaymentModal";

type BillingCycle = "monthly" | "annual";

interface Plan {
  id: string;
  plan_key: string;
  name: string;
  name_ar: string;
  monthly_price: number;
  annual_price: number;
  features: string[];
  limits: any;
  max_users: number;
  max_companies: number;
}

const taglines: Record<string, string> = {
  starter: "للأعمال الصغيرة والناشئة",
  professional: "للشركات النامية",
  enterprise: "للمؤسسات الكبيرة",
};

const planIcons: Record<string, { emoji: string; bg: string }> = {
  starter: { emoji: "🌱", bg: "bg-green-100" },
  professional: { emoji: "🚀", bg: "bg-[#FDF6E3]" },
  enterprise: { emoji: "🏢", bg: "bg-[#0A2342]" },
};

const comparisonData = [
  { category: "المحاسبة الأساسية", features: [
    { label: "شجرة الحسابات", starter: true, professional: true, enterprise: true },
    { label: "دفتر اليومية والقيود", starter: true, professional: true, enterprise: true },
    { label: "ميزان المراجعة", starter: true, professional: true, enterprise: true },
    { label: "المعاملات الشهرية", starter: "500", professional: "غير محدود", enterprise: "غير محدود" },
  ]},
  { category: "المبيعات والمشتريات", features: [
    { label: "فواتير المبيعات", starter: true, professional: true, enterprise: true },
    { label: "فواتير المشتريات", starter: true, professional: true, enterprise: true },
    { label: "إدارة الزبائن والموردين", starter: true, professional: true, enterprise: true },
    { label: "نقطة البيع POS", starter: false, professional: true, enterprise: true },
    { label: "إدارة المخزون", starter: false, professional: true, enterprise: true },
  ]},
  { category: "التقارير والتحليلات", features: [
    { label: "التقارير الأساسية", starter: "10", professional: "63+", enterprise: "غير محدود" },
    { label: "قائمة الدخل والميزانية", starter: true, professional: true, enterprise: true },
    { label: "تحليلات متقدمة و KPI", starter: false, professional: true, enterprise: true },
    { label: "تقارير مخصصة", starter: false, professional: false, enterprise: true },
  ]},
  { category: "الذكاء الاصطناعي", features: [
    { label: "المحاسب الذكي", starter: "50 رسالة/يوم", professional: "غير محدود", enterprise: "غير محدود" },
    { label: "تحليل مستندات بالذكاء", starter: false, professional: true, enterprise: true },
  ]},
  { category: "الإدارة والصلاحيات", features: [
    { label: "عدد المستخدمين", starter: "2", professional: "10", enterprise: "غير محدود" },
    { label: "عدد الشركات", starter: "1", professional: "3", enterprise: "غير محدود" },
    { label: "إدارة الموارد البشرية", starter: false, professional: true, enterprise: true },
    { label: "صلاحيات متقدمة", starter: false, professional: false, enterprise: true },
    { label: "إدارة متعددة الفروع", starter: false, professional: false, enterprise: true },
    { label: "تكامل API", starter: false, professional: true, enterprise: true },
    { label: "White-label", starter: false, professional: false, enterprise: true },
  ]},
  { category: "الدعم الفني", features: [
    { label: "دعم بريد إلكتروني", starter: true, professional: true, enterprise: true },
    { label: "دعم أولوية 24/7", starter: false, professional: true, enterprise: true },
    { label: "مدير حساب مخصص", starter: false, professional: false, enterprise: true },
    { label: "تدريب شخصي", starter: false, professional: false, enterprise: true },
    { label: "SLA اتفاقية مستوى خدمة", starter: false, professional: false, enterprise: true },
  ]},
];

const faqData = [
  { q: "هل يمكنني الإلغاء في أي وقت؟", a: "نعم، يمكنك إلغاء اشتراكك في أي وقت. ستستمر في الوصول إلى حسابك حتى نهاية فترة الفوترة الحالية." },
  { q: "ماذا يحدث بعد انتهاء التجربة المجانية؟", a: "بعد انتهاء الـ 14 يوم المجانية، ستحتاج إلى اختيار خطة مدفوعة للاستمرار. بياناتك ستبقى محفوظة بأمان." },
  { q: "هل بياناتي آمنة؟", a: "بالتأكيد! نستخدم تشفير SSL 256-bit ونسخ احتياطية يومية. بياناتك محمية بأعلى معايير الأمان." },
  { q: "هل يمكنني الترقية أو التخفيض لاحقاً؟", a: "نعم، يمكنك تغيير خطتك في أي وقت. عند الترقية يتم احتساب الفرق تناسبياً، وعند التخفيض يتم التطبيق من الدورة القادمة." },
  { q: "ما هي طرق الدفع المتاحة؟", a: "نقبل بطاقات Visa و Mastercard وPayPal. كما يمكن الدفع بالتحويل البنكي للخطط المؤسسية." },
];

const PricingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { subscription } = useSubscription();
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [paymentModal, setPaymentModal] = useState<{ plan: Plan; cycle: BillingCycle } | null>(null);

  const reason = searchParams.get("reason");

  useEffect(() => {
    supabase
      .from("plans")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data) {
          setPlans(data.map((p: any) => ({
            ...p,
            annual_price: p.annual_price || p.monthly_price * (1 - (p.annual_discount_pct || 0) / 100),
            features: Array.isArray(p.features) ? p.features : [],
            limits: p.limits || {},
          })));
        }
        setLoading(false);
      });
  }, []);

  const getPrice = (plan: Plan) => billing === "annual" ? plan.annual_price : plan.monthly_price;
  const getSavePct = (plan: Plan) => Math.round((1 - plan.annual_price / plan.monthly_price) * 100);

  const getButtonText = (plan: Plan) => {
    if (!user) return "ابدأ التجربة المجانية";
    if (subscription?.plan_key === plan.plan_key) return "خطتك الحالية ✓";
    if (subscription?.isTrial) return "ترقية الآن";
    return "اختر هذه الخطة";
  };

  const isCurrentPlan = (plan: Plan) => subscription?.plan_key === plan.plan_key;

  const handleSelect = (plan: Plan) => {
    if (isCurrentPlan(plan)) return;
    if (!user) {
      navigate(`/auth?plan=${plan.plan_key}`);
      return;
    }
    setPaymentModal({ plan, cycle: billing });
  };

  return (
    <div className="min-h-screen" dir="rtl" style={{ fontFamily: "Tajawal, sans-serif" }}>
      {/* Hero gradient */}
      <div className="relative" style={{ background: "linear-gradient(180deg, #050F1E 0%, #0A2342 45%, #F4F7FA 45%)" }}>
        {/* Reason banners */}
        {reason === "trial_expired" && (
          <div className="bg-red-500 text-white text-center py-3 text-sm font-medium">
            ❌ انتهت فترتك التجريبية — اشترك الآن للاستمرار
          </div>
        )}
        {reason === "expired" && (
          <div className="bg-red-500 text-white text-center py-3 text-sm font-medium">
            ❌ انتهى اشتراكك — جدد الآن لاستعادة الوصول
          </div>
        )}

        <div className="max-w-6xl mx-auto px-5 pt-8 pb-8">
          {/* Back Button */}
          <div className="mb-6">
            <BackButton fallback="/apps" className="bg-white/10 hover:bg-white/20" />
          </div>
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-[32px] font-extrabold text-white mb-3" style={{ fontFamily: "Tajawal" }}>
              <span className="text-[hsl(43,55%,54%)]">AMWALI</span>
            </h1>
            <h2 className="text-[32px] font-extrabold text-white mb-3">
              اختر الخطة المناسبة لعملك
            </h2>
            <p className="text-base text-white/70">
              ابدأ مجاناً لمدة 14 يوماً — لا حاجة لبطاقة ائتمان
            </p>
          </div>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-3 mb-12">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all ${
                billing === "monthly"
                  ? "bg-[#4A9EE8] text-[#0A2342]"
                  : "bg-white/10 text-white/70 hover:bg-white/20"
              }`}
            >
              شهري
            </button>
            <button
              onClick={() => setBilling("annual")}
              className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${
                billing === "annual"
                  ? "bg-[#4A9EE8] text-[#0A2342]"
                  : "bg-white/10 text-white/70 hover:bg-white/20"
              }`}
            >
              سنوي
              <span className="bg-green-500 text-white text-[11px] px-2 py-0.5 rounded-full">
                وفر حتى 31% 🏷️
              </span>
            </button>
          </div>

          {/* Plan Cards */}
          {!loading && (
            <div className="flex flex-col lg:flex-row gap-5 justify-center max-w-[1100px] mx-auto">
              {plans.map((plan, i) => {
                const isPro = plan.plan_key === "professional";
                const icon = planIcons[plan.plan_key] || planIcons.starter;
                const price = getPrice(plan);
                const isCurrent = isCurrentPlan(plan);

                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1, duration: 0.4 }}
                    className={`relative flex-1 rounded-3xl p-8 bg-white transition-all duration-200 ${
                      isPro
                        ? "border-2 border-[#4A9EE8] lg:scale-[1.04] shadow-[0_8px_40px_rgba(10,35,66,0.2)] z-10"
                        : "border-2 border-transparent shadow-[0_4px_20px_rgba(10,35,66,0.1)] hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(10,35,66,0.15)]"
                    }`}
                  >
                    {/* Popular badge */}
                    {isPro && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#4A9EE8] to-[#7BB8F0] text-[#0A2342] px-5 py-1 rounded-full text-xs font-bold whitespace-nowrap">
                        ⭐ الأكثر شيوعاً
                      </div>
                    )}

                    {/* Plan name + tagline */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-[#0A2342]">{plan.name_ar}</h3>
                        <p className="text-xs text-gray-500 mt-1">{taglines[plan.plan_key]}</p>
                      </div>
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${icon.bg}`}>
                        {icon.emoji}
                      </div>
                    </div>

                    {/* Price */}
                    <div className="mb-5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl text-gray-400">$</span>
                        <motion.span
                          key={`${plan.id}-${billing}`}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-5xl font-extrabold text-[#0A2342]"
                        >
                          {price}
                        </motion.span>
                        <span className="text-sm text-gray-400">/شهر</span>
                      </div>
                      {billing === "annual" && (
                        <>
                          <p className="text-sm text-gray-400 line-through mt-1">
                            بدل ${plan.monthly_price}/شهر
                          </p>
                          <p className="text-xs text-green-600 font-medium">
                            يُدفع ${Math.round(price * 12)} سنوياً — وفر {getSavePct(plan)}%
                          </p>
                        </>
                      )}
                    </div>

                    <div className="h-px bg-gray-100 my-5" />

                    {/* Features */}
                    <ul className="space-y-2.5 mb-6">
                      {plan.features.map((f: string, fi: number) => (
                        <li key={fi} className="flex items-start gap-2.5 text-[13px] text-gray-700">
                          <Check className="h-4 w-4 text-teal-500 mt-0.5 shrink-0" />
                          <span className={fi < 2 ? "" : "font-semibold"}>{f}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <button
                      onClick={() => handleSelect(plan)}
                      disabled={isCurrent}
                      className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all ${
                        isCurrent
                          ? "bg-gray-100 text-gray-400 cursor-default"
                          : isPro
                          ? "bg-gradient-to-r from-[#4A9EE8] to-[#B8972E] text-white shadow-[0_4px_15px_rgba(74,158,232,0.4)] hover:scale-[1.02] hover:shadow-[0_6px_20px_rgba(74,158,232,0.5)]"
                          : "border-2 border-[#0A2342] text-[#0A2342] hover:bg-[#0A2342] hover:text-white"
                      }`}
                    >
                      {getButtonText(plan)}
                    </button>

                    {/* Trial note */}
                    {plan.plan_key !== "enterprise" && !isCurrent && (
                      <p className="text-[11px] text-green-600 text-center mt-3">
                        ✓ 14 يوم مجاناً — لا حاجة لبطاقة ائتمان
                      </p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Comparison Table */}
      <div className="max-w-5xl mx-auto px-5 py-16">
        <h3 className="text-xl font-bold text-[#0A2342] text-center mb-8">
          مقارنة تفصيلية بين الخطط
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="py-3 px-4 text-right text-gray-500 font-medium w-1/3">الميزة</th>
                <th className="py-3 px-4 text-center font-bold text-[#0A2342]">المبتدئ</th>
                <th className="py-3 px-4 text-center font-bold text-[#4A9EE8]">الاحترافي</th>
                <th className="py-3 px-4 text-center font-bold text-[#0A2342]">المؤسسي</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((group, gi) => (
                <>
                  <tr key={`cat-${gi}`} className="bg-gray-50">
                    <td colSpan={4} className="py-2.5 px-4 font-bold text-[#0A2342] text-[13px]">
                      {group.category}
                    </td>
                  </tr>
                  {group.features.map((f, fi) => (
                    <tr key={`f-${gi}-${fi}`} className="border-b border-gray-100">
                      <td className="py-2.5 px-4 text-gray-600">{f.label}</td>
                      {(["starter", "professional", "enterprise"] as const).map((pk) => (
                        <td key={pk} className="py-2.5 px-4 text-center">
                          {typeof f[pk] === "boolean" ? (
                            f[pk] ? (
                              <Check className="h-4 w-4 text-green-500 mx-auto" />
                            ) : (
                              <X className="h-4 w-4 text-gray-300 mx-auto" />
                            )
                          ) : (
                            <span className="text-[13px] font-medium text-[#0A2342]">{f[pk]}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto px-5 pb-20">
        <h3 className="text-xl font-bold text-[#0A2342] text-center mb-8">
          الأسئلة الشائعة
        </h3>
        <div className="space-y-3">
          {faqData.map((faq, i) => (
            <div key={i} className="border border-gray-200 rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-right hover:bg-gray-50 transition-colors"
              >
                <span className="font-bold text-[#0A2342] text-sm">{faq.q}</span>
                {openFaq === i ? (
                  <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                )}
              </button>
              <AnimatePresence>
                {openFaq === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-5 text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      {/* Security Footer */}
      <div className="text-center pb-10">
        <div className="flex items-center justify-center gap-3 text-xs text-gray-400">
          <Shield className="h-4 w-4" />
          <span>مشفر بـ SSL 256-bit</span>
          <span>•</span>
          <span>بيانات محمية</span>
          <span>•</span>
          <span>نسخ احتياطية يومية</span>
        </div>
      </div>

      {/* Payment Modal */}
      {paymentModal && (
        <PaymentModal
          plan={paymentModal.plan}
          billingCycle={paymentModal.cycle}
          onClose={() => setPaymentModal(null)}
          onSuccess={() => {
            setPaymentModal(null);
            navigate("/onboarding");
          }}
        />
      )}
    </div>
  );
};

export default PricingPage;
