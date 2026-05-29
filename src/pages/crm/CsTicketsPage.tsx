import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LifeBuoy, Plus, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { fmtDateDisplay } from "@/lib/utils";
import ContactPicker from "./components/ContactPicker";
import { useCsTickets, csInsert } from "./hooks/useCsData";
import {
  TICKET_STATUS_META, TICKET_PRIORITY_META, TICKET_CATEGORY_META,
  type CsTicketStatus, type CsTicketPriority, type CsTicketCategory,
} from "./types-cs";

export default function CsTicketsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items, loading, refetch } = useCsTickets();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CsTicketStatus | "all">("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    title: string; description: string; contact_id: string | null;
    category: CsTicketCategory; priority: CsTicketPriority;
  }>({ title: "", description: "", contact_id: null, category: "other", priority: "medium" });

  const filtered = useMemo(() => items.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (search && !`${t.title} ${t.ticket_number} ${t.description ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [items, statusFilter, search]);

  const handleSave = async () => {
    if (!user || !form.title.trim()) return;
    const ok = await csInsert("cs_support_tickets", form, user.id);
    if (ok) {
      setOpen(false);
      setForm({ title: "", description: "", contact_id: null, category: "other", priority: "medium" });
      refetch();
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">تذاكر الدعم الفني</h2>
          <span className="text-[11px] text-slate-500">({filtered.length})</span>
        </div>
        <Button onClick={() => setOpen(true)} className="h-9 gap-1.5 text-[13px]">
          <Plus className="h-4 w-4" /> تذكرة جديدة
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم التذكرة أو العنوان..." className="h-9 pr-9 text-[12px]" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="h-9 px-2 rounded-md border border-slate-200 text-[12px] bg-white">
          <option value="all">كل الحالات</option>
          {Object.entries(TICKET_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-slate-400 text-sm">جارٍ التحميل...</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-slate-400 text-sm">لا توجد تذاكر</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 text-slate-600 text-[11px]">
              <tr>
                <th className="text-right px-3 py-2 font-semibold">رقم</th>
                <th className="text-right px-3 py-2 font-semibold">العنوان</th>
                <th className="text-right px-3 py-2 font-semibold">التصنيف</th>
                <th className="text-right px-3 py-2 font-semibold">الأولوية</th>
                <th className="text-right px-3 py-2 font-semibold">الحالة</th>
                <th className="text-right px-3 py-2 font-semibold">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => navigate(`/crm/ticket/${t.id}`)}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                >
                  <td className="px-3 py-2 font-mono text-slate-700 font-semibold">{t.ticket_number}</td>
                  <td className="px-3 py-2 text-slate-900">{t.title}</td>
                  <td className="px-3 py-2 text-slate-600">{TICKET_CATEGORY_META[t.category]}</td>
                  <td className="px-3 py-2">
                    <span className="inline-block px-1.5 py-0.5 rounded font-bold text-[10px]" style={{ background: TICKET_PRIORITY_META[t.priority].bg, color: TICKET_PRIORITY_META[t.priority].color }}>
                      {TICKET_PRIORITY_META[t.priority].label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block px-1.5 py-0.5 rounded font-bold text-[10px]" style={{ background: TICKET_STATUS_META[t.status].bg, color: TICKET_STATUS_META[t.status].color }}>
                      {TICKET_STATUS_META[t.status].label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-[11px]">{fmtDateDisplay(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>تذكرة دعم جديدة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="العنوان">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 text-[12px]" />
            </Field>
            <Field label="العميل">
              <ContactPicker value={form.contact_id} onChange={(v) => setForm({ ...form, contact_id: v })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="التصنيف">
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as CsTicketCategory })} className="w-full h-9 px-2 rounded-md border border-slate-200 text-[12px] bg-white">
                  {Object.entries(TICKET_CATEGORY_META).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="الأولوية">
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as CsTicketPriority })} className="w-full h-9 px-2 rounded-md border border-slate-200 text-[12px] bg-white">
                  {Object.entries(TICKET_PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="الوصف">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} className="text-[12px]" />
            </Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}