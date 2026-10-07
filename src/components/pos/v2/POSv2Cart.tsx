import { useState, type ReactNode } from "react";
import { Plus, Minus, Trash2, User, X, Tag, StickyNote, PauseCircle, ShoppingCart, Save, Printer, MoreHorizontal, ShoppingBag, Truck, UtensilsCrossed, Send, Smartphone, ClipboardList, Clock } from "lucide-react";
import type { PosV2Tokens } from "./posV2Theme";
import { fmtMoney } from "./posV2Theme";
import { usePosLang } from "@/i18n/pos-lang";

export type PosV2Line = { id: string; name: string; qty: number; unit_price: number; base_price?: number; price_reason?: string | null; total: number; note?: string; modifiers?: { option_name: string }[] };
type OrderPill = { id: string; label: string; count: number };
type OrderType = "takeaway" | "delivery" | "dine_in";

type Props = {
  /** Short screens: tighter rows so cart lines stay visible without scrolling the page. */
  compact?: boolean;
  t: PosV2Tokens;
  width: number;
  orders: OrderPill[];
  activeIndex: number;
  onSelectOrder: (i: number) => void;
  onNewOrder: () => void;
  onClearOrder: () => void;
  onCloseOrder?: (i: number) => void;
  orderTypes: OrderType[];
  activeType: OrderType | null;
  onOrderType: (t: OrderType) => void;
  customerName: string;
  onClearCustomer: () => void;
  customerNode: ReactNode;
  lines: PosV2Line[];
  lineName: (l: PosV2Line) => string;
  onQty: (index: number, qty: number) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
  onLineTap: (index: number) => void;
  selectedLineIndex: number | null;
  onLineNote: (index: number, note: string) => void;
  canEditPrice: boolean;
  onPrice: (index: number, price: number) => void;
  onPriceBlur: (index: number) => void;
  hasAddons: (index: number) => boolean;
  onAddons: (index: number) => void;
  discountActive: boolean;
  onDiscount: () => void;
  canDiscount: boolean;
  orderNote: string;
  onOrderNote: (v: string) => void;
  onHold: () => void;
  subtotal: number;
  pieces: number;
  discount: number;
  tax: number;
  total: number;
  payTotal: number;
  canPay: boolean;
  showPay: boolean;
  onPay: () => void;
  showDispatch?: boolean;
  onDispatch?: () => void;
  onSave: () => void;
  saveDisabled: boolean;
  showPrint: boolean;
  onPrint: () => void;
  onMore: () => void;
  onAppInbox?: () => void;
  appInboxCount?: number;
  onDispatchLog?: () => void;
  pendingDispatchCount?: number;
  dispatchLateCount?: number;
  onSchedule?: () => void;
  onScheduled?: () => void;
  scheduledCount?: number;
  extraNode?: ReactNode;
};

const TYPE_LABEL: Record<OrderType, string> = { takeaway: "سفري", delivery: "توصيل", dine_in: "طاولة" };
const TYPE_ICON: Record<OrderType, typeof ShoppingBag> = { takeaway: ShoppingBag, delivery: Truck, dine_in: UtensilsCrossed };

function Key({ t, k, onAccent }: { t: PosV2Tokens; k: string; onAccent?: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 5, border: `1px solid ${onAccent || t.border}`, color: onAccent || t.muted, opacity: 0.85 }}>{k}</span>
  );
}

