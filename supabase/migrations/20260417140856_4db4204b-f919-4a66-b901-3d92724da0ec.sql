-- جدول السجل الأمني الموحد لكل المستخدمين
CREATE TABLE IF NOT EXISTS public.user_security_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_email TEXT,
  user_name TEXT,
  event_type TEXT NOT NULL, -- 'login_success', 'login_failed', 'logout', 'signup', 'password_changed', 'email_changed', 'role_changed', 'suspicious_activity'
  auth_method TEXT, -- 'password', 'google', 'magic_link', etc.
  ip_address TEXT,
  user_agent TEXT,
  device_type TEXT, -- 'desktop', 'mobile', 'tablet'
  browser TEXT,
  os TEXT,
  country TEXT,
  city TEXT,
  is_new_device BOOLEAN DEFAULT false,
  is_suspicious BOOLEAN DEFAULT false,
  risk_score INTEGER DEFAULT 0, -- 0-100
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- فهارس
CREATE INDEX IF NOT EXISTS idx_user_security_audit_user ON public.user_security_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_security_audit_event ON public.user_security_audit(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_security_audit_email ON public.user_security_audit(user_email);
CREATE INDEX IF NOT EXISTS idx_user_security_audit_ip ON public.user_security_audit(ip_address);
CREATE INDEX IF NOT EXISTS idx_user_security_audit_suspicious ON public.user_security_audit(is_suspicious) WHERE is_suspicious = true;

-- تفعيل RLS
ALTER TABLE public.user_security_audit ENABLE ROW LEVEL SECURITY;

-- السوبر أدمن يرى كل السجلات
CREATE POLICY "Super admins view all audit logs"
ON public.user_security_audit FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- المستخدم يرى سجله الخاص فقط
CREATE POLICY "Users view their own audit logs"
ON public.user_security_audit FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- لا يوجد سياسة INSERT للمستخدمين العاديين — Edge function فقط (service role) يكتب

-- منع التعديل والحذف نهائياً (سجل ثابت)
-- (لا توجد سياسات UPDATE/DELETE = ممنوع تلقائياً)

COMMENT ON TABLE public.user_security_audit IS 'سجل أمني موحد لجميع أحداث المصادقة والوصول. للقراءة فقط — يكتب عبر edge function (service role).';