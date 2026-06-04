import { useState, useEffect, useCallback } from "react";
import {
  Loader2, ChevronLeft, Building2, MapPin, Zap, SkipForward, Lock, Eye, EyeOff,
  BarChart3, Coins, Receipt, Package, Users, User, Monitor, FileText, Hash,
  ListOrdered, Clock, Sparkles, CheckCircle2, Rocket, Store, Wrench,
  UtensilsCrossed, HardHat, Hammer, ShoppingCart, Plane, Stethoscope,
  GraduationCap, Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FinixLogo } from "@/components/ui/FinixLogo";
import { useCompany } from "@/hooks/useCompanyContext";
import { motion, AnimatePresence } from "framer-motion";
import amwaliMarkNavy from "@/assets/amwali-mark-navy.png";

interface SetupWizardProps {
  userId: string;
  onComplete: () => void;
}

type BusinessType = "تجارة" | "خدمات" | "مطعم" | "متجر إلكتروني" | "مقاولات" | "ورش ومناجر" | "عيادة" | "تعليم" | "سياحة" | "أخرى";

interface SetupData {
  companyName: string;
  city: string;
  businessType: BusinessType | null;
  currency: string;
  customCurrency: string;
  vatEnabled: boolean | null;
  vatRate: number;
  inventoryMethod: string;
  hasEmployees: boolean | null;
  employeeRange: string;
  hasPOS: boolean | null;
  posCount: number;
  invoicePrefix: string;
  invoiceStartNumber: number;
  paymentTerms: string;
  cashBalance: number;
  hasBankAccount: boolean | null;
  bankAccountName: string;
  bankName: string;
  bankCurrency: string;
  bankAccountType: string;
  bankBalance: number;
  leaveForAccountant: boolean;
  password: string;
  confirmPassword: string;
}

const BUSINESS_TYPES: { value: BusinessType; label: string; sublabel: string; Icon: LucideIcon; modules: string }[] = [
  { value: "تجارة", label: "تجارة", sublabel: "وتوزيع", Icon: Store, modules: "المبيعات + المخزون + نقطة البيع" },
  { value: "خدمات", label: "خدمات", sublabel: "مهنية", Icon: Wrench, modules: "المبيعات + الفواتير + التقارير" },
  { value: "مطعم", label: "مطعم / كافيه", sublabel: "", Icon: UtensilsCrossed, modules: "المبيعات + المخزون + نقطة البيع + الطاولات" },
  { value: "مقاولات", label: "مقاولات", sublabel: "وإنشاء", Icon: HardHat, modules: "المبيعات + المشتريات + محاسب المشاريع" },
  { value: "ورش ومناجر", label: "ورش /", sublabel: "مناجر", Icon: Hammer, modules: "المالية + الورشات + تتبع التكاليف" },
  { value: "متجر إلكتروني", label: "متجر", sublabel: "إلكتروني", Icon: ShoppingCart, modules: "المبيعات + المخزون + المتاجر" },
  { value: "سياحة", label: "سياحة /", sublabel: "سفر", Icon: Plane, modules: "الحجوزات + الموردون + الأرباح" },
  { value: "عيادة", label: "عيادة /", sublabel: "صيدلية", Icon: Stethoscope, modules: "المبيعات + الفواتير + التقارير" },
  { value: "تعليم", label: "تعليم /", sublabel: "تدريب", Icon: GraduationCap, modules: "المبيعات + الفواتير + التقارير" },
  { value: "أخرى", label: "نشاط", sublabel: "آخر", Icon: SettingsIcon, modules: "جميع الوحدات مفعّلة" },
];

/** Unified circular icon badge used as the visual header on every step. */
const StepIcon = ({ Icon }: { Icon: LucideIcon }) => (
  <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
    <Icon className="h-8 w-8" strokeWidth={1.8} />
  </div>
);

const CURRENCIES = [
  { code: "ILS", symbol: "₪", label: "شيكل" },
  { code: "USD", symbol: "$", label: "دولار" },
  { code: "JOD", symbol: "د.أ", label: "دينار" },
];

const needsInventory = (bt: BusinessType | null) =>
  bt ? ["تجارة", "مطعم", "متجر إلكتروني"].includes(bt) : false;

const TOTAL_STEPS = 5;

