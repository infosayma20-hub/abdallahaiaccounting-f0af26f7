import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Download, Truck, Package, MoreHorizontal, Pencil, ArrowRight,
  Trash2, Printer, RefreshCw, Calculator, Factory,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fmtDateDisplay } from "@/lib/utils";
import * as XLSX from "xlsx";
import DeliveryNotePrintView from "@/components/DeliveryNotePrintView";
import { createRoot } from "react-dom/client";
import { setNextExportBranding } from "@/lib/excel-export";
import {
  FinanceShell,
  applyFilters,
  type ActionTab,
  type FilterField,
  type FilterCondition,
} from "@/components/finance/shell";

interface DeliveryNote {
  id: string;
  delivery_number: string;
  delivery_type: "external" | "internal";
  contact_id: string | null;
  contact_name: string | null;
  delivery_date: string;
  status: "draft" | "issued" | "converted" | "received" | "cancelled";
  linked_invoice_id: string | null;
  invoice_number: string | null;
  currency: string;
  total_amount: number;
  notes: string | null;
  driver_name: string | null;
  vehicle_number: string | null;
  delivery_address: string | null;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  to_branch_id: string | null;
  created_at: string;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: "مسودة",         color: "#6B7280", bg: "#F3F4F6" },
  issued:    { label: "صادرة",         color: "#2563EB", bg: "#DBEAFE" },
  received:  { label: "مستلمة",        color: "#7C3AED", bg: "#EDE9FE" },
  converted: { label: "محولة لفاتورة", color: "#059669", bg: "#D1FAE5" },
  cancelled: { label: "ملغاة",         color: "#DC2626", bg: "#FEE2E2" },
};

const typeLabel = (t: string) => t === "internal" ? "داخلية" : "خارجية";

