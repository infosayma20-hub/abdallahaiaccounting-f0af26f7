/**
 * PublicDashboardPage — صفحة عامة لعرض لوحة مشتركة عبر share_token (للقراءة فقط).
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Radio, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DashboardGrid from "@/components/dashboard-builder/DashboardGrid";
import type { CustomDashboard, DashboardWidget } from "@/hooks/useCustomDashboards";

export default function PublicDashboardPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<CustomDashboard | null>(null);
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      const { data: d, error: dErr } = await supabase
        .from("custom_dashboards")
        .select("*")
        .eq("share_token", token)
        .eq("is_shared", true)
        .maybeSingle();
      if (dErr || !d) {
        setError("اللوحة غير متاحة أو تم إيقاف مشاركتها");
        setLoading(false);
        return;
      }
      setDashboard(d as CustomDashboard);
      const { data: ws } = await supabase
        .from("dashboard_widgets")
        .select("*")
        .eq("dashboard_id", d.id);
      setWidgets((ws || []) as DashboardWidget[]);
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="text-center max-w-sm px-6">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-bold text-foreground mb-1">رابط غير متاح</h1>
          <p className="text-sm text-muted-foreground">{error || "اللوحة غير موجودة"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="px-4 pt-4 pb-3 border-b border-border/30 bg-card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl">{dashboard.icon || "📊"}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-foreground truncate">{dashboard.name}</h1>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[9px] font-semibold">
                  <Radio className="h-2.5 w-2.5 animate-pulse" /> LIVE
                </span>
              </div>
              {dashboard.description && (
                <p className="text-xs text-muted-foreground truncate">{dashboard.description}</p>
              )}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground">عرض عام · للقراءة فقط</div>
        </div>
      </div>

      <div className="p-4">
        {widgets.length === 0 ? (
          <div className="text-center py-20 text-sm text-muted-foreground">لا توجد عناصر في هذه اللوحة</div>
        ) : (
          <DashboardGrid widgets={widgets} editMode={false} />
        )}
      </div>

      <div className="text-center text-[10px] text-muted-foreground py-4">
        مدعوم بواسطة <span className="font-semibold">أموالي</span>
      </div>
    </div>
  );
}
