-- Phase 1: Sales Invoice Bonus — schema only
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS bonus_quantity numeric NOT NULL DEFAULT 0;

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_bonus_quantity_nonneg
  CHECK (bonus_quantity >= 0);

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS delivered_quantity numeric
  GENERATED ALWAYS AS (quantity + COALESCE(bonus_quantity, 0)) STORED;

COMMENT ON COLUMN public.invoice_items.bonus_quantity IS
  'Free / promotional quantity given with the sale. Revenue is NOT charged on this. Inventory deduction and COGS DO include it.';
COMMENT ON COLUMN public.invoice_items.delivered_quantity IS
  'Total physical quantity delivered to customer = quantity + bonus_quantity. Used for stock and COGS.';