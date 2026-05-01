UPDATE public.company_settings
SET feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                    || '{"vouchers_use_rpc": true, "invoices_use_rpc": true}'::jsonb
WHERE user_id = 'f095ae37-960c-4de7-8da1-b68cebf0bb50';