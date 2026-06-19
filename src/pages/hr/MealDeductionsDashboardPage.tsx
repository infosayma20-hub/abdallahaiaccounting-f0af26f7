import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Download, Loader2, Utensils, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const monthsAr = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

interface Row {
  id: string;
  employee_id: string;
  amount: number;
  original_full_amount: number | null;
  meal_discount_type: "family" | "individual" | null;
  movement_date: string;
  reference_number: string | null;
  employee_name?: string;
}

export default function MealDeductionsDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [capFamily, setCapFamily] = useState(0);
  const [capIndividual, setCapIndividual] = useState(0);
  const [warnPct, setWarnPct] = useState(80);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: company } = await supabase
          .from("companies").select("id").eq("owner_id", user.id).maybeSingle();
        if (company?.id) {
          const { data: ps } = await supabase
            .from("payroll_settings" as any)
            .select("meal_monthly_cap_family, meal_monthly_cap_individual, meal_monthly_warn_at_pct")
            .eq("company_id", company.id).maybeSingle();
          if (ps) {
            setCapFamily(Number((ps as any).meal_monthly_cap_family) || 0);
            setCapIndividual(Number((ps as any).meal_monthly_cap_individual) || 0);
            const w = Number((ps as any).meal_monthly_warn_at_pct);
            if (w > 0) setWarnPct(w);
          }
        }
        const { data, error } = await supabase
          .from("employee_financial_movements")
          .select("id, employee_id, amount, original_full_amount, meal_discount_type, movement_date, reference_number, employees!inner(full_name)")
          .eq("source_type", "pos_meal")
          .eq("salary_year", year)
          .eq("salary_month", month)
          .order("movement_date", { ascending: false });
        if (error) throw error;
        if (cancelled) return;
        setRows(((data || []) as any[]).map(r => ({
          ...r,
          employee_name: r.employees?.full_name,
        })));
      } catch (e) {
        console.warn(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, year, month]);

  const totals = useMemo(() => {
    let family = 0, individual = 0, full = 0;
    const perEmp = new Map<string, { name: string; family: number; individual: number; total: number }>();
    for (const r of rows) {
      const a = Number(r.amount) || 0;
      full += Number(r.original_full_amount) || 0;
      if (r.meal_discount_type === "family") family += a;
      else if (r.meal_discount_type === "individual") individual += a;
      const key = r.employee_id;
      const cur = perEmp.get(key) || { name: r.employee_name || "—", family: 0, individual: 0, total: 0 };
      if (r.meal_discount_type === "family") cur.family += a;
      else if (r.meal_discount_type === "individual") cur.individual += a;
      cur.total += a;
      perEmp.set(key, cur);
    }
    const topEmployees = Array.from(perEmp.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    return { family, individual, total: family + individual, fullCompanyPaid: full, companyShare: full - (family + individual), topEmployees, perEmp };
  }, [rows]);

  const overCap = useMemo(() => {
    const list: Array<{ id: string; name: string; type: "family" | "individual"; used: number; cap: number; pct: number }> = [];
    totals.perEmp.forEach((v, id) => {
      if (capFamily > 0 && v.family >= capFamily * (warnPct / 100)) {
        list.push({ id, name: v.name, type: "family", used: v.family, cap: capFamily, pct: (v.family / capFamily) * 100 });
      }
      if (capIndividual > 0 && v.individual >= capIndividual * (warnPct / 100)) {
        list.push({ id, name: v.name, type: "individual", used: v.individual, cap: capIndividual, pct: (v.individual / capIndividual) * 100 });
      }
    });
    return list.sort((a, b) => b.pct - a.pct);
  }, [totals.perEmp, capFamily, capIndividual, warnPct]);

  const exportCsv = () => {
    const header = ["التاريخ","الموظف","رقم الفاتورة","النوع","إجمالي الفاتورة","المخصوم"].join(",");
    const body = rows.map(r => [
      r.movement_date,
      (r.employee_name || "").replace(/,/g, " "),
      r.reference_number || "",
      r.meal_discount_type === "family" ? "عائلي" : r.meal_discount_type === "individual" ? "فردي" : "",
      (Number(r.original_full_amount)||0).toFixed(2),
      (Number(r.amount)||0).toFixed(2),
    ].join(",")).join("\n");
    const blob = new Blob(["\ufeff" + header + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `meal-deductions-${year}-${String(month).padStart(2,"0")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto pb-10 p-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/hr")} className="p-2 rounded-xl hover:bg-muted">
            <ArrowRight className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Utensils className="h-5 w-5" /> خصومات وجبات الموظفين</h1>
            <p className="text-xs text-muted-foreground">{monthsAr[month - 1]} {year}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="h-9 px-2 rounded border border-border bg-background text-sm">
            {monthsAr.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="h-9 px-2 rounded border border-border bg-background text-sm">
            {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-3.5 w-3.5 ml-1" /> تصدير CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">إجمالي عائلي</div>
          <div className="text-xl font-bold text-violet-600">₪{totals.family.toFixed(2)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">إجمالي فردي</div>
          <div className="text-xl font-bold text-violet-600">₪{totals.individual.toFixed(2)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">إجمالي مخصوم من الموظفين</div>
          <div className="text-xl font-bold text-red-600">₪{totals.total.toFixed(2)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] text-muted-foreground">حصة الشركة</div>
          <div className="text-xl font-bold text-emerald-600">₪{totals.companyShare.toFixed(2)}</div>
        </Card>
      </div>

      {overCap.length > 0 && (
        <Card className="p-3 border-2" style={{ background: '#fef3c7', borderColor: '#f59e0b' }}>
          <div className="flex items-center gap-2 mb-2 font-bold" style={{ color: '#78350f' }}>
            <AlertTriangle className="h-4 w-4" /> موظفون تجاوزوا {warnPct}% من السقف الشهري
          </div>
          <div className="space-y-1 text-sm">
            {overCap.map((o, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <button className="hover:underline" onClick={() => navigate(`/hr/employee/${o.id}`)}>
                  {o.name} <Badge variant="secondary" className="mr-1">{o.type === "family" ? "عائلي" : "فردي"}</Badge>
                </button>
                <span className={o.pct >= 100 ? "text-red-600 font-bold" : "text-amber-700 font-semibold"}>
                  ₪{o.used.toFixed(2)} / ₪{o.cap.toFixed(2)} ({Math.round(o.pct)}%)
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="p-3 font-bold border-b border-border">أعلى 10 موظفين خصماً</div>
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : totals.topEmployees.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">لا توجد بيانات</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2 text-right">#</th>
                  <th className="p-2 text-right">الموظف</th>
                  <th className="p-2 text-left">عائلي</th>
                  <th className="p-2 text-left">فردي</th>
                  <th className="p-2 text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {totals.topEmployees.map((e, i) => (
                  <tr key={e.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/hr/employee/${e.id}`)}>
                    <td className="p-2 text-muted-foreground">{i + 1}</td>
                    <td className="p-2 font-medium">{e.name}</td>
                    <td className="p-2 text-left tabular-nums">₪{e.family.toFixed(2)}</td>
                    <td className="p-2 text-left tabular-nums">₪{e.individual.toFixed(2)}</td>
                    <td className="p-2 text-left tabular-nums font-bold text-red-600">₪{e.total.toFixed(2)}</td>
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