// Builds the developer handoff files (Arabic guide + Postman collection)
// for the Mobile Orders API, prefilled with this tenant's Base URL and API key.

export const mobileApiBaseUrl = () =>
  `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/mobile-orders-api`;

const ORDER_EXAMPLE = {
  client_reference_id: "APP-2026-000123",
  branch_code: "B01",
  customer_name: "أحمد محمد",
  customer_phone: "0599123456",
  delivery_type: "delivery",
  delivery_address: "رام الله - شارع الإرسال",
  delivery_fee: 5,
  payment_method: "cash",
  items: [
    { name: "وجبة دجاج ملكي", qty: 1, unit_price: 25 },
    {
      name: "بطاطا مقلية",
      qty: 2,
      unit_price: 8,
      note: "بدون ملح",
      modifiers: [{ option_name: "حجم كبير", extra_price: 3 }],
    },
  ],
  order_note: "الاتصال عند الوصول",
};

export function buildDeveloperGuide(apiKey?: string): string {
  const baseUrl = mobileApiBaseUrl();
  const key = apiKey?.trim() || "umo_live_ضع_المفتاح_هنا";
  return `# واجهة ربط تطبيق الجوال — Mobile Orders API

هذا الدليل موجّه لمبرمج تطبيق الجوال. عبر هذه الواجهة يرسل التطبيق طلبيات الزبائن مباشرة إلى
شاشة الكاشير (الفواتير المعلّقة) في الفرع المحدد، مع إمكانية متابعة حالة الطلبية وإلغائها.

---

## 1) الأساسيات

| | |
|---|---|
| **Base URL** | \`${baseUrl}\` |
| **المصادقة** | ترويسة \`x-api-key: ${key}\` |
| **المحتوى** | \`Content-Type: application/json\` — كل الردود JSON |

> ⚠️ المفتاح سرّي: لا تضعه في كود التطبيق المثبّت على أجهزة الزبائن. أرسل الطلبيات من خادم التطبيق (Backend) فقط.

---

## 2) إرسال طلبية جديدة

\`POST /orders\`

\`\`\`json
${JSON.stringify(ORDER_EXAMPLE, null, 2)}
\`\`\`

### الحقول

| الحقل | النوع | إلزامي | ملاحظات |
|---|---|---|---|
| \`client_reference_id\` | نص | ✅ | **رقم الطلبية عندكم** — يمنع التكرار ويُستخدم للمتابعة (3–100 حرف) |
| \`branch_code\` | نص | ✅* | كود الفرع (مثل \`B01\`) — *أو* \`branch_id\` |
| \`branch_id\` | UUID | ✅* | بديل عن \`branch_code\` (يُجلب من \`GET /branches\`) |
| \`customer_name\` | نص | ✅ | اسم الزبون |
| \`customer_phone\` | نص | ➖ | هاتف الزبون |
| \`delivery_type\` | نص | ➖ | \`delivery\` (توصيل) أو \`takeaway\` / \`pickup\` (استلام) — الافتراضي \`takeaway\` |
| \`delivery_address\` | نص | ➖ | العنوان (يُنصح به عند \`delivery\`) |
| \`delivery_fee\` | رقم | ➖ | أجرة التوصيل — تُضاف للإجمالي |
| \`payment_method\` | نص | ➖ | \`cash\` (افتراضي) / \`visa\` / \`card\` / \`wallet\` |
| \`items\` | مصفوفة | ✅ | بند واحد على الأقل (حتى 100) |
| \`items[].name\` | نص | ✅ | اسم الصنف كما يظهر للكاشير |
| \`items[].qty\` | رقم | ✅ | الكمية |
| \`items[].unit_price\` | رقم | ✅ | سعر الوحدة |
| \`items[].product_id\` | UUID | ➖ | ربط الصنف بمنتج النظام (لخصم المخزون بدقة) |
| \`items[].note\` | نص | ➖ | ملاحظة على البند |
| \`items[].modifiers\` | مصفوفة | ➖ | إضافات: \`option_name\` + \`extra_price\` |
| \`order_note\` | نص | ➖ | ملاحظة عامة على الطلبية |
| \`scheduled_for\` | ISO 8601 | ➖ | طلبية مجدولة لوقت لاحق |

### الرد (201)

\`\`\`json
{
  "ok": true,
  "deduplicated": false,
  "order_id": "743d1dec-...",
  "reference": "APP-2026-000123",
  "status": "pending",
  "total": 47,
  "branch_name": "الفرع الرئيسي",
  "message": "تم استلام الطلبية وتحويلها لشاشة الكاشير"
}
\`\`\`

> 💡 الإجمالي يُحسب في الخادم: \`Σ (سعر الوحدة + الإضافات) × الكمية + أجرة التوصيل\`.
> أرسل \`total\` داخل البند فقط إن أردت فرض سعر إجمالي معيّن للبند.

### وضع الفحص (Dry Run)

أضف \`?dry_run=1\` للمسار: \`POST /orders?dry_run=1\` — يتحقق من صحة الطلبية والفرع ويحسب
الإجمالي **بدون حفظ أي شيء**. مثالي لاختبار الربط قبل الإطلاق.

### منع التكرار (Idempotency)

إذا أُعيد إرسال نفس \`client_reference_id\` (مثلاً بسبب إعادة محاولة شبكة)، يُرجع النظام
الطلبية الأصلية مع \`"deduplicated": true\` **بدون إنشاء طلبية ثانية**. آمن تماماً لإعادة المحاولة.

### الأخطاء

| الكود | المعنى |
|---|---|
| \`400 validation_failed\` | حقول ناقصة/خاطئة — التفاصيل في \`fields\` |
| \`400 branch_not_found\` | كود الفرع غير صحيح أو الفرع موقوف |
| \`401 unauthorized\` | مفتاح API غير صالح أو موقوف |
| \`404 not_found\` | (في المتابعة/الإلغاء) لا توجد طلبية بهذا المرجع |
| \`409 not_cancellable\` | (في الإلغاء) الكاشير قبل الطلبية بالفعل |

---

## 3) متابعة حالة الطلبية

\`GET /orders/{client_reference_id}\`

\`\`\`json
{
  "ok": true,
  "reference": "APP-2026-000123",
  "status": "pending",
  "total": 47,
  "branch_name": "الفرع الرئيسي",
  "payment_method": "cash",
  "delivery_type": "pickup",
  "pos_order_id": null,
  "created_at": "2026-08-22T20:48:11Z",
  "accepted_at": null
}
\`\`\`

قيم \`status\` الشائعة: \`pending\` (بانتظار الكاشير) ← \`accepted\` (قُبلت وحُوّلت لفاتورة) ←
\`completed\` / أو \`cancelled\` (مع \`cancel_reason\`).

---

## 4) إلغاء طلبية

\`DELETE /orders/{client_reference_id}\` — جسم اختياري: \`{ "reason": "الزبون ألغى من التطبيق" }\`

- تنجح فقط ما دامت الطلبية \`pending\` (قبل أن يقبلها الكاشير).
- إن كانت ملغاة مسبقاً تُرجع \`200\` بنجاح (عملية idempotent).
- إن قُبلت بالفعل تُرجع \`409 not_cancellable\`.

---

## 5) جلب قائمة الفروع

\`GET /branches\` — يرجع الفروع الفعالة (\`id\`, \`name\`, \`branch_code\`, \`address\`) لعرضها في التطبيق
كي يختار الزبون الفرع الأقرب.

---

## 6) دورة الحياة الكاملة

1. الزبون يطلب من التطبيق ← خادم التطبيق يستدعي \`POST /orders\`.
2. الطلبية تظهر **فوراً** على شاشة الكاشير في الفرع (صوت تنبيه + شارة "تطبيق 📱").
3. الكاشير يقبلها ← تتحول لفاتورة POS عادية (ترقيم يومي، مخزون، قيود محاسبية).
4. التطبيق يستعلم دورياً عبر \`GET /orders/{ref}\` لعرض الحالة للزبون.
5. (اختياري) الزبون يلغي قبل القبول ← \`DELETE /orders/{ref}\`.

---

## 7) ملاحظات تقنية

- كل الطلبات تُسجّل في سجل Webhooks داخل النظام للمراجعة والتدقيق.
- الزبون يُسجَّل تلقائياً في سجل زبائن نقطة البيع (حسب رقم الهاتف) مع عدّاد زيارات ومشتريات.
- لا يوجد حالياً حدّ لمعدل الطلبات (Rate Limit) — يُرجى عدم إرسال أكثر من ~10 طلبات/ثانية.
- اختبار الربط متاح من لوحة الإدارة: الإعدادات ← التكاملات ← فحص واختبار التكامل.
- الدعم الفني: تواصل مع إدارة النظام لإصدار مفتاح أو إيقافه.
`;
}

