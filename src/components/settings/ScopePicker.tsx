import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, Warehouse } from "lucide-react";

export interface ScopeSelection {
  branchIds: string[];
  warehouseIds: string[];
}

interface BranchRow { id: string; name: string }
interface WarehouseRow { id: string; name: string; branch_id: string | null }

/**
 * Branch / warehouse scope picker.
 *
 * Selecting a branch implicitly grants every warehouse that belongs to it
 * (enforced server-side by `user_allowed_warehouse_ids`), so warehouses of a
 * selected branch are shown as covered and locked.
 * Empty selection = full access (no restriction) — matches the DB behaviour.
 */
export default function ScopePicker({
  value,
  onChange,
}: {
  value: ScopeSelection;
  onChange: (v: ScopeSelection) => void;
}) {
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [b, w] = await Promise.all([
        supabase.from("branches").select("id,name").eq("is_active", true).order("name"),
        supabase.from("warehouses").select("id,name,branch_id").eq("is_active", true).order("name"),
      ]);
      setBranches((b.data as BranchRow[]) || []);
      setWarehouses((w.data as WarehouseRow[]) || []);
      setLoading(false);
    })();
  }, []);

  const coveredByBranch = useMemo(
    () => new Set(warehouses.filter(w => w.branch_id && value.branchIds.includes(w.branch_id)).map(w => w.id)),
    [warehouses, value.branchIds],
  );

  const toggleBranch = (id: string) => {
    const next = value.branchIds.includes(id)
      ? value.branchIds.filter(x => x !== id)
      : [...value.branchIds, id];
    // drop explicit warehouse grants now covered by the branch
    const covered = new Set(warehouses.filter(w => w.branch_id && next.includes(w.branch_id)).map(w => w.id));
    onChange({ branchIds: next, warehouseIds: value.warehouseIds.filter(x => !covered.has(x)) });
  };

  const toggleWarehouse = (id: string) => {
    onChange({
      branchIds: value.branchIds,
      warehouseIds: value.warehouseIds.includes(id)
        ? value.warehouseIds.filter(x => x !== id)
        : [...value.warehouseIds, id],
    });
  };

  const total = value.branchIds.length + value.warehouseIds.length;

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {total === 0
            ? "بدون تحديد = وصول كامل لجميع الفروع والمستودعات"
            : "المستخدم يقدر يعمل حركات على المحدد فقط"}
        </span>
        {total > 0 && <Badge variant="outline" className="text-[11px]">{total} مُحدد</Badge>}
      </div>

      <div className="rounded-lg border border-border divide-y divide-border max-h-64 overflow-auto">
        <div className="p-2 bg-muted/30 text-xs font-medium flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" /> الفروع
        </div>
        {branches.length === 0 && <p className="p-3 text-xs text-muted-foreground">لا توجد فروع</p>}
        {branches.map(b => (
          <label key={b.id} className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/30">
            <Checkbox checked={value.branchIds.includes(b.id)} onCheckedChange={() => toggleBranch(b.id)} />
            <span className="text-sm">{b.name}</span>
          </label>
        ))}

        <div className="p-2 bg-muted/30 text-xs font-medium flex items-center gap-1.5">
          <Warehouse className="h-3.5 w-3.5" /> المستودعات
        </div>
        {warehouses.length === 0 && <p className="p-3 text-xs text-muted-foreground">لا توجد مستودعات</p>}
        {warehouses.map(w => {
          const covered = coveredByBranch.has(w.id);
          return (
            <label
              key={w.id}
              className={`flex items-center gap-2 p-2 hover:bg-muted/30 ${covered ? "opacity-60" : "cursor-pointer"}`}
            >
              <Checkbox
                checked={covered || value.warehouseIds.includes(w.id)}
                disabled={covered}
                onCheckedChange={() => !covered && toggleWarehouse(w.id)}
              />
              <span className="text-sm">{w.name}</span>
              {covered && <span className="text-[10px] text-muted-foreground">(ضمن الفرع المحدد)</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** Load a user's saved scope. */
export async function loadUserScope(userId: string): Promise<ScopeSelection> {
  const { data } = await supabase
    .from("user_scope_access")
    .select("branch_id,warehouse_id")
    .eq("user_id", userId);
  return {
    branchIds: (data || []).filter(r => r.branch_id).map(r => r.branch_id as string),
    warehouseIds: (data || []).filter(r => r.warehouse_id).map(r => r.warehouse_id as string),
  };
}

/** Replace a user's scope with the given selection. */
export async function saveUserScope(userId: string, sel: ScopeSelection, createdBy?: string | null) {
  const { error: delErr } = await supabase.from("user_scope_access").delete().eq("user_id", userId);
  if (delErr) throw delErr;
  const rows = [
    ...sel.branchIds.map(id => ({ user_id: userId, branch_id: id, created_by: createdBy ?? null })),
    ...sel.warehouseIds.map(id => ({ user_id: userId, warehouse_id: id, created_by: createdBy ?? null })),
  ];
  if (rows.length === 0) return;
  const { error } = await supabase.from("user_scope_access").insert(rows as any);
  if (error) throw error;
}
