import { useState, useMemo } from "react";
import { X, Check, Minus, Plus } from "lucide-react";

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
          <h4 className="text-sm font-medium" style={{ color: 'white' }}>{group.name}</h4>
          <span
            className="text-[11px] px-2.5 py-0.5 rounded-full font-medium"
            style={group.is_required
              ? { background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }
              : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }
            }
          >
            {group.is_required ? "مطلوب" : "اختياري"}
          </span>
        </div>
        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {group.selection_type === "single"
            ? "اختر واحداً"
            : `اختر حتى ${group.max_select}`}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {group.options
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((opt) => {
            const isSelected = selectedIds.includes(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => onToggle(opt.id)}
                className="relative flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-[10px] text-sm text-center transition-all"
                style={{
                  background: isSelected ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)',
                  border: isSelected ? '1.5px solid #3b82f6' : '1.5px solid rgba(255,255,255,0.1)',
                  color: 'white',
                }}
              >
                {/* Label */}
                <span className="text-[14px]">{opt.name}</span>

                {/* Color dot */}
                {opt.color && (
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: opt.color }}
                  />
                )}

                {/* Price pill */}
                {opt.extra_price !== 0 && (
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}
                  >
                    {opt.extra_price > 0 ? "+" : ""}₪{Math.abs(opt.extra_price).toFixed(0)}
                  </span>
                )}
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
      className="fixed inset-0 flex items-center justify-center z-[60] p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      dir="rtl"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
        style={{
          background: '#0D1B2E',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.1)',
          minWidth: '420px',
          maxWidth: '480px',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'white' }}>
              {product.name}
            </h3>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              اختر الإضافات
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {groups.map((group, idx) => (
            <div key={group.id}>
              {idx > 0 && (
                <div className="mb-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
              )}
              <ModifierGroupSection
                group={group}
                selectedIds={selected[group.id] || []}
                onToggle={(optId) => toggleOption(group, optId)}
              />
            </div>
          ))}

          {/* Divider before note */}
          {groups.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
          )}

          {/* Note */}
          <div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ملاحظة خاصة (اختياري)..."
              rows={2}
              className="w-full px-3 py-2.5 text-sm resize-none outline-none"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                color: 'white',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-4 flex items-center gap-3 shrink-0"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(0,0,0,0.2)',
          }}
        >
          {/* Add to order button */}
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className="flex-1 h-[44px] rounded-lg text-[14px] font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
            style={{ background: '#1d4ed8', color: 'white' }}
          >
            <span>إضافة للطلب</span>
            <span className="tabular-nums">₪{totalPrice.toFixed(2)}</span>
          </button>

          {/* Quantity control */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="w-9 h-9 rounded-md flex items-center justify-center transition-colors"
              style={{ background: 'rgba(255,255,255,0.12)', color: 'white' }}
            >
              <Plus className="w-4 h-4" />
            </button>
            <span
              className="w-8 text-center text-[16px] font-bold tabular-nums"
              style={{ color: 'white' }}
            >
              {quantity}
            </span>
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-9 h-9 rounded-md flex items-center justify-center transition-colors"
              style={{ background: 'rgba(255,255,255,0.12)', color: 'white' }}
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
