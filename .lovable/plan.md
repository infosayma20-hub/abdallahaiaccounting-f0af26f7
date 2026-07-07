
# خطة بناء وحدة الإنتاج والتصنيع (BOM) المتكاملة

## الوضع الحالي (بعد بحث معمّق)

- ✅ موجود: جدولين `production_formulas` و `production_formula_items` + `production_orders` + دالة `execute_production_order` (تحرّك مخزون فقط).
- ❌ **مش موجود بالمرة**: أي قيد محاسبي (WIP، مواد خام، منتج تام)، تكلفة عمالة، تكلفة صناعية غير مباشرة، لوت/باتش، BOM متعدد المستويات، نسخ (versions)، هدر (scrap)، إيراد ثانوي (byproduct)، دورة حياة كاملة، تحديث `products.quantity` (مشكلة دقة مخزون قائمة).
- ⚠️ اسم التبويب حالياً: "معادلة الإنتاج" — لازم يصير **"الإنتاج والتصنيع"**.

---

## الأهداف (ما بدنا نبنيه)

1. **BOM احترافي**: مكونات + هدر + إنتاج ثانوي + نسخ + متعدد المستويات + تكلفة عمل + تكلفة غير مباشرة.
2. **دورة إنتاج كاملة**: مسودة → معتمد → قيد التنفيذ → مكتمل → مقفل / ملغي.
3. **ربط محاسبي IFRS كامل**: كل أمر إنتاج يولّد قيود يومية تلقائياً (مواد خام ← WIP ← منتج تام) مع إثبات فروقات التكلفة.
4. **ربط مخزون دقيق**: تحديث `products.quantity` + توليد `stock_movements` لكل حركة + دعم اللوت/الباتش + مستودعات مختلفة للمواد والمنتج.
5. **واجهة عربية سهلة**: تسجيل معادلة، تشغيل أمر إنتاج، معاينة التكلفة قبل التنفيذ، تقارير تكلفة الإنتاج والفروقات.

---

## المخطط المعماري

```text
   المواد الخام (1140)
         │  (اعتماد الأمر → صرف)
         ▼
   إنتاج تحت التشغيل WIP (1145)
     + عمالة مباشرة (5120)
     + تكلفة غير مباشرة (5130)
         │  (إتمام الأمر → استلام)
         ▼
   المنتجات التامة (1148)
         │  (فرق بين تكلفة معيارية وفعلية)
         ▼
   فروق الإنتاج (5140)
```

---

## المراحل (Phased Rollout)

### المرحلة 1 — أساس البيانات وإصلاح الثغرات الحرجة
- **إضافة أعمدة على `products`**: `product_type` (raw/wip/finished/service)، `is_manufactured`، `standard_cost`، `average_cost`، `default_bom_id`.
- **توسيع `production_formulas`**:
  - `version` (رقم النسخة)، `status` (draft/active/archived)، `effective_from`، `effective_to`
  - `expected_yield_pct` (نسبة الإنتاجية المتوقعة)
  - `labor_cost_per_batch`، `overhead_cost_per_batch`، `overhead_rate_pct`
  - `output_warehouse_id`، `raw_warehouse_id`
  - `bom_level` (للـ multi-level)
- **توسيع `production_formula_items`**:
  - `scrap_pct` (نسبة الهدر لهذا المكون)
  - `is_sub_assembly` (هل هو نصف مصنّع من BOM آخر)
  - `sequence` (ترتيب في التصنيع)
- **جدول جديد `production_formula_byproducts`**: منتجات ثانوية تنتج مع الأصلي.
- **توسيع `production_orders`**:
  - أعمدة الحالة: `released_at`، `started_at`، `completed_at`، `closed_at`
  - `planned_quantity` vs `actual_quantity` vs `scrap_quantity`
  - `lot_number`، `production_date`
  - `total_material_cost`، `total_labor_cost`، `total_overhead_cost`، `total_cost`، `unit_cost`
  - `variance_amount`
  - `approved_by`، `posted_by`
