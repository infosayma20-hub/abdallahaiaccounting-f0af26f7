import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSuppliers, Supplier } from "@/hooks/useProcurement";
import BackButton from "@/components/BackButton";

interface StatementRow {
  date: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
}

const SupplierStatementPage = () => {
  const { suppliers } = useSuppliers();
  const [supplierId, setSupplierId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [loading, setLoading] = useState(false);

  const supplier = suppliers.find(s => s.id === supplierId);

  const loadStatement = async () => {
    if (!supplierId || !supplier) return;
    setLoading(true);

    let balance = Number(supplier.opening_balance);
    const result: StatementRow[] = [
      { date: supplier.opening_balance_date || "—", description: "رصيد افتتاحي", reference: "—", debit: 0, credit: balance, balance },
    ];

    // Fetch invoices
    let invQuery = supabase.from("procurement_invoices" as any).select("*").eq("supplier_id", supplierId).order("invoice_date");
    if (dateFrom) invQuery = invQuery.gte("invoice_date", dateFrom);
    if (dateTo) invQuery = invQuery.lte("invoice_date", dateTo);
    const { data: invoices } = await invQuery;

    // Fetch payments
    let payQuery = supabase.from("procurement_payments" as any).select("*").eq("supplier_id", supplierId).order("payment_date");
    if (dateFrom) payQuery = payQuery.gte("payment_date", dateFrom);
    if (dateTo) payQuery = payQuery.lte("payment_date", dateTo);
    const { data: payments } = await payQuery;

    // Merge and sort
    const entries: { date: string; desc: string; ref: string; debit: number; credit: number }[] = [];
    ((invoices as any) || []).forEach((i: any) => {
      entries.push({ date: i.invoice_date, desc: `فاتورة مشتريات ${i.invoice_number}`, ref: i.invoice_number, debit: Number(i.total_amount), credit: 0 });
    });
    ((payments as any) || []).forEach((p: any) => {
      const method = p.payment_method === "cash" ? "نقدي" : p.payment_method === "bank_transfer" ? "تحويل بنكي" : "شيك";
      entries.push({ date: p.payment_date, desc: `دفعة ${method}`, ref: p.reference_number || "—", debit: 0, credit: Number(p.amount) });
    });
    entries.sort((a, b) => a.date.localeCompare(b.date));

    entries.forEach(e => {
      balance += e.debit - e.credit;
      result.push({ date: e.date, description: e.desc, reference: e.ref, debit: e.debit, credit: e.credit, balance });
    });

    setRows(result);
    setLoading(false);
  };

  useEffect(() => { if (supplierId) loadStatement(); }, [supplierId, dateFrom, dateTo]);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const finalBalance = rows.length > 0 ? rows[rows.length - 1].balance : 0;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-xl font-bold text-foreground">كشف حساب مورد</h1>
      </div>

      <div className="flex gap-3 flex-wrap items-end">
        <div className="w-64">
          <Label>المورد</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
            <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>من تاريخ</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <Label>إلى تاريخ</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <Button variant="ghost" onClick={() => window.print()} disabled={rows.length === 0}>
          <Printer className="h-4 w-4 ml-1" />طباعة
        </Button>
      </div>

      {supplierId && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">الرصيد الافتتاحي</p><p className="text-lg font-bold">{Number(supplier?.opening_balance || 0).toLocaleString("en", { minimumFractionDigits: 2 })} ₪</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">إجمالي المشتريات</p><p className="text-lg font-bold text-destructive">{totalDebit.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">إجمالي المدفوعات</p><p className="text-lg font-bold text-green-600">{totalCredit.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</p></CardContent></Card>
          <Card className="border-accent/30 bg-accent/5"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">الرصيد النهائي</p><p className="text-xl font-bold">{finalBalance.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</p></CardContent></Card>
        </div>
      )}

      {rows.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>البيان</TableHead>
                  <TableHead>رقم المرجع</TableHead>
                  <TableHead>مدين</TableHead>
                  <TableHead>دائن</TableHead>
                  <TableHead>الرصيد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.date !== "—" ? new Date(r.date).toLocaleDateString("en-GB") : "—"}</TableCell>
                    <TableCell>{r.description}</TableCell>
                    <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                    <TableCell className="font-mono">{r.debit ? r.debit.toLocaleString("en", { minimumFractionDigits: 2 }) : "—"}</TableCell>
                    <TableCell className="font-mono">{r.credit ? r.credit.toLocaleString("en", { minimumFractionDigits: 2 }) : "—"}</TableCell>
                    <TableCell className="font-mono font-bold">{r.balance.toLocaleString("en", { minimumFractionDigits: 2 })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-bold">المجموع</TableCell>
                  <TableCell className="font-mono font-bold">{totalDebit.toLocaleString("en", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="font-mono font-bold">{totalCredit.toLocaleString("en", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="font-mono font-bold">{finalBalance.toLocaleString("en", { minimumFractionDigits: 2 })}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SupplierStatementPage;
