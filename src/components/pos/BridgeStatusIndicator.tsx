/**
 * Bridge Status Indicator — small, always-visible badge in POS topbar.
 * Shows whether the local Print Bridge (192.168.1.65:3001) is reachable
 * and surfaces per-printer connectivity in a popover on click.
 *
 * Polls every 15s. Lightweight — no bundle/UI cost when bridge is offline.
 */
import { useEffect, useState, useCallback } from "react";
import { Printer, Loader2, RefreshCw, CheckCircle2, XCircle, Cloud, AlertCircle, ShieldAlert } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { checkBridgeHealth, getPrintBridgeUrl } from "@/lib/print-bridge-client";
import { syncThisDeviceToBridge } from "@/lib/device-config";
import PrinterProbeButton from "@/components/pos/PrinterProbeButton";
import { toast } from "sonner";

type Printer = { key: string; name: string; ip: string; port?: number; connected: boolean; source?: string; subnetMismatch?: boolean };
type SubnetWarning = { key: string; name: string; ip: string; message: string };
type HostSubnet = { iface: string; ip?: string; cidr: string };
type Status = "checking" | "online" | "offline";

const POLL_MS = 15_000;

export default function BridgeStatusIndicator() {
  const [status, setStatus] = useState<Status>("checking");
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMsg, setLastSyncMsg] = useState<string>("");
  const [lastSyncOk, setLastSyncOk] = useState<boolean | null>(null);
  const [subnetWarnings, setSubnetWarnings] = useState<SubnetWarning[]>([]);
  const [hostSubnets, setHostSubnets] = useState<HostSubnet[]>([]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const health = await checkBridgeHealth();
      setStatus(health.online ? "online" : "offline");
      setPrinters(health.printers || []);
      setSource(health.source || null);
      setSynced(health.synced === true);
      setSubnetWarnings(Array.isArray(health.subnetWarnings) ? health.subnetWarnings : []);
      setHostSubnets(Array.isArray(health.hostSubnets) ? health.hostSubnets : []);
      setLastCheck(new Date());
    } catch {
      setStatus("offline");
      setPrinters([]);
      setSource(null);
      setSynced(false);
      setSubnetWarnings([]);
      setHostSubnets([]);
      setLastCheck(new Date());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const isOnline = status === "online";
  const isChecking = status === "checking";

  // Color logic
  const dotColor = isChecking ? "#fbbf24" : isOnline ? "#22c55e" : "#ef4444";
  const ringColor = isChecking
    ? "rgba(251,191,36,0.35)"
    : isOnline
    ? "rgba(34,197,94,0.35)"
    : "rgba(239,68,68,0.35)";

  const connectedCount = printers.filter((p) => p.connected).length;
  const totalCount = printers.length;
  const isFallback = source === "fallback";

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await syncThisDeviceToBridge();
      setLastSyncOk(r.ok);
      setLastSyncMsg(r.message);
      if (r.ok) toast.success(`✅ ${r.message}`);
      else      toast.error(`⚠️ ${r.message}`);
      await refresh();
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={
            isChecking
              ? "جارٍ فحص اتصال الطباعة..."
              : isOnline
              ? `Print Bridge متصل — ${connectedCount}/${totalCount} طابعة`
              : "Print Bridge غير متصل"
          }
          className="relative h-9 w-9 rounded-lg flex items-center justify-center hover:bg-white/[0.08] transition-all shrink-0"
        >
          <Printer
            className="h-[18px] w-[18px]"
            style={{ color: isOnline ? "white" : "rgba(255,255,255,0.55)" }}
          />
          {/* status dot */}
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
            style={{
              background: dotColor,
              boxShadow: `0 0 0 2px #0D1B2E, 0 0 0 4px ${ringColor}`,
            }}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 overflow-hidden"
        dir="rtl"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{
            background: isOnline ? "#ecfdf5" : "#fef2f2",
            borderColor: isOnline ? "#a7f3d0" : "#fecaca",
          }}
        >
          <div className="flex items-center gap-2">
            {isChecking ? (
              <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
            ) : isOnline ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600" />
            )}
            <div>
              <div className="text-sm font-bold text-foreground">
                {isChecking
                  ? "جارٍ الفحص..."
                  : isOnline
                  ? "متصل بنظام الطباعة"
                  : "غير متصل بنظام الطباعة"}
              </div>
              <div className="text-[11px] text-muted-foreground font-mono">
                {getPrintBridgeUrl()}
              </div>
              {synced && (
                <div className="text-[10px] text-success">
                  تم تحديث الطابعات من إعدادات الفرع
                </div>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.preventDefault();
              refresh();
            }}
            disabled={refreshing}
            title="تحديث الآن"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Body */}
        <div className="p-3">
          {!isOnline ? (
            <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p className="font-medium text-foreground">
                لم يتم العثور على خدمة الطباعة المحلية.
              </p>
              <ul className="list-disc pr-4 space-y-1">
                <li>تأكد أن جهاز الكاش الرئيسي يعمل وعليه برنامج Print Bridge.</li>
                <li>تأكد أن هذا الجهاز على نفس شبكة الواي فاي.</li>
                <li>افتح التطبيق في تبويب مستقل (وليس داخل المعاينة).</li>
              </ul>
            </div>
          ) : printers.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2 text-center">
              لا توجد طابعات مُسجَّلة في البردج.
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide px-1">
                الطابعات ({connectedCount}/{totalCount}){source ? ` — ${source}` : ""}
              </div>
              {printers.map((p) => (
                <div
                  key={`${p.key}-${p.ip || p.name}`}
                  className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{
                        background: p.connected ? "#22c55e" : "#ef4444",
                      }}
                    />
                    <span className="text-sm font-medium truncate">{p.name}</span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                    {p.ip}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t bg-muted/30 space-y-2">
          <Button
            onClick={handleSync}
            disabled={syncing}
            className="w-full gap-2 h-8 text-xs"
            size="sm"
          >
            {syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
            مزامنة هذا الجهاز
          </Button>
          {isFallback && (
            <div className="text-[10.5px] text-amber-700 dark:text-amber-300 flex items-start gap-1 leading-snug">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>برنامج الطباعة يستخدم القائمة الافتراضية. اضغط «مزامنة» لإرسال طابعات الفرع.</span>
            </div>
          )}
          {lastSyncOk === true && !isFallback && lastSyncMsg && (
            <div className="text-[10.5px] text-success leading-snug">{lastSyncMsg}</div>
          )}
          {lastSyncOk === false && lastSyncMsg && (
            <div className="text-[10.5px] text-destructive leading-snug">{lastSyncMsg}</div>
          )}
        </div>
        {lastCheck && (
          <div className="px-4 py-2 border-t bg-muted/40 text-[11px] text-muted-foreground text-center">
            آخر فحص: {lastCheck.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
