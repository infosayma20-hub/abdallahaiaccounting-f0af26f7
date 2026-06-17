
-- Tighten the employee INSERT policy on attendance_events.
-- Old WITH CHECK: (auth.uid() = auth_user_id)
-- New WITH CHECK: (auth.uid() = auth_user_id AND server_recorded = true)
-- This blocks any direct client INSERT that tries to bypass the
-- enforce_server_event_time trigger by setting server_recorded=false.
-- ZKTeco webhook is unaffected: it uses the service_role key which
-- bypasses RLS entirely.

DROP POLICY IF EXISTS "Employees can insert own events" ON public.attendance_events;

CREATE POLICY "Employees can insert own events"
  ON public.attendance_events
  FOR INSERT
  WITH CHECK (
    auth.uid() = auth_user_id
    AND server_recorded = true
  );
