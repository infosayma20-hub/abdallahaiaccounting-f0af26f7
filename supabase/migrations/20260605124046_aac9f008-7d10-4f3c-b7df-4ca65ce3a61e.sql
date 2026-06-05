UPDATE public.products
SET category = 'بروست مشوي'
WHERE user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73'
  AND category = 'وجبات فردية'
  AND name ILIKE '%مشوي%';