import { useState, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Check, Minus, Plus } from "lucide-react";
import { motion } from "framer-motion";
import type { SelectedModifier } from "@/components/pos/ModifierModal";
import { augmentGroupsWithNone, isNoneOptionId } from "@/lib/pos/modifier-none-option";

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
}

export default function InlineAddonPanel({ product, groups: rawGroups, onConfirm, onClose }: Props) {
  const groups = useMemo(() => augmentGroupsWithNone(rawGroups), [rawGroups]);
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const defaults: Record<string, string[]> = {};
    groups.forEach((g) => {
      defaults[g.id] = g.options.filter((o) => o.is_default).map((o) => o.id);
    });
    return defaults;
  });
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handler);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handler);
    };
  }, [onClose]);

  const toggleOption = useCallback((group: ModifierGroup, optId: string) => {
    setSelected((prev) => {
      const current = prev[group.id] || [];
      let nextForGroup: string[];
      if (group.selection_type === "single") {
        nextForGroup = current.includes(optId) ? [] : [optId];
      } else if (current.includes(optId)) {
        nextForGroup = current.filter((id) => id !== optId);
      } else {
        if (current.length >= group.max_select) return prev;
        nextForGroup = [...current, optId];
      }
      const next = { ...prev, [group.id]: nextForGroup };

      // Auto-confirm UX: only when there is exactly ONE single-select group.
      // With 2+ groups, user must explicitly pick from each or press "إضافة للطلب".
      const onlyOneGroup = groups.length === 1;
      const isSingleSelect = group.selection_type === "single";
      const justPicked = nextForGroup.length === 1;

      if (onlyOneGroup && isSingleSelect && justPicked && note === "" && quantity === 1) {
        const modifiers: SelectedModifier[] = [];
        let extra = 0;
        groups.forEach((g) => {
          (next[g.id] || []).forEach((oid) => {
            if (isNoneOptionId(oid)) return;
            const opt = g.options.find((o) => o.id === oid);
            if (!opt) return;
            modifiers.push({
              group_id: g.id,
              group_name: g.name,
              option_id: opt.id,
              option_name: opt.name,
              extra_price: opt.extra_price,
            });
            extra += opt.extra_price || 0;
          });
        });
        const total = (product.sell_price + extra) * 1;
        setTimeout(() => {
          onConfirm({ modifiers, note: "", quantity: 1, totalPrice: total });
        }, 0);
      }

      return next;
    });
  }, [groups, note, quantity, product, onConfirm]);

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
        if (isNoneOptionId(optId)) return;
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

  const panel = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
      dir="rtl"
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (e.target === e.currentTarget) onClose();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
        className="flex max-h-[85vh] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate text-sm font-bold">{product.name}</span>
              <span className="text-[11px] text-primary-foreground/70">اختر الإضافات</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 transition-colors hover:bg-primary-foreground/25"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[56vh] overflow-y-auto p-4 space-y-3">
          {groups.map((group, gi) => {
            const currentSelected = selected[group.id] || [];
            const maxReached = group.selection_type === "multiple" && currentSelected.length >= group.max_select;

            return (
              <div key={group.id}>
                {gi > 0 && <div className="my-3 border-t border-dashed border-border" />}
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-foreground">{group.name}</span>
                    {group.is_required && (
                      <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold text-destructive">
                        مطلوب
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {group.selection_type === "single" ? "اختر واحداً" : `اختر حتى ${group.max_select}`}
                  </span>
                </div>

                <div className={`grid ${getGridCols(group.options.length)} gap-2`}>
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
                          className="flex min-h-[48px] items-center justify-between rounded-xl border-2 px-3 py-2 text-right transition-all disabled:cursor-not-allowed"
                          style={{
                            borderColor: isSelected ? optColor : "hsl(var(--border))",
                            background: isSelected ? `${optColor}12` : "hsl(var(--card))",
                            opacity: isDisabled ? 0.45 : 1,
                          }}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <div
                              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                              style={{
                                backgroundColor: optColor,
                                boxShadow: isSelected ? `0 0 8px ${optColor}66` : "none",
                              }}
                            />
                            <span
                              className="text-xs whitespace-normal break-words leading-tight"
                              style={{
                                fontWeight: isSelected ? 700 : 500,
                                color: isSelected ? optColor : "hsl(var(--foreground))",
                              }}
                            >
                              {opt.name}
                            </span>
                          </div>

                          <div className="flex flex-shrink-0 items-center gap-1.5">
                            {opt.extra_price > 0 && (
                              <span className="text-[10px] font-mono text-muted-foreground">
                                +₪{opt.extra_price.toFixed(0)}
                              </span>
                            )}
                            {isSelected && (
                              <div
                                className="flex h-4 w-4 items-center justify-center rounded-full"
                                style={{ backgroundColor: optColor }}
                              >
                                <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </div>

                {maxReached && (
                  <p className="mt-1 text-center text-[10px] text-muted-foreground">وصلت للحد الأقصى</p>
                )}
              </div>
            );
          })}

          <div className="border-t border-dashed border-border pt-3">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ملاحظة خاصة (اختياري)..."
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-muted/20 p-4">
          <div className="flex items-center overflow-hidden rounded-xl border border-border bg-background">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="flex h-9 w-9 items-center justify-center text-foreground transition-colors hover:bg-muted disabled:opacity-30"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-9 text-center text-sm font-bold tabular-nums">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="flex h-9 w-9 items-center justify-center text-foreground transition-colors hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground bg-primary text-primary-foreground hover:opacity-90"
          >
            <span>إضافة للطلب</span>
            <span className="rounded-md bg-primary-foreground/15 px-2 py-0.5 font-mono text-xs">
              ₪{totalPrice.toFixed(2)}
            </span>
          </button>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(panel, document.body);
}
