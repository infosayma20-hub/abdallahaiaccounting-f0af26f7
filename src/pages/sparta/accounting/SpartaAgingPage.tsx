import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SPARTA_HOLDING_ID } from "@/lib/sparta-constants";
import { RefreshCw } from "lucide-react";

type Row = {
  customer_id?: string; customer_name?: string;
  supplier_id?: string;
  invoice_id?: string; bill_id?: string;
  invoice_number?: string; bill_number?: string;
  invoice_date?: string; bill_date?: string;
  due_date: string | null; total: number; paid_amount: number; balance_due: number;
  days_overdue: number; aging_bucket: "0-30" | "31-60" | "61-90" | "90+";
};

const BUCKETS: Row["aging_bucket"][] = ["0-30", "31-60", "61-90", "90+"];
const BUCKET_CLS: Record<string, string> = { "0-30": "bg-emerald-100 text-emerald-800", "31-60": "bg-amber-100 text-amber-800", "61-90": "bg-orange-100 text-orange-800", "90+": "bg-red-100 text-red-800" };

export default function SpartaAgingPage({ mode }: { mode: "ar" | "ap" }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const isAR = mode === "ar";

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from((isAR ? "sparta_ar_aging" : "sparta_ap_aging") as any).select("*").eq("company_id", SPARTA_HOLDING_ID);
    if (!error) setRows((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [mode]);

  const totals = BUCKETS.map(b => ({ bucket: b, sum: rows.filter(r => r.aging_bucket === b).reduce((s, r) => s + Number(r.balance_due), 0) }));
  const grand = totals.reduce((s, t) => s + t.sum, 0);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isAR ? "أعمار الذمم المدينة (عملاء)" : "أعمار الذمم الدائنة (موردين)"}</h1>
        <button onClick={load} className="p-2 rounded border"><RefreshCw className="h-4 w-4" /></button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {totals.map(t => (
          <div key={t.bucket} className={`rounded-lg p-3 ${BUCKET_CLS[t.bucket]}`}>
            <div className="text-xs opacity-80">{t.bucket} يوم</div>
            <div className="font-mono text-xl mt-1">{t.sum.toFixed(2)}</div>
          </div>
        ))}
        <div className="rounded-lg p-3 bg-primary text-primary-foreground">
          <div className="text-xs opacity-80">الإجمالي</div>
          <div className="font-mono text-xl mt-1">{grand.toFixed(2)}</div>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        {loading ? <div className="p-8 text-center text-sm text-muted-foreground">جاري التحميل...</div> :
          rows.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">لا توجد ذمم مستحقة</div> :
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs"><tr>
                <th className="text-right p-2">{isAR ? "العميل" : "المورد"}</th>
                <th className="text-right p-2">رقم الفاتورة</th>
                <th className="text-right p-2">التاريخ</th>
                <th className="text-right p-2">الاستحقاق</th>
                <th className="text-right p-2">المتبقي</th>
                <th className="text-right p-2">أيام التأخر</th>
                <th className="text-right p-2">الفئة</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{isAR ? (r.customer_name || "—") : (r.supplier_id ? r.supplier_id.slice(0, 8) : "—")}</td>
                    <td className="p-2 font-mono">{r.invoice_number || r.bill_number}</td>
                    <td className="p-2">{r.invoice_date || r.bill_date}</td>
                    <td className="p-2">{r.due_date || "-"}</td>
                    <td className="p-2 font-mono text-amber-700">{Number(r.balance_due).toFixed(2)}</td>
                    <td className="p-2">{r.days_overdue}</td>
                    <td className="p-2"><span className={`text-xs px-2 py-0.5 rounded ${BUCKET_CLS[r.aging_bucket]}`}>{r.aging_bucket}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>
    </div>
  );
}