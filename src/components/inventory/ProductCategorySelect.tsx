import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_CATEGORIES = ["بضاعة عامة", "مواد خام", "مواد تعبئة", "قطع غيار", "أخرى"];

interface Props {
  value: string;
  onChange: (v: string) => void;
  ownerId?: string;
}

/**
 * Category picker for products.
 * Shows: default categories + any distinct `products.category` already saved
 * for this tenant + an "add custom" affordance that saves the new value into
 * the current product (and it will appear in the list next time because it's
 * fetched from DB).
 */
export default function ProductCategorySelect({ value, onChange, ownerId }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [dbCats, setDbCats] = useState<string[]>([]);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("category")
        .eq("user_id", ownerId)
        .not("category", "is", null)
        .limit(2000);
      if (cancelled) return;
      const uniq = Array.from(
        new Set(((data as any[]) || []).map(r => String(r.category || "").trim()).filter(Boolean))
      );
      setDbCats(uniq);
    })();
    return () => { cancelled = true; };
  }, [ownerId]);

  const options = useMemo(() => {
    const merged = [...DEFAULT_CATEGORIES, ...dbCats];
    if (value) merged.push(value);
    return Array.from(new Set(merged.filter(Boolean)));
  }, [dbCats, value]);

  const commitDraft = () => {
    const v = draft.trim();
    if (v) onChange(v);
    setAdding(false);
    setDraft("");
  };

  if (adding) {
    return (
      <div className="flex gap-1">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="اسم التصنيف الجديد..."
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
      <SelectTrigger><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
      <SelectContent>
        {options.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        <div className="border-t border-border my-1" />
        <SelectItem value="__add_custom__">
          <span className="flex items-center gap-1 text-primary">
            <Plus className="h-3 w-3" /> إضافة تصنيف جديد
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}