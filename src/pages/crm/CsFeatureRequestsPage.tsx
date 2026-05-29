import { useState } from "react";
import { Lightbulb, Plus, ThumbsUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmtDateDisplay } from "@/lib/utils";
import ContactPicker from "./components/ContactPicker";
import { useCsFeatureRequests, csInsert } from "./hooks/useCsData";
import { FEATURE_REQUEST_STATUS_META, type CsFeatureRequestStatus } from "./types-cs";

export default function CsFeatureRequestsPage() {
  const { user } = useAuth();
  const { items, loading, refetch } = useCsFeatureRequests();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", business_justification: "", contact_id: null as string | null,
    category: "", status: "new" as CsFeatureRequestStatus,
  });

  const handleSave = async () => {
    if (!user || !form.title.trim()) return;
    if (await csInsert("cs_feature_requests", { ...form, requested_by: user.id }, user.id)) {
      setOpen(false); refetch();
      setForm({ title: "", business_justification: "", contact_id: null, category: "", status: "new" });
    }
  };

  const vote = async (id: string, current: number) => {
    const { error } = await (supabase as any).from("cs_feature_requests").update({ votes: current + 1 }).eq("id", id);
    if (error) toast.error(error.message); else refetch();
  };

  const sorted = [...items].sort((a, b) => b.votes - a.votes);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-600" />
          <h2 className="text-base font-bold text-slate-900">طلبات الميزات</h2>
          <span className="text-[11px] text-slate-500">({items.length})</span>
        </div>
        <Button onClick={() => setOpen(true)} className="h-9 gap-1.5 text-[13px]"><Plus className="h-4 w-4" /> طلب جديد</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {loading ? <p className="col-span-2 p-8 text-center text-slate-400 text-sm">جارٍ التحميل...</p> :
          sorted.length === 0 ? <p className="col-span-2 p-8 text-center text-slate-400 text-sm">لا توجد طلبات</p> :
          sorted.map((f) => (
            <div key={f.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[10px] text-slate-500">{f.fr_number}</div>
                  <h3 className="text-[13px] font-bold text-slate-900">{f.title}</h3>
                </div>
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0" style={{ background: FEATURE_REQUEST_STATUS_META[f.status].bg, color: FEATURE_REQUEST_STATUS_META[f.status].color }}>
                  {FEATURE_REQUEST_STATUS_META[f.status].label}
                </span>
              </div>
              {f.business_justification && <p className="text-[11px] text-slate-600 mb-2">{f.business_justification}</p>}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">{fmtDateDisplay(f.created_at)}</span>
                <button onClick={() => vote(f.id, f.votes)} className="flex items-center gap-1 text-[11px] text-blue-700 hover:bg-blue-50 px-2 py-1 rounded">
                  <ThumbsUp className="h-3.5 w-3.5" /> {f.votes}
                </button>
              </div>
            </div>
          ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>طلب ميزة جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <F label="الميزة"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 text-[12px]" /></F>
            <F label="مبرر العمل"><Textarea value={form.business_justification} onChange={(e) => setForm({ ...form, business_justification: e.target.value })} rows={3} className="text-[12px]" /></F>
            <F label="العميل"><ContactPicker value={form.contact_id} onChange={(v) => setForm({ ...form, contact_id: v })} /></F>
            <F label="التصنيف"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-9 text-[12px]" /></F>
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