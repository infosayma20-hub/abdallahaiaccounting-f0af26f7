import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Calendar } from "lucide-react";
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

  const seedFixedHolidays = async (year: number) => {
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
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => seedFixedHolidays(2025)}>إضافة عطل 2025</Button>
            <Button size="sm" variant="outline" onClick={() => seedFixedHolidays(2026)}>إضافة عطل 2026</Button>
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
      </DialogContent>
    </Dialog>
  );
}
