# خطة إعادة بناء إرساليات المبيعات

## الهدف
1. إصلاح كل المخاطر الموجودة (5 ثغرات حرجة).
2. توحيد التصميم على Microsoft Dynamics FinanceShell في صفحة القائمة وصفحة الإنشاء/التعديل.
3. إضافة نوعين للإرسالية: **خارجية** (للعميل، تتحول لفاتورة) و **داخلية** (بين المخازن، لا تتحول لفاتورة أبداً، تؤثر على المخزون فقط).
4. شريط إجراءات (Action Pane) مطابق لفاتورة المبيعات (جديد / حفظ / معاينة / طباعة / السابق / التالي / استعلام).

---

## 1. تعديلات قاعدة البيانات

### `delivery_notes` — إضافة أعمدة
- `delivery_type text NOT NULL DEFAULT 'external'` مع CHECK في (`external`, `internal`)
- `from_warehouse_id uuid` → `warehouses(id)` (مطلوب للداخلية، اختياري للخارجية)
- `to_warehouse_id uuid` → `warehouses(id)` (مطلوب للداخلية فقط)
- `to_branch_id uuid` → `branches(id)` (اختياري للداخلية، للتسليم لمقر/فرع)
- توسيع CHECK على `status` ليشمل `('draft','issued','converted','received','cancelled')` (`received` للداخلية بعد الاستلام)

### Trigger موحّد لخصم المخزون (DB-side)
استبدال خصم المخزون من الـ Frontend بـ trigger في قاعدة البيانات:
- `trg_delivery_notes_stock_sync` — يُفعَّل عند:
  - INSERT/UPDATE لحالة `issued` → ينشئ حركات `صادر` من `from_warehouse_id`
  - INSERT لحالة `received` (داخلية) → ينشئ حركات `وارد` لـ `to_warehouse_id`
  - UPDATE من `issued`/`received` لـ `cancelled` → يعكس الحركات السابقة (reverse)
  - DELETE لإرسالية مُصدَرة → يعكس الحركات قبل الحذف
- كل حركات `stock_movements` تحمل `reference_type='delivery_note'` و `reference_id=delivery_notes.id` (مثل مسار الفواتير) لمنع التكرار وتمكين التتبع.

### حماية التحويل المزدوج
- عند `convert_delivery_to_invoice`: إنشاء RPC `convert_delivery_note_to_invoice(p_id)` يعمل atomically:
  - يرفض التحويل إذا `delivery_type='internal'`
  - يرفض إذا `status != 'issued'` (يجب أن يكون المخزون مخصوماً مسبقاً)
  - الفاتورة الناتجة تحمل علم `stock_already_deducted=true` بحيث `trg_invoice_item_stock_sync` لا يعيد الخصم.

### حماية التعديل/الحذف بعد الإصدار
- تعديل البنود/الكميات بعد `issued` ممنوع من DB trigger (إلا للمسودات).
- حذف إرسالية `converted` ممنوع (موجود بالفعل في الـ frontend، نضمنه DB-side).

### Route fix
- إضافة guard على `can_manage_delivery_notes` في `App.tsx`.

---

## 2. صفحة القائمة `/delivery-notes` — FinanceShell

نفس بنية `InvoicesPage`:
- `FinanceShell` بـ breadcrumb `النظام > المبيعات > إرساليات المبيعات`
- **Action Pane** بمجموعات:
  - **جديد**: إرسالية خارجية، إرسالية داخلية
  - **عرض**: تحديث، تصدير CSV
  - **تنقل**: مركز المالية
- **فلاتر FinanceShell** (filterFields): الحالة، النوع (داخلية/خارجية)، التاريخ من-إلى، العميل/المخزن، رقم الإرسالية
- جدول بنفس تصميم الفواتير (نفس density / colors)
- عمود جديد: **النوع** (badge: داخلية / خارجية)
- إجراءات الصف: عرض/تعديل، طباعة، تحويل لفاتورة (للخارجية المُصدَرة فقط)، حذف

---

