
## نطاق العمل

إعادة تنظيم تجربة HR بدون أي تعديل على schema قاعدة البيانات أو RLS أو منطق الرواتب/الحضور — فقط: تنظيم التنقّل، تنظيف الواجهات المزدحمة، توحيد الأقسام المكرّرة، وإصلاح عرض البيانات (مثل HRMSG raw وJSON).

## الوضع الحالي (ما تم اكتشافه)

- يوجد **+15 مسار HR متفرق** في `App.tsx` بدون شريط تبويبات موحّد:
  `/hr`, `/employees`, `/hr-attendance`, `/leaves`, `/loans`, `/advances`, `/hr-deductions`, `/payroll`, `/payroll/inputs`, `/payroll/preview-all`, `/payroll/approval`, `/payroll-settings`, `/employee-forms-management`, `/hr/definitions`, `/hr/day-types`, `/hr/shifts`, `/hr/settings`, `/manager/roster`, `/hr/employee/:id`.
- **`HrCommandCenter`** الحالية (لوحة HR) جيدة لكن تكرّر روابط الأقسام الأربعة + KPIs + ملخص قابل للطي → سنبقي البنية ونبسّطها.
- **`HRAttendancePage`** ضخمة (1919 سطر): تنبيهات إعداد كبيرة + كروت كل الفروع + جدول → نطوي التنبيهات ونحدّ الكروت.
- **`EmployeesPage`** (1449 سطر): KPIs زائدة → نخفّضها لـ 4 مفيدة.
- **`EmployeeFormsManagementPage`** (583 سطر): يحتاج فلتر `?type=` (يستخدمه HrCommandCenter بالفعل) + إخفاء HRMSG raw عبر `decodeHRMessage` الموجود في `src/lib/hrMessages.ts`.
- **الرواتب مفرّقة في 5 مسارات** بدون wrapper موحّد.
- **جدول الدوام** (`BranchRosterPage`) يحتاج Empty State بدل جدول مليء بشرطات.

## الخريطة النهائية

```
الموارد البشرية (/hr)
├─ لوحة HR              /hr
├─ الموظفون             /employees           → Employee 360 /hr/employee/:id
├─ الحضور               /hr-attendance       (تبويبات داخلية: اليوم / الشهري / طلبات التعديل / تقارير)
├─ جدول الدوام          /attendance/roster
├─ طلبات الموظفين       /employee-forms-management
├─ الرواتب              /payroll             (تبويبات داخلية: معاينة / احتساب / قسائم / سياسات)
├─ القروض               /loans
└─ إعدادات HR           /hr/settings         (تبويبات: فروع وأقسام / شفتات / أنواع اليوم / بدلات وخصومات / ربط السياسات / إعدادات القرض والإجازات)
```

## المراحل (بالترتيب)

### المرحلة 1 — شريط تبويبات HR موحّد (الأهم)
- إنشاء `src/components/hr/HRTopNav.tsx`: شريط تبويبات أفقي ثابت، RTL، 8 عناصر فقط، مع `dropdown "المزيد"` على الشاشات الضيقة. يستخدم `useHRManagerPermissions` لإخفاء التبويبات غير المسموح بها.
- إنشاء `src/components/hr/HRShell.tsx`: layout يلفّ كل صفحات HR (يضع `HRTopNav` بالأعلى + `<Outlet/>` أو children).
- تحديث المسارات الـ HR في `App.tsx` لتكون داخل `HRShell` (دون كسر RoleGuard/HRPermGuard الحاليين — نلفّ children فقط).

### المرحلة 2 — تنظيف لوحة HR
- في `HrCommandCenter.tsx`: حذف رأس الصفحة المكرّر (سيظهر اسم القسم في `HRTopNav`)، إبقاء الفلاتر + الأقسام الأربعة + KPIs.
- نقل "ملخص سريع" (حضور اليوم + الطلبات المعلقة + Charts) لتكون مفتوحة افتراضيًا على Desktop ومطوية على الموبايل.

### المرحلة 3 — تنظيف الحضور
- في `HRAttendancePage.tsx`:
  - تنبيه الإعداد (`HRReadinessPanel` أو ما يقابله): قابل للطي + collapsed افتراضيًا إذا لا يوجد فعل عاجل.
  - كروت الفروع: limit 5 + scroll أفقي للباقي.
  - جدول التعديلات: ربط `decodeHRMessage` من `src/lib/hrMessages.ts` لإزالة `<<HRMSG:{...}>>` raw.
  - تنظيم أعمدة جدول الحضور حسب: الموظف / الفرع / القسم / دخول / خروج / ساعات / الحالة / المشكلة / إجراء.

