// Optional per-device schedule for local (on-device) backups. Stored in localStorage per user.
export type BackupFrequency = "off" | "daily" | "weekly" | "monthly";

const key = (userId: string) => `unify:local-backup-schedule:${userId}`;
const DAYS: Record<Exclude<BackupFrequency, "off">, number> = { daily: 1, weekly: 7, monthly: 30 };

export interface BackupSchedule { frequency: BackupFrequency; lastRun: string | null; snoozedUntil?: string | null }

export function getSchedule(userId: string): BackupSchedule {
  try {
    const v = JSON.parse(localStorage.getItem(key(userId)) || "null");
    if (v && v.frequency) return v;
  } catch { /* ignore */ }
  return { frequency: "off", lastRun: null };
}

export function saveSchedule(userId: string, s: BackupSchedule) {
  localStorage.setItem(key(userId), JSON.stringify(s));
}

export function markBackupDone(userId: string) {
  saveSchedule(userId, { ...getSchedule(userId), lastRun: new Date().toISOString(), snoozedUntil: null });
}

export function snooze(userId: string, hours = 4) {
  saveSchedule(userId, { ...getSchedule(userId), snoozedUntil: new Date(Date.now() + hours * 3600_000).toISOString() });
}

// المواعيد تنطلق الساعة 5 صباحًا بتوقيت الجهاز
function todayAt5(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(5, 0, 0, 0);
  return d;
}

export function nextDue(s: BackupSchedule): Date | null {
  if (s.frequency === "off") null;
  if (!s.lastRun) return new Date();
  const last = new Date(s.lastRun);
  if (s.frequency === "daily") {
    const today5 = todayAt5();
    if (last >= today5) return new Date(today5.getTime() + 86400_000); // خلاص عمل اليوم، الجاي بكرة 5 صباحًا
    return today5; // الموعد اليوم 5 صباحًا (إذا فتح البرنامج بعدها بينذكّره)
  }
  return new Date(last.getTime() + DAYS[s.frequency] * 86400_000);
}

export function isDue(s: BackupSchedule): boolean {
  const due = nextDue(s);
  if (!due) return false;
  if (s.snoozedUntil && new Date(s.snoozedUntil) > new Date()) return false;
  return due <= new Date();
}