## 3. صفحة الإنشاء/التعديل `/delivery-notes/new` و `/:id` — FinanceShell

نفس بنية `InvoiceCreatePage`:

### Header + ActionPane (مثل الفاتورة بالضبط)
- **جديد**: إرسالية جديدة، إنشاء مشابه (في وضع التعديل)
- **حفظ**:
  - وضع جديد: حفظ كمسودة / إصدار وخصم المخزون
  - وضع تعديل: تعديل / إلغاء التعديل / حفظ التعديلات / حذف
- **عرض**: معاينة طباعة (modal) / طباعة (window)
- **تنقل**: السابق / التالي / استعلام / فتح مركز المالية

### حقل نوع الإرسالية (Segmented)
أعلى النموذج — `SegmentedTypeSelect` بنفس نمط نوع السند:
- 🚚 **خارجية** (Default): تسليم للعميل، قابلة للتحويل لفاتورة
- 🏭 **داخلية**: نقل بين المخازن، غير قابلة للتحويل لفاتورة

### الحقول الديناميكية حسب النوع

**خارجية:**
- العميل (contact) + اسم نصي
- المخزن المُصدِر (`from_warehouse_id`) — اختياري
- عنوان التسليم، السائق، رقم المركبة
- البنود + الأسعار (تظهر للمحاسب فقط في الطباعة الداخلية)

**داخلية:**
- المخزن المُصدِر (`from_warehouse_id`) — **مطلوب**
- المخزن المستلم (`to_warehouse_id`) — **مطلوب**، أو فرع (`to_branch_id`)
- السائق، رقم المركبة
- البنود (بدون أسعار في طباعة الداخلية، فقط كميات)
- زر إضافي: **تأكيد الاستلام** (يغيّر `status` إلى `received` ويُنشئ حركات `وارد`)

### قواعد التحقق
- داخلية: لا يُسمح بنفس المخزن `from = to`
- لا يُسمح بالإصدار بدون بنود
- لا يُسمح بتعديل النوع بعد الإصدار

---

## 4. قالب الطباعة `DeliveryNotePrintView`

- إضافة معلمة `deliveryType`:
  - **خارجية**: نفس القالب الحالي (مع/بدون أسعار حسب الإعداد)
  - **داخلية**: عنوان "إذن نقل داخلي / Internal Transfer Note"، يعرض المخزن المُصدِر والمستلم، 3 توقيعات (المُسلّم، المستلم، السائق)، بدون أسعار، نص "وثيقة نقل داخلي، لا تُستخدم كفاتورة"
- إصلاح bug الـ URL: `/delivery-notes/${id}` بدل `/delivery-notes/edit/${id}`

---

## 5. ترتيب التنفيذ

1. Migration للجداول/Triggers/RPC
2. Edge Function `convert-delivery-to-invoice` (RPC wrapper مع validation)
3. تحديث `DeliveryNotesPage.tsx` — FinanceShell + فلاتر + عمود النوع
4. تحديث `DeliveryNoteCreatePage.tsx` — FinanceShell + ActionPane + SegmentedTypeSelect + حقول داخلي/خارجي
5. تحديث `DeliveryNotePrintView.tsx` — قالب داخلي + إصلاح URL
6. إضافة guard `can_manage_delivery_notes` في `App.tsx`
7. حفظ memory file: `mem/features/sales/delivery-notes-internal-external.md`

---

## ملاحظات تقنية

- لا تغيير على جدول `delivery_note_items` (نفس البنية تخدم النوعين).
- التحويل لفاتورة يبقى من القائمة فقط (مثل الحالي) لكن عبر RPC atomic.
- حركات المخزون كلها عبر DB triggers — لا خصم/إعادة من الـ Frontend بعد الآن.
- نحافظ على نفس `document_sequences` للترقيم (`DN-YYYY-NNNN`) — يمكن لاحقاً فصل ترقيم الداخلية بـ `IDN-YYYY-NNNN` إذا أردت.
- صلاحية واحدة `can_manage_delivery_notes` تغطي النوعين (يمكن تقسيمها لاحقاً عند الحاجة).
