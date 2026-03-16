import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, FileText } from "lucide-react";
import { useProcurementInvoices } from "@/hooks/useProcurement";
import BackButton from "@/components/BackButton";
import { Skeleton } from "@/components/ui/skeleton";

const ProcurementInvoicesPage = () => {
  const { invoices, loading } = useProcurementInvoices();
  const [search, setSearch] = useState("");

  const filtered = invoices.filter(i =>
    i.invoice_number?.includes(search) || i.supplier?.name?.includes(search) || i.supplier_invoice_number?.includes(search)
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-xl font-bold text-foreground">فواتير المشتريات</h1>
          <Badge variant="secondary">{invoices.length}</Badge>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد فواتير مشتريات</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الفاتورة</TableHead>
                  <TableHead>المورد</TableHead>
                  <TableHead>فاتورة المورد</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>حالة الدفع</TableHead>
                  <TableHead>الإجمالي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                    <TableCell>{inv.supplier?.name || "—"}</TableCell>
                    <TableCell>{inv.supplier_invoice_number || "—"}</TableCell>
                    <TableCell>{new Date(inv.invoice_date).toLocaleDateString("en-GB")}</TableCell>
                    <TableCell>
                      <Badge variant={inv.payment_status === "paid" ? "default" : inv.payment_status === "partial" ? "secondary" : "destructive"}>
                        {inv.payment_status === "paid" ? "مدفوعة" : inv.payment_status === "partial" ? "جزئية" : "غير مدفوعة"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{Number(inv.total_amount).toLocaleString("en", { minimumFractionDigits: 2 })} ₪</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProcurementInvoicesPage;
