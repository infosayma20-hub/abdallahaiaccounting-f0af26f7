INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, currency, nature, is_active, is_system, is_system_protected, sub_group_label, display_order)
VALUES
  ('ccdbcaa5-a585-4d84-a559-a4fc94a6075b','2110.JOD','ذمم موردين - دينار أردني','خصوم','2110','دينار','credit',true,false,false,'ذمم موردين',1),
  ('ccdbcaa5-a585-4d84-a559-a4fc94a6075b','2110.USD','ذمم موردين - دولار أمريكي','خصوم','2110','دولار','credit',true,false,false,'ذمم موردين',2)
ON CONFLICT DO NOTHING;