---
name: Haseeb Anti-Hallucination & Strict-Leaf Gate (2026-08-22)
description: Fixes for Smart Accountant fake-success bug — process-transaction strict-leaf gate, client failure surfacing, ai-assistant-chat read-only rule.
type: feature
---
# Smart Accountant — Anti-Hallucination Fix (22/08/2026)

**Incident:** سند قبض "ابو زيد 50₪" ادّعى ai-assistant-chat تسجيله بدون كتابة شيء؛ وقيد "كهرباء" انحفظ بـ debit_account_code نص عربي ("كهرباء وماء") لأن حساب كهرباء غير موجود بشجرة المستأجر.

**Root causes & fixes:**
1. `process-transaction/index.ts`:
   - `resolveAccountCode` كان يرجّع الاسم الخام عند فشل المطابقة → الآن يرجّع `''`.
   - دعم صيغة "name (code)" من جدول الربط — يفضّل **الاسم** على الكود (الأكواد الثابتة بالبرومبت تنحرف بين المستأجرين).
   - **Strict-leaf gate** قبل الإدراج: حساب غير موجود → `chat_response` رفض بدون إدراج. حساب أب 1110/1120 → يحل تلقائياً لورقة (يفضّل "شيكل" للصندوق). أب 1130/2110 بدون جهة اتصال → رفض برسالة توضيحية.
   - select الحسابات صار يجلب `parent_code`.
2. Client UIs (`CleanSmartAccountant`, `HaseebChatPanel`, `MobileChatArea`): كانت تبتلع نتيجة الفشل وتعرض "✅ تم التسجيل" أو تسقط للشات العام → الآن كل مسار يفحص `isTxResultSuccess` ويعرض رسالة الفشل الحقيقية بدون fallthrough.
3. `ai-assistant-chat/index.ts`: قاعدة ذهبية جديدة — مساعد قراءة فقط، ممنوع قول "تم التسجيل"، وكشوف الحسابات فقط من البيانات المزوّدة.

**Rule:** أي رد `type: 'chat_response'` من process-transaction يعني "لم يُحفظ شيء" — يجب عرضه كما هو، أبداً كنجاح.

**Data repair (tenant d8ddc6f2 / مؤسسة صايمة):** أنشئ حساب 5505 "كهرباء وماء" تحت 5500؛ قيد الكهرباء أُعيد (Dr 5505 / Cr 11102)؛ سند قبض ابو زيد سُجّل (Dr 11102 / Cr 11300028, contact مربوط). مراجع: AI-FIX-20260822-*.
