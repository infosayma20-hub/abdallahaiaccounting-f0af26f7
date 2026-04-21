---
name: Invoice Status Triple Separation
description: Three independent status fields on invoices (lifecycle vs payment vs accounting) — never mix them in UI or logic
type: feature
---
# الفصل الثلاثي لحالات الفاتورة (Triple Status Separation)

أي فاتورة في النظام تملك **ثلاث حالات مستقلة تماماً** يجب عدم خلطها أبداً:

## 1. Invoice Status (حالة دورة الحياة) — `invoices.status`
يتحكم بها المستخدم يدوياً عبر الـ UI:
- `draft` — مسودة (قابلة للتعديل، لا قيد محاسبي)
- `sent` — مُرسلة/مرحّلة (قيد محاسبي قائم)
- `cancelled` — ملغاة (قيد عكسي تم)

**ممنوع** إضافة `paid` هنا — الدفع ليس حالة دورة حياة.

## 2. Payment Status (حالة الدفع) — `invoices.payment_status`
**محسوبة آلياً، لا يتحكم بها المستخدم مطلقاً**. تُشتقّ من `paid_amount` vs `total_amount` عبر ربط سندات القبض (`payment_invoice_links`):
- `unpaid` — `paid_amount = 0`
- `partial` — `0 < paid_amount < total_amount`
- `paid` — `paid_amount >= total_amount`

**القاعدة الذهبية:** الفاتورة لا تصبح "مدفوعة" إلا بوجود سند قبض حقيقي مرتبط بها — وليس بتغيير flag.

## 3. Accounting Classification (التصنيف المحاسبي)
يُحدَّد لحظة الترحيل من `payment_method`:
- `نقدي/بنك/شيك` → Cash sale (مدين: نقدية، دائن: مبيعات)
- `آجل` → Credit sale (مدين: ذمم العميل، دائن: مبيعات)
- بعد سند القبض → Settled by receipt (لا يتغير القيد الأصلي، يُضاف قيد التحصيل)

## التطبيق في الواجهة (`InvoicesPage.tsx`)
- Dropdown الحالة يحوي فقط: `draft`, `sent`, `cancelled` — **لا يوجد `paid`**.
- شارتان منفصلتان في كل صف: `statusConfig` (دورة الحياة) + `paymentStatusConfig` (الدفع).
- زر مخصص "تسجيل قبض" يفتح `/finance/receipt/new?invoice_id=...` بدلاً من تغيير الحالة.

## ملف TypeScript
```typescript
interface Invoice {
  status: "draft" | "sent" | "cancelled";        // workflow
  paymentStatus: "unpaid" | "partial" | "paid";  // derived
  paymentMethod: "cash" | "transfer" | "cheque" | "credit"; // accounting hint
}
```

**Why:** خلط الحالات الثلاث في حقل واحد كان يسمح بفاتورة "مدفوعة" بدون سند قبض، مما يُظهرها في كشف الحساب كذمة دائمة.
