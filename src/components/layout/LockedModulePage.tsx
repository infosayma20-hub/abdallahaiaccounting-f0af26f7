import { useNavigate } from "react-router-dom";
import { Lock, ArrowRight, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTT } from "@/i18n/dict";

interface Props {
  moduleName?: string;
  requiredPlan?: string;
}

const LockedModulePage = ({ moduleName, requiredPlan }: Props) => {
  const navigate = useNavigate();
  const tt = useTT();
  const name = moduleName || tt("هذا الموديل");

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="text-center max-w-md space-y-6">
        {/* Lock icon */}
        <div className="mx-auto w-20 h-20 rounded-full bg-muted flex items-center justify-center">
          <Lock className="w-10 h-10 text-muted-foreground" />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">
            {name} {tt("غير متاح")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tt("هذا الموديل مقفل في حسابك الحالي. تواصل مع مدير النظام لتفعيله.")}
          </p>
        </div>

        {/* Plan info */}
        {requiredPlan && (
          <div className="border border-border rounded-lg p-4 bg-card text-sm space-y-1">
            <p className="text-muted-foreground">{tt("مطلوب:")} <span className="font-semibold text-foreground">{requiredPlan}</span></p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Button onClick={() => navigate("/pricing")} className="gap-2">
            <Rocket className="w-4 h-4" />
            {tt("ترقية الباقة الآن")}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/apps")} className="gap-2">
            <ArrowRight className="w-4 h-4" />
            {tt("العودة للتطبيقات")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LockedModulePage;
