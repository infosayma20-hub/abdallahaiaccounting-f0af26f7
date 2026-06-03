## تدقيق إغلاق عهدة POS متعدد العملات + يوم عمل POS

### 1) نتائج التدقيق على المعادلات الحالية (POSPage.tsx ≈ 3700-3790)

**عقد البيانات في `pos_payments` (مثبَّت من `complete_pos_order`):**
- `amount` → دائماً **بالشيكل** = إجمالي الفاتورة.
- `tendered` → دائماً **بالشيكل** (لو الدفع بعملة أجنبية يُحفظ `tendered × rate`).
- `currency` → عملة الدفع التي اختارها الزبون (ILS/USD/JOD).
- `exchange_rate` → سعر صرف العملة الأجنبية مقابل الشيكل.
- `change_amount` → بوحدة `change_currency` (شيكل لو الباقي شيكل، دينار لو دينار … إلخ). **هذا مهم وموثّق في الكود.**
- `change_currency` → عملة الباقي الفعلي.

**المعادلات الحالية:**

```text
foreignTenderedFOREIGN = tendered_ILS / exchange_rate        ← يعكس النقد المستلم فعلياً بالعملة الأجنبية
foreignChange[CUR]     = SUM(change_amount حيث change_currency = CUR)

expectedILS = opening
            + cash_payments(currency=ILS).amount          ← مبيعات نقدية شيكل
            − foreignChangeILS                            ← باقي بالشيكل لطلبات بعملة أجنبية
            − pos_expenses (نقدي)
            − pos_purchases (نقدي)
            − returnsILS (مرتجعات نقدية شيكل)

expectedUSD = foreignTenderedUSD − foreignChangeUSD − returnsUSD
expectedJOD = foreignTenderedJOD − foreignChangeJOD − returnsJOD
```

**اختبار المثال (10 JOD، فاتورة 23.86 ₪، باقي 17 ₪):**
- `tendered = 40.86`, `currency=JOD`, `rate=4.086`, `change_amount=17`, `change_currency=ILS`.
- `foreignTenderedJOD = 40.86 / 4.086 = 10` ✅
- `foreignChangeILS += 17` ✅
- `expectedJOD = +10` ✅ ، `expectedILS −= 17` ✅
- **النتيجة:** المعادلات الحالية صحيحة لهذه الحالة. لا حاجة لتعديل منطقي على الإغلاق.

**الإصلاحات التجميلية فقط:**
- توضيح في `paymentMethodBreakdown` أن `amount` بالشيكل دائماً (تسمية مضللة في تقرير لاحقاً) → إضافة تعليق فقط.
- استخراج معادلات الإغلاق من `POSPage.tsx` إلى ملف خدمي `src/lib/pos/shift-close-math.ts` ليُختبَر وحدوياً.

### 2) المشكلة الفعلية: يوم عمل POS غير مُعمم

دالة `getPosAccountingDate` موجودة **inline** داخل `POSPage.tsx` فقط (سطر 3639) وتستخدم لمرة واحدة. كل تقارير POS (`src/lib/reports/pos-report-loaders.ts`، `src/hooks/usePOSReportsData.ts`، `POSReportsPage`، `POSShiftsReport` …) تفلتر بـ `created_at::date` مباشرة → فاتورة الساعة 02:00 ص تظهر في اليوم الخطأ.

### 3) التنفيذ (مرحلتين)

#### المرحلة A — يوم العمل المركزي (الأهم)

1. **Helper موحّد** — `src/lib/pos/business-day.ts`:
   ```ts
   getPosBusinessDate(ts: string|Date, cutoffHour=6): string   // YYYY-MM-DD
   getPosBusinessDayRange(date: string, cutoffHour=6): { start, end } // ISO
   ```
2. **عمود مُولَّد + دالة SQL (idempotent migration):**
   - `CREATE FUNCTION public.pos_business_date(ts timestamptz, cutoff int DEFAULT 6) RETURNS date IMMUTABLE`.
   - `ALTER TABLE pos_orders ADD COLUMN business_date date` (nullable في البداية، لا backfill قسري لتجنب لمس البيانات القديمة).
   - تريغر `BEFORE INSERT/UPDATE` يملأها من `COALESCE(paid_at, created_at)` ومن `company_settings.pos_day_cutoff_hour` للـ owner.
   - فهرس `(user_id, business_date)`.
3. **تعديل أماكن استخدام التواريخ في POS فقط** (لا تمس van/invoice/CRM):
   - `src/lib/reports/pos-report-loaders.ts` — التحويل من `created_at` إلى `business_date` (مع fallback لـ `created_at` للسجلات القديمة عبر COALESCE في الـ select أو الاعتماد على التريغر للسجلات الجديدة + UI تنبيه).
   - `src/hooks/usePOSReportsData.ts`، `POSReportsPage`، `POSShiftsReport`، `usePOSShiftWatcher` إن لزم.
   - استبدال `getPosAccountingDate` المحلي في `POSPage.tsx` باستيراد الـ helper الموحّد.
