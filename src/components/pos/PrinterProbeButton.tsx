/**
 * PrinterProbeButton — small "فحص الاتصال" button that uses the Print Bridge
 * GET /probe-printer endpoint to report TCP reachability + subnet mismatch.
 * When mismatch is detected, exposes an "أضفها بالقوة" action that POSTs to
 * /add-printer with force:true.
 */
import { useState } from "react";
import { Activity, Loader2, CheckCircle2, XCircle, AlertTriangle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { probePrinter, addPrinterToBridge, reloadBridgeConfig, type ProbePrinterResult } from "@/lib/device-config";
import { toast } from "sonner";

interface Props {
  ip: string;
  port?: number;
  printerKey?: string;
  printerName?: string;
  width?: number;
  /** Show the "أضفها بالقوة" button when mismatch is detected. */
  allowForceAdd?: boolean;
  /** Called after a successful (or forced) add so parent can refresh. */
  onAdded?: () => void;
  size?: "sm" | "xs";
  variant?: "ghost" | "outline";
}

export default function PrinterProbeButton({
  ip, port = 9100, printerKey, printerName, width,
  allowForceAdd = false, onAdded,
  size = "sm", variant = "ghost",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProbePrinterResult | null>(null);
  const [forcing, setForcing] = useState(false);

  const run = async () => {
    if (!ip) return;
    setLoading(true);
    try {
      const r = await probePrinter(ip, port);
      setResult(r);
    } finally {
      setLoading(false);
    }
  };

  const forceAdd = async () => {
    if (!printerKey) {
      toast.error("نوع الطابعة (key) غير محدد");
      return;
    }
    setForcing(true);
    try {
      const r = await addPrinterToBridge({
        key: printerKey, name: printerName, ip, port, width, force: true,
      });
      if (r.ok) {
        await reloadBridgeConfig().catch(() => null);
        toast.success(r.reachable
          ? "✅ تمت الإضافة بالقوة والطابعة متصلة"
          : "✅ تمت الإضافة بالقوة (لكن الطابعة غير قابلة للوصول حالياً)");
        onAdded?.();
        // Re-probe to refresh badge
        await run();
      } else {
        toast.error(`فشلت الإضافة: ${r.error || "غير معروف"}`);
      }
    } finally {
      setForcing(false);
    }
  };

  const sizeCls = size === "xs" ? "h-6 px-2 text-[11px]" : "h-7 px-2 text-xs";

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant={variant}
        onClick={run}
        disabled={loading || !ip}
        className={`gap-1 ${sizeCls}`}
        title="فحص اتصال هذه الطابعة عبر برنامج الطباعة"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
        فحص الاتصال
      </Button>

      {result && (
        <ProbeBadge result={result} />
      )}

      {result?.subnetMismatch && (
        <div className="text-[10.5px] text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border border-amber-300/50 rounded-md px-2 py-1.5 max-w-[260px] leading-snug" dir="rtl">
          <div className="flex items-start gap-1 font-medium">
            <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0" />
            هذه الطابعة على شبكة مختلفة عن جهاز الكاش. قد لا تطبع إلا إذا كان هناك ربط بين الشبكتين.
          </div>
          <div className="mt-1 font-mono text-[10px] opacity-80" dir="ltr">
            <div>جهاز الكاش: {(result.hostSubnets[0]?.cidr) || "?"}</div>
            <div>الطابعة: {result.ip}</div>
          </div>
          {allowForceAdd && printerKey && (
            <Button
              type="button" size="sm" variant="outline"
              onClick={forceAdd}
              disabled={forcing}
              className="mt-1.5 h-6 px-2 text-[10.5px] gap-1 border-amber-400/60"
            >
              {forcing ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
              أضفها بالقوة
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ProbeBadge({ result }: { result: ProbePrinterResult }) {
  if (result.bridgeUnreachable) {
    return (
      <span className="text-[10.5px] text-destructive inline-flex items-center gap-1">
        <XCircle className="h-3 w-3" /> برنامج الطباعة غير متاح
      </span>
    );
  }
  if (result.reachable) {
    return (
      <span className="text-[10.5px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" /> الطابعة متصلة
      </span>
    );
  }
  if (result.subnetMismatch) {
    return (
      <span className="text-[10.5px] text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" /> شبكة مختلفة
      </span>
    );
  }
  const why = result.probeError === "timeout" ? "انتهت المهلة"
    : result.probeError === "EHOSTUNREACH" ? "الشبكة غير قابلة للوصول"
    : result.probeError === "ECONNREFUSED" ? "رفض الاتصال"
    : result.probeError || "غير قابلة للوصول";
  return (
    <span className="text-[10.5px] text-destructive inline-flex items-center gap-1">
      <XCircle className="h-3 w-3" /> {why}
    </span>
  );
}