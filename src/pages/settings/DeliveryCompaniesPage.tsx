/**
 * /settings/delivery-companies
 *
 * Read-only diagnostic dashboard for delivery integrations (Wheels for now).
 * Lets admins verify connectivity per branch, test address → area resolution,
 * and review recent delivery attempts before going on-site.
 *
 * Does NOT mutate Wheels orders, does NOT change configuration.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, Loader2, RefreshCcw, Copy, CheckCircle2, XCircle, MapPin, PlugZap, Truck } from "lucide-react";
import { toast } from "sonner";

interface BranchRow {
  branch_id: string;
  branch_name: string;
  wheels_branch_id: string;
  secret_name: string;
  is_active: boolean;
  zones_count: number;
  mapped_zones_count: number;
  priced_zones_count: number;
}

interface PingResult {
  success: boolean;
  latency_ms?: number;
  http_status?: number;
  probe_area?: { area_name: string; wheels_area_id: string; wheels_fixed_price: number | null };
  wheels_response?: any;
  error?: string | null;
}

interface RecentOrder {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  customer_address: string | null;
  total: number | null;
  wheels_request_status: string | null;
  wheels_last_error: string | null;
  wheels_sent_at: string | null;
  wheels_delivery_price: number | null;
  delivery_status: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-emerald-500/15 text-emerald-700 border-emerald-300",
  sending: "bg-sky-500/15 text-sky-700 border-sky-300",
  failed: "bg-red-500/15 text-red-700 border-red-300",
};

export default function DeliveryCompaniesPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [pingResults, setPingResults] = useState<Record<string, PingResult | "loading">>({});

  // resolve tester
  const [resolveBranch, setResolveBranch] = useState<string>("");
  const [resolveAddr, setResolveAddr] = useState<string>("");
  const [resolveBusy, setResolveBusy] = useState(false);
  const [resolveResult, setResolveResult] = useState<any>(null);

  // recent orders
  const [recent, setRecent] = useState<RecentOrder[]>([]);

  const loadBranches = useCallback(async () => {
    setLoading(true);
    const { data: cfg, error } = await supabase
      .from("wheels_branch_config")
      .select("branch_id, wheels_branch_id, secret_name, is_active");
    if (error) {
      toast.error("تعذر تحميل إعدادات الفروع");
      setLoading(false);
      return;
    }
    const branchIds = (cfg ?? []).map((c) => c.branch_id);
    const safeIds = branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"];
    const [{ data: brs }, { data: zones }] = await Promise.all([
      supabase.from("branches").select("id, name").in("id", safeIds),
      supabase.from("delivery_zones").select("branch_id, wheels_area_id, wheels_fixed_price").in("branch_id", safeIds),
    ]);
    const brName = new Map((brs ?? []).map((b) => [b.id, b.name]));
    const zoneStats = new Map<string, { total: number; mapped: number; priced: number }>();
    for (const z of zones ?? []) {
      const s = zoneStats.get(z.branch_id) ?? { total: 0, mapped: 0, priced: 0 };
      s.total += 1;
      if (z.wheels_area_id) s.mapped += 1;
      if (z.wheels_fixed_price != null) s.priced += 1;
      zoneStats.set(z.branch_id, s);
    }
    const rows: BranchRow[] = (cfg ?? []).map((c) => ({
      branch_id: c.branch_id,
      branch_name: brName.get(c.branch_id) ?? "—",
      wheels_branch_id: c.wheels_branch_id,
      secret_name: c.secret_name,
      is_active: !!c.is_active,
      zones_count: zoneStats.get(c.branch_id)?.total ?? 0,
      mapped_zones_count: zoneStats.get(c.branch_id)?.mapped ?? 0,
      priced_zones_count: zoneStats.get(c.branch_id)?.priced ?? 0,
    }));
    rows.sort((a, b) => a.branch_name.localeCompare(b.branch_name, "ar"));
    setBranches(rows);
    if (rows.length && !resolveBranch) setResolveBranch(rows[0].branch_id);
    setLoading(false);
  }, [resolveBranch]);

  const loadRecent = useCallback(async () => {
    const { data } = await supabase
      .from("pos_orders")
      .select("id, order_number, customer_name, customer_address, total, wheels_request_status, wheels_last_error, wheels_sent_at, wheels_delivery_price, delivery_status, created_at")
      .in("wheels_request_status", ["sent", "sending", "failed"])
      .order("created_at", { ascending: false })
      .limit(20);
    setRecent((data ?? []) as any);
  }, []);

  useEffect(() => {
    void loadBranches();
    void loadRecent();
  }, [loadBranches, loadRecent]);

  const pingBranch = useCallback(async (branchId: string) => {
    setPingResults((prev) => ({ ...prev, [branchId]: "loading" }));
    try {
      const { data, error } = await supabase.functions.invoke("wheels-test", {
        body: { mode: "ping", branch_id: branchId },
      });
      if (error) throw error;
      setPingResults((prev) => ({ ...prev, [branchId]: data as PingResult }));
    } catch (e) {
      setPingResults((prev) => ({
        ...prev,
        [branchId]: { success: false, error: e instanceof Error ? e.message : String(e) },
      }));
    }
  }, []);

  const pingAll = useCallback(async () => {
    await Promise.all(branches.map((b) => pingBranch(b.branch_id)));
  }, [branches, pingBranch]);

  const runResolve = useCallback(async () => {
    if (!resolveBranch || !resolveAddr.trim()) {
      toast.error("اختر فرع وأدخل عنوان");
      return;
    }
    setResolveBusy(true);
    setResolveResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("wheels-test", {
        body: { mode: "resolve", branch_id: resolveBranch, address: resolveAddr.trim() },
      });
      if (error) throw error;
      setResolveResult(data);
    } catch (e) {
      setResolveResult({ success: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setResolveBusy(false);
    }
  }, [resolveBranch, resolveAddr]);

  const webhookUrl = useMemo(() => {
    const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID || "";
    return projectId ? `https://${projectId}.supabase.co/functions/v1/wheels-webhook` : "";
  }, []);

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt).then(() => toast.success("تم النسخ"));
  };

  return (
    <div className="container mx-auto py-6 max-w-5xl space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowRight className="me-1 h-4 w-4" /> رجوع
          </Button>
          <Truck className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">شركات التوصيل — تشخيص الترابط</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => { void loadBranches(); void loadRecent(); }} disabled={loading}>
          {loading ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <RefreshCcw className="me-1 h-4 w-4" />}
          تحديث
        </Button>
      </div>

      <Tabs defaultValue="branches" className="w-full">
        <TabsList>
          <TabsTrigger value="branches">الفروع ({branches.length})</TabsTrigger>
          <TabsTrigger value="resolve">اختبار العنوان → المنطقة</TabsTrigger>
          <TabsTrigger value="recent">آخر الطلبات ({recent.length})</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
        </TabsList>

        {/* ── Branches tab ───────────────────────── */}
        <TabsContent value="branches" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={pingAll} disabled={!branches.length}>
              <PlugZap className="me-1 h-4 w-4" /> اختبر كل الفروع
            </Button>
          </div>
          {branches.map((b) => {
            const r = pingResults[b.branch_id];
            return (
              <Card key={b.branch_id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      {b.branch_name}
                      {b.is_active ? (
                        <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">مفعّل</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">معطّل</Badge>
                      )}
                    </CardTitle>
                    <Button size="sm" variant="outline" onClick={() => pingBranch(b.branch_id)} disabled={r === "loading"}>
                      {r === "loading" ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <PlugZap className="me-1 h-4 w-4" />}
                      اختبر الاتصال
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                    <div>
                      <div className="text-muted-foreground">Wheels Branch ID</div>
                      <div className="font-mono break-all" title={b.wheels_branch_id}>{b.wheels_branch_id.slice(0, 8)}…</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">المفتاح</div>
                      <div className="font-mono">{b.secret_name}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">المناطق</div>
                      <div>{b.zones_count}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">مربوطة بـ Wheels</div>
                      <div className={b.mapped_zones_count === b.zones_count ? "text-emerald-700" : "text-amber-700"}>
                        {b.mapped_zones_count} / {b.zones_count}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">أسعار ثابتة</div>
                      <div
                        className={
                          b.priced_zones_count === 0
                            ? "text-amber-700"
                            : b.priced_zones_count === b.mapped_zones_count
                            ? "text-emerald-700"
                            : "text-foreground"
                        }
                        title={b.priced_zones_count === 0 ? "السعر سيُجلب لحظياً من Wheels API لكل طلب" : ""}
                      >
                        {b.priced_zones_count} / {b.mapped_zones_count}
                      </div>
                    </div>
                  </div>
                  {r && r !== "loading" && (
                    <div className="mt-3 rounded-md border p-3 text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        {r.success ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                        <span className={r.success ? "text-emerald-700 font-medium" : "text-red-700 font-medium"}>
                          {r.success ? "الاتصال ناجح" : "فشل الاتصال"}
                        </span>
                        {typeof r.latency_ms === "number" && <span className="text-muted-foreground">— {r.latency_ms}ms</span>}
                        {typeof r.http_status === "number" && <span className="text-muted-foreground">— HTTP {r.http_status}</span>}
                      </div>
                      {r.probe_area && (
                        <div className="text-muted-foreground">
                          منطقة الاختبار: <span className="text-foreground">{r.probe_area.area_name}</span>
                          {typeof r.probe_area.wheels_fixed_price === "number" && (
                            <> — السعر الثابت: <span className="text-foreground">{r.probe_area.wheels_fixed_price}</span></>
                          )}
                        </div>
                      )}
                      {r.error && <div className="text-red-700">{r.error}</div>}
                      {r.wheels_response && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-muted-foreground">رد Wheels (JSON)</summary>
                          <pre className="mt-1 bg-muted/40 p-2 rounded text-[10px] overflow-x-auto">{JSON.stringify(r.wheels_response, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {!loading && !branches.length && (
            <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">لا توجد فروع مربوطة بـ Wheels</CardContent></Card>
          )}
        </TabsContent>

        {/* ── Resolve tab ───────────────────────── */}
        <TabsContent value="resolve">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" /> اختبار حل المنطقة من العنوان
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">الفرع</Label>
                  <Select value={resolveBranch} onValueChange={setResolveBranch}>
                    <SelectTrigger><SelectValue placeholder="اختر فرع" /></SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (<SelectItem key={b.branch_id} value={b.branch_id}>{b.branch_name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">العنوان (مثال: نابلس - شارع يافا)</Label>
                  <Input value={resolveAddr} onChange={(e) => setResolveAddr(e.target.value)} placeholder="المدينة - المنطقة" />
                </div>
              </div>
              <Button size="sm" onClick={runResolve} disabled={resolveBusy}>
                {resolveBusy ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <MapPin className="me-1 h-4 w-4" />}
                ابحث عن المنطقة
              </Button>
              {resolveResult && (
                <div className="mt-2 rounded-md border p-3 text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    {resolveResult.success ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                    <span className={resolveResult.success ? "text-emerald-700 font-medium" : "text-red-700 font-medium"}>
                      {resolveResult.success ? "تم إيجاد المنطقة" : "لم يتم إيجاد منطقة مربوطة"}
                    </span>
                  </div>
                  {resolveResult.extracted_area && (
                    <div className="text-muted-foreground">
                      ما يستخرجه send-to-wheels (آخر segment):{" "}
                      <span className="text-foreground">{resolveResult.extracted_area}</span>
                    </div>
                  )}
                  {resolveResult.matched_zone && (
                    <div className="text-muted-foreground">
                      التطابق: <span className="text-foreground">{resolveResult.matched_zone.area_name}</span>
                      {" — "}wheels_area_id: <span className="font-mono">{resolveResult.matched_zone.wheels_area_id}</span>
                      {typeof resolveResult.matched_zone.wheels_fixed_price === "number" && (
                        <> — السعر: <span className="text-foreground">{resolveResult.matched_zone.wheels_fixed_price}</span></>
                      )}
                      {resolveResult.match_type && <> — نوع التطابق: <span className="text-foreground">{resolveResult.match_type}</span></>}
                    </div>
                  )}
                  {resolveResult.warning && (
                    <div className="mt-1 rounded border border-amber-300 bg-amber-50 text-amber-800 p-2">
                      ⚠️ {resolveResult.warning}
                    </div>
                  )}
                  {Array.isArray(resolveResult.attempts) && resolveResult.attempts.length > 1 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-muted-foreground">المحاولات ({resolveResult.attempts.length})</summary>
                      <ul className="mt-1 space-y-0.5">
                        {resolveResult.attempts.map((a: any, i: number) => (
                          <li key={i} className="text-[11px]">
                            <span className="font-mono">"{a.candidate}"</span> →{" "}
                            {a.match_type ? (
                              <span className="text-emerald-700">{a.match_type} → {a.zone?.area_name}</span>
                            ) : (
                              <span className="text-muted-foreground">لا يوجد</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {resolveResult.error && <div className="text-red-700">{resolveResult.error}</div>}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                المنطق: يقسم العنوان على " - " ويأخذ آخر جزء كاسم منطقة، ثم يبحث في <code>delivery_zones</code> (تطابق تام أولاً، ثم ILIKE).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Recent orders tab ───────────────────────── */}
        <TabsContent value="recent">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">آخر 20 طلب تم محاولة إرساله إلى Wheels</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-right py-2">رقم</th>
                    <th className="text-right py-2">العميل</th>
                    <th className="text-right py-2">العنوان</th>
                    <th className="text-right py-2">الإجمالي</th>
                    <th className="text-right py-2">حالة الإرسال</th>
                    <th className="text-right py-2">سعر التوصيل</th>
                    <th className="text-right py-2">الخطأ</th>
                    <th className="text-right py-2">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="py-2">{o.order_number ?? "—"}</td>
                      <td className="py-2">{o.customer_name ?? "—"}</td>
                      <td className="py-2 max-w-[200px] truncate" title={o.customer_address ?? ""}>{o.customer_address ?? "—"}</td>
                      <td className="py-2">{o.total ?? "—"}</td>
                      <td className="py-2">
                        {o.wheels_request_status ? (
                          <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[o.wheels_request_status] ?? ""}`}>{o.wheels_request_status}</Badge>
                        ) : "—"}
                      </td>
                      <td className="py-2">{o.wheels_delivery_price ?? "—"}</td>
                      <td className="py-2 text-red-700 max-w-[200px] truncate" title={o.wheels_last_error ?? ""}>{o.wheels_last_error ?? ""}</td>
                      <td className="py-2 whitespace-nowrap">{new Date(o.created_at).toLocaleString("ar")}</td>
                    </tr>
                  ))}
                  {!recent.length && (
                    <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">لا توجد محاولات إرسال بعد</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Webhook tab ───────────────────────── */}
        <TabsContent value="webhook">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">رابط استقبال تحديثات Wheels</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-xs text-muted-foreground">
                هذا هو الرابط الذي يجب إعطاؤه لفريق Wheels ليرسلوا عليه تحديثات حالة الطلب (قبول/استلام/تسليم). إذا لم يكن المسار جاهزاً بعد، أخبرنا لنُنشئه.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted/40 p-2 rounded text-xs break-all">{webhookUrl || "—"}</code>
                <Button size="sm" variant="outline" onClick={() => webhookUrl && copy(webhookUrl)} disabled={!webhookUrl}>
                  <Copy className="me-1 h-4 w-4" /> نسخ
                </Button>
              </div>
              <div className="text-[11px] text-muted-foreground mt-2">
                ملاحظة: لم يتم إنشاء edge function باسم <code>wheels-webhook</code> بعد. الرابط معروض للمرجع فقط — اطلب إنشاء المسار قبل تسليمه لـ Wheels.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}