
CREATE TABLE IF NOT EXISTS public.employee_trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  device_fingerprint text NOT NULL,
  label text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  trusted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, device_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_etd_employee ON public.employee_trusted_devices(employee_id);
CREATE INDEX IF NOT EXISTS idx_etd_company  ON public.employee_trusted_devices(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_trusted_devices TO authenticated;
GRANT ALL ON public.employee_trusted_devices TO service_role;

ALTER TABLE public.employee_trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "etd_employee_select_own" ON public.employee_trusted_devices
  FOR SELECT TO authenticated USING (auth.uid() = auth_user_id);
CREATE POLICY "etd_employee_insert_own" ON public.employee_trusted_devices
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = auth_user_id);
CREATE POLICY "etd_employee_update_own" ON public.employee_trusted_devices
  FOR UPDATE TO authenticated USING (auth.uid() = auth_user_id) WITH CHECK (auth.uid() = auth_user_id);
CREATE POLICY "etd_hr_admin_company_all" ON public.employee_trusted_devices
  FOR ALL TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_manager'))
    AND company_id IN (SELECT e.company_id FROM public.employees e WHERE e.auth_user_id = auth.uid())
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_manager'))
    AND company_id IN (SELECT e.company_id FROM public.employees e WHERE e.auth_user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.employee_device_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  device_fingerprint text NOT NULL,
  event_type text NOT NULL DEFAULT 'new_device',
  event_time timestamptz NOT NULL DEFAULT now(),
  branch_id uuid,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eda_employee ON public.employee_device_alerts(employee_id);
CREATE INDEX IF NOT EXISTS idx_eda_company  ON public.employee_device_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_eda_time     ON public.employee_device_alerts(event_time DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_device_alerts TO authenticated;
GRANT ALL ON public.employee_device_alerts TO service_role;

ALTER TABLE public.employee_device_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eda_employee_select_own" ON public.employee_device_alerts
  FOR SELECT TO authenticated USING (auth.uid() = auth_user_id);
CREATE POLICY "eda_hr_admin_company_all" ON public.employee_device_alerts
  FOR ALL TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_manager'))
    AND company_id IN (SELECT e.company_id FROM public.employees e WHERE e.auth_user_id = auth.uid())
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_manager'))
    AND company_id IN (SELECT e.company_id FROM public.employees e WHERE e.auth_user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_etd_updated_at ON public.employee_trusted_devices;
CREATE TRIGGER trg_etd_updated_at BEFORE UPDATE ON public.employee_trusted_devices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_eda_updated_at ON public.employee_device_alerts;
CREATE TRIGGER trg_eda_updated_at BEFORE UPDATE ON public.employee_device_alerts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
