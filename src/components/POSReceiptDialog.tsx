import { useRef, useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer, Mail, CheckCircle, Send, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { sendToBridge } from "@/lib/print-bridge-client";
import { printReceiptImage } from "@/lib/image-print-service";
import type { PrintOrder } from "@/hooks/usePrintBridge";

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
  orderId?: string;
  orderNumber: string;
  displayNumber?: string;
  queueNumber?: number;
  logoUrl?: string;
  date: string;
  cashierName: string;
  companyName: string;
  terminalName: string;
  customerName: string;
  tableName?: string;
  guestCount?: number;
  orderType?: "dine_in" | "takeaway" | "delivery";
  customerPhone?: string;
  deliveryAddress?: string;
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
  autoPrint?: boolean;
}

const paymentMethodLabel: Record<string, { label: string; color: string }> = {
  cash: { label: "نقد", color: "#16a34a" },
  card: { label: "بطاقة", color: "#3b82f6" },
  credit: { label: "آجل", color: "#f59e0b" },
  employee_account: { label: "حساب موظف", color: "#8b5cf6" },
};

const receiptPrintStyles = `
  body {
    font-size: 13px;
    font-weight: 600;
  }
  .receipt-container { max-width: 100%; }
  .center { text-align: center; }
  .bold { font-weight: 900; }
  .divider { border: none; border-top: 1px solid #888; margin: 6px 0; }
  .divider-bold { border: none; border-top: 2px solid #000; margin: 8px 0; }
  .divider-dashed { border: none; border-top: 1px dashed #888; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; }
  .company-name { font-size: 20px; font-weight: 900; letter-spacing: -0.4px; color: #000; margin-bottom: 2px; }
  .terminal-name { font-size: 12px; color: #333; font-weight: 700; }
  .meta-text { font-size: 11px; color: #444; font-weight: 600; }
  .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #444; text-align: center; margin: 4px 0; }
  .item-name { font-size: 13px; font-weight: 800; color: #000; }
  .item-detail { font-size: 12px; color: #333; font-weight: 600; display: flex; justify-content: space-between; padding: 1px 0; }
  .item-note { font-size: 11px; color: #444; font-weight: 600; font-style: italic; padding-right: 4px; }
  .item-discount { font-size: 11px; color: #000; font-weight: 700; padding-right: 4px; }
  .total-label { font-size: 15px; font-weight: 900; color: #000; }
  .total-amount { font-size: 22px; font-weight: 900; color: #000; font-variant-numeric: tabular-nums; }
  .summary-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 12px; color: #333; font-weight: 600; }
  .summary-row .amount { font-variant-numeric: tabular-nums; font-weight: 700; }
  .payment-badge { display: inline-block; background: #eee; border: 1px solid #999; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 800; color: #000; }
  .tag { background: #ddd; color: #000; font-size: 11px; font-weight: 800; padding: 1px 6px; border-radius: 3px; display: inline-block; }
`;