### المرحلة 4 — توحيد الرواتب
- إنشاء `src/pages/PayrollPage.tsx` (موجودة) → تحويلها إلى **wrapper بتبويبات داخلية**:
  - معاينة: تستضيف `PayrollPreviewAllPage`
  - احتساب: المحتوى الحالي للـ `PayrollPage`
  - قسائم: drawer/list من `MalakiPayslipDialog`
  - سياسات: `PayrollSettingsPage`
- إعادة توجيه `/payroll/preview-all`, `/payroll-settings` إلى `/payroll?tab=preview|settings` (مع الإبقاء على المسارات القديمة كـ aliases لتجنّب كسر روابط خارجية).
- إصلاح Empty States في "احتساب": رسالة واضحة (لا سياسة / لا حضور / لا مدخلات).

### المرحلة 5 — طلبات الموظفين
- في `EmployeeFormsManagementPage.tsx`:
  - إعادة تسمية الترويسة لـ "طلبات الموظفين".
  - دعم `?type=` filter من URL (موجود؟ نتأكد).
  - استخدام `RequestDetailsDialog` الموجود (تم بناؤه في المرحلة 2 لتطبيق الموظف) — استخراجه ليكون عام وقابل لإعادة الاستخدام في الـ HR، أو إنشاء `RequestDetailsDialogHR.tsx` يعتمد على نفس `getDetailGroups`.
  - إخفاء أزرار الحذف عن غير admin.

### المرحلة 6 — صفحات أصغر
- `EmployeesPage`: تقليل KPIs لـ 4 (الإجمالي، نشط، غير نشط، إجمالي الرواتب). تقليل المساحة العلوية.
- `BranchRosterPage`: Empty State + زر "نسخ من أسبوع سابق" فوق الجدول إذا كان فارغًا.
- `Employee360Page`: مرتب أصلًا — لا تغيير.
- `LoansPage`: تثبيت أزرار الإجراءات فوق + ضغط الكروت.

### المرحلة 7 — إعدادات HR موحّدة
- `src/pages/hr/HrSettingsPage.tsx` جديدة بتبويبات تستضيف: `HrDefinitionsPage`, `HrWorkShiftsPage`, `HrDayTypesPage`, `PayrollSettingsPage` (سياسات ربط الموظفين)، إلخ — كـ inner tabs بدون تكرار في الشريط العلوي.

## ما لن يتغيّر (ضمانات)
- Schema قاعدة البيانات / RLS / Migrations.
- منطق `usePayrollCalculator`, `useEmployee360`, `useHrCommandCenter`.
- مكوّنات تطبيق الموظف (`src/components/employee/*`, `src/pages/EmployeeApp.tsx`).
- Edge functions.

## ملاحظات تنفيذية

- نظرًا لحجم العمل (~10 ملفات كبيرة)، المنفّذ سيتم على دفعات: المرحلة 1+2 أولًا (الأكثر أثرًا)، ثم 3+5، ثم 4، ثم 6+7. بعد كل دفعة: `tsc --noEmit` + جولة بصرية في المعاينة على `/hr`, `/hr-attendance`, `/employee-forms-management`, `/payroll`.
- إذا اكتشفنا أن `HRTopNav` يكسر صفحة فيها sidebar داخلي خاص، سنستثنيها من `HRShell`.

## التقدير
- المرحلة 1+2: ~5 ملفات جديدة، تعديل `App.tsx` + `HrCommandCenter.tsx`.
- المرحلة 3: تعديل ضخم على `HRAttendancePage.tsx` (لكن نقطة-نقطة، بدون كسر منطق).
- المرحلة 4: refactor `PayrollPage.tsx` إلى wrapper.
- المرحلة 5: تعديل `EmployeeFormsManagementPage.tsx` + استخراج Dialog.
- المراحل 6+7: تنظيفات بصرية صغيرة.

هل أبدأ التنفيذ بالمراحل بهذا الترتيب، أم تفضّل ترتيبًا مختلفًا (مثلًا الحضور أولًا لأنها الأكثر إزعاجًا اليوم)؟
