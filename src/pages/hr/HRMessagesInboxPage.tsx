import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Inbox, Search, RefreshCw, Shield, MessageSquare, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { decodeHRMessage, typeLabel, typeColor, STATUS_LABELS, penaltyLabel } from "@/lib/hrMessages";
import { format } from "date-fns";

type Row = {
  id: string;
  employee_id: string;
  attendance_date: string;
  request_type: string;
  reason: string;
  status: string;
  created_at: string;
  employees?: { full_name: string | null } | null;
};

export default function HRMessagesInboxPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchRows = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("correction_requests")
      .select("id, employee_id, attendance_date, request_type, reason, status, created_at, employees:employee_id(full_name)")
      .in("request_type", ["hr_message", "penalty"])
      .order("created_at", { ascending: false })
      .limit(500);
    setRows((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, []);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (typeFilter !== "all" && r.request_type !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const name = r.employees?.full_name?.toLowerCase() || "";
        const meta = decodeHRMessage(r.reason);
        const subject = (meta?.subject || "").toLowerCase();
        if (!name.includes(q) && !subject.includes(q) && !(r.reason || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, typeFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: rows.length,
    pending: rows.filter(r => r.status === "pending").length,
    responded: rows.filter(r => r.status === "responded").length,
    penalties: rows.filter(r => r.request_type === "penalty").length,
  }), [rows]);

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">صندوق الرسائل والإجراءات</h1>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRows}>
          <RefreshCw className="h-4 w-4 me-2" /> تحديث
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="الإجمالي" value={stats.total} />
        <StatCard label="بانتظار قراءة" value={stats.pending} tone="warning" />
        <StatCard label="تم الرد" value={stats.responded} tone="success" />
        <StatCard label="إجراءات عقابية" value={stats.penalties} tone="danger" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">الفلاتر</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="بحث بموظف، موضوع، نص..." className="pr-9" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              <SelectItem value="hr_message">رسائل HR</SelectItem>
              <SelectItem value="penalty">إجراءات عقابية</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="pending">بانتظار قراءة</SelectItem>
              <SelectItem value="read">مقروء</SelectItem>
              <SelectItem value="responded">تم الرد</SelectItem>
              <SelectItem value="closed">مغلق</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Inbox className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد إجراءات أو رسائل مطابقة للفلتر</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">الموظف</TableHead>
                  <TableHead className="text-right">النوع</TableHead>
                  <TableHead className="text-right">الموضوع</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right"> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const meta = decodeHRMessage(r.reason);
                  const isPenalty = r.request_type === "penalty";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}
                      </TableCell>
                      <TableCell className="font-medium">{r.employees?.full_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={isPenalty ? "border-red-300 text-red-700" : ""}>
                          {isPenalty ? <Shield className="h-3 w-3 me-1" /> : <MessageSquare className="h-3 w-3 me-1" />}
                          {meta ? typeLabel(meta.type) : (isPenalty ? "إجراء" : "رسالة")}
                          {meta?.penalty_kind && ` · ${penaltyLabel(meta.penalty_kind)}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate">
                        {meta?.subject || (r.reason || "").slice(0, 80)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === "pending" ? "secondary" : r.status === "responded" ? "default" : "outline"}>
                          {STATUS_LABELS[r.status] || r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/hr/employee/${r.employee_id}?tab=messages`}>
                            <ExternalLink className="h-4 w-4 me-1" /> فتح
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "warning" | "success" | "danger" }) {
  const toneClass =
    tone === "warning" ? "text-amber-600" :
    tone === "success" ? "text-emerald-600" :
    tone === "danger" ? "text-red-600" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}