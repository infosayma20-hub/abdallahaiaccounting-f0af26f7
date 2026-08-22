import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table as UITable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { KeyRound, Plus, Copy, Ban, Smartphone, RefreshCw, CheckCircle2 } from "lucide-react";
import { SettingsSection } from "./shell/SettingsSection";

interface ApiKeyRow {
  id: string;
  label: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

const FN = "mobile-orders-api";

const ApiKeysSection = () => {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const invoke = useCallback(async (method: string, path: string, body?: any) => {
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
      const res = await invoke("GET", "/admin/keys");
      if (res?.ok) setKeys(res.keys || []);
      else toast.error("تعذر تحميل مفاتيح API");
    } catch {
      toast.error("تعذر تحميل مفاتيح API");
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await invoke("POST", "/admin/keys", { label: label || "تطبيق الجوال" });
      if (res?.ok) {
        setNewKey(res.key.api_key);
        setLabel("");
        void load();
      } else {
        toast.error("فشل إنشاء المفتاح");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm("إيقاف هذا المفتاح؟ التطبيق المربوط فيه لن يقدر يرسل طلبيات بعد الآن.")) return;
    setRevoking(id);
    try {
      const res = await invoke("DELETE", `/admin/keys/${id}`);
      if (res?.ok) {
        toast.success("تم إيقاف المفتاح");
        void load();
      } else {
        toast.error("فشل إيقاف المفتاح");
      }
    } finally {
      setRevoking(null);
    }
  };

  const copyKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("انسخ المفتاح يدوياً");
    }
  };

  return (
    <SettingsSection
      title="مفاتيح API للتطبيقات الخارجية"
      description="مفاتيح ربط تطبيق الجوال (أو أي نظام خارجي) لإرسال الطلبيات مباشرة لشاشة الكاشير حسب الفرع"
      icon={KeyRound}
    >
      <div className="space-y-4">
        {/* Create */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="اسم المفتاح (مثال: تطبيق الملكي - إنتاج)"
            className="sm:max-w-xs"
          />
          <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {creating ? "جاري الإنشاء..." : "إنشاء مفتاح جديد"}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => void load()} title="تحديث">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Newly created key — shown once */}
        {newKey && (
          <div className="rounded-lg border-2 border-emerald-500/50 bg-emerald-500/10 p-3 space-y-2">
            <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              تم إنشاء المفتاح — انسخه الآن، لن يظهر مرة أخرى!
            </div>
            <div className="flex items-center gap-2">
              <code dir="ltr" className="flex-1 text-xs font-mono bg-background rounded px-2 py-1.5 border border-border break-all select-all">
                {newKey}
              </code>
              <Button size="sm" variant="outline" onClick={copyKey} className="gap-1 shrink-0">
                {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "تم" : "نسخ"}
              </Button>
            </div>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setNewKey(null)}>إخفاء</Button>
          </div>
        )}

        {/* Keys table */}
        {keys.length === 0 && !loading ? (
          <div className="text-center py-8 text-muted-foreground">
            <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">لا توجد مفاتيح بعد — أنشئ مفتاحاً وسلّمه لمبرمج التطبيق</p>
          </div>
        ) : (
          <UITable>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>المفتاح</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>آخر استخدام</TableHead>
                <TableHead>أُنشئ</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id} className={!k.is_active ? "opacity-50" : ""}>
                  <TableCell className="font-semibold text-sm">{k.label}</TableCell>
                  <TableCell>
                    <code dir="ltr" className="text-xs font-mono text-muted-foreground">{k.key_prefix}…</code>
                  </TableCell>
                  <TableCell>
                    {k.is_active ? (
                      <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400">فعّال</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-red-500/40 text-red-600">موقوف</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString("ar-PS") : "لم يُستخدم"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(k.created_at).toLocaleDateString("ar-PS")}
                  </TableCell>
                  <TableCell>
                    {k.is_active && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-500/10 h-7 text-xs gap-1"
                        disabled={revoking === k.id}
                        onClick={() => void handleRevoke(k.id)}
                      >
                        <Ban className="h-3 w-3" /> إيقاف
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </UITable>
        )}

        <p className="text-[11px] text-muted-foreground">
          🔒 سلّم المفتاح لمبرمج التطبيق فقط. الطلبيات الواردة عبر المفتاح تظهر فوراً في شاشة الكاشير (الفواتير المعلقة) على الفرع المحدد.
        </p>
      </div>

      {/* keep dialog imports used if we extend later */}
      <Dialog open={false}><DialogContent><DialogHeader><DialogTitle /></DialogHeader><DialogFooter /></DialogContent></Dialog>
    </SettingsSection>
  );
};

export default ApiKeysSection;
