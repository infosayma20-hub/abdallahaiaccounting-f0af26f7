
-- Add is_suspended and last_seen to profiles for team management
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS full_name text;

-- Update last_seen function
CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET last_seen_at = now()
  WHERE user_id = auth.uid();
END;
$$;

-- Policy: team owner can view team members' profiles
CREATE POLICY "Team owner can view team profiles"
  ON public.profiles FOR SELECT
  USING (
    user_id = auth.uid()
    OR invited_by = auth.uid()
  );

-- Policy: team owner can update team members
CREATE POLICY "Team owner can update team profiles"
  ON public.profiles FOR UPDATE
  USING (
    user_id = auth.uid()
    OR invited_by = auth.uid()
  );

-- Allow admin to manage user_roles for their team
CREATE POLICY "Admin can view team roles"
  ON public.user_roles FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = user_roles.user_id
        AND p.invited_by = auth.uid()
    )
  );

CREATE POLICY "Admin can manage team roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = user_roles.user_id
        AND p.invited_by = auth.uid()
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "Admin can delete team roles"
  ON public.user_roles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = user_roles.user_id
        AND p.invited_by = auth.uid()
    )
  );

CREATE POLICY "Admin can update team roles"
  ON public.user_roles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = user_roles.user_id
        AND p.invited_by = auth.uid()
    )
  );
