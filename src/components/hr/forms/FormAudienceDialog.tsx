import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, Eye, PenLine, Users } from "lucide-react";
import { useFormAudience, type FormRef } from "@/hooks/hr/useFormAudience";

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير نظام",
  super_admin: "مدير عام",
  hr_manager: "موارد بشرية",
  employee: "موظف",
  cashier: "كاشير",
  call_center: "كول سنتر",
  sales_rep: "مندوب مبيعات",
  supervisor: "مشرف",
  worker: "عامل",
  accountant_senior: "محاسب أول",
  accountant_sales: "محاسب مبيعات",
  accountant_purchases: "محاسب مشتريات",
  branch_scheduler: "جدولة فروع",
  portal: "بوابة",
};

/**
 * إدارة «جمهور النموذج»: من يعبّئ ومن يطّلع — من داخل النموذج نفسه.
 * الصلاحيات المشتقّة من المسمى الوظيفي تظهر للقراءة فقط.
 */
export default function FormAudienceDialog({
  form,
  open,
  onOpenChange,
  onSaved,
}: {
  form: FormRef | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
}) {
  const { rows, loading, saving, setAccess } = useFormAudience(open ? form : null);
  const [q, setQ] = useState("");
  const [onlyWithAccess, setOnlyWithAccess] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyWithAccess && !r.can_view && !r.can_fill) return false;
      if (!needle) return true;
      return (
        r.full_name?.toLowerCase().includes(needle) ||
        (r.job_title || "").toLowerCase().includes(needle) ||
        (r.branch_name || "").toLowerCase().includes(needle) ||
        r.roles.some((x) => (ROLE_LABELS[x] || x).toLowerCase().includes(needle))
      );
    });
  }, [rows, q, onlyWithAccess]);

  const fillCount = rows.filter((r) => r.can_fill).length;
  const viewCount = rows.filter((r) => r.can_view).length;

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const bulk = async (level: "fill" | "view", enabled: boolean) => {
    await setAccess(Array.from(selected), level, enabled);
    setSelected(new Set());
    onSaved?.();
  };

  const single = async (id: string, level: "fill" | "view", enabled: boolean) => {
    await setAccess([id], level, enabled);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            جمهور النموذج — {form?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <Badge variant="secondary" className="gap-1"><PenLine className="h-3 w-3" /> تعبئة: {fillCount}</Badge>
          <Badge variant="secondary" className="gap-1"><Eye className="h-3 w-3" /> اطلاع: {viewCount}</Badge>
          <span className="text-muted-foreground">من أصل {rows.length} موظف</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث بالاسم أو المسمى أو الفرع أو الصلاحية..."
              className="pr-8 h-9"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={onlyWithAccess} onCheckedChange={setOnlyWithAccess} />
            الممنوحون فقط
          </label>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap p-2 rounded-lg bg-muted/50 text-xs">
            <span className="font-medium">{selected.size} محدد</span>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => bulk("fill", true)}>منح تعبئة</Button>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => bulk("fill", false)}>سحب تعبئة</Button>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => bulk("view", true)}>منح اطلاع</Button>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => bulk("view", false)}>سحب اطلاع</Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto -mx-2 px-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري التحميل...
            </div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">لا يوجد موظفون مطابقون.</p>
          ) : (
            <div className="space-y-1.5">
              {visible.map((r) => {
                const derivedFill = r.fill_source === "job_title";
                return (
                  <div key={r.employee_id} className="flex items-center gap-3 p-2.5 rounded-xl border border-border">
                    <Checkbox
                      checked={selected.has(r.employee_id)}
                      onCheckedChange={() => toggleSelect(r.employee_id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{r.full_name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {[r.job_title, r.branch_name].filter(Boolean).join(" · ") || "—"}
                      </div>
                      {r.roles.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-1">
                          {r.roles.map((x) => (
                            <Badge key={x} variant="outline" className="text-[9px] px-1.5 py-0">
                              {ROLE_LABELS[x] || x}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <label className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground">
                        تعبئة
                        <Switch
                          checked={r.can_fill}
                          disabled={saving || derivedFill}
                          onCheckedChange={(v) => single(r.employee_id, "fill", v)}
                        />
                        {derivedFill && <span className="text-[9px]">مسمى وظيفي</span>}
                      </label>
                      <label className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground">
                        اطلاع
                        <Switch
                          checked={r.can_view}
                          disabled={saving || r.can_fill}
                          onCheckedChange={(v) => single(r.employee_id, "view", v)}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
