import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSpartaContext } from "@/hooks/sparta/useSpartaContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Truck, Receipt, HandCoins, DoorClosed, Banknote } from "lucide-react";
import { toast } from "sonner";

interface VanDay {
  id: string;
  sales_rep_id: string;
  day_date: string;
  status: string;
  opening_cash: number;
  total_sales_cash: number;
  total_sales_credit: number;
  total_collections: number;
  total_expenses: number;
  expected_cash: number;
}

interface Employee { id: string; full_name: string; }

export default function SpartaVanHome() {
  const { ownerUserId } = useSpartaContext();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedRep, setSelectedRep] = useState<string>("");
  const [day, setDay] = useState<VanDay | null>(null);
  const [opening, setOpening] = useState<string>("0");

  async function load() {
    setLoading(true);
    const { data: emps } = await (supabase as any)
      .from("sparta_employees")
      .select("id, full_name")
      .eq("status", "active")
      .order("full_name");
    setEmployees((emps as Employee[]) || []);
    const savedRep = localStorage.getItem("sparta_van_rep_id") || "";
    if (savedRep) {
      setSelectedRep(savedRep);
      await loadOpenDay(savedRep);
    }
    setLoading(false);
  }

  async function loadOpenDay(repId: string) {
    const { data } = await (supabase as any)
      .from("sparta_van_days")
      .select("*")
      .eq("sales_rep_id", repId)
      .eq("status", "open")
      .maybeSingle();
    setDay((data as VanDay) || null);
  }

  useEffect(() => { load(); }, []);

  async function openDay() {
    if (!selectedRep) return toast.error("اختر المندوب أولاً");
    localStorage.setItem("sparta_van_rep_id", selectedRep);
    const { data, error } = await (supabase as any).rpc("sparta_van_open_day", {
      _sales_rep_id: selectedRep,
      _opening_cash: Number(opening) || 0,
      _notes: null,
    });
    if (error) return toast.error(error.message);
    toast.success("تم فتح الجلسة");
    await loadOpenDay(selectedRep);
  }

  return (
    <div className="min-h-[100dvh] bg-background" dir="rtl">
      <header className="px-4 py-4 flex items-center gap-3 border-b" style={{ background: "var(--gradient-sparta)", color: "white" }}>
        <Link to="/sparta/m"><ArrowRight className="h-5 w-5 rotate-180" /></Link>
        <div className="flex-1 font-bold">البائع المتجول</div>
        <Truck className="h-5 w-5" />
      </header>

      <div className="p-4 max-w-md mx-auto space-y-4">
        {loading ? (
          <div className="text-center text-muted-foreground py-12">تحميل...</div>
        ) : !day ? (
          <div className="space-y-3 bg-card border rounded-2xl p-4">
            <div className="font-bold text-lg">فتح جلسة عمل</div>
            <div>
              <Label>المندوب</Label>
              <select
                value={selectedRep}
                onChange={(e) => { setSelectedRep(e.target.value); loadOpenDay(e.target.value); }}
                className="w-full mt-1 h-10 rounded-md border bg-background px-3"
              >
                <option value="">-- اختر --</option>
                {employees.map((e) => (<option key={e.id} value={e.id}>{e.full_name}</option>))}
              </select>
            </div>
            <div>
              <Label>رصيد افتتاحي (₪)</Label>
              <Input type="number" value={opening} onChange={(e) => setOpening(e.target.value)} />
            </div>
            <Button onClick={openDay} className="w-full" disabled={!selectedRep}>
              فتح الجلسة
            </Button>
          </div>
        ) : (
          <>
            <div className="bg-card border rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">جلسة اليوم</div>
                <div className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">مفتوحة</div>
              </div>
              <div className="text-xl font-bold">{day.day_date}</div>
              <div className="grid grid-cols-2 gap-3 pt-2 text-sm">
                <Stat label="مبيعات نقدية" value={day.total_sales_cash} />
                <Stat label="مبيعات آجلة" value={day.total_sales_credit} />
                <Stat label="تحصيلات" value={day.total_collections} />
                <Stat label="مصاريف" value={day.total_expenses} />
              </div>
              <div className="mt-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-between">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Banknote className="h-4 w-4" /> النقد المتوقع
                </div>
                <div className="font-bold text-lg text-emerald-700 dark:text-emerald-400">
                  ₪ {Number(day.expected_cash).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Tile to={`/sparta/m/van/sale?day=${day.id}`} icon={Receipt} label="فاتورة جديدة" color="#D4A574" />
              <Tile to={`/sparta/m/van/collect?day=${day.id}`} icon={HandCoins} label="تحصيل دين" color="#0EA371" />
              <Tile to={`/sparta/m/van/close?day=${day.id}`} icon={DoorClosed} label="إغلاق الجلسة" color="#8B1E3F" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/40 rounded-lg p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-bold tabular-nums">₪ {Number(value || 0).toFixed(2)}</div>
    </div>
  );
}

function Tile({ to, icon: Icon, label, color }: any) {
  return (
    <Link to={to} className="aspect-square bg-card border rounded-2xl flex flex-col items-center justify-center gap-2 hover:shadow-md">
      <div className="p-2.5 rounded-xl" style={{ background: `${color}15`, color }}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="text-xs font-semibold">{label}</div>
    </Link>
  );
}