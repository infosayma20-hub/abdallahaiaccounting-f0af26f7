ALTER TABLE public.delivery_notes DROP CONSTRAINT delivery_notes_delivery_number_key;
CREATE UNIQUE INDEX delivery_notes_user_number_key ON public.delivery_notes (user_id, delivery_number);

CREATE OR REPLACE FUNCTION public.generate_delivery_note_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_next INT; v_year INT; v_candidate TEXT;
BEGIN
  IF NEW.delivery_number IS NOT NULL AND NEW.delivery_number != '' THEN RETURN NEW; END IF;
  v_year := EXTRACT(YEAR FROM NOW())::INT;
  LOOP
    v_next := public.next_doc_number(NEW.user_id, 'delivery_note', v_year);
    v_candidate := 'DN-' || v_year::TEXT || '-' || LPAD(v_next::TEXT, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.delivery_notes
      WHERE user_id = NEW.user_id AND delivery_number = v_candidate
    );
  END LOOP;
  NEW.delivery_number := v_candidate;
  RETURN NEW;
END;
$function$;
COMMENT ON INDEX public.delivery_notes_user_number_key IS 'تسلسل أرقام الإرساليات مستقل لكل شركة (user_id) — لا تتأثر شركة بحجز رقم عند شركة أخرى';