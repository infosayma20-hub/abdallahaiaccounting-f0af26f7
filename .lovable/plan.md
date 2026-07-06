
# خطة نظام KIOSK للملكي

## 1. الرابط والوضع
- رابط مخصص: `/kiosk/:branchId` (Full Screen، بدون Sidebar/Header)
- كود PIN للخروج (4 أرقام، يُضبط من إعدادات POS)
- Auto-refresh عند عدم النشاط لمدة 60 ثانية → يرجع لشاشة الترحيب

## 2. تدفق الشاشات (Portrait / Touch)

```text
[شاشة ترحيب]  →  [اختيار اللغة عربي/EN]  →  [التصنيفات]
      ↓
[الأصناف داخل التصنيف] → [تفاصيل الصنف + الإضافات + الخيارات]
      ↓
[السلة + المراجعة] → [إدخال الاسم + رقم الجوال]
      ↓
[الدفع بالفيزا]  →  نجاح → [طباعة تذاكر + إيصال + شكراً]
                    ↓
                   فشل → [إعادة المحاولة]  أو  [تحويل للكاشير]
```

## 3. المنيو
- منيو موحد لكل فروع الملكي (يُدار من صفحة تحكم KIOSK)
- عرض التصنيفات كبطاقات كبيرة (Grid 2×N) بصور واضحة
- الأصناف: بطاقات كبيرة (صورة + اسم + سعر + زر "أضف")
- الإضافات/الخيارات: شاشة Modal كبيرة مع أزرار لمس كبيرة (min 80px)
- سلة ثابتة أسفل الشاشة مع زر "متابعة الطلب"

## 4. الدفع
- إدخال بيانات العميل: الاسم + رقم الجوال (إلزامي)
- شاشة الدفع: انتظار قراءة الفيزا (تكامل لاحق مع البنك)
- **عند النجاح**: طباعة تلقائية للتذاكر + الإيصال
- **عند الفشل**: خياران
  - "حاول مرة ثانية" — إعادة المحاولة
  - "ادفع على الكاشير" — يحوّل الطلبية للـPOS الحالي مع علامة "محولة من KIOSK" (زي طلبيات الكولسنتر)

## 5. الطباعة
- نفس آلية POS الحالية بالضبط:
  - تذكرة المطبخ (Kitchen)
  - تذكرة الصخان/البيتزا (Pizza station) حسب نفس منطق `SHARED_KEYWORDS`
  - إيصال العميل (Receipt) — يشمل اسم العميل + رقمه + رقم الطلب
- كل الطباعة عبر SSR Print Bridge v6

## 6. صفحة التحكم بالـKIOSK
داخل بطاقة "نقطة البيع" → تبويب جديد "إعدادات KIOSK":
- تفعيل/تعطيل KIOSK للفرع
- اختيار الأصناف والتصنيفات الظاهرة
- إعداد PIN الخروج
- ربط طابعة الإيصالات + قارئ الفيزا
- شعار وصور الشاشة الترحيبية
- اللغة الافتراضية

## 7. التكامل مع النظام الحالي
- الطلبيات تُسجّل في نفس جدول `sales_invoices` مع `source = 'kiosk'`
- تنعكس مباشرة على المخزون والمحاسبة (بدون ازدواج)
- تظهر في لوحة الكاشير كطلبيات KIOSK (بلون مميز)
- عند "تحويل للكاشير" → تُنشأ كـ Draft معلقة على شاشة الكاشير

## التفاصيل التقنية

**ملفات جديدة:**
- `src/pages/KioskPage.tsx` — الصفحة الرئيسية بتوجيه الشاشات
- `src/components/kiosk/WelcomeScreen.tsx`
- `src/components/kiosk/CategoryGrid.tsx`
- `src/components/kiosk/ItemGrid.tsx`
- `src/components/kiosk/ItemModifiersModal.tsx`
- `src/components/kiosk/CartDrawer.tsx`
- `src/components/kiosk/CustomerInfoStep.tsx`
- `src/components/kiosk/PaymentStep.tsx` (Visa + fallback to cashier)
- `src/components/kiosk/SuccessScreen.tsx`
- `src/components/kiosk/ExitPinDialog.tsx`
- `src/components/pos-settings/KioskSettingsTab.tsx`
- `src/hooks/useKioskSession.ts` — إدارة الجلسة + idle timeout
- `src/lib/kiosk/printRouting.ts` — استخدام نفس منطق `matchesShared` من POS

**قاعدة البيانات:**
- إضافة عمود `source` لـ `sales_invoices` (values: pos/kiosk/callcenter/qamar)
- جدول `kiosk_settings` (branch_id, pin, active, primary_language, welcome_image_url, printer_id, visa_reader_id)
- RLS + GRANT لكل جدول جديد

**الروتنغ:**
- `/kiosk/:branchId` بدون AppLayout (شاشة كاملة)
- `/settings/pos/kiosk` تبويب داخل إعدادات POS

**ملاحظة:** تكامل الفيزا الفعلي مع البنك سيتم لاحقاً — الآن أبني الواجهة والتدفق مع Stub قابل للتبديل.
