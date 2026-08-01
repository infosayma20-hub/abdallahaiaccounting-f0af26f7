import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Copy, ExternalLink, Save, Monitor, CreditCard, Printer, Wifi,
  CheckCircle2, XCircle, Loader2, Play, Building2, KeyRound, Search, Usb, Plus,
  Download, ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import bridgeStdAsset from "@/assets/unify-print-bridge.zip.asset.json";
import { checkBridgeStatus, testPrinterConnection } from "@/lib/print-bridge-client";
import { pinpadPing, pinpadSale } from "@/lib/pinpad-bridge";
import { discoverNetworkPrinters, type DiscoveredPrinter } from "@/lib/device-config";
import { getDeviceConfig } from "@/lib/device-config";
import { withLocalNetworkAccess } from "@/lib/local-network-fetch";

interface WinPrinter { name: string; portName?: string; driverName?: string; default?: boolean; }

interface Branch { id: string; name: string; }
interface BankAccount { id: string; name: string; bank_name: string; gl_account_code: string | null; }
interface PrinterRow { id: string; name: string; ip_address: string; port: number; branch_id: string | null; }
interface PinPadRow { id: string; label: string; ip_address: string; port: number; branch_id: string | null; is_active: boolean; }

interface KioskSettingsRow {
  id?: string;
  branch_id: string;
  is_active: boolean;
  exit_pin: string;
  default_language: string;
  idle_timeout_seconds: number;
  require_phone: boolean;
  require_name: boolean;
  visa_bank_account_id: string | null;
  visa_terminal_id: string | null;
  receipt_printer_id: string | null;
  logo_url: string | null;
  welcome_image_url: string | null;
  primary_color: string;
}

const defaultRow = (branchId: string): KioskSettingsRow => ({
  branch_id: branchId,
  is_active: true,
  exit_pin: "1234",
  default_language: "ar",
  idle_timeout_seconds: 60,
  require_phone: true,
  require_name: true,
  visa_bank_account_id: null,
  visa_terminal_id: null,
  receipt_printer_id: null,
  logo_url: null,
  welcome_image_url: null,
  primary_color: "#E53935",
});

type TestState = "idle" | "checking" | "ok" | "fail";

function StatusBadge({ state, okLabel, failLabel }: { state: TestState; okLabel: string; failLabel: string }) {
  if (state === "checking") return <Badge variant="outline" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" /> جاري الاختبار…</Badge>;
  if (state === "ok") return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 gap-1"><CheckCircle2 className="w-3 h-3" /> {okLabel}</Badge>;
  if (state === "fail") return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> {failLabel}</Badge>;
  return <Badge variant="outline">لم يتم الاختبار</Badge>;
}

