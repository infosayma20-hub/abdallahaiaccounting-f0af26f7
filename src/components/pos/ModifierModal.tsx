import { useState, useMemo } from "react";
import { X, Check, Minus, Plus, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export interface SelectedModifier {
  group_id: string;
  group_name: string;
  option_id: string;
  option_name: string;
  extra_price: number;
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
}

function ModifierGroupSection({
  group,
  selectedIds,
  onToggle,
}: {
  group: ModifierGroup;
  selectedIds: string[];
  onToggle: (optId: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-bold text-foreground">{group.name}</h4>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
              group.is_required
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {group.is_required ? "إلزامي" : "اختياري"}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {group.selection_type === "single"
            ? "اختر واحداً"
            : `اختر حتى ${group.max_select}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {group.options
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((opt) => {
            const isSelected = selectedIds.includes(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => onToggle(opt.id)}
                className={`relative flex items-center gap-2.5 p-3 rounded-xl border-2 text-sm text-right transition-all ${
                  isSelected
                    ? "border-[hsl(142,71%,45%)] bg-[hsl(142,71%,45%)]/5"
                    : "border-border bg-card hover:border-muted-foreground/30"
                }`}
              >
                {/* Radio / Checkbox indicator */}
                <div
                  className={`flex-shrink-0 w-5 h-5 rounded-${
                    group.selection_type === "single" ? "full" : "md"
                  } border-2 flex items-center justify-center transition-all ${
                    isSelected
                      ? "border-[hsl(142,71%,45%)] bg-[hsl(142,71%,45%)]"
                      : "border-muted-foreground/30 bg-background"
                  }`}
                >
                  {isSelected && (
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  )}
                </div>

                {/* Color dot */}
                {opt.color && (
                  <div
                    className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: opt.color }}
                  />
                )}

                {/* Label + Price */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-[13px] leading-tight truncate">
                    {opt.name}
                  </p>
                  {opt.extra_price !== 0 && (
                    <p
                      className={`text-[11px] font-mono mt-0.5 ${
                        opt.extra_price > 0 ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {opt.extra_price > 0 ? "+" : ""}₪
                      {Math.abs(opt.extra_price).toFixed(2)}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
}

export default function ModifierModal({
  product,
  groups,
  onConfirm,
  onClose,
}: Props) {
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const defaults: Record<string, string[]> = {};
    groups.forEach((g) => {
      defaults[g.id] = g.options.filter((o) => o.is_default).map((o) => o.id);
    });
    return defaults;
  });
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(1);

  const toggleOption = (group: ModifierGroup, optId: string) => {
    setSelected((prev) => {
      const current = prev[group.id] || [];
      if (group.selection_type === "single") {
        return {
          ...prev,
          [group.id]: current.includes(optId) ? [] : [optId],
        };
      }
      if (current.includes(optId)) {
        return {
          ...prev,
          [group.id]: current.filter((id) => id !== optId),
        };
      }
      if (current.length >= group.max_select) return prev;
      return { ...prev, [group.id]: [...current, optId] };
    });
  };

  const extraPrice = useMemo(() => {
    return Object.entries(selected).reduce((sum, [groupId, optIds]) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return sum;
      return (
        sum +
        optIds.reduce((s, optId) => {
          const opt = group.options.find((o) => o.id === optId);
          return s + (opt?.extra_price || 0);
        }, 0)
      );
    }, 0);
  }, [selected, groups]);

  const totalPrice = (product.sell_price + extraPrice) * quantity;

  const isValid = groups
    .filter((g) => g.is_required)
    .every(
      (g) => (selected[g.id]?.length || 0) >= Math.max(1, g.min_select)
    );

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

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]"
      dir="rtl"
    >
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-border">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-lg font-bold text-foreground">
              {product.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              اختر الإضافات المطلوبة
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {groups.map((group) => (
            <ModifierGroupSection
              key={group.id}
              group={group}
              selectedIds={selected[group.id] || []}
              onToggle={(optId) => toggleOption(group, optId)}
            />
          ))}

          {/* Note */}
          <div>
            <h4 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              ملاحظة خاصة (اختياري)
            </h4>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: بدون ثلج، تسخين إضافي..."
              rows={2}
              className="w-full px-3 py-2 border border-border rounded-xl text-sm resize-none focus:border-primary focus:ring-1 focus:ring-primary/30 bg-background"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground">الكمية</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-full border-2 border-border flex items-center justify-center font-bold hover:bg-muted transition-colors"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="text-lg font-bold w-8 text-center tabular-nums">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="w-8 h-8 rounded-full bg-[hsl(142,71%,45%)] text-white flex items-center justify-center font-bold hover:opacity-90 transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          <Button
            onClick={handleConfirm}
            disabled={!isValid}
            className="w-full h-12 text-base font-bold rounded-xl gap-2 bg-[hsl(142,71%,45%)] hover:bg-[hsl(142,71%,40%)] text-white"
          >
            <span>إضافة للطلب</span>
            <span className="font-mono text-lg tabular-nums">
              ₪{totalPrice.toFixed(2)}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
