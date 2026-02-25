
-- Create cheque status enum
CREATE TYPE public.cheque_status AS ENUM ('مسجل', 'آجل', 'مستحق', 'مودع', 'محصل', 'مرتجع', 'ملغي');

-- Create cheque type enum
CREATE TYPE public.cheque_type AS ENUM ('وارد', 'صادر');

-- Create cheques table
CREATE TABLE public.cheques (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  cheque_type public.cheque_type NOT NULL,
  status public.cheque_status NOT NULL DEFAULT 'مسجل',
  cheque_number TEXT,
  bank_name TEXT,
  cheque_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'شيكل',
  party_name TEXT NOT NULL,
  party_type TEXT NOT NULL DEFAULT 'عميل',
  linked_account TEXT,
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create cheque status history table for audit trail
CREATE TABLE public.cheque_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cheque_id UUID NOT NULL REFERENCES public.cheques(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  from_status public.cheque_status,
  to_status public.cheque_status NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheque_status_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for cheques
CREATE POLICY "Users can view their own cheques" ON public.cheques FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own cheques" ON public.cheques FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own cheques" ON public.cheques FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own cheques" ON public.cheques FOR DELETE USING (auth.uid() = user_id AND status NOT IN ('محصل'));

-- RLS policies for status history
CREATE POLICY "Users can view their cheque history" ON public.cheque_status_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert cheque history" ON public.cheque_status_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_cheques_updated_at BEFORE UPDATE ON public.cheques FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