- **جدول `production_order_items`** (لقطة snapshot من المعادلة وقت الترحيل — لأن المعادلة قد تتغير لاحقاً):
  - المكون، الكمية المخططة، الكمية الفعلية، التكلفة الوحدوية، إجمالي التكلفة
- **جدول `production_costs`**: سجل مفصّل لكل بند تكلفة (مواد، عمالة، غير مباشرة، فرق).
- **إصلاح باغ حرج**: تحديث `products.quantity` عند حركة الإنتاج (حالياً `execute_production_order` بتضيف `stock_movements` بس ما بتحدّث `quantity` = مخزون خطأ).

### المرحلة 2 — الربط المحاسبي (Accounting Integration)
- **بذر حسابات IFRS** لكل tenant عند التفعيل (لو مش موجودة):
  - 1140 المواد الخام
  - 1145 إنتاج تحت التشغيل
  - 1148 المنتجات التامة
  - 5110/5120/5130/5140 تكاليف مباشرة/عمالة/غير مباشرة/فروق
- **جدول `production_accounting_settings`**: يخزّن لكل شركة أي حسابات تستخدمها للإنتاج (قابلة للتخصيص).
- **دالة `post_production_order_journal(order_id)`**: تولّد قيود اليومية تلقائياً على مراحل:
  1. **اعتماد الأمر (Release)**: مدين 1145 WIP / دائن 1140 مواد خام (بقيمة المواد المصروفة)
  2. **إضافة عمالة/تكاليف غير مباشرة**: مدين 1145 / دائن 5120 و 5130
  3. **إتمام الأمر (Complete)**: مدين 1148 منتجات تامة / دائن 1145 WIP (بالتكلفة الفعلية)
  4. **إثبات الفرق**: 5140 فروق الإنتاج (إذا فيه فرق بين المعياري والفعلي)
- **احترام Golden Rule من الذاكرة**: القيود على حسابات فرعية فقط (leaf accounts)، ولا يجوز حذف/تعديل قيد مرحّل — بس نستخدم "عكس القيد" (`create_reverse_entry`).

### المرحلة 3 — دورة حياة الأمر (State Machine)
```text
draft ──approve──▶ approved ──release──▶ in_progress ──complete──▶ completed ──close──▶ closed
   │                                                                     │
   └──cancel──────────────────────────────────────────────────────────────┘ (only before released)
```
- كل انتقال محمي بـ DB trigger + RLS.
- بعد `completed` ممنوع التعديل — بس عكس القيد وإصدار أمر جديد.
- Fiscal period lock: ما يمر أمر إنتاج على فترة مقفلة (احترام memory `fiscal-controls-enforcement`).

### المرحلة 4 — الواجهة العربية
- **إعادة تسمية التبويب** في `navigationConfig.ts`: من "معادلة الإنتاج" إلى **"الإنتاج والتصنيع"** + إضافة أطفال جدد.
- **صفحة معادلات الإنتاج** (تحديث `ProductionFormulasPage`):
  - جدول موسّع: النسخة، الحالة، تكلفة معيارية محسوبة، آخر أمر إنتاج
  - Dialog محسّن بتبويبات: **معلومات أساسية / المكونات / الهدر والإنتاجية / تكاليف إضافية / منتجات ثانوية**
  - زر "معاينة التكلفة" بيحسب تلقائياً
- **صفحة أوامر الإنتاج** (تحديث):
  - سير عمل مرئي (Timeline) لحالة الأمر
  - Dialog تفصيلي: كمية مخططة، تاريخ، مستودع مصدر، مستودع وجهة، رقم لوت
  - شاشة "ترحيل" فيها معاينة القيد المحاسبي قبل التنفيذ (مطابقة لتصميم Journal Entry UX من الذاكرة)
- **صفحة جديدة "تقارير الإنتاج"**:
  - تقرير تكلفة أمر إنتاج (مواد/عمالة/غير مباشرة/إجمالي)
  - تقرير فروق الإنتاج (معياري vs فعلي)
  - تقرير استهلاك المواد الخام
  - تصدير Excel لكل تقرير

