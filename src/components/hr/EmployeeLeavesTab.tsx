import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { calculateLeaveBalance, calculateAnnualLeaveEntitlement } from "@/lib/hr-utils";
import { differenceInBusinessDays, eachDayOfInterval, getDay } from "date-fns";

const LEAVE_TYPES = [
  { v: "سنوية", l: "🏖️ سنوية" },
  { v: "مرضية", l: "🤒 مرضية" },
  { v: "طارئة", l: "🚨 طارئة" },
  { v: "بدون راتب", l: "⏸️ بدون راتب" },
  { v: "أمومة", l: "🤱 أمومة (70 يوم)" },
  { v: "أبوة", l: "👨‍🍼 أبوة" },
];

interface Props {
  employeeId: string;
  userId: string;
  employee: any;
  leaves: any[];
  onRefresh: () => void;
}

export default function EmployeeLeavesTab({ employeeId, userId, employee, leaves, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    leave_type: "سنوية",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date().toISOString().split("T")[0],
    days_count: 1,
    notes: "",
  });

  // Calculate working days between dates (exclude Fridays)
  const calcWorkDays = (start: string, end: string) => {
    try {
      const days = eachDayOfInterval({ start: new Date(start), end: new Date(end) });
      return days.filter(d => getDay(d) !== 5).length; // Exclude Friday
    } catch { return 1; }
  };

  // Auto-calculate days when dates change
  const handleDateChange = (field: "start_date" | "end_date", value: string) => {
    const newForm = { ...form, [field]: value };
    const days = calcWorkDays(
      field === "start_date" ? value : form.start_date,
      field === "end_date" ? value : form.end_date
    );
    newForm.days_count = days;
    setForm(newForm);
  };

  // Leave balance
  const annualEntitlement = calculateAnnualLeaveEntitlement(employee?.start_date || "2024-01-01");
  const sickEntitlement = employee?.sick_leave_days || 14;
  const usedAnnual = leaves
    .filter(l => (l.status === "موافق عليها" || l.status === "موافقة" || l.status === "معتمدة") && l.leave_type === "سنوية" && new Date(l.start_date).getFullYear() === new Date().getFullYear())
    .reduce((s: number, l: any) => s + Number(l.days_count || 0), 0);
  const usedSick = leaves
    .filter(l => (l.status === "موافق عليها" || l.status === "موافقة" || l.status === "معتمدة") && l.leave_type === "مرضية" && new Date(l.start_date).getFullYear() === new Date().getFullYear())
    .reduce((s: number, l: any) => s + Number(l.days_count || 0), 0);

  const leaveBalance = calculateLeaveBalance(
    employee?.start_date || "2024-01-01",
    Number(employee?.previous_year_balance || 0),
    usedAnnual
  );

  const handleSubmit = async () => {
    if (form.days_count <= 0) { toast.error("عدد الأيام يجب أن يكون أكبر من صفر"); return; }

    // Validation for annual leave
    if (form.leave_type === "سنوية" && form.days_count > leaveBalance.available) {
      toast.error(`رصيدك ${leaveBalance.available} يوم فقط. هل تريد تقديم إجازة بدون راتب؟`);
      return;
    }

    const { error } = await supabase.from("employee_leaves").insert({
      employee_id: employeeId,
      user_id: userId,
      leave_type: form.leave_type,
      start_date: form.start_date,
      end_date: form.end_date,
      days_count: form.days_count,
      notes: form.notes,
      status: "pending",
    } as any);

    if (error) toast.error("خطأ في الحفظ");
    else {
      toast.success("تم تقديم طلب الإجازة");
      setShowForm(false);
      setForm({ leave_type: "سنوية", start_date: new Date().toISOString().split("T")[0], end_date: new Date().toISOString().split("T")[0], days_count: 1, notes: "" });
      onRefresh();
    }
  };

  const statusBadge = (status: string) => {
    if (status === "موافق عليها" || status === "موافقة" || status === "معتمدة") return <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">معتمدة</Badge>;
    if (status === "معلقة" || status === "pending") return <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{status}</Badge>;
    if (status === "مرفوضة" || status === "rejected") return <Badge variant="destructive" className="text-[10px]">{status}</Badge>;
    return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium text-foreground">الإجازات</h3>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1"><Plus className="h-3 w-3" /> طلب إجازة</Button>
      </div>

      {/* Balance Display */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">سنوية</p>
            <p className="text-lg font-bold text-foreground">{annualEntitlement} يوم</p>
            <p className="text-[10px] text-muted-foreground">مستخدم {usedAnnual}</p>
            <p className="text-xs font-bold text-primary">متاح {leaveBalance.available}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">مرضية</p>
            <p className="text-lg font-bold text-foreground">{sickEntitlement} يوم</p>
            <p className="text-[10px] text-muted-foreground">مستخدم {usedSick}</p>
            <p className="text-xs font-bold text-primary">متاح {sickEntitlement - usedSick}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">الإجمالي</p>
            <p className="text-lg font-bold text-foreground">{annualEntitlement + sickEntitlement} يوم</p>
            <p className="text-[10px] text-muted-foreground">مستخدم {usedAnnual + usedSick}</p>
            <p className="text-xs font-bold text-primary">متاح {leaveBalance.available + (sickEntitlement - usedSick)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">الحالة</TableHead>
            <TableHead className="text-right">النوع</TableHead>
            <TableHead className="text-right">من</TableHead>
            <TableHead className="text-right">إلى</TableHead>
            <TableHead className="text-right">الأيام</TableHead>
            <TableHead className="text-right">السبب</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leaves.map(l => (
            <TableRow key={l.id}>
              <TableCell>{statusBadge(l.status)}</TableCell>
              <TableCell className="text-xs">{l.leave_type}</TableCell>
              <TableCell className="text-xs">{l.start_date}</TableCell>
              <TableCell className="text-xs">{l.end_date}</TableCell>
              <TableCell className="text-xs font-medium">{l.days_count}</TableCell>
              <TableCell className="text-xs truncate max-w-[150px]">{l.notes || "—"}</TableCell>
            </TableRow>
          ))}
          {leaves.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">لا توجد إجازات</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      {/* Leave Request Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>طلب إجازة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>نوع الإجازة *</Label>
              <Select value={form.leave_type} onValueChange={v => setForm({ ...form, leave_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>من تاريخ *</Label>
              <Input type="date" value={form.start_date} onChange={e => handleDateChange("start_date", e.target.value)} />
            </div>
            <div>
              <Label>إلى تاريخ *</Label>
              <Input type="date" value={form.end_date} onChange={e => handleDateChange("end_date", e.target.value)} />
            </div>
            <div>
              <Label>عدد الأيام (محسوب تلقائياً)</Label>
              <Input type="number" value={form.days_count} readOnly className="bg-muted/30" />
              <p className="text-[10px] text-muted-foreground mt-1">يستثني أيام الجمعة</p>
            </div>
            <div>
              <Label>سبب الإجازة</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>

            {form.leave_type === "سنوية" && form.days_count > leaveBalance.available && (
              <p className="text-xs text-destructive">⚠️ رصيدك {leaveBalance.available} يوم فقط</p>
            )}
            {form.leave_type === "بدون راتب" && (
              <p className="text-xs text-amber-600">⚠️ سيتم خصم أيام الإجازة من الراتب تلقائياً</p>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button onClick={handleSubmit}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
