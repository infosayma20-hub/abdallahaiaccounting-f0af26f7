import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate, Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, Upload, Loader2, Image as ImageIcon, X, Eye, CheckCircle2, CalendarIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { usePurchaseInvoices, useSuppliers } from "@/hooks/useProcurement";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompanyContext";
import BackButton from "@/components/BackButton";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import useFormDraft from "@/hooks/useFormDraft";
import DraftRestoreBanner from "@/components/forms/DraftRestoreBanner";
import AccountingShell from "@/components/layout/AccountingShell";

interface InvoiceLine {
  product_id: string | null;
  item_name: string;
  unit: string;
  ordered_quantity: number;
  received_quantity: number;
  unit_price: number;
  notes: string;
  expiry_date: string;
}

const ProcurementInvoiceCreatePage = () => {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId");

  // ─── Unification: direct purchase invoice creation now uses the unified
  // /invoices/new?type=purchase page (same UI/UX as sales). This page is kept
  // ONLY for the "receive from Purchase Order" flow which has unique logic
  // (received vs ordered quantity, supplier invoice image upload + AI extract,
  // writes to purchase_invoices with stock movements).
  if (!orderId) {
    return <Navigate to="/invoices/new?type=purchase" replace />;
  }

  return <ReceivePOInvoicePage orderId={orderId} />;
};

