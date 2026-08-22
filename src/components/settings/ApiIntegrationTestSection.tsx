import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  FlaskConical, Play, Zap, Loader2, CheckCircle2, XCircle, Clock,
  FileDown, FileJson, Eye, EyeOff,
} from "lucide-react";
import { SettingsSection } from "./shell/SettingsSection";
import {
  mobileApiBaseUrl, buildDeveloperGuide, buildPostmanCollection, downloadTextFile,
} from "@/lib/mobile-api-docs";

type StepStatus = "pending" | "running" | "ok" | "fail";

interface TestStep {
  id: string;
  name: string;
  status: StepStatus;
  ms?: number;
  detail?: string;
  response?: unknown;
}

const KEY_STORAGE = "mobileApiTestKey";

const INITIAL_STEPS: TestStep[] = [
  { id: "auth", name: "فحص الاتصال والمفتاح (جلب الفروع)", status: "pending" },
  { id: "dryrun", name: "فحص التحقق من طلبية (بدون حفظ)", status: "pending" },
  { id: "create", name: "إرسال طلبية تجريبية حقيقية", status: "pending" },
  { id: "poll", name: "فحص متابعة حالة الطلبية", status: "pending" },
  { id: "cancel", name: "إلغاء الطلبية التجريبية (تنظيف)", status: "pending" },
];

