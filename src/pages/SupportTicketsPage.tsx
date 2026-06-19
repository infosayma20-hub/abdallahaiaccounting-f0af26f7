import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Plus, Search, Ticket, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { multiWordMatchAny } from "@/lib/utils";

const statusColors: Record<string, string> = {
  "جديدة": "bg-blue-500/10 text-blue-600",
  "قيد المراجعة": "bg-amber-500/10 text-amber-600",
  "قيد التنفيذ": "bg-violet-500/10 text-violet-600",
  "بانتظار العميل": "bg-orange-500/10 text-orange-600",
  "منجزة": "bg-emerald-500/10 text-emerald-600",
  "مغلقة": "bg-muted text-muted-foreground",
};

const SupportTicketsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (!user) return;
    const fetchTickets = async () => {
      const { data } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("user_id", dataOwnerId!)
        .order("created_at", { ascending: false });
      setTickets(data || []);
      setLoading(false);
    };
    fetchTickets();
  }, [user]);

  const filtered = tickets.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (search && !multiWordMatchAny(search, t.title, t.description)) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/customization")} className="p-1.5 rounded-lg hover:bg-muted">
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">تذاكر الدعم</h1>
            <p className="text-xs text-muted-foreground">{tickets.length} تذكرة</p>
          </div>
        </div>
        <Button size="sm" onClick={() => navigate("/customization/request")}>
          <Plus className="h-4 w-4 ml-1" /> طلب جديد
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="pr-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="جديدة">جديدة</SelectItem>
            <SelectItem value="قيد المراجعة">قيد المراجعة</SelectItem>
            <SelectItem value="قيد التنفيذ">قيد التنفيذ</SelectItem>
            <SelectItem value="بانتظار العميل">بانتظار العميل</SelectItem>
            <SelectItem value="منجزة">منجزة</SelectItem>
            <SelectItem value="مغلقة">مغلقة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tickets List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Ticket className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">لا توجد تذاكر بعد</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/customization/request")}>أنشئ طلبك الأول</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <Card
              key={t.id}
              className="cursor-pointer hover:shadow-md transition-all border-border/60"
              onClick={() => navigate(`/support/tickets/${t.id}`)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-bold text-foreground truncate">{t.title}</p>
                    <Badge className={`text-[10px] ${statusColors[t.status] || ""}`}>{t.status}</Badge>
                    {t.priority === "عاجل" && <Badge variant="destructive" className="text-[10px]">عاجل</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{t.description || "بدون وصف"}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(t.created_at).toLocaleDateString("en-GB")}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground rotate-180 shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SupportTicketsPage;
