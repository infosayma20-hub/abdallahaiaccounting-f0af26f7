DO $do$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.convert_delivery_note_to_invoice(uuid)'::regprocedure);
  v_def := replace(v_def, 'total_amount, unit_of_measure, delivered_quantity
  )', 'total_amount, unit_of_measure
  )');
  v_def := replace(v_def, 'COALESCE(total, quantity * unit_price), unit, quantity
  FROM', 'COALESCE(total, quantity * unit_price), unit
  FROM');
  EXECUTE v_def;
END $do$;