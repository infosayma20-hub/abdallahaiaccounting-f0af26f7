-- ترقيم الإرساليات: التسلسل لكل شركة لكن القيد فريد عالمياً —
-- شركة ثانية قد تكون خذت نفس الرقم فتفشل الإرسالية. الحل: تخطّي الأرقام المحجوزة.
CREATE OR REPLACE FUNCTION public.generate_delivery_note_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE v_next INT; v_year INT; v_candidate TEXT;
BEGIN
  IF NEW.delivery_number IS NOT NULL AND NEW.delivery_number != '' THEN RETURN NEW; END IF;
  v_year := EXTRACT(YEAR FROM NOW())::INT;
  LOOP
    v_next := public.next_doc_number(NEW.user_id, 'delivery_note', v_year);
    v_candidate := 'DN-' || v_year::TEXT || '-' || LPAD(v_next::TEXT, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.delivery_notes WHERE delivery_number = v_candidate);
  END LOOP;
  NEW.delivery_number := v_candidate;
  RETURN NEW;
END; $function$;
