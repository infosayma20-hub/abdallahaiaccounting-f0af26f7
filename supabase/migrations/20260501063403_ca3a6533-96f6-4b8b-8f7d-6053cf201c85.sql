
-- Drop the OLD short signatures so the new wide ones are unambiguous.
-- New signatures still satisfy old callers because all new params have defaults.

DROP FUNCTION IF EXISTS public.create_receipt_with_entry(
  uuid, uuid, text, numeric, text, text, text, text
);

DROP FUNCTION IF EXISTS public.create_payment_with_entry(
  uuid, uuid, text, numeric, text, text, text, text
);

DROP FUNCTION IF EXISTS public.create_cheque_lifecycle_event(
  uuid, uuid, text, date, text, text, text
);
