/**
 * KDS Operations Control Page — /pos/kds-control
 * Single dashboard for restaurant staff to see device status, links,
 * QR codes, and run quick voice/number tests.
 */
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { speakOrderCall, playChime, playFallbackAlert, getLastVoiceError } from "@/lib/kds-voice";
import { Volume2, Wifi, WifiOff, Copy, ChefHat, Monitor, RefreshCw, ExternalLink, Bell, Sparkles } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { getKdsPublicBaseUrl, isPreviewOrigin } from "@/lib/kds-public-url";
import { toast } from "sonner";
import PilotIssuesPanel from "@/components/kds/PilotIssuesPanel";

interface Device {
  id: string; name: string; device_type: string; device_role: string;
  token: string; branch_id: string | null; last_seen_at: string | null; is_active: boolean;
}

const DEVICE_LABEL: Record<string, string> = {
  customer_display: "شاشة الزبائن",
  kitchen_screen: "شاشة المطبخ",
  heater_screen: "شاشة السخان",
};

export default function KdsControlPage() {
  const { user } = useAuth();
  const { settings } = useCompanySettings();
  const [devices, setDevices] = useState<Device[]>([]);
  const [stats, setStats] = useState({ preparing: 0, ready: 0 });
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!user) return;
    const { data: ownerId } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
    if (!ownerId) return;
    const [{ data: ds }, { data: kt }] = await Promise.all([
      (supabase as any).from("pos_display_devices").select("*").eq("company_id", ownerId).order("created_at"),
      (supabase as any).from("kitchen_tickets").select("status").in("status", ["pending","preparing","ready"]),
    ]);
    setDevices((ds as Device[]) || []);
    const tickets = (kt as any[]) || [];
    setStats({
      preparing: tickets.filter((t: any) => t.status === "pending" || t.status === "preparing").length,
      ready: tickets.filter((t: any) => t.status === "ready").length,
    });
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const i = setInterval(load, 10000); return () => clearInterval(i); }, [load]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);

  const isOnline = (d: Device) => d.last_seen_at && (now - new Date(d.last_seen_at).getTime()) < 60_000;

  const baseUrl = getKdsPublicBaseUrl((settings as any).kds_public_base_url);
  const showPreviewWarning = isPreviewOrigin() && !(settings as any).kds_public_base_url;

  const linkFor = (d: Device) => {
    if (d.device_type === "kitchen_screen" || d.device_type === "heater_screen")
      return `${baseUrl}/pos/kitchen-display?token=${d.token}`;
    return `${baseUrl}/pos/order-display?token=${d.token}`;
  };

  const copyLink = (d: Device) => {
    navigator.clipboard.writeText(linkFor(d));
    toast.success("تم نسخ الرابط");
  };

  const rotateToken = async (d: Device) => {
    if (!confirm("تدوير التوكن سيوقف الجهاز فوراً حتى تحديث الرابط. متابعة؟")) return;
    const { data, error } = await supabase.rpc("kds_rotate_device_token", { _id: d.id } as any);
    if (error) { toast.error("فشل التدوير"); return; }
    toast.success("تم إصدار توكن جديد");
    load();
  };

  const [voiceDiag, setVoiceDiag] = useState<string>("");
  const testVoice = async () => {
    setVoiceDiag("جارٍ الاختبار…");
    playChime();
    const customerDevice = devices.find(d => d.device_type === "customer_display");
    const res = await speakOrderCall(123, {
      template: settings.pos_voice_template,
      language: settings.pos_voice_language,
      mode: (settings as any).pos_kds_voice_mode || "browser_tts",
      deviceToken: customerDevice?.token,
    });
    let msg = "";
    switch (res.played) {
      case "cached_arabic_audio": msg = "✅ تم تشغيل صوت عربي ثابت (mp3 من الكاش)"; break;
      case "browser_tts": msg = "✅ تم تشغيل صوت المتصفح العربي"; break;
      case "beep_only": msg = `⚠️ لا يوجد صوت عربي — تنبيه فقط${res.reason ? ` (${res.reason})` : ""}`; break;
      default: msg = `❌ تعذّر تشغيل أي صوت${res.reason ? `: ${res.reason}` : ""}`;
    }
    setVoiceDiag(msg);
    if (res.played === "beep_only" || res.played === "none") toast.warning(msg);
    else toast.success(msg);
  };

  const applyRestaurantPreset = async () => {
    if (!user) return;
    if (!confirm("سيتم تفعيل KDS وشاشة الزبائن، وإنشاء جهازين (شاشة زبائن + شاشة سخان) إذا لم يوجدا. متابعة؟")) return;
    try {
      const { data: ownerId } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
      if (!ownerId) throw new Error("no owner");
      // Persist the three toggles directly so we avoid races with the settings hook.
      const { error: upErr } = await (supabase as any)
        .from("company_settings")
        .update({
          pos_kds_enabled: true,
          pos_customer_display_enabled: true,
          pos_voice_call_enabled: true,
        })
        .eq("user_id", ownerId);
      if (upErr) throw upErr;
      const existing = devices.map(d => d.device_type);
      const inserts: any[] = [];
      if (!existing.includes("customer_display")) {
        inserts.push({
          company_id: ownerId, name: "شاشة الزبائن",
          device_role: "customer_display", device_type: "customer_display",
          token: crypto.randomUUID().replace(/-/g, ""),
        });
      }
      if (!existing.includes("heater_screen") && !existing.includes("kitchen_screen")) {
        inserts.push({
          company_id: ownerId, name: "شاشة السخان",
          device_role: "heater_screen", device_type: "heater_screen",
          token: crypto.randomUUID().replace(/-/g, ""),
        });
      }
      if (inserts.length) {
        const { error } = await (supabase as any).from("pos_display_devices").insert(inserts);
        if (error) throw error;
      }
      toast.success("تم تطبيق قالب: مطعم - شاشة مطبخ وشاشة أرقام");
      load();
    } catch (e: any) {
      toast.error("تعذر تطبيق القالب: " + (e?.message || ""));
    }
  };

  return (
    <div className="min-h-screen bg-background p-6" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">لوحة تشغيل شاشات الطلبات</h1>
            <p className="text-muted-foreground text-sm mt-1">
              راقب الأجهزة، افحص الصوت، وافتح الشاشات.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="default" size="sm" onClick={applyRestaurantPreset}>
              <Sparkles className="h-4 w-4 ml-1" /> قالب مطعم سريع
            </Button>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4 ml-1" /> تحديث
            </Button>
          </div>
        </div>

        {showPreviewWarning && (
          <Card className="p-4 border-amber-300 bg-amber-50 text-amber-900 flex gap-3">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-bold">هذا رابط معاينة Lovable</p>
              <p>لا تستخدمه على أجهزة المطعم — ضع رابط التطبيق الرسمي في
                <Link to="/settings" className="underline mx-1">إعدادات KDS</Link>
                ("رابط التطبيق العام") ثم أعد توليد الروابط.</p>
            </div>
          </Card>
        )}
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="قيد التحضير" value={stats.preparing} tone="amber" />
          <KpiCard label="جاهز للاستلام" value={stats.ready} tone="emerald" />
          <KpiCard label="أجهزة متصلة" value={devices.filter(isOnline).length} tone="sky" />
          <KpiCard label="إجمالي الأجهزة" value={devices.length} tone="slate" />
        </div>

        {/* Quick actions */}
        <Card className="p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Bell className="h-4 w-4" /> اختبارات سريعة</h2>
          <div className="flex flex-wrap gap-2">
            <Button onClick={testVoice} variant="secondary"><Volume2 className="h-4 w-4 ml-1" /> اختبار الصوت</Button>
            <Button onClick={() => playFallbackAlert()} variant="outline">صوت تنبيه فقط (Beep)</Button>
            <Button onClick={() => {
              const cd = devices.find(d => d.device_type === "customer_display");
              speakOrderCall(Math.floor(Math.random() * 99) + 1, {
                template: settings.pos_voice_template, language: settings.pos_voice_language,
                mode: (settings as any).pos_kds_voice_mode || "browser_tts",
                deviceToken: cd?.token,
              });
            }} variant="outline">نداء رقم وهمي</Button>
            <Button asChild variant="ghost">
              <Link to="/settings"><ExternalLink className="h-4 w-4 ml-1" /> إعدادات KDS</Link>
            </Button>
          </div>
          {voiceDiag && (
            <p className="text-xs mt-2 text-muted-foreground">{voiceDiag}</p>
          )}
        </Card>

        {/* Devices */}
        <div>
          <h2 className="font-semibold mb-3">الأجهزة</h2>
          {devices.length === 0 && (
            <Card className="p-6 text-center text-muted-foreground">
              لا توجد أجهزة بعد. أضف جهازاً من الإعدادات → شاشة المطبخ ونداء الزبائن.
            </Card>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {devices.map(d => {
              const url = linkFor(d);
              const online = isOnline(d);
              return (
                <Card key={d.id} className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-white p-2 rounded-md border">
                      <QRCodeSVG value={url} size={96} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {d.device_type === "customer_display"
                          ? <Monitor className="h-4 w-4 text-primary" />
                          : <ChefHat className="h-4 w-4 text-amber-500" />}
                        <span className="font-semibold truncate">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge variant="outline">{DEVICE_LABEL[d.device_type] || d.device_type}</Badge>
                        {online ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                            <Wifi className="h-3 w-3" /> متصل
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1 text-muted-foreground">
                            <WifiOff className="h-3 w-3" /> غير متصل
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate" title={url}>{url}</p>
                      {d.last_seen_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          آخر اتصال: {new Date(d.last_seen_at).toLocaleString("ar-PS")}
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" onClick={() => copyLink(d)}>
                          <Copy className="h-3 w-3 ml-1" /> نسخ
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <a href={url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3 w-3 ml-1" /> فتح
                          </a>
                        </Button>
                        {d.device_type === "customer_display" && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => rotateToken(d)}>
                            تدوير التوكن
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Quick help */}
        <Card className="p-4 bg-muted/40">
          <h3 className="font-semibold mb-2">دليل تشغيل سريع</h3>
          <ol className="text-sm space-y-1 text-muted-foreground list-decimal list-inside">
            <li>فعّل شاشة المطبخ وشاشة الزبائن من الإعدادات → شاشة المطبخ ونداء الزبائن.</li>
            <li>أضف جهازاً واختر النوع (شاشة زبائن / مطبخ / سخان) والفرع.</li>
            <li>افتح الرابط على التلفزيون أو التابلت، اضغط مرة واحدة لتفعيل الصوت.</li>
            <li>اختبر الصوت من هذه الصفحة. إذا لم يعمل، جرّب "صوت تنبيه فقط".</li>
            <li>إذا انقطع الاتصال تظهر رسالة "جارٍ إعادة الاتصال…" تلقائياً.</li>
            <li>لاستبدال الرابط (مثلاً سُرّب التوكن) اضغط "تدوير التوكن".</li>
          </ol>
          <Separator />
          <h4 className="font-semibold mt-3 mb-1 text-sm">حل المشاكل الشائعة</h4>
          <ul className="text-sm space-y-1 text-muted-foreground list-disc list-inside">
            <li>الصوت لا يعمل: افتح الشاشة، اضغط "اضغط للبدء"، ثم جرّب "نداء رقم وهمي".</li>
            <li>الجهاز يظهر غير متصل: تحقق من الإنترنت، أعد فتح الرابط، انتظر 60 ثانية.</li>
            <li>الطلب لا يظهر: تأكد أن KDS مفعّل وأن الفرع مطابق بين الكاشير وجهاز العرض.</li>
            <li>تكرار النداء بعد refresh: لن يحدث — الشاشة تتذكر آخر نداء عبر localStorage.</li>
          </ul>
        </Card>

        {/* Pilot issues log */}
        <PilotIssuesPanel />
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone: "amber"|"emerald"|"sky"|"slate" }) {
  const map = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    sky: "bg-sky-50 text-sky-700 border-sky-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  } as const;
  return (
    <Card className={`p-4 border ${map[tone]}`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="text-3xl font-black mt-1 tabular-nums">{value}</div>
    </Card>
  );
}
