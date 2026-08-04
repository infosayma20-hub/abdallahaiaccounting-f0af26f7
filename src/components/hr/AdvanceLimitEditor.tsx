import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Wallet, X, Search } from "lucide-react";

type Props = {
  maxAmount: number | null;
  exemptIds: string[];
  onSave: (patch: { hr_advance_max_amount?: number | null; hr_advance_limit_exempt_employees?: string[] }) => void;
};

/**
 * HR-side editor for the advance (سلفة) ceiling + per-employee exceptions.
 * A null/0 ceiling means "no limit" → identical to the legacy behavior.
 */
export default function AdvanceLimitEditor({ maxAmount, exemptIds, onSave }: Props) {
  const { dataOwnerId } = useDataOwnerId();
  const [draft, setDraft] = useState<string>(maxAmount ? String(maxAmount) : "");
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => { setDraft(maxAmount ? String(maxAmount) : ""); }, [maxAmount]);

  useEffect(() => {
    if (!dataOwnerId) return;
    (supabase as any)
      .from("employees")
      .select("id, full_name")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }: any) => setEmployees(data || []));
  }, [dataOwnerId]);

  const enabled = maxAmount !== null && maxAmount > 0;
  const nameOf = (id: string) => employees.find(e => e.id === id)?.full_name || "موظف";
  const results = useMemo(() => {
    const t = q.trim();
    if (!t) return [];
    return employees.filter(e => (e.full_name || "").includes(t) && !exemptIds.includes(e.id)).slice(0, 6);
  }, [q, employees, exemptIds]);

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-warning/5 border-warning/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-warning" />
          <div>
            <p className="text-sm font-medium">سقف مبلغ السلفة</p>
            <p className="text-[10px] text-muted-foreground">
              {enabled
                ? `الموظف ما يقدر يطلب أكثر من ${maxAmount} ₪ — إلا المستثنين أدناه.`
                : "غير مفعّل — لا يوجد حد أعلى لمبلغ السلفة."}
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={v => onSave({ hr_advance_max_amount: v ? 500 : null })}
        />
      </div>

      {enabled && (
        <div className="space-y-3 pt-2 border-t border-warning/20">
          <div className="flex items-end gap-2">
            <div className="w-40">
              <label className="text-[11px] text-muted-foreground mb-1 block">الحد الأعلى (₪)</label>
              <Input
                type="number"
                min={1}
                step="0.5"
                dir="ltr"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={() => {
                  const n = parseFloat(draft);
                  if (!isNaN(n) && n > 0 && n !== maxAmount) onSave({ hr_advance_max_amount: n });
                  else setDraft(maxAmount ? String(maxAmount) : "");
                }}
                className="h-9"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">استثناءات (موظفون يتجاوزون السقف)</label>
            {exemptIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {exemptIds.map(id => (
                  <Badge key={id} variant="outline" className="gap-1 text-[11px]">
                    {nameOf(id)}
                    <button
                      type="button"
                      onClick={() => onSave({ hr_advance_limit_exempt_employees: exemptIds.filter(x => x !== id) })}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="absolute right-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="ابحث باسم الموظف لإضافة استثناء..."
                className="h-9 pr-7 text-xs"
              />
            </div>
            {results.length > 0 && (
              <div className="mt-1 border rounded-md bg-background divide-y">
                {results.map(e => (
                  <Button
                    key={e.id}
                    type="button"
                    variant="ghost"
                    className="w-full justify-start h-8 text-xs rounded-none"
                    onClick={() => { onSave({ hr_advance_limit_exempt_employees: [...exemptIds, e.id] }); setQ(""); }}
                  >
                    {e.full_name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
