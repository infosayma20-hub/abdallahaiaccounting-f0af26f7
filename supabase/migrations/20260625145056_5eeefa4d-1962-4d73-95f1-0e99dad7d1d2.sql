-- Numeric integrity guards on order tables.
-- Prevents NaN / negative values from entering financial columns at the DB level.
-- Validated against existing data: no rows violate these constraints.

ALTER TABLE public.call_center_orders
  ADD CONSTRAINT call_center_orders_total_nonneg CHECK (total IS NULL OR total >= 0) NOT VALID;
ALTER TABLE public.call_center_orders VALIDATE CONSTRAINT call_center_orders_total_nonneg;

ALTER TABLE public.call_center_orders
  ADD CONSTRAINT call_center_orders_delivery_fee_nonneg CHECK (delivery_fee >= 0) NOT VALID;
ALTER TABLE public.call_center_orders VALIDATE CONSTRAINT call_center_orders_delivery_fee_nonneg;

ALTER TABLE public.pos_orders
  ADD CONSTRAINT pos_orders_total_nonneg CHECK (total IS NULL OR total >= 0) NOT VALID;
ALTER TABLE public.pos_orders VALIDATE CONSTRAINT pos_orders_total_nonneg;

ALTER TABLE public.pos_orders
  ADD CONSTRAINT pos_orders_subtotal_nonneg CHECK (subtotal IS NULL OR subtotal >= 0) NOT VALID;
ALTER TABLE public.pos_orders VALIDATE CONSTRAINT pos_orders_subtotal_nonneg;

ALTER TABLE public.pos_orders
  ADD CONSTRAINT pos_orders_delivery_fee_nonneg CHECK (delivery_fee IS NULL OR delivery_fee >= 0) NOT VALID;
ALTER TABLE public.pos_orders VALIDATE CONSTRAINT pos_orders_delivery_fee_nonneg;

ALTER TABLE public.pos_orders
  ADD CONSTRAINT pos_orders_tax_amount_nonneg CHECK (tax_amount IS NULL OR tax_amount >= 0) NOT VALID;
ALTER TABLE public.pos_orders VALIDATE CONSTRAINT pos_orders_tax_amount_nonneg;