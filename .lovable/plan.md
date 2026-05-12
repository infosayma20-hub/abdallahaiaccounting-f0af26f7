
# تحسين صفحة إنشاء الفاتورة

نطاق التغيير محصور في طبقة الواجهة لصفحة إنشاء/تعديل الفاتورة فقط. لا تعديل على schema/migrations، ولا تغيير في حساب الضريبة أو الترحيل أو الطباعة أو PDF.

الملفات المتأثرة (بدون أي تغييرات DB):
- `src/pages/InvoiceCreatePage.tsx` — الجزء الأكبر من العمل
- `src/components/invoice/InlineProductAutocomplete.tsx` — ترتيب النتائج وسلوك Enter
- `src/hooks/useSearchableDropdown.ts` — auto-highlight أول نتيجة
- ملفات جديدة:
  - `src/components/invoice/DraftStatusBadge.tsx` — مؤشر "جاري حفظ المسودة…/تم الحفظ قبل X"
  - `src/components/invoice/DraftsHistoryDialog.tsx` — نافذة سجل المسودات
  - `src/lib/invoiceDraftsRegistry.ts` — قراءة/حذف مسودات الفواتير من localStorage

---

## 1. زر "جديد" يبدأ فاتورة فارغة فعلًا

- زر **"جديد"** الموجود حاليًا (الذي ينقل لـ `/invoices/new` فقط) يصبح يستدعي `startNewInvoice()` يقوم بـ:
  - مسح `form` لقيم افتراضية فارغة (تاريخ اليوم، نوع الفاتورة الحالي، عنصر فارغ واحد).
  - مسح `selectedContact`, `contactSearch`, `customerOverrides`, `attachments`, `invoiceTerms`, `editInvoiceId` (عبر `navigate` لمسار جديد بدون `?edit=`).
  - استدعاء `clearDraft()` للمسودة المرتبطة بالنوع الحالي.
  - إعادة احتساب `nextInvoiceNumber`.
  - تعطيل auto-restore الصامت في هذه الجلسة (flag في الـ ref) حتى لا يقفز ويعيد المسودة فورًا بعد المسح.
- ضبط `useFormDraft` بحيث `autoRestoreWithinMs = 0` افتراضيًا في صفحة الفاتورة (نزيل السلوك الصامت)، والاعتماد كليًا على Banner واضح.

## 2. Autosave + مؤشر حالة الحفظ

- إبقاء `useFormDraft` الحالي (debounce 800ms يفي بالغرض).
- توسيع المسودة لتخزن metadata: `{ contactName, itemCount, total, type, savedAt }` حتى نعرضها في سجل المسودات.
- إضافة `<DraftStatusBadge />` صغير بجانب زر "حفظ" يعرض:
  - "جاري حفظ المسودة…" أثناء الـ debounce
  - "تم حفظ المسودة قبل X ثانية" بعد الحفظ
  - "تعذّر حفظ المسودة" عند فشل localStorage (quota)
- المسودة لا تنشئ فاتورة رسمية، فقط localStorage. مدة الاحتفاظ 7 أيام (cleanup عند تجاوز العمر في القراءة).
- عند نجاح `clearDraft()` بعد إنشاء/تحديث الفاتورة: حذف فوري للمفتاح.

## 3. Banner المسودة بدل الاسترجاع التلقائي

- إذا وُجدت مسودة عند فتح الصفحة في وضع جديد (وليس تعديل/duplicate)، يظهر `DraftRestoreBanner` الحالي بنصّ أوضح:
  - "يوجد مسودة محفوظة من الساعة HH:MM (Y عنصر، الإجمالي ≈ ₪Z)"
  - زر **استعادة المسودة**
  - زر **تجاهل وبدء فاتورة جديدة** → يستدعي `clearDraft()` + `startNewInvoice()`
- حذف منطق `autoRestoreWithinMs` لهذه الصفحة فقط (يبقى لباقي الصفحات بدون تغيير).

## 4. سجل المسودات

- زر صغير في شريط أدوات الفاتورة "المسودات" يفتح `DraftsHistoryDialog`.
- الديالوج يقرأ من localStorage كل مفاتيح `amwali_draft_*invoice_*_new` للمستخدم/الشركة الحالية، ويعرض:
  - التاريخ/الوقت، اسم الزبون، عدد البنود، الإجمالي التقريبي، النوع (مبيعات/مشتريات).
  - زر **استعادة** → يحمّل المسودة في الفورم الحالي.
  - زر **حذف** → يحذف المفتاح.
