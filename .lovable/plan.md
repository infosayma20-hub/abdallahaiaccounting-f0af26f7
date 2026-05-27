
## ملاحظات بعد التحقق من الإنتاج

- **لا يوجد `journal_lines`** — الدفتر الفعلي هو `transactions` (مؤكد ✅).
- `cost_centers` **موجود فعلاً** (فارغ، بنية كاملة، ينقصه SELECT policy + GRANT) → نستخدم `ALTER TABLE IF EXISTS` ونكمل.
- الاسم الفعلي للأبعاد هو `transaction_dimensions` (لا يوجد جدول باسم `transaction_financial_dimensions`) → نستخدم الموجود كما طلبت.
- `vouchers` يحوي `workshop_id` بالفعل (نفس النمط نتبعه لـ `cost_center_id`).
- توقيعات الـ RPCs الحالية مؤكدة:
  - `create_receipt_with_entry(...17 args)` بدون `p_cost_center_id`
  - `create_payment_with_entry(...17 args)` بدون `p_cost_center_id`
  - `create_journal_entry_multi_party_atomic(...10 args)` بدون `p_cost_center_id`
  - `update_voucher_atomic(...20 args)` بدون `p_cost_center_id`

---

## المرحلة 1 — Migration آمن (هذه الجلسة، طلب موافقتك)

### 1.أ — إكمال `cost_centers`
```sql
ALTER TABLE IF EXISTS public.cost_centers ADD COLUMN IF NOT EXISTS notes text;
-- SELECT policy المفقودة:
CREATE POLICY IF NOT EXISTS "Users view own cost centers" ON public.cost_centers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- GRANTs:
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT ALL ON public.cost_centers TO service_role;
-- فهارس إضافية:
CREATE INDEX IF NOT EXISTS idx_cost_centers_active ON public.cost_centers(user_id, is_active) WHERE is_deleted = false;
```
**لا `company_id`**. نبقى على `user_id` فقط.

### 1.ب — إضافة `cost_center_id` إلى الجداول الفعلية (كلها nullable)
```sql
ALTER TABLE public.transactions   ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
ALTER TABLE public.vouchers       ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
ALTER TABLE public.voucher_lines  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
ALTER TABLE public.invoices       ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
ALTER TABLE public.invoice_items  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_cc  ON public.transactions(cost_center_id)  WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vouchers_cc      ON public.vouchers(cost_center_id)      WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voucher_lines_cc ON public.voucher_lines(cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_cc      ON public.invoices(cost_center_id)      WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_items_cc ON public.invoice_items(cost_center_id) WHERE cost_center_id IS NOT NULL;
```
**لا triggers على `transactions`**. الترحيل يمر فقط من خلال RPCs.

### 1.ج — حماية الحذف
Trigger `BEFORE DELETE` على `cost_centers` يمنع الحذف إذا له أي حركة في `transactions`/`vouchers`/`invoices`. الحل: تعطيل (`is_active = false`) بدل الحذف.

### 1.د — تحديث الـ RPCs (إضافة `p_cost_center_id`)
- `create_receipt_with_entry(...17 + p_cost_center_id uuid DEFAULT NULL)` — يكتب `cost_center_id` في `vouchers` و`transactions` الناتجة.
- `create_payment_with_entry(...نفس الشيء)`.
- `create_journal_entry_multi_party_atomic(...10 + p_cost_center_id uuid DEFAULT NULL)`:
  - مستوى السند: من المعامل العام.
  - **مستوى السطر**: كل عنصر داخل `p_lines` يدعم مفتاح `cost_center_id` اختياري يتجاوز العام.
- `update_voucher_atomic(...20 + p_cost_center_id uuid DEFAULT NULL)` — لكل سطر داخل `p_journal_lines` نفس المفتاح.

**كل الـ DEFAULT NULL** → backward compatible. السطور بدون مركز تبقى تعمل، الحركات القديمة تظهر "بدون مركز تكلفة".

### 1.هـ — جدول `transaction_dimensions` (الموجود) يبقى كما هو
لا نلمسه الآن. التكرار سيكون مستقبلاً عند الحاجة لأبعاد متعددة (project, segment…). حالياً مركز التكلفة يعيش كحقل مباشر على الحركة + اختياري في `transaction_dimensions` لاحقاً (Phase منفصل).

---

## المرحلة 2 — شاشة إدارة مراكز التكلفة

`src/pages/CostCentersPage.tsx` على `/finance/cost-centers`:
- شجرة هرمية (parent_id) + جدول/بطاقات
- أعمدة: الكود، الاسم، النوع، المسؤول، الفرع، الحالة، عدد الحركات (count من transactions)
- أزرار: جديد، تعديل (Dialog)، تفعيل/إيقاف، حذف (محمي بالـ trigger)
- بحث + فلاتر (نوع، حالة، فرع)
- إضافة بطاقة "مراكز التكلفة" في `AccountingCenterPage` مع `Alt+C` لاحقاً

مكوّنات:
- `src/components/cost-centers/CostCenterCombobox.tsx`
- `src/components/cost-centers/CostCenterTree.tsx`
- `src/components/cost-centers/CostCenterFormDialog.tsx`
- `src/hooks/useCostCenters.ts`

---

## المرحلة 3 — ربط سند القيد/القبض/الصرف

`VoucherFormPage`:
- حقل `CostCenterCombobox` رأس السند (يُمرَّر إلى الـ RPC عبر `p_cost_center_id`)
- سند القيد متعدد السطور: عمود إضافي في الجدول لاختيار مركز التكلفة لكل سطر (يتجاوز الرأس)
- Flag-gated مع `vouchers_use_rpc` (نفس آلية Phase 5C/5D/5E): عندما يكون OFF نمرّر `cost_center_id` مباشرة في الـ INSERT للـ legacy path أيضاً (آمن لأن العمود nullable).
- لا تحقق إلزامي في هذه المرحلة (سنضيف `cost_center_rules` في مرحلة لاحقة).

---

## ما لن نلمسه الآن

- الفواتير ومردوداتها (مرحلة 4)
- المخزون والرواتب والورش (مرحلة 7) — مع ملاحظة أن `workshops` لها حالياً نظام مستقل، الربط سيكون `workshops.cost_center_id` لاحقاً
- التقارير الجديدة (مرحلة 6) — بعد التأكد من سلامة الترحيل والبيانات
- قواعد الإلزام `cost_center_rules` (مرحلة 8)
- `transaction_dimensions` كنظام أبعاد متعددة

---

## ملخص ما سيتم في هذه الجلسة

1. Migration (1.أ → 1.د) — طلب موافقتك قبل التنفيذ
2. `CostCentersPage` + المكوّنات + الربط في `AccountingCenterPage`
3. `CostCenterCombobox` داخل `VoucherFormPage` (رأس + سطر للقيد)

هل أبدأ بالـ Migration؟
