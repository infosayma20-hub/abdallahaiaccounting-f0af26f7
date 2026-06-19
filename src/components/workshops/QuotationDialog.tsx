import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, FileText, Eye, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

export interface QuotationLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface QuotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workshopId: string;
  workshopName: string;
  clientName: string;
  budget: number;
  userId: string;
  companyName: string;
  logoUrl: string;
  onPreview: (data: QuotationData) => void;
}

export interface QuotationData {
  id?: string;
  quote_number: string;
  client_name: string;
  client_address: string;
  items: QuotationLineItem[];
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  tax_enabled: boolean;
  tax_amount: number;
  total: number;
  validity_days: number;
  quote_date: string;
  payment_terms: string;
  notes: string;
  status: string;
  workshop_name?: string;
  company_name?: string;
  logo_url?: string;
  created_at?: string;
}

const QuotationDialog = ({
  open, onOpenChange, workshopId, workshopName, clientName, budget, userId,
  companyName, logoUrl, onPreview,
}: QuotationDialogProps) => {
  const [tab, setTab] = useState<"create" | "log">("create");
  const [clientNameField, setClientNameField] = useState(clientName);
  const [clientAddress, setClientAddress] = useState("");
  const [items, setItems] = useState<QuotationLineItem[]>([
    { description: "", quantity: 1, unit_price: 0, total: 0 },
  ]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [validityDays, setValidityDays] = useState(30);
  const [quoteDate, setQuoteDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<QuotationData[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setClientNameField(clientName);
      setTab("create");
      loadHistory();
    }
  }, [open, clientName]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    let query = supabase
      .from("quotations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (workshopId) {
      query = query.eq("workshop_id", workshopId);
    }
    const { data } = await query;
    if (data) {
      setHistory(data.map((q: any) => ({
        id: q.id,
        quote_number: q.quote_number,
        client_name: q.client_name,
        client_address: q.client_address || "",
        items: (q.items as any) || [],
        subtotal: Number(q.subtotal),
        discount_percent: Number(q.discount_percent),
        discount_amount: Number(q.discount_amount),
        tax_enabled: q.tax_enabled,
        tax_amount: Number(q.tax_amount),
        total: Number(q.total),
        validity_days: q.validity_days,
        quote_date: q.quote_date,
        payment_terms: q.payment_terms || "",
        notes: q.notes || "",
        status: q.status,
        created_at: q.created_at,
      })));
    }
    setLoadingHistory(false);
  }, [userId, workshopId]);

  const updateItem = (i: number, field: keyof QuotationLineItem, value: any) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item;
      const updated = { ...item, [field]: value };
      updated.total = (updated.quantity || 0) * (updated.unit_price || 0);
      return updated;
    }));
  };

  const addItem = () => setItems(prev => [...prev, { description: "", quantity: 1, unit_price: 0, total: 0 }]);
  const removeItem = (i: number) => { if (items.length > 1) setItems(prev => prev.filter((_, idx) => idx !== i)); };

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = taxEnabled ? afterDiscount * 0.16 : 0;
  const total = afterDiscount + taxAmount;

  const generateQuoteNumber = async (): Promise<string> => {
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from("quotations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    const seq = String((count || 0) + 1).padStart(4, "0");
    return `QUO-${year}-${seq}`;
  };

  const buildData = (quoteNumber: string): QuotationData => ({
    quote_number: quoteNumber,
    client_name: clientNameField,
    client_address: clientAddress,
    items,
    subtotal,
    discount_percent: discountPercent,
    discount_amount: discountAmount,
    tax_enabled: taxEnabled,
    tax_amount: taxAmount,
    total,
    validity_days: validityDays,
    quote_date: quoteDate,
    payment_terms: paymentTerms,
    notes,
    status: "draft",
    workshop_name: workshopName,
    company_name: companyName,
    logo_url: logoUrl,
  });

  const handleSave = async () => {
    if (!items.some(i => i.description.trim())) {
      toast.error("يرجى إضافة بند واحد على الأقل");
      return;
    }
    setSaving(true);
    try {
      const quoteNumber = await generateQuoteNumber();
      const { error } = await supabase.from("quotations").insert({
        user_id: userId,
        workshop_id: workshopId || null,
        quote_number: quoteNumber,
        client_name: clientNameField,
        client_address: clientAddress,
        items: items as any,
        subtotal,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        tax_enabled: taxEnabled,
        tax_amount: taxAmount,
        total,
        validity_days: validityDays,
        quote_date: quoteDate,
        payment_terms: paymentTerms,
        notes,
        status: "draft",
      } as any);
      if (error) throw error;
      toast.success(`✅ تم إنشاء عرض السعر ${quoteNumber} بنجاح`);
      await loadHistory();
      setTab("log");
    } catch (e: any) {
      toast.error("خطأ: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    const quoteNumber = `QUO-PREVIEW`;
    onPreview(buildData(quoteNumber));
  };

  const statusLabel: Record<string, { label: string; color: string }> = {
    draft: { label: "مسودة", color: "bg-muted text-muted-foreground" },
    sent: { label: "مرسل", color: "bg-blue-100 text-blue-700" },
    accepted: { label: "مقبول ✅", color: "bg-emerald-100 text-emerald-700" },
    rejected: { label: "مرفوض", color: "bg-red-100 text-red-700" },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            إنشاء عرض سعر
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          <button
            onClick={() => setTab("create")}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${tab === "create" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            إنشاء جديد
          </button>
          <button
            onClick={() => { setTab("log"); loadHistory(); }}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${tab === "log" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            السجل ({history.length})
          </button>
        </div>

        {tab === "create" ? (
          <div className="space-y-4">
            {/* Recipient */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold flex items-center gap-1">📋 بيانات المستلم</Label>
              <Input value={clientNameField} onChange={e => setClientNameField(e.target.value)} placeholder="اسم العميل" className="h-9" />
              <Input value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="العنوان / الجهة" className="h-9" />
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">═══ بنود عرض السعر ═══</Label>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-right text-xs w-8">#</TableHead>
                      <TableHead className="text-right text-xs">البند/الخدمة</TableHead>
                      <TableHead className="text-right text-xs w-20">الكمية</TableHead>
                      <TableHead className="text-right text-xs w-28">سعر الوحدة</TableHead>
                      <TableHead className="text-right text-xs w-28">الإجمالي</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs" value={item.description} onChange={e => updateItem(i, "description", e.target.value)} placeholder="وصف البند" />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs" type="number" min={0} value={item.quantity || ""} onChange={e => updateItem(i, "quantity", Number(e.target.value))} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 text-xs" type="number" min={0} value={item.unit_price || ""} onChange={e => updateItem(i, "unit_price", Number(e.target.value))} />
                        </TableCell>
                        <TableCell className="text-xs font-medium">{item.total.toLocaleString()} ₪</TableCell>
                        <TableCell>
                          {items.length > 1 && (
                            <button onClick={() => removeItem(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <button onClick={addItem} className="flex items-center gap-1.5 w-full justify-center py-2 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted/30 transition-colors">
                <Plus className="h-3.5 w-3.5" /> إضافة بند
              </button>
            </div>

            {/* Totals */}
            <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">المجموع الفرعي:</span>
                <span className="font-medium">{subtotal.toLocaleString()} ₪</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">الخصم %:</span>
                <div className="flex items-center gap-2">
                  <Input className="h-7 w-16 text-xs" type="number" min={0} max={100} value={discountPercent || ""} onChange={e => setDiscountPercent(Number(e.target.value))} />
                  <span className="text-xs text-muted-foreground w-20 text-left">−{discountAmount.toLocaleString()} ₪</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">ضريبة القيمة المضافة (16%):</span>
                <div className="flex items-center gap-2">
                  <Switch checked={taxEnabled} onCheckedChange={setTaxEnabled} />
                  {taxEnabled && <span className="text-xs">{taxAmount.toLocaleString()} ₪</span>}
                </div>
              </div>
              <div className="flex justify-between border-t pt-2 font-bold">
                <span>الإجمالي النهائي:</span>
                <span className="text-primary">{total.toLocaleString()} ₪</span>
              </div>
            </div>

            {/* Meta fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">تاريخ العرض</Label>
                <Input className="h-9 mt-1" type="date" value={quoteDate} onChange={e => setQuoteDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">صلاحية العرض (أيام)</Label>
                <Input className="h-9 mt-1" type="number" min={1} value={validityDays} onChange={e => setValidityDays(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">شروط الدفع</Label>
              <Input className="h-9 mt-1" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="مثال: 50% مقدم، 50% عند التسليم" />
            </div>
            <div>
              <Label className="text-xs">ملاحظات إضافية (اختياري)</Label>
              <Textarea className="mt-1 min-h-[60px]" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات إضافية تُضاف للعرض..." />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button variant="outline" className="gap-1" onClick={handlePreview}>
                <Eye className="h-3.5 w-3.5" /> معاينة
              </Button>
              <Button className="flex-1 gap-1" onClick={handleSave} disabled={saving}>
                {saving ? "جاري الحفظ..." : "إنشاء العرض"}
              </Button>
            </div>
          </div>
        ) : (
          /* LOG TAB */
          <div className="space-y-2">
            {loadingHistory ? (
              <div className="text-center py-8 text-muted-foreground text-sm">جاري التحميل...</div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">لا توجد عروض سعر سابقة</div>
            ) : (
              history.map(q => (
                <div key={q.id} className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">{q.quote_number}</div>
                    <div className="text-xs text-muted-foreground">
                      {q.quote_date} | {Number(q.total).toLocaleString()} ₪
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] ${statusLabel[q.status]?.color || ""}`}>
                      {statusLabel[q.status]?.label || q.status}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                      onPreview({ ...q, workshop_name: workshopName, company_name: companyName, logo_url: logoUrl });
                    }}>
                      <Eye className="h-3 w-3" /> معاينة
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QuotationDialog;
