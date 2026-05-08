# Amwali QA — Seed Specification

> بيئة اختبار ثابتة داخل **نفس قاعدة البيانات** الإنتاجية، معزولة بـ `company_id` (tenant) جديد.
> RLS الموجود يضمن العزل التام عن باقي الشركات.

## المعرّفات الثابتة (Deterministic UUIDs)

لتسهيل إعادة التشغيل، نستخدم UUIDs ثابتة (مولّدة من namespace `amwali-qa`):

| الكيان | UUID مقترح |
|--------|------------|
| Company `Amwali QA` | `00000000-aaaa-0000-0000-000000000001` |
| Branch `رام الله` | `00000000-aaaa-0001-0000-000000000001` |
| Branch `نابلس`    | `00000000-aaaa-0001-0000-000000000002` |

> الـ owner_id للشركة = `auth.uid()` للمستخدم `admin_test` (يُنشأ يدوياً عبر صفحة التسجيل أو edge function `create-team-account`).

## دفعات التنفيذ (نفّذ كل دفعة كـ migration منفصلة)

### Batch 1 — Shell Company + Branches
- INSERT في `companies` (Amwali QA).
- INSERT في `branches` (رام الله، نابلس) مع GPS وهمي.
- لا يوجد RLS impact على باقي الشركات.

### Batch 2 — Auth Users (6 أدوار)
- لا يمكن إنشاء `auth.users` عبر migration عادي.
- الطريقة: استدعاء edge function `create-team-account` مرة لكل دور:
  - `admin_test@amwali.qa` → role `admin`
  - `accountant_test@amwali.qa` → role `accountant_senior`
  - `cashier_test@amwali.qa` → role `cashier`
  - `sales_rep_test@amwali.qa` → role `sales_rep`
  - `hr_manager_test@amwali.qa` → role `hr_manager`
  - `branch_manager_test@amwali.qa` → role `branch_manager` + assignment على رام الله.
- كلمة سر موحدة: `Test@2026!QA` (مخزّنة فقط في `qa/test-data/credentials.local.md` غير مرفوع).

### Batch 3 — Chart of Accounts
- استخدم seed function الموجود `seed_default_chart_of_accounts(company_user_id)` إن وُجد.
- وإلا، انسخ الـ 22 حساب المحمي من شركة قائمة عبر `INSERT ... SELECT`.
- تحقق: `SELECT account_code FROM accounts WHERE user_id = '<qa>' AND is_system_protected ORDER BY account_code;`

### Batch 4 — Contacts (عملاء + موردين)
| Type | Name | Linked Account |
|------|------|----------------|
| customer | عميل نقدي     | 1130-CASH |
| customer | عميل آجل       | 1130-CREDIT |
| customer | عميل VIP       | 1130-VIP |
| supplier | مورد مواد غذائية | 2110-FOOD |
| supplier | مورد إلكترونيات   | 2110-ELEC |

### Batch 5 — Products
| Name | Type | VAT | Stock | Notes |
|------|------|-----|-------|-------|
| Pepsi | inventory | 16% | yes | basic stock item |
| Water | inventory | 0% | yes | tax-exempt |
| Service-Cleaning | service | 16% | no | service item |
| Laptop-SN | inventory | 16% | yes (serial) | serialized |
| Stock-Negative-Test | inventory | 16% | allow negative | edge case |

### Batch 6 — Opening Balances
- صندوق رام الله: 1000 ILS.
- بنك: 5000 ILS.
- مخزون افتتاحي: Pepsi=100, Water=50, Laptop-SN=10.
- قيد افتتاحي متوازن مقابل `3110 — Opening Balances`.

## التحقق النهائي بعد كل Batch

```sql
-- Trial Balance لشركة QA يجب أن يكون متوازناً
SELECT
  SUM(CASE WHEN side='debit'  THEN amount ELSE 0 END) AS dr,
  SUM(CASE WHEN side='credit' THEN amount ELSE 0 END) AS cr
FROM journal_lines jl
JOIN transactions t ON t.id = jl.transaction_id
WHERE t.user_id = '<amwali_qa_owner>' AND COALESCE(t.is_deleted, false) = false;
```

## Cleanup / Reset

لإعادة البيئة لحالتها الأولى:

```sql
-- Soft delete جميع المعاملات
UPDATE transactions SET is_deleted = true WHERE user_id = '<amwali_qa_owner>';
-- (لا تحذف Company/Branches/COA — هذه seed دائم)
```

سكربت `qa/test-data/reset.sql` سيتم بناؤه في Batch 6.