
-- ========================================
-- 1) shift_templates
-- ========================================
CREATE TABLE IF NOT EXISTS public.shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  code text NOT NULL,
  name_ar text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  crosses_midnight boolean NOT NULL DEFAULT false,
  color text NOT NULL DEFAULT '#3B82F6',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_shift_templates_company ON public.shift_templates(company_id);

-- ========================================
-- 2) branch_manager_assignments
-- ========================================
CREATE TABLE IF NOT EXISTS public.branch_manager_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,            -- the manager's auth user id
  branch_id uuid NOT NULL,
  company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_bma_user ON public.branch_manager_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_bma_branch ON public.branch_manager_assignments(branch_id);
CREATE INDEX IF NOT EXISTS idx_bma_company ON public.branch_manager_assignments(company_id);

-- ========================================
-- 3) daily_roster
-- ========================================
CREATE TABLE IF NOT EXISTS public.daily_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  roster_date date NOT NULL,
  shift_template_id uuid REFERENCES public.shift_templates(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','off','leave','coverage')),
  start_time time,
  end_time time,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, roster_date)
);

CREATE INDEX IF NOT EXISTS idx_roster_company_date ON public.daily_roster(company_id, roster_date);
CREATE INDEX IF NOT EXISTS idx_roster_branch_date ON public.daily_roster(branch_id, roster_date);
CREATE INDEX IF NOT EXISTS idx_roster_employee_date ON public.daily_roster(employee_id, roster_date);

-- ========================================
-- 4) updated_at trigger
-- ========================================
CREATE OR REPLACE FUNCTION public.set_updated_at_generic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_templates_updated_at ON public.shift_templates;
CREATE TRIGGER trg_shift_templates_updated_at
  BEFORE UPDATE ON public.shift_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

DROP TRIGGER IF EXISTS trg_daily_roster_updated_at ON public.daily_roster;
CREATE TRIGGER trg_daily_roster_updated_at
  BEFORE UPDATE ON public.daily_roster
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

-- ========================================
-- 5) Helper SECURITY DEFINER functions
-- ========================================
CREATE OR REPLACE FUNCTION public.is_branch_manager_of(_user uuid, _branch uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.branch_manager_assignments
    WHERE user_id = _user AND branch_id = _branch
  );
$$;

CREATE OR REPLACE FUNCTION public.get_employee_id_for_user(_user uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.employees WHERE auth_user_id = _user LIMIT 1;
$$;

-- company resolution: reuse existing has_role; we need company match.
-- Build a helper that returns true if user (admin/hr) belongs to same company
CREATE OR REPLACE FUNCTION public.is_company_hr_admin(_user uuid, _company uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.has_role(_user, 'admin'::app_role)
    OR public.has_role(_user, 'hr_manager'::app_role)
  ) AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.auth_user_id = _user AND e.company_id = _company
    UNION
    SELECT 1 FROM public.branches b
    WHERE b.user_id = _user
    -- fallback: legacy single-tenant where company_id == owner user_id
  );
$$;

-- ========================================
-- 6) RLS
-- ========================================
ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_manager_assignments ENABLE ROW LEVEL SECURITY;

-- shift_templates: any authenticated in same company (or owner) can read; admin/hr manage
DROP POLICY IF EXISTS shift_templates_select ON public.shift_templates;
CREATE POLICY shift_templates_select ON public.shift_templates
FOR SELECT TO authenticated
USING (
  -- company owner / admin / hr in this company
  EXISTS (SELECT 1 FROM public.employees e WHERE e.auth_user_id = auth.uid() AND e.company_id = shift_templates.company_id)
  OR EXISTS (SELECT 1 FROM public.branch_manager_assignments b WHERE b.user_id = auth.uid() AND b.company_id = shift_templates.company_id)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS shift_templates_modify ON public.shift_templates;
CREATE POLICY shift_templates_modify ON public.shift_templates
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'hr_manager'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'hr_manager'::app_role)
);

-- branch_manager_assignments: only admin/hr_manager
DROP POLICY IF EXISTS bma_select ON public.branch_manager_assignments;
CREATE POLICY bma_select ON public.branch_manager_assignments
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()  -- a manager can see their own assignments
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'hr_manager'::app_role)
);

DROP POLICY IF EXISTS bma_modify ON public.branch_manager_assignments;
CREATE POLICY bma_modify ON public.branch_manager_assignments
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'hr_manager'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'hr_manager'::app_role)
);

