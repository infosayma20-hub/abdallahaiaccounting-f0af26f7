/**
 * Test preview of the customer receipt + kitchen ticket in English or Arabic,
 * using the SAME English text builders as real printing (print-english.ts).
 * "Test print" temporarily switches the print language to English, sends via
 * tryPrintEnglish, then restores the previous language.
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Printer, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  buildEnglishReceiptText, buildEnglishKitchenText, bridgeSupportsEnglish,
  getReceiptLanguage, setReceiptLanguage, tryPrintEnglish,
} from "@/lib/print-english";

type Lang = "ar" | "en";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialLang: Lang;
  branchName?: string;
}

const SAMPLE = (companyName: string) => ({
  companyName,
  createdAt: new Date().toISOString(),
  dailyCounter: "TEST-01",
  cashierName: "Test Cashier",
  orderType: "takeaway",
  items: [
    { name: "Shawarma Sandwich", quantity: 2, price: 18, total: 36, notes: "No onion" },
    { name: "French Fries", quantity: 1, price: 10, total: 10 },
    { name: "Cola 330ml", quantity: 2, price: 5, total: 10 },
  ],
  subtotal: 56, discount: 0, total: 56,
  paymentMethod: "Cash", cashReceived: 100, change: 44,
  orderNote: "TEST PRINT - NOT A REAL ORDER",
});

const AR_ITEMS = [
  { name: "ساندويش شاورما", q: 2, t: 36, note: "بدون بصل" },
  { name: "بطاطا مقلية", q: 1, t: 10 },
  { name: "كولا 330 مل", q: 2, t: 10 },
];

export default function POSLanguagePreviewDialog({ open, onOpenChange, initialLang, branchName }: Props) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [bilingual, setBilingual] = useState<boolean | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => { if (open) { setLang(initialLang); bridgeSupportsEnglish().then(setBilingual).catch(() => setBilingual(false)); } }, [open, initialLang]);

  const order = useMemo(() => SAMPLE(/[\u0600-\u06FF]/.test(branchName || "") ? "UNIFY Demo" : (branchName || "UNIFY Demo")), [branchName]);
  const receiptEn = useMemo(() => buildEnglishReceiptText(order), [order]);
  const kitchenEn = useMemo(() => buildEnglishKitchenText(order, "Kitchen"), [order]);

  const testPrint = async (kind: "receipt" | "kitchen") => {
    const prev = getReceiptLanguage();
    setPrinting(true);
    try {
      setReceiptLanguage("en");
      const path = kind === "receipt" ? "/print-receipt" : "/print-kitchen";
      const res = await tryPrintEnglish(path, { order, printerKey: kind === "kitchen" ? "kitchen" : undefined, stationLabel: "Kitchen" });
      if (!res) toast.error("تعذّرت الطباعة: تأكد إن برنامج الطباعة شغّال وإن الطابعة طابعة شبكة معرّفة بالخطوة 3.");
      else if (res.success) toast.success(kind === "receipt" ? "انطبعت الفاتورة التجريبية" : "انطبع تكت المطبخ التجريبي");
      else toast.error(`فشلت الطباعة${res.error ? `: ${res.error}` : ""}`);
    } finally {
      setReceiptLanguage(prev);
      setPrinting(false);
    }
  };

  const Paper = ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground">{title}</div>
      <div className="rounded-md border border-border bg-card shadow-sm p-3 min-h-[320px]">{children}</div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-4xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>معاينة تجريبية — فاتورة وتكت مطبخ</DialogTitle></DialogHeader>

        <Tabs dir="rtl" value={lang} onValueChange={(v) => setLang(v as Lang)}>
          <TabsList>
            <TabsTrigger value="ar">عربي</TabsTrigger>
            <TabsTrigger value="en">English</TabsTrigger>
          </TabsList>
        </Tabs>

        {lang === "en" && bilingual === false && (
          <div className="rounded-md border border-warning/40 bg-warning/10 text-sm px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            برنامج الطباعة على هذا الجهاز عربي فقط أو غير متصل. الطباعة الإنجليزية بتشتغل على طابعات الشبكة؛ للدعم الكامل حدّث برنامج الطباعة.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lang === "en" ? (
            <>
              <Paper title="فاتورة الزبون">
                <pre dir="ltr" className="font-mono text-[10.5px] leading-[1.35] whitespace-pre overflow-x-auto text-foreground">{receiptEn}</pre>
              </Paper>
              <Paper title="تكت المطبخ">
                <pre dir="ltr" className="font-mono text-[10.5px] leading-[1.35] whitespace-pre overflow-x-auto text-foreground">{kitchenEn}</pre>
              </Paper>
            </>
          ) : (
            <>
              <Paper title="فاتورة الزبون">
                <div className="text-sm space-y-1">
                  <div className="text-center font-bold">{branchName || "يونيفاي"}</div>
                  <div className="text-center text-xs text-muted-foreground">{new Date().toLocaleString("ar")}</div>
                  <div className="border-t border-dashed border-border my-1" />
                  <div className="flex justify-between"><span>رقم الطلب</span><span>#TEST-01</span></div>
                  <div className="flex justify-between"><span>نوع الطلب</span><span>سفري</span></div>
                  <div className="border-t border-dashed border-border my-1" />
                  {AR_ITEMS.map(i => <div key={i.name} className="flex justify-between"><span>{i.q} × {i.name}</span><span>{i.t.toFixed(2)}</span></div>)}
                  <div className="border-t border-border my-1" />
                  <div className="flex justify-between font-bold"><span>الإجمالي (₪)</span><span>56.00</span></div>
                  <div className="flex justify-between"><span>الدفع</span><span>نقدي</span></div>
                  <div className="text-center text-xs text-muted-foreground pt-2">شكرًا لزيارتكم — يونيفاي</div>
                </div>
              </Paper>
              <Paper title="تكت المطبخ">
                <div className="text-sm space-y-1">
                  <div className="text-center font-bold">المطبخ</div>
                  <div className="text-center font-bold text-lg">طلب #TEST-01</div>
                  <div className="border-t border-dashed border-border my-1" />
                  {AR_ITEMS.map(i => <div key={i.name}><div className="font-semibold">{i.q} × {i.name}</div>{i.note && <div className="text-xs text-muted-foreground pe-4">— {i.note}</div>}</div>)}
                  <div className="border-t border-dashed border-border my-1" />
                  <div className="flex justify-between"><span>عدد القطع</span><span>5</span></div>
                </div>
              </Paper>
            </>
          )}
        </div>

        {lang === "en" && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" className="gap-2" disabled={printing} onClick={() => testPrint("receipt")}>
              <Printer className="h-4 w-4" /> طباعة فاتورة تجريبية
            </Button>
            <Button variant="outline" size="sm" className="gap-2" disabled={printing} onClick={() => testPrint("kitchen")}>
              <Printer className="h-4 w-4" /> طباعة تكت مطبخ تجريبي
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
