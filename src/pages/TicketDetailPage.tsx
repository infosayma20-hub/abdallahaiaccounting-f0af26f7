import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, MessageCircle, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const WHATSAPP_NUMBER = "970000000000";

const statusColors: Record<string, string> = {
  "جديدة": "bg-blue-500/10 text-blue-600",
  "قيد المراجعة": "bg-amber-500/10 text-amber-600",
  "قيد التنفيذ": "bg-violet-500/10 text-violet-600",
  "بانتظار العميل": "bg-orange-500/10 text-orange-600",
  "منجزة": "bg-emerald-500/10 text-emerald-600",
  "مغلقة": "bg-muted text-muted-foreground",
};

const TicketDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    const load = async () => {
      const [{ data: t }, { data: c }] = await Promise.all([
        supabase.from("support_tickets").select("*").eq("id", id).single(),
        supabase.from("ticket_comments").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      ]);
      setTicket(t);
      setComments(c || []);
    };
    load();
  }, [id, user]);

  const handleSend = async () => {
    if (!newComment.trim() || !user || !id) return;
    setSending(true);
    try {
      const { error } = await supabase.from("ticket_comments").insert({
        ticket_id: id,
        user_id: user.id,
        content: newComment.trim(),
        is_internal: false,
      });
      if (error) throw error;
      setComments((prev) => [...prev, { content: newComment.trim(), user_id: user.id, created_at: new Date().toISOString(), is_internal: false }]);
      setNewComment("");
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (!ticket) return <div className="p-6 text-center text-muted-foreground text-sm" dir="rtl">جاري التحميل...</div>;

  const whatsappText = `مرحباً، أتابع التذكرة رقم ${ticket.id?.slice(0, 8)}
العنوان: ${ticket.title}
الحالة: ${ticket.status}`;
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappText)}`;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto" dir="rtl">
      <div className="flex items-center gap-2">
        <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/support/tickets")} className="p-1.5 rounded-lg hover:bg-muted">
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">{ticket.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={`text-[10px] ${statusColors[ticket.status] || ""}`}>{ticket.status}</Badge>
            {ticket.priority === "عاجل" && <Badge variant="destructive" className="text-[10px]">عاجل</Badge>}
            <span className="text-[10px] text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString("en-GB")}</span>
          </div>
        </div>
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="gap-1.5">
            <MessageCircle className="h-4 w-4 text-emerald-500" /> واتساب
          </Button>
        </a>
      </div>

      {/* Ticket Info */}
      <Card>
        <CardContent className="p-5 space-y-3">
          {ticket.description && <p className="text-sm text-foreground">{ticket.description}</p>}
          {ticket.sector && <p className="text-xs text-muted-foreground">القطاع: <strong>{ticket.sector}</strong></p>}
          {ticket.requested_changes && Array.isArray(ticket.requested_changes) && ticket.requested_changes.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">التعديلات المطلوبة:</p>
              <div className="flex flex-wrap gap-1.5">
                {(ticket.requested_changes as string[]).map((c: string) => (
                  <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comments */}
      <div className="space-y-3">
        <p className="text-sm font-bold text-foreground">التعليقات ({comments.length})</p>
        {comments.map((c, i) => (
          <div key={i} className={`p-4 rounded-xl ${c.user_id === user?.id ? "bg-primary/5 border border-primary/10" : "bg-muted/50"}`}>
            <p className="text-sm text-foreground">{c.content}</p>
            <p className="text-[10px] text-muted-foreground mt-2">{new Date(c.created_at).toLocaleString("en-US")}</p>
          </div>
        ))}
      </div>

      {/* Add comment */}
      <div className="flex gap-2">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="أضف تعليق..."
          rows={2}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={sending || !newComment.trim()} size="icon" className="shrink-0 self-end">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default TicketDetailPage;
