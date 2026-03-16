-- Add user_id to procurement_items
ALTER TABLE public.procurement_items ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Add user_id to item_categories  
ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Assign existing items to malakybroast user
UPDATE public.procurement_items SET user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73' WHERE user_id IS NULL;
UPDATE public.item_categories SET user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73' WHERE user_id IS NULL;

-- Drop old permissive policies
DROP POLICY IF EXISTS select_procurement_items ON public.procurement_items;
DROP POLICY IF EXISTS insert_procurement_items ON public.procurement_items;
DROP POLICY IF EXISTS update_procurement_items ON public.procurement_items;
DROP POLICY IF EXISTS delete_procurement_items ON public.procurement_items;

DROP POLICY IF EXISTS select_item_categories ON public.item_categories;
DROP POLICY IF EXISTS insert_item_categories ON public.item_categories;
DROP POLICY IF EXISTS update_item_categories ON public.item_categories;
DROP POLICY IF EXISTS delete_item_categories ON public.item_categories;

-- Create proper tenant-isolated RLS policies for procurement_items
CREATE POLICY "select_procurement_items" ON public.procurement_items
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "insert_procurement_items" ON public.procurement_items
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "update_procurement_items" ON public.procurement_items
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "delete_procurement_items" ON public.procurement_items
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR user_id = public.get_team_owner_id(auth.uid()));

-- Create proper tenant-isolated RLS policies for item_categories
CREATE POLICY "select_item_categories" ON public.item_categories
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "insert_item_categories" ON public.item_categories
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "update_item_categories" ON public.item_categories
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "delete_item_categories" ON public.item_categories
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR user_id = public.get_team_owner_id(auth.uid()));