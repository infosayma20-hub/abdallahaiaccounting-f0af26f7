import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSpartaContext } from "@/hooks/sparta/useSpartaContext";
import { Package, FileText, Users, AlertTriangle, TrendingUp, Boxes } from "lucide-react";

function StatCard({ icon: Icon, label, value, sub, accent }: any) {
  return (
    <div className="bg-card rounded-xl border p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-5 w-5" style={{ color: accent || "hsl(var(--primary))" }} />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function SpartaDashboard() {
  const { companyId, ownerUserId } = useSpartaContext();
  const [stats, setStats] = useState({ products: 0, customers: 0, invoices30d: 0, lowStock: 0, revenue30d: 0, ar: 0 });

  useEffect(() => {
    if (!companyId || !ownerUserId) return;
    (async () => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const sinceDate = since.toISOString().slice(0, 10);
      const [p, c, i, cust] = await Promise.all([
        supabase.from("products").select("id, quantity, min_quantity").eq("user_id", ownerUserId).limit(2000),
        supabase.from("sparta_customers").select("id, balance", { count: "exact", head: false }).eq("company_id", companyId).limit(2000),
        supabase.from("sparta_invoices").select("id, total").eq("company_id", companyId).eq("status", "posted").gte("invoice_date", sinceDate).limit(2000),
        supabase.from("sparta_customers").select("balance").eq("company_id", companyId).limit(2000),
      ]);
      const productsList = (p.data as any[]) || [];
      const low = productsList.filter((x) => Number(x.quantity || 0) <= Number(x.min_quantity || 0)).length;
      const invList = (i.data as any[]) || [];
      const revenue = invList.reduce((s, x) => s + Number(x.total || 0), 0);
      const ar = ((cust.data as any[]) || []).reduce((s, x) => s + Math.max(0, Number(x.balance || 0)), 0);
      setStats({
        products: productsList.length,
        customers: c.count || 0,
        invoices30d: invList.length,
        lowStock: low,
        revenue30d: revenue,
        ar,
      });
    })();
  }, [companyId, ownerUserId]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="rounded-2xl p-6 lg:p-8 text-white" style={{ background: "var(--gradient-sparta)" }}>
        <div className="text-sm opacity-80 mb-1">مرحباً بك في</div>
        <h1 className="text-2xl lg:text-3xl font-bold">Sparta Trade · زرعات الأسنان</h1>
        <p className="text-sm opacity-80 mt-2 max-w-xl">
          ابدأ من إدارة منتجاتك، تتبع المخزون والـ LOTs، واصدر الفواتير بعملة الشيكل (ILS).
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatCard icon={Package} label="المنتجات" value={stats.products} />
        <StatCard icon={Users} label="العملاء" value={stats.customers} />
        <StatCard icon={FileText} label="فواتير 30 يوم" value={stats.invoices30d} />
        <StatCard icon={TrendingUp} label="مبيعات 30 يوم" value={`₪ ${stats.revenue30d.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
        <StatCard icon={TrendingUp} label="ذمم مدينة" value={`₪ ${stats.ar.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} accent="hsl(35 90% 50%)" />
        <StatCard icon={AlertTriangle} label="مخزون منخفض" value={stats.lowStock} accent="hsl(0 70% 50%)" />
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { to: "/sparta/products", icon: Package, title: "المنتجات", desc: "إدارة الكتالوج، الفئات، والـ LOTs" },
          { to: "/sparta/inventory", icon: Boxes, title: "المخزون", desc: "حركات، تنبيهات صلاحية، مستودعات" },
          { to: "/sparta/invoices", icon: FileText, title: "فواتير المبيعات", desc: "فواتير الزرعات مع تتبع الدفعات والمدفوعات" },
          { to: "/sparta/customers", icon: Users, title: "العملاء", desc: "العيادات والأطباء وكشوف الحساب" },
        ].map((it) => (
          <Link key={it.to} to={it.to} className="bg-card border rounded-xl p-5 hover:shadow-md transition-shadow flex items-start gap-3">
            <div className="rounded-lg p-2.5" style={{ background: "hsl(var(--accent) / 0.2)", color: "hsl(var(--primary))" }}>
              <it.icon className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">{it.title}</div>
              <div className="text-xs text-muted-foreground mt-1">{it.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}