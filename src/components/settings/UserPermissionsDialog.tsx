import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import PermissionChecklist from "@/components/settings/PermissionChecklist";
import {
  allPermKeys,
  defaultPermsForRole,
  permTableForKind,
  permissionKindForRole,
} from "@/lib/permissions/permissionCatalog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetUserId: string;
  targetName: string;
  targetEmail?: string | null;
  role: string;
  onSaved?: () => void;
}

/**
 * Owner-facing editor for the granular accountant / HR permission matrix
 * of an existing team user. Reads and writes the row keyed by the target's
 * auth id in `accountant_permissions` / `hr_manager_permissions`.
 */
export default function UserPermissionsDialog({
  open, onOpenChange, targetUserId, targetName, targetEmail, role, onSaved,
}: Props) {
  const { user } = useAuth();
  const kind = permissionKindForRole(role);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");

  const idColumn = kind === "accountant" ? "accountant_auth_id" : "hr_auth_id";

  useEffect(() => {
    if (!open || !kind) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from(permTableForKind(kind) as any)
        .select("*")
        .eq(idColumn, targetUserId)
        .maybeSingle();
      if (cancelled) return;
      const base = data
        ? Object.fromEntries(allPermKeys(kind).map(k => [k, (data as any)[k] === true]))
        : defaultPermsForRole(role);
      setPerms(base);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, kind, targetUserId, role, idColumn]);

  const enabledCount = useMemo(
    () => Object.values(perms).filter(Boolean).length,
    [perms],
  );

  const save = async () => {
    if (!kind || !user) return;
    setSaving(true);
    try {
      const table = permTableForKind(kind);
      const { data: existing } = await supabase
        .from(table as any)
        .select("id")
        .eq(idColumn, targetUserId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from(table as any)
          .update({ ...perms, updated_at: new Date().toISOString() })
          .eq("id", (existing as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table as any).insert({
          user_id: user.id,
          [idColumn]: targetUserId,
          full_name: targetName,
          email: targetEmail || "",
          is_active: true,
          ...perms,
        });
        if (error) throw error;
      }

      await supabase.from("activity_log").insert({
        user_id: user.id,
        actor_id: user.id,
        actor_name: user.email || "",
        action: "update_user_permissions",
        entity_type: "user",
        entity_id: targetUserId,
        entity_label: targetName,
        details: { role, enabled: enabledCount },
      } as any);

      toast.success("تم حفظ الصلاحيات");
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "فشل حفظ الصلاحيات");
    }
    setSaving(false);
  };

  if (!kind) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>الصلاحيات التفصيلية</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            الصلاحيات التفصيلية متاحة لحسابات المحاسبين ومدراء الموارد البشرية فقط.
            للأدوار الأخرى استخدم «وصول التطبيقات» و«النطاق».
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            صلاحيات {targetName}
            <Badge variant="secondary" className="text-xs">{enabledCount} مفعّلة</Badge>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="ابحث عن صلاحية..."
                className="pr-9"
              />
            </div>
            <PermissionChecklist
              kind={kind}
              role={role}
              value={perms}
              onChange={setPerms}
              query={query}
            />
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? "جارِ الحفظ..." : "حفظ الصلاحيات"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
