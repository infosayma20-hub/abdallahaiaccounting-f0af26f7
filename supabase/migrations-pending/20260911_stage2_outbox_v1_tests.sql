-- =====================================================================
-- Stage 2 verification script — RUN ON A NON-PRODUCTION DATABASE ONLY.
-- Every block rolls back. Nothing here is executed against production.
-- Requires: the Stage 2 migration applied, plus a test owner with
--           feature_flags -> events.receipt_v1 = true.
-- =====================================================================

-- T1. successful command creates exactly one event
BEGIN;
  SELECT public.create_receipt_command_v1(jsonb_build_object(
    'command_type','finance.create_receipt.v1','schema_version',1,
    'idempotency_key','t1-'||gen_random_uuid(),'source','web',
    'payload', jsonb_build_object('amount',10,'currency','شيكل')));
  SELECT count(*) AS should_be_1 FROM public.domain_events_outbox
   WHERE event_type='finance.receipt.created.v1' AND created_at > now() - interval '1 minute';
ROLLBACK;

-- T2. failed receipt creates zero events (invalid account code forces failure)
BEGIN;
  SELECT public.create_receipt_command_v1(jsonb_build_object(
    'command_type','finance.create_receipt.v1','schema_version',1,
    'idempotency_key','t2-'||gen_random_uuid(),'source','web',
    'payload', jsonb_build_object('amount',10,'cash_account_code','000-does-not-exist')));
  SELECT count(*) AS should_be_0 FROM public.domain_events_outbox
   WHERE created_at > now() - interval '1 minute';
ROLLBACK;

-- T3. rollback removes BOTH the receipt effect and the event (atomicity proof)
BEGIN;
  SELECT public.create_receipt_command_v1(jsonb_build_object(
    'command_type','finance.create_receipt.v1','schema_version',1,
    'idempotency_key','t3-fixed-key','source','web',
    'payload', jsonb_build_object('amount',10)));
ROLLBACK;
SELECT
  (SELECT count(*) FROM public.transactions WHERE idempotency_key='t3-fixed-key')       AS tx_should_be_0,
  (SELECT count(*) FROM public.domain_events_outbox WHERE dedupe_key='finance.create_receipt.v1:t3-fixed-key') AS ev_should_be_0;

-- T4/T5. retry and concurrent replay of the same command => one logical event
BEGIN;
  SELECT public.create_receipt_command_v1(jsonb_build_object(
    'command_type','finance.create_receipt.v1','schema_version',1,
    'idempotency_key','t4-fixed-key','source','web',
    'payload', jsonb_build_object('amount',10)));
  SELECT public.create_receipt_command_v1(jsonb_build_object(
    'command_type','finance.create_receipt.v1','schema_version',1,
    'idempotency_key','t4-fixed-key','source','web',
    'payload', jsonb_build_object('amount',10)));
  SELECT count(*) AS should_be_1 FROM public.domain_events_outbox
   WHERE dedupe_key='finance.create_receipt.v1:t4-fixed-key';
ROLLBACK;

-- T6. event context matches the server-resolved command context
BEGIN;
  SELECT public.create_receipt_command_v1(jsonb_build_object(
    'command_type','finance.create_receipt.v1','schema_version',1,
    'idempotency_key','t6-'||gen_random_uuid(),'source','web',
    'payload', jsonb_build_object('amount',10)));
  SELECT e.owner_id = c.resolved_owner_id  AS owner_ok,
         e.company_id IS NOT DISTINCT FROM c.resolved_company_id AS company_ok,
         e.branch_id  IS NOT DISTINCT FROM c.resolved_branch_id  AS branch_ok,
         e.actor_id   = c.resolved_actor_id AS actor_ok
    FROM public.domain_events_outbox e
    JOIN public.business_commands c ON c.command_id = e.command_id
   ORDER BY e.created_at DESC LIMIT 1;
ROLLBACK;

-- T7. payload carries no sensitive financial/customer data
SELECT event_id, payload FROM public.domain_events_outbox
 WHERE payload ?| array['amount','contact_name','contact_id','notes','description',
                        'reference','allocations','employee_id','iban','phone','email'];
-- expected: zero rows

-- T8. ordinary users cannot write the outbox (run as an authenticated user)
--   INSERT INTO public.domain_events_outbox ... -> 42501
--   UPDATE public.domain_events_outbox SET status='processed' -> 0 rows / 42501
--   DELETE FROM public.domain_events_outbox -> 0 rows / 42501
SELECT polname, polcmd FROM pg_policy
 WHERE polrelid = 'public.domain_events_outbox'::regclass;
-- expected: exactly one policy, cmd = 'r' (SELECT only)

-- T9. cross-tenant isolation
--   As tenant B: SELECT count(*) FROM public.domain_events_outbox
--                 WHERE owner_id = '<tenant A owner>';  -> 0

-- T10. ordering / identity stability for an aggregate
SELECT aggregate_type, aggregate_id, event_type, count(*) AS n,
       min(occurred_at) AS first_at, max(occurred_at) AS last_at
  FROM public.domain_events_outbox
 GROUP BY 1,2,3 HAVING count(*) > 1;
-- expected: zero rows for a single receipt aggregate

-- Observability snapshot
SELECT * FROM public.domain_events_outbox_health_v1;
