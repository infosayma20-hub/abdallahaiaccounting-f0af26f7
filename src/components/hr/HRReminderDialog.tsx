import { useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHRReminders } from "@/hooks/hr/useHRReminders";

export type ReminderPrefill = {
  employeeId?: string | null;
  title?: string;
  relatedFormId?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: ReminderPrefill | null;
  onSaved?: () => void;
};

/**
 * نافذة إضافة تذكير مخصص للموارد البشرية: نص + تاريخ + موظف (اختياري).
 * تُستخدم من جرس التنبيهات ومن زر "تذكير" على صفوف طلبات الموظفين.
 */
export default function HRReminderDialog({ open, onOpenChange, prefill, onSaved }: Props) {
  const { add } = useHRReminders();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [employeeId, setEmployeeId] = useState<string>("none");
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(prefill?.title || "");
    setNote("");
    setRemindAt("");
    setEmployeeId(prefill?.employeeId || "none");
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name");
      setEmployees((data as any[]) || []);
    })();
  }, [open, prefill]);

  const save = async () => {
    if (!title.trim()) { toast.error("اكتب نص التذكير"); return; }
    if (!remindAt) { toast.error("اختر تاريخ التذكير"); return; }
    setSaving(true);
    try {
      await add({
        title,
        note,
        remind_at: remindAt,
        employee_id: employeeId === "none" ? null : employeeId,
        related_form_id: prefill?.relatedFormId || null,
      });
      toast.success("تم حفظ التذكير ⏰ سيظهر لك في جرس التنبيهات بتاريخه");
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error("خطأ: " + (e?.message || "تعذر الحفظ"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" /> تذكير جديد
          </DialogTitle>
          <DialogDescription className="text-xs">
            مثال: «مر شهر على طلب قرض الموظف أحمد — راجع حالته». سيظهر التذكير في جرس تنبيهات الموظفين عند حلول التاريخ.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">نص التذكير *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مر شهر على طلب قرض الموظف…"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">تاريخ التذكير *</Label>
              <Input
                type="date"
                value={remindAt}
                onChange={(e) => setRemindAt(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">الموظف (اختياري)</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="بدون موظف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون موظف</SelectItem>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">ملاحظة إضافية (اختياري)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="تفاصيل إضافية تظهر مع التذكير…"
              className="mt-1 min-h-[70px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            حفظ التذكير
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
