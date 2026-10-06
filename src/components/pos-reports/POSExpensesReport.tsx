import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  dataOwnerId: string;
  dateFrom: Date;
  dateTo: Date;
  sessions: { id: string; cashier_name: string | null }[];
}

interface Row {
  id: string; amount: number; description: string | null; shift_id: string | null;
  created_at: string; expense_kind: string | null; account_code: string | null;
}

const KIND: Record<string, string> = {
  account: "مصروف", employee_advance: "سلفة موظف", employee_loan: "قرض موظف",
};

/** تقرير مصاريف نقطة البيع: من صرف، كم، ومتى — مربوط بوردية الكاشير. */
const POSExpensesReport = ({ dataOwnerId, dateFrom, dateTo, sessions }: Props) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [shiftNames, setShiftNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("pos_expenses" as any)
        .select("id, amount, description, shift_id, created_at, expense_kind, account_code")
        .eq("user_id", dataOwnerId)
        .gte("created_at", dateFrom.toISOString())
        .lte("created_at", dateTo.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000);
      const list = ((data as any[]) || []) as Row[];
      // أسماء الكاشير للورديات غير الموجودة ضمن فترة التقرير
      const known = new Set(sessions.map(s => s.id));
      const missing = Array.from(new Set(list.map(r => r.shift_id).filter((id): id is string => !!id && !known.has(id))));
      const extra: Record<string, string> = {};
      if (missing.length) {
        const { data: ss } = await supabase.from("pos_sessions" as any).select("id, cashier_name").in("id", missing);
        ((ss as any[]) || []).forEach(s => { extra[s.id] = s.cashier_name || "غير محدد"; });
      }
      if (!cancel) { setRows(list); setShiftNames(extra); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [dataOwnerId, dateFrom, dateTo, sessions]);

  const nameOf = useMemo(() => {
    const m: Record<string, string> = { ...shiftNames };
    sessions.forEach(s => { m[s.id] = s.cashier_name || "غير محدد"; });
    return (id: string | null) => (id ? m[id] || "—" : "—");
  }, [sessions, shiftNames]);

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const byCashier = useMemo(() => {
    const m: Record<string, { total: number; count: number }> = {};
    rows.forEach(r => {
      const n = nameOf(r.shift_id);
      m[n] = m[n] || { total: 0, count: 0 };
      m[n].total += Number(r.amount) || 0; m[n].count += 1;
    });
    return Object.entries(m).sort(([, a], [, b]) => b.total - a.total);
  }, [rows, nameOf]);

  const th = "text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground";
  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs font-medium text-muted-foreground">إجمالي المصاريف من نقطة البيع</p>
          <p className="text-2xl font-bold text-destructive mt-2 font-mono">₪{total.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">{rows.length} عملية — تُخصم من نقدية الوردية عند الإغلاق</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">حسب الموظف</p>
          {byCashier.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
          {byCashier.map(([n, v]) => (
            <div key={n} className="flex justify-between text-sm py-0.5">
              <span>{n} <span className="text-muted-foreground text-xs">({v.count})</span></span>
              <span className="font-mono font-bold">₪{v.total.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full">
          <thead><tr className="bg-secondary border-b border-border">
            <th className={th}>التاريخ</th><th className={th}>الموظف</th><th className={th}>النوع</th>
            <th className={th}>البيان</th><th className={th}>الحساب</th><th className={th}>المبلغ</th>
          </tr></thead>
          <tbody className="divide-y divide-secondary">
            {loading && <tr><td colSpan={6} className="text-center text-muted-foreground py-10 text-sm">جاري التحميل...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground py-10 text-sm">لا توجد مصاريف بهذه الفترة</td></tr>}
            {!loading && rows.map(r => (
              <tr key={r.id} className="hover:bg-secondary">
                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</td>
                <td className="px-4 py-3 text-sm">{nameOf(r.shift_id)}</td>
                <td className="px-4 py-3 text-sm">{KIND[r.expense_kind || "account"] || r.expense_kind}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{r.description || "—"}</td>
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{r.account_code || "—"}</td>
                <td className="px-4 py-3 text-sm font-mono font-bold text-destructive">₪{Number(r.amount).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default POSExpensesReport;
