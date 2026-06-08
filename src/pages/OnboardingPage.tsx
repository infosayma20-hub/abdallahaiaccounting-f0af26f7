import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Search } from "lucide-react";
import { toast } from "sonner";
import { clearOnboardingStatusCache } from "@/components/auth/OnboardingGate";

const TOTAL_STEPS = 6;

const businessTypes = [
  { key: "products", emoji: "🛍️", label: "بيع منتجات", desc: "سلع، بضائع، مواد" },
  { key: "services", emoji: "🔧", label: "تقديم خدمات", desc: "استشارات، صيانة، خدمات" },
  { key: "restaurant", emoji: "🍽️", label: "مطعم / كافيه", desc: "طعام ومشروبات" },
  { key: "construction", emoji: "🏗️", label: "مقاولات وإنشاء", desc: "بناء، ديكور، هندسة" },
];

const industries = [
  "تجزئة عامة", "مواد بناء", "ملابس وأزياء", "أغذية ومشروبات",
  "إلكترونيات", "أثاث ومفروشات", "صيدليات", "طب وصحة",
  "تعليم وتدريب", "سفر وسياحة", "عقارات", "محاماة ومحاسبة",
  "تصميم وإبداع", "نقل وشحن", "زراعة", "طاقة ومياه",
  "تقنية معلومات", "أخرى",
];

const employeeCounts = ["1-5", "6-20", "21-50", "+50"];
const revenueBrackets = ["أقل من 50,000", "50,000 - 200,000", "200,000 - 1,000,000", "أكثر من مليون"];
const currencies = [
  { code: "ILS", symbol: "₪", name: "شيكل" },
  { code: "USD", symbol: "$", name: "دولار" },
  { code: "JOD", symbol: "JD", name: "دينار أردني" },
];

const accountingLevels = [
  { key: "none", emoji: "📚", label: "مبتدئ", desc: "لا خبرة محاسبية" },
  { key: "basic", emoji: "📊", label: "متوسط", desc: "أعرف الأساسيات" },
  { key: "intermediate", emoji: "🎓", label: "متقدم", desc: "خبرة جيدة" },
  { key: "expert", emoji: "👔", label: "محترف", desc: "محاسب أو مدير مالي" },
];

const referralSources = ["جوجل", "وسائل التواصل", "صديق", "إعلان", "أخرى"];

const goalChips = [
  "تتبع مصروفاتي", "إدارة الفواتير", "معرفة أرباحي",
  "إدارة المخزون", "إدارة الموظفين", "تقديم تقارير ضريبية",
  "تنظيم حسابات عملائي", "تحليل أداء العمل",
];

const OnboardingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(1);

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [industry, setIndustry] = useState("");
  const [industrySearch, setIndustrySearch] = useState("");
  const [city, setCity] = useState("");
  const [hasEmployees, setHasEmployees] = useState<boolean | null>(null);
  const [employeeCount, setEmployeeCount] = useState("");
  const [revenue, setRevenue] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [accountingLevel, setAccountingLevel] = useState("");
  const [referral, setReferral] = useState("");
  const [goals, setGoals] = useState<string[]>([]);

  const saveProgress = async (stepData: any, stepNum: number) => {
    if (!user) return;
    try {
      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      let companyId = company?.id;

      if (!companyId && stepNum === 1 && stepData.company_name) {
        const { data: newCompany } = await supabase
          .from("companies")
          .insert({ name: stepData.company_name, owner_id: user.id })
          .select("id")
          .single();
        companyId = newCompany?.id;
      }

      if (companyId) {
        await supabase
          .from("company_profiles")
          .upsert({
            company_id: companyId,
            ...stepData,
            onboarding_step: stepNum,
          }, { onConflict: "company_id" });
      }
    } catch (err) {
      console.error("Save progress error:", err);
    }
  };

  const nextStep = async () => {
    if (step === 1) {
      const trimmedCompanyName = companyName.trim();
      if (!trimmedCompanyName) { toast.error("هذا الحقل مطلوب للمتابعة"); return; }

      await saveProgress({ company_name: trimmedCompanyName }, 1);

      if (user) {
        const { data: company } = await supabase.from("companies").select("id").eq("owner_id", user.id).maybeSingle();
        if (company) {
          await supabase.from("companies").update({ name: trimmedCompanyName }).eq("id", company.id);
        } else {
          await supabase.from("companies").insert({ owner_id: user.id, name: trimmedCompanyName });
        }

        await Promise.all([
          supabase.from("profiles").update({ company_name: trimmedCompanyName }).eq("user_id", user.id),
          supabase.from("company_settings" as any).upsert({ user_id: user.id, company_name: trimmedCompanyName } as any, { onConflict: "user_id" }),
          supabase.auth.updateUser({ data: { company_name: trimmedCompanyName } }),
        ]);
      }
    }
    if (step === 2) {
      if (selectedTypes.length === 0) { toast.error("هذا الحقل مطلوب للمتابعة"); return; }
      await saveProgress({ business_type: selectedTypes.join(",") }, 2);
    }
    if (step === 3) {
      if (!industry.trim()) { toast.error("هذا الحقل مطلوب للمتابعة"); return; }
      await saveProgress({ industry, industry_ar: industry, city, country: "PS" }, 3);
    }
    if (step === 4) await saveProgress({ has_employees: hasEmployees, employees_count: employeeCount, annual_revenue: revenue, primary_currency: currency }, 4);
    if (step === 5) await saveProgress({ accounting_experience: accountingLevel, referral_source: referral, business_goals: goals }, 5);

    if (step < TOTAL_STEPS) setStep(step + 1);
  };

  const prevStep = () => { if (step > 1) setStep(step - 1); };

  const finishOnboarding = async () => {
    await saveProgress({ onboarding_completed: true }, 6);
    // (C) Sync user_onboarding so WelcomeModal + SpotlightTour appear once
    // for the freshly-onboarded owner, then never again.
    if (user?.id) {
      try {
        await supabase
          .from("user_onboarding")
          .upsert(
            {
              user_id: user.id,
              welcome_modal_shown: false,
              full_tour_completed: false,
              full_tour_skipped: false,
              dont_show_again: false,
              modules_toured: [],
              module_first_visits: {},
            },
            { onConflict: "user_id" }
          );
        sessionStorage.removeItem("welcome_modal_shown");
      } catch (err) {
        console.warn("[finishOnboarding] user_onboarding sync failed:", err);
      }
      clearOnboardingStatusCache(user.id);
    }
    toast.success("أهلاً بك في AMWALI أموالي! 🎉");
    navigate("/apps");
  };

  const progress = (step / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen bg-[#F4F7FA] flex items-center justify-center p-4" dir="rtl" style={{ fontFamily: "Tajawal, sans-serif" }}>
      <div className="w-full max-w-[700px] bg-white rounded-3xl shadow-[0_8px_40px_rgba(10,35,66,0.1)] p-8 sm:p-10">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg, #0D1B2A, #E8A020)" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">الخطوة {step} من {TOTAL_STEPS}</p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* Step 1: Welcome */}
            {step === 1 && (
              <div className="text-center">
                <div className="text-5xl mb-4">👋</div>
                <h2 className="text-[28px] font-extrabold text-[#0D1B2A] mb-3">أهلاً وسهلاً في AMWALI!</h2>
                <p className="text-sm text-gray-500 max-w-md mx-auto mb-8 leading-relaxed">
                  لنبدأ بالتعرف على عملك لكي يقدم لك المحاسب الذكي تحليلات مخصصة لك تماماً
                </p>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="مثال: شركة الأمل للتجارة"
                  className="w-full max-w-md mx-auto h-[52px] px-5 rounded-2xl border-2 border-gray-200 focus:border-[#0A2342] outline-none text-lg text-center"
                />
              </div>
            )}

            {/* Step 2: Business Type */}
            {step === 2 && (
              <div>
                <h2 className="text-xl font-bold text-[#0A2342] text-center mb-2">ما طبيعة عملك؟</h2>
                <p className="text-sm text-gray-400 text-center mb-6">اختر ما يناسبك — يمكن اختيار أكثر من واحد</p>
                <div className="grid grid-cols-2 gap-3">
                  {businessTypes.map((bt) => {
                    const selected = selectedTypes.includes(bt.key);
                    return (
                      <button
                        key={bt.key}
                        onClick={() => setSelectedTypes(
                          selected ? selectedTypes.filter(t => t !== bt.key) : [...selectedTypes, bt.key]
                        )}
                        className={`relative p-5 rounded-2xl border-2 text-center transition-all ${
                          selected ? "border-[#0A2342] bg-blue-50" : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {selected && <Check className="absolute top-3 left-3 h-5 w-5 text-[#0A2342]" />}
                        <div className="text-3xl mb-2">{bt.emoji}</div>
                        <p className="font-bold text-[#0A2342] text-sm">{bt.label}</p>
                        <p className="text-xs text-gray-400 mt-1">{bt.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Industry */}
            {step === 3 && (
              <div>
                <h2 className="text-xl font-bold text-[#0A2342] text-center mb-6">ما هو قطاعك بالتحديد؟</h2>
                <div className="relative mb-4">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={industrySearch}
                    onChange={(e) => setIndustrySearch(e.target.value)}
                    placeholder="ابحث عن قطاعك..."
                    className="w-full h-12 pr-10 pl-4 rounded-xl border border-gray-200 outline-none focus:border-[#0A2342]"
                  />
                </div>
                <div className="flex flex-wrap gap-2 mb-6">
                  {industries
                    .filter(ind => !industrySearch || ind.includes(industrySearch))
                    .map((ind) => (
                    <button
                      key={ind}
                      onClick={() => setIndustry(ind)}
                      className={`px-4 py-2 rounded-full text-sm transition-all ${
                        industry === ind
                          ? "bg-[#0A2342] text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {ind}
                    </button>
                  ))}
                </div>
                <h3 className="text-sm font-bold text-[#0A2342] mb-2">ما هو موقع عملك؟</h3>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="المدينة"
                  className="w-full h-12 px-4 rounded-xl border border-gray-200 outline-none focus:border-[#0A2342]"
                />
              </div>
            )}

            {/* Step 4: Team & Scale */}
            {step === 4 && (
              <div>
                <h2 className="text-xl font-bold text-[#0A2342] text-center mb-6">فريقك وحجم أعمالك</h2>

                <p className="text-sm font-bold text-[#0A2342] mb-3">هل لديك موظفون؟</p>
                <div className="flex gap-3 mb-5">
                  {[{ val: true, label: "نعم" }, { val: false, label: "لا، أعمل بمفردي" }].map((opt) => (
                    <button
                      key={String(opt.val)}
                      onClick={() => setHasEmployees(opt.val)}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                        hasEmployees === opt.val ? "bg-[#0A2342] text-white" : "border-2 border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {hasEmployees && (
                  <>
                    <p className="text-sm font-bold text-[#0A2342] mb-3">كم عدد موظفيك؟</p>
                    <div className="flex gap-2 mb-5">
                      {employeeCounts.map((c) => (
                        <button
                          key={c}
                          onClick={() => setEmployeeCount(c)}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                            employeeCount === c ? "bg-[#0A2342] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <p className="text-sm font-bold text-[#0A2342] mb-3">ما حجم مبيعاتك السنوية التقريبي؟</p>
                <div className="grid grid-cols-2 gap-2 mb-5">
                  {revenueBrackets.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRevenue(r)}
                      className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                        revenue === r ? "bg-[#0A2342] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                <p className="text-sm font-bold text-[#0A2342] mb-3">العملة الأساسية</p>
                <div className="flex gap-2">
                  {currencies.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => setCurrency(c.code)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                        currency === c.code ? "bg-[#0A2342] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {c.symbol} {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 5: Accounting Background */}
            {step === 5 && (
              <div>
                <h2 className="text-xl font-bold text-[#0A2342] text-center mb-6">ما مستواك في المحاسبة؟</h2>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {accountingLevels.map((al) => (
                    <button
                      key={al.key}
                      onClick={() => setAccountingLevel(al.key)}
                      className={`p-4 rounded-2xl border-2 text-center transition-all ${
                        accountingLevel === al.key ? "border-[#0A2342] bg-blue-50" : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="text-2xl mb-1">{al.emoji}</div>
                      <p className="font-bold text-[#0A2342] text-sm">{al.label}</p>
                      <p className="text-xs text-gray-400">{al.desc}</p>
                    </button>
                  ))}
                </div>

                <p className="text-sm font-bold text-[#0D1B2A] mb-3">من أين سمعت عن AMWALI؟</p>
                <div className="flex flex-wrap gap-2 mb-6">
                  {referralSources.map((r) => (
                    <button
                      key={r}
                      onClick={() => setReferral(r)}
                      className={`px-4 py-2 rounded-full text-sm transition-all ${
                        referral === r ? "bg-[#0A2342] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                <p className="text-sm font-bold text-[#0D1B2A] mb-3">ما أهم شيء تريد إنجازه بـ AMWALI؟</p>
                <div className="flex flex-wrap gap-2">
                  {goalChips.map((g) => {
                    const selected = goals.includes(g);
                    return (
                      <button
                        key={g}
                        onClick={() => setGoals(selected ? goals.filter(x => x !== g) : [...goals, g])}
                        className={`px-4 py-2 rounded-full text-sm transition-all ${
                          selected ? "bg-[#E8A020] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {selected && "✓ "}{g}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 6: App Tour */}
            {step === 6 && (
              <div className="text-center">
                <motion.div
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className="bg-gradient-to-br from-[#E8A020] to-[#C9870A] p-10 rounded-2xl text-white min-h-[280px] flex flex-col items-center justify-center mb-4"
                >
                  <div className="text-6xl mb-4">🎉</div>
                  <h3 className="text-2xl font-extrabold mb-2">أنت جاهز الآن!</h3>
                  <p className="text-sm text-white/90 mb-2 max-w-md leading-relaxed">
                    جهّزنا حسابك. عند الدخول، رح تبلّش جولة تفاعلية قصيرة على كل التطبيقات داخل المنصة.
                  </p>
                  <p className="text-xs text-white/80 mb-6">تجربتك المجانية سارية لـ 14 يوماً</p>
                  <button
                    onClick={finishOnboarding}
                    className="bg-white text-[#0A2342] px-8 py-3 rounded-xl font-bold text-sm hover:scale-105 transition-transform"
                  >
                    ادخل واستكشف ←
                  </button>
                </motion.div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        {step < 6 && (
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
            {step > 1 ? (
              <button onClick={prevStep} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600">
                <ArrowRight className="h-4 w-4" />
                السابق
              </button>
            ) : <div />}
            <button
              onClick={nextStep}
              className="flex items-center gap-2 bg-gradient-to-r from-[#E8A020] to-[#F45E0C] text-white px-8 py-3 rounded-xl text-sm font-bold hover:scale-[1.02] transition-transform"
            >
              {step === 1 ? "لنبدأ" : "التالي"}
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingPage;
