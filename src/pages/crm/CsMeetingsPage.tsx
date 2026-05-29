import { useState } from "react";
import { Calendar, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { fmtDateDisplay } from "@/lib/utils";
import ContactPicker from "./components/ContactPicker";
import { useCsMeetings, csInsert } from "./hooks/useCsData";
import { MEETING_STATUS_META, type CsMeetingStatus } from "./types-cs";

export default function CsMeetingsPage() {
  const { user } = useAuth();
  const { items, loading, refetch } = useCsMeetings();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    contact_id: null as string | null,
    meeting_date: new Date().toISOString().slice(0, 16),
    location: "", purpose: "", summary: "", next_action: "",
    status: "scheduled" as CsMeetingStatus, attendees: "",
  });

  const handleSave = async () => {
    if (!user || !form.contact_id) return;
    const payload = {
      contact_id: form.contact_id,
      meeting_date: new Date(form.meeting_date).toISOString(),
      location: form.location, purpose: form.purpose, summary: form.summary,
      next_action: form.next_action, status: form.status,
      attendees: form.attendees.split(",").map(s => s.trim()).filter(Boolean),
    };
    if (await csInsert("cs_meetings", payload, user.id)) { setOpen(false); refetch(); }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">الاجتماعات</h2>
          <span className="text-[11px] text-slate-500">({items.length})</span>
        </div>
        <Button onClick={() => setOpen(true)} className="h-9 gap-1.5 text-[13px]"><Plus className="h-4 w-4" /> اجتماع جديد</Button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? <p className="p-8 text-center text-slate-400 text-sm">جارٍ التحميل...</p> :
          items.length === 0 ? <p className="p-8 text-center text-slate-400 text-sm">لا توجد اجتماعات</p> :
          <div className="divide-y divide-slate-100">
            {items.map((m) => (
              <div key={m.id} className="p-3 hover:bg-slate-50">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-slate-900">{m.purpose || "اجتماع"}</span>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: MEETING_STATUS_META[m.status].bg, color: MEETING_STATUS_META[m.status].color }}>
                      {MEETING_STATUS_META[m.status].label}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500">{fmtDateDisplay(m.meeting_date)}</span>
                </div>
                {m.location && <div className="text-[11px] text-slate-500">📍 {m.location}</div>}
                {m.summary && <div className="text-[11px] text-slate-600 mt-1">{m.summary}</div>}
                {m.next_action && <div className="text-[11px] text-blue-700 mt-1">➜ {m.next_action}</div>}
              </div>
            ))}
          </div>
        }
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>اجتماع جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <F label="العميل"><ContactPicker value={form.contact_id} onChange={(v) => setForm({ ...form, contact_id: v })} allowEmpty={false} required /></F>
            <div className="grid grid-cols-2 gap-2">
              <F label="التاريخ والوقت"><Input type="datetime-local" value={form.meeting_date} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} className="h-9 text-[12px]" /></F>
              <F label="الحالة">
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CsMeetingStatus })} className="w-full h-9 px-2 rounded-md border border-slate-200 text-[12px] bg-white">
                  {Object.entries(MEETING_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </F>
            </div>
            <F label="المكان"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="h-9 text-[12px]" /></F>
            <F label="الحضور (مفصولة بفواصل)"><Input value={form.attendees} onChange={(e) => setForm({ ...form, attendees: e.target.value })} className="h-9 text-[12px]" /></F>
            <F label="الغرض"><Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className="h-9 text-[12px]" /></F>
            <F label="ملخص"><Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={3} className="text-[12px]" /></F>
            <F label="الإجراء التالي"><Input value={form.next_action} onChange={(e) => setForm({ ...form, next_action: e.target.value })} className="h-9 text-[12px]" /></F>
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