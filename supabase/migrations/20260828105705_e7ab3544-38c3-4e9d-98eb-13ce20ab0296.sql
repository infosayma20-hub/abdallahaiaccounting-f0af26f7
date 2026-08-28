-- The app does not use Supabase Broadcast/Presence private channels; it relies
-- solely on postgres_changes, which is unaffected by realtime.messages policies.
-- Remove the blanket true/true policies that let any authenticated user read or
-- publish on any realtime topic across tenants.
DROP POLICY IF EXISTS "Authenticated users can broadcast" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users only" ON realtime.messages;