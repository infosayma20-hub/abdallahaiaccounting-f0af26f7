import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Calendar, Download, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FIXED_HOLIDAYS } from "@/lib/hr-utils";

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
}

export default function OfficialHolidaysDialog({ open, onClose, userId }: Props) {
  const [holidays, setHolidays] = useState<any[]>([]);
  const [form, setForm] = useState({ holiday_date: "", name: "", multiplier: "2" });
  const [loading, setLoading] = useState(false);
  // Confirmation before bulk-inserting a preset year
  const [seedYear, setSeedYear] = useState<number | null>(null);

  const fetchHolidays = async () => {
    const { data } = await supabase
      .from("official_holidays")
      .select("*")
      .eq("user_id", userId)
      .order("holiday_date", { ascending: true });
    setHolidays(data || []);
  };

  useEffect(() => {
    if (open) fetchHolidays();
  }, [open]);

  const addHoliday = async () => {
    if (!form.holiday_date || !form.name) {
      toast.error("التاريخ والاسم مطلوبان");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("official_holidays").insert({
      user_id: userId,
      holiday_date: form.holiday_date,
      name: form.name,
      multiplier: parseFloat(form.multiplier) || 2,
    } as any);
    if (error) toast.error(error.message);
    else {
      toast.success("تمت الإضافة");
      setForm({ holiday_date: "", name: "", multiplier: "2" });
      fetchHolidays();
    }
    setLoading(false);
  };

  const performSeed = async (year: number) => {
    const toInsert = FIXED_HOLIDAYS.map(h => ({
      user_id: userId,
      holiday_date: `${year}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`,
      name: h.name,
      multiplier: 2,
      is_recurring: true,
      recurring_month: h.month,
      recurring_day: h.day,
    }));
    const { error } = await supabase.from("official_holidays").insert(toInsert as any);
    if (error) toast.error(error.message);
    else {
      toast.success(`تمت إضافة ${toInsert.length} عطل لسنة ${year}`);
      fetchHolidays();
    }
    setSeedYear(null);
  };

  const deleteHoliday = async (id: string) => {
    await supabase.from("official_holidays").delete().eq("id", id);
    fetchHolidays();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            العطل الرسمية الفلسطينية
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick seed */}
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
              استيراد سريع لقائمة العطل الفلسطينية الرسمية لسنة كاملة دفعة واحدة:
            </p>
            <div className="flex gap-2 flex-wrap">
              {[2025, 2026, 2027].map((y) => (
                <Button
                  key={y}
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => setSeedYear(y)}
                >
                  <Download className="h-3.5 w-3.5" />
                  استيراد عطل {y}
                </Button>
              ))}
            </div>
          </div>

          {/* Add form */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">التاريخ</label>
              <Input type="date" value={form.holiday_date} onChange={e => setForm(p => ({ ...p, holiday_date: e.target.value }))} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">الاسم</label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="عيد الفطر" />
            </div>
            <Button size="sm" onClick={addHoliday} disabled={loading}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* List */}
          <div className="space-y-2">
            {holidays.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">لا توجد عطل مسجلة</p>
            ) : (
              holidays.map(h => (
                <div key={h.id} className="flex items-center justify-between bg-muted/30 rounded-lg p-2">
                  <div>
                    <p className="text-sm font-medium">{h.name}</p>
                    <p className="text-xs text-muted-foreground">{h.holiday_date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{h.multiplier}x</Badge>
                    <Button size="sm" variant="ghost" onClick={() => deleteHoliday(h.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>

        {/* Confirm dialog before bulk seeding */}
        <AlertDialog open={seedYear !== null} onOpenChange={(o) => !o && setSeedYear(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                استيراد عطل سنة {seedYear}
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-right">
                <span className="block">
                  سيتم إضافة <b>{FIXED_HOLIDAYS.length}</b> عطلة رسمية فلسطينية إلى القائمة:
                </span>
                <ul className="text-xs bg-muted/40 rounded p-2 max-h-40 overflow-y-auto list-disc pr-5">
                  {FIXED_HOLIDAYS.map((h, i) => (
                    <li key={i}>
                      {h.name} — {String(h.day).padStart(2, "0")}/{String(h.month).padStart(2, "0")}/{seedYear}
                    </li>
                  ))}
                </ul>
                <span className="block text-[11px] text-amber-700 dark:text-amber-500">
                  ملاحظة: إذا كانت بعض هذه العطل موجودة مسبقاً قد تُضاف مكرَّرة.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={() => seedYear && performSeed(seedYear)}>
                تأكيد الإضافة
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
