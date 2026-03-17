require("dotenv").config();
const ZKLib = require("node-zklib");

const ZKTECO_IP = process.env.ZKTECO_IP || "192.168.1.100";
const ZKTECO_PORT = parseInt(process.env.ZKTECO_PORT || "4370");
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL || "60") * 1000;

// Track last synced timestamp to avoid duplicates
let lastSyncTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // Start from 24h ago

async function connectDevice() {
  const zkInstance = new ZKLib(ZKTECO_IP, ZKTECO_PORT, 10000, 4000);
  await zkInstance.createSocket();
  return zkInstance;
}

async function getNewAttendanceLogs(zkInstance) {
  const logs = await zkInstance.getAttendances();
  
  if (!logs || !logs.data || logs.data.length === 0) {
    return [];
  }

  // Filter logs newer than last sync
  const newLogs = logs.data.filter((log) => {
    const logTime = new Date(log.recordTime);
    return logTime > lastSyncTime;
  });

  return newLogs;
}

async function sendToCloud(punches) {
  if (punches.length === 0) return;

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        action: "sync_punches",
        punches: punches.map((p) => ({
          fingerprint_id: p.deviceUserId || p.userSn,
          timestamp: p.recordTime,
          punch_type: p.type || 0, // 0=check_in, 1=check_out
        })),
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      console.log(
        `✅ [${new Date().toLocaleTimeString("ar-EG")}] تم مزامنة ${result.processed}/${punches.length} بصمة`
      );
      if (result.errors) {
        result.errors.forEach((e) => console.warn(`  ⚠️ ${e}`));
      }
    } else {
      console.error(`❌ خطأ من السيرفر: ${result.error}`);
    }
  } catch (err) {
    console.error(`❌ فشل الاتصال بالسحابة: ${err.message}`);
  }
}

async function syncCycle() {
  let zkInstance;
  try {
    zkInstance = await connectDevice();
    const newLogs = await getNewAttendanceLogs(zkInstance);

    if (newLogs.length > 0) {
      console.log(`📡 وُجدت ${newLogs.length} بصمة جديدة...`);
      await sendToCloud(newLogs);

      // Update last sync time to the latest log
      const latestTime = newLogs.reduce((max, log) => {
        const t = new Date(log.recordTime);
        return t > max ? t : max;
      }, lastSyncTime);
      lastSyncTime = latestTime;
    } else {
      // Silent — no new logs (print every 5 minutes)
      if (Date.now() % (5 * 60 * 1000) < SYNC_INTERVAL) {
        console.log(`⏳ [${new Date().toLocaleTimeString("ar-EG")}] لا توجد بصمات جديدة`);
      }
    }
  } catch (err) {
    console.error(`❌ خطأ في الاتصال بالجهاز: ${err.message}`);
  } finally {
    if (zkInstance) {
      try {
        await zkInstance.disconnect();
      } catch (e) {
        // ignore disconnect errors
      }
    }
  }
}

// Health check on startup
async function healthCheck() {
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": WEBHOOK_SECRET,
      },
      body: JSON.stringify({ action: "ping" }),
    });
    const result = await response.json();
    if (result.success) {
      console.log("✅ الاتصال بالسحابة يعمل بنجاح");
    } else {
      console.error("❌ فشل فحص الاتصال:", result.error);
    }
  } catch (err) {
    console.error("❌ لا يمكن الوصول للسحابة:", err.message);
  }
}

// Main
(async () => {
  console.log("═══════════════════════════════════════");
  console.log("  🔒 ZKTeco K40 → Finix Cloud Sync");
  console.log("═══════════════════════════════════════");
  console.log(`  📍 جهاز البصمة: ${ZKTECO_IP}:${ZKTECO_PORT}`);
  console.log(`  ☁️  السحابة: ${WEBHOOK_URL}`);
  console.log(`  ⏱️  فترة المزامنة: ${SYNC_INTERVAL / 1000} ثانية`);
  console.log("═══════════════════════════════════════\n");

  await healthCheck();

  // Initial sync
  await syncCycle();

  // Periodic sync
  setInterval(syncCycle, SYNC_INTERVAL);
})();
