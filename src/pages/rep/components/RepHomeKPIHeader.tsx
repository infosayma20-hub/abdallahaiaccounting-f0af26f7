import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Banknote, Lock, Loader2 } from "lucide-react";

interface Props {
  repId: string;
  userId: string;
  cashBoxId?: string | null;
}

interface KPIs {
  invoiceCount: number;
  invoiceTotal: number;
  collectionAmount: number;
  repBalance: number;
}

const fmt = (n: number) =>
  `₪${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function RepHomeKPIHeader({ repId, userId, cashBoxId }: Props) {
  const [kpis, setKpis] = useState<KPIs>({ invoiceCount: 0, invoiceTotal: 0, collectionAmount: 0, repBalance: 0 });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const isoStart = todayStart.toISOString();

      // 1) الحساب المرتبط بصندوق المندوب
      let cashAccountCode: string | null = null;
      if (cashBoxId) {
        const { data: cb } = await (supabase as any)
          .from("cash_boxes")
          .select("gl_account_code")
          .eq("id", cashBoxId)
          .maybeSingle();
        cashAccountCode = cb?.gl_account_code || null;
      }

      // 2) فواتير اليوم
      const { data: invs } = await (supabase as any)
        .from("invoices")
        .select("id, subtotal, total_amount, discount_amount, status, is_voided")
        .eq("user_id", userId)
        .eq("salesperson_id", repId)
        .eq("is_voided", false)
        .gte("created_at", isoStart);
      const list = (invs || []).filter(
        (i: any) => !["cancelled", "void", "reversed", "ملغي", "ملغى"].includes((i.status || "").toLowerCase())
      );
      const invoiceCount = list.length;
      const invoiceTotal = list.reduce((s: number, i: any) => {
        const sub = Number(i.subtotal || 0);
        const tot = Number(i.total_amount || 0);
        const disc = Number(i.discount_amount || 0);
        return s + (sub > 0 ? sub : tot + disc);
      }, 0);

      // 3) تحصيلات نقدية اليوم + رصيد العهدة الحالي
      let collectionAmount = 0;
      let repBalance = 0;
      if (cashAccountCode) {
        // تحصيلات اليوم: مدين على حساب الصندوق ضد ذمم 113x
        const { data: today } = await (supabase as any)
          .from("transactions")
          .select("amount, credit_account_code, transaction_type, reversed_by_id")
          .eq("user_id", userId)
          .eq("is_deleted", false)
          .eq("debit_account_code", cashAccountCode)
          .gte("created_at", isoStart);
        collectionAmount = ((today as any[]) || [])
          .filter((t) => !t.reversed_by_id && t.transaction_type !== "reversal")
          .filter((t) => {
            const cc = String(t.credit_account_code || "");
            return cc === "1130" || cc.startsWith("113");
          })
          .reduce((s, t) => s + Number(t.amount || 0), 0);

        // رصيد العهدة الحالي: مدين - دائن لحساب الصندوق
        const { data: all } = await (supabase as any)
          .from("transactions")
          .select("amount, debit_account_code, credit_account_code, transaction_type, reversed_by_id")
          .eq("user_id", userId)
          .eq("is_deleted", false)
          .or(`debit_account_code.eq.${cashAccountCode},credit_account_code.eq.${cashAccountCode}`);
        repBalance = ((all as any[]) || [])
          .filter((t) => !t.reversed_by_id && t.transaction_type !== "reversal")
          .reduce((s, t) => {
            const a = Number(t.amount || 0);
            if (t.debit_account_code === cashAccountCode) return s + a;
            if (t.credit_account_code === cashAccountCode) return s - a;
            return s;
          }, 0);
      }

      setKpis({ invoiceCount, invoiceTotal, collectionAmount, repBalance });
    } catch (e) {
      console.error("[RepHomeKPIHeader] load error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!repId || !userId) return;
    load();
    const channel = supabase
      .channel(`rep-kpi-${repId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `salesperson_id=eq.${repId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `sales_rep_id=eq.${repId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repId, userId, cashBoxId]);

  const items = [
    {
      label: "فواتير اليوم",
      Icon: FileText,
      value: String(kpis.invoiceCount),
      sub: fmt(kpis.invoiceTotal),
      tone: "text-sky-300",
      bg: "bg-sky-500/15",
    },
    {
      label: "تحصيلات اليوم",
      Icon: Banknote,
      value: fmt(kpis.collectionAmount),
      sub: "نقدي",
      tone: "text-emerald-300",
      bg: "bg-emerald-500/15",
    },
    {
      label: "رصيد العهدة",
      Icon: Lock,
      value: "•••",
      sub: "عدّ النقد عند الإغلاق",
      tone: "text-white/70",
      bg: "bg-white/10",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 rounded-2xl p-3 bg-gradient-to-br from-[#0D1B2E] via-[#13243d] to-[#0D1B2E] ring-1 ring-white/10 shadow-lg">
      {items.map(({ label, Icon, value, sub, tone, bg }) => (
        <div key={label} className="rounded-xl bg-white/5 ring-1 ring-white/10 p-2.5 flex flex-col items-center text-center">
          <div className={`w-9 h-9 rounded-xl ${bg} ${tone} flex items-center justify-center mb-1.5`}>
            <Icon className="w-4.5 h-4.5" strokeWidth={2} />
          </div>
          <div className="text-[10px] text-white/60 leading-tight">{label}</div>
          <div className={`text-sm font-bold mt-0.5 ${tone} leading-tight tabular-nums`}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : value}
          </div>
          <div className="text-[10px] text-white/50 mt-0.5">{sub}</div>
        </div>
      ))}
    </div>
  );
}