import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, RefreshCw, Trash2, Pencil, Pause, Play, Calendar, Clock } from "lucide-react";

interface RecurringInvoice {
  id: string;
  contact_name: string;
  contact_id: string | null;
  invoice_type: string;
  frequency: string;
  interval_value: number;
  start_date: string;
  end_date: string | null;
  next_due_date: string;
  last_generated_at: string | null;
  items: any[];
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  currency: string;
  payment_method: string;
  notes: string | null;
  auto_send: boolean;
  is_active: boolean;
  generated_count: number;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
}

const FREQ_LABELS: Record<string, string> = {
  weekly: "أسبوعي",
  monthly: "شهري",
  quarterly: "ربع سنوي",
  semi_annual: "نصف سنوي",
  yearly: "سنوي",
};

const emptyItem: InvoiceItem = { description: "", quantity: 1, unit_price: 0, tax_rate: 0 };

const RecurringInvoicesPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<RecurringInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [contactName, setContactName] = useState("");
  const [invoiceType, setInvoiceType] = useState("sale");
  const [frequency, setFrequency] = useState("monthly");
  const [intervalValue, setIntervalValue] = useState(1);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([{ ...emptyItem }]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [autoSend, setAutoSend] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchInvoices = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("recurring_invoices")
      .select("*")
      .eq("user_id", dataOwnerId!)
      .order("created_at", { ascending: false });
    setInvoices((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchInvoices(); }, [user]);

  const resetForm = () => {
    setContactName("");
    setInvoiceType("sale");
    setFrequency("monthly");
    setIntervalValue(1);
    setStartDate(new Date().toISOString().split("T")[0]);
    setEndDate("");
    setItems([{ ...emptyItem }]);
    setPaymentMethod("cash");
    setNotes("");
    setAutoSend(false);
    setEditingId(null);
  };

  const calcTotals = () => {
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const tax = items.reduce((s, i) => s + (i.quantity * i.unit_price * i.tax_rate / 100), 0);
    return { subtotal, tax_amount: tax, total_amount: subtotal + tax };
  };

  const handleSave = async () => {
    if (!user || !contactName.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم العميل", variant: "destructive" });
      return;
    }
    if (items.every(i => !i.description.trim())) {
      toast({ title: "خطأ", description: "يرجى إضافة بند واحد على الأقل", variant: "destructive" });
      return;
    }

    setSaving(true);
    const totals = calcTotals();
    const payload = {
      user_id: user.id,
      contact_name: contactName,
      invoice_type: invoiceType,
      frequency,
      interval_value: intervalValue,
      start_date: startDate,
      end_date: endDate || null,
      next_due_date: startDate,
      items: items.filter(i => i.description.trim()),
      ...totals,
      payment_method: paymentMethod,
      notes: notes || null,
      auto_send: autoSend,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("recurring_invoices").update(payload as any).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("recurring_invoices").insert(payload as any));
    }

    setSaving(false);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم", description: editingId ? "تم تحديث الفاتورة الدورية" : "تم إنشاء الفاتورة الدورية" });
      setDialogOpen(false);
      resetForm();
      fetchInvoices();
    }
  };

  const toggleActive = async (inv: RecurringInvoice) => {
    await supabase.from("recurring_invoices").update({ is_active: !inv.is_active } as any).eq("id", inv.id);
    fetchInvoices();
  };

  const deleteInvoice = async (id: string) => {
    await supabase.from("recurring_invoices").delete().eq("id", id);
    toast({ title: "تم الحذف" });
    fetchInvoices();
  };

  const openEdit = (inv: RecurringInvoice) => {
    setEditingId(inv.id);
    setContactName(inv.contact_name);
    setInvoiceType(inv.invoice_type);
    setFrequency(inv.frequency);
    setIntervalValue(inv.interval_value);
    setStartDate(inv.start_date);
    setEndDate(inv.end_date || "");
    setItems(inv.items.length ? inv.items : [{ ...emptyItem }]);
    setPaymentMethod(inv.payment_method);
    setNotes(inv.notes || "");
    setAutoSend(inv.auto_send);
    setDialogOpen(true);
  };

  const updateItem = (idx: number, field: keyof InvoiceItem, value: any) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const fmt = (n: number) => `₪${n.toLocaleString("en", { minimumFractionDigits: 2 })}`;
  const totals = calcTotals();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1200px] mx-auto" dir="rtl">
      <PageHeader
        title="الفواتير الدورية"
        breadcrumb={["الفواتير", "الفواتير الدورية"]}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{invoices.length}</p>
            <p className="text-xs text-muted-foreground">إجمالي</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{invoices.filter(i => i.is_active).length}</p>
            <p className="text-xs text-muted-foreground">نشطة</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{invoices.filter(i => !i.is_active).length}</p>
            <p className="text-xs text-muted-foreground">متوقفة</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">
              {fmt(invoices.filter(i => i.is_active).reduce((s, i) => s + i.total_amount, 0))}
            </p>
            <p className="text-xs text-muted-foreground">إيراد شهري متوقع</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          فاتورة دورية جديدة
        </Button>
        <Button variant="outline" size="sm" onClick={fetchInvoices} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          تحديث
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">جاري التحميل...</div>
      ) : invoices.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
            <h3 className="text-lg font-bold text-foreground mb-2">لا توجد فواتير دورية</h3>
            <p className="text-sm text-muted-foreground mb-4">أنشئ فاتورة دورية لأتمتة الفوترة المتكررة</p>
            <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" />
              إنشاء أول فاتورة دورية
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">العميل</TableHead>
                  <TableHead className="text-right">النوع</TableHead>
                  <TableHead className="text-right">التكرار</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-right">الفاتورة القادمة</TableHead>
                  <TableHead className="text-right">تم إنشاء</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.contact_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {inv.invoice_type === "sale" ? "بيع" : "شراء"}
                      </Badge>
                    </TableCell>
                    <TableCell>{FREQ_LABELS[inv.frequency] || inv.frequency}</TableCell>
                    <TableCell className="font-mono">{fmt(inv.total_amount)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {inv.next_due_date}
                      </div>
                    </TableCell>
                    <TableCell>{inv.generated_count} فواتير</TableCell>
                    <TableCell>
                      <Badge variant={inv.is_active ? "default" : "secondary"}>
                        {inv.is_active ? "نشطة" : "متوقفة"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(inv)} title="تعديل">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => toggleActive(inv)} title={inv.is_active ? "إيقاف" : "تفعيل"}>
                          {inv.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteInvoice(inv.id)} title="حذف" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetForm(); setDialogOpen(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل فاتورة دورية" : "فاتورة دورية جديدة"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">اسم العميل / المورد *</label>
                <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="مثال: شركة النور" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">نوع الفاتورة</label>
                <Select value={invoiceType} onValueChange={setInvoiceType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sale">فاتورة بيع</SelectItem>
                    <SelectItem value="purchase">فاتورة شراء</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Frequency */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">التكرار</label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">أسبوعي</SelectItem>
                    <SelectItem value="monthly">شهري</SelectItem>
                    <SelectItem value="quarterly">ربع سنوي</SelectItem>
                    <SelectItem value="semi_annual">نصف سنوي</SelectItem>
                    <SelectItem value="yearly">سنوي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">كل</label>
                <Input type="number" min={1} value={intervalValue} onChange={e => setIntervalValue(+e.target.value || 1)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">طريقة الدفع</label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقدي</SelectItem>
                    <SelectItem value="transfer">تحويل</SelectItem>
                    <SelectItem value="cheque">شيك</SelectItem>
                    <SelectItem value="credit">آجل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">تاريخ البدء *</label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">تاريخ الانتهاء (اختياري)</label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <label className="text-sm font-medium">بنود الفاتورة</label>
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-5"
                    placeholder="الوصف"
                    value={item.description}
                    onChange={e => updateItem(idx, "description", e.target.value)}
                  />
                  <Input
                    className="col-span-2"
                    type="number"
                    placeholder="الكمية"
                    value={item.quantity}
                    onChange={e => updateItem(idx, "quantity", +e.target.value || 0)}
                  />
                  <Input
                    className="col-span-2"
                    type="number"
                    placeholder="السعر"
                    value={item.unit_price}
                    onChange={e => updateItem(idx, "unit_price", +e.target.value || 0)}
                  />
                  <Input
                    className="col-span-2"
                    type="number"
                    placeholder="ضريبة %"
                    value={item.tax_rate}
                    onChange={e => updateItem(idx, "tax_rate", +e.target.value || 0)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="col-span-1"
                    onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setItems(prev => [...prev, { ...emptyItem }])}>
                <Plus className="h-3.5 w-3.5 ml-1" /> إضافة بند
              </Button>
            </div>

            {/* Totals */}
            <div className="bg-muted rounded-xl p-4 space-y-1 text-sm">
              <div className="flex justify-between"><span>المجموع الفرعي</span><span className="font-mono">{fmt(totals.subtotal)}</span></div>
              <div className="flex justify-between"><span>الضريبة</span><span className="font-mono">{fmt(totals.tax_amount)}</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
                <span>الإجمالي</span><span className="font-mono">{fmt(totals.total_amount)}</span>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">ملاحظات</label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." rows={2} />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? "جاري الحفظ..." : editingId ? "تحديث" : "إنشاء"}
              </Button>
              <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>
                إلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecurringInvoicesPage;
