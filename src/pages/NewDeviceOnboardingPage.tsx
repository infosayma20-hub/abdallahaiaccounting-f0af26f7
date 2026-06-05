/**
 * /onboarding/new-device — معالج تجهيز جهاز نقطة بيع جديد
 *
 * شاشة موحّدة لتعريف:
 *   1) Print Bridge
 *   2) الجهاز (label / branch / terminal / cash box)
 *   3) نسخة احتياطية device.json (Export / Import)
 *   4) الطابعات (شبكة IP:9100 أو USB)
 *   5) Smoke Test قبل التسليم
 *
 * مهم: لا تغيّر منطق الطباعة الحالي. لا تلمس pos_receipt_copies / printAllImage
 * / KDS / صلاحيات. هذه الشاشة فقط واجهة منظِّمة فوق الأنظمة الموجودة.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Monitor, Wifi, WifiOff, Building2, Boxes, Save, TestTube, RefreshCw,
  CheckCircle2, XCircle, Sparkles, Printer, Rocket, Plus, Download, Upload,
  Copy, ShieldAlert, Banknote, Link2, Trash2, AlertCircle, ListChecks, Radar,
  Cloud, ChevronDown,
  Image as ImageIcon,
} from "lucide-react";
import BackButton from "@/components/BackButton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  getDeviceConfig, setBridgeUrl, setDeviceBranchId, setDeviceTerminalId,
  setDeviceLabel, normalizeBridgeUrl, pullConfigFromBridge, pushConfigToBridge,
  isDeviceFullyConfigured, pushPrintersToBridge, pullRawDeviceJsonFromBridge,
  reloadBridgeConfig, syncThisDeviceToBridge,
  type BridgePrintersMap, type BridgePrinterKey,
  type BridgePrinter,
  discoverNetworkPrinters, type DiscoveredPrinter,
  posPrinterRoleToBridgeKey, buildBridgePrintersMapFromRows,
} from "@/lib/device-config";
import { checkBridgeStatus, checkBridgeHealth, testPrinterConnection, testWindowsPrinter } from "@/lib/print-bridge-client";
import { withLocalNetworkAccess } from "@/lib/local-network-fetch";
import PrinterRow from "@/components/pos/onboarding/PrinterRow";
import ConvertToWindowsPrinterDialog from "@/components/pos/ConvertToWindowsPrinterDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────
interface Branch   { id: string; name: string; is_active: boolean; user_id?: string; }
interface Terminal { id: string; name: string; branch_id: string | null; user_id?: string; is_active?: boolean; }
interface CashBox  { id: string; name: string; pos_terminal_id: string | null; currency?: string | null; is_active?: boolean; }
interface Printer  {
  id: string; name: string; ip_address: string; port: number;
  printer_type: string; print_categories: string[]; branch_id: string | null;
  is_default: boolean; is_active: boolean; settings?: Record<string, unknown>;
}

export interface WindowsPrinterInfo {
  name: string;
  driverName?: string;
  portName?: string;
  printerStatus?: string | number;
  workOffline?: boolean;
  shared?: boolean;
  default?: boolean;
}

export type ConnectionKind = "USB" | "Network/WiFi" | "Network/IP" | "Virtual/PDF" | "Remote/AnyDesk" | "Unknown";

/** Detect connection kind from Windows portName + driver/name. */
export function detectPrinterConnection(
  portName?: string,
  driverName?: string,
  printerName?: string,
): ConnectionKind {
  const port = String(portName || "").trim();
  const name = String(printerName || "").toLowerCase();
  const drv  = String(driverName || "").toLowerCase();
  if (name.includes("anydesk") || drv.includes("anydesk")) return "Remote/AnyDesk";
  if (port === "PORTPROMPT:") return "Virtual/PDF";
  if (/^USB/i.test(port)) return "USB";
  if (/WSD/i.test(port)) return "Network/WiFi";
  if (/^NPI/i.test(port)) return "Network/WiFi";
  if (/^IP_/i.test(port)) return "Network/IP";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(port)) return "Network/IP";
  return "Unknown";
}

function connectionBadgeClass(k: ConnectionKind): string {
  switch (k) {
    case "USB":           return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800";
    case "Network/WiFi":  return "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800";
    case "Network/IP":    return "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/40 dark:text-teal-200 dark:border-teal-800";
    case "Virtual/PDF":   return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800";
    case "Remote/AnyDesk":return "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800";
    default:              return "bg-muted text-muted-foreground border-border";
  }
}

type StepStatus = "idle" | "needs" | "ok" | "fail";

const PRINTER_ROLES: { value: string; label: string; emoji: string }[] = [
  { value: "receipt",          label: "فاتورة الزبون",   emoji: "🧾" },
  { value: "kitchen_ticket",   label: "المطبخ",          emoji: "🍳" },
  { value: "grill",            label: "المشاوي",         emoji: "🔥" },
  { value: "pizza",            label: "البيتزا",         emoji: "🍕" },
  { value: "unified_kitchen",  label: "مطبخ موحّد",      emoji: "🧑‍🍳" },
];

const PRINT_BRIDGE_DOWNLOAD_URL = "/downloads/amwali-print-bridge.zip?v=20260605-v637-installer-fix";

// Map our pos_printers role → the bridge's printer key (in device.json)
function roleToBridgeKey(role: string): BridgePrinterKey | null {
  return posPrinterRoleToBridgeKey(role);
}

/** Build the BridgePrintersMap from the current pos_printers list. */
function buildBridgePrintersMap(rows: Printer[]): BridgePrintersMap {
  return buildBridgePrintersMapFromRows(rows);
}