### المرحلة 5 — ميزات متقدمة (اختيارية للمستقبل)
- BOM متعدد المستويات (BOM Explosion) — recursive CTE لعرض شجرة المكونات.
- Backflush costing لأوامر متكررة.
- ربط اللوت/الباتش بأوامر الإنتاج (توسيع `product_batches` خارج نطاق Sparta فقط).
- Work Centers / Routing (مراكز عمل ومحطات إنتاج).
- Quality checks (نقاط فحص جودة قبل الاستلام).
- MRP بسيط: توليد أوامر إنتاج تلقائياً من نقاط إعادة الطلب.

---

## المخاطر والاعتبارات

1. **البيانات القديمة**: أوامر الإنتاج الموجودة حالياً بحالة `posted` — نتركها كما هي ونطبّق الدورة الجديدة على الأوامر الجديدة فقط (backward compatible).
2. **الحسابات المحاسبية**: لو الشركة ما عندها الحسابات المطلوبة، الشاشة تقترح إنشاءها بضغطة واحدة (بدون كسر أي شيء قائم).
3. **الفواتير المرحّلة** (memory: accounting-integrity-policy-v2): أي قيد إنتاج مرحّل ما يتحذف — بس ينعكس.
4. **متعدد المستأجرين** (RLS): كل الجداول الجديدة تلتزم بـ `dataOwnerId`/`company_id` حسب memory الأمان.
5. **الأداء**: `production_costs` و `production_order_items` قد تكبر — نضع فهارس على `production_order_id` و `product_id`.

---

## تفاصيل تقنية (للمرجعية — قد لا تحتاج قراءتها)

- **الجداول الجديدة**: `production_formula_byproducts`, `production_order_items`, `production_costs`, `production_accounting_settings`.
- **الجداول المعدّلة**: `production_formulas`, `production_formula_items`, `production_orders`, `products`.
- **الدوال الجديدة**:
  - `calculate_formula_standard_cost(formula_id)` — تحسب التكلفة المعيارية من المكونات + العمالة + غير المباشرة
  - `explode_bom(formula_id)` — recursive CTE للمستويات المتعددة
  - `release_production_order(order_id)` — يصرف المواد + يولد قيد WIP
  - `complete_production_order(order_id, actual_qty, actual_labor, actual_overhead)` — يستلم المنتج التام + يولد قيود التكلفة والفروق
  - `close_production_order(order_id)` — يقفل الأمر (بعد التسوية)
  - `post_production_order_journal(order_id, phase)` — يولد قيود اليومية
  - `cancel_production_order(order_id)` — يلغي الأمر (فقط قبل الاعتماد)
- **الـ Triggers الجديدة**:
  - `trg_update_product_qty_on_stock_movement` — إصلاح باغ تحديث `products.quantity` (يشمل كل مصادر الحركة)
  - `trg_lock_completed_production_order` — يمنع التعديل بعد `completed`
  - `trg_check_fiscal_period_on_production` — يمنع الترحيل على فترة مقفلة
- **الشاشات المعدّلة**: `ProductionFormulasPage`, `ProductionOrdersPage`.
- **الشاشات الجديدة**: `ProductionCostReportPage`, `ProductionVarianceReportPage`, `ProductionMaterialsUsageReportPage`.
- **التنقّل**: `navigationConfig.ts` — تغيير label وإضافة أطفال جدد.

---

## اقتراح ترتيب التنفيذ

أقترح تنفيذ المراحل واحدة تلو الأخرى، ووقفة موافقة بعد كل مرحلة عشان نتأكد الأمور ماشية صح:

1. **المرحلة 1 أولاً** (أساس + إصلاح باغ المخزون) — تقريباً 3-4 migrations + تحديث `ProductionFormulasPage` بس.
2. بعد الموافقة على 1، ننتقل للربط المحاسبي (المرحلة 2).
3. ثم دورة الحياة (3) والواجهة (4).
4. المرحلة 5 حسب حاجتك المستقبلية.

**هل تعتمد الخطة وأبدأ بالمرحلة 1؟** أو بدك أعدّل شي (مثلاً نبدأ بالربط المحاسبي أولاً، أو نغيّر مسميات الحسابات، أو نضيف/نحذف ميزة)؟