const ReceivePOInvoicePage = ({ orderId }: { orderId: string }) => {
  const navigate = useNavigate();
  const { createInvoice } = usePurchaseInvoices();
  const { suppliers } = useSuppliers();
  const { user } = useAuth();
  const { company } = useCompany();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(!!orderId);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [saving, setSaving] = useState(false);

  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [draftReady, setDraftReady] = useState(false);

  // ─── Auto-Draft: حفظ تلقائي يحمي من فقدان البيانات عند التنقل بين التبويبات ───
  // معطّل عند الإنشاء من Order (يتم تحميل البيانات من DB)
  const draftSnapshot = {
    supplierId, supplierName, branchId, invoiceDate, supplierInvoiceNumber,
    paymentStatus, discount, tax, notes, lines,
  };
  const { hasDraft, restoreDraft, clearDraft, draftSavedAt } = useFormDraft(
    "procurement_invoice_new",
    draftSnapshot,
    (draft: any) => {
      setSupplierId(draft.supplierId || "");
      setSupplierName(draft.supplierName || "");
      setBranchId(draft.branchId || "");
      setInvoiceDate(draft.invoiceDate || new Date().toISOString().split("T")[0]);
      setSupplierInvoiceNumber(draft.supplierInvoiceNumber || "");
      setPaymentStatus(draft.paymentStatus || "unpaid");
      setDiscount(Number(draft.discount) || 0);
      setTax(Number(draft.tax) || 0);
      setNotes(draft.notes || "");
      setLines(Array.isArray(draft.lines) ? draft.lines : []);
    },
    {
      enabled: !orderId,
      version: 1,
      scope: [user?.id || "anon", company?.id || "no-company", "/procurement/invoices/new", orderId ? "from-order" : "new"].join(":"),
      ready: draftReady,
      isEmpty: (data: any) =>
        !data.supplierId &&
        !data.supplierInvoiceNumber?.trim() &&
        !data.notes?.trim() &&
        (!data.lines?.length || data.lines.every((l: any) => !l.item_name?.trim() && !l.product_id)),
    }
  );

  useEffect(() => {
    if (!orderId) { setLoading(false); setDraftReady(true); return; }
    (async () => {
      const { data: order } = await supabase
        .from("procurement_orders" as any)
        .select("*, pos_suppliers(*)")
        .eq("id", orderId)
        .single();
      if (order) {
        const o = order as any;
        setSupplierId(o.supplier_id);
        setSupplierName(o.pos_suppliers?.name || "");
        setBranchId(o.branch_id || "");
        setOrderNumber(o.order_number || "");
        const { data: items } = await supabase
          .from("procurement_order_items" as any)
          .select("*")
          .eq("order_id", orderId);
        
        const loadedLines = ((items as any) || []).map((i: any) => ({
          product_id: i.product_id || null,
          item_name: i.item_name,
          unit: i.unit,
          ordered_quantity: Number(i.quantity),
          received_quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
          notes: "",
          expiry_date: "",
        }));
        setLines(loadedLines);
        
        if (loadedLines.length === 0) {
          console.warn("No items found for order", orderId);
        }
      }
      setLoading(false);
      setDraftReady(true);
    })();
  }, [orderId]);

  const subtotal = lines.reduce((s, l) => s + l.received_quantity * l.unit_price, 0);
  const total = subtotal - discount + tax;

  const updateLine = (idx: number, field: string, value: any) => {
    setLines(lines.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  // Handle image selection
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم الملف كبير جداً (الحد الأقصى 10 ميجا)");
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Upload to storage
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${user?.id}/${Date.now()}.${ext}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("purchase-invoices")
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      toast.error("فشل رفع الصورة: " + uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("purchase-invoices").getPublicUrl(fileName);
    setUploadedImageUrl(urlData.publicUrl);
    setUploading(false);
    toast.success("تم رفع الصورة بنجاح");

    // Try to extract invoice number using AI
    extractInvoiceNumber(reader.result as string);
  };

  const extractInvoiceNumber = async (base64Image: string) => {
    if (!base64Image) return;
    setExtracting(true);
    try {
      const response = await supabase.functions.invoke("analyze-document", {
        body: {
          image: base64Image,
          task: "extract_invoice_number",
          prompt: "Extract the invoice number from this document image. Return ONLY the invoice number as plain text, nothing else. If no invoice number is found, return 'NOT_FOUND'."
        },
      });

      if (response.data?.invoice_number && response.data.invoice_number !== "NOT_FOUND") {
        setSupplierInvoiceNumber(response.data.invoice_number);
        toast.success(`تم استخراج رقم الفاتورة: ${response.data.invoice_number}`);
      } else if (response.data?.text) {
        // Try to extract from raw text
        const text = response.data.text;
        const patterns = [
          /(?:Invoice\s*(?:No\.?|Number|#)|فاتورة\s*(?:رقم|#))\s*[:\-]?\s*([A-Za-z0-9\-\/]+)/i,
          /(?:INV|inv)[.\-#]?\s*([A-Za-z0-9\-]+)/i,
          /(?:رقم|#)\s*[:\-]?\s*(\d[\d\-\/]+)/,
        ];
        for (const p of patterns) {
          const match = text.match(p);
          if (match?.[1]) {
            setSupplierInvoiceNumber(match[1].trim());
            toast.success(`تم استخراج رقم الفاتورة: ${match[1].trim()}`);
            break;
          }
        }
      }
    } catch (err) {
      console.error("AI extraction failed:", err);
    } finally {
      setExtracting(false);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setUploadedImageUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async () => {
    if (!supplierId || lines.length === 0) {
      toast.error("اختر المورد وأضف بنوداً");
      return;
    }
    setSaving(true);
    const result = await createInvoice(
      {
        supplier_id: supplierId,
        supplier_name: supplierName,
        branch_id: branchId,
        invoice_date: invoiceDate,
        supplier_invoice_number: supplierInvoiceNumber,
        payment_status: paymentStatus,
        discount,
        tax,
        notes,
        image_url: uploadedImageUrl,
      },
      lines,
      orderId || undefined
    );
    setSaving(false);
    if (result) {
      clearDraft();
      navigate("/procurement/invoices");
    }
  };

  if (loading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <AccountingShell>
    <div className="mx-auto max-w-[1180px] p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center gap-3">
        <div onClick={() => { if (!orderId) clearDraft(); }}>
          <BackButton />
        </div>
        <h1 className="text-xl font-bold text-foreground">استلام بضاعة وإنشاء فاتورة</h1>
        {orderNumber && <Badge variant="outline" className="font-mono">{orderNumber}</Badge>}
        <div className="flex-1" />
        {/* Top quick action — same handler as bottom button */}
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || lines.length === 0 || !supplierId}
                  className="h-8 gap-1.5 text-xs font-bold"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  تأكيد وتسجيل
                </Button>
              </span>
            </TooltipTrigger>
            {(lines.length === 0 || !supplierId) && (
              <TooltipContent side="bottom">
                <p className="text-xs">
                  {!supplierId ? "اختر المورد أولاً" : "أضف بنداً واحداً على الأقل"}
                </p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      {hasDraft && !orderId && (
        <DraftRestoreBanner
          onRestore={restoreDraft}
          onDismiss={clearDraft}
          savedAt={draftSavedAt}
          label="يوجد مسودة فاتورة مشتريات لم تُحفظ"
        />
      )}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px] gap-3">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <Label>المورد</Label>
              {orderId ? (
                <Input value={supplierName} disabled />
              ) : (
                <Select value={supplierId} onValueChange={v => { setSupplierId(v); setSupplierName(suppliers.find(s => s.id === v)?.name || ""); }}>
                  <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label>رقم فاتورة المورد</Label>
              <div className="flex gap-2 items-center">
                <Input 
                  value={supplierInvoiceNumber} 
                  onChange={e => setSupplierInvoiceNumber(e.target.value)} 
                  placeholder="رقم الفاتورة من المورد" 
                  className="flex-1"
                />
                {extracting && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <Label>تاريخ الفاتورة</Label>
              <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
            </div>
            <div>
              <Label>حالة الدفع</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">غير مدفوعة (آجل)</SelectItem>
                  <SelectItem value="paid">مدفوعة نقداً</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-3">
            {/* Image upload */}
            <div>
              <Label>إرفاق صورة المستند</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={handleImageSelect}
              />
              {!imagePreview ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-20 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      <span className="text-xs">اضغط لرفع صورة الفاتورة</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="relative group">
                  <img
                    src={imagePreview}
                    alt="صورة الفاتورة"
                    className="w-full h-20 object-cover rounded-xl border cursor-pointer"
                    onClick={() => setShowPreview(true)}
                  />
                  <div className="absolute top-1 left-1 flex gap-1">
                    <button
                      onClick={() => setShowPreview(true)}
                      className="bg-background/80 rounded-full p-1 hover:bg-background"
                    >
                      <Eye className="h-3 w-3" />
                    </button>
                    <button
                      onClick={removeImage}
                      className="bg-destructive/80 text-destructive-foreground rounded-full p-1 hover:bg-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {extracting && (
                    <div className="absolute inset-0 bg-background/60 rounded-xl flex items-center justify-center">
                      <div className="flex items-center gap-2 text-xs text-primary">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        جارٍ استخراج البيانات...
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">بنود الاستلام</CardTitle>
            {lines.length === 0 && orderId && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 ml-1" />
                لم يتم العثور على بنود الطلبية
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {lines.length > 0 ? (
            <div className="overflow-x-auto">
              <Table className="min-w-[940px] [&_th]:text-center [&_td]:align-middle">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[320px] text-right">الصنف</TableHead>
                    <TableHead className="w-[90px]">الوحدة</TableHead>
                    <TableHead className="w-[110px]">الكمية المطلوبة</TableHead>
                    <TableHead className="w-[120px] bg-muted/40">الكمية المستلمة</TableHead>
                    <TableHead className="w-[130px] bg-muted/40">السعر الفعلي</TableHead>
                    <TableHead className="w-[130px] bg-muted/40">الإجمالي</TableHead>
                    <TableHead className="w-[160px] bg-amber-50 dark:bg-amber-950/20">الصلاحية</TableHead>
                    <TableHead className="w-[170px] text-right">ملاحظة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => {
                    const variance = line.received_quantity < line.ordered_quantity;
                    return (
                      <TableRow key={idx} className={variance ? "bg-destructive/5" : ""}>
                        <TableCell className="font-medium text-right">{line.item_name}</TableCell>
                        <TableCell className="text-center">{line.unit}</TableCell>
                        <TableCell className="text-center tabular-nums">{line.ordered_quantity}</TableCell>
                        <TableCell className="bg-muted/20">
                          <div className="flex items-center justify-center gap-1">
                            <Input
                              type="number"
                              value={line.received_quantity}
                              onChange={e => updateLine(idx, "received_quantity", Number(e.target.value))}
                              className="h-8 w-24 text-center bg-background"
                            />
                            {variance && <AlertTriangle className="h-4 w-4 text-destructive" />}
                          </div>
                        </TableCell>
                        <TableCell className="bg-muted/20">
                          <Input
                            type="number"
                            value={line.unit_price}
                            onChange={e => updateLine(idx, "unit_price", Number(e.target.value))}
                            className="h-8 w-28 text-center bg-background"
                          />
                        </TableCell>
                        <TableCell className="bg-muted/20 text-center font-bold tabular-nums">{(line.received_quantity * line.unit_price).toLocaleString("en", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="bg-amber-50/40 dark:bg-amber-950/10">
                          <ExpiryDateCell
                            value={line.expiry_date}
                            minDate={invoiceDate}
                            onChange={(v) => updateLine(idx, "expiry_date", v)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.notes}
                            onChange={e => updateLine(idx, "notes", e.target.value)}
                            className="h-8 w-full text-xs bg-background"
                            placeholder="ملاحظة"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {orderId ? "لا توجد بنود محفوظة لهذه الطلبية" : "لم يتم إضافة بنود بعد"}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col items-end gap-1 text-sm max-w-xs mr-auto">
            <div className="flex justify-between w-full">
              <span className="text-muted-foreground">المجموع الفرعي</span>
              <span>{subtotal.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</span>
            </div>
            <div className="flex justify-between w-full items-center">
              <span className="text-muted-foreground">خصم</span>
              <Input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value))} className="h-7 w-24 text-center text-xs" />
            </div>
            <div className="flex justify-between w-full items-center">
              <span className="text-muted-foreground">ضريبة</span>
              <Input type="number" value={tax} onChange={e => setTax(Number(e.target.value))} className="h-7 w-24 text-center text-xs" />
            </div>
            <div className="flex justify-between w-full border-t pt-2 text-base font-bold">
              <span>الإجمالي النهائي</span>
              <span>{total.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</span>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="accent" onClick={handleSave} disabled={saving || lines.length === 0} className="min-w-[200px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Check className="h-4 w-4 ml-1" />}
              تأكيد وتسجيل الفاتورة
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Image preview dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-2">
          {imagePreview && (
            <img src={imagePreview} alt="صورة الفاتورة" className="w-full h-auto rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
    </AccountingShell>
  );
};

export default ProcurementInvoiceCreatePage;
