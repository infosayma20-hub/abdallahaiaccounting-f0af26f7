/**
 * Customer Order Display — public, full-screen restaurant ordering board.
 * URL: /pos/order-display?token=<device-token>
 *
 * Right column: "قيد التحضير" (pending + preparing).
 * Left column: "جاهز للاستلام" (ready) — newest pulses + voice call.
 *
 * Auth: device token-based via RPC `kds_get_active_tickets`, no login.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { speakOrderCall, playChime, ensureVoicesLoaded, playFallbackAlert, getLastVoiceError } from "@/lib/kds-voice";

interface OrderRow {
  order_id: string;
  display_number: string | null;
  order_number: string | null;
  status: "preparing" | "ready" | string;
  ready_at: string | null;
  last_called_at: string | null;
  call_count: number;
  created_at: string;
}

const POLL_MS = 4000;
const HEARTBEAT_MS = 30000;
const STALE_MS = 15000;

export default function CustomerOrderDisplayPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [companyName, setCompanyName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [voiceTemplate, setVoiceTemplate] = useState<string>("طلب رقم {n}، تفضل للاستلام");
  const [voiceLang, setVoiceLang] = useState<string>("ar-PS");
  const [voiceMode, setVoiceMode] = useState<string>("browser_tts");
  const [lastSyncAt, setLastSyncAt] = useState<number>(0);
  const playedEventsRef = useRef<Set<string>>(new Set());
  const storageKey = `kds-played-events:${token}`;

  // Restore played events from localStorage to prevent repeat-on-reload
  useEffect(() => {
    if (!token) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) JSON.parse(raw).forEach((id: string) => playedEventsRef.current.add(id));
    } catch {}
  }, [token, storageKey]);

  const remember = useCallback((id: string) => {
    playedEventsRef.current.add(id);
    try {
      const arr = Array.from(playedEventsRef.current).slice(-200);
      localStorage.setItem(storageKey, JSON.stringify(arr));
    } catch {}
  }, [storageKey]);

  // Unlock browser audio (mobile/TV browsers need a user gesture)
  const unlock = useCallback(() => {
    ensureVoicesLoaded().catch(() => {});
    try { window.speechSynthesis?.speak(new SpeechSynthesisUtterance(" ")); } catch {}
    setAudioUnlocked(true);
  }, []);

  const load = useCallback(async () => {
    if (!token) { setError("لا يوجد توكن جهاز. أضف ?token=... للرابط."); return; }
    const { data, error } = await supabase.rpc("kds_get_active_orders", { _token: token } as any);
    if (error) { setError(error.message); return; }
    setError(null);
    setOrders((data as any[]) || []);
    setLastSyncAt(Date.now());
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, POLL_MS); return () => clearInterval(t); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Heartbeat — keeps last_seen_at fresh in settings
  useEffect(() => {
    if (!token) return;
    const ping = () => { (supabase.rpc("kds_device_heartbeat", { _token: token } as any) as any).then?.(() => {}, () => {}); };
    ping();
    const t = setInterval(ping, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [token]);

  // Fetch tenant branding for idle screen
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { data: dev } = await (supabase as any).from("pos_display_devices")
          .select("company_id, branch_id").eq("token", token).maybeSingle();
        if (!dev) return;
        const { data: cs } = await (supabase as any).from("company_settings")
          .select("company_name, logo_url, pos_voice_template, pos_voice_language, pos_kds_voice_mode")
          .eq("user_id", dev.company_id).maybeSingle();
        if (cs) {
          setCompanyName(cs.company_name || "");
          setLogoUrl(cs.logo_url || "");
          if (cs.pos_voice_template) setVoiceTemplate(cs.pos_voice_template);
          if (cs.pos_voice_language) setVoiceLang(cs.pos_voice_language);
          if (cs.pos_kds_voice_mode) setVoiceMode(cs.pos_kds_voice_mode);
        }
      } catch {}
    })();
  }, [token]);

  // Trigger voice call only for NEW auto_call events we haven't played yet.
  useEffect(() => {
    if (!audioUnlocked) return;
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data } = await supabase.rpc("kds_recent_call_events",
        { _token: token, _since: since } as any);
      if (cancelled || !data) return;
      const events = data as Array<{ id: string; display_number: string | null; event_type: string }>;
      let i = 0;
      for (const ev of events) {
        if (playedEventsRef.current.has(ev.id)) continue;
        remember(ev.id);
        const num = ev.display_number || "";
        if (!num) continue;
        setTimeout(() => {
          playChime();
          setTimeout(() => speakOrderCall(num, {
            template: voiceTemplate, language: voiceLang,
            mode: voiceMode as any, deviceToken: token,
          }), 450);
        }, i * 2500);
        i++;
      }
    })();
    return () => { cancelled = true; };
  }, [orders, audioUnlocked, token, voiceTemplate, voiceLang, remember]);

  const preparing = useMemo(
    () => orders.filter(o => o.status === "preparing"),
    [orders]
  );
  const ready = useMemo(
    () => orders.filter(o => o.status === "ready")
      .sort((a, b) => (b.ready_at || b.created_at).localeCompare(a.ready_at || a.created_at)),
    [orders]
  );
  const lastReady = ready[0];
  const isStale = now - lastSyncAt > STALE_MS;

  // Pulse the newest ready order for ~6s
  const isNewest = (t: OrderRow) => {
    if (!t.ready_at) return false;
    return now - new Date(t.ready_at).getTime() < 6000;
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#0D1B2E] text-white flex items-center justify-center" dir="rtl">
        <div className="text-center p-8">
          <h1 className="text-3xl font-bold mb-3">شاشة عرض الطلبات</h1>
          <p className="text-red-300 text-xl">{error}</p>
          <p className="text-white/50 mt-4 text-sm">اطلب من المسؤول إنشاء جهاز عرض وأخذ التوكن.</p>
        </div>
      </div>
    );
  }

  if (!audioUnlocked) {
    return (
      <button
        onClick={unlock}
        className="min-h-screen w-screen bg-[#0D1B2E] text-white flex flex-col items-center justify-center cursor-pointer"
        dir="rtl"
      >
        <div className="text-6xl mb-6">🔔</div>
        <h1 className="text-4xl font-extrabold mb-3">شاشة عرض الطلبات</h1>
        <p className="text-white/70 text-xl">اضغط لبدء تشغيل الصوت</p>
      </button>
    );
  }

  // Idle screen — no active orders. Shows brand only.
  if (orders.length === 0) {
    return (
      <div className="min-h-screen w-screen bg-[#0D1B2E] text-white flex flex-col items-center justify-center" dir="rtl">
        {logoUrl && <img src={logoUrl} alt="" className="h-32 w-32 object-contain mb-8 opacity-90" />}
        <h1 className="text-6xl font-black tracking-wide mb-3">{companyName || "أهلاً وسهلاً"}</h1>
        <p className="text-white/40 text-2xl">لا توجد طلبات حالياً</p>
        <ConnectionDot ok={!isStale} className="absolute bottom-4 left-4" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D1B2E] text-white flex flex-col" dir="rtl">
      {/* Header */}
      <div className="px-8 py-4 flex items-center justify-between border-b border-white/10">
        <h1 className="text-3xl font-extrabold tracking-wide">{companyName || "طلبات اليوم"}</h1>
        <div className="flex items-center gap-4">
          {isStale && <span className="text-amber-300 text-base animate-pulse">جارٍ إعادة الاتصال…</span>}
          <ConnectionDot ok={!isStale} />
          <div className="text-white/60 text-xl tabular-nums">
            {new Date().toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>

      {/* Last ready spotlight */}
      {lastReady && (
        <div className="bg-gradient-to-l from-emerald-500/20 via-emerald-500/10 to-transparent border-b border-emerald-400/30 px-8 py-8 flex items-center justify-between">
          <div>
            <div className="text-emerald-300 text-3xl font-bold mb-2">آخر رقم جاهز</div>
            <div className="text-emerald-200/70 text-xl">تفضل للاستلام</div>
          </div>
          <div className="text-emerald-200 font-black tabular-nums leading-none" style={{ fontSize: "13rem" }}>
            {lastReady.display_number || lastReady.order_number}
          </div>
        </div>
      )}

      {/* Two columns */}
      <div className="flex-1 grid grid-cols-2 gap-px bg-white/5 overflow-hidden">
        {/* LEFT: Ready */}
        <Column
          title="جاهز للاستلام"
          accent="emerald"
          count={ready.length}
        >
          {ready.map(t => (
            <NumberTile
              key={t.order_id}
              number={t.display_number || t.order_number || "—"}
              tone="ready"
              pulse={isNewest(t)}
            />
          ))}
          {ready.length === 0 && <Empty text="لا يوجد طلبات جاهزة" />}
        </Column>

        {/* RIGHT: Preparing */}
        <Column
          title="قيد التحضير"
          accent="amber"
          count={preparing.length}
        >
          {preparing.map(t => (
            <NumberTile
              key={t.order_id}
              number={t.display_number || t.order_number || "—"}
              tone="preparing"
            />
          ))}
          {preparing.length === 0 && <Empty text="لا توجد طلبات قيد التحضير" />}
        </Column>
      </div>
    </div>
  );
}

