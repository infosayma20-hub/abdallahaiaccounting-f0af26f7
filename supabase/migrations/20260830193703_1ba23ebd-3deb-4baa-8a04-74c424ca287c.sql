-- Allow team accounts (HR manager, accountant, etc.) to read the tenant company row,
-- so HR printouts (كتاب إثبات عمل / شهادة خبرة / مخالصة) show the company name.
-- get_team_owner_id resolves the tenant owner for team members without recursion
-- (it only reads employees/profiles/pos_users/malaki_portal_users).
CREATE POLICY "Team members can view tenant company"
ON public.companies
FOR SELECT
TO authenticated
USING (owner_id = public.get_team_owner_id(auth.uid()));

-- Set the official company name as requested by the owner.
UPDATE public.companies
SET name = 'شركة مطاعم الدجاج الملكي'
WHERE id = 'b4a221be-7b96-4952-8eb8-6ca749b46ca4';