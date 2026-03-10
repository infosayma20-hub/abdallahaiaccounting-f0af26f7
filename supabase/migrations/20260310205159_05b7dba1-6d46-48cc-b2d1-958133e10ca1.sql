
-- Cash boxes table
CREATE TABLE public.cash_boxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'branch',
  branch_location TEXT,
  responsible_id UUID,
  currency TEXT DEFAULT 'ILS',
  gl_account_code TEXT,
  pos_terminal_id UUID,
  pos_auto_post BOOLEAN DEFAULT true,
  pos_post_trigger TEXT DEFAULT 'shift_close',
  auto_transfer_to_main BOOLEAN DEFAULT false,
  auto_transfer_trigger TEXT,
  auto_transfer_threshold DECIMAL(15,3),
  min_balance_alert DECIMAL(15,3),
  max_balance_alert DECIMAL(15,3),
  max_balance_action TEXT DEFAULT 'warn',
  opening_balance DECIMAL(15,3) DEFAULT 0,
  opening_balance_date DATE,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cash transfers table
CREATE TABLE public.cash_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  from_box_id UUID REFERENCES public.cash_boxes(id),
  to_box_id UUID REFERENCES public.cash_boxes(id),
  amount DECIMAL(15,3) NOT NULL,
  currency TEXT DEFAULT 'ILS',
  exchange_rate DECIMAL(10,4) DEFAULT 1,
  amount_ils DECIMAL(15,3),
  transfer_date DATE NOT NULL,
  description TEXT,
  received_by UUID,
  voucher_id UUID,
  pos_session_id UUID,
  transfer_type TEXT DEFAULT 'manual',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.cash_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_transfers ENABLE ROW LEVEL SECURITY;

-- RLS policies for cash_boxes
CREATE POLICY "Users can view own cash boxes" ON public.cash_boxes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own cash boxes" ON public.cash_boxes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own cash boxes" ON public.cash_boxes FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own cash boxes" ON public.cash_boxes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- RLS policies for cash_transfers
CREATE POLICY "Users can view own transfers" ON public.cash_transfers FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own transfers" ON public.cash_transfers FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Unique constraint: only one main box per user
CREATE UNIQUE INDEX unique_main_box_per_user ON public.cash_boxes (user_id) WHERE (type = 'main' AND is_active = true);
