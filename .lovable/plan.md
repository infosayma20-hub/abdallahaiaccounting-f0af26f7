
# خطة: تعديل طلبيات المندوبين بصلاحية إدارية

## 1. الصلاحيات والمسارات

- **الأدمن:** يعدّل أي فاتورة مندوب مباشرة من شاشة الفاتورة في لوحة الإدارة.
- **المندوب نفسه:** يقدّم **طلب تعديل** على فاتورته من شاشة /rep/orders، ولا يُنفَّذ التعديل إلا بعد موافقة الأدمن.
- أي دور آخر (محاسب، كاشير...) لا يرى زر "تعديل" على فواتير مصدرها `rep`.

## 2. سير العمل (Workflow)

```text
[المندوب] ──يطلب تعديل──▶ rep_edit_requests (pending)
                              │
                              ▼
                  [إشعار للأدمن في الجرس]
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
        [موافقة]                          [رفض]
              │                               │
              ▼                               ▼
   apply_rep_invoice_edit RPC          status=rejected
   (Delete & Recreate ذرّي)            + سبب الرفض
              │                               │
              ▼                               ▼
   [إشعار للمندوب: تم/رُفض] ◀──────────────────┘
```

أما الأدمن فيستطيع تخطّي خطوة الطلب وتنفيذ التعديل مباشرة (يُكتب الطلب والموافقة تلقائياً باسمه للحفاظ على وحدة السجل).

## 3. نطاق التعديل المسموح

- استبدال صنف بصنف آخر داخل نفس البند.
- تعديل الكمية و/أو سعر الوحدة.
- إضافة بنود جديدة.
- حذف بنود قائمة.

**ممنوع في هذه المرحلة:** تغيير العميل، طريقة الدفع (نقد/آجل)، التاريخ، أو رقم الفاتورة. هذه تتطلب Credit Note وفاتورة جديدة وتُعالَج لاحقاً.

## 4. آلية التنفيذ المحاسبية: Delete & Recreate ذرّي

داخل معاملة DB واحدة (`apply_rep_invoice_edit`):

1. **التحقق من القفل:** الفترة المالية مفتوحة + الفاتورة `is_voided=false` + `linked_transaction_id IS NOT NULL`.
2. **لقطة "قبل":** نسخ صفوف `invoices` + `invoice_items` + `stock_movements` + `transactions` + `voucher_lines` كاملةً إلى `rep_edit_audit` (JSONB).
3. **عكس الأثر القديم:**
   - حذف كل `voucher_lines` التابعة لـ `linked_transaction_id`.
   - حذف رأس `transactions`.
   - حذف كل `stock_movements` للفاتورة + إرجاع الكميات إلى `products.quantity`.
   - حذف `receipt_vouchers` التلقائية للبيع النقدي إن وُجدت.
4. **حذف البنود القديمة:** `DELETE FROM invoice_items WHERE invoice_id = ?`.
5. **إنشاء البنود الجديدة:** insert صفوف جديدة بقيم `cost_price` و `line_profit` المحدّثة من `products.buy_price`.
6. **إعادة احتساب الإجمالي** وتحديث `invoices` (نفس `id` ونفس `invoice_number`).
7. **إعادة بناء الأثر:** استدعاء نفس منطق `create_rep_sale_atomic`:
   - قيد جديد في `transactions` + `voucher_lines` وربطه بـ `invoices.linked_transaction_id`.
   - `stock_movements` جديدة + خصم/زيادة `products.quantity`.
   - سند قبض جديد إن كانت `cash` (مع إلغاء/استبدال السند القديم).
8. **لقطة "بعد":** تخزينها بنفس صف `rep_edit_audit`.

## 5. المخطط (Schema)

### جدول `rep_edit_requests`
- `invoice_id` (FK invoices)
- `requested_by` (المندوب user_id)
- `reason` NOT NULL
- `proposed_changes` JSONB (شكل البنود الجديد كامل)
- `status` enum: `pending | approved | rejected`
- `reviewed_by` / `reviewed_at` / `review_note`

### جدول `rep_edit_audit`
- `invoice_id`
- `edit_request_id` (FK)
- `edited_by`
- `reason`
- `before_snapshot` JSONB (رأس + بنود + قيد + حركات)
- `after_snapshot` JSONB
- `diff` JSONB محسوب (للحقول المتغيرة فقط)

### RPC جديدة
- `request_rep_invoice_edit(invoice_id, reason, proposed_items)` — للمندوب.
- `apply_rep_invoice_edit(edit_request_id)` — للأدمن، تُنفّذ منطق Delete & Recreate.
- `reject_rep_invoice_edit(edit_request_id, note)` — للأدمن.

### RLS
- المندوب يرى/ينشئ طلباته فقط على فواتيره فقط.
- الأدمن يرى الكل، وحده يستدعي `apply_*` و `reject_*` (CHECK داخل الـ RPC).

## 6. الواجهة (UI)

- **شاشة المندوب** `/rep/orders/:id`: زر "طلب تعديل" يفتح Modal بنفس واجهة الطلب الجديد لكن محمّلة بالبنود الحالية + حقل سبب إلزامي.
- **شاشة الأدمن** صفحة جديدة `/admin/rep-edit-requests`: قائمة الطلبات المعلّقة + Modal مقارنة (قبل/بعد) + زرّا "موافقة" و"رفض".
- **شاشة الفاتورة في لوحة الإدارة**: زر "تعديل مباشر" (للأدمن فقط) يفتح نفس الـ Modal ويستدعي مسار Auto-Approve.
- **سجل الفاتورة**: تبويب جديد "سجل التعديلات" يعرض `rep_edit_audit` (من، متى، السبب، قبل/بعد لكل حقل متغيّر).

## 7. الإشعارات

- عند `pending`: إشعار للأدمن (admin_notifications).
- عند `approved` / `rejected`: إشعار للمندوب (notification_log) مع رابط الفاتورة.

## 8. حماية وضوابط

- الفترة المالية المغلقة ترفض التعديل (نستفيد من `fiscal-period-db-guard` القائم).
- فاتورة ملغاة/مرتجعة لا تقبل تعديل.
- قفل تفاؤلي بـ `updated_at` لمنع تعديلين متزامنين.
- أي خطأ داخل الـ RPC → rollback كامل (الفاتورة تبقى كما كانت).

## 9. مراحل التنفيذ

1. Migration: الجدولان + الـ enums + الـ RLS + GRANTs.
2. RPC: `request_rep_invoice_edit` و `reject_rep_invoice_edit`.
3. RPC: `apply_rep_invoice_edit` (الأثقل — Delete & Recreate).
4. UI المندوب: زر "طلب تعديل" + Modal.
5. UI الأدمن: صفحة الطلبات + Modal المقارنة + زر "تعديل مباشر".
6. تبويب "سجل التعديلات" في الفاتورة.
7. الإشعارات.
8. اختبارات: نقد، آجل، استبدال صنف، تغيير كمية، حذف بند، إضافة بند، فترة مغلقة، عميل آخر يحاول.

---

هل نمشي بهذه الخطة، أم تحب أعدّل أي نقطة قبل ما أبدأ التنفيذ؟
