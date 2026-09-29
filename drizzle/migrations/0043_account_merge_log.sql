CREATE TABLE public.account_merge_log (
  id bigserial PRIMARY KEY,
  batch text NOT NULL,
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  old_debit_account_code text,
  old_credit_account_code text,
  old_account_code text,
  old_cost_center_id uuid,
  old_cost_center_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.account_merge_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.account_merge_log_id_seq TO service_role;
ALTER TABLE public.account_merge_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no client access" ON public.account_merge_log FOR SELECT TO authenticated USING (false);
CREATE INDEX ON public.account_merge_log(batch);
COMMENT ON TABLE public.account_merge_log IS 'Audit/rollback log for merging branch-specific accounts into unified accounts with cost centers';