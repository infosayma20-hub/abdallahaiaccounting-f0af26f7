import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePrintBridge } from "@/hooks/usePrintBridge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Printer, Wifi, WifiOff, RefreshCw, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import BackButton from "@/components/BackButton";

interface PrinterRecord {
  id: string;
  name: string;
  ip_address: string;
  port: number;
  printer_type: string;
  paper_width: number;
  is_default: boolean;
  is_active: boolean;
  print_categories: string[];
  station_ids: string[];
}

const PRINTER_ICONS: Record<string, string> = {
  "receipt": "🧾",
  "kitchen_ticket": "🍳",
};

export default function PrinterSettingsPage() {
  const { user } = useAuth();
  const { checkBridge, printReceipt, printKitchen } = usePrintBridge();
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null);
  const [printers, setPrinters] = useState<PrinterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [stations, setStations] = useState<Record<string, string>>({});

  useEffect(() => {
    checkBridge().then(setBridgeOnline);
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    const [printersRes, stationsRes] = await Promise.all([
      supabase.from("pos_printers").select("*").eq("is_active", true).order("is_default", { ascending: false }),
      supabase.from("kitchen_stations").select("id, name").eq("is_active", true),
    ]);
    setPrinters((printersRes.data as any) || []);
    const stMap: Record<string, string> = {};
    ((stationsRes.data as any) || []).forEach((s: any) => { stMap[s.id] = s.name; });
    setStations(stMap);
    setLoading(false);
  };

  const getStationNames = (ids: string[]) => {
    return ids.map(id => stations[id] || id).join("، ");
  };

  const getCategory = (cats: string[]) => {
    if (cats.includes("receipt")) return { label: "وصل الزبون", icon: "🧾", color: "bg-emerald-500/10 text-emerald-600" };
    if (cats.includes("kitchen_ticket")) return { label: "تذكرة مطبخ", icon: "🍳", color: "bg-orange-500/10 text-orange-600" };
    return { label: "عامة", icon: "🖨️", color: "bg-muted text-muted-foreground" };
  };

  const testPrinter = async (printer: PrinterRecord) => {
    setTesting(printer.id);
    const testOrder = {
      orderNumber: "TEST-001",
      branchName: "فرع سفيان — اختبار طباعة",
      cashier: "النظام",
      tableNumber: "5",
      orderType: "اختبار",
      items: [{
        id: "1", name: `اختبار — ${printer.name}`,
        quantity: 1, price: 0,
      }],
      total: 0,
      paymentMethod: "اختبار",
    };

    try {
      const isReceipt = printer.print_categories?.includes("receipt");
      if (isReceipt) {
        await printReceipt(testOrder);
      } else {
        await printKitchen(testOrder);
      }
      toast.success(`✅ ${printer.name} — تم إرسال الاختبار`);
    } catch (err: any) {
      toast.error(`❌ ${printer.name} — فشل الاتصال: ${err.message}`);
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="min-h-full bg-background pb-24" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Printer className="h-6 w-6" /> إعدادات الطابعات
            </h1>
            <p className="text-sm text-muted-foreground">إدارة الطابعات الحرارية للفرع</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { checkBridge().then(setBridgeOnline); loadData(); }}>
            <RefreshCw className="h-4 w-4 ml-1" /> تحديث
          </Button>
        </div>

        {/* Bridge Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {bridgeOnline === null && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
              {bridgeOnline === true && <Wifi className="h-4 w-4 text-emerald-500" />}
              {bridgeOnline === false && <WifiOff className="h-4 w-4 text-destructive" />}
              خدمة الطباعة (Print Bridge)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bridgeOnline === null && <p className="text-sm text-muted-foreground">جاري فحص الاتصال...</p>}
            {bridgeOnline === true && (
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3 ml-1" /> متصلة — جاهزة للطباعة
              </Badge>
            )}
            {bridgeOnline === false && (
              <div className="space-y-2">
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 ml-1" /> غير متصلة
                </Badge>
                <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-xs space-y-1">
                  <p className="font-medium text-destructive">⚠️ خدمة الطباعة غير متاحة على هذا الجهاز</p>
                  <p className="text-muted-foreground">على جهاز الكاشير في المطعم، افتح CMD واكتب:</p>
                  <code className="block bg-background p-2 rounded text-[11px] font-mono" dir="ltr">
                    node print-bridge.js
                  </code>
                  <p className="text-muted-foreground mt-1">يجب أن يظهر: 🚀 Print Bridge — http://localhost:3001</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Printers List */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
        ) : printers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Printer className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>لا توجد طابعات معرّفة</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {printers.map(printer => {
              const cat = getCategory(printer.print_categories || []);
              return (
                <Card key={printer.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <span className="text-lg">{cat.icon}</span>
                        {printer.name}
                      </CardTitle>
                      {printer.is_default && <Badge variant="secondary" className="text-[10px]">افتراضية</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>IP</span>
                        <span className="font-mono text-foreground" dir="ltr">{printer.ip_address}:{printer.port}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>عرض الورق</span>
                        <span className="text-foreground">{printer.paper_width}mm</span>
                      </div>
                      <div className="flex justify-between">
                        <span>النوع</span>
                        <Badge className={`text-[10px] ${cat.color}`}>{cat.label}</Badge>
                      </div>
                      {printer.station_ids?.length > 0 && (
                        <div className="flex justify-between">
                          <span>المحطة</span>
                          <span className="text-foreground">{getStationNames(printer.station_ids)}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      disabled={testing === printer.id || bridgeOnline === false}
                      onClick={() => testPrinter(printer)}
                    >
                      {testing === printer.id ? (
                        <><RefreshCw className="h-3 w-3 ml-1 animate-spin" /> جاري الطباعة...</>
                      ) : (
                        <><Printer className="h-3 w-3 ml-1" /> 🖨️ اختبار الطباعة</>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Help Section */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">📋 تعليمات التشغيل الدائم</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-2">
            <p>1. حمّل Node.js من <span className="text-primary" dir="ltr">nodejs.org</span> (LTS)</p>
            <p>2. ضع ملف <code className="bg-muted px-1 rounded" dir="ltr">print-bridge.js</code> على سطح المكتب</p>
            <p>3. للتشغيل الدائم مع Windows:</p>
            <code className="block bg-muted p-2 rounded font-mono" dir="ltr">
              npm install -g pm2{"\n"}
              pm2 start print-bridge.js --name malaki-print{"\n"}
              pm2 startup{"\n"}
              pm2 save
            </code>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
