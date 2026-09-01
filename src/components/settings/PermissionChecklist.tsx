import { useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  allPermKeys,
  permGroupsForKind,
  presetsForKind,
  type PermPreset,
} from "@/lib/permissions/permissionCatalog";

interface Props {
  kind: "accountant" | "hr_manager";
  /** App role — used to highlight the matching preset. */
  role?: string;
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  /** Optional free-text filter over permission labels. */
  query?: string;
}

/**
 * Grouped, searchable permission toggles driven by the central catalog.
 * Shared by the Add-User dialog, the per-user permissions dialog and
 * TeamAccountManager so every screen stays in sync automatically.
 */
export default function PermissionChecklist({ kind, role, value, onChange, query }: Props) {
  const groups = permGroupsForKind(kind);
  const presets = presetsForKind(kind);
  const q = (query || "").trim();

  const filtered = useMemo(() => {
    if (!q) return groups;
    return groups
      .map(g => ({ ...g, items: g.items.filter(i => i.label.includes(q) || i.key.includes(q)) }))
      .filter(g => g.items.length > 0);
  }, [groups, q]);

  const applyPreset = (preset: PermPreset) => {
    const next: Record<string, boolean> = {};
    allPermKeys(kind).forEach(k => { next[k] = preset.keys.includes(k); });
    onChange(next);
  };

  const setAll = (on: boolean) => {
    const next: Record<string, boolean> = {};
    allPermKeys(kind).forEach(k => { next[k] = on; });
    onChange(next);
  };

  const toggleGroup = (keys: string[], on: boolean) => {
    const next = { ...value };
    keys.forEach(k => { next[k] = on; });
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map(p => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={role === p.id ? "secondary" : "outline"}
            className="h-7 text-xs"
            onClick={() => applyPreset(p)}
          >
            {p.label}
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAll(true)}>
          تحديد الكل
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAll(false)}>
          إلغاء الكل
        </Button>
      </div>

      {filtered.map(g => {
        const keys = g.items.map(i => i.key);
        const onCount = keys.filter(k => value[k]).length;
        return (
          <div key={g.group} className="rounded-lg border border-border/60 overflow-hidden">
            <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{g.group}</span>
                <Badge variant="outline" className="text-[10px]">{onCount}/{keys.length}</Badge>
              </div>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => toggleGroup(keys, true)}>
                  الكل
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => toggleGroup(keys, false)}>
                  لا شيء
                </Button>
              </div>
            </div>
            <div className="divide-y divide-border/40">
              {g.items.map(item => (
                <label
                  key={item.key}
                  className="flex items-start justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-muted/20"
                >
                  <div className="min-w-0">
                    <p className="text-sm">{item.label}</p>
                    {item.hint && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{item.hint}</p>
                    )}
                  </div>
                  <Switch
                    checked={!!value[item.key]}
                    onCheckedChange={v => onChange({ ...value, [item.key]: v })}
                  />
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
