import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart, DollarSign, Package, MapPin, Truck, Clock, Calendar,
  TrendingUp, AlertCircle, ChevronLeft, Loader2, LogIn, LogOut, Receipt,
  CheckCircle2, Plus,
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
  productCount: number;
}

const VanModePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [openDay, setOpenDay] = useState<OpenDay | null>(null);
  const [stats, setStats] = useState<DayStats>({ invoiceCount: 0, totalSales: 0, totalCollections: 0, productCount: 0 });
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);

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

      const invsRes: any = await (supabase as any).from("invoices")
        .select("total_amount")
        .eq("user_id", user.id)
        .eq("warehouse_id", warehouseId)
        .gte("created_at", openedAt)
        .eq("is_deleted", false);
      const txsRes: any = await (supabase as any).from("transactions")
        .select("amount")
        .eq("user_id", user.id)
        .eq("transaction_type", "receipt")
        .gte("created_at", openedAt)
        .eq("is_deleted", false);
      const stockRes: any = await (supabase as any).from("product_warehouse_stock")
        .select("product_id, quantity")
        .eq("warehouse_id", warehouseId)
        .gt("quantity", 0);

      const invs: any[] = invsRes.data ?? [];
      const txs: any[] = txsRes.data ?? [];
      const stockRows: any[] = stockRes.data ?? [];

      setStats({
        invoiceCount: invs.length,
        totalSales: invs.reduce((s, i) => s + Number(i.total_amount || 0), 0),
        totalCollections: txs.reduce((s, t) => s + Number(t.amount || 0), 0),
        productCount: stockRows.length,
      });
    } else {
      setOpenDay(null);
      setStats({ invoiceCount: 0, totalSales: 0, totalCollections: 0, productCount: 0 });
    }
    setLoading(false);
  };

  useEffect(() => { loadDay(); }, [user?.id]);

  const captureGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus("error");
      toast({ title: "هذا الجهاز لا يدعم الموقع", variant: "destructive" });
      return;
    }
    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus("ok");
        toast({ title: "تم تسجيل موقعك", description: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}` });
      },
      err => {
        setGpsStatus("error");
        toast({ title: "تعذر جلب الموقع", description: err.message, variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

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
          /* No open day → call-to-action */
          <div className="text-center py-12 space-y-4">
            <div className="h-20 w-20 rounded-full bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center mx-auto">
              <AlertCircle className="h-10 w-10 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold mb-1">لا يوجد يوم عمل مفتوح</h2>
              <p className="text-sm text-muted-foreground">افتح يوم عمل لبدء البيع الميداني</p>
            </div>
            <Button onClick={() => navigate("/van-days")} size="lg" className="gap-2 w-full">
              <LogIn className="h-5 w-5" />
              فتح يوم عمل جديد
            </Button>
          </div>
        ) : (
          <>
            {/* Day Card */}
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
                <MiniStat label="عدد الفواتير" value={String(stats.invoiceCount)} icon={Receipt} color="text-blue-600" bg="bg-blue-500/10" />
                <MiniStat label="إجمالي المبيعات" value={stats.totalSales.toFixed(2)} icon={TrendingUp} color="text-emerald-600" bg="bg-emerald-500/10" />
                <MiniStat label="التحصيلات" value={stats.totalCollections.toFixed(2)} icon={DollarSign} color="text-amber-600" bg="bg-amber-500/10" />
                <MiniStat label="أصناف بالسيارة" value={String(stats.productCount)} icon={Package} color="text-purple-600" bg="bg-purple-500/10" />
              </div>

              <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
                <span className="text-muted-foreground">نقدية ابتدائية</span>
                <span className="font-mono font-bold">{openDay.opening_cash.toFixed(2)} {openDay.opening_currency}</span>
              </div>
            </div>

            {/* Big Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <ActionButton
                icon={ShoppingCart}
                label="بيع سريع"
                hint="فتح نقطة البيع"
                color="bg-gradient-to-br from-emerald-500 to-emerald-600"
                onClick={() => navigate("/pos")}
              />
              <ActionButton
                icon={DollarSign}
                label="تحصيل"
                hint="سند قبض جديد"
                color="bg-gradient-to-br from-blue-500 to-blue-600"
                onClick={() => navigate("/finance/receipts/new")}
              />
              <ActionButton
                icon={Package}
                label="جرد السيارة"
                hint="أصناف وأرصدة"
                color="bg-gradient-to-br from-purple-500 to-purple-600"
                onClick={() => navigate(`/stock-transfers?warehouse=${openDay.warehouse_id}`)}
              />
              <ActionButton
                icon={MapPin}
                label="موقعي"
                hint={gpsStatus === "ok" && gpsCoords ? "تم التسجيل ✓" : "تسجيل GPS"}
                color={gpsStatus === "ok" ? "bg-gradient-to-br from-teal-500 to-teal-600" : "bg-gradient-to-br from-amber-500 to-amber-600"}
                onClick={captureGps}
                loading={gpsStatus === "loading"}
              />
            </div>

            {/* Secondary Actions */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start h-12 gap-3"
                onClick={() => navigate("/invoices?type=sales")}
              >
                <Receipt className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 text-start">فواتير اليوم</span>
                <Badge variant="secondary">{stats.invoiceCount}</Badge>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start h-12 gap-3"
                onClick={() => navigate(`/contacts?type=customer`)}
              >
                <Plus className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 text-start">إضافة عميل سريع</span>
                <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180" />
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start h-12 gap-3"
                onClick={() => navigate("/van-days")}
              >
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 text-start">سجل أيام العمل</span>
                <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180" />
              </Button>
            </div>

            {/* Close Day */}
            <div className="pt-2">
              <Button
                variant="destructive"
                size="lg"
                className="w-full gap-2 h-14 text-base"
                onClick={() => navigate("/van-days")}
              >
                <LogOut className="h-5 w-5" />
                إغلاق يوم العمل ومطابقة الكاش
              </Button>
              <p className="text-[11px] text-center text-muted-foreground mt-2">
                ⚠️ سيقوم النظام بحساب المبيعات والتحصيلات ومقارنتها بالنقدية الفعلية
              </p>
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
