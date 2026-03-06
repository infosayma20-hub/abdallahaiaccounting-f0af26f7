
-- Add CRM columns to contacts table
ALTER TABLE public.contacts 
  ADD COLUMN IF NOT EXISTS contact_class TEXT DEFAULT 'C',
  ADD COLUMN IF NOT EXISTS contact_segment TEXT,
  ADD COLUMN IF NOT EXISTS sales_rep_id UUID,
  ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_balance DECIMAL(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_limit DECIMAL(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS early_pay_discount DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS company_size TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS total_sales DECIMAL(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_purchases DECIMAL(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_paid DECIMAL(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdue_amount DECIMAL(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_transaction_date DATE,
  ADD COLUMN IF NOT EXISTS avg_payment_days INTEGER DEFAULT 0;

-- Create contact class policies table
CREATE TABLE IF NOT EXISTS public.contact_class_policies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  class TEXT NOT NULL,
  label TEXT,
  color TEXT,
  credit_limit_default DECIMAL(14,2) DEFAULT 0,
  payment_terms_days INTEGER DEFAULT 30,
  discount_pct DECIMAL(5,2) DEFAULT 0,
  followup_days INTEGER DEFAULT 30,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.contact_class_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own policies" ON public.contact_class_policies
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid());

-- Create contact alerts table
CREATE TABLE IF NOT EXISTS public.contact_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  amount DECIMAL(14,2),
  days_overdue INTEGER,
  is_read BOOLEAN DEFAULT false,
  contact_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.contact_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own alerts" ON public.contact_alerts
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid());

-- Enable realtime for alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_alerts;

-- Validation trigger for contact_class
CREATE OR REPLACE FUNCTION public.validate_contact_class()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contact_class IS NOT NULL AND NEW.contact_class NOT IN ('A', 'B', 'C', 'D') THEN
    RAISE EXCEPTION 'Invalid contact_class: %', NEW.contact_class;
  END IF;
  IF NEW.company_size IS NOT NULL AND NEW.company_size NOT IN ('small', 'medium', 'large') THEN
    RAISE EXCEPTION 'Invalid company_size: %', NEW.company_size;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_contact_fields
  BEFORE INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.validate_contact_class();

-- Trigger to check credit limit on transaction insert
CREATE OR REPLACE FUNCTION public.check_contact_credit_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_contact RECORD;
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  
  SELECT contact_name, current_balance, credit_limit, user_id 
  INTO v_contact FROM public.contacts WHERE id = NEW.contact_id;
  
  IF v_contact IS NULL THEN RETURN NEW; END IF;
  
  -- Check if balance exceeds credit limit
  IF v_contact.credit_limit > 0 AND v_contact.current_balance > v_contact.credit_limit THEN
    INSERT INTO public.contact_alerts (user_id, contact_id, alert_type, amount, contact_name)
    VALUES (v_contact.user_id, NEW.contact_id, 'credit_limit_exceeded', v_contact.current_balance, v_contact.contact_name)
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Check if near 80% of limit
  IF v_contact.credit_limit > 0 AND v_contact.current_balance > (v_contact.credit_limit * 0.8) AND v_contact.current_balance <= v_contact.credit_limit THEN
    INSERT INTO public.contact_alerts (user_id, contact_id, alert_type, amount, contact_name)
    VALUES (v_contact.user_id, NEW.contact_id, 'limit_near_80pct', v_contact.current_balance, v_contact.contact_name)
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

CREATE TRIGGER check_credit_on_transaction
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.check_contact_credit_on_transaction();