const pageVariants = {
  enter: { opacity: 0, y: 30 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

const SetupWizard = ({ userId, onComplete }: SetupWizardProps) => {
  const { toast } = useToast();
  const { refreshCompany } = useCompany();
  // -1 = welcome, 0-5 = steps 1-6, 7 = completion
  const [step, setStep] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [userName, setUserName] = useState("");
  const [data, setData] = useState<SetupData>({
    companyName: "",
    city: "",
    businessType: null,
    currency: "ILS",
    customCurrency: "",
    vatEnabled: null,
    vatRate: 16,
    inventoryMethod: "weighted_average",
    hasEmployees: null,
    employeeRange: "1-10",
    hasPOS: null,
    posCount: 1,
    invoicePrefix: "INV",
    invoiceStartNumber: 1,
    paymentTerms: "cash",
    cashBalance: 0,
    hasBankAccount: null,
    bankAccountName: "",
    bankName: "",
    bankCurrency: "ILS",
    bankAccountType: "جاري",
    bankBalance: 0,
    leaveForAccountant: false,
    password: "",
    confirmPassword: "",
  });
  const [completedItems, setCompletedItems] = useState<string[]>([]);
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      const [profileRes, sessionRes] = await Promise.all([
        supabase.from("profiles").select("display_name, company_name").eq("user_id", userId).maybeSingle(),
        supabase.auth.getSession(),
      ]);
      if (profileRes.data) {
        setUserName(profileRes.data.display_name || "");
        if (profileRes.data.company_name && profileRes.data.company_name !== "شركتي") {
          setData(d => ({ ...d, companyName: profileRes.data.company_name || "" }));
        }
      }
      const user = sessionRes.data?.session?.user;
      if (user) {
        const identities = user.identities || [];
        const hasGoogle = identities.some(i => i.provider === "google");
        const hasEmail = identities.some(i => i.provider === "email");
        if (hasGoogle && !hasEmail) {
          setIsGoogleUser(true);
        }
      }
    };
    fetchUser();
  }, [userId]);

  const update = useCallback((partial: Partial<SetupData>) => {
    setData(d => ({ ...d, ...partial }));
  }, []);

  const handleSkipAll = async () => {
    setSaving(true);
    try {
      // Refresh session to ensure valid token (critical after email verification on mobile)
      await supabase.auth.refreshSession();

      const SETUP_TIMEOUT = 20000;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const invokePromise = supabase.functions.invoke("setup-accounts", {
            body: { userId, businessType: "أخرى", hasInventory: true, hasReceivables: true, hasEmployees: false },
          });
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), SETUP_TIMEOUT)
          );
          const { data: fnData, error: fnError } = await Promise.race([invokePromise, timeoutPromise]);
          if (!fnError && !fnData?.error) break;
          if (attempt < 2) {
            await supabase.auth.refreshSession();
            await new Promise(r => setTimeout(r, 1500));
          } else {
            throw new Error(fnError?.message || fnData?.error || "فشل في إعداد شجرة الحسابات");
          }
        } catch (e: any) {
          if (e?.message === "timeout" && attempt < 2) {
            await supabase.auth.refreshSession();
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          throw e;
        }
      }

      await supabase.from("profiles").update({ setup_completed: true, business_type: "أخرى" }).eq("user_id", userId);
      await supabase.from("company_settings" as any).upsert({
        user_id: userId,
        onboarding_completed: true,
        onboarding_skipped: true,
        onboarding_completed_at: new Date().toISOString(),
      } as any, { onConflict: "user_id" });
      onComplete();
    } catch {
      toast({ title: "خطأ", description: "فشل في إعداد الحساب، يرجى المحاولة مرة أخرى", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      // Refresh session to ensure valid token (critical after email verification on mobile)
      await supabase.auth.refreshSession();

      if (isGoogleUser && data.password && data.password === data.confirmPassword && data.password.length >= 3) {
        await supabase.auth.updateUser({ password: data.password });
        localStorage.setItem(`pwd_setup_dismissed_${userId}`, "true");
      }

      const hasInv = needsInventory(data.businessType);

      const setupBody = {
        userId,
        businessType: data.businessType || "أخرى",
        hasInventory: hasInv,
        hasReceivables: true,
        hasEmployees: data.hasEmployees ?? false,
      };

      // Attempt setup with retry logic and timeout (Android WebView may drop long connections)
      const SETUP_TIMEOUT = 20000; // 20 seconds
      let setupSuccess = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const invokePromise = supabase.functions.invoke("setup-accounts", {
            body: setupBody,
          });
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), SETUP_TIMEOUT)
          );
          const { data: fnData, error: fnError } = await Promise.race([invokePromise, timeoutPromise]);

          if (fnError) {
            console.error(`Setup attempt ${attempt + 1} failed:`, fnError);
            if (attempt < 2) {
              await supabase.auth.refreshSession();
              await new Promise(r => setTimeout(r, 1500));
              continue;
            }
            throw new Error("فشل في الاتصال بخدمة إعداد الحسابات");
          }

          if (fnData?.error) {
            console.error(`Setup returned error on attempt ${attempt + 1}:`, fnData.error);
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 1500));
              continue;
            }
            throw new Error(fnData.error);
          }

          setupSuccess = true;
          break;
        } catch (e: any) {
          if (e?.message === "timeout") {
            console.error(`Setup attempt ${attempt + 1} timed out`);
            if (attempt < 2) {
              await supabase.auth.refreshSession();
              await new Promise(r => setTimeout(r, 1000));
              continue;
            }
            throw new Error("انتهت مهلة إعداد الحسابات، يرجى المحاولة مرة أخرى");
          }
          throw e;
        }
      }

      if (!setupSuccess) throw new Error("فشل في إعداد شجرة الحسابات بعد عدة محاولات");

      // Verify accounts exist (with a small delay for consistency)
      await new Promise(r => setTimeout(r, 500));
      const { count } = await supabase
        .from("accounts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (!count || count === 0) throw new Error("لم يتم إنشاء شجرة الحسابات");

      await supabase.from("profiles").update({
        setup_completed: true,
        business_type: data.businessType,
        has_inventory: hasInv,
        has_receivables: true,
        has_employees: data.hasEmployees ?? false,
        company_name: data.companyName || undefined,
        address: data.city || undefined,
        work_field: data.businessType || undefined,
      }).eq("user_id", userId);

      // Save start number as offset (so 1st new invoice = invoiceStartNumber)
      const offset = Math.max(0, (data.invoiceStartNumber || 1) - 1);
      if (data.companyName) {
        const { data: existingCompany } = await supabase
          .from("companies")
          .select("id")
          .eq("owner_id", userId)
          .maybeSingle();
        if (existingCompany) {
          await supabase.from("companies").update({ name: data.companyName, invoice_number_offset: offset }).eq("id", existingCompany.id);
        } else {
          await supabase.from("companies").insert({ owner_id: userId, name: data.companyName, invoice_number_offset: offset });
        }
      } else {
        // Still save offset even if no company name change
        const { data: existingCompany } = await supabase
          .from("companies").select("id").eq("owner_id", userId).maybeSingle();
        if (existingCompany) {
          await supabase.from("companies").update({ invoice_number_offset: offset }).eq("id", existingCompany.id);
        }
      }

      // Normalize inventory method to match Settings page values (weighted_avg/fifo/lifo)
      const normalizedInventoryMethod =
        data.inventoryMethod === "weighted_average" ? "weighted_avg" : data.inventoryMethod;

      const settingsPayload: Record<string, any> = {
        user_id: userId,
        company_name: data.companyName || null,
        city: data.city || null,
        business_type: data.businessType,
        base_currency: data.currency === "other" ? data.customCurrency : data.currency,
        vat_enabled: data.vatEnabled ?? false,
        vat_rate: data.vatEnabled ? data.vatRate : 0,
        // Save in both fields for backward compatibility & Settings page sync
        inventory_method: normalizedInventoryMethod,
        inventory_costing_method: normalizedInventoryMethod,
        has_employees: data.hasEmployees ?? false,
        employee_count_range: data.hasEmployees ? data.employeeRange : null,
        has_pos: data.hasPOS ?? false,
        pos_count: data.hasPOS ? data.posCount : 0,
        invoice_prefix: data.invoicePrefix,
        default_payment_terms: data.paymentTerms === "cash" ? "نقدي" : data.paymentTerms === "net15" ? "صافي 15" : data.paymentTerms === "net30" ? "صافي 30" : "صافي 60",
        onboarding_completed: true,
        onboarding_skipped: false,
        onboarding_completed_at: new Date().toISOString(),
      };
      await supabase.from("company_settings" as any).upsert(settingsPayload as any, { onConflict: "user_id" });

      await refreshCompany();

      const items: string[] = [];
      items.push(`شجرة حسابات لـ ${data.businessType || "نشاطك"}`);
      items.push(`تسلسل الفواتير: ${data.invoicePrefix}-2026-0001`);
      const mods: string[] = ["المحاسبة"];
      if (hasInv) mods.push("المخزون");
      if (data.hasPOS) mods.push("نقطة البيع");
      if (data.hasEmployees) mods.push("الموارد البشرية");
      items.push(mods.join(" + "));
      setCompletedItems(items);

      setStep(7);
    } catch (err: any) {
      console.error("Setup error:", err);
      toast({ title: "خطأ في الإعداد", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (step === 4) {
      handleFinish();
    } else {
      setStep(s => s + 1);
    }
  };

  const goBack = () => setStep(s => Math.max(-1, s - 1));

  const handleSkipStep = () => goNext();

  const progressPct = step < 0 ? 0 : ((step + 1) / TOTAL_STEPS) * 100;

  // ─── Render ───
  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden" dir="rtl">
      {/* Progress Bar */}
      {step >= 0 && step <= 4 && (
        <div className="px-6 pt-5 pb-2">
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 text-center">
            الخطوة {step + 1} من {TOTAL_STEPS}
          </p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          {/* ─── Welcome Screen ─── */}
          {step === -1 && (
            <motion.div key="welcome" variants={pageVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="w-full max-w-md text-center space-y-8">
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
              >
                <img src={amwaliMarkNavy} alt="AMWALI" className="mx-auto h-36 w-36 object-contain" />
              </motion.div>
              <div className="space-y-3">
                <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">
                  مرحباً {userName ? userName.split(" ")[0] : ""}
                </h1>
                <p className="text-muted-foreground text-sm">
                  سنجهّز نظامك في أقل من دقيقتين
                </p>
              </div>
              <div className="flex items-center justify-center gap-2">
                {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                  <div key={i} className="w-2.5 h-2.5 rounded-full bg-muted" />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                6 أسئلة سريعة تساعدنا على تهيئة نظام محاسبي مثالي لعملك
              </p>
              <div className="space-y-3 pt-2">
                <button
                  onClick={() => setStep(0)}
                  className="w-full h-14 rounded-2xl bg-primary text-primary-foreground text-base font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center justify-center gap-2"
                >
                  <Zap className="h-5 w-5" />
                  هيّا نبدأ
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── Step 1: Company Info ─── */}
          {step === 0 && (
            <motion.div key="s1" variants={pageVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="w-full max-w-md">
              <div className="text-center mb-8">
                <StepIcon Icon={Building2} />
                <h2 className="text-2xl font-bold text-foreground mb-2">ما اسم شركتك أو نشاطك؟</h2>
                <p className="text-sm text-muted-foreground">سيظهر هذا الاسم في فواتيرك وتقاريرك</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    <span>اسم الشركة / النشاط</span>
                  </div>
                  <input
                    type="text"
                    value={data.companyName}
                    onChange={e => update({ companyName: e.target.value })}
                    placeholder="مثال: شركة النور للتجارة"
                    className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>المدينة</span>
                  </div>
                  <input
                    type="text"
                    value={data.city}
                    onChange={e => update({ city: e.target.value })}
                    placeholder="مثال: رام الله / نابلس / عمّان"
                    className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>
                {/* Google-only user: password setup */}
                {isGoogleUser && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-3 pt-2 border-t border-border">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground pt-2">
                      <Lock className="h-4 w-4" />
                      <span>كلمة مرور للدخول السريع</span>
                      
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      يمكنك تسجيل الدخول بالبريد وكلمة المرور بدون الحاجة لجوجل
                    </p>
                    <div className="space-y-2">
                      <div className="relative">
                        <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder="كلمة المرور"
                          value={data.password}
                          onChange={e => update({ password: e.target.value })}
                          className="w-full h-12 px-4 pr-10 pl-10 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          dir="ltr"
                          style={{ textAlign: "left" }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder="تأكيد كلمة المرور"
                          value={data.confirmPassword}
                          onChange={e => update({ confirmPassword: e.target.value })}
                          className="w-full h-12 px-4 pr-10 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          dir="ltr"
                          style={{ textAlign: "left" }}
                        />
                      </div>
                      {data.password.length > 0 && data.password.length < 3 && (
                        <p className="text-xs text-destructive">كلمة المرور يجب أن تكون 3 أحرف على الأقل</p>
                      )}
                      {data.confirmPassword.length > 0 && data.password !== data.confirmPassword && (
                        <p className="text-xs text-destructive">كلمتا المرور غير متطابقتين</p>
                      )}
                    </div>
                  </motion.div>
                )}
                <p className="text-[11px] text-muted-foreground text-center pt-2">
                  يمكنك إضافة الشعار والعنوان الكامل لاحقاً من الإعدادات
                </p>
              </div>
            </motion.div>
          )}

          {/* ─── Step 2: Business Type ─── */}
          {step === 1 && (
            <motion.div key="s2" variants={pageVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="w-full max-w-lg">
              <div className="text-center mb-8">
                <StepIcon Icon={BarChart3} />
                <h2 className="text-2xl font-bold text-foreground mb-2">ما طبيعة نشاطك التجاري؟</h2>
                <p className="text-sm text-muted-foreground">سنهيئ الوحدات المناسبة لك تلقائياً</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {BUSINESS_TYPES.map(bt => (
                  <button
                    key={bt.value}
                    onClick={() => update({ businessType: bt.value })}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all active:scale-[0.97] ${
                      data.businessType === bt.value
                        ? "border-primary bg-primary/10 shadow-md shadow-primary/15"
                        : "border-border bg-card hover:border-primary/30 hover:bg-primary/5"
                    }`}
                  >
                    <bt.Icon className={`h-7 w-7 ${data.businessType === bt.value ? "text-primary" : "text-muted-foreground"}`} strokeWidth={1.8} />
                    <span className="text-xs font-bold text-foreground">{bt.label}</span>
                    {bt.sublabel && <span className="text-[10px] text-muted-foreground -mt-1">{bt.sublabel}</span>}
                  </button>
                ))}
              </div>
              {data.businessType && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 text-center"
                >
                  <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-bold">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    سنفعّل: {BUSINESS_TYPES.find(b => b.value === data.businessType)?.modules}
                  </span>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ─── Step 3: Financial Settings ─── */}
          {step === 2 && (
            <motion.div key="s3" variants={pageVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="w-full max-w-md">
              <div className="text-center mb-8">
                <StepIcon Icon={Coins} />
                <h2 className="text-2xl font-bold text-foreground mb-2">كيف تعمل مالياً؟</h2>
                <p className="text-sm text-muted-foreground">3 إعدادات تحدد آلية عمل حساباتك</p>
              </div>
              <div className="space-y-6">
                {/* Currency */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground flex items-center gap-2"><Coins className="h-4 w-4 text-primary" /> العملة الأساسية</label>
                  <div className="flex gap-2">
                    {CURRENCIES.map(c => (
                      <button
                        key={c.code}
                        onClick={() => update({ currency: c.code })}
                        className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                          data.currency === c.code
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        {c.symbol} {c.label}
                      </button>
                    ))}
                    <button
                      onClick={() => update({ currency: "other" })}
                      className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                        data.currency === "other"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      أخرى
                    </button>
                  </div>
                  {data.currency === "other" && (
                    <input
                      type="text"
                      value={data.customCurrency}
                      onChange={e => update({ customCurrency: e.target.value })}
                      placeholder="أدخل رمز العملة (مثال: EUR)"
                      className="w-full h-10 px-4 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  )}
                </div>

                {/* VAT */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> ضريبة القيمة المضافة</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => update({ vatEnabled: false })}
                      className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                        data.vatEnabled === false
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      لا — معفي
                    </button>
                    <button
                      onClick={() => update({ vatEnabled: true })}
                      className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                        data.vatEnabled === true
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      نعم — أحسب الضريبة
                    </button>
                  </div>
                  {data.vatEnabled && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">النسبة:</span>
                      <input
                        type="number"
                        value={data.vatRate}
                        onChange={e => update({ vatRate: parseFloat(e.target.value) || 0 })}
                        className="w-20 h-10 px-3 rounded-xl border border-border bg-card text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  )}
                </div>

                {/* Inventory Method */}
                {needsInventory(data.businessType) && (
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground flex items-center gap-2"><Package className="h-4 w-4 text-primary" /> طريقة تقييم المخزون</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => update({ inventoryMethod: "fifo" })}
                        className={`flex-1 py-3 px-2 rounded-xl border-2 text-xs font-bold transition-all ${
                          data.inventoryMethod === "fifo"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        <div>FIFO</div>
                        <div className="font-normal text-[10px] mt-0.5 opacity-70">الأول يدخل أول يخرج</div>
                      </button>
                      <button
                        onClick={() => update({ inventoryMethod: "weighted_average" })}
                        className={`flex-1 py-3 px-2 rounded-xl border-2 text-xs font-bold transition-all ${
                          data.inventoryMethod === "weighted_average"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        <div>متوسط مرجّح</div>
                        <div className="font-normal text-[10px] mt-0.5 opacity-70">الأبسط والأشيع</div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ─── Step 4: POS & Employees ─── */}
          {step === 3 && (
            <motion.div key="s4" variants={pageVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="w-full max-w-md">
              <div className="text-center mb-8">
                <StepIcon Icon={Users} />
                <h2 className="text-2xl font-bold text-foreground mb-2">هل لديك فريق عمل أو نقطة بيع؟</h2>
                <p className="text-sm text-muted-foreground">سنجهّز الصلاحيات وأنظمة البيع</p>
              </div>
              <div className="space-y-6">
                {/* Employees */}
                <div className="space-y-3">
                  <label className="text-sm font-bold text-foreground flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> هل لديك موظفون؟</label>
                  <div className="flex gap-3">
                    <ToggleCard
                      selected={data.hasEmployees === false}
                      onClick={() => update({ hasEmployees: false })}
                      Icon={User}
                      label="لا، أعمل وحدي"
                    />
                    <ToggleCard
                      selected={data.hasEmployees === true}
                      onClick={() => update({ hasEmployees: true })}
                      Icon={Users}
                      label="نعم، لدي فريق"
                    />
                  </div>
                  {data.hasEmployees && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-2">
                      <span className="text-xs text-muted-foreground">عدد الموظفين التقريبي</span>
                      <div className="flex gap-2">
                        {["1-10", "10-25", "25-50", "50+"].map(r => (
                          <button
                            key={r}
                            onClick={() => update({ employeeRange: r })}
                            className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all ${
                              data.employeeRange === r
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-card text-muted-foreground"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* POS */}
                <div className="space-y-3">
                  <label className="text-sm font-bold text-foreground flex items-center gap-2"><Monitor className="h-4 w-4 text-primary" /> هل لديك نقطة بيع (كاشير)؟</label>
                  <div className="flex gap-3">
                    <ToggleCard
                      selected={data.hasPOS === false}
                      onClick={() => update({ hasPOS: false })}
                      Icon={FileText}
                      label="لا، بالفاتورة فقط"
                    />
                    <ToggleCard
                      selected={data.hasPOS === true}
                      onClick={() => update({ hasPOS: true })}
                      Icon={Monitor}
                      label="نعم، لدي كاشير"
                    />
                  </div>
                  {data.hasPOS && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">عدد نقاط البيع:</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => update({ posCount: Math.max(1, data.posCount - 1) })} className="w-8 h-8 rounded-lg border border-border bg-card text-foreground flex items-center justify-center font-bold">−</button>
                        <span className="text-sm font-bold w-6 text-center">{data.posCount}</span>
                        <button onClick={() => update({ posCount: data.posCount + 1 })} className="w-8 h-8 rounded-lg border border-border bg-card text-foreground flex items-center justify-center font-bold">+</button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── Step 5: Invoice Settings ─── */}
          {step === 4 && (
            <motion.div key="s5" variants={pageVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="w-full max-w-md">
              <div className="text-center mb-8">
                <StepIcon Icon={FileText} />
                <h2 className="text-2xl font-bold text-foreground mb-2">كيف تريد ترقيم فواتيرك؟</h2>
                <p className="text-sm text-muted-foreground">هذا سيُطبَّق على أول فاتورة تنشئها</p>
              </div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground flex items-center gap-2"><Hash className="h-4 w-4 text-primary" /> بادئة رقم الفاتورة</label>
                  <input
                    type="text"
                    value={data.invoicePrefix}
                    onChange={e => update({ invoicePrefix: e.target.value.toUpperCase().slice(0, 8) })}
                    onFocus={e => e.currentTarget.select()}
                    maxLength={8}
                    className="w-full h-12 px-4 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-left"
                    dir="ltr"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    ستبدو فاتورتك: <span className="font-mono font-bold text-foreground">{data.invoicePrefix}-2026-{String(data.invoiceStartNumber).padStart(4, "0")}</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground flex items-center gap-2"><ListOrdered className="h-4 w-4 text-primary" /> من أي رقم تبدأ؟</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={data.invoiceStartNumber === 0 ? "" : String(data.invoiceStartNumber)}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, "");
                      if (digits === "") {
                        update({ invoiceStartNumber: 0 });
                      } else {
                        update({ invoiceStartNumber: parseInt(digits, 10) });
                      }
                    }}
                    onBlur={() => { if (!data.invoiceStartNumber || data.invoiceStartNumber < 1) update({ invoiceStartNumber: 1 }); }}
                    onFocus={e => e.currentTarget.select()}
                    className="w-32 h-12 px-4 rounded-xl border border-border bg-card text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                    dir="ltr"
                  />
                  <p className="text-[11px] text-muted-foreground">إذا كان لديك فواتير سابقة اكتب رقمها الأخير</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> شروط الدفع الافتراضية</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { key: "cash", label: "نقدي فوري" },
                      { key: "net15", label: "صافي 15" },
                      { key: "net30", label: "صافي 30" },
                      { key: "net60", label: "صافي 60" },
                    ].map(t => (
                      <button
                        key={t.key}
                        onClick={() => update({ paymentTerms: t.key })}
                        className={`py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${
                          data.paymentTerms === t.key
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── Completion Screen ─── */}
          {step === 7 && (
            <motion.div key="done" variants={pageVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="w-full max-w-md text-center space-y-6">
              {/* Confetti-like circles */}
              <div className="relative">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.3, 1] }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="mx-auto flex items-center justify-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                  >
                    <img src={amwaliMarkNavy} alt="AMWALI" className="h-20 w-20 object-contain" />
                  </motion.div>
                </motion.div>
                {/* Decorative circles */}
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: [0, 1, 0] }}
                    transition={{ delay: 0.5 + i * 0.1, duration: 1 }}
                    className="absolute w-3 h-3 rounded-full"
                    style={{
                      background: ["hsl(var(--primary))", "#10b981", "#f59e0b", "#ec4899"][i % 4],
                      top: `${50 + 45 * Math.sin((i * Math.PI * 2) / 8)}%`,
                      left: `${50 + 45 * Math.cos((i * Math.PI * 2) / 8)}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                ))}
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-extrabold text-foreground flex items-center justify-center gap-2">
                  <Sparkles className="h-6 w-6 text-primary" />
                  نظامك جاهز يا {userName ? userName.split(" ")[0] : ""}!
                </h2>
                <p className="text-sm text-muted-foreground">
                  تم تهيئة {completedItems.length} إعداد بناءً على نشاطك
                </p>
              </div>

              <div className="space-y-2 text-right">
                {completedItems.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 + i * 0.15 }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="text-sm text-foreground">{item}</span>
                  </motion.div>
                ))}
              </div>

              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5 }}
                onClick={onComplete}
                className="w-full h-14 rounded-2xl bg-primary text-primary-foreground text-base font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                <Zap className="h-5 w-5" />
                ابدأ الاستخدام
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      {step >= 0 && step <= 4 && (
        <div className="px-6 pb-8 pt-4 space-y-3">
          <button
            onClick={goNext}
            disabled={saving}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground text-base font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                جاري إعداد نظامك...
              </>
            ) : step === 4 ? (
              <>
                <Rocket className="h-5 w-5" />
                جهّز نظامي
              </>
            ) : (
              <>
                التالي
                <ChevronLeft className="h-4 w-4" />
              </>
            )}
          </button>
          <div className="flex items-center justify-between">
            {step > 0 ? (
              <button onClick={goBack} className="py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                رجوع
              </button>
            ) : <div />}
            <button onClick={handleSkipStep} className="py-2 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <SkipForward className="h-3 w-3" />
              تخطّي
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ToggleCard = ({ selected, onClick, Icon, label, small }: { selected: boolean; onClick: () => void; Icon: LucideIcon; label: string; small?: boolean }) => (
  <button
    onClick={onClick}
    className={`flex-1 flex flex-col items-center gap-2 ${small ? "p-3" : "p-4"} rounded-2xl border-2 transition-all active:scale-[0.97] ${
      selected
        ? "border-primary bg-primary/10 shadow-md shadow-primary/15"
        : "border-border bg-card hover:border-primary/30 hover:bg-primary/5"
    }`}
  >
    <Icon className={`${small ? "h-5 w-5" : "h-6 w-6"} ${selected ? "text-primary" : "text-muted-foreground"}`} strokeWidth={1.8} />
    <span className="text-xs font-semibold text-foreground text-center">{label}</span>
  </button>
);

export default SetupWizard;
