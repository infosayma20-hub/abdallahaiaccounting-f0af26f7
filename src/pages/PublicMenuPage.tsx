import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Minus, ShoppingBag, Check, ChefHat, X, Clock } from "lucide-react";
import { toast } from "sonner";

type Resolved = {
  user_id: string; branch_id: string; branch_name: string; account_name: string;
  welcome_message: string | null; require_phone: boolean; mode: string;
};
type ModifierOption = { id: string; name: string; extra_price: number; is_default: boolean };
type ModifierGroup = {
  id: string; name: string; selection_type: string;
  is_required: boolean; min_select: number | null; max_select: number | null;
  options: ModifierOption[];
};
type Product = {
  id: string; name: string; price: number; image_url: string | null;
  category_id: string; description: string | null;
  modifier_groups: ModifierGroup[];
};
type Category = { id: string; name: string; sort_order: number | null };
type CartLine = {
  product_id: string; name: string; base_price: number;
  unit_price: number; qty: number; note: string;
  modifiers: { group_id: string; group_name: string; option_id: string; name: string; extra_price: number }[];
};

export default function PublicMenuPage() {
  const { accountSlug, branchSlug, tableCode } = useParams();
  const [ctx, setCtx] = useState<Resolved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCat, setActiveCat] = useState<string>("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [submittedStatus, setSubmittedStatus] = useState<string>("pending");
  const [detail, setDetail] = useState<Product | null>(null);

  // Resolve
  useEffect(() => {
    if (!accountSlug || !branchSlug) return;
    (async () => {
      const { data, error } = await (supabase as any).rpc("qr_menu_resolve", {
        _account_slug: accountSlug, _branch_slug: branchSlug,
      });
      if (error || !data || data.length === 0) { setError("المنيو غير متاح حالياً"); return; }
      setCtx(data[0] as Resolved);
    })();
  }, [accountSlug, branchSlug]);

  // Load menu
  useEffect(() => {
    if (!ctx) return;
    (async () => {
      const { data } = await (supabase as any).rpc("qr_menu_get_menu", { _user_id: ctx.user_id, _branch_id: ctx.branch_id });
      if (data?.error) { setError("المنيو غير متاح"); return; }
      setCategories((data?.categories || []) as Category[]);
      setProducts((data?.products || []) as Product[]);
      if (data?.categories?.[0]) setActiveCat(data.categories[0].id);
    })();
  }, [ctx]);

  // Realtime: track submitted order status
  useEffect(() => {
    if (!submittedId) return;
    const ch = supabase.channel("qr_order_" + submittedId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "qr_menu_orders", filter: `id=eq.${submittedId}` },
        (payload: any) => setSubmittedStatus(payload.new.status))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [submittedId]);

  const filtered = useMemo(() => products.filter(p => p.category_id === activeCat), [products, activeCat]);
  const total = cart.reduce((s, l) => s + l.unit_price * l.qty, 0);

  const openProduct = (p: Product) => {
    if (!p.modifier_groups || p.modifier_groups.length === 0) {
      // simple add — no modifiers
      setCart(prev => {
        const idx = prev.findIndex(l => l.product_id === p.id && l.modifiers.length === 0);
        if (idx >= 0) { const c = [...prev]; c[idx] = { ...c[idx], qty: c[idx].qty + 1 }; return c; }
        return [...prev, {
          product_id: p.id, name: p.name,
          base_price: Number(p.price) || 0, unit_price: Number(p.price) || 0,
          qty: 1, note: "", modifiers: [],
        }];
      });
      return;
    }
    setDetail(p);
  };
  const addLineFromDetail = (line: CartLine) => {
    setCart(prev => [...prev, line]);
    setDetail(null);
  };
  const changeQty = (i: number, d: number) => setCart(prev => {
    const c = [...prev]; const q = c[i].qty + d;
    if (q <= 0) c.splice(i, 1); else c[i] = { ...c[i], qty: q };
    return c;
  });

  const submit = async () => {
    if (!ctx) return;
    if (cart.length === 0) { toast.error("السلة فارغة"); return; }
    if (ctx.require_phone && !phone.trim()) { toast.error("الجوال مطلوب"); return; }
    setSubmitting(true);
    const itemsPayload = cart.map(l => ({
      product_id: l.product_id, name: l.name, qty: l.qty,
      price: l.unit_price, base_price: l.base_price,
      modifiers: l.modifiers, note: l.note,
    }));
    const { data, error } = await supabase.from("qr_menu_orders").insert({
      user_id: ctx.user_id, branch_id: ctx.branch_id,
      table_id: tableCode || null,
      customer_name: name.trim() || null, customer_phone: phone.trim() || null,
      items: itemsPayload, notes: notes.trim() || null,
    } as any).select("id").single();
    setSubmitting(false);
    if (error) { toast.error("تعذّر الإرسال: " + error.message); return; }
    setSubmittedId((data as any).id);
    setSubmittedStatus("pending");
    setShowCart(false);
  };

  if (error) {
    return (
      <div dir="rtl" className="min-h-[100dvh] grid place-items-center p-6 text-center"
        style={{ background: "#ffffff", color: "#1F2C7C" }}>
        <div className="space-y-2">
          <ChefHat className="h-12 w-12 mx-auto" style={{ color: "#E63027" }} />
          <h1 className="text-2xl font-bold">{error}</h1>
          <p className="text-sm opacity-70">يرجى التواصل مع الكاشير</p>
        </div>
      </div>
    );
  }
  if (!ctx) return (
    <div className="min-h-[100dvh] grid place-items-center" style={{ background: "#ffffff", color: "#1F2C7C" }}>
      <div className="animate-pulse text-sm tracking-widest">جارٍ تحضير المنيو…</div>
    </div>
  );

  if (submittedId) {
    const labels: Record<string, string> = {
      pending: "طلبك قيد المراجعة…", accepted: "تم قبول طلبك — يجهّز الآن",
      rejected: "اعتذر الكاشير عن الطلب", converted: "طلبك في الإعداد", cancelled: "تم الإلغاء",
    };
    const isOk = submittedStatus === "accepted" || submittedStatus === "converted";
    const isPending = submittedStatus === "pending";
    return (
      <div dir="rtl" className="min-h-[100dvh] grid place-items-center p-6"
        style={{ background: "#ffffff", color: "#1F2C7C" }}>
        <div className="max-w-sm w-full rounded-3xl p-8 text-center space-y-4 border-2"
          style={{ background: "#ffffff", borderColor: "#F1F1F5", boxShadow: "0 20px 60px -20px rgba(31,44,124,0.15)" }}>
          <div className="mx-auto h-20 w-20 rounded-full grid place-items-center"
            style={{ background: isOk ? "#16A34A" : isPending ? "#1F2C7C" : "#E63027" }}>
            {isPending ? <Clock className="h-10 w-10 text-white" /> : isOk ? <Check className="h-10 w-10 text-white" /> : <X className="h-10 w-10 text-white" />}
          </div>
          <h1 className="text-xl font-bold" style={{ color: "#1F2C7C" }}>{labels[submittedStatus] || submittedStatus}</h1>
          <p className="text-sm opacity-60">{ctx.account_name} · {ctx.branch_name}</p>
          {submittedStatus === "rejected" && (
            <button onClick={() => { setSubmittedId(null); setCart([]); }}
              className="w-full py-3 rounded-xl font-bold text-white"
              style={{ background: "#E63027" }}>
              إعادة الطلب
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-[100dvh] pb-28"
      style={{ background: "#F8F9FB", color: "#1F2C7C" }}>
      {/* Hero — white with red accent */}
      <div className="relative overflow-hidden bg-white" style={{ borderBottom: "4px solid #E63027" }}>
        <div className="relative px-5 pt-8 pb-6 text-center">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl mb-3"
            style={{ background: "#E63027", boxShadow: "0 12px 30px -10px rgba(230,48,39,0.5)" }}>
            <ChefHat className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: "#1F2C7C" }}>{ctx.account_name}</h1>
          <div className="mt-2 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold"
            style={{ background: "#F1F2F8", color: "#1F2C7C" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#16A34A", boxShadow: "0 0 6px #16A34A" }} />
            {ctx.branch_name}{tableCode ? ` · طاولة ${tableCode.slice(0, 4)}` : ""}
          </div>
          {ctx.welcome_message && (
            <p className="text-sm mt-3 max-w-md mx-auto leading-relaxed" style={{ color: "#5B6478" }}>{ctx.welcome_message}</p>
          )}
        </div>
      </div>

      {/* Categories — sticky pills */}
      <div className="sticky top-0 z-20 bg-white" style={{ borderBottom: "1px solid #ECEEF3" }}>
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 px-4 py-3 min-w-max">
            {categories.map(c => {
              const active = activeCat === c.id;
              return (
                <button key={c.id} onClick={() => setActiveCat(c.id)}
                  className="px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all"
                  style={active
                    ? { background: "#E63027", color: "#fff", boxShadow: "0 6px 16px -6px rgba(230,48,39,0.55)" }
                    : { background: "#F1F2F8", color: "#1F2C7C" }}>
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="px-4 pt-5 grid grid-cols-2 gap-3">
        {filtered.map(p => (
          <button key={p.id} onClick={() => openProduct(p)}
            className="text-right rounded-2xl overflow-hidden transition-transform active:scale-[0.97] bg-white"
            style={{ border: "1px solid #ECEEF3", boxShadow: "0 6px 20px -12px rgba(31,44,124,0.18)" }}>
            <div className="relative h-32 overflow-hidden bg-white">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full grid place-items-center" style={{ background: "#F8F9FB" }}>
                  <ChefHat className="h-10 w-10" style={{ color: "#E63027", opacity: 0.35 }} />
                </div>
              )}
            </div>
            <div className="p-3 space-y-2">
              <p className="text-sm font-bold leading-tight line-clamp-1" style={{ color: "#1F2C7C" }}>{p.name}</p>
              {p.description && (
                <p className="text-[11px] line-clamp-2 leading-snug" style={{ color: "#7C8499" }}>{p.description}</p>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-black" style={{ color: "#E63027" }}>₪{Number(p.price).toFixed(2)}</span>
                <span className="h-7 w-7 rounded-full grid place-items-center text-white"
                  style={{ background: "#E63027" }}>
                  <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-2 text-center text-sm py-10" style={{ color: "#9AA1B4" }}>لا توجد أصناف في هذا القسم</p>
        )}
      </div>

      {/* Floating cart bar */}
      {cart.length > 0 && !showCart && (
        <button onClick={() => setShowCart(true)}
          className="fixed bottom-4 inset-x-4 rounded-2xl py-4 px-5 flex items-center justify-between font-bold z-30 text-white animate-in fade-in slide-in-from-bottom-4"
          style={{ background: "#E63027", boxShadow: "0 18px 40px -10px rgba(230,48,39,0.55)" }}>
          <span className="flex items-center gap-3">
            <span className="relative">
              <ShoppingBag className="h-5 w-5" />
              <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full grid place-items-center text-[10px] font-black"
                style={{ background: "#fff", color: "#E63027" }}>
                {cart.reduce((s, l) => s + l.qty, 0)}
              </span>
            </span>
            عرض الطلب
          </span>
          <span className="text-lg">₪{total.toFixed(2)}</span>
        </button>
      )}

      {/* Cart sheet */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(31,44,124,0.35)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowCart(false)}>
          <div className="w-full rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto bg-white"
            style={{ color: "#1F2C7C" }}
            onClick={e => e.stopPropagation()} dir="rtl">
            <div className="mx-auto w-12 h-1 rounded-full mb-4" style={{ background: "#E5E7EE" }} />
            <h2 className="text-xl font-black mb-4" style={{ color: "#1F2C7C" }}>طلبك</h2>
            <div className="space-y-3">
              {cart.map((l, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: "#F8F9FB", border: "1px solid #ECEEF3" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: "#1F2C7C" }}>{l.name}</p>
                    {l.modifiers.length > 0 && (
                      <p className="text-[11px] truncate" style={{ color: "#7C8499" }}>{l.modifiers.map(m => m.name).join(" • ")}</p>
                    )}
                    {l.note && <p className="text-[11px]" style={{ color: "#9AA1B4" }}>📝 {l.note}</p>}
                    <p className="text-xs mt-1 font-bold" style={{ color: "#E63027" }}>₪{l.unit_price.toFixed(2)} × {l.qty}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeQty(i, -1)}
                      className="h-8 w-8 rounded-full grid place-items-center"
                      style={{ background: "#F1F2F8", color: "#1F2C7C" }}>
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center font-bold">{l.qty}</span>
                    <button onClick={() => changeQty(i, 1)}
                      className="h-8 w-8 rounded-full grid place-items-center text-white"
                      style={{ background: "#E63027" }}>
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-2">
              <Input placeholder="اسمك (اختياري)" value={name} onChange={e => setName(e.target.value)}
                style={{ background: "#F8F9FB", color: "#1F2C7C", border: "1px solid #ECEEF3" }} />
              <Input placeholder={ctx.require_phone ? "رقم جوالك *" : "رقم جوالك (اختياري)"} value={phone}
                onChange={e => setPhone(e.target.value)} inputMode="tel"
                style={{ background: "#F8F9FB", color: "#1F2C7C", border: "1px solid #ECEEF3" }} />
              <Textarea placeholder="ملاحظات للمطبخ (اختياري)" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                style={{ background: "#F8F9FB", color: "#1F2C7C", border: "1px solid #ECEEF3" }} />
            </div>
            <div className="flex items-center justify-between mt-5 pt-4" style={{ borderTop: "1px dashed #E5E7EE" }}>
              <span className="text-sm" style={{ color: "#7C8499" }}>الإجمالي</span>
              <span className="text-2xl font-black" style={{ color: "#E63027" }}>₪{total.toFixed(2)}</span>
            </div>
            <button onClick={submit} disabled={submitting}
              className="w-full mt-4 py-4 rounded-2xl font-black text-base text-white disabled:opacity-50"
              style={{ background: "#E63027", boxShadow: "0 12px 30px -10px rgba(230,48,39,0.5)" }}>
              {submitting ? "جارٍ الإرسال…" : "تأكيد الطلب"}
            </button>
          </div>
        </div>
      )}

      {/* Product detail sheet with modifiers */}
      {detail && (
        <ProductDetailSheet
          product={detail}
          onClose={() => setDetail(null)}
          onAdd={addLineFromDetail}
        />
      )}
    </div>
  );
}

function ProductDetailSheet({
  product, onClose, onAdd,
}: { product: Product; onClose: () => void; onAdd: (line: CartLine) => void }) {
  // selections: groupId -> Set of optionId
  const [selections, setSelections] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const g of product.modifier_groups) {
      const defaults = g.options.filter(o => o.is_default).map(o => o.id);
      // For single-select, take first default; else all defaults
      const isSingle = g.selection_type === "single" || (g.max_select ?? 0) === 1;
      init[g.id] = new Set(isSingle ? defaults.slice(0, 1) : defaults);
    }
    return init;
  });
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");

  const toggle = (g: ModifierGroup, optId: string) => {
    setSelections(prev => {
      const cur = new Set(prev[g.id] || []);
      const isSingle = g.selection_type === "single" || (g.max_select ?? 0) === 1;
      if (isSingle) {
        cur.clear(); cur.add(optId);
      } else {
        if (cur.has(optId)) cur.delete(optId);
        else {
          if (g.max_select && cur.size >= g.max_select) {
            toast.error(`أقصى ${g.max_select} اختيارات لـ ${g.name}`);
            return prev;
          }
          cur.add(optId);
        }
      }
      return { ...prev, [g.id]: cur };
    });
  };

  const selectedFlat = product.modifier_groups.flatMap(g =>
    Array.from(selections[g.id] || []).map(optId => {
      const opt = g.options.find(o => o.id === optId)!;
      return { group_id: g.id, group_name: g.name, option_id: optId, name: opt.name, extra_price: Number(opt.extra_price) || 0 };
    })
  );
  const addonsTotal = selectedFlat.reduce((s, m) => s + m.extra_price, 0);
  const unitPrice = (Number(product.price) || 0) + addonsTotal;

  const validate = (): string | null => {
    for (const g of product.modifier_groups) {
      const n = (selections[g.id] || new Set()).size;
      if (g.is_required && n === 0) return `يرجى اختيار: ${g.name}`;
      if (g.min_select && n < g.min_select) return `${g.name}: اختر ${g.min_select} على الأقل`;
    }
    return null;
  };

  const handleAdd = () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    onAdd({
      product_id: product.id,
      name: product.name,
      base_price: Number(product.price) || 0,
      unit_price: unitPrice,
      qty,
      note,
      modifiers: selectedFlat,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end" dir="rtl"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={onClose}>
      <div className="w-full rounded-t-3xl max-h-[92vh] overflow-y-auto"
        style={{ background: "#150906", color: "#f8e9c8", borderTop: "1px solid rgba(212,170,86,0.25)" }}
        onClick={e => e.stopPropagation()}>
        <div className="relative">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-56 object-cover" />
          ) : (
            <div className="w-full h-40 grid place-items-center"
              style={{ background: "linear-gradient(135deg,#3a1a14,#1a0c08)" }}>
              <ChefHat className="h-14 w-14 opacity-40" style={{ color: "#d4aa56" }} />
            </div>
          )}
          <button onClick={onClose}
            className="absolute top-3 left-3 h-9 w-9 rounded-full grid place-items-center"
            style={{ background: "rgba(0,0,0,0.6)", color: "#f8e9c8", backdropFilter: "blur(8px)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <h2 className="text-2xl font-black">{product.name}</h2>
            {product.description && <p className="text-sm opacity-70 mt-1 leading-relaxed">{product.description}</p>}
            <p className="text-lg font-black mt-2" style={{ color: "#d4aa56" }}>₪{Number(product.price).toFixed(2)}</p>
          </div>

          {product.modifier_groups.map(g => {
            const isSingle = g.selection_type === "single" || (g.max_select ?? 0) === 1;
            return (
              <div key={g.id} className="rounded-2xl p-4"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(212,170,86,0.15)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-bold text-sm">
                    {g.name}
                    {g.is_required && <span className="mr-1" style={{ color: "#ff6b6b" }}>*</span>}
                  </p>
                  <span className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(212,170,86,0.15)", color: "#d4aa56" }}>
                    {isSingle ? "اختر واحد" : g.max_select ? `حتى ${g.max_select}` : "اختياري"}
                  </span>
                </div>
                <div className="space-y-2">
                  {g.options.map(o => {
                    const checked = (selections[g.id] || new Set()).has(o.id);
                    return (
                      <button type="button" key={o.id} onClick={() => toggle(g, o.id)}
                        className="w-full flex items-center justify-between px-3 py-3 rounded-xl text-sm transition-all"
                        style={checked
                          ? { background: "rgba(212,170,86,0.15)", border: "1.5px solid #d4aa56", color: "#f8e9c8" }
                          : { background: "rgba(255,255,255,0.03)", border: "1.5px solid rgba(255,255,255,0.08)", color: "#f8e9c8" }}>
                        <span className="flex items-center gap-3">
                          <span className="h-5 w-5 rounded-full grid place-items-center"
                            style={{ border: `2px solid ${checked ? "#d4aa56" : "rgba(255,255,255,0.25)"}` }}>
                            {checked && <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#d4aa56" }} />}
                          </span>
                          <span className="font-medium">{o.name}</span>
                        </span>
                        {Number(o.extra_price) > 0 && (
                          <span className="text-xs font-bold" style={{ color: "#d4aa56" }}>+₪{Number(o.extra_price).toFixed(2)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div>
            <p className="text-sm font-bold mb-2">ملاحظات (اختياري)</p>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="بدون بصل، حار، الخ"
              className="border-0" style={{ background: "rgba(255,255,255,0.05)", color: "#f8e9c8" }} />
          </div>

          <div className="flex items-center gap-3 pt-3" style={{ borderTop: "1px dashed rgba(212,170,86,0.2)" }}>
            <div className="flex items-center gap-1 p-1 rounded-full"
              style={{ background: "rgba(255,255,255,0.05)" }}>
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="h-9 w-9 rounded-full grid place-items-center"
                style={{ background: "rgba(212,170,86,0.15)", color: "#d4aa56" }}>
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-black text-lg">{qty}</span>
              <button onClick={() => setQty(q => q + 1)}
                className="h-9 w-9 rounded-full grid place-items-center"
                style={{ background: "linear-gradient(135deg,#d4aa56,#a37b29)", color: "#1a0c08" }}>
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <button onClick={handleAdd}
              className="flex-1 py-3.5 rounded-2xl font-black"
              style={{ background: "linear-gradient(135deg,#d4aa56,#a37b29)", color: "#1a0c08",
                       boxShadow: "0 15px 40px -10px rgba(212,170,86,0.5)" }}>
              إضافة — ₪{(unitPrice * qty).toFixed(2)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}