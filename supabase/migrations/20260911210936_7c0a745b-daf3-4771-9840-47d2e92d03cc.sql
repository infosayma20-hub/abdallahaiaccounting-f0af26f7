REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.posting_intents_v1 FROM authenticated;
REVOKE ALL ON public.posting_intents_v1 FROM anon, PUBLIC;
GRANT SELECT ON public.posting_intents_v1 TO authenticated;
GRANT ALL ON public.posting_intents_v1 TO service_role;