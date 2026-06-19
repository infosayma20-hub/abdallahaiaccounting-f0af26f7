import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowLeft, Phone, MessageCircle, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCrmOpportunities, useCrmActivities } from "./hooks/useCrmData";
import { useCustomer360 } from "./hooks/useCustomer360";
import { fmtDateDisplay } from "@/lib/utils";
import { STAGE_META } from "./types";
import {
  getRiskBadge,
  evaluateCreditDecision,
  evaluateFollowUp,
} from "./lib/policyEngine";
import CustomerPolicyBadge from "./components/CustomerPolicyBadge";
import CustomerFinancialSummary from "./components/CustomerFinancialSummary";
import CreditWarningBanner from "./components/CreditWarningBanner";

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);

interface CustomerListItem {
  id: string;
  contact_name: string;
  phone: string | null;
  contact_class: string | null;
  contact_type: string | null;
}

export default function CustomerCenterPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { opportunities } = useCrmOpportunities();
  const { activities } = useCrmActivities();
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Single composed read model — pulls master contact + policy + financials
  const { contact, policy, financials, loading } = useCustomer360(selectedId);

  // Master customer list — read-only from contacts (single source of truth)
  useEffect(() => {
    if (!user) return;
    supabase.from("contacts")
      .select("id, contact_name, phone, contact_class, contact_type")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .order("contact_name")
      .limit(500)
      .then(({ data }) => setCustomers((data as CustomerListItem[]) || []));
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      c.contact_name?.toLowerCase().includes(q) ||
      c.phone?.includes(q),
    );
  }, [customers, search]);

  const customerOpps = selectedId ? opportunities.filter(o => o.contact_id === selectedId) : [];
  const customerActivities = selectedId ? activities.filter(a => a.contact_id === selectedId).slice(0, 10) : [];

  // Policy-driven risk badge
  const riskBadge = useMemo(
    () => (selectedId ? getRiskBadge(contact, financials) : null),
    [selectedId, contact, financials],
  );

  // Credit decision based on current outstanding (no proposed amount here)
  const creditDecision = useMemo(
    () => evaluateCreditDecision(contact, policy, financials, 0),
    [contact, policy, financials],
  );

  // Follow-up urgency from last activity
  const lastActivityDate = customerActivities[0]?.completed_at ?? customerActivities[0]?.created_at ?? null;
  const followUp = useMemo(
    () => evaluateFollowUp(contact, policy, lastActivityDate),
    [contact, policy, lastActivityDate],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4" dir="rtl">
      {/* Customer list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-220px)]">
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث عن عميل..."
              className="h-9 w-full rounded-lg border border-slate-200 pr-10 pl-3 text-[13px] outline-none focus:border-blue-400" />
          </div>
          <div className="mt-2 text-[10px] text-slate-400">
            مصدر البيانات: قاعدة العملاء الرئيسية ({customers.length} عميل)
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-[12px] text-slate-400">لا يوجد عملاء</div>
          ) : filtered.map(c => (
            <button key={c.id} onClick={() => setSelectedId(c.id)}
              className={`w-full text-right p-3 border-b border-slate-50 hover:bg-blue-50 transition ${selectedId === c.id ? "bg-blue-50 border-r-2 border-r-blue-600" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-bold text-slate-900 truncate flex-1">{c.contact_name}</div>
                {c.contact_class && (
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={{
                      background: c.contact_class === "A" ? "#DCFCE7" : c.contact_class === "B" ? "#E0F2FE" : c.contact_class === "C" ? "#FEF3C7" : "#FEE2E2",
                      color: c.contact_class === "A" ? "#15803D" : c.contact_class === "B" ? "#0369A1" : c.contact_class === "C" ? "#A16207" : "#B91C1C",
                    }}
                  >
                    {c.contact_class}
                  </span>
                )}
              </div>
              {c.phone && <div className="text-[11px] text-slate-500 mt-0.5" dir="ltr">{c.phone}</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      {!selectedId ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="text-5xl mb-3">👤</div>
            <h3 className="text-sm font-bold text-slate-700">اختر عميلاً لعرض ملفه الكامل (360°)</h3>
            <p className="text-xs text-slate-500 mt-1">
              CRM يقرأ من قاعدة العملاء الرئيسية + سياسة الفئات + بيانات المحاسبة الحيّة
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-slate-900">{contact?.contact_name ?? "..."}</h2>
                  <CustomerPolicyBadge contact={contact} policy={policy} size="md" />
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500 flex-wrap">
                  {customers.find(c => c.id === selectedId)?.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      <span dir="ltr">{customers.find(c => c.id === selectedId)?.phone}</span>
                    </span>
                  )}
                  {policy && (
                    <span className="flex items-center gap-1 text-slate-600">
                      <Shield className="h-3 w-3" />
                      مدة السداد المعتمدة: <b>{policy.payment_terms_days ?? "—"}</b> يوم
                      {policy.discount_pct ? ` · خصم: ${policy.discount_pct}٪` : ""}
                    </span>
                  )}
                </div>
              </div>
              {riskBadge && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border"
                  style={{ background: riskBadge.bg, color: riskBadge.color, borderColor: riskBadge.border }}>
                  {riskBadge.label}
                </span>
              )}
            </div>
            {riskBadge && (
              <div className="mt-2 text-[10px] text-slate-400">السبب: {riskBadge.reason}</div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => navigate(`/crm/customer/${selectedId}`)}
                className="h-8 px-3 rounded-md bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700 flex items-center gap-1">
                فتح Customer 360° الكامل <ArrowLeft className="h-3 w-3" />
              </button>
              <button onClick={() => navigate(`/contacts/${selectedId}`)}
                className="h-8 px-3 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold hover:bg-slate-200">
                ملف العميل في قاعدة البيانات
              </button>
              <button onClick={() => navigate(`/account-statement?contact_id=${selectedId}`)}
                className="h-8 px-3 rounded-md bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100">
                كشف حساب
              </button>
              <button onClick={() => navigate("/invoices/new")}
                className="h-8 px-3 rounded-md bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700">
                + فاتورة جديدة
              </button>
            </div>
          </div>

          {/* Credit warning if any */}
          {creditDecision.warnings.length > 0 && (
            <CreditWarningBanner decision={creditDecision} />
          )}

          {/* Follow-up urgency */}
          {followUp.urgency !== "low" && (
            <div className={`rounded-lg border px-3 py-2 text-[12px] flex items-center gap-2 ${
              followUp.urgency === "critical" ? "bg-red-50 border-red-200 text-red-800" :
              followUp.urgency === "high" ? "bg-orange-50 border-orange-200 text-orange-800" :
              "bg-amber-50 border-amber-200 text-amber-800"
            }`}>
              <span>📞</span>
              <span>{followUp.message}</span>
            </div>
          )}

          {/* Financial KPIs (driven by Customer360 + policy) */}
          <CustomerFinancialSummary
            financials={financials}
            loading={loading}
            effectiveLimit={creditDecision.effectiveLimit}
          />

          {/* Opportunities */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">الفرص ({customerOpps.length})</h3>
            {customerOpps.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">لا توجد فرص لهذا العميل</p>
            ) : (
              <div className="space-y-2">
                {customerOpps.map(o => (
                  <div key={o.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
                    <div>
                      <div className="text-[12px] font-semibold text-slate-900">{o.title}</div>
                      <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: STAGE_META[o.stage].bg, color: STAGE_META[o.stage].color }}>
                        {STAGE_META[o.stage].label}
                      </span>
                    </div>
                    <div className="text-left text-[11px]">
                      <div className="font-bold text-slate-700">{fmt(Number(o.expected_value || 0))} ₪</div>
                      <div className="text-slate-400">{o.probability}%</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activities */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">آخر المتابعات</h3>
            {customerActivities.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">لا توجد متابعات بعد</p>
            ) : (
              <div className="space-y-2">
                {customerActivities.map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-[12px]">
                    <span className={`h-2 w-2 rounded-full ${a.status === "completed" ? "bg-green-500" : "bg-amber-500"}`} />
                    <span className="text-slate-700 flex-1 truncate">{a.title}</span>
                    {a.due_date && <span className="text-[10px] text-slate-400">{fmtDateDisplay(a.due_date)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
