-- =====================================================================
-- Amwali QA Testing System — Batch 3 of 6
-- Purpose: Seed Chart of Accounts for QA tenant ONLY.
-- Scope: user_id = '00000000-aaaa-0000-0000-0000000000ad' (Amwali QA)
-- Safety:
--   * Idempotent via ON CONFLICT (user_id, account_code) DO NOTHING
--   * No RLS / triggers / RPCs / schema changes
--   * No backfill, no edits to existing rows
--   * Production tenants are NOT touched
-- =====================================================================

INSERT INTO public.accounts (
  user_id, account_code, account_name, account_type,
  parent_code, nature, is_system_protected, system_role, is_active
) VALUES
  -- ===== ASSETS (1xxx) =====
  ('00000000-aaaa-0000-0000-0000000000ad','1100','الأصول المتداولة','أصول',NULL,'debit',true,NULL,true),
  ('00000000-aaaa-0000-0000-0000000000ad','1110','الصندوق','أصول','1100','debit',true,'cash',true),
  ('00000000-aaaa-0000-0000-0000000000ad','1120','البنك','أصول','1100','debit',true,'bank',true),
  ('00000000-aaaa-0000-0000-0000000000ad','1130','ذمم عملاء','أصول','1100','debit',true,'ar',true),
  ('00000000-aaaa-0000-0000-0000000000ad','1140','المخزون','أصول','1100','debit',true,'inventory',true),
  ('00000000-aaaa-0000-0000-0000000000ad','1145','ضريبة القيمة المضافة - مدخلات','أصول','1100','debit',false,NULL,true),
  ('00000000-aaaa-0000-0000-0000000000ad','1150','شيكات واردة','أصول','1100','debit',false,NULL,true),

  -- ===== LIABILITIES (2xxx) =====
  ('00000000-aaaa-0000-0000-0000000000ad','2100','الخصوم المتداولة','خصوم',NULL,'credit',true,NULL,true),
  ('00000000-aaaa-0000-0000-0000000000ad','2110','ذمم موردين','خصوم','2100','credit',true,'ap',true),
  ('00000000-aaaa-0000-0000-0000000000ad','2120','شيكات صادرة','خصوم','2100','credit',false,NULL,true),
  ('00000000-aaaa-0000-0000-0000000000ad','2130','الرواتب المستحقة','خصوم','2100','credit',true,'salaries_payable',true),
  ('00000000-aaaa-0000-0000-0000000000ad','2140','الضرائب المستحقة','خصوم','2100','credit',true,'vat_payable',true),
  ('00000000-aaaa-0000-0000-0000000000ad','2190','ضريبة القيمة المضافة - مخرجات','خصوم','2100','credit',true,'vat_output',true),

  -- ===== EQUITY (3xxx) =====
  ('00000000-aaaa-0000-0000-0000000000ad','3100','رأس المال','حقوق ملكية',NULL,'credit',true,'capital',true),
  ('00000000-aaaa-0000-0000-0000000000ad','3200','أرباح محتجزة','حقوق ملكية',NULL,'credit',true,'retained_earnings',true),
  ('00000000-aaaa-0000-0000-0000000000ad','3300','الأرباح والخسائر','حقوق ملكية',NULL,'credit',true,'pnl',true),
  ('00000000-aaaa-0000-0000-0000000000ad','3400','أرصدة افتتاحية','حقوق ملكية',NULL,'credit',true,'opening_balance',true),

  -- ===== REVENUE (4xxx) =====
  ('00000000-aaaa-0000-0000-0000000000ad','4100','إيرادات مبيعات','إيرادات',NULL,'credit',true,'sales_revenue',true),
  ('00000000-aaaa-0000-0000-0000000000ad','4150','مردودات المبيعات','إيرادات','4100','credit',true,'sales_returns',true),

  -- ===== COST OF SALES (5xxx) =====
  ('00000000-aaaa-0000-0000-0000000000ad','5100','تكلفة البضاعة المباعة','مشتريات',NULL,'debit',true,'cogs',true),
  ('00000000-aaaa-0000-0000-0000000000ad','5110','المشتريات','مشتريات','5100','debit',false,NULL,true),
  ('00000000-aaaa-0000-0000-0000000000ad','5160','مردودات المشتريات','مشتريات','5100','debit',false,NULL,true),

  -- ===== EXPENSES (6xxx) =====
  ('00000000-aaaa-0000-0000-0000000000ad','6100','مصاريف عامة','مصاريف',NULL,'debit',false,NULL,true)
ON CONFLICT (user_id, account_code) DO NOTHING;