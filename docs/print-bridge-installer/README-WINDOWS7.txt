AMWALI Print Bridge — Windows 7 / Server 2008 R2
=================================================

هذه التعليمات مخصصة فقط لأجهزة Windows 7 القديمة.
أجهزة Windows 10 / 11 تستخدم install-bridge.bat كالعادة بدون أي تغيير.

التثبيت:

  1. انسخ كامل مجلد print-bridge إلى C:\print-bridge
  2. كليك يمين على install-bridge-win7.bat واختر "Run as administrator"
  3. السكربت سيقوم تلقائياً بـ:
       - تثبيت Node.js 13.14.0 (آخر نسخة تدعم Windows 7)
       - تثبيت sharp 0.30.7 (آخر نسخة لها prebuilt على Node 13)
       - تثبيت خدمة AmwaliPrintBridge
       - الانتظار حتى 45 ثانية لبدء الخدمة (15 محاولة × 3 ثواني)
       - فحص http://127.0.0.1:3001/health بدون curl ولا Invoke-WebRequest

بعد التثبيت:

  - افتح المتصفح على: http://127.0.0.1:3001/health
  - يجب أن ترى استجابة JSON فيها "status":"ok"

إذا فشل /health:

  1. شغل diagnose-win7.bat كمسؤول — يعرض كل التشخيص بدون -Tail.
  2. شغل start-bridge-win7.bat كمسؤول — يشغل الجسر في نافذة مرئية
     لترى سبب الانهيار الحقيقي مباشرة (مثلاً Node غير متوافق،
     أو sharp ناقص، أو port 3001 محجوز).
  3. أرسل لقطة شاشة لآخر رسالة خطأ.

مهم جداً:

  - لا تشغل install-bridge.bat من نسخة جهاز Windows 10، الفولدر نفسه
    يعمل على الاثنين ولكن نقطة الدخول الموصى بها لـ Windows 7 هي
    install-bridge-win7.bat لأنها أوضح للفني.
  - لا تنصّب نسخة Node حديثة يدوياً على Windows 7. النسخ من v16 وما
    فوق لا تعمل وستجعل الخدمة تنهار صامتاً ولن يردّ /health.
  - لا تغيّر port 3001 ولا endpoint /health.
  - device.json الخاص بالفرع/المحطة لا يُحذف ولا يُستبدل أثناء التحديث
    (يتم أخذ نسخة احتياطية تلقائياً قبل التحديث).

الملفات المهمة في هذا المجلد:

  install-bridge-win7.bat   مُثبت Windows 7 (يستدعي install-bridge.bat
                            مع وضع Legacy التلقائي)
  install-bridge.bat        المُثبت الأصلي — يكتشف Windows 7 تلقائياً
  start-bridge-win7.bat     تشغيل الجسر في نافذة مرئية للتشخيص
  diagnose-win7.bat         تشخيص شامل متوافق مع PowerShell v2
  health-check.vbs          فحص /health عبر MSXML2.XMLHTTP (بدون curl)
  stop-bridge.bat           إيقاف الخدمة
  uninstall-bridge.bat      إزالة الخدمة (لا يحذف device.json)