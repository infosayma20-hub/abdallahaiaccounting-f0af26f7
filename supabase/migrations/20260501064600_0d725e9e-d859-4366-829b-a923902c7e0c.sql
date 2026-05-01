CREATE TABLE IF NOT EXISTS public._phase5a_test_results (
  id bigserial primary key,
  test_name text,
  result jsonb,
  created_at timestamptz default now()
);
ALTER TABLE public._phase5a_test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY p5a_open ON public._phase5a_test_results FOR SELECT TO authenticated USING (true);