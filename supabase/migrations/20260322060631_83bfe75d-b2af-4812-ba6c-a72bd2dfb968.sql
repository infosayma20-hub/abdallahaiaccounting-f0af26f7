
-- Drop the old version without p_user_id parameter to resolve ambiguity
DROP FUNCTION IF EXISTS public.malaki_create_user(text, text, text, text, boolean, boolean, boolean);