- Helper جديد `src/lib/invoiceDraftsRegistry.ts`: `listInvoiceDrafts(scope)`, `removeInvoiceDraft(key)`, `getInvoiceDraft(key)`.
- المسودة المسترجعة لا تأخذ `invoice_id` من فاتورة محفوظة (المسودات لا تخزن `editInvoiceId`).

## 5. سلوك Enter في البحث عن الصنف

السبب الجذري: في `useSearchableDropdown` يبدأ `activeIndex = -1`، ومع `headerOptionCount=1` و `onHeaderSelect=onQuickAdd`، أول Enter يختار "تعريف صنف جديد".

الإصلاحات:
- في `useSearchableDropdown`: إضافة خيار `autoHighlightFirstItem` (افتراضي false للحفاظ على التوافق). في `InlineProductAutocomplete` نفعّله. عندما `items.length > 0` و `activeIndex === -1`، اضبط على 0 تلقائيًا، ولا تنزل أبدًا تلقائيًا إلى header.
- التنقل بالأسهم لا يصل إلى header إلا بـ ArrowUp من أول عنصر بشكل صريح (نمنعه بـ `min = 0` عند `autoHighlightFirstItem`).
- "تعريف صنف جديد" يبقى في القائمة لكن كزر منفصل ولا يُختار بـ Enter إلا إذا المستخدم نقره أو نزل إليه يدويًا. سننقله بصريًا ليكون أسفل النتائج بدلًا من رأسها (إن وُجدت نتائج).
- إذا لا توجد نتائج: يظهر زر "تعريف صنف جديد" واضحًا، ويتطلب نقرة مباشرة (لا ينفّذ Enter بدون selection صريح).
- Esc يغلق القائمة (موجود).

## 6. تدفق الكيبورد بين الأعمدة

- بعد اختيار صنف → focus ينتقل إلى خانة الكمية لنفس السطر (الحالي يعتمد على ترتيب DOM؛ نحوّله لاستدعاء `focusCell("qty", itemId)` صريح من `onSelect`).
- Enter في الكمية → السعر، السعر → الخصم، الخصم → الضريبة (حقل النسبة)، الضريبة → سطر جديد + focus على بحث الصنف.
- نضيف `data-invoice-tax="${itemId}"` ونحدّث `focusNextInvoiceCell` ليشمل التسلسل الجديد: qty → price → discount → tax → next-row search/qty.
- Shift+Enter يرجع للخلف بنفس التسلسل.

## 7. حقل الضريبة كنسبة

- استبدال `Select` الحالي للـ tax category بـ:
  - `Input type="number"` لنسبة الضريبة (`taxRate`) بعرض ضيق + مجموعة أزرار presets `16% / 0% / معفي`.
  - عند اختيار "معفي" → `taxRate=0, taxCategory="exempt"`. "0%" → `taxRate=0, taxCategory="zero"`. كتابة 16 (أو غيرها) → `taxCategory="taxable"`.
- لا نمسّ دالة `calcItemSubtotal` ولا أي حساب — نحن فقط نعدّل واجهة الإدخال. القيمة المخزّنة لا تتغير شكلًا.

## 8. منع خلط المسودة مع فاتورة محفوظة

- `useFormDraft` معطّل أصلًا في `isEditMode`. سنضيف ضمان إضافي:
  - عند الضغط على "جديد" أثناء التعديل، نستدعي `navigate('/invoices/new', { replace: true })` ثم `startNewInvoice()`.
  - المسودة دائمًا scope بـ `(user, company, type, "new")` بدون `editInvoiceId` → استحالة اختلاطها بفاتورة محفوظة.

## 9. التحقق

- TypeScript build نظيف (الهارنس يبني تلقائيًا).
- اختبار يدوي عبر preview للسيناريوهات السبعة المذكورة في الطلب.

## ممنوع/خارج النطاق

- لا تغييرات في schema أو migrations.
- لا تغيير في منطق الترحيل (transactions, ledger, RPC).
- لا تغيير في PDF/الطباعة.
- لا تغيير في حساب الضريبة الفعلي.
- لا تعديل على باقي الصفحات (UseFormDraft يبقى بسلوكه الحالي لغير الفاتورة).
