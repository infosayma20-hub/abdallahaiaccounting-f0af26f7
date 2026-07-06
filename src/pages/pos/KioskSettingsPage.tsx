import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, ExternalLink, Save, Monitor } from "lucide-react";

interface Branch { id: string; name: string; }
interface KioskSettingsRow {
  id?: string;
  branch_id: string;
  is_active: boolean;
  exit_pin: string;
  default_language: string;
  welcome_image_url: string | null;
  logo_url: string | null;
  primary_color: string;
  idle_timeout_seconds: number;
  require_phone: boolean;
  require_name: boolean;
}

const defaultRow = (branchId: string): KioskSettingsRow => ({
  branch_id: branchId,
  is_active: true,
  exit_pin: "1234",
  default_language: "ar",
  welcome_image_url: null,
  logo_url: null,
  primary_color: "#E53935",
  idle_timeout_seconds: 60,
  require_phone: true,
  require_name: true,
});

export default function KioskSettingsPage() {
  const { dataOwnerId } = useDataOwnerId();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [row, setRow] = useState<KioskSettingsRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dataOwnerId) return;
    supabase.from("branches").select("id,name").eq("user_id", dataOwnerId).eq("is_active", true).then(({ data }) => {
      const bs = (data as any) || [];
      setBranches(bs);
      if (bs.length && !branchId) setBranchId(bs[0].id);
    });
  }, [dataOwnerId]);

  useEffect(() => {
    if (!dataOwnerId || !branchId) return;
    supabase.from("kiosk_settings" as any).select("*").eq("user_id", dataOwnerId).eq("branch_id", branchId).maybeSingle()
      .then(({ data }) => setRow(data ? (data as any) : defaultRow(branchId)));
  }, [dataOwnerId, branchId]);

  const save = async () => {
    if (!dataOwnerId || !row) return;
    setSaving(true);
    const payload: any = { ...row, user_id: dataOwnerId, branch_id: branchId };
    const { error } = row.id
      ? await supabase.from("kiosk_settings" as any).update(payload).eq("id", row.id)
      : await supabase.from("kiosk_settings" as any).upsert(payload, { onConflict: "user_id,branch_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("تم الحفظ"); }
  };

  const PUBLIC_BASE = "https://amwali.app";
  const kioskUrl = branchId ? `${PUBLIC_BASE}/kiosk/${branchId}` : "";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Monitor className="h-8 w-8 text-primary" />
        <h1 className="text-2xl font-black">إعدادات KIOSK</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>اختر الفرع</CardTitle></CardHeader>
        <CardContent>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger><SelectValue placeholder="اختر فرع" /></SelectTrigger>
            <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      {row && (
        <>
          <Card>
            <CardHeader><CardTitle>الإعدادات العامة</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><Label className="font-bold">تفعيل الكيوسك</Label><p className="text-sm text-muted-foreground">عند التعطيل الكيوسك لن يعمل</p></div>
                <Switch checked={row.is_active} onCheckedChange={v => setRow({ ...row, is_active: v })} />
              </div>
              <div>
                <Label>رمز الخروج (PIN)</Label>
                <Input value={row.exit_pin} onChange={e => setRow({ ...row, exit_pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" maxLength={6} />
              </div>
              <div>
                <Label>اللغة الافتراضية</Label>
                <Select value={row.default_language} onValueChange={v => setRow({ ...row, default_language: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">العربية</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>مدة الخمول قبل إعادة الشاشة (بالثواني)</Label>
                <Input type="number" min={20} max={600} value={row.idle_timeout_seconds} onChange={e => setRow({ ...row, idle_timeout_seconds: Math.max(20, Number(e.target.value) || 60) })} />
              </div>
              <div>
                <Label>اللون الأساسي</Label>
                <div className="flex gap-2">
                  <input type="color" value={row.primary_color} onChange={e => setRow({ ...row, primary_color: e.target.value })} className="h-10 w-16 rounded border" />
                  <Input value={row.primary_color} onChange={e => setRow({ ...row, primary_color: e.target.value })} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>بيانات العميل</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>طلب الاسم</Label>
                <Switch checked={row.require_name} onCheckedChange={v => setRow({ ...row, require_name: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>طلب رقم الجوال</Label>
                <Switch checked={row.require_phone} onCheckedChange={v => setRow({ ...row, require_phone: v })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>الصور</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>رابط الشعار (logo)</Label>
                <Input value={row.logo_url || ""} onChange={e => setRow({ ...row, logo_url: e.target.value || null })} placeholder="https://..." />
              </div>
              <div>
                <Label>رابط صورة الشاشة الترحيبية</Label>
                <Input value={row.welcome_image_url || ""} onChange={e => setRow({ ...row, welcome_image_url: e.target.value || null })} placeholder="https://..." />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>رابط الكيوسك</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">افتح هذا الرابط على جهاز الكيوسك بوضع ملء الشاشة (F11):</p>
              <div className="flex gap-2">
                <Input readOnly value={kioskUrl} className="font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(kioskUrl); toast.success("تم النسخ"); }}><Copy className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" asChild><a href={kioskUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button size="lg" onClick={save} disabled={saving}><Save className="h-4 w-4 me-2" />{saving ? "..." : "حفظ الإعدادات"}</Button>
          </div>
        </>
      )}
    </div>
  );
}