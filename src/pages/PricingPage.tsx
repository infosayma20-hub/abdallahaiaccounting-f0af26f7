import { useState, useEffect, useMemo } from "react";
import BackButton from "@/components/BackButton";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { Check, X, ChevronDown, ChevronUp, Shield, Star, Minus, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PaymentModal from "@/components/billing/PaymentModal";
import PlanAppsSection from "@/components/pricing/PlanAppsSection";

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
  max_branches: number;
  is_featured: boolean;
  ai_limit: number | null;
}

interface Addon {
  id: string;
  addon_key: string;
  name_ar: string;
  name_en: string;
  price_per_unit_annual: number;
  price_per_unit_monthly: number;
  unit_label: string;
  icon: string;
}

const taglines: Record<string, string> = {
  starter: "للأعمال الصغيرة والناشئة",
  growth: "للشركات النامية",
  professional: "للشركات المتوسطة",
  business: "للمؤسسات المتنامية",
  enterprise: "للمؤسسات الكبيرة",
};

const planIcons: Record<string, { emoji: string; bg: string }> = {
  starter: { emoji: "🌱", bg: "bg-green-100" },
  growth: { emoji: "📈", bg: "bg-blue-100" },
  professional: { emoji: "🚀", bg: "bg-[#FDF6E3]" },
  business: { emoji: "🏗️", bg: "bg-purple-100" },
  enterprise: { emoji: "🏢", bg: "bg-[#0A2342]" },
};

const comparisonData = [
  { category: "المحاسبة الأساسية", features: [
    { label: "شجرة الحسابات", starter: true, growth: true, professional: true, business: true, enterprise: true },
    { label: "دفتر اليومية والقيود", starter: true, growth: true, professional: true, business: true, enterprise: true },
    { label: "ميزان المراجعة", starter: true, growth: true, professional: true, business: true, enterprise: true },
    { label: "المعاملات الشهرية", starter: "500", growth: "غير محدود", professional: "غير محدود", business: "غير محدود", enterprise: "غير محدود" },
  ]},
  { category: "المبيعات والمشتريات", features: [
    { label: "فواتير المبيعات", starter: true, growth: true, professional: true, business: true, enterprise: true },
    { label: "فواتير المشتريات", starter: true, growth: true, professional: true, business: true, enterprise: true },
    { label: "إدارة الزبائن والموردين", starter: true, growth: true, professional: true, business: true, enterprise: true },
    { label: "نقطة البيع POS", starter: false, growth: true, professional: true, business: true, enterprise: true },
    { label: "إدارة المخزون", starter: false, growth: true, professional: true, business: true, enterprise: true },
  ]},
  { category: "التقارير والتحليلات", features: [
    { label: "التقارير الأساسية", starter: "10", growth: "30+", professional: "63+", business: "غير محدود", enterprise: "غير محدود" },
    { label: "قائمة الدخل والميزانية", starter: true, growth: true, professional: true, business: true, enterprise: true },
    { label: "تحليلات متقدمة و KPI", starter: false, growth: true, professional: true, business: true, enterprise: true },
    { label: "تقارير مخصصة", starter: false, growth: false, professional: false, business: true, enterprise: true },
  ]},
  { category: "الذكاء الاصطناعي", features: [
    { label: "المحاسب الذكي", starter: "50 رسالة/يوم", growth: "غير محدود", professional: "غير محدود", business: "غير محدود", enterprise: "غير محدود" },
    { label: "تحليل مستندات بالذكاء", starter: false, growth: true, professional: true, business: true, enterprise: true },
  ]},
  { category: "الإدارة والصلاحيات", features: [
    { label: "عدد المستخدمين", starter: "2", growth: "3", professional: "10", business: "غير محدود", enterprise: "غير محدود" },
    { label: "عدد الشركات", starter: "1", growth: "1", professional: "3", business: "غير محدود", enterprise: "غير محدود" },
    { label: "إدارة الموارد البشرية", starter: false, growth: false, professional: true, business: true, enterprise: true },
    { label: "صلاحيات متقدمة", starter: false, growth: false, professional: false, business: true, enterprise: true },
    { label: "إدارة متعددة الفروع", starter: false, growth: false, professional: false, business: true, enterprise: true },
    { label: "تكامل API", starter: false, growth: false, professional: true, business: true, enterprise: true },
    { label: "White-label", starter: false, growth: false, professional: false, business: false, enterprise: true },
  ]},
  { category: "الدعم الفني", features: [
    { label: "دعم بريد إلكتروني", starter: true, growth: true, professional: true, business: true, enterprise: true },
    { label: "دعم أولوية 24/7", starter: false, growth: false, professional: true, business: true, enterprise: true },
    { label: "مدير حساب مخصص", starter: false, growth: false, professional: false, business: false, enterprise: true },
    { label: "تدريب شخصي", starter: false, growth: false, professional: false, business: false, enterprise: true },
    { label: "SLA اتفاقية مستوى خدمة", starter: false, growth: false, professional: false, business: false, enterprise: true },
  ]},
];

