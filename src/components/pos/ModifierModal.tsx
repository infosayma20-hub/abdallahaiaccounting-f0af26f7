import { useState, useMemo } from "react";
import { X, Minus, Plus } from "lucide-react";
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
          <h4 className="text-[14px] font-medium" style={{ color: 'white' }}>{group.name}</h4>
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
        <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
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
                className="relative flex flex-wrap items-center justify-center gap-1.5 py-3 px-2 rounded-[10px] text-[13px] text-center transition-all min-h-[48px]"
                style={{
                  background: isSelected ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
                  border: isSelected ? '1.5px solid #3b82f6' : '1.5px solid rgba(255,255,255,0.1)',
                  color: 'white',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  }
                }}
              >
                <span className="whitespace-normal break-words leading-tight">{opt.name}</span>
                {opt.color && (
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: opt.color }}
                  />
                )}
                {opt.extra_price !== 0 && (
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
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
  groups: rawGroups,
  onConfirm,
  onClose,
}: Props) {
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

  const toggleOption = (group: ModifierGroup, optId: string) => {
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

      // Auto-confirm UX: skip the extra "إضافة للطلب" tap only when there is
      // exactly ONE single-select group. With 2+ groups the user must pick
      // from each group (or press "إضافة للطلب") explicitly.
      const onlyOneGroup = groups.length === 1;
      const isSingleSelect = group.selection_type === "single";
      const justPicked = nextForGroup.length === 1;

      if (onlyOneGroup && isSingleSelect && justPicked && note === "" && quantity === 1) {
        const modifiers: SelectedModifier[] = [];
        let extra = 0;
        groups.forEach((g) => {
          (next[g.id] || []).forEach((oid) => {
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
        // Defer to next tick so React finishes the state commit before unmount.
        setTimeout(() => {
          onConfirm({ modifiers, note: "", quantity: 1, totalPrice: total });
        }, 0);
      }

      return next;
    });
  };

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

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[60] p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      dir="rtl"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
        style={{
          background: '#0D1B2E',
          borderRadius: '14px',
          border: '1px solid rgba(255,255,255,0.12)',
          minWidth: '420px',
          maxWidth: '480px',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '14px 16px' }}
        >
          <div className="flex items-center gap-3">
            <h3 className="text-[15px] font-semibold" style={{ color: 'white' }}>
              {product.name}
            </h3>
            <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
              اختر الإضافات
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4"
          style={{ background: '#112240', borderRadius: '0 0 14px 14px' }}
        >
          {groups.map((group, idx) => (
            <div key={group.id}>
              {idx > 0 && (
                <div className="mb-3.5" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '14px 0' }} />
              )}
              <ModifierGroupSection
                group={group}
                selectedIds={selected[group.id] || []}
                onToggle={(optId) => toggleOption(group, optId)}
              />
            </div>
          ))}

          {groups.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '14px 0' }} />
          )}

          {/* Note */}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ملاحظة خاصة (اختياري)..."
            rows={2}
            className="w-full text-[13px] resize-none outline-none transition-colors"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '10px 14px',
              color: 'white',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          />
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-2.5 shrink-0"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(0,0,0,0.2)',
            padding: '12px 16px',
          }}
        >
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className="flex-1 h-[44px] rounded-lg text-[14px] font-semibold flex items-center justify-center gap-2 transition-all"
            style={{
              background: isValid ? '#1d4ed8' : 'rgba(255,255,255,0.08)',
              color: isValid ? 'white' : 'rgba(255,255,255,0.3)',
              cursor: isValid ? 'pointer' : 'not-allowed',
            }}
            onMouseEnter={(e) => { if (isValid) e.currentTarget.style.background = '#1e40af'; }}
            onMouseLeave={(e) => { if (isValid) e.currentTarget.style.background = '#1d4ed8'; }}
          >
            <span>إضافة للطلب</span>
            <span className="tabular-nums">₪{totalPrice.toFixed(2)}</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="w-9 h-9 rounded-md flex items-center justify-center transition-colors text-[18px]"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            >
              <Plus className="w-4.5 h-4.5" />
            </button>
            <span
              className="min-w-[32px] text-center text-[16px] font-semibold tabular-nums"
              style={{ color: 'white' }}
            >
              {quantity}
            </span>
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-9 h-9 rounded-md flex items-center justify-center transition-colors text-[18px]"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            >
              <Minus className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
