import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Monitor, Wifi, WifiOff, Building2, Boxes, Save, TestTube, RefreshCw,
  Link2, Trash2, CheckCircle2, ChevronRight, ChevronLeft, Sparkles, Printer, Rocket, Plus,
} from "lucide-react";
import BackButton from "@/components/BackButton";
import {
  getDeviceConfig, setBridgeUrl, setDeviceBranchId, setDeviceTerminalId,
  setDeviceLabel, clearDeviceConfig, normalizeBridgeUrl, isDeviceFullyConfigured,
} from "@/lib/device-config";
import { getLocalNetworkBlockedMessage, withLocalNetworkAccess } from "@/lib/local-network-fetch";

interface Branch { id: string; name: string; is_active: boolean; user_id?: string; }
interface Terminal { id: string; name: string; branch_id: string | null; user_id?: string; is_active?: boolean; }

type StepId = "welcome" | "label" | "branch" | "terminal" | "bridge" | "review";
const STEPS: { id: StepId; title: string; icon: any }[] = [
  { id: "welcome",  title: "ابدأ الإعداد",   icon: Sparkles },
  { id: "label",    title: "اسم الجهاز",     icon: Monitor },
  { id: "branch",   title: "الفرع",          icon: Building2 },
  { id: "terminal", title: "محطة POS",       icon: Boxes },
  { id: "bridge",   title: "الطابعة",        icon: Printer },
  { id: "review",   title: "إنهاء",          icon: Rocket },
];

interface DeviceSetupPageProps {
  /**
   * "advanced" (default) → الواجهة القديمة الكاملة (تستخدمها /device-setup)،
   * مع Banner علوي يوجّه المستخدم للمعالج الجديد.
   * "wizard" → نفس المكوّن لكن مثبّت على وضع المعالج التدريجي
   *   (تستخدمه /onboarding/new-device).
   */
  variant?: "advanced" | "wizard";
}

