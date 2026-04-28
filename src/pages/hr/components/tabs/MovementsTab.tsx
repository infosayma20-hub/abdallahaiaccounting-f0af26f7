import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, AlertTriangle, Filter } from "lucide-react";
import { HRTable, HRTHead, HRTH, HRTR, HRTD, HRMoney } from "../HRTable";
import {
  MOVEMENT_CATEGORIES,
  tCategory,
  useEmployeeMovements,
  useCreateEmployeeMovement,
  useDeleteEmployeeMovement,
  type EmployeeMovement,
  type MovementFilters,
} from "@/hooks/hr/useEmployeeFinancialMovements";

interface Props {
  employeeId: string;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(v || 0));

function defaultRange() {
  const d = new Date();
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  return { from: start, to: d.toISOString().split("T")[0] };
}

export function MovementsTab({ employeeId }: Props) {
  const [filters, setFilters] = useState<MovementFilters>({
    ...defaultRange(),
    category: "all",
    direction: "all",
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: movements = [], isLoading } = useEmployeeMovements(employeeId, filters);
  const createMut = useCreateEmployeeMovement();
  const deleteMut = useDeleteEmployeeMovement();

  const totals = useMemo(() => {
    let debit = 0,
      credit = 0,
      unclassified = 0;
    for (const m of movements) {
      if (m.movement_type === "debit") debit += Number(m.amount || 0);
      else if (m.movement_type === "credit") credit += Number(m.amount || 0);
      if (!m.category) unclassified++;
    }
    return { debit, credit, net: debit - credit, unclassified, count: movements.length };
  }, [movements]);

  const unclassified = movements.filter((m) => !m.category);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Filters & actions */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">من</Label>
            <Input
              type="date"
              value={filters.from || ""}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              className="h-9 w-[140px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">إلى</Label>
            <Input
              type="date"
              value={filters.to || ""}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              className="h-9 w-[140px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">التصنيف</Label>
            <select
              value={filters.category || "all"}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="bg-background border rounded-md h-9 px-3 text-sm"
            >
              <option value="all">الكل</option>
              <option value="unclassified">غير مصنفة</option>
              {MOVEMENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">الاتجاه</Label>
            <select
              value={filters.direction || "all"}
              onChange={(e) => setFilters({ ...filters, direction: e.target.value as any })}
              className="bg-background border rounded-md h-9 px-3 text-sm"
            >
              <option value="all">الكل</option>
              <option value="debit">خصم (مدين)</option>
              <option value="credit">إضافة (دائن)</option>
            </select>
          </div>
          <div className="flex-1" />
          <Button onClick={() => setDialogOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" />
            إضافة حركة
          </Button>
        </CardContent>
      </Card>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="إجمالي الخصومات (مدين)" value={totals.debit} tone="danger" />
        <KPI label="إجمالي الإضافات (دائن)" value={totals.credit} tone="positive" />
        <KPI label="الصافي" value={totals.net} tone={totals.net >= 0 ? "danger" : "positive"} />
        <KPI label="غير مصنفة" value={totals.unclassified} raw tone={totals.unclassified > 0 ? "warning" : "neutral"} />
      </div>

      {totals.unclassified > 0 && (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-right text-sm">
            يوجد {totals.unclassified} حركة غير مصنفة. هذه الحركات لا تُخصم في معاينة الراتب حتى يتم تصنيفها.
          </AlertDescription>
        </Alert>
      )}

      {/* Movements table */}
      <Card dir="rtl">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">الحركات المالية ({movements.length})</CardTitle>
          <Filter className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</p>
          ) : movements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">لا توجد حركات في هذه الفترة.</p>
          ) : (
            <HRTable>
              <HRTHead>
                <HRTH>التاريخ</HRTH>
                <HRTH>التصنيف</HRTH>
                <HRTH>الوصف</HRTH>
                <HRTH>المرجع</HRTH>
                <HRTH>المصدر</HRTH>
                <HRTH>المبلغ</HRTH>
                <HRTH>—</HRTH>
              </HRTHead>
              <tbody>
                {movements.map((m) => (
                  <MovementRow
                    key={m.id}
                    m={m}
                    onDelete={() =>
                      window.confirm("حذف الحركة؟") &&
                      deleteMut.mutate({ id: m.id, employee_id: employeeId })
                    }
                  />
                ))}
              </tbody>
            </HRTable>
          )}
        </CardContent>
      </Card>

      <CreateMovementDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        employeeId={employeeId}
        onCreate={(input) => createMut.mutate(input, { onSuccess: () => setDialogOpen(false) })}
        loading={createMut.isPending}
      />
    </div>
  );
}

