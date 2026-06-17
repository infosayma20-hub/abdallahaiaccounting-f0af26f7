import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Calendar, Users, CheckCircle2, XCircle, Clock, Plus, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import * as XLSX from "xlsx";
import { multiWordMatchAny } from "@/lib/utils";

import { setNextExportBranding } from "@/lib/excel-export";
const LeavesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("balances");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  // Fetch employees
  const { data: employees, isLoading: loadingEmp } = useQuery({
    queryKey: ["leaves-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, department, annual_leave_days, sick_leave_days, start_date")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all leave records
  const { data: leaves, isLoading: loadingLeaves } = useQuery({
    queryKey: ["leaves-all-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_leaves")
        .select("*, employees(full_name, department)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Build balance data
  const balanceData = useMemo(() => {
    if (!employees?.length) return [];
    const leaveMap = new Map<string, { annual: number; sick: number; other: number; pending: number }>();
    (leaves || []).forEach((l: any) => {
      const curr = leaveMap.get(l.employee_id) || { annual: 0, sick: 0, other: 0, pending: 0 };
      if (l.status === "موافقة" || l.status === "معتمدة") {
        if (l.leave_type === "سنوية") curr.annual += Number(l.days_count);
        else if (l.leave_type === "مرضية") curr.sick += Number(l.days_count);
        else curr.other += Number(l.days_count);
      }
      if (l.status === "معلقة" || l.status === "pending") curr.pending++;
      leaveMap.set(l.employee_id, curr);
    });
    return employees.map((e: any) => {
      const used = leaveMap.get(e.id) || { annual: 0, sick: 0, other: 0, pending: 0 };
      return {
        ...e,
        annualUsed: used.annual,
        annualRemaining: e.annual_leave_days - used.annual,
        sickUsed: used.sick,
        sickRemaining: e.sick_leave_days - used.sick,
        otherUsed: used.other,
        pendingRequests: used.pending,
      };
    });
  }, [employees, leaves]);

  // Summary
  const summary = useMemo(() => {
    const pending = (leaves || []).filter((l: any) => l.status === "معلقة" || l.status === "pending").length;
    const approved = (leaves || []).filter((l: any) => l.status === "موافقة" || l.status === "معتمدة").length;
    const rejected = (leaves || []).filter((l: any) => l.status === "مرفوضة" || l.status === "rejected").length;
    return { pending, approved, rejected, total: (leaves || []).length };
  }, [leaves]);

  // Filter requests
  const filteredRequests = useMemo(() => {
    let result = leaves || [];
    if (search) {
      result = result.filter((l: any) =>
        l.employees?.full_name?.includes(search) || l.leave_type?.includes(search)
      );
    }
    if (statusFilter !== "all") {
      result = result.filter((l: any) => {
        if (statusFilter === "pending") return l.status === "معلقة" || l.status === "pending";
        if (statusFilter === "approved") return l.status === "موافقة" || l.status === "معتمدة";
        if (statusFilter === "rejected") return l.status === "مرفوضة" || l.status === "rejected";
        return true;
      });
    }
    return result;
  }, [leaves, search, statusFilter]);

  const filteredBalances = useMemo(() => {
    if (!search) return balanceData;
    return balanceData.filter(b => b.full_name?.includes(search) || b.department?.includes(search));
  }, [balanceData, search]);

  const handleApprove = async (leave: any) => {
    const { error } = await supabase.from("employee_leaves").update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("id", leave.id);
    if (error) { toast.error("خطأ في الاعتماد"); return; }
    toast.success("تم اعتماد الإجازة");
    queryClient.invalidateQueries({ queryKey: ["leaves-all-records"] });
  };

  const handleReject = async () => {
    if (!selectedLeave) return;
    const { error } = await supabase.from("employee_leaves").update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      review_notes: reviewNotes,
    }).eq("id", selectedLeave.id);
    if (error) { toast.error("خطأ في الرفض"); return; }
    toast.success("تم رفض الطلب");
    setReviewOpen(false);
    setSelectedLeave(null);
    setReviewNotes("");
    queryClient.invalidateQueries({ queryKey: ["leaves-all-records"] });
  };

  const getStatusBadge = (status: string) => {
    if (status === "موافقة" || status === "معتمدة") return <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">معتمدة</Badge>;
    if (status === "مرفوضة" || status === "rejected") return <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">مرفوضة</Badge>;
    return <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">معلقة</Badge>;
  };

  const exportExcel = () => {
    if (!balanceData.length) return;
    const rows = balanceData.map(r => ({
      "الموظف": r.full_name,
      "القسم": r.department || "-",
      "رصيد سنوي": r.annual_leave_days,
      "مستخدم سنوي": r.annualUsed,
      "متبقي سنوي": r.annualRemaining,
      "رصيد مرضي": r.sick_leave_days,
      "مستخدم مرضي": r.sickUsed,
      "متبقي مرضي": r.sickRemaining,
      "أخرى": r.otherUsed,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الإجازات");
    setNextExportBranding({ title: "الإجازات" });
    XLSX.writeFile(wb, "رصيد_الإجازات.xlsx");
  };

  const isLoading = loadingEmp || loadingLeaves;

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-xl font-bold text-foreground">إدارة الإجازات</h1>
        </div>
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={!balanceData.length}>
          <Download className="h-4 w-4 ml-1" /> Excel
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "طلبات معلقة", value: summary.pending, icon: Clock, color: "text-amber-500" },
          { label: "معتمدة", value: summary.approved, icon: CheckCircle2, color: "text-emerald-500" },
          { label: "مرفوضة", value: summary.rejected, icon: XCircle, color: "text-red-500" },
          { label: "عدد الموظفين", value: balanceData.length, icon: Users, color: "text-blue-500" },
        ].map((s, i) => (
          <Card key={i} className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-[10px] text-muted-foreground">{s.label}</span>
            </div>
            <p className="text-lg font-bold text-foreground">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 w-[300px]">
          <TabsTrigger value="balances">أرصدة الإجازات</TabsTrigger>
          <TabsTrigger value="requests">
            الطلبات
            {summary.pending > 0 && (
              <span className="mr-1 bg-amber-500 text-white text-[9px] rounded-full px-1.5 py-0.5">{summary.pending}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Search */}
        <div className="flex gap-3 flex-wrap mt-3">
          <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="w-[200px]" />
          {tab === "requests" && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="pending">معلقة</SelectItem>
                <SelectItem value="approved">معتمدة</SelectItem>
                <SelectItem value="rejected">مرفوضة</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Balances Tab */}
        <TabsContent value="balances">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-3 text-right font-semibold text-muted-foreground">الموظف</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">القسم</th>
                    <th className="p-3 text-center font-semibold text-muted-foreground" colSpan={3}>الإجازة السنوية</th>
                    <th className="p-3 text-center font-semibold text-muted-foreground" colSpan={3}>الإجازة المرضية</th>
                    <th className="p-3 text-center font-semibold text-muted-foreground">أخرى</th>
                    <th className="p-3 text-center font-semibold text-muted-foreground">معلقة</th>
                  </tr>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="p-2"></th>
                    <th className="p-2"></th>
                    <th className="p-2 text-center text-[10px] text-muted-foreground">الرصيد</th>
                    <th className="p-2 text-center text-[10px] text-muted-foreground">مستخدم</th>
                    <th className="p-2 text-center text-[10px] text-muted-foreground">متبقي</th>
                    <th className="p-2 text-center text-[10px] text-muted-foreground">الرصيد</th>
                    <th className="p-2 text-center text-[10px] text-muted-foreground">مستخدم</th>
                    <th className="p-2 text-center text-[10px] text-muted-foreground">متبقي</th>
                    <th className="p-2"></th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />جاري التحميل...
                    </td></tr>
                  ) : !filteredBalances.length ? (
                    <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>
                  ) : (
                    filteredBalances.map(r => (
                      <tr key={r.id} className="border-b border-border/40 hover:bg-muted/20 cursor-pointer" onClick={() => navigate(`/employees?id=${r.id}&tab=leaves`)}>
                        <td className="p-3 font-medium text-foreground">{r.full_name}</td>
                        <td className="p-3 text-muted-foreground">{r.department || "-"}</td>
                        <td className="p-3 text-center">{r.annual_leave_days}</td>
                        <td className="p-3 text-center text-amber-600">{r.annualUsed}</td>
                        <td className={`p-3 text-center font-bold ${r.annualRemaining <= 3 ? "text-red-500" : "text-emerald-600"}`}>{r.annualRemaining}</td>
                        <td className="p-3 text-center">{r.sick_leave_days}</td>
                        <td className="p-3 text-center text-amber-600">{r.sickUsed}</td>
                        <td className={`p-3 text-center font-bold ${r.sickRemaining <= 3 ? "text-red-500" : "text-emerald-600"}`}>{r.sickRemaining}</td>
                        <td className="p-3 text-center">{r.otherUsed}</td>
                        <td className="p-3 text-center">
                          {r.pendingRequests > 0 && (
                            <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{r.pendingRequests}</Badge>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Requests Tab */}
        <TabsContent value="requests">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-3 text-right font-semibold text-muted-foreground">الموظف</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">النوع</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">من</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">إلى</th>
                    <th className="p-3 text-center font-semibold text-muted-foreground">الأيام</th>
                    <th className="p-3 text-right font-semibold text-muted-foreground">السبب</th>
                    <th className="p-3 text-center font-semibold text-muted-foreground">الحالة</th>
                    <th className="p-3 text-center font-semibold text-muted-foreground">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />جاري التحميل...
                    </td></tr>
                  ) : !filteredRequests.length ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">لا توجد طلبات إجازة</td></tr>
                  ) : (
                    filteredRequests.map((l: any) => (
                      <tr key={l.id} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="p-3 font-medium text-foreground">{l.employees?.full_name || "-"}</td>
                        <td className="p-3">{l.leave_type}</td>
                        <td className="p-3 text-muted-foreground">{l.start_date}</td>
                        <td className="p-3 text-muted-foreground">{l.end_date}</td>
                        <td className="p-3 text-center font-medium">{l.days_count}</td>
                        <td className="p-3 text-muted-foreground truncate max-w-[150px]">{l.reason || "-"}</td>
                        <td className="p-3 text-center">{getStatusBadge(l.status)}</td>
                        <td className="p-3 text-center">
                          {(l.status === "معلقة" || l.status === "pending") && (
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={() => handleApprove(l)} title="اعتماد">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => { setSelectedLeave(l); setReviewOpen(true); }} title="رفض">
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reject Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>رفض طلب الإجازة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              رفض إجازة {selectedLeave?.employees?.full_name} — {selectedLeave?.leave_type} ({selectedLeave?.days_count} يوم)
            </p>
            <Input placeholder="سبب الرفض (اختياري)" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleReject}>تأكيد الرفض</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeavesPage;
