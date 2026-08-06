/** إعدادات أهداف زمن التحضير: هدف افتراضي + هدف لكل فئة + تعليم «جاهز فوراً». */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";

interface Row { category_id: string; name: string; target_minutes: number; is_instant: boolean }

export default function PrepSlaSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { dataOwnerId } = useDataOwnerId();
  const [defaultMinutes, setDefaultMinutes] = useState(8);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !dataOwnerId) return;
    (async () => {
      const [{ data: cats }, { data: sla }] = await Promise.all([
        supabase.from("pos_categories").select("id, name").eq("user_id", dataOwnerId).eq("is_active", true).order("name"),
        supabase.from("pos_prep_sla").select("scope, category_id, target_minutes, is_instant").eq("user_id", dataOwnerId),
      ]);
      const def = (sla || []).find((s: any) => s.scope === "default");
      setDefaultMinutes(def?.target_minutes ?? 8);
      setRows((cats || []).map((c: any) => {
        const s = (sla || []).find((x: any) => x.scope === "category" && x.category_id === c.id) as any;
        return { category_id: c.id, name: c.name, target_minutes: s?.target_minutes ?? (def?.target_minutes ?? 8), is_instant: !!s?.is_instant };
      }));
    })();
  }, [open, dataOwnerId]);

  const save = async () => {
    if (!dataOwnerId) return;
    setSaving(true);
    try {
      await supabase.from("pos_prep_sla").delete().eq("user_id", dataOwnerId).in("scope", ["default", "category"]);
      const payload = [
        { user_id: dataOwnerId, scope: "default", target_minutes: defaultMinutes, is_instant: false },
        ...rows.map(r => ({
          user_id: dataOwnerId, scope: "category", category_id: r.category_id,
          target_minutes: r.target_minutes, is_instant: r.is_instant,
        })),
      ];
      const { error } = await supabase.from("pos_prep_sla").insert(payload as any);
      if (error) throw error;
      toast.success("تم حفظ أهداف زمن التحضير");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle>أهداف زمن التحضير</DialogTitle></DialogHeader>

        <div className="flex items-center gap-3">
          <Label className="text-sm w-40">الهدف الافتراضي (دقيقة)</Label>
          <Input type="number" min={1} max={60} value={defaultMinutes}
            onChange={e => setDefaultMinutes(Number(e.target.value) || 1)} className="w-24" />
        </div>

        <div className="max-h-[45vh] overflow-y-auto space-y-2 pt-2">
          {rows.map((r, i) => (
            <div key={r.category_id} className="flex items-center gap-2 border rounded-lg px-3 py-2">
              <span className="text-sm flex-1 truncate">{r.name}</span>
              <Input type="number" min={0} max={60} value={r.target_minutes} disabled={r.is_instant}
                onChange={e => setRows(p => p.map((x, j) => j === i ? { ...x, target_minutes: Number(e.target.value) || 0 } : x))}
                className="w-20" />
              <div className="flex items-center gap-1.5">
                <Switch checked={r.is_instant}
                  onCheckedChange={v => setRows(p => p.map((x, j) => j === i ? { ...x, is_instant: v } : x))} />
                <span className="text-xs text-muted-foreground">فوري</span>
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">لا توجد فئات</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? "جارِ الحفظ…" : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
