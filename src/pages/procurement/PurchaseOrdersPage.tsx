import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Search, Send, X, FileText, Printer, Eye, Download, Share2, Copy, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useProcurementOrders, useSuppliers, useBranches, type ProcurementOrderItem } from "@/hooks/useProcurement";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { generateWhatsAppText } from "@/components/procurement/ProcurementPrintView";
import InvoicePrintView from "@/components/InvoicePrintView";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { toast } from "@/hooks/use-toast";
import ReactDOM from "react-dom/client";
import { multiWordMatchAny } from "@/lib/utils";

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "bg-[hsl(220,9%,46%)]/10 text-[hsl(220,9%,46%)] border-[hsl(220,9%,46%)]/30" },
  sent: { label: "مُرسلة", color: "bg-[hsl(217,91%,60%)]/10 text-[hsl(217,91%,60%)] border-[hsl(217,91%,60%)]/30" },
  partially_received: { label: "مستلمة جزئياً", color: "bg-[hsl(38,92%,50%)]/10 text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%)]/30" },
  received: { label: "مستلمة", color: "bg-[hsl(160,84%,39%)]/10 text-[hsl(160,84%,39%)] border-[hsl(160,84%,39%)]/30" },
  cancelled: { label: "ملغاة", color: "bg-destructive/10 text-destructive border-destructive/30" },
};

