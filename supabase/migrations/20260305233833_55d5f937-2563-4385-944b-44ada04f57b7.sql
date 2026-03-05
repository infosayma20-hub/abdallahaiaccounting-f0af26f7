
-- القاعات والأقسام
CREATE TABLE public.restaurant_sections (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL,
  branch_id   UUID REFERENCES public.branches(id),
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- الطاولات
CREATE TABLE public.restaurant_tables (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID NOT NULL,
  section_id       UUID REFERENCES public.restaurant_sections(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  seats            INTEGER DEFAULT 4,
  shape            TEXT DEFAULT 'square' CHECK (shape IN ('square','round','rectangle')),
  pos_x            DECIMAL DEFAULT 50,
  pos_y            DECIMAL DEFAULT 50,
  width            DECIMAL DEFAULT 110,
  height           DECIMAL DEFAULT 110,
  rotation         DECIMAL DEFAULT 0,
  status           TEXT DEFAULT 'available' CHECK (status IN ('available','occupied','reserved','cleaning')),
  current_order_id UUID,
  current_guests   INTEGER DEFAULT 0,
  occupied_at      TIMESTAMPTZ,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- الحجوزات المسبقة
CREATE TABLE public.table_reservations (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID NOT NULL,
  table_id          UUID REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  guest_name        TEXT NOT NULL,
  guest_phone       TEXT,
  party_size        INTEGER DEFAULT 2,
  reservation_date  DATE NOT NULL,
  reservation_time  TIME NOT NULL,
  duration_minutes  INTEGER DEFAULT 90,
  notes             TEXT,
  status            TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed','arrived','cancelled','no_show')),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- إضافة حقول الطاولة لجدول pos_orders
ALTER TABLE public.pos_orders
ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES public.restaurant_tables(id),
ADD COLUMN IF NOT EXISTS guest_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS guest_name TEXT,
ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'dine_in';

-- Enable realtime for restaurant_tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables;

-- RLS policies
ALTER TABLE public.restaurant_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sections" ON public.restaurant_sections
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can manage own tables" ON public.restaurant_tables
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can manage own reservations" ON public.table_reservations
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

-- Trigger: تحديث حالة الطاولة عند تغيير الطلب
CREATE OR REPLACE FUNCTION public.update_table_status_on_order()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new order with table_id is created
  IF TG_OP = 'INSERT' AND NEW.table_id IS NOT NULL THEN
    UPDATE public.restaurant_tables SET
      status           = 'occupied',
      current_order_id = NEW.id,
      occupied_at      = NOW(),
      current_guests   = COALESCE(NEW.guest_count, 1),
      updated_at       = NOW()
    WHERE id = NEW.table_id;
  END IF;

  -- When order is completed/paid
  IF TG_OP = 'UPDATE' AND NEW.table_id IS NOT NULL AND NEW.state = 'paid' AND OLD.state != 'paid' THEN
    UPDATE public.restaurant_tables SET
      status           = 'cleaning',
      current_order_id = NULL,
      current_guests   = 0,
      updated_at       = NOW()
    WHERE id = NEW.table_id;
  END IF;

  -- When order is cancelled
  IF TG_OP = 'UPDATE' AND NEW.table_id IS NOT NULL AND NEW.state = 'cancelled' AND OLD.state != 'cancelled' THEN
    UPDATE public.restaurant_tables SET
      status           = 'available',
      current_order_id = NULL,
      current_guests   = 0,
      occupied_at      = NULL,
      updated_at       = NOW()
    WHERE id = NEW.table_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

CREATE TRIGGER on_pos_order_table_change
AFTER INSERT OR UPDATE ON public.pos_orders
FOR EACH ROW EXECUTE FUNCTION public.update_table_status_on_order();