4. **`company_settings.pos_day_cutoff_hour`** — موجود فعلاً (default 6) ✅.
5. **إغلاق الوردية** يبقى يعتمد على `session_id` (وليس التاريخ)، فلا تأثر بمنتصف الليل.

#### المرحلة B — استخراج معادلات الإغلاق + اختبارات

1. **استخراج** `computeExpectedCashPerCurrency()` و `computeReturnsByCurrency()` إلى `src/lib/pos/shift-close-math.ts` (pure functions).
2. **اختبارات وحدوية** `src/lib/pos/__tests__/shift-close-math.test.ts` تغطي السيناريوهات الثمانية المطلوبة:
   - ILS نقدي قبل/بعد منتصف الليل (يوم عمل صحيح).
   - JOD مع باقي ILS → JOD يزيد 10، ILS ينقص 17.
   - USD مع باقي USD.
   - بطاقة → لا تأثير.
   - مرتجع نقدي ILS / JOD.
   - مصروف نقدي ILS.
3. **عرض شاشة الإغلاق** — مكوّن `CloseShiftDialog` يعرض جدول صفوف (متوقع / فعلي / فرق) لكل عملة + سطر مجموع الفرق بالشيكل لأغراض التقرير فقط (موجود جزئياً في `ShiftSummaryReceipt`، ننقل المنطق نفسه للحوار).

### 4) القيود والحماية

- لا تغيير على `complete_pos_order` / `process_pos_return` / `close_pos_session_atomic`.
- لا تغيير على دفتر اليومية أو القيود المحاسبية.
- لا تغيير على الطباعة (KitchenTicket/Receipt).
- Migration idempotent: `CREATE OR REPLACE FUNCTION`, `ADD COLUMN IF NOT EXISTS`, `CREATE TRIGGER` بعد `DROP IF EXISTS`.
- السجلات القديمة لـ `pos_orders` تبقى بـ `business_date = NULL`؛ التقارير تستخدم `COALESCE(business_date, (paid_at AT TIME ZONE …)::date - CASE WHEN EXTRACT(HOUR FROM paid_at) < cutoff THEN 1 ELSE 0 END)` أو ببساطة `COALESCE(business_date, paid_at::date)` مع ملاحظة في الكود.

### تفاصيل تقنية

**Migration (مختصرة):**
```sql
CREATE OR REPLACE FUNCTION public.pos_business_date(ts timestamptz, cutoff int DEFAULT 6)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE WHEN EXTRACT(HOUR FROM ts) < cutoff
               THEN (ts::date - 1) ELSE ts::date END);
$$;

ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS business_date date;
CREATE INDEX IF NOT EXISTS idx_pos_orders_business_date ON public.pos_orders(user_id, business_date);

CREATE OR REPLACE FUNCTION public._pos_orders_set_business_date()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_cutoff int;
BEGIN
  SELECT COALESCE(pos_day_cutoff_hour, 6) INTO v_cutoff
    FROM public.company_settings WHERE user_id = NEW.user_id LIMIT 1;
  NEW.business_date := public.pos_business_date(COALESCE(NEW.paid_at, NEW.created_at), COALESCE(v_cutoff,6));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pos_orders_business_date ON public.pos_orders;
CREATE TRIGGER trg_pos_orders_business_date
BEFORE INSERT OR UPDATE OF paid_at, created_at ON public.pos_orders
FOR EACH ROW EXECUTE FUNCTION public._pos_orders_set_business_date();
```

**ملفات ستُعدَّل:**
- جديد: `src/lib/pos/business-day.ts`, `src/lib/pos/shift-close-math.ts`, `src/lib/pos/__tests__/shift-close-math.test.ts`.
- معدَّل: `src/pages/POSPage.tsx` (استبدال inline helper)، `src/lib/reports/pos-report-loaders.ts`، `src/hooks/usePOSReportsData.ts`، `src/pages/POSReportsPage.tsx`، `src/components/pos-reports/POSShiftsReport.tsx`.
- Migration واحدة جديدة فقط.

### ملخص المعادلات النهائية

```text
يوم العمل: business_date = pos_business_date(paid_at OR created_at, cutoff=6)

عهدة شيكل   = opening + Σ(payments ILS نقدي).amount
            − Σ(change_amount حيث change_currency=ILS لطلبات أجنبية)
            − مصاريف نقدية − مشتريات نقدية − مرتجعات نقدية ILS

عهدة USD/JOD = Σ(tendered/exchange_rate حيث currency=CUR ونقدي)
             − Σ(change_amount حيث change_currency=CUR)
             − مرتجعات نقدية CUR

variance(CUR) = actual(CUR) − expected(CUR)
totalVariance_ILS_equiv = Σ variance(CUR) × rate(CUR)  [للتقرير فقط]
```

الموافقة على الخطة تبدأ التنفيذ.
