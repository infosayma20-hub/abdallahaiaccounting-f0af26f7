
UPDATE vouchers 
SET status='cancelled',
    notes = COALESCE(notes,'') || E'\n[نظام] ألغي تلقائياً - المرحلة 2 - لا يوجد قيد محاسبي.',
    updated_at=now()
WHERE id='ce37b04d-77e2-405f-a366-2dc46a978ad5' AND status='posted';

INSERT INTO finance_integrity_fix_log(fix_batch,entity_type,entity_id,old_value,new_value,reason)
VALUES('phase2_posted_no_link_fix','voucher','ce37b04d-77e2-405f-a366-2dc46a978ad5',
  '{"status":"posted","linked_transaction_id":null}'::jsonb,
  '{"status":"cancelled"}'::jsonb,
  'Voucher RV-2026-0002 posted but no GL journal -> auto-cancelled');
