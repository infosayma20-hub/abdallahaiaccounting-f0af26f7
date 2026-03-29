
ALTER TABLE vouchers DROP CONSTRAINT IF EXISTS vouchers_status_check;
ALTER TABLE vouchers ADD CONSTRAINT vouchers_status_check CHECK (status = ANY (ARRAY['draft'::text, 'posted'::text, 'cancelled'::text, 'deferred'::text]));