export default function KioskSettingsPage() {
  const { dataOwnerId } = useDataOwnerId();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [row, setRow] = useState<KioskSettingsRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [profileLogo, setProfileLogo] = useState<string | null>(null);
  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [pinpads, setPinpads] = useState<PinPadRow[]>([]);
  const [bridgeState, setBridgeState] = useState<TestState>("idle");
  const [printerState, setPrinterState] = useState<TestState>("idle");
  const [pinpadState, setPinpadState] = useState<TestState>("idle");
  const [pinpadMsg, setPinpadMsg] = useState<string>("");

  // Printer discovery
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredPrinter[] | null>(null);
  const [discoverError, setDiscoverError] = useState<string>("");
  const [loadingWin, setLoadingWin] = useState(false);
  const [winPrinters, setWinPrinters] = useState<WinPrinter[] | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!dataOwnerId) return;
    supabase.from("branches").select("id,name").eq("user_id", dataOwnerId).eq("is_active", true).then(({ data }) => {
      const bs = (data as any) || [];
      setBranches(bs);
      if (bs.length && !branchId) setBranchId(bs[0].id);
    });
    supabase.from("bank_accounts").select("id,name,bank_name,gl_account_code")
      .eq("user_id", dataOwnerId).eq("is_active", true)
      .then(({ data }) => setBanks((data as any) || []));
    supabase.from("company_settings").select("logo_url").eq("user_id", dataOwnerId).maybeSingle()
      .then(({ data }) => setProfileLogo((data as any)?.logo_url || null));
    supabase.from("pos_printers").select("id,name,ip_address,port,branch_id")
      .eq("user_id", dataOwnerId).eq("is_active", true)
      .then(({ data }) => setPrinters((data as any) || []));
    supabase.from("bop_pinpad_terminals" as any).select("id,label,ip_address,port,branch_id,is_active")
      .eq("is_active", true)
      .then(({ data }) => setPinpads((data as any) || []));
  }, [dataOwnerId]);

  const [allRows, setAllRows] = useState<any[]>([]);

  const loadAllRows = useCallback(() => {
    if (!dataOwnerId) return;
    supabase.from("kiosk_settings" as any).select("branch_id,access_code,exit_pin,is_active")
      .eq("user_id", dataOwnerId)
      .then(({ data }) => setAllRows((data as any) || []));
  }, [dataOwnerId]);

  useEffect(() => { loadAllRows(); }, [loadAllRows]);

  useEffect(() => {
    if (!dataOwnerId || !branchId) return;
    supabase.from("kiosk_settings" as any).select("*").eq("user_id", dataOwnerId).eq("branch_id", branchId).maybeSingle()
      .then(({ data }) => setRow(data ? (data as any) : defaultRow(branchId)));
  }, [dataOwnerId, branchId]);

  const save = async () => {
    if (!dataOwnerId || !row) return;
    setSaving(true);
    const payload: any = { ...row, user_id: dataOwnerId, branch_id: branchId };
    const { error } = row.id
      ? await supabase.from("kiosk_settings" as any).update(payload).eq("id", row.id)
      : await supabase.from("kiosk_settings" as any).upsert(payload, { onConflict: "user_id,branch_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("تم الحفظ"); loadAllRows(); }
  };

  const PUBLIC_BASE = "https://unifyerp.app";
  const kioskUrl = branchId ? `${PUBLIC_BASE}/kiosk/${branchId}` : "";
  const publicKioskUrl = (row as any)?.access_code ? `${PUBLIC_BASE}/k/${(row as any).access_code}` : "";

  const rotateAccessCode = async () => {
    if (!branchId) return;
    const { data, error } = await supabase.rpc("rotate_kiosk_access_code" as any, { p_branch_id: branchId });
    if (error) { toast.error(error.message); return; }
    setRow((prev: any) => (prev ? { ...prev, access_code: data } : prev));
    loadAllRows();
    toast.success("تم تجديد رمز الرابط");
  };

  const branchPrinters = printers.filter(p => !p.branch_id || p.branch_id === branchId);
  const branchPinpads = pinpads.filter(p => !p.branch_id || p.branch_id === branchId);
  const selectedPrinter = branchPrinters.find(p => p.id === row?.receipt_printer_id);
  const selectedPinpad = branchPinpads.find(p => p.id === row?.visa_terminal_id);
  const selectedBank = banks.find(b => b.id === row?.visa_bank_account_id);

  const runBridgeTest = async () => {
    setBridgeState("checking");
    const online = await checkBridgeStatus();
    setBridgeState(online ? "ok" : "fail");
  };

  const runPrinterTest = async () => {
    if (!selectedPrinter) return;
    setPrinterState("checking");
    const ok = await testPrinterConnection(selectedPrinter.ip_address, selectedPrinter.port);
    setPrinterState(ok ? "ok" : "fail");
  };

  const runPinpadTest = async () => {
    if (!selectedPinpad) return;
    setPinpadState("checking");
    setPinpadMsg("");
    // 1) module presence
    const ping = await pinpadPing();
    if (!ping.ok) {
      setPinpadState("fail");
      setPinpadMsg("وحدة PinPad غير متاحة في Print Bridge على هذا الجهاز.");
      return;
    }
    // 2) real SALE 1 ILS as a live handshake (bank recommends 1 shekel test)
    try {
      const res = await pinpadSale({
        terminalId: selectedPinpad.id,
        amount: 1, currency: "ILS",
        receipt: `KIOSK-TEST-${Date.now()}`,
        printSlip: "none",
      });
      if (res.ok && res.respCode === "000") {
        setPinpadState("ok");
        setPinpadMsg(`نجح — Auth ${res.authCode ?? "-"} · ${res.cardMasked ?? ""}`);
      } else {
        setPinpadState("fail");
        setPinpadMsg(`رد الجهاز: ${res.respCode} — ${res.errorMsg ?? "غير معروف"}`);
      }
    } catch (e: any) {
      setPinpadState("fail");
      setPinpadMsg(e?.message ?? String(e));
    }
  };

  const reloadPrinters = async () => {
    if (!dataOwnerId) return;
    const { data } = await supabase.from("pos_printers")
      .select("id,name,ip_address,port,branch_id")
      .eq("user_id", dataOwnerId).eq("is_active", true);
    setPrinters((data as any) || []);
  };

  const runDiscoverNetwork = async () => {
    setDiscovering(true); setDiscoverError(""); setDiscovered(null);
    try {
      const r = await discoverNetworkPrinters({});
      if (!r.ok) setDiscoverError(r.error || "تعذّر البحث — تأكد إن Print Bridge مفعّل.");
      setDiscovered(r.found || []);
    } catch (e: any) {
      setDiscoverError(e?.message ?? String(e));
    } finally { setDiscovering(false); }
  };

  const loadWindowsPrinters = async () => {
    setLoadingWin(true); setWinPrinters(null);
    try {
      const url = getDeviceConfig().bridgeUrl || "http://127.0.0.1:3001";
      let res: Response;
      try {
        res = await fetch(`${url}/windows-printers`, withLocalNetworkAccess({ signal: AbortSignal.timeout(4000) }));
      } catch {
        res = await fetch(`${url}/windows-printers`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
      }
      if (!res.ok) throw new Error("endpoint غير متوفر");
      const data = await res.json();
      const raw: any[] = Array.isArray(data) ? data : (Array.isArray(data?.printers) ? data.printers : []);
      const list: WinPrinter[] = raw.map((p): WinPrinter | null => {
        if (typeof p === "string") return { name: p };
        if (p && typeof p === "object") {
          const n = p.name ?? p.Name ?? p.printerName;
          if (typeof n !== "string" || !n) return null;
          return { name: n, portName: p.portName, driverName: p.driverName, default: !!p.default };
        }
        return null;
      }).filter((x): x is WinPrinter => !!x);
      setWinPrinters(list);
      if (!list.length) toast.info("لم يتم العثور على طابعات Windows");
    } catch (e: any) {
      toast.error("تعذّر قراءة طابعات Windows: " + (e?.message ?? String(e)));
      setWinPrinters([]);
    } finally { setLoadingWin(false); }
  };

  const addNetworkPrinter = async (d: DiscoveredPrinter) => {
    if (!dataOwnerId || !branchId || !row) return;
    const key = `net-${d.ip}`;
    setAddingKey(key);
    try {
      const payload: any = {
        user_id: dataOwnerId,
        name: `طابعة كيوسك (${d.ip})`,
        ip_address: d.ip,
        port: d.port || 9100,
        printer_type: "receipt",
        print_categories: ["receipt"],
        branch_id: branchId,
        is_active: true,
        is_default: false,
        settings: {},
      };
      const { data, error } = await supabase.from("pos_printers").insert(payload).select("id,name,ip_address,port,branch_id").single();
      if (error) { toast.error("فشل الحفظ: " + error.message); return; }
      toast.success("تم إضافة الطابعة");
      await reloadPrinters();
      if (data) setRow({ ...row, receipt_printer_id: (data as any).id });
      setPrinterState("idle");
    } finally { setAddingKey(null); }
  };

  const addUsbPrinter = async (w: WinPrinter) => {
    if (!dataOwnerId || !branchId || !row) return;
    const key = `usb-${w.name}`;
    setAddingKey(key);
    try {
      const payload: any = {
        user_id: dataOwnerId,
        name: w.name,
        ip_address: "",
        port: 0,
        printer_type: "receipt",
        print_categories: ["receipt"],
        branch_id: branchId,
        is_active: true,
        is_default: false,
        settings: { connection: "windows", windows_printer_name: w.name },
      };
      const { data, error } = await supabase.from("pos_printers").insert(payload).select("id,name,ip_address,port,branch_id").single();
      if (error) { toast.error("فشل الحفظ: " + error.message); return; }
      toast.success("تم إضافة الطابعة");
      await reloadPrinters();
      if (data) setRow({ ...row, receipt_printer_id: (data as any).id });
      setPrinterState("idle");
    } finally { setAddingKey(null); }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4 pb-24" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center">
            <Monitor className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">إعداد جهاز الكيوسك</h1>
            <p className="text-xs text-muted-foreground">اتبع الخطوات بالترتيب — كل خطوة فيها زر اختبار.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={bridgeStdAsset.url} download>
              <Download className="h-4 w-4 ml-1" /> تحميل برنامج الطباعة
            </a>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.location.assign("/pos/settings");
            }}
          >
            <ArrowRight className="h-4 w-4 ml-1" /> رجوع
          </Button>
        </div>
      </div>

      {/* Step 1 — Branch */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">1</span>
            <Building2 className="w-4 h-4" /> اختر الفرع
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger><SelectValue placeholder="اختر فرع" /></SelectTrigger>
            <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-2">كل فرع له إعداد كيوسك مستقل.</p>
        </CardContent>
      </Card>

      {row && (
        <>
          {/* Step 2 — Print Bridge */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">2</span>
                  <Wifi className="w-4 h-4" /> Print Bridge على جهاز الكيوسك
                </span>
                <Button size="sm" variant="outline" onClick={runBridgeTest} disabled={bridgeState === "checking"}>
                  {bridgeState === "checking" ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <Play className="w-3.5 h-3.5 ml-1" />}
                  اختبار الاتصال
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <StatusBadge state={bridgeState} okLabel="Bridge متصل" failLabel="Bridge غير متصل" />
              <p>افتح هذه الصفحة على جهاز الكيوسك نفسه، وتأكد إن Print Bridge مفعّل ومعتمد (Authorized).</p>
            </CardContent>
          </Card>

          {/* Step 3 — Receipt printer */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">3</span>
                  <Printer className="w-4 h-4" /> طابعة الإيصالات
                </span>
                <Button size="sm" variant="outline" onClick={runPrinterTest} disabled={!selectedPrinter || printerState === "checking"}>
                  {printerState === "checking" ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <Play className="w-3.5 h-3.5 ml-1" />}
                  اختبار الطابعة
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select value={row.receipt_printer_id || ""} onValueChange={v => { setRow({ ...row, receipt_printer_id: v || null }); setPrinterState("idle"); }}>
                <SelectTrigger><SelectValue placeholder={branchPrinters.length ? "اختر الطابعة" : "لا يوجد طابعات لهذا الفرع"} /></SelectTrigger>
                <SelectContent>
                  {branchPrinters.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — {p.ip_address}:{p.port}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <StatusBadge state={printerState} okLabel="الطابعة تعمل" failLabel="الطابعة لا تستجيب" />
              {branchPrinters.length === 0 && (
                <p className="text-xs text-destructive">ما في طابعات مسجّلة لهذا الفرع. عرّف طابعة أولاً من إعدادات الطابعات.</p>
              )}

              {/* Discover / Add printer */}
              <div className="border-t pt-3 mt-2 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={runDiscoverNetwork} disabled={discovering}>
                    {discovering ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <Search className="w-3.5 h-3.5 ml-1" />}
                    البحث عن طابعات الشبكة
                  </Button>
                  <Button size="sm" variant="secondary" onClick={loadWindowsPrinters} disabled={loadingWin}>
                    {loadingWin ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <Usb className="w-3.5 h-3.5 ml-1" />}
                    عرض طابعات USB
                  </Button>
                </div>

                {discoverError && <p className="text-xs text-destructive">{discoverError}</p>}

                {discovered && discovered.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">طابعات شبكة تم العثور عليها ({discovered.length}):</p>
                    {discovered.map(d => (
                      <div key={d.ip} className="flex items-center gap-2 border rounded-md p-2">
                        <Wifi className="w-4 h-4 text-primary" />
                        <span className="flex-1 font-mono text-xs" dir="ltr">{d.ip}:{d.port}</span>
                        <Button size="sm" variant="outline" onClick={() => addNetworkPrinter(d)} disabled={addingKey === `net-${d.ip}`}>
                          {addingKey === `net-${d.ip}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5 ml-1" />إضافة</>}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {discovered && discovered.length === 0 && !discoverError && (
                  <p className="text-xs text-muted-foreground">لم يتم العثور على طابعات على الشبكة.</p>
                )}

                {winPrinters && winPrinters.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">طابعات USB/Windows ({winPrinters.length}):</p>
                    {winPrinters.map(w => (
                      <div key={w.name} className="flex items-center gap-2 border rounded-md p-2">
                        <Usb className="w-4 h-4 text-primary" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate">{w.name} {w.default && <Badge variant="outline" className="text-[10px] ms-1">افتراضي</Badge>}</p>
                          {w.portName && <p className="text-[10px] text-muted-foreground font-mono" dir="ltr">{w.portName}</p>}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => addUsbPrinter(w)} disabled={addingKey === `usb-${w.name}`}>
                          {addingKey === `usb-${w.name}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5 ml-1" />إضافة</>}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {winPrinters && winPrinters.length === 0 && (
                  <p className="text-xs text-muted-foreground">لا توجد طابعات Windows — تأكد إن Print Bridge يدعم <code dir="ltr">/windows-printers</code>.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Step 4 — PinPad */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">4</span>
                  <CreditCard className="w-4 h-4" /> جهاز PinPad (بنك فلسطين)
                </span>
                <Button size="sm" variant="outline" onClick={runPinpadTest} disabled={!selectedPinpad || pinpadState === "checking"}>
                  {pinpadState === "checking" ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" /> : <Play className="w-3.5 h-3.5 ml-1" />}
                  اختبار عملية 1 ₪
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select value={row.visa_terminal_id || ""} onValueChange={v => { setRow({ ...row, visa_terminal_id: v || null }); setPinpadState("idle"); }}>
                <SelectTrigger><SelectValue placeholder={branchPinpads.length ? "اختر الجهاز" : "لا يوجد أجهزة PinPad لهذا الفرع"} /></SelectTrigger>
                <SelectContent>
                  {branchPinpads.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.label} — {p.ip_address}:{p.port}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <StatusBadge state={pinpadState} okLabel="الجهاز جاهز" failLabel="فشل الاتصال" />
              {pinpadMsg && <p className="text-xs text-muted-foreground">{pinpadMsg}</p>}
              {branchPinpads.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  عرّف الجهاز أولاً من صفحة{" "}
                  <a href="/settings/bop-pinpad" className="text-primary underline">أجهزة PinPad</a>.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Step 5 — Bank account */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">5</span>
                <CreditCard className="w-4 h-4" /> حساب استلام دفعات البطاقة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select value={row.visa_bank_account_id || ""} onValueChange={v => setRow({ ...row, visa_bank_account_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="اختر حساب البنك للفيزا" /></SelectTrigger>
                <SelectContent>
                  {banks.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} {b.gl_account_code ? `— ${b.gl_account_code}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">كل مبيعات الكيوسك بالبطاقة تُقيَّد على هذا الحساب.</p>
              {selectedBank && !selectedBank.gl_account_code && (
                <p className="text-xs text-destructive">تنبيه: الحساب ما إله كود محاسبي (GL) — القيد لن يُرحَّل.</p>
              )}
            </CardContent>
          </Card>

          {/* Step 6 — Essential kiosk settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">6</span>
                <KeyRound className="w-4 h-4" /> إعدادات الكيوسك الأساسية
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-bold">تفعيل الكيوسك</Label>
                  <p className="text-xs text-muted-foreground">عند التعطيل الكيوسك ما بيشتغل.</p>
                </div>
                <Switch checked={row.is_active} onCheckedChange={v => setRow({ ...row, is_active: v })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">رمز الخروج (PIN)</Label>
                  <Input value={row.exit_pin} onChange={e => setRow({ ...row, exit_pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" maxLength={6} dir="ltr" />
                </div>
                <div>
                  <Label className="text-xs">مدة الخمول (ثواني)</Label>
                  <Input type="number" min={20} max={600} value={row.idle_timeout_seconds} onChange={e => setRow({ ...row, idle_timeout_seconds: Math.max(20, Number(e.target.value) || 60) })} dir="ltr" />
                </div>
                <div>
                  <Label className="text-xs">اللغة الافتراضية</Label>
                  <Select value={row.default_language} onValueChange={v => setRow({ ...row, default_language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ar">العربية</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="flex items-center justify-between border rounded-md p-2">
                  <Label className="text-xs">طلب اسم العميل</Label>
                  <Switch checked={row.require_name} onCheckedChange={v => setRow({ ...row, require_name: v })} />
                </div>
                <div className="flex items-center justify-between border rounded-md p-2">
                  <Label className="text-xs">طلب رقم الجوال</Label>
                  <Switch checked={row.require_phone} onCheckedChange={v => setRow({ ...row, require_phone: v })} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 7 — Link */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">7</span>
                <ExternalLink className="w-4 h-4" /> رابط الكيوسك
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs font-semibold">الرابط العام (بدون تسجيل دخول) — مخصص لهذا الفرع</p>
              <div className="flex gap-2">
                <Input readOnly value={publicKioskUrl} className="font-mono text-xs" dir="ltr" placeholder="احفظ الإعدادات أولاً لتوليد الرابط" />
                <Button variant="outline" size="icon" disabled={!publicKioskUrl} onClick={() => { navigator.clipboard.writeText(publicKioskUrl); toast.success("تم النسخ"); }}><Copy className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" asChild disabled={!publicKioskUrl}><a href={publicKioskUrl || "#"} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={rotateAccessCode}>تجديد رمز الرابط</Button>
                <span className="text-[11px] text-muted-foreground">التجديد يلغي الرابط القديم فوراً.</span>
              </div>
              <p className="text-xs text-muted-foreground pt-2">رابط داخلي (يتطلب تسجيل دخول) — افتحه بوضع ملء الشاشة (F11).</p>
              <div className="flex gap-2">
                <Input readOnly value={kioskUrl} className="font-mono text-xs" dir="ltr" />
                <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(kioskUrl); toast.success("تم النسخ"); }}><Copy className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" asChild><a href={kioskUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
              </div>

              <div className="pt-4 border-t mt-3 space-y-2">
                <p className="text-xs font-semibold">روابط جميع الفروع (مثبتة)</p>
                {allRows.length === 0 && <p className="text-[11px] text-muted-foreground">لا يوجد فروع مفعّلة للكيوسك بعد.</p>}
                {allRows.map((r) => {
                  const bName = branches.find(b => b.id === r.branch_id)?.name || r.branch_id;
                  const url = r.access_code ? `${PUBLIC_BASE}/k/${r.access_code}` : "";
                  return (
                    <div key={r.branch_id} className="border rounded-md p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{bName}</span>
                        <span className="text-[11px] text-muted-foreground">رمز التفعيل: <b dir="ltr">{r.exit_pin || "—"}</b></span>
                      </div>
                      <div className="flex gap-2">
                        <Input readOnly value={url} className="font-mono text-[11px] h-8" dir="ltr" placeholder="لا يوجد رمز" />
                        <Button variant="outline" size="icon" className="h-8 w-8" disabled={!url} onClick={() => { navigator.clipboard.writeText(url); toast.success("تم النسخ"); }}><Copy className="h-3.5 w-3.5" /></Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" asChild disabled={!url}><a href={url || "#"} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Sticky save */}
          <div className="fixed bottom-0 inset-x-0 md:static md:mt-4 border-t md:border-0 bg-background/95 backdrop-blur md:bg-transparent p-3 md:p-0 flex justify-end z-10">
            <Button size="lg" onClick={save} disabled={saving} className="w-full md:w-auto">
              <Save className="h-4 w-4 me-2" />{saving ? "جاري الحفظ…" : "حفظ الإعدادات"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}