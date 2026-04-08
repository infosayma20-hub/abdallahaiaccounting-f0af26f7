import { useRef, useState } from "react";
import ReceiptTemplate from "@/components/pos/print-templates/ReceiptTemplate";
import { Button } from "@/components/ui/button";
import { Download, Printer, Image, Loader2 } from "lucide-react";
import type { PrintOrder } from "@/hooks/usePrintBridge";
import { captureElementAsPng, printReceiptImage, getReceiptPreviewPng, getKitchenPreviewPng } from "@/lib/image-print-service";

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

type TabKey = "receipt" | "kitchen" | "grill" | "pizza";

const TABS: { key: TabKey; label: string }[] = [
  { key: "receipt", label: "فاتورة الزبون" },
  { key: "kitchen", label: "مطبخ" },
  { key: "grill", label: "سخان" },
  { key: "pizza", label: "بيتزا" },
];

export default function PrintPreviewPage() {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("receipt");
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [downloadingServer, setDownloadingServer] = useState(false);
  const [stationImg, setStationImg] = useState<string | null>(null);
  const [loadingStation, setLoadingStation] = useState(false);

  const loadStationPreview = async (station: TabKey) => {
    if (station === "receipt") { setStationImg(null); return; }
    setLoadingStation(true);
    setStationImg(null);
    try {
      const stationNames: Record<string, string> = { kitchen: "المطبخ", grill: "السخان", pizza: "البيتزا" };
      const url = await getKitchenPreviewPng(SAMPLE_ORDER, SAMPLE_ORDER.items, stationNames[station]);
      setStationImg(url);
    } catch {
      setStationImg(null);
      alert("❌ تعذر الاتصال بـ Print Bridge");
    } finally {
      setLoadingStation(false);
    }
  };

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    loadStationPreview(tab);
  };

  const handleDownload = async () => {
    if (!receiptRef.current) return;
    setDownloading(true);
    try {
      const image = await captureElementAsPng(receiptRef.current);
      const link = document.createElement("a");
      link.download = `receipt-preview-${Date.now()}.png`;
      link.href = image;
      link.click();
    } catch {
      alert("❌ فشل تحميل المعاينة");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadServer = async () => {
    setDownloadingServer(true);
    try {
      const objectUrl = await getReceiptPreviewPng(SAMPLE_ORDER, SAMPLE_COMPANY_INFO);
      const link = document.createElement("a");
      link.download = `receipt-server-${Date.now()}.png`;
      link.href = objectUrl;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    } catch {
      alert("❌ تعذر الاتصال بـ Print Bridge");
    } finally {
      setDownloadingServer(false);
    }
  };

  const handleDownloadStation = () => {
    if (!stationImg) return;
    const link = document.createElement("a");
    link.download = `${activeTab}-ticket-${Date.now()}.png`;
    link.href = stationImg;
    link.click();
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
    <div className="min-h-screen bg-muted py-5" dir="rtl">
      {/* Tabs */}
      <div className="flex justify-center gap-2 mb-4">
        {TABS.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? "default" : "outline"}
            size="sm"
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="mb-4 flex flex-col items-center gap-2">
        <div className="flex gap-2">
          {activeTab === "receipt" ? (
            <>
              <Button onClick={handleTestPrint} size="sm" className="gap-2" disabled={printing}>
                <Printer className="h-4 w-4" />
                {printing ? "جاري الإرسال..." : "طباعة تجريبية"}
              </Button>
              <Button onClick={handleDownloadServer} size="sm" variant="secondary" className="gap-2" disabled={downloadingServer}>
                <Image className="h-4 w-4" />
                {downloadingServer ? "جاري التحميل..." : "تحميل PNG (سيرفر)"}
              </Button>
              <Button onClick={handleDownload} size="sm" variant="outline" className="gap-2" disabled={downloading}>
                <Download className="h-4 w-4" />
                {downloading ? "جاري التحميل..." : "تحميل PNG (محلي)"}
              </Button>
            </>
          ) : (
            <Button onClick={handleDownloadStation} size="sm" variant="secondary" className="gap-2" disabled={!stationImg}>
              <Download className="h-4 w-4" />
              تحميل PNG
            </Button>
          )}
        </div>
      </div>

      {/* Preview area */}
      <div className="flex justify-center">
        {activeTab === "receipt" ? (
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
            />
          </div>
        ) : (
          <div className="bg-background p-2" style={{ minWidth: 302, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {loadingStation ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : stationImg ? (
              <img src={stationImg} alt={`${activeTab} ticket`} style={{ maxWidth: '100%' }} />
            ) : (
              <p className="text-muted-foreground text-sm">اضغط على التبويب لتحميل المعاينة من السيرفر</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
