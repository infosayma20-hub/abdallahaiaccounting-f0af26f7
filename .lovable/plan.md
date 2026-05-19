## إضافة دعم الشيكات في سند قبض المندوب

### 1. UI Changes — `src/pages/rep/RepCollectPage.tsx`

- **Toggle طريقة الدفع** أعلى الصفحة: زرّين `نقدي` / `شيك` (default = نقدي).
- **عند اختيار نقدي**: نفس السلوك الحالي بدون تغيير.
- **عند اختيار شيك**: نُخفي حقل "المبلغ المُحصَّل" الواحد، ونُظهر قائمة شيكات قابلة للإضافة (`+ إضافة شيك`).
  - كل صف شيك يحتوي:
    - رقم الشيك *
    - البنك *
    - تاريخ الاستحقاق * (DatePicker)
    - المبلغ *
    - اسم الساحب (اختياري — افتراضي اسم العميل)
    - فرع البنك (اختياري)
    - تصوير الشيك (input camera/file — اختياري)
    - ملاحظات (اختياري)
  - زر حذف الشيك من القائمة.
- **مجموع الشيكات** يظهر أسفل القائمة (للمراجعة + لفحص Overpayment).
- زر الحفظ: `حفظ سند القبض (N شيك — المجموع X.XX ₪)`.

### 2. Storage Bucket

- إنشاء bucket جديد `cheque-images` (private) عبر migration.
- RLS: المستخدم يقدر يرفع/يقرأ ضمن مجلده `{auth.uid()}/...` فقط.
- مسار التحميل: `cheque-images/{rep.user_id}/{cheque_id_or_uuid}.{ext}`.

### 3. Save Logic

عند حفظ شيك (أو مجموعة شيكات):

1. **رفع الصور** أولاً للـ bucket (إذا وُجدت)، نخزّن `image_url` العائد.
2. **لكل شيك** ننشئ سجل في `cheques` بـ:
   - `cheque_type = 'وارد'`
   - `status = 'مسجل'`
   - `currency = 'ILS'` (حسب constraint الموجود)
   - `party_type = 'عميل'`, `party_name = selectedContact.name`, `contact_id`
   - `linked_account = '1130'` (ذمم العميل المعكوسة)
   - `cheque_number`, `bank_name`, `account_number` (= فرع البنك)، `cheque_date` (= تاريخ الاستحقاق)
   - `amount`, `image_url`, `notes`
3. **سند قبض واحد** يجمع كل الشيكات:
   - استدعاء `callCreateReceiptRpc` بـ:
     - `amount = مجموع الشيكات`
     - `paymentMethod = 'شيك'`
     - `cashAccountCode = '1150'` (شيكات برسم التحصيل)
     - `contactAccountCode = '1130'`
   - النتيجة: قيد مدين 1150 / دائن 1130 ✅
4. ربط الشيكات بالسند: `UPDATE cheques SET receipt_voucher_id = ..., linked_transaction_id = ... WHERE id IN (...)`.
5. إنشاء سجل `receipt_vouchers` (مثل المسار النقدي) مع `payment_method='شيك'` و `deposit_account_code='1150'`.
6. وسم الـ transaction بـ `sales_rep_id` (نفس النمط الحالي).

### 4. Overpayment Warning

- نفس المنطق الموجود يبقى: إذا مجموع الشيكات > رصيد العميل → confirm "دفعة مقدمة".

### 5. الحدود وعدم البناء

- **لا** يتم الإيداع من شاشة المندوب (المحاسب يودع لاحقاً من Admin → الشيكات).
- **لا** نضيف حقل العملة — ILS فقط (مطابق لباقي شاشات المندوب).
- **لا** نلمس صفحات Admin/الشيكات — الشيكات الجديدة ستظهر تلقائياً في شاشة "الشيكات الواردة" لأنها تتبع نفس الـ schema.

### 6. Files المتأثرة

- `supabase/migrations/<timestamp>_cheque_images_bucket.sql` (جديد)
- `src/pages/rep/RepCollectPage.tsx` (تعديل رئيسي)

### مخاطر / Edge Cases

- شيك بدون صورة → مسموح.
- شيك مكرّر (نفس البنك + الرقم) → الـ unique index سيرفض الإدراج؛ نُظهر toast واضح.
- فشل رفع صورة لشيك واحد → نُكمل بدون صورة لذلك الشيك (نحفظ `image_url=null`) ونُنبّه.
- لو فشل إنشاء أي شيك بعد إنشاء السند → نُسجّل warning في الـ console فقط (السند نفسه صحيح محاسبياً).
