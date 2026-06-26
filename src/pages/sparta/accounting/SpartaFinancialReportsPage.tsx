import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SPARTA_HOLDING_ID } from "@/lib/sparta-constants";
import { RefreshCw, TrendingUp, Scale } from "lucide-react";

type Row = { account_code: string; account_name: string; account_type: string; amount?: number; balance?: number };

export default function SpartaFinancialReportsPage() {
  const [tab, setTab] = useState<"is" | "bs">("is");
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    if (tab === "is") {
      const { data } = await supabase.rpc("sparta_income_statement" as any, { _holding: SPARTA_HOLDING_ID, _from: fromDate, _to: toDate });
      setRows((data as any) || []);
    } else {
      const { data } = await supabase.rpc("sparta_balance_sheet" as any, { _holding: SPARTA_HOLDING_ID, _as_of: toDate });
      setRows((data as any) || []);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [tab, fromDate, toDate]);

  const revenue = rows.filter(r => r.account_type === "revenue").reduce((s, r) => s + Number(r.amount || 0), 0);
  const expense = rows.filter(r => r.account_type === "expense").reduce((s, r) => s + Number(r.amount || 0), 0);
  const netIncome = revenue - expense;

  const assets = rows.filter(r => r.account_type === "asset").reduce((s, r) => s + Number(r.balance || 0), 0);
  const liab = rows.filter(r => r.account_type === "liability").reduce((s, r) => s + Number(r.balance || 0), 0);
  const equity = rows.filter(r => r.account_type === "equity").reduce((s, r) => s + Number(r.balance || 0), 0);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">التقارير المالية</h1>
        <button onClick={load} className="p-2 rounded border"><RefreshCw className="h-4 w-4" /></button>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab("is")} className={`flex items-center gap-2 px-4 py-2 rounded ${tab === "is" ? "bg-primary text-primary-foreground" : "border"}`}><TrendingUp className="h-4 w-4" /> قائمة الدخل</button>
        <button onClick={() => setTab("bs")} className={`flex items-center gap-2 px-4 py-2 rounded ${tab === "bs" ? "bg-primary text-primary-foreground" : "border"}`}><Scale className="h-4 w-4" /> الميزانية العامة</button>
      </div>

      <div className="flex gap-2 items-center text-sm">
        {tab === "is" && <><span>من</span><input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="border rounded px-2 py-1.5 bg-background" /></>}
        <span>{tab === "is" ? "إلى" : "كما في"}</span>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="border rounded px-2 py-1.5 bg-background" />
      </div>

      {tab === "is" ? (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs"><tr>
              <th className="text-right p-2">الكود</th><th className="text-right p-2">الحساب</th>
              <th className="text-right p-2">النوع</th><th className="text-right p-2">المبلغ</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">جاري التحميل...</td></tr> :
                <>
                  {rows.filter(r => r.account_type === "revenue").map(r => (
                    <tr key={r.account_code} className="border-t">
                      <td className="p-2 font-mono">{r.account_code}</td><td className="p-2">{r.account_name}</td>
                      <td className="p-2 text-emerald-700">إيراد</td><td className="p-2 font-mono text-emerald-700">{Number(r.amount).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-emerald-50"><td colSpan={3} className="p-2 font-bold text-right">إجمالي الإيرادات</td><td className="p-2 font-mono font-bold">{revenue.toFixed(2)}</td></tr>
                  {rows.filter(r => r.account_type === "expense").map(r => (
                    <tr key={r.account_code} className="border-t">
                      <td className="p-2 font-mono">{r.account_code}</td><td className="p-2">{r.account_name}</td>
                      <td className="p-2 text-red-700">مصروف</td><td className="p-2 font-mono text-red-700">{Number(r.amount).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-red-50"><td colSpan={3} className="p-2 font-bold text-right">إجمالي المصاريف</td><td className="p-2 font-mono font-bold">{expense.toFixed(2)}</td></tr>
                  <tr className="border-t bg-primary/10 text-base"><td colSpan={3} className="p-3 font-bold text-right">صافي الربح / (الخسارة)</td><td className={`p-3 font-mono font-bold ${netIncome >= 0 ? "text-emerald-700" : "text-red-700"}`}>{netIncome.toFixed(2)}</td></tr>
                </>
              }
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="p-2 bg-emerald-50 font-bold text-sm">الأصول</div>
            <table className="w-full text-sm">
              <tbody>
                {rows.filter(r => r.account_type === "asset").map(r => (
                  <tr key={r.account_code} className="border-t"><td className="p-2 font-mono text-xs">{r.account_code}</td><td className="p-2">{r.account_name}</td><td className="p-2 font-mono">{Number(r.balance).toFixed(2)}</td></tr>
                ))}
                <tr className="border-t bg-emerald-50 font-bold"><td colSpan={2} className="p-2 text-right">إجمالي الأصول</td><td className="p-2 font-mono">{assets.toFixed(2)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="p-2 bg-red-50 font-bold text-sm">الالتزامات وحقوق الملكية</div>
            <table className="w-full text-sm">
              <tbody>
                {rows.filter(r => r.account_type === "liability").map(r => (
                  <tr key={r.account_code} className="border-t"><td className="p-2 font-mono text-xs">{r.account_code}</td><td className="p-2">{r.account_name}</td><td className="p-2 font-mono text-red-700">{Number(r.balance).toFixed(2)}</td></tr>
                ))}
                <tr className="border-t bg-red-50 font-bold"><td colSpan={2} className="p-2 text-right">إجمالي الالتزامات</td><td className="p-2 font-mono">{liab.toFixed(2)}</td></tr>
                {rows.filter(r => r.account_type === "equity").map(r => (
                  <tr key={r.account_code} className="border-t"><td className="p-2 font-mono text-xs">{r.account_code}</td><td className="p-2">{r.account_name}</td><td className="p-2 font-mono text-blue-700">{Number(r.balance).toFixed(2)}</td></tr>
                ))}
                <tr className="border-t bg-blue-50 font-bold"><td colSpan={2} className="p-2 text-right">إجمالي حقوق الملكية</td><td className="p-2 font-mono">{equity.toFixed(2)}</td></tr>
                <tr className="border-t bg-primary/10 font-bold"><td colSpan={2} className="p-3 text-right">المجموع</td><td className="p-3 font-mono">{(liab + equity).toFixed(2)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="lg:col-span-2 text-sm text-center p-2 rounded border bg-muted/30">
            فرق التحقق: <span className={`font-mono font-bold ${Math.abs(assets - (liab + equity)) < 0.01 ? "text-emerald-700" : "text-red-700"}`}>{(assets - (liab + equity)).toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}