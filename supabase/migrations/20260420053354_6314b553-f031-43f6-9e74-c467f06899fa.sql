-- Custom Dashboards
CREATE TABLE public.custom_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '📊',
  is_default BOOLEAN DEFAULT false,
  is_shared BOOLEAN DEFAULT false,
  layout_config JSONB DEFAULT '{}'::jsonb,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_dashboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own dashboards" ON public.custom_dashboards
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own dashboards" ON public.custom_dashboards
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own dashboards" ON public.custom_dashboards
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own dashboards" ON public.custom_dashboards
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_custom_dashboards_user ON public.custom_dashboards(user_id);

CREATE TRIGGER update_custom_dashboards_updated_at
  BEFORE UPDATE ON public.custom_dashboards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Dashboard Widgets
CREATE TABLE public.dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES public.custom_dashboards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  widget_type TEXT NOT NULL, -- 'kpi' | 'chart' | 'report' | 'text'
  title TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  pos_x INTEGER NOT NULL DEFAULT 0,
  pos_y INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 4,
  height INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own widgets" ON public.dashboard_widgets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own widgets" ON public.dashboard_widgets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own widgets" ON public.dashboard_widgets
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own widgets" ON public.dashboard_widgets
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_dashboard_widgets_dashboard ON public.dashboard_widgets(dashboard_id);
CREATE INDEX idx_dashboard_widgets_user ON public.dashboard_widgets(user_id);

CREATE TRIGGER update_dashboard_widgets_updated_at
  BEFORE UPDATE ON public.dashboard_widgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();