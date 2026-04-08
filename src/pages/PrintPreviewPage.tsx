import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import ReceiptTemplate from "@/components/pos/print-templates/ReceiptTemplate";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import type { PrintOrder } from "@/hooks/usePrintBridge";

const SAMPLE_ORDER: PrintOrder = {
  orderNumber: 5,
  queueNumber: 5,
  orderType: "delivery",
  paymentMethod: "نقد",
  currency: "ILS",
  items: [
    { id: "1", name: "اجنحة 30 قطعة مشوي", quantity: 1, price: 75 },
    { id: "2", name: "اجنحة 25 قطعة مشوي", quantity: 1, price: 70 },
    { id: "3", name: "بيتزا 8 قطع شاورما", quantity: 1, price: 22 },
    { id: "4", name: "حبة 8 قطع", quantity: 2, price: 22 },
  ],
  subtotal: 211,
  total: 211,
  tenderedAmount: 211,
  change: 0,
  cashier: "malaky broast",
  branchName: "",
  tableNumber: "",
};

export default function PrintPreviewPage() {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!receiptRef.current) return;
    setDownloading(true);
    try {
      await document.fonts.ready;
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
      });
      const link = document.createElement("a");
      link.download = `receipt-preview-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  const handleTestPrint = async () => {
    if (!receiptRef.current) return;
    try {
      await document.fonts.ready;
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
      });
      const image = canvas.toDataURL("image/png");
      const res = await fetch("http://192.168.1.65:3001/print-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, printerKey: "receipt" }),
        mode: "cors",
        signal: AbortSignal.timeout(15000),
      });
      const result = await res.json();
      if (result.success) {
        alert("✅ تم إرسال الطباعة بنجاح");
      } else {
        alert("❌ فشل الطباعة: " + (result.error || "خطأ غير معروف"));
      }
    } catch (err: any) {
      alert("❌ لا يمكن الاتصال بالطابعة: " + err.message);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f0f0", padding: "20px 0" }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 20 }}>
        <Button onClick={handleTestPrint} className="gap-2">
          <Printer className="w-4 h-4" />
          طباعة تجريبية
        </Button>
        <Button onClick={handleDownload} variant="outline" className="gap-2" disabled={downloading}>
          <Download className="w-4 h-4" />
          {downloading ? "جاري التحميل..." : "تحميل PNG"}
        </Button>
      </div>

      {/* Receipt - exact 302px width, no shadow, no extra padding */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ width: 302, background: "#fff" }}>
          <ReceiptTemplate
            ref={receiptRef}
            order={SAMPLE_ORDER}
            companyName="مطعم الملكي"
            companyPhone=""
            companyAddress=""
            taxNumber=""
            terminalName="نقطة بيع 1"
            logoUrl="/images/malaky-logo.png"
            showReturnPolicy={true}
            returnPolicyDays={7}
          />
        </div>
      </div>
    </div>
  );
}
