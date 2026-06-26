import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SPARTA_HOLDING_ID } from "@/lib/sparta-constants";
import { ArrowRight } from "lucide-react";

type Account = { id: string; code: string; name_ar: string; type: string; opening_balance: number };
type LineRow = { id: string; entry_id: string; debit: number; credit: number; description: string | null; sparta_journal_entries: { entry_no: string; entry_date: string; description: string | null; status: string } };

export default function SpartaAccountLedgerPage() {
  const { id } = useParams();
  const [account, setAccount] = useState<Account | null>(null);
  const [rows, setRows] = useState<LineRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: a } = await supabase.from("sparta_accounts" as any).select("*").eq("id", id).maybeSingle();
      setAccount(a as any);
      let q = supabase.from("sparta_journal_lines" as any)
        .select("id, entry_id, debit, credit, description, sparta_journal_entries!inner(entry_no, entry_date, description, status, holding_id)")
        .eq("account_id", id)
        .eq("holding_id", SPARTA_HOLDING_ID)
        .eq("sparta_journal_entries.status", "posted")
        .order("entry_date", { ascending: true, referencedTable: "sparta_journal_entries" });
      if (from) q = q.gte("sparta_journal_entries.entry_date", from);
      if (to) q = q.lte("sparta_journal_entries.entry_date", to);
      const { data } = await q;
      setRows((data as any) || []);
    })();
  }, [id, from, to]);

  const isDebitNature = account && ["asset", "expense"].includes(account.type);
  const opening = Number(account?.opening_balance || 0);

  const enriched = useMemo(() => {
    let bal = opening;
    return rows.map(r => {
      bal += isDebitNature ? (Number(r.debit) - Number(r.credit)) : (Number(r.credit) - Number(r.debit));
      return { ...r, running: bal };
    });
  }, [rows, opening, isDebitNature]);

  const final = enriched.length ? enriched[enriched.length - 1].running : opening;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link to="/sparta/accounting/chart" className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground mb-1">
            <ArrowRight className="h-3 w-3" /> شجرة الحسابات
          </Link>
          <h1 className="text-2xl font-bold">
            {account ? `${account.code} - ${account.name_ar}` : "..."}
          </h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded px-2 py-1.5 bg-background" />
          <span>إلى</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded px-2 py-1.5 bg-background" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded border bg-card p-3">
          <div className="text-muted-foreground text-xs">الرصيد الافتتاحي</div>
          <div className="font-mono text-lg">{opening.toFixed(2)}</div>
        </div>
        <div className="rounded border bg-card p-3">
          <div className="text-muted-foreground text-xs">عدد الحركات</div>
          <div className="font-mono text-lg">{rows.length}</div>
        </div>
        <div className="rounded border bg-card p-3">
          <div className="text-muted-foreground text-xs">الرصيد الحالي</div>
          <div className="font-mono text-lg">{final.toFixed(2)}</div>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="p-2 text-right">التاريخ</th>
              <th className="p-2 text-right">رقم القيد</th>
              <th className="p-2 text-right">البيان</th>
              <th className="p-2 text-right">مدين</th>
              <th className="p-2 text-right">دائن</th>
              <th className="p-2 text-right">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t bg-muted/20">
              <td colSpan={5} className="p-2 text-xs text-muted-foreground">الرصيد الافتتاحي</td>
              <td className="p-2 font-mono">{opening.toFixed(2)}</td>
            </tr>
            {enriched.map(r => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="p-2">{r.sparta_journal_entries.entry_date}</td>
                <td className="p-2 font-mono text-xs">
                  <Link to={`/sparta/accounting/journal/${r.entry_id}`} className="text-primary hover:underline">{r.sparta_journal_entries.entry_no}</Link>
                </td>
                <td className="p-2 text-xs">{r.description || r.sparta_journal_entries.description}</td>
                <td className="p-2 font-mono">{Number(r.debit) > 0 ? Number(r.debit).toFixed(2) : ""}</td>
                <td className="p-2 font-mono">{Number(r.credit) > 0 ? Number(r.credit).toFixed(2) : ""}</td>
                <td className="p-2 font-mono font-semibold">{r.running.toFixed(2)}</td>
              </tr>
            ))}
            {enriched.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-xs">لا حركات</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}