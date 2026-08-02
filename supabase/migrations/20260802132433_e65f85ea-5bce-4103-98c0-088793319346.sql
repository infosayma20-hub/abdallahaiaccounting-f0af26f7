-- 1) Remove anon reachability entirely (grants were wide open even though no anon policy existed)
REVOKE ALL ON public.hr_chat_threads FROM anon;
REVOKE ALL ON public.hr_chat_messages FROM anon;

-- 2) Authenticated clients may only READ directly; all writes go through
--    SECURITY DEFINER RPCs that verify sender identity and keep counters consistent.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.hr_chat_threads FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.hr_chat_messages FROM authenticated;
GRANT SELECT ON public.hr_chat_threads TO authenticated;
GRANT SELECT ON public.hr_chat_messages TO authenticated;
GRANT ALL ON public.hr_chat_threads TO service_role;
GRANT ALL ON public.hr_chat_messages TO service_role;

-- 3) Drop now-unreachable (and over-permissive) write policies.
--    - employee could zero unread_for_hr / forge last_message_preview
--    - hr could rewrite or soft-delete an employee's own messages
DROP POLICY IF EXISTS "employee updates own thread" ON public.hr_chat_threads;
DROP POLICY IF EXISTS "hr manages company threads" ON public.hr_chat_threads;
DROP POLICY IF EXISTS "hr creates company threads" ON public.hr_chat_threads;
DROP POLICY IF EXISTS "employee sends own messages" ON public.hr_chat_messages;
DROP POLICY IF EXISTS "hr sends company messages" ON public.hr_chat_messages;
DROP POLICY IF EXISTS "hr soft deletes company messages" ON public.hr_chat_messages;

-- 4) Lock down function execution to authenticated/service_role only
REVOKE ALL ON FUNCTION public.hr_chat_is_my_thread(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_chat_is_hr_thread(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_chat_employee_of_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_chat_mark_unread(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_chat_set_pinned(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.hr_chat_is_my_thread(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_chat_is_hr_thread(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_chat_employee_of_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_chat_mark_unread(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_chat_set_pinned(uuid, boolean) TO authenticated, service_role;