function Column({ title, accent, count, children }: {
  title: string; accent: "emerald" | "amber"; count: number; children: React.ReactNode;
}) {
  const colorMap = {
    emerald: { text: "text-emerald-300", dot: "bg-emerald-400" },
    amber: { text: "text-amber-300", dot: "bg-amber-400" },
  } as const;
  const c = colorMap[accent];
  return (
    <div className="bg-[#0D1B2E] flex flex-col">
      <div className="px-6 py-4 flex items-center gap-3 border-b border-white/5">
        <span className={`w-3 h-3 rounded-full ${c.dot} animate-pulse`} />
        <h2 className={`text-3xl font-extrabold ${c.text}`}>{title}</h2>
        <span className="mr-auto text-white/40 text-xl tabular-nums">{count}</span>
      </div>
      <div className="flex-1 p-6 grid grid-cols-3 gap-4 content-start overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function NumberTile({ number, tone, pulse }: { number: string; tone: "ready" | "preparing"; pulse?: boolean }) {
  const cls = tone === "ready"
    ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-100"
    : "bg-amber-500/10 border-amber-400/30 text-amber-100";
  return (
    <div className={`rounded-2xl border-2 ${cls} aspect-square flex items-center justify-center font-black tabular-nums ${pulse ? "animate-pulse ring-4 ring-emerald-300/60 scale-105" : ""} transition-transform`}
         style={{ fontSize: "5rem", lineHeight: 1 }}>
      {number}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="col-span-3 flex items-center justify-center text-white/30 text-2xl py-12">
      {text}
    </div>
  );
}

function ConnectionDot({ ok, className = "" }: { ok: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-xs ${className}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
      <span className="text-white/40">{ok ? "متصل" : "منقطع"}</span>
    </span>
  );
}