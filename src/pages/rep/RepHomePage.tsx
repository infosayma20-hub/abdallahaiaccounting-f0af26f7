import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompanyContext";
import {
  LayoutDashboard,
  FileText,
  Users,
  Undo2,
  Receipt,
  Wallet,
  ClipboardList,
  BarChart3,
  Settings,
  PlayCircle,
  AlertCircle,
} from "lucide-react";
interface Tile {
  label: string;
  path: string;
  icon: any;
  tone: string; // tailwind classes for icon bg + text
}

const TILES: Tile[] = [
  { label: "لوحة التحكم", path: "/rep/dashboard", icon: LayoutDashboard, tone: "from-emerald-500/20 to-emerald-500/5 text-emerald-400 ring-emerald-500/30" },
  { label: "فاتورة مبيعات", path: "/rep/new-order", icon: FileText, tone: "from-sky-500/20 to-sky-500/5 text-sky-400 ring-sky-500/30" },
  { label: "الزبائن", path: "/rep/customers", icon: Users, tone: "from-violet-500/20 to-violet-500/5 text-violet-400 ring-violet-500/30" },
  { label: "مردود مبيعات", path: "/rep/returns", icon: Undo2, tone: "from-rose-500/20 to-rose-500/5 text-rose-400 ring-rose-500/30" },
  { label: "سند قبض", path: "/rep/collect", icon: Receipt, tone: "from-teal-500/20 to-teal-500/5 text-teal-400 ring-teal-500/30" },
  { label: "سند صرف", path: "/rep/expense", icon: Wallet, tone: "from-amber-500/20 to-amber-500/5 text-amber-400 ring-amber-500/30" },
  { label: "طلبية مبيعات", path: "/rep/sales-order", icon: ClipboardList, tone: "from-indigo-500/20 to-indigo-500/5 text-indigo-400 ring-indigo-500/30" },
  { label: "تقارير", path: "/rep/reports", icon: BarChart3, tone: "from-cyan-500/20 to-cyan-500/5 text-cyan-400 ring-cyan-500/30" },
  { label: "إعدادات", path: "/rep/settings", icon: Settings, tone: "from-slate-500/20 to-slate-500/5 text-slate-300 ring-slate-500/30" },
];

export default function RepHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { company } = useCompany();
  const [repName, setRepName] = useState<string>("");
  const [hasOpenDay, setHasOpenDay] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: rep } = await (supabase as any)
        .from("sales_representatives")
        .select("id, full_name")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (rep?.full_name) setRepName(rep.full_name);
      if (rep?.id) {
        const { data: day } = await (supabase as any)
          .from("van_sales_days")
          .select("id")
          .eq("sales_rep_id", rep.id)
          .eq("status", "open")
          .maybeSingle();
        setHasOpenDay(!!day);
      }
    })();
  }, [user?.id]);

  return (
    <div dir="rtl" className="p-4 space-y-5">
      {/* Hero header */}
      <div className="rounded-2xl p-5 bg-gradient-to-br from-[#0D1B2E] via-[#13243d] to-[#0D1B2E] text-white shadow-lg ring-1 ring-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-white/60">مرحباً بك</div>
            <div className="text-lg font-bold mt-0.5 truncate">{repName || "—"}</div>
            {company?.name && (
              <div className="text-xs text-white/70 mt-1 truncate">{company.name}</div>
            )}
          </div>
          <div className="text-left shrink-0">
            {(() => {
              const days = ["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
              const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
              const d = new Date();
              return (
                <>
                  <div className="text-[11px] text-white/60">{days[d.getDay()]}</div>
                  <div className="text-sm font-semibold text-white/90 mt-0.5">
                    {d.getDate()} {months[d.getMonth()]} {d.getFullYear()}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Shift action — يبقى ظاهرًا دائمًا لتسهيل فتح/إدارة الوردية */}
      <button
        onClick={() => navigate("/rep/dashboard")}
        className="w-full rounded-2xl p-4 bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/25 flex items-center gap-3 text-right hover:scale-[1.01] active:scale-[0.99] transition-all"
      >
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <PlayCircle className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-foreground flex items-center gap-1.5">
            {hasOpenDay === false && <AlertCircle className="w-4 h-4 text-primary" />}
            {hasOpenDay === true ? "الوردية مفتوحة" : "ابدأ يوم عمل جديد"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {hasOpenDay === true ? "اضغط لعرض ملخص اليوم أو إغلاق الوردية" : "اضغط لفتح اليوم وإدخال قيمة العهدة الافتتاحية"}
          </div>
        </div>
      </button>

      {/* Tiles grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.path}
              onClick={() => navigate(t.path)}
              className={`group relative aspect-square rounded-2xl bg-gradient-to-br ${t.tone} ring-1 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 p-4 flex flex-col items-center justify-center gap-3 text-foreground shadow-sm`}
            >
              <div className="w-14 h-14 rounded-2xl bg-card/60 backdrop-blur flex items-center justify-center ring-1 ring-inset ring-border/40 group-hover:ring-current/40">
                <Icon className="w-7 h-7" strokeWidth={1.75} />
              </div>
              <div className="text-sm font-semibold text-foreground/90 text-center leading-tight">
                {t.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
