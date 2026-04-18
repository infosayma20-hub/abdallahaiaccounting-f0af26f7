-- Custom Reports table for Report Builder
CREATE TABLE public.custom_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  data_source TEXT NOT NULL CHECK (data_source IN ('sales', 'purchases', 'inventory', 'payments', 'receipts', 'journal')),
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  group_by TEXT,
  sort_by JSONB DEFAULT '[]'::jsonb,
  chart_type TEXT DEFAULT 'none' CHECK (chart_type IN ('none', 'bar', 'line', 'pie', 'area')),
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  icon TEXT DEFAULT 'BarChart3',
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  use_count INTEGER NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX idx_custom_reports_user_id ON public.custom_reports(user_id);
CREATE INDEX idx_custom_reports_data_source ON public.custom_reports(data_source);
CREATE INDEX idx_custom_reports_favorite ON public.custom_reports(user_id, is_favorite) WHERE is_favorite = true;

-- Enable RLS
ALTER TABLE public.custom_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own custom reports"
ON public.custom_reports FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own custom reports"
ON public.custom_reports FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own custom reports"
ON public.custom_reports FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own custom reports"
ON public.custom_reports FOR DELETE
USING (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE TRIGGER update_custom_reports_updated_at
BEFORE UPDATE ON public.custom_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();