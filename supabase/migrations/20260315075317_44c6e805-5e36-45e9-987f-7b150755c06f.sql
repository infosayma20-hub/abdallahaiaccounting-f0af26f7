
-- Inventory settings columns
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS inventory_costing_method text DEFAULT 'weighted_avg',
ADD COLUMN IF NOT EXISTS inventory_default_unit text DEFAULT 'piece',
ADD COLUMN IF NOT EXISTS inventory_low_stock_alert boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS inventory_default_min_qty integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS inventory_default_max_qty integer DEFAULT 1000,
ADD COLUMN IF NOT EXISTS inventory_expiry_alert boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS inventory_expiry_days integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS inventory_auto_barcode boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS inventory_allow_no_barcode boolean DEFAULT true;

-- Security settings columns
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS security_session_timeout integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS security_warning_minutes integer DEFAULT 2,
ADD COLUMN IF NOT EXISTS security_2fa_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS security_passkeys_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS security_ip_restrict boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS security_allowed_ips text DEFAULT '',
ADD COLUMN IF NOT EXISTS security_lockout_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS security_max_attempts integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS security_audit_log boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS security_new_device_alert boolean DEFAULT true;

-- HR missing columns
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS hr_work_days_per_week integer DEFAULT 6,
ADD COLUMN IF NOT EXISTS hr_daily_hours integer DEFAULT 8;
