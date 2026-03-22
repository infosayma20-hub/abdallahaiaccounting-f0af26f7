
-- Link existing portal members to the correct owner (malaky broast)
UPDATE public.malaki_portal_users
SET user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73'
WHERE user_id IS NULL;
