
# تقرير ساعات الدوام لكل فرع + مقارنة المبيعات

## الفهم
ادارة الملكي بتحتاج تعرف كم ساعة دوام بتصرفها كل فرع يومياً، ومقسّمة على فترتين (٩ص–٥م / ٥م–نهاية الدوام)، مع الإضافي والمقارنة مع المبيعات — عشان يحطوا سقف تشغيلي.

## المصادر (موجودة بالنظام)
- `attendance_events` (check_in/check_out) → لحساب الساعات مقسّمة على الفترات بدقة.
- `attendance_days` → عدد الموظفين + الإضافي المعتمد.
- `branches` → اسم الفرع.
- `pos_orders` (state=paid) + `pos_sessions.terminal_id` + `pos_terminals.branch_id` → مبيعات الفرع لنفس اليوم (business_date).

## الحل

### 1) Edge function جديد داخل `malaki-data`
Action: `branch_hours_report` — يستقبل `date_from`, `date_to`, `branch_id?`
- يجيب كل الأحداث بالفترة، يزاوج check_in ↔ check_out لكل موظف/يوم.
- لكل زوج يحسب الساعات المتقاطعة مع:
  - **09:00 → 17:00** (ساعات نهارية)
  - **17:00 → 06:00 اليوم التالي** (ساعات مسائية)
- يجمع بعديها لكل فرع/يوم: `employees_count`, `day_hours`, `evening_hours`, `total_hours`, `overtime_hours` (من attendance_days), و`sales_total` (من pos_orders join sessions→terminals).

### 2) صفحة تقرير مشتركة `HRBranchHoursReport.tsx`
- فلاتر: من/إلى، فرع.
- جدول أعمدة: الفرع | التاريخ | عدد الموظفين | ساعات ٩–٥ | ساعات ٥–النهاية | الإجمالي | إضافي | المبيعات | تكلفة/شيكل مبيعات (توضيحية).
- مجاميع Footer + تصدير Excel.
- كارت مؤشرات علوية: إجمالي الساعات، إجمالي المبيعات، متوسط ساعة/شيكل.

### 3) الوصول
- **HR/الإدارة:** Route جديد `/reports/hr-branch-hours` + بطاقة داخل `HrCommandCenter` (قسم "الوقت والحضور").
- **بوابة الادارة (Malaki):** يتم إضافة قسم "ساعات الفروع" داخل `PortalDashboard` (تبويب reports/more) يفتح نفس المكوّن.

### 4) الأمان
نفس آلية `malaki-data` الحالية (تحديد data owner من JWT). الاستعلامات كلها service role مفلترة بـ`user_id = linkedUserId`.

## ملاحظات فنية
```text
تقسيم الساعات لكل زوج (in→out):
  day_h     = overlap([in,out], [09:00, 17:00])
  evening_h = overlap([in,out], [17:00, next 06:00])
overtime يبقى من attendance_days.overtime_hours (المعتمد رسمياً).
```

## الخطوات
1. إنشاء action `branch_hours_report` بـ `supabase/functions/malaki-data/index.ts`.
2. إنشاء `src/pages/reports/HRBranchHoursReport.tsx` (يستدعي الـedge function).
3. تسجيل route في `src/App.tsx` تحت حماية HR.
4. إضافة رابط داخل `HrCommandCenter.tsx`.
5. إضافة قسم داخل `PortalDashboard.tsx` يفتح نفس المكوّن بنمط البوابة.

هل أبدأ بالتنفيذ؟
