import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Bell, Loader2 } from "lucide-react";

type Pref = {
  channel_push: boolean;
  digest_mode: "off" | "hourly" | "daily";
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
};

const DEFAULTS: Pref = {
  channel_push: true,
  digest_mode: "off",
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: "Asia/Hebron",
};

/**
 * Personal notification preferences card.
 * Manages the user's default row (event_type IS NULL) in notification_preferences.
 */
export default function MyNotificationPreferencesCard() {
  const { user } = useAuth();
  const [pref, setPref] = useState<Pref>(DEFAULTS);
  const [rowId, setRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("id, channel_push, digest_mode, quiet_hours_start, quiet_hours_end, timezone")
        .eq("recipient_user_id", user.id)
        .is("event_type", null)
        .maybeSingle();
      if (cancel) return;
      if (!error && data) {
        setRowId(data.id);
        setPref({
          channel_push: data.channel_push,
          digest_mode: (data.digest_mode as Pref["digest_mode"]) ?? "off",
          quiet_hours_start: data.quiet_hours_start,
          quiet_hours_end: data.quiet_hours_end,
          timezone: data.timezone || "Asia/Hebron",
        });
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        recipient_user_id: user.id,
        event_type: null,
        channel_push: pref.channel_push,
        digest_mode: pref.digest_mode,
        quiet_hours_start: pref.quiet_hours_start || null,
        quiet_hours_end: pref.quiet_hours_end || null,
        timezone: pref.timezone || "Asia/Hebron",
      };
      if (rowId) {
        const { error } = await supabase
          .from("notification_preferences")
          .update(payload)
          .eq("id", rowId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("notification_preferences")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        setRowId(data.id);
      }
      toast.success("تم حفظ تفضيلات الإشعارات");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border bg-card" dir="rtl">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          تفضيلات الإشعارات
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
              <div>
                <div className="text-sm font-medium">إشعارات Push</div>
                <div className="text-xs text-muted-foreground">تفعيل أو إيقاف كل إشعارات Push</div>
              </div>
              <Switch
                checked={pref.channel_push}
                onCheckedChange={(v) => setPref((p) => ({ ...p, channel_push: v }))}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">وضع التجميع</Label>
              <Select
                value={pref.digest_mode}
                onValueChange={(v) => setPref((p) => ({ ...p, digest_mode: v as Pref["digest_mode"] }))}
              >
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">فوري — كل إشعار على حدة</SelectItem>
                  <SelectItem value="hourly">كل ساعة — ملخّص</SelectItem>
                  <SelectItem value="daily">يومياً — ملخّص الساعة 8 ص</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                التجميع يدمج عدة إشعارات في رسالة واحدة. الإشعارات العاجلة لا تتأجّل.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">ساعات الهدوء (لا تصل إشعارات داخل هذه النافذة)</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-muted-foreground mb-1">من</div>
                  <Input
                    type="time"
                    value={pref.quiet_hours_start ?? ""}
                    onChange={(e) => setPref((p) => ({ ...p, quiet_hours_start: e.target.value || null }))}
                  />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-1">إلى</div>
                  <Input
                    type="time"
                    value={pref.quiet_hours_end ?? ""}
                    onChange={(e) => setPref((p) => ({ ...p, quiet_hours_end: e.target.value || null }))}
                  />
                </div>
              </div>
              {(pref.quiet_hours_start || pref.quiet_hours_end) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-muted-foreground"
                  onClick={() => setPref((p) => ({ ...p, quiet_hours_start: null, quiet_hours_end: null }))}
                >
                  مسح ساعات الهدوء
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">المنطقة الزمنية</Label>
              <Select
                value={pref.timezone}
                onValueChange={(v) => setPref((p) => ({ ...p, timezone: v }))}
              >
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Hebron">فلسطين (Asia/Hebron)</SelectItem>
                  <SelectItem value="Asia/Jerusalem">القدس (Asia/Jerusalem)</SelectItem>
                  <SelectItem value="Asia/Amman">عمّان (Asia/Amman)</SelectItem>
                  <SelectItem value="Asia/Riyadh">الرياض (Asia/Riyadh)</SelectItem>
                  <SelectItem value="Asia/Dubai">دبي (Asia/Dubai)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={save} disabled={saving} className="w-full h-10">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ التفضيلات"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}