ALTER TABLE public.accountant_permissions
  ADD COLUMN IF NOT EXISTS cash_box_branch_ids uuid[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.accountant_permissions.cash_box_branch_ids IS
  'Branches whose cash boxes this accountant may VIEW. Empty = all (no restriction). Boxes without branch are visible to all.';

CREATE OR REPLACE FUNCTION public.cash_box_visible_to(_viewer uuid, _branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _branch_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.accountant_permissions ap
      WHERE ap.accountant_auth_id = _viewer AND ap.is_active
        AND cardinality(ap.cash_box_branch_ids) > 0)
    OR EXISTS (
      SELECT 1 FROM public.accountant_permissions ap
      WHERE ap.accountant_auth_id = _viewer AND ap.is_active
        AND _branch_id = ANY(ap.cash_box_branch_ids));
$$;
REVOKE EXECUTE ON FUNCTION public.cash_box_visible_to(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_box_visible_to(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Accountant cash box branch scope" ON public.cash_boxes;
CREATE POLICY "Accountant cash box branch scope" ON public.cash_boxes
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.cash_box_visible_to((SELECT auth.uid()), branch_id));