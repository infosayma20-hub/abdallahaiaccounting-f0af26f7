import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, MoreVertical } from "lucide-react";
import { useCrmOpportunities } from "./hooks/useCrmData";
import { STAGE_META, STAGES_ORDER, type CrmStage, type CrmOpportunity } from "./types";
import OpportunityFormDialog from "./OpportunityFormDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);

export default function CrmPipelinePage() {
  const [params, setParams] = useSearchParams();
  const { opportunities, loading, refetch } = useCrmOpportunities();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOpp, setEditOpp] = useState<CrmOpportunity | null>(null);
  const [defaultStage, setDefaultStage] = useState<string>("new");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    if (params.get("new") === "1") {
      setEditOpp(null);
      setDefaultStage("new");
      setDialogOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const grouped = useMemo(() => {
    const g: Record<CrmStage, CrmOpportunity[]> = {
      new: [], contacted: [], qualified: [], proposal: [],
      negotiation: [], won: [], lost: [], on_hold: [],
    };
    opportunities.forEach(o => g[o.stage].push(o));
    return g;
  }, [opportunities]);

  const handleDrop = async (stage: CrmStage) => {
    if (!draggedId) return;
    const opp = opportunities.find(o => o.id === draggedId);
    setDraggedId(null);
    if (!opp || opp.stage === stage) return;
    const { error } = await supabase.from("crm_opportunities").update({ stage }).eq("id", opp.id);
    if (error) { toast.error("تعذر نقل الفرصة"); return; }
    toast.success(`تم النقل إلى: ${STAGE_META[stage].label}`);
    refetch();
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] text-slate-500">اسحب البطاقات بين المراحل لتحديث حالة الفرصة فوراً</p>
        </div>
        <button
          onClick={() => { setEditOpp(null); setDefaultStage("new"); setDialogOpen(true); }}
          className="h-9 px-4 rounded-lg bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 transition flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" /> فرصة جديدة
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-w-max">
            {STAGES_ORDER.map(stage => {
              const meta = STAGE_META[stage];
              const items = grouped[stage];
              const total = items.reduce((s, o) => s + Number(o.expected_value || 0), 0);
              return (
                <div key={stage}
                  className="w-[270px] flex-shrink-0 bg-slate-50 rounded-xl border border-slate-200 flex flex-col"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(stage)}
                >
                  <div className="p-3 border-b" style={{ borderColor: meta.border, background: meta.bg }}>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-[13px] font-bold" style={{ color: meta.color }}>{meta.label}</h3>
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-white" style={{ color: meta.color }}>
                        {items.length}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600">{fmt(total)} ₪</div>
                  </div>
                  <div className="p-2 space-y-2 min-h-[300px] max-h-[calc(100vh-280px)] overflow-y-auto">
                    {items.length === 0 ? (
                      <div className="text-center text-[11px] text-slate-400 py-8">لا توجد فرص</div>
                    ) : items.map(opp => (
                      <div
                        key={opp.id}
                        draggable
                        onDragStart={() => setDraggedId(opp.id)}
                        onClick={() => { setEditOpp(opp); setDialogOpen(true); }}
                        className="bg-white rounded-lg p-3 border border-slate-200 hover:border-blue-300 hover:shadow-sm cursor-pointer transition group"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className="text-[12px] font-bold text-slate-900 line-clamp-2 flex-1">{opp.title}</h4>
                          <MoreVertical className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100" />
                        </div>
                        {opp.customer_name && (
                          <p className="text-[11px] text-slate-500 truncate mb-2">👤 {opp.customer_name}</p>
                        )}
                        <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100">
                          <span className="font-bold text-slate-700">{fmt(Number(opp.expected_value || 0))} ₪</span>
                          <span className="font-semibold text-blue-600">{opp.probability}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {dialogOpen && (
        <OpportunityFormDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditOpp(null); }}
          onSaved={refetch}
          opportunity={editOpp}
          defaultStage={defaultStage}
        />
      )}
    </div>
  );
}
