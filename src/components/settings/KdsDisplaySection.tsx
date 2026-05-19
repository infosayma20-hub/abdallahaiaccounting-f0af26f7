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
import { Copy, Plus, Trash2, Volume2, Monitor } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { CompanySettings } from "@/hooks/useCompanySettings";
import { speakOrderCall } from "@/lib/kds-voice";

interface Device {
  id: string;
  name: string;
  device_role: string;
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
      device_role: "customer_display",
      token,
    } as any);
    if (error) { toast.error("تعذر إضافة الجهاز"); return; }
    setNewName(""); setNewBranch("none");
    toast.success("تم إنشاء الجهاز");
    load();
  };

  const removeDevice = async (id: string) => {
    if (!confirm("حذف الجهاز؟ سيتوقف عرضه مباشرة.")) return;
    await supabase.from("pos_display_devices").delete().eq("id", id);
    load();
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/pos/order-display?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success("تم نسخ الرابط");
  };

  return (
    <div className="space-y-5">
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
                <SelectItem value="daily_short">رقم يومي قصير (قريباً)</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
                onClick={() => speakOrderCall(123, { template: settings.pos_voice_template, language: settings.pos_voice_language })}
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
        </div>
      </div>

      <Separator />

      {/* Display devices */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <Monitor className="h-4 w-4 text-primary" />
          أجهزة شاشة العرض للزبائن
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          أضف جهازاً لكل شاشة كبيرة في المطعم. كل جهاز يحصل على رابط فريد افتحه في المتصفح على الشاشة.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_200px_auto] gap-2 mb-4">
          <Input placeholder="اسم الجهاز (مثلاً: شاشة الصالة)" value={newName} onChange={e => setNewName(e.target.value)} />
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
                <div className="font-medium text-sm">{d.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {d.branch_id ? branches.find(b => b.id === d.branch_id)?.name || "فرع" : "كل الفروع"}
                  {d.last_seen_at && ` · آخر اتصال: ${new Date(d.last_seen_at).toLocaleString("ar-PS")}`}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => copyLink(d.token)} className="gap-1">
                <Copy className="h-3.5 w-3.5" /> نسخ الرابط
              </Button>
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