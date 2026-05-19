/**
 * KDS + Customer Display settings + device manager.
 * Lives inside the POS settings panel.
 */

import { useEffect, useState, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Copy, Plus, Trash2, Volume2, Monitor, ChefHat, RefreshCw, Wifi, WifiOff, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { CompanySettings } from "@/hooks/useCompanySettings";
import { speakOrderCall, type VoiceDiagnostics, type VoiceResult } from "@/lib/kds-voice";
import { Link } from "react-router-dom";
import { getKdsPublicBaseUrl, isPreviewOrigin } from "@/lib/kds-public-url";
import { AlertTriangle } from "lucide-react";

interface Device {
  id: string;
  name: string;
  device_role: string;
  device_type: string;
  token: string;
  branch_id: string | null;
  is_active: boolean;
  last_seen_at: string | null;
}

interface Branch { id: string; name: string }

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
  ownerId: string | null;
}

const KdsDisplaySection = ({ settings, onChange, ownerId }: Props) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [newName, setNewName] = useState("");
  const [newBranch, setNewBranch] = useState<string>("none");
  const [newType, setNewType] = useState<string>("customer_display");
  const [voiceTest, setVoiceTest] = useState<VoiceDiagnostics | null>(null);
  const [voiceTestMessage, setVoiceTestMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);

  const load = useCallback(async () => {
    if (!ownerId) return;
    const [{ data: ds }, { data: bs }] = await Promise.all([
      supabase.from("pos_display_devices").select("*").eq("company_id", ownerId).order("created_at"),
      supabase.from("branches").select("id, name").eq("user_id", ownerId).order("name"),
    ]);
    setDevices((ds as any[]) || []);
    setBranches((bs as any[]) || []);
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  const createDevice = async () => {
    if (!ownerId || !newName.trim()) return;
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabase.from("pos_display_devices").insert({
      company_id: ownerId,
      branch_id: newBranch === "none" ? null : newBranch,
      name: newName.trim(),
      device_role: newType,
      device_type: newType,
      token,
    } as any);
    if (error) { toast.error("تعذر إضافة الجهاز"); return; }
    setNewName(""); setNewBranch("none"); setNewType("customer_display");
    toast.success("تم إنشاء الجهاز");
    load();
  };

  const removeDevice = async (id: string) => {
    if (!confirm("حذف الجهاز؟ سيتوقف عرضه مباشرة.")) return;
    await supabase.from("pos_display_devices").delete().eq("id", id);
    load();
  };

  const linkFor = (d: Device) => {
    const base = getKdsPublicBaseUrl(settings.kds_public_base_url);
    if (d.device_type === "kitchen_screen" || d.device_type === "heater_screen") {
      return `${base}/pos/kitchen-display?token=${d.token}`;
    }
    return `${base}/pos/order-display?token=${d.token}`;
  };

  const copyLink = (d: Device) => {
    const url = linkFor(d);
    navigator.clipboard.writeText(url);
    toast.success("تم نسخ الرابط");
  };

  const rotateToken = async (d: Device) => {
    if (!confirm("تدوير التوكن سيوقف الجهاز الحالي فوراً. متابعة؟")) return;
    const { error } = await supabase.rpc("kds_rotate_device_token", { _id: d.id } as any);
    if (error) { toast.error("فشل التدوير"); return; }
    toast.success("تم إصدار توكن جديد");
    load();
  };

  const isOnline = (d: Device) =>
    !!d.last_seen_at && (now - new Date(d.last_seen_at).getTime()) < 60_000;

  const buildVoiceMessage = (result: VoiceResult) => {
    if (result.played === "cached_arabic_audio") return "تم تشغيل صوت عربي ثابت";
    if (result.played === "browser_tts") return "تم تشغيل صوت المتصفح";
    if (result.played === "beep_only") return `لم يتم تشغيل الصوت العربي. تم تشغيل تنبيه فقط.${result.reason ? ` ${result.reason}` : ""}`;
    return result.reason || "فشل تشغيل الصوت";
  };

  const testArabicVoice = async () => {
    setVoiceTestMessage("جارٍ اختبار صوت Omar…");
    setVoiceTest(null);
    const result = await speakOrderCall("13", {
      template: "طلب رقم {n}، تفضل للاستلام",
      language: settings.pos_voice_language,
      mode: (settings.pos_kds_voice_mode || "browser_tts") as any,
      preview: true,
    });
    const message = buildVoiceMessage(result);
    setVoiceTestMessage(message);
    setVoiceTest(result.diagnostics || null);
    if (result.played === "cached_arabic_audio" || result.played === "browser_tts") toast.success(message);
    else toast.warning(message);
  };

  const baseUrl = getKdsPublicBaseUrl(settings.kds_public_base_url);
  const previewWarning = isPreviewOrigin() && !settings.kds_public_base_url;

  return (
    <div className="space-y-5">
      {/* Production URL + Voice mode */}
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-primary" />
          إعدادات النشر للأجهزة
        </h3>

        <div className="space-y-2">
          <Label>رابط التطبيق الرسمي للأجهزة</Label>
          <Input
            placeholder="https://app.amwali.ps"
            value={settings.kds_public_base_url || ""}
            onChange={e => onChange({ kds_public_base_url: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            رابط الإنتاج الذي ستفتح به الأجهزة شاشات الزبائن والمطبخ. لا تستخدم روابط معاينة Lovable.
          </p>
          <p className="text-xs">
            <span className="text-muted-foreground">المعاينة الحالية: </span>
            <code className="px-1 py-0.5 rounded bg-background border">{baseUrl || "—"}/pos/order-display?token=…</code>
          </p>
          {previewWarning && (
            <div className="flex gap-2 items-start text-xs p-2 rounded bg-amber-50 text-amber-900 border border-amber-300">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                هذا رابط معاينة من Lovable. ضع رابط التطبيق الرسمي حتى تعمل أجهزة المطعم بدون تسجيل دخول Lovable.
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>طريقة الصوت العربي</Label>
          <Select
            value={settings.pos_kds_voice_mode || "browser_tts"}
            onValueChange={v => onChange({ pos_kds_voice_mode: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cached_arabic_audio">صوت عربي ثابت (ElevenLabs، يُخزّن مؤقتاً)</SelectItem>
              <SelectItem value="browser_tts">صوت المتصفح</SelectItem>
              <SelectItem value="beep_only">تنبيه فقط (بدون نطق)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            الصوت العربي الثابت يحتاج مفتاح ElevenLabs مضبوطاً في الأسرار (ELEVENLABS_API_KEY). إن لم يتوفر سيرجع تلقائياً لصوت المتصفح.
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          شاشة المطبخ ونداء الزبائن (KDS)
        </h3>
        <p className="text-sm text-muted-foreground -mt-2 mb-4">
          فعّل شاشة تحضير للمطبخ وشاشة كبيرة للزبائن تعرض أرقام الطلبات الجاهزة مع نداء صوتي عربي.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ToggleRow
            label="تفعيل شاشة المطبخ"
            hint="تذاكر تنتقل من جديد → قيد التحضير → جاهز"
            value={settings.pos_kds_enabled}
            onChange={v => onChange({ pos_kds_enabled: v })}
          />
          <ToggleRow
            label="تفعيل شاشة عرض الزبائن"
            hint="شاشة كبيرة بعمودين للأرقام"
            value={settings.pos_customer_display_enabled}
            onChange={v => onChange({ pos_customer_display_enabled: v })}
          />
          <ToggleRow
            label="بدء التحضير تلقائياً بعد الدفع"
            hint="بدون انتظار قبول السخان"
            value={settings.pos_kds_auto_preparing}
            onChange={v => onChange({ pos_kds_auto_preparing: v })}
          />
          <ToggleRow
            label="نداء صوتي عند الجهوزية"
            hint="ينطق رقم الطلب بصوت عربي"
            value={settings.pos_voice_call_enabled}
            onChange={v => onChange({ pos_voice_call_enabled: v })}
          />

          <div className="space-y-2">
            <Label>لغة النداء</Label>
            <Select value={settings.pos_voice_language} onValueChange={v => onChange({ pos_voice_language: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ar-PS">العربية (فلسطين)</SelectItem>
                <SelectItem value="ar-SA">العربية (الفصحى)</SelectItem>
                <SelectItem value="ar-EG">العربية (مصر)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>رقم النداء</Label>
            <Select value={settings.pos_call_number_strategy} onValueChange={v => onChange({ pos_call_number_strategy: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="order_number">رقم الطلب</SelectItem>
                <SelectItem value="daily_short">رقم يومي قصير</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>الرقم الظاهر على شاشة الزبون</Label>
            <Select
              value={settings.pos_kds_display_number_source}
              onValueChange={v => onChange({ pos_kds_display_number_source: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="short_daily_number">نفس رقم الطلب في الفاتورة (1، 2، 3…)</SelectItem>
                <SelectItem value="order_number">رقم النظام الطويل</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              الرقم الذي يراه الزبون على الشاشة ويُنطق في النداء هو نفسه الذي يطبع على الفاتورة.
            </p>
          </div>

          <div className="space-y-2">
            <Label>بداية الرقم اليومي</Label>
            <Input type="number" min={1} max={9999}
              value={settings.pos_kds_daily_number_start}
              onChange={e => onChange({ pos_kds_daily_number_start: Number(e.target.value) || 1 })} />
          </div>

          <ToggleRow
            label="إعادة الترقيم يومياً"
            hint="يبدأ العد من جديد عند بداية يوم العمل لكل فرع"
            value={settings.pos_kds_daily_number_reset}
            onChange={v => onChange({ pos_kds_daily_number_reset: v })}
          />

          <div className="space-y-2 md:col-span-2">
            <Label>نص النداء</Label>
            <div className="flex gap-2">
              <Input
                value={settings.pos_voice_template}
                onChange={e => onChange({ pos_voice_template: e.target.value })}
                placeholder="طلب رقم {n}، تفضل للاستلام"
              />
              <Button
                type="button" variant="outline" className="gap-1"
                onClick={() => speakOrderCall(123, {
                  template: settings.pos_voice_template,
                  language: settings.pos_voice_language,
                  mode: "cached_arabic_audio",
                  preview: true,
                })}
              >
                <Volume2 className="h-4 w-4" /> تجربة
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">استخدم {"{n}"} لإدراج رقم الطلب.</p>
          </div>

          <div className="space-y-2">
            <Label>إخفاء "جاهز" بعد (ثانية)</Label>
            <Input type="number" min={30} max={1800}
              value={settings.pos_ready_auto_hide_seconds}
              onChange={e => onChange({ pos_ready_auto_hide_seconds: Number(e.target.value) || 300 })} />
          </div>

          <div className="space-y-2">
            <Label>إعادة النداء كل (ثانية، 0 = لا)</Label>
            <Input type="number" min={0} max={600}
              value={settings.pos_call_repeat_seconds}
              onChange={e => onChange({ pos_call_repeat_seconds: Number(e.target.value) || 0 })} />
          </div>

          <div className="space-y-2">
            <Label>أقصى عدد لإعادة النداء (0 = غير محدود)</Label>
            <Input type="number" min={0} max={20}
              value={settings.pos_call_max_repeats}
              onChange={e => onChange({ pos_call_max_repeats: Number(e.target.value) || 0 })} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Display devices */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Monitor className="h-4 w-4 text-primary" />
            أجهزة الشاشات
          </h3>
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link to="/pos/kds-control">
              <ExternalLink className="h-3.5 w-3.5" /> لوحة التشغيل
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          أضف جهازاً لكل شاشة في المطعم (زبائن / مطبخ / سخان). كل شاشة زبائن لها رابط فريد بتوكن. شاشات المطبخ تحتاج تسجيل دخول.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_180px_auto] gap-2 mb-4">
          <Input placeholder="اسم الجهاز (مثلاً: شاشة الصالة)" value={newName} onChange={e => setNewName(e.target.value)} />
          <Select value={newType} onValueChange={setNewType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="customer_display">شاشة الزبائن</SelectItem>
              <SelectItem value="kitchen_screen">شاشة المطبخ</SelectItem>
              <SelectItem value="heater_screen">شاشة السخان</SelectItem>
            </SelectContent>
          </Select>
          <Select value={newBranch} onValueChange={setNewBranch}>
            <SelectTrigger><SelectValue placeholder="الفرع (اختياري)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">كل الفروع</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" onClick={createDevice} disabled={!newName.trim()} className="gap-1">
            <Plus className="h-4 w-4" /> إضافة
          </Button>
        </div>

        <div className="space-y-2">
          {devices.length === 0 && <p className="text-sm text-muted-foreground italic">لا توجد أجهزة بعد.</p>}
          {devices.map(d => (
            <div key={d.id} className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{d.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    {d.device_type === "kitchen_screen" ? "مطبخ"
                      : d.device_type === "heater_screen" ? "سخان" : "زبائن"}
                  </span>
                  {isOnline(d) ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">
                      <Wifi className="h-3 w-3" /> متصل
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      <WifiOff className="h-3 w-3" /> غير متصل
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {d.branch_id ? branches.find(b => b.id === d.branch_id)?.name || "فرع" : "كل الفروع"}
                  {d.last_seen_at && ` · آخر اتصال: ${new Date(d.last_seen_at).toLocaleString("ar-PS")}`}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => copyLink(d)} className="gap-1">
                <Copy className="h-3.5 w-3.5" /> نسخ الرابط
              </Button>
              {d.device_type === "customer_display" && (
                <Button size="icon" variant="ghost" onClick={() => rotateToken(d)} title="تدوير التوكن">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => removeDevice(d.id)} className="text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

function ToggleRow({ label, hint, value, onChange }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-muted/20">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

export default KdsDisplaySection;