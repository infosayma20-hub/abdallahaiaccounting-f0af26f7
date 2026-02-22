import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ChevronLeft, Store, Briefcase, UtensilsCrossed, ShoppingCart, HardHat, MoreHorizontal, Package, Users, HandCoins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SetupWizardProps {
  userId: string;
  onComplete: () => void;
}

type BusinessType = "تجارة" | "خدمات" | "مطعم" | "متجر إلكتروني" | "مقاولات" | "أخرى";

interface SetupData {
  businessType: BusinessType | null;
  hasInventory: boolean | null;
  hasReceivables: boolean | null;
  hasEmployees: boolean | null;
}

const businessTypes: { value: BusinessType; label: string; icon: React.ElementType; emoji: string }[] = [
  { value: "تجارة", label: "تجارة", icon: Store, emoji: "🏪" },
  { value: "خدمات", label: "خدمات", icon: Briefcase, emoji: "💼" },
  { value: "مطعم", label: "مطعم / كافيه", icon: UtensilsCrossed, emoji: "🍽️" },
  { value: "متجر إلكتروني", label: "متجر إلكتروني", icon: ShoppingCart, emoji: "🛒" },
  { value: "مقاولات", label: "مقاولات", icon: HardHat, emoji: "🏗️" },
  { value: "أخرى", label: "نشاط آخر", icon: MoreHorizontal, emoji: "📋" },
];

const SetupWizard = ({ userId, onComplete }: SetupWizardProps) => {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<SetupData>({
    businessType: null,
    hasInventory: null,
    hasReceivables: null,
    hasEmployees: null,
  });

  const handleFinish = async () => {
    setSaving(true);
    try {
      // Save to profiles
      await supabase.from("profiles").update({
        business_type: data.businessType,
        has_inventory: data.hasInventory ?? false,
        has_receivables: data.hasReceivables ?? false,
        has_employees: data.hasEmployees ?? false,
        setup_completed: true,
      }).eq("user_id", userId);

      // Create accounts via edge function
      const { error } = await supabase.functions.invoke("setup-accounts", {
        body: {
          userId,
          businessType: data.businessType,
          hasInventory: data.hasInventory,
          hasReceivables: data.hasReceivables,
          hasEmployees: data.hasEmployees,
        },
      });

      if (error) throw error;

      toast({ title: "✅ تم إعداد نظامك المالي بنجاح!" });
      onComplete();
    } catch (err: any) {
      console.error("Setup error:", err);
      toast({ title: "خطأ في الإعداد", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (step < 3) setStep(step + 1);
    else handleFinish();
  };

  const canProceed = () => {
    switch (step) {
      case 0: return data.businessType !== null;
      case 1: return data.hasInventory !== null;
      case 2: return data.hasReceivables !== null;
      case 3: return data.hasEmployees !== null;
      default: return false;
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col" dir="rtl">
      {/* Progress bar */}
      <div className="px-6 pt-6 pb-2">
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 text-center">
          الخطوة {step + 1} من 4
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Step 0: Business Type */}
        {step === 0 && (
          <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-400">
            <div className="text-center mb-8">
              <div className="text-5xl mb-4">🏢</div>
              <h2 className="text-2xl font-bold text-foreground mb-2">ما نوع نشاطك؟</h2>
              <p className="text-sm text-muted-foreground">سنجهّز لك النظام المالي المناسب تلقائياً</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {businessTypes.map((bt) => (
                <button
                  key={bt.value}
                  onClick={() => setData({ ...data, businessType: bt.value })}
                  className={`flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 transition-all active:scale-[0.97] ${
                    data.businessType === bt.value
                      ? "border-primary bg-primary/10 shadow-md shadow-primary/15"
                      : "border-border bg-card hover:border-primary/30 hover:bg-primary/5"
                  }`}
                >
                  <span className="text-2xl">{bt.emoji}</span>
                  <span className="text-xs font-semibold text-foreground">{bt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Inventory */}
        {step === 1 && (
          <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-400">
            <div className="text-center mb-8">
              <div className="text-5xl mb-4">📦</div>
              <h2 className="text-2xl font-bold text-foreground mb-2">هل لديك مخزون؟</h2>
              <p className="text-sm text-muted-foreground">هل تتعامل مع بضاعة أو منتجات تحتاج متابعة كمياتها؟</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <YesNoCard
                selected={data.hasInventory === true}
                onClick={() => setData({ ...data, hasInventory: true })}
                emoji="✅"
                label="نعم، لدي مخزون"
              />
              <YesNoCard
                selected={data.hasInventory === false}
                onClick={() => setData({ ...data, hasInventory: false })}
                emoji="❌"
                label="لا، لا أحتاج"
              />
            </div>
          </div>
        )}

        {/* Step 2: Receivables */}
        {step === 2 && (
          <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-400">
            <div className="text-center mb-8">
              <div className="text-5xl mb-4">💳</div>
              <h2 className="text-2xl font-bold text-foreground mb-2">هل تبيع بالآجل؟</h2>
              <p className="text-sm text-muted-foreground">هل لديك زبائن يشترون الآن ويدفعون لاحقاً؟</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <YesNoCard
                selected={data.hasReceivables === true}
                onClick={() => setData({ ...data, hasReceivables: true })}
                emoji="✅"
                label="نعم، بيع آجل"
              />
              <YesNoCard
                selected={data.hasReceivables === false}
                onClick={() => setData({ ...data, hasReceivables: false })}
                emoji="❌"
                label="لا، نقدي فقط"
              />
            </div>
          </div>
        )}

        {/* Step 3: Employees */}
        {step === 3 && (
          <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-400">
            <div className="text-center mb-8">
              <div className="text-5xl mb-4">👥</div>
              <h2 className="text-2xl font-bold text-foreground mb-2">هل لديك موظفين؟</h2>
              <p className="text-sm text-muted-foreground">هل تدفع رواتب لفريق عمل؟</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <YesNoCard
                selected={data.hasEmployees === true}
                onClick={() => setData({ ...data, hasEmployees: true })}
                emoji="✅"
                label="نعم، لدي موظفين"
              />
              <YesNoCard
                selected={data.hasEmployees === false}
                onClick={() => setData({ ...data, hasEmployees: false })}
                emoji="❌"
                label="لا، أعمل وحدي"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 pb-10 pt-4 space-y-3">
        <Button
          onClick={goNext}
          disabled={!canProceed() || saving}
          className="w-full h-14 rounded-2xl text-base font-semibold shadow-lg shadow-primary/20"
        >
          {saving ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              جاري إعداد نظامك...
            </>
          ) : step < 3 ? (
            <>
              التالي
              <ChevronLeft className="h-4 w-4" />
            </>
          ) : (
            "🚀 جهّز نظامي المالي"
          )}
        </Button>
        {step > 0 && !saving && (
          <button
            onClick={() => setStep(step - 1)}
            className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            رجوع
          </button>
        )}
      </div>
    </div>
  );
};

const YesNoCard = ({ selected, onClick, emoji, label }: { selected: boolean; onClick: () => void; emoji: string; label: string }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all active:scale-[0.97] ${
      selected
        ? "border-primary bg-primary/10 shadow-md shadow-primary/15"
        : "border-border bg-card hover:border-primary/30 hover:bg-primary/5"
    }`}
  >
    <span className="text-3xl">{emoji}</span>
    <span className="text-xs font-semibold text-foreground text-center">{label}</span>
  </button>
);

export default SetupWizard;
