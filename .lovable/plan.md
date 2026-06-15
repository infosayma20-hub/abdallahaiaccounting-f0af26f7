# خطة: تصدير ومشاركة النماذج المعبأة + دورة اعتماد

## الهدف
تمكين الموظف (مثلاً مدير التسويق) من تصدير نموذج معبأ (خطة تسويق، تقرير، إلخ) كـ PDF احترافي بترويسة الشركة، ومشاركته عبر واتساب / بوابة الإدارة / HR / البريد الإلكتروني، مع دورة اعتماد رسمية (مسودة → مرسلة → قيد المراجعة → معتمدة/مرفوضة).

النطاق: **كل النماذج المسندة للموظفين** عبر `form_templates` + `employee_forms`.

---

## 1) تعديلات قاعدة البيانات (Migration واحدة)

### 1.1 توسيع `employee_forms`
أعمدة جديدة:
- `workflow_status` enum: `draft | submitted | under_review | approved | rejected` (افتراضي `draft`)
- `submitted_at`, `reviewed_at`, `reviewed_by` (uuid → employees)
- `review_notes` (text)
- `current_approver_role` (`management | hr`)
- `pdf_url` (text, آخر PDF منشور في Storage)

### 1.2 جدول جديد `employee_form_shares`
سجل كل عملية مشاركة (Audit):
```
id, form_id (→employee_forms), shared_by (employee_id), 
channel (whatsapp|management|hr|email), recipient (phone/email/role), 
recipient_name, pdf_url, message, status (sent|failed|read), 
created_at, company_id
```
RLS: tenant isolation + GRANT للـauthenticated/service_role.

### 1.3 جدول جديد `employee_form_approvals`
تاريخ القرارات (للأودِت ودعم تعدد المراحل لاحقاً):
```
id, form_id, action (submit|review|approve|reject|return),
actor_id, actor_role, notes, created_at, company_id
```

### 1.4 Storage Bucket
`employee-form-exports` (private) مع RLS path-based: `{company_id}/{form_id}/{timestamp}.pdf`.

### 1.5 Triggers
- عند تغيير `workflow_status` → إدخال تلقائي في `employee_form_approvals`.
- إشعار في `notification_log` لمستلمي القناة المختارة (management/hr).

---

## 2) محرك التصدير PDF (Frontend)

ملف جديد: `src/lib/employee-forms/pdf-exporter.ts`
- يبني PDF احترافي بـ `jsPDF` + خط `Amiri` (موجود) + `ar()` Reshaper (موجود).
- ترويسة: شعار الشركة (من `company_profiles`) + الاسم + رقم النموذج + التاريخ.
- جدول حقول النموذج (label/value) — يدعم كل أنواع الحقول (text/number/date/select/textarea/checkbox/file link).
- تذييل: اسم الموظف + التوقيع الرقمي (الوقت) + حالة الـworkflow + ترقيم الصفحات.
- يرفع الناتج إلى bucket `employee-form-exports` ويرجّع `pdf_url` ويحدّث `employee_forms.pdf_url`.

دالة موحّدة:
```ts
exportEmployeeFormToPdf(formId): Promise<{ blob, publicUrl, storagePath }>
```

---

## 3) Edge Function: `share-employee-form`

`supabase/functions/share-employee-form/index.ts`
المدخلات: `{ formId, channel, recipient?, recipientName?, message? }`
السلوك:
- يتحقق من الصلاحية (الموظف صاحب النموذج أو HR/Admin).
- إذا لم يوجد `pdf_url` حديث → يستدعي توليده (أو يستخدم الموجود).
- حسب القناة:
  - **whatsapp**: يولّد رابط `wa.me/<phone>?text=<msg+pdf_link>` ويُرجعه للواجهة لفتحه.
  - **management**: ينشئ `admin_notifications` + `notification_log` لكل مدير (role=admin).
  - **hr**: نفس الشيء لمن لديهم `hr_manager` أو `admin`.
  - **email**: يستدعي `send-transactional-email` بقالب جديد `employee-form-shared`.
