import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NONE = "__none__";
const ADD = "__add_supplier__";

interface Props {
  value?: string | null;
  onChange: (supplierId: string | null) => void;
  suppliers: { id: string; name: string }[];
  /** Persist a new supplier in the procurement directory; returns its id */
  onCreate: (name: string) => Promise<string | null>;
  disabled?: boolean;
}

/**
 * Item-level supplier picker for sales orders. Options come from the
 * procurement suppliers directory (pos_suppliers). The "add" row persists a
 * new supplier and selects it immediately, so the accountant never leaves
 * the order form to seed the directory.
 */
export default function SupplierPicker({ value, onChange, suppliers, onCreate, disabled }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const confirmAdd = async () => {
    const name = draft.trim();
    if (!name || saving) return;
    setSaving(true);
    const id = await onCreate(name);
    setSaving(false);
    if (id) {
      onChange(id);
      setDraft("");
      setAdding(false);
    }
  };

  if (adding) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); confirmAdd(); }
            if (e.key === "Escape") { setAdding(false); setDraft(""); }
          }}
          placeholder="اسم المورد الجديد..."
          className="h-8 text-xs"
        />
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-emerald-600" onClick={confirmAdd} disabled={saving || !draft.trim()}>
          <Check className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={() => { setAdding(false); setDraft(""); }}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => {
        if (v === ADD) { setAdding(true); return; }
        onChange(v === NONE ? null : v);
      }}
      disabled={disabled}
    >
      <SelectTrigger className={cn("h-8 text-xs", value ? "border-emerald-500/50 bg-emerald-500/5" : "")}>
        <SelectValue placeholder="ربط بمورد (لطلبية شراء)" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— بدون مورد —</SelectItem>
        {suppliers.map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
        ))}
        <SelectItem value={ADD} className="text-primary font-semibold">
          <span className="inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> مورد جديد</span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
