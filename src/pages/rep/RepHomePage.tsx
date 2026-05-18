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
} from "lucide-react";
import RepHomeKPIHeader from "./components/RepHomeKPIHeader";

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
  const [repId, setRepId] = useState<string | null>(null);
  const [repUserId, setRepUserId] = useState<string | null>(null);
  const [cashBoxId, setCashBoxId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("sales_representatives")
        .select("id, user_id, full_name, cash_box_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (data?.full_name) setRepName(data.full_name);
      if (data?.id) setRepId(data.id);
      if (data?.user_id) setRepUserId(data.user_id);
      if (data?.cash_box_id) setCashBoxId(data.cash_box_id);
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
            <div className="text-[11px] text-white/60">
              {new Date().toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long" })}
            </div>
            <div className="text-sm font-semibold text-white/90 tabular-nums mt-0.5">
              {new Date().toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
        </div>
      </div>

      {/* KPIs الحية */}
      {repId && repUserId && (
        <RepHomeKPIHeader repId={repId} userId={repUserId} cashBoxId={cashBoxId} />
      )}

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
