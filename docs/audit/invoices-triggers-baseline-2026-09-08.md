# خط الأساس لمشغّلات جدول الفواتير — 2026-09-08

مرجع التراجع لخطة «ترتيب بناء الفواتير». أي مرحلة بتفشل، بنرجع من هون.

## جرد الأرقام قبل أي تعديل

| النوع | العدد | ناقص رقم |
|---|---|---|
| sale | 2073 | 0 |
| purchase | 1529 | 0 |
| debit_note | 22 | 0 |
| credit_note | 8 | 0 |

- بطاقات كفالة مكررة على نفس البند: **0**.
- ملاحظة: ضمن `sale` توجد أرقام ببادئات قديمة/اختبارية (`DN-`, `TEST-PHASE7-...`) وضمن `purchase` أرقام ببادئة `INV-` و`PO-VAL-001`. المرحلة 2 لازم تتجاهل أي رقم ما بينطبق عليه نمط `PREFIX-YYYY-NNNN`.

## المشغّلات العشرة — الحالة الأصلية

| المشغّل الأصلي | التوقيت | الدالة |
|---|---|---|
| `trg_auto_tag_invoice_van_warehouse` | BEFORE INSERT | `auto_tag_invoice_van_warehouse()` |
| `trg_generate_invoice_number` | BEFORE INSERT | `generate_invoice_number()` |
| `trg_guard_rep_invoice` | BEFORE INSERT OR UPDATE OF source, linked_transaction_id | `guard_rep_invoice_must_be_posted()` |
| `trg_scope_invoices` | BEFORE INSERT OR UPDATE | `enforce_user_warehouse_scope('warehouse_id')` |
| `trg_invoices_feature_perm` | BEFORE DELETE OR UPDATE OF status | `enforce_feature_perm_invoices()` |
| `trg_invoice_tax_ledger` | AFTER INSERT OR UPDATE OF tax_amount, status | `fn_invoice_tax_ledger()` |
| `trg_auto_create_warranty_cards_insert` | AFTER INSERT | `auto_create_warranty_cards_on_invoice_insert()` |
| `trg_auto_create_warranty_cards` | AFTER UPDATE | `auto_create_warranty_cards_on_invoice()` |
| `trg_invoice_warehouse_relocate_movements` | AFTER UPDATE OF warehouse_id | `tg_invoice_warehouse_relocate_movements()` |
| `trg_cascade_invoice_cancel` | AFTER UPDATE OF status WHEN status changed | `cascade_invoice_cancel_to_transactions()` |

ترتيب التنفيذ في Postgres أبجدي داخل نفس التوقيت — أي أنه كان **بالصدفة** لا بالتصميم.

## المرحلة 1 — أمر التراجع

إرجاع مشغّل الكفالات عند الإضافة:

```sql
CREATE TRIGGER trg_auto_create_warranty_cards_insert
AFTER INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION auto_create_warranty_cards_on_invoice_insert();
```

الدالة `auto_create_warranty_cards_on_invoice_insert()` تبقى موجودة كما هي (لم تُحذف)، فالتراجع سطر واحد.

## المرحلة 3 — خريطة إعادة التسمية

| الاسم الجديد | الاسم الأصلي |
|---|---|
| `trg_10_invoice_van_warehouse` | `trg_auto_tag_invoice_van_warehouse` |
| `trg_20_invoice_warehouse_scope` | `trg_scope_invoices` |
| `trg_30_invoice_guard_rep` | `trg_guard_rep_invoice` |
| `trg_40_invoice_number` | `trg_generate_invoice_number` |
| `trg_50_invoice_feature_perm` | `trg_invoices_feature_perm` |
| `trg_60_invoice_tax_ledger` | `trg_invoice_tax_ledger` |
| `trg_70_invoice_warranty_cards` | `trg_auto_create_warranty_cards` |
| `trg_80_invoice_warehouse_relocate` | `trg_invoice_warehouse_relocate_movements` |
| `trg_90_invoice_cancel_cascade` | `trg_cascade_invoice_cancel` |

التراجع: `ALTER TRIGGER <new> ON public.invoices RENAME TO <old>;`

إعادة التسمية غيّرت ترتيباً واحداً فعلياً وبشكل مقصود: **حصر المستودع صار يعمل بعد تعبئة مستودع سيارة البيع** (كان يعمل بعدها أصلاً بالصدفة الأبجدية، والآن صار مضموناً بالاسم). باقي المشغّلات لا يعتمد أحدها على الآخر.

## المرحلة 2 — التعريف الأصلي لدالة الترقيم

الدالة الأصلية `generate_invoice_number()` تُقرأ من سجل الترحيلات في المشروع، وجوهر مشكلتها:

```sql
SELECT COALESCE(MAX(parts[3]::integer), 0)
INTO v_max_existing
FROM public.invoices i
CROSS JOIN LATERAL regexp_match(i.invoice_number, '^(.*)-([0-9]{4})-([0-9]+)$') AS parts
WHERE i.user_id = NEW.user_id AND i.invoice_type = NEW.invoice_type ...
```

مسح كامل + regex لكل فاتورة، في كل عملية إدخال. هذا ما ستستبدله المرحلة 2 بقراءة صف واحد من `invoice_sequences`.