export default function DeviceSetupPage({ variant = "advanced" }: DeviceSetupPageProps = {}) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const initial = getDeviceConfig();
  // Restore in-progress wizard draft so navigating away (e.g. to printer
  // settings) and coming back doesn't wipe the user's selections.
  const draft = (() => {
    try { return JSON.parse(localStorage.getItem("device-setup-draft") || "{}"); }
    catch { return {}; }
  })();
  const [bridgeInput, setBridgeInput] = useState(draft.bridgeUrl ?? initial.bridgeUrl);
  const [branchId, setBranchId] = useState(draft.branchId ?? initial.branchId);
  const [terminalId, setTerminalId] = useState(draft.terminalId ?? initial.terminalId);
  const [label, setLabel] = useState(draft.label ?? initial.label);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [bridgeStatus, setBridgeStatus] = useState<"idle" | "testing" | "online" | "offline">("idle");
  const [bridgeError, setBridgeError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [stepIdx, setStepIdx] = useState<number>(
    typeof draft.stepIdx === "number" ? draft.stepIdx : (isDeviceFullyConfigured() ? 1 : 0)
  );
  const [saving, setSaving] = useState(false);
  // Backward-compat: existing configured devices see a compact "manage" view
  // by default. They can opt into the wizard manually. New devices go straight
  // to the wizard from welcome.
  const [forceWizard, setForceWizard] = useState(variant === "wizard");
  const showWizard = variant === "wizard" || !isDeviceFullyConfigured() || forceWizard;
  // Inline create-terminal state
  const [showCreateTerminal, setShowCreateTerminal] = useState(false);
  const [newTerminalName, setNewTerminalName] = useState("نقطة بيع 1");
  const [creatingTerminal, setCreatingTerminal] = useState(false);

  // Inline create-branch state
  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("الفرع الرئيسي");
  const [creatingBranch, setCreatingBranch] = useState(false);

  const createBranchInline = async () => {
    if (!user) { toast.error("لا توجد جلسة"); return; }
    const trimmed = newBranchName.trim();
    if (!trimmed) { toast.error("أدخل اسم الفرع"); return; }
    setCreatingBranch(true);
    try {
      const { data: ownerIdRaw } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
      const ownerId = (ownerIdRaw as string | null) || user.id;
      const { data: created, error } = await supabase
        .from("branches")
        .insert({
          name: trimmed,
          user_id: ownerId,
          latitude: 0,
          longitude: 0,
          is_active: true,
        } as any)
        .select("id, name, is_active, user_id")
        .single();
      if (error || !created) {
        toast.error("فشل إنشاء الفرع: " + (error?.message || "خطأ غير معروف"));
        return;
      }
      setBranches(prev => [...prev, created as Branch]);
      setBranchId((created as any).id);
      setTerminalId("");
      setShowCreateBranch(false);
      setLoadError("");
      toast.success(`✅ تم إنشاء "${trimmed}" واختياره`);
    } finally { setCreatingBranch(false); }
  };

  const createTerminalInline = async () => {
    if (!user) { toast.error("لا توجد جلسة"); return; }
    if (!branchId) { toast.error("اختر الفرع أولاً"); return; }
    const trimmed = newTerminalName.trim();
    if (!trimmed) { toast.error("أدخل اسم المحطة"); return; }
    setCreatingTerminal(true);
    try {
      // Resolve owner + POS company (pos_terminals.company_id → pos_companies.id, NOT profiles.company_id).
      const { data: ownerIdRaw } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
      const ownerId = (ownerIdRaw as string | null) || user.id;
      // Find or create the pos_companies row for this owner.
      let posCompanyId: string | null = null;
      const { data: existingCo } = await supabase
        .from("pos_companies").select("id").eq("user_id", ownerId).maybeSingle();
      if (existingCo?.id) {
        posCompanyId = existingCo.id;
      } else {
        const { data: newCo, error: coErr } = await supabase
          .from("pos_companies")
          .insert({ user_id: ownerId, name: "شركتي", currency_code: "ILS", is_active: true } as any)
          .select("id").single();
        if (coErr || !newCo) {
          toast.error("تعذر تجهيز شركة الـ POS: " + (coErr?.message || "خطأ"));
          return;
        }
        posCompanyId = newCo.id;
      }
      const { data: created, error } = await supabase
        .from("pos_terminals")
        .insert({
          name: trimmed,
          branch_id: branchId,
          user_id: ownerId,
          company_id: posCompanyId,
          is_active: true,
        } as any)
        .select("id, name, branch_id, user_id, is_active")
        .single();
      if (error || !created) {
        toast.error("فشل إنشاء المحطة: " + (error?.message || "خطأ غير معروف"));
        return;
      }
      setTerminals(prev => [...prev, created as Terminal]);
      setTerminalId((created as any).id);
      setShowCreateTerminal(false);
      toast.success(`✅ تم إنشاء "${trimmed}" واختيارها`);
    } finally { setCreatingTerminal(false); }
  };

  useEffect(() => { if (!authLoading) void loadOptions(); }, [user?.id, authLoading]);

  const loadOptions = async () => {
    if (authLoading) return;
    setLoading(true); setLoadError("");
    if (!user) {
      setLoadError("لا توجد جلسة دخول نشطة. سجّل الدخول ثم أعد المحاولة.");
      setBranches([]); setTerminals([]); setLoading(false); return;
    }
    const timeout = new Promise<"timeout">(r => setTimeout(() => r("timeout"), 6000));
    try {
      const { data: ownerIdRaw } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
      const ownerId = (ownerIdRaw as string | null) || user.id;
      const fetchAll = Promise.all([
        supabase.from("branches").select("id, name, is_active, user_id").eq("is_active", true).eq("user_id", ownerId).order("name"),
        supabase.from("pos_terminals").select("id, name, branch_id, user_id, is_active").eq("is_active", true).eq("user_id", ownerId).order("name"),
      ]);
      const result = await Promise.race([fetchAll, timeout]);
      if (result === "timeout") {
        setLoadError("تعذّر تحميل الفروع/المحطات خلال المهلة. أعد المحاولة.");
        setBranches([]); setTerminals([]);
      } else {
        const [branchesRes, terminalsRes] = result;
        if (branchesRes.error) setLoadError("فشل جلب الفروع: " + branchesRes.error.message);
        if (terminalsRes.error) setLoadError(prev => prev || "فشل جلب المحطات: " + terminalsRes.error.message);
        const nextBranches = (branchesRes.data as Branch[]) || [];
        setBranches(nextBranches);
        setTerminals((terminalsRes.data as Terminal[]) || []);
        if (!branchesRes.error && nextBranches.length === 0) {
          setLoadError("لا توجد فروع نشطة للحساب الحالي.");
        }
      }
    } catch {
      toast.error("فشل تحميل البيانات. تحقق من الاتصال.");
      setBranches([]); setTerminals([]);
    } finally { setLoading(false); }
  };

  const filteredTerminals = useMemo(() => {
    if (!branchId) return terminals.filter(t => !t.branch_id);
    return terminals.filter(t => t.branch_id === branchId || !t.branch_id);
  }, [terminals, branchId]);

  const testBridge = async () => {
    const url = normalizeBridgeUrl(bridgeInput);
    if (!url) { toast.error("أدخل عنوان Print Bridge أو اسم طابعة Windows"); return; }
    setBridgeStatus("testing"); setBridgeError("");
    try {
      const res = await fetch(`${url}/health`, withLocalNetworkAccess({ signal: AbortSignal.timeout(5000) }));
      if (res.ok) { setBridgeStatus("online"); toast.success("✅ Print Bridge متصل وجاهز"); }
      else { setBridgeStatus("offline"); setBridgeError(`الخادم رد بحالة ${res.status}`); }
    } catch (err: any) {
      setBridgeStatus("offline");
      setBridgeError(err?.message || getLocalNetworkBlockedMessage());
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const normalized = normalizeBridgeUrl(bridgeInput);
      if (!branchId) { toast.error("اختر الفرع"); setStepIdx(2); return; }
      if (!terminalId) { toast.error("اختر محطة POS"); setStepIdx(3); return; }
      const term = terminals.find(t => t.id === terminalId);
      if (term && !term.branch_id) {
        const { error } = await supabase.from("pos_terminals").update({ branch_id: branchId } as any).eq("id", terminalId);
        if (error) { toast.error("تعذر ربط المحطة بالفرع: " + error.message); return; }
      }
      setBridgeUrl(normalized);
      setDeviceBranchId(branchId);
      setDeviceTerminalId(terminalId);
      setDeviceLabel(label.trim());
      try { localStorage.removeItem("device-setup-draft"); } catch {}
      toast.success("🎉 جاهز! تم تجهيز الجهاز بنجاح");
      setTimeout(() => navigate("/pos"), 700);
    } finally { setSaving(false); }
  };

  const handleClear = () => {
    if (!confirm("سيتم مسح إعدادات هذا الجهاز فقط. هل تريد المتابعة؟")) return;
    clearDeviceConfig();
    setBridgeInput(""); setBranchId(""); setTerminalId(""); setLabel("");
    setBridgeStatus("idle"); setStepIdx(0);
    try { localStorage.removeItem("device-setup-draft"); } catch {}
    toast.success("تم مسح إعدادات هذا الجهاز");
  };

  // Validation per step → controls "Next"
  const canNext = (() => {
    const id = STEPS[stepIdx].id;
    if (id === "branch") return !!branchId;
    if (id === "terminal") return !!terminalId;
    return true;
  })();

  const next = () => setStepIdx(i => Math.min(STEPS.length - 1, i + 1));
  const prev = () => setStepIdx(i => Math.max(0, i - 1));

  // Persist wizard draft so leaving the page (e.g. to /printer-settings)
  // and returning resumes from the same step with the same selections.
  useEffect(() => {
    try {
      localStorage.setItem("device-setup-draft", JSON.stringify({
        bridgeUrl: bridgeInput, branchId, terminalId, label, stepIdx,
      }));
    } catch { /* ignore quota */ }
  }, [bridgeInput, branchId, terminalId, label, stepIdx]);

  const currentStep = STEPS[stepIdx];

  // ───────────────────────────────────────────────────────────
  // Manage view — shown to ALREADY-configured devices so existing
  // customers (Malaky, Sufyan, …) never see the wizard by accident.
  // ───────────────────────────────────────────────────────────
  if (!showWizard) {
    const branchName = branches.find(b => b.id === branchId)?.name || branchId || "—";
    const terminalName = terminals.find(t => t.id === terminalId)?.name || terminalId || "—";
    return (
      <div className="min-h-full bg-background pb-24" dir="rtl">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
          <div className="flex items-center gap-3">
            <BackButton />
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Monitor className="h-6 w-6" /> إعدادات الجهاز المتقدمة
              </h1>
              <p className="text-sm text-muted-foreground">
                للدعم الفني فقط — لإعداد جهاز جديد استخدم المعالج
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success border border-success/30 px-2.5 py-1 text-xs font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> جاهز
            </span>
          </div>

          {/* Banner: redirect normal users to the new wizard */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">
                لإعداد جهاز كاشير جديد استخدم معالج تجهيز الجهاز
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                المعالج الجديد يأخذك خطوة بخطوة لربط الفرع، المحطة، والطابعات.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => navigate("/onboarding/new-device")}
              className="gap-1 shrink-0"
            >
              <Rocket className="h-4 w-4" /> فتح المعالج
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            <Row label="اسم الجهاز" value={label || "—"} icon={Monitor} />
            <Row label="الفرع" value={branchName} icon={Building2} ok />
            <Row label="محطة POS" value={terminalName} icon={Boxes} ok />
            <Row
              label="Print Bridge"
              value={bridgeInput || "غير محدد"}
              icon={bridgeInput ? Wifi : WifiOff}
              ok={!!bridgeInput}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate("/pos")} className="gap-2 flex-1 min-w-[180px]">
              <Rocket className="h-4 w-4" /> الانتقال إلى نقطة البيع
            </Button>
            <Button variant="outline" onClick={testBridge} disabled={!bridgeInput || bridgeStatus === "testing"} className="gap-2">
              {bridgeStatus === "testing" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
              اختبار الطابعة
            </Button>
            <Button variant="outline" onClick={() => navigate("/printer-settings")} className="gap-2">
              <Link2 className="h-4 w-4" /> إدارة الطابعات
            </Button>
          </div>

          {bridgeStatus === "online" && (
            <div className="flex items-center gap-2 text-sm text-success bg-success/10 border border-success/30 rounded-md px-3 py-2">
              <CheckCircle2 className="h-4 w-4" /> ✅ Print Bridge متصل
            </div>
          )}
          {bridgeStatus === "offline" && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
              <WifiOff className="h-4 w-4" /> ❌ {bridgeError}
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
            <div className="text-sm font-medium text-foreground">تحتاج تغيير الإعدادات؟</div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              إذا انتقل الجهاز إلى فرع آخر أو تغيّرت الطابعة، يمكنك إعادة تشغيل معالج
              الإعداد كاملاً. الإعدادات الحالية ستبقى محفوظة حتى تحفظ الجديدة.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => { setForceWizard(true); setStepIdx(1); }} className="gap-1">
                <Sparkles className="h-3.5 w-3.5" /> إعادة تشغيل المعالج
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1 text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> مسح إعدادات الجهاز
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background pb-24" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Top bar */}
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Monitor className="h-6 w-6" /> تجهيز جهاز نقطة البيع
            </h1>
            <p className="text-sm text-muted-foreground">معالج إعداد سريع — أقل من 5 دقائق</p>
          </div>
          {variant === "wizard" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/device-setup")}
              className="gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
              title="للدعم الفني فقط"
            >
              <Link2 className="h-3.5 w-3.5" /> فتح الإعدادات المتقدمة
            </Button>
          )}
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-between gap-1 px-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < stepIdx;
            const active = i === stepIdx;
            return (
              <div key={s.id} className="flex-1 flex items-center">
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <div
                    className={[
                      "h-9 w-9 rounded-full flex items-center justify-center border-2 transition-all",
                      active ? "bg-primary border-primary text-primary-foreground scale-110 shadow-md" :
                      done ? "bg-success border-success text-white" :
                      "bg-card border-border text-muted-foreground",
                    ].join(" ")}
                  >
                    {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className={`text-[10px] font-medium ${active ? "text-primary" : done ? "text-success" : "text-muted-foreground"}`}>
                    {s.title}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-5 transition-all ${i < stepIdx ? "bg-success" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="rounded-xl border border-border bg-card p-6 min-h-[320px] flex flex-col">
          <div className="flex-1 space-y-4">
            {currentStep.id === "welcome" && (
              <div className="text-center space-y-4 py-6">
                <div className="mx-auto h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-10 w-10 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">مرحباً 👋</h2>
                <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
                  خلينا نجهّز هذا الجهاز كنقطة بيع. سنمر بـ 5 خطوات بسيطة لربط الجهاز
                  بالفرع، تحديد محطة الكاشير، وإعداد الطابعة.
                </p>
                <div className="grid grid-cols-3 gap-3 max-w-md mx-auto pt-4 text-xs">
                  {[
                    { icon: Building2, label: "الفرع" },
                    { icon: Boxes, label: "المحطة" },
                    { icon: Printer, label: "الطابعة" },
                  ].map(({ icon: I, label }) => (
                    <div key={label} className="rounded-lg border border-border p-3 flex flex-col items-center gap-1">
                      <I className="h-5 w-5 text-primary" />
                      <span className="text-foreground font-medium">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentStep.id === "label" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2"><Monitor className="h-5 w-5 text-primary" /> اسم تعريفي للجهاز</h2>
                <p className="text-sm text-muted-foreground">اختياري — يساعدك تميز الجهاز لاحقاً (مثل: كاشير 1، مطبخ بيتزا).</p>
                <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="مثال: كاشير 1 — رام الله بلازا" autoFocus />
              </div>
            )}

            {currentStep.id === "branch" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> اختر الفرع</h2>
                <p className="text-sm text-muted-foreground">الفرع الذي يقع فيه هذا الجهاز فعلياً. لن تختلط طلباته مع باقي الفروع.</p>
                {branches.length > 0 && (
                  <Select value={branchId} onValueChange={(v) => { setBranchId(v); setTerminalId(""); }}>
                    <SelectTrigger className="h-12 text-base">
                      <SelectValue placeholder={loading ? "جاري التحميل..." : "اختر الفرع"} />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}

                {branches.length === 0 && !loading && (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center space-y-2">
                    <Building2 className="h-6 w-6 mx-auto text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">لا توجد فروع بعد</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      أنشئ الفرع الرئيسي الآن من هنا مباشرة دون مغادرة المعالج. تقدر تضيف فروع إضافية لاحقاً من الإعدادات.
                    </p>
                  </div>
                )}

                {!showCreateBranch && (
                  <button
                    type="button"
                    onClick={() => { setShowCreateBranch(true); setNewBranchName(branches.length === 0 ? "الفرع الرئيسي" : `فرع ${branches.length + 1}`); }}
                    className="w-full inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary text-sm font-medium py-2.5 transition-colors"
                  >
                    <Plus className="h-4 w-4" /> إنشاء فرع جديد
                  </button>
                )}

                {showCreateBranch && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                    <label className="text-xs font-medium text-foreground">اسم الفرع الجديد</label>
                    <Input
                      value={newBranchName}
                      onChange={e => setNewBranchName(e.target.value)}
                      placeholder="مثال: الفرع الرئيسي"
                      autoFocus
                      onKeyDown={e => { if (e.key === "Enter") void createBranchInline(); }}
                    />
                    <div className="flex gap-2">
                      <Button onClick={createBranchInline} disabled={creatingBranch} size="sm" className="gap-1 flex-1">
                        {creatingBranch ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        إنشاء وتحديد
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowCreateBranch(false)}>إلغاء</Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      يمكنك ضبط الموقع الجغرافي والعنوان لاحقاً من <Link to="/settings?section=branches" className="underline">إدارة الفروع</Link>.
                    </p>
                  </div>
                )}

                {loadError && branches.length > 0 && (
                  <p className="text-xs text-warning">
                    {loadError}{" · "}
                    <button type="button" onClick={loadOptions} className="underline text-primary">إعادة المحاولة</button>
                  </p>
                )}
              </div>
            )}

            {currentStep.id === "terminal" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2"><Boxes className="h-5 w-5 text-primary" /> اختر محطة الـ POS</h2>
                <p className="text-sm text-muted-foreground">
                  محطة الكاشير المخصصة لهذا الجهاز. إذا اخترت محطة غير مرتبطة بفرع، سنربطها تلقائياً بالفرع المحدد.
                </p>
                <Select value={terminalId} onValueChange={setTerminalId} disabled={!branchId}>
                  <SelectTrigger className="h-12 text-base">
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
                {filteredTerminals.length === 0 && branchId && (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center space-y-2">
                    <Boxes className="h-6 w-6 mx-auto text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">لا توجد محطات لهذا الفرع بعد</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      المحطة هي خط البيع داخل الفرع (مثال: كاشير 1، كاشير الديليفري). أنشئ محطة الآن من هنا
                      مباشرة دون مغادرة المعالج.
                    </p>
                  </div>
                )}
                {branchId && !showCreateTerminal && (
                  <button
                    type="button"
                    onClick={() => { setShowCreateTerminal(true); setNewTerminalName(`نقطة بيع ${filteredTerminals.length + 1}`); }}
                    className="w-full inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary text-sm font-medium py-2.5 transition-colors"
                  >
                    <Plus className="h-4 w-4" /> إنشاء محطة جديدة
                  </button>
                )}
                {showCreateTerminal && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                    <label className="text-xs font-medium text-foreground">اسم المحطة الجديدة</label>
                    <Input
                      value={newTerminalName}
                      onChange={e => setNewTerminalName(e.target.value)}
                      placeholder="مثال: كاشير 1"
                      autoFocus
                      onKeyDown={e => { if (e.key === "Enter") void createTerminalInline(); }}
                    />
                    <div className="flex gap-2">
                      <Button onClick={createTerminalInline} disabled={creatingTerminal} size="sm" className="gap-1 flex-1">
                        {creatingTerminal ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        إنشاء وتحديد
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowCreateTerminal(false)}>إلغاء</Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      سيتم ربطها تلقائياً بالفرع المحدد، وتفعيل الحسابات الافتراضية (الصندوق 1110، المبيعات 4100).
                    </p>
                  </div>
                )}
              </div>
            )}

            {currentStep.id === "bridge" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2"><Printer className="h-5 w-5 text-primary" /> ربط الطابعة</h2>
                <p className="text-sm text-muted-foreground">
                  أدخل عنوان <strong>Print Bridge</strong> (IP والمنفذ) أو اسم طابعة Windows مشتركة.
                  هذه الخطوة اختيارية — يمكنك تخطيها وإضافتها لاحقاً.
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setBridgeInput("http://127.0.0.1:3001"); setBridgeStatus("idle"); }}
                    className="text-right rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 p-3 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      🔌 طابعة USB
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      موصولة بكابل بنفس الجهاز. ثبّت Print Bridge على هذا الجهاز واستخدم
                      <span className="font-mono" dir="ltr"> http://127.0.0.1:3001</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setBridgeInput("http://192.168.1.65:3001"); setBridgeStatus("idle"); }}
                    className="text-right rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 p-3 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      🌐 طابعة شبكة
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      لها IP على الراوتر. اكتب IP الكمبيوتر اللي عليه Print Bridge مثل
                      <span className="font-mono" dir="ltr"> http://192.168.1.65:3001</span>
                    </div>
                  </button>
                </div>
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-[11px] leading-relaxed text-foreground/80">
                  💡 سواء USB أو شبكة، الطباعة تمر دائماً عبر <strong>Print Bridge</strong> المثبّت على
                  كمبيوتر واحد بالفرع. الطابعات تُكتشف تلقائياً من النظام بعد تثبيت البريدج، فما في داعي
                  لإدخال موديل الطابعة هون.
                </div>
                <div className="flex gap-2">
                  <Input
                    value={bridgeInput}
                    onChange={e => { setBridgeInput(e.target.value); setBridgeStatus("idle"); }}
                    placeholder="http://192.168.x.x:3001"
                    className="font-mono text-sm h-11"
                    dir="ltr"
                  />
                  <Button onClick={testBridge} disabled={bridgeStatus === "testing" || !bridgeInput} className="h-11 gap-1">
                    {bridgeStatus === "testing" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                    اختبار الاتصال
                  </Button>
                </div>
                {bridgeStatus === "online" && (
                  <div className="flex items-center gap-2 text-sm text-success bg-success/10 border border-success/30 rounded-md px-3 py-2">
                    <CheckCircle2 className="h-4 w-4" /> ✅ متصل بنجاح — Print Bridge جاهز
                  </div>
                )}
                {bridgeStatus === "offline" && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                    <WifiOff className="h-4 w-4" /> ❌ فشل الاتصال — {bridgeError}
                  </div>
                )}
                <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                  لم تنزّل Print Bridge بعد؟{" "}
                  <Link to="/printer-settings" className="underline text-primary">شاهد دليل التثبيت</Link>
                </div>
              </div>
            )}

            {currentStep.id === "review" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2"><Rocket className="h-5 w-5 text-primary" /> مراجعة وإنهاء</h2>
                <p className="text-sm text-muted-foreground">تأكد من البيانات قبل الحفظ:</p>
                <div className="rounded-lg border border-border divide-y divide-border bg-background">
                  <Row label="اسم الجهاز" value={label || "—"} icon={Monitor} />
                  <Row label="الفرع" value={branches.find(b => b.id === branchId)?.name || "—"} icon={Building2} ok={!!branchId} />
                  <Row label="محطة POS" value={terminals.find(t => t.id === terminalId)?.name || "—"} icon={Boxes} ok={!!terminalId} />
                  <Row
                    label="Print Bridge"
                    value={bridgeInput || "غير محدد (اختياري)"}
                    icon={bridgeStatus === "online" ? Wifi : WifiOff}
                    ok={bridgeStatus === "online"}
                  />
                </div>
                {(!branchId || !terminalId) && (
                  <p className="text-xs text-destructive">⚠️ يجب تحديد الفرع والمحطة قبل الحفظ.</p>
                )}
              </div>
            )}
          </div>

          {/* Step navigation */}
          <div className="flex items-center justify-between gap-2 pt-6 mt-6 border-t border-border">
            <Button variant="ghost" onClick={prev} disabled={stepIdx === 0} className="gap-1">
              <ChevronRight className="h-4 w-4" /> السابق
            </Button>
            <span className="text-xs text-muted-foreground">
              خطوة {stepIdx + 1} من {STEPS.length}
            </span>
            {stepIdx < STEPS.length - 1 ? (
              <Button onClick={next} disabled={!canNext} className="gap-1">
                {currentStep.id === "welcome" ? "ابدأ الإعداد" : "التالي"}
                <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={saving || !branchId || !terminalId} className="gap-2 bg-success hover:bg-success/90">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                ابدأ البيع
              </Button>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button onClick={handleClear} className="flex items-center gap-1 hover:text-destructive transition-colors">
            <Trash2 className="h-3.5 w-3.5" /> مسح إعدادات هذا الجهاز
          </button>
          <Link to="/printer-settings" className="flex items-center gap-1 hover:text-primary transition-colors">
            <Link2 className="h-3.5 w-3.5" /> إدارة الطابعات والمحطات
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, icon: Icon, ok }: { label: string; value: string; icon: any; ok?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className={`h-4 w-4 ${ok === false ? "text-muted-foreground" : "text-primary"}`} />
      <span className="text-sm text-muted-foreground flex-1">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
      {ok === true && <CheckCircle2 className="h-4 w-4 text-success" />}
    </div>
  );
}
