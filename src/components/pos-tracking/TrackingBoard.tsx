/**
 * شاشة تتبع الطلبيات — لوحة مشتركة بين الشاشة الداخلية والرابط العام للفرع.
 * تقيس الزمن من لحظة طباعة فاتورة الزبون حتى الضغط على «تم التسليم».
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, RefreshCw, Timer } from "lucide-react";
import { BRAND } from "@/constants/brand";

export interface TrackItem {
  line_id: string;
  product_name: string;
  qty: number;
  printed_at: string;
  delivered_at: string | null;
  target_minutes: number;
  elapsed_seconds: number | null;
  is_late: boolean;
}

export interface TrackOrder {
  order_id: string;
  order_number: string | null;
  display_number: string | null;
  order_type: string | null;
  printed_at: string;
  delivered_at: string | null;
  target_minutes: number;
  elapsed_seconds: number | null;
  is_late: boolean;
  items: TrackItem[];
}

export const fmtDuration = (secs: number) => {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const toneFor = (secs: number, targetMin: number, done: boolean) => {
  const target = Math.max(1, targetMin) * 60;
  if (done) return secs > target
    ? { text: "text-red-300", bg: "bg-red-500/15", ring: "ring-red-500/40" }
    : { text: "text-emerald-300", bg: "bg-emerald-500/15", ring: "ring-emerald-500/40" };
  if (secs > target) return { text: "text-red-300", bg: "bg-red-500/20", ring: "ring-red-500/60" };
  if (secs > target * 0.75) return { text: "text-amber-300", bg: "bg-amber-500/15", ring: "ring-amber-500/40" };
  return { text: "text-emerald-300", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30" };
};

function useTick() {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

interface Props {
  orders: TrackOrder[];
  branchName?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
  loading?: boolean;
  onRefresh?: () => void;
  onDeliverOrder: (orderId: string) => void;
  onDeliverItem: (lineId: string, orderId: string) => void;
  headerExtra?: React.ReactNode;
}

export default function TrackingBoard({
  orders, branchName, companyName, logoUrl, loading, onRefresh,
  onDeliverOrder, onDeliverItem, headerExtra,
}: Props) {
  useTick();
  const now = Date.now();

  const elapsed = (row: { printed_at: string; delivered_at: string | null; elapsed_seconds: number | null }) =>
    row.delivered_at
      ? (row.elapsed_seconds ?? Math.floor((new Date(row.delivered_at).getTime() - new Date(row.printed_at).getTime()) / 1000))
      : Math.floor((now - new Date(row.printed_at).getTime()) / 1000);

  const open = orders.filter(o => !o.delivered_at);
  const lateCount = open.filter(o => elapsed(o) > o.target_minutes * 60).length;
  const doneToday = orders.filter(o => o.delivered_at);
  const avgDone = doneToday.length
    ? Math.round(doneToday.reduce((s, o) => s + elapsed(o), 0) / doneToday.length)
    : 0;

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-[#0D1B2E] text-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0D1B2E]/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center gap-3">
        {logoUrl && <img src={logoUrl} alt={companyName || "شعار الشركة"} className="h-10 w-auto object-contain" />}
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">شاشة تتبع الطلبيات</h1>
          <p className="text-xs text-white/60 truncate">
            {[companyName, branchName].filter(Boolean).join(" — ") || "—"}
          </p>
        </div>
        <div className="mr-auto flex items-center gap-2">
          {headerExtra}
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-white/10">قيد التنفيذ: {open.length}</span>
            <span className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-200">متأخرة: {lateCount}</span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-200">
              متوسط التسليم: {avgDone ? fmtDuration(avgDone) : "—"}
            </span>
          </div>
          {onRefresh && (
            <button onClick={onRefresh} className="p-2 rounded-lg bg-white/10 hover:bg-white/20" title="تحديث">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 p-3 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 content-start">
        {orders.length === 0 && (
          <div className="col-span-full text-center text-white/50 py-20 text-sm">
            {loading ? "جارِ التحميل…" : "لا توجد طلبيات مطبوعة حالياً"}
          </div>
        )}
        {orders.map(o => {
          const secs = elapsed(o);
          const tone = toneFor(secs, o.target_minutes, !!o.delivered_at);
          return (
            <div key={o.order_id} className={`rounded-2xl bg-[#16263d] border border-white/10 ring-1 ${tone.ring} overflow-hidden flex flex-col`}>
              <div className="px-3 py-2 flex items-center justify-between bg-white/5">
                <div className="min-w-0">
                  <div className="font-bold text-base truncate">
                    #{o.display_number || o.order_number || "—"}
                  </div>
                  <div className="text-[11px] text-white/50 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    طُبعت {new Date(o.printed_at).toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" })}
                    {o.order_type ? ` · ${o.order_type}` : ""}
                  </div>
                </div>
                <div className={`text-2xl font-extrabold font-mono tabular-nums px-2.5 py-1 rounded-xl ${tone.bg} ${tone.text}`}>
                  {fmtDuration(secs)}
                </div>
              </div>

              <div className="px-3 py-2 text-[11px] text-white/50 flex items-center gap-1 border-b border-white/5">
                <Timer className="w-3 h-3" /> الهدف: {o.target_minutes} دقيقة
              </div>

              <div className="p-2 space-y-1.5 flex-1">
                {o.items.map(it => {
                  const isecs = elapsed(it);
                  const itone = toneFor(isecs, it.target_minutes, !!it.delivered_at);
                  return (
                    <div key={it.line_id} className="flex items-center gap-2 bg-white/5 rounded-xl px-2 py-1.5">
                      <span className="bg-white/10 text-xs font-bold w-6 h-6 rounded-lg flex items-center justify-center shrink-0">
                        {Number(it.qty)}
                      </span>
                      <span className="text-sm truncate flex-1">{it.product_name}</span>
                      <span className={`text-xs font-mono tabular-nums px-1.5 py-0.5 rounded-md ${itone.bg} ${itone.text}`}>
                        {fmtDuration(isecs)}
                      </span>
                      <span className="text-[10px] text-white/35 shrink-0">/{it.target_minutes}د</span>
                      {it.delivered_at ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <button
                          onClick={() => onDeliverItem(it.line_id, o.order_id)}
                          className="text-[11px] px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/35 shrink-0"
                        >
                          تم
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-2 pt-0">
                {o.delivered_at ? (
                  <div className="w-full text-center text-xs py-2 rounded-xl bg-emerald-500/15 text-emerald-200 font-semibold">
                    سُلّمت خلال {fmtDuration(secs)}
                  </div>
                ) : (
                  <button
                    onClick={() => onDeliverOrder(o.order_id)}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#0D1B2E] font-bold text-sm"
                  >
                    تم التسليم
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unify branding — bottom right corner */}
      <div className="sticky bottom-0 flex justify-end px-4 py-2 bg-gradient-to-t from-[#0D1B2E] to-transparent pointer-events-none">
        <div className="flex items-center gap-2 opacity-80">
          <img src={BRAND.logos.mono} alt={BRAND.nameEn} className="h-6 w-auto object-contain" />
          <span className="text-xs font-semibold tracking-wide">{BRAND.nameEn}</span>
        </div>
      </div>
    </div>
  );
}
