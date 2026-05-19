import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { Home, ShoppingCart, ClipboardList, DollarSign, LogOut, Receipt } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import RepOpenDayModal from "@/components/rep/RepOpenDayModal";

export default function RepLayout() {
  const navigate = useNavigate();
  const { user, signOut, loading } = useAuth();
  const [repName, setRepName] = useState<string>("");
  const [checking, setChecking] = useState(true);
  const [salesRepId, setSalesRepId] = useState<string | null>(null);
  const [repCashBoxId, setRepCashBoxId] = useState<string | null>(null);
  const [needsOpenDay, setNeedsOpenDay] = useState(false);
  const [openDayChecking, setOpenDayChecking] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    (async () => {
      const { data } = await (supabase as any)
        .from("sales_representatives")
        .select("id, full_name, is_active, cash_box_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!data || !data.is_active) {
        await signOut();
        navigate("/auth", { replace: true });
        return;
      }
      setRepName(data.full_name);
      setSalesRepId(data.id);
      setRepCashBoxId(data.cash_box_id || null);
      setChecking(false);

      // فحص يوم مفتوح
      const { data: openDay } = await (supabase as any)
        .from("van_sales_days")
        .select("id")
        .eq("sales_rep_id", data.id)
        .eq("status", "open")
        .maybeSingle();
      setNeedsOpenDay(!openDay);
      setOpenDayChecking(false);
    })();
  }, [user, loading]);

  if (loading || checking || openDayChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-[100dvh] flex flex-col bg-background">
      {salesRepId && (
        <RepOpenDayModal
          open={needsOpenDay}
          salesRepId={salesRepId}
          repCashBoxId={repCashBoxId}
          onOpened={() => setNeedsOpenDay(false)}
        />
      )}
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">المندوب</div>
          <div className="font-semibold text-foreground">{repName}</div>
        </div>
        <button
          onClick={async () => { await signOut(); navigate("/auth", { replace: true }); }}
          className="text-muted-foreground hover:text-destructive p-2"
          aria-label="خروج"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-30">
        <div className="grid grid-cols-5">
          <NavLink to="/rep" end className={({ isActive }) =>
            `flex flex-col items-center justify-center py-2.5 gap-1 ${isActive ? "text-primary" : "text-muted-foreground"}`
          }>
            <Home className="w-5 h-5" />
            <span className="text-xs">الرئيسية</span>
          </NavLink>
          <NavLink to="/rep/new-order" className={({ isActive }) =>
            `flex flex-col items-center justify-center py-2.5 gap-1 ${isActive ? "text-primary" : "text-muted-foreground"}`
          }>
            <ShoppingCart className="w-5 h-5" />
            <span className="text-xs">طلب جديد</span>
          </NavLink>
          <NavLink to="/rep/collect" className={({ isActive }) =>
            `flex flex-col items-center justify-center py-2.5 gap-1 ${isActive ? "text-primary" : "text-muted-foreground"}`
          }>
            <DollarSign className="w-5 h-5" />
            <span className="text-xs">تحصيل</span>
          </NavLink>
          <NavLink to="/rep/expense" className={({ isActive }) =>
            `flex flex-col items-center justify-center py-2.5 gap-1 ${isActive ? "text-primary" : "text-muted-foreground"}`
          }>
            <Receipt className="w-5 h-5" />
            <span className="text-xs">مصروف</span>
          </NavLink>
          <NavLink to="/rep/orders" className={({ isActive }) =>
            `flex flex-col items-center justify-center py-2.5 gap-1 ${isActive ? "text-primary" : "text-muted-foreground"}`
          }>
            <ClipboardList className="w-5 h-5" />
            <span className="text-xs">طلباتي</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
}