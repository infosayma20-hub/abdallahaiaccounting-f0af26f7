import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, CheckCircle, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/hr-utils";

interface Movement {
  id: string;
  source_type: string;
  source_reference: string | null;
  description: string;
  amount: number;
  movement_type: string;
  status: string;
  movement_date: string;
  salary_month: number | null;
  salary_year: number | null;
  notes: string | null;
  created_at: string;
}

const SOURCE_LABELS: Record<string, { label: string; icon: string }> = {
  hr_advance: { label: "سلفة HR", icon: "💰" },
  pos_meal: { label: "وجبة POS", icon: "🍽️" },
  pos_sale_credit: { label: "مبيعات POS", icon: "📦" },
  pos_shortage: { label: "عجز صندوق", icon: "⚠️" },
  finance_manual: { label: "يدوي", icon: "✏️" },
  salary_deduction: { label: "خصم تأديبي", icon: "📋" },
  insurance: { label: "تأمين", icon: "🏥" },
  tax: { label: "ضريبة", icon: "🏛️" },
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "🟡 انتظار", variant: "secondary" },
  approved: { label: "✅ معتمد", variant: "default" },
  rejected: { label: "❌ مرفوض", variant: "destructive" },
  deducted: { label: "💸 خُصم", variant: "outline" },
};

interface Props {
  employeeId: string;
  employeeName: string;
  userId: string;
}

export default function EmployeeMovementsTab({ employeeId, employeeName, userId }: Props) {
  const now = new Date();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    source_type: "finance_manual",
    description: "",
    amount: 0,
    movement_type: "debit",
    notes: "",
  });

  const fetchMovements = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("employee_financial_movements")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("user_id", userId)
      .eq("salary_month", month)
      .eq("salary_year", year)
      .order("movement_date", { ascending: false });

    if (error) console.error(error);
    else setMovements((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchMovements(); }, [employeeId, month, year]);

  const handleAdd = async () => {
    if (!addForm.description || addForm.amount <= 0) {
      toast.error("البيان والمبلغ مطلوبان");
      return;
    }
    const { error } = await supabase.from("employee_financial_movements").insert({
      user_id: userId,
      employee_id: employeeId,
      source_type: addForm.source_type,
      description: addForm.description,
      amount: addForm.amount,
      movement_type: addForm.movement_type,
      status: "approved",
      movement_date: new Date().toISOString().split("T")[0],
      salary_month: month,
      salary_year: year,
      notes: addForm.notes || null,
      created_by: userId,
    } as any);

    if (error) toast.error("خطأ في الإضافة");
    else {
      toast.success("تمت الإضافة");
      setShowAddForm(false);
      setAddForm({ source_type: "finance_manual", description: "", amount: 0, movement_type: "debit", notes: "" });
      fetchMovements();
    }
  };

  const handleApproveAll = async () => {
    const pending = movements.filter(m => m.status === "pending");
    if (pending.length === 0) { toast.info("لا توجد حركات معلقة"); return; }

    const { error } = await supabase
      .from("employee_financial_movements")
      .update({ status: "approved", approved_by: userId, approved_at: new Date().toISOString() } as any)
      .in("id", pending.map(m => m.id));

    if (error) toast.error("خطأ");
    else { toast.success(`تم اعتماد ${pending.length} حركة`); fetchMovements(); }
  };

  const approvedDebits = movements.filter(m => m.status === "approved" && m.movement_type === "debit");
  const pendingDebits = movements.filter(m => m.status === "pending" && m.movement_type === "debit");
  const totalApproved = approvedDebits.reduce((s, m) => s + Number(m.amount), 0);
  const totalPending = pendingDebits.reduce((s, m) => s + Number(m.amount), 0);
  const grandTotal = totalApproved + totalPending;

  const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-foreground">كشف مسحوبات {employeeName}</h3>
        <div className="flex gap-2 items-center">
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" className="w-20 h-8 text-xs" value={year} onChange={e => setYear(Number(e.target.value))} />
        </div>
      </div>

      {/* Summary */}
      <div className="bg-muted/30 rounded-xl p-3 flex flex-wrap gap-4 text-xs">
        <span>إجمالي المسحوبات: <b className="text-foreground">{formatCurrency(grandTotal)}</b></span>
        <span>معتمد للخصم: <b className="text-primary">{formatCurrency(totalApproved)}</b></span>
        <span>قيد المراجعة: <b className="text-orange-500">{formatCurrency(totalPending)}</b></span>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">التاريخ</TableHead>
            <TableHead className="text-right">المصدر</TableHead>
            <TableHead className="text-right">البيان</TableHead>
            <TableHead className="text-right">المبلغ</TableHead>
            <TableHead className="text-right">الحالة</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">جاري التحميل...</TableCell></TableRow>
          ) : movements.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">لا توجد حركات لهذا الشهر</TableCell></TableRow>
          ) : (
            movements.map(m => {
              const src = SOURCE_LABELS[m.source_type] || { label: m.source_type, icon: "📄" };
              const st = STATUS_CONFIG[m.status] || { label: m.status, variant: "secondary" as const };
              return (
                <TableRow key={m.id}>
                  <TableCell className="text-xs">{m.movement_date}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px] gap-1">{src.icon} {src.label}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{m.description}</TableCell>
                  <TableCell className={`font-medium text-xs ${m.movement_type === "debit" ? "text-destructive" : "text-emerald-600"}`}>
                    {m.movement_type === "debit" ? "-" : "+"}{formatCurrency(Number(m.amount))}
                  </TableCell>
                  <TableCell><Badge variant={st.variant} className="text-[10px]">{st.label}</Badge></TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" onClick={() => setShowAddForm(true)} className="gap-1">
          <Plus className="h-3 w-3" /> إضافة مسحوب يدوي
        </Button>
        {pendingDebits.length > 0 && (
          <Button size="sm" variant="outline" onClick={handleApproveAll} className="gap-1">
            <CheckCircle className="h-3 w-3" /> اعتماد الكل ({pendingDebits.length})
          </Button>
        )}
      </div>

      {/* Add Form Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>إضافة حركة مالية</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">نوع المصدر</label>
              <Select value={addForm.source_type} onValueChange={v => setAddForm({ ...addForm, source_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">نوع الحركة</label>
              <Select value={addForm.movement_type} onValueChange={v => setAddForm({ ...addForm, movement_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">مسحوب (خصم من الموظف)</SelectItem>
                  <SelectItem value="credit">دائن (لصالح الموظف)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">البيان *</label>
              <Input value={addForm.description} onChange={e => setAddForm({ ...addForm, description: e.target.value })} placeholder="مثال: سلفة راتب" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">المبلغ (₪) *</label>
              <Input type="number" value={addForm.amount} onChange={e => setAddForm({ ...addForm, amount: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">ملاحظات</label>
              <Input value={addForm.notes} onChange={e => setAddForm({ ...addForm, notes: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>إلغاء</Button>
              <Button onClick={handleAdd}>إضافة</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
