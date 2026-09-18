-- السماح للمستخدم بحذف مرفقاته الخاصة فقط داخل مجلده في bucket employee-forms
-- (مطلوب لزر حذف الصورة قبل إرسال النموذج). لا يمس مجلد policies ولا مرفقات الآخرين.
CREATE POLICY "Users can delete own employee-forms attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'employee-forms'
  AND (storage.foldername(name))[1] = auth.uid()::text
);