export default function POSv2Cart(p: Props) {
  const { t } = p;
  const { dir, t: tr } = usePosLang();
  const [noteOpen, setNoteOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const c = !!p.compact;
  const outlineBtn = { height: c ? 28 : 32, borderRadius: 9, border: `1px solid ${t.border}`, background: "transparent", color: t.text, fontSize: 11.5, fontWeight: 700 } as const;
  const empty = p.lines.length === 0;

  return (
    <aside
      dir={dir}
      className="pos-v2-cart flex flex-col min-h-0 shrink-0"
      style={{ width: p.width, background: t.surface, borderInlineEnd: `1px solid ${t.border}`, color: t.text }}
    >
      {/* a) order tabs */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0">
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {p.orders.map((o, i) => {
            const a = i === p.activeIndex;
            return (
              <button key={o.id} type="button" onClick={() => p.onSelectOrder(i)} className="shrink-0 flex items-center gap-1.5"
                style={{ height: 40, padding: "0 14px", borderRadius: 10, fontSize: 13, fontWeight: 800, background: a ? t.accent : t.input, color: a ? t.onAccent : t.text, border: `1px solid ${a ? t.accent : t.border}` }}>
                {o.label}
                {o.count > 0 && <span style={{ fontSize: 10, opacity: 0.75 }}>{o.count}</span>}
                {p.onCloseOrder && p.orders.length > 1 && (
                  <span
                    role="button"
                    aria-label={tr("إغلاق الطلب")}
                    onClick={(e) => { e.stopPropagation(); p.onCloseOrder?.(i); }}
                    className="flex items-center justify-center rounded-full"
                    style={{ width: 18, height: 18, marginInlineStart: 2, background: a ? "rgba(0,0,0,0.18)" : "rgba(128,128,128,0.25)", color: a ? t.onAccent : t.muted }}
                  >
                    <X style={{ width: 11, height: 11 }} />
                  </span>
                )}
              </button>
            );
          })}
          <button type="button" onClick={p.onNewOrder} className="shrink-0 flex items-center justify-center" title={tr("طلب جديد")}
            style={{ width: 40, height: 40, borderRadius: 10, border: `1.5px dashed ${t.border}`, color: t.muted }}>
            <Plus style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <button type="button" onClick={p.onClearOrder} disabled={empty} className="shrink-0 flex items-center justify-center disabled:opacity-40" title={tr("إفراغ الطلب")}
          style={{ width: 40, height: 40, borderRadius: 10, color: t.muted }}>
          <Trash2 style={{ width: 18, height: 18 }} />
        </button>
      </div>

      {/* b) order type */}
      {p.orderTypes.length > 0 && (
        <div className="px-4 pb-1.5 shrink-0">
          <div className="flex" style={{ padding: 2, borderRadius: 9, background: t.input, border: `1px solid ${t.border}` }}>
            {p.orderTypes.map((ty) => {
              const a = p.activeType === ty;
              const Icon = TYPE_ICON[ty];
              return (
                <button key={ty} type="button" onClick={() => p.onOrderType(ty)} className="flex-1 flex items-center justify-center gap-1"
                  style={{ height: 28, borderRadius: 7, fontSize: 11.5, fontWeight: 800, background: a ? t.accent : "transparent", color: a ? t.onAccent : t.muted }}>
                  <Icon style={{ width: 13, height: 13 }} />
                  {tr(TYPE_LABEL[ty])}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* c) customer */}
      <div className="px-4 pb-2 shrink-0">
        {p.customerName ? (
          <div className="flex items-center gap-2" style={{ height: 44, padding: "0 12px", borderRadius: 12, background: t.input, border: `1px solid ${t.border}` }}>
            <User style={{ width: 16, height: 16, color: t.muted }} />
            <span className="flex-1 truncate" style={{ fontSize: 13, fontWeight: 700 }}>{p.customerName}</span>
            <button type="button" onClick={p.onClearCustomer} style={{ color: t.muted }} title={tr("إزالة الزبون")}><X style={{ width: 16, height: 16 }} /></button>
          </div>
        ) : customerOpen ? (
          <div className="flex items-center gap-2">
            <div className={`pos-v2-customer flex-1 min-w-0 ${t.dark ? "" : "pos-v2-light"}`}>{p.customerNode}</div>
            <button type="button" onClick={() => setCustomerOpen(false)} style={{ color: t.muted }}><X style={{ width: 16, height: 16 }} /></button>
          </div>
        ) : (
          <button type="button" onClick={() => setCustomerOpen(true)} className="w-full flex items-center gap-2"
            style={{ height: 44, padding: "0 12px", borderRadius: 12, border: `1.5px dashed ${t.border}`, color: t.text, fontSize: 13, fontWeight: 700 }}>
            <User style={{ width: 16, height: 16 }} />
            {tr("إضافة زبون")}
            <span className="ms-auto" style={{ color: t.muted, fontWeight: 500 }}>{tr("زبون نقدي")}</span>
          </button>
        )}
      </div>

      {p.extraNode}

      {/* d/e) lines */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4">
        {empty ? (
          <div className="text-center" style={{ paddingTop: 36 }}>
            <ShoppingCart style={{ width: 40, height: 40, color: t.muted, opacity: 0.5, margin: "0 auto 10px" }} strokeWidth={1.6} />
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{tr("ابدأ بإضافة المنتجات")}</div>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>{tr("أو امسح الباركود")}</div>
          </div>
        ) : (
          p.lines.map((l, i) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 cursor-pointer" onClick={(e) => { if ((e.target as HTMLElement).closest("button, input")) return; p.onLineTap(i); }}
              style={{ padding: c ? "4px 0" : "7px 0", borderBottom: `1px solid ${t.border}` }}>
              <div className="flex-1 min-w-0 flex items-center gap-1.5" title={[p.lineName(l), l.modifiers?.map((m) => m.option_name).join("، "), l.note].filter(Boolean).join(" — ")}>
                <div className="truncate" style={{ fontSize: c ? 12 : 13, fontWeight: 800 }}>{p.lineName(l)}</div>
                {!!l.note?.trim() && <StickyNote className="shrink-0" style={{ width: 12, height: 12, color: t.price }} />}
              </div>
              {p.canEditPrice ? (
                <div className="flex items-center shrink-0" style={{ color: t.muted, fontSize: 11 }}>
                  <span>₪</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.unit_price}
                    aria-label={`${tr("السعر")} ${p.lineName(l)}`}
                    title={l.price_reason || tr("تعديل سعر الوحدة")}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0) p.onPrice(i, n); }}
                    onBlur={() => p.onPriceBlur(i)}
                    className="w-16 text-center focus:outline-none"
                    style={{ height: 28, borderRadius: 7, background: t.input, border: `1px solid ${t.border}`, color: t.text, direction: "ltr", fontSize: 12, fontWeight: 700 }}
                  />
                  {l.base_price != null && Math.abs(l.unit_price - l.base_price) >= 0.001 && (
                    <span title={l.price_reason || tr("بانتظار تسجيل سبب تعديل السعر")} style={{ color: t.warnText, fontSize: 10, fontWeight: 800 }}>*</span>
                  )}
                </div>
              ) : <div className="shrink-0" style={{ fontSize: 12, color: t.muted }}>{fmtMoney(l.unit_price)}</div>}
              {p.hasAddons(i) && (
                <button type="button" title={l.modifiers?.map((m) => m.option_name).join("، ") || tr("إضافات")} onClick={(e) => { e.stopPropagation(); p.onAddons(i); }} style={{ height: 28, padding: "0 6px", borderRadius: 7, border: `1px dashed ${t.accent}`, color: t.accent, fontSize: 10, fontWeight: 700 }}>
                  {tr("إضافات")}
                </button>
              )}
              <div className="flex items-center shrink-0" style={{ height: 30, borderRadius: 8, background: t.input, border: `1px solid ${t.border}` }}>
                <button type="button" onClick={() => p.onQty(i, l.qty + 1)} style={{ width: 27, height: 28, color: t.text }} className="flex items-center justify-center"><Plus style={{ width: 13, height: 13 }} /></button>
                <input type="number" min={1} max={9999} value={l.qty} aria-label={`كمية ${p.lineName(l)}`} onClick={(e) => { e.stopPropagation(); e.currentTarget.select(); }} onChange={(e) => { const n = Number.parseInt(e.target.value, 10); if (Number.isFinite(n) && n >= 1 && n <= 9999) p.onQty(i, n); }} className="tabular-nums text-center focus:outline-none" style={{ width: 27, background: "transparent", color: t.text, fontSize: 12, fontWeight: 800 }} />
                <button type="button" onClick={() => (l.qty <= 1 ? (p.canRemove ? p.onRemove(i) : undefined) : p.onQty(i, l.qty - 1))} style={{ width: 27, height: 28, color: t.text }} className="flex items-center justify-center"><Minus style={{ width: 13, height: 13 }} /></button>
              </div>
              <div className="tabular-nums shrink-0 text-left" dir="ltr" style={{ minWidth: 55, fontSize: 13, fontWeight: 800 }}>{fmtMoney(l.total)}</div>
              {p.canRemove && (
                <button type="button" title={tr("حذف الصنف")} aria-label={tr("حذف الصنف")} onClick={(e) => { e.stopPropagation(); p.onRemove(i); }} className="shrink-0 flex items-center justify-center" style={{ width: 26, height: 28, borderRadius: 7, color: t.danger }}>
                  <X style={{ width: 14, height: 14 }} />
                </button>
              )}
              {((l.modifiers?.length || 0) > 0 || (!!l.note?.trim() && p.selectedLineIndex !== i)) && (
                <div className="w-full flex flex-wrap items-center gap-1" style={{ marginTop: -2 }}>
                  {l.modifiers?.map((m, mi) => (
                    <span key={mi} style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 6, background: `${t.accent}1f`, color: t.accent }}>{m.option_name}</span>
                  ))}
                  {!!l.note?.trim() && p.selectedLineIndex !== i && (
                    <span className="truncate" style={{ fontSize: 11, color: t.price, maxWidth: "100%" }}>📝 {l.note}</span>
                  )}
                </div>
              )}
              {p.selectedLineIndex === i && (
                <input
                  autoFocus
                  value={l.note || ""}
                  onChange={(e) => p.onLineNote(i, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder={tr("ملاحظة على الصنف...")}
                  className="w-full focus:outline-none"
                  style={{ height: 38, borderRadius: 9, padding: "0 10px", background: t.input, border: `1px dashed ${t.border}`, color: t.text, fontSize: 12 }}
                />
              )}
            </div>
          ))
        )}
      </div>

      {/* f) quick actions */}
      <div className={`px-4 ${c ? "pt-1" : "pt-1.5"} shrink-0`}>
        {noteOpen || p.orderNote ? (
          <div className="flex items-center gap-2 mb-1.5">
            <input autoFocus={noteOpen && !p.orderNote} value={p.orderNote} onChange={(e) => p.onOrderNote(e.target.value)} placeholder={tr("ملاحظة على الفاتورة")}
              className="flex-1 focus:outline-none" style={{ height: 32, borderRadius: 8, padding: "0 10px", background: t.input, border: `1px solid ${t.border}`, color: t.text, fontSize: 12 }} />
            <button type="button" onClick={() => { p.onOrderNote(""); setNoteOpen(false); }} style={{ color: t.muted }}><X style={{ width: 16, height: 16 }} /></button>
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-1.5">
          <button type="button" onClick={p.onDiscount} disabled={!p.canDiscount} className="flex items-center justify-center gap-1 disabled:opacity-40" style={{ ...outlineBtn, ...(p.discountActive ? { borderColor: t.accent, color: t.accent } : {}) }}>
            <Tag style={{ width: 13, height: 13 }} />{tr(p.discountActive ? "إلغاء الخصم" : "خصم")}
          </button>
          <button type="button" onClick={() => setNoteOpen(true)} className="flex items-center justify-center gap-1" style={outlineBtn}>
            <StickyNote style={{ width: 13, height: 13 }} />{tr("ملاحظة")}
          </button>
          <button type="button" onClick={p.onHold} disabled={empty} className="flex items-center justify-center gap-1 disabled:opacity-40" style={outlineBtn}>
            <PauseCircle style={{ width: 13, height: 13 }} />{tr("تعليق")}
          </button>
        </div>
      </div>

      {/* g) totals */}
      <div className={`px-4 ${c ? "pt-1" : "pt-1.5"} shrink-0`} style={{ fontSize: 12 }}>
        {!c && <div className="flex justify-between" style={{ color: t.muted, marginBottom: 2 }}><span>{tr("المجموع")} ({p.pieces} {tr("قطع")})</span><span dir="ltr">{fmtMoney(p.subtotal)}</span></div>}
        {(!c || p.discount > 0) && <div className="flex justify-between" style={{ color: t.muted, marginBottom: 2 }}><span>{tr("الخصم")}</span><span dir="ltr">{fmtMoney(p.discount)}</span></div>}
        {p.tax > 0 && <div className="flex justify-between" style={{ color: t.muted, marginBottom: 2 }}><span>{tr("الضريبة")}</span><span dir="ltr">{fmtMoney(p.tax)}</span></div>}
        <div className="flex justify-between items-baseline" style={{ marginTop: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>{tr("الإجمالي")}</span>
          <span dir="ltr" className="tabular-nums" style={{ fontSize: c ? 18 : 22, fontWeight: 800 }}>{fmtMoney(p.total)}</span>
        </div>
      </div>

      {/* h/i) pay + secondary */}
      <div className={`px-4 ${c ? "pt-1.5 pb-2" : "pt-2 pb-2.5"} shrink-0 space-y-1.5`}>
        {p.showDispatch && (
          <button type="button" onClick={p.onDispatch} disabled={empty} className="w-full flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ height: c ? 40 : 46, borderRadius: 11, background: p.t.accent, color: p.t.onAccent, fontSize: 15, fontWeight: 800, cursor: empty ? "not-allowed" : "pointer" }}>
            <Send style={{ width: 17, height: 17 }} />
            <span>{tr("تحويل للفرع")}</span>
            <Key t={t} k="F12" onAccent={p.t.onAccent} />
          </button>
        )}
        {p.showPay && (
          <button type="button" onClick={p.onPay} disabled={!p.canPay} className="w-full flex items-center justify-center gap-2"
            style={{ height: c ? 38 : 44, borderRadius: 11, background: p.t.pay, color: p.t.onPay, fontSize: 16, fontWeight: 800, opacity: p.canPay ? 1 : 0.4, cursor: p.canPay ? "pointer" : "not-allowed" }}>
            <span>{tr("دفع")} <span dir="ltr">{fmtMoney(p.payTotal)}</span></span>
            <Key t={t} k="F2" onAccent={p.t.onPay} />
          </button>
        )}
        <div className="flex gap-1.5">
          <button type="button" onClick={p.onSave} disabled={p.saveDisabled} className="flex-1 flex items-center justify-center gap-1.5 disabled:opacity-40" style={outlineBtn}>
            <Save style={{ width: 13, height: 13 }} />{tr("حفظ")}<Key t={t} k="F10" />
          </button>
          {p.showPrint && (
            <button type="button" onClick={p.onPrint} disabled={empty} className="flex-1 flex items-center justify-center gap-1.5 disabled:opacity-40" style={outlineBtn}>
              <Printer style={{ width: 13, height: 13 }} />{tr("طباعة")}<Key t={t} k="F9" />
            </button>
          )}
          <button type="button" onClick={p.onMore} className="flex items-center justify-center" style={{ ...outlineBtn, width: 36 }} title={tr("المزيد")}>
            <MoreHorizontal style={{ width: 15, height: 15 }} />
          </button>
        </div>
        {p.showDispatch && (
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={p.onAppInbox} className="relative flex items-center justify-center gap-1.5" style={outlineBtn}>
              <Smartphone style={{ width: 13, height: 13 }} />{tr("طلبات التطبيق")}
              {!!p.appInboxCount && p.appInboxCount > 0 && <span className="tabular-nums" style={{ color: t.accent, fontWeight: 900 }}>{p.appInboxCount}</span>}
            </button>
            <button type="button" onClick={p.onDispatchLog} className="relative flex items-center justify-center gap-1.5" style={outlineBtn}>
              <ClipboardList style={{ width: 13, height: 13 }} />{tr("سجل المحوّلة")}
              {!!p.pendingDispatchCount && p.pendingDispatchCount > 0 && <span className="tabular-nums" style={{ color: t.accent, fontWeight: 900 }}>{p.pendingDispatchCount}</span>}
              {!!p.dispatchLateCount && p.dispatchLateCount > 0 && <span className="tabular-nums" style={{ color: t.warnText, fontWeight: 900 }}>{tr("تأخر")} {p.dispatchLateCount}</span>}
            </button>
            <button type="button" onClick={p.onSchedule} disabled={empty} className="flex items-center justify-center gap-1.5 disabled:opacity-40" style={outlineBtn}>
              <Clock style={{ width: 13, height: 13 }} />{tr("جدولة")}
            </button>
            <button type="button" onClick={p.onScheduled} className="flex items-center justify-center gap-1.5" style={outlineBtn}>
              <Clock style={{ width: 13, height: 13 }} />{tr("المجدولة")}
              {!!p.scheduledCount && p.scheduledCount > 0 && <span className="tabular-nums" style={{ color: t.accent, fontWeight: 900 }}>{p.scheduledCount}</span>}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
