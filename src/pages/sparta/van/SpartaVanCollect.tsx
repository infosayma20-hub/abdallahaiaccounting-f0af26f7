import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowRight, HandCoins } from "lucide-react";
import { toast } from "sonner";

interface Customer { id: string; name: string; balance: number; }

export default function SpartaVanCollect() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const dayId = params.get("day") || "";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [custId, setCustId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "cheque" | "transfer">("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("sparta_customers")
        .select("id, name, balance")
        .gt("balance", 0)
        .order("balance", { ascending: false });
      setCustomers((data as Customer[]) || []);
    })();
  }, []);

  const sel = customers.find((c) => c.id === custId);

  async function save() {
    if (!dayId || !custId || !Number(amount)) return toast.error("بيانات ناقصة");
    setSaving(true);
    const { error } = await (supabase as any).rpc("sparta_van_collect_payment", {
      _van_day_id: dayId,
      _customer_id: custId,
      _amount: Number(amount),
      _method: method,
      _notes: notes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("تم التحصيل");
    nav(-1);
  }

  return (
    <div className="min-h-[100dvh] bg-background" dir="rtl">
      <header className="px-4 py-4 flex items-center gap-3 border-b" style={{ background: "var(--gradient-sparta)", color: "white" }}>
        <Link to="/sparta/m/van"><ArrowRight className="h-5 w-5 rotate-180" /></Link>
        <div className="flex-1 font-bold">تحصيل دين</div>
        <HandCoins className="h-5 w-5" />
      </header>
      <div className="p-4 max-w-md mx-auto space-y-4">
        <div>
          <Label>الزبون</Label>
          <select value={custId} onChange={(e) => setCustId(e.target.value)} className="w-full mt-1 h-10 rounded-md border bg-background px-3">
            <option value="">-- اختر --</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name} · مدين ₪{Number(c.balance).toFixed(2)}</option>
            ))}
          </select>
          {sel && (
            <div className="mt-2 text-xs text-muted-foreground">
              الرصيد الحالي: <span className="font-bold text-destructive">₪ {Number(sel.balance).toFixed(2)}</span>
            </div>
          )}
        </div>
        <div>
          <Label>المبلغ (₪)</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {sel && (
            <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => setAmount(String(sel.balance))}>
              تحصيل كامل المبلغ
            </Button>
          )}
        </div>
        <div>
          <Label>طريقة الدفع</Label>
          <div className="grid grid-cols-3 gap-2 mt-1">
            <Button variant={method === "cash" ? "default" : "outline"} onClick={() => setMethod("cash")}>نقدي</Button>
            <Button variant={method === "cheque" ? "default" : "outline"} onClick={() => setMethod("cheque")}>شيك</Button>
            <Button variant={method === "transfer" ? "default" : "outline"} onClick={() => setMethod("transfer")}>تحويل</Button>
          </div>
        </div>
        <div>
          <Label>ملاحظات</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button onClick={save} disabled={saving} className="w-full">{saving ? "جاري..." : "تأكيد التحصيل"}</Button>
      </div>
    </div>
  );
}