export function buildPostmanCollection(apiKey?: string): string {
  const baseUrl = mobileApiBaseUrl();
  const key = apiKey?.trim() || "umo_live_ضع_المفتاح_هنا";
  const authHeaders = [
    { key: "x-api-key", value: "{{apiKey}}" },
    { key: "Content-Type", value: "application/json" },
  ];
  const collection = {
    info: {
      name: "Unify ERP — Mobile Orders API",
      description: "ربط تطبيق الجوال: إرسال الطلبيات لشاشة الكاشير، متابعة الحالة، والإلغاء.",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: [
      { key: "baseUrl", value: baseUrl },
      { key: "apiKey", value: key },
    ],
    item: [
      {
        name: "قائمة الفروع",
        request: { method: "GET", header: authHeaders, url: "{{baseUrl}}/branches" },
      },
      {
        name: "إرسال طلبية (فحص بدون حفظ)",
        request: {
          method: "POST",
          header: authHeaders,
          url: "{{baseUrl}}/orders?dry_run=1",
          body: { mode: "raw", raw: JSON.stringify(ORDER_EXAMPLE, null, 2) },
        },
      },
      {
        name: "إرسال طلبية",
        request: {
          method: "POST",
          header: authHeaders,
          url: "{{baseUrl}}/orders",
          body: { mode: "raw", raw: JSON.stringify(ORDER_EXAMPLE, null, 2) },
        },
      },
      {
        name: "متابعة حالة طلبية",
        request: {
          method: "GET",
          header: authHeaders,
          url: "{{baseUrl}}/orders/APP-2026-000123",
        },
      },
      {
        name: "إلغاء طلبية",
        request: {
          method: "DELETE",
          header: authHeaders,
          url: "{{baseUrl}}/orders/APP-2026-000123",
          body: { mode: "raw", raw: JSON.stringify({ reason: "الزبون ألغى من التطبيق" }, null, 2) },
        },
      },
    ],
  };
  return JSON.stringify(collection, null, 2);
}

export function downloadTextFile(filename: string, content: string, mime = "text/markdown") {
  const blob = new Blob(["﻿" + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
