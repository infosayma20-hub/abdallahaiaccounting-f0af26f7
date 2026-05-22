import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePrintBridge } from "@/hooks/usePrintBridge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Printer, Wifi, WifiOff, RefreshCw, CheckCircle2, XCircle, TestTube, Settings2 } from "lucide-react";
import BackButton from "@/components/BackButton";
import { getBridgeUrl } from "@/lib/device-config";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";

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
  branch_id: string | null;
}

interface StationRecord {
  id: string;
  name: string;
  station_type: string;
  is_active: boolean;
}

const PRINTER_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  receipt: { label: "وصل الزبون", icon: "🧾", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  kitchen_ticket: { label: "تذكرة مطبخ", icon: "🍳", color: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  escpos: { label: "ESC/POS عام", icon: "🖨️", color: "bg-muted text-muted-foreground" },
};

export default function PrinterSettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { checkBridge, getHealth, testPrinter: testPrinterConn } = usePrintBridge();
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null);
  const [printers, setPrinters] = useState<PrinterRecord[]>([]);
  const [stations, setStations] = useState<StationRecord[]>([]);
  const [stationMap, setStationMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [printerStatus, setPrinterStatus] = useState<Record<string, boolean | null>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    const [printersRes, stationsRes] = await Promise.all([
      supabase.from("pos_printers").select("*").eq("is_active", true).order("is_default", { ascending: false }),
      supabase.from("kitchen_stations").select("*").eq("is_active", true),
    ]);
    const printerData = (printersRes.data as any) || [];
    const stationData = (stationsRes.data as any) || [];
    setPrinters(printerData);
    setStations(stationData);

    const map: Record<string, string> = {};
    stationData.forEach((s: any) => { map[s.id] = s.name; });
    setStationMap(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    checkBridge().then(setBridgeOnline);
    loadData();
  }, [user, loadData, checkBridge]);

  // Auto-refresh printer status every 30s
  useEffect(() => {
    if (!bridgeOnline) return;
    const checkAll = async () => {
      const health = await getHealth();
      if (health.online && health.printers) {
        const statusMap: Record<string, boolean> = {};
        health.printers.forEach(p => {
          // Match by IP
          const printer = printers.find(pr => pr.ip_address === p.ip);
          if (printer) statusMap[printer.id] = p.connected;
        });
        setPrinterStatus(statusMap);
      }
    };
    checkAll();
    const interval = setInterval(checkAll, 30000);
    return () => clearInterval(interval);
  }, [bridgeOnline, printers, getHealth]);

  const getStationNames = (ids: string[]) => {
    return ids.map(id => stationMap[id] || "—").filter(n => n !== "—").join("، ");
  };

  const getTypeInfo = (printer: PrinterRecord) => {
    const cats = printer.print_categories || [];
    if (cats.includes("receipt")) return PRINTER_TYPE_LABELS.receipt;
    if (cats.includes("kitchen_ticket")) return PRINTER_TYPE_LABELS.kitchen_ticket;
    return PRINTER_TYPE_LABELS[printer.printer_type] || PRINTER_TYPE_LABELS.escpos;
  };

  const handleTestPrinter = async (printer: PrinterRecord) => {
    setTesting(printer.id);
    try {
      const ok = await testPrinterConn(printer.ip_address, printer.port);
      if (ok) {
        toast.success(`✅ ${printer.name} — الطباعة تعمل بنجاح`);
        setPrinterStatus(prev => ({ ...prev, [printer.id]: true }));
      } else {
        toast.error(`❌ ${printer.name} — فشل الاتصال`);
        setPrinterStatus(prev => ({ ...prev, [printer.id]: false }));
      }
    } catch (err: any) {
      toast.error(`❌ ${printer.name} — ${err.message}`);
      setPrinterStatus(prev => ({ ...prev, [printer.id]: false }));
    } finally {
      setTesting(null);
    }
  };

  const getStatusIndicator = (printerId: string) => {
    const status = printerStatus[printerId];
    if (testing === printerId) return <Badge variant="outline" className="gap-1 text-[10px]"><RefreshCw className="h-2.5 w-2.5 animate-spin" /> جاري الاختبار</Badge>;
    if (status === true) return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1 text-[10px]"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> متصل</Badge>;
    if (status === false) return <Badge variant="destructive" className="gap-1 text-[10px]"><span className="h-2 w-2 rounded-full bg-destructive inline-block" /> غير متصل</Badge>;
    return <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">غير مفحوص</Badge>;
  };

  return (
    <div className="min-h-full bg-background pb-24" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Printer className="h-6 w-6" /> إعدادات الطابعات
            </h1>
            <p className="text-sm text-muted-foreground">إدارة الطابعات الحرارية وتوجيه التذاكر</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { checkBridge().then(setBridgeOnline); loadData(); }}>
            <RefreshCw className="h-4 w-4 ml-1" /> تحديث
          </Button>
        </div>

        {/* Onboarding shortcut */}
        <button
          type="button"
          onClick={() => navigate("/onboarding/new-device")}
          className="w-full rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-3 text-right hover:bg-primary/10 transition-colors"
        >
          <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground">معالج تجهيز جهاز نقطة بيع جديد</div>
            <div className="text-[11px] text-muted-foreground">يأخذك خطوة بخطوة لربط الجهاز والطابعات في أقل من 10 دقائق.</div>
          </div>
          <span className="text-xs text-primary shrink-0">فتح المعالج ←</span>
        </button>

        {/* Bridge Status */}
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
          <span className="text-sm font-medium text-muted-foreground">حالة Print Bridge:</span>
          {bridgeOnline === null && (
            <Badge variant="outline" className="gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> جاري الفحص...</Badge>
          )}
          {bridgeOnline === true && (
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> متصل
            </Badge>
          )}
          {bridgeOnline === false && (
            <Badge variant="destructive" className="gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-destructive" /> غير متصل
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground font-mono mr-auto" dir="ltr">
            {getBridgeUrl() || "غير معدّ"}
          </span>
          <Link to="/device-setup" className="text-[10px] text-primary hover:underline">إعدادات الجهاز</Link>
        </div>

        {/* Info banner about Arabic fix */}
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-200 space-y-1">
          <div className="font-medium">💡 Print Bridge v3 — إصلاح النص العربي</div>
          <div>تم تحديث الجسر لاستخدام ترميز CP1256 (Windows Arabic) مع عكس ترتيب الكلمات للطابعات الحرارية RTL.</div>
          <div>قم بتحديث ملف <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded font-mono">print-bridge.js</code> على جهاز الكاشير ثم أعد تشغيل الخدمة.</div>
        </div>

        {/* Printers Grid */}
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
              const typeInfo = getTypeInfo(printer);
              return (
                <Card key={printer.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <span className="text-lg">{typeInfo.icon}</span>
                        {printer.name}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {printer.is_default && <Badge variant="secondary" className="text-[10px]">افتراضية</Badge>}
                        {getStatusIndicator(printer.id)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>العنوان</span>
                        <span className="font-mono text-foreground" dir="ltr">{printer.ip_address}:{printer.port}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>عرض الورق</span>
                        <span className="text-foreground">{printer.paper_width}mm</span>
                      </div>
                      <div className="flex justify-between">
                        <span>النوع</span>
                        <Badge className={`text-[10px] ${typeInfo.color}`}>{typeInfo.label}</Badge>
                      </div>
                      {printer.station_ids?.length > 0 && (
                        <div className="flex justify-between">
                          <span>المحطة</span>
                          <span className="text-foreground">{getStationNames(printer.station_ids)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        disabled={testing === printer.id || bridgeOnline === false}
                        onClick={() => handleTestPrinter(printer)}
                      >
                        {testing === printer.id ? (
                          <><RefreshCw className="h-3 w-3 ml-1 animate-spin" /> جاري...</>
                        ) : (
                          <><TestTube className="h-3 w-3 ml-1" /> اختبار</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Station → Printer Mapping */}
        {stations.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Settings2 className="h-5 w-5" /> محطات المطبخ والتوجيه
            </h2>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-right p-3 font-medium">المحطة</th>
                    <th className="text-right p-3 font-medium">النوع</th>
                    <th className="text-right p-3 font-medium">الطابعة المرتبطة</th>
                    <th className="text-right p-3 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {stations.map(station => {
                    const linkedPrinter = printers.find(p => p.station_ids?.includes(station.id));
                    return (
                      <tr key={station.id} className="border-b last:border-0">
                        <td className="p-3 font-medium">{station.name}</td>
                        <td className="p-3 text-muted-foreground">{station.station_type === 'kitchen' ? 'مطبخ' : station.station_type}</td>
                        <td className="p-3">
                          {linkedPrinter ? (
                            <span className="flex items-center gap-1.5">
                              <Printer className="h-3.5 w-3.5 text-muted-foreground" />
                              {linkedPrinter.name}
                              <span className="text-[10px] font-mono text-muted-foreground" dir="ltr">({linkedPrinter.ip_address})</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">غير مرتبطة</span>
                          )}
                        </td>
                        <td className="p-3">
                          {linkedPrinter ? getStatusIndicator(linkedPrinter.id) : <Badge variant="outline" className="text-[10px]">—</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
