import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { filterOutVoidedInvoiceRows } from "@/lib/reports/tax-ledger-filter";

interface Props { ownerId: string; }

const MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const fmt = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TaxSalesLedger({ ownerId }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!ownerId) return;
    setLoading(true);
    const { data } = await supabase
      .from("tax_ledger")
      .select("*")
      .eq("user_id", ownerId)
      .eq("tax_type", "output")
      .eq("period_year", year)
      .eq("period_month", month)
      .order("transaction_date", { ascending: true });
    const cleaned = await filterOutVoidedInvoiceRows(ownerId, data || []);
    setRows(cleaned);
    setLoading(false);
  };

  useEffect(() => { load(); }, [ownerId, year, month]);

  const filtered = rows.filter(r => !search || r.party_name?.includes(search) || r.invoice_number?.includes(search));
  const totalNet = filtered.reduce((s, r) => s + Number(r.net_amount), 0);
  const totalTax = filtered.reduce((s, r) => s + Number(r.tax_amount), 0);

  return (
    <Card className="p-6 border border-border">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <h3 className="text-lg font-bold text-foreground">كشف ضريبة المبيعات (مخرجات)</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-44" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#0D1B2E", color: "#fff" }}>
              <th className="px-3 py-2.5 text-right text-xs font-medium">التاريخ</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium">رقم الفاتورة</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium">اسم الزبون</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium">الرقم الضريبي</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium">التصنيف</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium">المبلغ الصافي</th>
              <th className="px-3 py-2.5 text-center text-xs font-medium">النسبة</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium">الضريبة</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">جارِ التحميل...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">لا توجد حركات</td></tr>
            ) : filtered.map((r, i) => (
              <tr key={r.id} className={i % 2 === 0 ? "" : "bg-muted/20"} style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                <td className="px-3 py-2.5 tabular-nums">{r.transaction_date}</td>
                <td className="px-3 py-2.5">{r.invoice_number || "—"}</td>
                <td className="px-3 py-2.5 font-medium">{r.party_name || "—"}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{r.party_tax_number || "—"}</td>
                <td className="px-3 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.tax_category === "standard" ? "bg-blue-50 text-blue-700" : r.tax_category === "zero" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                    {r.tax_category === "standard" ? "خاضع" : r.tax_category === "zero" ? "صفري" : "معفى"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-left tabular-nums">{fmt(Number(r.net_amount))}</td>
                <td className="px-3 py-2.5 text-center">{r.tax_rate}%</td>
                <td className="px-3 py-2.5 text-left tabular-nums font-medium">{fmt(Number(r.tax_amount))}</td>
                <td className="px-3 py-2.5 text-left tabular-nums font-bold">{fmt(Number(r.net_amount) + Number(r.tax_amount))}</td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr style={{ background: "#F1F5F9" }} className="font-bold text-sm">
                <td colSpan={5} className="px-3 py-2.5 text-right">الإجمالي ({filtered.length} فاتورة)</td>
                <td className="px-3 py-2.5 text-left tabular-nums">{fmt(totalNet)}</td>
                <td></td>
                <td className="px-3 py-2.5 text-left tabular-nums text-red-600">{fmt(totalTax)}</td>
                <td className="px-3 py-2.5 text-left tabular-nums">{fmt(totalNet + totalTax)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
