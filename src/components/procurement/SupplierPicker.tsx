import { useEffect, useMemo, useState, useCallback } from "react";
import { Check, ChevronDown, Loader2, Search, Star } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Supplier = { id: string; name: string };
type Contact = { id: string; contact_name: string; contact_type: string | null; phone: string | null };

const favKey = (ownerId?: string | null) => `unify:fav-po-contacts:${ownerId || "anon"}`;
const readFavs = (ownerId?: string | null): string[] => {
  try { return JSON.parse(localStorage.getItem(favKey(ownerId)) || "[]"); } catch { return []; }
};

const FILTERS = [
  { key: "all", label: "الكل" },
  { key: "مورد", label: "موردين" },
  { key: "عميل", label: "زبائن" },
  { key: "other", label: "أخرى" },
] as const;

/**
 * Searchable party picker for purchase orders.
 * Lists every contact of the active company (suppliers, customers, others).
 * procurement_orders.supplier_id references pos_suppliers, so on select the
 * contact is resolved to the company's pos_suppliers row by exact name
 * (created if missing) — same name-matching convention used by the
 * purchase-invoice triggers.
 */
export function SupplierPicker({ suppliers, value, onChange, ownerId, onSuppliersChanged, className, refreshKey = 0 }: {
  suppliers: Supplier[]; value: string; onChange: (id: string) => void; ownerId?: string | null;
  onSuppliersChanged?: () => void; className?: string;
  /** يتغير عند إضافة جهة من خارج القائمة لإعادة تحميل جهات الاتصال */
  refreshKey?: number;
}) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [favs, setFavs] = useState<string[]>(() => readFavs(ownerId));

  useEffect(() => { setFavs(readFavs(ownerId)); }, [ownerId]);

  // إضافة جهة جديدة من خارج القائمة تُبطل النسخة المحمّلة
  useEffect(() => { setContacts([]); }, [refreshKey, ownerId]);

  useEffect(() => {
    if (!open || !ownerId || contacts.length) return;
    setLoading(true);
    supabase.from("contacts")
      .select("id, contact_name, contact_type, phone")
      .eq("user_id", ownerId)
      .or("is_active.is.null,is_active.eq.true")
      .order("contact_name")
      .limit(5000)
      .then(({ data }) => { setContacts((data as any) || []); setLoading(false); });
  }, [open, ownerId, contacts.length]);

  const toggleFav = useCallback((id: string) => {
    setFavs(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(favKey(ownerId), JSON.stringify(next));
      return next;
    });
  }, [ownerId]);

  const filtered = useMemo(() => contacts.filter(c => {
    if (filter === "all") return true;
    if (filter === "other") return c.contact_type !== "مورد" && c.contact_type !== "عميل";
    return c.contact_type === filter;
  }), [contacts, filter]);
  const favList = filtered.filter(c => favs.includes(c.id));
  const rest = filtered.filter(c => !favs.includes(c.id));
  const selectedName = suppliers.find(s => s.id === value)?.name;

  const pick = async (c: Contact) => {
    if (!ownerId) return;
    const name = c.contact_name.trim();
    setResolving(true);
    try {
      const { data: existing } = await supabase.from("pos_suppliers")
        .select("id").eq("user_id", ownerId).eq("name", name).limit(1).maybeSingle();
      let id = (existing as any)?.id as string | undefined;
      if (!id) {
        const { data: created, error } = await supabase.from("pos_suppliers")
          .insert({ user_id: ownerId, name, phone: c.phone || null } as any).select("id").single();
        if (error) throw error;
        id = (created as any).id;
        onSuppliersChanged?.();
      }
      onChange(id!);
      setOpen(false);
    } catch (e: any) {
      toast({ title: "تعذر اختيار الجهة", description: e?.message, variant: "destructive" });
    } finally { setResolving(false); }
  };

  const row = (c: Contact) => (
    <CommandItem key={c.id} value={`${c.contact_name} ${c.phone || ""} ${c.id}`} onSelect={() => pick(c)} className="text-xs gap-2">
      <Check className={cn("h-3.5 w-3.5", selectedName === c.contact_name.trim() ? "opacity-100" : "opacity-0")} />
      <span className="flex-1 truncate">{c.contact_name}</span>
      {c.contact_type && <span className="text-[10px] px-1.5 rounded bg-muted text-muted-foreground">{c.contact_type}</span>}
      {c.phone && <span className="text-[10px] text-muted-foreground" dir="ltr">{c.phone}</span>}
      <button
        type="button"
        aria-label={favs.includes(c.id) ? "إزالة من المفضلة" : "إضافة للمفضلة"}
        onPointerDown={e => { e.preventDefault(); e.stopPropagation(); }}
        onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFav(c.id); }}
        className="p-0.5 rounded hover:bg-muted"
      >
        <Star className={cn("h-3.5 w-3.5", favs.includes(c.id) ? "fill-warning text-warning" : "text-muted-foreground")} />
      </button>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-8 w-[220px] flex items-center gap-2 rounded-md border border-input bg-background px-2.5 text-xs text-foreground",
            "hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring",
            className,
          )}
        >
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className={cn("flex-1 truncate text-start", !selectedName && "text-muted-foreground")}>
            {selectedName || "ابحث عن مورد أو جهة اتصال..."}
          </span>
          {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5 opacity-50" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command>
          <CommandInput placeholder="ابحث بالاسم أو الهاتف..." className="text-xs" />
          <div className="flex gap-1 px-2 py-1.5 border-b">
            {FILTERS.map(f => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                className={cn("px-2 py-0.5 rounded-full text-[11px] border",
                  filter === f.key ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted")}>
                {f.label}
              </button>
            ))}
          </div>
          <CommandList className="max-h-[320px]">
            {loading ? (
              <div className="py-6 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">لا توجد جهة مطابقة</CommandEmpty>
                {favList.length > 0 && <CommandGroup heading="المفضلة">{favList.map(row)}</CommandGroup>}
                <CommandGroup heading={favList.length ? "الباقي" : "جهات الاتصال"}>{rest.map(row)}</CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
