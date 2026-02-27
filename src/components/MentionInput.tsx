import { useState, useEffect, useRef, useCallback } from "react";
import { getAuthHeaders, getAuthHeadersJson } from "@/lib/edge-helpers";
import { Users, AtSign, Package, PlusCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import QuickAddModal from "./QuickAddModal";

export interface MentionItem {
  id: string;
  name: string;
  type: string;
  category: "contact" | "product";
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onMentionSelect?: (item: MentionItem) => void;
  placeholder?: string;
  className?: string;
  userId?: string;
}

// Keywords that trigger auto-@ for product/contact flow
const SELL_KEYWORDS = ["بعت", "بيع", "بعنا"];
const BUY_KEYWORDS = ["اشتريت", "شراء", "شرينا"];
const ALL_TRIGGER_KEYWORDS = [...SELL_KEYWORDS, ...BUY_KEYWORDS];

const MentionInput = ({ value, onChange, onKeyDown, onMentionSelect, placeholder, className, userId }: MentionInputProps) => {
  const [items, setItems] = useState<MentionItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [autoTriggered, setAutoTriggered] = useState(false);
  const prevValueRef = useRef("");
  const [quickAddModal, setQuickAddModal] = useState<{ open: boolean; category: "contact" | "product"; defaultName: string }>({
    open: false, category: "product", defaultName: ""
  });
  // Fetch contacts + products once
  useEffect(() => {
    if (!userId || loaded) return;
    const fetchAll = async () => {
      try {
        const contactsPromise = fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-contacts?clientId=${userId}`,
          { headers: await getAuthHeaders() }
        ).then(r => r.ok ? r.json() : { records: [] });

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

  const groupedContacts = filteredItems.filter(i => i.category === "contact");
  const groupedProducts = filteredItems.filter(i => i.category === "product");

  // "Create new" options based on search query
  const createNewOptions: { label: string; category: "contact" | "product"; type: string }[] = [];
  if (searchQuery.trim()) {
    const nameExists = filteredItems.some(i => i.name === searchQuery.trim());
    if (!nameExists) {
      createNewOptions.push(
        { label: `➕ أضف "${searchQuery}" كزبون/مورد`, category: "contact", type: "جديد" },
        { label: `➕ أضف "${searchQuery}" كمنتج/صنف`, category: "product", type: "جديد" },
      );
    }
  } else {
    // Show create hints even without search
    createNewOptions.push(
      { label: "➕ أضف زبون أو مورد جديد", category: "contact", type: "جديد" },
      { label: "➕ أضف منتج أو صنف جديد", category: "product", type: "جديد" },
    );
  }

  const allFiltered = [
    ...groupedContacts.map(i => ({ ...i, _section: "contacts" as const, _isCreate: false })),
    ...groupedProducts.map(i => ({ ...i, _section: "products" as const, _isCreate: false })),
    ...createNewOptions.map((o, idx) => ({
      id: `__create_${o.category}_${idx}`,
      name: searchQuery.trim() || "",
      type: o.type,
      category: o.category,
      _section: "create" as const,
      _isCreate: true,
      _label: o.label,
    })),
  ];

  // Auto-trigger @ when user types a sell/buy keyword followed by space
  useEffect(() => {
    const prev = prevValueRef.current;
    prevValueRef.current = value;

    // Only trigger when a space is added after a keyword
    if (value.length <= prev.length) return;
    const lastChar = value[value.length - 1];
    if (lastChar !== " ") return;

    const words = value.trim().split(/\s+/);
    const lastWord = words[words.length - 1] || words[words.length - 2];
    
    if (!lastWord) return;
    
    // Check if the word before the space is a trigger keyword
    const textBeforeSpace = value.slice(0, value.length - 1).trim();
    const wordsBeforeSpace = textBeforeSpace.split(/\s+/);
    const wordJustTyped = wordsBeforeSpace[wordsBeforeSpace.length - 1];
    
    if (wordJustTyped && ALL_TRIGGER_KEYWORDS.includes(wordJustTyped) && !autoTriggered) {
      // Auto-insert @ and open dropdown
      const newValue = value + "@";
      onChange(newValue);
      setMentionStart(newValue.length - 1);
      setSearchQuery("");
      setShowDropdown(true);
      setSelectedIndex(0);
      setAutoTriggered(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    
    // Reset auto-trigger flag when input is cleared
    if (value.trim() === "") setAutoTriggered(false);
  }, [value, autoTriggered, onChange]);

  // Reset auto-trigger when input is cleared
  useEffect(() => {
    if (value.trim() === "") setAutoTriggered(false);
  }, [value]);

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

  const handleCreateNew = useCallback(async (name: string, category: "contact" | "product") => {
    // If no name typed yet, open the quick add modal
    if (!name) {
      setShowDropdown(false);
      setQuickAddModal({ open: true, category, defaultName: "" });
      return;
    }

    let newItem: MentionItem = {
      id: `__new_${category}_${Date.now()}`,
      name,
      type: category === "contact" ? "جديد" : "صنف جديد",
      category,
    };

    // Actually save to database
    try {
      if (category === "product" && userId) {
        const { data, error } = await supabase.from("products").insert({
          name,
          user_id: userId,
          unit: "قطعة",
          buy_price: 0,
          sell_price: 0,
          quantity: 0,
          min_quantity: 0,
          category: "بضاعة عامة",
        }).select("id").single();
        
        if (error) {
          console.error("Quick add product error:", error.message, error.details, error.hint);
          // Show feedback to user
          alert(`فشل إضافة المنتج: ${error.message}`);
        }
        if (!error && data) {
          console.log("Quick add product success:", data.id);
          newItem.id = data.id;
          newItem.type = "صنف · قطعة";
          setItems(prev => [...prev, newItem]);
        }
      } else if (category === "contact" && userId) {
        try {
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/database-command`,
            {
              method: "POST",
              headers: {
                Authorization: (await getAuthHeaders()).Authorization,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ command: `أضف زبون ${name}`, clientId: userId }),
            }
          );
          const data = await res.json();
          console.log("Quick add contact result:", data);
          if (data.success && data.recordId) {
            newItem.id = data.recordId;
            setItems(prev => [...prev, newItem]);
          } else if (data.success) {
            setItems(prev => [...prev, newItem]);
          }
        } catch (e) {
          console.error("Failed to create contact:", e);
        }
      } else {
        console.warn("Quick add skipped - no userId:", userId, "category:", category);
      }
    } catch (e) {
      console.error("Quick create failed:", e);
    }

    // Insert name into input
    if (mentionStart < 0) {
      const newValue = value.trim() + " " + newItem.name + " ";
      onChange(newValue);
    } else {
      const before = value.slice(0, mentionStart);
      const cursorPos = inputRef.current?.selectionStart || value.length;
      const after = value.slice(cursorPos);
      const newValue = before + newItem.name + " " + after;
      onChange(newValue);
    }
    onMentionSelect?.(newItem);
    setShowDropdown(false);
    setMentionStart(-1);
    inputRef.current?.focus();
  }, [value, mentionStart, onChange, onMentionSelect, userId]);

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
    onMentionSelect?.(item);
    setShowDropdown(false);
    setMentionStart(-1);
    inputRef.current?.focus();
  }, [value, mentionStart, onChange, onMentionSelect]);

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
        const selected = allFiltered[selectedIndex];
        if (selected._isCreate) {
          handleCreateNew(searchQuery.trim(), selected.category);
        } else {
          insertMention(selected);
        }
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
          className="absolute bottom-full mb-1 right-0 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {/* Existing contacts */}
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

          {/* Existing products */}
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

          {/* Divider */}
          {(groupedContacts.length > 0 || groupedProducts.length > 0) && (
            <div className="border-t border-border my-0.5" />
          )}

          {/* Create new options */}
          <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground bg-muted/30 sticky top-0 flex items-center gap-1.5">
            <PlusCircle className="h-3 w-3" />
            إضافة سريعة
          </div>
          {createNewOptions.map((opt, idx) => {
            const globalIdx = flatIndex++;
            return (
              <button
                key={`create-${opt.category}-${idx}`}
                onClick={() => handleCreateNew(searchQuery.trim(), opt.category)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-right hover:bg-primary/10 transition-colors ${
                  globalIdx === selectedIndex ? "bg-primary/10" : ""
                }`}
              >
                <PlusCircle className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                <span className="flex-1 truncate text-foreground text-xs">{opt.label}</span>
              </button>
            );
          })}

          {/* No results hint */}
          {groupedContacts.length === 0 && groupedProducts.length === 0 && searchQuery && (
            <div className="px-3 py-2 text-[10px] text-muted-foreground text-center">
              اكتب الاسم واختر "إضافة سريعة" ↑
            </div>
          )}
        </div>
      )}

      {/* Quick Add Modal */}
      <QuickAddModal
        open={quickAddModal.open}
        defaultName={quickAddModal.defaultName}
        initialType={quickAddModal.category}
        onCancel={() => setQuickAddModal(prev => ({ ...prev, open: false }))}
        onConfirm={async ({ name: newName, type: addType }) => {
          setQuickAddModal(prev => ({ ...prev, open: false }));
          
          const addContact = async (contactType: string) => {
            if (!userId) return;
            const command = contactType === "مورد" ? `أضف مورد ${newName}` : `أضف زبون ${newName}`;
            const res = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/database-command`,
              {
                method: "POST",
                headers: {
                  Authorization: (await getAuthHeaders()).Authorization,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ command, clientId: userId }),
              }
            );
            const data = await res.json();
            console.log(`Quick add ${contactType} result:`, data);
            const newItem: MentionItem = { id: data.recordId || `__new_contact_${Date.now()}`, name: newName, type: contactType, category: "contact" };
            setItems(prev => [...prev, newItem]);
            const before = mentionStart >= 0 ? value.slice(0, mentionStart) : value.trim() + " ";
            const after = mentionStart >= 0 ? value.slice(inputRef.current?.selectionStart || value.length) : "";
            onChange(before + newName + " " + after);
            onMentionSelect?.(newItem);
          };

          if (addType === "supplier") {
            await addContact("مورد");
          } else if (addType === "customer") {
            await addContact("زبون");
          } else {
            await handleCreateNew(newName, "product");
          }
          setMentionStart(-1);
          inputRef.current?.focus();
        }}
      />
    </div>
  );
};

export default MentionInput;
