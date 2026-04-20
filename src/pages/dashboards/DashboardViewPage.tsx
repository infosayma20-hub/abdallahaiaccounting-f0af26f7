import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Plus, Edit3, Save, Loader2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import DashboardGrid from "@/components/dashboard-builder/DashboardGrid";
import AddWidgetDialog from "@/components/dashboard-builder/AddWidgetDialog";
import { useCustomDashboards, useDashboardWidgets, type DashboardWidget } from "@/hooks/useCustomDashboards";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function DashboardViewPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { widgets, loading, addWidget, updateWidget, updateLayout, deleteWidget } = useDashboardWidgets(id || null);

  const [dashboard, setDashboard] = useState<any>(null);
  const [editMode, setEditMode] = useState(searchParams.get("edit") === "1");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<DashboardWidget | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from("custom_dashboards").select("*").eq("id", id).maybeSingle().then(({ data, error }) => {
      if (error || !data) {
        toast({ title: "اللوحة غير موجودة", variant: "destructive" });
        navigate("/dashboards");
        return;
      }
      setDashboard(data);
    });
  }, [id, navigate, toast]);

  const handleSaveWidget = async (input: any) => {
    if (editing) {
      await updateWidget(editing.id, { title: input.title, config: input.config });
      setEditing(null);
    } else {
      await addWidget(input);
    }
  };

  if (!dashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
              <h1 className="text-lg font-bold text-foreground truncate">{dashboard.name}</h1>
              {dashboard.description && <p className="text-xs text-muted-foreground truncate">{dashboard.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/dashboards")} className="gap-2">
              <ArrowRight className="h-4 w-4" /> رجوع
            </Button>
            {editMode ? (
              <>
                <Button onClick={() => setAddOpen(true)} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" /> إضافة عنصر
                </Button>
                <Button onClick={() => setEditMode(false)} className="gap-2">
                  <Save className="h-4 w-4" /> إنهاء التحرير
                </Button>
              </>
            ) : (
              <Button onClick={() => setEditMode(true)} variant="outline" className="gap-2">
                <Edit3 className="h-4 w-4" /> تحرير
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : widgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-bold text-foreground mb-1">لوحة فارغة</h3>
            <p className="text-sm text-muted-foreground mb-4">ابدأ بإضافة أول عنصر</p>
            <Button onClick={() => { setEditMode(true); setAddOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> إضافة عنصر
            </Button>
          </div>
        ) : (
          <DashboardGrid
            widgets={widgets}
            editMode={editMode}
            onLayoutChange={updateLayout}
            onConfigure={(w) => { setEditing(w); setAddOpen(true); }}
            onDelete={deleteWidget}
          />
        )}
      </div>

      <AddWidgetDialog
        open={addOpen}
        onOpenChange={(o) => { setAddOpen(o); if (!o) setEditing(null); }}
        initial={editing}
        onSave={handleSaveWidget}
      />
    </div>
  );
}
