import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, DoorClosed } from "lucide-react";
import { toast } from "sonner";

export default function SpartaVanClose() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const dayId = params.get("day") || "";
  const [day, setDay] = useState<any>(null);
  const [actual, setActual] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dayId) return;
    (async () => {
      const { data } = await (supabase as any).from("sparta_van_days").select("*").eq("id", dayId).single();
      setDay(data);
    })();
  }, [dayId]);

  const expected = Number(day?.expected_cash || 0);
  const variance = Number(actual || 0) - expected;

  async function save() {
    if (!actual) return toast.error("أدخل النقد الفعلي");
    setSaving(true);
    const { error } = await (supabase as any).rpc("sparta_van_close_day", {
      _van_day_id: dayId,
      _actual_cash: Number(actual),
      _notes: notes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("تم إغلاق الجلسة");
    localStorage.removeItem("sparta_van_rep_id");
    nav("/sparta/m/van");
  }

  if (!day) return <div className="p-6 text-center">تحميل...</div>;

  return (
    <div className="min-h-[100dvh] bg-background" dir="rtl">
      <header className="px-4 py-4 flex items-center gap-3 border-b" style={{ background: "var(--gradient-sparta)", color: "white" }}>
        <Link to="/sparta/m/van"><ArrowRight className="h-5 w-5 rotate-180" /></Link>
        <div className="flex-1 font-bold">إغلاق الجلسة</div>
        <DoorClosed className="h-5 w-5" />
      </header>
      <div className="p-4 max-w-md mx-auto space-y-4">
        <div className="bg-card border rounded-2xl p-4 space-y-2">
          <Row label="رصيد افتتاحي" v={day.opening_cash} />
          <Row label="مبيعات نقدية" v={day.total_sales_cash} positive />
          <Row label="تحصيلات" v={day.total_collections} positive />
          <Row label="مصاريف" v={-day.total_expenses} />
          <div className="border-t pt-2 mt-2 flex items-center justify-between">
            <span className="font-bold">النقد المتوقع</span>
            <span className="font-bold text-lg tabular-nums">₪ {expected.toFixed(2)}</span>
          </div>
        </div>
        <div>
          <Label>النقد الفعلي في الصندوق (₪)</Label>
          <Input type="number" value={actual} onChange={(e) => setActual(e.target.value)} className="text-lg" />
        </div>
        {actual && (
          <div className={`p-3 rounded-lg border ${variance === 0 ? "bg-emerald-50 border-emerald-200" : variance > 0 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
            <div className="text-xs">الفرق</div>
            <div className="font-bold text-lg tabular-nums">₪ {variance.toFixed(2)} {variance > 0 ? "(زيادة)" : variance < 0 ? "(عجز)" : ""}</div>
          </div>
        )}
        <div>
          <Label>ملاحظات الإغلاق</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <Button onClick={save} disabled={saving || !actual} className="w-full">{saving ? "جاري..." : "إغلاق الجلسة"}</Button>
      </div>
    </div>
  );
}

function Row({ label, v, positive }: { label: string; v: number; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${positive ? "text-emerald-600" : ""}`}>₪ {Number(v || 0).toFixed(2)}</span>
    </div>
  );
}