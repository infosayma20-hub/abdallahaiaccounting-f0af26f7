import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Clock, AlertTriangle, LifeBuoy, Phone, Calendar, Repeat,
  StickyNote, Plus, ExternalLink, Ticket, UserX, Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  useCsTickets, useCsCalls, useCsMeetings,
  useCsSubscriptions,
} from "./hooks/useCsData";
import { useCrmActivities } from "./hooks/useCrmData";
import { TICKET_PRIORITY_META, type CsTimelineEvent } from "./types-cs";
import { fmtDateDisplay } from "@/lib/utils";
import CsQuickAddDialog, { type CsQuickKind } from "./components/CsQuickAddDialog";

const sb = supabase as any;
const today = () => new Date().toISOString().split("T")[0];
const daysFromNow = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

type TaskRow = {
  key: string;
  contactId: string | null;
  contactName: string;
  type: "ticket_new" | "ticket_critical" | "renewal" | "meeting_today" | "no_contact_30d";
  typeLabel: string;
  typeColor: string;
  typeBg: string;
  priority?: string;
  priorityColor?: string;
  priorityBg?: string;
  date: string;
  link: string;
};

export default function CrmWorkbenchPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items: tickets, refetch: refetchTickets } = useCsTickets();
  const { items: calls, refetch: refetchCalls } = useCsCalls();
  const { items: meetings, refetch: refetchMeetings } = useCsMeetings();
  const { items: subs } = useCsSubscriptions();
  const { activities, refetch: refetchActs } = useCrmActivities();

  const [contactsMap, setContactsMap] = useState<Record<string, string>>({});
  const [recentEvents, setRecentEvents] = useState<CsTimelineEvent[]>([]);
  const [noContact30d, setNoContact30d] = useState<{ id: string; name: string; lastDate: string | null }[]>([]);
  const [quick, setQuick] = useState<CsQuickKind | null>(null);

  // Load contacts directory once
  useEffect(() => {
    if (!user) return;
    sb.from("contacts").select("id, contact_name").eq("user_id", user.id).limit(2000)
      .then(({ data }: any) => {
        const m: Record<string, string> = {};
        (data || []).forEach((c: any) => { m[c.id] = c.contact_name; });
        setContactsMap(m);
      });
  }, [user]);

  // Recent 20 events (global timeline for current user)
  useEffect(() => {
    if (!user) return;
    sb.from("cs_customer_timeline_view").select("*")
      .eq("user_id", user.id).order("event_date", { ascending: false }).limit(20)
      .then(({ data }: any) => setRecentEvents((data as CsTimelineEvent[]) || []));
  }, [user, tickets, calls, meetings]);

  // Customers with no activity in last 30 days
  useEffect(() => {
    if (!user) return;
    const cutoffMs = Date.now() - 30 * 86400000;
    sb.from("cs_customer_timeline_view").select("contact_id, event_date")
      .eq("user_id", user.id).order("event_date", { ascending: false }).limit(3000)
      .then(({ data }: any) => {
        const lastByContact: Record<string, string> = {};
        (data || []).forEach((r: any) => {
          if (!r.contact_id) return;
          if (!lastByContact[r.contact_id]) lastByContact[r.contact_id] = r.event_date;
        });
        sb.from("contacts").select("id, contact_name")
          .eq("user_id", user.id).eq("is_archived", false).limit(2000)
          .then(({ data: cdata }: any) => {
            const rows = (cdata || [])
              .map((c: any) => {
                const last = lastByContact[c.id] || null;
                return { id: c.id, name: c.contact_name, lastDate: last };
              })
              .filter((c: any) => !c.lastDate || new Date(c.lastDate).getTime() < cutoffMs)
              .slice(0, 20);
            setNoContact30d(rows);
          });
      });
  }, [user, tickets, calls, meetings]);

  const t = today();

  const kpis = useMemo(() => {
    const dueToday = activities.filter((a) => a.status === "pending" && a.due_date === t).length;
    const overdue = activities.filter((a) => a.status === "pending" && a.due_date && a.due_date < t).length;
    const openTickets = tickets.filter((x) => !["resolved", "closed"].includes(x.status));
    const critical = openTickets.filter((x) => x.priority === "critical");
    const callsToday = calls.filter((c) => c.called_at.startsWith(t)).length;
    const meetingsToday = meetings.filter((m) => m.meeting_date.startsWith(t)).length;
    const renewals7 = subs.filter((s) => { const d = daysFromNow(s.renewal_date); return d >= 0 && d <= 7; }).length;
    return {
      dueToday, overdue,
      openTickets: openTickets.length, critical: critical.length,
      callsToday, meetingsToday, renewals7,
    };
  }, [activities, tickets, calls, meetings, subs, t]);

  const tasks = useMemo<TaskRow[]>(() => {
    const rows: TaskRow[] = [];

    // Critical tickets
    tickets
      .filter((x) => !["resolved", "closed"].includes(x.status) && x.priority === "critical")
      .forEach((x) => {
        rows.push({
          key: `tc-${x.id}`,
          contactId: x.contact_id,
          contactName: x.contact_id ? (contactsMap[x.contact_id] || "—") : "بدون عميل",
          type: "ticket_critical",
          typeLabel: "تذكرة حرجة",
          typeColor: "#B91C1C", typeBg: "#FEE2E2",
          priority: TICKET_PRIORITY_META[x.priority].label,
          priorityColor: TICKET_PRIORITY_META[x.priority].color,
          priorityBg: TICKET_PRIORITY_META[x.priority].bg,
          date: x.created_at,
          link: `/crm/ticket/${x.id}`,
        });
      });

    // New tickets
    tickets
      .filter((x) => x.status === "new" && x.priority !== "critical")
      .forEach((x) => {
        rows.push({
          key: `tn-${x.id}`,
          contactId: x.contact_id,
          contactName: x.contact_id ? (contactsMap[x.contact_id] || "—") : "بدون عميل",
          type: "ticket_new",
          typeLabel: "تذكرة جديدة",
          typeColor: "#0369A1", typeBg: "#E0F2FE",
          priority: TICKET_PRIORITY_META[x.priority].label,
          priorityColor: TICKET_PRIORITY_META[x.priority].color,
          priorityBg: TICKET_PRIORITY_META[x.priority].bg,
          date: x.created_at,
          link: `/crm/ticket/${x.id}`,
        });
      });

    // Renewals within 7 days
    subs
      .filter((s) => { const d = daysFromNow(s.renewal_date); return d >= -7 && d <= 7; })
      .forEach((s) => {
        const d = daysFromNow(s.renewal_date);
        rows.push({
          key: `rn-${s.id}`,
          contactId: s.contact_id,
          contactName: contactsMap[s.contact_id] || "—",
          type: "renewal",
          typeLabel: d < 0 ? "تجديد متأخر" : "تجديد قريب",
          typeColor: d < 0 ? "#B91C1C" : "#A16207",
          typeBg: d < 0 ? "#FEE2E2" : "#FEF3C7",
          date: s.renewal_date,
          link: `/crm/renewals`,
        });
      });

    // Meetings today
    meetings
      .filter((m) => m.meeting_date.startsWith(t) && m.status === "scheduled")
      .forEach((m) => {
        rows.push({
          key: `mt-${m.id}`,
          contactId: m.contact_id,
          contactName: contactsMap[m.contact_id] || "—",
          type: "meeting_today",
          typeLabel: "اجتماع اليوم",
          typeColor: "#C2410C", typeBg: "#FFEDD5",
          date: m.meeting_date,
          link: `/crm/customer/${m.contact_id}`,
        });
      });

    // No contact 30d
    noContact30d.forEach((c) => {
      rows.push({
        key: `nc-${c.id}`,
        contactId: c.id,
        contactName: c.name,
        type: "no_contact_30d",
        typeLabel: "بدون تواصل +30 يوم",
        typeColor: "#7C3AED", typeBg: "#EDE9FE",
        date: c.lastDate || "1970-01-01",
        link: `/crm/customer/${c.id}`,
      });
    });

    // Sort: critical first, then by date desc for tickets/meetings, asc for renewals
    const order: Record<TaskRow["type"], number> = {
      ticket_critical: 0, meeting_today: 1, renewal: 2, ticket_new: 3, no_contact_30d: 4,
    };
    return rows.sort((a, b) => {
      if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type];
      return b.date.localeCompare(a.date);
    });
  }, [tickets, subs, meetings, noContact30d, contactsMap, t]);

  const onSaved = () => {
    refetchTickets(); refetchCalls(); refetchMeetings(); refetchActs();
    setQuick(null);
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">مركز العمل اليومي</h2>
          <p className="text-[11px] text-slate-500">كل ما يحتاج إلى إجراء اليوم في مكان واحد</p>
        </div>
        <div className="text-[11px] text-slate-400">
          {new Intl.DateTimeFormat("ar", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <Kpi label="متابعات اليوم"   value={kpis.dueToday}      icon={<Clock className="h-3.5 w-3.5" />}        tone="default" onClick={() => navigate("/crm/activities")} />
        <Kpi label="متابعات متأخرة" value={kpis.overdue}        icon={<AlertTriangle className="h-3.5 w-3.5" />} tone={kpis.overdue > 0 ? "danger" : "good"} onClick={() => navigate("/crm/activities")} />
        <Kpi label="تذاكر مفتوحة"   value={kpis.openTickets}    icon={<LifeBuoy className="h-3.5 w-3.5" />}     tone="default" onClick={() => navigate("/crm/tickets")} />
        <Kpi label="تذاكر حرجة"     value={kpis.critical}       icon={<AlertTriangle className="h-3.5 w-3.5" />} tone={kpis.critical > 0 ? "danger" : "good"} onClick={() => navigate("/crm/tickets")} />
        <Kpi label="مكالمات اليوم"  value={kpis.callsToday}     icon={<Phone className="h-3.5 w-3.5" />}        tone="default" onClick={() => navigate("/crm/calls")} />
        <Kpi label="اجتماعات اليوم" value={kpis.meetingsToday}  icon={<Calendar className="h-3.5 w-3.5" />}     tone="default" onClick={() => navigate("/crm/meetings")} />
        <Kpi label="تجديدات 7 أيام" value={kpis.renewals7}      icon={<Repeat className="h-3.5 w-3.5" />}       tone={kpis.renewals7 > 0 ? "warn" : "default"} onClick={() => navigate("/crm/renewals")} />
      </div>

      {/* Quick Add */}
      <div className="bg-gradient-to-l from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-4">
        <h3 className="text-[13px] font-bold text-slate-900 mb-3">تسجيل سريع</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <QuickBigBtn icon={<Phone className="h-5 w-5" />}      label="تسجيل مكالمة"   onClick={() => setQuick("call")} />
          <QuickBigBtn icon={<StickyNote className="h-5 w-5" />} label="إضافة ملاحظة"  onClick={() => setQuick("note")} />
          <QuickBigBtn icon={<Ticket className="h-5 w-5" />}     label="فتح تذكرة"     onClick={() => setQuick("ticket")} />
          <QuickBigBtn icon={<Calendar className="h-5 w-5" />}   label="إضافة اجتماع"  onClick={() => setQuick("meeting")} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tasks needing action */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> مهام تحتاج إجراء الآن
              <span className="text-[10px] text-slate-400">({tasks.length})</span>
            </h3>
          </div>

          {tasks.length === 0 ? (
            <p className="text-center text-[12px] text-slate-400 py-10">
              لا توجد مهام عاجلة الآن — يوم هادئ 🎉
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[560px] overflow-y-auto pl-1">
              {tasks.map((row) => (
                <div key={row.key} className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50/60 transition">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold shrink-0"
                    style={{ background: row.typeBg, color: row.typeColor }}>
                    {row.typeLabel}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-slate-900 truncate">{row.contactName}</div>
                    <div className="text-[10.5px] text-slate-500">
                      {row.type === "renewal" ? `تجديد: ${fmtDateDisplay(row.date)}` :
                       row.type === "no_contact_30d" ? `آخر تواصل: ${row.date === "1970-01-01" ? "لا يوجد" : fmtDateDisplay(row.date)}` :
                       fmtDateDisplay(row.date)}
                    </div>
                  </div>
                  {row.priority && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 hidden sm:inline"
                      style={{ background: row.priorityBg, color: row.priorityColor }}>
                      {row.priority}
                    </span>
                  )}
                  {row.contactId && (
                    <Link to={`/crm/customer/${row.contactId}`}
                      className="px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-700 text-[10.5px] font-semibold hover:bg-slate-100 flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> 360
                    </Link>
                  )}
                  <Link to={row.link}
                    className="px-2 py-1 rounded-md bg-blue-600 text-white text-[10.5px] font-semibold hover:bg-blue-700">
                    تنفيذ
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity feed */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-[13px] font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600" /> آخر نشاطات العملاء
          </h3>
          {recentEvents.length === 0 ? (
            <p className="text-[12px] text-slate-400 text-center py-6">لا يوجد نشاط بعد</p>
          ) : (
            <ol className="space-y-2 max-h-[560px] overflow-y-auto pl-1">
              {recentEvents.map((e) => (
                <li key={`${e.event_type}-${e.ref_id}`} className="border-b border-slate-50 pb-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10.5px] font-bold text-slate-600">
                      {feedTypeLabel(e.event_type)}
                    </span>
                    <span className="text-[10px] text-slate-400">{fmtDateDisplay(e.event_date)}</span>
                  </div>
                  {e.contact_id && (
                    <Link to={`/crm/customer/${e.contact_id}`}
                      className="text-[11.5px] font-semibold text-slate-900 hover:text-blue-700 block truncate">
                      {contactsMap[e.contact_id] || "—"}
                    </Link>
                  )}
                  <div className="text-[11px] text-slate-600 line-clamp-2">{e.title}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {noContact30d.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-[13px] font-bold text-slate-900 mb-3 flex items-center gap-2">
            <UserX className="h-4 w-4 text-purple-600" />
            عملاء لم يتم التواصل معهم منذ 30 يوم
            <span className="text-[10px] text-slate-400">({noContact30d.length})</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {noContact30d.map((c) => (
              <Link key={c.id} to={`/crm/customer/${c.id}`}
                className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-purple-200 hover:bg-purple-50/40 transition">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-slate-900 truncate">{c.name}</div>
                  <div className="text-[10.5px] text-slate-500">
                    {c.lastDate ? `آخر تواصل: ${fmtDateDisplay(c.lastDate)}` : "لا يوجد تواصل سابق"}
                  </div>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {quick && (
        <CsQuickAddDialog
          kind={quick}
          userId={user?.id ?? null}
          onClose={() => setQuick(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function feedTypeLabel(t: string) {
  switch (t) {
    case "note": return "ملاحظة";
    case "call": return "مكالمة";
    case "meeting": return "اجتماع";
    case "ticket": return "تذكرة";
    case "feature_request": return "طلب ميزة";
    case "contract": return "عقد";
    case "subscription": return "اشتراك";
    default: return t;
  }
}

function Kpi({
  label, value, icon, tone, onClick,
}: {
  label: string; value: number; icon: React.ReactNode;
  tone: "default" | "good" | "warn" | "danger";
  onClick?: () => void;
}) {
  const cls =
    tone === "danger" ? "text-red-700 border-red-100 bg-red-50/40" :
    tone === "warn" ? "text-amber-700 border-amber-100 bg-amber-50/40" :
    tone === "good" ? "text-emerald-700 border-emerald-100 bg-emerald-50/40" :
    "text-slate-900 border-slate-200 bg-white";
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`rounded-xl border p-3 text-right ${cls} ${onClick ? "hover:shadow-sm transition cursor-pointer" : "cursor-default"}`}>
      <div className="text-[10.5px] text-slate-500 flex items-center gap-1 mb-1">{icon}{label}</div>
      <div className="text-[18px] font-bold">{value}</div>
    </button>
  );
}

function QuickBigBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition active:scale-95">
      <span className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">{icon}</span>
      <span className="text-[12px] font-semibold">{label}</span>
      <Plus className="h-3 w-3 text-blue-400 -mt-1" />
    </button>
  );
}