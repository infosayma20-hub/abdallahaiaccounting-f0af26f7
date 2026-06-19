
# خطة معالجة ميزة "خصم وجبات الموظفين" — Malaky

النطاق: حساب `malakybroast@gmail.com` فقط (`dataOwnerId = 0b08eba6-…`). جميع التغييرات backward-compatible للمستأجرين الآخرين.

---

## المرحلة 1 — حماية البيانات وسلامة الرواتب (عاجل)

### 1.1 Migration — تمييز نوع الخصم وحماية الحركات
- إضافة عمود `meal_discount_type TEXT` على `employee_financial_movements` بقيم `'family' | 'individual' | NULL` (NULL = حركات قديمة أو غير-وجبة)
- إضافة عمود `original_full_amount NUMERIC(10,2)` لحفظ مبلغ الفاتورة الكامل قبل الخصم (للتمييز عن `amount` المخصوم)
- إضافة عمود `meal_discount_pct SMALLINT` (10 أو 50)
- Index: `(employee_id, salary_year, salary_month, meal_discount_type)` لتسريع التقارير الشهرية
- إضافة flag `meal_discount_mode TEXT DEFAULT 'single'` على `payroll_settings` (قيم: `'single' | 'dual'`)
- ضبط `dual` للملكي فقط عبر insert منفصل
- Trigger `guard_pos_meal_edit`: يمنع UPDATE/DELETE على صفوف `source_type='pos_meal'` إلا لمن لديه دور `admin` أو `hr_manager`

### 1.2 إعادة قراءة Flag من DB بدل hard-code
- حذف ثابت `MALAKY_OWNER_ID` من `POSPage.tsx`
- تحميل `meal_discount_mode` من `payroll_settings` عند فتح POS، تخزينه بـ state
- إظهار البطاقتين فقط عندما `meal_discount_mode === 'dual'`

### 1.3 إجبار الاختيار قبل التأكيد
- تغيير الـ state الافتراضي لـ `mealDiscountType` إلى `null`
- منع زر "تأكيد الدفع" عندما `paymentMethod === 'employee_account'` و `mode === 'dual'` بدون اختيار
- toast واضح: "الرجاء اختيار نوع الخصم (عائلي/فردي)"

### 1.4 تخزين البيانات الكاملة في الحركة
- عند insert في `employee_financial_movements`:
  - `amount` = المخصوم الفعلي (كما هو الآن — لتوافق الحسابات الحالية)
  - `original_full_amount` = إجمالي الفاتورة
  - `meal_discount_type` = `'family'` أو `'individual'`
  - `meal_discount_pct` = 10 أو 50
- تنظيف `description`/`notes` لتبقى للقراءة فقط (المنطق يعتمد على الأعمدة المنظمة)

---

## المرحلة 2 — منع الخصم المزدوج وشفافية POS

### 2.1 تحذير صريح في صفحة إدخال الرواتب الشهرية
- في `MonthlyPayrollInputPage` للموظفين التابعين لمستأجر `dual` فقط:
  - شريط أصفر أعلى الجدول: "⚠️ حركات POS مسجّلة كمبالغ بعد الخصم. لا تُدخلها مرة أخرى في خانات أكل جماعي/فردي"
  - زر "اعرض حركات POS الشهرية" يفتح modal بتفصيل family/individual للموظف الحالي

### 2.2 ملخص خصم مرئي في POS قبل التأكيد
- داخل بطاقة الموظف في شريط الدفع، تحت أزرار الخصم:
  - "إجمالي الفاتورة: ₪X"
  - "سيُخصم من حسابك: ₪Y (Z%)"
  - "تتحمّل الشركة: ₪(X-Y)"
- نفس البيانات تظهر على إيصال المطبخ كملاحظة صغيرة (لا تظهر على إيصال الزبون)

### 2.3 سقف شهري وحد تنبيه
- حقول جديدة على `payroll_settings`:
  - `meal_monthly_cap_family NUMERIC(10,2) DEFAULT 0` (0 = بلا حد)
  - `meal_monthly_cap_individual NUMERIC(10,2) DEFAULT 0`
  - `meal_monthly_warn_at_pct SMALLINT DEFAULT 80`