// ────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────
export default function NewDeviceOnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Step 1 — Bridge
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null);
  const [bridgeChecking, setBridgeChecking] = useState(false);

  // Step 2 — Device binding
  const initial = getDeviceConfig();
  const [label, setLabel] = useState(initial.label || "");
  const [branchId, setBranchId] = useState(initial.branchId || "");
  const [terminalId, setTerminalId] = useState(initial.terminalId || "");
  const [cashBoxId, setCashBoxId] = useState<string>(localStorage.getItem("pos-device:cash-box-id") || "");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deviceSaved, setDeviceSaved] = useState(isDeviceFullyConfigured());

  // Quick-create dialogs
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("الفرع الرئيسي");
  const [showNewTerminal, setShowNewTerminal] = useState(false);
  const [newTerminalName, setNewTerminalName] = useState("نقطة بيع 1");

  // Step 4 — Printers
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [printerStatus, setPrinterStatus] = useState<Record<string, boolean | null>>({});
  const [bridgePrinterHealth, setBridgePrinterHealth] = useState<Record<string, { connected: boolean; subnetMismatch: boolean }>>({});
  // Print Bridge logo presence (true = bridge can read logo.png from its folder)
  const [bridgeLogo, setBridgeLogo] = useState<boolean | null>(null);
  // Company logo URL fetched per-tenant. null = none/unknown.
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [companyLogoLoading, setCompanyLogoLoading] = useState(true);
  const [downloadingLogo, setDownloadingLogo] = useState(false);
  const [showAddPrinter, setShowAddPrinter] = useState(false);
  const [windowsPrinters, setWindowsPrinters] = useState<WindowsPrinterInfo[]>([]);
  const [printerToDelete, setPrinterToDelete] = useState<Printer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [convertTarget, setConvertTarget] = useState<Printer | null>(null);

  // Step 4b — Network discovery
  const [discoverSubnet, setDiscoverSubnet] = useState("");
  const [discovering, setDiscovering]       = useState(false);
  const [discovered, setDiscovered]         = useState<DiscoveredPrinter[] | null>(null);
  const [discoverMeta, setDiscoverMeta]     = useState<{ subnet?: string; elapsedMs?: number; error?: string } | null>(null);
  const [assigningIp, setAssigningIp]       = useState<string | null>(null);
  const [showDiscovery, setShowDiscovery]   = useState(false);

  // Step 5 — Smoke test
  const [lastReceiptTestOk, setLastReceiptTestOk] = useState<boolean | null>(null);
  const [lastKitchenTestOk, setLastKitchenTestOk] = useState<boolean | null>(null);

  // Unified bridge sync ("مزامنة هذا الجهاز")
  const [syncing, setSyncing] = useState(false);
  const [bridgeSource, setBridgeSource] = useState<string | null>(null);
  const [lastSyncOk, setLastSyncOk] = useState<boolean | null>(null);
  const [lastSyncMsg, setLastSyncMsg] = useState<string>("");

  // ── Phase 1: wizard / accordion state ───────────────────────
  const [openStep, setOpenStep] = useState<number>(1);
  const [bridgeVersion, setBridgeVersion] = useState<string | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  // Tri-state: null = unknown, true = bridge running AND bound to a branch/terminal,
  //            false = bridge running but device.json missing (printers source = fallback or no branchId/terminalId)
  const [bridgeBound, setBridgeBound] = useState<boolean | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Bridge check ──────────────────────────────────────────
  const loadOptionsRef = useRef<() => Promise<void>>(async () => {});
  const recheckBridge = useCallback(async (opts?: { silent?: boolean }) => {
    setBridgeChecking(true);
    try {
      // Try up to 2 times — first call after the bridge has been idle
      // sometimes exceeds the 3s timeout (cold TCP / Windows service wake).
      let ok = await checkBridgeStatus();
      if (!ok) {
        await new Promise((r) => setTimeout(r, 400));
        ok = await checkBridgeStatus();
      }
      setBridgeOnline(ok);
      if (ok) {
        // Re-pull remote config + refresh DB options so the UI reflects
        // any printers/branch/terminal changes since last check.
        try {
          const remote = await pullConfigFromBridge();
          if (remote) {
            if (remote.branchId)   setBranchId(prev => prev || remote.branchId!);
            if (remote.terminalId) setTerminalId(prev => prev || remote.terminalId!);
            if (remote.label)      setLabel(prev => prev || remote.label!);
            // Bound = bridge knows a branch + terminal (device.json populated)
            setBridgeBound(Boolean(remote.branchId && remote.terminalId));
          } else {
            setBridgeBound(false);
          }
        } catch { /* ignore */ }
        // Probe /health so we know if the bridge can read its logo.png.
        // This is a passive status only — never a connection failure.
        try {
          const h = await checkBridgeHealth();
          if (h.online && typeof h.logo === "boolean") setBridgeLogo(h.logo);
        } catch { /* ignore */ }
        await loadOptionsRef.current();
        if (!opts?.silent) toast.success("برنامج الطباعة متصل ✓");
      } else if (!opts?.silent) {
        setBridgeBound(null);
        setBridgeLogo(null);
        toast.error("برنامج الطباعة غير شغّال على هذا الجهاز");
      }
    } finally {
      setBridgeChecking(false);
    }
  }, []);

  useEffect(() => {
    void recheckBridge({ silent: true });
    const t = setInterval(() => { void recheckBridge({ silent: true }); }, 10_000);
    return () => clearInterval(t);
  }, [recheckBridge]);

  // ── Auto-restore from bridge on first mount ───────────────
  useEffect(() => {
    (async () => {
      const remote = await pullConfigFromBridge();
      if (!remote) return;
      if (!branchId && remote.branchId)     setBranchId(remote.branchId);
      if (!terminalId && remote.terminalId) setTerminalId(remote.terminalId);
      if (!label && remote.label)           setLabel(remote.label);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load branches / terminals / cash boxes / printers ─────
  const loadOptions = useCallback(async () => {
    if (!user) return;
    setLoadingOptions(true);
    try {
      const { data: ownerIdRaw } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
      const ownerId = (ownerIdRaw as string | null) || user.id;
      const [br, term, cb, pr] = await Promise.all([
        supabase.from("branches").select("id, name, is_active, user_id").eq("user_id", ownerId).eq("is_active", true).order("name"),
        supabase.from("pos_terminals").select("id, name, branch_id, user_id, is_active").eq("user_id", ownerId).eq("is_active", true).order("name"),
        supabase.from("cash_boxes").select("id, name, pos_terminal_id, currency, is_active").eq("user_id", ownerId).eq("is_active", true).order("name"),
        supabase.from("pos_printers").select("*").eq("is_active", true).order("is_default", { ascending: false }),
      ]);
      setBranches((br.data as Branch[]) || []);
      setTerminals((term.data as Terminal[]) || []);
      setCashBoxes((cb.data as CashBox[]) || []);
      setPrinters((pr.data as Printer[]) || []);
    } finally {
      setLoadingOptions(false);
    }
  }, [user]);

  useEffect(() => { loadOptionsRef.current = loadOptions; }, [loadOptions]);
  useEffect(() => { if (!authLoading) void loadOptions(); }, [authLoading, loadOptions]);

  // Whenever the printer list changes, sync it into device.json on the bridge.
  // This guarantees the bridge always reflects what the POS sees, even if a
  // printer was added/edited elsewhere (e.g. /printer-settings advanced page).
  useEffect(() => {
    if (!bridgeOnline) return;
    if (printers.length === 0) return;
    const map = buildBridgePrintersMap(filteredPrinters);
    if (Object.keys(map).length === 0) return;
    // Full sync: any role NOT present in the DB list is explicitly cleared
    // from device.json so old/default IPs (e.g. 192.168.1.50-53) don't linger
    // on the bridge after the branch has been reconfigured.
    const ALL_KEYS: BridgePrinterKey[] = ["receipt", "kitchen", "grill", "pizza", "unified_kitchen"];
    const fullMap: BridgePrintersMap = { ...map };
    for (const k of ALL_KEYS) {
      if (!(k in map)) fullMap[k] = null;
    }
    void pushPrintersToBridge(fullMap, { replace: true }).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printers, bridgeOnline, branchId]);

  // ── Branch / terminal quick-create ────────────────────────
  const createBranch = async () => {
    if (!user) return;
    const trimmed = newBranchName.trim();
    if (!trimmed) { toast.error("أدخل اسم الفرع"); return; }
    const { data: ownerIdRaw } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
    const ownerId = (ownerIdRaw as string | null) || user.id;
    const { data, error } = await supabase
      .from("branches")
      .insert({ name: trimmed, user_id: ownerId, latitude: 0, longitude: 0, is_active: true } as any)
      .select("id, name, is_active, user_id").single();
    if (error || !data) { toast.error("فشل إنشاء الفرع: " + (error?.message || "")); return; }
    setBranches(prev => [...prev, data as Branch]);
    setBranchId(data.id);
    setShowNewBranch(false);
    toast.success(`✅ تم إنشاء فرع "${trimmed}"`);
  };

  const createTerminal = async () => {
    if (!user) return;
    if (!branchId) { toast.error("اختر الفرع أولاً"); return; }
    const trimmed = newTerminalName.trim();
    if (!trimmed) { toast.error("أدخل اسم المحطة"); return; }
    const { data: ownerIdRaw } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
    const ownerId = (ownerIdRaw as string | null) || user.id;
    // Ensure pos_companies row exists
    let posCompanyId: string | null = null;
    const { data: co } = await supabase.from("pos_companies").select("id").eq("user_id", ownerId).maybeSingle();
    if (co?.id) posCompanyId = co.id;
    else {
      const { data: newCo, error } = await supabase
        .from("pos_companies")
        .insert({ user_id: ownerId, name: "شركتي", currency_code: "ILS", is_active: true } as any)
        .select("id").single();
      if (error || !newCo) { toast.error("تعذر تجهيز شركة POS"); return; }
      posCompanyId = newCo.id;
    }
    const { data, error } = await supabase
      .from("pos_terminals")
      .insert({ name: trimmed, branch_id: branchId, user_id: ownerId, company_id: posCompanyId, is_active: true } as any)
      .select("id, name, branch_id, user_id, is_active").single();
    if (error || !data) { toast.error("فشل إنشاء المحطة: " + (error?.message || "")); return; }
    setTerminals(prev => [...prev, data as Terminal]);
    setTerminalId(data.id);
    setShowNewTerminal(false);
    toast.success(`✅ تم إنشاء محطة "${trimmed}"`);
  };

  // ── Save device binding ───────────────────────────────────
  const saveDevice = async () => {
    if (!branchId)   { toast.error("اختر الفرع"); return; }
    if (!terminalId) { toast.error("اختر محطة POS"); return; }
    setSaving(true);
    try {
      // If terminal has no branch link yet, attach it
      const term = terminals.find(t => t.id === terminalId);
      if (term && !term.branch_id) {
        await supabase.from("pos_terminals").update({ branch_id: branchId } as any).eq("id", terminalId);
      }
      setDeviceBranchId(branchId);
      setDeviceTerminalId(terminalId);
      setDeviceLabel(label.trim());
      try {
        if (cashBoxId) localStorage.setItem("pos-device:cash-box-id", cashBoxId);
        else           localStorage.removeItem("pos-device:cash-box-id");
      } catch { /* ignore */ }
      // Bridge URL — set default 127.0.0.1:3001 if empty
      const currentBridge = getDeviceConfig().bridgeUrl;
      if (!currentBridge && bridgeOnline) {
        setBridgeUrl("http://127.0.0.1:3001");
      }
      await pushConfigToBridge();
      setDeviceSaved(true);
      toast.success("🎉 تم ربط هذا الجهاز بحساب الشركة والفرع");
    } finally {
      setSaving(false);
    }
  };

  const filteredTerminals = useMemo(
    () => terminals.filter(t => !branchId || !t.branch_id || t.branch_id === branchId),
    [terminals, branchId],
  );
  const filteredCashBoxes = useMemo(
    () => cashBoxes.filter(c => !terminalId || !c.pos_terminal_id || c.pos_terminal_id === terminalId),
    [cashBoxes, terminalId],
  );
  const filteredPrinters = useMemo(
    () => printers.filter(p => !branchId || !p.branch_id || p.branch_id === branchId),
    [printers, branchId],
  );

  // ── Unified sync to the local Print Bridge ────────────────
  const handleSyncDevice = useCallback(async () => {
    if (!branchId || !terminalId) {
      toast.error("اربط الفرع والمحطة أولاً ثم زامن");
      return;
    }
    setSyncing(true);
    try {
      // Persist latest selections to localStorage first
      setDeviceBranchId(branchId);
      setDeviceTerminalId(terminalId);
      setDeviceLabel(label.trim());
      try {
        if (cashBoxId) localStorage.setItem("pos-device:cash-box-id", cashBoxId);
        else           localStorage.removeItem("pos-device:cash-box-id");
      } catch { /* ignore */ }
      if (!getDeviceConfig().bridgeUrl) setBridgeUrl("http://127.0.0.1:3001");

      const r = await syncThisDeviceToBridge();
      setBridgeSource(r.health.printersSource);
      setLastSyncOk(r.ok);
      setLastSyncMsg(r.message);
      if (r.ok) toast.success(`✅ ${r.message}`);
      else      toast.error(`⚠️ ${r.message}`);
    } finally {
      setSyncing(false);
    }
  }, [branchId, terminalId, label, cashBoxId]);

  // Combined "حفظ ومزامنة الجهاز" — persists locally then pushes to bridge.
  const saveAndSync = useCallback(async () => {
    if (!branchId)   { toast.error("اختر الفرع"); return; }
    if (!terminalId) { toast.error("اختر محطة POS"); return; }
    await saveDevice();
    if (bridgeOnline) await handleSyncDevice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, terminalId, bridgeOnline, handleSyncDevice]);

  // Fetch bridge version for the sticky header strip.
  useEffect(() => {
    if (bridgeOnline !== true) { setBridgeVersion(null); return; }
    (async () => {
      try {
        const url = getDeviceConfig().bridgeUrl || "http://127.0.0.1:3001";
        const r = await fetch(`${url}/health`, withLocalNetworkAccess({ signal: AbortSignal.timeout(3000) }));
        if (!r.ok) return;
        const j = await r.json();
        if (j?.version) setBridgeVersion(String(j.version));
      } catch { /* ignore */ }
    })();
  }, [bridgeOnline]);

  // ── Export / Import device.json ───────────────────────────
  const exportConfig = async () => {
    const cfg = getDeviceConfig();
    const remoteRaw = await pullRawDeviceJsonFromBridge().catch(() => null);
    const printersMap = buildBridgePrintersMap(filteredPrinters);
    const merged = {
      ...(remoteRaw || {}),
      ...cfg,
      label: cfg.label || (remoteRaw?.label as string) || "",
      cashBoxId: cashBoxId || "",
      printers: Object.keys(printersMap).length
        ? printersMap
        : (remoteRaw?.printers || {}),
      exported_at: new Date().toISOString(),
      _app: "amwali",
    };
    const companySlug = (label || "device").trim().replace(/\s+/g, "-").replace(/[^\w\u0600-\u06FF-]/g, "") || "device";
    const termSlug = (terminals.find(t => t.id === terminalId)?.name || terminalId || "terminal").replace(/\s+/g, "-");
    const fileName = `amwali-device-${companySlug}-${termSlug}.json`;
    const blob = new Blob([JSON.stringify(merged, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
    toast.success(`📥 تم تصدير الإعداد كنسخة احتياطية: ${fileName}`);
  };

  const importConfig = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        if (!parsed || typeof parsed !== "object") throw new Error("ملف غير صالح");
        if (!parsed.branchId && !parsed.terminalId && !parsed.bridgeUrl && !parsed.printers) {
          throw new Error("الملف لا يحتوي إعداد جهاز معروف");
        }
        if (parsed.bridgeUrl)  setBridgeUrl(normalizeBridgeUrl(parsed.bridgeUrl));
        if (parsed.branchId)   { setDeviceBranchId(parsed.branchId); setBranchId(parsed.branchId); }
        if (parsed.terminalId) { setDeviceTerminalId(parsed.terminalId); setTerminalId(parsed.terminalId); }
        if (parsed.label)      { setDeviceLabel(parsed.label); setLabel(parsed.label); }
        if (parsed.cashBoxId)  { localStorage.setItem("pos-device:cash-box-id", parsed.cashBoxId); setCashBoxId(parsed.cashBoxId); }
        await pushConfigToBridge().catch(() => null);
        if (parsed.printers && typeof parsed.printers === "object") {
          const ok = await pushPrintersToBridge(parsed.printers, { replace: true }).catch(() => false);
          if (ok) toast.info("📡 تم استعادة طابعات device.json إلى برنامج الطباعة");
        }
        await reloadBridgeConfig().catch(() => null);
        setDeviceSaved(true);
        toast.success("✅ تم استيراد الإعداد بنجاح. الجهاز جاهز.");
      } catch (err: any) {
        toast.error("فشل الاستيراد: " + (err?.message || "ملف غير صالح"));
      }
    };
    reader.readAsText(file);
  };

  // ── Printers ──────────────────────────────────────────────
  const refreshPrinterStatus = useCallback(async () => {
    if (!bridgeOnline) return;
    const statusMap: Record<string, boolean | null> = {};
    await Promise.all(printers.map(async (p) => {
      statusMap[p.id] = await testPrinterConnection(p.ip_address, p.port).catch(() => false);
    }));
    setPrinterStatus(statusMap);
    // Also pull bridge /health so we get subnet_mismatch + connected flags
    try {
      const h = await checkBridgeHealth();
      if (h.online) {
        if (h.source) setBridgeSource(h.source);
        if (typeof h.logo === "boolean") setBridgeLogo(h.logo);
        const m: Record<string, { connected: boolean; subnetMismatch: boolean }> = {};
        (h.printers || []).forEach(bp => {
          if (bp.ip) m[bp.ip] = { connected: !!bp.connected, subnetMismatch: !!bp.subnetMismatch };
        });
        setBridgePrinterHealth(m);
      }
    } catch { /* ignore */ }
  }, [bridgeOnline, printers]);

  // ⚠️ Do NOT auto-test printers on page open — the user wants to test each
  // printer manually (so they can identify which device is which). We only
  // fetch the list of Windows printers so the row selector is populated.
  useEffect(() => {
    if (!bridgeOnline) return;
    void fetchWindowsPrinters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeOnline]);

  const fetchWindowsPrinters = async () => {
    try {
      const url = getDeviceConfig().bridgeUrl || "http://127.0.0.1:3001";
      let res: Response;
      try {
        res = await fetch(`${url}/windows-printers`, withLocalNetworkAccess({ signal: AbortSignal.timeout(4000) }));
      } catch {
        // Fallback for bridge/browser combinations where a simple GET works
        // but Chrome's Local Network Access hint triggers a blocked preflight.
        res = await fetch(`${url}/windows-printers`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
      }
      if (!res.ok) throw new Error("endpoint غير متوفر");
      const data = await res.json();
      if ((data as { ok?: boolean })?.ok === false) {
        throw new Error(String((data as { error?: unknown })?.error || "windows_printers_failed"));
      }
      const raw: unknown[] = Array.isArray(data)
        ? data
        : Array.isArray((data as { printers?: unknown[] })?.printers)
          ? (data as { printers: unknown[] }).printers
          : [];
      const list: WindowsPrinterInfo[] = raw
        .map((p): WindowsPrinterInfo | null => {
          if (typeof p === "string") return { name: p };
          if (p && typeof p === "object") {
            const o = p as Record<string, unknown>;
            const n = o.name ?? o.Name ?? o.printerName ?? o.PrinterName;
            const name = typeof n === "string" ? n : "";
            if (!name) return null;
            return {
              name,
              driverName:    typeof o.driverName    === "string" ? o.driverName    : undefined,
              portName:      typeof o.portName      === "string" ? o.portName      : undefined,
              printerStatus: (o.printerStatus as string | number | undefined),
              workOffline:   Boolean(o.workOffline),
              shared:        Boolean(o.shared),
              default:       Boolean(o.default),
            };
          }
          return null;
        })
        .filter((x): x is WindowsPrinterInfo => !!x);
      setWindowsPrinters(list);
      if (list.length === 0) toast.info("لم يتم العثور على طابعات Windows");
    } catch (err) {
      console.error("fetchWindowsPrinters failed", err);
      toast.error(`تعذر قراءة طابعات Windows من Print Bridge${err instanceof Error ? `: ${err.message}` : ""}`);
    }
  };

  const handlePrinterTest = async (p: Printer) => {
    if (!bridgeOnline) { toast.error("Print Bridge غير متصل"); return; }
    const settings = (p.settings || {}) as Record<string, unknown>;
    const isUsb = settings.connection === "usb" || !!settings.windows_printer_name;
    if (isUsb) {
      const winName = String(settings.windows_printer_name || "");
      if (!winName) { toast.error("اسم طابعة Windows مفقود"); return; }
      const r = await testWindowsPrinter(winName);
      setPrinterStatus(prev => ({ ...prev, [p.id]: r.success }));
      if (r.success) toast.success(`✅ ${p.name} — الطباعة تعمل`);
      else           toast.error(`❌ ${p.name} — ${r.error || "فشل الطباعة"}`);
      return;
    }
    const ok = await testPrinterConnection(p.ip_address, p.port);
    setPrinterStatus(prev => ({ ...prev, [p.id]: ok }));
    if (ok) toast.success(`✅ ${p.name} — الطباعة تعمل`);
    else    toast.error(`❌ ${p.name} — فشل الاتصال`);
  };

  const handlePrinterDelete = async (p: Printer) => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("pos_printers").delete().eq("id", p.id);
      if (error) { toast.error("فشل الحذف: " + error.message); return; }
      const role = p.print_categories?.[0] || p.printer_type;
      const bridgeKey = roleToBridgeKey(role);
      if (bridgeKey) {
        // Pass null to remove from device.json on the bridge
        await pushPrintersToBridge({ [bridgeKey]: null }).catch(() => false);
        await reloadBridgeConfig().catch(() => null);
      }
      toast.success("تم حذف الطابعة");
      setPrinterToDelete(null);
      await loadOptions();
    } finally {
      setDeleting(false);
    }
  };

  // ── Network discovery ─────────────────────────────────────
  const runDiscovery = async () => {
    if (!bridgeOnline) { toast.error("Print Bridge غير متصل"); return; }
    setDiscovering(true);
    setDiscovered(null);
    setDiscoverMeta(null);
    try {
      const subnet = discoverSubnet.trim().replace(/\.+$/, "");
      const result = await discoverNetworkPrinters(subnet ? { subnet } : {});
      setDiscoverMeta({ subnet: result.subnet, elapsedMs: result.elapsedMs, error: result.error });
      if (!result.ok) {
        const msg = result.error === "subnet_not_private"
          ? "الشبكة المُدخلة ليست شبكة محلية (يجب أن تكون 192.168.x.x أو 10.x.x.x أو 172.16-31.x.x)"
          : result.error === "forbidden_remote"
            ? "فحص الشبكة مسموح فقط من نفس الكمبيوتر الذي عليه برنامج الطباعة"
            : result.error === "no_private_interface_found"
              ? "تعذّر اكتشاف الشبكة المحلية تلقائياً — أدخل الـ subnet يدوياً (مثل 192.168.1)"
              : result.error === "bridge_unreachable"
                ? "Print Bridge لا يستجيب — تأكد أنه شغّال"
                : "هذا الإصدار من Print Bridge لا يدعم فحص الشبكة. حدّث الجسر ثم أعد المحاولة.";
        toast.error(msg);
        setDiscovered([]);
        return;
      }
      setDiscovered(result.found);
      if (result.found.length === 0) {
        toast.info("لم نجد أي طابعة على الشبكة");
      } else {
        toast.success(`✅ تم العثور على ${result.found.length} جهاز محتمل`);
      }
    } finally {
      setDiscovering(false);
    }
  };

  const assignDiscoveredAsRole = async (d: DiscoveredPrinter, role: string) => {
    if (!user) return;
    setAssigningIp(d.ip);
    try {
      const roleLabel = PRINTER_ROLES.find(r => r.value === role)?.label || role;
      const row: any = {
        user_id: user.id,
        name: `${roleLabel} (${d.ip})`,
        ip_address: d.ip,
        port: d.port || 9100,
        printer_type: role === "receipt" ? "receipt" : "kitchen_ticket",
        print_categories: [role],
        branch_id: branchId || null,
        is_active: true,
        is_default: role === "receipt",
        settings: role === "unified_kitchen" ? { image_mode: "unified_kitchen" } : {},
      };
      const { error } = await supabase.from("pos_printers").insert(row);
      if (error) { toast.error("فشل الحفظ: " + error.message); return; }

      const bridgeKey = roleToBridgeKey(role);
      if (bridgeKey) {
        await pushPrintersToBridge({
          [bridgeKey]: { type: "network", name: row.name, ip: d.ip, port: d.port || 9100 },
        }).catch(() => false);
      }
      await reloadBridgeConfig().catch(() => null);
      toast.success(`✅ تم تعيين ${d.ip} كـ ${roleLabel}`);
      await loadOptions();
    } finally {
      setAssigningIp(null);
    }
  };

  // ── Smoke test ────────────────────────────────────────────
  const receiptPrinter = filteredPrinters.find(p =>
    p.print_categories?.includes("receipt") || p.printer_type === "receipt",
  );
  const kitchenPrinter = filteredPrinters.find(p =>
    p.print_categories?.some(c => ["kitchen_ticket", "kitchen", "grill", "pizza", "unified_kitchen"].includes(c))
    || p.printer_type === "kitchen_ticket",
  );

  const testReceiptPrint = async () => {
    if (!receiptPrinter) { toast.error("لم يتم تحديد طابعة فاتورة"); return; }
    const ok = await testPrinterConnection(receiptPrinter.ip_address, receiptPrinter.port);
    setLastReceiptTestOk(ok);
    if (ok) toast.success("✅ تم إرسال اختبار طباعة الفاتورة");
    else    toast.error("❌ فشل اختبار طباعة الفاتورة");
  };
  const testKitchenPrint = async () => {
    if (!kitchenPrinter) { toast.error("لم يتم تحديد طابعة مطبخ"); return; }
    const ok = await testPrinterConnection(kitchenPrinter.ip_address, kitchenPrinter.port);
    setLastKitchenTestOk(ok);
    if (ok) toast.success("✅ تم إرسال اختبار طباعة المطبخ");
    else    toast.error("❌ فشل اختبار طباعة المطبخ");
  };

  // ── Step statuses (drives the progress bar) ───────────────
  const step1Status: StepStatus = bridgeOnline === null ? "idle" : bridgeOnline ? "ok" : "fail";
  // Step 2 is considered complete whenever branch + terminal are bound — the
  // values may have come from a previous save, from device.json hydration, or
  // from POS settings. We no longer require an explicit re-save just to mark
  // the step as OK.
  const deviceConfigured = !!(branchId && terminalId);
  const step2Status: StepStatus = deviceConfigured ? "ok" : (branchId || terminalId || label) ? "needs" : "idle";
  // Step 3 (printers) is only "ok" when there is an active printer in DB AND
  // the bridge is reading it (not from its hardcoded fallback list).
  const printersOnBridgeOk =
    filteredPrinters.length > 0 && bridgeSource !== null && bridgeSource !== "fallback";
  const step3Status: StepStatus =
    filteredPrinters.length === 0 ? "needs"
    : printersOnBridgeOk ? "ok"
    : "needs";
  const smokeOk = bridgeOnline && deviceConfigured && !!receiptPrinter && (lastReceiptTestOk === true);
  const step4Status: StepStatus = smokeOk ? "ok" : (deviceConfigured && receiptPrinter) ? "needs" : "idle";

  const completed = [step1Status, step2Status, step3Status, step4Status]
    .filter(s => s === "ok").length;

  // Auto-open the first step that needs the user's attention.
  useEffect(() => {
    if (bridgeOnline === false) { setOpenStep(1); return; }
    if (!deviceConfigured)       { setOpenStep(2); return; }
    if (step3Status !== "ok")    { setOpenStep(3); return; }
    setOpenStep(4);
  }, [bridgeOnline, deviceConfigured, step3Status]);

  // ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-background pb-32" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-primary" /> تجهيز جهاز نقطة بيع جديد
            </h1>
            <p className="text-xs text-muted-foreground">معالج 4 خطوات بسيط — يصلح للأشخاص غير التقنيين</p>
          </div>
          <Button
            variant="ghost" size="sm"
            onClick={() => navigate("/device-setup")}
            className="gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
            title="للدعم الفني"
          >
            <Link2 className="h-3.5 w-3.5" /> الإعدادات المتقدمة
          </Button>
        </div>

        {/* Sticky Bridge strip */}
        <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 border-y border-border">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
              bridgeOnline === true ? "bg-success/10 text-success border-success/30"
              : bridgeOnline === false ? "bg-destructive/10 text-destructive border-destructive/30"
              : "bg-muted text-muted-foreground border-border"
            }`}>
              <span className="h-2 w-2 rounded-full" style={{
                background: bridgeOnline === true
                  ? (bridgeBound === false ? "#fbbf24" : "#22c55e")
                  : bridgeOnline === false ? "#ef4444" : "#fbbf24",
              }} />
              {bridgeOnline === true
                ? (bridgeBound === false ? "متصل — غير مربوط بفرع" : "برنامج الطباعة متصل")
                : bridgeOnline === false ? "غير متصل" : "جارٍ الفحص"}
            </span>
            <span className="text-[11px] text-muted-foreground font-mono truncate min-w-0" dir="ltr">
              {getDeviceConfig().bridgeUrl || "http://127.0.0.1:3001"}
              {bridgeVersion ? ` · v${bridgeVersion}` : ""}
            </span>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => { void recheckBridge(); }} disabled={bridgeChecking} className="h-7 px-2 gap-1 text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${bridgeChecking ? "animate-spin" : ""}`} /> فحص
            </Button>
            <Button asChild size="sm" variant="secondary" className="h-7 px-2 gap-1 text-xs">
              <a href={PRINT_BRIDGE_DOWNLOAD_URL} download>
                <Download className="h-3.5 w-3.5" /> تحديث برنامج الطباعة
              </a>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs">
              <a href={PRINT_BRIDGE_LOGO_URL} download="logo.png">
                <ImageIcon className="h-3.5 w-3.5" /> تنزيل شعار الطباعة
              </a>
            </Button>
          </div>
        </div>

        {/* Progress */}
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1.5 text-xs">
            <span className="font-semibold">التقدّم</span>
            <span className="text-muted-foreground">{completed} من 4 مكتملة</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${(completed / 4) * 100}%` }} />
          </div>
        </div>

        {/* ── Step 1: Bridge ─────────────────────────────── */}
        <Section
          n={1} title="فحص برنامج الطباعة" icon={Printer} status={step1Status}
          subtitle="نتأكد أن برنامج الطباعة شغّال على هذا الكمبيوتر."
          open={openStep === 1} onToggle={() => setOpenStep(openStep === 1 ? 0 : 1)}
          summary={
            bridgeOnline === true
              ? (bridgeBound === false
                  ? <SummarySimple text={`متصل — غير مربوط بفرع${bridgeVersion ? ` · v${bridgeVersion}` : ""}`} />
                  : <SummarySimple ok text={`متصل${bridgeVersion ? ` · v${bridgeVersion}` : ""}`} />)
              : bridgeOnline === false
                ? <SummarySimple fail text="غير متصل — اضغط للعرض والتشغيل" />
                : <SummarySimple text="جارٍ الفحص..." />
          }
        >
          {bridgeOnline === false ? (
            <div className="rounded-md border border-amber-300/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm space-y-2">
              <div className="font-medium text-amber-900 dark:text-amber-200 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> خطوات سريعة للتثبيت
              </div>
              <ol className="list-decimal pr-5 space-y-1 text-amber-900/90 dark:text-amber-100/90 text-[13px]">
                <li>حمّل برنامج الطباعة من زر «تحديث برنامج الطباعة» أعلاه، فك الضغط في <code dir="ltr">C:\print-bridge</code></li>
                <li>افتح المجلد، شغّل ملف <code>install-bridge.bat</code> (يثبّت كخدمة Windows)</li>
                <li>اضغط زر «فحص» في الشريط أعلاه</li>
              </ol>
              <button
                type="button"
                onClick={() => {
                  const absolute = `${window.location.origin}${PRINT_BRIDGE_DOWNLOAD_URL}`;
                  navigator.clipboard.writeText(absolute);
                  toast.success("تم نسخ الرابط");
                }}
                className="text-[11px] text-amber-900 dark:text-amber-200 hover:underline inline-flex items-center gap-1"
              >
                <Copy className="h-3 w-3" /> نسخ رابط التحميل
              </button>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" /> برنامج الطباعة شغّال. لا حاجة لأي إجراء هنا.
            </div>
          )}

          {/* ── ملفات الطباعة: شعار الكاشير ──────────────────── */}
          <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-[13px] space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-semibold inline-flex items-center gap-1.5">
                <ImageIcon className="h-4 w-4" /> ملفات الطباعة — شعار الوصل
              </div>
              {bridgeOnline === true && (
                bridgeLogo === true ? (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/30">
                    <CheckCircle2 className="h-3 w-3" /> الشعار مقروء من برنامج الطباعة
                  </span>
                ) : bridgeLogo === false ? (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    <AlertCircle className="h-3 w-3" /> الشعار غير موجود داخل مجلد برنامج الطباعة
                  </span>
                ) : null
              )}
            </div>
            <p className="text-muted-foreground leading-relaxed">
              بعد تنزيل الشعار، ضعه داخل مجلد برنامج الطباعة على جهاز الكاشير، مثلاً:
              {" "}<code dir="ltr">C:\print-bridge\logo.png</code> ثم أعد تشغيل برنامج الطباعة.
            </p>
            <div>
              <Button asChild size="sm" variant="secondary" className="h-7 px-2 gap-1 text-xs">
                <a href={PRINT_BRIDGE_LOGO_URL} download="logo.png">
                  <Download className="h-3.5 w-3.5" /> تنزيل logo.png
                </a>
              </Button>
            </div>
          </div>
        </Section>

        {/* ── Step 2: Device binding ─────────────────────── */}
        <Section
          n={2} title="ربط الجهاز" icon={Monitor} status={step2Status}
          subtitle="اربط هذا الكمبيوتر بفرع ومحطة بيع."
          open={openStep === 2} onToggle={() => setOpenStep(openStep === 2 ? 0 : 2)}
          summary={
            deviceConfigured
              ? <SummarySimple ok text={[label || "—", branches.find(b => b.id === branchId)?.name, terminals.find(t => t.id === terminalId)?.name].filter(Boolean).join(" · ")} />
              : <SummarySimple text="لم يُربط الجهاز بعد" />
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">اسم الجهاز</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثلاً: كاشير 1 - الواجهة" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center justify-between">
                <span>الفرع</span>
                <button type="button" onClick={() => setShowNewBranch(true)} className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5">
                  <Plus className="h-3 w-3" /> فرع جديد
                </button>
              </Label>
              <Select value={branchId} onValueChange={(v) => { setBranchId(v); setTerminalId(""); setCashBoxId(""); }}>
                <SelectTrigger><SelectValue placeholder={loadingOptions ? "جاري التحميل…" : "اختر الفرع"} /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center justify-between">
                <span>محطة POS</span>
                <button type="button" onClick={() => setShowNewTerminal(true)} disabled={!branchId} className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5 disabled:opacity-40">
                  <Plus className="h-3 w-3" /> محطة جديدة
                </button>
              </Label>
              <Select value={terminalId} onValueChange={(v) => { setTerminalId(v); setCashBoxId(""); }} disabled={!branchId}>
                <SelectTrigger><SelectValue placeholder={!branchId ? "اختر الفرع أولاً" : "اختر المحطة"} /></SelectTrigger>
                <SelectContent>
                  {filteredTerminals.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Optional fields */}
          <Collapsible open={showOptional} onOpenChange={setShowOptional}>
            <CollapsibleTrigger asChild>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showOptional ? "rotate-180" : ""}`} />
                حقول اختيارية (الصندوق النقدي)
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs">الصندوق النقدي</Label>
                <Select value={cashBoxId} onValueChange={setCashBoxId} disabled={!terminalId}>
                  <SelectTrigger><SelectValue placeholder={!terminalId ? "اختر المحطة أولاً" : (filteredCashBoxes.length ? "اختر الصندوق" : "لا يوجد صندوق مرتبط")} /></SelectTrigger>
                  <SelectContent>
                    {filteredCashBoxes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.currency ? ` (${c.currency})` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Primary + secondary actions */}
          <div className="flex flex-col gap-1.5 pt-1">
            <Button
              onClick={saveAndSync}
              disabled={saving || syncing || !branchId || !terminalId}
              className="gap-2 w-full h-11 text-base"
              size="lg"
            >
              {(saving || syncing) ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
              حفظ ومزامنة الجهاز
            </Button>
            <button
              type="button"
              onClick={saveDevice}
              disabled={saving || !branchId || !terminalId}
              className="text-[11px] text-muted-foreground hover:text-foreground underline self-center disabled:opacity-40"
            >
              حفظ فقط بدون مزامنة
            </button>
          </div>

          {lastSyncOk === true && (
            <div className="rounded-md border border-success/30 bg-success/10 text-success text-sm px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> {lastSyncMsg}
            </div>
          )}
          {lastSyncOk === false && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm px-3 py-2 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <div>
                <div className="font-medium">{lastSyncMsg}</div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  تحقق أن برنامج الطباعة شغّال وأن نسخته تدعم <code dir="ltr">/device-config</code> و<code dir="ltr">/reload-config</code>.
                </div>
              </div>
            </div>
          )}
          {deviceSaved && lastSyncOk === null && (
            <div className="rounded-md border border-success/30 bg-success/10 text-success text-sm px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> تم ربط هذا الجهاز بحساب الشركة والفرع
            </div>
          )}

          {/* Advanced: backup / restore */}
          <Collapsible open={showBackup} onOpenChange={setShowBackup}>
            <CollapsibleTrigger asChild>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 pt-2 border-t border-border w-full mt-2 justify-center">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showBackup ? "rotate-180" : ""}`} />
                خيارات متقدمة: نسخة احتياطية device.json
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={exportConfig} disabled={!deviceSaved} className="gap-2">
                  <Download className="h-4 w-4" /> تصدير device.json
                </Button>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <Upload className="h-4 w-4" /> استيراد device.json
                </Button>
                <input
                  ref={fileInputRef} type="file" accept="application/json,.json" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importConfig(f); e.target.value = ""; }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                للنقل إلى كمبيوتر آخر بدون إنترنت. للتشغيل العادي استخدم «حفظ ومزامنة الجهاز».
              </p>
            </CollapsibleContent>
          </Collapsible>
        </Section>

        {/* ── Step 3: Printers ───────────────────────────── */}
        <Section
          n={3} title="الطابعات" icon={Printer} status={step3Status}
          subtitle="حدّد طابعة الفاتورة وطابعات المطبخ/المشاوي/البيتزا."
          open={openStep === 3} onToggle={() => setOpenStep(openStep === 3 ? 0 : 3)}
          summary={
            filteredPrinters.length === 0
              ? <SummarySimple text="لا توجد طابعات معرّفة" />
              : <SummarySimple ok={step3Status === "ok"} text={`${filteredPrinters.length} طابعة${bridgeSource && bridgeSource !== "fallback" ? " · متزامنة" : " · غير متزامنة"}`} />
          }
        >
          {filteredPrinters.length > 0 && bridgeSource === "fallback" && (
            <div className="rounded-md border border-amber-300/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium">الطابعات غير متزامنة مع برنامج الطباعة.</div>
                <div className="opacity-80 mt-0.5">برنامج الطباعة يستخدم قائمة افتراضية بدل طابعات هذا الفرع.</div>
              </div>
              <Button size="sm" onClick={() => void handleSyncDevice()} disabled={syncing} className="gap-1 h-7 px-2 text-xs">
                {syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
                مزامنة الطابعات الآن
              </Button>
            </div>
          )}
          {filteredPrinters.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground text-center">
              لا توجد طابعات مرتبطة بهذا الفرع بعد
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPrinters.map(p => {
                const cat = p.print_categories?.[0] || p.printer_type;
                const role = PRINTER_ROLES.find(r => r.value === cat) || { label: cat, emoji: "🖨️" };
                const health = bridgePrinterHealth[p.ip_address || ""] || null;
                return (
                  <PrinterRow
                    key={p.id}
                    printer={p}
                    roleLabel={role.label}
                    roleEmoji={role.emoji}
                    bridgeOnline={!!bridgeOnline}
                    bridgeConnected={health?.connected ?? null}
                    bridgeSubnetMismatch={health?.subnetMismatch}
                    notSynced={bridgeSource === "fallback"}
                    testStatus={printerStatus[p.id] ?? null}
                    windowsPrinters={windowsPrinters}
                    onTest={() => handlePrinterTest(p)}
                    onConvertToWindows={() => setConvertTarget(p)}
                    onDelete={() => setPrinterToDelete(p)}
                    onResyncAll={() => handleSyncDevice()}
                  />
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={() => setShowAddPrinter(true)} className="gap-2"><Plus className="h-4 w-4" /> إضافة طابعة</Button>
            <Button variant="outline" onClick={refreshPrinterStatus} disabled={!bridgeOnline || filteredPrinters.length === 0} className="gap-2">
              <RefreshCw className="h-4 w-4" /> فحص حالة الطابعات
            </Button>
            <Button variant="ghost" onClick={() => navigate("/printer-settings")} className="gap-2 text-xs">
              <Link2 className="h-3.5 w-3.5" /> إعدادات الطابعات المتقدمة
            </Button>
          </div>

          {/* ── Network discovery panel (collapsible) ── */}
          <Collapsible open={showDiscovery} onOpenChange={setShowDiscovery}>
            <CollapsibleTrigger asChild>
              <button type="button" className="w-full rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-right hover:bg-primary/10 flex items-center gap-2">
                <Radar className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">اكتشاف طابعات الشبكة</span>
                <span className="text-[11px] text-muted-foreground flex-1">يفحص الشبكة على المنفذ 9100 (آمن — بدون طباعة)</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showDiscovery ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[140px] space-y-1">
                <Label className="text-[11px] flex items-center gap-1">
                  <Radar className="h-3.5 w-3.5" /> اكتشف طابعات الشبكة تلقائياً
                </Label>
                <Input
                  value={discoverSubnet}
                  onChange={(e) => setDiscoverSubnet(e.target.value)}
                  placeholder="اتركه فارغاً ليُكتشف تلقائياً، أو اكتب 192.168.1"
                  dir="ltr"
                  className="text-xs"
                />
              </div>
              <Button
                onClick={runDiscovery}
                disabled={!bridgeOnline || discovering}
                className="gap-2"
                size="sm"
              >
                {discovering
                  ? <RefreshCw className="h-4 w-4 animate-spin" />
                  : <Radar className="h-4 w-4" />}
                {discovering ? "يتم فحص الشبكة..." : "البحث عن طابعات الشبكة"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              يفحص جميع عناوين الشبكة (1–254) على port 9100. آمن ولا يطبع شيئاً.
            </p>

            {discovering && (
              <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> يتم فحص الشبكة... (قد يستغرق حتى 30 ثانية)
              </div>
            )}

            {!discovering && discovered && discovered.length === 0 && (
              <div className="rounded-md border border-amber-300/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                لم نجد طابعات على هذه الشبكة
                {discoverMeta?.subnet ? <> (<span dir="ltr">{discoverMeta.subnet}.x</span>)</> : null}.
                تأكد أن الطابعة شغّالة، وعلى نفس الشبكة، وأن IP ثابت، أو أدخل IP يدوياً.
              </div>
            )}

            {!discovering && discovered && discovered.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] text-muted-foreground">
                  {discovered.length} جهاز محتمل
                  {discoverMeta?.subnet ? <> على <span dir="ltr">{discoverMeta.subnet}.x</span></> : null}
                  {discoverMeta?.elapsedMs ? <> · {(discoverMeta.elapsedMs / 1000).toFixed(1)}s</> : null}
                </div>
                {discovered.map((d) => {
                  const already = filteredPrinters.find(p => p.ip_address === d.ip);
                  return (
                    <div
                      key={d.ip}
                      className="rounded-md border border-border bg-card p-3 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <Wifi className="h-4 w-4 text-success" />
                        <span className="font-mono text-sm font-semibold" dir="ltr">
                          {d.ip}:{d.port}
                        </span>
                        {already && (
                          <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                            مُعرَّفة كـ {already.name}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {PRINTER_ROLES.map(r => (
                          <Button
                            key={r.value}
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] gap-1"
                            disabled={assigningIp === d.ip}
                            onClick={() => assignDiscoveredAsRole(d, r.value)}
                          >
                            <span>{r.emoji}</span> استخدام كـ{r.label}
                          </Button>
                        ))}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px] gap-1"
                          onClick={async () => {
                            const ok = await testPrinterConnection(d.ip, d.port);
                            if (ok) toast.success(`✅ ${d.ip} — متصل`);
                            else    toast.error(`❌ ${d.ip} — لم يرد`);
                          }}
                        >
                          <TestTube className="h-3.5 w-3.5" /> اختبار
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
            </CollapsibleContent>
          </Collapsible>
        </Section>

        {/* ── Step 4: Pre-handover summary ────────────────── */}
        <Section
          n={4} title="اختبار قبل التسليم" icon={Rocket} status={step4Status}
          subtitle="ملخّص نهائي قبل تشغيل الكاشير."
          open={openStep === 4} onToggle={() => setOpenStep(openStep === 4 ? 0 : 4)}
          summary={
            smokeOk
              ? <SummarySimple ok text="جاهز للتشغيل" />
              : <SummarySimple text={deviceConfigured ? "يحتاج اختبار طباعة" : "أكمل الخطوات السابقة"} />
          }
        >
          {/* Compact summary stats */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <SummaryStat label="الفرع"            value={branches.find(b => b.id === branchId)?.name || "—"} ok={!!branchId} />
            <SummaryStat label="المحطة"           value={terminals.find(t => t.id === terminalId)?.name || "—"} ok={!!terminalId} />
            <SummaryStat label="الصندوق"          value={cashBoxes.find(c => c.id === cashBoxId)?.name || "—"} optional />
            <SummaryStat label="الطابعات النشطة"  value={String(filteredPrinters.length)} ok={filteredPrinters.length > 0} />
            <SummaryStat
              label="آخر اختبار فاتورة"
              value={lastReceiptTestOk === true ? "✓ ناجح" : lastReceiptTestOk === false ? "✗ فشل" : "لم يتم"}
              ok={lastReceiptTestOk === true ? true : lastReceiptTestOk === false ? false : undefined}
            />
            <SummaryStat label="برنامج الطباعة"   value={bridgeOnline ? "متصل" : "غير متصل"} ok={bridgeOnline === true} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={testReceiptPrint} disabled={!receiptPrinter || !bridgeOnline} className="gap-1">
              <TestTube className="h-4 w-4" /> اختبار فاتورة
            </Button>
            <Button variant="outline" size="sm" onClick={testKitchenPrint} disabled={!kitchenPrinter || !bridgeOnline} className="gap-1">
              <TestTube className="h-4 w-4" /> اختبار مطبخ
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/printer-settings")} className="gap-1 text-xs text-muted-foreground">
              <Printer className="h-3.5 w-3.5" /> إعدادات الطابعات
            </Button>
          </div>

          <Button
            onClick={() => navigate("/pos")}
            disabled={!deviceConfigured}
            className="w-full gap-2 h-12 text-base mt-2"
            size="lg"
          >
            <Rocket className="h-5 w-5" /> فتح نقطة البيع
          </Button>
          {!deviceConfigured && (
            <p className="text-[11px] text-muted-foreground text-center">
              أكمل ربط الفرع والمحطة في خطوة 2 لتفعيل الزر.
            </p>
          )}
        </Section>
      </div>

      {/* ── Dialogs ────────────────────────────────────── */}
      <Dialog open={showNewBranch} onOpenChange={setShowNewBranch}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إنشاء فرع جديد</DialogTitle></DialogHeader>
          <Label className="text-xs">اسم الفرع</Label>
          <Input value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBranch(false)}>إلغاء</Button>
            <Button onClick={createBranch}>إنشاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewTerminal} onOpenChange={setShowNewTerminal}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إنشاء محطة POS جديدة</DialogTitle></DialogHeader>
          <Label className="text-xs">اسم المحطة</Label>
          <Input value={newTerminalName} onChange={(e) => setNewTerminalName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTerminal(false)}>إلغاء</Button>
            <Button onClick={createTerminal}>إنشاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddPrinterDialog
        open={showAddPrinter}
        onClose={() => setShowAddPrinter(false)}
        userId={user?.id || ""}
        branchId={branchId}
        windowsPrinters={windowsPrinters}
        onFetchWindowsPrinters={fetchWindowsPrinters}
        onSaved={async () => { setShowAddPrinter(false); await loadOptions(); }}
        bridgeOnline={bridgeOnline === true}
      />

      <AlertDialog open={!!printerToDelete} onOpenChange={(v) => !v && setPrinterToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>هل تريد حذف هذه الطابعة؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف <span className="font-semibold">{printerToDelete?.name}</span> من قائمة الطابعات ومن برنامج الطباعة المحلي.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); if (printerToDelete) void handlePrinterDelete(printerToDelete); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "جارٍ الحذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConvertToWindowsPrinterDialog
        open={!!convertTarget}
        onOpenChange={(v) => { if (!v) setConvertTarget(null); }}
        posPrinterId={convertTarget?.id}
        printerName={convertTarget?.name || ""}
        width={576}
        onConverted={async () => { setConvertTarget(null); await loadOptions(); await refreshPrinterStatus(); }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────
function Section({
  n, title, subtitle, icon: Icon, status, children,
  open = true, onToggle, summary,
}: {
  n: number; title: string; subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  status: StepStatus; children: React.ReactNode;
  open?: boolean; onToggle?: () => void;
  summary?: React.ReactNode;
}) {
  const badge = {
    idle:  { label: "لم يبدأ",      cls: "bg-muted text-muted-foreground border-border" },
    needs: { label: "يحتاج إجراء",  cls: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800" },
    ok:    { label: "ناجح",         cls: "bg-success/10 text-success border-success/30" },
    fail:  { label: "فشل",          cls: "bg-destructive/10 text-destructive border-destructive/30" },
  }[status];
  const collapsible = !!onToggle;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        disabled={!collapsible}
        className={`w-full flex items-center gap-3 px-4 py-3 ${open ? "border-b border-border" : ""} bg-muted/30 ${collapsible ? "hover:bg-muted/50 cursor-pointer" : ""} text-right`}
      >
        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">{n}</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-foreground flex items-center gap-2 text-sm">
            <Icon className="h-4 w-4 text-primary" /> {title}
          </div>
          {open && subtitle && <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>}
          {!open && summary && <div className="mt-0.5">{summary}</div>}
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>
          {badge.label}
        </span>
        {collapsible && (
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

function CheckItem({ ok, label, optional }: { ok: boolean; label: string; optional?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      {ok
        ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
        : <XCircle className={`h-4 w-4 shrink-0 ${optional ? "text-muted-foreground" : "text-destructive"}`} />}
      <span className={ok ? "text-foreground" : (optional ? "text-muted-foreground" : "text-foreground")}>
        {label}{optional && <span className="text-[10px] text-muted-foreground ml-1">(اختياري)</span>}
      </span>
    </li>
  );
}

function SummarySimple({ ok, fail, text }: { ok?: boolean; fail?: boolean; text: string }) {
  const color = ok ? "text-success" : fail ? "text-destructive" : "text-muted-foreground";
  const Icon = ok ? CheckCircle2 : fail ? XCircle : null;
  return (
    <div className={`text-[11px] truncate inline-flex items-center gap-1 ${color}`}>
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      <span className="truncate">{text}</span>
    </div>
  );
}

function SummaryStat({ label, value, ok, optional }: { label: string; value: string; ok?: boolean; optional?: boolean }) {
  const valueColor = ok === true ? "text-success" : ok === false ? "text-destructive" : optional ? "text-muted-foreground" : "text-foreground";
  return (
    <div className="space-y-0.5 min-w-0">
      <div className="text-[10px] text-muted-foreground truncate">{label}</div>
      <div className={`text-xs font-medium truncate ${valueColor}`}>{value}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Add Printer dialog (Network or USB)
// ────────────────────────────────────────────────────────────────
function AddPrinterDialog({
  open, onClose, userId, branchId, windowsPrinters, onFetchWindowsPrinters, onSaved, bridgeOnline,
}: {
  open: boolean; onClose: () => void; userId: string; branchId: string;
  windowsPrinters: WindowsPrinterInfo[]; onFetchWindowsPrinters: () => void;
  onSaved: () => void | Promise<void>; bridgeOnline: boolean;
}) {
  const [mode, setMode] = useState<"network" | "usb">("network");
  const [name, setName] = useState("");
  const [role, setRole] = useState("receipt");
  const [ip, setIp]     = useState("");
  const [port, setPort] = useState("9100");
  const [winName, setWinName] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const reset = () => {
    setMode("network"); setName(""); setRole("receipt");
    setIp(""); setPort("9100"); setWinName("");
  };

  const handleClose = () => { reset(); onClose(); };

  const handleTest = async () => {
    setTesting(true);
    try {
      if (mode === "usb") {
        if (!winName.trim()) { toast.error("اختر طابعة Windows أولاً"); return; }
        const r = await testWindowsPrinter(winName.trim());
        if (r.success) toast.success("✅ تم إرسال صفحة اختبار للطابعة");
        else           toast.error(`❌ ${r.error || "فشل الطباعة"}`);
        return;
      }
      if (!ip) { toast.error("أدخل عنوان IP"); return; }
      const ok = await testPrinterConnection(ip, Number(port) || 9100);
      if (ok) toast.success("✅ الطابعة ردّت — جاهزة للاستخدام");
      else    toast.error("❌ لم ترد الطابعة. تأكد من الـ IP والشبكة");
    } finally { setTesting(false); }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("أدخل اسم الطابعة"); return; }
    if (mode === "network" && !ip) { toast.error("أدخل عنوان IP"); return; }
    if (mode === "usb" && !winName.trim()) { toast.error("اختر/أدخل اسم طابعة Windows"); return; }
    if (mode === "usb" && role === "receipt") {
      const info = windowsPrinters.find(w => w.name === winName.trim());
      const kind = detectPrinterConnection(info?.portName, info?.driverName, info?.name || winName);
      if (kind === "Virtual/PDF" || kind === "Remote/AnyDesk") {
        const ok = window.confirm(
          `هذه الطابعة من نوع "${kind}" — لن تطبع فواتير حقيقية. هل تريد المتابعة؟`,
        );
        if (!ok) return;
      }
    }
    setSaving(true);
    try {
      const row: any = {
        user_id: userId,
        name: name.trim(),
        ip_address: mode === "network" ? ip.trim() : "",
        port: mode === "network" ? (Number(port) || 9100) : 0,
        printer_type: role === "receipt" ? "receipt" : "kitchen_ticket",
        print_categories: [role],
        branch_id: branchId || null,
        is_active: true,
        is_default: role === "receipt",
        settings: mode === "usb"
          ? { connection: "windows", windows_printer_name: winName.trim() }
          : (role === "unified_kitchen" ? { image_mode: "unified_kitchen" } : {}),
      };
      const { error } = await supabase.from("pos_printers").insert(row);
      if (error) { toast.error("فشل الحفظ: " + error.message); return; }
      // Push the new printer to the bridge (device.json) immediately so the
      // cashier doesn't have to restart anything.
      const bridgeKey = roleToBridgeKey(role);
      if (bridgeKey) {
        const printerForBridge: any = mode === "usb"
          ? { type: "windows", name: name.trim(), windowsPrinterName: winName.trim(), width: 576 }
          : { type: "network", name: name.trim(), ip: ip.trim(), port: Number(port) || 9100, width: 576 };
        const pushed = await pushPrintersToBridge({ [bridgeKey]: printerForBridge }).catch(() => false);
        if (pushed) toast.success(`✅ تم إضافة "${name}" — تم حفظها محلياً على هذا الجهاز`);
        else        toast.success(`✅ تم إضافة "${name}" (لن تنطبق على الجسر حتى يعمل برنامج الطباعة)`);
      } else {
        toast.success(`✅ تم إضافة "${name}"`);
      }
      await onSaved();
      reset();
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>إضافة طابعة جديدة</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button" onClick={() => setMode("network")}
              className={`rounded-md border p-3 text-sm text-right transition-colors ${mode === "network" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"}`}
            >
              <div className="flex items-center gap-2"><Wifi className="h-4 w-4" /> طابعة شبكة</div>
              <div className="text-[11px] mt-0.5 opacity-80">IP + Port 9100</div>
            </button>
            <button
              type="button" onClick={() => setMode("usb")}
              className={`rounded-md border p-3 text-sm text-right transition-colors ${mode === "usb" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"}`}
            >
              <div className="flex items-center gap-2"><Boxes className="h-4 w-4" /> USB / Windows</div>
              <div className="text-[11px] mt-0.5 opacity-80">طابعة على نفس الكمبيوتر</div>
            </button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">اسم الطابعة</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: Receipt - الواجهة" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">الوظيفة</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRINTER_ROLES.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.emoji} {r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === "network" ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">عنوان IP</Label>
                <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.50" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Port</Label>
                <Input value={port} onChange={(e) => setPort(e.target.value)} dir="ltr" />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">اسم طابعة Windows</Label>
                <Button type="button" size="sm" variant="ghost" onClick={onFetchWindowsPrinters} disabled={!bridgeOnline} className="h-6 text-[11px] gap-1">
                  <RefreshCw className="h-3 w-3" /> قراءة الطابعات
                </Button>
              </div>
              {windowsPrinters.length > 0 ? (
                <>
                  <Select value={winName} onValueChange={setWinName}>
                    <SelectTrigger><SelectValue placeholder="اختر طابعة من القائمة" /></SelectTrigger>
                    <SelectContent>
                      {windowsPrinters.map(w => {
                        const kind = detectPrinterConnection(w.portName, w.driverName, w.name);
                        return (
                          <SelectItem key={w.name} value={w.name}>
                            <span className="inline-flex items-center gap-2">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${connectionBadgeClass(kind)}`}>
                                {kind}
                              </span>
                              <span>{w.name}</span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {winName && (() => {
                    const w = windowsPrinters.find(x => x.name === winName);
                    if (!w) return null;
                    const kind = detectPrinterConnection(w.portName, w.driverName, w.name);
                    return (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2" dir="ltr">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${connectionBadgeClass(kind)}`}>
                          {kind}
                        </span>
                        <span>{w.portName || "—"}</span>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <Input value={winName} onChange={(e) => setWinName(e.target.value)} placeholder="اكتب الاسم كما يظهر في Windows" />
              )}
              <p className="text-[11px] text-muted-foreground">
                إذا الزر لم يرجع طابعات: تأكد أن Print Bridge يدعم endpoint <code dir="ltr">/windows-printers</code>.
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>إلغاء</Button>
          {mode === "network" && (
            <Button variant="outline" onClick={handleTest} disabled={testing || !bridgeOnline} className="gap-1">
              {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
              اختبار
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving} className="gap-1">
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}