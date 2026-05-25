/**
 * PrinterRow — Phase 2 smart printer row for /onboarding/new-device.
 *
 * One card per printer with:
 *   - role emoji + name + role label
 *   - target (windows:<name> or ip:port)
 *   - friendly status badge (works / failed / not-synced / different-network)
 *   - ONE primary smart button:
 *       USB/Windows or Network online  → "اختبار"
 *       Network offline / unknown      → "فحص الاتصال"
 *   - Secondary inline "تحويل إلى USB / Windows" when network is offline /
 *     subnet-mismatch / unreachable.
 *   - "مزامنة الطابعات الآن" when the bridge is using its FALLBACK list.
 *   - Kebab (⋯) menu for: تعديل / حذف / فحص متقدم / إعادة مزامنة هذه الطابعة /
 *     نسخ تفاصيل الخطأ.
 *
 * No printing logic changes — purely a presentational refactor of the existing
 * actions already wired in NewDeviceOnboardingPage.
 */
import { useState } from "react";
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, TestTube, Printer,
  MoreVertical, Pencil, Trash2, Activity, Copy, Cloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { probePrinter, type ProbePrinterResult } from "@/lib/device-config";
import { toast } from "sonner";

export interface PrinterRowPrinter {
  id: string;
  name: string;
  ip_address: string;
  port: number;
  printer_type: string;
  print_categories: string[];
  settings?: Record<string, unknown>;
}

export interface PrinterRowProps {
  printer: PrinterRowPrinter;
  roleLabel: string;
  roleEmoji: string;
  /** From bridge /health for this printer (matched by IP/key). */
  bridgeConnected?: boolean | null;
  bridgeSubnetMismatch?: boolean;
  /** True when bridge is reading its hardcoded fallback list (not device.json). */
  notSynced?: boolean;
  bridgeOnline: boolean;
  /** Latest tcp test result from the parent (refresh / test). */
  testStatus?: boolean | null;

  onTest: () => void | Promise<void>;
  onConvertToWindows: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  onResyncAll: () => void | Promise<void>;
}

type State =
  | "usb-ok" | "usb-missing-name"
  | "net-online" | "net-offline" | "net-unknown"
  | "subnet-mismatch" | "not-synced";