const DeliveryNotesPage = () => {
  const { user } = useAuth();
  const { settings: companySettings } = useCompanySettings();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterCondition[]>([]);

  const fetchNotes = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("delivery_notes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setNotes((data as any[]) || []);
    setLoading(false);
  }, [user]);

  const fetchWarehouses = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("warehouses").select("id, name").eq("user_id", user.id).order("name");
    setWarehouses(data || []);
  }, [user]);

  useEffect(() => { fetchNotes(); fetchWarehouses(); }, [fetchNotes, fetchWarehouses]);

  // ─── Filter fields ───
  const filterFields: FilterField[] = useMemo(() => [
    { key: "delivery_number", label: "رقم الإرسالية", type: "text" },
    { key: "contact_name",    label: "العميل / الطرف", type: "text" },
    { key: "delivery_date",   label: "التاريخ",         type: "date" },
    { key: "total_amount",    label: "المبلغ",          type: "number" },
    { key: "delivery_type",   label: "النوع",           type: "option",
      options: [
        { value: "external", label: "خارجية" },
        { value: "internal", label: "داخلية" },
      ]},
    { key: "status", label: "الحالة", type: "option",
      options: Object.entries(statusConfig).map(([v, c]) => ({ value: v, label: c.label })) },
  ], []);

  const filtered = useMemo(() => applyFilters(notes, filters, (note, key) => (note as any)[key]), [notes, filters]);

  // ─── Actions ───
  const handleConvertToInvoice = async (note: DeliveryNote) => {
    if (note.delivery_type === "internal") { toast.error("لا يمكن تحويل إرسالية داخلية لفاتورة"); return; }
    if (note.status === "converted") { toast.error("الإرسالية محولة مسبقاً"); return; }
    try {
      const { data, error } = await (supabase.rpc as any)("convert_delivery_note_to_invoice", {
        p_delivery_note_id: note.id,
      });
      if (error) throw error;
      toast.success("تم تحويل الإرسالية إلى فاتورة");
      navigate(`/invoices/new?edit=${data}`);
      fetchNotes();
    } catch (err: any) {
      toast.error(err.message || "خطأ في التحويل");
    }
  };

  const handleIssue = async (id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note || note.status !== "draft") return;
    const { error } = await supabase.from("delivery_notes")
      .update({ status: "issued" } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم إصدار الإرسالية وخصم المخزون");
    fetchNotes();
  };

  const handleReceive = async (id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note || note.delivery_type !== "internal" || note.status !== "issued") return;
    const { error } = await supabase.from("delivery_notes")
      .update({ status: "received", received_at: new Date().toISOString() } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم تأكيد الاستلام في المخزن المستلم");
    fetchNotes();
  };

  const handleCancel = async (id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    if (note.status === "converted") { toast.error("لا يمكن إلغاء إرسالية محولة"); return; }
    if (!confirm("هل تريد إلغاء هذه الإرسالية وإعادة المخزون؟")) return;
    const { error } = await supabase.from("delivery_notes")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم إلغاء الإرسالية وإعادة المخزون");
    fetchNotes();
  };

  const handleDelete = async (id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note || note.status === "converted") { toast.error("لا يمكن حذف إرسالية محولة"); return; }
    if (!confirm("هل أنت متأكد من حذف هذه الإرسالية نهائياً؟")) return;
    const { error } = await supabase.from("delivery_notes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حذف الإرسالية");
    fetchNotes();
  };

  const handlePrint = async (note: DeliveryNote) => {
    const { data: items } = await supabase.from("delivery_note_items")
      .select("*").eq("delivery_note_id", note.id).order("sort_order");
    const fromWh = warehouses.find(w => w.id === note.from_warehouse_id)?.name;
    const toWh = warehouses.find(w => w.id === note.to_warehouse_id)?.name;
    const noteData = {
      deliveryNumber: note.delivery_number,
      date: note.delivery_date,
      contactName: note.contact_name || "",
      contactAddress: note.delivery_address,
      items: ((items as any[]) || []).map(i => ({
        description: i.product_name,
        quantity: i.quantity,
        unit: i.unit || "",
      })),
      notes: note.notes,
      driverName: note.driver_name,
      vehicleNumber: note.vehicle_number,
      deliveryAddress: note.delivery_address,
      status: note.status,
      deliveryType: note.delivery_type,
      fromWarehouseName: fromWh,
      toWarehouseName: toWh,
    };
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html dir="rtl"><head>
      <title>إرسالية ${note.delivery_number}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { background: white; } @media print { body { padding: 0; } @page { margin: 8mm; size: A4; } }</style>
    </head><body><div id="print-root"></div></body></html>`);
    win.document.close();
    setTimeout(() => {
      const container = win.document.getElementById("print-root");
      if (container) {
        const root = createRoot(container);
        root.render(<DeliveryNotePrintView note={noteData} settings={companySettings} />);
        setTimeout(() => win.print(), 500);
      }
    }, 200);
  };

  const exportToExcel = () => {
    const rows = filtered.map(n => ({
      "رقم الإرسالية": n.delivery_number,
      "النوع": typeLabel(n.delivery_type),
      "العميل / الطرف": n.contact_name || (warehouses.find(w => w.id === n.to_warehouse_id)?.name || "—"),
      "التاريخ": n.delivery_date,
      "الحالة": statusConfig[n.status]?.label || n.status,
      "المبلغ": n.total_amount,
      "العملة": n.currency,
      "رقم الفاتورة": n.invoice_number || "-",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "إرساليات");
    setNextExportBranding({ title: "إرساليات" });
    XLSX.writeFile(wb, "delivery-notes.xlsx");
  };

  // ─── Action Pane ───
  const actionTabs: ActionTab[] = useMemo(() => [{
    key: "general", label: "عام", groups: [
      {
        key: "new", label: "جديد", items: [
          { key: "new_ext", label: "إرسالية خارجية", icon: Plus, variant: "primary",
            onClick: () => navigate("/delivery-notes/new?type=external") },
          { key: "new_int", label: "إرسالية داخلية", icon: Factory,
            onClick: () => navigate("/delivery-notes/new?type=internal") },
        ],
      },
      {
        key: "view", label: "عرض", items: [
          { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: () => fetchNotes() },
          { key: "export", label: "تصدير", icon: Download, onClick: exportToExcel, disabled: filtered.length === 0 },
        ],
      },
      {
        key: "nav", label: "تنقل", items: [
          { key: "center", label: "فتح مركز المالية", icon: Calculator, onClick: () => navigate("/accounting-center") },
        ],
      },
    ],
  }], [filtered.length, fetchNotes, navigate]);

  return (
    <FinanceShell
      title="إرساليات المبيعات"
      subtitle="وثائق تسليم البضاعة — خارجية للعملاء أو داخلية بين المخازن"
      breadcrumb={[
        { label: "النظام", href: "/" },
        { label: "المبيعات" },
        { label: "إرساليات المبيعات" },
      ]}
      actionTabs={actionTabs}
      filterFields={filterFields}
      storageKey="delivery-notes"
      filters={filters}
      onFiltersChange={setFilters}
    >
      {loading ? (
        <div className="flex justify-center py-20 text-muted-foreground">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <Card className="py-16 text-center border-dashed">
          <Truck className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg font-semibold text-muted-foreground">لا توجد إرساليات</p>
          <p className="text-sm text-muted-foreground/70 mb-4">أنشئ أول إرسالية مبيعات أو نقل داخلي</p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => navigate("/delivery-notes/new?type=external")} className="gap-2" size="sm">
              <Plus className="h-4 w-4" /> خارجية
            </Button>
            <Button variant="outline" onClick={() => navigate("/delivery-notes/new?type=internal")} className="gap-2" size="sm">
              <Factory className="h-4 w-4" /> داخلية
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم الإرسالية</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">العميل / الطرف</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الفاتورة</TableHead>
                <TableHead className="text-center w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(note => {
                const sc = statusConfig[note.status] || statusConfig.draft;
                const isInternal = note.delivery_type === "internal";
                const otherParty = isInternal
                  ? (warehouses.find(w => w.id === note.to_warehouse_id)?.name || "—")
                  : (note.contact_name || "—");
                return (
                  <TableRow key={note.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/delivery-notes/${note.id}`)}>
                    <TableCell className="font-mono text-sm font-semibold">{note.delivery_number}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${isInternal ? "bg-purple-100 text-purple-700" : "bg-blue-50 text-blue-700"}`}>
                        {isInternal ? "🏭 داخلية" : "🚚 خارجية"}
                      </span>
                    </TableCell>
                    <TableCell>{otherParty}</TableCell>
                    <TableCell className="text-sm">{fmtDateDisplay(note.delivery_date)}</TableCell>
                    <TableCell className="font-semibold">
                      {isInternal ? "—" : `${note.total_amount?.toLocaleString()} ${note.currency === "شيكل" ? "₪" : note.currency}`}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: sc.bg, color: sc.color }}>
                        {sc.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {note.invoice_number ? (
                        <span className="text-primary cursor-pointer underline" onClick={e => { e.stopPropagation(); navigate(`/invoices?type=sales`); }}>
                          {note.invoice_number}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/delivery-notes/${note.id}`)}>
                            <Pencil className="h-4 w-4 ml-2" /> عرض / تعديل
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePrint(note)}>
                            <Printer className="h-4 w-4 ml-2" /> طباعة
                          </DropdownMenuItem>
                          {note.status === "draft" && (
                            <DropdownMenuItem onClick={() => handleIssue(note.id)}>
                              <Package className="h-4 w-4 ml-2" /> إصدار وخصم المخزون
                            </DropdownMenuItem>
                          )}
                          {isInternal && note.status === "issued" && (
                            <DropdownMenuItem onClick={() => handleReceive(note.id)}>
                              <Factory className="h-4 w-4 ml-2" /> تأكيد الاستلام
                            </DropdownMenuItem>
                          )}
                          {!isInternal && note.status === "issued" && (
                            <DropdownMenuItem onClick={() => handleConvertToInvoice(note)}>
                              <ArrowRight className="h-4 w-4 ml-2" /> تحويل لفاتورة
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {["issued","received"].includes(note.status) && (
                            <DropdownMenuItem onClick={() => handleCancel(note.id)} className="text-orange-600">
                              <Trash2 className="h-4 w-4 ml-2" /> إلغاء وإعادة المخزون
                            </DropdownMenuItem>
                          )}
                          {note.status !== "converted" && (
                            <DropdownMenuItem onClick={() => handleDelete(note.id)} className="text-destructive">
                              <Trash2 className="h-4 w-4 ml-2" /> حذف
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </FinanceShell>
  );
};

export default DeliveryNotesPage;
