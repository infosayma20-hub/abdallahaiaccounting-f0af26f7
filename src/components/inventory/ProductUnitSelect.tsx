import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_UNITS = ["قطعة", "متر", "متر مربع", "كيلو", "لتر", "علبة", "كرتونة", "طن"];

interface Props {
  value: string;
  onChange: (v: string) => void;
  ownerId?: string;
}

/**
 * Basic unit picker for products — mirrors ProductCategorySelect UX.
 * Shows defaults + any distinct `products.unit` already saved for this tenant
 * + inline "add custom unit" affordance.
 */
export default function ProductUnitSelect({ value, onChange, ownerId }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [dbUnits, setDbUnits] = useState<string[]>([]);
  const [localUnits, setLocalUnits] = useState<string[]>([]);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("unit")
        .eq("user_id", ownerId)
        .not("unit", "is", null)
        .limit(2000);
      if (cancelled) return;
      const uniq = Array.from(
        new Set(((data as any[]) || []).map(r => String(r.unit || "").trim()).filter(Boolean))
      );
      setDbUnits(uniq);
    })();
    return () => { cancelled = true; };
  }, [ownerId]);

  const options = useMemo(() => {
    const merged = [...DEFAULT_UNITS, ...dbUnits, ...localUnits];
    if (value) merged.push(value);
    return Array.from(new Set(merged.filter(Boolean)));
  }, [dbUnits, localUnits, value]);

  const commitDraft = () => {
    const v = draft.trim();
    if (v) {
      setLocalUnits(prev => (prev.includes(v) ? prev : [...prev, v]));
      onChange(v);
    }
    setAdding(false);
    setDraft("");
  };

  if (adding) {
    return (
      <div className="flex gap-1">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="اسم الوحدة الجديدة..."
          autoFocus
          className="h-9 text-xs flex-1"
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); commitDraft(); }
            else if (e.key === "Escape") { setAdding(false); setDraft(""); }
          }}
        />
        <Button type="button" size="icon" variant="default" className="h-9 w-9" onClick={commitDraft}>
          <Check className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="outline" className="h-9 w-9" onClick={() => { setAdding(false); setDraft(""); }}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={v => {
        if (v === "__add_custom__") setAdding(true);
        else onChange(v);
      }}
    >
      <SelectTrigger><SelectValue placeholder="اختر الوحدة" /></SelectTrigger>
      <SelectContent>
        {options.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
        <div className="border-t border-border my-1" />
        <SelectItem value="__add_custom__">
          <span className="flex items-center gap-1 text-primary">
            <Plus className="h-3 w-3" /> إضافة وحدة جديدة
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}