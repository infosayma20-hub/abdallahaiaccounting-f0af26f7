import {
  useCallback, useEffect, useRef, useState,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, RefreshCw, Phone, MessageCircle, PhoneOff, MapPin, Receipt,
  Calendar, FilePen, ListFilter, ChevronLeft,
  CircleCheck, CircleAlert, CircleDashed, Hourglass,
} from "lucide-react";
import { toast } from "sonner";

/* ============================ Types ============================ */

export interface FollowupRow {
  customer_id: string | null;
  full_name: string | null;
  display_phone: string | null;
  normalized_phone: string;
  branch_id: string | null;
  branch_name: string | null;
  last_order_id: string | null;
  last_order_number: string | null;
  last_order_at: string;
  orders_count: number;
  lifetime_visits?: number | null;
  total_spent: number | null;
  last_order_total?: number | null;
  last_delivery_fee?: number | null;
  last_order_value?: number | null;
  do_not_call: boolean;
  last_call_at: string | null;
  last_call_outcome: string | null;
  last_sentiment: string | null;
  last_rating: number | null;
  last_driver_rating?: number | null;
  last_driver_name?: string | null;
  last_note: string | null;
  last_handled_by: string | null;
  followup_status: string | null;
  needs_followup_at: string | null;
  source: string | null;
  order_taken_by_user_id?: string | null;
  order_taken_by_name?: string | null;
  last_order_items_summary?: string | null;
  last_order_items?: any[] | null;
  last_order_note?: string | null;
  last_order_type?: string | null;
  last_payment_method?: string | null;
  last_address?: string | null;
  total_count?: number;
}

export interface BranchOption { id: string; name: string }

type PresetKey = "today" | "yesterday" | "last3" | "last7" | "custom";

/* ============================ Helpers ============================ */

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today",     label: "اليوم" },
  { key: "yesterday", label: "أمس" },
  { key: "last3",     label: "آخر 3 أيام" },
  { key: "last7",     label: "آخر 7 أيام" },
  { key: "custom",    label: "مخصص" },
];

const STATUS_OPTIONS: { value: string; label: string; color: string; Icon: typeof CircleCheck }[] = [
  { value: "not_called",     label: "لم يتم الاتصال", color: "bg-slate-100 text-slate-700 border-slate-300", Icon: CircleDashed },
  { value: "called",         label: "تم الاتصال",     color: "bg-emerald-100 text-emerald-800 border-emerald-300", Icon: CircleCheck },
  { value: "no_answer",      label: "لم يرد",          color: "bg-amber-100 text-amber-800 border-amber-300", Icon: CircleAlert },
  { value: "needs_followup", label: "يحتاج متابعة",    color: "bg-sky-100 text-sky-800 border-sky-300", Icon: Hourglass },
  { value: "complaint",      label: "شكوى",            color: "bg-rose-100 text-rose-800 border-rose-300", Icon: CircleAlert },
  { value: "called",         label: "مكتمل",           color: "bg-emerald-100 text-emerald-800 border-emerald-300", Icon: CircleCheck },
];

const STATUS_FILTER_OPTIONS = [
  { value: "__all",          label: "الكل" },
  { value: "not_called",     label: "لم يتم الاتصال" },
  { value: "called",         label: "تم الاتصال" },
  { value: "no_answer",      label: "لم يرد" },
  { value: "needs_followup", label: "يحتاج متابعة" },
  { value: "complaint",      label: "شكوى" },
  { value: "dnc",            label: "عدم الاتصال" },
];

const SENTIMENT_FILTER_OPTIONS = [
  { value: "__all",       label: "الكل" },
  { value: "satisfied",   label: "راضٍ" },
  { value: "neutral",     label: "محايد" },
  { value: "unsatisfied", label: "غير راضٍ" },
  { value: "complaint",   label: "شكوى" },
];

