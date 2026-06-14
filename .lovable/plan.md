## الهدف
إضافة قدرة عامة في النظام لتعريف نماذج (Forms) ديناميكية تُسند حسب المنصب (Job Title)، ويعبيها الموظف من بورتاله على الجوال — بدون أي hardcoding للحقول.
المخرج الفعلي لهذه المرحلة: نموذج **"الخطة التسويقية الربعية"** جاهز ومُسند لمنصب "مدير التسويق" (علاء ناصر).

---

## 1) قاعدة البيانات (Migration واحدة)

### جدول جديد: `form_templates`
يحتوي تعريف القالب نفسه (الـ schema بصيغة JSON):
- `name` (عنوان النموذج)
- `description`
- `category` (نص: marketing / operations / hr / quality ...)
- `schema` (JSONB — الأقسام والحقول)
- `target_job_title_ids` (uuid[] — أي مدير منصبه ضمنها يشوف النموذج)
- `target_employee_ids` (uuid[] — استثناءات/إسناد فردي إضافي)
- `reviewer_role` (نص: admin / hr_manager / branch_manager)
- `is_active` (bool)
- `frequency` (نص: once / weekly / monthly / quarterly — للعرض فقط)
- `company_id`, `user_id`, `created_by`, timestamps
- RLS: الموظف يقرأ القوالب اللي منصبه ضمن `target_job_title_ids` أو الموجود في `target_employee_ids`. الـ admin/HR يدير الكل ضمن نفس الشركة.

### تعديل جدول `employee_forms` (الموجود)
- إضافة عمود `template_id uuid references form_templates(id)` (nullable للحفاظ على التوافق).
- إضافة عمود `title text` (لتخزين اسم النموذج وقت التعبئة).
- لا تغيير على السياسات الحالية.

### Seed: نموذج "الخطة التسويقية الربعية"
إدخال صف واحد في `form_templates` لكل شركة عندها منصب "مدير التسويق" (أو يدوياً للشركة الحالية فقط). الـ schema يغطي الـ 17 قسم:
- الفترة (من/إلى) — حقول تاريخ
- الحملات الشهرية — repeater (شهر، عنوان، مناسبة، هدف، ملاحظات)
- العروض الترويجية — repeater (اسم العرض، مناسبة، فترة، مكونات، سعر قبل، سعر بعد، آلية)
- المسابقات / خدمة مجتمعية / فعاليات الأطفال / المؤثرون / الفيديوهات / التطبيقات / الإذاعات / وسائل الإعلام — repeaters
- مواقع التواصل (فيديوهات + تصاميم) — repeaters
- الشركات المستهدفة / الشاشات الداخلية / ISO 22000 — repeaters
- 5 أفكار إبداعية — repeater بسيط (نص)
- الميزانية — repeater بنود ثابتة + إجمالي محسوب
- التقرير الختامي — 5 textareas
- اعتماد — 3 حقول توقيع (مدير التسويق، مدير العمليات، المدير العام) + تاريخ

---

## 2) الواجهة الأمامية (Frontend فقط — لا منطق محاسبي)

### مكوّن `DynamicFormRenderer` جديد
`src/components/forms/DynamicFormRenderer.tsx` — يبني الفورم من schema:
- يدعم الأنواع: `text`, `textarea`, `number`, `date`, `select` (مع options ثابتة)، `multi_select`, `repeater` (جدول قابل للإضافة/الحذف على الجوال — كل صف ككرت)، `signature` (Canvas)، `currency`.
- Mobile-first: كل قسم Accordion (مفتوح/مغلق)، repeater كبطاقات Stacked على الموبايل وجدول على الديسكتوب.
- زر "حفظ مسودة" + زر "إرسال". المسودة تُحفظ في localStorage عبر `useFormDraft` الموجود.
- عند الإرسال: insert في `employee_forms` مع `template_id`, `form_type='dynamic_template'`, `form_data={...}`.

### صفحة في بورتال الموظف: "النماذج المسندة لي"
`src/pages/portal/PortalAssignedFormsPage.tsx`:
- تجلب من `form_templates` القوالب اللي منصب الموظف الحالي ضمن `target_job_title_ids`.
- بطاقات كبيرة بكل قالب (اسم، وصف، تكرار، آخر تعبئة).
- اضغط → يفتح `DynamicFormRenderer`.
- تبويب "سجل تعبئاتي" يعرض نماذجي السابقة من `employee_forms`.
- إضافة دخول من البوتم نڤ الموجود في بورتال الموظف.

### صفحة Admin: استعراض النماذج المُعبّأة
نضيف تبويب "نماذج ديناميكية" داخل `Employee360Page` (موجود) يعرض `employee_forms` المرتبطة بـ template_id — يفتح modal فيه قراءة فقط للـ form_data بنفس الـ Renderer (read-only).

### قائمة Admin "إدارة قوالب النماذج" (مبسطة لهالمرحلة)
`src/pages/hr/FormTemplatesAdminPage.tsx`:
- جدول بسيط: اسم، فئة، الأشخاص المستهدفون، نشط/متوقف، عدد التعبئات.
- في هالمرحلة: **لا يوجد بناء visual** — تعديل القالب يدوياً عبر JSON Editor فقط (textarea). الـ Drag & Drop Designer يجي بمرحلة لاحقة (طلبك واضح: هالمرحلة فقط الخطة التسويقية).
- زر "إسناد" → modal يحدد job_title_ids و employee_ids.

---

## 3) ما لن يتم في هذه المرحلة (موثّق للمرحلة القادمة)
- Form Builder بصري (Drag & Drop) — يأتي مع موجة النماذج الأربعة (نظافة، جودة، عقابي، أعطال).
- تنبيهات realtime للمدير عند التعبئة.
- جدولة تذكير (cron) للنماذج الدورية (ربعية/شهرية).
- تصدير PDF لكل تعبئة بتصميم مطابق للنموذج الورقي.

---

## 4) خطوات التنفيذ بالترتيب
1. Migration: إنشاء `form_templates` + إضافة الأعمدة على `employee_forms` + RLS + GRANTs + Seed للنموذج التسويقي.
2. مكوّن `DynamicFormRenderer` (يدعم كل الأنواع المذكورة).
3. صفحة بورتال الموظف "النماذج المسندة لي" + إضافتها للنڤ.
4. صفحة Admin بسيطة لاستعراض التعبئات داخل بطاقة الموظف.
5. صفحة Admin لإدارة القوالب (JSON Editor مؤقت).
6. ترجمات في `hrLabels.ts` (`dynamic_template` → اسم القالب).
7. Memory update: توثيق محرك النماذج الديناميكي.

---

## ملاحظات تقنية
- لا تغييرات على المنطق المحاسبي أو قواعد POS.
- نستخدم نفس نمط `Custom Dashboards Builder` الموجود (JSONB schema) كقاعدة للتصميم.
- التحقق من المدخلات (Zod) داخل `DynamicFormRenderer` يولّد ديناميكياً من schema.

هل أبلش التنفيذ؟