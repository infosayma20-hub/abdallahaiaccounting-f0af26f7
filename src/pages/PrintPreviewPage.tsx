import { useRef, useState } from "react";
import ReceiptTemplate from "@/components/pos/print-templates/ReceiptTemplate";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import type { PrintOrder } from "@/hooks/usePrintBridge";
import { captureElementAsPng, printReceiptImage } from "@/lib/image-print-service";

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

const SAMPLE_COMPANY_INFO = {
  name: "مطعم الملكي",
  phone: "",
  address: "",
  taxNumber: "",
  terminalName: "نقطة بيع 1",
  logoUrl: "/images/malaky-logo.png",
};

export default function PrintPreviewPage() {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const handleDownload = async () => {
    if (!receiptRef.current) return;

    setDownloading(true);
    try {
      const image = await captureElementAsPng(receiptRef.current);
      const link = document.createElement("a");
      link.download = `receipt-preview-${Date.now()}.png`;
      link.href = image;
      link.click();
    } catch (err) {
      console.error("Download failed:", err);
      alert("❌ فشل تحميل المعاينة");
    } finally {
      setDownloading(false);
    }
  };

  const handleTestPrint = async () => {
    setPrinting(true);
    try {
      const result = await printReceiptImage(SAMPLE_ORDER, SAMPLE_COMPANY_INFO);
      if (result.success) {
        alert("✅ تم إرسال الطباعة بنجاح");
      } else {
        alert("❌ فشل الطباعة: " + (result.error || "خطأ غير معروف"));
      }
    } catch (err: any) {
      alert("❌ لا يمكن الاتصال بالطابعة: " + err.message);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted py-5">
      <div className="mb-5 flex justify-center gap-3">
        <Button onClick={handleTestPrint} className="gap-2" disabled={printing}>
          <Printer className="h-4 w-4" />
          {printing ? "جاري الإرسال..." : "طباعة تجريبية"}
        </Button>
        <Button onClick={handleDownload} variant="outline" className="gap-2" disabled={downloading}>
          <Download className="h-4 w-4" />
          {downloading ? "جاري التحميل..." : "تحميل PNG"}
        </Button>
      </div>

      <div className="flex justify-center">
        <div className="bg-background" style={{ width: 302 }}>
          <ReceiptTemplate
            ref={receiptRef}
            order={SAMPLE_ORDER}
            companyName={SAMPLE_COMPANY_INFO.name}
            companyPhone={SAMPLE_COMPANY_INFO.phone}
            companyAddress={SAMPLE_COMPANY_INFO.address}
            taxNumber={SAMPLE_COMPANY_INFO.taxNumber}
            terminalName={SAMPLE_COMPANY_INFO.terminalName}
            logoUrl={SAMPLE_COMPANY_INFO.logoUrl}
            showReturnPolicy={true}
            returnPolicyDays={7}
          />
        </div>
      </div>
    </div>
  );
}
