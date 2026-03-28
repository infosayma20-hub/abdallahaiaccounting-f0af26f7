UPDATE company_settings 
SET hidden_apps = COALESCE(hidden_apps, '{}') || ARRAY['call_center']::text[]
WHERE user_id = 'caa0545a-6c9c-4909-827b-a72d4834d079'
AND NOT ('call_center' = ANY(COALESCE(hidden_apps, '{}')));