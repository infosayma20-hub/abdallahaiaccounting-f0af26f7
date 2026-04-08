import { useRef, useState } from "react";
import ReceiptTemplate from "@/components/pos/print-templates/ReceiptTemplate";
import KitchenTicketTemplate from "@/components/pos/print-templates/KitchenTicketTemplate";
import ShiftSummaryTemplate from "@/components/pos/print-templates/ShiftSummaryTemplate";
import type { ShiftSummaryPrintData } from "@/components/pos/print-templates/ShiftSummaryTemplate";
import { Button } from "@/components/ui/button";
import { Download, Printer, Image } from "lucide-react";
import type { PrintOrder } from "@/hooks/usePrintBridge";
import { captureElementAsPng, printReceiptImage, getReceiptPreviewPng } from "@/lib/image-print-service";

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

const SAMPLE_SHIFT: ShiftSummaryPrintData = {
  companyName: "مطعم الملكي",
  logoUrl: "/images/malaky-logo.png",
  terminalName: "نقطة بيع 1",
  cashierName: "malaky broast",
  cashBoxName: "صندوق رئيسي",
  openedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
  closedAt: new Date().toISOString(),
  openingCash: 500,
  totalSales: 1250,
  totalExpenses: 0,
  totalOrders: 18,
  closingCash: 1750,
  expectedCash: 1750,
  variance: 0,
  varianceILS: 0,
  currencyBreakdown: {
    ILS: { sales: 1050, count: 14 },
    USD: { sales: 50, count: 2 },
    JOD: { sales: 30, count: 2 },
  },
  paymentMethodBreakdown: {
    نقد: { ILS: 900, USD: 50, JOD: 30 },
    بطاقة: { ILS: 150 },
  },
};

type TabKey = "receipt" | "kitchen" | "grill" | "pizza" | "shift";

const TABS: { key: TabKey; label: string }[] = [
  { key: "receipt", label: "فاتورة الزبون" },
  { key: "kitchen", label: "مطبخ" },
  { key: "grill", label: "سخان" },
  { key: "pizza", label: "بيتزا" },
  { key: "shift", label: "إغلاق العهدة" },
];

const STATION_NAMES: Record<string, string> = {
  kitchen: "المطبخ",
  grill: "السخان",
  pizza: "البيتزا",
};

