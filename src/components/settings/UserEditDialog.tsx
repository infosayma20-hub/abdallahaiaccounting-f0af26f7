import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, UserCog } from "lucide-react";
import ScopePicker, { loadUserScope, saveUserScope, type ScopeSelection } from "./ScopePicker";

/**
 * Unified per-user editor: display name + branch/warehouse scope.
 * Name changes go through the `manage-team-user` edge function (service role,
 * tenant-checked); scope rows are written client-side under RLS.
 */
export default function UserEditDialog({
  open,
  onOpenChange,
  targetUserId,
  targetName,
  actorId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetUserId: string;
  targetName: string;
  actorId?: string | null;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(targetName);
  const [sel, setSel] = useState<ScopeSelection>({ branchIds: [], warehouseIds: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(targetName);
    setLoading(true);
    loadUserScope(targetUserId)
      .then(setSel)
      .finally(() => setLoading(false));
  }, [open, targetUserId, targetName]);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("الاسم مطلوب (حرفان على الأقل)");
      return;
    }
    setSaving(true);
    try {
      if (trimmed !== targetName) {
        const { data, error } = await supabase.functions.invoke("manage-team-user", {
          body: { action: "update_profile", target_user_id: targetUserId, display_name: trimmed },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      }
      await saveUserScope(targetUserId, sel, actorId);
      toast.success("تم حفظ بيانات المستخدم");
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "فشل الحفظ");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            تعديل المستخدم
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>الاسم</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="اسم المستخدم" />
            </div>
            <div className="space-y-1.5">
              <Label>الفرع والمستودع المسموح</Label>
              <ScopePicker value={sel} onChange={setSel} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving || loading} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
