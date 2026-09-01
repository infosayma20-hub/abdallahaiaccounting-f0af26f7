-- Branch scope helpers
CREATE OR REPLACE FUNCTION public.user_allowed_branch_ids(_user_id uuid)
RETURNS TABLE(branch_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.branch_id FROM public.user_scope_access s
   WHERE s.user_id = _user_id AND s.branch_id IS NOT NULL
  UNION
  SELECT w.branch_id FROM public.warehouses w
   JOIN public.user_scope_access s ON s.warehouse_id = w.id
   WHERE s.user_id = _user_id AND w.branch_id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.user_can_use_branch(_user_id uuid, _branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NULL
    OR _branch_id IS NULL
    OR NOT public.user_has_scope(_user_id)
    OR public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'super_admin')
    OR EXISTS (SELECT 1 FROM public.user_allowed_branch_ids(_user_id) a WHERE a.branch_id = _branch_id)
$$;

-- Scoped users must never leave the warehouse blank: auto-fill when they only
-- have one allowed warehouse, otherwise force an explicit (allowed) choice.
CREATE OR REPLACE FUNCTION public.enforce_user_warehouse_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_col text;
  v_val uuid;
  v_name text;
  v_allowed uuid[];
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  IF NOT public.user_has_scope(v_uid) THEN RETURN NEW; END IF;
  IF public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'super_admin') THEN RETURN NEW; END IF;

  SELECT array_agg(a.warehouse_id) INTO v_allowed
    FROM public.user_allowed_warehouse_ids(v_uid) a;

  IF v_allowed IS NULL OR array_length(v_allowed, 1) IS NULL THEN
    RAISE EXCEPTION 'لا يوجد مستودع مسموح لحسابك — راجع مدير النظام'
      USING ERRCODE = '42501';
  END IF;

  FOREACH v_col IN ARRAY TG_ARGV LOOP
    EXECUTE format('SELECT ($1).%I::uuid', v_col) INTO v_val USING NEW;

    IF v_val IS NULL THEN
      IF array_length(v_allowed, 1) = 1 THEN
        NEW := json_populate_record(NEW, json_build_object(v_col, v_allowed[1]));
      ELSE
        RAISE EXCEPTION 'يجب تحديد المستودع — حسابك مقيّد بمستودعات محددة'
          USING ERRCODE = '42501';
      END IF;
    ELSIF NOT (v_val = ANY (v_allowed)) THEN
      SELECT name INTO v_name FROM public.warehouses WHERE id = v_val;
      RAISE EXCEPTION 'لا تملك صلاحية العمل على المستودع %', COALESCE(v_name, v_val::text)
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Branch-level guard (does not auto-fill; branches are explicit on documents)
CREATE OR REPLACE FUNCTION public.enforce_user_branch_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_col text;
  v_val uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  IF NOT public.user_has_scope(v_uid) THEN RETURN NEW; END IF;
  IF public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'super_admin') THEN RETURN NEW; END IF;

  FOREACH v_col IN ARRAY TG_ARGV LOOP
    EXECUTE format('SELECT ($1).%I::uuid', v_col) INTO v_val USING NEW;
    IF v_val IS NOT NULL AND NOT public.user_can_use_branch(v_uid, v_val) THEN
      SELECT name INTO v_name FROM public.branches WHERE id = v_val;
      RAISE EXCEPTION 'لا تملك صلاحية العمل على الفرع %', COALESCE(v_name, v_val::text)
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scope_branch_pos_orders ON public.pos_orders;
CREATE TRIGGER trg_scope_branch_pos_orders
BEFORE INSERT OR UPDATE ON public.pos_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_branch_scope('branch_id');

DROP TRIGGER IF EXISTS trg_scope_pos_orders ON public.pos_orders;
CREATE TRIGGER trg_scope_pos_orders
BEFORE INSERT OR UPDATE ON public.pos_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_warehouse_scope('warehouse_id');