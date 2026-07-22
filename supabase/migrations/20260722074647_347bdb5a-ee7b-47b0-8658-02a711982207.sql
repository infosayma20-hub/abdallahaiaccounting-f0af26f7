DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'receipt_vouchers'
      AND policyname = 'Team can insert receipt vouchers'
  ) THEN
    CREATE POLICY "Team can insert receipt vouchers"
    ON public.receipt_vouchers
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = public.get_team_owner_id(auth.uid()));
  END IF;
END $$;