---
name: Invoice Cancel — Stock & Journal Reversal
description: عند إلغاء فاتورة (مبيعات/مشتريات) يتم عكس القيد + حركات المخزون + تحديث products.quantity
type: feature
---

# دورة إلغاء الفاتورة الكاملة

عند تغيير `invoices.status` إلى `cancelled`، تريغر `trg_cascade_invoice_cancel` ينفّذ:
1. **القيد العكسي**: `create_reverse_entry(linked_transaction_id)` → قيد reversal مكافئ ومعاكس (يصفّر رصيد المورد/العميل).
2. **عكس المخزون**: `reverse_invoice_stock(invoice_id)` → يُدرج حركات `invoice_void` معاكسة لكل حركة أصلية ويُعدّل `products.quantity` مباشرة.
3. **مزامنة `is_voided`/`voided_at`/`void_reason`**.

## قواعد المطابقة في `reverse_invoice_stock`
تطابق الحركات الأصلية عبر:
- `reference_id = invoice_id AND reference_type = 'invoice'` (المسار الصحيح)، **أو**
- Fallback: `reference_id IS NULL AND reference_note ILIKE '%invoice_number%'` (للحركات القديمة من قبل ربط reference_id بالواجهة)

Idempotent عبر `notes = 'reverse_of:<original_id>'`.

## قواعد للواجهة (InvoiceCreatePage)
- كل `stock_movements.insert` يجب أن يحمل `reference_type='invoice'` و `reference_id=invoice.id` (للإنشاء والتعديل).
- `products.quantity` يُحدَّث مباشرة من الواجهة عند الإنشاء/التعديل — `reverse_invoice_stock` تتكفّل بإرجاعه عند الإلغاء.

## فحص دوري
```sql
-- فواتير ملغاة بحركات مخزون غير معكوسة
SELECT i.user_id, i.invoice_number FROM invoices i
WHERE (i.is_voided OR i.status IN ('cancelled','void'))
  AND EXISTS (SELECT 1 FROM stock_movements sm WHERE
    ((sm.reference_id=i.id AND sm.reference_type='invoice')
     OR (sm.reference_id IS NULL AND sm.reference_note ILIKE '%'||i.invoice_number||'%'))
    AND NOT EXISTS (SELECT 1 FROM stock_movements rv
      WHERE rv.reference_id=i.id AND rv.reference_type='invoice_void'
        AND rv.notes='reverse_of:'||sm.id::text));
```