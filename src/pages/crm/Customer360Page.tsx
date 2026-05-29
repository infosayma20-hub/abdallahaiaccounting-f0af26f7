// Customer 360 page — /crm/customer/:id
// Composes header + financial KPIs + policy panel + alerts + 5 tabs + timeline.
// Read-only over contacts + contact_class_policies + invoices + crm_*.

import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { useCustomer360 } from "./hooks/useCustomer360";
import { useCrmOpportunities, useCrmActivities } from "./hooks/useCrmData";
import {
  getRiskBadge,
  evaluateCreditDecision,
  evaluateFollowUp,
} from "./lib/policyEngine";
import { STAGE_META, ACTIVITY_META } from "./types";
import { fmtDateDisplay } from "@/lib/utils";

import CustomerHeader from "./components/CustomerHeader";
import CustomerFinancialSummary from "./components/CustomerFinancialSummary";
import CustomerPolicyPanel from "./components/CustomerPolicyPanel";
import CreditWarningBanner from "./components/CreditWarningBanner";
import CustomerActivityTimeline from "./components/CustomerActivityTimeline";
import CustomerUnifiedTimeline from "./components/CustomerUnifiedTimeline";
import CustomerInvoicesList, { type InvoiceRow } from "./components/CustomerInvoicesList";
import CustomerAgingPanel from "./components/CustomerAgingPanel";
import OpportunityFormDialog from "./OpportunityFormDialog";
import QuickActivityDialog from "./components/QuickActivityDialog";

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);

interface ContactExtra {
  phone: string | null;
  email: string | null;
}

interface PaymentRow {
  id: string;
  voucher_date: string;
  amount: number;
  voucher_number: string | null;
}

