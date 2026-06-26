import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SPARTA_HOLDING_ID } from "@/lib/sparta-constants";
import { Link } from "react-router-dom";

type Account = { id: string; code: string; name_ar: string; type: string; is_postable: boolean; opening_balance: number };
type Line = { account_id: string; debit: number; credit: number };

export default function SpartaTrialBalancePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [accRes, linesRes] = await Promise.all([
        supabase.from("sparta_accounts" as any).select("id, code, name_ar, type, is_postable, opening_balance").eq("holding_id", SPARTA_HOLDING_ID).order("code"),
        supabase.from("sparta_journal_lines" as any)
          .select("account_id, debit, credit, sparta_journal_entries!inner(status, entry_date, holding_id)")
          .eq("holding_id", SPARTA_HOLDING_ID)
          .eq("sparta_journal_entries.status", "posted")
          .lte("sparta_journal_entries.entry_date", asOf),
      ]);
      setAccounts((accRes.data as any) || []);
      setLines(((linesRes.data as any) || []).map((l: any) => ({ account_id: l.account_id, debit: Number(l.debit), credit: Number(l.credit) })));
      setLoading(false);
    })();
  }, [asOf]);

  const rows = useMemo(() => {
    const agg = new Map<string, { debit: number; credit: number }>();
    lines.forEach(l => {
      const x = agg.get(l.account_id) || { debit: 0, credit: 0 };
      x.debit += l.debit; x.credit += l.credit;
      agg.set(l.account_id, x);
    });
    return accounts.filter(a => a.is_postable).map(a => {
      const t = agg.get(a.id) || { debit: 0, credit: 0 };
      const debitNature = ["asset", "expense"].includes(a.type);
      const ob = Number(a.opening_balance || 0);
      const balance = (debitNature ? ob : -ob) + t.debit - t.credit;
      return { ...a, debit: t.debit, credit: t.credit, balance_debit: balance > 0 ? balance : 0, balance_credit: balance < 0 ? -balance : 0 };
    }).filter(r => r.debit !== 0 || r.credit !== 0 || r.balance_debit !== 0 || r.balance_credit !== 0);
  }, [accounts, lines]);

  const tD = rows.reduce((s, r) => s + r.debit, 0);
  const tC = rows.reduce((s, r) => s + r.credit, 0);
  const tBD = rows.reduce((s, r) => s + r.balance_debit, 0);
  const tBC = rows.reduce((s, r) => s + r.balance_credit, 0);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">ميزان المراجعة</h1>
        <div className="flex items-center gap-2 text-sm">
          <span>كما في:</span>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="border rounded px-2 py-1.5 bg-background" />
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        {loading ? <div className="p-8 text-center text-sm text-muted-foreground">جاري التحميل...</div> : (
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="p-2 text-right">الكود</th>
              <th className="p-2 text-right">الحساب</th>
              <th className="p-2 text-right">حركة مدين</th>
              <th className="p-2 text-right">حركة دائن</th>
              <th className="p-2 text-right">رصيد مدين</th>
              <th className="p-2 text-right">رصيد دائن</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="p-2 font-mono text-xs">{r.code}</td>
                <td className="p-2"><Link to={`/sparta/accounting/ledger/${r.id}`} className="text-primary hover:underline">{r.name_ar}</Link></td>
                <td className="p-2 font-mono">{r.debit.toFixed(2)}</td>
                <td className="p-2 font-mono">{r.credit.toFixed(2)}</td>
                <td className="p-2 font-mono text-emerald-700">{r.balance_debit > 0 ? r.balance_debit.toFixed(2) : ""}</td>
                <td className="p-2 font-mono text-red-700">{r.balance_credit > 0 ? r.balance_credit.toFixed(2) : ""}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-xs">لا حركات حتى هذا التاريخ</td></tr>}
          </tbody>
          <tfoot className="bg-muted/50 font-bold">
            <tr>
              <td colSpan={2} className="p-2">الإجمالي</td>
              <td className="p-2 font-mono">{tD.toFixed(2)}</td>
              <td className="p-2 font-mono">{tC.toFixed(2)}</td>
              <td className="p-2 font-mono">{tBD.toFixed(2)}</td>
              <td className="p-2 font-mono">{tBC.toFixed(2)}</td>
            </tr>
            <tr className="text-xs">
              <td colSpan={6} className="p-2">
                {Math.abs(tBD - tBC) < 0.01 ? <span className="text-emerald-700">✓ الميزان متوازن</span> : <span className="text-red-700">⚠ الميزان غير متوازن — الفرق: {(tBD - tBC).toFixed(2)}</span>}
              </td>
            </tr>
          </tfoot>
        </table>
        )}
      </div>
    </div>
  );
}