CREATE TABLE public.user_scope_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_scope_access_one_target CHECK (num_nonnulls(branch_id, warehouse_id) = 1)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_scope_access TO authenticated;
GRANT ALL ON public.user_scope_access TO service_role;

CREATE UNIQUE INDEX user_scope_access_branch_uq ON public.user_scope_access(user_id, branch_id) WHERE branch_id IS NOT NULL;
CREATE UNIQUE INDEX user_scope_access_wh_uq ON public.user_scope_access(user_id, warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE INDEX user_scope_access_user_idx ON public.user_scope_access(user_id);

ALTER TABLE public.user_scope_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own scope" ON public.user_scope_access
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "admins manage scope" ON public.user_scope_access
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER user_scope_access_updated_at
BEFORE UPDATE ON public.user_scope_access
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Does the user have any scope restriction at all?
CREATE OR REPLACE FUNCTION public.user_has_scope(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_scope_access WHERE user_id = _user_id)
$$;

-- Warehouses a user may operate on (direct warehouse grants + all warehouses of granted branches)
CREATE OR REPLACE FUNCTION public.user_allowed_warehouse_ids(_user_id uuid)
RETURNS TABLE(warehouse_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.warehouse_id FROM public.user_scope_access s
   WHERE s.user_id = _user_id AND s.warehouse_id IS NOT NULL
  UNION
  SELECT w.id FROM public.warehouses w
   JOIN public.user_scope_access s ON s.branch_id = w.branch_id
   WHERE s.user_id = _user_id AND s.branch_id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.user_can_use_warehouse(_user_id uuid, _warehouse_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _user_id IS NULL
    OR _warehouse_id IS NULL
    OR NOT public.user_has_scope(_user_id)
    OR public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'super_admin')
    OR EXISTS (SELECT 1 FROM public.user_allowed_warehouse_ids(_user_id) a WHERE a.warehouse_id = _warehouse_id)
$$;

-- Generic enforcement trigger: checks configured warehouse columns on the row
CREATE OR REPLACE FUNCTION public.enforce_user_warehouse_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_col text;
  v_val uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  IF NOT public.user_has_scope(v_uid) THEN RETURN NEW; END IF;

  FOREACH v_col IN ARRAY TG_ARGV LOOP
    EXECUTE format('SELECT ($1).%I::uuid', v_col) INTO v_val USING NEW;
    IF v_val IS NOT NULL AND NOT public.user_can_use_warehouse(v_uid, v_val) THEN
      SELECT name INTO v_name FROM public.warehouses WHERE id = v_val;
      RAISE EXCEPTION 'لا تملك صلاحية العمل على المستودع %', COALESCE(v_name, v_val::text)
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_scope_stock_movements
BEFORE INSERT OR UPDATE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_warehouse_scope('warehouse_id');

CREATE TRIGGER trg_scope_stock_documents
BEFORE INSERT OR UPDATE ON public.stock_documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_warehouse_scope('warehouse_id');

CREATE TRIGGER trg_scope_stock_transfers
BEFORE INSERT OR UPDATE ON public.stock_transfers
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_warehouse_scope('from_warehouse_id', 'to_warehouse_id');

CREATE TRIGGER trg_scope_invoices
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_warehouse_scope('warehouse_id');