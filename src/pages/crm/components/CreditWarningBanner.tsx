// Inline banner shown inside opportunity / quote forms when proposed amount
// triggers policy warnings. Pure UI over policyEngine output.

import { AlertTriangle, ShieldAlert, CheckCircle2 } from "lucide-react";
import type { CreditDecision } from "../lib/policyEngine";

interface Props {
  decision: CreditDecision;
  proposedAmount?: number;
  compact?: boolean;
}

export default function CreditWarningBanner({ decision, proposedAmount = 0, compact }: Props) {
  const hasWarnings = decision.warnings.length > 0;
  const blocked = !decision.canSellOnCredit;

  if (!hasWarnings && proposedAmount === 0) return null;

  if (!hasWarnings) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>
          ضمن سقف الائتمان — متاح: <b>{decision.available.toFixed(0)} ₪</b> · المدة المقترحة:{" "}
          <b>{decision.recommendedTermsDays} يوم</b>
        </span>
      </div>
    );
  }

  const tone = blocked
    ? { bg: "bg-red-50", border: "border-red-300", text: "text-red-900", icon: ShieldAlert, iconColor: "text-red-600" }
    : decision.requiresApproval
      ? { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-900", icon: AlertTriangle, iconColor: "text-amber-600" }
      : { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-900", icon: AlertTriangle, iconColor: "text-orange-600" };

  const Icon = tone.icon;

  return (
    <div className={`rounded-lg border ${tone.border} ${tone.bg} p-3`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${tone.iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className={`text-[12px] font-bold ${tone.text}`}>
            {blocked
              ? "البيع الآجل ممنوع لهذا العميل"
              : decision.requiresApproval
                ? "تنبيه: يحتاج موافقة الإدارة"
                : "تنبيه ائتماني"}
          </div>
          {!compact && (
            <ul className={`mt-1.5 space-y-0.5 text-[11px] ${tone.text} opacity-90`}>
              {decision.warnings.map((w, i) => (
                <li key={i} className="flex gap-1.5">
                  <span>•</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
          {decision.effectiveLimit > 0 && (
            <div className={`mt-2 text-[10px] ${tone.text} opacity-75 flex flex-wrap gap-x-3 gap-y-1`}>
              <span>السقف: <b>{decision.effectiveLimit.toFixed(0)} ₪</b></span>
              <span>المستخدم: <b>{decision.used.toFixed(0)} ₪</b></span>
              <span>المتاح: <b>{Math.max(0, decision.available).toFixed(0)} ₪</b></span>
              <span>الاستخدام: <b>{decision.utilizationPct.toFixed(0)}٪</b></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
