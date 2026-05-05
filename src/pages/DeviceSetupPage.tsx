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
  Link2, Trash2, CheckCircle2, ChevronRight, ChevronLeft, Sparkles, Printer, Rocket,
} from "lucide-react";
import BackButton from "@/components/BackButton";
import {
  getDeviceConfig, setBridgeUrl, setDeviceBranchId, setDeviceTerminalId,
  setDeviceLabel, clearDeviceConfig, normalizeBridgeUrl, isDeviceFullyConfigured,
} from "@/lib/device-config";

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

export default function DeviceSetupPage() {
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
  const [bridgeError, setBridgeError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [stepIdx, setStepIdx] = useState<number>(isDeviceFullyConfigured() ? 1 : 0);
  const [saving, setSaving] = useState(false);
  // Backward-compat: existing configured devices see a compact "manage" view
  // by default. They can opt into the wizard manually. New devices go straight
  // to the wizard from welcome.
  const [forceWizard, setForceWizard] = useState(false);
  const showWizard = !isDeviceFullyConfigured() || forceWizard;

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
      const res = await fetch(`${url}/health`, { mode: "cors", signal: AbortSignal.timeout(5000) });
      if (res.ok) { setBridgeStatus("online"); toast.success("✅ Print Bridge متصل وجاهز"); }
      else { setBridgeStatus("offline"); setBridgeError(`الخادم رد بحالة ${res.status}`); }
    } catch (err: any) {
      setBridgeStatus("offline");
      setBridgeError(err?.message || "تعذر الوصول — تأكد أن الكمبيوتر والطابعة على نفس الشبكة");
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
      toast.success("🎉 جاهز! تم تجهيز الجهاز بنجاح");
      setTimeout(() => navigate("/pos"), 700);
    } finally { setSaving(false); }
  };

  const handleClear = () => {
    if (!confirm("سيتم مسح إعدادات هذا الجهاز فقط. هل تريد المتابعة؟")) return;
    clearDeviceConfig();
    setBridgeInput(""); setBranchId(""); setTerminalId(""); setLabel("");
    setBridgeStatus("idle"); setStepIdx(0);
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

  const currentStep = STEPS[stepIdx];

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
                <Select value={branchId} onValueChange={(v) => { setBranchId(v); setTerminalId(""); }}>
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue placeholder={loading ? "جاري التحميل..." : "اختر الفرع"} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
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
                  <p className="text-xs text-muted-foreground">
                    لا توجد محطات لهذا الفرع.{" "}
                    <Link to="/printer-settings" className="underline text-primary">إنشاء محطة جديدة</Link>
                  </p>
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
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                  💡 تأكد أن الكمبيوتر والطابعة على نفس الشبكة المحلية. أمثلة شائعة:
                  <div className="mt-1 font-mono text-[11px]" dir="ltr">
                    http://192.168.1.65:3001<br/>
                    http://127.0.0.1:3001
                  </div>
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
