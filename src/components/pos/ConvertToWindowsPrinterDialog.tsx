/**
 * ConvertToWindowsPrinterDialog
 *
 * Converts an existing `pos_printers` row that is saved as a network printer
 * (type=network, with an IP) into a Windows-mode printer
 * (settings.connection=windows + settings.windows_printer_name).
 *
 * Used when a thermal printer is actually wired via USB to the cashier PC,
 * but its self-test prints a factory-default IP (e.g. 192.168.1.87) that
 * the bridge cannot reach. Switching to Windows mode bypasses TCP entirely.
 *
 * Flow:
 *   1) GET /windows-printers
 *   2) Pick + (optionally) confirm risky printers (AnyDesk / PDF / OneNote)
 *   3) UPDATE pos_printers → settings.connection="windows",
 *      settings.windows_printer_name=<picked>, ip_address=null, port=null
 *   4) POST /device-config printers map with the new windows entry
 *   5) POST /reload-config
 *   6) POST /test-printer (windows mode)
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getDeviceConfig, pushPrintersToBridge, reloadBridgeConfig,
  type BridgePrinterKey,
} from "@/lib/device-config";
import { getLocalNetworkBlockedMessage, withLocalNetworkAccess } from "@/lib/local-network-fetch";

export interface WindowsPrinterRaw {
  name: string;
  driverName?: string;
  portName?: string;
  printerStatus?: string | number;
  workOffline?: boolean;
  shared?: boolean;
  default?: boolean;
}

type Kind = "USB" | "Network/WiFi" | "Network/IP" | "Virtual/PDF" | "Remote/AnyDesk" | "Unknown";

function detectKind(p: WindowsPrinterRaw): Kind {
  const port = String(p.portName || "").trim();
  const name = String(p.name || "").toLowerCase();
  const drv  = String(p.driverName || "").toLowerCase();
  if (name.includes("anydesk") || drv.includes("anydesk")) return "Remote/AnyDesk";
  if (port === "PORTPROMPT:" || name.includes("pdf") || name.includes("onenote") || name.includes("xps") || name.includes("fax")) return "Virtual/PDF";
  if (/^USB/i.test(port)) return "USB";
  if (/WSD/i.test(port) || /^NPI/i.test(port)) return "Network/WiFi";
  if (/^IP_/i.test(port) || /^\d{1,3}(\.\d{1,3}){3}$/.test(port)) return "Network/IP";
  return "Unknown";
}

function isRisky(kind: Kind, name: string): boolean {
  if (kind === "Remote/AnyDesk" || kind === "Virtual/PDF") return true;
  const n = name.toLowerCase();
  return n.includes("anydesk") || n.includes("pdf") || n.includes("onenote") || n.includes("xps") || n.includes("fax");
}

function kindBadgeClass(k: Kind): string {
  switch (k) {
    case "USB":           return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-200";
    case "Network/WiFi":  return "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200";
    case "Network/IP":    return "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/40 dark:text-teal-200";
    case "Virtual/PDF":   return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200";
    case "Remote/AnyDesk":return "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200";
    default:              return "bg-muted text-muted-foreground border-border";
  }
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Either pass posPrinterId directly, or bridgeKey+branchId to look it up. */
  posPrinterId?: string;
  bridgeKey?: BridgePrinterKey;
  branchId?: string;
  /** Display name (used in toasts + test print payload). */
  printerName: string;
  /** Print width in dots; defaults to 576. */
  width?: number;
  onConverted?: () => void;
}

