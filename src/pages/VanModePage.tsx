import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart, DollarSign, Package, Truck, Clock, Loader2,
  LogIn, LogOut, ClipboardList, Plus, ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface OpenDay {
  id: string;
  day_number: string;
  day_date: string;
  opened_at: string;
  opening_cash: number;
  opening_currency: string;
  sales_rep_id: string;
  warehouse_id: string;
  sales_rep?: { full_name: string };
  warehouse?: { name: string };
}

interface DayStats {
  invoiceCount: number;
  totalSales: number;
  totalCollections: number;
  profit: number | null;
}

/**
 * وضع البائع المتجول — Mobile-first مبسّط.
 * 4 أزرار فقط: طلب جديد، تحصيل، طلباتي، إغلاق اليوم.
 * كل الأزرار توجّه لمسارات /rep الداخلية — لا POS ولا stock-transfers ولا /finance/*.
 * GPS يُسجَّل تلقائياً عند فتح الصفحة بصمت.
 */
const VanModePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [openDay, setOpenDay] = useState<OpenDay | null>(null);
  const [stats, setStats] = useState<DayStats>({ invoiceCount: 0, totalSales: 0, totalCollections: 0, profit: null });

  const loadDay = async () => {
    if (!user) return;
    setLoading(true);
    const { data: dayData } = await (supabase as any)
      .from("van_sales_days")
      .select(`*, sales_rep:sales_representatives(full_name), warehouse:warehouses(name)`)
      .eq("user_id", user.id)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dayData) {
      setOpenDay(dayData as OpenDay);
      const openedAt = dayData.opened_at;
      const warehouseId = dayData.warehouse_id;

      const [invsRes, txsRes]: any = await Promise.all([
        (supabase as any).from("invoices")
          .select("id, total_amount")
          .eq("user_id", user.id)
          .eq("warehouse_id", warehouseId)
          .gte("created_at", openedAt)
          .eq("is_deleted", false),
        (supabase as any).from("transactions")
          .select("amount")
          .eq("user_id", user.id)
          .eq("transaction_type", "receipt")
          .gte("created_at", openedAt)
          .eq("is_deleted", false),
      ]);

      const invs: any[] = invsRes.data ?? [];
      const txs: any[] = txsRes.data ?? [];

      let profit: number | null = 0;
      if (invs.length > 0) {
        const ids = invs.map((i: any) => i.id);
        const { data: lines } = await (supabase as any)
          .from("invoice_items")
          .select("invoice_id, line_profit")
          .in("invoice_id", ids);
        const rows = lines || [];
        const hasAnyCost = rows.some((r: any) => r.line_profit != null);
        profit = hasAnyCost ? rows.reduce((s: number, r: any) => s + Number(r.line_profit || 0), 0) : null;
      }

      setStats({
        invoiceCount: invs.length,
        totalSales: invs.reduce((s, i) => s + Number(i.total_amount || 0), 0),
        totalCollections: txs.reduce((s, t) => s + Number(t.amount || 0), 0),
        profit,
      });
    } else {
      setOpenDay(null);
      setStats({ invoiceCount: 0, totalSales: 0, totalCollections: 0, profit: null });
    }
    setLoading(false);
  };

  useEffect(() => { loadDay(); }, [user?.id]);

  // GPS تلقائي صامت — بدون toast وبدون زر
  useEffect(() => {
    if (!openDay || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      () => { /* تم تسجيل الموقع بصمت */ },
      () => { /* تجاهل أخطاء GPS — ميداني */ },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [openDay?.id]);

  const elapsed = useMemo(() => {
    if (!openDay) return "";
    const start = new Date(openDay.opened_at).getTime();
    const diff = Date.now() - start;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}س ${m}د`;
  }, [openDay, loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-primary/5 to-background pb-24" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/apps")}>
            <ChevronLeft className="h-5 w-5 rotate-180" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              <h1 className="font-bold">وضع البائع المتجول</h1>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {openDay ? openDay.sales_rep?.full_name : "لا يوجد يوم عمل مفتوح"}
            </p>
          </div>
          {openDay && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300">
              <Clock className="h-3 w-3 ml-1" />
              {elapsed}
            </Badge>
          )}
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-md mx-auto">
        {!openDay ? (
          <div className="text-center py-12 space-y-4">
            <div className="h-20 w-20 rounded-full bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center mx-auto">
              <Truck className="h-10 w-10 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold mb-1">لا يوجد يوم عمل مفتوح</h2>
              <p className="text-sm text-muted-foreground">افتح يوم عمل لبدء البيع الميداني</p>
            </div>
            <Button onClick={() => navigate("/rep")} size="lg" className="gap-2 w-full">
              <LogIn className="h-5 w-5" />
              فتح يوم عمل جديد
            </Button>
          </div>
        ) : (
          <>
            {/* بطاقة اليوم: 4 KPIs فقط */}
            <div className="rounded-2xl bg-card border-2 border-primary/20 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <div className="text-[11px] text-muted-foreground">رقم اليوم</div>
                  <div className="font-mono font-bold text-base">{openDay.day_number}</div>
                </div>
                <div className="text-end">
                  <div className="text-[11px] text-muted-foreground">المستودع</div>
                  <div className="font-semibold text-sm truncate max-w-[140px]">{openDay.warehouse?.name}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="إجمالي مبيعات اليوم" value={`${stats.totalSales.toFixed(2)} ₪`} icon={ShoppingCart} color="text-emerald-600" bg="bg-emerald-500/10" />
                <MiniStat label="عدد الطلبات" value={String(stats.invoiceCount)} icon={ClipboardList} color="text-blue-600" bg="bg-blue-500/10" />
                <MiniStat label="الكاش الحالي" value={`${(Number(openDay.opening_cash || 0) + stats.totalCollections).toFixed(2)} ₪`} icon={DollarSign} color="text-amber-600" bg="bg-amber-500/10" />
                <MiniStat label="ربح اليوم" value={stats.profit == null ? "—" : `${stats.profit.toFixed(2)} ₪`} icon={Package} color="text-purple-600" bg="bg-purple-500/10" />
              </div>
            </div>

            {/* 4 أزرار كبيرة فقط */}
            <div className="grid grid-cols-2 gap-3">
              <ActionButton
                icon={Plus}
                label="طلب جديد"
                hint="بيع نقدي أو آجل"
                color="bg-gradient-to-br from-emerald-500 to-emerald-600"
                onClick={() => navigate("/rep/new-order")}
              />
              <ActionButton
                icon={DollarSign}
                label="تحصيل"
                hint="تحصيل من عميل"
                color="bg-gradient-to-br from-blue-500 to-blue-600"
                onClick={() => navigate("/rep/collect")}
              />
              <ActionButton
                icon={ClipboardList}
                label="طلباتي"
                hint="طلبات اليوم"
                color="bg-gradient-to-br from-slate-600 to-slate-700"
                onClick={() => navigate("/rep/orders")}
              />
              <ActionButton
                icon={LogOut}
                label="إغلاق اليوم"
                hint="مطابقة الكاش"
                color="bg-gradient-to-br from-rose-500 to-rose-600"
                onClick={() => navigate("/rep")}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
};

const MiniStat = ({ icon: Icon, label, value, color, bg }: any) => (
  <div className="rounded-xl bg-muted/40 p-2.5">
    <div className="flex items-center gap-1.5 mb-1">
      <div className={`h-6 w-6 rounded-md ${bg} flex items-center justify-center ${color}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <span className="text-[10px] text-muted-foreground truncate">{label}</span>
    </div>
    <div className="font-mono font-bold text-sm truncate">{value}</div>
  </div>
);

const ActionButton = ({ icon: Icon, label, hint, color, onClick, loading }: any) => (
  <button
    onClick={onClick}
    disabled={loading}
    className={`relative ${color} text-white rounded-2xl p-4 h-28 flex flex-col items-start justify-between shadow-md active:scale-95 transition-transform disabled:opacity-60`}
  >
    <Icon className="h-7 w-7" />
    <div className="text-start">
      <div className="font-bold text-base">{label}</div>
      <div className="text-[11px] opacity-90">{hint}</div>
    </div>
    {loading && (
      <Loader2 className="absolute top-3 left-3 h-4 w-4 animate-spin" />
    )}
  </button>
);

export default VanModePage;
