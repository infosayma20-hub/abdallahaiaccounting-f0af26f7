import ModuleIcon from "@/components/ModuleIcon";
import { Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";

interface AppChip {
  id: string;
  label: string;
  moduleKey: string;
}

const starterApps: AppChip[] = [
  { id: "finance", label: "المالية والمحاسبة", moduleKey: "finance" },
  { id: "sales", label: "المبيعات", moduleKey: "sales" },
  { id: "purchases", label: "المشتريات", moduleKey: "purchases" },
  { id: "reports-10", label: "10 تقارير أساسية", moduleKey: "reports" },
  { id: "ai-limited", label: "المحاسب الذكي (محدود)", moduleKey: "ai" },
  { id: "dashboard", label: "لوحة المعلومات", moduleKey: "dashboard" },
  { id: "print", label: "نماذج للطباعة", moduleKey: "print" },
];

const professionalApps: AppChip[] = [
  { id: "pos", label: "نقطة البيع POS", moduleKey: "pos" },
  { id: "inventory", label: "إدارة المخزون", moduleKey: "inventory" },
  { id: "hr", label: "الموارد البشرية", moduleKey: "hr" },
  { id: "workshops", label: "إدارة الورشات", moduleKey: "workshops" },
  { id: "assets", label: "الأصول الثابتة", moduleKey: "assets" },
  { id: "reports-all", label: "جميع التقارير (63+)", moduleKey: "reports" },
  { id: "contractor", label: "محاسب المقاولات", moduleKey: "contractor" },
  { id: "tasks", label: "إدارة المهام", moduleKey: "tasks" },
  { id: "ai-unlimited", label: "المحاسب الذكي — بلا حدود", moduleKey: "ai" },
];

const enterpriseApps: AppChip[] = [
  { id: "branches", label: "تعدد الفروع والشركات", moduleKey: "settings" },
  { id: "ecommerce", label: "المتاجر الإلكترونية", moduleKey: "ecommerce" },
  { id: "travel", label: "مالية السياحة والسفر", moduleKey: "travel" },
  
  { id: "api", label: "تكامل API", moduleKey: "customization" },
  { id: "manager", label: "مدير حساب مخصص", moduleKey: "reps" },
  { id: "sla", label: "تقارير مخصصة + SLA", moduleKey: "reports" },
];

type PlanTier = "starter" | "professional" | "enterprise";

const tiers: { key: PlanTier; label: string; subtitle: string; apps: AppChip[] }[] = [
  { key: "starter", label: "المبتدئ", subtitle: "الأساسيات", apps: starterApps },
  { key: "professional", label: "الاحترافي", subtitle: "كل شيء +", apps: professionalApps },
  { key: "enterprise", label: "المؤسسي", subtitle: "حصري +", apps: enterpriseApps },
];

const tierColors: Record<PlanTier, string> = {
  starter: "hsl(192 100% 42%)",
  professional: "hsl(43 55% 54%)",
  enterprise: "hsl(270 60% 50%)",
};

interface PlanAppsSectionProps {
  currentPlanKey?: string;
}

function getPlanLevel(planKey?: string): number {
  if (!planKey) return -1;
  const levels: Record<string, number> = { starter: 0, professional: 1, enterprise: 2 };
  return levels[planKey] ?? -1;
}

const PlanAppsSection = ({ currentPlanKey }: PlanAppsSectionProps) => {
  const navigate = useNavigate();
  const currentLevel = getPlanLevel(currentPlanKey);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="max-w-6xl mx-auto px-5 py-16">
        <h3 className="text-2xl font-bold text-[#0A2342] text-center mb-2">
          اضغط على أي تطبيق لمعرفة الباقة المطلوبة
        </h3>
        <p className="text-sm text-gray-500 text-center mb-10">التطبيقات المتاحة في كل باقة</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {tiers.map((tier, tierIdx) => {
            const isUnlocked = currentLevel >= tierIdx;
            const tierColor = tierColors[tier.key];

            return (
              <div key={tier.key} className="space-y-4">
                <div className="text-center">
                  <span className="text-sm font-bold" style={{ color: tierColor }}>
                    {tier.label} — {tier.subtitle}
                  </span>
                </div>

                <div className="space-y-2">
                  {tier.apps.map((app) => {
                    const locked = !isUnlocked;
                    const planName = tier.label;

                    const chipContent = (
                      <div
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                          locked
                            ? "border-gray-200 bg-gray-50 opacity-60 cursor-pointer hover:opacity-80"
                            : "border-gray-200 bg-white hover:shadow-sm"
                        }`}
                      >
                        <div className="shrink-0">
                          <ModuleIcon module={app.moduleKey} size="sm" />
                        </div>
                        <span className={`text-[13px] font-medium flex-1 ${locked ? "text-gray-400" : "text-[#0A2342]"}`}>
                          {app.label}
                        </span>
                        {locked && <Lock className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                      </div>
                    );

                    if (locked) {
                      return (
                        <Tooltip key={app.id}>
                          <TooltipTrigger asChild>{chipContent}</TooltipTrigger>
                          <TooltipContent side="top" className="text-center space-y-2 p-3">
                            <p className="text-xs">متاح في باقة <strong>{planName}</strong></p>
                            <button
                              onClick={() => navigate("/pricing")}
                              className="text-[11px] bg-[#4A9EE8] text-white px-3 py-1 rounded-full font-bold hover:bg-[#3a8ed8] transition-colors"
                            >
                              اشترك الآن
                            </button>
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return <div key={app.id}>{chipContent}</div>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default PlanAppsSection;