export default function PrinterRow(props: PrinterRowProps) {
  const {
    printer: p, roleLabel, roleEmoji,
    bridgeConnected, bridgeSubnetMismatch, notSynced, bridgeOnline,
    testStatus,
    onTest, onConvertToWindows, onDelete, onEdit, onResyncAll,
  } = props;

  const settings = (p.settings || {}) as Record<string, unknown>;
  const winName = String(settings.windows_printer_name || "");
  const isUsb = settings.connection === "usb" || !!winName;

  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<ProbePrinterResult | null>(null);

  // Effective network connectivity: prefer last manual probe, else bridge /health,
  // else last quick test result.
  const netConnected: boolean | null = probe
    ? probe.reachable
    : (bridgeConnected ?? (testStatus ?? null));
  const subnetMismatch = !!(probe?.subnetMismatch || bridgeSubnetMismatch);

  const state: State = (() => {
    if (isUsb) return winName ? "usb-ok" : "usb-missing-name";
    if (notSynced) return "not-synced";
    if (subnetMismatch) return "subnet-mismatch";
    if (netConnected === false) return "net-offline";
    if (netConnected === true)  return "net-online";
    return "net-unknown";
  })();

  const target = isUsb
    ? `windows:${winName || "?"}`
    : `${p.ip_address || "?"}:${p.port || 9100}`;

  const runProbe = async () => {
    if (!p.ip_address) { toast.error("لا يوجد IP لفحصه"); return; }
    if (!bridgeOnline) { toast.error("برنامج الطباعة غير متصل"); return; }
    setProbing(true);
    try {
      const r = await probePrinter(p.ip_address, Number(p.port) || 9100);
      setProbe(r);
      if (r.bridgeUnreachable)  toast.error("برنامج الطباعة لا يستجيب");
      else if (r.reachable)     toast.success(`${p.name} — الطابعة ترد`);
      else if (r.subnetMismatch) toast.warning("الطابعة على شبكة مختلفة عن جهاز الكاش");
      else                      toast.error(`${p.name} — لا ترد`);
    } finally {
      setProbing(false);
    }
  };

  const copyDetails = async () => {
    const blob = {
      printer: {
        id: p.id, name: p.name, ip: p.ip_address, port: p.port,
        role: p.print_categories?.[0] || p.printer_type,
        connection: isUsb ? "usb" : "network",
        windows_printer_name: winName || null,
      },
      state,
      bridge: { connected: bridgeConnected, subnetMismatch: bridgeSubnetMismatch, notSynced },
      lastProbe: probe?.raw ?? null,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(blob, null, 2));
      toast.success("تم نسخ تفاصيل الخطأ");
    } catch {
      toast.error("تعذر النسخ");
    }
  };

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="text-lg shrink-0">{roleEmoji}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium truncate text-sm">{p.name}</span>
            <span className="text-[10px] rounded-full bg-muted text-muted-foreground px-1.5 py-0.5 border border-border shrink-0">
              {roleLabel}
            </span>
            <ConnTypeBadge kind={isUsb ? "USB / Windows" : "Network IP"} />
          </div>
          <div className="text-[11px] text-muted-foreground font-mono truncate" dir="ltr">
            {target}
          </div>
        </div>

        <StateBadge state={state} />

        {/* Primary smart action */}
        <PrimaryAction
          state={state}
          probing={probing}
          bridgeOnline={bridgeOnline}
          onTest={onTest}
          onProbe={runProbe}
          onResyncAll={onResyncAll}
        />

        {/* Secondary: convert to USB/Windows when network can't reach */}
        {!isUsb && (state === "net-offline" || state === "subnet-mismatch" || state === "net-unknown") && (
          <Button
            size="sm" variant="outline"
            onClick={onConvertToWindows}
            className="gap-1 h-7 px-2 text-xs border-amber-400/60 text-amber-900 dark:text-amber-200 hidden sm:inline-flex"
            title="إذا الطابعة موصولة USB بجهاز الكاش، حوّلها إلى وضع Windows"
          >
            <Printer className="h-3.5 w-3.5" /> تحويل إلى USB / Windows
          </Button>
        )}

        {/* Kebab menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" dir="rtl">
            {onEdit && (
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onEdit(); }}>
                <Pencil className="h-4 w-4 ml-2" /> تعديل
              </DropdownMenuItem>
            )}
            {!isUsb && (
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void runProbe(); }} disabled={probing || !bridgeOnline}>
                <Activity className="h-4 w-4 ml-2" /> فحص متقدم
              </DropdownMenuItem>
            )}
            {!isUsb && (state === "net-offline" || state === "subnet-mismatch" || state === "net-unknown") && (
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onConvertToWindows(); }} className="sm:hidden">
                <Printer className="h-4 w-4 ml-2" /> تحويل إلى USB / Windows
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void onResyncAll(); }} disabled={!bridgeOnline}>
              <RefreshCw className="h-4 w-4 ml-2" /> إعادة مزامنة هذه الطابعة
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void copyDetails(); }}>
              <Copy className="h-4 w-4 ml-2" /> نسخ تفاصيل الخطأ
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => { e.preventDefault(); onDelete(); }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 ml-2" /> حذف
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Inline friendly hint for problem states */}
      {state === "subnet-mismatch" && (
        <HintBar tone="warn">
          هذه الطابعة على <strong>شبكة مختلفة عن جهاز الكاش</strong>. إن كانت موصولة USB بجهاز الكاش، استخدم «تحويل إلى USB / Windows».
        </HintBar>
      )}
      {state === "net-offline" && (
        <HintBar tone="error">
          <strong>الطابعة لا ترد</strong> على {p.ip_address}:{p.port}. تحقق من الكابل والطاقة، أو حوّلها إلى USB / Windows.
        </HintBar>
      )}
      {state === "usb-missing-name" && (
        <HintBar tone="error">
          <strong>اسم طابعة Windows غير موجود.</strong> حدّث الطابعة وحدّد اسم Windows الصحيح.
        </HintBar>
      )}
      {state === "not-synced" && (
        <HintBar tone="warn">
          هذه الطابعة <strong>غير متزامنة مع برنامج الطباعة</strong>. اضغط «مزامنة الطابعات الآن» لتحديث برنامج الطباعة.
        </HintBar>
      )}

      {/* Technical details (collapsible-by-click only when present) */}
      {probe && (probe.probeError || probe.hint) && (
        <details className="mt-1.5">
          <summary className="text-[10.5px] text-muted-foreground cursor-pointer hover:text-foreground">
            تفاصيل تقنية
          </summary>
          <div className="mt-1 font-mono text-[10.5px] text-muted-foreground bg-muted/40 rounded px-2 py-1" dir="ltr">
            {probe.probeError && <div>error: {probe.probeError}</div>}
            {probe.hint && <div>hint: {probe.hint}</div>}
            {probe.hostSubnets?.[0] && <div>host: {probe.hostSubnets[0].cidr}</div>}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Sub-pieces ──────────────────────────────────────────────────
function PrimaryAction({
  state, probing, bridgeOnline, onTest, onProbe, onResyncAll,
}: {
  state: State; probing: boolean; bridgeOnline: boolean;
  onTest: () => void | Promise<void>;
  onProbe: () => void | Promise<void>;
  onResyncAll: () => void | Promise<void>;
}) {
  if (state === "not-synced") {
    return (
      <Button size="sm" onClick={() => void onResyncAll()} disabled={!bridgeOnline} className="gap-1 h-7 px-2 text-xs">
        <Cloud className="h-3.5 w-3.5" /> مزامنة الطابعات الآن
      </Button>
    );
  }
  if (state === "usb-ok" || state === "net-online") {
    return (
      <Button size="sm" variant="secondary" onClick={() => void onTest()} disabled={!bridgeOnline} className="gap-1 h-7 px-2 text-xs">
        <TestTube className="h-3.5 w-3.5" /> اختبار
      </Button>
    );
  }
  if (state === "usb-missing-name") {
    return null;
  }
  // net-offline / net-unknown / subnet-mismatch → probe
  return (
    <Button size="sm" variant="secondary" onClick={() => void onProbe()} disabled={!bridgeOnline || probing} className="gap-1 h-7 px-2 text-xs">
      {probing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
      فحص الاتصال
    </Button>
  );
}

function StateBadge({ state }: { state: State }) {
  const map: Record<State, { label: string; cls: string; Icon: any }> = {
    "usb-ok":           { label: "تعمل (USB)",       cls: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800", Icon: CheckCircle2 },
    "net-online":       { label: "تعمل",             cls: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800", Icon: CheckCircle2 },
    "net-offline":      { label: "لا ترد",           cls: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800",                 Icon: XCircle },
    "net-unknown":      { label: "غير معروف",        cls: "bg-muted text-muted-foreground border-border",                                                                          Icon: Activity },
    "subnet-mismatch":  { label: "شبكة مختلفة",      cls: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800",           Icon: AlertTriangle },
    "not-synced":       { label: "غير متزامنة",      cls: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800",           Icon: AlertTriangle },
    "usb-missing-name": { label: "اسم Windows مفقود", cls: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800",                 Icon: XCircle },
  };
  const { label, cls, Icon } = map[state];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium shrink-0 ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

function ConnTypeBadge({ kind }: { kind: "USB / Windows" | "Network IP" }) {
  const cls = kind === "USB / Windows"
    ? "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800"
    : "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/40 dark:text-teal-200 dark:border-teal-800";
  return (
    <span className={`text-[10px] rounded-full border px-1.5 py-0.5 shrink-0 ${cls}`}>
      {kind}
    </span>
  );
}

function HintBar({ tone, children }: { tone: "warn" | "error"; children: React.ReactNode }) {
  const cls = tone === "warn"
    ? "border-amber-300/50 bg-amber-50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100"
    : "border-rose-300/50 bg-rose-50 text-rose-900 dark:bg-rose-950/20 dark:text-rose-100";
  return (
    <div className={`mt-1.5 text-[11px] rounded-md border px-2 py-1.5 ${cls}`}>
      {children}
    </div>
  );
}