function statusMeta(s: string | null) {
  switch (s) {
    case "called":         return { label: "تم الاتصال",  cls: "bg-emerald-100 text-emerald-800 border border-emerald-300", Icon: CircleCheck };
    case "no_answer":      return { label: "لم يرد",       cls: "bg-amber-100 text-amber-800 border border-amber-300",     Icon: CircleAlert };
    case "needs_followup": return { label: "يحتاج متابعة", cls: "bg-sky-100 text-sky-800 border border-sky-300",            Icon: Hourglass };
    case "complaint":      return { label: "شكوى",         cls: "bg-rose-100 text-rose-800 border border-rose-300",         Icon: CircleAlert };
    case "dnc":            return { label: "لا اتصال",     cls: "bg-rose-100 text-rose-800 border border-rose-300",         Icon: PhoneOff };
    default:               return { label: "لم يتم الاتصال", cls: "bg-slate-100 text-slate-700 border border-slate-300",    Icon: CircleDashed };
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

function orderTypeLabel(t: string | null | undefined): string {
  switch ((t || "").toLowerCase()) {
    case "delivery": return "توصيل";
    case "pickup":
    case "takeaway": return "استلام";
    case "dine_in":
    case "dinein":   return "طاولة";
    default:         return "غير محدد";
  }
}

function paymentLabel(p: string | null | undefined): string {
  switch ((p || "").toLowerCase()) {
    case "cash":             return "نقد";
    case "card":
    case "visa":
    case "mastercard":       return "بطاقة";
    case "credit":           return "آجل";
    case "transfer":
    case "bank_transfer":    return "تحويل";
    case "employee_account": return "حساب موظف";
    default:                 return "غير محدد";
  }
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function rangeFor(preset: PresetKey): { from: string; to: string } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const to = ymd(today);
  if (preset === "today") return { from: to, to };
  if (preset === "yesterday") {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    const s = ymd(y); return { from: s, to: s };
  }
  if (preset === "last3") {
    const f = new Date(today); f.setDate(f.getDate() - 2);
    return { from: ymd(f), to };
  }
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
function whatsappHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 7) return null;
  let intl = digits;
  if (digits.startsWith("00")) intl = digits.slice(2);
  else if (digits.startsWith("0")) intl = "972" + digits.slice(1);
  return `https://wa.me/${intl}`;
}

/* ============================ Component ============================ */

const PAGE_SIZE = 100;

export default function FollowupQueueShell({
  branches,
  onOpenCustomer,
  refreshKey,
}: {
  branches: BranchOption[];
  onOpenCustomer: (row: FollowupRow, opts?: { focus?: "call" | "orders" | "info" }) => void;
  refreshKey?: number;
}) {
  /* -------- Filters state -------- */
  const initial = rangeFor("today");
  const [preset, setPreset] = useState<PresetKey>("today");
  const [from, setFrom] = useState<string>(initial.from);
  const [to, setTo] = useState<string>(initial.to);
  const [query, setQuery] = useState("");
  const [branchId, setBranchId] = useState<string>("__all");
  const [status, setStatus] = useState<string>("__all");
  const [dnc, setDnc] = useState<string>("__all"); // __all | yes | no
  const [sentiment, setSentiment] = useState<string>("__all");
  const [ratingMin, setRatingMin] = useState<string>("");
  const [ratingMax, setRatingMax] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  /* -------- Data state -------- */
  const [rows, setRows] = useState<FollowupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number>(0);
  const [offset, setOffset] = useState(0);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const debounceRef = useRef<number | null>(null);

  const applyPreset = (k: PresetKey) => {
    setPreset(k);
    if (k !== "custom") {
      const r = rangeFor(k);
      setFrom(r.from); setTo(r.to);
    }
  };

  /* -------- Loader -------- */
  const load = useCallback(async (resetOffset: boolean = true, explicitOffset?: number) => {
    if (!from || !to) return;
    if (new Date(to) < new Date(from)) { toast.error("تاريخ النهاية أقدم من البداية"); return; }
    if (daysBetween(from, to) > 6) { toast.error("الحد الأقصى للفترة 7 أيام"); return; }

    const nextOffset = resetOffset ? 0 : (typeof explicitOffset === "number" ? explicitOffset : offset);
    setLoading(true);
    setDebugInfo(null);

    const { data, error } = await supabase.rpc("feedback_followup_queue" as any, {
      p_from_date: from,
      p_to_date: to,
      p_limit: PAGE_SIZE,
      p_offset: nextOffset,
      p_query: query.trim() || null,
      p_branch_id: branchId === "__all" ? null : branchId,
      p_status: status === "__all" ? null : status,
      p_dnc: dnc === "__all" ? null : dnc === "yes",
      p_sentiment: sentiment === "__all" ? null : sentiment,
      p_min_rating: ratingMin ? Number(ratingMin) : null,
      p_max_rating: ratingMax ? Number(ratingMax) : null,
    });
    setLoading(false);

    if (error) {
      const msg = String(error.message || "");
      if (msg.includes("RANGE_TOO_LARGE")) toast.error("الحد الأقصى للفترة 7 أيام");
      else if (msg.includes("PERMISSION_DENIED")) toast.error("ليس لديك صلاحية لهذا الإجراء");
      else toast.error("تعذّر تحميل القائمة: " + msg);
      setRows([]); setTotal(0);
      return;
    }
    const arr = (data as FollowupRow[]) || [];
    setRows((prev) => {
      if (resetOffset) return arr;
      // De-dupe by normalized_phone to avoid duplicates from any race
      const seen = new Set(prev.map((r) => r.normalized_phone));
      const fresh = arr.filter((r) => !seen.has(r.normalized_phone));
      return [...prev, ...fresh];
    });
    setTotal(arr.length > 0 ? Number(arr[0].total_count ?? arr.length) : 0);
    setOffset(nextOffset);

    if (arr.length === 0 && resetOffset) {
      const { data: dbg } = await supabase.rpc("feedback_followup_queue_debug" as any, {
        p_from_date: from, p_to_date: to,
      });
      setDebugInfo(dbg);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, query, branchId, status, dnc, sentiment, ratingMin, ratingMax]);

  /* Debounced auto-reload whenever any filter changes */
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => { load(true); }, 350);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, query, branchId, status, dnc, sentiment, ratingMin, ratingMax, refreshKey]);

  /* -------- Quick status change -------- */

  /* -------- Render -------- */
  return (
    <div className="space-y-3" dir="rtl">
      <ActionPane
        total={total}
        loading={loading}
        onRefresh={() => load(true)}
        onToggleFilters={() => setShowFilters((v) => !v)}
        filtersOpen={showFilters}
      />

      <FiltersBar
        preset={preset} from={from} to={to}
        onPreset={applyPreset}
        onFrom={(v) => { setPreset("custom"); setFrom(v); }}
        onTo={(v) => { setPreset("custom"); setTo(v); }}
        query={query} onQuery={setQuery}
        showAdvanced={showFilters}
        branches={branches}
        branchId={branchId} onBranchId={setBranchId}
        status={status} onStatus={setStatus}
        dnc={dnc} onDnc={setDnc}
        sentiment={sentiment} onSentiment={setSentiment}
        ratingMin={ratingMin} ratingMax={ratingMax}
        onRatingMin={setRatingMin} onRatingMax={setRatingMax}
        total={total}
        loading={loading}
      />

      {/* Desktop / Tablet table */}
      <div className="hidden md:block">
        <DataTable
          rows={rows}
          loading={loading}
          onOpen={(r) => onOpenCustomer(r, { focus: "orders" })}
          onLogCall={(r) => onOpenCustomer(r, { focus: "call" })}
          debugInfo={debugInfo}
        />
      </div>

      {/* Mobile cards */}
      <div className="md:hidden">
        <CardsList
          rows={rows}
          loading={loading}
          onOpen={(r) => onOpenCustomer(r, { focus: "orders" })}
          onLogCall={(r) => onOpenCustomer(r, { focus: "call" })}
          debugInfo={debugInfo}
        />
      </div>

      {rows.length > 0 && rows.length < total && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline" size="sm"
            onClick={() => {
              const next = offset + PAGE_SIZE;
              setOffset(next);
              load(false, next);
            }}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
            تحميل المزيد ({rows.length} من {total})
          </Button>
        </div>
      )}
    </div>
  );
}

