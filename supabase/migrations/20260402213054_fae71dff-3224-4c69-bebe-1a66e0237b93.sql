
-- Add Input VAT account 1180 for all users
INSERT INTO accounts (user_id, account_code, account_name, account_type, nature, is_system, is_active, parent_code, description_ar)
SELECT DISTINCT user_id, '1180', 'ضريبة القيمة المضافة - مدخلات', 'أصول', 'debit', true, true, NULL,
  'ضريبة القيمة المضافة المدفوعة على فواتير المشتريات — قابلة للخصم من ضريبة المخرجات وفق القانون الفلسطيني رقم 26 لسنة 2024'
FROM accounts
WHERE account_code = '1110'
  AND NOT EXISTS (SELECT 1 FROM accounts a2 WHERE a2.user_id = accounts.user_id AND a2.account_code = '1180');

-- Add Output VAT account 2190 for all users
INSERT INTO accounts (user_id, account_code, account_name, account_type, nature, is_system, is_active, parent_code, description_ar)
SELECT DISTINCT user_id, '2190', 'ضريبة القيمة المضافة - مخرجات', 'خصوم', 'credit', true, true, NULL,
  'ضريبة القيمة المضافة المحصّلة على فواتير المبيعات — مستحقة الدفع لوزارة المالية وفق القانون الفلسطيني رقم 26 لسنة 2024'
FROM accounts
WHERE account_code = '1110'
  AND NOT EXISTS (SELECT 1 FROM accounts a2 WHERE a2.user_id = accounts.user_id AND a2.account_code = '2190');

-- Update tax_settings defaults
ALTER TABLE tax_settings ALTER COLUMN output_tax_account_code SET DEFAULT '2190';
ALTER TABLE tax_settings ALTER COLUMN input_tax_account_code SET DEFAULT '1180';

-- Update existing tax_settings that still have old codes
UPDATE tax_settings SET output_tax_account_code = '2190' WHERE output_tax_account_code = '2141';
UPDATE tax_settings SET input_tax_account_code = '1180' WHERE input_tax_account_code IN ('1441', '1145');
