import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

export interface CustomDashboard {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  is_default: boolean;
  is_shared: boolean;
  share_token?: string | null;
  shared_at?: string | null;
  layout_config: Record<string, any>;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type WidgetType = "kpi" | "chart" | "report" | "text" | "insights";

export interface DashboardWidget {
  id: string;
  dashboard_id: string;
  user_id: string;
  widget_type: WidgetType;
  title: string | null;
  config: Record<string, any>;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
}

export function useCustomDashboards() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dashboards, setDashboards] = useState<CustomDashboard[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("custom_dashboards")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else setDashboards((data || []) as CustomDashboard[]);
    setLoading(false);
  }, [user, toast]);

  useEffect(() => { load(); }, [load]);

  const createDashboard = async (input: Partial<CustomDashboard>) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("custom_dashboards")
      .insert({
        user_id: dataOwnerId!,
        name: input.name || "لوحة بدون اسم",
        description: input.description ?? null,
        icon: input.icon || "📊",
      })
      .select()
      .single();
    if (error) {
      toast({ title: "خطأ في الإنشاء", description: error.message, variant: "destructive" });
      return null;
    }
    await load();
    return data as CustomDashboard;
  };

  const updateDashboard = async (id: string, patch: Partial<CustomDashboard>) => {
    const { error } = await supabase.from("custom_dashboards").update(patch).eq("id", id);
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else await load();
  };

  const deleteDashboard = async (id: string) => {
    const { error } = await supabase.from("custom_dashboards").delete().eq("id", id);
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else { await load(); toast({ title: "تم الحذف" }); }
  };

  return { dashboards, loading, reload: load, createDashboard, updateDashboard, deleteDashboard };
}

export function useDashboardWidgets(dashboardId: string | null) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || !dashboardId) { setWidgets([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("dashboard_widgets")
      .select("*")
      .eq("dashboard_id", dashboardId);
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else setWidgets((data || []) as DashboardWidget[]);
    setLoading(false);
  }, [user, dashboardId, toast]);

  useEffect(() => { load(); }, [load]);

  const addWidget = async (input: Omit<Partial<DashboardWidget>, "id"> & { widget_type: WidgetType }) => {
    if (!user || !dashboardId) return null;
    // Find a free row (just append at the bottom)
    const maxY = widgets.reduce((m, w) => Math.max(m, w.pos_y + w.height), 0);
    const { data, error } = await supabase
      .from("dashboard_widgets")
      .insert({
        dashboard_id: dashboardId,
        user_id: dataOwnerId!,
        widget_type: input.widget_type,
        title: input.title || null,
        config: input.config || {},
        pos_x: input.pos_x ?? 0,
        pos_y: input.pos_y ?? maxY,
        width: input.width ?? 4,
        height: input.height ?? 3,
      })
      .select()
      .single();
    if (error) {
      toast({ title: "خطأ في الإضافة", description: error.message, variant: "destructive" });
      return null;
    }
    await load();
    return data as DashboardWidget;
  };

  const updateWidget = async (id: string, patch: Partial<DashboardWidget>) => {
    const { error } = await supabase.from("dashboard_widgets").update(patch).eq("id", id);
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else await load();
  };

  const updateLayout = async (updates: { id: string; pos_x: number; pos_y: number; width: number; height: number }[]) => {
    // Optimistic local update
    setWidgets(prev => prev.map(w => {
      const u = updates.find(x => x.id === w.id);
      return u ? { ...w, pos_x: u.pos_x, pos_y: u.pos_y, width: u.width, height: u.height } : w;
    }));
    // Persist
    await Promise.all(updates.map(u =>
      supabase.from("dashboard_widgets")
        .update({ pos_x: u.pos_x, pos_y: u.pos_y, width: u.width, height: u.height })
        .eq("id", u.id)
    ));
  };

  const deleteWidget = async (id: string) => {
    const { error } = await supabase.from("dashboard_widgets").delete().eq("id", id);
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else await load();
  };

  return { widgets, loading, reload: load, addWidget, updateWidget, updateLayout, deleteWidget };
}
