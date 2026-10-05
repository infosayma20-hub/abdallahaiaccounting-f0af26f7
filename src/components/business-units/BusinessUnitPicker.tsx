import { useEffect, useState } from "react";
import { Store, Layers, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBusinessUnits } from "@/hooks/useBusinessUnits";

/**
 * مساحة العمل حسب النشاط التجاري.
 * - لا يظهر أي شيء إذا للشركة نشاط واحد أو أقل (لا تغيير على الزبائن الحاليين).
 * - أول مرة: نافذة اختيار بطاقات. بعدها: شريحة صغيرة للتبديل.
 */
export default function BusinessUnitPicker({ canSeeAll }: { canSeeAll: boolean }) {
  const { activeUnits, loading, active, setActive } = useBusinessUnits();
  const [open, setOpen] = useState(false);

  const valid = active === "all" ? canSeeAll : activeUnits.some((u) => u.id === active);

  useEffect(() => {
    if (loading || activeUnits.length < 2) return;
    if (!valid) setOpen(true);
  }, [loading, activeUnits.length, valid]);

  if (loading || activeUnits.length < 2) return null;

  const current = activeUnits.find((u) => u.id === active);
  const label = active === "all" ? "كل الأنشطة" : current?.name ?? "اختر النشاط";

  const choose = (id: string) => { setActive(id); setOpen(false); };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2 rounded-full">
        <span className="h-2.5 w-2.5 rounded-full bg-accent" style={current?.color ? { background: current.color } : undefined} />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (valid) setOpen(v); }}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader className="text-right">
            <DialogTitle>اختر مساحة العمل</DialogTitle>
            <DialogDescription>كل نشاط تجاري له أصنافه وفروعه وتقاريره. يمكنك التبديل لاحقًا.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {activeUnits.map((u) => (
              <button
                key={u.id}
                onClick={() => choose(u.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-2 border-border bg-card p-4 text-right transition hover:border-primary",
                  active === u.id && "border-primary",
                )}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  style={u.color ? { background: u.color + "22", color: u.color } : undefined}>
                  <Store className="h-5 w-5" />
                </span>
                <span className="flex-1">
                  <span className="block font-bold text-foreground">{u.name}</span>
                  {u.description && <span className="block text-xs text-muted-foreground">{u.description}</span>}
                </span>
                {active === u.id && <Check className="h-5 w-5 text-primary" />}
              </button>
            ))}
            {canSeeAll && (
              <button
                onClick={() => choose("all")}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/40 p-4 text-right transition hover:border-primary",
                  active === "all" && "border-primary",
                )}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-foreground"><Layers className="h-5 w-5" /></span>
                <span className="flex-1">
                  <span className="block font-bold text-foreground">كل الأنشطة</span>
                  <span className="block text-xs text-muted-foreground">عرض مجمّع للمالك والمحاسب</span>
                </span>
                {active === "all" && <Check className="h-5 w-5 text-primary" />}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
