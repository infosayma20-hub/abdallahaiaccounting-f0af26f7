import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table as UITable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Copy, Trash2, Webhook, RefreshCw, CheckCircle2, Send } from "lucide-react";
import { SettingsSection } from "./shell/SettingsSection";

interface WebhookRow {
  id: string;
  label: string;
  url: string;
  environment: string;
  events: string[];
  is_active: boolean;
  last_delivery_at: string | null;
  created_at: string;
}

const FN = "mobile-orders-api";

const EVENT_LABELS: Record<string, string> = {
  "order.accepted": "قبول الطلبية",
  "order.completed": "إنجاز الطلبية",
  "order.cancelled": "إلغاء الطلبية",
  "order.status_changed": "تغيّر الحالة",
};

const ApiWebhooksSection = () => {
  const [rows, setRows] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const invoke = useCallback(async (method: string, path: string, body?: unknown) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/${FN}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoke("GET", "/admin/webhooks");
      if (res?.ok) setRows(res.webhooks || []);
      else toast.error("تعذر تحميل روابط الإشعارات");
    } catch {
      toast.error("تعذر تحميل روابط الإشعارات");
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (!/^https:\/\/\S+$/i.test(url.trim())) {
      toast.error("أدخل رابط https صالح");
      return;
    }
    setCreating(true);
    try {
      const res = await invoke("POST", "/admin/webhooks", {
        label: label || "تطبيق الجوال",
        url: url.trim(),
        environment,
      });
      if (res?.ok) {
        setNewSecret(res.webhook.secret);
        setLabel("");
        setUrl("");
        void load();
      } else {
        toast.error(res?.message || "فشل إضافة الرابط");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("حذف رابط الإشعارات؟ التطبيق لن يستقبل تحديثات الحالة بعد الآن.")) return;
    setBusyId(id);
    try {
      const res = await invoke("DELETE", `/admin/webhooks/${id}`);
      if (res?.ok) { toast.success("تم الحذف"); void load(); }
      else toast.error("فشل الحذف");
    } finally {
      setBusyId(null);
    }
  };

  const handleTest = async (id: string) => {
    setBusyId(id);
    try {
      const res = await invoke("POST", `/admin/webhooks/${id}/test`);
      if (res?.ok) toast.success("وصل الاختبار بنجاح");
      else toast.error(res?.message || "تعذر إيصال الاختبار");
    } finally {
      setBusyId(null);
    }
  };

  const copySecret = async () => {
    if (!newSecret) return;
    try {
      await navigator.clipboard.writeText(newSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("انسخ المفتاح يدوياً");
    }
  };

  return (
    <SettingsSection
      title="🔔 إشعارات Webhook للتطبيقات الخارجية"
      description="أرسل تحديثات حالة الطلبية (قبول / إنجاز / إلغاء) تلقائياً لخادم التطبيق الخارجي"
    >
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="الاسم (مثال: خادم تطبيق الملكي)"
            className="sm:max-w-[220px]"
          />
          <Input
            dir="ltr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/unify/webhook"
            className="sm:flex-1"
          />
          <div className="flex rounded-md border border-border overflow-hidden">
            {(["live", "test"] as const).map((env) => (
              <button
                key={env}
                type="button"
                onClick={() => setEnvironment(env)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  environment === env ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
                }`}
              >
                {env === "live" ? "إنتاج" : "تجريبي"}
              </button>
            ))}
          </div>
          <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {creating ? "جاري الإضافة..." : "إضافة"}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => void load()} title="تحديث">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {newSecret && (
          <div className="rounded-lg border-2 border-emerald-500/50 bg-emerald-500/10 p-3 space-y-2">
            <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              مفتاح التوقيع (Signing Secret) — انسخه الآن، لن يظهر مرة أخرى!
            </div>
            <div className="flex items-center gap-2">
              <code dir="ltr" className="flex-1 text-xs font-mono bg-background rounded px-2 py-1.5 border border-border break-all select-all">
                {newSecret}
              </code>
              <Button size="sm" variant="outline" onClick={copySecret} className="gap-1 shrink-0">
                {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "تم" : "نسخ"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground" dir="ltr">
              Verify: HMAC-SHA256(raw_body, secret) === header X-Unify-Signature
            </p>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setNewSecret(null)}>إخفاء</Button>
          </div>
        )}

        {rows.length === 0 && !loading ? (
          <div className="text-center py-8 text-muted-foreground">
            <Webhook className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">لا توجد روابط إشعارات — أضف رابط خادم التطبيق ليستقبل تحديثات الطلبيات</p>
          </div>
        ) : (
          <UITable>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>الرابط</TableHead>
                <TableHead>البيئة</TableHead>
                <TableHead>الأحداث</TableHead>
                <TableHead>آخر إرسال</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((w) => (
                <TableRow key={w.id} className={!w.is_active ? "opacity-50" : ""}>
                  <TableCell className="font-semibold text-sm">{w.label}</TableCell>
                  <TableCell>
                    <code dir="ltr" className="text-xs font-mono text-muted-foreground break-all">{w.url}</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${w.environment === "test" ? "border-amber-500/40 text-amber-600" : "border-sky-500/40 text-sky-600"}`}>
                      {w.environment === "test" ? "تجريبي" : "إنتاج"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    {(w.events || []).map((e) => EVENT_LABELS[e] || e).join("، ")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {w.last_delivery_at ? new Date(w.last_delivery_at).toLocaleString("ar-PS") : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1"
                        disabled={busyId === w.id}
                        onClick={() => void handleTest(w.id)}
                      >
                        <Send className="h-3 w-3" /> اختبار
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-500/10 h-7 text-xs gap-1"
                        disabled={busyId === w.id}
                        onClick={() => void handleDelete(w.id)}
                      >
                        <Trash2 className="h-3 w-3" /> حذف
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </UITable>
        )}

        <p className="text-[11px] text-muted-foreground">
          🔒 يُرسل النظام طلب POST بصيغة JSON مع ترويسة <code dir="ltr">X-Unify-Signature</code> (HMAC-SHA256) و<code dir="ltr">X-Unify-Event</code>. تحقّق من التوقيع قبل قبول أي تحديث.
        </p>
      </div>
    </SettingsSection>
  );
};

export default ApiWebhooksSection;
