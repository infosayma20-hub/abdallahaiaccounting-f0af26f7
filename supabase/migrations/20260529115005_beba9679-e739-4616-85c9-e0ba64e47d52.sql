
-- ============================================================================
-- Customer Success Center — Phase 1 Schema
-- ============================================================================

-- ---------- Enums ----------
DO $$ BEGIN
  CREATE TYPE public.cs_note_type AS ENUM ('general','sales','support','management');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cs_call_direction AS ENUM ('inbound','outbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cs_call_outcome AS ENUM ('interested','follow_up','not_interested','support_issue','meeting_scheduled','contract_sent','no_answer','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cs_meeting_status AS ENUM ('scheduled','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cs_ticket_status AS ENUM ('new','in_progress','waiting_customer','waiting_dev','resolved','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cs_ticket_priority AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cs_ticket_category AS ENUM ('accounting','pos','inventory','hr','reports','printing','mobile_app','subscription','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cs_feature_request_status AS ENUM ('new','under_review','planned','in_development','released','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cs_contract_status AS ENUM ('draft','active','expired','cancelled','renewed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cs_subscription_status AS ENUM ('active','grace','suspended','cancelled','trial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cs_payment_status AS ENUM ('paid','due','overdue','pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Sequences for ticket / FR numbers ----------
CREATE SEQUENCE IF NOT EXISTS public.cs_support_ticket_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.cs_feature_request_seq START 1;

-- ---------- Helper: updated_at trigger reuses existing public.update_updated_at_column() ----------

-- ============================================================================
-- 1) cs_notes
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cs_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  note_type public.cs_note_type NOT NULL DEFAULT 'general',
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_notes_contact ON public.cs_notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_cs_notes_user ON public.cs_notes(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_notes TO authenticated;
GRANT ALL ON public.cs_notes TO service_role;
ALTER TABLE public.cs_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members manage cs_notes" ON public.cs_notes
  FOR ALL USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE TRIGGER cs_notes_updated_at BEFORE UPDATE ON public.cs_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2) cs_calls
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cs_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id uuid,
  direction public.cs_call_direction NOT NULL DEFAULT 'inbound',
  called_at timestamptz NOT NULL DEFAULT now(),
  duration_sec integer NOT NULL DEFAULT 0,
  purpose text,
  summary text,
  outcome public.cs_call_outcome NOT NULL DEFAULT 'other',
  recording_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_calls_contact ON public.cs_calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_cs_calls_user ON public.cs_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_cs_calls_called_at ON public.cs_calls(called_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_calls TO authenticated;
GRANT ALL ON public.cs_calls TO service_role;
ALTER TABLE public.cs_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members manage cs_calls" ON public.cs_calls
  FOR ALL USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE TRIGGER cs_calls_updated_at BEFORE UPDATE ON public.cs_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3) cs_meetings
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cs_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  meeting_date timestamptz NOT NULL,
  location text,
  attendees text[] NOT NULL DEFAULT '{}',
  purpose text,
  summary text,
  next_action text,
  status public.cs_meeting_status NOT NULL DEFAULT 'scheduled',
  ai_summary text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_meetings_contact ON public.cs_meetings(contact_id);
CREATE INDEX IF NOT EXISTS idx_cs_meetings_user ON public.cs_meetings(user_id);
CREATE INDEX IF NOT EXISTS idx_cs_meetings_date ON public.cs_meetings(meeting_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_meetings TO authenticated;
GRANT ALL ON public.cs_meetings TO service_role;
ALTER TABLE public.cs_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members manage cs_meetings" ON public.cs_meetings
  FOR ALL USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE TRIGGER cs_meetings_updated_at BEFORE UPDATE ON public.cs_meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4) cs_support_tickets + comments
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cs_generate_ticket_number()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('public.cs_support_ticket_seq');
  RETURN 'SUP-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 5, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS public.cs_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ticket_number text NOT NULL UNIQUE DEFAULT public.cs_generate_ticket_number(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  category public.cs_ticket_category NOT NULL DEFAULT 'other',
  priority public.cs_ticket_priority NOT NULL DEFAULT 'medium',
  status public.cs_ticket_status NOT NULL DEFAULT 'new',
  assigned_to uuid,
  resolution text,
  resolved_at timestamptz,
  closed_at timestamptz,
  ai_summary text,
  last_sentiment text,
  suggested_next_action text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_tickets_contact ON public.cs_support_tickets(contact_id);
CREATE INDEX IF NOT EXISTS idx_cs_tickets_user ON public.cs_support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_cs_tickets_status ON public.cs_support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_cs_tickets_priority ON public.cs_support_tickets(priority);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_support_tickets TO authenticated;
GRANT ALL ON public.cs_support_tickets TO service_role;
ALTER TABLE public.cs_support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members manage cs_support_tickets" ON public.cs_support_tickets
  FOR ALL USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE TRIGGER cs_tickets_updated_at BEFORE UPDATE ON public.cs_support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.cs_ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ticket_id uuid NOT NULL REFERENCES public.cs_support_tickets(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_ticket_comments_ticket ON public.cs_ticket_comments(ticket_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_ticket_comments TO authenticated;
GRANT ALL ON public.cs_ticket_comments TO service_role;
ALTER TABLE public.cs_ticket_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members manage cs_ticket_comments" ON public.cs_ticket_comments
  FOR ALL USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- ============================================================================
-- 5) cs_feature_requests + votes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cs_generate_fr_number()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  n := nextval('public.cs_feature_request_seq');
  RETURN 'FR-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 5, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS public.cs_feature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fr_number text NOT NULL UNIQUE DEFAULT public.cs_generate_fr_number(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  title text NOT NULL,
  business_justification text,
  requested_by uuid,
  votes integer NOT NULL DEFAULT 0,
  status public.cs_feature_request_status NOT NULL DEFAULT 'new',
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_fr_user ON public.cs_feature_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_cs_fr_contact ON public.cs_feature_requests(contact_id);
CREATE INDEX IF NOT EXISTS idx_cs_fr_status ON public.cs_feature_requests(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_feature_requests TO authenticated;
GRANT ALL ON public.cs_feature_requests TO service_role;
ALTER TABLE public.cs_feature_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members manage cs_feature_requests" ON public.cs_feature_requests
  FOR ALL USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE TRIGGER cs_fr_updated_at BEFORE UPDATE ON public.cs_feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 6) cs_contracts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cs_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  contract_number text NOT NULL,
  plan text,
  users_count integer NOT NULL DEFAULT 1,
  branches_count integer NOT NULL DEFAULT 1,
  price numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  start_date date NOT NULL,
  end_date date,
  status public.cs_contract_status NOT NULL DEFAULT 'active',
  pdf_url text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_contracts_contact ON public.cs_contracts(contact_id);
CREATE INDEX IF NOT EXISTS idx_cs_contracts_user ON public.cs_contracts(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_contracts TO authenticated;
GRANT ALL ON public.cs_contracts TO service_role;
ALTER TABLE public.cs_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members manage cs_contracts" ON public.cs_contracts
  FOR ALL USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE TRIGGER cs_contracts_updated_at BEFORE UPDATE ON public.cs_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 7) cs_subscriptions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cs_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  plan text NOT NULL,
  monthly_value numeric(14,2) NOT NULL DEFAULT 0,
  annual_value numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  renewal_date date NOT NULL,
  status public.cs_subscription_status NOT NULL DEFAULT 'active',
  payment_status public.cs_payment_status NOT NULL DEFAULT 'pending',
  contract_id uuid REFERENCES public.cs_contracts(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_subs_contact ON public.cs_subscriptions(contact_id);
CREATE INDEX IF NOT EXISTS idx_cs_subs_user ON public.cs_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_cs_subs_renewal ON public.cs_subscriptions(renewal_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_subscriptions TO authenticated;
GRANT ALL ON public.cs_subscriptions TO service_role;
ALTER TABLE public.cs_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members manage cs_subscriptions" ON public.cs_subscriptions
  FOR ALL USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE TRIGGER cs_subs_updated_at BEFORE UPDATE ON public.cs_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 8) cs_kb_articles
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cs_kb_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  problem text,
  symptoms text,
  cause text,
  solution text,
  video_url text,
  tags text[] NOT NULL DEFAULT '{}',
  published boolean NOT NULL DEFAULT true,
  views_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_kb_user ON public.cs_kb_articles(user_id);
CREATE INDEX IF NOT EXISTS idx_cs_kb_category ON public.cs_kb_articles(category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_kb_articles TO authenticated;
GRANT ALL ON public.cs_kb_articles TO service_role;
ALTER TABLE public.cs_kb_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members manage cs_kb_articles" ON public.cs_kb_articles
  FOR ALL USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE TRIGGER cs_kb_updated_at BEFORE UPDATE ON public.cs_kb_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 9) Unified timeline view
-- ============================================================================
CREATE OR REPLACE VIEW public.cs_customer_timeline_view AS
  SELECT
    'note'::text AS event_type,
    n.id AS ref_id,
    n.contact_id,
    n.user_id,
    n.created_at AS event_date,
    n.title,
    n.body AS summary,
    n.note_type::text AS sub_type,
    NULL::text AS status
  FROM public.cs_notes n
  UNION ALL
  SELECT 'call', c.id, c.contact_id, c.user_id, c.called_at,
    COALESCE(c.purpose, 'مكالمة'), c.summary, c.direction::text, c.outcome::text
  FROM public.cs_calls c WHERE c.contact_id IS NOT NULL
  UNION ALL
  SELECT 'meeting', m.id, m.contact_id, m.user_id, m.meeting_date,
    COALESCE(m.purpose, 'اجتماع'), m.summary, NULL, m.status::text
  FROM public.cs_meetings m
  UNION ALL
  SELECT 'ticket', t.id, t.contact_id, t.user_id, t.created_at,
    t.ticket_number || ' — ' || t.title, t.description, t.category::text, t.status::text
  FROM public.cs_support_tickets t WHERE t.contact_id IS NOT NULL
  UNION ALL
  SELECT 'feature_request', f.id, f.contact_id, f.user_id, f.created_at,
    f.fr_number || ' — ' || f.title, f.business_justification, NULL, f.status::text
  FROM public.cs_feature_requests f WHERE f.contact_id IS NOT NULL
  UNION ALL
  SELECT 'contract', k.id, k.contact_id, k.user_id, k.created_at,
    'عقد ' || k.contract_number, k.notes, k.plan, k.status::text
  FROM public.cs_contracts k
  UNION ALL
  SELECT 'subscription', s.id, s.contact_id, s.user_id, s.created_at,
    'اشتراك ' || s.plan, s.notes, NULL, s.status::text
  FROM public.cs_subscriptions s;

GRANT SELECT ON public.cs_customer_timeline_view TO authenticated;

-- ============================================================================
-- 10) Health score function (placeholder, deterministic)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_health_score(_contact_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  score integer := 100;
  open_tickets int;
  overdue numeric;
  days_since_contact int;
BEGIN
  SELECT COUNT(*) INTO open_tickets FROM public.cs_support_tickets
    WHERE contact_id = _contact_id AND status NOT IN ('resolved','closed');
  SELECT COALESCE(overdue_amount,0) INTO overdue FROM public.contacts WHERE id = _contact_id;
  SELECT EXTRACT(DAY FROM (now() - COALESCE(MAX(event_date), now() - interval '365 days')))::int
    INTO days_since_contact FROM public.cs_customer_timeline_view WHERE contact_id = _contact_id;

  score := score - LEAST(open_tickets * 8, 40);
  IF overdue > 0 THEN score := score - LEAST((overdue / 1000)::int * 2, 30); END IF;
  IF days_since_contact > 60 THEN score := score - 15;
  ELSIF days_since_contact > 30 THEN score := score - 8; END IF;

  RETURN GREATEST(score, 0);
END;
$$;

-- ============================================================================
-- 11) Storage bucket for contract PDFs
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('cs-contracts', 'cs-contracts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "cs_contracts_read_own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'cs-contracts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "cs_contracts_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'cs-contracts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "cs_contracts_update_own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'cs-contracts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "cs_contracts_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'cs-contracts' AND auth.uid()::text = (storage.foldername(name))[1]);
