CREATE TABLE public.app_perf_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  route text,
  kind text NOT NULL,
  label text,
  duration_ms integer NOT NULL,
  status integer,
  ping_ms integer,
  connection text,
  device text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.app_perf_samples TO authenticated;
GRANT ALL ON public.app_perf_samples TO service_role;

ALTER TABLE public.app_perf_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perf_insert_own" ON public.app_perf_samples
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "perf_select_own_or_admin" ON public.app_perf_samples
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE INDEX idx_app_perf_samples_created ON public.app_perf_samples (created_at DESC);
CREATE INDEX idx_app_perf_samples_user_created ON public.app_perf_samples (user_id, created_at DESC);