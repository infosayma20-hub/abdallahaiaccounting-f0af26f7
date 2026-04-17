import { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Plus, MoreVertical, CheckCircle2, XCircle, ListChecks, Calendar, AlertTriangle, ExternalLink } from "lucide-react";
import { useCrmOpportunities } from "./hooks/useCrmData";
import { STAGE_META, STAGES_ORDER, type CrmStage, type CrmOpportunity } from "./types";
import OpportunityFormDialog from "./OpportunityFormDialog";
import QuickActivityDialog from "./components/QuickActivityDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fmtDateDisplay } from "@/lib/utils";

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);
const today = () => new Date().toISOString().split("T")[0];

interface RiskMap {
  [contactId: string]: { class: string | null; overdue: number };
}

export default function CrmPipelinePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { opportunities, loading, refetch } = useCrmOpportunities();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOpp, setEditOpp] = useState<CrmOpportunity | null>(null);
  const [defaultStage, setDefaultStage] = useState<string>("new");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [activityDialog, setActivityDialog] = useState<{ open: boolean; contactId: string }>({ open: false, contactId: "" });
  const [riskMap, setRiskMap] = useState<RiskMap>({});

  useEffect(() => {
    if (params.get("new") === "1") {
      setEditOpp(null);
      setDefaultStage("new");
      setDialogOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  // Fetch risk data for all linked contacts
  const loadRiskData = useCallback(async () => {
    const contactIds = Array.from(new Set(opportunities.map(o => o.contact_id).filter(Boolean) as string[]));
    if (contactIds.length === 0) return;
    const { data } = await supabase
      .from("contacts")
      .select("id, contact_class, overdue_amount")
      .in("id", contactIds);
    const map: RiskMap = {};
    (data || []).forEach((c: any) => {
      map[c.id] = { class: c.contact_class, overdue: Number(c.overdue_amount || 0) };
    });
    setRiskMap(map);
  }, [opportunities]);

  useEffect(() => { loadRiskData(); }, [loadRiskData]);

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
    const payload: any = { stage };
    if (stage === "won") payload.won_at = new Date().toISOString();
    if (stage === "lost") payload.lost_at = new Date().toISOString();
    const { error } = await supabase.from("crm_opportunities").update(payload).eq("id", opp.id);
    if (error) { toast.error("تعذر نقل الفرصة"); return; }
    toast.success(`تم النقل إلى: ${STAGE_META[stage].label}`);
    refetch();
  };

  const quickStage = async (opp: CrmOpportunity, stage: CrmStage) => {
    const payload: any = { stage };
    if (stage === "won") payload.won_at = new Date().toISOString();
    if (stage === "lost") payload.lost_at = new Date().toISOString();
    const { error } = await supabase.from("crm_opportunities").update(payload).eq("id", opp.id);
    if (error) { toast.error("تعذر التحديث"); return; }
    toast.success(`تم النقل إلى: ${STAGE_META[stage].label}`);
    setMenuOpenId(null);
    refetch();
  };

  const getRisk = (opp: CrmOpportunity): { label: string; color: string; bg: string } | null => {
    if (!opp.contact_id) return null;
    const r = riskMap[opp.contact_id];
    if (!r) return null;
    if (r.class === "D") return { label: "D", color: "#B91C1C", bg: "#FEE2E2" };
    if (r.overdue > 0) return { label: "متأخر", color: "#C2410C", bg: "#FFEDD5" };
    if (r.class === "A") return { label: "A", color: "#15803D", bg: "#DCFCE7" };
    if (r.class) return { label: r.class, color: "#0369A1", bg: "#E0F2FE" };
    return null;
  };

  return (
    <div className="space-y-4" dir="rtl" onClick={() => setMenuOpenId(null)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] text-slate-500">اسحب البطاقات بين المراحل لتحديث حالة الفرصة فوراً · انقر على البطاقة للتفاصيل</p>
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
                  className="w-[280px] flex-shrink-0 bg-slate-50 rounded-xl border border-slate-200 flex flex-col"
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
                    ) : items.map(opp => {
                      const risk = getRisk(opp);
                      const nextDate = opp.next_activity_date;
                      const isOverdueActivity = nextDate && nextDate < today();
                      const isMenuOpen = menuOpenId === opp.id;
                      return (
                        <div
                          key={opp.id}
                          draggable
                          onDragStart={() => setDraggedId(opp.id)}
                          onClick={(e) => {
                            if (isMenuOpen) return;
                            e.stopPropagation();
                            navigate(`/crm/opportunity/${opp.id}`);
                          }}
                          className="bg-white rounded-lg p-3 border border-slate-200 hover:border-blue-300 hover:shadow-sm cursor-pointer transition group relative"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="text-[12px] font-bold text-slate-900 line-clamp-2 flex-1">{opp.title}</h4>
                            <button
                              onClick={(e) => { e.stopPropagation(); setMenuOpenId(isMenuOpen ? null : opp.id); }}
                              className="text-slate-300 hover:text-slate-700 transition opacity-0 group-hover:opacity-100"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {opp.customer_name && (
                            <div className="flex items-center justify-between mb-2 gap-1">
                              <p className="text-[11px] text-slate-500 truncate flex-1">👤 {opp.customer_name}</p>
                              {risk && (
                                <span
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                  style={{ background: risk.bg, color: risk.color }}
                                  title="فئة العميل / حالة الائتمان"
                                >
                                  {risk.label}
                                </span>
                              )}
                            </div>
                          )}

                          {nextDate && (
                            <div className={`flex items-center gap-1 text-[10px] mb-2 ${isOverdueActivity ? "text-red-600 font-bold" : "text-slate-500"}`}>
                              {isOverdueActivity ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                              <span>متابعة: {fmtDateDisplay(nextDate)}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100">
                            <span className="font-bold text-slate-700">{fmt(Number(opp.expected_value || 0))} ₪</span>
                            <span className="font-semibold text-blue-600">{opp.probability}%</span>
                          </div>

                          {/* Context menu */}
                          {isMenuOpen && (
                            <div
                              className="absolute top-9 left-2 bg-white rounded-lg border border-slate-200 shadow-xl z-20 min-w-[170px] py-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => { setMenuOpenId(null); navigate(`/crm/opportunity/${opp.id}`); }}
                                className="w-full text-right px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <ExternalLink className="h-3 w-3" /> فتح التفاصيل
                              </button>
                              {opp.stage !== "won" && (
                                <button
                                  onClick={() => quickStage(opp, "won")}
                                  className="w-full text-right px-3 py-1.5 text-[11px] text-emerald-700 hover:bg-emerald-50 flex items-center gap-2"
                                >
                                  <CheckCircle2 className="h-3 w-3" /> تحديد كفائزة
                                </button>
                              )}
                              {opp.stage !== "lost" && (
                                <button
                                  onClick={() => quickStage(opp, "lost")}
                                  className="w-full text-right px-3 py-1.5 text-[11px] text-red-700 hover:bg-red-50 flex items-center gap-2"
                                >
                                  <XCircle className="h-3 w-3" /> تحديد كخاسرة
                                </button>
                              )}
                              {opp.contact_id && (
                                <button
                                  onClick={() => {
                                    setMenuOpenId(null);
                                    setActivityDialog({ open: true, contactId: opp.contact_id! });
                                  }}
                                  className="w-full text-right px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-t border-slate-100"
                                >
                                  <ListChecks className="h-3 w-3" /> إضافة متابعة
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
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

      {activityDialog.open && (
        <QuickActivityDialog
          open={activityDialog.open}
          contactId={activityDialog.contactId}
          onClose={() => setActivityDialog({ open: false, contactId: "" })}
          onSaved={refetch}
        />
      )}
    </div>
  );
}
