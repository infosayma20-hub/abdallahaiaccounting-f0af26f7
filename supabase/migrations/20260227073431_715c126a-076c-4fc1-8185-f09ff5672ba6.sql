
-- Create currencies table
CREATE TABLE public.currencies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL,
  name_ar text NOT NULL,
  name_en text,
  symbol text NOT NULL,
  is_base boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  decimal_places integer NOT NULL DEFAULT 2,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, code)
);

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own currencies" ON public.currencies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own currencies" ON public.currencies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own currencies" ON public.currencies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own currencies" ON public.currencies FOR DELETE USING (auth.uid() = user_id AND is_base = false);

CREATE TRIGGER update_currencies_updated_at BEFORE UPDATE ON public.currencies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create exchange_rates table
CREATE TABLE public.exchange_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  currency_id uuid NOT NULL REFERENCES public.currencies(id) ON DELETE CASCADE,
  rate_date date NOT NULL DEFAULT CURRENT_DATE,
  buy_rate numeric NOT NULL DEFAULT 1,
  sell_rate numeric NOT NULL DEFAULT 1,
  mid_rate numeric NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'manual',
  notes text,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, currency_id, rate_date)
);

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rates" ON public.exchange_rates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own rates" ON public.exchange_rates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own rates" ON public.exchange_rates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own rates" ON public.exchange_rates FOR DELETE USING (auth.uid() = user_id);
