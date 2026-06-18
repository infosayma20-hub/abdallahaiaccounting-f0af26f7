
-- 1) notification_templates
CREATE TABLE public.notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  title_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  icon TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_templates_company ON public.notification_templates(company_id);
CREATE INDEX idx_notif_templates_category ON public.notification_templates(category);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_templates TO authenticated;
GRANT ALL ON public.notification_templates TO service_role;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

-- Admins manage company templates; everyone sees system templates
CREATE POLICY "view_system_or_company_templates" ON public.notification_templates
  FOR SELECT TO authenticated
  USING (
    is_system = true
    OR (
      company_id IS NOT NULL
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'super_admin')
        OR public.has_role(auth.uid(), 'accountant_senior')
      )
    )
  );

CREATE POLICY "admins_insert_templates" ON public.notification_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    is_system = false
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

CREATE POLICY "admins_update_templates" ON public.notification_templates
  FOR UPDATE TO authenticated
  USING (
    is_system = false
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

CREATE POLICY "admins_delete_templates" ON public.notification_templates
  FOR DELETE TO authenticated
  USING (
    is_system = false
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- 2) notification_broadcasts
CREATE TABLE public.notification_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  sent_by UUID NOT NULL,
  template_id UUID REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  path TEXT,
  audience_type TEXT NOT NULL, -- 'employees' | 'department' | 'role' | 'company'
  audience_filter JSONB DEFAULT '{}'::jsonb,
  recipients_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | completed | partial | failed
  error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_notif_broadcasts_company ON public.notification_broadcasts(company_id, created_at DESC);
CREATE INDEX idx_notif_broadcasts_sender ON public.notification_broadcasts(sent_by, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.notification_broadcasts TO authenticated;
GRANT ALL ON public.notification_broadcasts TO service_role;
ALTER TABLE public.notification_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_view_company_broadcasts" ON public.notification_broadcasts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR sent_by = auth.uid()
  );

CREATE POLICY "admins_insert_broadcasts" ON public.notification_broadcasts
  FOR INSERT TO authenticated
  WITH CHECK (
    sent_by = auth.uid()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- 3) extend notification_log
ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS broadcast_id UUID REFERENCES public.notification_broadcasts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS delivery_error TEXT;

CREATE INDEX IF NOT EXISTS idx_notif_log_broadcast ON public.notification_log(broadcast_id);

-- 4) updated_at trigger for templates
CREATE OR REPLACE FUNCTION public.tg_notification_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_notification_templates_updated_at
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_notification_templates_updated_at();

-- 5) Seed default system templates (Palestinian Arabic, with emojis)
INSERT INTO public.notification_templates (company_id, code, name, category, title_template, body_template, icon, is_system, variables) VALUES
(NULL, 'admin_circular', 'تعميم إداري', 'circular', '📢 تعميم إداري', '{{message}}', '📢', true, '["message"]'::jsonb),
(NULL, 'holiday_greeting', 'تهنئة عيد', 'greeting', '🎉 كل عام وأنتم بخير', 'إدارة الشركة بتهنيكم بمناسبة {{holiday_name}} 🌙✨', '🎉', true, '["holiday_name"]'::jsonb),
(NULL, 'shift_reminder', 'تذكير دوام', 'reminder', '⏰ تذكير بموعد الدوام', 'دوامك بكرا الساعة {{time}} يا بطل، لا تتأخر! 💪', '⏰', true, '["time"]'::jsonb),
(NULL, 'birthday_wish', 'تهنئة عيد ميلاد', 'greeting', '🎂 كل سنة وانت سالم', 'فريق العمل بهنيك بعيد ميلادك يا {{name}}! 🎉🎈', '🎂', true, '["name"]'::jsonb),
(NULL, 'urgent_meeting', 'اجتماع طارئ', 'meeting', '🚨 اجتماع طارئ', 'في اجتماع طارئ {{when}} في {{location}}. حضورك ضروري.', '🚨', true, '["when","location"]'::jsonb),
(NULL, 'payroll_reminder', 'تنبيه راتب', 'payroll', '💰 قسيمة الراتب', 'نزلت قسيمة راتبك لشهر {{month}}. افتح التطبيق لتفاصيلها 📄', '💰', true, '["month"]'::jsonb),
(NULL, 'general_alert', 'تنبيه عام', 'alert', '🔔 تنبيه', '{{message}}', '🔔', true, '["message"]'::jsonb),
(NULL, 'announcement', 'إعلان', 'announcement', '📣 إعلان مهم', '{{message}}', '📣', true, '["message"]'::jsonb);
