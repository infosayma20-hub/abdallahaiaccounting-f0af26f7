import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { Eye, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { DataSourceDef } from "@/lib/report-builder/data-sources";

interface Props {
  open: boolean;
  onClose: () => void;
  rows: any[];
  groupLabel: string;
  source: DataSourceDef;
}

const fmtAmt = (n: number) => `₪${Number(n || 0).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DrillDownModal({ open, onClose, rows, groupLabel, source }: Props) {
  const navigate = useNavigate();

  const goTo = (row: any) => {
    if (source.key === "sales") navigate(`/invoices/${row.id}`);
    else if (source.key === "purchases") navigate(`/purchases/${row.id}`);
    else if (source.key === "inventory") navigate(`/inventory`);
    onClose();
  };

  const total = rows.reduce((s, r) => s + Number(r.total_amount || r.quantity * r.buy_price || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base">
            تفاصيل: {groupLabel}
            <span className="block text-xs font-normal text-muted-foreground mt-1">
              {rows.length} سجل • الإجمالي {fmtAmt(total)}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto -mx-6 px-6">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background border-b border-border">
              <tr className="text-right">
                {source.key !== "inventory" && (
                  <>
                    <th className="py-2 px-2 font-medium text-muted-foreground">رقم الفاتورة</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground">التاريخ</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground">
                      {source.key === "sales" ? "العميل" : "المورد"}
                    </th>
                  </>
                )}
                {source.key === "inventory" && (
                  <>
                    <th className="py-2 px-2 font-medium text-muted-foreground">الصنف</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground">الفئة</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground">الكمية</th>
                  </>
                )}
                <th className="py-2 px-2 font-medium text-muted-foreground text-left">الإجمالي</th>
                <th className="py-2 px-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                  {source.key !== "inventory" && (
                    <>
                      <td className="py-2 px-2 font-mono text-[11px]">{r.invoice_number || "—"}</td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {r[source.dateColumn] ? format(new Date(r[source.dateColumn]), "yyyy-MM-dd") : "—"}
                      </td>
                      <td className="py-2 px-2">{r.customer_name || r.supplier_name || "—"}</td>
                    </>
                  )}
                  {source.key === "inventory" && (
                    <>
                      <td className="py-2 px-2 font-medium">{r.name}</td>
                      <td className="py-2 px-2 text-muted-foreground">{r.category || "—"}</td>
                      <td className="py-2 px-2 font-mono">{r.quantity}</td>
                    </>
                  )}
                  <td className="py-2 px-2 text-left font-mono font-semibold">
                    {fmtAmt(r.total_amount || r.quantity * r.buy_price || 0)}
                  </td>
                  <td className="py-2 px-2">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => goTo(r)}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
