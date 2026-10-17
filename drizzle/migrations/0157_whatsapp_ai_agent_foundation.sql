CREATE TABLE public.wa_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  phone_number_id text NOT NULL UNIQUE,
  waba_id text,
  display_phone text,
  display_name text,
  token_secret_id uuid,
  status text NOT NULL DEFAULT 'test' CHECK (status IN ('test','live','disconnected')),
  connected_via text NOT NULL DEFAULT 'manual' CHECK (connected_via IN ('manual','embedded_signup')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_channels_owner ON public.wa_channels(owner_id);

CREATE TABLE public.wa_agent_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE,
  business_name text,
  agent_name text,
  intro_line text,
  tracks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tracks) = 'array' AND jsonb_array_length(tracks) <= 8),
  pricing_rule text,
  forbidden_topics text,
  office_hours text,
  response_promise text,
  notify_whatsapp text,
  tone text NOT NULL DEFAULT 'palestinian_polite',
  custom_prompt text,
  model text NOT NULL DEFAULT 'claude-sonnet-5-5',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wa_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  wa_id text NOT NULL,
  bsuid text,
  phone text,
  profile_name text,
  linked_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, wa_id)
);

CREATE TABLE public.wa_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.wa_channels(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.wa_contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','summarized','closed')),
  track_key text,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_conversations_owner ON public.wa_conversations(owner_id, last_message_at DESC);
CREATE INDEX idx_wa_conversations_contact ON public.wa_conversations(contact_id);

CREATE TABLE public.wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  wa_message_id text UNIQUE,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  type text NOT NULL DEFAULT 'text' CHECK (type IN ('text','audio','image','document','interactive','other')),
  body text,
  media_id text,
  transcript text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_messages_conv ON public.wa_messages(conversation_id, created_at);

CREATE TABLE public.wa_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  conversation_id uuid REFERENCES public.wa_conversations(id) ON DELETE SET NULL,
  name text, company text, city text, phone_given text, track_key text,
  details text, questions text, deadline text, best_time text,
  existing_client boolean, urgent boolean NOT NULL DEFAULT false,
  attachments_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','quoted','won','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_leads_owner ON public.wa_leads(owner_id, created_at DESC);

CREATE TABLE public.wa_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  conversation_id uuid REFERENCES public.wa_conversations(id) ON DELETE SET NULL,
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  stt_seconds numeric NOT NULL DEFAULT 0,
  messages_out int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_usage_owner ON public.wa_usage(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.edge_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,
  fn text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_channels, public.wa_agent_profiles, public.wa_contacts, public.wa_conversations, public.wa_leads TO authenticated;
GRANT SELECT ON public.wa_messages, public.wa_usage, public.edge_logs TO authenticated;
GRANT ALL ON public.wa_channels, public.wa_agent_profiles, public.wa_contacts, public.wa_conversations, public.wa_messages, public.wa_leads, public.wa_usage, public.edge_logs TO service_role;

ALTER TABLE public.wa_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_agent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edge_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY wa_channels_tenant ON public.wa_channels FOR ALL TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), owner_id)) WITH CHECK (public.is_team_member((SELECT auth.uid()), owner_id));
CREATE POLICY wa_agent_profiles_tenant ON public.wa_agent_profiles FOR ALL TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), owner_id)) WITH CHECK (public.is_team_member((SELECT auth.uid()), owner_id));
CREATE POLICY wa_contacts_tenant ON public.wa_contacts FOR ALL TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), owner_id)) WITH CHECK (public.is_team_member((SELECT auth.uid()), owner_id));
CREATE POLICY wa_conversations_tenant ON public.wa_conversations FOR ALL TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), owner_id)) WITH CHECK (public.is_team_member((SELECT auth.uid()), owner_id));
CREATE POLICY wa_leads_tenant ON public.wa_leads FOR ALL TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), owner_id)) WITH CHECK (public.is_team_member((SELECT auth.uid()), owner_id));
CREATE POLICY wa_messages_tenant_read ON public.wa_messages FOR SELECT TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), owner_id));
CREATE POLICY wa_usage_tenant_read ON public.wa_usage FOR SELECT TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), owner_id));
CREATE POLICY edge_logs_tenant_read ON public.edge_logs FOR SELECT TO authenticated
  USING (owner_id IS NOT NULL AND public.is_team_member((SELECT auth.uid()), owner_id));