import { useState } from "react";
import { Pencil } from "lucide-react";
import type { PosV2Tokens } from "./posV2Theme";
import { posV2CatColor, fmtMoney } from "./posV2Theme";

export type PosV2Product = { id: string; name: string; sell_price: number; image_url?: string | null; pos_category_id?: string | null; category?: string | null };
export type PosV2Cat = { id: string; name: string; count: number };

type Props = {
  t: PosV2Tokens;
  categories: PosV2Cat[];
  allCount: number;
  uncategorizedCount: number;
  selected: string;
  onSelect: (name: string) => void;
  products: PosV2Product[];
  displayName: (p: PosV2Product) => string;
  qtyMap: Record<string, number>;
  onAdd: (p: PosV2Product) => void;
  cardSize: "S" | "M" | "L";
  onCardSize: (s: "S" | "M" | "L") => void;
  canManage: boolean;
  onAddCategory: () => void;
  onAddProduct: () => void;
  onSortMode: () => void;
  isSortMode: boolean;
  catIdByName: Record<string, string>;
  narrow: boolean;
};

function Chip({ t, active, color, label, count, onClick }: { t: PosV2Tokens; active: boolean; color?: string; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 shrink-0 w-full"
      style={{
        minHeight: 52, padding: "7px 10px", borderRadius: 10, fontSize: 13, fontWeight: 700,
        background: active ? t.accent : t.card, color: active ? t.onAccent : t.text,
        border: `1px solid ${active ? t.accent : t.border}`,
      }}
    >
      {color && <span style={{ width: 8, height: 8, borderRadius: 4, background: color }} />}
      <span className="flex-1 min-w-0 text-right" style={{ lineHeight: 1.35, overflowWrap: "anywhere" }}>{label}</span>
      <span className="shrink-0" style={{ fontSize: 11, fontWeight: 600, color: active ? t.onAccent : t.muted, opacity: active ? 0.75 : 1 }}>{count}</span>
    </button>
  );
}

export default function POSv2Products(p: Props) {
  const { t } = p;
  const [editOpen, setEditOpen] = useState(false);
  const baseCols = p.cardSize === "S" ? 6 : p.cardSize === "M" ? 5 : 4;
  const cols = Math.max(2, baseCols - (p.narrow ? 1 : 0));

  return (
    <div dir="rtl" className="flex-1 min-h-0 min-w-0 flex" style={{ background: t.bg }}>
      {/* Vertical categories stay on the physical right in RTL. */}
      <aside className="shrink-0 min-h-0 flex flex-col" style={{ width: p.narrow ? 152 : 178, background: t.surface, borderInlineEnd: `1px solid ${t.border}` }}>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
          <Chip t={t} active={p.selected === "الكل"} label="الكل" count={p.allCount} onClick={() => p.onSelect("الكل")} />
          {p.categories.map((c) => (
            <Chip key={c.id} t={t} active={p.selected === c.name} color={posV2CatColor(c.id)} label={c.name} count={c.count} onClick={() => p.onSelect(c.name)} />
          ))}
          {p.uncategorizedCount > 0 && (
            <Chip t={t} active={p.selected === "__uncategorized__"} color={t.muted} label="أخرى" count={p.uncategorizedCount} onClick={() => p.onSelect("__uncategorized__")} />
          )}
        </div>
      </aside>

      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2 px-4 pt-3 pb-2 shrink-0">
        <div className="flex items-center shrink-0" style={{ height: 44, padding: 3, borderRadius: 12, background: t.card, border: `1px solid ${t.border}` }}>
          {(["S", "M", "L"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => p.onCardSize(s)}
              style={{ width: 38, height: 36, borderRadius: 9, fontSize: 13, fontWeight: 800, background: p.cardSize === s ? t.accent : "transparent", color: p.cardSize === s ? t.onAccent : t.muted }}
            >
              {s}
            </button>
          ))}
        </div>
        {p.canManage && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setEditOpen((v) => !v)}
              className="flex items-center gap-1.5"
              style={{ height: 44, padding: "0 14px", borderRadius: 12, background: p.isSortMode ? t.accent : t.card, color: p.isSortMode ? t.onAccent : t.text, border: `1px solid ${t.border}`, fontSize: 13, fontWeight: 700 }}
            >
              <Pencil style={{ width: 15, height: 15 }} />
              {p.isSortMode ? "إنهاء الترتيب" : "تعديل"}
            </button>
            {editOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setEditOpen(false)} />
                <div className="absolute z-50 py-1" style={{ top: "100%", insetInlineEnd: 0, marginTop: 6, minWidth: 180, borderRadius: 12, background: t.surface, border: `1px solid ${t.border}`, boxShadow: "0 12px 32px rgba(0,0,0,0.25)" }}>
                  {[
                    { k: "c", l: "+ تصنيف", f: p.onAddCategory },
                    { k: "p", l: "+ منتج", f: p.onAddProduct },
                    { k: "s", l: p.isSortMode ? "إنهاء الترتيب" : "ترتيب", f: p.onSortMode },
                  ].map((i) => (
                    <button key={i.k} type="button" onClick={() => { setEditOpen(false); i.f(); }} className="w-full text-right" style={{ height: 44, padding: "0 14px", color: t.text, fontSize: 13 }}>
                      {i.l}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        {p.products.length === 0 ? (
          <div className="py-24 text-center" style={{ color: t.muted, fontSize: 14 }}>لا توجد منتجات مطابقة</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 }}>
            {p.products.map((prod) => {
              const catKey = prod.pos_category_id || (prod.category ? p.catIdByName[prod.category] : "") || prod.category || "";
              const color = posV2CatColor(catKey);
              const qty = p.qtyMap[prod.id] || 0;
              const name = p.displayName(prod);
              const initial = (prod.category || name || "?").trim().charAt(0);
              const openPrice = !prod.sell_price || prod.sell_price === 0;
              return (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => p.onAdd(prod)}
                  className="pos-v2-card relative text-right flex flex-col overflow-hidden"
                  style={{ background: t.card, border: `1px solid ${t.border}`, borderTop: `5px solid ${color}`, borderRadius: 14, ["--pv2-accent" as any]: t.accent }}
                >
                  {p.cardSize !== "S" && (
                    <div style={{ padding: 8, paddingBottom: 0 }}>
                      {prod.image_url ? (
                        <img src={prod.image_url} alt={name} loading="lazy" className="w-full object-cover" style={{ aspectRatio: "16 / 10", borderRadius: 10 }} />
                      ) : (
                        <div className="w-full flex items-center justify-center" style={{ aspectRatio: "16 / 10", borderRadius: 10, background: `${color}26`, color, fontSize: 30, fontWeight: 800 }}>
                          {initial}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex flex-col flex-1" style={{ padding: "10px 12px 12px", gap: 6 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: t.text, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{name}</div>
                    <div className="mt-auto flex items-end justify-between gap-2">
                      <div style={openPrice ? { fontSize: 13, color: t.muted, fontWeight: 600 } : { fontSize: 17, fontWeight: 800, color: t.price }} dir={openPrice ? "rtl" : "ltr"}>
                        {openPrice ? "سعر مفتوح" : fmtMoney(prod.sell_price)}
                      </div>
                      {qty > 0 && (
                        <span className="shrink-0 flex items-center justify-center" aria-label={`في السلة ${qty}`} style={{ minWidth: 24, height: 24, padding: "0 6px", borderRadius: 12, background: t.accent, color: t.onAccent, fontSize: 12, fontWeight: 800 }}>
                          {qty}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
