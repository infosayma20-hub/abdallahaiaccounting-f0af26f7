import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer, Mail, X, CheckCircle, Send } from "lucide-react";
import { toast } from "sonner";

interface ReceiptItem {
  name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  total: number;
  note: string;
}

interface ReceiptData {
  orderNumber: string;
  date: string;
  cashierName: string;
  companyName: string;
  terminalName: string;
  customerName: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: string;
  tenderedAmount: number;
  change: number;
  currency: string;
  orderNote: string;
}

interface POSReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ReceiptData | null;
}

const paymentMethodLabel: Record<string, string> = {
  cash: "نقد",
  card: "شبكة",
  credit: "آجل",
};

export default function POSReceiptDialog({ open, onOpenChange, data }: POSReceiptDialogProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  if (!data) return null;

  const handlePrint = () => {
    const content = receiptRef.current;
    if (!content) return;

    const printWindow = window.open("", "_blank", "width=320,height=600");
    if (!printWindow) {
      toast.error("يرجى السماح بالنوافذ المنبثقة للطباعة");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>إيصال بيع</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            width: 80mm;
            padding: 4mm;
            color: #000;
            direction: rtl;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 4px 0; }
          .double-line { border-top: 2px solid #000; margin: 6px 0; }
          .row { display: flex; justify-content: space-between; padding: 1px 0; }
          .item-row { padding: 2px 0; }
          .item-name { font-weight: bold; }
          .item-detail { font-size: 11px; color: #333; padding-right: 8px; }
          .total-row { font-size: 16px; font-weight: bold; }
          .header { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
          .sub-header { font-size: 11px; color: #555; }
          .footer { font-size: 10px; color: #666; margin-top: 8px; }
          .note { font-size: 10px; color: #555; padding-right: 8px; font-style: italic; }
          .barcode { 
            text-align: center; 
            font-family: 'Libre Barcode 39', monospace;
            font-size: 32px;
            margin: 6px 0;
            letter-spacing: 2px;
          }
        </style>
      </head>
      <body>
        ${content.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  };

  const handleSendEmail = async () => {
    if (!email.trim()) {
      toast.error("يرجى إدخال البريد الإلكتروني");
      return;
    }
    setSending(true);
    try {
      // Build HTML receipt for email
      const receiptHtml = receiptRef.current?.innerHTML || "";
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-pos-receipt`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${(await (await import("@/integrations/supabase/client")).supabase.auth.getSession()).data.session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            to: email.trim(),
            subject: `إيصال بيع رقم ${data.orderNumber} - ${data.companyName}`,
            receiptData: data,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "فشل في الإرسال");
      }

      toast.success(`✅ تم إرسال الإيصال إلى ${email}`);
      setShowEmail(false);
      setEmail("");
    } catch (err: any) {
      toast.error(err.message || "خطأ في إرسال البريد");
    } finally {
      setSending(false);
    }
  };

  const now = new Date(data.date);
  const dateStr = now.toLocaleDateString("ar-PS", { year: "numeric", month: "2-digit", day: "2-digit" });
  const timeStr = now.toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            تم البيع بنجاح
          </DialogTitle>
        </DialogHeader>

        {/* Receipt Preview */}
        <div className="bg-white text-black rounded-lg border border-border overflow-hidden">
          <div
            ref={receiptRef}
            className="p-4 text-xs font-mono leading-relaxed"
            style={{ fontFamily: "'Courier New', monospace", fontSize: "12px", direction: "rtl" }}
          >
            {/* Header */}
            <div className="center" style={{ textAlign: "center" }}>
              <div className="header" style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "4px" }}>
                {data.companyName}
              </div>
              <div className="sub-header" style={{ fontSize: "11px", color: "#555" }}>
                {data.terminalName}
              </div>
              <div style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}>
                {dateStr} | {timeStr}
              </div>
            </div>

            <div className="double-line" style={{ borderTop: "2px solid #000", margin: "6px 0" }} />

            {/* Order info */}
            <div className="row" style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
              <span>رقم الطلب:</span>
              <span style={{ fontWeight: "bold" }}>{data.orderNumber}</span>
            </div>
            <div className="row" style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
              <span>الكاشير:</span>
              <span>{data.cashierName}</span>
            </div>
            {data.customerName && (
              <div className="row" style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
                <span>العميل:</span>
                <span>{data.customerName}</span>
              </div>
            )}

            <div className="line" style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

            {/* Items */}
            <div style={{ fontWeight: "bold", textAlign: "center", fontSize: "11px", padding: "2px 0" }}>
              الأصناف
            </div>
            <div className="line" style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

            {data.items.map((item, i) => (
              <div key={i} style={{ padding: "3px 0" }}>
                <div style={{ fontWeight: "bold" }}>{item.name}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#333", paddingRight: "8px" }}>
                  <span>{item.qty} × ₪{item.unit_price.toFixed(2)}</span>
                  <span style={{ fontWeight: "bold" }}>₪{item.total.toFixed(2)}</span>
                </div>
                {item.discount_pct > 0 && (
                  <div style={{ fontSize: "10px", color: "#555", paddingRight: "8px" }}>
                    خصم: {item.discount_pct}%
                  </div>
                )}
                {item.note && (
                  <div style={{ fontSize: "10px", color: "#555", paddingRight: "8px", fontStyle: "italic" }}>
                    📝 {item.note}
                  </div>
                )}
              </div>
            ))}

            <div className="line" style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

            {/* Totals */}
            <div className="row" style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
              <span>المجموع الفرعي:</span>
              <span>₪{data.subtotal.toFixed(2)}</span>
            </div>
            {data.tax > 0 && (
              <div className="row" style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
                <span>الضريبة:</span>
                <span>₪{data.tax.toFixed(2)}</span>
              </div>
            )}
            {data.discount > 0 && (
              <div className="row" style={{ display: "flex", justifyContent: "space-between", padding: "1px 0", color: "#c00" }}>
                <span>الخصم:</span>
                <span>-₪{data.discount.toFixed(2)}</span>
              </div>
            )}

            <div className="double-line" style={{ borderTop: "2px solid #000", margin: "6px 0" }} />

            <div className="row total-row" style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: "bold", padding: "2px 0" }}>
              <span>الإجمالي:</span>
              <span>₪{data.total.toFixed(2)}</span>
            </div>

            <div className="line" style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

            {/* Payment info */}
            <div className="row" style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
              <span>طريقة الدفع:</span>
              <span>{paymentMethodLabel[data.paymentMethod] || data.paymentMethod}</span>
            </div>
            {data.paymentMethod === "cash" && (
              <>
                <div className="row" style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
                  <span>المبلغ المستلم:</span>
                  <span>₪{data.tenderedAmount.toFixed(2)}</span>
                </div>
                {data.change > 0 && (
                  <div className="row" style={{ display: "flex", justifyContent: "space-between", padding: "1px 0", fontWeight: "bold" }}>
                    <span>الباقي:</span>
                    <span>₪{data.change.toFixed(2)}</span>
                  </div>
                )}
              </>
            )}

            {data.orderNote && (
              <>
                <div className="line" style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
                <div style={{ fontSize: "10px", color: "#555" }}>
                  ملاحظة: {data.orderNote}
                </div>
              </>
            )}

            <div className="double-line" style={{ borderTop: "2px solid #000", margin: "6px 0" }} />

            {/* Barcode placeholder */}
            <div style={{ textAlign: "center", fontFamily: "monospace", fontSize: "14px", letterSpacing: "3px", margin: "4px 0" }}>
              ||| {data.orderNumber} |||
            </div>

            {/* Footer */}
            <div className="footer" style={{ fontSize: "10px", color: "#666", marginTop: "8px", textAlign: "center" }}>
              <div>شكراً لتعاملكم معنا</div>
              <div style={{ marginTop: "2px" }}>Thank you for your purchase</div>
            </div>
          </div>
        </div>

        {/* Email section */}
        {showEmail && (
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">البريد الإلكتروني</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                className="h-10"
                dir="ltr"
                autoFocus
              />
            </div>
            <Button
              onClick={handleSendEmail}
              disabled={sending || !email.trim()}
              className="h-10 gap-1"
              size="sm"
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              إرسال
            </Button>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-2">
          <Button onClick={handlePrint} className="flex-1 gap-2 h-11" variant="outline">
            <Printer className="h-4 w-4" />
            طباعة
          </Button>
          <Button
            onClick={() => setShowEmail(!showEmail)}
            className="flex-1 gap-2 h-11"
            variant="outline"
          >
            <Mail className="h-4 w-4" />
            إرسال بالإيميل
          </Button>
        </div>

        <Button
          onClick={() => onOpenChange(false)}
          variant="default"
          className="w-full h-11 gap-2"
          style={{ backgroundColor: "#16A34A" }}
        >
          <CheckCircle className="h-4 w-4" />
          طلب جديد
        </Button>
      </DialogContent>
    </Dialog>
  );
}
