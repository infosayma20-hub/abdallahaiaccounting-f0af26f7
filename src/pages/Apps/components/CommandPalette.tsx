import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowLeft, Star, Command } from "lucide-react";
import type { NavItem } from "@/config/navigationConfig";
import { multiWordMatchAny } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  apps: NavItem[];
  favorites: string[];
}

/**
 * CommandPalette — لوحة الأوامر السريعة (Ctrl+K / ⌘K)
 * - بحث فوري بين التطبيقات (يتضمن الكلمات المفتاحية)
 * - أسهم لأعلى/أسفل + Enter للتنقل
 * - يبرز التطبيقات المفضلة بنجمة
 */
export default function CommandPalette({ open, onClose, apps, favorites }: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  // Focus + reset when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Global Esc inside palette
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Filtered + ordered (favorites first)
  const results = useMemo(() => {
    const q = query.trim();
    const matched = q
      ? apps.filter(a => multiWordMatchAny(q, a.label, a.description, ...(a.keywords || [])))
      : apps;
    return [...matched].sort((a, b) => {
      const af = favorites.includes(a.id) ? 0 : 1;
      const bf = favorites.includes(b.id) ? 0 : 1;
      return af - bf;
    }).slice(0, 12);
  }, [query, apps, favorites]);

  // Reset active index when results change
  useEffect(() => { setActiveIdx(0); }, [query]);

  const select = (item?: NavItem) => {
    const target = item || results[activeIdx];
    if (!target) return;
    onClose();
    navigate(target.path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); select(); }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      style={{ background: "rgba(13,27,46,0.55)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="w-full max-w-[600px] overflow-hidden"
        style={{
          background: "#ffffff",
          borderRadius: 16,
          boxShadow: "0 24px 60px rgba(13,27,46,0.35)",
          fontFamily: "Cairo, sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4" style={{ height: 56, borderBottom: "1px solid #f1f5f9" }}>
          <Search size={18} strokeWidth={2} style={{ color: "#94a3b8" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="ابحث عن تطبيق… (Ctrl+K)"
            className="flex-1 outline-none bg-transparent"
            style={{ fontSize: 15, color: "#0D1B2E", direction: "rtl" }}
          />
          <kbd
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: 6,
              background: "#f1f5f9",
              color: "#64748b",
              fontFamily: "monospace",
            }}
          >ESC</kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto" style={{ maxHeight: "50vh" }}>
          {results.length === 0 ? (
            <div className="text-center py-12">
              <Search size={28} className="mx-auto mb-3" style={{ color: "#cbd5e1" }} />
              <p style={{ fontSize: 13, color: "#64748b" }}>لا توجد نتائج لـ "{query}"</p>
            </div>
          ) : (
            <ul role="listbox">
              {results.map((app, idx) => {
                const isActive = idx === activeIdx;
                const isFav = favorites.includes(app.id);
                return (
                  <li
                    key={app.id}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => select(app)}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                    style={{
                      background: isActive ? "#eff6ff" : "transparent",
                      borderRight: isActive ? "3px solid #2563EB" : "3px solid transparent",
                    }}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${app.bgColor || "bg-primary/10"}`}
                    >
                      <app.icon className={`h-[18px] w-[18px] ${app.color || "text-primary"}`} />
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <div className="flex items-center gap-1.5">
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: "#0D1B2E", margin: 0 }}>
                          {app.label}
                        </p>
                        {isFav && <Star size={11} style={{ color: "#f59e0b", fill: "#f59e0b" }} />}
                      </div>
                      <p className="truncate" style={{ fontSize: 11.5, color: "#64748b", margin: 0, marginTop: 1 }}>
                        {app.description}
                      </p>
                    </div>
                    {isActive && (
                      <ArrowLeft size={14} style={{ color: "#2563EB" }} strokeWidth={2.4} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer hints */}
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderTop: "1px solid #f1f5f9", background: "#fafbfc" }}
        >
          <div className="flex items-center gap-3 text-[11px]" style={{ color: "#64748b" }}>
            <span className="flex items-center gap-1"><kbd style={kbdStyle}>↑↓</kbd> تنقل</span>
            <span className="flex items-center gap-1"><kbd style={kbdStyle}>↵</kbd> فتح</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "#94a3b8" }}>
            <Command size={11} />
            <span>أموالي</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: 10,
  fontWeight: 600,
  padding: "2px 6px",
  borderRadius: 4,
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  color: "#475569",
};
