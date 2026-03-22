
-- Add visa GL account code to delivery_apps for company-specific visa payments
ALTER TABLE public.delivery_apps ADD COLUMN IF NOT EXISTS visa_gl_account_code TEXT DEFAULT NULL;

-- Insert additional delivery apps (Wheels App Visa, Wheels Bot)
INSERT INTO public.delivery_apps (user_id, name, icon, display_order) VALUES
('0b08eba6-c81a-4f6c-b371-e6e324016e73', 'Wheels App Visa', '💳', 5),
('0b08eba6-c81a-4f6c-b371-e6e324016e73', 'Wheels Bot', '🤖', 6)
ON CONFLICT DO NOTHING;
