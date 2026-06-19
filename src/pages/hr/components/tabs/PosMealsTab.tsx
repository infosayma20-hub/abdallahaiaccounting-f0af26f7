import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, Utensils } from "lucide-react";

interface PosMealRow {
  id: string;
  movement_date: string;
  reference_number: string | null;
  amount: number;
  original_full_amount: number | null;
  meal_discount_type: "family" | "individual" | null;
  meal_discount_pct: number | null;
  description: string | null;
  notes: string | null;
  salary_month: number;
  salary_year: number;
}

const monthsAr = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

export function PosMealsTab({ employeeId }: { employeeId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<PosMealRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("employee_financial_movements")
        .select("id, movement_date, reference_number, amount, original_full_amount, meal_discount_type, meal_discount_pct, description, notes, salary_month, salary_year")
        .eq("employee_id", employeeId)
        .eq("source_type", "pos_meal")
        .eq("salary_year", year)
        .eq("salary_month", month)
        .order("movement_date", { ascending: false });
      if (!cancelled) {
        if (error) console.warn(error);
        setRows(((data || []) as any) as PosMealRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [employeeId, year, month]);

  const totals = useMemo(() => {
    let family = 0, individual = 0, full = 0;
    for (const r of rows) {
      const t = r.meal_discount_type;
      const a = Number(r.amount) || 0;
      full += Number(r.original_full_amount) || 0;
      if (t === "family") family += a;
      else if (t === "individual") individual += a;
    }
    return { family, individual, total: family + individual, fullCompanyPaid: full, companyShare: full - (family + individual) };
  }, [rows]);

  const exportCsv = () => {
    const header = ["التاريخ","رقم الفاتورة","النوع","النسبة","إجمالي الفاتورة","المخصوم","ملاحظات"].join(",");
    const body = rows.map(r => [
      r.movement_date,
      r.reference_number || "",
      r.meal_discount_type === "family" ? "عائلي" : r.meal_discount_type === "individual" ? "فردي" : "",
      r.meal_discount_pct ? `${r.meal_discount_pct}%` : "",
      (Number(r.original_full_amount) || 0).toFixed(2),
      (Number(r.amount) || 0).toFixed(2),
      (r.description || "").replace(/[\r\n,]+/g, " "),
    ].join(",")).join("\n");
    const blob = new Blob(["\ufeff" + header + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pos-meals-${year}-${String(month).padStart(2,"0")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className="h-9 px-2 rounded border border-border bg-background text-sm">
          {monthsAr.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="h-9 px-2 rounded border border-border bg-background text-sm">
          {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
          <Download className="h-3.5 w-3.5 ml-1" /> تصدير CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">خصم عائلي (10%)</div>
          <div className="text-lg font-bold text-violet-600">₪{totals.family.toFixed(2)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">خصم فردي (50%)</div>
          <div className="text-lg font-bold text-violet-600">₪{totals.individual.toFixed(2)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">إجمالي المخصوم من الموظف</div>
          <div className="text-lg font-bold text-red-600">₪{totals.total.toFixed(2)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">حصة الشركة</div>
          <div className="text-lg font-bold text-emerald-600">₪{totals.companyShare.toFixed(2)}</div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Utensils className="h-6 w-6 opacity-40" />
            لا توجد وجبات مسجّلة لهذا الشهر
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2 text-right">التاريخ</th>
                  <th className="p-2 text-right">رقم الفاتورة</th>
                  <th className="p-2 text-right">النوع</th>
                  <th className="p-2 text-right">النسبة</th>
                  <th className="p-2 text-left">إجمالي الفاتورة</th>
                  <th className="p-2 text-left">المخصوم</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2 whitespace-nowrap">{r.movement_date}</td>
                    <td className="p-2 whitespace-nowrap">{r.reference_number || "-"}</td>
                    <td className="p-2">
                      {r.meal_discount_type === "family" && <Badge variant="secondary">عائلي</Badge>}
                      {r.meal_discount_type === "individual" && <Badge variant="secondary">فردي</Badge>}
                      {!r.meal_discount_type && <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="p-2">{r.meal_discount_pct ? `${r.meal_discount_pct}%` : "-"}</td>
                    <td className="p-2 text-left tabular-nums">₪{(Number(r.original_full_amount)||0).toFixed(2)}</td>
                    <td className="p-2 text-left tabular-nums font-semibold text-red-600">₪{(Number(r.amount)||0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}