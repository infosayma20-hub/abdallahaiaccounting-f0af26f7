import { Link } from "react-router-dom";
import { Search, Receipt, User, Box, Truck } from "lucide-react";
import spartaIcon from "/sparta-icon-512.png?url";

const TILES = [
  { to: "/sparta/m/van", icon: Truck, label: "البائع المتجول", color: "#0EA371" },
  { to: "/sparta/m/stock", icon: Box, label: "استعلام مخزون", color: "#8B1E3F" },
  { to: "/sparta/m/sale", icon: Receipt, label: "فاتورة سريعة", color: "#D4A574" },
  { to: "/sparta/m/catalog", icon: Search, label: "الكتالوج", color: "#6B7280" },
  { to: "/sparta/m/customer", icon: User, label: "كشف زبون", color: "#5C1429" },
];

export default function SpartaMobileHome() {
  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "var(--gradient-sparta)", color: "white" }}>
      <header className="px-5 pt-8 pb-6 flex items-center gap-3">
        <img src={spartaIcon} alt="Sparta" width={48} height={48} className="rounded-lg bg-white/10 p-1.5" />
        <div>
          <div className="text-lg font-bold leading-tight">Sparta Trade</div>
          <div className="text-[11px] opacity-70">نسخة الموبايل · للمندوبين</div>
        </div>
      </header>

      <div className="flex-1 bg-background text-foreground rounded-t-3xl p-5 -mt-2">
        <div className="grid grid-cols-2 gap-3 mt-4">
          {TILES.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="aspect-square bg-card border rounded-2xl flex flex-col items-center justify-center gap-3 hover:shadow-md transition-shadow"
            >
              <div className="p-3 rounded-xl" style={{ background: `${t.color}15`, color: t.color }}>
                <t.icon className="h-7 w-7" />
              </div>
              <div className="text-sm font-semibold">{t.label}</div>
            </Link>
          ))}
        </div>

        <Link
          to="/sparta"
          className="mt-6 block text-center text-xs text-muted-foreground py-3 border rounded-lg"
        >
          الذهاب إلى لوحة سطح المكتب
        </Link>

        <div className="mt-8 text-center text-[10px] text-muted-foreground">
          ثبّت التطبيق على شاشتك الرئيسية من قائمة المتصفح
        </div>
      </div>
    </div>
  );
}