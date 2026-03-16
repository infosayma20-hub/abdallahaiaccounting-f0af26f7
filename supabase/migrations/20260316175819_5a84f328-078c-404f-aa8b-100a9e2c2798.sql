
-- Payroll settings table (per company)
CREATE TABLE IF NOT EXISTS public.payroll_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid UNIQUE NOT NULL,
  
  -- Base calculation
  base_month_days int DEFAULT 28,
  default_hourly_rate decimal DEFAULT 9.6,
  overtime_multiplier decimal DEFAULT 1.5,
  
  -- Food deduction rules
  food_group_percentage decimal DEFAULT 90,
  food_individual_percentage decimal DEFAULT 50,
  
  -- Allowance rules
  food_transport_base decimal DEFAULT 600,
  food_transport_start_months int DEFAULT 3,
  family_allowance_start_months int DEFAULT 6,
  wife_allowance decimal DEFAULT 200,
  child_allowance decimal DEFAULT 70,
  annual_increment_per_year decimal DEFAULT 100,
  
  -- Attendance bonus
  attendance_bonus_max_absent int DEFAULT 4,
  attendance_bonus_rate decimal DEFAULT 9.6,
  
  -- Deduction rules
  min_deduction_threshold decimal DEFAULT 20,
  full_attendance_days int DEFAULT 25,
  
  -- Payroll currency
  currency varchar DEFAULT 'ILS',
  currency_symbol varchar DEFAULT '₪',
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company payroll settings"
  ON public.payroll_settings FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

CREATE POLICY "Users can insert own company payroll settings"
  ON public.payroll_settings FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update own company payroll settings"
  ON public.payroll_settings FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

-- Auto-create default settings when new company registers
CREATE OR REPLACE FUNCTION public.create_default_payroll_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.payroll_settings (company_id) VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_company_created_payroll_settings
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.create_default_payroll_settings();

-- Insert defaults for existing companies that don't have settings yet
INSERT INTO public.payroll_settings (company_id)
SELECT id FROM public.companies
WHERE id NOT IN (SELECT company_id FROM public.payroll_settings)
ON CONFLICT DO NOTHING;
