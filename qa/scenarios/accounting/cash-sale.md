# Cash Sale — End-to-End

> سيناريو ذهبي رقم #1 — حجر الأساس لكل النظام.

## الهدف

اختبار دورة البيع النقدي كاملة من فتح الصندوق حتى ترحيل القيد،
والتأكد من أن **الأثر المحاسبي والمخزني صحيح ومتوازن**.

## البيئة (Amwali QA)

| العنصر | القيمة |
|--------|--------|
| Company | `Amwali QA` |
| Branch | `رام الله` |
| User | `cashier_test` |
| Customer | `عميل نقدي` |
| Item | `Pepsi` (صنف مخزون، خاضع للضريبة 16%) |
| Qty | `2` |
| Unit Price | `10.00 ILS` (شامل/غير شامل — حسب إعداد الشركة) |

## الخطوات (Steps)

1. تسجيل دخول كـ `cashier_test`.
2. فتح وردية POS على فرع رام الله (تسجيل رصيد افتتاحي = 0).
3. إنشاء فاتورة بيع نقدية:
   - اختيار العميل: `عميل نقدي`.
   - إضافة صنف `Pepsi` × 2.
4. الدفع نقداً (Cash).
5. ترحيل الفاتورة (Post).
6. طباعة الفاتورة (تحقق فقط من نجاح الاستدعاء، ليس مطلوب طباعة فعلية).
7. فحص القيد المحاسبي المرتبط (`transactions` + `journal_entries`).

## البيانات المتوقعة (افتراض VAT = 16%, السعر غير شامل)

- Subtotal: `20.00`
- VAT (Output): `3.20`
- Total: `23.20`
- COGS (افترض تكلفة 6.00/وحدة): `12.00`

## Expected Effects

### القيد المحاسبي (Journal)

| Account | Debit | Credit |
|---------|-------|--------|
| 1110 — Cash (الصندوق) | 23.20 | — |
| 4xxx — Sales Revenue | — | 20.00 |
| 2xxx — VAT Output | — | 3.20 |
| 5xxx — COGS | 12.00 | — |
| 1140 — Inventory | — | 12.00 |

**Invariant:** `SUM(Debit) = SUM(Credit) = 35.20`

### المخزون (`stock_movements`)

- حركة `OUT` بكمية `2` للصنف `Pepsi` على مستودع فرع رام الله.
- `quantity_on_hand` نقص بمقدار 2.

### كشف الحساب

- العميل النقدي: **رصيد = 0** بعد الدفع (لا AR).
- لو كان عميل آجل، لتغيّر إلى Credit Sale (سيناريو منفصل).

### قائمة الدخل (P&L)

- Revenue: `+20.00`
- COGS: `+12.00`
- Gross Profit: `+8.00`

### Trial Balance

- متوازن (`total_debit == total_credit`) قبل وبعد الترحيل.
- لا يوجد `is_deleted = true` في القيد المُنشأ.

## Reconciliation Checks

بعد التنفيذ، شغّل التحققات التالية وتأكد من عدم وجود Drift:

1. `SUM(invoice_items.total) == SUM(journal_lines WHERE account = Revenue)` لهذه الفاتورة.
2. `cash_balance_after - cash_balance_before == 23.20`.
3. `inventory_value_change == -12.00` (بنفس طريقة التكلفة المستخدمة).
4. `vat_output_movement == +3.20`.
5. لا توجد قيود يتيمة (orphan journal lines) بدون `transaction_id`.

## Failure Modes (يجب أن يكتشفها النظام)

- ❌ ترحيل مباشر على حساب أب (مثل `1110` بدون sub-account) — ممنوع.
- ❌ القيد غير متوازن.
- ❌ خصم المخزون لم يحدث.
- ❌ ضريبة محسوبة بشكل خاطئ (16% Palestinian VAT).
- ❌ الفاتورة `posted` لكن بدون `transaction_id` مرتبط.

## مخرجات التشغيل

يكتب AI Agent النتيجة في:

```
/qa/results/cash-sale-<timestamp>.json
```

بصيغة:

```json
{
  "scenario": "cash-sale",
  "status": "pass | fail",
  "checks": [
    { "name": "trial_balance", "expected": "balanced", "actual": "...", "pass": true },
    { "name": "inventory_decrease", "expected": -2, "actual": -2, "pass": true }
  ],
  "drift": [],
  "duration_ms": 0
}
```