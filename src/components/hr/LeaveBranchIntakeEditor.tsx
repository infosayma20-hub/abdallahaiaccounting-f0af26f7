import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Building2 } from "lucide-react";
import { isLeaveIntakeOpen } from "@/lib/hr/leaveIntake";

/** Per-branch leave intake switches; each branch can differ from the company-wide switch. */
export default function LeaveBranchIntakeEditor({
  ownerId, globalOpen, overrides, onSave,
}: {
  ownerId?: string | null;
  globalOpen: boolean;
  overrides: Record<string, boolean>;
  onSave: (next: Record<string, boolean>) => void;
}) {
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!ownerId) return;
    supabase.from("branches_safe").select("id, name").eq("user_id", ownerId).eq("is_active", true).order("name")
      .then(({ data }) => setBranches(((data as any[]) || []).map((b) => ({ id: b.id, name: b.name }))));
  }, [ownerId]);
  if (branches.length === 0) return null;

  const setBranch = (id: string, open: boolean) => {
    const next = { ...overrides };
    if (open === globalOpen) delete next[id]; else next[id] = open;
    onSave(next);
  };

  return (
    <div className="rounded-lg border p-3 space-y-2" dir="rtl">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">الإجازات حسب الفرع</p>
      </div>
      <p className="text-[11px] text-muted-foreground">
        افتح أو سكّر الإجازات لفرع معيّن. الفرع اللي ما تغيّره بيتبع المفتاح العام فوق.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {branches.map((b) => {
          const open = isLeaveIntakeOpen(globalOpen, overrides, b.id);
          const custom = typeof overrides[b.id] === "boolean";
          return (
            <div key={b.id} className={`flex items-center justify-between rounded-md border px-2 py-1.5 ${open ? "bg-success/5 border-success/30" : "bg-destructive/5 border-destructive/30"}`}>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{b.name}</p>
                <p className="text-[10px] text-muted-foreground">{open ? "مفتوح" : "مغلق"}{custom ? " · مخصص" : " · حسب العام"}</p>
              </div>
              <Switch dir="ltr" checked={open} onCheckedChange={(v) => setBranch(b.id, v)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