export default function Customer360Page() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { contact, policy, financials, loading, refetch } = useCustomer360(id);
  const { opportunities, refetch: refetchOpps } = useCrmOpportunities();
  const { activities, refetch: refetchActs } = useCrmActivities();

  const [extra, setExtra] = useState<ContactExtra | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [oppDialogOpen, setOppDialogOpen] = useState(false);
  const [actDialogOpen, setActDialogOpen] = useState(false);

  // Fetch additional contact channels + invoices + payments
  useEffect(() => {
    if (!user || !id) return;

    const sb = supabase as any;

    sb.from("contacts")
      .select("phone, email")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: any) => setExtra((data as ContactExtra) ?? null));

    sb.from("invoices")
      .select("id, invoice_number, invoice_date, due_date, total_amount, paid_amount, status, invoice_type")
      .eq("user_id", user.id)
      .eq("contact_id", id)
      .neq("status", "cancelled")
      .order("invoice_date", { ascending: false })
      .limit(200)
      .then(({ data }: any) => setInvoices((data as InvoiceRow[]) || []));

    sb.from("transactions")
      .select("id, voucher_date, amount, voucher_number, voucher_type")
      .eq("user_id", user.id)
      .eq("contact_id", id)
      .eq("voucher_type", "receipt")
      .order("voucher_date", { ascending: false })
      .limit(100)
      .then(({ data }: any) => setPayments(((data as any[]) || []).map((r: any) => ({
        id: r.id,
        voucher_date: r.voucher_date,
        amount: Number(r.amount || 0),
        voucher_number: r.voucher_number,
      }))));
  }, [user, id]);

  // Filter CRM data to this contact
  const customerOpps = useMemo(
    () => opportunities.filter((o) => o.contact_id === id),
    [opportunities, id],
  );
  const customerActs = useMemo(
    () => activities.filter((a) => a.contact_id === id),
    [activities, id],
  );

  // Policy-driven calculations
  const riskBadge = useMemo(() => getRiskBadge(contact, financials), [contact, financials]);
  const decision = useMemo(
    () => evaluateCreditDecision(contact, policy, financials, 0),
    [contact, policy, financials],
  );
  const lastActivityDate = customerActs[0]?.completed_at ?? customerActs[0]?.created_at ?? null;
  const followUp = useMemo(
    () => evaluateFollowUp(contact, policy, lastActivityDate),
    [contact, policy, lastActivityDate],
  );

  // Activity classification for tab
  const today = new Date().toISOString().split("T")[0];
  const upcomingActs = customerActs.filter((a) => a.status === "pending" && a.due_date && a.due_date >= today);
  const overdueActs = customerActs.filter((a) => a.status === "pending" && a.due_date && a.due_date < today);
  const completedActs = customerActs.filter((a) => a.status === "completed");

  // Average payment delay (best effort from contact field)
  const avgDelay = contact?.avg_payment_days ?? null;
  const lastPayment = payments[0]?.voucher_date ?? null;

  if (!id) {
    return <div className="p-8 text-center text-slate-500">عميل غير محدد</div>;
  }

  if (loading && !contact) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm" dir="rtl">جارٍ تحميل بيانات العميل...</div>
    );
  }

  if (!contact) {
    return (
      <div className="p-8 text-center" dir="rtl">
        <p className="text-slate-500 text-sm">تعذّر إيجاد هذا العميل</p>
        <button
          onClick={() => navigate("/crm/customers")}
          className="mt-3 h-9 px-4 rounded-lg bg-blue-600 text-white text-[12px] font-semibold"
        >
          العودة لمركز العملاء
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8" dir="rtl">
      {/* Back navigation */}
      <button
        onClick={() => navigate("/crm/customers")}
        className="text-[12px] text-slate-500 hover:text-slate-800 flex items-center gap-1"
      >
        <ArrowRight className="h-3.5 w-3.5" />
        مركز العملاء
      </button>

      {/* Header */}
      <CustomerHeader
        contact={contact}
        policy={policy}
        riskBadge={riskBadge}
        phone={extra?.phone}
        email={extra?.email}
        whatsapp={extra?.phone}
        onNewOpportunity={() => setOppDialogOpen(true)}
        onNewActivity={() => setActDialogOpen(true)}
      />

      {/* Alerts */}
      {decision.warnings.length > 0 && <CreditWarningBanner decision={decision} />}
      {followUp.urgency === "high" || followUp.urgency === "critical" ? (
        <div
          className={`rounded-lg border px-3 py-2 text-[12px] flex items-center gap-2 ${
            followUp.urgency === "critical"
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-orange-50 border-orange-200 text-orange-800"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          <span>{followUp.message}</span>
        </div>
      ) : null}

      {/* Financial KPIs (6 tiles) */}
      <FinancialKpiGrid
        outstanding={financials?.outstanding ?? 0}
        overdue={financials?.overdue ?? 0}
        creditLimit={decision.effectiveLimit}
        available={decision.available}
        lastPayment={lastPayment}
        avgDelay={avgDelay}
      />

      {/* Policy panel */}
      <CustomerPolicyPanel contact={contact} policy={policy} decision={decision} />

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-white border border-slate-200 h-auto p-1 flex flex-wrap gap-1">
          <TabsTrigger value="overview" className="text-[12px]">نظرة عامة</TabsTrigger>
          <TabsTrigger value="opportunities" className="text-[12px]">الفرص ({customerOpps.length})</TabsTrigger>
          <TabsTrigger value="invoices" className="text-[12px]">الفواتير ({invoices.length})</TabsTrigger>
          <TabsTrigger value="activities" className="text-[12px]">المتابعات ({customerActs.length})</TabsTrigger>
          <TabsTrigger value="financial" className="text-[12px]">التفاصيل المالية</TabsTrigger>
          <TabsTrigger value="timeline" className="text-[12px]">السجل الزمني</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-3 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard label="فرص نشطة" value={customerOpps.filter((o) => !["won", "lost"].includes(o.stage)).length.toString()} />
            <StatCard label="متابعات معلّقة" value={(upcomingActs.length + overdueActs.length).toString()} sub={overdueActs.length > 0 ? `${overdueActs.length} متأخرة` : undefined} tone={overdueActs.length > 0 ? "danger" : "default"} />
            <StatCard label="إجمالي المبيعات (سنة)" value={`${fmt(financials?.total_ytd ?? 0)} ₪`} sub={`${financials?.invoices_count ?? 0} فاتورة`} tone="good" />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">سجل النشاط</h3>
            <CustomerActivityTimeline
              activities={customerActs}
              invoices={invoices.slice(0, 20).map((i) => ({
                id: i.id,
                invoice_number: i.invoice_number,
                invoice_date: i.invoice_date,
                total_amount: i.total_amount,
                status: i.status,
              }))}
              payments={payments.slice(0, 20)}
              limit={20}
            />
          </div>
        </TabsContent>

        {/* Opportunities */}
        <TabsContent value="opportunities" className="mt-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            {customerOpps.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-6">لا توجد فرص لهذا العميل</p>
            ) : (
              <div className="space-y-2">
                {customerOpps.map((o) => (
                  <div key={o.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-slate-900 truncate">{o.title}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span
                          className="inline-block text-[10px] px-1.5 py-0.5 rounded font-bold"
                          style={{ background: STAGE_META[o.stage].bg, color: STAGE_META[o.stage].color }}
                        >
                          {STAGE_META[o.stage].label}
                        </span>
                        {o.expected_close_date && (
                          <span className="text-[10px] text-slate-500">
                            متوقع: {fmtDateDisplay(o.expected_close_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <div className="text-[13px] font-bold text-slate-900">{fmt(Number(o.expected_value || 0))} ₪</div>
                      <div className="text-[10px] text-slate-500">احتمالية: {o.probability}٪</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Invoices */}
        <TabsContent value="invoices" className="mt-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <CustomerInvoicesList invoices={invoices} />
          </div>
        </TabsContent>

        {/* Activities */}
        <TabsContent value="activities" className="mt-3 space-y-4">
          {overdueActs.length > 0 && (
            <ActivitySection title="متأخرة" tone="danger" items={overdueActs} />
          )}
          <ActivitySection title="القادمة" tone="default" items={upcomingActs} emptyMsg="لا توجد متابعات قادمة" />
          <ActivitySection title="مكتملة" tone="good" items={completedActs.slice(0, 20)} emptyMsg="لا يوجد سجل" />
        </TabsContent>

        {/* Financial Details */}
        <TabsContent value="financial" className="mt-3 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <CustomerAgingPanel invoices={invoices} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">سجل الدفعات</h3>
            {payments.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-6">لا توجد دفعات مسجّلة</p>
            ) : (
              <div className="space-y-1.5">
                {payments.slice(0, 20).map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
                    <div>
                      <div className="text-[12px] font-semibold text-slate-900">{p.voucher_number ?? "—"}</div>
                      <div className="text-[10px] text-slate-500">{fmtDateDisplay(p.voucher_date)}</div>
                    </div>
                    <div className="text-[13px] font-bold text-emerald-700">{fmt(p.amount)} ₪</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Unified Timeline (CS) */}
        <TabsContent value="timeline" className="mt-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">السجل الزمني الموحّد</h3>
            <CustomerUnifiedTimeline contactId={id} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {oppDialogOpen && (
        <OpportunityFormDialog
          open={oppDialogOpen}
          onClose={() => setOppDialogOpen(false)}
          onSaved={() => { refetchOpps(); refetch(); }}
          opportunity={null}
        />
      )}
      {actDialogOpen && (
        <QuickActivityDialog
          open={actDialogOpen}
          contactId={id}
          onClose={() => setActDialogOpen(false)}
          onSaved={() => refetchActs()}
        />
      )}
    </div>
  );
}

// ===== Sub-components =====

function FinancialKpiGrid({
  outstanding, overdue, creditLimit, available, lastPayment, avgDelay,
}: {
  outstanding: number; overdue: number; creditLimit: number; available: number;
  lastPayment: string | null; avgDelay: number | null;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
      <Kpi label="الرصيد المستحق"  value={`${fmt(outstanding)} ₪`}  tone="default" />
      <Kpi label="متأخر السداد"    value={`${fmt(overdue)} ₪`}      tone={overdue > 0 ? "danger" : "good"} />
      <Kpi label="سقف الائتمان"    value={creditLimit > 0 ? `${fmt(creditLimit)} ₪` : "غير محدد"} tone="default" />
      <Kpi label="ائتمان متاح"    value={creditLimit > 0 ? `${fmt(available)} ₪` : "—"} tone={available > 0 ? "good" : "warn"} />
      <Kpi label="آخر دفعة"        value={lastPayment ? fmtDateDisplay(lastPayment) : "—"} tone="default" />
      <Kpi label="متوسط التأخير"   value={avgDelay != null ? `${Math.round(avgDelay)} يوم` : "—"} tone={avgDelay && avgDelay > 30 ? "warn" : "default"} />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "default" | "good" | "warn" | "danger" }) {
  const cls =
    tone === "danger" ? "text-red-700 border-red-100 bg-red-50/40" :
    tone === "warn" ? "text-amber-700 border-amber-100 bg-amber-50/40" :
    tone === "good" ? "text-emerald-700 border-emerald-100 bg-emerald-50/40" :
    "text-slate-900 border-slate-200 bg-white";
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="text-[10px] text-slate-500 font-medium">{label}</div>
      <div className="text-[14px] font-bold mt-1">{value}</div>
    </div>
  );
}

function StatCard({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "danger" }) {
  const valueClass =
    tone === "danger" ? "text-red-700" :
    tone === "good" ? "text-emerald-700" :
    "text-slate-900";
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${valueClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function ActivitySection({
  title, tone, items, emptyMsg,
}: {
  title: string;
  tone: "default" | "good" | "danger";
  items: ReturnType<typeof useCrmActivities>["activities"];
  emptyMsg?: string;
}) {
  const headerClass =
    tone === "danger" ? "text-red-700" :
    tone === "good" ? "text-emerald-700" :
    "text-slate-700";
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h4 className={`text-sm font-bold mb-3 ${headerClass}`}>
        {title} {items.length > 0 && <span className="text-slate-400 text-[11px]">({items.length})</span>}
      </h4>
      {items.length === 0 ? (
        <p className="text-[12px] text-slate-400 text-center py-3">{emptyMsg ?? "—"}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((a) => {
            const meta = ACTIVITY_META[a.activity_type] ?? ACTIVITY_META.note;
            return (
              <div key={a.id} className="flex items-center gap-2 py-2 px-2 hover:bg-slate-50 rounded">
                <span className="text-base">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-slate-900 truncate">{a.title}</div>
                  {a.description && <div className="text-[11px] text-slate-500 truncate">{a.description}</div>}
                </div>
                {a.due_date && (
                  <span className="text-[10px] text-slate-400 shrink-0">{fmtDateDisplay(a.due_date)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
