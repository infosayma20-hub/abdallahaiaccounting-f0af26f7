
-- =========================================================
-- User App Access Overrides — per-user allow/deny per app
-- =========================================================

CREATE TABLE IF NOT EXISTS public.user_app_access_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid,                              -- company owner user_id (denormalized for fast RLS)
  company_id      uuid,                              -- target's company_id (denormalized)
  target_user_id  uuid NOT NULL,                     -- the auth user this override applies to
  app_key         text NOT NULL,
  access_state    text NOT NULL CHECK (access_state IN ('allow','deny')),
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_user_id, app_key)
);

CREATE INDEX IF NOT EXISTS idx_uaao_target ON public.user_app_access_overrides(target_user_id);
CREATE INDEX IF NOT EXISTS idx_uaao_company ON public.user_app_access_overrides(company_id);

-- Helper: same-company check (SECURITY DEFINER to avoid recursion on profiles RLS)
CREATE OR REPLACE FUNCTION public.uaao_can_admin_target(_admin uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles a, public.profiles t
    WHERE a.user_id = _admin
      AND t.user_id = _target
      AND (
        a.user_id = t.user_id                      -- self
        OR (a.company_id IS NOT NULL AND a.company_id = t.company_id)
        OR t.invited_by = a.user_id
      )
  );
$$;

-- Trigger: fill owner_id / company_id from target profile
CREATE OR REPLACE FUNCTION public.uaao_fill_meta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_owner   uuid;
BEGIN
  SELECT company_id, COALESCE(invited_by, company_id, user_id)
    INTO v_company, v_owner
    FROM public.profiles
   WHERE user_id = NEW.target_user_id
   LIMIT 1;

  NEW.company_id := COALESCE(NEW.company_id, v_company);
  NEW.owner_id   := COALESCE(NEW.owner_id, v_owner);
  NEW.updated_at := now();
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uaao_fill_meta ON public.user_app_access_overrides;
CREATE TRIGGER trg_uaao_fill_meta
BEFORE INSERT OR UPDATE ON public.user_app_access_overrides
FOR EACH ROW EXECUTE FUNCTION public.uaao_fill_meta();

-- Trigger: audit log
CREATE OR REPLACE FUNCTION public.uaao_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text;
  v_new text;
  v_target uuid;
  v_app text;
  v_company uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := OLD.access_state; v_new := 'inherit';
    v_target := OLD.target_user_id; v_app := OLD.app_key; v_company := OLD.company_id;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := 'inherit'; v_new := NEW.access_state;
    v_target := NEW.target_user_id; v_app := NEW.app_key; v_company := NEW.company_id;
  ELSE
    v_old := OLD.access_state; v_new := NEW.access_state;
    v_target := NEW.target_user_id; v_app := NEW.app_key; v_company := NEW.company_id;
  END IF;

  BEGIN
    INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, entity_label, details, created_at)
    VALUES (
      auth.uid(),
      'update_user_app_access',
      'user_app_access',
      v_target,
      v_app,
      jsonb_build_object('app_key', v_app, 'old', v_old, 'new', v_new, 'company_id', v_company),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    -- never block writes if audit fails
    NULL;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_uaao_audit ON public.user_app_access_overrides;
CREATE TRIGGER trg_uaao_audit
AFTER INSERT OR UPDATE OR DELETE ON public.user_app_access_overrides
FOR EACH ROW EXECUTE FUNCTION public.uaao_audit();

-- RLS
ALTER TABLE public.user_app_access_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uaao_select ON public.user_app_access_overrides;
CREATE POLICY uaao_select ON public.user_app_access_overrides
FOR SELECT TO authenticated
USING (
  target_user_id = auth.uid()
  OR public.uaao_can_admin_target(auth.uid(), target_user_id)
);

DROP POLICY IF EXISTS uaao_insert ON public.user_app_access_overrides;
CREATE POLICY uaao_insert ON public.user_app_access_overrides
FOR INSERT TO authenticated
WITH CHECK (
  target_user_id <> auth.uid()
  AND public.uaao_can_admin_target(auth.uid(), target_user_id)
);

DROP POLICY IF EXISTS uaao_update ON public.user_app_access_overrides;
CREATE POLICY uaao_update ON public.user_app_access_overrides
FOR UPDATE TO authenticated
USING (
  target_user_id <> auth.uid()
  AND public.uaao_can_admin_target(auth.uid(), target_user_id)
)
WITH CHECK (
  target_user_id <> auth.uid()
  AND public.uaao_can_admin_target(auth.uid(), target_user_id)
);

DROP POLICY IF EXISTS uaao_delete ON public.user_app_access_overrides;
CREATE POLICY uaao_delete ON public.user_app_access_overrides
FOR DELETE TO authenticated
USING (
  target_user_id <> auth.uid()
  AND public.uaao_can_admin_target(auth.uid(), target_user_id)
);
