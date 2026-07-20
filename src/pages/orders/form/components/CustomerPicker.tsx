import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  search: string;
  onSearchChange: (v: string) => void;
  contacts: any[];
  selectedName: string;
  onSelectContact: (c: any) => void;
  onCreateContact: (name: string) => void;
}

export function CustomerPicker({
  open, onOpenChange, search, onSearchChange, contacts, selectedName, onSelectContact, onCreateContact,
}: Props) {
  const nameExists = contacts.some((c) => c.contact_name?.trim().toLowerCase() === search.trim().toLowerCase());
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal h-10", !selectedName && "text-muted-foreground")}
        >
          <span className="truncate">{selectedName || "ابحث عن عميل أو أضف جديد..."}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(val, s) => {
            const q = s.trim().toLowerCase();
            if (!q) return 1;
            return val.toLowerCase().includes(q) ? 1 : 0;
          }}
        >
          <CommandInput
            placeholder="ابحث بالاسم أو الهاتف أو اكتب اسم جديد..."
            value={search}
            onValueChange={onSearchChange}
          />
          <CommandList>
            <CommandEmpty>
              <div className="text-xs text-muted-foreground py-2 text-center">ابدأ الكتابة لإضافة عميل</div>
            </CommandEmpty>
            {search.trim() && !nameExists && (
              <CommandGroup heading="جديد">
                <CommandItem
                  value={`__add__${search}`}
                  onSelect={() => onCreateContact(search.trim())}
                >
                  <Plus className="h-3.5 w-3.5 ml-2" />
                  <span className="truncate">إضافة "{search.trim()}" كعميل جديد</span>
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {contacts.map((c) => {
                const label = `${c.contact_name}${c.phone ? " • " + c.phone : ""}`;
                return (
                  <CommandItem key={c.id} value={label} onSelect={() => onSelectContact(c)}>
                    <Check className={cn("ml-2 h-3.5 w-3.5", selectedName === c.contact_name ? "opacity-100" : "opacity-0")} />
                    <div className="flex-1 flex items-center justify-between gap-2">
                      <span className="truncate">{c.contact_name}</span>
                      {c.phone && <span className="text-[10px] text-muted-foreground" dir="ltr">{c.phone}</span>}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}