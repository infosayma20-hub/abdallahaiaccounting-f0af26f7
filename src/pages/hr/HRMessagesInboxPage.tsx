import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Inbox, Search, RefreshCw, Shield, MessageSquare, ExternalLink, Send, Plus, Ban, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { decodeHRMessage, typeLabel, typeColor, STATUS_LABELS, penaltyLabel } from "@/lib/hrMessages";
import { format } from "date-fns";
import SendHRMessageDialog, { SendTarget } from "@/components/hr/SendHRMessageDialog";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<{ id: string; full_name: string } | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const canIssuePenalty = userRoles.includes("admin") || userRoles.includes("hr_manager");
  const canCancel = userRoles.includes("admin") || userRoles.includes("hr_manager");
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    supabase.from("employees").select("id, full_name").eq("is_active", true).order("full_name")
      .then(({ data }) => setEmployees((data || []) as any));
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      setUserRoles((data || []).map((x: any) => x.role));
    });
  }, [user]);

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

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) { toast.error("سبب الإلغاء إلزامي"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("correction_requests")
      .update({ status: "cancelled", review_notes: cancelReason.trim(), reviewed_at: new Date().toISOString(), reviewed_by: user?.id } as any)
      .eq("id", cancelTarget.id);
    setSaving(false);
    if (error) { toast.error("تعذر الإلغاء"); return; }
    toast.success("تم إلغاء الإجراء");
    setCancelTarget(null); setCancelReason("");
    fetchRows();
  };

  const restoreRow = async (r: Row) => {
    const { error } = await supabase
      .from("correction_requests")
      .update({ status: "pending", reviewed_at: null, reviewed_by: null } as any)
      .eq("id", r.id);
    if (error) { toast.error("تعذرت الاستعادة"); return; }
    toast.success("تمت الاستعادة");
    fetchRows();
  };

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">صندوق الرسائل والإجراءات</h1>
        </div>
        <div className="flex items-center gap-2">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> رسالة / إجراء جديد
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0" dir="rtl">
              <Command>
                <CommandInput placeholder="ابحث عن موظف..." />
                <CommandList>
                  <CommandEmpty>لا يوجد نتائج</CommandEmpty>
                  <CommandGroup>
                    {employees.map(e => (
                      <CommandItem
                        key={e.id}
                        value={e.full_name}
                        onSelect={() => {
                          setSelectedEmp(e);
                          setPickerOpen(false);
                          setSendOpen(true);
                        }}
                      >
                        {e.full_name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={fetchRows}>
            <RefreshCw className="h-4 w-4 me-2" /> تحديث
          </Button>
        </div>
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
              <SelectItem value="cancelled">ملغي / غير معتمد</SelectItem>
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
              <p className="mb-3">لا توجد إجراءات أو رسائل مطابقة للفلتر</p>
              <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                <Send className="h-4 w-4 me-2" /> ابدأ بإرسال رسالة أو إجراء
              </Button>
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
                  const isCancelled = r.status === "cancelled";
                  return (
                    <TableRow key={r.id} className={isCancelled ? "bg-muted/30 text-muted-foreground [&_td]:line-through" : ""}>
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
                        <Badge
                          variant={r.status === "pending" ? "secondary" : r.status === "responded" ? "default" : "outline"}
                          className={isCancelled ? "bg-red-50 text-red-700 border-red-200 no-underline" : "no-underline"}
                        >
                          {STATUS_LABELS[r.status] || r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="no-underline [&_*]:no-underline">
                        <div className="flex items-center gap-1">
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/hr/employee/${r.employee_id}?tab=messages`}>
                              <ExternalLink className="h-4 w-4 me-1" /> فتح
                            </Link>
                          </Button>
                          {canCancel && (
                            isCancelled ? (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600"
                                title="استعادة" onClick={() => restoreRow(r)}>
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:bg-red-50"
                                title="إلغاء / غير معتمد" onClick={() => { setCancelTarget(r); setCancelReason(""); }}>
                                <Ban className="h-4 w-4" />
                              </Button>
                            )
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {user && selectedEmp && (
        <SendHRMessageDialog
          open={sendOpen}
          onOpenChange={(o) => { setSendOpen(o); if (!o) fetchRows(); }}
          authUserId={user.id}
          targets={[{ employee_id: selectedEmp.id, employee_name: selectedEmp.full_name }]}
          canIssuePenalty={canIssuePenalty}
          onSent={() => fetchRows()}
        />
      )}

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) { setCancelTarget(null); setCancelReason(""); } }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء / عدم اعتماد الإجراء</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              سيتم وسم الإجراء كملغي مع حفظ السبب. يمكنك استعادته لاحقاً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-red-600">سبب الإلغاء (إلزامي) *</Label>
            <Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="اكتب سبب الإلغاء..." />
          </div>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); confirmCancel(); }}>
              تأكيد الإلغاء
            </AlertDialogAction>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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