export default function POSReceiptDialog({ open, onOpenChange, data, showReturnPolicy = true, returnPolicyDays = 7, autoPrint = false }: POSReceiptDialogProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const autoPrintDone = useRef(false);

  const doPrint = useCallback(async () => {
    if (!data) return;
    // Build bridge order from receipt data
    const bridgeOrder: PrintOrder = {
      orderNumber: data.displayNumber || data.orderNumber,
      queueNumber: data.queueNumber,
      branchName: data.companyName || "",
      cashier: data.cashierName,
      tableNumber: data.tableName,
      orderType: data.orderType,
      items: data.items.map(item => ({
        id: item.name,
        name: item.name,
        quantity: item.qty,
        price: item.unit_price,
        note: item.note || undefined,
        modifiers: item.modifiers?.map(m => ({ option_name: m.option_name, extra_price: m.extra_price })),
      })),
      subtotal: data.subtotal,
      discount: data.discount,
      total: data.total,
      paymentMethod: data.paymentMethod,
      currency: data.currency,
      tenderedAmount: data.tenderedAmount,
      change: data.change,
      orderNote: data.orderNote,
    };
    printReceiptImage(bridgeOrder).catch(() => {
      console.warn("Print bridge unavailable");
    });
  }, [data]);

  // Auto-print when dialog opens
  useEffect(() => {
    let rafId: number | undefined;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    if (open && autoPrint && data && !autoPrintDone.current) {
      autoPrintDone.current = true;
      rafId = requestAnimationFrame(() => {
        timerId = setTimeout(() => {
          doPrint();
        }, 150);
      });
    }
    if (!open) {
      autoPrintDone.current = false;
    }

    return () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      if (timerId !== undefined) clearTimeout(timerId);
    };
  }, [open, autoPrint, data, doPrint]);

  // F2 = New order (close receipt dialog)
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [open, onOpenChange]);

  if (!data) return null;

  const handlePrint = () => doPrint();

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

  // Generate QR URL for digital receipt
  const receiptUrl = data.orderId ? `${window.location.origin}/receipt/${data.orderId}` : null;

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
            <div ref={receiptRef} className="p-5" style={{ fontFamily: "'Arial', 'Tahoma', sans-serif", fontSize: "13px", direction: "rtl", fontWeight: 600, color: "#000" }}>
              
              {/* ═══ LOGO ═══ */}
              <div style={{ textAlign: "center", paddingBottom: "2px" }}>
                {data.logoUrl && (
                  <img src={data.logoUrl} alt={data.companyName || ""} style={{ maxWidth: "140px", maxHeight: "80px", margin: "0 auto 4px", display: "block" }} />
                )}
                {data.companyName && (
                  <div style={{ fontSize: "24px", fontWeight: 900, color: "#000", letterSpacing: "1px", lineHeight: 1.2, fontFamily: "'Arial', 'Tahoma', sans-serif" }}>
                    {data.companyName}
                  </div>
                )}
              </div>

              <hr style={{ border: "none", borderTop: "1px solid #999", margin: "4px 0" }} />

              {/* ═══ HEADER ═══ */}
              <div style={{ textAlign: "center", paddingBottom: "4px" }}>
                <div style={{ fontSize: "12px", color: "#000", fontWeight: 700 }}>
                  {data.terminalName}
                </div>
                <div style={{ fontSize: "11px", color: "#333", fontWeight: 600, marginTop: "4px" }}>
                  {dateStr} • {timeStr}
                </div>
              </div>

              <hr style={{ border: "none", borderTop: "2px solid #000", margin: "8px 0" }} />

              {/* ═══ ORDER META ═══ */}
              {data.queueNumber != null && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "14px" }}>
                  <span style={{ color: "#000", fontWeight: 800 }}>رقم الطلب</span>
                  <span style={{ fontWeight: 900, color: "#000", fontSize: "16px", fontVariantNumeric: "tabular-nums" }}>{data.queueNumber}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px" }}>
                <span style={{ color: "#000", fontWeight: 700 }}>الكاشير</span>
                <span style={{ fontWeight: 700, color: "#000" }}>{data.cashierName}</span>
              </div>
              {/* Order Type (table-number is merged into the dine-in label) */}
              {(() => {
                const isDineIn = data.orderType !== "delivery" && data.orderType !== "takeaway";
                const tableRaw = (data.tableName || "").toString().trim();
                const dineInLabel = tableRaw
                  ? (/^طاولة\b/.test(tableRaw) ? `🍽️ ${tableRaw}` : `🍽️ طاولة رقم ${tableRaw}`)
                  : "🍽️ طاولة";
                const label = data.orderType === "delivery"
                  ? "🚚 توصيل"
                  : data.orderType === "takeaway"
                    ? "🛍️ استلام"
                    : dineInLabel;
                return (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px" }}>
                      <span style={{ color: "#000", fontWeight: 700 }}>نوع الطلب</span>
                      <span style={{ fontWeight: 800, color: "#000", background: "#eee", border: "1px solid #999", borderRadius: "4px", padding: "1px 8px", fontSize: "11px" }}>
                        {label}
                      </span>
                    </div>
                    {isDineIn && data.guestCount ? (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px" }}>
                        <span style={{ color: "#000", fontWeight: 700 }}>عدد الضيوف</span>
                        <span style={{ fontWeight: 900, color: "#000" }}>{data.guestCount}</span>
                      </div>
                    ) : null}
                    {!isDineIn && data.tableName && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px" }}>
                        <span style={{ color: "#000", fontWeight: 700 }}>الطاولة</span>
                        <span style={{ fontWeight: 900, color: "#000" }}>{data.tableName}</span>
                      </div>
                    )}
                  </>
                );
              })()}
              {data.customerName && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px" }}>
                  <span style={{ color: "#000", fontWeight: 700 }}>الزبون</span>
                  <span style={{ fontWeight: 700, color: "#000" }}>{data.customerName}</span>
                </div>
              )}
              {data.customerPhone && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px" }}>
                  <span style={{ color: "#000", fontWeight: 700 }}>الجوال</span>
                  <span style={{ fontWeight: 700, color: "#000", direction: "ltr" }}>{data.customerPhone}</span>
                </div>
              )}
              {data.orderType === "delivery" && data.deliveryAddress && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px" }}>
                  <span style={{ color: "#000", fontWeight: 700 }}>عنوان التوصيل</span>
                  <span style={{ fontWeight: 700, color: "#000", maxWidth: "60%", textAlign: "left" }}>{data.deliveryAddress}</span>
                </div>
              )}

              <hr style={{ border: "none", borderTop: "1px solid #000", margin: "8px 0" }} />

              {/* ═══ TABLE HEADER ═══ */}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "11px", fontWeight: 900, letterSpacing: "0.5px", color: "#000", borderBottom: "1px solid #333" }}>
                <span style={{ flex: 2 }}>الصنف</span>
                <span style={{ flex: 1, textAlign: "center" }}>الكمية</span>
                <span style={{ flex: 1, textAlign: "center" }}>السعر</span>
                <span style={{ flex: 1, textAlign: "left" }}>المجموع</span>
              </div>

              {/* ═══ ITEMS ═══ */}
              {data.items.map((item, i) => (
                <div key={i} style={{ padding: "6px 0", borderBottom: i < data.items.length - 1 ? "1px solid #ccc" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ flex: 2, fontSize: "13px", fontWeight: 800, color: "#000", lineHeight: 1.3 }}>{item.name}</span>
                    <span style={{ flex: 1, textAlign: "center", fontSize: "13px", color: "#000", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{item.qty}</span>
                    <span style={{ flex: 1, textAlign: "center", fontSize: "12px", color: "#000", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>₪{item.unit_price.toFixed(2)}</span>
                    <span style={{ flex: 1, textAlign: "left", fontSize: "13px", fontWeight: 800, color: "#000", fontVariantNumeric: "tabular-nums" }}>₪{item.total.toFixed(2)}</span>
                  </div>
                  {item.discount_pct > 0 && (
                    <div style={{ fontSize: "11px", color: "#000", fontWeight: 700, paddingRight: "4px", marginTop: "1px" }}>
                      خصم {item.discount_pct}%
                    </div>
                  )}
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div style={{ paddingRight: "8px", marginTop: "3px" }}>
                      {item.modifiers.map((mod, mi) => (
                        <div key={mi} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "#000", fontWeight: 600, lineHeight: 1.6 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                            <span>↳</span>
                            {mod.option_name}
                          </span>
                          {mod.extra_price > 0 && (
                            <span style={{ fontSize: "11px", fontVariantNumeric: "tabular-nums", color: "#000", fontWeight: 700 }}>+₪{mod.extra_price.toFixed(2)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {item.note && (
                    <div style={{ fontSize: "11px", color: "#000", fontWeight: 600, fontStyle: "italic", paddingRight: "4px", marginTop: "1px" }}>
                      📝 {item.note}
                    </div>
                  )}
                </div>
              ))}

              <hr style={{ border: "none", borderTop: "1px solid #000", margin: "8px 0" }} />

              {/* ═══ SUMMARY ═══ */}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px", color: "#000", fontWeight: 700 }}>
                <span>المجموع الفرعي</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>₪{data.subtotal.toFixed(2)}</span>
              </div>
              {data.tax > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px", color: "#000", fontWeight: 700 }}>
                  <span>الضريبة</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>₪{data.tax.toFixed(2)}</span>
                </div>
              )}
              {data.discount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px", color: "#000", fontWeight: 800 }}>
                  <span>الخصم</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>-₪{data.discount.toFixed(2)}</span>
                </div>
              )}

              <hr style={{ border: "none", borderTop: "2px solid #000", margin: "8px 0" }} />

              {/* ═══ TOTAL ═══ */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                <span style={{ fontSize: "16px", fontWeight: 900, color: "#000" }}>الإجمالي</span>
                <span style={{ fontSize: "24px", fontWeight: 900, color: "#000", fontVariantNumeric: "tabular-nums" }}>₪{data.total.toFixed(2)}</span>
              </div>

              <hr style={{ border: "none", borderTop: "1px dashed #333", margin: "8px 0" }} />

              {/* ═══ PAYMENT ═══ */}
              <div style={{ background: "#f0f0f0", borderRadius: "6px", padding: "8px 10px", margin: "4px 0", border: "1px solid #ccc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px" }}>
                  <span style={{ color: "#000", fontWeight: 700 }}>طريقة الدفع</span>
                  {(() => {
                    const pm = paymentMethodLabel[data.paymentMethod];
                    const label = pm ? pm.label : data.paymentMethod;
                    return (
                      <span style={{ background: "#ddd", border: "1px solid #999", borderRadius: "4px", padding: "1px 8px", fontSize: "11px", fontWeight: 900, color: "#000" }}>
                        {label}
                      </span>
                    );
                  })()}
                </div>
                {data.paymentMethod === "cash" && (
                  <>
                    {(() => {
                      const currencySymbols: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€", JOD: "د.ا", EGP: "ج.م", GBP: "£", TRY: "₺" };
                      const sym = currencySymbols[data.currency] || data.currency;
                      return (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "12px" }}>
                            <span style={{ color: "#000", fontWeight: 700 }}>المبلغ المستلم</span>
                            <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "#000" }}>{sym}{data.tenderedAmount.toFixed(2)}</span>
                          </div>
                          {data.change > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "13px", fontWeight: 900 }}>
                              <span style={{ color: "#000" }}>الباقي</span>
                              <span style={{ color: "#000", fontVariantNumeric: "tabular-nums" }}>₪{data.change.toFixed(2)}</span>
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
                <div style={{ background: "#f0f0f0", borderRadius: "6px", padding: "6px 8px", margin: "6px 0", fontSize: "11px", color: "#000", fontWeight: 700, border: "1px solid #999" }}>
                  <span style={{ fontWeight: 900 }}>ملاحظة:</span> {data.orderNote}
                </div>
              )}

              <hr style={{ border: "none", borderTop: "1px dashed #333", margin: "8px 0" }} />

              {/* ═══ QR CODE ═══ */}
              {receiptUrl && (
                <div style={{ textAlign: "center", margin: "8px 0" }}>
                  <div style={{ width: "88px", height: "88px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <QRCodeSVG value={receiptUrl} size={80} level="M" />
                  </div>
                  <div style={{ fontSize: "10px", color: "#000", fontWeight: 600, marginTop: "4px" }}>امسح للتحقق من الإيصال</div>
                </div>
              )}

              {/* ═══ BARCODE ═══ */}
              <div style={{ textAlign: "center", fontFamily: "monospace", fontSize: "12px", letterSpacing: "3px", color: "#000", fontWeight: 700, margin: "4px 0" }}>
                ║║║ {data.queueNumber || data.orderNumber} ║║║
              </div>

              {/* ═══ FOOTER ═══ */}
              <hr style={{ border: "none", borderTop: "1px solid #333", margin: "8px 0" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "13px", fontWeight: 800, color: "#000", marginBottom: "2px" }}>شكراً لتعاملكم معنا ❤️</div>
                <div style={{ fontSize: "11px", color: "#333", fontWeight: 600 }}>Thank you for your visit</div>
                {showReturnPolicy && (
                  <>
                    <div style={{ fontSize: "10px", color: "#333", fontWeight: 600, marginTop: "4px" }}>
                      المرتجعات خلال {returnPolicyDays} أيام مع الإيصال الأصلي
                    </div>
                    <div style={{ fontSize: "10px", color: "#333", fontWeight: 600 }}>
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
            F2 — طلب جديد
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
