import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmtDateDisplay } from "@/lib/utils";
import ContactPicker from "./components/ContactPicker";
import { useCsContracts, csInsert } from "./hooks/useCsData";
import { CONTRACT_STATUS_META, type CsContractStatus } from "./types-cs";

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);

export default function CsContractsPage() {
  const { user } = useAuth();
  const { items, loading, refetch } = useCsContracts();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    contact_id: null as string | null, contract_number: "", plan: "",
    users_count: 1, branches_count: 1, price: 0, currency: "ILS",
    start_date: new Date().toISOString().slice(0, 10), end_date: "",
    status: "active" as CsContractStatus, pdf_url: "", notes: "",
  });

  const handleUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error } = await (supabase as any).storage.from("cs-contracts").upload(path, file);
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = (supabase as any).storage.from("cs-contracts").getPublicUrl(path);
    setForm((f) => ({ ...f, pdf_url: data?.publicUrl || path }));
    setUploading(false);
    toast.success("تم رفع الملف");
  };

  const handleSave = async () => {
    if (!user || !form.contact_id || !form.contract_number.trim()) return;
    if (await csInsert("cs_contracts", { ...form, end_date: form.end_date || null }, user.id)) { setOpen(false); refetch(); }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">عقود العملاء</h2>
          <span className="text-[11px] text-slate-500">({items.length})</span>
        </div>
        <Button onClick={() => setOpen(true)} className="h-9 gap-1.5 text-[13px]"><Plus className="h-4 w-4" /> عقد جديد</Button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? <p className="p-8 text-center text-slate-400 text-sm">جارٍ التحميل...</p> :
          items.length === 0 ? <p className="p-8 text-center text-slate-400 text-sm">لا توجد عقود</p> :
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 text-slate-600 text-[11px]"><tr>
              <th className="text-right px-3 py-2 font-semibold">الرقم</th>
              <th className="text-right px-3 py-2 font-semibold">الباقة</th>
              <th className="text-right px-3 py-2 font-semibold">السعر</th>
              <th className="text-right px-3 py-2 font-semibold">بداية</th>
              <th className="text-right px-3 py-2 font-semibold">نهاية</th>
              <th className="text-right px-3 py-2 font-semibold">الحالة</th>
              <th className="text-right px-3 py-2 font-semibold">PDF</th>
            </tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono font-semibold">{c.contract_number}</td>
                  <td className="px-3 py-2">{c.plan || "—"}</td>
                  <td className="px-3 py-2">{fmt(c.price)} {c.currency}</td>
                  <td className="px-3 py-2">{fmtDateDisplay(c.start_date)}</td>
                  <td className="px-3 py-2">{c.end_date ? fmtDateDisplay(c.end_date) : "—"}</td>
                  <td className="px-3 py-2">
                    <span className="inline-block px-1.5 py-0.5 rounded font-bold text-[10px]" style={{ background: CONTRACT_STATUS_META[c.status].bg, color: CONTRACT_STATUS_META[c.status].color }}>
                      {CONTRACT_STATUS_META[c.status].label}
                    </span>
                  </td>
                  <td className="px-3 py-2">{c.pdf_url ? <a href={c.pdf_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">عرض</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader><DialogTitle>عقد جديد</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <F label="العميل"><ContactPicker value={form.contact_id} onChange={(v) => setForm({ ...form, contact_id: v })} allowEmpty={false} required /></F>
            <F label="رقم العقد"><Input value={form.contract_number} onChange={(e) => setForm({ ...form, contract_number: e.target.value })} className="h-9 text-[12px]" /></F>
            <F label="الباقة"><Input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className="h-9 text-[12px]" /></F>
            <F label="الحالة">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CsContractStatus })} className="w-full h-9 px-2 rounded-md border border-slate-200 text-[12px] bg-white">
                {Object.entries(CONTRACT_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </F>
            <F label="المستخدمون"><Input type="number" value={form.users_count} onChange={(e) => setForm({ ...form, users_count: Number(e.target.value) || 1 })} className="h-9 text-[12px]" /></F>
            <F label="الفروع"><Input type="number" value={form.branches_count} onChange={(e) => setForm({ ...form, branches_count: Number(e.target.value) || 1 })} className="h-9 text-[12px]" /></F>
            <F label="السعر"><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) || 0 })} className="h-9 text-[12px]" /></F>
            <F label="العملة"><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="h-9 text-[12px]" /></F>
            <F label="تاريخ البداية"><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="h-9 text-[12px]" /></F>
            <F label="تاريخ النهاية"><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="h-9 text-[12px]" /></F>
            <div className="col-span-2">
              <F label="ملف PDF">
                <div className="flex items-center gap-2">
                  <input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} className="text-[12px] flex-1" />
                  {uploading && <span className="text-[11px] text-slate-500">جارٍ الرفع...</span>}
                </div>
              </F>
            </div>
            <div className="col-span-2">
              <F label="ملاحظات"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="text-[12px]" /></F>
            </div>
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