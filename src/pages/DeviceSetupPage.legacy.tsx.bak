import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Monitor, Wifi, WifiOff, Building2, Boxes, Save, TestTube, RefreshCw, ArrowLeft, Link2, Trash2 } from "lucide-react";
import BackButton from "@/components/BackButton";
import {
  getDeviceConfig,
  setBridgeUrl,
  setDeviceBranchId,
  setDeviceTerminalId,
  setDeviceLabel,
  clearDeviceConfig,
  normalizeBridgeUrl,
  isDeviceFullyConfigured,
} from "@/lib/device-config";

interface Branch {
  id: string;
  name: string;
  is_active: boolean;
  user_id?: string;
}

interface Terminal {
  id: string;
  name: string;
  branch_id: string | null;
  user_id?: string;
  is_active?: boolean;
}

export default function DeviceSetupPage() {
  console.log("DeviceSetupPage mounted");
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const initial = getDeviceConfig();
  const [bridgeInput, setBridgeInput] = useState(initial.bridgeUrl);
  const [branchId, setBranchId] = useState(initial.branchId);
  const [terminalId, setTerminalId] = useState(initial.terminalId);
  const [label, setLabel] = useState(initial.label);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [bridgeStatus, setBridgeStatus] = useState<"idle" | "testing" | "online" | "offline">("idle");
  const [bridgeError, setBridgeError] = useState<string>("");
  const [loadError, setLoadError] = useState<string>("");

  useEffect(() => {
    if (authLoading) return;
    void loadOptions();
  }, [user?.id, authLoading]);

  const loadOptions = async () => {
    if (authLoading) return;
    setLoading(true);
    setLoadError("");

    if (!user) {
      console.warn("[DeviceSetup] blocked: no authenticated user/session");
      setLoadError("لا توجد جلسة دخول نشطة. سجّل الدخول ثم أعد المحاولة.");
      setBranches([]);
      setTerminals([]);
      setLoading(false);
      return;
    }

    console.log("[DeviceSetup] Loading branches & terminals…", { userId: user.id });
    // Hard timeout — if Supabase hangs, unblock the UI after 6s.
    const timeout = new Promise<"timeout">(resolve =>
      setTimeout(() => resolve("timeout"), 6000),
    );
    try {
      const { data: ownerIdRaw, error: ownerErr } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
      if (ownerErr) console.error("[DeviceSetup] owner lookup error:", ownerErr);
      const ownerId = (ownerIdRaw as string | null) || user.id;
      console.log("[DeviceSetup] team owner id =", ownerId);

      const fetchAll = Promise.all([
        supabase.from("branches").select("id, name, is_active, user_id").eq("is_active", true).eq("user_id", ownerId).order("name"),
        supabase.from("pos_terminals").select("id, name, branch_id, user_id, is_active").eq("is_active", true).eq("user_id", ownerId).order("name"),
      ]);
      const result = await Promise.race([fetchAll, timeout]);
      if (result === "timeout") {
        console.warn("[DeviceSetup] ⚠️ Load timed out after 6s — showing empty UI.");
        setLoadError("تعذّر تحميل الفروع/المحطات خلال المهلة. أعد المحاولة.");
        setBranches([]);
        setTerminals([]);
      } else {
        const [branchesRes, terminalsRes] = result;
        if (branchesRes.error) {
          console.error("[DeviceSetup] branches error:", branchesRes.error);
          setLoadError("فشل جلب الفروع: " + branchesRes.error.message);
        }
        if (terminalsRes.error) {
          console.error("[DeviceSetup] terminals error:", terminalsRes.error);
          setLoadError(prev => prev || "فشل جلب المحطات: " + terminalsRes.error.message);
        }
        console.log("[DeviceSetup] branches data =", branchesRes.data);
        console.log("[DeviceSetup] terminals data =", terminalsRes.data);
        const nextBranches = (branchesRes.data as Branch[]) || [];
        setBranches(nextBranches);
        setTerminals((terminalsRes.data as Terminal[]) || []);
        if (!branchesRes.error && nextBranches.length === 0) {
          setLoadError("لا توجد فروع نشطة للحساب الحالي. تأكد أنك داخل شركة مطاعم الدجاج الملكي أو حساب كاشير تابع لها.");
        }
        console.log(
          `[DeviceSetup] ✅ Loaded ${branchesRes.data?.length ?? 0} branches, ${terminalsRes.data?.length ?? 0} terminals`,
        );
      }
    } catch (err) {
      console.error("[DeviceSetup] ❌ Load failed:", err);
      toast.error("فشل تحميل البيانات. تحقق من الاتصال.");
      setBranches([]);
      setTerminals([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredTerminals = useMemo(() => {
    if (!branchId) return terminals.filter(t => !t.branch_id);
    return terminals.filter(t => t.branch_id === branchId || !t.branch_id);
  }, [terminals, branchId]);

  const testBridge = async () => {
    const url = normalizeBridgeUrl(bridgeInput);
    if (!url) {
      toast.error("أدخل عنوان Print Bridge صحيح أولاً");
      return;
    }
    setBridgeStatus("testing");
    setBridgeError("");
    try {
      const res = await fetch(`${url}/health`, {
        mode: "cors",
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        setBridgeStatus("online");
        toast.success("✅ Print Bridge يعمل بنجاح");
      } else {
        setBridgeStatus("offline");
        setBridgeError(`الخادم رد بحالة ${res.status}`);
      }
    } catch (err: any) {
      setBridgeStatus("offline");
      setBridgeError(err?.message || "تعذر الوصول");
    }
  };

  const handleSave = async () => {
    const normalized = normalizeBridgeUrl(bridgeInput);
    if (!branchId) {
      toast.error("اختر الفرع لهذا الجهاز");
      return;
    }
    if (!terminalId) {
      toast.error("اختر محطة POS لهذا الجهاز");
      return;
    }

    // If selected terminal has no branch_id yet, link it now.
    const term = terminals.find(t => t.id === terminalId);
    if (term && !term.branch_id) {
      const { error } = await supabase
        .from("pos_terminals")
        .update({ branch_id: branchId } as any)
        .eq("id", terminalId);
      if (error) {
        toast.error("تعذر ربط المحطة بالفرع: " + error.message);
        return;
      }
    }

    setBridgeUrl(normalized);
    setDeviceBranchId(branchId);
    setDeviceTerminalId(terminalId);
    setDeviceLabel(label.trim());
    toast.success("✅ تم حفظ إعدادات هذا الجهاز");
    setTimeout(() => navigate("/pos"), 600);
  };

  const handleClear = () => {
    if (!confirm("سيتم مسح إعدادات هذا الجهاز فقط (الفرع، المحطة، Bridge URL). هل تريد المتابعة؟")) return;
    clearDeviceConfig();
    setBridgeInput("");
    setBranchId("");
    setTerminalId("");
    setLabel("");
    setBridgeStatus("idle");
    toast.success("تم مسح إعدادات هذا الجهاز");
  };

  const fullyConfigured = isDeviceFullyConfigured();

  return (
    <div className="min-h-full bg-background pb-24" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Monitor className="h-6 w-6" /> إعدادات هذا الجهاز
            </h1>
            <p className="text-sm text-muted-foreground">
              إعدادات خاصة بهذا الجهاز فقط (لا تنتقل للأجهزة الأخرى)
            </p>
          </div>
          {fullyConfigured ? (
            <Badge className="bg-success/10 text-success border-success/30">جاهز</Badge>
          ) : (
            <Badge variant="destructive">غير مكتمل</Badge>
          )}
        </div>

        {/* Step 1 — Bridge URL */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Wifi className="h-4 w-4" /> عنوان Print Bridge المحلي
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            اختياري حالياً — عنوان IP والمنفذ لخادم الطباعة المحلي على شبكة هذا الفرع. مثال:{" "}
            <code className="bg-muted px-1 rounded font-mono text-[11px]" dir="ltr">http://192.168.1.65:3001</code>
          </p>
          <div className="flex gap-2">
            <Input
              value={bridgeInput}
              onChange={e => { setBridgeInput(e.target.value); setBridgeStatus("idle"); }}
              placeholder="اختياري — http://192.168.x.x:3001"
              className="font-mono text-sm"
              dir="ltr"
            />
            <Button variant="outline" size="sm" onClick={testBridge} disabled={bridgeStatus === "testing"}>
              {bridgeStatus === "testing" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
              <span className="mr-1">اختبار</span>
            </Button>
          </div>
          {bridgeStatus === "online" && (
            <div className="flex items-center gap-2 text-xs text-success">
              <span className="h-2 w-2 rounded-full bg-success" />
              الجسر يعمل وجاهز
            </div>
          )}
          {bridgeStatus === "offline" && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <WifiOff className="h-3.5 w-3.5" />
              تعذر الوصول — {bridgeError}
            </div>
          )}
        </section>

        {/* Step 2 — Branch */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" /> الفرع التابع له هذا الجهاز
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            هذا التحديد يضمن أن الطلبات والطابعات لن تختلط مع فروع أخرى.
          </p>
          <Select value={branchId} onValueChange={(v) => { setBranchId(v); setTerminalId(""); }}>
            <SelectTrigger>
              <SelectValue placeholder={loading ? "جاري التحميل..." : "اختر الفرع"} />
            </SelectTrigger>
            <SelectContent>
              {branches.map(b => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {branches.length === 0 && !loading && (
            <p className="text-xs text-warning">
              {loadError || "لا يوجد فروع نشطة."}{" "}
              <Link to="/settings?section=branches" className="underline">إدارة الفروع</Link>
              {" · "}
              <button type="button" onClick={loadOptions} className="underline text-primary">إعادة المحاولة</button>
            </p>
          )}
        </section>

        {/* Step 3 — Terminal */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Boxes className="h-4 w-4" /> محطة POS / Terminal
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            محطة الكاشير المخصصة لهذا الجهاز. إذا اخترت محطة غير مرتبطة بفرع، سيتم ربطها تلقائياً بالفرع المحدد أعلاه.
          </p>
          <Select value={terminalId} onValueChange={setTerminalId} disabled={!branchId}>
            <SelectTrigger>
              <SelectValue placeholder={branchId ? "اختر المحطة" : "اختر الفرع أولاً"} />
            </SelectTrigger>
            <SelectContent>
              {filteredTerminals.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}{!t.branch_id && " — (غير مربوطة بفرع)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        {/* Step 4 — Optional label */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-bold">4</span>
            <h2 className="text-sm font-semibold text-foreground">اسم تعريفي للجهاز (اختياري)</h2>
          </div>
          <Input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="مثال: كاشير 1 — رام الله بلازا"
          />
        </section>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button onClick={handleSave} className="flex-1 gap-2">
            <Save className="h-4 w-4" /> حفظ والمتابعة إلى نقطة البيع
          </Button>
          <Button variant="outline" onClick={() => navigate("/printer-settings")} className="gap-2">
            <Link2 className="h-4 w-4" /> إدارة الطابعات
          </Button>
          <Button variant="ghost" onClick={handleClear} className="gap-2 text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" /> مسح إعدادات الجهاز
          </Button>
        </div>

        <div className="rounded-lg border border-warning/40 bg-warning/15 p-3 text-xs text-foreground dark:text-warning">
          ℹ️ هذه الإعدادات تُحفظ في هذا الجهاز فقط. أي جهاز جديد سيحتاج لإعداد منفصل من نفس الشاشة.
        </div>
      </div>
    </div>
  );
}