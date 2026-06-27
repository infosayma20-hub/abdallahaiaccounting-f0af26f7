---
name: Print Bridge ZIP Distribution
description: الـ ZIP المُوزَّع على الفروع هو asset مرفوع منفصل، تعديلات الملف docs/ لا تصل تلقائياً
type: feature
---
زر «تحديث برنامج الطباعة» في `src/pages/NewDeviceOnboardingPage.tsx` بينزل من asset pointers:
- `src/assets/amwali-print-bridge.zip.asset.json` (Windows 10/11)
- `src/assets/amwali-print-bridge-win7.zip.asset.json` (Windows 7)

**حرج:** الـ ZIP المرفوع على CDN **لا يُبنى تلقائياً** من `docs/print-bridge-installer/print-bridge-v6.3.7-clean.js`. أي تعديل على ملف الـ bridge في `docs/` يبقى محلياً فقط ولن يصل لأجهزة الفروع حتى يُعاد تغليف الـ ZIP يدوياً (راجع `docs/print-bridge-installer/PACKAGING.txt`) ورفعه كـ asset جديد عبر `lovable-assets`.

**عند أي تعديل على print-bridge-v6.3.7-clean.js:**
1. ذكّر المستخدم أن التعديل لن يصل للفروع حتى يُعاد تغليف ورفع الـ ZIP.
2. اعرض إعادة بناء ورفع الـ ZIP إذا طُلب توزيع التعديل فعلياً.