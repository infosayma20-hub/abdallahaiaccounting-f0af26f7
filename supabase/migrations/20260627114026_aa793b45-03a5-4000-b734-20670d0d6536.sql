-- Remove ambiguous overload of create_opening_balance_entry.
-- Two overloads (11-arg and 13-arg) caused PostgREST to fail resolving the
-- function when callers passed 11 named args, silently aborting opening
-- balance posting for contacts/suppliers (e.g. "منير المحيسن" had no ledger
-- entries despite the form being submitted).
DROP FUNCTION IF EXISTS public.create_opening_balance_entry(
  uuid, text, text, numeric, date, text, text, uuid, text, boolean, text
);