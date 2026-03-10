import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, CheckCircle } from "lucide-react";

interface ShiftSummaryData {
  companyName: string;
  terminalName: string;
  cashierName: string;
  openedAt: string;
  closedAt: string;
  openingCash: number;
  totalSales: number;
  totalOrders: number;
  closingCash: number;
  expectedCash: number;
  variance: number;
  sessionId: string;
}

interface ShiftSummaryReceiptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ShiftSummaryData | null;
}

export default function ShiftSummaryReceipt({ open, onOpenChange, data }: ShiftSummaryReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!data) return null;

  const varianceType = data.variance > 0 ? "فائض" : data.variance < 0 ? "عجز" : "مطابق";
  const varianceColor = data.variance > 0 ? "#16a34a" : data.variance < 0 ? "#dc2626" : "#475569";

  const handlePrint = () => {
    const content = receiptRef.current;
    if (!content) return;

    const printWindow = window.open("", "_blank", "width=320,height=600");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>ملخص الوردية</title>
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
          .center { text-align: center; }
          .bold { font-weight: 700; }
          .divider { border: none; border-top: 1px solid #e0e0e0; margin: 6px 0; }
          .divider-bold { border: none; border-top: 2px solid #1a1a1a; margin: 8px 0; }
          .divider-dashed { border: none; border-top: 1px dashed #ccc; margin: 6px 0; }
          .row { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; }
          .company-name { font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 2px; }
          .terminal-name { font-size: 11px; color: #64748b; font-weight: 500; }
          .meta-text { font-size: 10px; color: #94a3b8; }
          .section-title { font-size: 10px; font-weight: 700; letter-spacing: 1px; color: #94a3b8; text-align: center; margin: 6px 0 4px; }
          .total-label { font-size: 14px; font-weight: 700; color: #0f172a; }
          .total-amount { font-size: 22px; font-weight: 800; color: #0f172a; font-variant-numeric: tabular-nums; }
          .summary-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; color: #475569; }
          .summary-row .amount { font-variant-numeric: tabular-nums; font-weight: 600; }
          .variance-box { text-align: center; padding: 8px; border-radius: 6px; margin: 8px 0; font-weight: 700; font-size: 14px; }
          .footer-text { font-size: 10px; color: #94a3b8; text-align: center; line-height: 1.6; }
        </style>
      </head>
      <body>
        ${content.innerHTML}
        <script>window.onload=function(){window.print();window.close();}<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("ar-PS", { year: "numeric", month: "2-digit", day: "2-digit" });
  };
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden" dir="rtl">
        <div className="bg-primary p-4 text-center">
          <CheckCircle className="h-8 w-8 text-primary-foreground mx-auto mb-1" />
          <DialogHeader>
            <DialogTitle className="text-primary-foreground text-lg">تم إغلاق الوردية بنجاح</DialogTitle>
          </DialogHeader>
        </div>

        <div className="p-4 space-y-3">
          {/* Receipt Preview */}
          <div
            ref={receiptRef}
            className="bg-white text-black rounded-xl border p-5 text-sm"
            style={{ fontFamily: "'Segoe UI', Arial, sans-serif", direction: "rtl" }}
          >
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{data.companyName}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{data.terminalName}</div>
              <hr style={{ border: "none", borderTop: "2px solid #1a1a1a", margin: "8px 0" }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>📋 ملخص تسليم العهدة</div>
            </div>

            {/* Meta Info */}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>
              <span>الكاشير: {data.cashierName}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginBottom: 8 }}>
              <span>الفتح: {formatDate(data.openedAt)} {formatTime(data.openedAt)}</span>
              <span>الإغلاق: {formatDate(data.closedAt)} {formatTime(data.closedAt)}</span>
            </div>

            <hr style={{ border: "none", borderTop: "1px dashed #ccc", margin: "6px 0" }} />

            {/* Session Details */}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#94a3b8", textAlign: "center", margin: "6px 0 4px" }}>
              تفاصيل الوردية
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12, color: "#475569" }}>
              <span>النقدية الافتتاحية</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>₪{data.openingCash.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12, color: "#475569" }}>
              <span>إجمالي المبيعات</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "#16a34a" }}>₪{data.totalSales.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12, color: "#475569" }}>
              <span>عدد الطلبات</span>
              <span style={{ fontWeight: 600 }}>{data.totalOrders}</span>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #e0e0e0", margin: "6px 0" }} />

            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
              <span>المتوقع في الصندوق</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>₪{data.expectedCash.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
              <span>النقدية الفعلية (المسلّمة)</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>₪{data.closingCash.toFixed(2)}</span>
            </div>

            <hr style={{ border: "none", borderTop: "2px solid #1a1a1a", margin: "8px 0" }} />

            {/* Variance */}
            <div style={{
              textAlign: "center",
              padding: 10,
              borderRadius: 6,
              margin: "8px 0",
              fontWeight: 700,
              fontSize: 16,
              background: data.variance === 0 ? "#f0fdf4" : data.variance > 0 ? "#f0fdf4" : "#fef2f2",
              color: varianceColor,
            }}>
              {varianceType}: ₪{Math.abs(data.variance).toFixed(2)}
            </div>

            <hr style={{ border: "none", borderTop: "1px dashed #ccc", margin: "6px 0" }} />

            {/* Signature area */}
            <div style={{ marginTop: 12, fontSize: 10, color: "#94a3b8" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                <span>توقيع الكاشير: _____________</span>
                <span>توقيع المسؤول: _____________</span>
              </div>
            </div>

            <div style={{ textAlign: "center", fontSize: 9, color: "#94a3b8", lineHeight: 1.8 }}>
              هذا المستند صادر آلياً من النظام
              <br />
              Powered by FINIX
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={handlePrint} className="flex-1 gap-2" variant="outline">
              <Printer className="h-4 w-4" />
              طباعة
            </Button>
            <Button onClick={() => onOpenChange(false)} className="flex-1 gap-2">
              <CheckCircle className="h-4 w-4" />
              تم
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
