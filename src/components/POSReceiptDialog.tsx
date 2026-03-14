import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer, Mail, CheckCircle, Send, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ReceiptModifier {
  group_name: string;
  option_name: string;
  extra_price: number;
}

interface ReceiptItem {
  name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  total: number;
  note: string;
  modifiers?: ReceiptModifier[];
}

interface ReceiptData {
  orderNumber: string;
  date: string;
  cashierName: string;
  companyName: string;
  terminalName: string;
  customerName: string;
  tableName?: string;
  guestCount?: number;
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
  showReturnPolicy?: boolean;
  returnPolicyDays?: number;
}

const paymentMethodLabel: Record<string, string> = {
  cash: "نقد",
  card: "شبكة",
  credit: "آجل",
};

export default function POSReceiptDialog({ open, onOpenChange, data, showReturnPolicy = true, returnPolicyDays = 7 }: POSReceiptDialogProps) {
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
            font-family: 'Segoe UI', 'Arial', sans-serif;
            font-size: 12px;
            width: 80mm;
            padding: 3mm;
            color: #1a1a1a;
            direction: rtl;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .receipt-container { max-width: 100%; }
          .center { text-align: center; }
          .bold { font-weight: 700; }
          .divider { border: none; border-top: 1px solid #e0e0e0; margin: 6px 0; }
          .divider-bold { border: none; border-top: 2px solid #1a1a1a; margin: 8px 0; }
          .divider-dashed { border: none; border-top: 1px dashed #ccc; margin: 6px 0; }
          .row { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; }
          .company-name { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #0f172a; margin-bottom: 2px; }
          .terminal-name { font-size: 11px; color: #64748b; font-weight: 500; }
          .meta-text { font-size: 10px; color: #94a3b8; }
          .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; text-align: center; margin: 4px 0; }
          .item-name { font-size: 12px; font-weight: 600; color: #1e293b; }
          .item-detail { font-size: 11px; color: #64748b; display: flex; justify-content: space-between; padding: 1px 0; }
          .item-note { font-size: 10px; color: #94a3b8; font-style: italic; padding-right: 4px; }
          .item-discount { font-size: 10px; color: #dc2626; padding-right: 4px; }
          .total-label { font-size: 14px; font-weight: 700; color: #0f172a; }
          .total-amount { font-size: 22px; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; }
          .summary-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px; color: #475569; }
          .summary-row .amount { font-variant-numeric: tabular-nums; font-weight: 500; }
          .payment-badge { display: inline-block; background: #f1f5f9; border-radius: 4px; padding: 2px 8px; font-size: 10px; font-weight: 600; color: #475569; }
          .qr-placeholder { width: 80px; height: 80px; margin: 8px auto; border: 2px solid #e2e8f0; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
          .qr-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px; width: 40px; height: 40px; }
          .qr-cell { background: #1e293b; border-radius: 1px; }
          .qr-cell-empty { background: transparent; }
          .barcode-text { text-align: center; font-family: monospace; font-size: 12px; letter-spacing: 4px; color: #64748b; margin: 4px 0; }
          .footer-text { font-size: 10px; color: #94a3b8; text-align: center; line-height: 1.6; }
          .footer-thanks { font-size: 12px; font-weight: 600; color: #475569; text-align: center; margin-bottom: 2px; }
          .tag { background: #f0fdf4; color: #16a34a; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; display: inline-block; }
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
      const receiptHtml = receiptRef.current?.innerHTML || "";
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-pos-receipt`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
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

  // Generate simple QR pattern (visual only)
  const qrPattern = [
    [1,1,1,0,1], [1,0,1,1,0], [1,1,1,0,1], [0,1,0,1,1], [1,0,1,1,1]
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] max-h-[95vh] flex flex-col p-0" dir="rtl">
        {/* Success header */}
        <div className="bg-[#0f172a] text-white p-4 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-full bg-[#16a34a] flex items-center justify-center shrink-0">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-base">تم البيع بنجاح</h3>
            <p className="text-white/60 text-xs">{data.orderNumber}</p>
          </div>
          <div className="mr-auto text-left">
            <p className="text-xl font-bold tabular-nums">₪{data.total.toFixed(2)}</p>
          </div>
        </div>

        {/* Receipt Preview - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-2">
          <div className="bg-white text-[#1a1a1a] rounded-xl border border-border overflow-hidden shadow-sm">
            <div ref={receiptRef} className="p-5" style={{ fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: "12px", direction: "rtl" }}>
              
              {/* ═══ HEADER ═══ */}
              <div style={{ textAlign: "center", paddingBottom: "4px" }}>
                <div className="company-name" style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", marginBottom: "2px", letterSpacing: "-0.5px" }}>
                  {data.companyName}
                </div>
                <div className="terminal-name" style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>
                  {data.terminalName}
                </div>
                <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "4px" }}>
                  {dateStr} • {timeStr}
                </div>
              </div>

              <hr style={{ border: "none", borderTop: "2px solid #0f172a", margin: "8px 0" }} />

              {/* ═══ ORDER META ═══ */}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "11px" }}>
                <span style={{ color: "#64748b" }}>رقم الطلب</span>
                <span style={{ fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>{data.orderNumber}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "11px" }}>
                <span style={{ color: "#64748b" }}>الكاشير</span>
                <span style={{ fontWeight: 500, color: "#334155" }}>{data.cashierName}</span>
              </div>
              {data.tableName && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "11px" }}>
                  <span style={{ color: "#64748b" }}>الطاولة</span>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>{data.tableName}{data.guestCount ? ` (${data.guestCount} ضيوف)` : ""}</span>
                </div>
              )}
              {data.customerName && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "11px" }}>
                  <span style={{ color: "#64748b" }}>الزبون</span>
                  <span style={{ fontWeight: 500, color: "#334155" }}>{data.customerName}</span>
                </div>
              )}

              <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "8px 0" }} />

              {/* ═══ TABLE HEADER ═══ */}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "#94a3b8", borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ flex: 2 }}>الصنف</span>
                <span style={{ flex: 1, textAlign: "center" }}>الكمية</span>
                <span style={{ flex: 1, textAlign: "center" }}>السعر</span>
                <span style={{ flex: 1, textAlign: "left" }}>المجموع</span>
              </div>

              {/* ═══ ITEMS ═══ */}
              {data.items.map((item, i) => (
                <div key={i} style={{ padding: "6px 0", borderBottom: i < data.items.length - 1 ? "1px solid #f8fafc" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ flex: 2, fontSize: "12px", fontWeight: 600, color: "#1e293b", lineHeight: 1.3 }}>{item.name}</span>
                    <span style={{ flex: 1, textAlign: "center", fontSize: "11px", color: "#475569", fontVariantNumeric: "tabular-nums" }}>{item.qty}</span>
                    <span style={{ flex: 1, textAlign: "center", fontSize: "11px", color: "#475569", fontVariantNumeric: "tabular-nums" }}>₪{item.unit_price.toFixed(2)}</span>
                    <span style={{ flex: 1, textAlign: "left", fontSize: "12px", fontWeight: 600, color: "#1e293b", fontVariantNumeric: "tabular-nums" }}>₪{item.total.toFixed(2)}</span>
                  </div>
                  {item.discount_pct > 0 && (
                    <div style={{ fontSize: "10px", color: "#dc2626", paddingRight: "4px", marginTop: "1px" }}>
                      خصم {item.discount_pct}%
                    </div>
                  )}
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div style={{ paddingRight: "8px", marginTop: "3px" }}>
                      {item.modifiers.map((mod, mi) => (
                        <div key={mi} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px", color: "#64748b", lineHeight: 1.6 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                            <span style={{ color: "#94a3b8" }}>↳</span>
                            {mod.option_name}
                          </span>
                          {mod.extra_price > 0 && (
                            <span style={{ fontSize: "9px", fontVariantNumeric: "tabular-nums", color: "#16a34a", fontWeight: 600 }}>+₪{mod.extra_price.toFixed(2)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {item.note && (
                    <div style={{ fontSize: "10px", color: "#94a3b8", fontStyle: "italic", paddingRight: "4px", marginTop: "1px" }}>
                      📝 {item.note}
                    </div>
                  )}
                </div>
              ))}

              <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "8px 0" }} />

              {/* ═══ SUMMARY ═══ */}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "11px", color: "#475569" }}>
                <span>المجموع الفرعي</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>₪{data.subtotal.toFixed(2)}</span>
              </div>
              {data.tax > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "11px", color: "#475569" }}>
                  <span>الضريبة</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>₪{data.tax.toFixed(2)}</span>
                </div>
              )}
              {data.discount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "11px", color: "#dc2626" }}>
                  <span>الخصم</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>-₪{data.discount.toFixed(2)}</span>
                </div>
              )}

              <hr style={{ border: "none", borderTop: "2px solid #0f172a", margin: "8px 0" }} />

              {/* ═══ TOTAL ═══ */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>الإجمالي</span>
                <span style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>₪{data.total.toFixed(2)}</span>
              </div>

              <hr style={{ border: "none", borderTop: "1px dashed #d1d5db", margin: "8px 0" }} />

              {/* ═══ PAYMENT ═══ */}
              <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "8px 10px", margin: "4px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "11px" }}>
                  <span style={{ color: "#64748b" }}>طريقة الدفع</span>
                  <span style={{ background: "#e2e8f0", borderRadius: "4px", padding: "1px 8px", fontSize: "10px", fontWeight: 600, color: "#475569" }}>
                    {paymentMethodLabel[data.paymentMethod] || data.paymentMethod}
                  </span>
                </div>
                {data.paymentMethod === "cash" && (
                  <>
                    {(() => {
                      const currencySymbols: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€", JOD: "د.ا", EGP: "ج.م", GBP: "£", TRY: "₺" };
                      const sym = currencySymbols[data.currency] || data.currency;
                      const rate = (data as any).exchangeRate || 1;
                      const changeInForeign = data.currency !== "ILS" && rate > 0 ? data.change / rate : data.change;
                      return (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "11px" }}>
                            <span style={{ color: "#64748b" }}>المبلغ المستلم</span>
                            <span style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums", color: "#334155" }}>{sym}{data.tenderedAmount.toFixed(2)}</span>
                          </div>
                          {data.change > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px", fontWeight: 700 }}>
                              <span style={{ color: "#16a34a" }}>الباقي</span>
                              <span style={{ color: "#16a34a", fontVariantNumeric: "tabular-nums" }}>{sym}{changeInForeign.toFixed(2)}</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </>
                )}
              </div>

              {/* ═══ ORDER NOTE ═══ */}
              {data.orderNote && (
                <div style={{ background: "#fffbeb", borderRadius: "6px", padding: "6px 8px", margin: "6px 0", fontSize: "10px", color: "#92400e", border: "1px solid #fde68a" }}>
                  <span style={{ fontWeight: 600 }}>ملاحظة:</span> {data.orderNote}
                </div>
              )}

              <hr style={{ border: "none", borderTop: "1px dashed #d1d5db", margin: "8px 0" }} />

              {/* ═══ QR CODE ═══ */}
              <div style={{ textAlign: "center", margin: "8px 0" }}>
                <div style={{ width: "72px", height: "72px", margin: "0 auto", border: "2px solid #e2e8f0", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", padding: "8px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "2px", width: "40px", height: "40px" }}>
                    {qrPattern.flat().map((cell, idx) => (
                      <div key={idx} style={{ background: cell ? "#1e293b" : "transparent", borderRadius: "1px" }} />
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: "8px", color: "#94a3b8", marginTop: "4px" }}>امسح للتحقق من الإيصال</div>
              </div>

              {/* ═══ BARCODE ═══ */}
              <div style={{ textAlign: "center", fontFamily: "monospace", fontSize: "11px", letterSpacing: "3px", color: "#64748b", margin: "4px 0" }}>
                ║║║ {data.orderNumber} ║║║
              </div>

              {/* ═══ FOOTER ═══ */}
              <hr style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "8px 0" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "2px" }}>شكراً لتعاملكم معنا 🙏</div>
                <div style={{ fontSize: "10px", color: "#94a3b8" }}>Thank you for your purchase</div>
                {showReturnPolicy && (
                  <>
                    <div style={{ fontSize: "9px", color: "#cbd5e1", marginTop: "4px" }}>
                      المرتجعات خلال {returnPolicyDays} أيام مع الإيصال الأصلي
                    </div>
                    <div style={{ fontSize: "9px", color: "#cbd5e1" }}>
                      Returns within {returnPolicyDays} days with original receipt
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Email section */}
        {showEmail && (
          <div className="px-4 pb-2">
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
          </div>
        )}

        {/* Actions - Fixed at bottom */}
        <div className="px-4 pb-3 pt-2 space-y-2 shrink-0 border-t border-border bg-background">
          <div className="flex gap-2">
            <Button onClick={handlePrint} className="flex-1 gap-2 h-10" variant="outline">
              <Printer className="h-4 w-4" />
              طباعة
            </Button>
            <Button
              onClick={() => setShowEmail(!showEmail)}
              className="flex-1 gap-2 h-10"
              variant="outline"
            >
              <Mail className="h-4 w-4" />
              إيميل
            </Button>
          </div>

          <Button
            onClick={() => onOpenChange(false)}
            variant="default"
            className="w-full h-11 gap-2 font-bold"
            style={{ backgroundColor: "#16a34a" }}
          >
            <CheckCircle className="h-4 w-4" />
            طلب جديد
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
