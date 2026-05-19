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
import { speakOrderCall, playChime, ensureVoicesLoaded } from "@/lib/kds-voice";

interface Ticket {
  id: string;
  display_number: string | null;
  order_number: string | null;
  status: "pending" | "preparing" | "ready" | string;
  ready_at: string | null;
  last_called_at: string | null;
  call_count: number;
  created_at: string;
}

const POLL_MS = 4000;

export default function CustomerOrderDisplayPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const announcedRef = useRef<Set<string>>(new Set());

  // Unlock browser audio (mobile/TV browsers need a user gesture)
  const unlock = useCallback(() => {
    ensureVoicesLoaded().catch(() => {});
    try { window.speechSynthesis?.speak(new SpeechSynthesisUtterance(" ")); } catch {}
    setAudioUnlocked(true);
  }, []);

  const load = useCallback(async () => {
    if (!token) { setError("لا يوجد توكن جهاز. أضف ?token=... للرابط."); return; }
    const { data, error } = await supabase.rpc("kds_get_active_tickets", { _token: token } as any);
    if (error) { setError(error.message); return; }
    setError(null);
    setTickets((data as any[]) || []);
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, POLL_MS); return () => clearInterval(t); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Trigger voice call for newly-ready tickets
  useEffect(() => {
    if (!audioUnlocked) return;
    const fresh = tickets.filter(t => t.status === "ready" && !announcedRef.current.has(t.id));
    fresh.forEach((t, i) => {
      announcedRef.current.add(t.id);
      const num = t.display_number || t.order_number || "";
      if (!num) return;
      setTimeout(() => {
        playChime();
        setTimeout(() => speakOrderCall(num), 450);
      }, i * 2500);
    });
  }, [tickets, audioUnlocked]);

  const preparing = useMemo(
    () => tickets.filter(t => t.status === "pending" || t.status === "preparing"),
    [tickets]
  );
  const ready = useMemo(
    () => tickets.filter(t => t.status === "ready")
      .sort((a, b) => (b.ready_at || b.created_at).localeCompare(a.ready_at || a.created_at)),
    [tickets]
  );
  const lastReady = ready[0];

  // Pulse the newest ready ticket for ~6s
  const isNewest = (t: Ticket) => {
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

  return (
    <div className="min-h-screen bg-[#0D1B2E] text-white flex flex-col" dir="rtl">
      {/* Header */}
      <div className="px-8 py-4 flex items-center justify-between border-b border-white/10">
        <h1 className="text-2xl font-extrabold tracking-wide">طلبات اليوم</h1>
        <div className="text-white/60 text-lg tabular-nums">
          {new Date().toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {/* Last ready spotlight */}
      {lastReady && (
        <div className="bg-gradient-to-l from-emerald-500/20 via-emerald-500/10 to-transparent border-b border-emerald-400/30 px-8 py-6 flex items-center justify-between">
          <div>
            <div className="text-emerald-300 text-2xl font-bold mb-1">آخر رقم جاهز</div>
            <div className="text-emerald-200/70 text-base">تفضل للاستلام</div>
          </div>
          <div className="text-emerald-200 font-black tabular-nums leading-none" style={{ fontSize: "9rem" }}>
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
              key={t.id}
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
              key={t.id}
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
         style={{ fontSize: "3.75rem", lineHeight: 1 }}>
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