import { useMemo, useState } from "react";
import { Phone, Plus, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { fmtDateDisplay } from "@/lib/utils";
import ContactPicker from "./components/ContactPicker";
import { useCsCalls, csInsert } from "./hooks/useCsData";
import { CALL_DIRECTION_META, CALL_OUTCOME_META, type CsCallDirection, type CsCallOutcome } from "./types-cs";

export default function CsCallsPage() {
  const { user } = useAuth();
  const { items, loading, refetch } = useCsCalls();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    contact_id: null as string | null,
    direction: "inbound" as CsCallDirection,
    duration_sec: 0,
    purpose: "",
    summary: "",
    outcome: "other" as CsCallOutcome,
    called_at: new Date().toISOString().slice(0, 16),
  });

  const filtered = useMemo(() => items.filter((c) =>
    !search || `${c.purpose ?? ""} ${c.summary ?? ""}`.toLowerCase().includes(search.toLowerCase())
  ), [items, search]);

  const handleSave = async () => {
    if (!user) return;
    const ok = await csInsert("cs_calls", { ...form, called_at: new Date(form.called_at).toISOString() }, user.id);
    if (ok) { setOpen(false); refetch(); }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">سجل المكالمات</h2>
          <span className="text-[11px] text-slate-500">({filtered.length})</span>
        </div>
        <Button onClick={() => setOpen(true)} className="h-9 gap-1.5 text-[13px]">
          <Plus className="h-4 w-4" /> تسجيل مكالمة
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="h-9 pr-9 text-[12px]" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-slate-400 text-sm">جارٍ التحميل...</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-slate-400 text-sm">لا توجد مكالمات مسجّلة</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((c) => (
              <div key={c.id} className="p-3 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: CALL_DIRECTION_META[c.direction].bg, color: CALL_DIRECTION_META[c.direction].color }}>
                      {CALL_DIRECTION_META[c.direction].label}
                    </span>
                    <span className="text-[12px] font-semibold text-slate-900">{c.purpose || "—"}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{fmtDateDisplay(c.called_at)}</span>
                </div>
                {c.summary && <div className="text-[11px] text-slate-600 mt-1">{c.summary}</div>}
                <div className="text-[10px] text-slate-500 mt-1">
                  المدة: {Math.round(c.duration_sec / 60)} دقيقة • النتيجة: {CALL_OUTCOME_META[c.outcome]}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>تسجيل مكالمة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <F label="العميل"><ContactPicker value={form.contact_id} onChange={(v) => setForm({ ...form, contact_id: v })} /></F>
            <div className="grid grid-cols-2 gap-2">
              <F label="الاتجاه">
                <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as CsCallDirection })} className="w-full h-9 px-2 rounded-md border border-slate-200 text-[12px] bg-white">
                  {Object.entries(CALL_DIRECTION_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </F>
              <F label="النتيجة">
                <select value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value as CsCallOutcome })} className="w-full h-9 px-2 rounded-md border border-slate-200 text-[12px] bg-white">
                  {Object.entries(CALL_OUTCOME_META).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </F>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <F label="التاريخ والوقت"><Input type="datetime-local" value={form.called_at} onChange={(e) => setForm({ ...form, called_at: e.target.value })} className="h-9 text-[12px]" /></F>
              <F label="المدة (ثانية)"><Input type="number" value={form.duration_sec} onChange={(e) => setForm({ ...form, duration_sec: Number(e.target.value) || 0 })} className="h-9 text-[12px]" /></F>
            </div>
            <F label="الغرض"><Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className="h-9 text-[12px]" /></F>
            <F label="ملخص المكالمة"><Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={3} className="text-[12px]" /></F>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">{label}</label>{children}</div>;
}