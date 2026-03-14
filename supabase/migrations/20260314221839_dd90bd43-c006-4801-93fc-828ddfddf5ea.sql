CREATE POLICY "Public can view company settings for receipt"
ON public.company_settings
FOR SELECT
TO anon
USING (true);