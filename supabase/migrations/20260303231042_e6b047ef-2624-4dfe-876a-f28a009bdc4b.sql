
-- Fix 1: Update correction_requests CHECK constraint to accept all request types
ALTER TABLE public.correction_requests DROP CONSTRAINT IF EXISTS correction_requests_request_type_check;

ALTER TABLE public.correction_requests ADD CONSTRAINT correction_requests_request_type_check
CHECK (request_type IN (
  'missing_checkin',
  'missing_checkout',
  'wrong_time',
  'other',
  'leave_request',
  'advance_request',
  'overtime_request',
  'hr_message'
));

-- Fix 2: Add amount column for advance requests
ALTER TABLE public.correction_requests ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2);
