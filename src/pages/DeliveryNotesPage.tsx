import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import { Plus, Search, Download, Truck, Package, MoreHorizontal, Pencil, ArrowRight, Trash2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fmtDateDisplay } from "@/lib/utils";
import * as XLSX from "xlsx";
import DeliveryNotePrintView from "@/components/DeliveryNotePrintView";
import { createRoot } from "react-dom/client";

import { setNextExportBranding } from "@/lib/excel-export";
const F = "Tajawal, sans-serif";

interface DeliveryNote {
  id: string;
  delivery_number: string;
  contact_id: string | null;
  contact_name: string | null;
  delivery_date: string;
  status: "draft" | "issued" | "converted";
  linked_invoice_id: string | null;
  invoice_number: string | null;
  currency: string;
  total_amount: number;
  notes: string | null;
  driver_name: string | null;
  vehicle_number: string | null;
  delivery_address: string | null;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
  sell_price: number;
  unit?: string;
  quantity?: number;
  product_type?: string;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "مسودة", color: "#6B7280", bg: "#F3F4F6" },
  issued: { label: "صادرة", color: "#2563EB", bg: "#DBEAFE" },
  converted: { label: "محولة لفاتورة", color: "#059669", bg: "#D1FAE5" },
};

const DeliveryNotesPage = () => {
  const { user } = useAuth();
  const { settings: companySettings } = useCompanySettings();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [products, setProducts] = useState<Product[]>([]);

  const fetchNotes = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("delivery_notes")
      .select("*")
      .eq("user_id", dataOwnerId!)
      .order("created_at", { ascending: false });
    setNotes((data as any[]) || []);
    setLoading(false);
  };

  const fetchProducts = async () => {
    if (!user) return;
    const { data } = await supabase.from("products").select("id, name, sell_price, unit, quantity, product_type").eq("user_id", dataOwnerId!);
    setProducts(data || []);
  };

  useEffect(() => { fetchNotes(); fetchProducts(); }, [user]);

  const filtered = useMemo(() => {
    let result = notes;
    if (statusFilter !== "all") result = result.filter(n => n.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(n =>
        n.delivery_number?.toLowerCase().includes(q) ||
        n.contact_name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [notes, statusFilter, search]);

  const handleIssue = async (id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note || note.status !== "draft") return;

    const { data: items } = await supabase.from("delivery_note_items").select("*").eq("delivery_note_id", id);
    const movementRows: any[] = [];

    for (const item of (items as any[]) || []) {
      if (item.product_id && item.quantity > 0) {
        const product = products.find(p => p.id === item.product_id);
        if (product && product.product_type !== "service") {
          await supabase.from("products").update({
            quantity: Math.max(0, (product.quantity || 0) - item.quantity),
          }).eq("id", item.product_id);
          movementRows.push({
            user_id: dataOwnerId!,
            product_id: item.product_id,
            movement_type: "صادر",
            quantity: -Math.abs(item.quantity),
            reference_note: `إرسالية ${note.delivery_number || id.slice(0, 8)}`,
          });
        }
      }
    }

    if (movementRows.length > 0) {
      await supabase.from("stock_movements").insert(movementRows);
    }

    await supabase.from("delivery_notes").update({ status: "issued" } as any).eq("id", id);
    toast.success("تم إصدار الإرسالية وخصم المخزون");
    fetchNotes();
    fetchProducts();
  };

  const handleConvertToInvoice = async (note: DeliveryNote) => {
    if (note.status === "converted") { toast.error("الإرسالية محولة مسبقاً"); return; }
    try {
      const { data: items } = await supabase.from("delivery_note_items").select("*").eq("delivery_note_id", note.id);
      const invoiceData = {
        user_id: dataOwnerId!,
        invoice_type: "sale",
        contact_id: note.contact_id,
        contact_name: note.contact_name,
        invoice_date: new Date().toISOString().split("T")[0],
        currency: note.currency,
        payment_method: "credit",
        status: "draft",
        total_amount: note.total_amount,
        notes: `محولة من إرسالية ${note.delivery_number}`,
      };
      const { data: inv, error: invErr } = await supabase.from("invoices").insert(invoiceData).select("id, invoice_number").single();
      if (invErr) throw invErr;

      if (items?.length) {
        const invoiceItems = (items as any[]).map(item => ({
          invoice_id: inv.id,
          product_id: item.product_id || null,
          product_name: item.product_name,
          description: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount: 0,
          tax_rate: 0,
          total_amount: item.total,
        }));
        await supabase.from("invoice_items").insert(invoiceItems as any);
      }

      await supabase.from("delivery_notes").update({
        status: "converted",
        linked_invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        converted_at: new Date().toISOString(),
      } as any).eq("id", note.id);

      toast.success(`تم تحويل الإرسالية إلى فاتورة ${inv.invoice_number}`);
      fetchNotes();
    } catch (err: any) {
      toast.error(err.message || "خطأ في التحويل");
    }
  };

  const handleDelete = async (id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note || note.status === "converted") { toast.error("لا يمكن حذف إرسالية محولة"); return; }
    if (!confirm("هل أنت متأكد من حذف هذه الإرسالية؟")) return;
    await supabase.from("delivery_notes").delete().eq("id", id);
    toast.success("تم حذف الإرسالية");
    fetchNotes();
  };

  const handlePrint = async (note: DeliveryNote) => {
    const { data: items } = await supabase.from("delivery_note_items").select("*").eq("delivery_note_id", note.id).order("sort_order");
    const noteData = {
      deliveryNumber: note.delivery_number,
      date: note.delivery_date,
      contactName: note.contact_name || "",
      contactPhone: (note as any).contact_phone,
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
      "العميل": n.contact_name,
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

  return (
    <div style={{ direction: "rtl", fontFamily: F, padding: "16px 24px 96px", maxWidth: "1400px", margin: "0 auto" }}>
      <PageHeader title="إرساليات المبيعات" breadcrumb={["المبيعات", "إرساليات المبيعات"]} />

      <div className="flex items-center justify-between gap-3 flex-wrap mb-5 mt-3">
        <p className="text-xs text-muted-foreground" style={{ fontFamily: F }}>وثائق تسليم البضاعة — تُحوّل لفواتير لاحقاً</p>
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate("/delivery-notes/new")} className="gap-2" size="sm">
            <Plus className="h-4 w-4" /> إرسالية جديدة
          </Button>
          {filtered.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportToExcel} className="gap-2">
              <Download className="h-4 w-4" /> تصدير
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="ابحث بالاسم أو الرقم..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
        </div>
        <div className="flex gap-2">
          {["all", "draft", "issued", "converted"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 text-xs rounded-full border transition-all"
              style={{
                fontFamily: F,
                background: statusFilter === s ? "hsl(var(--primary))" : "hsl(var(--background))",
                color: statusFilter === s ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                borderColor: statusFilter === s ? "hsl(var(--primary))" : "hsl(var(--border))",
              }}
            >
              {s === "all" ? `● الكل ${notes.length}` : `${statusConfig[s]?.label} ${notes.filter(n => n.status === s).length}`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-muted-foreground">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <Card className="py-16 text-center">
          <Truck className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-lg font-semibold text-muted-foreground">لا توجد إرساليات</p>
          <p className="text-sm text-muted-foreground/70 mb-4">أنشئ أول إرسالية مبيعات</p>
          <Button onClick={() => navigate("/delivery-notes/new")} className="gap-2"><Plus className="h-4 w-4" /> إرسالية جديدة</Button>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم الإرسالية</TableHead>
                <TableHead className="text-right">العميل</TableHead>
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
                return (
                  <TableRow key={note.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/delivery-notes/${note.id}`)}>
                    <TableCell className="font-mono text-sm font-semibold">{note.delivery_number}</TableCell>
                    <TableCell>{note.contact_name || "—"}</TableCell>
                    <TableCell className="text-sm">{fmtDateDisplay(note.delivery_date)}</TableCell>
                    <TableCell className="font-semibold">{note.total_amount?.toLocaleString()} {note.currency === "شيكل" ? "₪" : note.currency}</TableCell>
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
                          {note.status !== "converted" && (
                            <DropdownMenuItem onClick={() => handleConvertToInvoice(note)}>
                              <ArrowRight className="h-4 w-4 ml-2" /> تحويل لفاتورة
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
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
    </div>
  );
};

export default DeliveryNotesPage;
