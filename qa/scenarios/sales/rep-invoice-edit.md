# QA — تعديل فاتورة مندوب بصلاحية إدارية

## الحساب التجريبي
- المندوب: `jamal@lion.com` (sales_rep_id `d9df6f8d-b0d8-4243-9823-711c48c7821a`, auth `a0e3475b-91cb-439d-96ad-e9bb9f06fe15`)
- التينانت: `6fb346d9-f8a6-44a7-a99c-fd2b440f6060`
- لا يوجد Feature Flag إضافي. الصلاحية مفتوحة تلقائياً لأن `sales_representatives.auth_user_id` معبأ ومطابق لمستخدم Jamal، وهذا هو الشرط الوحيد في `request_rep_invoice_edit`.

## مسار التدفق المُدقّق

```text
[Rep UI] /rep/orders
   └─ RepOrderRow (posted, !is_voided) ──onEdit──> RepEditRequestDialog
        └─ rpc: request_rep_invoice_edit(p_invoice_id, p_reason, p_proposed_items)
             ├─ يتحقق: auth.uid() = sales_representatives.auth_user_id
             ├─ يتحقق: invoices.source='rep' AND NOT is_voided AND linked_transaction_id NOT NULL
             ├─ يمنع طلباً ثانياً pending لنفس الفاتورة
             ├─ INSERT rep_edit_requests + original_snapshot عبر build_invoice_snapshot
             └─ INSERT admin_notifications (event_type='rep_edit_request', metadata jsonb)

[Admin UI] /admin/rep-edit-requests (RoleGuard: admin)
   ├─ موافقة → rpc: apply_rep_invoice_edit(p_request_id)
   │     ├─ FOR UPDATE على request + invoice
   │     ├─ before := build_invoice_snapshot()
   │     ├─ void_rep_sale_atomic() → عكس القيد + استرجاع المخزون
   │     ├─ إعادة تسمية رقم الفاتورة القديم بـ "-VOIDED-yyyymmddhhmiss"
   │     ├─ create_rep_sale_atomic(... نفس invoice_number الأصلي ...)
   │     ├─ after := build_invoice_snapshot(new_id)
   │     ├─ INSERT rep_edit_audit (before/after)
   │     ├─ UPDATE request → approved + new_invoice_id
   │     └─ notification_log → 'rep_edit_approved'
   └─ رفض → rpc: reject_rep_invoice_edit(p_request_id, p_note)
         ├─ UPDATE request → rejected + review_note
         └─ notification_log → 'rep_edit_rejected'
```

## نتائج التدقيق
| فحص | النتيجة |
|---|---|
| تطابق أعمدة `admin_notifications` (event_type/metadata) | مصلح |
| تطابق أعمدة `notification_log` (title/body/path) | مصلح (كان message/metadata) |
| تطابق توقيع `create_rep_sale_atomic` 9-args بالأسماء | مطابق |
| تطابق توقيع `void_rep_sale_atomic(uuid, text)` | مطابق |
| استخدام `auth_user_id` على `sales_representatives` | صحيح |
| `contact_name` على `invoices` (لا `customer_name`) | صحيح |
| RLS على `rep_edit_requests` و `rep_edit_audit` + GRANT | مطبق |
| إخفاء زر "تعديل" على cancelled/draft في RepOrdersPage | مطبق |
| منع طلبين pending متزامنين | مطبق |
| تغليف الإشعار بـ EXCEPTION حتى لا يكسر الـ RPC | مطبق |
| Emojis في كود/UI/migrations الخاصة بالميزة | لا يوجد |

## سيناريوهات الاختبار

### S1 — استبدال صنف بصنف آخر (نقد)
المندوب يفتح /rep/orders، فاتورة posted نقدية، يحذف L0250 ويضيف L0525 بكمية 10 وسعر 25. بعد موافقة الأدمن:
- فاتورة جديدة بنفس `invoice_number` الأصلي.
- القديمة `is_voided=true` ورقمها يحمل `-VOIDED-...`.
- `voucher_lines` متوازن (D=C).
- `stock_movements`: حركة عكسية للقديم + حركة جديدة.
- لو نقد: سند قبض قديم مُعكَس + سند جديد بقيمة 250.
- `rep_edit_audit` يحوي before و after.

### S2 — تعديل كمية فقط (آجل)
دون تغيير الأصناف. AR على 1130 يعكس الفرق فقط بعد التسوية.

### S3 — حذف بند
بنود الجديدة أقل، الإجمالي ينخفض، المخزون يُسترجع للأصناف المحذوفة.

### S4 — رفض الطلب
سبب >= 3 حروف → الطلب rejected، الفاتورة الأصلية بلا تغيير محاسبي، إشعار للمندوب.

### S5 — حالات حد
- طلب pending مكرر: "يوجد طلب تعديل قيد المراجعة".
- فاتورة ملغاة سابقاً: "لا يمكن تعديل فاتورة ملغاة".
- مندوب يحاول فاتورة ليست له: "هذه ليست فاتورتك".
- مستخدم غير admin يستدعي apply: "صلاحية مرفوضة".

## Reconciliation
- Trial Balance قبل/بعد متطابقان إذا الإجمالي لم يتغير. وإلا الفرق = (new − old) ينعكس على (1110/1120 أو 1130) مقابل (4110 + 2150 VAT).
- `SUM(stock_movements.qty) per product` يطابق `products.quantity`.
- لا يوجد `voucher_lines` يتيمة.