- يسجّل صفاً في `employee_form_shares`.
- يحدث `workflow_status` إلى `submitted` إذا كان `draft`.

---

## 4) قالب البريد `employee-form-shared.tsx`

في `supabase/functions/_shared/transactional-email-templates/`
- ترويسة الشركة + اسم الموظف + اسم النموذج.
- زر "تحميل PDF" → `pdf_url` (Signed URL ساعة 24).
- رسالة الموظف (اختياري).
- يضاف إلى `registry.ts`.

---

## 5) واجهات المستخدم

### 5.1 بوابة الموظف — صفحة النموذج المعبأ
`src/components/employee/EmployeeFormFillPage.tsx` (موجود) — نضيف:
- شريط حالة workflow (Badge ملوّن).
- زر **"معاينة PDF"** → Modal HTML preview.
- زر **"تصدير PDF"** → تنزيل مباشر.
- زر **"مشاركة"** → `ShareFormSheet` جديد:
  - تبويبات: واتساب / إدارة / HR / بريد.
  - واتساب: حقل رقم + قائمة منسدلة بأرقام المديرين (من `employees` حيث role=admin/hr_manager).
  - بريد: حقل إيميل + قائمة منسدلة.
  - إدارة/HR: قائمة المستلمين (multi-select) + نص رسالة.
  - زر إرسال يستدعي `share-employee-form`.
- زر **"إرسال للمراجعة"** (إذا الحالة draft) → ينقل إلى `submitted`.

### 5.2 بوابة الإدارة — Inbox النماذج
صفحة جديدة `src/pages/admin/AdminFormsInboxPage.tsx`:
- جدول النماذج المرسلة للإدارة (`workflow_status in submitted/under_review`).
- فلاتر: حالة / موظف / قالب / تاريخ.
- صف قابل للتوسعة يعرض الحقول + زر تنزيل PDF.
- أزرار: **بدء المراجعة** / **اعتماد** / **رفض** (مع ملاحظة).
- يدخل في `AdminApp` navigation تحت "صندوق النماذج" مع badge للعدد غير المقروء.

### 5.3 بوابة HR — تبويب مماثل
في `EmployeeFormsManagementPage` (موجود) — نضيف:
- عمود "حالة الاعتماد" (workflow_status).
- نفس أزرار المراجعة/الاعتماد/الرفض.
- فلتر "موجّه لـHR" يستثني ما هو للإدارة فقط.

### 5.4 مكوّن مشترك: `FormWorkflowActions.tsx`
يحتوي منطق أزرار (Submit/Approve/Reject/Return) ويستخدم في كل البوابات.

---

## 6) الإشعارات والتنبيهات الفورية
- اشتراك Supabase Realtime على `employee_forms` في بوابة الإدارة + HR → badge لحظي.
- توست (toast) عند اعتماد/رفض النموذج للموظف.

---

## 7) ترتيب التنفيذ
1. Migration (الجداول + Bucket + Triggers + GRANTs).
2. PDF Exporter موحّد + رفع إلى Storage.
3. Edge Function `share-employee-form` + قالب البريد.
4. ShareFormSheet + أزرار workflow في بوابة الموظف.
5. صفحة Admin Forms Inbox + تكامل HR.
6. Realtime + الإشعارات + اختبار E2E.

---

## ملاحظات تقنية
- نلتزم بمعيار العزل: كل الاستعلامات تعتمد RLS على `company_id` (بدون فلترة يدوية بـuser_id).
- لا حذف فعلي للنماذج المعتمدة — Soft delete فقط مع حفظ نسخة PDF.
- جميع تواريخ workflow بـ`now() AT TIME ZONE 'UTC'`.
- نصوص الواجهة بالعربية (Palestinian dialect for AI labels).

هل أبدأ التنفيذ؟