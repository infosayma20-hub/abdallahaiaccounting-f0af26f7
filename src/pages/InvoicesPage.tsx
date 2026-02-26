import { useState, useEffect, useRef } from "react";
import { ArrowRight, Loader2, RefreshCw, Plus, FileText, Printer, Download, Search, ShoppingCart, Receipt, Calendar, User, Hash } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Contact {
  id: string;
  fields: {
    "Contact Name"?: string;
    "Contact Type"?: string;
    "Phone"?: string;
    "Company"?: string;
  };
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface Invoice {
  id: string;
  type: "sales" | "purchase";
  invoiceNumber: string;
  date: string;
  contactName: string;
  items: InvoiceItem[];
  notes: string;
  status: "draft" | "sent" | "paid";
  total: number;
  currency: string;
}

const InvoicesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<"all" | "sales" | "purchase">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [creating, setCreating] = useState(false);

  const [newInvoice, setNewInvoice] = useState({
    type: "sales" as "sales" | "purchase",
    contactName: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    currency: "شيكل",
    items: [{ description: "", quantity: 1, unitPrice: 0 }] as InvoiceItem[],
  });

  // Load invoices from localStorage (simple approach without extra DB)
  useEffect(() => {
    if (!user) return;
    const stored = localStorage.getItem(`invoices_${user.id}`);
    if (stored) {
      setInvoices(JSON.parse(stored));
    }
    fetchContacts();
    setLoading(false);
  }, [user]);

  const saveInvoices = (updated: Invoice[]) => {
    if (!user) return;
    setInvoices(updated);
    localStorage.setItem(`invoices_${user.id}`, JSON.stringify(updated));
  };

  const fetchContacts = async () => {
    if (!user) return;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-contacts?clientId=${user.id}`,
        { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
      );
      const data = await res.json();
      setContacts(data?.records || []);
    } catch (err) {
      console.error(err);
    }
  };

  const generateInvoiceNumber = (type: "sales" | "purchase") => {
    const prefix = type === "sales" ? "INV" : "PO";
    const num = invoices.filter(i => i.type === type).length + 1;
    return `${prefix}-${String(num).padStart(4, "0")}`;
  };

  const addItem = () => {
    setNewInvoice(prev => ({
      ...prev,
      items: [...prev.items, { description: "", quantity: 1, unitPrice: 0 }],
    }));
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    setNewInvoice(prev => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const removeItem = (index: number) => {
    if (newInvoice.items.length <= 1) return;
    setNewInvoice(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const itemsTotal = newInvoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const isNewContact = newInvoice.contactName.trim() !== "" && !contacts.some(
    c => (c.fields["Contact Name"] || "").trim() === newInvoice.contactName.trim()
  );

  const createContactInAirtable = async (name: string) => {
    if (!user) return;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-contacts?clientId=${user.id}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contactName: name,
            contactType: newInvoice.type === "sales" ? "عميل" : "مورد",
          }),
        }
      );
      if (res.ok) {
        fetchContacts();
      }
    } catch (err) {
      console.error("Error creating contact:", err);
    }
  };

  const handleCreate = async () => {
    if (!newInvoice.contactName.trim()) {
      toast({ title: "يرجى اختيار جهة الاتصال", variant: "destructive" });
      return;
    }
    if (newInvoice.items.some(i => !i.description.trim() || i.unitPrice <= 0)) {
      toast({ title: "يرجى تعبئة جميع البنود بشكل صحيح", variant: "destructive" });
      return;
    }

    setCreating(true);

    // Auto-create contact if new
    if (isNewContact) {
      await createContactInAirtable(newInvoice.contactName.trim());
    }

    const invoice: Invoice = {
      id: crypto.randomUUID(),
      type: newInvoice.type,
      invoiceNumber: generateInvoiceNumber(newInvoice.type),
      date: newInvoice.date,
      contactName: newInvoice.contactName,
      items: newInvoice.items,
      notes: newInvoice.notes,
      status: "draft",
      total: itemsTotal,
      currency: newInvoice.currency,
    };

    const updated = [invoice, ...invoices];
    saveInvoices(updated);
    toast({ title: `تم إنشاء ${newInvoice.type === "sales" ? "فاتورة مبيعات" : "فاتورة مشتريات"} بنجاح ✅${isNewContact ? " وتم إضافة جهة الاتصال الجديدة" : ""}` });
    setShowCreateDialog(false);
    setCreating(false);
    setNewInvoice({
      type: "sales",
      contactName: "",
      date: new Date().toISOString().split("T")[0],
      notes: "",
      currency: "شيكل",
      items: [{ description: "", quantity: 1, unitPrice: 0 }],
    });
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html dir="rtl">
        <head>
          <title>فاتورة ${selectedInvoice?.invoiceNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'IBM Plex Sans Arabic', 'Segoe UI', sans-serif; }
            body { padding: 30px; color: #1a1a2e; }
            .invoice-header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 30px; border-bottom: 3px solid #2d8a5e; padding-bottom: 20px; }
            .invoice-title { font-size: 28px; font-weight: 700; color: #2d8a5e; }
            .invoice-meta { text-align: left; font-size: 13px; color: #555; }
            .invoice-meta span { display: block; margin-bottom: 4px; }
            .section { margin-bottom: 20px; }
            .section-title { font-size: 14px; font-weight: 600; color: #2d8a5e; margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background: #f0faf5; color: #2d8a5e; padding: 10px 12px; text-align: right; font-size: 13px; border-bottom: 2px solid #2d8a5e; }
            td { padding: 10px 12px; text-align: right; font-size: 13px; border-bottom: 1px solid #e8e8e8; }
            .total-row { background: #f0faf5; font-weight: 700; font-size: 15px; }
            .total-row td { border-top: 2px solid #2d8a5e; }
            .notes { background: #f9f9f9; padding: 12px; border-radius: 8px; font-size: 12px; color: #666; }
            .footer { text-align: center; margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #e8e8e8; padding-top: 15px; }
            @media print { body { padding: 15px; } }
          </style>
        </head>
        <body>${printContent}</body>
      </html>
    `);
    win.document.close();
    win.print();
  };

  const updateStatus = (id: string, status: Invoice["status"]) => {
    const updated = invoices.map(inv => inv.id === id ? { ...inv, status } : inv);
    saveInvoices(updated);
    if (selectedInvoice?.id === id) {
      setSelectedInvoice({ ...selectedInvoice, status });
    }
    toast({ title: "تم تحديث الحالة ✅" });
  };

  const filtered = invoices.filter(inv => {
    if (filterType !== "all" && inv.type !== filterType) return false;
    if (searchQuery && !inv.contactName.includes(searchQuery) && !inv.invoiceNumber.includes(searchQuery)) return false;
    return true;
  });

  const salesTotal = invoices.filter(i => i.type === "sales").reduce((s, i) => s + i.total, 0);
  const purchaseTotal = invoices.filter(i => i.type === "purchase").reduce((s, i) => s + i.total, 0);

  const statusConfig: Record<string, { label: string; color: string }> = {
    draft: { label: "مسودة", color: "bg-muted text-muted-foreground" },
    sent: { label: "مُرسلة", color: "bg-primary/10 text-primary" },
    paid: { label: "مدفوعة", color: "bg-success/20 text-success" },
  };

  return (
    <div className="px-4 pt-6 pb-24 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">الفواتير</h1>
            <p className="text-xs text-muted-foreground">{invoices.length} فاتورة</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4" /> إنشاء فاتورة
        </Button>
      </div>

      {/* Stats */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 p-4 border border-primary/10">
            <Receipt className="h-5 w-5 text-primary mb-1" />
            <p className="text-lg font-bold text-primary">₪{salesTotal.toLocaleString()}</p>
            <p className="text-[10px] text-primary/70 font-medium">فواتير المبيعات</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-destructive/5 to-destructive/10 p-4 border border-destructive/10">
            <ShoppingCart className="h-5 w-5 text-destructive mb-1" />
            <p className="text-lg font-bold text-destructive">₪{purchaseTotal.toLocaleString()}</p>
            <p className="text-[10px] text-destructive/70 font-medium">فواتير المشتريات</p>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      {invoices.length > 0 && (
        <>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="ابحث برقم الفاتورة أو اسم العميل..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pr-10 rounded-xl border-border/50 bg-muted/30" />
          </div>
          <div className="flex gap-2">
            {(["all", "sales", "purchase"] as const).map(type => (
              <button key={type} onClick={() => setFilterType(type)} className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${filterType === type ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                {type === "all" ? "الكل" : type === "sales" ? "مبيعات" : "مشتريات"}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}

      {/* Empty State */}
      {!loading && invoices.length === 0 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <FileText className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">لا توجد فواتير بعد</h3>
          <p className="text-xs text-muted-foreground mb-4">أنشئ أول فاتورة مبيعات أو مشتريات</p>
          <Button className="rounded-xl gap-2 shadow-md shadow-primary/20" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" /> إنشاء فاتورة
          </Button>
        </div>
      )}

      {/* Invoice List */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(inv => {
            const st = statusConfig[inv.status];
            return (
              <Card key={inv.id} className="border-0 shadow-sm rounded-2xl cursor-pointer hover:shadow-md transition-all" onClick={() => { setSelectedInvoice(inv); setShowPreviewDialog(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${inv.type === "sales" ? "bg-primary/10" : "bg-destructive/10"}`}>
                        {inv.type === "sales" ? <Receipt className="h-5 w-5 text-primary" /> : <ShoppingCart className="h-5 w-5 text-destructive" />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">{inv.contactName}</p>
                        <p className="text-[10px] text-muted-foreground">{inv.invoiceNumber} • {inv.date}</p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-foreground">₪{inv.total.toLocaleString()}</p>
                      <Badge className={`text-[9px] px-2 py-0 border-0 ${st.color}`}>{st.label}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Invoice Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-background" dir="rtl">
          <DialogHeader>
            <DialogTitle>إنشاء فاتورة جديدة</DialogTitle>
            <DialogDescription>أدخل بيانات الفاتورة</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Type */}
            <div className="flex gap-2">
              <button onClick={() => setNewInvoice(p => ({ ...p, type: "sales" }))} className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${newInvoice.type === "sales" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                فاتورة مبيعات
              </button>
              <button onClick={() => setNewInvoice(p => ({ ...p, type: "purchase" }))} className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${newInvoice.type === "purchase" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                فاتورة مشتريات
              </button>
            </div>

            {/* Contact & Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">جهة الاتصال</label>
                <Input placeholder="اسم العميل/المورد" value={newInvoice.contactName} onChange={e => setNewInvoice(p => ({ ...p, contactName: e.target.value }))} className="rounded-xl text-sm" list="contacts-list" />
                <datalist id="contacts-list">
                  {contacts.map(c => (
                    <option key={c.id} value={c.fields["Contact Name"] || ""} />
                  ))}
                </datalist>
                {isNewContact && (
                  <p className="text-[10px] text-primary mt-1 font-medium">✨ سيتم إنشاء جهة اتصال جديدة تلقائياً</p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">التاريخ</label>
                <Input type="date" value={newInvoice.date} onChange={e => setNewInvoice(p => ({ ...p, date: e.target.value }))} className="rounded-xl text-sm" dir="ltr" />
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-foreground">بنود الفاتورة</label>
                <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={addItem}>
                  <Plus className="h-3 w-3" /> إضافة بند
                </Button>
              </div>
              <div className="space-y-2">
                {newInvoice.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      {idx === 0 && <label className="text-[10px] text-muted-foreground block mb-1">الوصف</label>}
                      <Input placeholder="وصف البند" value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} className="rounded-lg text-xs" />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <label className="text-[10px] text-muted-foreground block mb-1">الكمية</label>}
                      <Input type="number" min={1} value={item.quantity} onChange={e => updateItem(idx, "quantity", Number(e.target.value))} className="rounded-lg text-xs" dir="ltr" />
                    </div>
                    <div className="col-span-3">
                      {idx === 0 && <label className="text-[10px] text-muted-foreground block mb-1">السعر</label>}
                      <Input type="number" min={0} value={item.unitPrice} onChange={e => updateItem(idx, "unitPrice", Number(e.target.value))} className="rounded-lg text-xs" dir="ltr" />
                    </div>
                    <div className="col-span-2 flex items-center justify-between">
                      {idx === 0 && <label className="text-[10px] text-muted-foreground block mb-1 invisible">x</label>}
                      <span className="text-xs font-bold text-foreground">₪{(item.quantity * item.unitPrice).toLocaleString()}</span>
                      {newInvoice.items.length > 1 && (
                        <button onClick={() => removeItem(idx)} className="text-destructive text-xs font-bold mr-1">✕</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-border/50">
                <span className="text-sm font-bold text-foreground">الإجمالي</span>
                <span className="text-lg font-bold text-primary">₪{itemsTotal.toLocaleString()}</span>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
              <Input placeholder="ملاحظات إضافية (اختياري)" value={newInvoice.notes} onChange={e => setNewInvoice(p => ({ ...p, notes: e.target.value }))} className="rounded-xl text-sm" />
            </div>

            <Button onClick={handleCreate} className="w-full rounded-xl py-5 text-sm font-bold" disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "إنشاء الفاتورة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview/Print Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-background" dir="rtl">
          <DialogHeader>
            <DialogTitle>معاينة الفاتورة</DialogTitle>
            <DialogDescription>{selectedInvoice?.invoiceNumber}</DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={handlePrint}>
                  <Printer className="h-4 w-4" /> طباعة
                </Button>
                <Select value={selectedInvoice.status} onValueChange={(v) => updateStatus(selectedInvoice.id, v as Invoice["status"])}>
                  <SelectTrigger className="w-32 text-xs rounded-xl h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    <SelectItem value="draft">مسودة</SelectItem>
                    <SelectItem value="sent">مُرسلة</SelectItem>
                    <SelectItem value="paid">مدفوعة</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Printable Invoice */}
              <div ref={printRef} className="bg-card rounded-2xl border border-border/50 p-5">
                <div className="invoice-header flex justify-between items-start mb-5 pb-4 border-b-2 border-primary">
                  <div>
                    <h2 className="invoice-title text-2xl font-bold text-primary">
                      {selectedInvoice.type === "sales" ? "فاتورة مبيعات" : "فاتورة مشتريات"}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">عبدالله AI للمحاسبة</p>
                  </div>
                  <div className="invoice-meta text-left text-xs text-muted-foreground space-y-1">
                    <span className="block"><strong>رقم الفاتورة:</strong> {selectedInvoice.invoiceNumber}</span>
                    <span className="block"><strong>التاريخ:</strong> {selectedInvoice.date}</span>
                    <span className="block"><strong>الحالة:</strong> {statusConfig[selectedInvoice.status].label}</span>
                  </div>
                </div>

                <div className="section mb-4">
                  <p className="section-title text-xs font-semibold text-primary mb-1">
                    {selectedInvoice.type === "sales" ? "العميل" : "المورد"}
                  </p>
                  <p className="text-sm font-bold text-foreground">{selectedInvoice.contactName}</p>
                </div>

                <table className="w-full text-xs mb-4">
                  <thead>
                    <tr className="bg-accent/30">
                      <th className="text-right p-2.5 font-semibold text-primary border-b-2 border-primary/20">#</th>
                      <th className="text-right p-2.5 font-semibold text-primary border-b-2 border-primary/20">الوصف</th>
                      <th className="text-right p-2.5 font-semibold text-primary border-b-2 border-primary/20">الكمية</th>
                      <th className="text-right p-2.5 font-semibold text-primary border-b-2 border-primary/20">السعر</th>
                      <th className="text-right p-2.5 font-semibold text-primary border-b-2 border-primary/20">المجموع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoice.items.map((item, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-card" : "bg-muted/20"}>
                        <td className="p-2.5 border-b border-border/30">{idx + 1}</td>
                        <td className="p-2.5 border-b border-border/30 font-medium">{item.description}</td>
                        <td className="p-2.5 border-b border-border/30">{item.quantity}</td>
                        <td className="p-2.5 border-b border-border/30">₪{item.unitPrice.toLocaleString()}</td>
                        <td className="p-2.5 border-b border-border/30 font-bold">₪{(item.quantity * item.unitPrice).toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="total-row bg-accent/20 font-bold text-sm">
                      <td colSpan={4} className="p-2.5 border-t-2 border-primary/30">الإجمالي</td>
                      <td className="p-2.5 border-t-2 border-primary/30 text-primary text-base">₪{selectedInvoice.total.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>

                {selectedInvoice.notes && (
                  <div className="notes bg-muted/30 rounded-xl p-3 text-xs text-muted-foreground">
                    <strong>ملاحظات:</strong> {selectedInvoice.notes}
                  </div>
                )}

                <div className="footer text-center mt-6 pt-4 border-t border-border/50 text-[10px] text-muted-foreground">
                  شكراً لتعاملكم معنا • عبدالله AI للمحاسبة
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoicesPage;
