import { useNavigate } from "react-router-dom";
import { Crown, Lock, ArrowLeft, Sparkles } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  moduleName: string;
  requiredTier?: string;
}

const TIER_LABELS: Record<string, { ar: string; price: number; color: string }> = {
  basic: { ar: "الأساسي", price: 19, color: "#64748b" },
  pro: { ar: "الاحترافي", price: 49, color: "#3b82f6" },
  enterprise: { ar: "المؤسسي", price: 129, color: "#8b5cf6" },
};

const UpgradePromptModal = ({ open, onOpenChange, moduleName, requiredTier = "pro" }: Props) => {
  const navigate = useNavigate();
  const tier = TIER_LABELS[requiredTier] || TIER_LABELS.pro;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden" dir="rtl">
        {/* Header */}
        <div
          className="px-6 pt-8 pb-6 text-center text-white"
          style={{ background: `linear-gradient(135deg, ${tier.color}, ${tier.color}cc)` }}
        >
          <div className="w-16 h-16 mx-auto rounded-full bg-white/20 backdrop-blur flex items-center justify-center mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-1">{moduleName}</h2>
          <p className="text-sm opacity-90">غير متاح في باقتك الحالية</p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/50">
            <Crown className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: tier.color }} />
            <div className="text-sm">
              <p className="font-semibold mb-1">للوصول لهذه الميزة:</p>
              <p className="text-muted-foreground">
                ترقية إلى الباقة <span className="font-bold" style={{ color: tier.color }}>{tier.ar}</span> أو أعلى
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold" style={{ color: tier.color }}>${tier.price}</span>
              <span className="text-sm text-muted-foreground">/ شهرياً</span>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              يشمل كل ميزات الباقة + دعم فني
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={() => { onOpenChange(false); navigate("/pricing"); }}
              className="w-full gap-2"
              style={{ background: tier.color }}
            >
              <Crown className="w-4 h-4" />
              عرض الباقات
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full gap-2">
              <ArrowLeft className="w-4 h-4" />
              لاحقاً
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradePromptModal;
