import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Download, Tag, TrendingDown, TrendingUp } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface Row {
  id: string;
  created_at: string;
  branch_name: string | null;
  product_name: string;
  qty: number;
  original_price: number;
  new_price: number;
  diff_amount: number;
  reason: string;
  changed_by_name: string | null;
  order_number: string | null;
}

interface Props {
  dateFrom: Date;
  dateTo: Date;
  /** Empty ⇢ all branches. */
  branchIds: string[];
}

const money = (v: number) => `₪${Number(v || 0).toFixed(2)}`;

const POSPriceChangesReport = ({ dateFrom, dateTo, branchIds }: Props) => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const branchKey = branchIds.join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = (supabase as any)
        .from("pos_price_change_log")
        .select("id, created_at, branch_name, product_name, qty, original_price, new_price, diff_amount, reason, changed_by_name, order_number")
        .gte("created_at", `${format(dateFrom, "yyyy-MM-dd")}T00:00:00`)
        .lte("created_at", `${format(dateTo, "yyyy-MM-dd")}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (branchIds.length) q = q.in("branch_id", branchIds);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) toast.error("تعذر تحميل سجل تعديلات الأسعار");
      setRows(((data as Row[]) || []));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo, branchKey]);

  const filtered = useMemo(() => {
    const s = search.trim();
    if (!s) return rows;
    return rows.filter(r =>
      [r.product_name, r.reason, r.changed_by_name, r.branch_name, r.order_number]
        .filter(Boolean).some(v => (v as string).includes(s)),
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    const down = filtered.filter(r => r.diff_amount < 0);
    const up = filtered.filter(r => r.diff_amount > 0);
    return {
      count: filtered.length,
      loss: down.reduce((s, r) => s + Math.abs(Number(r.diff_amount) || 0), 0),
      gain: up.reduce((s, r) => s + (Number(r.diff_amount) || 0), 0),
      cashiers: new Set(filtered.map(r => r.changed_by_name).filter(Boolean)).size,
    };
  }, [filtered]);

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
      "التاريخ": format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
      "الفرع": r.branch_name || "",
      "الصنف": r.product_name,
      "الكمية": r.qty,
      "السعر الأصلي": r.original_price,
      "السعر الجديد": r.new_price,
      "الفرق": r.diff_amount,
      "السبب": r.reason,
      "المستخدم": r.changed_by_name || "",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تعديلات الأسعار");
    XLSX.writeFile(wb, `price-changes-${format(dateFrom, "yyyyMMdd")}.xlsx`);
  };

  if (loading) return <div className="space-y-3"><Skeleton className="h-20 rounded" /><Skeleton className="h-[400px] rounded" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Tile title="عدد التعديلات" value={String(totals.count)} icon={Tag} />
        <Tile title="خفض الأسعار" value={money(totals.loss)} icon={TrendingDown} tone="down" />
        <Tile title="رفع الأسعار" value={money(totals.gain)} icon={TrendingUp} tone="up" />
        <Tile title="عدد المستخدمين" value={String(totals.cashiers)} icon={Tag} />
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="بحث بالصنف / السبب / المستخدم / الفرع"
          className="max-w-sm h-9 text-[13px]"
        />
        <button
          onClick={exportExcel}
          className="h-9 px-3 rounded border border-border text-[12px] flex items-center gap-1.5 hover:bg-muted"
        >
          <Download className="w-3.5 h-3.5" /> تصدير Excel
        </button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {["التاريخ والوقت", "الفرع", "الصنف", "الكمية", "الأصلي", "الجديد", "الفرق", "السبب", "المستخدم"].map(h => (
                <th key={h} className="text-right font-medium px-3 py-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center text-muted-foreground py-10">لا يوجد تعديلات أسعار في هذه الفترة</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]">{format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.branch_name || "—"}</td>
                <td className="px-3 py-2">{r.product_name}</td>
                <td className="px-3 py-2 tabular-nums">{r.qty}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground line-through">{money(r.original_price)}</td>
                <td className="px-3 py-2 tabular-nums font-medium">{money(r.new_price)}</td>
                <td className={`px-3 py-2 tabular-nums font-medium ${Number(r.diff_amount) < 0 ? "text-destructive" : "text-emerald-600"}`}>
                  {Number(r.diff_amount) > 0 ? "+" : ""}{Number(r.diff_amount).toFixed(2)}
                </td>
                <td className="px-3 py-2 max-w-[240px] truncate" title={r.reason}>{r.reason}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.changed_by_name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Tile = ({ title, value, icon: Icon, tone }: { title: string; value: string; icon: any; tone?: "up" | "down" }) => (
  <div className="bg-card border border-border rounded px-3 py-2">
    <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1"><Icon className="w-3 h-3" />{title}</p>
    <p className={`text-[17px] font-semibold mt-0.5 font-mono tabular-nums ${tone === "down" ? "text-destructive" : tone === "up" ? "text-emerald-600" : "text-foreground"}`}>{value}</p>
  </div>
);

export default POSPriceChangesReport;
