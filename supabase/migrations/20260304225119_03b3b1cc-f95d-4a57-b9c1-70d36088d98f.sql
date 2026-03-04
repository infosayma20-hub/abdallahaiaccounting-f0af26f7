
-- Add account-related columns to pos_users table
ALTER TABLE public.pos_users
ADD COLUMN IF NOT EXISTS has_account BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auth_user_id UUID,
ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'none';

-- Add validation trigger for account_status
CREATE OR REPLACE FUNCTION public.validate_pos_user_account_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.account_status NOT IN ('none', 'invited', 'active') THEN
    RAISE EXCEPTION 'Invalid account_status: %', NEW.account_status;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_validate_pos_user_account_status
  BEFORE INSERT OR UPDATE ON public.pos_users
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_pos_user_account_status();
