import { DndContext, closestCenter, type DragEndEvent, type SensorDescriptor, type SensorOptions } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PosV2Tokens } from "./posV2Theme";
import { posV2CatColor, fmtMoney } from "./posV2Theme";
import { usePosLang } from "@/i18n/pos-lang";
import { Star } from "lucide-react";

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
  isSortMode: boolean;
  catIdByName: Record<string, string>;
  narrow: boolean;
  /** Shared per-user category order handler from POSPage (same as /pos). */
  onCategoryDragEnd: (e: DragEndEvent) => void;
  /** Shared per-user product order handler from POSPage (same as /pos). */
  onProductDragEnd: (e: DragEndEvent) => void;
  dndSensors: SensorDescriptor<SensorOptions>[];
  /** Per-user "hide الكل" preference shared with /pos. */
  hideAll?: boolean;
  /** Per-user favorite products (shown first by POSPage). */
  favoriteIds?: Set<string>;
  onToggleFavorite?: (productId: string) => void;
};

function SortableChip(props: { id: string; sortMode: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.id, disabled: !props.sortMode });
  return (
    <div
      ref={setNodeRef}
      {...(props.sortMode ? attributes : {})}
      {...(props.sortMode ? listeners : {})}
      className="relative"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 10 : undefined, touchAction: props.sortMode ? "none" : undefined, cursor: props.sortMode ? "grab" : undefined }}
    >
      {props.children}
    </div>
  );
}

