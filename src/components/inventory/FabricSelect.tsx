import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const NONE = "__none__";
const ADD = "__add_custom__";

interface Props {
  value?: string | null;
  onChange: (v: string | null) => void;
  ownerId?: string | null;
  /** attribute key in product_attribute_options — default 'fabric' */
  attributeKey?: string;
  className?: string;
  placeholder?: string;
}

/**
 * Line-level attribute picker (fabric by default).
 * Options are tenant-scoped rows in `product_attribute_options`.
 * Adding a new name persists it so it becomes reusable on future lines.
 */
export default function FabricSelect({
  value,
  onChange,
  ownerId,
  attributeKey = "fabric",
  className,
  placeholder = "القماش",
}: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("product_attribute_options")
        .select("name")
        .eq("user_id", ownerId)
        .eq("attribute_key", attributeKey)
        .eq("is_active", true)
        .order("sort_order")
        .order("name");
      if (cancelled) return;
      setOptions(((data as any[]) || []).map(r => String(r.name)).filter(Boolean));
    })();
    return () => { cancelled = true; };
  }, [ownerId, attributeKey]);

  const merged = useMemo(() => {
    const list = [...options];
    if (value) list.push(value);
    return Array.from(new Set(list.filter(Boolean)));
  }, [options, value]);

  const commitDraft = async () => {
    const v = draft.trim();
    setAdding(false);
    setDraft("");
    if (!v) return;
    setOptions(prev => (prev.includes(v) ? prev : [...prev, v]));
    onChange(v);
    if (ownerId) {
      await supabase
        .from("product_attribute_options")
        .upsert(
          { user_id: ownerId, attribute_key: attributeKey, name: v } as any,
          { onConflict: "user_id,attribute_key,name" }
        );
    }
  };

  if (adding) {
    return (
      <div className={`flex gap-1 ${className || ""}`}>
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="نوع القماش الجديد..."
          autoFocus
          className="h-8 text-[11px] flex-1"
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); commitDraft(); }
            else if (e.key === "Escape") { setAdding(false); setDraft(""); }
          }}
        />
        <Button type="button" size="icon" variant="default" className="h-8 w-8" onClick={commitDraft}>
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => { setAdding(false); setDraft(""); }}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value || NONE}
      onValueChange={v => {
        if (v === ADD) setAdding(true);
        else onChange(v === NONE ? null : v);
      }}
    >
      <SelectTrigger className={`h-8 text-[11px] ${className || ""}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— بدون قماش —</SelectItem>
        {merged.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
        <div className="border-t border-border my-1" />
        <SelectItem value={ADD}>
          <span className="flex items-center gap-1 text-primary">
            <Plus className="h-3 w-3" /> إضافة نوع قماش
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
