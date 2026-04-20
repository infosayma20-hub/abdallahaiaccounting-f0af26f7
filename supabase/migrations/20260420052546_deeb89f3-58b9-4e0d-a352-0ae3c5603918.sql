-- Phase 4: Saved Reports Advanced (folders + archive + versions)

-- 1) Folders
CREATE TABLE IF NOT EXISTS public.report_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#3b82f6',
  icon text DEFAULT 'Folder',
  parent_id uuid REFERENCES public.report_folders(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.report_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own folders" ON public.report_folders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own folders" ON public.report_folders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own folders" ON public.report_folders
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own folders" ON public.report_folders
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_report_folders_user ON public.report_folders(user_id);

CREATE TRIGGER update_report_folders_updated_at
  BEFORE UPDATE ON public.report_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Add folder_id + is_archived + archived_at to custom_reports
ALTER TABLE public.custom_reports
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.report_folders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_custom_reports_folder ON public.custom_reports(folder_id);
CREATE INDEX IF NOT EXISTS idx_custom_reports_archived ON public.custom_reports(user_id, is_archived);

-- 3) Versions (snapshot history)
CREATE TABLE IF NOT EXISTS public.custom_report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.custom_reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  version_number integer NOT NULL,
  snapshot jsonb NOT NULL,
  change_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_report_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own versions" ON public.custom_report_versions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own versions" ON public.custom_report_versions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own versions" ON public.custom_report_versions
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_report_versions_report ON public.custom_report_versions(report_id, version_number DESC);

-- 4) Auto-snapshot trigger: on UPDATE of custom_reports, create a version row
CREATE OR REPLACE FUNCTION public.snapshot_custom_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_version integer;
BEGIN
  -- Only snapshot when the configuration actually changed
  IF (NEW.columns IS DISTINCT FROM OLD.columns
      OR NEW.filters IS DISTINCT FROM OLD.filters
      OR NEW.group_by IS DISTINCT FROM OLD.group_by
      OR NEW.sort_by IS DISTINCT FROM OLD.sort_by
      OR NEW.chart_type IS DISTINCT FROM OLD.chart_type
      OR NEW.data_source IS DISTINCT FROM OLD.data_source
      OR NEW.name IS DISTINCT FROM OLD.name) THEN

    SELECT COALESCE(MAX(version_number), 0) + 1
      INTO next_version
      FROM public.custom_report_versions
      WHERE report_id = NEW.id;

    INSERT INTO public.custom_report_versions
      (report_id, user_id, version_number, snapshot)
    VALUES (
      NEW.id,
      NEW.user_id,
      next_version,
      jsonb_build_object(
        'name', OLD.name,
        'description', OLD.description,
        'data_source', OLD.data_source,
        'columns', OLD.columns,
        'filters', OLD.filters,
        'group_by', OLD.group_by,
        'sort_by', OLD.sort_by,
        'chart_type', OLD.chart_type
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_custom_report ON public.custom_reports;
CREATE TRIGGER trg_snapshot_custom_report
  BEFORE UPDATE ON public.custom_reports
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_custom_report();