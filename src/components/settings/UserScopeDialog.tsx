import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import ScopePicker, { loadUserScope, saveUserScope, type ScopeSelection } from "./ScopePicker";

export default function UserScopeDialog({
  open,
  onOpenChange,
  targetUserId,
  targetName,
  actorId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetUserId: string;
  targetName: string;
  actorId?: string | null;
}) {
  const [sel, setSel] = useState<ScopeSelection>({ branchIds: [], warehouseIds: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) loadUserScope(targetUserId).then(setSel);
  }, [open, targetUserId]);

  const save = async () => {
    setSaving(true);
    try {
      await saveUserScope(targetUserId, sel, actorId);
      toast.success("تم حفظ نطاق الفروع والمستودعات");
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
            <MapPin className="h-5 w-5" />
            نطاق الفروع والمستودعات — {targetName}
          </DialogTitle>
        </DialogHeader>
        <ScopePicker value={sel} onChange={setSel} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? "جارِ الحفظ..." : "حفظ النطاق"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
