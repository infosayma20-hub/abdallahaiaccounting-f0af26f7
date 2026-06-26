import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Package, Boxes, FileText, Users, Smartphone, LogOut, Menu, X, CalendarClock, Activity, Sparkles, UserSquare2, FolderKanban, Calculator } from "lucide-react";
import spartaLogoAsset from "@/assets/sparta-logo.png.asset.json";

const NAV = [
  { to: "/sparta", label: "الرئيسية", icon: LayoutDashboard, end: true },
  { to: "/sparta/products", label: "المنتجات", icon: Package },
  { to: "/sparta/batches", label: "الدفعات (LOTs)", icon: CalendarClock },
  { to: "/sparta/inventory", label: "المخزون", icon: Boxes },
  { to: "/sparta/movements", label: "حركات الدفعات", icon: Activity },
  { to: "/sparta/invoices", label: "فواتير المبيعات", icon: FileText },
  { to: "/sparta/customers", label: "العملاء", icon: Users },
  { to: "/sparta/crm", label: "CRM — متابعة العملاء", icon: Sparkles },
  { to: "/sparta/hr", label: "الموارد البشرية", icon: UserSquare2 },
  { to: "/sparta/projects", label: "المشاريع", icon: FolderKanban },
  { to: "/sparta/accounting", label: "المحاسبة المالية", icon: Calculator },
  { to: "/sparta/m", label: "تطبيق الموبايل", icon: Smartphone },
];

export default function SpartaShell() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [userLabel, setUserLabel] = useState<string>("");
  const isMobileRoute = pathname.startsWith("/sparta/m");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserLabel((data.user?.user_metadata as any)?.full_name || data.user?.email || "");
    })();
  }, []);

  // Mobile PWA routes render full-bleed without desktop chrome
  if (isMobileRoute) {
    return (
      <div className="min-h-[100dvh] bg-background text-foreground">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground" style={{ fontFamily: "Cairo, Inter, sans-serif" }}>
      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 right-0 z-40 w-64 transform transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}
        style={{ background: "var(--gradient-sparta)", color: "hsl(45 33% 97%)" }}
      >
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <img src={spartaLogoAsset.url} alt="Sparta" width={44} height={44} className="rounded-md bg-white p-1 object-contain" />
          <div>
            <div className="font-bold text-lg leading-tight">Sparta Trade</div>
            <div className="text-[11px] opacity-70">زرعات الأسنان</div>
          </div>
        </div>
        <nav className="px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  isActive ? "bg-white/15 font-semibold" : "hover:bg-white/10 opacity-90"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 inset-x-0 px-3 py-3 border-t border-white/10">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/g/sparta";
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-white/10 opacity-90"
          >
            <LogOut className="h-4 w-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Backdrop */}
      {open && <div onClick={() => setOpen(false)} className="fixed inset-0 bg-black/40 z-30 lg:hidden" />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 px-4 border-b bg-card flex items-center justify-between">
          <button onClick={() => setOpen((v) => !v)} className="lg:hidden p-2 -mr-2 rounded-md hover:bg-muted">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="text-sm text-muted-foreground truncate">{userLabel}</div>
          <Link to="/sparta/m" className="text-xs px-3 py-1.5 rounded-md hover:bg-muted text-primary">
            النسخة المحمولة →
          </Link>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}