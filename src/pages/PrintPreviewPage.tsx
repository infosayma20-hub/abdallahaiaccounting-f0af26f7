import { useRef, useState } from "react";
import ReceiptTemplate from "@/components/pos/print-templates/ReceiptTemplate";
import KitchenTicketTemplate from "@/components/pos/print-templates/KitchenTicketTemplate";
import ShiftSummaryTemplate from "@/components/pos/print-templates/ShiftSummaryTemplate";
import type { ShiftSummaryPrintData } from "@/components/pos/print-templates/ShiftSummaryTemplate";
import { Button } from "@/components/ui/button";
import { Download, Printer, Image, TestTube2, FileImage, Receipt } from "lucide-react";
import type { PrintOrder } from "@/hooks/usePrintBridge";
import {
  captureElementAsPng,
  printReceiptImage,
  printShiftSummaryImage,
  getReceiptPreviewPng,
  testPrintText,
  testPrintLogo,
  testPrintReceipt,
  getPrintMode,
  setPrintMode,
  getFooterMode,
  setFooterMode,
  type FooterMode,
} from "@/lib/image-print-service";
import PrintDiagnosticsPanel from "@/components/pos/PrintDiagnosticsPanel";
import type { PrintMode } from "@/lib/print-diagnostics";

const SAMPLE_ORDER: PrintOrder = {
  id: 'sample-preview-order',
  orderNumber: 5,
  queueNumber: 5,
  orderType: "delivery",
  paymentMethod: "نقد",
  currency: "ILS",
  items: [
    { id: "1", name: "اجنحة 30 قطعة مشوي", quantity: 1, price: 75, note: "بدون بصل" },
    { id: "2", name: "اجنحة 25 قطعة مشوي", quantity: 1, price: 70 },
    { id: "3", name: "بيتزا 8 قطع شاورما", quantity: 1, price: 22 },
    { id: "4", name: "حبة 8 قطع", quantity: 2, price: 22 },
  ],
  subtotal: 211,
  total: 211,
  tenderedAmount: 211,
  change: 0,
  cashier: "كاشير تجريبي",
  branchName: "",
  tableNumber: "",
  orderNote: "الزبون بيستلم الساعة 10",
};

const SAMPLE_COMPANY_INFO = {
  name: "اسم الشركة",
  phone: "",
  address: "",
  taxNumber: "",
  terminalName: "نقطة بيع 1",
  logoUrl: "",
};

