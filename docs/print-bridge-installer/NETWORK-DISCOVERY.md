# تفعيل اكتشاف طابعات الشبكة في Print Bridge

هذه الإضافة تضيف endpoint واحد فقط:

```
POST http://127.0.0.1:3001/discover-network-printers
```

تستخدمه شاشة `/onboarding/new-device` لاكتشاف طابعات الشبكة تلقائياً
بدون أي تعديل على منطق الطباعة الحالي.

## التثبيت (مرة واحدة لكل جهاز كاشير)

1. انسخ ملف `docs/discover-printers-addon.js` إلى:
   ```
   C:\print-bridge\discover-printers-addon.js
   ```

2. افتح `C:\print-bridge\print-bridge-v6.3.2.js` وأضف **سطر واحد** في أي مكان
   بعد `const app = express();` وقبل `app.listen(...)`:
   ```js
   require('./discover-printers-addon')(app);
   ```

3. أعد تشغيل خدمة Print Bridge:
   ```
   restart-bridge.bat
   ```

عند الإقلاع يجب أن ترى في الـ log:
```
[discover-printers] add-on loaded — POST /discover-network-printers
```

## ضمانات الأمان

- يقبل فقط شبكات RFC1918 الخاصة: `10/8`, `172.16/12`, `192.168/16`.
- يرفض الطلبات من غير `127.0.0.1` / `::1`.
- لا يطبع شيئاً — فقط TCP connect probe.
- حد أقصى 254 host لكل طلب.
- timeout قصير (300ms افتراضي) + concurrency 30.

## شكل الاستجابة

```json
{
  "ok": true,
  "subnet": "192.168.1",
  "port": 9100,
  "scanned": 254,
  "elapsedMs": 1450,
  "found": [
    { "ip": "192.168.1.50", "port": 9100, "status": "open", "label": "طابعة محتملة" }
  ]
}
```

## إذا الجسر لا يدعم هذا الإصدار

شاشة الـ Onboarding ستعرض:
> هذا الإصدار من Print Bridge لا يدعم فحص الشبكة. حدّث الجسر ثم أعد المحاولة.

ولا تتعطل أي وظيفة أخرى.
