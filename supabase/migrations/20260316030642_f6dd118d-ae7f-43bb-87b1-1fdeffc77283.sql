
-- Create procurement_request_items for worker procurement requests
CREATE TABLE public.procurement_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.procurement_requests(id) ON DELETE CASCADE,
  product_id uuid,
  item_name text NOT NULL,
  category text,
  unit text DEFAULT 'قطعة',
  quantity numeric DEFAULT 1,
  unit_price numeric DEFAULT 0,
  total_price numeric DEFAULT 0,
  notes text
);

ALTER TABLE public.procurement_request_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_procurement_request_items" ON public.procurement_request_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_procurement_request_items" ON public.procurement_request_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_procurement_request_items" ON public.procurement_request_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "delete_procurement_request_items" ON public.procurement_request_items FOR DELETE TO authenticated USING (true);
