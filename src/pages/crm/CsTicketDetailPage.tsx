import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, MessageSquare, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { fmtDateDisplay } from "@/lib/utils";
import { useCsTicketComments } from "./hooks/useCsData";
import {
  TICKET_STATUS_META, TICKET_PRIORITY_META, TICKET_CATEGORY_META,
  type CsSupportTicket, type CsTicketStatus,
} from "./types-cs";

const sb = supabase as any;

export default function CsTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<CsSupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const { items: comments, refetch: refetchComments } = useCsTicketComments(id);
  const [newComment, setNewComment] = useState("");
  const [resolution, setResolution] = useState("");

  const load = async () => {
    if (!id || !user) return;
    setLoading(true);
    const { data } = await sb.from("cs_support_tickets").select("*").eq("id", id).maybeSingle();
    setTicket(data as CsSupportTicket | null);
    setResolution((data as any)?.resolution ?? "");
    setLoading(false);
  };
  useEffect(() => { load(); }, [id, user]);

  const updateStatus = async (status: CsTicketStatus) => {
    if (!ticket) return;
    const patch: any = { status };
    if (status === "resolved") patch.resolved_at = new Date().toISOString();
    if (status === "closed") patch.closed_at = new Date().toISOString();
    if (resolution) patch.resolution = resolution;
    const { error } = await sb.from("cs_support_tickets").update(patch).eq("id", ticket.id);
    if (error) return toast.error(error.message);
    toast.success("تم تحديث الحالة");
    load();
  };

  const addComment = async () => {
    if (!user || !ticket || !newComment.trim()) return;
    const { error } = await sb.from("cs_ticket_comments").insert({
      ticket_id: ticket.id, user_id: user.id, body: newComment, is_internal: true, created_by: user.id,
    });
    if (error) return toast.error(error.message);
    setNewComment("");
    refetchComments();
  };

  if (loading) return <p className="p-8 text-center text-slate-400 text-sm" dir="rtl">جارٍ التحميل...</p>;
  if (!ticket) return <p className="p-8 text-center text-slate-400 text-sm" dir="rtl">التذكرة غير موجودة</p>;

  return (
    <div className="space-y-4 pb-8" dir="rtl">
      <button onClick={() => navigate("/crm/tickets")} className="text-[12px] text-slate-500 hover:text-slate-800 flex items-center gap-1">
        <ArrowRight className="h-3.5 w-3.5" /> العودة لقائمة التذاكر
      </button>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="font-mono text-[12px] text-slate-500 mb-1">{ticket.ticket_number}</div>
            <h1 className="text-lg font-bold text-slate-900">{ticket.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block px-2 py-1 rounded font-bold text-[11px]" style={{ background: TICKET_PRIORITY_META[ticket.priority].bg, color: TICKET_PRIORITY_META[ticket.priority].color }}>{TICKET_PRIORITY_META[ticket.priority].label}</span>
            <span className="inline-block px-2 py-1 rounded font-bold text-[11px]" style={{ background: TICKET_STATUS_META[ticket.status].bg, color: TICKET_STATUS_META[ticket.status].color }}>{TICKET_STATUS_META[ticket.status].label}</span>
          </div>
        </div>
        <div className="text-[12px] text-slate-600 mb-3">
          <span className="font-semibold">التصنيف:</span> {TICKET_CATEGORY_META[ticket.category]}
          <span className="mx-3">•</span>
          <span className="font-semibold">تاريخ الإنشاء:</span> {fmtDateDisplay(ticket.created_at)}
        </div>
        {ticket.description && (
          <div className="bg-slate-50 rounded-lg p-3 text-[13px] text-slate-700 whitespace-pre-wrap">{ticket.description}</div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">تغيير الحالة</h3>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TICKET_STATUS_META) as CsTicketStatus[]).map((s) => (
            <button key={s} onClick={() => updateStatus(s)} disabled={ticket.status === s}
              className={`text-[11px] px-3 py-1.5 rounded-md border transition ${ticket.status === s ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
              {TICKET_STATUS_META[s].label}
            </button>
          ))}
        </div>
        <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="ملاحظة الحل (تُحفظ عند تغيير الحالة إلى تم الحل / مغلقة)" rows={2} className="text-[12px]" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
          <MessageSquare className="h-4 w-4" /> التعليقات ({comments.length})
        </h3>
        <div className="space-y-2 mb-4">
          {comments.length === 0 ? (
            <p className="text-[12px] text-slate-400 text-center py-3">لا توجد تعليقات</p>
          ) : comments.map((c) => (
            <div key={c.id} className="bg-slate-50 rounded-lg p-3">
              <div className="text-[10px] text-slate-500 mb-1">{fmtDateDisplay(c.created_at)}</div>
              <div className="text-[12px] text-slate-800 whitespace-pre-wrap">{c.body}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="إضافة تعليق داخلي..." rows={2} className="text-[12px] flex-1" />
          <Button onClick={addComment} className="gap-1 self-end"><Save className="h-4 w-4" /> إضافة</Button>
        </div>
      </div>
    </div>
  );
}