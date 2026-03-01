
-- ═══════════════════════════════════════════════════════════
-- POS MULTI-USER SYSTEM: Users, Permissions, Devices, Audit
-- ═══════════════════════════════════════════════════════════

-- 1. POS Users (cashiers/managers linked to company)
CREATE TABLE public.pos_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- business owner (admin)
  company_id UUID NOT NULL REFERENCES public.pos_companies(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  avatar_url TEXT,
  pin_hash TEXT NOT NULL, -- bcrypt hashed PIN
  role TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('pos_admin', 'pos_manager', 'cashier', 'viewer')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  pin_failed_attempts INTEGER NOT NULL DEFAULT 0,
  pin_locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. POS User Permissions (granular access control)
CREATE TABLE public.pos_user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- business owner
  pos_user_id UUID NOT NULL REFERENCES public.pos_users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.pos_companies(id) ON DELETE CASCADE,
  can_open_register BOOLEAN NOT NULL DEFAULT true,
  can_close_register BOOLEAN NOT NULL DEFAULT true,
  can_apply_discount BOOLEAN NOT NULL DEFAULT false,
  max_discount_percent NUMERIC NOT NULL DEFAULT 0,
  can_view_profits BOOLEAN NOT NULL DEFAULT false,
  can_edit_prices BOOLEAN NOT NULL DEFAULT false,
  can_void_sales BOOLEAN NOT NULL DEFAULT false,
  can_refund BOOLEAN NOT NULL DEFAULT false,
  can_view_shift_details BOOLEAN NOT NULL DEFAULT false,
  require_manager_approval BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pos_user_id)
);

-- 3. POS Devices (registered terminals with fingerprinting)
CREATE TABLE public.pos_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- business owner
  company_id UUID NOT NULL REFERENCES public.pos_companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  terminal_id UUID REFERENCES public.pos_terminals(id) ON DELETE SET NULL,
  device_name TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, device_fingerprint)
);

-- 4. POS User-Device Access (which users can login from which devices)
CREATE TABLE public.pos_user_device_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- business owner
  pos_user_id UUID NOT NULL REFERENCES public.pos_users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.pos_devices(id) ON DELETE CASCADE,
  can_login BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pos_user_id, device_id)
);

-- 5. POS Audit Logs
CREATE TABLE public.pos_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- business owner
  company_id UUID NOT NULL REFERENCES public.pos_companies(id) ON DELETE CASCADE,
  actor_pos_user_id UUID REFERENCES public.pos_users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL, -- 'pin_login', 'pin_fail', 'shift_open', 'shift_close', 'void', 'discount', 'refund', 'permission_change'
  entity_type TEXT, -- 'session', 'order', 'user', 'device'
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  device_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Add cashier_pos_user_id to pos_sessions for multi-user tracking
ALTER TABLE public.pos_sessions ADD COLUMN IF NOT EXISTS cashier_pos_user_id UUID REFERENCES public.pos_users(id) ON DELETE SET NULL;
ALTER TABLE public.pos_sessions ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES public.pos_devices(id) ON DELETE SET NULL;
ALTER TABLE public.pos_sessions ADD COLUMN IF NOT EXISTS approved_by_pos_user_id UUID REFERENCES public.pos_users(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════
CREATE INDEX idx_pos_users_company ON public.pos_users(company_id);
CREATE INDEX idx_pos_users_user_id ON public.pos_users(user_id);
CREATE INDEX idx_pos_devices_company ON public.pos_devices(company_id);
CREATE INDEX idx_pos_devices_fingerprint ON public.pos_devices(device_fingerprint);
CREATE INDEX idx_pos_audit_company ON public.pos_audit_logs(company_id);
CREATE INDEX idx_pos_audit_actor ON public.pos_audit_logs(actor_pos_user_id);
CREATE INDEX idx_pos_audit_created ON public.pos_audit_logs(created_at DESC);
CREATE INDEX idx_pos_sessions_cashier_pos ON public.pos_sessions(cashier_pos_user_id);

-- ═══════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════

-- pos_users
ALTER TABLE public.pos_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages pos users" ON public.pos_users FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- pos_user_permissions
ALTER TABLE public.pos_user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages pos permissions" ON public.pos_user_permissions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- pos_devices
ALTER TABLE public.pos_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages pos devices" ON public.pos_devices FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- pos_user_device_access
ALTER TABLE public.pos_user_device_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages device access" ON public.pos_user_device_access FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- pos_audit_logs
ALTER TABLE public.pos_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner views audit logs" ON public.pos_audit_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System inserts audit logs" ON public.pos_audit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════
-- TRIGGER: auto update updated_at
-- ═══════════════════════════════════════════════════════════
CREATE TRIGGER update_pos_users_updated_at BEFORE UPDATE ON public.pos_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pos_user_permissions_updated_at BEFORE UPDATE ON public.pos_user_permissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pos_devices_updated_at BEFORE UPDATE ON public.pos_devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