const faqData = [
  { q: "هل يمكنني الإلغاء في أي وقت؟", a: "نعم، يمكنك إلغاء اشتراكك في أي وقت. ستستمر في الوصول إلى حسابك حتى نهاية فترة الفوترة الحالية." },
  { q: "ماذا يحدث بعد انتهاء التجربة المجانية؟", a: "بعد انتهاء الـ 14 يوم المجانية، ستحتاج إلى اختيار خطة مدفوعة للاستمرار. بياناتك ستبقى محفوظة بأمان." },
  { q: "هل بياناتي آمنة؟", a: "بالتأكيد! نستخدم تشفير SSL 256-bit ونسخ احتياطية يومية. بياناتك محمية بأعلى معايير الأمان." },
  { q: "هل يمكنني الترقية أو التخفيض لاحقاً؟", a: "نعم، يمكنك تغيير خطتك في أي وقت. عند الترقية يتم احتساب الفرق تناسبياً، وعند التخفيض يتم التطبيق من الدورة القادمة." },
  { q: "ما هي طرق الدفع المتاحة؟", a: "نقبل بطاقات Visa و Mastercard وPayPal. كما يمكن الدفع بالتحويل البنكي للخطط المؤسسية." },
  { q: "ما الفرق بين Growth و Professional؟", a: "Growth مناسبة للشركات الصغيرة التي تحتاج تقارير متقدمة (3 مستخدمين). Professional للشركات المتوسطة مع POS وإدارة مخزون وموارد بشرية (10 مستخدمين، 3 شركات)." },
  { q: "هل يمكنني إلغاء الإضافات لاحقاً؟", a: "نعم، يمكنك إضافة أو إلغاء أي إضافة في أي وقت. سيتم تعديل الفاتورة تناسبياً." },
];

const PLAN_KEYS = ["starter", "growth", "professional", "business", "enterprise"] as const;

const PricingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { subscription } = useSubscription();
  const [billing, setBilling] = useState<BillingCycle>("annual");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [addonCounts, setAddonCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [paymentModal, setPaymentModal] = useState<{ plan: Plan; cycle: BillingCycle } | null>(null);

  const reason = searchParams.get("reason");

  useEffect(() => {
    Promise.all([
      supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("add_ons").select("*").eq("is_active", true).order("sort_order"),
    ]).then(([plansRes, addonsRes]) => {
      if (plansRes.data) {
        setPlans(plansRes.data.map((p: any) => ({
          ...p,
          annual_price: p.annual_price || p.monthly_price * (1 - (p.annual_discount_pct || 0) / 100),
          features: Array.isArray(p.features) ? p.features : [],
          limits: p.limits || {},
        })));
      }
      if (addonsRes.data) setAddons(addonsRes.data as Addon[]);
      setLoading(false);
    });
  }, []);

  const getPrice = (plan: Plan) => billing === "annual" ? Math.round(plan.annual_price / 12 * 100) / 100 : plan.monthly_price;
  const getAnnualTotal = (plan: Plan) => plan.annual_price;

  const addonTotal = useMemo(() => {
    return addons.reduce((sum, a) => {
      const qty = addonCounts[a.addon_key] || 0;
      return sum + qty * (billing === "annual" ? a.price_per_unit_annual : a.price_per_unit_monthly * 12);
    }, 0);
  }, [addonCounts, addons, billing]);

  const updateAddon = (key: string, delta: number) => {
    setAddonCounts(prev => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) + delta) }));
  };

  const getButtonText = (plan: Plan) => {
    if (!user) return "ابدأ التجربة المجانية";
    if (subscription?.plan_key === plan.plan_key) return "خطتك الحالية ✓";
    if (subscription?.isTrial) return "ترقية الآن";
    return "اشترك الآن";
  };

  const isCurrentPlan = (plan: Plan) => subscription?.plan_key === plan.plan_key;

  const handleSelect = (plan: Plan) => {
    if (isCurrentPlan(plan)) return;
    if (!user) { navigate(`/auth?plan=${plan.plan_key}`); return; }
    setPaymentModal({ plan, cycle: billing });
  };

  // Show top 3 plans on cards, then Business + Enterprise below
  const mainPlans = plans.filter(p => ["starter", "growth", "professional"].includes(p.plan_key));
  const extraPlans = plans.filter(p => ["business", "enterprise"].includes(p.plan_key));

  return (
    <div className="min-h-screen" dir="rtl" style={{ fontFamily: "Tajawal, sans-serif" }}>
      {/* Hero gradient */}
      <div className="relative" style={{ background: "linear-gradient(180deg, #050F1E 0%, #0A2342 50%, #F4F7FA 50%)" }}>
        {reason === "trial_expired" && (
          <div className="bg-red-500 text-white text-center py-3 text-sm font-medium">
            ❌ انتهت فترتك التجريبية — اشترك الآن للاستمرار
          </div>
        )}

        <div className="max-w-7xl mx-auto px-5 pt-8 pb-8">
          <div className="mb-6">
            <BackButton fallback="/apps" className="bg-white/10 hover:bg-white/20" />
          </div>

          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-[32px] font-extrabold text-white mb-3">
              <span className="text-[hsl(43,55%,54%)]">AMWALI</span>
            </h1>
            <h2 className="text-[32px] font-extrabold text-white mb-3">اختر الخطة المناسبة لعملك</h2>
            <p className="text-base text-white/70">ابدأ مجاناً لمدة 14 يوماً — لا حاجة لبطاقة ائتمان</p>
          </div>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-3 mb-12">
            <button onClick={() => setBilling("monthly")} className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all ${billing === "monthly" ? "bg-[#4A9EE8] text-[#0A2342]" : "bg-white/10 text-white/70 hover:bg-white/20"}`}>
              شهري
            </button>
            <button onClick={() => setBilling("annual")} className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${billing === "annual" ? "bg-[#4A9EE8] text-[#0A2342]" : "bg-white/10 text-white/70 hover:bg-white/20"}`}>
              سنوي
              <span className="bg-green-500 text-white text-[11px] px-2 py-0.5 rounded-full">وفر حتى 20% 🏷️</span>
            </button>
          </div>

          {/* Main Plan Cards (3) */}
          {!loading && (
            <div className="flex flex-col lg:flex-row gap-5 justify-center max-w-[1100px] mx-auto">
              {mainPlans.map((plan, i) => {
                const isFeatured = plan.is_featured;
                const icon = planIcons[plan.plan_key] || planIcons.starter;
                const price = getPrice(plan);
                const isCurrent = isCurrentPlan(plan);

                return (
                  <motion.div key={plan.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1, duration: 0.4 }}
                    className={`relative flex-1 rounded-3xl p-8 bg-white transition-all duration-200 ${isFeatured ? "border-2 border-[#4A9EE8] lg:scale-[1.04] shadow-[0_8px_40px_rgba(10,35,66,0.2)] z-10" : "border-2 border-transparent shadow-[0_4px_20px_rgba(10,35,66,0.1)] hover:-translate-y-1"}`}>
                    {isFeatured && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#4A9EE8] to-[#7BB8F0] text-[#0A2342] px-5 py-1 rounded-full text-xs font-bold whitespace-nowrap">⭐ الأكثر شيوعاً</div>
                    )}

                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-[#0A2342]">{plan.name}</h3>
                        <p className="text-sm text-gray-500">{plan.name_ar}</p>
                        <p className="text-xs text-gray-400 mt-1">{taglines[plan.plan_key]}</p>
                      </div>
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${icon.bg}`}>{icon.emoji}</div>
                    </div>

                    <div className="mb-5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl text-gray-400">$</span>
                        <motion.span key={`${plan.id}-${billing}`} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-5xl font-extrabold text-[#0A2342]">
                          {billing === "annual" ? price.toFixed(2) : plan.monthly_price}
                        </motion.span>
                        <span className="text-sm text-gray-400">/شهر</span>
                      </div>
                      {billing === "annual" && (
                        <>
                          <p className="text-sm text-gray-400 line-through mt-1">بدل ${plan.monthly_price}/شهر</p>
                          <p className="text-xs text-green-600 font-medium">يُدفع ${plan.annual_price} سنوياً (وفر 20%)</p>
                        </>
                      )}
                      <p className="text-[11px] text-gray-400 mt-1">غير شامل ضريبة القيمة المضافة</p>
                    </div>

                    <div className="h-px bg-gray-100 my-5" />

                    {/* Limits summary */}
                    <div className="flex gap-4 mb-4 text-xs text-gray-500">
                      <span>👥 {plan.max_users === -1 ? "غ.م" : plan.max_users} مستخدم</span>
                      <span>🏢 {plan.max_companies === -1 ? "غ.م" : plan.max_companies} شركة</span>
                    </div>

                    <ul className="space-y-2.5 mb-6">
                      {plan.features.map((f: string, fi: number) => (
                        <li key={fi} className="flex items-start gap-2.5 text-[13px] text-gray-700">
                          <Check className="h-4 w-4 text-teal-500 mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <button onClick={() => handleSelect(plan)} disabled={isCurrent}
                      className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all ${isCurrent ? "bg-gray-100 text-gray-400 cursor-default" : isFeatured ? "bg-gradient-to-r from-[#4A9EE8] to-[#B8972E] text-white shadow-[0_4px_15px_rgba(74,158,232,0.4)] hover:scale-[1.02]" : "border-2 border-[#0A2342] text-[#0A2342] hover:bg-[#0A2342] hover:text-white"}`}>
                      {getButtonText(plan)}
                    </button>
                    {!isCurrent && (
                      <p className="text-[11px] text-green-600 text-center mt-3">✓ 14 يوم مجاناً — لا حاجة لبطاقة ائتمان</p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Business + Enterprise Cards */}
          {!loading && extraPlans.length > 0 && (
            <div className="flex flex-col lg:flex-row gap-5 justify-center max-w-[800px] mx-auto mt-6">
              {extraPlans.map((plan, i) => {
                const icon = planIcons[plan.plan_key] || planIcons.enterprise;
                const price = getPrice(plan);
                const isCurrent = isCurrentPlan(plan);

                return (
                  <motion.div key={plan.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.1 }}
                    className="flex-1 rounded-3xl p-7 bg-white border-2 border-transparent shadow-[0_4px_20px_rgba(10,35,66,0.1)] hover:-translate-y-1 transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-bold text-[#0A2342]">{plan.name}</h3>
                        <p className="text-sm text-gray-500">{plan.name_ar}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{taglines[plan.plan_key]}</p>
                      </div>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${icon.bg}`}>{icon.emoji}</div>
                    </div>
                    <div className="flex items-baseline gap-1 mb-3">
                      <span className="text-xl text-gray-400">$</span>
                      <span className="text-4xl font-extrabold text-[#0A2342]">{billing === "annual" ? price.toFixed(2) : plan.monthly_price}</span>
                      <span className="text-sm text-gray-400">/شهر</span>
                    </div>
                    {billing === "annual" && <p className="text-xs text-green-600 mb-3">يُدفع ${plan.annual_price} سنوياً (وفر 20%)</p>}
                    <div className="flex gap-3 mb-4 text-xs text-gray-500">
                      <span>👥 غير محدود</span>
                      <span>🏢 غير محدود</span>
                    </div>
                    <ul className="space-y-2 mb-5">
                      {plan.features.slice(0, 5).map((f: string, fi: number) => (
                        <li key={fi} className="flex items-start gap-2 text-[12px] text-gray-700">
                          <Check className="h-3.5 w-3.5 text-teal-500 mt-0.5 shrink-0" /><span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => handleSelect(plan)} disabled={isCurrent}
                      className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${isCurrent ? "bg-gray-100 text-gray-400" : "border-2 border-[#0A2342] text-[#0A2342] hover:bg-[#0A2342] hover:text-white"}`}>
                      {getButtonText(plan)}
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add-ons Section */}
      <div className="max-w-4xl mx-auto px-5 py-16">
        <h3 className="text-2xl font-bold text-[#0A2342] text-center mb-2">إضافات أموالي</h3>
        <p className="text-sm text-gray-500 text-center mb-8">خصص باقتك حسب احتياجاتك</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {addons.map(addon => (
            <div key={addon.id} className="flex items-center gap-4 p-5 border border-gray-200 rounded-2xl bg-white hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-2xl shrink-0">
                {addon.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-[#0A2342] text-sm">{addon.name_ar}</h4>
                <p className="text-xs text-gray-400">{addon.unit_label}</p>
              </div>
              <div className="text-left shrink-0">
                <p className="font-bold text-[#0A2342] text-sm">
                  ${billing === "annual" ? addon.price_per_unit_annual.toFixed(2) : addon.price_per_unit_monthly.toFixed(2)} ₪
                </p>
                <p className="text-[10px] text-gray-400">{billing === "annual" ? "/ سنة" : "/ شهر"}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => updateAddon(addon.addon_key, -1)} className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-6 text-center font-bold text-[#0A2342]">{addonCounts[addon.addon_key] || 0}</span>
                <button onClick={() => updateAddon(addon.addon_key, 1)} className="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100 transition-colors">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Total Calculator */}
        {addonTotal > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="text-center p-4 rounded-2xl border-2 border-[#4A9EE8] bg-blue-50">
            <p className="text-sm text-gray-600">إجمالي الإضافات:</p>
            <p className="text-2xl font-extrabold text-[#0A2342]">
              ${addonTotal.toFixed(2)} <span className="text-sm font-normal text-gray-400">/ {billing === "annual" ? "سنة" : "شهر"}</span>
            </p>
          </motion.div>
        )}
      </div>

      {/* Comparison Table */}
      <div className="max-w-6xl mx-auto px-5 py-16">
        <h3 className="text-xl font-bold text-[#0A2342] text-center mb-8">مقارنة تفصيلية بين الخطط</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200" style={{ backgroundColor: "#1B3A5C" }}>
                <th className="py-3 px-3 text-right text-white font-medium w-[20%]">الميزة</th>
                {PLAN_KEYS.map(pk => (
                  <th key={pk} className={`py-3 px-3 text-center font-bold ${pk === "professional" ? "text-[#4A9EE8]" : "text-white"}`}>
                    {plans.find(p => p.plan_key === pk)?.name_ar || pk}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((group, gi) => (
                <>
                  <tr key={`cat-${gi}`} className="bg-gray-50">
                    <td colSpan={6} className="py-2.5 px-3 font-bold text-[#0A2342] text-[13px]">{group.category}</td>
                  </tr>
                  {group.features.map((f, fi) => (
                    <tr key={`f-${gi}-${fi}`} className="border-b border-gray-100">
                      <td className="py-2.5 px-3 text-gray-600">{f.label}</td>
                      {PLAN_KEYS.map(pk => (
                        <td key={pk} className="py-2.5 px-3 text-center">
                          {typeof (f as any)[pk] === "boolean" ? (
                            (f as any)[pk] ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : <X className="h-4 w-4 text-gray-300 mx-auto" />
                          ) : (
                            <span className="text-[13px] font-medium text-[#0A2342]">{(f as any)[pk]}</span>
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
        <h3 className="text-xl font-bold text-[#0A2342] text-center mb-8">الأسئلة الشائعة</h3>
        <div className="space-y-3">
          {faqData.map((faq, i) => (
            <div key={i} className="border border-gray-200 rounded-2xl overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between p-5 text-right hover:bg-gray-50 transition-colors">
                <span className="font-bold text-[#0A2342] text-sm">{faq.q}</span>
                {openFaq === i ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
              </button>
              <AnimatePresence>
                {openFaq === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
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
          <span>•</span><span>بيانات محمية</span>
          <span>•</span><span>نسخ احتياطية يومية</span>
        </div>
      </div>

      {/* Payment Modal */}
      {paymentModal && (
        <PaymentModal
          plan={paymentModal.plan}
          billingCycle={paymentModal.cycle}
          onClose={() => setPaymentModal(null)}
          onSuccess={() => { setPaymentModal(null); navigate("/onboarding"); }}
        />
      )}
    </div>
  );
};

export default PricingPage;
