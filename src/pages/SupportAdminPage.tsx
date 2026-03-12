import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRight, Search, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const allStatuses = ["جديدة", "قيد المراجعة", "قيد التنفيذ", "بانتظار العميل", "منجزة", "مغلقة"];

const statusColors: Record<string, string> = {
  "جديدة": "bg-blue-500/10 text-blue-600",
  "قيد المراجعة": "bg-amber-500/10 text-amber-600",
  "قيد التنفيذ": "bg-violet-500/10 text-violet-600",
  "بانتظار العميل": "bg-orange-500/10 text-orange-600",
  "منجزة": "bg-emerald-500/10 text-emerald-600",
  "مغلقة": "bg-muted text-muted-foreground",
};

const SupportAdminPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editTicket, setEditTicket] = useState<any>(null);
  const [newStatus, setNewStatus] = useState("");
  const [assignee, setAssignee] = useState("");
  const [internalNote, setInternalNote] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });
      setTickets(data || []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const handleUpdate = async () => {
    if (!editTicket || !user) return;
    try {
      const updates: any = {};
      if (newStatus) updates.status = newStatus;
      if (assignee) updates.assigned_to = assignee;

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from("support_tickets").update(updates).eq("id", editTicket.id);
        if (error) throw error;
      }

      if (internalNote.trim()) {
        const { error } = await supabase.from("ticket_comments").insert({
          ticket_id: editTicket.id,
          user_id: user.id,
          content: internalNote.trim(),
          is_internal: true,
        });
        if (error) throw error;
      }

      setTickets((prev) => prev.map((t) => t.id === editTicket.id ? { ...t, ...updates } : t));
      toast({ title: "✅ تم التحديث" });
      setEditTicket(null);
      setNewStatus("");
      setAssignee("");
      setInternalNote("");
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  const filtered = tickets.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (search && !t.title.includes(search)) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate("/customization")} className="p-1.5 rounded-lg hover:bg-muted">
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </button>
        <Shield className="h-5 w-5 text-rose-500" />
        <div>
          <h1 className="text-xl font-bold text-foreground">لوحة إدارة الدعم</h1>
          <p className="text-xs text-muted-foreground">{tickets.length} تذكرة إجمالية</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="pr-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {allStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">جاري التحميل...</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <Card key={t.id} className="border-border/60">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-bold text-foreground truncate">{t.title}</p>
                    <Badge className={`text-[10px] ${statusColors[t.status] || ""}`}>{t.status}</Badge>
                    {t.priority === "عاجل" && <Badge variant="destructive" className="text-[10px]">عاجل</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.sector && `القطاع: ${t.sector} · `}
                    {t.assigned_to && `مسند لـ: ${t.assigned_to} · `}
                    {new Date(t.created_at).toLocaleDateString("en-GB")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/support/tickets/${t.id}`)}>عرض</Button>
                  <Button size="sm" onClick={() => { setEditTicket(t); setNewStatus(t.status); setAssignee(t.assigned_to || ""); }}>تعديل</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editTicket} onOpenChange={() => setEditTicket(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل التذكرة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground">الحالة</label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground">مسند لـ</label>
              <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="اسم الموظف..." />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground">ملاحظة داخلية (لا تظهر للعميل)</label>
              <Textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={3} placeholder="ملاحظة..." />
            </div>
            <Button onClick={handleUpdate} className="w-full">حفظ التعديلات</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupportAdminPage;
