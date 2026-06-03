import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Calendar, MapPin, Receipt, PhoneOff, Phone, MessageCircle,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";

export interface FollowupRow {
  customer_id: string | null;
  full_name: string | null;
  display_phone: string | null;
  normalized_phone: string;
  branch_id: string | null;
  branch_name: string | null;
  last_order_at: string;
  orders_count: number;
  total_spent: number | null;
  do_not_call: boolean;
  last_call_at: string | null;
  last_call_outcome: string | null;
  last_sentiment: string | null;
  last_rating: number | null;
  last_note: string | null;
  needs_followup_at: string | null;
}

type PresetKey = "today" | "yesterday" | "last3" | "last7" | "custom";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today",     label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "last3",     label: "آخر 3 أيام" },
  { key: "last7",     label: "آخر 7 أيام" },
  { key: "custom",    label: "مخصص" },
];

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeFor(preset: PresetKey): { from: string; to: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const to = ymd(today);
  if (preset === "today") return { from: to, to };
  if (preset === "yesterday") {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    const s = ymd(y);
    return { from: s, to: s };
  }
  if (preset === "last3") {
    const f = new Date(today); f.setDate(f.getDate() - 2);
    return { from: ymd(f), to };
  }
  // last7
  const f = new Date(today); f.setDate(f.getDate() - 6);
  return { from: ymd(f), to };
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("ar-EG", {
      month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return s; }
}

function outcomeLabel(o: string | null): { text: string; cls: string } {
  if (!o) return { text: "لم يتم الاتصال", cls: "bg-muted text-muted-foreground" };
  switch (o) {
    case "answered":           return { text: "تم الاتصال", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" };
    case "no_answer":          return { text: "لم يرد",     cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" };
    case "busy":               return { text: "مشغول",      cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" };
    case "wrong_number":       return { text: "رقم خاطئ",   cls: "bg-rose-500/15 text-rose-700 dark:text-rose-400" };
    case "callback_requested": return { text: "يحتاج متابعة", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-400" };
    case "refused":            return { text: "رفض",        cls: "bg-rose-500/15 text-rose-700 dark:text-rose-400" };
    default:                   return { text: o, cls: "bg-muted text-muted-foreground" };
  }
}

function sentimentLabel(s: string | null): string | null {
  switch (s) {
    case "satisfied":   return "راضٍ";
    case "neutral":     return "محايد";
    case "unsatisfied": return "غير راضٍ";
    case "complaint":   return "شكوى";
    case "suggestion":  return "اقتراح";
    default:            return null;
  }
}

function whatsappHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 7) return null;
  // Palestine 972 prefix when local starts with 0
  let intl = digits;
  if (digits.startsWith("00")) intl = digits.slice(2);
  else if (digits.startsWith("0")) intl = "972" + digits.slice(1);
  return `https://wa.me/${intl}`;
}

export interface FollowupQueueHandle {
  refresh: () => void;
}

export default function FollowupQueue({
  onOpenCustomer,
  refreshKey,
}: {
  onOpenCustomer: (row: FollowupRow) => void;
  refreshKey?: number;
}) {
  const [preset, setPreset] = useState<PresetKey>("today");
  const init = rangeFor("today");
  const [from, setFrom] = useState<string>(init.from);
  const [to, setTo] = useState<string>(init.to);
  const [rows, setRows] = useState<FollowupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const applyPreset = (k: PresetKey) => {
    setPreset(k);
    if (k !== "custom") {
      const r = rangeFor(k);
      setFrom(r.from); setTo(r.to);
    }
  };

  const load = useCallback(async (f: string, t: string) => {
    if (!f || !t) return;
    if (new Date(t) < new Date(f)) {
      toast.error("تاريخ النهاية أقدم من البداية");
      return;
    }
    if (daysBetween(f, t) > 6) {
      toast.error("الحد الأقصى للفترة 7 أيام");
      return;
    }
    setLoading(true);
    setDebugInfo(null);
    const { data, error } = await supabase.rpc("feedback_followup_queue" as any, {
      p_from_date: f,
      p_to_date: t,
      p_limit: 200,
    });
    setLoading(false);
    if (error) {
      const msg = String(error.message || "");
      if (msg.includes("RANGE_TOO_LARGE")) toast.error("الحد الأقصى للفترة 7 أيام");
      else if (msg.includes("PERMISSION_DENIED")) toast.error("ليس لديك صلاحية لهذا الإجراء");
      else toast.error("تعذّر تحميل القائمة: " + msg);
      setRows([]);
      return;
    }
    const arr = (data as FollowupRow[]) || [];
    setRows(arr);
    if (arr.length === 0) {
      // Fetch diagnostics so we can show *why* nothing showed up.
      const { data: dbg, error: dbgErr } = await supabase.rpc(
        "feedback_followup_queue_debug" as any,
        { p_from_date: f, p_to_date: t },
      );
      if (!dbgErr) {
        // eslint-disable-next-line no-console
        console.log("[FollowupQueue debug]", dbg);
        setDebugInfo(dbg);
      }
    }
  }, []);

  useEffect(() => { load(from, to); }, [from, to, load, refreshKey]);

  const onSearchCustom = (e: React.FormEvent) => {
    e.preventDefault();
    load(from, to);
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex gap-1.5 flex-wrap">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            type="button"
            size="sm"
            variant={preset === p.key ? "default" : "outline"}
            onClick={() => applyPreset(p.key)}
            className="h-9 px-3 text-xs"
          >
            {p.label}
          </Button>
        ))}
      </div>

      {preset === "custom" && (
        <form onSubmit={onSearchCustom} className="grid grid-cols-2 gap-2 bg-card border rounded-lg p-3">
          <div className="space-y-1">
            <Label className="text-[11px]">من</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">إلى</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10" />
          </div>
          <Button type="submit" className="col-span-2 h-10" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
            تحديث
          </Button>
        </form>
      )}

      {loading ? (
        <div className="py-10 flex items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="h-5 w-5 animate-spin ml-2" /> جارٍ التحميل...
        </div>
      ) : rows.length === 0 ? (
        <div className="py-6 space-y-3">
          <div className="text-center text-sm text-muted-foreground">
            لا توجد طلبيات ضمن الفترة المحددة
          </div>
          {debugInfo && (
            <div className="bg-muted/40 border border-dashed rounded-lg p-3 text-[11px] text-muted-foreground space-y-1" dir="ltr">
              <div className="text-right text-xs font-semibold text-foreground mb-1" dir="rtl">
                تشخيص (للتحقق من سبب فراغ النتائج)
              </div>
              <div>owner_id: <span className="font-mono">{String(debugInfo.owner_id ?? "—")}</span></div>
              <div>can_view: <span className="font-mono">{String(debugInfo.can_view)}</span></div>
              <div>range: <span className="font-mono">{String(debugInfo.from)} → {String(debugInfo.to)}</span></div>
              <div>raw_orders_in_range: <span className="font-mono">{String(debugInfo.raw_orders_in_range)}</span></div>
              <div>orders_missing_phone: <span className="font-mono">{String(debugInfo.orders_missing_phone)}</span></div>
              <div>orders_bad_phone_normalize: <span className="font-mono">{String(debugInfo.orders_bad_phone_normalize)}</span></div>
              <div>distinct_customers_in_range: <span className="font-mono">{String(debugInfo.distinct_customers_in_range)}</span></div>
              <div>owner_orders_last_30_days: <span className="font-mono">{String(debugInfo.owner_orders_last_30_days)}</span></div>
              <div>owner_min_order_at_30d: <span className="font-mono">{String(debugInfo.owner_min_order_at_30d ?? "—")}</span></div>
              <div>owner_max_order_at_30d: <span className="font-mono">{String(debugInfo.owner_max_order_at_30d ?? "—")}</span></div>
              {debugInfo.owner_orders_last_30_days === 0 && (
                <div className="text-right pt-2 text-amber-700 dark:text-amber-400" dir="rtl">
                  ⚠️ لا يوجد أي طلب في <code>call_center_orders</code> لهذا المالك خلال آخر 30 يوم.
                  قد تكون طلبات الاختبار في مصدر مختلف (POS / Qamar / Delivery)، أو تحت مستخدم/شركة أخرى.
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground px-1">{rows.length} زبون</p>
          <div className="space-y-2">
            {rows.map((r) => {
              const out = outcomeLabel(r.last_call_outcome);
              const sent = sentimentLabel(r.last_sentiment);
              const wa = whatsappHref(r.display_phone);
              return (
                <div
                  key={r.normalized_phone}
                  className="bg-card border rounded-lg p-3 space-y-2 active:bg-muted/40 hover:border-primary/40 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onOpenCustomer(r)}
                    className="w-full text-right space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground truncate">
                            {r.full_name || <span className="text-muted-foreground font-normal">بدون اسم</span>}
                          </span>
                          {r.do_not_call && (
                            <Badge variant="destructive" className="gap-1 text-[10px] h-5">
                              <PhoneOff className="h-3 w-3" /> لا اتصال
                            </Badge>
                          )}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${out.cls}`}>
                            {out.text}
                          </span>
                          {sent && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {sent}{r.last_rating ? ` • ${r.last_rating}/5` : ""}
                            </span>
                          )}
                        </div>
                        <div dir="ltr" className="text-xs text-muted-foreground font-mono text-right">
                          {r.display_phone || r.normalized_phone}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                          {r.branch_name && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {r.branch_name}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Receipt className="h-3 w-3" /> {r.orders_count} طلب
                            {typeof r.total_spent === "number" && r.total_spent > 0 && (
                              <> • {Number(r.total_spent).toLocaleString("en")} ₪</>
                            )}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {fmtDate(r.last_order_at)}
                          </span>
                        </div>
                        {r.last_note && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1 pt-1">
                            {r.last_note}
                          </p>
                        )}
                      </div>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </button>

                  <div className="flex gap-1.5 pt-1 border-t border-border/50">
                    {r.display_phone && !r.do_not_call && (
                      <a
                        href={`tel:${r.display_phone}`}
                        className="flex-1 inline-flex items-center justify-center gap-1 h-9 rounded-md border bg-background text-xs text-foreground active:bg-muted"
                      >
                        <Phone className="h-3.5 w-3.5" /> اتصال
                      </a>
                    )}
                    {wa && !r.do_not_call && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-1 h-9 rounded-md border bg-background text-xs text-foreground active:bg-muted"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> واتساب
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenCustomer(r)}
                      className="flex-1 inline-flex items-center justify-center gap-1 h-9 rounded-md bg-primary text-primary-foreground text-xs"
                    >
                      تسجيل متابعة
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}