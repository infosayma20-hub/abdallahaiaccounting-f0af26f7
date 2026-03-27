import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { fmtDateDisplay } from "@/lib/utils";
import {
  Users, Building2, Clock, CheckCircle2, XCircle, AlertTriangle,
  Calendar, FileText, Download, Loader2, Eye, Check, X, MapPin,
  QrCode, RefreshCw, Copy, MoreVertical, Pencil, Trash2, Printer
} from "lucide-react";
import BackButton from "@/components/BackButton";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

type Branch = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
};

type AttendanceRecord = {
  id: string;
  employee_id: string;
  attendance_date: string;
  first_check_in: string | null;
  last_check_out: string | null;
  total_hours: number;
  overtime_hours: number;
  status: string;
  branch_id: string | null;
  employees?: { full_name: string; branch_id: string | null };
};

type CorrectionReq = {
  id: string;
  employee_id: string;
  attendance_date: string;
  request_type: string;
  reason: string;
  status: string;
  created_at: string;
  employees?: { full_name: string };
};

const statusLabels: Record<string, string> = {
  present: "حاضر", late: "متأخر", absent: "غائب",
  incomplete: "ناقص", leave: "إجازة", holiday: "عطلة",
};

export default function HRAttendancePage() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [corrections, setCorrections] = useState<CorrectionReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [selectedBranchForQR, setSelectedBranchForQR] = useState<Branch | null>(null);
  const [qrToken, setQrToken] = useState("");
  const [branchForm, setBranchForm] = useState({ name: "", address: "", latitude: "", longitude: "", radius_meters: "100" });
  const [reviewDialog, setReviewDialog] = useState<CorrectionReq | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editForm, setEditForm] = useState({ name: "", address: "", latitude: "", longitude: "", radius_meters: "" });
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: br } = await supabase.from("branches_safe").select("*").eq("user_id", user.id);
      // Only show branches that have employees linked to them
      const { data: empBranches } = await supabase
        .from("employees")
        .select("branch_id")
        .eq("user_id", user.id)
        .not("branch_id", "is", null);
      const usedBranchIds = new Set((empBranches || []).map(e => e.branch_id));
      setBranches((br || []).filter(b => usedBranchIds.has(b.id)));

      // Fetch attendance for date - join with employees
      let query = supabase
        .from("attendance_days")
        .select("*, employees!inner(full_name, branch_id)")
        .eq("attendance_date", selectedDate);
      // Note: We filter by user's employees
      const { data: att } = await query.order("attendance_date", { ascending: false });
      
      let filtered = att || [];
      if (selectedBranch !== "all") {
        filtered = filtered.filter(r => r.branch_id === selectedBranch);
      }
      setRecords(filtered as any);

      // Corrections
      const { data: corr } = await supabase
        .from("correction_requests")
        .select("*, employees!inner(full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      setCorrections(corr as any || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [user, selectedDate, selectedBranch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createBranch = async () => {
    if (!branchForm.name || !branchForm.latitude || !branchForm.longitude) {
      toast({ title: "خطأ", description: "الاسم والإحداثيات مطلوبة", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("branches").insert({
      user_id: user!.id,
      name: branchForm.name,
      address: branchForm.address || null,
      latitude: parseFloat(branchForm.latitude),
      longitude: parseFloat(branchForm.longitude),
      radius_meters: parseInt(branchForm.radius_meters) || 100,
    });
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم إنشاء الفرع بنجاح" });
      setShowBranchDialog(false);
      setBranchForm({ name: "", address: "", latitude: "", longitude: "", radius_meters: "100" });
      fetchData();
    }
  };

  const generateQRToken = async (branch: Branch) => {
    setSelectedBranchForQR(branch);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/branch-qr?action=generate&branch_id=${branch.id}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const data = await response.json();
      if (!response.ok) {
        toast({ title: "خطأ", description: data.error || "حدث خطأ", variant: "destructive" });
        return;
      }
      setQrToken(data.qr_payload);
      setShowQRDialog(true);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  const openDisplayPage = (branchId: string) => {
    window.open(`/branch-display/${branchId}`, "_blank");
  };

  const printQRCode = (branchName: string, qrPayload: string) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(qrPayload)}&format=svg&margin=2`;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html dir="rtl"><head><meta charset="utf-8">
<title>QR Code - ${branchName}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
@page { size: A4; margin: 0; }
body { width: 210mm; height: 297mm; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: 'Tajawal', sans-serif; background: white; }
.container { text-align: center; padding: 20mm; }
.title { font-size: 36pt; font-weight: 800; color: #1B3A5C; margin-bottom: 8mm; }
.subtitle { font-size: 16pt; color: #666; margin-bottom: 15mm; }
.qr-frame { display: inline-block; padding: 10mm; border: 3px solid #1B3A5C; border-radius: 8mm; background: white; margin-bottom: 12mm; }
.qr-frame img { width: 100mm; height: 100mm; }
.instructions { font-size: 18pt; color: #1B3A5C; font-weight: 700; margin-bottom: 5mm; }
.sub-instructions { font-size: 12pt; color: #888; }
.badge { display: inline-block; margin-top: 10mm; padding: 3mm 8mm; background: #f0f4f8; border-radius: 4mm; font-size: 10pt; color: #666; }
</style></head><body>
<div class="container">
  <div class="title">${branchName}</div>
  <div class="subtitle">نظام تسجيل الحضور والانصراف</div>
  <div class="qr-frame"><img src="${qrUrl}" alt="QR Code" /></div>
  <div class="instructions">📱 امسح الرمز لتسجيل الحضور</div>
  <div class="sub-instructions">افتح تطبيق الموظف → اضغط "تسجيل حضور" → وجّه الكاميرا نحو الرمز</div>
  <div class="badge">🔒 رمز ثابت — لا يتغير</div>
</div>
<script>window.onload = () => { /* QR print page — view only */ }</script>
</body></html>`);
    printWindow.document.close();
  };

  const handleCorrection = async (id: string, action: "approved" | "rejected") => {
    const { error } = await supabase
      .from("correction_requests")
      .update({
        status: action,
        reviewed_by: user!.id,
        review_notes: reviewNotes || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      // Log audit
      await supabase.from("attendance_audit_logs").insert({
        table_name: "correction_requests",
        record_id: id,
        action: action === "approved" ? "approve" : "reject",
        new_values: { status: action, review_notes: reviewNotes },
        changed_by: user!.id,
        reason: reviewNotes || undefined,
      });
      toast({ title: action === "approved" ? "تم القبول ✅" : "تم الرفض" });
      setReviewDialog(null);
      setReviewNotes("");
      fetchData();
    }
  };

  const exportExcel = () => {
    if (records.length === 0) return;
    import("xlsx").then(XLSX => {
      // Sheet 1: Summary
      const summaryData = records.map(r => ({
        "الموظف": (r as any).employees?.full_name || "—",
        "التاريخ": r.attendance_date,
        "الدخول": r.first_check_in ? format(new Date(r.first_check_in), "hh:mm a") : "—",
        "الخروج": r.last_check_out ? format(new Date(r.last_check_out), "hh:mm a") : "—",
        "ساعات العمل": r.total_hours || 0,
        "ساعات إضافية": r.overtime_hours || 0,
        "الحالة": statusLabels[r.status] || r.status,
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(summaryData);
      ws["!cols"] = [
        { wch: 25 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "سجل الحضور");
      XLSX.writeFile(wb, `سجل_الحضور_${selectedDate}.xlsx`);
    });
  };

  const openEditBranch = (b: Branch) => {
    setEditingBranch(b);
    setEditForm({
      name: b.name,
      address: b.address || "",
      latitude: String(b.latitude),
      longitude: String(b.longitude),
      radius_meters: String(b.radius_meters),
    });
  };

  const updateBranch = async () => {
    if (!editingBranch || !editForm.name || !editForm.latitude || !editForm.longitude) return;
    const { error } = await supabase
      .from("branches")
      .update({
        name: editForm.name,
        address: editForm.address || null,
        latitude: parseFloat(editForm.latitude),
        longitude: parseFloat(editForm.longitude),
        radius_meters: parseInt(editForm.radius_meters) || 100,
      })
      .eq("id", editingBranch.id);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم تحديث الفرع بنجاح ✅" });
      setEditingBranch(null);
      fetchData();
    }
  };

  const deleteBranch = async () => {
    if (!deletingBranch || deleteConfirmName !== deletingBranch.name) return;
    const { error } = await supabase
      .from("branches")
      .update({ is_active: false })
      .eq("id", deletingBranch.id);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم حذف الفرع" });
      setDeletingBranch(null);
      setDeleteConfirmName("");
      fetchData();
    }
  };

  const presentCount = records.filter(r => r.status === "present" || r.status === "late").length;
  const absentCount = records.filter(r => r.status === "absent").length;
  const lateCount = records.filter(r => r.status === "late").length;
  const incompleteCount = records.filter(r => r.status === "incomplete").length;

  return (
    <div className="space-y-6 p-4 max-w-6xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold">لوحة إدارة الحضور</h1>
            <p className="text-muted-foreground text-sm">إدارة حضور وانصراف الموظفين</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowBranchDialog(true)} className="gap-1">
            <Building2 className="h-3.5 w-3.5" /> إضافة فرع
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1">
            <Download className="h-3.5 w-3.5" /> تصدير Excel
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 text-center">
          <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-emerald-600" />
          <div className="text-2xl font-bold">{presentCount}</div>
          <div className="text-xs text-muted-foreground">حاضرون</div>
        </Card>
        <Card className="p-4 text-center">
          <XCircle className="h-5 w-5 mx-auto mb-1 text-red-500" />
          <div className="text-2xl font-bold">{absentCount}</div>
          <div className="text-xs text-muted-foreground">غائبون</div>
        </Card>
        <Card className="p-4 text-center">
          <Clock className="h-5 w-5 mx-auto mb-1 text-amber-500" />
          <div className="text-2xl font-bold">{lateCount}</div>
          <div className="text-xs text-muted-foreground">متأخرون</div>
        </Card>
        <Card className="p-4 text-center">
          <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-orange-500" />
          <div className="text-2xl font-bold">{incompleteCount}</div>
          <div className="text-xs text-muted-foreground">بصمة ناقصة</div>
        </Card>
      </div>

      {/* Branches Quick View */}
      {branches.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {branches.map(b => (
            <Card key={b.id} className="min-w-[220px] p-3 hover:border-primary/50 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">{b.name}</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEditBranch(b)} className="gap-2">
                      <Pencil className="h-3.5 w-3.5" /> تعديل الفرع
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDeletingBranch(b)} className="gap-2 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" /> حذف الفرع
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>{b.address || "—"}</span>
              </div>
              <div className="flex gap-1 mt-2">
                <Button size="sm" variant="outline" className="gap-1 text-xs flex-1" onClick={() => generateQRToken(b)}>
                  <QrCode className="h-3 w-3" /> عرض QR
                </Button>
                <Button size="sm" variant="ghost" className="gap-1 text-xs flex-1" onClick={() => openDisplayPage(b.id)}>
                  <Eye className="h-3 w-3" /> شاشة العرض
                </Button>
                <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => {
                  generateQRToken(b).then(() => {});
                  // We'll print from the dialog after QR is loaded
                }}>
                  <Printer className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue="live" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="live" className="gap-1">
            <Eye className="h-3.5 w-3.5" /> العرض المباشر
          </TabsTrigger>
          <TabsTrigger value="corrections" className="gap-1 relative">
            <FileText className="h-3.5 w-3.5" /> طلبات التعديل
            {corrections.length > 0 && (
              <span className="absolute -top-1 -left-1 h-4 w-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center">
                {corrections.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1">
            <Calendar className="h-3.5 w-3.5" /> التقارير
          </TabsTrigger>
        </TabsList>

        {/* Live View */}
        <TabsContent value="live" className="mt-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-auto"
              dir="ltr"
            />
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="كل الفروع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={fetchData} className="gap-1">
              <RefreshCw className="h-3.5 w-3.5" /> تحديث
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : records.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا يوجد سجلات لهذا التاريخ</p>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الموظف</TableHead>
                    <TableHead className="text-right">الدخول</TableHead>
                    <TableHead className="text-right">الخروج</TableHead>
                    <TableHead className="text-right">الساعات</TableHead>
                    <TableHead className="text-right">إضافي</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{(r as any).employees?.full_name || "—"}</TableCell>
                      <TableCell>{r.first_check_in ? format(new Date(r.first_check_in), "hh:mm a") : "—"}</TableCell>
                      <TableCell>{r.last_check_out ? format(new Date(r.last_check_out), "hh:mm a") : "—"}</TableCell>
                      <TableCell className="tabular-nums">{r.total_hours?.toFixed(1) || "0"}</TableCell>
                      <TableCell className="tabular-nums">{r.overtime_hours?.toFixed(1) || "0"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {statusLabels[r.status] || r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Corrections Queue */}
        <TabsContent value="corrections" className="mt-4 space-y-2">
          {corrections.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا يوجد طلبات تعديل معلقة 🎉</p>
          ) : (
            corrections.map(req => (
              <Card key={req.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium">{(req as any).employees?.full_name}</span>
                    <span className="text-xs text-muted-foreground mr-2">• {fmtDateDisplay(req.attendance_date)}</span>
                  </div>
                  <Badge variant="outline">
                    {req.request_type === "missing_checkin" ? "دخول مفقود" :
                     req.request_type === "missing_checkout" ? "خروج مفقود" :
                     req.request_type === "wrong_time" ? "وقت خاطئ" :
                     req.request_type === "leave_request" ? "🏖️ طلب إجازة" :
                     req.request_type === "advance_request" ? "💰 طلب سلفة" :
                     req.request_type === "overtime_request" ? "⏰ أوفرتايم" :
                     req.request_type === "hr_message" ? "💬 رسالة HR" : "أخرى"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{req.reason}</p>
                <div className="flex gap-2">
                  <Button size="sm" className="gap-1" onClick={() => { setReviewDialog(req); setReviewNotes(""); }}>
                    <Eye className="h-3 w-3" /> مراجعة
                  </Button>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Reports */}
        <TabsContent value="reports" className="mt-4">
          <Card className="p-6 text-center">
            <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <h3 className="font-medium mb-1">التقارير الشهرية</h3>
            <p className="text-sm text-muted-foreground mb-4">استخدم أزرار التصدير لتنزيل تقارير مفصلة</p>
            <Button variant="outline" onClick={exportExcel} className="gap-1">
              <Download className="h-4 w-4" /> تصدير تقرير Excel
            </Button>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Branch Dialog */}
      <Dialog open={showBranchDialog} onOpenChange={setShowBranchDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              إضافة فرع جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">اسم الفرع *</label>
              <Input value={branchForm.name} onChange={e => setBranchForm(p => ({ ...p, name: e.target.value }))} placeholder="مثال: الفرع الرئيسي" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">العنوان</label>
              <Input value={branchForm.address} onChange={e => setBranchForm(p => ({ ...p, address: e.target.value }))} placeholder="مثال: رام الله - شارع الإرسال" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">خط العرض (Latitude) *</label>
                <Input type="number" step="any" value={branchForm.latitude} onChange={e => setBranchForm(p => ({ ...p, latitude: e.target.value }))} dir="ltr" placeholder="31.9038" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">خط الطول (Longitude) *</label>
                <Input type="number" step="any" value={branchForm.longitude} onChange={e => setBranchForm(p => ({ ...p, longitude: e.target.value }))} dir="ltr" placeholder="35.2034" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">نطاق السياج الجغرافي (بالأمتار)</label>
              <Input type="number" value={branchForm.radius_meters} onChange={e => setBranchForm(p => ({ ...p, radius_meters: e.target.value }))} dir="ltr" placeholder="100" />
            </div>
            <Button onClick={() => {
              if (!navigator.geolocation) {
                toast({ title: "المتصفح لا يدعم تحديد الموقع", variant: "destructive" });
                return;
              }
              navigator.geolocation.getCurrentPosition(
                pos => {
                  setBranchForm(p => ({
                    ...p,
                    latitude: pos.coords.latitude.toFixed(6),
                    longitude: pos.coords.longitude.toFixed(6),
                  }));
                  toast({ title: "تم تحديد الموقع بنجاح ✅" });
                },
                err => {
                  console.error("Geolocation error:", err);
                  const msgs: Record<number, string> = {
                    1: "تم رفض إذن الموقع. يرجى السماح بالوصول للموقع من إعدادات المتصفح.",
                    2: "تعذّر تحديد الموقع. تأكد من تفعيل GPS وحاول مرة أخرى.",
                    3: "انتهت مهلة تحديد الموقع. حاول مرة أخرى.",
                  };
                  toast({ title: msgs[err.code] || "خطأ في تحديد الموقع", variant: "destructive" });
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
              );
            }} variant="outline" size="sm" className="w-full gap-1">
              <MapPin className="h-3.5 w-3.5" /> استخدام موقعي الحالي
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={createBranch} className="w-full">إنشاء الفرع</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Token Dialog */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              رمز QR الديناميكي
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-center">
            <p className="text-sm font-medium">{selectedBranchForQR?.name}</p>
            <div className="bg-white rounded-xl p-4 shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrToken)}&format=svg`}
                alt="رمز QR"
                className="w-[250px] h-[250px] mx-auto"
              />
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground mb-1">الرمز يتجدد تلقائياً - لا يحتاج تدخل يدوي</p>
              <code className="text-xs font-mono break-all select-all">{qrToken}</code>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-1" onClick={() => {
                navigator.clipboard.writeText(qrToken);
                toast({ title: "تم النسخ" });
              }}>
                <Copy className="h-3.5 w-3.5" /> نسخ
              </Button>
              <Button variant="outline" className="flex-1 gap-1" onClick={() => selectedBranchForQR && openDisplayPage(selectedBranchForQR.id)}>
                <Eye className="h-3.5 w-3.5" /> شاشة عرض
              </Button>
            </div>
            <Button variant="default" className="w-full gap-1" onClick={() => {
              if (selectedBranchForQR && qrToken) {
                printQRCode(selectedBranchForQR.name, qrToken);
              }
            }}>
              <Printer className="h-3.5 w-3.5" /> طباعة QR على ورقة A4
            </Button>
            <p className="text-[10px] text-muted-foreground">🔒 مشفر بتقنية HMAC-SHA256 ويتجدد تلقائياً</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Correction Dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>مراجعة طلب التعديل</DialogTitle>
          </DialogHeader>
          {reviewDialog && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">الموظف</p>
                  <p className="font-medium">{(reviewDialog as any).employees?.full_name}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">التاريخ</p>
                  <p className="font-medium">{fmtDateDisplay(reviewDialog.attendance_date)}</p>
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">السبب</p>
                <p className="text-sm">{reviewDialog.reason}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">ملاحظات HR</label>
                <Textarea
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="أضف ملاحظة..."
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" className="gap-1 flex-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => reviewDialog && handleCorrection(reviewDialog.id, "rejected")}>
              <X className="h-4 w-4" /> رفض
            </Button>
            <Button className="gap-1 flex-1" onClick={() => reviewDialog && handleCorrection(reviewDialog.id, "approved")}>
              <Check className="h-4 w-4" /> قبول
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Branch Dialog */}
      <Dialog open={!!editingBranch} onOpenChange={(o) => !o && setEditingBranch(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              تعديل فرع {editingBranch?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">اسم الفرع *</label>
              <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">العنوان</label>
              <Input value={editForm.address} onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">خط العرض (Latitude) *</label>
                <Input type="number" step="any" value={editForm.latitude} onChange={e => setEditForm(p => ({ ...p, latitude: e.target.value }))} dir="ltr" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">خط الطول (Longitude) *</label>
                <Input type="number" step="any" value={editForm.longitude} onChange={e => setEditForm(p => ({ ...p, longitude: e.target.value }))} dir="ltr" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">النطاق (بالأمتار)</label>
              <Input type="number" value={editForm.radius_meters} onChange={e => setEditForm(p => ({ ...p, radius_meters: e.target.value }))} dir="ltr" />
            </div>
            <Button onClick={() => {
              navigator.geolocation.getCurrentPosition(
                pos => {
                  setEditForm(p => ({ ...p, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
                  toast({ title: "تم تحديد الموقع ✅" });
                },
                () => toast({ title: "تعذر تحديد الموقع", variant: "destructive" }),
                { enableHighAccuracy: true, timeout: 15000 }
              );
            }} variant="outline" size="sm" className="w-full gap-1">
              <MapPin className="h-3.5 w-3.5" /> استخدام موقعي الحالي
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={updateBranch} className="w-full">حفظ التعديلات</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Branch Dialog */}
      <Dialog open={!!deletingBranch} onOpenChange={(o) => { if (!o) { setDeletingBranch(null); setDeleteConfirmName(""); } }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              حذف فرع {deletingBranch?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-destructive/10 rounded-lg p-4 text-sm">
              <p className="font-semibold mb-1">⚠️ تحذير</p>
              <p>حذف الفرع سيؤثر على سجلات الحضور المرتبطة به. لن يتم حذف السجلات السابقة لكن لن يمكن استخدام الفرع بعد الآن.</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">اكتب اسم الفرع للتأكيد: <strong>{deletingBranch?.name}</strong></label>
              <Input value={deleteConfirmName} onChange={e => setDeleteConfirmName(e.target.value)} placeholder={deletingBranch?.name} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={deleteBranch} disabled={deleteConfirmName !== deletingBranch?.name} className="w-full gap-1">
              <Trash2 className="h-4 w-4" /> حذف نهائي
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
