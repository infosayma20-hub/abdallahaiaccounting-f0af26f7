/**
 * مراقب سرعة البرنامج (Performance Monitor)
 *
 * الهدف: التمييز بين ثلاثة أسباب للبطء بدل التخمين:
 *  1) server  — طلبات قاعدة البيانات/الخادم بطيئة (الرد تأخر رغم أن الشبكة سليمة)
 *  2) network — الإنترنت نفسه بطيء (زمن الوصول العام مرتفع أو الطلب فشل)
 *  3) device  — المتصفح/الجهاز عالق (Long Tasks تجمّد الواجهة)
 *
 * يعمل بصمت في الخلفية: يلفّ `fetch` ويقيس كل نداء، يقيس نبضة شبكة دورية،
 * ويسجّل العمليات البطيئة فقط (>1.5 ث) في جدول `app_perf_samples` ليقدر
 * المدير يشوف شكاوى البطء بأرقام حقيقية لكل مستخدم وكل شاشة.
 */

export type PerfKind = "server" | "network" | "device";

export interface PerfSample {
  t: number;            // timestamp
  kind: PerfKind;
  label: string;        // اسم الجدول/العملية
  durationMs: number;
  status?: number;
  route: string;
}

const MAX_SAMPLES = 400;
const SLOW_MS = 1500;               // ما فوقه يُعتبر بطيئاً ويُسجَّل
const LONG_TASK_MS = 200;           // تجمّد الواجهة
const PING_EVERY_MS = 60_000;
const FLUSH_EVERY_MS = 30_000;
const MAX_ROWS_PER_FLUSH = 20;

const samples: PerfSample[] = [];
const pending: PerfSample[] = [];
let lastPingMs: number | null = null;
let installed = false;

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => { try { l(); } catch { /* ignore */ } }); }

export function subscribePerf(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getPerfSamples(): PerfSample[] {
  return samples.slice();
}

export function getLastPingMs() { return lastPingMs; }

function push(sample: PerfSample) {
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  if (sample.durationMs >= SLOW_MS) {
    pending.push(sample);
    if (pending.length > 200) pending.splice(0, pending.length - 200);
  }
  emit();
}

/** استخراج اسم مفهوم للعملية من رابط الطلب (اسم الجدول أو الدالة). */
function labelFromUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    const p = u.pathname;
    const rest = p.match(/\/rest\/v1\/([^/?]+)/);
    if (rest) return rest[1];
    const rpc = p.match(/\/rest\/v1\/rpc\/([^/?]+)/);
    if (rpc) return `rpc:${rpc[1]}`;
    const fn = p.match(/\/functions\/v1\/([^/?]+)/);
    if (fn) return `function:${fn[1]}`;
    if (p.includes("/auth/v1/")) return "auth";
    if (p.includes("/storage/v1/")) return "storage";
    return u.host + p;
  } catch {
    return "request";
  }
}

function currentRoute() {
  try { return window.location.pathname; } catch { return "/"; }
}

function connectionLabel(): string {
  const c = (navigator as any)?.connection;
  if (!c) return "unknown";
  return [c.effectiveType, c.downlink ? `${c.downlink}Mbps` : null, c.rtt ? `${c.rtt}ms` : null]
    .filter(Boolean).join(" / ");
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Other";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac/.test(ua) ? "Mac" : "Other";
  const cores = (navigator as any)?.hardwareConcurrency;
  return `${browser} / ${os}${cores ? ` / ${cores} cores` : ""}`;
}

/** نبضة خفيفة للخادم لقياس زمن الشبكة بشكل مستقل عن حجم الاستعلام. */
async function pingBackend() {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!base || !key) return;
  const started = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    await originalFetch(`${base}/rest/v1/`, {
      method: "HEAD",
      headers: { apikey: key },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    lastPingMs = Math.round(performance.now() - started);
  } catch {
    lastPingMs = null;
  }
}

let originalFetch: typeof fetch;

