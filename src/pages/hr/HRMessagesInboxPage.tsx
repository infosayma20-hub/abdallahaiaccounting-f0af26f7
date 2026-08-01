import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Inbox, Search, RefreshCw, Shield, MessageSquare, ExternalLink, Send, Plus, Ban, RotateCcw, Eye, ThumbsUp, ThumbsDown, Archive, ArchiveRestore } from "lucide-react";
import { Link } from "react-router-dom";
import { decodeHRMessage, typeLabel, typeColor, STATUS_LABELS, penaltyLabel } from "@/lib/hrMessages";
import { format } from "date-fns";
import SendHRMessageDialog, { SendTarget } from "@/components/hr/SendHRMessageDialog";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  review_notes?: string | null;
  hr_recommendation?: string | null;
  hr_recommendation_notes?: string | null;
  hr_reviewed_at?: string | null;
  archived_at?: string | null;
  final_decision?: string | null;
  final_decision_notes?: string | null;
  final_decided_at?: string | null;
  employees?: { full_name: string | null } | null;
};

export default function HRMessagesInboxPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
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
  const [viewTarget, setViewTarget] = useState<Row | null>(null);
  const [decision, setDecision] = useState<{ row: Row; mode: "approve" | "reject" } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  const fetchRows = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("correction_requests")
      .select("id, employee_id, attendance_date, request_type, reason, status, created_at, review_notes, hr_recommendation, hr_recommendation_notes, hr_reviewed_at, archived_at, final_decision, final_decision_notes, final_decided_at, employees:employee_id(full_name)")
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
      if (fromDate || toDate) {
        const d = (r as any).created_at ? String((r as any).created_at).slice(0, 10) : "";
        if (!d) return false;
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
      }
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const name = r.employees?.full_name?.toLowerCase() || "";
        const meta = decodeHRMessage(r.reason);
        const subject = (meta?.subject || "").toLowerCase();
        if (!name.includes(q) && !subject.includes(q) && !(r.reason || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, typeFilter, statusFilter, fromDate, toDate]);

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
      .update({ status: "pending", reviewed_at: null, reviewed_by: null, archived_at: null } as any)
      .eq("id", r.id);
    if (error) { toast.error("تعذرت الاستعادة"); return; }
    toast.success("تمت الاستعادة");
    fetchRows();
  };

  const submitDecision = async () => {
    if (!decision) return;
    if (!decisionNote.trim()) { toast.error("الملاحظة إلزامية لتوضيح رأي الموارد البشرية"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("correction_requests")
      .update({
        hr_recommendation: decision.mode,
        hr_recommendation_notes: decisionNote.trim(),
        hr_reviewed_at: new Date().toISOString(),
        hr_reviewed_by: user?.id ?? null,
      } as any)
      .eq("id", decision.row.id);
    setSaving(false);
    if (error) { toast.error("تعذر حفظ الرأي"); return; }
    toast.success(decision.mode === "approve" ? "تم تسجيل التوصية بالقبول — بانتظار قرار الإدارة" : "تم تسجيل التوصية بالرفض — بانتظار قرار الإدارة");
    setDecision(null); setDecisionNote("");
    fetchRows();
  };

  const toggleArchive = async (r: Row) => {
    const isArchived = !!r.archived_at || r.status === "archived";
    const { error } = await supabase
      .from("correction_requests")
      .update(isArchived
        ? ({ status: "pending", archived_at: null } as any)
        : ({ status: "archived", archived_at: new Date().toISOString() } as any))
      .eq("id", r.id);
    if (error) { toast.error("تعذر تنفيذ الأرشفة"); return; }
    toast.success(isArchived ? "تمت إعادة الإجراء من الأرشيف" : "تمت الأرشفة");
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
        <CardContent className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
              <SelectItem value="archived">مؤرشف</SelectItem>
            </SelectContent>
          </Select>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">من تاريخ</label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">إلى تاريخ</label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
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
                  <TableHead className="text-right">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const meta = decodeHRMessage(r.reason);
                  const isPenalty = r.request_type === "penalty";
                  const isCancelled = r.status === "cancelled";
                  const isArchived = !!r.archived_at || r.status === "archived";
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
                        {r.hr_recommendation && (
                          <Badge
                            variant="outline"
                            className={`ms-1 no-underline ${r.hr_recommendation === "approve" ? "border-emerald-300 text-emerald-700" : "border-red-300 text-red-700"}`}
                          >
                            رأي HR: {r.hr_recommendation === "approve" ? "قبول" : "رفض"}
                          </Badge>
                        )}
                        {isPenalty && (
                          <Badge
                            variant="outline"
                            className={`ms-1 no-underline ${r.final_decision === "approved" ? "border-emerald-400 text-emerald-700 bg-emerald-50"
                              : r.final_decision === "rejected" ? "border-red-400 text-red-700 bg-red-50"
                              : "border-amber-300 text-amber-700 bg-amber-50"}`}
                          >
                            {r.final_decision === "approved" ? "معتمد من الإدارة · ظاهر للموظف"
                              : r.final_decision === "rejected" ? "غير معتمد من الإدارة"
                              : "بانتظار قرار الإدارة"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="no-underline [&_*]:no-underline">
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="عرض"
                            onClick={() => setViewTarget(r)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canCancel && !isCancelled && !r.final_decision && (
                            <>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600 hover:bg-emerald-50"
                                title="قبول (توصية HR)" onClick={() => { setDecision({ row: r, mode: "approve" }); setDecisionNote(r.hr_recommendation_notes || ""); }}>
                                <ThumbsUp className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:bg-red-50"
                                title="رفض (توصية HR)" onClick={() => { setDecision({ row: r, mode: "reject" }); setDecisionNote(r.hr_recommendation_notes || ""); }}>
                                <ThumbsDown className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {canCancel && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
                              title={isArchived ? "إلغاء الأرشفة" : "أرشفة"} onClick={() => toggleArchive(r)}>
                              {isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                            </Button>
                          )}
                          <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="فتح ملف الموظف">
                            <Link to={`/hr/employee/${r.employee_id}?tab=messages`}>
                              <ExternalLink className="h-4 w-4" />
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

      <Dialog open={!!viewTarget} onOpenChange={(o) => { if (!o) setViewTarget(null); }}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-right">
              {viewTarget ? (decodeHRMessage(viewTarget.reason)?.subject || "تفاصيل الإجراء") : ""}
            </DialogTitle>
          </DialogHeader>
          {viewTarget && (() => {
            const m = decodeHRMessage(viewTarget.reason);
            return (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>الموظف: {viewTarget.employees?.full_name || "—"}</span>
                  <span>التاريخ: {format(new Date(viewTarget.created_at), "yyyy-MM-dd HH:mm")}</span>
                  <span>الحالة: {STATUS_LABELS[viewTarget.status] || viewTarget.status}</span>
                </div>
                <div className="whitespace-pre-wrap leading-7 rounded-md border p-3 bg-muted/20">
                  {m?.body || viewTarget.reason}
                </div>
                {m?.penalty_kind && (
                  <div className="text-xs text-muted-foreground">نوع الإجراء: {penaltyLabel(m.penalty_kind)}</div>
                )}
                {viewTarget.hr_recommendation && (
                  <div className="rounded-md border p-3">
                    <div className="text-xs font-medium mb-1">
                      توصية الموارد البشرية: {viewTarget.hr_recommendation === "approve" ? "قبول" : "رفض"}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-pre-wrap">{viewTarget.hr_recommendation_notes}</div>
                  </div>
                )}
                {viewTarget.request_type === "penalty" && (
                  <div className="rounded-md border p-3">
                    <div className="text-xs font-medium mb-1">
                      قرار الإدارة: {viewTarget.final_decision === "approved" ? "معتمد (ظاهر للموظف)"
                        : viewTarget.final_decision === "rejected" ? "غير معتمد"
                        : "بانتظار قرار الإدارة — الإجراء غير ظاهر للموظف"}
                    </div>
                    {viewTarget.final_decision_notes && (
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap">{viewTarget.final_decision_notes}</div>
                    )}
                  </div>
                )}
                {viewTarget.review_notes && (
                  <div className="text-xs text-red-600 whitespace-pre-wrap">ملاحظة الإلغاء: {viewTarget.review_notes}</div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!decision} onOpenChange={(o) => { if (!o) { setDecision(null); setDecisionNote(""); } }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {decision?.mode === "approve" ? "توصية بقبول الإجراء" : "توصية برفض الإجراء"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              يتم حفظ رأي الموارد البشرية مع الملاحظة ليستكمل كمال القرار النهائي.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">الملاحظة (إلزامية) *</Label>
            <Textarea rows={3} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="اكتب رأي الموارد البشرية..." />
          </div>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); submitDecision(); }}>
              حفظ الرأي
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