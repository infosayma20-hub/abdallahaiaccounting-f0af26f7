---
name: print-templates-builder-phase2
description: مكتبة قوالب جاهزة حسب القطاع + أساليب كتابة (مختصر/رسمي/تفصيلي/قانوني) في نماذج الطباعة
type: feature
---

## نظام Document Builder — المرحلة الثانية

1. **أساليب الكتابة (Writing Styles):** يوفر `src/components/print-templates/writingStyles.ts` 4 أساليب (short/formal/detailed/legal) مع نصوص جاهزة لكل نوع نموذج (QUO/CON/DEM/...). تطبيق الأسلوب يملأ الحقول النصية الفارغة فقط ولا يكتب فوق إدخال المستخدم.

2. **مكتبة القوالب الجاهزة (Sector Library):** `src/components/print-templates/sectorTemplates.ts` يحتوي 4 قطاعات (مقاولات/تجارة/خدمات/صيانة) مع 3 قوالب جاهزة لكل قطاع. يفتحها زر "مكتبة القوالب الجاهزة" بجانب البحث في `/print-templates`.

3. **التكامل مع Modal الإنشاء:** `PrintTemplateModal` يستقبل `initialData` يطبقه عبر `loadData(d)` التي تعيّن جميع الـ setters المناسبة. الـ `StyleSelector` يستخدم `applyStyle()` لتعبئة الفراغات فقط دون مسح إدخالات المستخدم.

4. **محرر القوالب:** متاح منفصلاً في `/print-templates/designer/:templateType` (موجود سابقاً) ويفتح من أيقونة الـ Palette على بطاقة كل نموذج.