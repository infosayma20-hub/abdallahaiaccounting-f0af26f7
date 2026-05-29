import { FileText, Phone, Users as UsersIcon, Ticket, Lightbulb, FileSignature, Repeat, StickyNote } from "lucide-react";
import { fmtDateDisplay } from "@/lib/utils";
import { useCustomerTimeline } from "../hooks/useCsData";

const ICONS: Record<string, { icon: React.ReactNode; tone: string; bg: string }> = {
  note:            { icon: <StickyNote className="h-3.5 w-3.5" />,    tone: "#475569", bg: "#F1F5F9" },
  call:            { icon: <Phone className="h-3.5 w-3.5" />,         tone: "#0369A1", bg: "#E0F2FE" },
  meeting:         { icon: <UsersIcon className="h-3.5 w-3.5" />,     tone: "#7C3AED", bg: "#EDE9FE" },
  ticket:          { icon: <Ticket className="h-3.5 w-3.5" />,        tone: "#C2410C", bg: "#FFEDD5" },
  feature_request: { icon: <Lightbulb className="h-3.5 w-3.5" />,     tone: "#A16207", bg: "#FEF3C7" },
  contract:        { icon: <FileSignature className="h-3.5 w-3.5" />, tone: "#15803D", bg: "#DCFCE7" },
  subscription:    { icon: <Repeat className="h-3.5 w-3.5" />,        tone: "#0369A1", bg: "#E0F2FE" },
};

export default function CustomerUnifiedTimeline({ contactId, limit = 100 }: { contactId: string; limit?: number }) {
  const { events, loading } = useCustomerTimeline(contactId);

  if (loading) return <p className="text-[12px] text-slate-400 text-center py-6">جارٍ التحميل...</p>;
  if (events.length === 0) {
    return <p className="text-[12px] text-slate-400 text-center py-6">لا يوجد نشاط بعد</p>;
  }

  return (
    <ol className="relative border-r-2 border-slate-100 pr-4 space-y-3">
      {events.slice(0, limit).map((e) => {
        const meta = ICONS[e.event_type] ?? { icon: <FileText className="h-3.5 w-3.5" />, tone: "#475569", bg: "#F1F5F9" };
        return (
          <li key={`${e.event_type}-${e.ref_id}`} className="relative">
            <span
              className="absolute right-[-25px] top-1 h-6 w-6 rounded-full border-2 border-white flex items-center justify-center"
              style={{ background: meta.bg, color: meta.tone }}
            >
              {meta.icon}
            </span>
            <div className="bg-white border border-slate-100 rounded-lg p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12px] font-semibold text-slate-900 flex-1 truncate">{e.title}</div>
                <div className="text-[10px] text-slate-400 shrink-0">{fmtDateDisplay(e.event_date)}</div>
              </div>
              {e.summary && <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{e.summary}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}