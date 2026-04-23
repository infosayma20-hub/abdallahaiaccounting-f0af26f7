---
name: journal-templates-system
description: نظام قوالب سندات القيد المحفوظة في DB لكل مستخدم مع تثبيت/استخدام/حذف ومكتبة موحدة
type: feature
---

## نظام قوالب القيود (Journal Templates)

1. **الجدول:** `journal_templates` بـ RLS صارم (auth.uid() = user_id) ويحفظ name/icon/description/default_subtype/default_contact_id/lines (jsonb) + usage_count + last_used_at + is_pinned.

2. **الـ Hook:** `src/hooks/useJournalTemplates.ts` يوفر templates/saveTemplate/deleteTemplate/togglePin/markUsed. الترتيب: مثبّت أولاً ثم الأكثر استخداماً ثم آخر استخدام.

3. **النافذة الموحدة:** `src/components/journal/JournalTemplatesPicker.tsx` بحث + تثبيت + تطبيق + حذف + "حفظ القيد الحالي كقالب" — تستقبل `currentSnapshot` للحفظ الفوري.

4. **التكامل:** زر "القوالب" في `JournalNewPage.tsx` (جنب "إضافة سطر")، وفي `JournalEntryPopup.tsx` خيار "📂 المكتبة الكاملة" داخل قائمة القوالب الثابتة. تطبيق القالب يملأ الأسطر + الـ subtype + الجهة الافتراضية ولا يكتب فوق الوصف الموجود.
