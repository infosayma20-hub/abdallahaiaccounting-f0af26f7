import { useMemo, useState, useCallback } from "react";
import { Check, ChevronsUpDown, Star } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Supplier = { id: string; name: string; phone?: string | null; is_active?: boolean | null };

const favKey = (ownerId?: string | null) => `unify:fav-suppliers:${ownerId || "anon"}`;

function readFavs(ownerId?: string | null): string[] {
  try { return JSON.parse(localStorage.getItem(favKey(ownerId)) || "[]"); } catch { return []; }
}

export function SupplierPicker({ suppliers, value, onChange, ownerId, className }: {
  suppliers: Supplier[]; value: string; onChange: (id: string) => void; ownerId?: string | null; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [favs, setFavs] = useState<string[]>(() => readFavs(ownerId));

  const toggleFav = useCallback((id: string) => {
    setFavs(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(favKey(ownerId), JSON.stringify(next));
      return next;
    });
  }, [ownerId]);

  const active = useMemo(() => suppliers.filter(s => s.is_active !== false), [suppliers]);
  const favList = active.filter(s => favs.includes(s.id));
  const rest = active.filter(s => !favs.includes(s.id));
  const selected = active.find(s => s.id === value);

  const row = (s: Supplier) => (
    <CommandItem key={s.id} value={`${s.name} ${s.phone || ""} ${s.id}`} onSelect={() => { onChange(s.id); setOpen(false); }} className="text-xs gap-2">
      <Check className={cn("h-3.5 w-3.5", value === s.id ? "opacity-100" : "opacity-0")} />
      <span className="flex-1 truncate">{s.name}</span>
      {s.phone && <span className="text-[10px] text-muted-foreground" dir="ltr">{s.phone}</span>}
      <button
        type="button"
        aria-label={favs.includes(s.id) ? "إزالة من المفضلة" : "إضافة للمفضلة"}
        onPointerDown={e => { e.preventDefault(); e.stopPropagation(); }}
        onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFav(s.id); }}
        className="p-0.5 rounded hover:bg-muted"
      >
        <Star className={cn("h-3.5 w-3.5", favs.includes(s.id) ? "fill-warning text-warning" : "text-muted-foreground")} />
      </button>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className={cn("h-8 w-[200px] justify-between text-xs font-normal", className)}>
          <span className="truncate flex items-center gap-1">
            {selected && favs.includes(selected.id) && <Star className="h-3 w-3 fill-warning text-warning" />}
            {selected ? selected.name : <span className="text-muted-foreground">اختر المورد</span>}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="ابحث بالاسم أو الهاتف..." className="text-xs" />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">لا يوجد مورد مطابق</CommandEmpty>
            {favList.length > 0 && <CommandGroup heading="المفضلة">{favList.map(row)}</CommandGroup>}
            <CommandGroup heading={favList.length ? "باقي الموردين" : "الموردين"}>{rest.map(row)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
