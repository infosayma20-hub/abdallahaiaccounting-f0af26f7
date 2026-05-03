import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ShoppingCart, DollarSign, Package, Receipt, Plus, Loader2, PlayCircle, StopCircle, BarChart3, Tag } from "lucide-react";

export default function RepDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [openDay, setOpenDay] = useState<any>(null);
  const [stats, setStats] = useState({ count: 0, total: 0, cash: 0, discount: 0 });
  const [expenses, setExpenses] = useState(0);
  const [profit, setProfit] = useState<number | null>(null);
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: rep } = await (supabase as any)
      .from("sales_representatives")
      .select("id, user_id, default_warehouse_id")
      .eq("auth_user_id", user.id).maybeSingle();
    if (!rep) { setLoading(false); return; }

    const { data: day } = await (supabase as any)
      .from("van_sales_days")
      .select("*")
      .eq("sales_rep_id", rep.id)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1).maybeSingle();
    setOpenDay(day);

    if (day) {
      // المصدر الموحد: invoices مرتبطة بالمندوب صراحةً عبر salesperson_id
      // (invoices لا يحوي عمود is_deleted — لا تستخدمه)
      const { data: invs, error: invErr } = await (supabase as any)
        .from("invoices")
        .select("id, total_amount, subtotal, discount_amount, payment_method, status, is_voided")
        .eq("user_id", rep.user_id)
        .eq("salesperson_id", rep.id)
        .eq("is_voided", false)
        .not("status", "in", "(cancelled,void,reversed)")
        .gte("created_at", day.opened_at);
      if (invErr) console.error("[RepDashboard] invoices query error:", invErr);
      const list = (invs || []).filter((i: any) =>
        !Boolean(i.is_voided) && !["cancelled", "void", "reversed", "ملغي", "ملغى"].includes((i.status || "").toLowerCase())
      );
      setStats({
        count: list.length,
        // إجمالي المبيعات قبل الخصم (gross): subtotal أو total + discount عند غياب subtotal
        total: list.reduce((s: number, i: any) => {
          const sub = Number(i.subtotal || 0);
          const tot = Number(i.total_amount || 0);
          const disc = Number(i.discount_amount || 0);
          return s + (sub > 0 ? sub : tot + disc);
        }, 0),
        cash: list.filter((i: any) => i.payment_method === "cash").reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0),
        discount: list.reduce((s: number, i: any) => s + Number(i.discount_amount || 0), 0),
      });

      // مصاريف اليوم — payment_method='rep_expense' و notes يحوي rep_id
      const { data: txs } = await (supabase as any)
        .from("transactions")
        .select("amount, notes")
        .eq("user_id", rep.user_id)
        .eq("payment_method", "rep_expense")
        .eq("is_deleted", false)
        .gte("transaction_date", new Date(day.opened_at).toISOString().slice(0, 10));
      const myExp = ((txs as any[]) || []).filter((t) => {
        try { return JSON.parse(t.notes || "{}")?.rep_id === rep.id; } catch { return false; }
      });
      setExpenses(myExp.reduce((s, t) => s + Number(t.amount || 0), 0));

      // Phase 7: aggregate line_profit for the day's invoices
      if (list.length > 0) {
        const ids = list.map((i: any) => i.id);
        const { data: lines } = await (supabase as any)
          .from("invoice_items")
          .select("invoice_id, line_profit")
          .in("invoice_id", ids);
        const rows = lines || [];
        const hasAnyCost = rows.some((r: any) => r.line_profit != null);
        setProfit(hasAnyCost ? rows.reduce((s: number, r: any) => s + Number(r.line_profit || 0), 0) : null);
      } else {
        setProfit(0);
      }
    } else {
      setExpenses(0);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const openDayHandler = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const { data: rep } = await (supabase as any)
        .from("sales_representatives")
        .select("id, user_id, default_warehouse_id, full_name")
        .eq("auth_user_id", user.id).maybeSingle();
      if (!rep?.default_warehouse_id) {
        toast({ title: "لا يوجد مستودع مخصص", description: "تواصل مع الإدارة", variant: "destructive" });
        return;
      }
      const dayNumber = `VD-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${rep.id.slice(0,4)}`;
      const { error } = await (supabase as any).from("van_sales_days").insert({
        user_id: rep.user_id,
        sales_rep_id: rep.id,
        warehouse_id: rep.default_warehouse_id,
        day_number: dayNumber,
        day_date: new Date().toISOString().slice(0,10),
        status: "open",
        opened_at: new Date().toISOString(),
        opened_by: user.id,
        opening_cash: Number(openingCash) || 0,
        opening_currency: "ILS",
      });
      if (error) throw error;
      toast({ title: "تم فتح اليوم بنجاح" });
      await load();
    } catch (e: any) {
      toast({ title: "تعذّر فتح اليوم", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const closeDayHandler = async () => {
    if (!openDay) return;
    setBusy(true);
    try {
      const actual = Number(closingCash) || 0;
      const expected = Number(openDay.opening_cash || 0) + stats.cash - expenses;
      const variance = actual - expected;
      const { error } = await (supabase as any).from("van_sales_days").update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: user!.id,
        actual_cash_collected: actual,
        expected_cash: expected,
        cash_variance: variance,
        total_sales: stats.total,
        total_invoices: stats.count,
      }).eq("id", openDay.id);
      if (error) throw error;
      toast({ title: "تم إغلاق اليوم", description: `الفرق: ${variance.toFixed(2)}` });
      setClosingCash("");
      await load();
    } catch (e: any) {
      toast({ title: "تعذّر الإغلاق", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  if (!openDay) {
    return (
      <div className="p-4 space-y-4">
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <PlayCircle className="w-6 h-6 text-primary" />
            <h2 className="text-lg font-bold">ابدأ يوم عمل جديد</h2>
          </div>
          <p className="text-sm text-muted-foreground">أدخل رصيد العهدة الافتتاحية لبدء البيع.</p>
          <div className="space-y-2">
            <Label>رصيد العهدة الافتتاحي (₪)</Label>
            <Input type="number" inputMode="decimal" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
          </div>
          <Button className="w-full h-12 text-base" onClick={openDayHandler} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "فتح اليوم"}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {(() => {
        const opened = openDay.opened_at ? new Date(openDay.opened_at) : null;
        const isToday = opened ? opened.toDateString() === now.toDateString() : true;
        const isOld = opened ? !isToday : false;
        const cardTone = isOld
          ? "bg-amber-500/10 border-amber-500/30"
          : "bg-emerald-500/5 border-emerald-500/20";
        const badgeTone = isOld
          ? "bg-amber-500/15 text-amber-700"
          : "bg-emerald-500/15 text-emerald-700";
        const badgeLabel = isOld ? "🟡 وردية قديمة" : "🟢 مفتوح";
        let durationStr = "";
        if (opened) {
          const mins = Math.max(0, Math.floor((now.getTime() - opened.getTime()) / 60000));
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          durationStr = h > 0 ? `مفتوح منذ ${h} ساعة${m ? ` و ${m} دقيقة` : ""}` : `مفتوح منذ ${m} دقيقة`;
        }
        const arDays = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
        const dayName = opened ? arDays[opened.getDay()] : "";
        return (
      <Card className={`p-4 ${cardTone}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">يوم العمل</div>
            <div className="font-bold text-foreground">{openDay.day_number}</div>
            {opened && (
              <>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {dayName}، {opened.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </div>
                <div className="text-[11px] text-muted-foreground/80">
                  بدأت الساعة {opened.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true })}
                </div>
                <div className="text-[11px] font-medium text-foreground/80 mt-1">⏱ {durationStr}</div>
              </>
            )}
          </div>
          <div className={`text-xs px-2 py-1 rounded-full ${badgeTone}`}>{badgeLabel}</div>
        </div>
      </Card>
        );
      })()}

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 space-y-1"><Receipt className="w-5 h-5 text-primary" /><div className="text-2xl font-bold">{stats.count}</div><div className="text-xs text-muted-foreground">طلبات اليوم</div></Card>
        <Card className="p-4 space-y-1"><ShoppingCart className="w-5 h-5 text-primary" /><div className="text-2xl font-bold">{stats.total.toFixed(2)}</div><div className="text-xs text-muted-foreground">إجمالي المبيعات (₪)</div></Card>
        <Card className="p-4 space-y-1"><DollarSign className="w-5 h-5 text-primary" /><div className="text-2xl font-bold">{stats.cash.toFixed(2)}</div><div className="text-xs text-muted-foreground">الكاش المحصّل (₪)</div></Card>
        <Card className="p-4 space-y-1"><Receipt className="w-5 h-5 text-destructive" /><div className="text-2xl font-bold text-destructive">{expenses.toFixed(2)}</div><div className="text-xs text-muted-foreground">مصاريف اليوم (₪)</div></Card>
        <Card className="p-4 space-y-1 border-orange-200 dark:border-orange-900/40">
          <Tag className="w-5 h-5 text-orange-500" />
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {stats.discount.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">الخصم المسموح به (₪)</div>
        </Card>
        <Card className="p-4 space-y-1 col-span-2">
          <Package className="w-5 h-5 text-primary" />
          <div className="text-2xl font-bold">
            {profit == null ? "—" : (profit - stats.discount).toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">
            {profit == null ? "تكلفة غير محددة" : "الربح بعد الخصم (₪)"}
          </div>
          {profit != null && stats.discount > 0 && (
            <div className="text-[11px] text-muted-foreground pt-1">
              قبل الخصم: {profit.toFixed(2)} ₪ — الخصم: {stats.discount.toFixed(2)} ₪
            </div>
          )}
        </Card>
      </div>

      <Button className="w-full h-12 text-base" onClick={() => navigate("/rep/new-order")}>
        <Plus className="w-5 h-5 ml-2" /> طلب جديد
      </Button>

      <Button variant="outline" className="w-full h-11 text-sm" onClick={() => navigate("/rep/sales-by-supplier")}>
        <BarChart3 className="w-4 h-4 ml-2" /> تقرير المبيعات حسب المورد
      </Button>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2"><StopCircle className="w-5 h-5 text-destructive" /><h3 className="font-bold">إغلاق اليوم</h3></div>
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>عهدة افتتاحية: {Number(openDay.opening_cash || 0).toFixed(2)} ₪</div>
          <div>+ كاش مبيعات: {stats.cash.toFixed(2)} ₪</div>
          <div>− مصاريف: {expenses.toFixed(2)} ₪</div>
          <div className="font-bold text-foreground pt-1 border-t border-border">المتوقع: {(Number(openDay.opening_cash || 0) + stats.cash - expenses).toFixed(2)} ₪</div>
        </div>
        <div className="space-y-2">
          <Label>الكاش الفعلي معك الآن</Label>
          <Input type="number" inputMode="decimal" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} />
        </div>
        <Button variant="destructive" className="w-full h-11" onClick={closeDayHandler} disabled={busy || !closingCash}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "إغلاق اليوم"}
        </Button>
      </Card>
    </div>
  );
}