const ApiIntegrationTestSection = () => {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem(KEY_STORAGE) || "");
  const [showKey, setShowKey] = useState(false);
  const [running, setRunning] = useState<"quick" | "full" | null>(null);
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [ranAt, setRanAt] = useState<Date | null>(null);

  useEffect(() => {
    sessionStorage.setItem(KEY_STORAGE, apiKey);
  }, [apiKey]);

  const patchStep = (id: string, patch: Partial<TestStep>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const callApi = async (method: string, path: string, body?: unknown) => {
    const started = performance.now();
    const res = await fetch(`${mobileApiBaseUrl()}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "x-api-key": apiKey.trim() },
      body: body ? JSON.stringify(body) : undefined,
    });
    const ms = Math.round(performance.now() - started);
    let json: any = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    return { http: res.status, ms, json };
  };

  const runTests = async (mode: "quick" | "full") => {
    if (!apiKey.trim()) {
      toast.error("أدخل مفتاح API أولاً");
      return;
    }
    setRunning(mode);
    const active = mode === "quick" ? INITIAL_STEPS.slice(0, 2) : INITIAL_STEPS;
    setSteps(active.map((s) => ({ ...s, status: "pending", ms: undefined, detail: undefined, response: undefined })));

    let branchId: string | null = null;
    let branchName = "";
    const ref = `TEST-${Date.now()}`;

    // 1) Auth + branches
    patchStep("auth", { status: "running" });
    try {
      const r = await callApi("GET", "/branches");
      if (r.http === 200 && r.json?.ok && Array.isArray(r.json.branches) && r.json.branches.length > 0) {
        branchId = r.json.branches[0].id;
        branchName = r.json.branches[0].name;
        patchStep("auth", {
          status: "ok", ms: r.ms, response: r.json,
          detail: `المفتاح صالح — ${r.json.branches.length} فرع فعّال (سنختبر على: ${branchName})`,
        });
      } else {
        patchStep("auth", {
          status: "fail", ms: r.ms, response: r.json,
          detail: r.http === 401
            ? "المفتاح غير صالح أو موقوف"
            : r.json?.branches?.length === 0
              ? "لا توجد فروع فعّالة لهذه الشركة"
              : `استجابة غير متوقعة (HTTP ${r.http})`,
        });
        setRunning(null);
        setRanAt(new Date());
        return;
      }
    } catch (e) {
      patchStep("auth", { status: "fail", detail: `تعذر الاتصال بالخادم: ${String(e)}` });
      setRunning(null);
      setRanAt(new Date());
      return;
    }

    const orderPayload = {
      client_reference_id: ref,
      branch_id: branchId,
      customer_name: "فحص تكامل (تجريبي)",
      delivery_type: "takeaway",
      payment_method: "cash",
      items: [{ name: "صنف فحص تكامل", qty: 1, unit_price: 1 }],
      order_note: "طلبية فحص تلقائية من شاشة اختبار التكامل — تُلغى تلقائياً",
    };

    // 2) Dry-run validation
    patchStep("dryrun", { status: "running" });
    const dry = await callApi("POST", "/orders?dry_run=1", orderPayload);
    if (dry.http === 200 && dry.json?.ok && dry.json?.dry_run) {
      patchStep("dryrun", {
        status: "ok", ms: dry.ms, response: dry.json,
        detail: `الطلبية صالحة — الإجمالي المحسوب: ${dry.json.total} ₪ على فرع ${dry.json.branch_name}`,
      });
    } else {
      patchStep("dryrun", {
        status: "fail", ms: dry.ms, response: dry.json,
        detail: dry.json?.message || dry.json?.error || `فشل التحقق (HTTP ${dry.http})`,
      });
      setRunning(null);
      setRanAt(new Date());
      return;
    }

    if (mode === "quick") {
      setRunning(null);
      setRanAt(new Date());
      toast.success("الفحص السريع نجح — الربط سليم");
      return;
    }

    // 3) Real order
    patchStep("create", { status: "running" });
    const created = await callApi("POST", "/orders", orderPayload);
    if (created.http === 201 && created.json?.ok) {
      patchStep("create", {
        status: "ok", ms: created.ms, response: created.json,
        detail: `أُنشئت الطلبية ${ref} وظهرت على شاشة الكاشير في ${created.json.branch_name}`,
      });
    } else {
      patchStep("create", {
        status: "fail", ms: created.ms, response: created.json,
        detail: created.json?.message || created.json?.error || `فشل الإنشاء (HTTP ${created.http})`,
      });
      setRunning(null);
      setRanAt(new Date());
      return;
    }

    // 4) Poll status
    patchStep("poll", { status: "running" });
    const polled = await callApi("GET", `/orders/${encodeURIComponent(ref)}`);
    if (polled.http === 200 && polled.json?.ok && polled.json?.status) {
      patchStep("poll", {
        status: "ok", ms: polled.ms, response: polled.json,
        detail: `المتابعة تعمل — الحالة الحالية: ${polled.json.status}`,
      });
    } else {
      patchStep("poll", {
        status: "fail", ms: polled.ms, response: polled.json,
        detail: polled.json?.message || `فشلت المتابعة (HTTP ${polled.http})`,
      });
    }

    // 5) Cleanup — cancel the test order
    patchStep("cancel", { status: "running" });
    const cancelled = await callApi("DELETE", `/orders/${encodeURIComponent(ref)}`, { reason: "تنظيف فحص تكامل تلقائي" });
    if (cancelled.http === 200 && cancelled.json?.ok) {
      patchStep("cancel", {
        status: "ok", ms: cancelled.ms, response: cancelled.json,
        detail: "أُلغيت الطلبية التجريبية — لم يبقَ أي أثر على شاشة الكاشير",
      });
    } else {
      patchStep("cancel", {
        status: "fail", ms: cancelled.ms, response: cancelled.json,
        detail: cancelled.json?.status === "accepted"
          ? "الكاشير قبل الطلبية قبل الإلغاء — احذف الفاتورة يدوياً إن لزم"
          : cancelled.json?.message || `فشل الإلغاء (HTTP ${cancelled.http})`,
      });
    }

    setRunning(null);
    setRanAt(new Date());
    const failed = steps.some((s) => s.status === "fail");
    if (!failed) toast.success("الفحص الكامل نجح — التكامل يعمل من البداية للنهاية");
  };

  const okCount = steps.filter((s) => s.status === "ok").length;
  const failCount = steps.filter((s) => s.status === "fail").length;

  return (
    <SettingsSection
      title="🧪 فحص واختبار التكامل مع التطبيق"
      description="تأكد أن مفتاح API والربط يعملون قبل تسليم الملف للمبرمج — فحص سريع بدون حفظ، أو فحص كامل بطلبية تجريبية تُلغى تلقائياً"
    >
      <div className="space-y-4">
        {/* Key input */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 sm:max-w-md">
            <Input
              dir="ltr"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="umo_live_... — الصق المفتاح هنا"
              className="font-mono text-xs pl-9"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title={showKey ? "إخفاء" : "إظهار"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button
            variant="outline"
            onClick={() => void runTests("quick")}
            disabled={running !== null}
            className="gap-1.5"
          >
            {running === "quick" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            فحص سريع
          </Button>
          <Button
            onClick={() => void runTests("full")}
            disabled={running !== null}
            className="gap-1.5"
          >
            {running === "full" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            فحص كامل (طلبية تجريبية)
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          الفحص السريع لا يحفظ أي شيء. الفحص الكامل ينشئ طلبية تجريبية تظهر لحظياً على شاشة الكاشير ثم تُلغى تلقائياً — يُفضّل تشغيله والكاشير بعيد عن الشاشة.
        </p>

        {/* Results */}
        {steps.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
              <div className="flex items-center gap-2 text-xs font-bold">
                <FlaskConical className="h-3.5 w-3.5" />
                نتائج الفحص
                {ranAt && <span className="text-muted-foreground font-normal">({ranAt.toLocaleTimeString("ar-PS")})</span>}
              </div>
              {running === null && (
                <div className="flex gap-1.5">
                  <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400">{okCount} ناجح</Badge>
                  {failCount > 0 && (
                    <Badge variant="outline" className="text-[10px] border-red-500/40 text-red-600">{failCount} فاشل</Badge>
                  )}
                </div>
              )}
            </div>
            <div className="divide-y divide-border">
              {steps.map((s) => (
                <div key={s.id} className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {s.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
                    {s.status === "ok" && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
                    {s.status === "fail" && <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                    {s.status === "pending" && <Clock className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
                    <span className={`text-sm font-semibold ${s.status === "pending" ? "text-muted-foreground/60" : ""}`}>
                      {s.name}
                    </span>
                    {typeof s.ms === "number" && (
                      <span dir="ltr" className="text-[10px] font-mono text-muted-foreground mr-auto">{s.ms}ms</span>
                    )}
                  </div>
                  {s.detail && (
                    <p className={`text-xs mt-1 mr-6 ${s.status === "fail" ? "text-red-600" : "text-muted-foreground"}`}>
                      {s.detail}
                    </p>
                  )}
                  {s.response != null && (
                    <details className="mt-1 mr-6">
                      <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
                        عرض الرد الخام
                      </summary>
                      <pre dir="ltr" className="mt-1 text-[10px] font-mono bg-muted/50 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto text-left">
                        {JSON.stringify(s.response, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Developer handoff files */}
        <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
          <div className="text-xs font-bold">📦 ملفات التسليم للمبرمج</div>
          <p className="text-[11px] text-muted-foreground">
            ملف الدليل يتضمن Base URL{apiKey.trim() ? " والمفتاح المدخل أعلاه" : ""} وكل المسارات مع أمثلة. مجموعة Postman جاهزة للاستيراد والتجربة الفورية.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                downloadTextFile("mobile-orders-api-guide.md", buildDeveloperGuide(apiKey.trim() || undefined));
                toast.success("تم تحميل دليل المبرمج");
              }}
            >
              <FileDown className="h-3.5 w-3.5" />
              دليل الربط (Markdown)
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                downloadTextFile(
                  "mobile-orders-api.postman_collection.json",
                  buildPostmanCollection(apiKey.trim() || undefined),
                  "application/json",
                );
                toast.success("تم تحميل مجموعة Postman");
              }}
            >
              <FileJson className="h-3.5 w-3.5" />
              مجموعة Postman
            </Button>
          </div>
          {apiKey.trim() && (
            <p className="text-[10px] text-amber-600 dark:text-amber-500">
              ⚠️ المفتاح المدخل حالياً سيُضمَّن داخل الملفات — سلّمها للمبرمج الموثوق فقط ولا ترفعها على مكان عام.
            </p>
          )}
        </div>
      </div>
    </SettingsSection>
  );
};

export default ApiIntegrationTestSection;