function MovementRow({ m, onDelete }: { m: EmployeeMovement; onDelete: () => void }) {
  const isDebit = m.movement_type === "debit";
  const isManual = (m.source_type || "").toLowerCase() === "hr_manual";
  const cls = isDebit ? "text-rose-600" : "text-emerald-600";
  return (
    <HRTR>
      <HRTD numeric>{m.movement_date}</HRTD>
      <HRTD>
        {m.category ? (
          <Badge variant="outline" className="text-[10px]">{tCategory(m.category)}</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700">غير مصنفة</Badge>
        )}
      </HRTD>
      <HRTD className="max-w-xs truncate">
        <div className="flex flex-col">
          <span>{m.description || "—"}</span>
          {m.notes && <span className="text-[10px] text-muted-foreground">{m.notes}</span>}
        </div>
      </HRTD>
      <HRTD className="text-xs">{m.reference_number || m.source_reference || "—"}</HRTD>
      <HRTD>
        <Badge variant="secondary" className="text-[10px]">{m.source_type || "—"}</Badge>
      </HRTD>
      <HRTD numeric className={`font-semibold ${cls}`}>
        {isDebit ? "-" : "+"}<HRMoney value={m.amount} />
      </HRTD>
      <HRTD>
        {isManual && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-rose-600" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </HRTD>
    </HRTR>
  );
}

function KPI({ label, value, tone, raw }: { label: string; value: number; tone: "positive" | "danger" | "warning" | "neutral"; raw?: boolean }) {
  const cls =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "danger"
      ? "text-rose-700 dark:text-rose-400"
      : tone === "warning"
      ? "text-amber-700 dark:text-amber-400"
      : "text-foreground";
  return (
    <Card className="p-3 text-right">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${cls}`}>{raw ? value : `₪${fmt(value)}`}</p>
    </Card>
  );
}

function CreateMovementDialog({
  open,
  onClose,
  employeeId,
  onCreate,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  onCreate: (input: any) => void;
  loading: boolean;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [direction, setDirection] = useState<"debit" | "credit">("debit");
  const [category, setCategory] = useState("food");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setDate(today);
    setDirection("debit");
    setCategory("food");
    setAmount("");
    setDescription("");
    setReference("");
    setNotes("");
  };

  const submit = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    onCreate({
      employee_id: employeeId,
      movement_date: date,
      movement_type: direction,
      category,
      amount: amt,
      description,
      reference_number: reference,
      notes,
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>إضافة حركة مالية يدوية</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">التاريخ</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">الاتجاه</Label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as any)}
                className="bg-background border rounded-md h-10 w-full px-3 text-sm"
              >
                <option value="debit">خصم (مدين)</option>
                <option value="credit">إضافة (دائن)</option>
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs">التصنيف</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-background border rounded-md h-10 w-full px-3 text-sm"
            >
              {MOVEMENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">المبلغ (₪)</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label className="text-xs">الوصف</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: قسط أكل أبريل" />
          </div>
          <div>
            <Label className="text-xs">رقم المرجع (اختياري)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PV-1234" />
          </div>
          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <Alert className="border-amber-500/40 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-xs">
              لن يتم إنشاء أي قيد محاسبي. هذه حركة في كشف حساب الموظف فقط، تظهر في معاينة الراتب.
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={loading || !amount}>
            {loading ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