/* ============================ ActionPane ============================ */

function ActionPane({
  total, loading, onRefresh, onToggleFilters, filtersOpen,
}: {
  total: number;
  loading: boolean;
  onRefresh: () => void;
  onToggleFilters: () => void;
  filtersOpen: boolean;
}) {
  return (
    <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-1 px-2 py-1.5 border-b bg-muted/40">
        <ToolButton icon={RefreshCw} label="تحديث" onClick={onRefresh} disabled={loading} loading={loading} />
        <div className="flex-1" />
        <span className="text-[11px] text-slate-500 hidden md:inline-block">
          اضغط على الصف لفتح التفاصيل
        </span>
        <ToolButton
          icon={ListFilter}
          label={filtersOpen ? "إخفاء الفلاتر" : "إظهار الفلاتر"}
          onClick={onToggleFilters}
        />
      </div>

      <div className="flex items-center justify-end gap-2 px-3 py-1.5 text-[12px] bg-background">
        <div className="text-[11px] text-slate-600 shrink-0">
          {total > 0 ? `${total} زبون` : ""}
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  icon: Icon, label, onClick, disabled, loading,
}: { icon: typeof RefreshCw; label: string; onClick: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <Button
      type="button" variant="ghost" size="sm"
      onClick={onClick} disabled={disabled}
      className="h-8 gap-1 text-xs font-semibold disabled:opacity-40"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}

function Divider() {
  return <span className="w-px h-5 bg-border/70 mx-0.5" />;
}

/* ============================ FiltersBar ============================ */

function FiltersBar(props: {
  preset: PresetKey; from: string; to: string;
  onPreset: (k: PresetKey) => void;
  onFrom: (v: string) => void; onTo: (v: string) => void;
  query: string; onQuery: (v: string) => void;
  showAdvanced: boolean;
  branches: BranchOption[];
  branchId: string; onBranchId: (v: string) => void;
  status: string; onStatus: (v: string) => void;
  dnc: string; onDnc: (v: string) => void;
  sentiment: string; onSentiment: (v: string) => void;
  ratingMin: string; ratingMax: string;
  onRatingMin: (v: string) => void; onRatingMax: (v: string) => void;
  total: number;
  loading: boolean;
}) {
  const {
    preset, from, to, onPreset, onFrom, onTo,
    query, onQuery, showAdvanced,
    branches, branchId, onBranchId,
    status, onStatus, dnc, onDnc, sentiment, onSentiment,
    ratingMin, ratingMax, onRatingMin, onRatingMax,
  } = props;

  return (
    <div className="bg-card border rounded-lg p-2.5 space-y-2 shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="بحث: اسم الزبون أو رقم الهاتف"
          className="h-9 max-w-xs text-sm font-medium"
          dir="rtl"
        />
        <span className="w-px h-6 bg-border mx-1 hidden sm:inline-block" />
        <div className="flex items-center gap-1 flex-wrap">
          {PRESETS.map((p) => (
            <Button
              key={p.key} type="button" size="sm"
              variant={preset === p.key ? "default" : "outline"}
              onClick={() => onPreset(p.key)}
              className="h-9 px-3 text-xs font-semibold"
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {preset === "custom" && (
        <div className="grid grid-cols-2 gap-2 max-w-md">
          <div className="space-y-1">
            <Label className="text-[11px] text-slate-700 font-semibold">من</Label>
            <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-slate-700 font-semibold">إلى</Label>
            <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="h-9" />
          </div>
        </div>
      )}

      {showAdvanced && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 pt-2 border-t border-border/60">
          <FilterSelect
            label="الفرع" value={branchId} onChange={onBranchId}
            options={[{ value: "__all", label: "كل الفروع" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
          />
          <FilterSelect
            label="حالة المتابعة" value={status} onChange={onStatus}
            options={STATUS_FILTER_OPTIONS}
          />
          <FilterSelect
            label="DNC" value={dnc} onChange={onDnc}
            options={[
              { value: "__all", label: "الكل" },
              { value: "no",    label: "مسموح الاتصال" },
              { value: "yes",   label: "لا اتصال" },
            ]}
          />
          <FilterSelect
            label="التقييم العام" value={sentiment} onChange={onSentiment}
            options={SENTIMENT_FILTER_OPTIONS}
          />
          <div className="space-y-1">
            <Label className="text-[11px] text-slate-700 font-semibold">التقييم (1-5)</Label>
            <div className="flex gap-1">
              <Input
                type="number" min={1} max={5} inputMode="numeric"
                value={ratingMin} onChange={(e) => onRatingMin(e.target.value)}
                placeholder="من" className="h-9 text-sm"
              />
              <Input
                type="number" min={1} max={5} inputMode="numeric"
                value={ratingMax} onChange={(e) => onRatingMax(e.target.value)}
                placeholder="إلى" className="h-9 text-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-slate-700 font-semibold">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ============================ DataTable (Desktop) ============================ */

function DataTable({
  rows, loading, onOpen, onLogCall, debugInfo,
}: {
  rows: FollowupRow[];
  loading: boolean;
  onOpen: (r: FollowupRow) => void;
  onLogCall: (r: FollowupRow) => void;
  debugInfo: any;
}) {
  if (loading && rows.length === 0) {
    return (
      <div className="bg-card border rounded-lg py-10 flex items-center justify-center text-slate-600 text-sm">
        <Loader2 className="h-5 w-5 animate-spin ml-2" /> جارٍ التحميل...
      </div>
    );
  }
  if (rows.length === 0) {
    return <EmptyState debugInfo={debugInfo} />;
  }
  return (
    <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
      <div className="overflow-auto max-h-[calc(100vh-340px)]">
        <table className="w-full text-[13px] border-collapse">
          <thead className="bg-slate-100 sticky top-0 z-10">
            <tr className="text-slate-800">
              <Th>الاسم</Th>
              <Th>الهاتف</Th>
              <Th>الفرع</Th>
                <Th className="text-center">عدد الزيارات</Th>
                <Th className="text-left">إجمالي الفاتورة</Th>
                <Th className="text-left">رسوم التوصيل</Th>
                <Th className="text-left">قيمة الطلب</Th>
              <Th>آخر طلبية</Th>
              <Th>ملخص الطلب</Th>
              <Th>النوع</Th>
              <Th>الدفع</Th>
              <Th>أخذ الطلب</Th>
              <Th>الحالة</Th>
              <Th>الانطباع</Th>
                <Th>تقييم السائق</Th>
              <Th>آخر موظف</Th>
              <Th>آخر متابعة</Th>
              <Th className="text-center w-32">إجراءات</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const sm = statusMeta(r.followup_status);
              const wa = whatsappHref(r.display_phone);
              const sent = sentimentLabel(r.last_sentiment);
              return (
                <tr
                  key={r.normalized_phone}
                  onClick={() => onOpen(r)}
                  className="border-t border-border/60 cursor-pointer transition-colors hover:bg-muted/50"
                >
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-900 truncate max-w-[180px]">
                        {r.full_name || <span className="text-slate-500 font-normal">بدون اسم</span>}
                      </span>
                      {r.do_not_call && (
                        <Badge variant="destructive" className="gap-1 text-[10px] h-5 shrink-0">
                          <PhoneOff className="h-3 w-3" /> عدم الاتصال
                        </Badge>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <span dir="ltr" className="font-mono text-slate-700 text-[12px]">
                      {r.display_phone || r.normalized_phone}
                    </span>
                  </Td>
                  <Td className="text-slate-700">{r.branch_name || "—"}</Td>
                  <Td className="text-center font-semibold text-slate-800">
                    {r.lifetime_visits ?? r.orders_count}
                  </Td>
                  <Td className="text-left font-mono text-slate-800">
                    <span title="المبلغ النهائي الذي دفعه الزبون لآخر طلب (يشمل التوصيل)">
                    {typeof r.last_order_total === "number"
                      ? `${Number(r.last_order_total).toLocaleString("en")} ₪`
                      : "—"}
                    </span>
                  </Td>
                  <Td className="text-left font-mono text-slate-700">
                    {typeof r.last_delivery_fee === "number"
                      ? `${Number(r.last_delivery_fee).toLocaleString("en")} ₪`
                      : "0 ₪"}
                  </Td>
                  <Td className="text-left font-mono text-slate-800">
                    <span title="إجمالي الفاتورة بدون رسوم التوصيل">
                    {typeof r.last_order_value === "number"
                      ? `${Number(r.last_order_value).toLocaleString("en")} ₪`
                      : "—"}
                    </span>
                  </Td>
                  <Td className="text-slate-700 whitespace-nowrap">{fmtDate(r.last_order_at)}</Td>
                  <Td className="text-slate-700 max-w-[260px]">
                    {r.last_order_items_summary ? (
                      <span
                        className="truncate inline-block max-w-[260px] align-bottom"
                        title={
                          (r.last_order_items_summary || "") +
                          (r.last_order_note ? `\nملاحظة: ${r.last_order_note}` : "") +
                          (r.last_address ? `\nالعنوان: ${r.last_address}` : "")
                        }
                      >
                        {r.last_order_items_summary}
                      </span>
                    ) : (
                      <span className="text-slate-400">لا توجد أصناف مسجلة</span>
                    )}
                  </Td>
                  <Td className="text-slate-700 whitespace-nowrap text-[12px]">
                    {orderTypeLabel(r.last_order_type)}
                  </Td>
                  <Td className="text-slate-700 whitespace-nowrap text-[12px]">
                    {paymentLabel(r.last_payment_method)}
                  </Td>
                  <Td className="text-slate-700 truncate max-w-[140px]" >
                    <span title={r.order_taken_by_name || "غير محدد"}>
                      {r.order_taken_by_name || "غير محدد"}
                    </span>
                  </Td>
                  <Td>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${sm.cls}`}>
                      <sm.Icon className="h-3 w-3" />
                      {sm.label}
                    </span>
                  </Td>
                  <Td>
                    {sent ? (
                      <span className="text-[11px] text-slate-700">
                        {sent}{r.last_rating ? ` • ${r.last_rating}/5` : ""}
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                  </Td>
                  <Td>
                    {typeof r.last_driver_rating === "number" && r.last_driver_rating > 0 ? (
                      <span className="text-[11px] text-slate-800 font-semibold">
                        {r.last_driver_rating}/5
                        {r.last_driver_name ? <span className="text-slate-500 font-normal"> • {r.last_driver_name}</span> : null}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">لم يُقيَّم</span>
                    )}
                  </Td>
                  <Td className="text-[11px] text-slate-600 truncate max-w-[120px]">
                    {r.last_handled_by || "—"}
                  </Td>
                  <Td className="text-[11px] text-slate-600 whitespace-nowrap">
                    {fmtDate(r.last_call_at)}
                  </Td>
                  <Td className="text-center">
                    <div className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {r.display_phone && !r.do_not_call ? (
                        <a
                          href={`tel:${r.display_phone}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent"
                          title="اتصال"
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      {wa && !r.do_not_call ? (
                        <a
                          href={wa} target="_blank" rel="noopener noreferrer"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent"
                          title="واتساب"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onLogCall(r)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent"
                        title="تسجيل متابعة"
                      >
                        <FilePen className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`text-right font-bold text-[12px] px-2.5 py-2 border-b border-slate-300 whitespace-nowrap ${className ?? ""}`}>
      {children}
    </th>
  );
}
function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-2.5 py-2 align-middle ${className ?? ""}`}>{children}</td>;
}

/* ============================ Mobile Cards ============================ */

function CardsList({
  rows, loading, onOpen, onLogCall, debugInfo,
}: {
  rows: FollowupRow[];
  loading: boolean;
  onOpen: (r: FollowupRow) => void;
  onLogCall: (r: FollowupRow) => void;
  debugInfo: any;
}) {
  if (loading && rows.length === 0) {
    return (
      <div className="py-10 flex items-center justify-center text-slate-600 text-sm">
        <Loader2 className="h-5 w-5 animate-spin ml-2" /> جارٍ التحميل...
      </div>
    );
  }
  if (rows.length === 0) return <EmptyState debugInfo={debugInfo} />;
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const sm = statusMeta(r.followup_status);
        const wa = whatsappHref(r.display_phone);
        return (
          <div key={r.normalized_phone} className="bg-card border rounded-lg p-3 space-y-2 shadow-sm">
            <button type="button" onClick={() => onOpen(r)} className="w-full text-right space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-900 truncate">
                      {r.full_name || <span className="text-slate-500 font-normal">بدون اسم</span>}
                    </span>
                    {r.do_not_call && (
                      <Badge variant="destructive" className="gap-1 text-[10px] h-5">
                        <PhoneOff className="h-3 w-3" /> لا اتصال
                      </Badge>
                    )}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sm.cls}`}>
                      <sm.Icon className="h-3 w-3" /> {sm.label}
                    </span>
                  </div>
                  <div dir="ltr" className="text-xs text-slate-700 font-mono text-right font-semibold">
                    {r.display_phone || r.normalized_phone}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-600 flex-wrap">
                    {r.branch_name && (
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {r.branch_name}</span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Receipt className="h-3 w-3" /> {r.lifetime_visits ?? r.orders_count} زيارة
                      {typeof r.last_order_total === "number" && r.last_order_total > 0 && (
                        <> • {Number(r.last_order_total).toLocaleString("en")} ₪</>
                      )}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {fmtDate(r.last_order_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-600 flex-wrap">
                    <span>الفاتورة: <span className="font-semibold text-slate-900">{Number(r.last_order_total ?? 0).toLocaleString("en")} ₪</span></span>
                    <span>التوصيل: <span className="font-semibold text-slate-900">{Number(r.last_delivery_fee ?? 0).toLocaleString("en")} ₪</span></span>
                    <span>الطلب: <span className="font-semibold text-slate-900">{Number(r.last_order_value ?? 0).toLocaleString("en")} ₪</span></span>
                  </div>
                  <div className="text-[11px] text-slate-700">
                    تقييم السائق:{" "}
                    {typeof r.last_driver_rating === "number" && r.last_driver_rating > 0 ? (
                      <span className="font-semibold text-slate-900">{r.last_driver_rating}/5{r.last_driver_name ? ` • ${r.last_driver_name}` : ""}</span>
                    ) : (
                      <span className="text-slate-500">لم يُقيَّم</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-700">
                    أخذ الطلب: <span className="font-semibold text-slate-900">{r.order_taken_by_name || "غير محدد"}</span>
                  </div>
                  <div className="text-[11px] text-slate-700 leading-relaxed">
                    <span className="text-slate-500">الطلب: </span>
                    <span className="text-slate-900">
                      {r.last_order_items_summary || "لا توجد أصناف مسجلة"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-600 flex-wrap">
                    <span>النوع: <span className="text-slate-800 font-semibold">{orderTypeLabel(r.last_order_type)}</span></span>
                    <span>الدفع: <span className="text-slate-800 font-semibold">{paymentLabel(r.last_payment_method)}</span></span>
                  </div>
                  {r.last_address && (
                    <div className="text-[11px] text-slate-600 truncate">
                      <MapPin className="h-3 w-3 inline-block ml-1" />
                      {r.last_address}
                    </div>
                  )}
                  {r.last_order_note && (
                    <div className="text-[11px] text-amber-700">
                      ملاحظة: {r.last_order_note}
                    </div>
                  )}
                </div>
                <ChevronLeft className="h-4 w-4 text-slate-500 shrink-0 mt-1" />
              </div>
            </button>
            <div className="flex gap-1.5 pt-1 border-t border-border/50">
              {r.display_phone && !r.do_not_call && (
                <a href={`tel:${r.display_phone}`}
                   className="flex-1 inline-flex items-center justify-center gap-1 h-9 rounded-md border bg-background text-xs font-semibold text-slate-800 active:bg-muted">
                  <Phone className="h-3.5 w-3.5" /> اتصال
                </a>
              )}
              {wa && !r.do_not_call && (
                <a href={wa} target="_blank" rel="noopener noreferrer"
                   className="flex-1 inline-flex items-center justify-center gap-1 h-9 rounded-md border bg-background text-xs font-semibold text-slate-800 active:bg-muted">
                  <MessageCircle className="h-3.5 w-3.5" /> واتساب
                </a>
              )}
              <button type="button" onClick={() => onLogCall(r)}
                      className="flex-1 inline-flex items-center justify-center gap-1 h-9 rounded-md bg-primary text-primary-foreground text-xs font-semibold">
                تسجيل متابعة
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================ Empty State ============================ */

function EmptyState({ debugInfo }: { debugInfo: any }) {
  return (
    <div className="bg-card border rounded-lg py-8 space-y-3">
      <div className="text-center text-sm text-slate-600 font-semibold">
        لا توجد طلبيات ضمن الفترة المحددة
      </div>
      {debugInfo && (
        <div className="bg-muted/40 border border-dashed rounded-lg p-3 mx-3 text-[11px] text-slate-600 space-y-1" dir="rtl">
          <div className="text-right text-xs font-bold text-slate-800 mb-1">
            تشخيص (للتحقق من سبب فراغ النتائج)
          </div>
          <div>المالك: <span className="font-mono" dir="ltr">{String(debugInfo.owner_id ?? "—")}</span></div>
          <div>إجمالي الطلبات ضمن الفترة: <span className="font-mono">{String(debugInfo.raw_orders_in_range)}</span></div>
          <div>طلبات بدون رقم هاتف: <span className="font-mono">{String(debugInfo.orders_missing_phone)}</span></div>
          <div>عدد الزبائن المختلفين ضمن الفترة: <span className="font-mono">{String(debugInfo.distinct_customers_in_range)}</span></div>
          <div>طلبات آخر 30 يوم: <span className="font-mono">{String(debugInfo.owner_orders_last_30_days)}</span></div>
          {debugInfo.owner_orders_last_30_days === 0 && (
            <div className="text-right pt-2 text-amber-700">
              ⚠️ لا يوجد أي طلب في الكول سنتر لهذا المالك خلال آخر 30 يوم. قد تكون طلبات الاختبار تحت مستخدم/شركة أخرى.
            </div>
          )}
        </div>
      )}
    </div>
  );
}