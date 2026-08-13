/**
 * LoyaltyAdminPage — إدارة برنامج الولاء وبطاقة الزبون الرقمية (/pos/loyalty).
 * من هنا تُنشأ لوحة QR الخاصة بالشركة: الزبون يمسحه أول مرة، يسجّل بياناته،
 * فتُفتح له بطاقة رقمية (نقاط + محفظة) مرتبطة بقاعدة بيانات الشركة نفسها.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Download, Copy, Check, Loader2, Upload, Users, QrCode } from "lucide-react";

type Program = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  logo_url: string | null;
  brand_color: string;
  accent_color: string;
  points_per_unit: number;
  welcome_message: string | null;
  collect_birthdate: boolean;
  is_active: boolean;
};

const slugify = (s: string) =>
  (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export default function LoyaltyAdminPage() {
  const navigate = useNavigate();
  const { dataOwnerId } = useDataOwnerId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [members, setMembers] = useState(0);
  const [p, setP] = useState<Program | null>(null);
  const qrWrap = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dataOwnerId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("loyalty_programs")
        .select("id,name,slug,tagline,logo_url,brand_color,accent_color,points_per_unit,welcome_message,collect_birthdate,is_active")
        .eq("user_id", dataOwnerId)
        .maybeSingle();

      if (data) {
        setP(data as Program);
        const { count } = await supabase
          .from("loyalty_members")
          .select("id", { count: "exact", head: true })
          .eq("program_id", (data as Program).id);
        setMembers(count || 0);
      } else {
        const { data: prof } = await supabase
          .from("profiles").select("company_name, full_name").eq("user_id", dataOwnerId).maybeSingle();
        const name = (prof as any)?.company_name || (prof as any)?.full_name || "برنامج الولاء";
        setP({
          id: "", name, slug: slugify(name) || `shop-${dataOwnerId.slice(0, 6)}`,
          tagline: "اجمع نقاطك مع كل زيارة", logo_url: null,
          brand_color: "#0D1B2A", accent_color: "#2563EB", points_per_unit: 1,
          welcome_message: null, collect_birthdate: true, is_active: true,
        });
      }
      setLoading(false);
    })();
  }, [dataOwnerId]);

  const joinUrl = useMemo(
    () => (p?.slug ? `${window.location.origin}/join/${p.slug}` : ""),
    [p?.slug]
  );

  const set = (patch: Partial<Program>) => setP(prev => (prev ? { ...prev, ...patch } : prev));

  const save = async () => {
    if (!p || !dataOwnerId) return;
    const slug = slugify(p.slug) || `shop-${dataOwnerId.slice(0, 6)}`;
    if (!p.name.trim()) { toast.error("اسم البرنامج مطلوب"); return; }
    setSaving(true);
    const payload = {
      user_id: dataOwnerId, name: p.name.trim(), slug, tagline: p.tagline,
      logo_url: p.logo_url, brand_color: p.brand_color, accent_color: p.accent_color,
      points_per_unit: Number(p.points_per_unit) || 1, welcome_message: p.welcome_message,
      collect_birthdate: p.collect_birthdate, is_active: p.is_active,
    };
    const res = p.id
      ? await supabase.from("loyalty_programs").update(payload).eq("id", p.id).select("id").single()
      : await supabase.from("loyalty_programs").insert(payload).select("id").single();
    setSaving(false);
    if (res.error) {
      toast.error(res.error.message.includes("duplicate") ? "الرابط المختصر مستخدم، جرّب اسماً آخر" : res.error.message);
      return;
    }
    set({ id: (res.data as any).id, slug });
    toast.success("تم الحفظ");
  };

  const uploadLogo = async (file: File) => {
    if (!dataOwnerId) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("حجم الشعار أكبر من 2 ميجابايت"); return; }
    setUploading(true);
    const ext = file.type === "image/svg+xml" ? "svg" : "png";
    const path = `${dataOwnerId}/loyalty-logo.${ext}`;
    const { error } = await supabase.storage.from("company-logos").upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);
    if (error) { toast.error(error.message); return; }
    const url = supabase.storage.from("company-logos").getPublicUrl(path).data.publicUrl + "?t=" + Date.now();
    set({ logo_url: url });
    toast.success("تم رفع الشعار — لا تنسَ الحفظ");
  };

  /** تحويل الـ SVG إلى PNG عالي الدقة (1200px) للطباعة على ستاند أو ملصق */
  const downloadQR = async () => {
    const svg = qrWrap.current?.querySelector("svg");
    if (!svg) return;
    const size = 1200, pad = 90;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    await new Promise(r => { img.onload = r; img.onerror = r; });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size + pad * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, pad, pad, size, size);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `loyalty-qr-${p?.slug || "card"}.png`;
    a.click();
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (loading || !p) {
    return <div className="grid h-[60vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div dir="rtl" className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-5">
      <header className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="رجوع">
          <ArrowRight className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <QrCode className="h-5 w-5 text-primary" /> برنامج الولاء وبطاقة الزبون
          </h1>
          <p className="text-xs text-muted-foreground">أنشئ رمز QR الخاص بشركتك — الزبون يمسحه ويسجّل مرة واحدة.</p>
        </div>
        <Badge variant="secondary" className="gap-1 text-xs">
          <Users className="h-3.5 w-3.5" /> {members} عضو
        </Badge>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* الإعدادات */}
        <Card className="space-y-4 p-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm font-semibold">تفعيل البرنامج</Label>
              <p className="text-xs text-muted-foreground">عند الإيقاف تتوقف صفحة التسجيل عن العمل.</p>
            </div>
            <Switch checked={p.is_active} onCheckedChange={v => set({ is_active: v })} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">اسم البرنامج / الشركة</Label>
              <Input value={p.name} onChange={e => set({ name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الرابط المختصر (إنجليزي)</Label>
              <Input value={p.slug} onChange={e => set({ slug: e.target.value })} dir="ltr" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">الجملة التعريفية</Label>
              <Input value={p.tagline || ""} onChange={e => set({ tagline: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">اللون الأساسي</Label>
              <div className="flex gap-2">
                <input type="color" value={p.brand_color} onChange={e => set({ brand_color: e.target.value })} className="h-10 w-12 cursor-pointer rounded border bg-transparent" aria-label="اللون الأساسي" />
                <Input value={p.brand_color} onChange={e => set({ brand_color: e.target.value })} dir="ltr" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">لون التمييز</Label>
              <div className="flex gap-2">
                <input type="color" value={p.accent_color} onChange={e => set({ accent_color: e.target.value })} className="h-10 w-12 cursor-pointer rounded border bg-transparent" aria-label="لون التمييز" />
                <Input value={p.accent_color} onChange={e => set({ accent_color: e.target.value })} dir="ltr" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">نقاط لكل شيكل</Label>
              <Input type="number" step="0.1" min="0" value={p.points_per_unit} onChange={e => set({ points_per_unit: Number(e.target.value) })} dir="ltr" />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="text-xs">طلب تاريخ الميلاد</Label>
              <Switch checked={p.collect_birthdate} onCheckedChange={v => set({ collect_birthdate: v })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">رسالة الترحيب (تظهر للزبون بعد التسجيل)</Label>
              <Textarea rows={2} value={p.welcome_message || ""} onChange={e => set({ welcome_message: e.target.value })} />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-3">
            {p.logo_url ? (
              <img src={p.logo_url} alt="شعار الشركة على بطاقة الولاء" className="h-14 w-14 rounded-xl border object-contain" />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-xl border text-[10px] text-muted-foreground">بدون شعار</div>
            )}
            <div className="flex-1">
              <Label className="text-xs font-semibold">شعار الشركة</Label>
              <p className="text-[11px] text-muted-foreground">يظهر داخل رمز QR وعلى بطاقة الزبون. PNG مربّع يفضّل 512×512.</p>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="ml-1.5 h-4 w-4" /> رفع</>}
            </Button>
          </div>

          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ الإعدادات"}
          </Button>
        </Card>

        {/* رمز QR */}
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-bold">رمز QR الخاص بالشركة</h2>
          <div ref={qrWrap} className="mx-auto w-fit rounded-2xl bg-white p-4">
            <QRCodeSVG
              value={joinUrl}
              size={260}
              level="H"
              bgColor="#FFFFFF"
              fgColor={p.brand_color}
              imageSettings={p.logo_url ? { src: p.logo_url, height: 54, width: 54, excavate: true } : undefined}
            />
          </div>
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-center text-[11px] font-mono break-all" dir="ltr">
            {joinUrl}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={copyLink}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} نسخ الرابط
            </Button>
            <Button size="sm" className="flex-1 gap-1.5 text-xs" onClick={downloadQR} disabled={!p.id}>
              <Download className="h-3.5 w-3.5" /> تنزيل PNG
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {p.id
              ? "اطبع الرمز وضعه على الطاولات أو الكاشير. عند المسح يسجّل الزبون مرة واحدة فقط، وتُفتح له بطاقة رقمية فيها نقاطه ورصيد محفظته، ويُنشأ له ملف زبون ومحفظة داخل قاعدة بيانات شركتك."
              : "احفظ الإعدادات أولاً حتى يصبح الرمز فعّالاً."}
          </p>
        </Card>
      </div>
    </div>
  );
}
