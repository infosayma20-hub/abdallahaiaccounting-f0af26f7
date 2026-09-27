import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Copy } from "lucide-react";

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mobile-orders-api`;

type TestResult = {
  label: string;
  ok: boolean;
  status: number;
  body: unknown;
  durationMs: number;
};

const SAMPLE_ORDER = `{
  "client_reference_id": "TEST-0001",
  "branch_code": "ضع_كود_الفرع_هنا",
  "customer_name": "زبون تجريبي",
  "customer_phone": "0599000000",
  "delivery_type": "pickup",
  "payment_method": "cash",
  "items": [
    { "name": "صنف تجريبي", "qty": 1, "unit_price": 10 }
  ],
  "order_note": "طلب اختبار من صفحة الفحص — تجاهله"
}`;

export default function ApiTestPage() {
  const [apiKey, setApiKey] = useState("");
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [orderBody, setOrderBody] = useState(SAMPLE_ORDER);
  const [lastRef, setLastRef] = useState("");

  const call = async (label: string, path: string, init?: RequestInit) => {
    setRunning(label);
    const started = performance.now();
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey.trim(),
          ...(init?.headers || {}),
        },
      });
      const body = await res.json().catch(() => null);
      setResults((r) => [
        { label, ok: res.ok, status: res.status, body, durationMs: Math.round(performance.now() - started) },
        ...r,
      ]);
      return body;
    } catch (e) {
      setResults((r) => [
        { label, ok: false, status: 0, body: { error: String(e) }, durationMs: Math.round(performance.now() - started) },
        ...r,
      ]);
      return null;
    } finally {
      setRunning(null);
    }
  };

  const testConnection = () => call("فحص الاتصال + الفروع", "/branches");
  const testCatalog = () => call("سحب المنيو (الكتالوج)", "/catalog?limit=20");
  const testSendOrder = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(orderBody);
    } catch {
      setResults((r) => [{ label: "إرسال طلب تجريبي", ok: false, status: 0, body: { error: "JSON غير صالح" }, durationMs: 0 }, ...r]);
      return;
    }
    const body = await call("إرسال طلب تجريبي", "/orders", { method: "POST", body: JSON.stringify(parsed) });
    const ref = (parsed as { client_reference_id?: string })?.client_reference_id;
    if (body?.ok && ref) setLastRef(ref);
  };
  const testStatus = () => lastRef && call(`الاستعلام عن الطلب (${lastRef})`, `/orders/${encodeURIComponent(lastRef)}`);
  const testCancel = () =>
    lastRef && call(`إلغاء الطلب (${lastRef})`, `/orders/${encodeURIComponent(lastRef)}`, { method: "DELETE", body: JSON.stringify({ reason: "اختبار" }) });

  const keyReady = apiKey.trim().length >= 16;

  return (
    <div dir="rtl" className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">صفحة فحص تكامل Unify API</h1>
          <p className="text-sm text-muted-foreground">
            بيئة اختبار (SIT) — الصق مفتاح الاختبار ونفّذ الفحوصات بالترتيب. مفاتيح الاختبار لا تحفظ أي طلب حقيقي.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">1) مفتاح API</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              dir="ltr"
              placeholder="umo_test_..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type="password"
            />
            <p className="text-xs text-muted-foreground">
              Base URL: <code dir="ltr" className="text-xs">{BASE}</code>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2) الفحوصات</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={testConnection} disabled={!keyReady || !!running}>
              {running === "فحص الاتصال + الفروع" && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              فحص الاتصال + الفروع
            </Button>
            <Button variant="secondary" onClick={testCatalog} disabled={!keyReady || !!running}>
              سحب المنيو
            </Button>
            <Button variant="secondary" onClick={testStatus} disabled={!keyReady || !!running || !lastRef}>
              الاستعلام عن الطلب
            </Button>
            <Button variant="destructive" onClick={testCancel} disabled={!keyReady || !!running || !lastRef}>
              إلغاء الطلب
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">3) طلب تجريبي (JSON)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea dir="ltr" rows={12} value={orderBody} onChange={(e) => setOrderBody(e.target.value)} className="font-mono text-xs" />
            <Button onClick={testSendOrder} disabled={!keyReady || !!running}>
              {running === "إرسال طلب تجريبي" && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              إرسال الطلب
            </Button>
            <p className="text-xs text-muted-foreground">
              غيّر <code>client_reference_id</code> قبل كل إرسال (مثلاً TEST-0002) — النظام يمنع التكرار. استخدم <code>branch_code</code> من نتيجة فحص الفروع.
            </p>
          </CardContent>
        </Card>

        {results.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">النتائج</h2>
            {results.map((r, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between py-3">
                  <div className="flex items-center gap-2">
                    {r.ok ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-destructive" />}
                    <CardTitle className="text-sm">{r.label}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={r.ok ? "default" : "destructive"}>{r.status || "شبكة"}</Badge>
                    <span className="text-xs text-muted-foreground">{r.durationMs}ms</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => navigator.clipboard.writeText(JSON.stringify(r.body, null, 2))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre dir="ltr" className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-left text-xs">
                    {JSON.stringify(r.body, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
