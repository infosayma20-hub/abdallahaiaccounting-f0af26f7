---
name: Delivery Notes — Internal vs External + DB Stock Triggers
description: Sales delivery notes refactor — external (customer, convertible to invoice) vs internal (warehouse-to-warehouse, no invoice). Stock movements via DB triggers, atomic RPC for invoice conversion, full FinanceShell UI.
type: feature
---

## النوعان
- **خارجية (`external`)**: للعميل، قابلة للتحويل لفاتورة (`status: draft → issued → converted`)
- **داخلية (`internal`)**: بين المخازن أو لفرع، لا تتحول لفاتورة (`status: draft → issued → received | cancelled`)

## أعمدة `delivery_notes` المضافة
- `delivery_type` (external/internal) — CHECK constraint
- `from_warehouse_id`, `to_warehouse_id`, `to_branch_id` — للداخلية مطلوب from + (to_warehouse_id أو to_branch_id)
- `stock_movements_created` — flag للتتبع
- `received_at`, `cancelled_at`
- CHECK: للداخلية `from_warehouse_id IS NOT NULL` ولا يساوي `to_warehouse_id`

## خصم المخزون (DB Triggers — ليس Frontend)
- `trg_delivery_notes_stock_sync` → AFTER INSERT/UPDATE/DELETE
- `draft → issued`: ينشئ حركات `صادر` من `from_warehouse_id` مع `reference_type='delivery_note'` + `reference_id`
- `issued → received` (داخلية): ينشئ حركات `وارد` لـ `to_warehouse_id`
- `→ cancelled`: يمسح كل الحركات (إعادة المخزون)
- `DELETE`: يمسح كل الحركات قبل الحذف

## التحويل لفاتورة — RPC آمن
- `convert_delivery_note_to_invoice(p_delivery_note_id uuid) RETURNS uuid` — SECURITY DEFINER
- يرفض الإرساليات الداخلية
- يرفض الإرساليات `converted` (محوّلة مسبقاً)
- ينشئ الفاتورة بـ `source_delivery_note_id = note.id`
- **منع double-deduction**: `sync_invoice_item_stock` يتخطّى الخصم إذا `source_delivery_note_id IS NOT NULL`

## حماية التحرير (DB-side)
- `trg_protect_delivery_notes` (BEFORE UPDATE/DELETE)
- لا يمكن حذف `converted`
- لا يمكن تغيير `delivery_type` بعد الإصدار
- لا يمكن تراجع من `converted`

## الواجهة (FinanceShell)
- `/delivery-notes` — قائمة بـ FinanceShell + فلاتر D365 + عمود نوع
- `/delivery-notes/new?type=external|internal` — إنشاء
- `/delivery-notes/:id` — تعديل (`isReadOnly = status !== 'draft'`)
- Action Pane: جديد / حفظ (مع إصدار/تحويل/استلام/إلغاء/حذف) / عرض (معاينة + طباعة) / تنقل (السابق/التالي/استعلام)
- Segmented Type Select في الإنشاء فقط (لا يُعرض في التعديل لأنه ثابت بعد الإصدار)

## Print View
- `deliveryType` يبدّل العنوان: "وثيقة تسليم بضاعة" ↔ "إذن نقل داخلي"
- الداخلية تعرض `fromWarehouseName` و `toWarehouseName`/`toBranchName` بدل العميل
- بدون أسعار في كلا النوعين (وثيقة لوجستية)

## ترقيم
- نفس `DN-YYYY-NNNN` للنوعين عبر `next_doc_number(user, 'delivery_note', year)` — atomic
- يمكن لاحقاً فصل ترقيم الداخلية إذا لزم

## قيود محاسبية
- لا قيود محاسبية للإرساليات (وثيقة لوجستية)
- القيود تُنشأ فقط عند تفعيل الفاتورة المحوّلة