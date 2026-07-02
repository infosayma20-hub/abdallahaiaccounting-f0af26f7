
CREATE TABLE IF NOT EXISTS public.finance_integrity_fix_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fix_batch TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB, new_value JSONB, reason TEXT,
  fixed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fixed_by UUID
);
GRANT SELECT ON public.finance_integrity_fix_log TO authenticated;
GRANT ALL ON public.finance_integrity_fix_log TO service_role;
ALTER TABLE public.finance_integrity_fix_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finance_fix_log_admin_read" ON public.finance_integrity_fix_log;
CREATE POLICY "finance_fix_log_admin_read" ON public.finance_integrity_fix_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'accountant_senior'::app_role)
      OR has_role(auth.uid(),'super_admin'::app_role));

-- FIX 1
DO $$
DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT v.ref_number rn, 'payment_voucher' src, t.id tid
    FROM vouchers v JOIN transactions t ON t.id=v.linked_transaction_id
    WHERE v.status='cancelled' AND COALESCE(t.is_deleted,false)=false
    UNION ALL
    SELECT rv.receipt_number, 'receipt_voucher', t.id
    FROM receipt_vouchers rv JOIN transactions t ON t.id=rv.linked_transaction_id
    WHERE rv.status='cancelled' AND COALESCE(t.is_deleted,false)=false
  LOOP
    INSERT INTO finance_integrity_fix_log(fix_batch,entity_type,entity_id,old_value,new_value,reason)
    VALUES('phase2_cancel_orphan_tx','transaction',r.tid,
      jsonb_build_object('is_deleted',false,'linked_voucher',r.rn,'source',r.src),
      jsonb_build_object('is_deleted',true),
      'Voucher '||r.rn||' cancelled but transaction remained active');
    UPDATE transactions SET is_deleted=true, updated_at=now() WHERE id=r.tid;
  END LOOP;
END $$;

-- FIX 2
INSERT INTO finance_integrity_fix_log(fix_batch,entity_type,entity_id,old_value,new_value,reason)
SELECT 'phase2_posted_no_link','receipt_voucher',id,
  jsonb_build_object('status','posted','linked_transaction_id',null,'amount',amount),
  jsonb_build_object('status','cancelled'),
  'Posted receipt voucher had no GL journal -> auto-cancelled'
FROM receipt_vouchers WHERE id='ce37b04d-77e2-405f-a366-2dc46a978ad5';

UPDATE receipt_vouchers
SET status='cancelled',
    notes = COALESCE(notes,'') || E'\n[نظام] ألغي تلقائياً - المرحلة 2 - لعدم وجود قيد محاسبي.',
    updated_at=now()
WHERE id='ce37b04d-77e2-405f-a366-2dc46a978ad5';

-- FIX 3a: vouchers dedup
WITH ranked AS (
  SELECT id, user_id, type, ref_number,
    row_number() OVER (PARTITION BY user_id, type, ref_number ORDER BY created_at, id) rn
  FROM vouchers
  WHERE (user_id, type, ref_number) IN (
    SELECT user_id, type, ref_number FROM vouchers
    GROUP BY user_id, type, ref_number HAVING COUNT(*)>1
  )
),
to_fix AS (SELECT id, ref_number, ref_number||'-DUP'||rn new_ref FROM ranked WHERE rn>1),
logged AS (
  INSERT INTO finance_integrity_fix_log(fix_batch,entity_type,entity_id,old_value,new_value,reason)
  SELECT 'phase2_rename_dup_vouchers','voucher',id,
    jsonb_build_object('ref_number',ref_number),
    jsonb_build_object('ref_number',new_ref),
    'Duplicate ref_number renamed'
  FROM to_fix RETURNING 1
)
UPDATE vouchers v SET ref_number = tf.new_ref FROM to_fix tf WHERE v.id=tf.id;

-- FIX 3b: receipt_vouchers dedup
WITH ranked AS (
  SELECT id, user_id, receipt_number,
    row_number() OVER (PARTITION BY user_id, receipt_number ORDER BY created_at, id) rn
  FROM receipt_vouchers
  WHERE (user_id, receipt_number) IN (
    SELECT user_id, receipt_number FROM receipt_vouchers
    GROUP BY user_id, receipt_number HAVING COUNT(*)>1
  )
),
to_fix AS (SELECT id, receipt_number, receipt_number||'-DUP'||rn new_ref FROM ranked WHERE rn>1),
logged AS (
  INSERT INTO finance_integrity_fix_log(fix_batch,entity_type,entity_id,old_value,new_value,reason)
  SELECT 'phase2_rename_dup_receipts','receipt_voucher',id,
    jsonb_build_object('receipt_number',receipt_number),
    jsonb_build_object('receipt_number',new_ref),
    'Duplicate receipt_number renamed'
  FROM to_fix RETURNING 1
)
UPDATE receipt_vouchers rv SET receipt_number = tf.new_ref FROM to_fix tf WHERE rv.id=tf.id;

-- FIX 4: Unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_unique_ref
  ON vouchers(user_id, type, ref_number) WHERE ref_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_vouchers_unique_ref
  ON receipt_vouchers(user_id, receipt_number) WHERE receipt_number IS NOT NULL;
