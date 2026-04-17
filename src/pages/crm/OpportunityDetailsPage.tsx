import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowRight, Edit, Trash2, FileText, DollarSign, CheckCircle2, XCircle, User, Calendar, TrendingUp, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { fmtDateDisplay } from "@/lib/utils";
import { STAGE_META, STAGES_ORDER, PRIORITY_META, ACTIVITY_META, type CrmOpportunity, type CrmActivity, type CrmStage } from "./types";
import { useCustomer360 } from "./hooks/useCustomer360";
import { evaluateCreditDecision, getRiskBadge } from "./lib/policyEngine";
import OpportunityFormDialog from "./OpportunityFormDialog";
import QuickActivityDialog from "./components/QuickActivityDialog";
import CustomerPolicyBadge from "./components/CustomerPolicyBadge";
import CustomerFinancialSummary from "./components/CustomerFinancialSummary";
import CustomerActivityTimeline from "./components/CustomerActivityTimeline";

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);

export default function OpportunityDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [opp, setOpp] = useState<CrmOpportunity | null>(null);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    const [{ data: o }, { data: acts }] = await Promise.all([
      supabase.from("crm_opportunities").select("*").eq("id", id).maybeSingle(),
      supabase.from("crm_activities").select("*").eq("opportunity_id", id).order("due_date", { ascending: false, nullsFirst: false }),
    ]);
    setOpp((o as any) || null);
    setActivities((acts as any) || []);
    setLoading(false);
  }, [user, id]);

  useEffect(() => { load(); }, [load]);

  const { contact, policy, financials } = useCustomer360(opp?.contact_id || null);
  const decision = useMemo(
    () => evaluateCreditDecision(contact, policy, financials, Number(opp?.expected_value || 0)),
    [contact, policy, financials, opp?.expected_value],
  );
  const risk = useMemo(() => getRiskBadge(contact, financials), [contact, financials]);

  const moveToStage = async (stage: CrmStage) => {
    if (!opp) return;
    const payload: any = { stage };
    if (stage === "won") payload.won_at = new Date().toISOString();
    if (stage === "lost") payload.lost_at = new Date().toISOString();
    const { error } = await supabase.from("crm_opportunities").update(payload).eq("id", opp.id);
    if (error) { toast.error("تعذر التحديث"); return; }
    toast.success(`تم النقل إلى: ${STAGE_META[stage].label}`);
    load();
  };

  const remove = async () => {
    if (!opp) return;
    if (!window.confirm("هل أنت متأكد من حذف هذه الفرصة؟")) return;
    const { error } = await supabase.from("crm_opportunities").delete().eq("id", opp.id);
    if (error) { toast.error("تعذر الحذف"); return; }
    toast.success("تم الحذف");
    navigate("/crm/pipeline");
  };

  const completeActivity = async (a: CrmActivity) => {
    const { error } = await supabase.from("crm_activities").update({
      status: "completed", completed_at: new Date().toISOString(),
    }).eq("id", a.id);
    if (error) { toast.error("تعذر التحديث"); return; }
    load();
  };

  const createInvoice = () => {
    if (!opp) return;
    const params = new URLSearchParams();
    if (opp.contact_id) params.set("contact_id", opp.contact_id);
    if (opp.expected_value) params.set("amount", String(opp.expected_value));
    if (opp.title) params.set("note", opp.title);
    params.set("crm_opportunity_id", opp.id);
    navigate(`/invoices/new?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!opp) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-slate-300 py-20 text-center">
        <h3 className="text-sm font-bold text-slate-700 mb-2">لم يتم العثور على الفرصة</h3>
        <button onClick={() => navigate("/crm/pipeline")} className="text-xs text-blue-600 hover:underline">
          العودة إلى قمع المبيعات ←
        </button>
      </div>
    );
  }

  const stageMeta = STAGE_META[opp.stage];
  const isClosed = opp.stage === "won" || opp.stage === "lost";

  return (
    <div className="space-y-4" dir="rtl">
      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate("/crm/pipeline")} className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-900 transition">
          <ArrowRight className="h-3.5 w-3.5" /> قمع المبيعات
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setActivityOpen(true)} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-[12px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> متابعة
          </button>
          <button onClick={createInvoice} className="h-9 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-100 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> تحويل لفاتورة
          </button>
          <button onClick={() => setEditOpen(true)} className="h-9 px-3 rounded-lg bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700 flex items-center gap-1.5">
            <Edit className="h-3.5 w-3.5" /> تعديل
          </button>
          <button onClick={remove} className="h-9 w-9 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 flex items-center justify-center">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold" style={{ background: stageMeta.bg, color: stageMeta.color, border: `1px solid ${stageMeta.border}` }}>
                {stageMeta.label}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ background: PRIORITY_META[opp.priority].bg, color: PRIORITY_META[opp.priority].color }}>
                {PRIORITY_META[opp.priority].label}
              </span>
              {contact && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold border" style={{ background: risk.bg, color: risk.color, borderColor: risk.border }}>
                  {risk.label}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">{opp.title}</h1>
            {opp.description && <p className="text-[13px] text-slate-600">{opp.description}</p>}
          </div>
          <div className="text-left">
            <div className="text-[10px] text-slate-500 mb-1">القيمة المتوقعة</div>
            <div className="text-2xl font-bold text-slate-900">{fmt(Number(opp.expected_value || 0))} ₪</div>
            <div className="text-[11px] text-slate-500 mt-1">
              مرجح: <span className="font-semibold text-blue-600">{fmt(Number(opp.weighted_value || 0))} ₪</span> · {opp.probability}%
            </div>
          </div>
        </div>

        {/* Meta strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100">
          <div>
            <div className="text-[10px] text-slate-400 mb-0.5">الإغلاق المتوقع</div>
            <div className="text-[12px] font-semibold text-slate-700 flex items-center gap-1">
              <Calendar className="h-3 w-3 text-slate-400" />
              {opp.expected_close_date ? fmtDateDisplay(opp.expected_close_date) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 mb-0.5">آخر متابعة</div>
            <div className="text-[12px] font-semibold text-slate-700">
              {opp.last_activity_date ? fmtDateDisplay(opp.last_activity_date) : "لا يوجد"}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 mb-0.5">المتابعة القادمة</div>
            <div className="text-[12px] font-semibold text-slate-700">
              {opp.next_activity_date ? fmtDateDisplay(opp.next_activity_date) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 mb-0.5">تم الإنشاء</div>
            <div className="text-[12px] font-semibold text-slate-700">{fmtDateDisplay(opp.created_at)}</div>
          </div>
        </div>

        {/* Stage actions */}
        {!isClosed && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100 flex-wrap">
            <span className="text-[11px] text-slate-500 ml-1">نقل سريع:</span>
            {STAGES_ORDER.filter(s => s !== opp.stage).map(s => {
              const meta = STAGE_META[s];
              const isWin = s === "won", isLose = s === "lost";
              return (
                <button key={s} onClick={() => moveToStage(s)}
                  className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition flex items-center gap-1 ${
                    isWin ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100" :
                    isLose ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100" :
                    "border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                  style={!isWin && !isLose ? { color: meta.color, borderColor: meta.border } : {}}
                >
                  {isWin && <CheckCircle2 className="h-3 w-3" />}
                  {isLose && <XCircle className="h-3 w-3" />}
                  {meta.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: timeline */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" /> سجل النشاط
            </h2>
            <button onClick={() => setActivityOpen(true)} className="text-[11px] text-blue-600 hover:underline font-semibold">
              + إضافة متابعة
            </button>
          </div>

          {/* Tasks/follow-ups list */}
          {activities.length > 0 && (
            <div className="mb-5">
              <h3 className="text-[11px] font-bold text-slate-500 mb-2">المتابعات والمهام</h3>
              <div className="space-y-1.5">
                {activities.slice(0, 10).map(a => {
                  const meta = ACTIVITY_META[a.activity_type];
                  const isPending = a.status === "pending";
                  return (
                    <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50/50">
                      <span className="text-base">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-slate-900 truncate">{a.title}</div>
                        <div className="text-[10px] text-slate-500">
                          {meta.label} · {a.due_date ? fmtDateDisplay(a.due_date) : "بدون تاريخ"}
                        </div>
                      </div>
                      {isPending ? (
                        <button onClick={() => completeActivity(a)} className="h-6 px-2 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">
                          ✓ إنجاز
                        </button>
                      ) : (
                        <span className="text-[10px] text-emerald-600 font-semibold">✓ تم</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {opp.notes && (
            <div className="mb-5 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <h3 className="text-[11px] font-bold text-amber-800 mb-1">ملاحظات داخلية</h3>
              <p className="text-[12px] text-slate-700 whitespace-pre-wrap">{opp.notes}</p>
            </div>
          )}

          {opp.lost_reason && (
            <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200">
              <h3 className="text-[11px] font-bold text-red-800 mb-1">سبب الخسارة</h3>
              <p className="text-[12px] text-slate-700">{opp.lost_reason}</p>
            </div>
          )}

          {/* Combined timeline */}
          <h3 className="text-[11px] font-bold text-slate-500 mb-3">الخط الزمني</h3>
          <CustomerActivityTimeline activities={activities} invoices={[]} payments={[]} limit={20} />
        </div>

        {/* Right: customer panel */}
        <div className="space-y-4">
          {contact ? (
            <>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-bold text-slate-500">العميل المرتبط</h3>
                  <Link to={`/crm/customer/${contact.id}`} className="text-[10px] text-blue-600 hover:underline font-semibold">
                    عرض ملف 360 ←
                  </Link>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                    <User className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-slate-900 truncate">{contact.contact_name}</div>
                    <CustomerPolicyBadge contact={contact} policy={policy} size="sm" />
                  </div>
                </div>
                {financials && (
                  <CustomerFinancialSummary
                    financials={financials}
                    decision={decision}
                    risk={risk}
                    compact
                  />
                )}
              </div>

              {decision.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <h3 className="text-[11px] font-bold text-amber-800 mb-2">تنبيهات السياسة الائتمانية</h3>
                  <ul className="space-y-1">
                    {decision.warnings.map((w, i) => (
                      <li key={i} className="text-[11px] text-amber-900 flex gap-1.5">
                        <span>•</span><span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center">
              <User className="h-6 w-6 text-slate-300 mx-auto mb-2" />
              <p className="text-[11px] text-slate-500 mb-2">
                {opp.customer_name || "لم يتم ربط هذه الفرصة بعميل من قاعدة العملاء"}
              </p>
              <button onClick={() => setEditOpen(true)} className="text-[11px] text-blue-600 hover:underline font-semibold">
                ربط بعميل ←
              </button>
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <OpportunityFormDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={load}
          opportunity={opp}
        />
      )}

      {activityOpen && (
        <QuickActivityDialog
          open={activityOpen}
          onClose={() => setActivityOpen(false)}
          onSaved={load}
          opportunityId={opp.id}
          contactId={opp.contact_id || undefined}
        />
      )}
    </div>
  );
}
