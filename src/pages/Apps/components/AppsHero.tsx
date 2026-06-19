import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, TrendingUp, Wallet, FileText } from "lucide-react";

/**
 * AppsHero — قسم البطل في صفحة /apps
 * تحية شخصية للمستخدم + 3 إحصائيات سريعة (اليوم).
 * تصميم: gradient نيفي خفيف، حواف ناعمة، مساحات تنفس.
 */
const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "صباح الخير";
  if (h < 17) return "مساء الخير";
  return "مساء النور";
};

const formatILS = (n: number) =>
  `₪${Math.round(n).toLocaleString("en-US")}`;

const todayRange = () => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
};

const StatChip = ({
  icon: Icon, label, value, color,
}: { icon: any; label: string; value: string; color: string }) => (
  <div
    className="flex items-center gap-3 px-4 py-3 rounded-xl flex-1 min-w-[160px]"
    style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
  >
    <div
      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ background: color }}
    >
      <Icon className="w-[18px] h-[18px] text-white" strokeWidth={2} />
    </div>
    <div className="min-w-0">
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.2 }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: 0, marginTop: 2, lineHeight: 1.2 }}>{value}</p>
    </div>
  </div>
);

const AppsHero = () => {
  const { user } = useAuth();
  const [name, setName] = useState<string>("");
  const [nameReady, setNameReady] = useState(false);
  const [stats, setStats] = useState({ sales: 0, receipts: 0, invoices: 0 });

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      // 1) Profile name
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, company_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const n = (prof as any)?.display_name || (prof as any)?.company_name || user.email?.split("@")[0] || "";
      setName(n.split(" ")[0] || n);
      setNameReady(true);

      // Today range — based on business date (invoice_date / transaction_date), local TZ
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const todayStr = `${yyyy}-${mm}-${dd}`;

      // 2) Sales invoices today (LIVE only — exclude void/cancelled/draft & credit notes)
      //    Amount converted to ILS using exchange_rate (defaults to 1 for ILS).
      const { data: invs } = await supabase
        .from("invoices")
        .select("total_amount, invoice_type, status, currency, exchange_rate, is_credit_note")
        .eq("user_id", dataOwnerId!)
        .eq("invoice_date", todayStr);

      const liveInvs = (invs || []).filter((i: any) => {
        const status = String(i.status || "").toLowerCase();
        if (["void", "voided", "cancelled", "canceled", "draft"].includes(status)) return false;
        if (i.is_credit_note) return false;
        return true;
      });

      const salesILS = liveInvs
        .filter((i: any) => i.invoice_type === "sale")
        .reduce((s: number, i: any) => {
          const rate = Number(i.exchange_rate) > 0 ? Number(i.exchange_rate) : 1;
          return s + Number(i.total_amount || 0) * rate;
        }, 0);

      const salesCount = liveInvs.filter((i: any) => i.invoice_type === "sale").length;

      // 3) Receipts today — money-in vouchers (live only)
      //    Includes formal receipts, POS cash sales, workshop receipts.
      const RECEIPT_TYPES = ["receipt", "sale_cash", "workshop_receipt"];
      const { data: receipts } = await supabase
        .from("transactions")
        .select("amount, currency, exchange_rate, transaction_type, is_deleted")
        .eq("user_id", dataOwnerId!)
        .in("transaction_type", RECEIPT_TYPES)
        .eq("transaction_date", todayStr);

      const receiptsTotal = (receipts || [])
        .filter((t: any) => !t.is_deleted)
        .reduce((s: number, t: any) => {
          const rate = Number(t.exchange_rate) > 0 ? Number(t.exchange_rate) : 1;
          return s + Number(t.amount || 0) * rate;
        }, 0);

      if (cancelled) return;
      setStats({ sales: salesILS, receipts: receiptsTotal, invoices: salesCount });
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return (
    <div
      className="relative overflow-hidden rounded-2xl mb-6"
      style={{
        background: "linear-gradient(135deg, #0D1B2E 0%, #1B3A5C 100%)",
        padding: "22px 24px",
        boxShadow: "0 4px 16px rgba(13,27,46,0.12)",
      }}
    >
      {/* Decorative glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: -60, left: -60, width: 220, height: 220, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(74,158,232,0.25) 0%, transparent 70%)",
        }}
      />
      <div className="relative flex flex-col md:flex-row md:items-center gap-5">
        {/* Greeting */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4" style={{ color: "#4A9EE8" }} strokeWidth={2.2} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>
              لوحة التطبيقات
            </span>
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#fff",
              margin: 0,
              lineHeight: 1.3,
              minHeight: 29,
            }}
          >
            {nameReady ? (
              <>{greeting()}{name ? `، ${name}` : ""} 👋</>
            ) : null}
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "4px 0 0 0" }}>
            كل ما تحتاجه لإدارة أعمالك — في مكان واحد
          </p>
        </div>

        {/* Quick stats */}
        <div className="flex flex-wrap gap-2.5 md:max-w-[640px]">
          <StatChip icon={TrendingUp} label="مبيعات اليوم" value={formatILS(stats.sales)} color="#10b981" />
          <StatChip icon={Wallet} label="مقبوضات اليوم" value={formatILS(stats.receipts)} color="#3b82f6" />
          <StatChip icon={FileText} label="فواتير اليوم" value={String(stats.invoices)} color="#f59e0b" />
        </div>
      </div>
    </div>
  );
};

export default AppsHero;