async function flush() {
  if (pending.length === 0) return;
  const batch = pending.splice(0, MAX_ROWS_PER_FLUSH);
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return; // بدون مستخدم مسجّل لا نخزّن شيئاً
    const conn = connectionLabel();
    const dev = deviceLabel();
    await supabase.from("app_perf_samples").insert(
      batch.map((s) => ({
        user_id: uid,
        route: s.route,
        kind: s.kind,
        label: s.label,
        duration_ms: Math.round(s.durationMs),
        status: s.status ?? null,
        ping_ms: lastPingMs,
        connection: conn,
        device: dev,
      })) as any
    );
  } catch {
    /* التسجيل ثانوي — لا يجوز أن يعطّل البرنامج */
  }
}

export function installPerfMonitor() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  originalFetch = window.fetch.bind(window);

  const backendHost = (() => {
    try { return new URL(import.meta.env.VITE_SUPABASE_URL as string).host; } catch { return ""; }
  })();

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const started = performance.now();
    try {
      const res = await originalFetch(input as any, init);
      const dur = performance.now() - started;
      if (backendHost && url.includes(backendHost)) {
        push({ t: Date.now(), kind: "server", label: labelFromUrl(url), durationMs: dur, status: res.status, route: currentRoute() });
      }
      return res;
    } catch (err) {
      const dur = performance.now() - started;
      if (backendHost && url.includes(backendHost)) {
        push({ t: Date.now(), kind: "network", label: labelFromUrl(url), durationMs: dur, status: 0, route: currentRoute() });
      }
      throw err;
    }
  };

  // تجمّد الواجهة (الجهاز/المتصفح)
  try {
    const obs = new PerformanceObserver((list) => {
      list.getEntries().forEach((e) => {
        if (e.duration >= LONG_TASK_MS) {
          push({ t: Date.now(), kind: "device", label: "تجمّد الواجهة", durationMs: e.duration, route: currentRoute() });
        }
      });
    });
    obs.observe({ entryTypes: ["longtask"] });
  } catch { /* غير مدعوم في بعض المتصفحات */ }

  void pingBackend();
  setInterval(() => { void pingBackend(); }, PING_EVERY_MS);
  setInterval(() => { void flush(); }, FLUSH_EVERY_MS);
  window.addEventListener("pagehide", () => { void flush(); });
}

/** ملخّص جاهز للعرض على الشاشة. */
export function summarizePerf(list: PerfSample[] = samples) {
  const server = list.filter((s) => s.kind === "server");
  const netFails = list.filter((s) => s.kind === "network");
  const device = list.filter((s) => s.kind === "device");

  const durations = server.map((s) => s.durationMs).sort((a, b) => a - b);
  const pct = (p: number) => (durations.length ? Math.round(durations[Math.min(durations.length - 1, Math.floor(durations.length * p))]) : 0);

  const byLabel = new Map<string, { label: string; calls: number; total: number; max: number }>();
  server.forEach((s) => {
    const e = byLabel.get(s.label) || { label: s.label, calls: 0, total: 0, max: 0 };
    e.calls += 1; e.total += s.durationMs; e.max = Math.max(e.max, s.durationMs);
    byLabel.set(s.label, e);
  });
  const worst = [...byLabel.values()]
    .map((e) => ({ ...e, avg: Math.round(e.total / e.calls), max: Math.round(e.max) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  const slowServer = server.filter((s) => s.durationMs >= SLOW_MS).length;
  const ping = lastPingMs;

  let verdict: { kind: PerfKind | "ok"; text: string };
  if (netFails.length > 2 || (ping !== null && ping > 1200)) {
    verdict = { kind: "network", text: "البطء غالباً من الإنترنت — زمن الوصول للخادم مرتفع أو فيه طلبات فشلت." };
  } else if (slowServer > 0 && pct(0.9) > 1500) {
    verdict = { kind: "server", text: "البطء غالباً من الخادم/الاستعلامات — الشبكة سريعة لكن الردّ متأخر." };
  } else if (device.length > 8) {
    verdict = { kind: "device", text: "البطء غالباً من الجهاز/المتصفح — الواجهة بتتجمّد أثناء المعالجة." };
  } else {
    verdict = { kind: "ok", text: "الأداء طبيعي حالياً — ما في بطء مسجّل في هذه الجلسة." };
  }

  return {
    total: server.length,
    slowServer,
    failed: netFails.length,
    freezes: device.length,
    p50: pct(0.5),
    p90: pct(0.9),
    max: durations.length ? Math.round(durations[durations.length - 1]) : 0,
    ping,
    worst,
    verdict,
  };
}
