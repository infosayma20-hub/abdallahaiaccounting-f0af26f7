
-- Phase A: Feedback module foundation
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;
  v := regexp_replace(p_phone, '[^0-9+]', '', 'g');
  IF v = '' THEN RETURN NULL; END IF;
  IF v LIKE '+972%' THEN v := '0' || substring(v from 5); END IF;
  IF v LIKE '00972%' THEN v := '0' || substring(v from 6); END IF;
  IF v LIKE '972%' AND length(v) >= 11 THEN v := '0' || substring(v from 4); END IF;
  v := regexp_replace(v, '\+', '', 'g');
  RETURN v;
END;
$$;

CREATE TABLE public.feedback_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  normalized_phone text NOT NULL,
  display_phone text,
  full_name text,
  last_known_branch_id uuid,
  notes text,
  total_orders_cached int NOT NULL DEFAULT 0,
  last_order_at_cached timestamptz,
  do_not_call boolean NOT NULL DEFAULT false,
  do_not_call_reason text,
  do_not_call_at timestamptz,
  do_not_call_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_customers_phone_per_tenant UNIQUE (user_id, normalized_phone)
);

CREATE INDEX idx_fb_customers_user ON public.feedback_customers(user_id);
CREATE INDEX idx_fb_customers_phone ON public.feedback_customers(user_id, normalized_phone);
CREATE INDEX idx_fb_customers_name_trgm ON public.feedback_customers USING gin (lower(coalesce(full_name,'')) gin_trgm_ops);

CREATE TABLE public.feedback_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.feedback_customers(id) ON DELETE CASCADE,
  related_order_id uuid REFERENCES public.call_center_orders(id) ON DELETE SET NULL,
  related_pos_order_id uuid,
  called_at timestamptz NOT NULL DEFAULT now(),
  called_by uuid,
  called_by_name text,
  outcome text NOT NULL CHECK (outcome IN ('answered','no_answer','busy','wrong_number','do_not_call')),
  sentiment text CHECK (sentiment IN ('satisfied','unsatisfied','complaint','suggestion','neutral')),
  rating int CHECK (rating BETWEEN 1 AND 5),
  complaint_text text,
  suggestion_text text,
  note text,
  needs_followup boolean NOT NULL DEFAULT false,
  followup_due_at timestamptz,
  followup_status text CHECK (followup_status IN ('pending','done','snoozed','cancelled')),
  followup_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fb_calls_customer ON public.feedback_calls(user_id, customer_id);
CREATE INDEX idx_fb_calls_followup ON public.feedback_calls(user_id, followup_due_at)
  WHERE needs_followup = true AND followup_status IN ('pending','snoozed');
CREATE INDEX idx_fb_calls_related_order ON public.feedback_calls(related_order_id) WHERE related_order_id IS NOT NULL;

CREATE TRIGGER trg_fb_customers_updated_at
  BEFORE UPDATE ON public.feedback_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_fb_calls_updated_at
  BEFORE UPDATE ON public.feedback_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.feedback_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_calls     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fb_customers_select"
  ON public.feedback_customers FOR SELECT
  USING (
    public.is_team_member(auth.uid(), user_id)
    AND public.has_feature_permission(auth.uid(), 'call_center_feedback', 'customers', 'view')
  );

CREATE POLICY "fb_customers_insert"
  ON public.feedback_customers FOR INSERT
  WITH CHECK (
    public.is_team_member(auth.uid(), user_id)
    AND public.has_feature_permission(auth.uid(), 'call_center_feedback', 'customers', 'create')
  );

CREATE POLICY "fb_customers_update"
  ON public.feedback_customers FOR UPDATE
  USING (
    public.is_team_member(auth.uid(), user_id)
    AND public.has_feature_permission(auth.uid(), 'call_center_feedback', 'customers', 'edit')
  )
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "fb_calls_select"
  ON public.feedback_calls FOR SELECT
  USING (
    public.is_team_member(auth.uid(), user_id)
    AND public.has_feature_permission(auth.uid(), 'call_center_feedback', 'calls', 'view')
  );

CREATE POLICY "fb_calls_insert"
  ON public.feedback_calls FOR INSERT
  WITH CHECK (
    public.is_team_member(auth.uid(), user_id)
    AND public.has_feature_permission(auth.uid(), 'call_center_feedback', 'calls', 'create')
  );

REVOKE UPDATE, DELETE ON public.feedback_calls FROM authenticated, anon;

INSERT INTO public.role_default_feature_permissions (role, app_key, feature_key, permission_key, allowed)
VALUES
  ('admin','call_center_feedback','customers','view',true),
  ('admin','call_center_feedback','customers','create',true),
  ('admin','call_center_feedback','customers','edit',true),
  ('admin','call_center_feedback','calls','view',true),
  ('admin','call_center_feedback','calls','create',true),
  ('admin','call_center_feedback','calls','edit',true)
ON CONFLICT DO NOTHING;