const SAMPLE_SHIFT: ShiftSummaryPrintData = {
  companyName: "اسم الشركة",
  logoUrl: "",
  terminalName: "نقطة بيع 1",
  cashierName: "كاشير تجريبي",
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
  const [printMode, setPrintModeState] = useState<PrintMode>(getPrintMode());
  const [footerMode, setFooterModeState] = useState<FooterMode>(getFooterMode());
  const [testing, setTesting] = useState<null | 'text' | 'logo' | 'receipt'>(null);

  const togglePrintMode = (m: PrintMode) => {
    setPrintMode(m);
    setPrintModeState(m);
  };

  const toggleFooterMode = (m: FooterMode) => {
    setFooterMode(m);
    setFooterModeState(m);
  };

  const runTest = async (kind: 'text' | 'logo' | 'receipt') => {
    setTesting(kind);
    try {
      const fn = kind === 'text' ? testPrintText : kind === 'logo' ? testPrintLogo : testPrintReceipt;
      const r = await fn();
      if (!r.success) alert(`❌ فشل اختبار ${kind}: ${r.error || 'خطأ غير معروف'}`);
    } catch (err: any) {
      alert(`❌ تعذر الاتصال بالبردج: ${err.message}`);
    } finally {
      setTesting(null);
    }
  };

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
      let result;
      if (activeTab === "shift") {
        result = await printShiftSummaryImage(SAMPLE_SHIFT);
      } else {
        result = await printReceiptImage(SAMPLE_ORDER, SAMPLE_COMPANY_INFO);
      }
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

      {/* Print mode toggle */}
      <div className="mb-3 flex justify-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border text-sm">
          <span className="text-muted-foreground">وضع الطباعة:</span>
          <Button
            size="sm"
            variant={printMode === 'raster' ? 'default' : 'outline'}
            onClick={() => togglePrintMode('raster')}
            className="h-7 px-3 text-xs"
          >
            🖼️ raster
          </Button>
          <Button
            size="sm"
            variant={printMode === 'text' ? 'default' : 'outline'}
            onClick={() => togglePrintMode('text')}
            className="h-7 px-3 text-xs"
          >
            📝 text
          </Button>
        </div>
      </div>

      {/* Footer mode toggle — temporary mitigation until bridge patch lands */}
      <div className="mb-3 flex justify-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border text-sm flex-wrap justify-center">
          <span className="text-muted-foreground">تذييل الفاتورة:</span>
          <Button
            size="sm"
            variant={footerMode === 'full' ? 'default' : 'outline'}
            onClick={() => toggleFooterMode('full')}
            className="h-7 px-3 text-xs"
            title="QR + شعار + سطور إضافية (قد يسبب خرابيش حالياً)"
          >
            🧾 full
          </Button>
          <Button
            size="sm"
            variant={footerMode === 'compact' ? 'default' : 'outline'}
            onClick={() => toggleFooterMode('compact')}
            className="h-7 px-3 text-xs"
            title="بدون QR، سطر شكر مختصر (الافتراضي الآمن)"
          >
            ⚡ compact
          </Button>
          <Button
            size="sm"
            variant={footerMode === 'off' ? 'default' : 'outline'}
            onClick={() => toggleFooterMode('off')}
            className="h-7 px-3 text-xs"
            title="بدون أي تذييل — قص فوراً بعد الدفع"
          >
            🚫 off
          </Button>
          {footerMode !== 'full' && (
            <span className="text-[10px] text-warning ms-2">
              ⚠️ مؤقت — يُعاد لـ full بعد patch البردج
            </span>
          )}
        </div>
      </div>

      {/* Diagnostic test buttons */}
      <div className="mb-3 flex justify-center gap-2 flex-wrap px-4">
        <Button onClick={() => runTest('text')} size="sm" variant="secondary" className="gap-2" disabled={!!testing}>
          <TestTube2 className="h-4 w-4" />
          {testing === 'text' ? '...' : 'اختبار: نص فقط'}
        </Button>
        <Button onClick={() => runTest('logo')} size="sm" variant="secondary" className="gap-2" disabled={!!testing}>
          <FileImage className="h-4 w-4" />
          {testing === 'logo' ? '...' : 'اختبار: شعار فقط'}
        </Button>
        <Button onClick={() => runTest('receipt')} size="sm" variant="secondary" className="gap-2" disabled={!!testing}>
          <Receipt className="h-4 w-4" />
          {testing === 'receipt' ? '...' : 'اختبار: فاتورة كاملة'}
        </Button>
      </div>

      {/* Action buttons */}
      <div className="mb-4 flex flex-col items-center gap-2">
        <div className="flex gap-2">
          {(activeTab === "receipt" || activeTab === "shift") && (
            <>
              <Button onClick={handleTestPrint} size="sm" className="gap-2" disabled={printing}>
                <Printer className="h-4 w-4" />
                {printing ? "جاري الإرسال..." : "طباعة تجريبية"}
              </Button>
              {activeTab === "receipt" && (
                <Button onClick={handleDownloadServer} size="sm" variant="secondary" className="gap-2" disabled={downloadingServer}>
                  <Image className="h-4 w-4" />
                  {downloadingServer ? "جاري التحميل..." : "تحميل PNG (سيرفر)"}
                </Button>
              )}
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
              footerMode={footerMode}
            />
          </div>
        )}

        {isStationTab && (
          <div className="bg-background" style={{ width: 384 }}>
            {/* Wrapper neutralizes position:absolute from the real template
                so the preview shows EXACTLY what gets printed. */}
            <style>{`.kitchen-preview-wrap > div { position: relative !important; left: auto !important; top: auto !important; }`}</style>
            <div className="kitchen-preview-wrap">
              <KitchenTicketTemplate
                ref={previewRef}
                order={SAMPLE_ORDER}
                items={SAMPLE_ORDER.items}
                stationName={STATION_NAMES[activeTab]}
              />
            </div>
          </div>
        )}

        {activeTab === "shift" && (
          <div className="bg-background shift-preview-wrapper" style={{ width: 576, overflow: 'hidden' }}>
            <style>{`.shift-preview-wrapper > div { position: relative !important; left: auto !important; }`}</style>
            <ShiftSummaryTemplate ref={previewRef} data={SAMPLE_SHIFT} />
          </div>
        )}
      </div>

      {/* Diagnostics panel */}
      <div className="max-w-3xl mx-auto px-4 mt-6">
        <PrintDiagnosticsPanel />
      </div>
    </div>
  );
}

/** Inline version of KitchenTicketTemplate for preview (no position:absolute) */
function KitchenTicketInline({ order, items, stationName }: { order: PrintOrder; items: PrintOrder["items"]; stationName: string }) {
  const qNum = order.queueNumber || order.orderNumber || '---';
  const orderTypeLabel = order.orderType === 'takeaway' ? 'استلام'
    : order.orderType === 'delivery' ? 'توصيل' : 'محلي';

  return (
    <>
      <div style={{ textAlign: 'center', fontSize: '28px', fontWeight: 900, padding: '8px 0', borderBottom: '3px solid #000', marginBottom: '10px' }}>
        {stationName}
      </div>
      <div style={{ textAlign: 'center', fontSize: '44px', fontWeight: 900, margin: '8px 0' }}># {qNum}</div>
      <div style={{ textAlign: 'center', fontSize: '26px', fontWeight: 900, padding: '8px', border: '3px solid #000', margin: '8px 0' }}>
        {orderTypeLabel}
      </div>
      {order.tableNumber && (
        <div style={{ fontSize: '20px', fontWeight: 900, textAlign: 'center', margin: '4px 0' }}>
          طاولة: {order.tableNumber}
        </div>
      )}
      <div style={{ borderTop: '3px solid #000', margin: '10px 0' }} />
      {items.map((item, i) => (
        <div key={i} style={{ padding: '10px 0', borderBottom: '2px dashed #666' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '32px', fontWeight: 900, minWidth: '50px' }}>{item.quantity || 1}</span>
            <span style={{ fontSize: '28px', fontWeight: 900, textAlign: 'right', flex: 1 }}>{item.name}</span>
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
