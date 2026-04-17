// Customer 360 — policy panel: shows class rules (terms, limit, discount, follow-up).
// Read-only from contact_class_policies via Customer360 hook.

import { Shield, Calendar, CreditCard, Percent, Bell } from "lucide-react";
import type { ContactSnapshot, PolicySnapshot, CreditDecision } from "../lib/policyEngine";

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);

interface Props {
  contact: ContactSnapshot | null;
  policy: PolicySnapshot | null;
  decision: CreditDecision;
}

export default function CustomerPolicyPanel({ contact, policy, decision }: Props) {
  const overrideTerms = contact?.payment_terms_days != null && contact.payment_terms_days !== policy?.payment_terms_days;
  const overrideLimit = contact?.credit_limit != null && Number(contact.credit_limit) !== Number(policy?.credit_limit_default ?? 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-bold text-slate-900">سياسة العميل</h3>
        {policy && (
          <span className="text-[10px] text-slate-400">
            (مرجع: {policy.label ?? `فئة ${policy.class}`})
          </span>
        )}
      </div>

      {!policy && !contact?.contact_class ? (
        <p className="text-[12px] text-slate-400 text-center py-4">
          لا توجد سياسة مرتبطة. حدّد فئة العميل من ملفه الرئيسي لتطبيق القواعد.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <PolicyRow
            icon={<Calendar className="h-3.5 w-3.5" />}
            label="مدة السداد"
            value={`${decision.recommendedTermsDays} يوم`}
            override={overrideTerms ? "تجاوز سياسة الفئة" : undefined}
          />
          <PolicyRow
            icon={<CreditCard className="h-3.5 w-3.5" />}
            label="سقف الائتمان"
            value={decision.effectiveLimit > 0 ? `${fmt(decision.effectiveLimit)} ₪` : "—"}
            override={overrideLimit ? "تجاوز سياسة الفئة" : undefined}
          />
          <PolicyRow
            icon={<Percent className="h-3.5 w-3.5" />}
            label="الخصم المقترح"
            value={policy?.discount_pct ? `${policy.discount_pct}٪` : "—"}
          />
          <PolicyRow
            icon={<Bell className="h-3.5 w-3.5" />}
            label="تكرار المتابعة"
            value={policy?.followup_days ? `كل ${policy.followup_days} يوم` : "—"}
          />
        </div>
      )}

      {policy?.description && (
        <p className="mt-3 text-[11px] text-slate-500 border-t border-slate-100 pt-2">
          {policy.description}
        </p>
      )}
    </div>
  );
}

function PolicyRow({ icon, label, value, override }: { icon: React.ReactNode; label: string; value: string; override?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-[13px] font-bold text-slate-900">{value}</div>
      {override && (
        <div className="mt-0.5 text-[9px] text-amber-700 font-semibold">⚠ {override}</div>
      )}
    </div>
  );
}
