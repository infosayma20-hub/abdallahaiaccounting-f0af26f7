import { useState } from "react";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Factory, TrendingUp } from "lucide-react";

interface CostItem {
  label: string;
  amount: number;
}

interface Props {
  order: {
    id: string;
    order_number: string | null;
    customer_name: string;
    total: number;
    production_cost?: number;
    cost_breakdown?: CostItem[];
  };
  userId: string;
  onSuccess: () => void;
}

export default function ProductionCostSection({ order, userId, onSuccess }: Props) {
  const [recording, setRecording] = useState(false);

  const productionCost = Number(order.production_cost || 0);
  const costBreakdown = (order.cost_breakdown as CostItem[]) || [];
  const margin = Number(order.total) - productionCost;
  const marginPct = order.total > 0 ? ((margin / Number(order.total)) * 100).toFixed(0) : "0";

  if (productionCost <= 0) return null;

  const handleRecordCOGS = async () => {
    setRecording(true);
    try {
      const txDate = new Date().toISOString().split("T")[0];
      await supabase.from("transactions").insert({
        user_id: dataOwnerId!,
        transaction_date: txDate,
        description: `تكلفة البضاعة المباعة - ${order.customer_name} (${order.order_number || ""})`,
        debit_account_code: "5100",
        credit_account_code: "1140",
        amount: productionCost,
        currency: "شيكل",
        transaction_type: "cogs",
        reference: `COGS-ORD-${order.id.slice(0, 8)}`,
        idempotency_key: `COGS-ORDER-${order.id}`,
      } as any);

      toast.success("تم تسجيل قيد تكلفة البضاعة المباعة ✅");
      onSuccess();
    } catch (err: any) {
      toast.error("خطأ: " + err.message);
    } finally {
      setRecording(false);
    }
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-3">
      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Factory className="h-4 w-4 text-amber-600" />
        تكاليف الإنتاج — للمحاسب فقط
      </h4>

      {/* Cost breakdown */}
      {costBreakdown.length > 0 && (
        <div className="space-y-1">
          {costBreakdown.map((item, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{item.label}:</span>
              <span className="tabular-nums">{Number(item.amount).toLocaleString()} ₪</span>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-amber-200 dark:border-amber-800 pt-2 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">إجمالي التكلفة</span>
          <span className="font-bold text-destructive">{productionCost.toLocaleString()} ₪</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">سعر البيع</span>
          <span className="font-bold">{Number(order.total).toLocaleString()} ₪</span>
        </div>
        <div className="flex justify-between text-sm font-bold">
          <span className="flex items-center gap-1 text-primary">
            <TrendingUp className="h-3 w-3" /> هامش الربح
          </span>
          <span className="text-primary">{margin.toLocaleString()} ₪ ({marginPct}%)</span>
        </div>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="w-full gap-2 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400"
        onClick={handleRecordCOGS}
        disabled={recording}
      >
        <Factory className="h-3.5 w-3.5" />
        {recording ? "جاري التسجيل..." : "تسجيل قيد تكلفة البضاعة المباعة"}
      </Button>
    </div>
  );
}
