import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { TrendingUp, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

type CF = {
  period_from: string; period_to: string;
  opening_cash: number; operating_activities: number;
  investing_activities: number; financing_activities: number;
  net_change: number; closing_cash: number;
};

export default function SpartaCashFlowPage() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [data, setData] = useState<CF | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    const { data: res, error } = await supabase.rpc("sparta_cash_flow_statement" as any, { p_from: from, p_to: to });
    setLoading(false);
    if (error) toast.error(error.message); else setData(res as any);
  };

  const fmt = (n: number) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="h-6 w-6" /> قائمة التدفقات النقدية</h1>
          <p className="text-sm text-muted-foreground mt-1">حركة النقد التشغيلية والاستثمارية والتمويلية.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded px-2 py-1" />
          <span>إلى</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded px-2 py-1" />
          <Button onClick={generate} disabled={loading}>توليد</Button>
        </div>
      </div>

      {data && (
        <div className="bg-card border rounded-lg p-6 max-w-3xl mx-auto space-y-4">
          <div className="text-center pb-4 border-b">
            <div className="text-lg font-bold">قائمة التدفقات النقدية</div>
            <div className="text-sm text-muted-foreground">من {data.period_from} إلى {data.period_to}</div>
          </div>

          <div className="flex justify-between py-2 border-b">
            <span>رصيد النقد الافتتاحي</span>
            <span className="font-mono font-bold">{fmt(data.opening_cash)}</span>
          </div>

          <div>
            <div className="flex justify-between py-2">
              <span className="font-bold flex items-center gap-2"><ArrowDownCircle className="h-4 w-4 text-blue-500" /> الأنشطة التشغيلية</span>
              <span className={`font-mono font-bold ${data.operating_activities >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {fmt(data.operating_activities)}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="font-bold flex items-center gap-2"><ArrowDownCircle className="h-4 w-4 text-amber-500" /> الأنشطة الاستثمارية</span>
              <span className={`font-mono font-bold ${data.investing_activities >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {fmt(data.investing_activities)}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="font-bold flex items-center gap-2"><ArrowDownCircle className="h-4 w-4 text-purple-500" /> الأنشطة التمويلية</span>
              <span className={`font-mono font-bold ${data.financing_activities >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {fmt(data.financing_activities)}
              </span>
            </div>
          </div>

          <div className="flex justify-between py-2 border-b text-lg">
            <span className="font-bold">صافي التغير في النقد</span>
            <span className={`font-mono font-bold ${data.net_change >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmt(data.net_change)}</span>
          </div>

          <div className="flex justify-between py-3 bg-primary/10 px-3 rounded text-xl">
            <span className="font-bold flex items-center gap-2"><ArrowUpCircle className="h-5 w-5" /> رصيد النقد الختامي</span>
            <span className="font-mono font-bold">{fmt(data.closing_cash)}</span>
          </div>
        </div>
      )}

      {!data && <div className="text-center text-muted-foreground py-12">اضغط "توليد" لعرض قائمة التدفقات النقدية</div>}
    </div>
  );
}