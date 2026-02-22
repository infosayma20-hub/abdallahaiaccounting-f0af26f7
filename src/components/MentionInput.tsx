import { useState, useEffect, useRef, useCallback } from "react";
import { Users, AtSign } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  type: string;
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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [contactsLoaded, setContactsLoaded] = useState(false);

  // Fetch contacts once
  useEffect(() => {
    if (!userId || contactsLoaded) return;
    const fetchContacts = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-contacts?clientId=${userId}`,
          { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
        );
        if (!res.ok) return;
        const data = await res.json();
        const parsed = (data.records || []).map((r: any) => ({
          id: r.id,
          name: r.fields["Contact Name"] || "",
          type: r.fields["Contact Type"] || "",
        })).filter((c: Contact) => c.name);
        setContacts(parsed);
        setContactsLoaded(true);
      } catch (err) {
        console.error("Failed to fetch contacts:", err);
      }
    };
    fetchContacts();
  }, [userId, contactsLoaded]);

  const filteredContacts = contacts.filter((c) =>
    searchQuery ? c.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    // Detect "@" trigger
    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex >= 0) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      // Only show if no space before @ (or @ is at start) and text after @ has no special chars
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

  const insertMention = useCallback((contact: Contact) => {
    if (mentionStart < 0) {
      // "@" button was pressed - append to end
      const newValue = value.trim() + " " + contact.name + " ";
      onChange(newValue);
    } else {
      const before = value.slice(0, mentionStart);
      const cursorPos = inputRef.current?.selectionStart || value.length;
      const after = value.slice(cursorPos);
      const newValue = before + contact.name + " " + after;
      onChange(newValue);
    }
    setShowDropdown(false);
    setMentionStart(-1);
    inputRef.current?.focus();
  }, [value, mentionStart, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown && filteredContacts.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filteredContacts.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filteredContacts.length) % filteredContacts.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredContacts[selectedIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowDropdown(false);
        return;
      }
    }
    // Shift+Enter = new line (default textarea behavior), Enter = send
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onKeyDown?.(e);
      return;
    }
    // Don't propagate Shift+Enter to parent (let textarea handle newline)
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
        title="أذكر زبون/مورد @"
      >
        <AtSign className="h-4 w-4" />
      </button>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full mb-1 right-0 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto"
        >
          {filteredContacts.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground text-center">
              لا يوجد زبون/مورد
            </div>
          ) : (
            filteredContacts.map((contact, index) => (
              <button
                key={contact.id}
                onClick={() => insertMention(contact)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-right hover:bg-accent/50 transition-colors ${
                  index === selectedIndex ? "bg-accent/30" : ""
                }`}
              >
                <Users className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-foreground">{contact.name}</span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {contact.type || "زبون/مورد"}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default MentionInput;
