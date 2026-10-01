import { useEffect, useMemo, useState } from "react";
import { FinanceShell } from "@/components/finance/shell";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

type Row = {
  product_id: string; supplier_id: string; first_order_date: string | null; last_order_date: string | null;
  last_unit_price: number; orders_count: number; total_qty: number;
  products: { name: string; barcode: string | null; unit: string | null } | null;
  pos_suppliers: { name: string } | null;
};

const SupplierItemsReportPage = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplier, setSupplier] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const all: Row[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("product_supplier_links")
          .select("product_id, supplier_id, first_order_date, last_order_date, last_unit_price, orders_count, total_qty, products(name, barcode, unit), pos_suppliers(name)")
          .order("last_order_date", { ascending: false })
          .range(from, from + 999);
        if (error || !data) break;
        all.push(...(data as any));
        if (data.length < 1000) break;
      }
      setRows(all);
      setLoading(false);
    })();
  }, []);

  const suppliers = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach(r => m.set(r.supplier_id, r.pos_suppliers?.name || "—"));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "ar"));
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r =>
      (supplier === "all" || r.supplier_id === supplier) &&
      (!s || r.products?.name?.toLowerCase().includes(s) || r.products?.barcode?.includes(s)));
  }, [rows, supplier, q]);

  return (
    <FinanceShell
      title="أصناف الموردين"
      breadcrumb={[{ label: "المشتريات", href: "/procurement/orders" }, { label: "أصناف الموردين" }]}
      rightSlot={loading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : undefined}
    >
      <div dir="rtl" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select dir="rtl" value={supplier} onValueChange={setSupplier}>
            <SelectTrigger className="h-9 w-64"><SelectValue placeholder="المورد" /></SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="all">كل الموردين</SelectItem>
              {suppliers.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input className="h-9 w-64" placeholder="بحث بالاسم أو الباركود" value={q} onChange={e => setQ(e.target.value)} />
          <span className="text-sm text-muted-foreground">{filtered.length} صنف</span>
        </div>
        <div className="rounded-md border bg-background overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الصنف</TableHead>
                <TableHead className="text-right">الباركود</TableHead>
                <TableHead className="text-right">المورد</TableHead>
                <TableHead className="text-right">عدد الطلبيات</TableHead>
                <TableHead className="text-right">إجمالي الكمية</TableHead>
                <TableHead className="text-right">آخر سعر</TableHead>
                <TableHead className="text-right">أول طلبية</TableHead>
                <TableHead className="text-right">آخر طلبية</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => (
                <TableRow key={r.product_id + r.supplier_id}>
                  <TableCell className="font-medium">{r.products?.name}</TableCell>
                  <TableCell dir="ltr" className="text-right">{r.products?.barcode || "—"}</TableCell>
                  <TableCell>{r.pos_suppliers?.name}</TableCell>
                  <TableCell>{r.orders_count}</TableCell>
                  <TableCell>{Number(r.total_qty).toLocaleString("en")} {r.products?.unit || ""}</TableCell>
                  <TableCell>{Number(r.last_unit_price).toFixed(2)} ₪</TableCell>
                  <TableCell>{r.first_order_date || "—"}</TableCell>
                  <TableCell>{r.last_order_date || "—"}</TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">لا توجد أصناف مرتبطة بموردين بعد — تُربط تلقائيًا عند حفظ طلبية مشتريات.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </FinanceShell>
  );
};

export default SupplierItemsReportPage;
