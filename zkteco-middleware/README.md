# ZKTeco K40 Middleware — دليل التشغيل

## المتطلبات
- Node.js 18+
- جهاز ZKTeco K40 على نفس الشبكة

## التثبيت

```bash
cd zkteco-middleware
npm install
```

## الإعداد

عدّل ملف `.env` في هذا المجلد:

```env
# عنوان IP جهاز البصمة
ZKTECO_IP=192.168.1.100
ZKTECO_PORT=4370

# رابط النظام السحابي
WEBHOOK_URL=https://omwuyscprzexgmxgittp.supabase.co/functions/v1/zkteco-webhook

# المفتاح السري (نفس القيمة اللي أدخلتها في Lovable)
WEBHOOK_SECRET=YOUR_SECRET_HERE

# فترة المزامنة بالثواني (الافتراضي: 60 ثانية)
SYNC_INTERVAL=60
```

## التشغيل

```bash
npm start
```

## التشغيل كخدمة (Windows)

```bash
npm install -g pm2
pm2 start index.js --name zkteco-sync
pm2 save
pm2 startup
```

## التشغيل كخدمة (Linux)

```bash
npm install -g pm2
pm2 start index.js --name zkteco-sync
pm2 save
pm2 startup systemd
```
