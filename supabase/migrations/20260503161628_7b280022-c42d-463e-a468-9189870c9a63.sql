
-- Allow sales reps to see all sales reps belonging to their owner (for filters)
CREATE POLICY "Sales rep can view owner reps"
ON public.sales_representatives
FOR SELECT
TO authenticated
USING (is_sales_rep() AND user_id = get_rep_owner_id());

-- Helper: list active suppliers for current rep's owner
CREATE OR REPLACE FUNCTION public.get_rep_suppliers()
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.contact_name AS name
  FROM public.contacts c
  WHERE c.user_id = public.get_rep_owner_id()
    AND c.is_active = true
    AND COALESCE(c.is_archived, false) = false
    AND c.contact_type IN ('supplier','both','مورد','عميل ومورد','كلاهما')
  ORDER BY c.contact_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_rep_suppliers() TO authenticated;
