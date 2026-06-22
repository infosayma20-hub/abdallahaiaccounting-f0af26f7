
# الخطة

## 1) تبويب جديد: "دراسة وردية" (Shift Audit)

موقعه في `src/pages/POSReportsPage.tsx` بجانب "الزبائن"، آيقونة `ClipboardList`.

ملف جديد: `src/components/pos-reports/POSShiftAuditReport.tsx` يعرض **نفس بطاقة التشخيص اللي شفتها** للمحاسب (بدون الـAI/ChatBot)، لكل وردية يختارها.

### فلاتر علوية
- **التاريخ** (من بريسِت الصفحة الرئيسي).
- **الفرع**: dropdown يقرأ من `cash_boxes.branch_id` → `branches.name`. عند الاختيار يفلتر الـsessions اللي cash_box.branch_id بطابقه.
- **نوع الوردية**: أزرار segment:
  - الكل
  - صباحي (9:00 → 17:00) — opened_at بهذا النطاق
  - مسائي (17:00 → 03:00 اليوم التالي)
  - تصنيف auto مبنيّ على وقت `opened_at` (ساعة محلية Asia/Hebron).

### بطاقة الوردية (نسخة محاسبية احترافية من الصورة)
ثلاث أقسام داخل Card موحدة:

**أ) ملخص الوردية** (table-style key/value):
Session ID قصير + نسخ، الكاشير، الترمنال، فُتحت/أُغلقت، كاش افتتاحي/إغلاقي، أول وآخر عملية، الفرع، نوع الوردية، المدة.

**ب) الفواتير على السيرفر** (الحقيقة الكاملة):
- إجمالي الفواتير، عدد المدفوعة/الملغية، عدد offline-synced، عدد المعلقة/في الحجر (من pos_orders.sync_status).
- جدول مصغّر: رقم الفاتورة، الوقت، المبلغ، was_offline ✓، sync_status، تنبيه إذا transaction_id بتاعها is_deleted (مكررة محذوفة محاسبياً) — يظهر badge "محذوفة محاسبياً".

**ج) الأرقام الفعلية** (post-filter):
صافي المبيعات، كاش (N دفعة)، بطاقة (N دفعة)، حساب موظف (N)، ملغي (N فاتورة)، **تطابق الكاش** (closing_cash - opening_cash - expected_cash) بألوان: أخضر مطابق / أحمر عجز.

أزرار تحت البطاقة: طباعة الملخص — تصدير Excel — فتح تفاصيل الفواتير (يفتح POSSalesReport مفلتر بنفس session_id).

### مصدر البيانات
Hook خفيف داخل الملف يقرأ:
- `pos_sessions` (للوردية الواحدة المختارة) — مع cash_box → branch.
- `pos_orders` للجلسة (مع `transaction_id`, `was_offline`, `sync_status`, `state`, `total`).
- `pos_payments` (تجميع per method).
- `transactions` IDs المحذوفة لتمييز المكررات.
- يعيد استخدام `excludeVoidedOrders` المنطق نفسه في صفحة الأدمن.

---

## 2) إضافة فلتر الفرع (Branch filter) عام للصفحة

في رأس `POSReportsPage`:
- Dropdown "الفرع" بجانب أزرار التاريخ الموجودة.
- مخزَّن في state ويُمرَّر للـ`usePOSReportsData` (نضيف parameter `branchId`).
- في الـhook: نجيب map session_id → branch_id (من pos_sessions + cash_boxes)، ونفلتر الـorders.
- "الكل" = بدون فلتر (السلوك الحالي).

---

## 3) إعادة تصميم الصفحة بأسلوب Microsoft Dynamics 365 Finance (FinanceShell)

التغييرات في `POSReportsPage.tsx` + بطاقات KPI + الـTabs، **بدون لمس** منطق الـhook ولا منطق التبويبات الداخلية.

