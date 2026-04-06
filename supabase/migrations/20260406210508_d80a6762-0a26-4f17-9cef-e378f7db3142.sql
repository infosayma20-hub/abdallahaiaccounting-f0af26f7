
-- Add contact_id to orders table for linking orders to contacts
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id);

-- Add source tracking to contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS created_from_order BOOLEAN DEFAULT false;

-- Add source tracking to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Index for fast phone lookup on contacts
CREATE INDEX IF NOT EXISTS idx_contacts_phone_user ON public.contacts(user_id, phone);

-- Index for fast name lookup on contacts
CREATE INDEX IF NOT EXISTS idx_contacts_name_user ON public.contacts(user_id, contact_name);

-- Index for fast product name lookup
CREATE INDEX IF NOT EXISTS idx_products_name_user ON public.products(user_id, name);
