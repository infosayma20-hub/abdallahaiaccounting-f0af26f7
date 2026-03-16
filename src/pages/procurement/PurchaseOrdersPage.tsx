import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Search, Send, X, FileText, Eye } from "lucide-react";
import { useProcurementOrders, useSuppliers } from "@/hooks/useProcurement";
import { useNavigate } from "react-router-dom";
import BackButton from "@/components/BackButton";
import { Skeleton } from "@/components/ui/skeleton";

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "bg-gray-500/10 text-gray-500 border-gray-500/30" },
  sent: { label: "مُرسلة", color: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  partially_received: { label: "مستلمة جزئياً", color: "bg-orange-500/10 text-orange-500 border-orange-500/30" },
  received: { label: "مستلمة", color: "bg-green-500/10 text-green-500 border-green-500/30" },
  cancelled: { label: "ملغاة", color: "bg-red-500/10 text-red-500 border-red-500/30" },
};

const PurchaseOrdersPage = () => {
  const { orders, loading, updateStatus } = useProcurementOrders();
  const { suppliers } = useSuppliers();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cancelDialog, setCancelDialog] = useState<string | null>(null);

  const filtered = orders.filter(o => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search && !o.order_number?.includes(search) && !o.supplier?.name?.includes(search)) return false;
    return true;
  });

  const handleCancel = async () => {
    if (cancelDialog) {
      await updateStatus(cancelDialog, "cancelled");
      setCancelDialog(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-xl font-bold text-foreground">الطلبيات</h1>
          <Badge variant="secondary">{orders.length}</Badge>
        </div>
        <Button variant="accent" onClick={() => navigate("/procurement/orders/new")}>
          <Plus className="h-4 w-4 ml-1" />
          طلب جديد
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
            <SelectItem value="sent">مُرسلة</SelectItem>
            <SelectItem value="partially_received">مستلمة جزئياً</SelectItem>
            <SelectItem value="received">مستلمة</SelectItem>
            <SelectItem value="cancelled">ملغاة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد طلبيات</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الطلبية</TableHead>
                  <TableHead>المورد</TableHead>
                  <TableHead>الفرع</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>التسليم المتوقع</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>القيمة</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(o => {
                  const st = statusMap[o.status] || statusMap.draft;
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                      <TableCell>{o.supplier?.name || "—"}</TableCell>
                      <TableCell>{o.branch?.name || "—"}</TableCell>
                      <TableCell>{new Date(o.order_date).toLocaleDateString("en-GB")}</TableCell>
                      <TableCell>{o.expected_delivery_date ? new Date(o.expected_delivery_date).toLocaleDateString("en-GB") : "—"}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${st.color}`}>{st.label}</span>
                      </TableCell>
                      <TableCell className="font-mono">{Number(o.total_amount).toLocaleString("en", { minimumFractionDigits: 2 })} ₪</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {(o.status === "sent" || o.status === "partially_received") && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/procurement/invoices/new?orderId=${o.id}`)}>
                              تحويل لفاتورة
                            </Button>
                          )}
                          {o.status === "draft" && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updateStatus(o.id, "sent")}>
                              <Send className="h-3 w-3 ml-1" />إرسال
                            </Button>
                          )}
                          {o.status !== "cancelled" && o.status !== "received" && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setCancelDialog(o.id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!cancelDialog} onOpenChange={() => setCancelDialog(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إلغاء الطلبية</DialogTitle>
            <DialogDescription>هل أنت متأكد من إلغاء هذه الطلبية؟ لا يمكن التراجع عن هذا الإجراء.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelDialog(null)}>تراجع</Button>
            <Button variant="destructive" onClick={handleCancel}>إلغاء الطلبية</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseOrdersPage;
