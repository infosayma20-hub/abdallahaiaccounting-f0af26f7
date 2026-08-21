import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { MessageSquareWarning, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  employeeName: string;
  authUserId: string | null;
}

// Read-only visibility of customer complaints (same screen as the owner portal)
const PERMS: Array<{ feature: string; perm: string }> = [
  { feature: "complaints", perm: "view" },
];
const APP = "call_center_feedback";

export default function ComplaintsToggleSection({ employeeName, authUserId }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!authUserId) { setEnabled(false); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("user_feature_permissions")
        .select("feature_key, permission_key, access_state")
        .eq("target_user_id", authUserId)
        .eq("app_key", APP);
      const allowSet = new Set(
        (data || []).filter((r: any) => r.access_state === "allow")
          .map((r: any) => `${r.feature_key}.${r.permission_key}`)
      );
      setEnabled(PERMS.every(p => allowSet.has(`${p.feature}.${p.perm}`)));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [authUserId]);

  const handleToggle = async (checked: boolean) => {
    if (!authUserId) { toast.error("يلزم إنشاء حساب دخول للموظف أولاً"); return; }
    setSaving(true);
    try {
      for (const p of PERMS) {
        const { error } = await supabase.functions.invoke("manage-user-app-access", {
          body: {
            action: checked ? "upsert_feature" : "reset_feature",
            target_user_id: authUserId,
            app_key: APP,
            feature_key: p.feature,
            permission_key: p.perm,
            access_state: checked ? "allow" : "inherit",
          },
        });
        if (error) throw error;
      }
      toast.success(checked
        ? `تم تفعيل الاطلاع على شكاوى الزبائن لـ ${employeeName}`
        : "تم إيقاف صلاحية شكاوى الزبائن");
      setEnabled(checked);
    } catch (e: any) {
      toast.error(e.message || "فشل التحديث");
    } finally { setSaving(false); }
  };

  const disabled = loading || saving || !authUserId;

  return (
    <div className="flex items-center gap-2">
      <Switch checked={enabled} disabled={disabled} onCheckedChange={handleToggle} />
      <label className="text-xs font-medium flex items-center gap-1">
        <MessageSquareWarning className="h-3.5 w-3.5 text-amber-600" /> شكاوى الزبائن
      </label>
      {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      {enabled && (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] border-amber-200">
          مفعّل
        </Badge>
      )}
    </div>
  );
}
