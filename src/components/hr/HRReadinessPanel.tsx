import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

type Counts = {
  templates: number;
  tomorrowRoster: number;
  activeNoShift: number;
  visibleTeam: number;
  yesterdayMissingCheckout: number;
  loading: boolean;
};

function tomorrowISO() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function yesterdayISO() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * P0 Go-Live readiness panel — informational only.
 * Does not block punches. Read-only checks.
 */
export default function HRReadinessPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [c, setC] = useState<Counts>({
    templates: 0, tomorrowRoster: 0, activeNoShift: 0,
    visibleTeam: 0, yesterdayMissingCheckout: 0, loading: true,
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    (async () => {
      const tomorrow = tomorrowISO();
      const yesterday = yesterdayISO();
      const [t, r, a, v, m] = await Promise.all([
        supabase.from("work_shifts").select("id", { head: true, count: "exact" }).eq("user_id", user.id),
        supabase.from("daily_roster").select("id", { head: true, count: "exact" }).eq("user_id", user.id).eq("roster_date", tomorrow),
        supabase.from("employees").select("id", { head: true, count: "exact" }).eq("user_id", user.id).eq("is_active", true).eq("is_terminated", false).is("shift_id", null),
        supabase.from("employees").select("id", { head: true, count: "exact" }).eq("user_id", user.id).eq("is_active", true).eq("is_terminated", false).eq("show_in_employee_team_schedule", true),
        supabase.from("attendance_days").select("id", { head: true, count: "exact" }).eq("attendance_date", yesterday).not("first_check_in", "is", null).is("last_check_out", null),
      ]);
      if (cancel) return;
      setC({
        templates: t.count ?? 0,
        tomorrowRoster: r.count ?? 0,
        activeNoShift: a.count ?? 0,
        visibleTeam: v.count ?? 0,
        yesterdayMissingCheckout: m.count ?? 0,
        loading: false,
      });
    })();
    return () => { cancel = true; };
  }, [user?.id]);

  if (c.loading || dismissed) return null;

  const issues: { key: string; level: "warn" | "info"; text: string; cta?: { label: string; to: string } }[] = [];
  if (c.templates === 0) {
    issues.push({ key: "tpl", level: "warn", text: "لا توجد شفتات معرّفة. الحضور سيستخدم تقدير مؤقت (وردية مقدّرة) ولن يُحسب تأخير دقيق.", cta: { label: "تهيئة الشفتات", to: "/hr/shifts" } });
  }
  if (c.tomorrowRoster === 0) {
    issues.push({ key: "ros", level: "warn", text: `لا يوجد جدول دوام منشور ليوم الغد (${tomorrowISO()}).`, cta: { label: "إدارة الدوام", to: "/manager/branch-roster" } });
  }
  if (c.activeNoShift > 0) {
    issues.push({ key: "noshift", level: "warn", text: `${c.activeNoShift} موظف نشط بدون وردية معيّنة في ملفه — التصنيف سيعتمد على التقدير.`, cta: { label: "فتح الموظفين", to: "/employees" } });
  }
  if (c.visibleTeam === 0) {
    issues.push({ key: "vis", level: "info", text: "لا يوجد موظفون مفعّلون لإظهار دوامهم في «دوام الفريق». فعّل من ملف الموظف عند الحاجة.", cta: { label: "فتح الموظفين", to: "/employees" } });
  }
  if (c.yesterdayMissingCheckout >= 3) {
    issues.push({ key: "miss", level: "warn", text: `${c.yesterdayMissingCheckout} موظف لم يسجلوا انصراف أمس — يحتاجون طلب تصحيح أو تعديل من المدير. لن يُغلق تلقائياً.` });
  }

  if (issues.length === 0) {
    return (
      <Card className="p-3 border-emerald-300 bg-emerald-50/50 flex items-center gap-2 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4" />
        <span>جاهزية الغد: لا توجد تنبيهات.</span>
      </Card>
    );
  }

  return (
    <Card className="p-3 border-amber-300 bg-amber-50/50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-900 text-sm mb-1">جاهزية الغد — تنبيهات إعداد</div>
            <ul className="space-y-1.5 text-sm text-amber-900/90 list-disc pr-4">
              {issues.map(i => (
                <li key={i.key} className="flex flex-wrap items-center gap-2">
                  <span>{i.text}</span>
                  {i.cta && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1" onClick={() => navigate(i.cta!.to)}>
                      {i.cta.label} <ArrowLeft className="h-3 w-3" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <div className="text-[11px] text-amber-700/80 mt-2">معلوماتي فقط — لن يمنع البصمات. يحدّث عند تحديث الصفحة.</div>
          </div>
        </div>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setDismissed(true)}>إخفاء</Button>
      </div>
    </Card>
  );
}
