import { useMemo, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, Phone, MessageCircle, Mail, MapPin, ArrowRight, Trash2, Edit3 } from "lucide-react";
import { useCrmLeads } from "./hooks/useCrmData";
import { LEAD_STATUS_META, PRIORITY_META, type CrmLeadStatus, type CrmLead } from "./types";
import LeadFormDialog from "./LeadFormDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fmtDateDisplay, multiWordMatchAny } from "@/lib/utils";

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);

const StatusChip = ({ status }: { status: CrmLeadStatus }) => {
  const m = LEAD_STATUS_META[status];
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: m.bg, color: m.color }}>{m.label}</span>
  );
};

export default function CrmLeadsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { leads, loading, refetch } = useCrmLeads();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CrmLeadStatus | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editLead, setEditLead] = useState<CrmLead | null>(null);

  useEffect(() => {
    if (params.get("new") === "1") {
      setEditLead(null);
      setDialogOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (search.trim() && !multiWordMatchAny(search, l.title, l.contact_name, l.company_name, l.phone, l.whatsapp, l.email)) return false;
      return true;
    });
  }, [leads, search, statusFilter]);

  const stats = useMemo(() => {
    const totalValue = leads.reduce((s, l) => s + Number(l.estimated_value || 0), 0);
    return {
      all: leads.length,
      new: leads.filter(l => l.status === "new").length,
      contacted: leads.filter(l => l.status === "contacted").length,
      qualified: leads.filter(l => l.status === "qualified").length,
      converted: leads.filter(l => l.status === "converted").length,
      totalValue,
    };
  }, [leads]);

  const remove = async (l: CrmLead) => {
    if (!confirm(`حذف "${l.title}"؟ هذا الإجراء لا يمكن التراجع عنه.`)) return;
    const { error } = await supabase.from("crm_leads").delete().eq("id", l.id);
    if (error) { toast.error("تعذر الحذف"); return; }
    toast.success("تم الحذف");
    refetch();
  };

  const tabs: Array<[string, CrmLeadStatus | "all", number]> = [
    ["الكل", "all", stats.all],
    ["جدد", "new", stats.new],
    ["تم التواصل", "contacted", stats.contacted],
    ["مؤهلون", "qualified", stats.qualified],
    ["محوّلون", "converted", stats.converted],
  ];

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم، الشركة، الهاتف، أو البريد..."
            className="h-9 w-full rounded-lg border border-slate-200 pr-10 pl-3 text-[13px] focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none bg-white"
          />
        </div>
        <button
          onClick={() => { setEditLead(null); setDialogOpen(true); }}
          className="h-9 px-4 rounded-lg bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 transition flex items-center gap-1.5 justify-center"
        >
          <Plus className="h-4 w-4" />
          عميل محتمل جديد
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 overflow-x-auto bg-white rounded-xl p-1.5 border border-slate-200">
        {tabs.map(([label, value, count]) => {
          const active = statusFilter === value;
          return (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap transition ${
                active ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {label}
              <span className={`mr-1.5 px-1.5 py-0.5 rounded-md text-[10px] ${active ? "bg-blue-700" : "bg-slate-100 text-slate-500"}`}>{count}</span>
            </button>
          );
        })}
        <div className="mr-auto pl-3 text-[11px] text-slate-500">
          إجمالي القيمة المقدرة: <span className="font-bold text-slate-700">{fmt(stats.totalValue)} ₪</span>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <div className="text-4xl mb-2">👥</div>
          <h3 className="text-sm font-bold text-slate-700">لا يوجد عملاء محتملون{search || statusFilter !== "all" ? " بهذا الفلتر" : ""}</h3>
          <p className="text-xs text-slate-500 mt-1">ابدأ بإضافة أول عميل محتمل لتتبع رحلة المبيعات</p>
          <button onClick={() => { setEditLead(null); setDialogOpen(true); }}
            className="mt-4 h-9 px-4 rounded-lg bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 transition inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> إضافة عميل محتمل
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(lead => (
            <div
              key={lead.id}
              onClick={() => { setEditLead(lead); setDialogOpen(true); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") { setEditLead(lead); setDialogOpen(true); } }}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-md transition group cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusChip status={lead.status} />
                    {lead.priority !== "medium" && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ background: PRIORITY_META[lead.priority].bg, color: PRIORITY_META[lead.priority].color }}>
                        {PRIORITY_META[lead.priority].label}
                      </span>
                    )}
                  </div>
                  <h3 className="text-[14px] font-bold text-slate-900 truncate">{lead.title}</h3>
                  {(lead.contact_name || lead.company_name) && (
                    <p className="text-[12px] text-slate-600 truncate mt-0.5">
                      {lead.contact_name}
                      {lead.contact_name && lead.company_name && " · "}
                      {lead.company_name && <span className="text-slate-500">{lead.company_name}</span>}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={(e) => { e.stopPropagation(); setEditLead(lead); setDialogOpen(true); }}
                    className="p-1.5 rounded-md text-slate-400 hover:bg-blue-50 hover:text-blue-600">
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); remove(lead); }}
                    className="p-1.5 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 mb-3">
                {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /><span dir="ltr">{lead.phone}</span></span>}
                {lead.whatsapp && <span className="flex items-center gap-1 text-green-600"><MessageCircle className="h-3 w-3" /><span dir="ltr">{lead.whatsapp}</span></span>}
                {lead.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /><span dir="ltr" className="truncate max-w-[120px]">{lead.email}</span></span>}
                {lead.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{lead.city}</span>}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div>
                  <div className="text-[10px] text-slate-400">القيمة المقدرة</div>
                  <div className="text-[13px] font-bold text-slate-900">
                    {fmt(Number(lead.estimated_value || 0))} ₪
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-[10px] text-slate-400">الاحتمالية</div>
                  <div className="text-[13px] font-bold text-blue-600">{lead.probability}%</div>
                </div>
              </div>

              {lead.next_activity_date && (
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">المتابعة القادمة:</span>
                  <span className="font-semibold text-amber-700">{fmtDateDisplay(lead.next_activity_date)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {dialogOpen && (
        <LeadFormDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditLead(null); }}
          onSaved={refetch}
          lead={editLead}
        />
      )}
    </div>
  );
}
