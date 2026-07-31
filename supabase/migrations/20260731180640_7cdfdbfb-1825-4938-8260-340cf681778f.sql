ALTER TABLE public.correction_requests
  ADD COLUMN IF NOT EXISTS final_decision text,
  ADD COLUMN IF NOT EXISTS final_decision_notes text,
  ADD COLUMN IF NOT EXISTS final_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_decided_by uuid;

ALTER TABLE public.correction_requests DROP CONSTRAINT IF EXISTS correction_requests_final_decision_check;
ALTER TABLE public.correction_requests ADD CONSTRAINT correction_requests_final_decision_check
  CHECK (final_decision IS NULL OR final_decision = ANY (ARRAY['approved','rejected']));

-- Keep historical penalties visible to employees (they predate the approval flow)
UPDATE public.correction_requests
   SET final_decision = 'approved',
       final_decided_at = COALESCE(reviewed_at, created_at)
 WHERE request_type = 'penalty' AND final_decision IS NULL;

CREATE INDEX IF NOT EXISTS idx_correction_requests_final_decision
  ON public.correction_requests (request_type, final_decision);

DROP POLICY IF EXISTS "Employees can view own requests" ON public.correction_requests;
CREATE POLICY "Employees can view own requests"
ON public.correction_requests FOR SELECT
USING (
  (SELECT auth.uid()) = auth_user_id
  AND (request_type <> 'penalty' OR final_decision = 'approved')
);

DROP POLICY IF EXISTS "employee_own_corrections" ON public.correction_requests;
CREATE POLICY "employee_own_corrections"
ON public.correction_requests FOR SELECT
USING (
  auth_user_id = (SELECT auth.uid())
  AND (request_type <> 'penalty' OR final_decision = 'approved')
);