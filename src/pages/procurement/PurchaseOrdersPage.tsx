import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus, Search, Send, X, FileText, Printer, Eye, Share2, Copy, ChevronDown,
  RefreshCw, LayoutList, LayoutGrid, ArrowUpDown, Pencil, Download, HandCoins, Trash2,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useProcurementOrders, useSuppliers, useBranches, type ProcurementOrderItem } from "@/hooks/useProcurement";
import { useNavigate } from "react-router-dom";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { generateWhatsAppText } from "@/components/procurement/ProcurementPrintView";
import InvoicePrintView from "@/components/InvoicePrintView";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { toast } from "@/hooks/use-toast";
import ReactDOM from "react-dom/client";
import { multiWordMatchAny } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

const F = "Cairo, sans-serif";
const NAVY = "#0D1B2E";

/** D365-style status chip config (bg / text / border / right-accent dot) */
const statusConfig: Record<string, { label: string; bg: string; color: string; border: string; dot: string }> = {
  draft:              { label: "مسودة",          bg: "#F3F2F1", color: "#605E5C", border: "#E1DFDD", dot: "#8A8886" },
  sent:               { label: "مُرسلة",          bg: "#EFF6FC", color: "#0078D4", border: "#B3D6F2", dot: "#0078D4" },
  partially_received: { label: "مستلمة جزئياً",   bg: "#FFF4CE", color: "#8A6D00", border: "#EDDC9B", dot: "#CA8A04" },
  received:           { label: "مستلمة",          bg: "#DFF6DD", color: "#107C10", border: "#A7E3A5", dot: "#107C10" },
  cancelled:          { label: "ملغاة",           bg: "#FDE7E9", color: "#C50F1F", border: "#F1B6BB", dot: "#C50F1F" },
};

type SortKey = "order_number" | "order_date" | "total_amount";

