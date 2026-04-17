# 🔧 Print Bridge — Patch: تصحيح عرض نوع الطلبية (orderType)

## 🎯 الهدف
حالياً تذاكر **المطبخ / السخان / البيتزا** تظهر "**تيك أواي**" دائماً حتى للطلبيات المحلية والتوصيل.

السبب: السكريبت في `print-bridge.js` لا يتعامل مع كل صيغ `orderType` المرسلة من نقطة البيع.

---

## 📍 موقع الملف
على جهاز الكاش الرئيسي (IP: `192.168.1.65`):
```
C:\print-bridge\print-bridge.js
```
(أو حسب مسار التثبيت لديك)

---

## ✏️ الخطوة 1 — أضف دالة التطبيع في أعلى الملف

ابحث في الملف عن أول دالة `function` (عادة بعد `const express = require('express')`)، وأضف هذا قبلها:

```javascript
// ──────────────────────────────────────────
// Order Type Normalizer — handles all variants
// ──────────────────────────────────────────
function normalizeOrderType(rawType, tableNumber) {
  const t = String(rawType || '').trim().toLowerCase();
  
  // Delivery variants
  if (t === 'delivery' || t === 'توصيل' || t === 'دليفري') return 'delivery';
  
  // Takeaway variants  
  if (t === 'takeaway' || t === 'take-away' || t === 'take_away' 
      || t === 'تيك اواي' || t === 'تيك أواي' || t === 'استلام' || t === 'سفري') {
    return 'takeaway';
  }
  
  // Dine-in variants
  if (t === 'dine_in' || t === 'dine-in' || t === 'dinein' 
      || t === 'محلي' || t === 'صالة' || t === 'في المحل' || t === 'eat_in') {
    return 'dine_in';
  }
  
  // Inference: if table number exists and type unclear → dine_in
  if (tableNumber && String(tableNumber).trim()) return 'dine_in';
  
  // Default fallback
  return 'takeaway';
}

function getOrderTypeArabicLabel(normalized) {
  if (normalized === 'delivery') return 'توصيل';
  if (normalized === 'dine_in') return 'محلي';
  return 'تيك اواي';
}
```

---

## ✏️ الخطوة 2 — استخدم الدالة في رندرة تذاكر المطبخ

ابحث عن الكود الذي يكتب نوع الطلبية على التذكرة (شيء مثل `'تيك اواي'` كـ literal أو شرط على `orderType`).

**استبدله بـ**:

```javascript
// داخل دالة renderKitchenTicket / renderReceipt
const normalizedType = normalizeOrderType(order.orderType, order.tableNumber);
const orderTypeText = order.orderTypeLabel || getOrderTypeArabicLabel(normalizedType);

// الآن استعمل orderTypeText بدلاً من القيمة الخام
```

> **ملاحظة**: الكود في نقطة البيع أصبح يرسل حقل `orderTypeLabel` جاهز — استعمله مباشرة إن وُجد، وإلا استخرجه.

---

## ✏️ الخطوة 3 — أعد تشغيل الخدمة

```bash
# إذا كانت تشتغل بـ pm2:
pm2 restart print-bridge

# إذا كانت تشتغل في terminal:
# اقفل الترمنال وافتح جديد ثم:
node print-bridge.js
```

---

## ✅ اختبار النجاح

من نقطة البيع، أصدر 3 طلبيات اختبار:
1. **طاولة**: يجب أن تطبع التذكرة → "**محلي**"
2. **بدون طاولة (مع زبون)**: يجب أن تطبع → "**تيك اواي**"
3. **مع عنوان توصيل**: يجب أن تطبع → "**توصيل**"

---

## 🛟 إذا لم يعمل التحديث

أرسل لي محتوى ملف `print-bridge.js` (أو الجزء الخاص برندرة المطبخ فقط)
وسأعطيك patch مباشر ودقيق.