export default function ConvertToWindowsPrinterDialog({
  open, onOpenChange, posPrinterId, bridgeKey, branchId,
  printerName, width = 576, onConverted,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<WindowsPrinterRaw[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string>("");
  const [confirmRisky, setConfirmRisky] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickedInfo = useMemo(() => list.find(p => p.name === picked), [list, picked]);
  const pickedKind = pickedInfo ? detectKind(pickedInfo) : "Unknown";
  const pickedRisky = pickedInfo ? isRisky(pickedKind, pickedInfo.name) : false;

  const fetchList = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = getDeviceConfig().bridgeUrl || "http://127.0.0.1:3001";
      const res = await fetch(`${url}/windows-printers`, withLocalNetworkAccess({ signal: AbortSignal.timeout(5000) }));
      const data = await res.json().catch(() => ({}));
      const raw: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.printers) ? (data as any).printers : [];
      const parsed: WindowsPrinterRaw[] = raw
        .map((p): WindowsPrinterRaw | null => {
          if (typeof p === "string") return { name: p };
          if (p && typeof p === "object") {
            const o = p as Record<string, unknown>;
            const n = (o.name ?? o.Name ?? o.printerName ?? o.PrinterName) as string | undefined;
            if (!n || typeof n !== "string") return null;
            return {
              name: n,
              driverName:    typeof o.driverName === "string" ? o.driverName : undefined,
              portName:      typeof o.portName   === "string" ? o.portName   : undefined,
              printerStatus: o.printerStatus as string | number | undefined,
              workOffline:   Boolean(o.workOffline),
              shared:        Boolean(o.shared),
              default:       Boolean(o.default),
            };
          }
          return null;
        })
        .filter((x): x is WindowsPrinterRaw => !!x);
      setList(parsed);
      if (parsed.length === 0) setError("لم يتم العثور على أي طابعة Windows على هذا الجهاز.");
    } catch (e: any) {
      setError(getLocalNetworkBlockedMessage());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setPicked("");
      setConfirmRisky(false);
      void fetchList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const resolvePosPrinterRow = async (): Promise<{ id: string; key: BridgePrinterKey; settings: Record<string, any> } | null> => {
    // Direct id path
    if (posPrinterId) {
      const { data, error: e } = await (supabase.from("pos_printers") as any)
        .select("id, settings, print_categories, printer_type")
        .eq("id", posPrinterId)
        .maybeSingle();
      if (e || !data) return null;
      const role = (data.print_categories?.[0] || data.printer_type) as string;
      const key = roleToKey(role) || bridgeKey;
      if (!key) return null;
      return { id: data.id, key, settings: (data.settings || {}) as Record<string, any> };
    }
    // Lookup by bridgeKey + branchId
    if (!bridgeKey || !branchId) return null;
    const role = keyToRole(bridgeKey);
    const { data, error: e } = await (supabase.from("pos_printers") as any)
      .select("id, settings, print_categories, printer_type, branch_id, is_active")
      .eq("is_active", true)
      .or(`branch_id.eq.${branchId},branch_id.is.null`);
    if (e || !Array.isArray(data)) return null;
    const match = data.find((r: any) => {
      const rrole = r.print_categories?.[0] || r.printer_type;
      return rrole === role || (role === "kitchen_ticket" && rrole === "kitchen");
    });
    if (!match) return null;
    return { id: match.id, key: bridgeKey, settings: (match.settings || {}) as Record<string, any> };
  };

  const handleConfirm = async () => {
    if (!picked) { toast.error("اختر طابعة Windows أولاً"); return; }
    if (pickedRisky && !confirmRisky) {
      toast.error("هذه طابعة افتراضية/Remote — أكّد الاختيار في صندوق التأكيد.");
      return;
    }
    setSaving(true);
    try {
      const row = await resolvePosPrinterRow();
      if (!row) { toast.error("تعذّر العثور على سجل الطابعة في قاعدة البيانات."); return; }

      // 1) Update pos_printers
      const newSettings = {
        ...(row.settings || {}),
        connection: "windows",
        windows_printer_name: picked,
      };
      const { error: upErr } = await (supabase.from("pos_printers") as any)
        .update({
          settings: newSettings,
          ip_address: null,
          port: null,
        })
        .eq("id", row.id);
      if (upErr) { toast.error("فشل تحديث السجل: " + upErr.message); return; }

      // 2) Push to bridge (windows entry, replaces old network entry under same key)
      const pushed = await pushPrintersToBridge({
        [row.key]: {
          type: "windows",
          name: printerName,
          windowsPrinterName: picked,
          width,
        },
      }).catch(() => false);
      if (!pushed) {
        toast.warning("تم التحديث في القاعدة لكن فشل الإرسال لبرنامج الطباعة.");
      } else {
        await reloadBridgeConfig().catch(() => null);
      }

      // 3) Test-print via Windows mode
      try {
        const url = getDeviceConfig().bridgeUrl || "http://127.0.0.1:3001";
        const r = await fetch(`${url}/test-printer`, withLocalNetworkAccess({
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({ type: "windows", windowsPrinterName: picked, name: printerName }),
          signal: AbortSignal.timeout(8000),
        }));
        const j = await r.json().catch(() => ({}));
        if (j?.success) {
          toast.success("✅ تم تحويل الطابعة إلى USB / Windows بنجاح");
        } else {
          toast.warning("تم التحويل، لكن طباعة الاختبار لم تنجح: " + (j?.error || "غير معروف"));
        }
      } catch {
        toast.warning("تم التحويل، لكن لم نتمكن من إرسال طباعة اختبار.");
      }

      onConverted?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" /> اختيار طابعة Windows
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            إذا كانت الطابعة موصولة بسلك USB بجهاز الكاش، اختر اسمها من طابعات Windows. سيتم تجاهل عنوان IP.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-muted-foreground">
              الطابعة الحالية: <span className="font-medium text-foreground">{printerName}</span>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={fetchList} disabled={loading} className="h-7 px-2 gap-1 text-xs">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              تحديث
            </Button>
          </div>

          {loading ? (
            <div className="text-xs text-muted-foreground py-6 text-center inline-flex items-center justify-center gap-2 w-full">
              <Loader2 className="h-4 w-4 animate-spin" /> جارٍ قراءة طابعات Windows...
            </div>
          ) : error ? (
            <div className="text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded-md px-3 py-2">{error}</div>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
              {list.map((p) => {
                const k = detectKind(p);
                const risky = isRisky(k, p.name);
                const selected = picked === p.name;
                return (
                  <button
                    type="button"
                    key={p.name}
                    onClick={() => setPicked(p.name)}
                    className={`w-full text-right px-3 py-2 flex items-start gap-2 hover:bg-muted/60 transition-colors ${selected ? "bg-primary/10" : ""}`}
                  >
                    <div className="mt-0.5">
                      {selected ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Printer className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-2">
                        {p.name}
                        {p.default && <span className="text-[10px] text-muted-foreground">(افتراضية)</span>}
                      </div>
                      <div className="text-[10.5px] text-muted-foreground font-mono truncate" dir="ltr">
                        {p.portName || "—"}{p.driverName ? ` · ${p.driverName}` : ""}
                      </div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${kindBadgeClass(k)} shrink-0`}>{k}</span>
                    {risky && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          )}

          {pickedRisky && (
            <label className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-100 cursor-pointer">
              <Checkbox
                checked={confirmRisky}
                onCheckedChange={(v) => setConfirmRisky(v === true)}
                className="mt-0.5"
              />
              <span className="leading-snug">
                هذه الطابعة تبدو افتراضية أو Remote (AnyDesk / PDF / OneNote). أؤكد أنني أريد استخدامها فعلاً.
              </span>
            </label>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={saving || !picked || (pickedRisky && !confirmRisky)}
            className="gap-1"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            تحويل إلى Windows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Role <-> key mapping (mirrors device-config) ──────────────
function roleToKey(role: string | undefined | null): BridgePrinterKey | null {
  switch (role) {
    case "receipt": return "receipt";
    case "kitchen": case "kitchen_ticket": return "kitchen";
    case "grill": return "grill";
    case "pizza": return "pizza";
    case "unified_kitchen": return "unified_kitchen";
    default: return null;
  }
}
function keyToRole(k: BridgePrinterKey): string {
  switch (k) {
    case "receipt": return "receipt";
    case "kitchen": return "kitchen_ticket";
    default: return k;
  }
}