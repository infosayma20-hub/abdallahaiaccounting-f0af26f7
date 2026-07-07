## الهدف
إضافة عمود جديد **"مغادرات مؤقتة"** في تقرير الحضور اليومي يبيّن إذا الموظف طلع خلال الدوام ورجع (مثلاً استراحة، مهمة خارجية، صلاة). العمود بيظهر في الجدول عالشاشة + التصدير Excel.

---

## البيانات الموجودة (ما في حاجة نضيف حقول)

جدول `attendance_breaks` موجود مسبقاً وبتخزن فيه بيانات المغادرات المؤقتة عبر تطبيق الموظف:
- `attendance_day_id` (مربوط باليوم في `attendance_days`)
- `break_out` (وقت الخروج المؤقت)
- `break_in` (وقت الرجوع، ممكن يكون null إذا لسا برا)
- `break_type` (prayer / personal / meal / external_task / other)
- `duration_minutes`
- `reason`

كمان `attendance_days.total_break_minutes` بيتحدّث تلقائياً عبر تريجر `trg_attendance_break_sync` — يعني الحسابات المالية ما تتأثر.

---

## التعديلات

### 1) شاشة "لوحة إدارة الحضور" — `src/pages/HRAttendancePage.tsx`

**أ. جلب بيانات المغادرات لليوم المعروض** (داخل `fetchData`):
- استعلام جديد على `attendance_breaks` مفلتر بـ `auth_user_id = dataOwnerId` و `attendance_day_id IN (…)` لسجلات اليوم.
- تخزينها في state جديد: `breaksByDayId: Map<string, BreakRow[]>`.

**ب. عمود جديد في جدول الحضور اليومي** (بعد عمود "إضافي" وقبل "المشكلة"):
- العنوان: **"مغادرات"**
- المحتوى لكل سطر:
  - إذا ما في مغادرات: `—`
  - إذا في: Badge صغير يبيّن **العدد** + **مجموع الدقائق** (مثلاً `2 · 45د`)
  - Tooltip بيفصّل كل مغادرة: `10:15 → 10:45 (استراحة)`
  - إذا في مغادرة مفتوحة (`break_in` = null): لون تحذيري وكلمة "لسا برا"

**ج. لا تغيير على:**
- منطق `computeIssue` / التأخير / الساعات
- الحذف، التعديل، إعادة الحساب
- Realtime subscriptions
- الأعمدة الحالية

### 2) تصدير Excel اليومي — نفس الملف، دالة `exportExcel`

إضافة 3 أعمدة جديدة بعد "المشكلة":
- **"عدد المغادرات"** — رقم
- **"مدة المغادرات (دقيقة)"** — رقم
- **"تفاصيل المغادرات"** — نص متعدد الأسطر (مثلاً `10:15→10:45 استراحة | 13:20→13:35 صلاة`)

- زيادة `!cols` بـ 3 عناصر مطابقة.
- في وضع "التقرير الشامل" (`useReportFilters = true`): جلب المغادرات لكامل الفترة قبل بناء الصفوف.

### 3) لا نلمس

- `HRAttendanceReport.tsx` (تقرير مبسّط منفصل) — نتركه كما هو (المستخدم أشار للتقرير الشامل، مش هاد).
- `MonthlyAttendanceTab.tsx` — أصلاً بيعرض المغادرات بشكل تفصيلي لكل يوم؛ ما في داعي نعدل.
- شاشة الموظف `EmployeeAttendancePage.tsx` — ما في تغيير.
- جدول `attendance_breaks` — بدون migrations.

---

## قسم فني (للمرجع)

**Query جديد:**
```ts
const dayIds = (att || []).map(r => r.id);
const { data: brks } = await supabase
  .from("attendance_breaks")
  .select("id, attendance_day_id, break_out, break_in, break_type, duration_minutes, reason")
  .in("attendance_day_id", dayIds);
```

**Aggregator بسيط:**
```ts
type BreakSummary = { count: number; totalMin: number; items: BreakRow[]; hasOpen: boolean };
const breaksByDay = new Map<string, BreakSummary>();
```

**نص التصدير للتفاصيل:**
```
HH:mm → HH:mm (نوع)
```
مفصولة بـ ` | `. مغادرة مفتوحة تظهر كـ `HH:mm → لسا برا`.

**RLS:** سياسات `attendance_breaks` بتسمح لـ HR/admin يشوفوا مغادرات فريقهم — نفس نمط `attendance_events`، ما في مشكلة صلاحيات.

**التحقق:**
- بعد التعديل: build check + فتح `/hr-attendance` والتأكد إن العمود يظهر، والتصدير يحتوي الأعمدة الجديدة، وعدم كسر باقي الأعمدة.

---

## خارج النطاق

- تعديل منطق حساب الساعات (التريجر بيتكفل).
- تعديل شاشة موظف أو التطبيق.
- إضافة حقول جديدة في القاعدة.
