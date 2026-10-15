import { useEffect, useState } from "react";
import { Clock, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Shift { id: string; business_date: string; shift_code: string | null; cashier_name: string | null; state: string | null; opened_at: string; closed_at: string | null; cash_box_name: string | null; branch_name: string | null; }

export default function JournalShiftPicker({ ownerId, date, value, onChange, disabled }: {
  ownerId?: string; date: string; value: string | null; onChange: (id: string | null) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [filterDate, setFilterDate] = useState(date);
  const [rows, setRows] = useState<Shift[]>([]);
  const [selected, setSelected] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setFilterDate(date); }, [date]);
  useEffect(() => {
    if (!ownerId || !value) { setSelected(null); return; }
    let cancelled = false;
    supabase.rpc("list_journal_shift_options", { p_owner: ownerId, p_session_id: value }).then(({ data }) => {
      if (!cancelled) setSelected(data?.[0] || null);
    });
    return () => { cancelled = true; };
  }, [ownerId, value]);
  useEffect(() => {
    if (!open || !ownerId) return;
    let cancelled = false;
    setLoading(true); setError("");
    supabase.rpc("list_journal_shift_options", { p_owner: ownerId, p_date: filterDate || undefined }).then(({ data, error: e }) => {
      if (cancelled) return;
      setRows(data || []); setError(e ? "تعذّر تحميل الورديات" : ""); setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, ownerId, filterDate]);
  const time = (iso: string) => new Date(iso).toLocaleTimeString("ar", { timeZone: "Asia/Hebron", hour: "2-digit", minute: "2-digit" });
  return <div className="flex min-w-0 items-center gap-2" dir="rtl">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button type="button" variant={value ? "secondary" : "outline"} size="icon" className="h-9 w-9 shrink-0" disabled={disabled} title="ربط القيد بوردية" aria-label="ربط القيد بوردية"><Clock className="h-4 w-4" /></Button></PopoverTrigger>
      <PopoverContent align="start" className="w-[440px] max-w-[calc(100vw-32px)] p-0" dir="rtl">
        <div className="flex items-center gap-2 border-b p-2"><span className="text-xs font-semibold">اختيار الوردية</span><Input aria-label="تاريخ الورديات" type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="h-8 w-40" /></div>
        <div className="max-h-72 overflow-y-auto">
          {loading ? <div className="flex justify-center p-5"><Loader2 className="h-4 w-4 animate-spin" /></div> : error ? <p role="alert" className="p-3 text-xs text-destructive">{error}</p> : rows.length === 0 ? <p className="p-3 text-xs text-muted-foreground">لا توجد ورديات لهذا التاريخ</p> : rows.map(s =>
            <Button key={s.id} type="button" variant="ghost" aria-label={`اختيار وردية ${s.cashier_name || ""} ${s.shift_code || ""}`} className="h-auto min-h-11 w-full justify-start rounded-none border-b px-3 py-2 text-right" onClick={() => { onChange(s.id); setSelected(s); setOpen(false); }}>
              <div className="min-w-0 flex-1 text-xs"><div className="flex flex-wrap items-center gap-x-2"><span className="font-semibold">{s.cashier_name || "كاشير"}</span><span>{s.shift_code}</span><span className="text-muted-foreground">{s.business_date}</span><span className="text-muted-foreground">{s.state === "open" ? "مفتوحة" : "مغلقة"}</span></div><div className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground"><span>{s.branch_name}</span><span>{s.cash_box_name}</span><span>{time(s.opened_at)} — {s.closed_at ? time(s.closed_at) : "الآن"}</span></div></div>
            </Button>)}
        </div>
      </PopoverContent>
    </Popover>
    {value && <><span className="min-w-0 text-xs text-muted-foreground">{selected ? `${selected.shift_code || "وردية"} · ${selected.cashier_name || ""} · ${selected.business_date} · ${selected.cash_box_name || ""}` : "وردية مرتبطة"}</span><Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={disabled} aria-label="إزالة ربط الوردية" title="إزالة ربط الوردية" onClick={() => onChange(null)}><X className="h-3.5 w-3.5" /></Button></>}
  </div>;
}