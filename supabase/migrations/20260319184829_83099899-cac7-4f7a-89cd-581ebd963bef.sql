
-- Allow cashiers to update their own must_change_password flag
CREATE OR REPLACE FUNCTION public.clear_must_change_password()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.pos_users
  SET must_change_password = false
  WHERE auth_user_id = auth.uid();
  RETURN FOUND;
END;
$$;

-- Also add an UPDATE policy so cashiers can update their own record's password flag
CREATE POLICY "Cashier can clear own password flag"
ON public.pos_users FOR UPDATE TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());