function SortableProduct(props: { id: string; sortMode: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.id, disabled: !props.sortMode });
  return (
    <div
      ref={setNodeRef}
      {...(props.sortMode ? attributes : {})}
      {...(props.sortMode ? listeners : {})}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.65 : 1,
        zIndex: isDragging ? 20 : undefined,
        touchAction: props.sortMode ? "none" : undefined,
        cursor: props.sortMode ? "grab" : undefined,
      }}
    >
      {props.children}
    </div>
  );
}

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
  const { dir, t: tr } = usePosLang();
  const baseCols = p.cardSize === "S" ? 6 : p.cardSize === "M" ? 5 : 4;
  const cols = Math.max(2, baseCols - (p.narrow ? 1 : 0));

  return (
    <div dir="rtl" className="flex-1 min-h-0 min-w-0 flex" style={{ background: t.bg }}>
      {/* Vertical categories stay on the physical right in RTL. */}
      <aside dir={dir} className="shrink-0 min-h-0 flex flex-col" style={{ width: p.narrow ? 152 : 178, background: t.surface, borderInlineEnd: `1px solid ${t.border}` }}>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
          {!p.hideAll && <Chip t={t} active={p.selected === "الكل"} label={tr("الكل")} count={p.allCount} onClick={() => p.onSelect("الكل")} />}
          <DndContext sensors={p.dndSensors} collisionDetection={closestCenter} onDragEnd={p.onCategoryDragEnd}>
            <SortableContext items={p.categories.map((c) => c.id)} strategy={verticalListSortingStrategy} disabled={!p.isSortMode}>
              {p.categories.map((c) => (
                <SortableChip key={c.id} id={c.id} sortMode={p.isSortMode}>
                  <div style={p.isSortMode ? { outline: `1px dashed ${t.accent}`, borderRadius: 10 } : undefined}>
                    <Chip t={t} active={p.selected === c.name} color={posV2CatColor(c.id)} label={c.name} count={c.count} onClick={() => { if (!p.isSortMode) p.onSelect(c.name); }} />
                  </div>
                </SortableChip>
              ))}
            </SortableContext>
          </DndContext>
          {p.uncategorizedCount > 0 && (
            <Chip t={t} active={p.selected === "__uncategorized__"} color={t.muted} label={tr("أخرى")} count={p.uncategorizedCount} onClick={() => p.onSelect("__uncategorized__")} />
          )}
        </div>
      </aside>

      <div dir={dir} className="flex-1 min-h-0 min-w-0 flex flex-col">
      {/* Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {p.products.length === 0 ? (
          <div className="py-24 text-center" style={{ color: t.muted, fontSize: 14 }}>{tr("لا توجد منتجات مطابقة")}</div>
        ) : (
          <DndContext sensors={p.dndSensors} collisionDetection={closestCenter} onDragEnd={p.onProductDragEnd}>
            <SortableContext items={p.products.map((product) => product.id)} strategy={rectSortingStrategy} disabled={!p.isSortMode}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 }}>
            {p.products.map((prod) => {
              const catKey = prod.pos_category_id || (prod.category ? p.catIdByName[prod.category] : "") || prod.category || "";
              const color = posV2CatColor(catKey);
              const qty = p.qtyMap[prod.id] || 0;
              const name = p.displayName(prod);
              const initial = (prod.category || name || "?").trim().charAt(0);
              const openPrice = !prod.sell_price || prod.sell_price === 0;
              return (
                <SortableProduct key={prod.id} id={prod.id} sortMode={p.isSortMode}>
                <button
                  type="button"
                  onClick={() => p.onAdd(prod)}
                  className="pos-v2-card relative text-right flex flex-col overflow-hidden"
                  style={{ width: "100%", height: "100%", background: t.card, border: `1px solid ${t.border}`, borderTop: `5px solid ${color}`, borderRadius: 14, outline: p.isSortMode ? `1px dashed ${t.accent}` : undefined, ["--pv2-accent" as any]: t.accent }}
                >
                  {!p.isSortMode && p.onToggleFavorite && (() => {
                    const fav = !!p.favoriteIds?.has(prod.id);
                    return (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-pressed={fav}
                        aria-label={fav ? tr("إزالة من المفضلة") : tr("إضافة للمفضلة")}
                        title={fav ? tr("إزالة من المفضلة") : tr("إضافة للمفضلة")}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); p.onToggleFavorite!(prod.id); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); p.onToggleFavorite!(prod.id); } }}
                        className="absolute z-10 flex items-center justify-center"
                        style={{ top: 6, left: 6, width: 30, height: 30, borderRadius: 15, background: fav ? t.card : `${t.card}cc`, border: `1px solid ${t.border}` }}
                      >
                        <Star size={16} strokeWidth={2.2} style={{ color: fav ? "#F5B301" : t.muted }} fill={fav ? "#F5B301" : "none"} />
                      </span>
                    );
                  })()}
                  {!p.isSortMode && p.onEditProduct && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={tr("تعديل الصنف")}
                      title={tr("تعديل الصنف")}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); p.onEditProduct!(prod); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); p.onEditProduct!(prod); } }}
                      className="absolute z-10 flex items-center justify-center"
                      style={{ top: 6, left: p.onToggleFavorite ? 42 : 6, width: 30, height: 30, borderRadius: 15, background: `${t.card}cc`, border: `1px solid ${t.border}` }}
                    >
                      <Pencil size={14} strokeWidth={2.2} style={{ color: t.muted }} />
                    </span>
                  )}


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
                    <div style={{ fontSize: 15, fontWeight: 700, color: t.text, lineHeight: 1.35, overflowWrap: "anywhere" }}>{name}</div>
                    <div className="mt-auto flex items-end justify-between gap-2">
                      <div style={openPrice ? { fontSize: 13, color: t.muted, fontWeight: 600 } : { fontSize: 17, fontWeight: 800, color: t.price }} dir={openPrice ? "rtl" : "ltr"}>
                        {openPrice ? tr("سعر مفتوح") : fmtMoney(prod.sell_price)}
                      </div>
                      {qty > 0 && (
                        <span className="shrink-0 flex items-center justify-center" aria-label={`${tr("في السلة")} ${qty}`} style={{ minWidth: 24, height: 24, padding: "0 6px", borderRadius: 12, background: t.accent, color: t.onAccent, fontSize: 12, fontWeight: 800 }}>
                          {qty}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                </SortableProduct>
              );
            })}
          </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
      </div>
    </div>
  );
}
