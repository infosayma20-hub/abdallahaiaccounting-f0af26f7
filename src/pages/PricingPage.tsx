import { useState } from "react";
import { Check, Star, ArrowRight, Zap, Users, Building2, Shield, HeadphonesIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

type BillingCycle = "monthly" | "annual";

const plans = [
  {
    id: "starter",
    name: "Starter",
    subtitle: "للتجار الصغار وأصحاب الأعمال الفردية",
    icon: Zap,
    monthlyPrice: 19,
    cta: "ابدأ تجربتك المجانية",
    popular: false,
    features: [
      "مبيعات ومشتريات",
      "إدارة العملاء والموردين",
      "إدخال ذكي بالعربية",
      "قيود يومية تلقائية",
      "تقارير مالية أساسية",
      "شركة واحدة",
      "مستخدم واحد",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    subtitle: "للأعمال النامية التي تحتاج تحليلات أعمق",
    icon: Users,
    monthlyPrice: 39,
    cta: "اشترك الآن",
    popular: true,
    features: [
      "كل ما في Starter",
      "تقارير متقدمة وذكية",
      "KPI وتحليل أداء",
      "تصدير Excel / PDF",
      "تنبيهات ذكية",
      "حتى 3 مستخدمين",
      "شركة واحدة",
    ],
  },
  {
    id: "business",
    name: "Business",
    subtitle: "للشركات التي تحتاج تحكم كامل وتكامل متقدم",
    icon: Building2,
    monthlyPrice: 79,
    cta: "تواصل معنا",
    popular: false,
    features: [
      "كل ما في Growth",
      "تعدد شركات",
      "صلاحيات مستخدمين متقدمة",
      "دعم أولوية",
      "تكامل API",
      "نسخ احتياطي متقدم",
    ],
  },
];

const comparisonFeatures: { label: string; starter: boolean | string; growth: boolean | string; business: boolean | string }[] = [
  { label: "مبيعات ومشتريات", starter: true, growth: true, business: true },
  { label: "إدارة العملاء والموردين", starter: true, growth: true, business: true },
  { label: "إدخال ذكي بالعربية", starter: true, growth: true, business: true },
  { label: "تقارير أساسية", starter: true, growth: true, business: true },
  { label: "تصدير Excel / PDF", starter: false, growth: true, business: true },
  { label: "KPI وتحليل أداء", starter: false, growth: true, business: true },
  { label: "تنبيهات ذكية", starter: false, growth: true, business: true },
  { label: "عدد المستخدمين", starter: "1", growth: "3", business: "غير محدود" },
  { label: "عدد الشركات", starter: "1", growth: "1", business: "غير محدود" },
  { label: "صلاحيات متقدمة", starter: false, growth: false, business: true },
  { label: "تكامل API", starter: false, growth: false, business: true },
  { label: "دعم أولوية", starter: false, growth: false, business: true },
];

const PricingPage = () => {
  const navigate = useNavigate();
  const [billing, setBilling] = useState<BillingCycle>("annual");

  const getAnnualMonthly = (monthly: number) => Math.round(monthly * 0.8);
  const getAnnualTotal = (monthly: number) => getAnnualMonthly(monthly) * 12;
  const getAnnualSaving = (monthly: number) => (monthly * 12) - getAnnualTotal(monthly);

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 space-y-8" dir="rtl">
      {/* Header */}
      <div className="text-center space-y-2">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowRight className="h-4 w-4" />
          رجوع
        </button>
        <h1 className="text-2xl font-bold text-foreground">أدِر حساباتك بذكاء وبساطة</h1>
        <p className="text-sm text-muted-foreground">ابدأ مجاناً، واختر الباقة المناسبة لعملك. بدون تعقيد، بدون التزام.</p>
      </div>

      {/* Billing Toggle */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-1 p-1 rounded-full bg-secondary/80 border border-border/50">
          <button
            onClick={() => setBilling("monthly")}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${billing === "monthly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            شهري
          </button>
          <button
            onClick={() => setBilling("annual")}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${billing === "annual" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            سنوي
            <span className="text-[10px] font-bold text-primary bg-primary/15 px-2 py-0.5 rounded-full">وفر 20%</span>
          </button>
        </div>
      </div>

      {/* Plans */}
      <div className="space-y-4">
        {plans.map((plan) => {
          const displayPrice = billing === "annual" ? getAnnualMonthly(plan.monthlyPrice) : plan.monthlyPrice;
          const annualTotal = getAnnualTotal(plan.monthlyPrice);
          const annualSaving = getAnnualSaving(plan.monthlyPrice);
          const PlanIcon = plan.icon;

          return (
            <div
              key={plan.id}
              className={`relative rounded-3xl overflow-hidden transition-all ${
                plan.popular
                  ? "border-2 border-primary/40 shadow-xl shadow-primary/10 scale-[1.02]"
                  : "border border-border/50 shadow-sm"
              }`}
            >
              {/* Popular badge */}
              {plan.popular && (
                <div className="bg-primary text-primary-foreground text-center py-2 text-xs font-bold flex items-center justify-center gap-1.5">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  الأكثر اختياراً
                </div>
              )}

              <div className={`bg-card p-5 space-y-4 ${plan.popular ? "pt-4" : ""}`}>
                {/* Plan header */}
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{plan.subtitle}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${plan.popular ? "bg-primary/10" : "bg-muted"}`}>
                    <PlanIcon className={`h-5 w-5 ${plan.popular ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                </div>

                {/* Price */}
                <div className="space-y-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold text-foreground">{displayPrice}₪</span>
                    <span className="text-sm text-muted-foreground">/ شهرياً</span>
                  </div>
                  {billing === "annual" ? (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">{annualTotal}₪ تُدفع سنوياً</p>
                      <p className="text-xs font-semibold text-primary">وفّر {annualSaving}₪ سنوياً ✨</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">بدون التزام، إلغاء في أي وقت</p>
                  )}
                </div>

                {/* Features */}
                <div className="space-y-2.5 pt-1">
                  {plan.features.map((feat) => (
                    <div key={feat} className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                        <Check className="h-3 w-3 text-primary" strokeWidth={3} />
                      </div>
                      <span className="text-sm text-foreground">{feat}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  className={`w-full py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] ${
                    plan.popular
                      ? "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20"
                      : "bg-secondary text-foreground hover:bg-secondary/80 border border-border/50"
                  }`}
                >
                  {plan.cta}
                </button>

                {billing === "annual" && (
                  <p className="text-center text-[10px] text-primary font-medium">💎 الأكثر توفيراً</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison Table */}
      <div className="space-y-4 pt-4">
        <h2 className="text-lg font-bold text-foreground text-center">مقارنة الباقات</h2>
        <div className="rounded-2xl border border-border/50 overflow-hidden bg-card">
          {/* Header */}
          <div className="grid grid-cols-4 bg-secondary/50 border-b border-border/30">
            <div className="p-3 text-[10px] font-bold text-muted-foreground">الميزة</div>
            <div className="p-3 text-[10px] font-bold text-center text-muted-foreground">Starter</div>
            <div className="p-3 text-[10px] font-bold text-center text-primary">Growth</div>
            <div className="p-3 text-[10px] font-bold text-center text-muted-foreground">Business</div>
          </div>
          {/* Rows */}
          {comparisonFeatures.map((feat, i) => (
            <div
              key={feat.label}
              className={`grid grid-cols-4 ${i % 2 === 0 ? "bg-card" : "bg-muted/20"} ${i < comparisonFeatures.length - 1 ? "border-b border-border/20" : ""}`}
            >
              <div className="p-3 text-[11px] text-foreground font-medium">{feat.label}</div>
              {(["starter", "growth", "business"] as const).map((key) => {
                const val = feat[key];
                return (
                  <div key={key} className="p-3 flex items-center justify-center">
                    {val === true ? (
                      <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary" strokeWidth={3} />
                      </div>
                    ) : val === false ? (
                      <span className="text-[10px] text-muted-foreground/30">—</span>
                    ) : (
                      <span className="text-xs font-semibold text-foreground">{val}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="text-center space-y-4 pt-4 pb-8">
        <div className="rounded-3xl bg-gradient-to-br from-primary/5 to-accent/30 border border-primary/10 p-6 space-y-4">
          <p className="text-base font-bold text-foreground">لست متأكداً أي باقة تناسبك؟</p>
          <p className="text-xs text-muted-foreground">جرّب التطبيق مجاناً لمدة 14 يوماً بدون بطاقة ائتمان</p>
          <button className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all active:scale-[0.98] shadow-lg shadow-primary/20">
            ابدأ التجربة المجانية الآن ✨
          </button>
          <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> بدون بطاقة ائتمان</span>
            <span className="flex items-center gap-1"><HeadphonesIcon className="h-3 w-3" /> دعم عربي</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
