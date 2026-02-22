import { useState, useEffect, useRef, useCallback } from "react";
import { Users, AtSign, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MentionItem {
  id: string;
  name: string;
  type: string; // "زبون" | "مورد" | "صنف"
  category: "contact" | "product";
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  className?: string;
  userId?: string;
}

const MentionInput = ({ value, onChange, onKeyDown, placeholder, className, userId }: MentionInputProps) => {
  const [items, setItems] = useState<MentionItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Fetch contacts + products once
  useEffect(() => {
    if (!userId || loaded) return;
    const fetchAll = async () => {
      try {
        // Fetch contacts from Airtable
        const contactsPromise = fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-contacts?clientId=${userId}`,
          { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
        ).then(r => r.ok ? r.json() : { records: [] });

        // Fetch products from Supabase
        const productsPromise = supabase
          .from("products")
          .select("id, name, unit")
          .eq("user_id", userId);

        const [contactsData, productsResult] = await Promise.all([contactsPromise, productsPromise]);

        const contactItems: MentionItem[] = (contactsData.records || [])
          .map((r: any) => ({
            id: r.id,
            name: r.fields["Contact Name"] || "",
            type: r.fields["Contact Type"] || "زبون/مورد",
            category: "contact" as const,
          }))
          .filter((c: MentionItem) => c.name);

        const productItems: MentionItem[] = (productsResult.data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          type: `صنف · ${p.unit || "وحدة"}`,
          category: "product" as const,
        }));

        setItems([...contactItems, ...productItems]);
        setLoaded(true);
      } catch (err) {
        console.error("Failed to fetch mention items:", err);
      }
    };
    fetchAll();
  }, [userId, loaded]);

  const filteredItems = items.filter((item) =>
    searchQuery ? item.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  // Group by category
  const groupedContacts = filteredItems.filter(i => i.category === "contact");
  const groupedProducts = filteredItems.filter(i => i.category === "product");
  const allFiltered = [
    ...groupedContacts.map(i => ({ ...i, _section: "contacts" })),
    ...groupedProducts.map(i => ({ ...i, _section: "products" })),
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex >= 0) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      if ((lastAtIndex === 0 || newValue[lastAtIndex - 1] === " ") && !/\s/.test(textAfterAt)) {
        setMentionStart(lastAtIndex);
        setSearchQuery(textAfterAt);
        setShowDropdown(true);
        setSelectedIndex(0);
        return;
      }
    }
    setShowDropdown(false);
  };

  const insertMention = useCallback((item: MentionItem) => {
    if (mentionStart < 0) {
      const newValue = value.trim() + " " + item.name + " ";
      onChange(newValue);
    } else {
      const before = value.slice(0, mentionStart);
      const cursorPos = inputRef.current?.selectionStart || value.length;
      const after = value.slice(cursorPos);
      const newValue = before + item.name + " " + after;
      onChange(newValue);
    }
    setShowDropdown(false);
    setMentionStart(-1);
    inputRef.current?.focus();
  }, [value, mentionStart, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown && allFiltered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % allFiltered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + allFiltered.length) % allFiltered.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(allFiltered[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowDropdown(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onKeyDown?.(e);
      return;
    }
    if (e.key === "Enter" && e.shiftKey) {
      return;
    }
    onKeyDown?.(e);
  };

  const triggerMentionDropdown = () => {
    if (showDropdown) {
      setShowDropdown(false);
      return;
    }
    setMentionStart(-1);
    setSearchQuery("");
    setShowDropdown(true);
    setSelectedIndex(0);
    inputRef.current?.focus();
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  let flatIndex = 0;

  return (
    <div className="relative flex-1 min-w-0 flex items-center gap-2">
      <textarea
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`${className} resize-none overflow-y-auto`}
        dir="rtl"
        rows={1}
        style={{ minHeight: '44px', maxHeight: '120px', height: 'auto' }}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement;
          target.style.height = 'auto';
          target.style.height = Math.min(target.scrollHeight, 120) + 'px';
        }}
      />
      <button
        type="button"
        onClick={triggerMentionDropdown}
        className="flex-shrink-0 w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-colors active:scale-95"
        title="@ أذكر زبون/مورد/صنف"
      >
        <AtSign className="h-4 w-4" />
      </button>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full mb-1 right-0 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto"
        >
          {allFiltered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground text-center">
              لا يوجد نتائج
            </div>
          ) : (
            <>
              {/* Contacts section */}
              {groupedContacts.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-primary bg-primary/5 sticky top-0 flex items-center gap-1.5">
                    <Users className="h-3 w-3" />
                    زبائن وموردين
                  </div>
                  {groupedContacts.map((item) => {
                    const idx = flatIndex++;
                    return (
                      <button
                        key={item.id}
                        onClick={() => insertMention(item)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-right hover:bg-accent/50 transition-colors ${
                          idx === selectedIndex ? "bg-accent/30" : ""
                        }`}
                      >
                        <Users className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate text-foreground">{item.name}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{item.type}</span>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Products section */}
              {groupedProducts.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-primary bg-primary/5 sticky top-0 flex items-center gap-1.5">
                    <Package className="h-3 w-3" />
                    أصناف ومنتجات
                  </div>
                  {groupedProducts.map((item) => {
                    const idx = flatIndex++;
                    return (
                      <button
                        key={item.id}
                        onClick={() => insertMention(item)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-right hover:bg-accent/50 transition-colors ${
                          idx === selectedIndex ? "bg-accent/30" : ""
                        }`}
                      >
                        <Package className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate text-foreground">{item.name}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{item.type}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MentionInput;