export default function PrintPreviewPage() {
  const previewRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("receipt");
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [downloadingServer, setDownloadingServer] = useState(false);

  const handleDownloadLocal = async () => {
    if (!previewRef.current) return;
    setDownloading(true);
    try {
      const image = await captureElementAsPng(previewRef.current);
      const link = document.createElement("a");
      link.download = `${activeTab}-preview-${Date.now()}.png`;
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

  const isStationTab = activeTab === "kitchen" || activeTab === "grill" || activeTab === "pizza";

  return (
    <div className="min-h-screen bg-muted py-5" dir="rtl">
      {/* Tabs */}
      <div className="flex justify-center gap-2 mb-4 flex-wrap px-4">
        {TABS.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="mb-4 flex flex-col items-center gap-2">
        <div className="flex gap-2">
          {activeTab === "receipt" && (
            <>
              <Button onClick={handleTestPrint} size="sm" className="gap-2" disabled={printing}>
                <Printer className="h-4 w-4" />
                {printing ? "جاري الإرسال..." : "طباعة تجريبية"}
              </Button>
              <Button onClick={handleDownloadServer} size="sm" variant="secondary" className="gap-2" disabled={downloadingServer}>
                <Image className="h-4 w-4" />
                {downloadingServer ? "جاري التحميل..." : "تحميل PNG (سيرفر)"}
              </Button>
            </>
          )}
          <Button onClick={handleDownloadLocal} size="sm" variant="outline" className="gap-2" disabled={downloading}>
            <Download className="h-4 w-4" />
            {downloading ? "جاري التحميل..." : "تحميل PNG"}
          </Button>
        </div>
      </div>

      {/* Preview area */}
      <div className="flex justify-center">
        {activeTab === "receipt" && (
          <div className="bg-background" style={{ width: 320 }}>
            <ReceiptTemplate
              ref={previewRef}
              order={SAMPLE_ORDER}
              companyName={SAMPLE_COMPANY_INFO.name}
              companyPhone={SAMPLE_COMPANY_INFO.phone}
              companyAddress={SAMPLE_COMPANY_INFO.address}
              taxNumber={SAMPLE_COMPANY_INFO.taxNumber}
              terminalName={SAMPLE_COMPANY_INFO.terminalName}
              logoUrl={SAMPLE_COMPANY_INFO.logoUrl}
            />
          </div>
        )}

        {isStationTab && (
          <div className="bg-background" style={{ width: 384 }}>
            <div
              ref={previewRef}
              dir="rtl"
              style={{
                width: '384px',
                backgroundColor: '#fff',
                color: '#000',
                fontFamily: "'Tahoma', 'Arial', sans-serif",
                fontSize: '22px',
                fontWeight: 700,
                lineHeight: '1.4',
                padding: '14px 16px',
                position: 'relative',
              }}
            >
              {/* Render kitchen ticket inline (not off-screen) */}
              <KitchenTicketInline
                order={SAMPLE_ORDER}
                items={SAMPLE_ORDER.items}
                stationName={STATION_NAMES[activeTab]}
              />
            </div>
          </div>
        )}

        {activeTab === "shift" && (
          <div className="bg-background" style={{ width: 320 }}>
            <ShiftSummaryTemplate ref={previewRef} data={SAMPLE_SHIFT} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Inline version of KitchenTicketTemplate for preview (no position:absolute) */
function KitchenTicketInline({ order, items, stationName }: { order: PrintOrder; items: PrintOrder["items"]; stationName: string }) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-GB');
  const qNum = order.queueNumber || order.orderNumber || '---';
  const orderTypeLabel = order.orderType === 'takeaway' ? 'تيك اواي'
    : order.orderType === 'delivery' ? 'توصيل' : 'محلي';
  const totalQty = items.reduce((sum, item) => sum + (item.quantity || 1), 0);

  return (
    <>
      <div style={{ textAlign: 'center', fontSize: '28px', fontWeight: 900, padding: '8px 0', borderBottom: '3px solid #000', marginBottom: '10px' }}>
        {stationName}
      </div>
      <div style={{ textAlign: 'center', fontSize: '44px', fontWeight: 900, margin: '8px 0' }}># {qNum}</div>
      <div style={{ textAlign: 'center', fontSize: '26px', fontWeight: 900, padding: '8px', border: '3px solid #000', margin: '8px 0' }}>
        {orderTypeLabel}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 700, margin: '8px 0' }}>
        <InfoRow label="التاريخ" value={dateStr} />
        <InfoRow label="الوقت" value={timeStr} />
        {order.tableNumber && <InfoRow label="طاولة" value={order.tableNumber} />}
        {order.cashier && <InfoRow label="الكاشير" value={order.cashier} />}
        <InfoRow label="عدد الاصناف" value={String(totalQty)} />
      </div>
      <div style={{ borderTop: '3px solid #000', margin: '10px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '20px', borderBottom: '2px solid #000', paddingBottom: '6px' }}>
        <span>الكمية</span>
        <span>الاسم</span>
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ padding: '10px 0', borderBottom: '2px dashed #666' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '30px', fontWeight: 900, minWidth: '50px' }}>{item.quantity || 1}</span>
            <span style={{ fontSize: '24px', fontWeight: 800, textAlign: 'right', flex: 1 }}>{item.name}</span>
          </div>
          {item.modifiers?.map((m, j) => (
            <div key={j} style={{ fontSize: '20px', fontWeight: 700, textAlign: 'right', paddingRight: '50px', marginTop: '2px' }}>
              + {m.option_name}
            </div>
          ))}
          {item.note && (
            <div style={{ fontSize: '20px', fontWeight: 900, textAlign: 'right', paddingRight: '50px', marginTop: '4px', background: '#eee', padding: '4px 8px', borderRadius: '4px' }}>
              ملاحظة: {item.note}
            </div>
          )}
        </div>
      ))}
      {order.orderNote && (
        <>
          <div style={{ borderTop: '3px solid #000', margin: '10px 0' }} />
          <div style={{ fontSize: '22px', fontWeight: 900, background: '#eee', padding: '8px 10px', borderRadius: '4px', border: '2px solid #000' }}>
            ملاحظات: {order.orderNote}
          </div>
        </>
      )}
      <div style={{ height: '20px' }} />
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontWeight: 700 }}>
      <span>{label}</span>
      <span style={{ fontWeight: 800 }}>{value}</span>
    </div>
  );
}