const PurchaseOrdersPage = () => {
  const { orders, loading, updateStatus, getOrderItems } = useProcurementOrders();
  const { suppliers } = useSuppliers();
  const { branches } = useBranches();
  const { settings: companySettings } = useCompanySettings();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [cancelDialog, setCancelDialog] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailItems, setDetailItems] = useState<ProcurementOrderItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const filtered = orders.filter(o => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (supplierFilter !== "all" && o.supplier_id !== supplierFilter) return false;
    if (branchFilter !== "all" && o.branch_id !== branchFilter) return false;
    if (fromDate && o.order_date < fromDate) return false;
    if (toDate && o.order_date > toDate) return false;
    if (search && !multiWordMatchAny(search, o.order_number, o.supplier?.name)) return false;
    return true;
  });

  const handleCancel = async () => {
    if (cancelDialog) { await updateStatus(cancelDialog, "cancelled"); setCancelDialog(null); }
  };

  const openDetail = async (order: any) => {
    setDetailOrder(order);
    setLoadingDetail(true);
    const items = await getOrderItems(order.id);
    setDetailItems(items);
    setLoadingDetail(false);
  };

  const handlePrint = async (order: any) => {
    const items = await getOrderItems(order.id);
    // Unified print: use InvoicePrintView (same look & feel as sales/purchase invoices)
    const total = items.reduce((s, i) => s + Number(i.total_price), 0);
    const previewInvoice = {
      type: "purchase" as const,
      invoiceNumber: order.order_number,
      date: order.order_date,
      dueDate: order.expected_delivery_date || undefined,
      contactName: order.supplier?.name || "—",
      contactPhone: order.supplier?.phone,
      items: items.map((i: any) => ({
        description: i.item_name,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unit_price),
        discount: 0,
        taxRate: 0,
        taxCategory: "exempt" as const,
        subtotal: Number(i.total_price),
      })),
      notes: order.notes || "",
      status: "draft",
      paymentMethod: "credit",
      subtotal: total,
      totalDiscount: 0,
      totalTax: 0,
      total,
      paidAmount: 0,
      remainingAmount: total,
      currency: "شيكل",
      taxInclusive: false,
    };
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html dir="rtl"><head><title>طلبية ${order.order_number}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { background: white; } @media print { @page { margin: 8mm; size: A4; } }</style>
    </head><body><div id="print-root"></div></body></html>`);
    win.document.close();
    setTimeout(() => {
      const container = win.document.getElementById("print-root");
      if (container) {
        const root = ReactDOM.createRoot(container);
        root.render(<InvoicePrintView invoice={previewInvoice as any} settings={companySettings} copyLabel="طلبية شراء" />);
        setTimeout(() => win.print(), 500);
      }
    }, 200);
  };

  const handleWhatsApp = async (order: any) => {
    const items = await getOrderItems(order.id);
    const text = generateWhatsAppText(order, items);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const copyOrderNumber = (num: string) => {
    navigator.clipboard.writeText(num);
    toast({ title: "✅ تم نسخ رقم الطلبية" });
  };

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <PageHeader title="سجل الطلبيات" breadcrumb={["المشتريات", "الطلبيات"]} />
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{orders.length}</Badge>
        <Button style={{ background: "#1B3A5C" }} className="text-white hover:opacity-90" onClick={() => navigate("/procurement/orders/new")}>
          <Plus className="h-4 w-4 ml-1" />طلب جديد
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-36 h-9" placeholder="من تاريخ" />
        <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-36 h-9" placeholder="إلى تاريخ" />
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="المورد" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الموردين</SelectItem>
            {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="الفرع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفروع</SelectItem>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
            <SelectItem value="sent">مُرسلة</SelectItem>
            <SelectItem value="partially_received">مستلمة جزئياً</SelectItem>
            <SelectItem value="received">مستلمة</SelectItem>
            <SelectItem value="cancelled">ملغاة</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث برقم الطلبية..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 h-9" />
        </div>
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
                  <TableHead>التاريخ</TableHead>
                  <TableHead>المورد</TableHead>
                  <TableHead>الفرع</TableHead>
                  <TableHead>القيمة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الفاتورة</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(o => {
                  const st = statusMap[o.status] || statusMap.draft;
                  return (
                    <TableRow key={o.id} className="cursor-pointer" onClick={() => openDetail(o)}>
                      <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                      <TableCell className="text-xs">{new Date(o.order_date).toLocaleDateString("en-GB")}</TableCell>
                      <TableCell className="text-sm">{o.supplier?.name || "—"}</TableCell>
                      <TableCell className="text-xs">{o.branch?.name || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{Number(o.total_amount).toLocaleString("en", { minimumFractionDigits: 2 })} ₪</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${st.color}`}>{st.label}</span>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        {o.linked_invoice ? (
                          <Badge variant="outline" className="font-mono text-[10px] cursor-pointer hover:bg-accent/10"
                            onClick={() => navigate("/procurement/invoices")}>
                            {o.linked_invoice.invoice_number}
                          </Badge>
                        ) : (o.status === "sent" || o.status === "partially_received") ? (
                          <Button size="sm" variant="outline" className="h-6 text-[10px] text-[hsl(43,50%,54%)] border-[hsl(43,50%,54%)]/50" onClick={() => navigate(`/procurement/invoices/new?orderId=${o.id}`)}>
                            تحويل لفاتورة
                          </Button>
                        ) : "—"}
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex gap-0.5">
                          {o.status === "draft" && (
                            <>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate(`/procurement/orders/new?editId=${o.id}`)}>✏</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updateStatus(o.id, "sent")}><Send className="h-3 w-3" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setCancelDialog(o.id)}><X className="h-3 w-3" /></Button>
                            </>
                          )}
                          {o.status === "sent" && (
                            <>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate(`/procurement/invoices/new?orderId=${o.id}`)}>📥</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setCancelDialog(o.id)}><X className="h-3 w-3" /></Button>
                            </>
                          )}
                          {o.status === "partially_received" && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate(`/procurement/invoices/new?orderId=${o.id}`)}>📥 استلام باقي</Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><ChevronDown className="h-3 w-3" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handlePrint(o)}><Printer className="h-3.5 w-3.5 ml-2" />طباعة</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleWhatsApp(o)}><Share2 className="h-3.5 w-3.5 ml-2" />مشاركة WhatsApp</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => copyOrderNumber(o.order_number)}><Copy className="h-3.5 w-3.5 ml-2" />نسخ رقم الطلبية</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* Cancel Dialog */}
      <Dialog open={!!cancelDialog} onOpenChange={() => setCancelDialog(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد الإلغاء</DialogTitle>
            <DialogDescription>هل أنت متأكد من إلغاء هذه الطلبية؟ لا يمكن التراجع عن هذا الإجراء.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelDialog(null)}>تراجع</Button>
            <Button variant="destructive" onClick={handleCancel}>إلغاء الطلبية</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Detail Sheet */}
      <Sheet open={!!detailOrder} onOpenChange={() => setDetailOrder(null)}>
        <SheetContent side="right" className="w-[500px] sm:w-[550px]" dir="rtl">
          <SheetHeader><SheetTitle>تفاصيل الطلبية</SheetTitle></SheetHeader>
          {detailOrder && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">رقم الطلبية:</span><p className="font-mono font-bold">{detailOrder.order_number}</p></div>
                <div><span className="text-muted-foreground">الحالة:</span>
                  <p><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${(statusMap[detailOrder.status] || statusMap.draft).color}`}>{(statusMap[detailOrder.status] || statusMap.draft).label}</span></p>
                </div>
                <div><span className="text-muted-foreground">المورد:</span><p className="font-medium">{detailOrder.supplier?.name || "—"}</p></div>
                <div><span className="text-muted-foreground">الفرع:</span><p>{detailOrder.branch?.name || "—"}</p></div>
                <div><span className="text-muted-foreground">التاريخ:</span><p>{new Date(detailOrder.order_date).toLocaleDateString("en-GB")}</p></div>
                <div><span className="text-muted-foreground">التسليم المتوقع:</span><p>{detailOrder.expected_delivery_date ? new Date(detailOrder.expected_delivery_date).toLocaleDateString("en-GB") : "—"}</p></div>
              </div>

              {detailOrder.notes && <div className="p-2 rounded bg-muted/50 text-sm"><strong>ملاحظات:</strong> {detailOrder.notes}</div>}

              {detailOrder.linked_invoice && (
                <div className="p-2 rounded bg-accent/10 border border-accent/30">
                  <p className="text-sm">فاتورة مرتبطة: <Badge variant="outline" className="font-mono cursor-pointer" onClick={() => { setDetailOrder(null); navigate("/procurement/invoices"); }}>{detailOrder.linked_invoice.invoice_number}</Badge></p>
                </div>
              )}

              <Table>
                <TableHeader><TableRow>
                  <TableHead>#</TableHead><TableHead>الصنف</TableHead><TableHead>الوحدة</TableHead>
                  <TableHead>الكمية</TableHead><TableHead>السعر</TableHead><TableHead>الإجمالي</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {loadingDetail ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-4"><Skeleton className="h-4 w-32 mx-auto" /></TableCell></TableRow>
                  ) : detailItems.map((item, idx) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs">{idx + 1}</TableCell>
                      <TableCell className="text-xs font-medium">{item.item_name}</TableCell>
                      <TableCell className="text-xs">{item.unit}</TableCell>
                      <TableCell className="text-xs">{item.quantity}</TableCell>
                      <TableCell className="text-xs">{Number(item.unit_price).toFixed(2)}</TableCell>
                      <TableCell className="text-xs font-mono">{Number(item.total_price).toFixed(2)} ₪</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-muted-foreground text-sm">القيمة الإجمالية</span>
                <span className="font-bold text-lg">{Number(detailOrder.total_amount).toFixed(2)} ₪</span>
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => handlePrint(detailOrder)}><Printer className="h-4 w-4 ml-1" />طباعة</Button>
                <Button variant="outline" className="flex-1" onClick={() => handleWhatsApp(detailOrder)}><Share2 className="h-4 w-4 ml-1" />WhatsApp</Button>
                {(detailOrder.status === "sent" || detailOrder.status === "partially_received") && (
                  <Button className="flex-1 bg-[hsl(43,50%,54%)] hover:bg-[hsl(43,50%,45%)] text-white" onClick={() => { setDetailOrder(null); navigate(`/procurement/invoices/new?orderId=${detailOrder.id}`); }}>
                    تحويل لفاتورة
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default PurchaseOrdersPage;
