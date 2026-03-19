import { useState, useMemo, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { X, Check, Minus, Plus } from "lucide-react";
import { motion } from "framer-motion";
import type { SelectedModifier } from "@/components/pos/ModifierModal";

interface ModifierOption {
  id: string;
  name: string;
  extra_price: number;
  is_default: boolean;
  color: string | null;
  sort_order: number;
}

interface ModifierGroup {
  id: string;
  name: string;
  selection_type: "single" | "multiple";
  is_required: boolean;
  min_select: number;
  max_select: number;
  options: ModifierOption[];
}

interface Product {
  id: string;
  name: string;
  sell_price: number;
}

interface Props {
  product: Product;
  groups: ModifierGroup[];
  onConfirm: (data: {
    modifiers: SelectedModifier[];
    note: string;
    quantity: number;
    totalPrice: number;
  }) => void;
  onClose: () => void;
  flipUp?: boolean;
  anchorRef?: React.RefObject<HTMLElement>;
}

export default function InlineAddonPanel({ product, groups, onConfirm, onClose, flipUp = false }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const defaults: Record<string, string[]> = {};
    groups.forEach((g) => {
      defaults[g.id] = g.options.filter((o) => o.is_default).map((o) => o.id);
    });
    return defaults;
  });
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(1);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is inside the panel or parent card
      if (panelRef.current && !panelRef.current.contains(target) && !target.closest("[data-addon-card]")) {
        onClose();
      }
    };
    // Delay to avoid immediate close from the opening click
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  const toggleOption = useCallback((group: ModifierGroup, optId: string) => {
    setSelected((prev) => {
      const current = prev[group.id] || [];
      if (group.selection_type === "single") {
        return { ...prev, [group.id]: current.includes(optId) ? [] : [optId] };
      }
      if (current.includes(optId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== optId) };
      }
      if (current.length >= group.max_select) return prev;
      return { ...prev, [group.id]: [...current, optId] };
    });
  }, []);

  const extraPrice = useMemo(() => {
    return Object.entries(selected).reduce((sum, [groupId, optIds]) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return sum;
      return sum + optIds.reduce((s, optId) => {
        const opt = group.options.find((o) => o.id === optId);
        return s + (opt?.extra_price || 0);
      }, 0);
    }, 0);
  }, [selected, groups]);

  const totalPrice = (product.sell_price + extraPrice) * quantity;

  const isValid = groups
    .filter((g) => g.is_required)
    .every((g) => (selected[g.id]?.length || 0) >= Math.max(1, g.min_select));

  const handleConfirm = () => {
    const modifiers: SelectedModifier[] = [];
    Object.entries(selected).forEach(([groupId, optIds]) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;
      optIds.forEach((optId) => {
        const opt = group.options.find((o) => o.id === optId);
        if (!opt) return;
        modifiers.push({
          group_id: groupId,
          group_name: group.name,
          option_id: optId,
          option_name: opt.name,
          extra_price: opt.extra_price,
        });
      });
    });
    onConfirm({ modifiers, note, quantity, totalPrice });
  };

  const getGridCols = (count: number) => {
    if (count <= 2) return "grid-cols-2";
    if (count === 3) return "grid-cols-3";
    if (count === 4) return "grid-cols-2";
    return "grid-cols-3";
  };

  const positionStyles: React.CSSProperties = flipUp
    ? { bottom: "calc(100% + 6px)", top: "auto", left: 0, right: 0 }
    : { top: "calc(100% + 6px)", left: 0, right: 0 };

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: flipUp ? 8 : -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: flipUp ? 6 : -6 }}
      transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
      className="fixed z-[200] min-w-[260px] max-w-[340px] overflow-hidden rounded-[14px] border border-border bg-card"
      style={{
        ...positionStyles,
        boxShadow: "0 8px 32px rgba(10,35,66,0.18), 0 2px 8px rgba(10,35,66,0.08)",
      }}
      dir="rtl"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3.5 py-2.5"
        style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(210,80%,30%))" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-bold text-white truncate">{product.name}</span>
          <span className="text-[10px] text-white/60">اختر الإضافات</span>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 w-[26px] h-[26px] rounded-full flex items-center justify-center bg-white/15 hover:bg-white/25 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-white" />
        </button>
      </div>

      {/* Body */}
      <div className="overflow-y-auto p-3 space-y-2.5" style={{ maxHeight: 280 }}>
        {groups.map((group, gi) => {
          const currentSelected = selected[group.id] || [];
          const maxReached = group.selection_type === "multiple" && currentSelected.length >= group.max_select;

          return (
            <div key={group.id}>
              {gi > 0 && <div className="border-t border-dashed border-border my-2.5" />}
              {/* Group header */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-foreground">{group.name}</span>
                  {group.is_required && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold">مطلوب</span>
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground">
                  {group.selection_type === "single" ? "اختر واحداً" : `اختر حتى ${group.max_select}`}
                </span>
              </div>

              {/* Options grid */}
              <div className={`grid ${getGridCols(group.options.length)} gap-[5px]`}>
                {group.options
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((opt) => {
                    const isSelected = currentSelected.includes(opt.id);
                    const isDisabled = !isSelected && maxReached;
                    const optColor = opt.color || "hsl(var(--primary))";

                    return (
                      <button
                        key={opt.id}
                        onClick={() => !isDisabled && toggleOption(group, opt.id)}
                        disabled={isDisabled}
                        className="flex items-center justify-between px-2.5 py-[7px] rounded-[9px] border-2 text-right transition-all min-h-[44px]"
                        style={{
                          borderColor: isSelected ? optColor : "hsl(var(--border))",
                          background: isSelected ? optColor + "12" : "hsl(var(--card))",
                          opacity: isDisabled ? 0.4 : 1,
                          cursor: isDisabled ? "not-allowed" : "pointer",
                          transform: isSelected ? "scale(1.02)" : "scale(1)",
                        }}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: optColor,
                              boxShadow: isSelected ? `0 0 6px ${optColor}88` : "none",
                            }}
                          />
                          <span
                            className="text-[11px] truncate"
                            style={{
                              fontWeight: isSelected ? 700 : 400,
                              color: isSelected ? optColor : "hsl(var(--foreground))",
                            }}
                          >
                            {opt.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {opt.extra_price > 0 && (
                            <span
                              className="text-[9px] font-mono"
                              style={{ color: isSelected ? optColor : "hsl(var(--muted-foreground))" }}
                            >
                              +₪{opt.extra_price.toFixed(0)}
                            </span>
                          )}
                          {isSelected && (
                            <div
                              className="w-3.5 h-3.5 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: optColor }}
                            >
                              <Check className="w-2 h-2 text-white" strokeWidth={3} />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
              {maxReached && (
                <p className="text-[9px] text-muted-foreground mt-1 text-center">وصلت للحد الأقصى</p>
              )}
            </div>
          );
        })}

        {/* Note */}
        <div className="border-t border-dashed border-border pt-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="💬 ملاحظة خاصة (اختياري)..."
            className="w-full h-8 px-2.5 border border-border rounded-lg text-[11px] bg-muted/30 focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border bg-muted/20">
        {/* Quantity */}
        <div className="flex items-center border-[1.5px] border-border rounded-[9px] overflow-hidden">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            className="w-7 h-7 flex items-center justify-center bg-muted/50 text-foreground disabled:opacity-30"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-7 text-center text-xs font-bold tabular-nums">{quantity}</span>
          <button
            onClick={() => setQuantity((q) => q + 1)}
            className="w-7 h-7 flex items-center justify-center bg-muted/50 text-foreground"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Add button */}
        <button
          onClick={handleConfirm}
          disabled={!isValid}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-[9px] text-[12px] font-bold transition-all"
          style={{
            background: isValid
              ? "linear-gradient(135deg, hsl(142,71%,38%), hsl(142,71%,30%))"
              : "hsl(var(--muted))",
            color: isValid ? "white" : "hsl(var(--muted-foreground))",
            cursor: isValid ? "pointer" : "not-allowed",
          }}
        >
          <span>إضافة للطلب</span>
          <span
            className="text-[11px] font-mono px-1.5 py-0.5 rounded-md"
            style={{
              background: isValid ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.08)",
            }}
          >
            ₪{totalPrice.toFixed(2)}
          </span>
        </button>
      </div>
    </motion.div>
  );
}
