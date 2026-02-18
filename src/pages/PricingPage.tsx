import { useState } from "react";
import { Check, Star, Zap, Crown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

type BillingCycle = "monthly" | "yearly";

const PricingPage = () => {
  const navigate = useNavigate();
  const [billing, setBilling] = useState<BillingCycle>("monthly");

  const plans = [
    {
      id: "basic",
      name: "Basic",
      nameAr: "الباقة الأساسية",
      description: "للمحلات الصغيرة وأصحاب الأعمال الفردية",
      icon: Zap,
      monthlyPrice: 29,
      promoPrice: 19,
      yearlyPrice: 24,
      popular: false,
      cta: "ابدأ تجربتك المجانية",
      promoText: "19₪/شهر لأول 3 أشهر",
      features: [
        { text: "تتبع الإيرادات والمصاريف", included: true },
        { text: "إدخال محاسبي ذكي بالعربية", included: true },
        { text: "قيود يومية تلقائية", included: true },
        { text: "إدارة العملاء والموردين", included: true },
        { text: "تقارير مالية أساسية", included: true },
        { text: "فواتير مبيعات", included: true },
        { text: "فواتير مشتريات", included: false },
        { text: "تقارير متقدمة وذكية", included: false },
        { text: "تعدد الشركات", included: false },
        { text: "صلاحيات مستخدمين", included: false },
      ],
    },
    {
      id: "smart",
      name: "Smart",
      nameAr: "الباقة الذكية",
      description: "للشركات الصغيرة والمحاسبين المستقلين",
      icon: Star,
      monthlyPrice: 59,
      promoPrice: 39,
      yearlyPrice: 49,
      popular: true,
      cta: "اشترك الآن",
      promoText: "39₪/شهر لأول 3 أشهر",
      features: [
        { text: "تتبع الإيرادات والمصاريف", included: true },
        { text: "إدخال محاسبي ذكي بالعربية", included: true },
        { text: "قيود يومية تلقائية", included: true },
        { text: "إدارة العملاء والموردين", included: true },
        { text: "تقارير مالية أساسية", included: true },
        { text: "فواتير مبيعات ومشتريات", included: true },
        { text: "تقارير متقدمة وذكية", included: true },
        { text: "تصدير البيانات (Excel/PDF)", included: true },
        { text: "تعدد الشركات", included: false },
        { text: "صلاحيات مستخدمين", included: false },
      ],
    },
    {
      id: "pro",
      name: "Pro",
      nameAr: "الباقة الاحترافية",
      description: "للشركات المتوسطة ومكاتب المحاسبة",
      icon: Crown,
      monthlyPrice: 99,
      promoPrice: null,
      yearlyPrice: 79,
      popular: false,
      cta: "ابدأ مجانًا لمدة شهر",
      promoText: "خصم 20% على الاشتراك السنوي",
      features: [
        { text: "تتبع الإيرادات والمصاريف", included: true },
        { text: "إدخال محاسبي ذكي بالعربية", included: true },
        { text: "قيود يومية تلقائية", included: true },
        { text: "إدارة العملاء والموردين", included: true },
        { text: "تقارير مالية أساسية", included: true },
        { text: "فواتير مبيعات ومشتريات", included: true },
        { text: "تقارير متقدمة وذكية", included: true },
        { text: "تصدير البيانات (Excel/PDF)", included: true },
        { text: "تعدد الشركات (حتى 5)", included: true },
        { text: "صلاحيات مستخدمين متعددة", included: true },
      ],
    },
  ];

  const comparisonFeatures = [
    { name: "تتبع الإيرادات والمصاريف", basic: true, smart: true, pro: true },
    { name: "إدخال ذكي بالعربية", basic: true, smart: true, pro: true },
    { name: "قيود يومية تلقائية", basic: true, smart: true, pro: true },
    { name: "إدارة العملاء والموردين", basic: true, smart: true, pro: true },
    { name: "فواتير مبيعات", basic: true, smart: true, pro: true },
    { name: "فواتير مشتريات", basic: false, smart: true, pro: true },
    { name: "تقارير مالية متقدمة", basic: false, smart: true, pro: true },
    { name: "تصدير Excel / PDF", basic: false, smart: true, pro: true },
    { name: "تعدد الشركات", basic: false, smart: false, pro: true },
    { name: "صلاحيات مستخدمين", basic: false, smart: false, pro: true },
    { name: "دعم فني أولوي", basic: false, smart: false, pro: true },
  ];

  return (
    <div className="min-h-screen pb-24" dir="rtl">
      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/menu")}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-xl font-bold text-foreground">الباقات والأسعار</h1>
        </div>
      </div>

      {/* Hero Section */}
      <div className="px-4 pb-8 text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          أدِر حساباتك بذكاء وبساطة
        </h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
          ابدأ مجانًا، واختر الباقة المناسبة لعملك. بدون تعقيد، بدون التزام.
        </p>

        {/* Billing Toggle */}
        <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-muted/60 border border-border/50">
          <button
            onClick={() => setBilling("monthly")}
            className={`px-5 py-2 rounded-xl text-xs font-semibold transition-all ${
              billing === "monthly"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            شهري
          </button>
          <button
            onClick={() => setBilling("yearly")}
            className={`px-5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              billing === "yearly"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            سنوي
            <Badge className="text-[9px] px-1.5 py-0 bg-success/20 text-success border-0 font-bold">
              وفّر 20%
            </Badge>
          </button>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="px-4 space-y-4 pb-10">
        {plans.map((plan) => {
          const PlanIcon = plan.icon;
          const displayPrice = billing === "monthly"
            ? plan.monthlyPrice
            : plan.yearlyPrice;
          const showPromo = billing === "monthly" && plan.promoPrice;

          return (
            <div
              key={plan.id}
              className={`relative rounded-3xl overflow-hidden transition-all ${
                plan.popular
                  ? "bg-card border-2 border-primary shadow-xl shadow-primary/10"
                  : "bg-card border border-border/60 shadow-sm"
              }`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="bg-primary text-primary-foreground text-center py-2 text-xs font-bold tracking-wide">
                  ⭐ الأكثر شيوعًا
                </div>
              )}

              <div className="p-5">
                {/* Plan Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                          plan.popular
                            ? "bg-primary/10"
                            : "bg-muted"
                        }`}
                      >
                        <PlanIcon
                          className={`h-5 w-5 ${
                            plan.popular ? "text-primary" : "text-muted-foreground"
                          }`}
                        />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-foreground">
                          {plan.name}
                        </h3>
                        <p className="text-[11px] text-muted-foreground">
                          {plan.nameAr}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {plan.description}
                    </p>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-5">
                  <div className="flex items-baseline gap-1.5">
                    {showPromo && (
                      <span className="text-sm text-muted-foreground line-through">
                        {plan.monthlyPrice}₪
                      </span>
                    )}
                    <span className="text-3xl font-bold text-foreground">
                      {showPromo ? plan.promoPrice : displayPrice}₪
                    </span>
                    <span className="text-sm text-muted-foreground">
                      / {billing === "monthly" ? "شهريًا" : "شهريًا (سنوي)"}
                    </span>
                  </div>
                  <p className="text-xs text-primary font-semibold mt-1">
                    {plan.promoText}
                  </p>
                </div>

                {/* Features */}
                <div className="space-y-2.5 mb-6">
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                          feature.included
                            ? "bg-primary/10"
                            : "bg-muted"
                        }`}
                      >
                        {feature.included ? (
                          <Check className="h-3 w-3 text-primary" />
                        ) : (
                          <span className="w-2 h-0.5 bg-muted-foreground/30 rounded" />
                        )}
                      </div>
                      <span
                        className={`text-xs ${
                          feature.included
                            ? "text-foreground font-medium"
                            : "text-muted-foreground/50"
                        }`}
                      >
                        {feature.text}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <Button
                  className={`w-full rounded-2xl py-6 text-sm font-bold transition-all ${
                    plan.popular
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25"
                      : "bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                  }`}
                >
                  {plan.cta}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison Table */}
      <div className="px-4 pb-10">
        <h3 className="text-lg font-bold text-foreground text-center mb-5">
          مقارنة الباقات
        </h3>
        <div className="rounded-2xl border border-border/60 overflow-hidden bg-card">
          {/* Table Header */}
          <div className="grid grid-cols-4 bg-muted/50 border-b border-border/50">
            <div className="p-3 text-[10px] font-semibold text-muted-foreground">
              الميزة
            </div>
            <div className="p-3 text-[10px] font-bold text-center text-foreground">
              Basic
            </div>
            <div className="p-3 text-[10px] font-bold text-center text-primary">
              Smart
            </div>
            <div className="p-3 text-[10px] font-bold text-center text-foreground">
              Pro
            </div>
          </div>

          {/* Table Rows */}
          {comparisonFeatures.map((feature, idx) => (
            <div
              key={idx}
              className={`grid grid-cols-4 ${
                idx % 2 === 0 ? "bg-card" : "bg-muted/20"
              } ${idx < comparisonFeatures.length - 1 ? "border-b border-border/30" : ""}`}
            >
              <div className="p-3 text-[11px] text-foreground font-medium flex items-center">
                {feature.name}
              </div>
              {(["basic", "smart", "pro"] as const).map((tier) => (
                <div key={tier} className="p-3 flex items-center justify-center">
                  {feature[tier] ? (
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                  ) : (
                    <span className="w-4 h-0.5 bg-muted-foreground/20 rounded" />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="px-4 pb-10 text-center">
        <div className="rounded-3xl bg-gradient-to-br from-primary/5 to-accent/30 border border-primary/10 p-6">
          <h4 className="text-base font-bold text-foreground mb-2">
            لست متأكدًا أي باقة تناسبك؟
          </h4>
          <p className="text-xs text-muted-foreground mb-4">
            جرّب التطبيق مجانًا لمدة 14 يومًا بدون بطاقة ائتمان
          </p>
          <Button className="rounded-2xl px-8 py-5 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
            ابدأ تجربتك المجانية الآن
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