- قبل التأكيد: query إجمالي خصم الموظف للشهر الحالي بنفس النوع
- لو > warn_at: toast تحذيري + تأكيد إضافي
- لو > cap: منع كامل مع رسالة "تجاوز السقف الشهري للموظف"

### 2.4 سجل تدقيق صريح للقرار
- إضافة الكاشير في `notes` بصيغة منظمة: `cashier_decision: {pos_user_id}/{cashier_name}`
- (لا يحتاج جدول جديد — `created_by` + `notes` كافيان للمراجعة)

---

## المرحلة 3 — التكامل المحاسبي والتقارير

### 3.1 قيد محاسبي تلقائي اختياري
- خانة جديدة في إعدادات الرواتب: `auto_journal_for_meals BOOLEAN DEFAULT false`
- عند تفعيلها (للملكي): RPC `create_meal_journal_entry(movement_id)` تُستدعى مباشرة بعد insert الحركة
- القيد:
  - مدين: حساب "تكلفة وجبات الموظفين" (5400 أو ما يقابله — قابل للتعديل في الإعدادات)
  - دائن: حساب فرعي للموظف تحت 1130 (ذمم موظفين) بقيمة الخصم الفعلي
  - مدين: حساب "مصاريف رفاهية موظفين" بحصة الشركة (الفرق)
- نخزّن `journal_entry_id` على الحركة لربط ثنائي الاتجاه

### 3.2 صفحة "خصومات الوجبات" داخل ملف الموظف
- تبويب جديد في `useEmployee360`: "وجبات POS"
- يعرض:
  - رسم بياني شهري للمبالغ المخصومة (مفصول family/individual بألوان)
  - جدول كل الحركات مع: التاريخ، رقم الفاتورة، الكاشير، النوع، الإجمالي، المخصوم
  - مجاميع شهرية وسنوية
  - زر تصدير CSV/PDF

### 3.3 إشعار push معزّز للموظف
- تحسين `notify-employee-meal` ليعرض الرصيد الشهري المتراكم:
  > 🍽️ خصم عائلي • ₪9.00
  > فاتورة #POS-0001 • نسبتك: 10%
  > إجمالي وجباتك هذا الشهر: ₪47.50

### 3.4 لوحة مراقبة للإدارة (الملكي)
- صفحة `/hr/meal-deductions` تعرض:
  - مجموع خصومات الوجبات اليومي/الشهري لكل فرع
  - أعلى 10 موظفين خصماً
  - تنبيه عند تجاوز أي موظف 80% من سقفه

---

## ترتيب التنفيذ

1. ✅ المرحلة 1 — Migrations + POS gating + حماية التعديل (مكتملة)
2. ✅ المرحلة 2 — شفافية البيانات + السقوف + شريط تحذير صفحة الرواتب (مكتملة)
3. ✅ المرحلة 3 — تبويب "وجبات POS" داخل ملف الموظف + إشعار push معزّز بالإجمالي الشهري + تفعيل قيد محاسبي اختياري (إعدادات DB جاهزة، توليد القيد التلقائي قابل للتفعيل عند ربط أرقام الحسابات)

---

## ملاحظات تقنية

**Migration واحدة شاملة للمرحلة 1:**
```sql
ALTER TABLE employee_financial_movements
  ADD COLUMN meal_discount_type TEXT
    CHECK (meal_discount_type IN ('family','individual') OR meal_discount_type IS NULL),
  ADD COLUMN original_full_amount NUMERIC(10,2),
  ADD COLUMN meal_discount_pct SMALLINT;

CREATE INDEX idx_efm_meal_monthly
  ON employee_financial_movements(employee_id, salary_year, salary_month, meal_discount_type)
  WHERE source_type = 'pos_meal';

ALTER TABLE payroll_settings
  ADD COLUMN meal_discount_mode TEXT NOT NULL DEFAULT 'single'
    CHECK (meal_discount_mode IN ('single','dual'));

-- guard trigger يمنع تعديل/حذف pos_meal من غير المخوّلين
CREATE OR REPLACE FUNCTION guard_pos_meal_edit() RETURNS TRIGGER ...
```

**ضبط الملكي ضمن نفس الخطوة (insert منفصل بعد الموافقة لتجنب فرضه على نسخ remix).**

**Backward compat:** كل المستأجرين الحاليين `meal_discount_mode='single'` افتراضياً → السلوك الحالي يبقى كما هو 100%.
