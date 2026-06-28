ALTER TABLE public.accountant_permissions
  ADD COLUMN IF NOT EXISTS can_audit_pos_shifts BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pos_allowed_branch_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.accountant_permissions.can_audit_pos_shifts IS
  'إذا كانت true، يظهر للمحاسب كرت "تدقيق نقطة البيع" ويستطيع دخول /pos-reports (عرض فقط، بدون تصدير).';
COMMENT ON COLUMN public.accountant_permissions.pos_allowed_branch_ids IS
  'قائمة معرّفات الفروع المسموح للمحاسب رؤية أرقامها في تقارير POS. فارغة = كل الفروع. الفروع غير المسموحة تظهر بالاسم فقط مع إخفاء الأرقام.';