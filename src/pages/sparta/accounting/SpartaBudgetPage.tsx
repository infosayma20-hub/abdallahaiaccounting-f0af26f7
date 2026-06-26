import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SPARTA_HOLDING_ID } from "@/lib/sparta-constants";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Target, Save } from "lucide-react";

type FY = { id: string; year_number: number };
type Account = { id: string; code: string; name_ar: string; type: string };
type Budget = { id?: string; account_id: string; period_number: number; budget_amount: number };
type Actual = { account_id: string; account_code: string; account_name: string; budget_amount: number; actual_amount: number; variance: number; variance_pct: number };

const MONTHS = ["1","2","3","4","5","6","7","8","9","10","11","12"];

export default function SpartaBudgetPage() {
  const [years, setYears] = useState<FY[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [fyId, setFyId] = useState<string>("");
  const [comparison, setComparison] = useState<Actual[]>([]);
  const [mode, setMode] = useState<"edit" | "compare">("edit");

  useEffect(() => {
    (async () => {
      const [fyRes, accRes] = await Promise.all([
        supabase.from("sparta_fiscal_years" as any).select("id,year_number").eq("holding_id", SPARTA_HOLDING_ID).order("year_number", { ascending: false }),
        supabase.from("sparta_accounts" as any).select("id,code,name_ar,type").eq("holding_id", SPARTA_HOLDING_ID).eq("is_postable", true).in("type", ["revenue", "expense"]).order("code"),
      ]);
      setYears((fyRes.data as any) || []);
      setAccounts((accRes.data as any) || []);
      if (fyRes.data && fyRes.data.length > 0) setFyId((fyRes.data as any)[0].id);
    })();
  }, []);

  useEffect(() => { if (fyId) loadBudgets(); }, [fyId]);

  const loadBudgets = async () => {
    const { data } = await supabase.from("sparta_budgets" as any)
      .select("account_id,period_number,budget_amount").eq("fiscal_year_id", fyId);
    const map: Record<string, number> = {};
    ((data as any) || []).forEach((b: Budget) => { map[`${b.account_id}_${b.period_number}`] = Number(b.budget_amount); });
    setBudgets(map);
  };

  const setCell = (accId: string, period: number, value: number) => {
    setBudgets(prev => ({ ...prev, [`${accId}_${period}`]: value }));
  };

  const save = async () => {
    const rows = Object.entries(budgets).map(([key, amount]) => {
      const [account_id, period_number] = key.split("_");
      return {
        holding_id: SPARTA_HOLDING_ID, fiscal_year_id: fyId,
        account_id, period_number: Number(period_number), budget_amount: amount,
      };
    }).filter(r => r.budget_amount > 0);
    if (rows.length === 0) { toast.info("لا توجد قيم لحفظها"); return; }
    const { error } = await supabase.from("sparta_budgets" as any).upsert(rows, { onConflict: "fiscal_year_id,account_id,period_number" });
    if (error) toast.error(error.message); else toast.success("تم حفظ الميزانية");
  };

  const loadComparison = async () => {
    const { data, error } = await supabase.rpc("sparta_budget_vs_actual" as any, { p_fy_id: fyId });
    if (error) toast.error(error.message); else setComparison((data as any) || []);
    setMode("compare");
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Target className="h-6 w-6" /> الميزانية التقديرية</h1>
          <p className="text-sm text-muted-foreground mt-1">ميزانية شهرية للإيرادات والمصروفات + مقارنة فعلي مع مخطط.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={fyId} onChange={e => setFyId(e.target.value)} className="border rounded px-2 py-1">
            {years.map(y => <option key={y.id} value={y.id}>{y.year_number}</option>)}
          </select>
          <Button variant={mode === "edit" ? "default" : "outline"} onClick={() => setMode("edit")}>تحرير</Button>
          <Button variant={mode === "compare" ? "default" : "outline"} onClick={loadComparison}>مقارنة فعلي/مخطط</Button>
          {mode === "edit" && <Button onClick={save}><Save className="h-4 w-4 ml-1" /> حفظ</Button>}
        </div>
      </div>

      {mode === "edit" && (
        <div className="overflow-x-auto border rounded-lg bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted">
              <tr>
                <th className="p-2 text-right sticky right-0 bg-muted">الحساب</th>
                {MONTHS.map(m => <th key={m} className="p-2 text-center">{m}</th>)}
                <th className="p-2 text-center">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(a => {
                const total = MONTHS.reduce((s, m) => s + (budgets[`${a.id}_${m}`] || 0), 0);
                return (
                  <tr key={a.id} className="border-t">
                    <td className="p-2 sticky right-0 bg-card font-medium whitespace-nowrap">{a.code} - {a.name_ar}</td>
                    {MONTHS.map(m => (
                      <td key={m} className="p-1">
                        <input type="number" value={budgets[`${a.id}_${m}`] || ""}
                          onChange={e => setCell(a.id, Number(m), Number(e.target.value))}
                          className="w-20 border rounded px-1 py-0.5 text-center" />
                      </td>
                    ))}
                    <td className="p-2 text-center font-bold">{total.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {mode === "compare" && (
        <div className="overflow-x-auto border rounded-lg bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-2 text-right">الحساب</th>
                <th className="p-2 text-center">الميزانية</th>
                <th className="p-2 text-center">الفعلي</th>
                <th className="p-2 text-center">الفرق</th>
                <th className="p-2 text-center">نسبة الفرق</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map(r => (
                <tr key={r.account_id} className="border-t">
                  <td className="p-2">{r.account_code} - {r.account_name}</td>
                  <td className="p-2 text-center">{Number(r.budget_amount).toLocaleString()}</td>
                  <td className="p-2 text-center">{Number(r.actual_amount).toLocaleString()}</td>
                  <td className={`p-2 text-center font-bold ${r.variance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{Number(r.variance).toLocaleString()}</td>
                  <td className="p-2 text-center">{r.variance_pct !== null ? `${r.variance_pct}%` : "-"}</td>
                </tr>
              ))}
              {comparison.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}