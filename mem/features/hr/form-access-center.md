---
name: Form Access Center
description: مركز إسناد النماذج للموظفين — تحديد لكل موظف ما يعبّيه وما يطّلع عليه فقط، مع جدول form_template_assignments و RPC get_employee_form_access
type: feature
---

# مركز إسناد النماذج (Form Access Center)

**المسار:** `/hr/form-access` — admin + hr_manager فقط (HRPermGuard: can_manage_forms أو can_manage_hr_settings).

## النموذج الذهني
- استهداف القالب بالمسمى الوظيفي (`target_job_title_names`) يبقى الافتراضي التلقائي.
- جدول `form_template_assignments(template_id, employee_id, access_level: fill|view)` يضيف وصولاً يدوياً فوق ذلك.
- لا يمكن إلغاء الوصول الموروث من المسمى يدوياً — يظهر بقفل 🔒. لإلغائه يجب تعديل `target_job_title_names` على القالب.

## RLS
- `form_templates.SELECT` يستدعي `can_view_form_template(id, target_employee_ids, target_job_title_names)` التي تقبل:
  - admin/hr_manager، أو
  - مطابقة employee_id / job_title، أو
  - صف فعّال في `form_template_assignments` (fill أو view).
- `employee_forms.SELECT` تمت إضافة سياسة "Assigned viewers can read template submissions" لتسمح للموظف بقراءة كل التعبئات لقوالب أُسندت له.
- `employee_forms.INSERT` يحرسه trigger `enforce_form_fill_permission_trg` يستدعي `can_fill_form_template(template_id)` (الذي لا يقبل `view` كصلاحية تعبئة).

## API الرئيسية
- `public.get_employee_form_access(p_employee_id uuid)` — يرجع لكل قالب: can_fill, can_view, fill_source, view_source. متاحة لـ admin/hr_manager وللموظف على نفسه.
- `public.can_fill_form_template(template_id)` — يفصل بين تعبئة فعلية واطلاع فقط.

## الواجهة
- `src/pages/hr/FormAccessCenterPage.tsx` — بحث موظف ثم جدول قوالب بـ checkboxes (يعبّي / يطّلع) + مصدر.
- `src/hooks/hr/useFormAccessManager.ts` — يلف RPC + upsert/delete على `form_template_assignments`.
- `src/components/employee/EmployeeAssignedTemplates.tsx` — تم تحويله لاستخدام نفس الـ RPC، وتقسيم العرض لقسمين: "نماذج للتعبئة" و"نماذج للاطلاع".

## ملاحظات
- view-only في بورتال الموظف: الضغط على القالب يفتح آخر تعبئة (إن وُجدت) كقراءة فقط؛ شارة "👁️ اطلاع فقط".
- لا تغييرات على `EmployeeFormsTab` الأساسي ولا على دور RBAC.

## فحوصات قبول
1. علاء (مدير التسويق) — يشوف "الخطة التسويقية" تلقائياً للتعبئة (موروث).
2. عبدالله (مسمى آخر) — admin يفتح `/hr/form-access` → يحدد له "يطّلع" على الخطة التسويقية → يظهر له القالب في قسم "للاطلاع" وفي القائمة يقدر يرى آخر تعبئة من علاء.
3. محاولة insert على `employee_forms` لقالب view-only من موظف بدون fill → ترفع: "ليس لديك صلاحية تعبئة هذا النموذج".


## Why
الاستهداف بالمسمى وحده لم يكن كافياً لحالات خاصة (موظف يجب أن يعبّي قالب ليس ضمن منصبه، أو مدير آخر يحتاج اطلاعاً فقط). الحل يبقي الافتراضي بسيطاً ويضيف طبقة يدوية بدون مساس بـ RBAC الأساسي.