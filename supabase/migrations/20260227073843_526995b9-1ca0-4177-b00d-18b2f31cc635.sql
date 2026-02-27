
-- Add missing columns to currencies
ALTER TABLE public.currencies 
  ADD COLUMN IF NOT EXISTS country_flag text,
  ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 99;

-- Add updated_at to exchange_rates
ALTER TABLE public.exchange_rates 
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

CREATE TRIGGER update_exchange_rates_updated_at 
  BEFORE UPDATE ON public.exchange_rates 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create currency_conversions table
CREATE TABLE public.currency_conversions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  conversion_date date NOT NULL DEFAULT CURRENT_DATE,
  conversion_number text,
  from_currency_id uuid NOT NULL REFERENCES public.currencies(id),
  to_currency_id uuid NOT NULL REFERENCES public.currencies(id),
  from_amount numeric(18,2) NOT NULL,
  to_amount numeric(18,2) NOT NULL,
  exchange_rate_used numeric(18,6) NOT NULL,
  from_account text,
  to_account text,
  commission_amount numeric(18,2) DEFAULT 0,
  commission_account text,
  gain_loss_amount numeric(18,2) DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'posted',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.currency_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversions" ON public.currency_conversions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conversions" ON public.currency_conversions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own conversions" ON public.currency_conversions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own conversions" ON public.currency_conversions FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_currency_conversions_updated_at 
  BEFORE UPDATE ON public.currency_conversions 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create get_exchange_rate function
CREATE OR REPLACE FUNCTION public.get_exchange_rate(
  p_currency_code TEXT,
  p_date DATE DEFAULT CURRENT_DATE,
  p_rate_type TEXT DEFAULT 'mid'
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  IF p_currency_code = 'ILS' THEN
    RETURN 1;
  END IF;

  SELECT 
    CASE p_rate_type
      WHEN 'buy' THEN er.buy_rate
      WHEN 'sell' THEN er.sell_rate
      ELSE er.mid_rate
    END INTO v_rate
  FROM public.exchange_rates er
  JOIN public.currencies c ON c.id = er.currency_id
  WHERE c.code = p_currency_code
    AND er.rate_date <= p_date
  ORDER BY er.rate_date DESC
  LIMIT 1;

  RETURN COALESCE(v_rate, NULL);
END;
$$;