const PurchaseOrdersPage = () => {
  const { orders, loading, refetch, updateStatus, getOrderItems } = useProcurementOrders();
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
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [sortKey, setSortKey] = useState<SortKey>("order_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [cancelDialog, setCancelDialog] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailItems, setDetailItems] = useState<ProcurementOrderItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const filtered = useMemo(() => {
    const list = orders.filter(o => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (supplierFilter !== "all" && o.supplier_id !== supplierFilter) return false;
      if (branchFilter !== "all" && o.branch_id !== branchFilter) return false;
      if (fromDate && o.order_date < fromDate) return false;
      if (toDate && o.order_date > toDate) return false;
      if (search && !multiWordMatchAny(search, o.order_number, o.supplier?.name, o.sales_order_ref)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a: any, b: any) => {
      const va = sortKey === "total_amount" ? Number(a.total_amount || 0) : String(a[sortKey] || "");
      const vb = sortKey === "total_amount" ? Number(b.total_amount || 0) : String(b[sortKey] || "");
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [orders, statusFilter, supplierFilter, branchFilter, fromDate, toDate, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  // ─── KPI metrics (same 4-card strip as the sales orders page) ───
  const kpi = useMemo(() => {
    const total = orders.length;
    const drafts = orders.filter(o => o.status === "draft").length;
    const pending = orders.filter(o => o.status === "sent" || o.status === "partially_received").length;
    const value = orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + Number(o.total_amount || 0), 0);
    return { total, drafts, pending, value };
  }, [orders]);

  const fmtMoney = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const kpiCards = [
    { label: "إجمالي الطلبيات", value: String(kpi.total), accent: NAVY },
    { label: "مسودات", value: String(kpi.drafts), accent: "#8A8886" },
    { label: "بانتظار الاستلام", value: String(kpi.pending), accent: "#CA8A04" },
    { label: "إجمالي القيمة", value: fmtMoney(kpi.value), accent: "#0078D4" },
  ];

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

  const exportToExcel = () => {
    const headers = ["رقم الطلبية", "التاريخ", "المورد", "الفرع", "الحالة", "القيمة"];
    const rows = filtered.map((o: any) => [
      o.order_number,
      new Date(o.order_date).toLocaleDateString("en-GB"),
      o.supplier?.name || "—",
      o.branch?.name || "—",
      (statusConfig[o.status] || statusConfig.draft).label,
      Number(o.total_amount || 0).toFixed(2),
    ]);
    const csv = "﻿" + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const actionTabs: ActionTab[] = [
    {
      key: "home",
      label: "عام",
      groups: [
        {
          key: "new",
          label: "إنشاء",
          items: [
            { key: "new-order", label: "طلب جديد", icon: Plus, variant: "primary", onClick: () => navigate("/procurement/orders/new") },
          ],
        },
        {
          key: "actions",
          label: "إجراءات",
          items: [
            { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: () => refetch(), disabled: loading },
          ],
        },
        {
          key: "export",
          label: "تصدير وطباعة",
          items: [
            { key: "excel", label: "Excel", icon: Download, onClick: exportToExcel, disabled: filtered.length === 0, tooltip: filtered.length === 0 ? "لا توجد بيانات" : undefined },
          ],
        },
        {
          key: "view",
          label: "العرض",
          items: [
            { key: "list", label: "جدول", icon: LayoutList, onClick: () => setViewMode("table"), variant: viewMode === "table" ? "primary" : "default" },
            { key: "cards", label: "بطاقات", icon: LayoutGrid, onClick: () => setViewMode("cards"), variant: viewMode === "cards" ? "primary" : "default" },
          ],
        },
      ],
    },
  ];

  const rightSlot = (
    <div className="relative">
      <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="بحث برقم الطلبية أو المورد..."
        className="h-8 w-64 pr-8 text-[12.5px]"
        dir="rtl"
      />
      {search && (
        <button onClick={() => setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  const statusPill = (status: string) => {
    const sc = statusConfig[status] || statusConfig.draft;
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 10px 3px 8px",
        borderRadius: "2px", fontSize: "12px", fontWeight: 600, fontFamily: F, whiteSpace: "nowrap",
        background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
        borderRight: `3px solid ${sc.dot}`,
      }}>
        {sc.label}
      </span>
    );
  };

  const rowActions = (o: any) => (
    <div className="flex gap-0.5 items-center" onClick={e => e.stopPropagation()}>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="عرض" onClick={() => openDetail(o)}><Eye className="h-3.5 w-3.5" /></Button>
      {o.status === "draft" && (
        <>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="تعديل" onClick={() => navigate(`/procurement/orders/new?editId=${o.id}`)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="إرسال" onClick={() => updateStatus(o.id, "sent")}><Send className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="إلغاء" onClick={() => setCancelDialog(o.id)}><X className="h-3.5 w-3.5" /></Button>
        </>
      )}
      {(o.status === "sent" || o.status === "partially_received") && (
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => navigate(`/procurement/invoices/new?orderId=${o.id}`)}>
          {o.status === "sent" ? "📥 استلام" : "📥 استلام باقي"}
        </Button>
      )}
      {o.status === "sent" && (
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="إلغاء" onClick={() => setCancelDialog(o.id)}><X className="h-3.5 w-3.5" /></Button>
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
  );

  return (
    <>
      <FinanceShell
        title="أوامر الشراء"
        subtitle="إدارة دورة حياة طلبيات الشراء والاستلام"
        breadcrumb={[{ label: "الرئيسية", href: "/" }, { label: "المشتريات" }, { label: "أوامر الشراء" }]}
        actionTabs={actionTabs}
        rightSlot={rightSlot}
      >
        <div style={{ direction: "rtl", textAlign: "right", fontFamily: F }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* ─── KPI Cards ─── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
              {kpiCards.map((card, i) => (
                <div
                  key={i}
                  onMouseEnter={() => setHoveredCard(i)}
                  onMouseLeave={() => setHoveredCard(null)}
                  style={{
                    background: "white",
                    borderRadius: "2px",
                    padding: "14px 16px",
                    position: "relative",
                    border: "1px solid #EDEBE9",
                    borderTop: `2px solid ${card.accent}`,
                    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                    cursor: "default",
                    ...(hoveredCard === i
                      ? { borderColor: "#C7C6C4", boxShadow: "0 1.6px 3.6px rgba(0,0,0,0.08), 0 0.3px 0.9px rgba(0,0,0,0.06)" }
                      : {}),
                  }}
                >
                  <p style={{ fontSize: "11px", fontWeight: 600, color: "#605E5C", fontFamily: F, letterSpacing: "0.2px", marginBottom: "6px" }}>
                    {card.label}
                  </p>
                  <p style={{ fontSize: "22px", fontWeight: 600, color: "#201F1E", fontFamily: F, lineHeight: 1.1, fontFeatureSettings: '"tnum" 1' }}>
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            {/* ─── Filters bar ─── */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-36 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="sent">مُرسلة</SelectItem>
                  <SelectItem value="partially_received">مستلمة جزئياً</SelectItem>
                  <SelectItem value="received">مستلمة</SelectItem>
                  <SelectItem value="cancelled">ملغاة</SelectItem>
                </SelectContent>
              </Select>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="h-9 w-40 bg-white"><SelectValue placeholder="المورد" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الموردين</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="h-9 w-36 bg-white"><SelectValue placeholder="الفرع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع</SelectItem>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Date range filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", direction: "rtl" }}>
                <label style={{ fontSize: "12px", color: "#64748B", fontFamily: F }}>من</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  style={{ padding: "7px 10px", borderRadius: "10px", border: "1.5px solid #E2E8F0", fontSize: "12px", fontFamily: F, color: "#1E293B", background: "white", outline: "none" }}
                />
                <label style={{ fontSize: "12px", color: "#64748B", fontFamily: F }}>إلى</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  style={{ padding: "7px 10px", borderRadius: "10px", border: "1.5px solid #E2E8F0", fontSize: "12px", fontFamily: F, color: "#1E293B", background: "white", outline: "none" }}
                />
              </div>

              <Badge variant="secondary" className="mr-auto">{filtered.length} طلبية</Badge>
            </div>

            {/* ─── Table view ─── */}
            {viewMode === "table" && (
              <div style={{ background: "white", borderRadius: "16px", overflow: "hidden", border: "1px solid #F1F5F9", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                {loading ? (
                  <div className="p-4 space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : filtered.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>لا توجد طلبيات</p>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", direction: "rtl", textAlign: "right", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: NAVY }}>
                          {([
                            { label: "رقم الطلبية", field: "order_number" as SortKey, w: "150px" },
                            { label: "التاريخ", field: "order_date" as SortKey, w: "100px" },
                            { label: "المورد", field: null, w: "200px" },
                            { label: "الفرع", field: null, w: "110px" },
                            { label: "القيمة", field: "total_amount" as SortKey, w: "110px" },
                            { label: "الحالة", field: null, w: "120px" },
                            { label: "الفاتورة", field: null, w: "130px" },
                          ] as { label: string; field: SortKey | null; w: string }[]).map(col => (
                            <th
                              key={col.label}
                              onClick={col.field ? () => toggleSort(col.field!) : undefined}
                              style={{
                                padding: "10px 12px", fontSize: "12px", fontWeight: "600", fontFamily: F,
                                textAlign: "right", whiteSpace: "nowrap", color: "white", borderBottom: "none",
                                letterSpacing: "0.3px", cursor: col.field ? "pointer" : "default",
                                width: col.w, minWidth: col.w,
                              }}
                            >
                              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                {col.label}
                                {col.field && <ArrowUpDown style={{ width: 12, height: 12, opacity: sortKey === col.field ? 1 : 0.3 }} />}
                              </span>
                            </th>
                          ))}
                          <th style={{ padding: "10px 12px", fontSize: "12px", fontWeight: "600", fontFamily: F, textAlign: "right", color: "white", width: "200px", minWidth: "200px", whiteSpace: "nowrap" }}>إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((o: any, i: number) => (
                          <tr
                            key={o.id}
                            onMouseEnter={() => setHoveredRow(o.id)}
                            onMouseLeave={() => setHoveredRow(null)}
                            onClick={() => openDetail(o)}
                            style={{
                              background: hoveredRow === o.id ? "#F8FAFF" : (i % 2 === 0 ? "#FFFFFF" : "#FAFBFC"),
                              transition: "background 0.15s ease", borderBottom: "1px solid #F1F5F9",
                              cursor: "pointer",
                            }}
                          >
                            <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                              <div style={{ fontFamily: "monospace", fontSize: "12px", color: "#3B82F6", fontWeight: "600" }}>{o.order_number}</div>
                              {o.sales_order_ref && (
                                <div style={{ fontFamily: "monospace", fontSize: "10.5px", color: NAVY, fontWeight: 800, marginTop: "2px" }}>مبيعات: {o.sales_order_ref}</div>
                              )}
                            </td>
                            <td style={{ padding: "8px 12px", fontSize: "12px", color: "#64748B", fontFamily: F, whiteSpace: "nowrap" }}>{new Date(o.order_date).toLocaleDateString("en-GB")}</td>
                            <td style={{ padding: "8px 12px", fontWeight: "600", color: NAVY, fontSize: "13px", fontFamily: F, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px" }}>{o.supplier?.name || "—"}</td>
                            <td style={{ padding: "8px 12px", fontSize: "12px", color: "#64748B", fontFamily: F, whiteSpace: "nowrap" }}>{o.branch?.name || "—"}</td>
                            <td style={{ padding: "8px 12px", fontWeight: "700", color: NAVY, fontSize: "14px", fontFamily: F, direction: "ltr", textAlign: "left", whiteSpace: "nowrap" }}>{Number(o.total_amount).toLocaleString()} ₪</td>
                            <td style={{ padding: "8px 12px" }}>{statusPill(o.status)}</td>
                            <td style={{ padding: "8px 12px" }} onClick={e => e.stopPropagation()}>
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
                            </td>
                            <td style={{ padding: "8px 12px" }}>{rowActions(o)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ─── Cards view ─── */}
            {viewMode === "cards" && (
              loading ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ background: "white", borderRadius: "16px", border: "1px solid #F1F5F9" }} className="p-12 text-center text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>لا توجد طلبيات</p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                  {filtered.map((o: any) => {
                    const sc = statusConfig[o.status] || statusConfig.draft;
                    return (
                      <div
                        key={o.id}
                        onClick={() => openDetail(o)}
                        style={{
                          background: "white", borderRadius: "12px", border: "1px solid #EDEBE9",
                          borderTop: `3px solid ${sc.dot}`, padding: "14px 16px", cursor: "pointer",
                          transition: "box-shadow 0.15s ease",
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                          <div>
                            <div style={{ fontFamily: "monospace", fontSize: "12.5px", color: "#3B82F6", fontWeight: 700 }}>{o.order_number}</div>
                            {o.sales_order_ref && (
                              <div style={{ fontFamily: "monospace", fontSize: "10.5px", color: NAVY, fontWeight: 800, marginTop: "2px" }}>مبيعات: {o.sales_order_ref}</div>
                            )}
                          </div>
                          {statusPill(o.status)}
                        </div>
                        <div style={{ fontWeight: 700, color: NAVY, fontSize: "14px", fontFamily: F, marginBottom: "4px" }}>{o.supplier?.name || "—"}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", color: "#64748B", fontFamily: F }}>
                          <span>{new Date(o.order_date).toLocaleDateString("en-GB")}{o.branch?.name ? ` • ${o.branch.name}` : ""}</span>
                          <span style={{ fontWeight: 700, color: NAVY, fontSize: "15px", direction: "ltr" }}>{Number(o.total_amount).toLocaleString()} ₪</span>
                        </div>
                        <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #F1F5F9" }}>{rowActions(o)}</div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      </FinanceShell>

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
                  <p>{statusPill(detailOrder.status)}</p>
                </div>
                <div><span className="text-muted-foreground">المورد:</span><p className="font-medium">{detailOrder.supplier?.name || "—"}</p></div>
                {detailOrder.sales_order_ref && (
                  <div><span className="text-muted-foreground">طلبية المبيعات المصدر:</span><p className="font-mono font-bold text-primary">{detailOrder.sales_order_ref}</p></div>
                )}
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
    </>
  );
};

export default PurchaseOrdersPage;