-- daily_roster
DROP POLICY IF EXISTS roster_select ON public.daily_roster;
CREATE POLICY roster_select ON public.daily_roster
FOR SELECT TO authenticated
USING (
  -- admin/hr full company visibility
  (
    (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'hr_manager'::app_role))
    AND EXISTS (SELECT 1 FROM public.employees e WHERE e.auth_user_id = auth.uid() AND e.company_id = daily_roster.company_id)
  )
  -- branch manager: only their branches
  OR public.is_branch_manager_of(auth.uid(), daily_roster.branch_id)
  -- employee: own row
  OR daily_roster.employee_id = public.get_employee_id_for_user(auth.uid())
);

DROP POLICY IF EXISTS roster_insert ON public.daily_roster;
CREATE POLICY roster_insert ON public.daily_roster
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'hr_manager'::app_role)
  OR public.is_branch_manager_of(auth.uid(), daily_roster.branch_id)
);

DROP POLICY IF EXISTS roster_update ON public.daily_roster;
CREATE POLICY roster_update ON public.daily_roster
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'hr_manager'::app_role)
  OR public.is_branch_manager_of(auth.uid(), daily_roster.branch_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'hr_manager'::app_role)
  OR public.is_branch_manager_of(auth.uid(), daily_roster.branch_id)
);

DROP POLICY IF EXISTS roster_delete ON public.daily_roster;
CREATE POLICY roster_delete ON public.daily_roster
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'hr_manager'::app_role)
  OR public.is_branch_manager_of(auth.uid(), daily_roster.branch_id)
);

-- ========================================
-- 7) Seed for Malaki (company b4a221be...)
-- ========================================
-- Shift templates (3)
INSERT INTO public.shift_templates (company_id, code, name_ar, start_time, end_time, crosses_midnight, color)
VALUES
  ('b4a221be-7b96-4952-8eb8-6ca749b46ca4', 'MORNING', 'صباحي', '09:00', '17:00', false, '#3B82F6'),
  ('b4a221be-7b96-4952-8eb8-6ca749b46ca4', 'MID',     'ميد',    '14:00', '22:00', false, '#F97316'),
  ('b4a221be-7b96-4952-8eb8-6ca749b46ca4', 'NIGHT',   'مسائي',  '17:00', '01:00', true,  '#8B5CF6')
ON CONFLICT (company_id, code) DO NOTHING;

-- Anas Hajjaj — give branch_scheduler role + assign two branches
-- auth_user_id: e168e054-18bc-4a50-bbde-9ef85fc53a3e
INSERT INTO public.user_roles (user_id, role)
VALUES ('e168e054-18bc-4a50-bbde-9ef85fc53a3e', 'branch_scheduler')
ON CONFLICT (user_id, role) DO NOTHING;

-- Branch assignments: رام الله (15af6bae) + رام الله بلازا مول (f82642e1)
INSERT INTO public.branch_manager_assignments (user_id, branch_id, company_id) VALUES
  ('e168e054-18bc-4a50-bbde-9ef85fc53a3e', '15af6bae-d196-4e1f-bd19-88a70f395ccb', 'b4a221be-7b96-4952-8eb8-6ca749b46ca4'),
  ('e168e054-18bc-4a50-bbde-9ef85fc53a3e', 'f82642e1-ce32-456e-8ef8-e556d8d65af9', 'b4a221be-7b96-4952-8eb8-6ca749b46ca4')
ON CONFLICT (user_id, branch_id) DO NOTHING;

-- Move 7 named employees to رام الله بلازا مول
UPDATE public.employees
SET branch_id = 'f82642e1-ce32-456e-8ef8-e556d8d65af9', updated_at = now()
WHERE company_id = 'b4a221be-7b96-4952-8eb8-6ca749b46ca4'
  AND id IN (
    '6920d6f8-ab21-4776-a6e1-4c507c0e17a5', -- عبادة اشتية
    '7c5e2e9b-a53b-41df-824d-cb6136439cf3', -- عبد الجواد جبريل
    '88640ff4-4a06-4c5d-9f1f-337124661351', -- حذيفة غزال
    '955ff20b-f8e2-4a87-8d1b-da0682853a45', -- امجد شبيري
    'dbef9eb3-82fe-4ba2-9749-85cc97ace221', -- شريف جمعة
    '9ed2f528-eafe-4f24-8734-1f657fa1e25a', -- ممدوح ابو كرش
    'e301c9b4-83aa-4f3b-bb71-88c2dcc427f8'  -- المعتصم بالله عناتي
  );
