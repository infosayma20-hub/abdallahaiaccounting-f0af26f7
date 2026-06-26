
CREATE TABLE IF NOT EXISTS public.sparta_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  code text,
  name text NOT NULL,
  customer_id uuid REFERENCES public.sparta_customers(id) ON DELETE SET NULL,
  manager_id uuid,
  description text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','onhold','completed','cancelled')),
  budget numeric(14,2) DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  progress_pct numeric(5,2) DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sp_proj_company ON public.sparta_projects(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_projects TO authenticated;
GRANT ALL ON public.sparta_projects TO service_role;
ALTER TABLE public.sparta_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_proj_sel ON public.sparta_projects FOR SELECT TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_proj_ins ON public.sparta_projects FOR INSERT TO authenticated WITH CHECK (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_proj_upd ON public.sparta_projects FOR UPDATE TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_proj_del ON public.sparta_projects FOR DELETE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());

CREATE TABLE IF NOT EXISTS public.sparta_project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.sparta_projects(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.sparta_project_tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_to uuid,
  start_date date,
  due_date date,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','review','done','blocked')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  progress_pct numeric(5,2) DEFAULT 0,
  estimated_hours numeric(6,2) DEFAULT 0,
  actual_hours numeric(6,2) DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sp_task_proj ON public.sparta_project_tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_sp_task_assigned ON public.sparta_project_tasks(assigned_to, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_project_tasks TO authenticated;
GRANT ALL ON public.sparta_project_tasks TO service_role;
ALTER TABLE public.sparta_project_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_task_sel ON public.sparta_project_tasks FOR SELECT TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_task_ins ON public.sparta_project_tasks FOR INSERT TO authenticated WITH CHECK (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_task_upd ON public.sparta_project_tasks FOR UPDATE TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_task_del ON public.sparta_project_tasks FOR DELETE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());

CREATE TABLE IF NOT EXISTS public.sparta_project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.sparta_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','missed')),
  weight numeric(5,2) DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_project_milestones TO authenticated;
GRANT ALL ON public.sparta_project_milestones TO service_role;
ALTER TABLE public.sparta_project_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_ms_sel ON public.sparta_project_milestones FOR SELECT TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_ms_ins ON public.sparta_project_milestones FOR INSERT TO authenticated WITH CHECK (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_ms_upd ON public.sparta_project_milestones FOR UPDATE TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_ms_del ON public.sparta_project_milestones FOR DELETE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());

CREATE TABLE IF NOT EXISTS public.sparta_project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.sparta_projects(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.sparta_employees(id) ON DELETE CASCADE,
  role text,
  allocation_pct numeric(5,2) DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, employee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_project_members TO authenticated;
GRANT ALL ON public.sparta_project_members TO service_role;
ALTER TABLE public.sparta_project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_mem_sel ON public.sparta_project_members FOR SELECT TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_mem_ins ON public.sparta_project_members FOR INSERT TO authenticated WITH CHECK (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_mem_del ON public.sparta_project_members FOR DELETE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());

CREATE TABLE IF NOT EXISTS public.sparta_project_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.sparta_projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.sparta_project_tasks(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES public.sparta_employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  hours numeric(6,2) NOT NULL CHECK (hours > 0),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sp_ts_proj ON public.sparta_project_timesheets(project_id, date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_project_timesheets TO authenticated;
GRANT ALL ON public.sparta_project_timesheets TO service_role;
ALTER TABLE public.sparta_project_timesheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_ts_sel ON public.sparta_project_timesheets FOR SELECT TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_ts_ins ON public.sparta_project_timesheets FOR INSERT TO authenticated WITH CHECK (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_ts_upd ON public.sparta_project_timesheets FOR UPDATE TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_ts_del ON public.sparta_project_timesheets FOR DELETE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());

CREATE TABLE IF NOT EXISTS public.sparta_project_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.sparta_projects(id) ON DELETE CASCADE,
  category text,
  description text,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ILS',
  expense_date date NOT NULL DEFAULT current_date,
  attachment_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_project_expenses TO authenticated;
GRANT ALL ON public.sparta_project_expenses TO service_role;
ALTER TABLE public.sparta_project_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_pex_sel ON public.sparta_project_expenses FOR SELECT TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_pex_ins ON public.sparta_project_expenses FOR INSERT TO authenticated WITH CHECK (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_pex_upd ON public.sparta_project_expenses FOR UPDATE TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_pex_del ON public.sparta_project_expenses FOR DELETE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());

CREATE TABLE IF NOT EXISTS public.sparta_project_invoices_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.sparta_projects(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.sparta_invoices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, invoice_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_project_invoices_link TO authenticated;
GRANT ALL ON public.sparta_project_invoices_link TO service_role;
ALTER TABLE public.sparta_project_invoices_link ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_pil_sel ON public.sparta_project_invoices_link FOR SELECT TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_pil_ins ON public.sparta_project_invoices_link FOR INSERT TO authenticated WITH CHECK (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sp_pil_del ON public.sparta_project_invoices_link FOR DELETE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());

-- Trigger: recompute project progress from tasks
CREATE OR REPLACE FUNCTION public.sparta_recalc_project_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project uuid := COALESCE(NEW.project_id, OLD.project_id);
  v_avg numeric;
BEGIN
  SELECT COALESCE(AVG(CASE WHEN status='done' THEN 100 ELSE progress_pct END), 0)
    INTO v_avg
  FROM public.sparta_project_tasks
  WHERE project_id = v_project;
  UPDATE public.sparta_projects SET progress_pct = ROUND(v_avg, 2), updated_at = now() WHERE id = v_project;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sp_task_progress ON public.sparta_project_tasks;
CREATE TRIGGER trg_sp_task_progress
AFTER INSERT OR UPDATE OF status, progress_pct OR DELETE
ON public.sparta_project_tasks
FOR EACH ROW EXECUTE FUNCTION public.sparta_recalc_project_progress();

-- updated_at triggers
DO $$ BEGIN CREATE TRIGGER trg_sp_proj_uat BEFORE UPDATE ON public.sparta_projects FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_sp_task_uat BEFORE UPDATE ON public.sparta_project_tasks FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_sp_ms_uat BEFORE UPDATE ON public.sparta_project_milestones FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_sp_pex_uat BEFORE UPDATE ON public.sparta_project_expenses FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
