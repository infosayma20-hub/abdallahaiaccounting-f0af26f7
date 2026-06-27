UPDATE public.pos_users
SET name = 'المعتصم عناتي', updated_at = now()
WHERE id = '2e3e94cc-c246-43e0-85a4-88fdd43627c5';

UPDATE public.pos_sessions
SET cashier_name = 'المعتصم عناتي'
WHERE user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73'
  AND state = 'open';