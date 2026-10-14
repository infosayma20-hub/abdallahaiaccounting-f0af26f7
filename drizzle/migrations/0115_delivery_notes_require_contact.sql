CREATE OR REPLACE FUNCTION public.delivery_note_ensure_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_id uuid;
BEGIN
  IF COALESCE(NEW.delivery_type,'external') <> 'external' THEN RETURN NEW; END IF;
  v_name := NULLIF(btrim(COALESCE(NEW.contact_name,'')), '');
  -- جهة مختارة: نوحّد الاسم مع اسم الجهة ونتأكد أنها لنفس الشركة
  IF NEW.contact_id IS NOT NULL THEN
    SELECT contact_name INTO v_name FROM contacts WHERE id = NEW.contact_id AND user_id = NEW.user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'جهة الاتصال المختارة غير موجودة لهذه الشركة'; END IF;
    NEW.contact_name := v_name;
    RETURN NEW;
  END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'يجب اختيار العميل (جهة اتصال) للإرسالية الخارجية'; END IF;
  SELECT id INTO v_id FROM contacts
   WHERE user_id = NEW.user_id AND btrim(contact_name) = v_name
   ORDER BY COALESCE(is_archived,false), created_at LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO contacts(user_id, contact_name, contact_type)
    VALUES (NEW.user_id, v_name, 'عميل')
    ON CONFLICT (user_id, contact_name) DO UPDATE SET contact_name = EXCLUDED.contact_name
    RETURNING id INTO v_id;
  END IF;
  NEW.contact_id := v_id;
  NEW.contact_name := v_name;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_01_delivery_note_ensure_contact ON public.delivery_notes;
CREATE TRIGGER trg_01_delivery_note_ensure_contact
BEFORE INSERT OR UPDATE OF contact_id, contact_name, delivery_type ON public.delivery_notes
FOR EACH ROW EXECUTE FUNCTION public.delivery_note_ensure_contact();