### عناصر التصميم الجديدة (Dynamics-like)
- **شريط أوامر علوي (Command Bar)**: شريط رفيع 36px أبيض/مظلم فيه فقط الإجراءات (تحديث، طباعة، Excel) كأيقونات + ليبل صغير 11px، فاصل عمودي بينها — لا أزرار ملوّنة كبيرة.
- **شريط فلاتر ثاني (Filter Bar)**: 40px، فيه: التاريخ (preset chips صغيرة)، الفرع، البحث. خلفية `bg-muted/30` وحد سفلي رفيع.
- **عنوان الصفحة**: سطر واحد فقط، خط 14px bold + breadcrumb 11px أعلاه (تطبيقات › نقطة البيع › التقارير). إزالة العنوان الكبير الحالي.
- **KPI Tiles** (بدل البطاقات الكبيرة الحالية):
  - شبكة 6 أعمدة، tiles مسطحة بحدود 1px فقط، بدون ظلال، بدون خلفية ملونة.
  - كل tile: ليبل uppercase 10px muted + قيمة 20px semibold + delta vs prev period 11px (سهم ↑/↓ + نسبة).
  - مقاس صغير (height ~76px) — كثافة معلومات أعلى.
- **التبويبات**: شريط أفقي مع scroll، underline فقط للنشط (2px primary)، نص 12px، آيقونة 14px، spacing 16px. إزالة الخلفية الذهبية الحالية. سلوك FinanceShell: تحت الفلاتر مباشرة، sticky عند الـscroll.
- **محتوى التبويب**: بدل `Card` كبير بخلفية وعنوان، نستخدم `section` بحد علوي رفيع وعنوان 12px uppercase muted + actions صغيرة يمين العنوان.
- **الجداول**: rows أرفع (40px)، header 11px uppercase muted، zebra خفيف من `bg-muted/20`، حدود `border-border/60` فقط، hover row خفيف.
- **الألوان**: استخدام design tokens فقط (`bg-background`, `bg-card`, `border-border`, `text-foreground/muted-foreground`, `text-primary`). الأرقام المالية: positive = `text-emerald-600`, negative = `text-destructive` (نفس استخدام Dynamics).
- **Typography**: System font stack الموجود (sans). إزالة أي تدرّجات. هوية: حادة، رمادية-بيضاء، رصينة.

### ما يبقى كما هو
- منطق `usePOSReportsData` والـhooks.
- محتوى التبويبات الداخلية (يستفيدون تلقائياً من tokens الجديدة).
- منطق الإلغاء والإجراءات الموجودة.

---

## الملفات المتأثرة

**جديد**
- `src/components/pos-reports/POSShiftAuditReport.tsx` — التبويب الجديد.

**معدّل**
- `src/pages/POSReportsPage.tsx` — Command Bar + Filter Bar + KPI Tiles المحدّثة + التبويب الجديد + Branch filter.
- `src/hooks/usePOSReportsData.ts` — قبول `branchId` اختياري + جلب map الفروع.

**بدون تغيير**
- باقي مكونات التبويبات (تستفيد من الـtokens تلقائياً).
- المنطق المحاسبي وفلتر `is_deleted` المضاف مسبقاً.

---

## نقاط للتأكيد قبل البدء

1. تصنيف الورديات (صباحي/مسائي) auto بناءً على `opened_at` المحلي — هل المعايير: صباحي 09:00–16:59، مسائي 17:00–03:59؟ (نفس اللي ذكرته).
2. التبويب الجديد يعرض **وردية واحدة في كل مرة** (قائمة ورديات يسار + بطاقة تفاصيل يمين)، أم **شبكة بطاقات** لكل وردية في النطاق؟ سأذهب لـ **قائمة + تفاصيل** افتراضياً (هذا الأنسب لمحاسب يدقّق).
3. ما رح ألمس أبعاد الـPDF/الطباعة ولا أحذف KPI موجودة — فقط إعادة تصميم بصري + تبويب إضافي + فلتر فرع.

موافق نبدأ التنفيذ بهذي الخطة؟
