import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Minus, ShoppingBag, Check } from "lucide-react";
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
  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);

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
    return <div className="min-h-screen grid place-items-center bg-background p-6 text-center" dir="rtl">
      <div><h1 className="text-xl font-bold mb-2">{error}</h1>
        <p className="text-sm text-muted-foreground">يرجى التواصل مع الكاشير</p></div>
    </div>;
  }
  if (!ctx) return <div className="min-h-screen grid place-items-center">جارٍ التحميل…</div>;

  if (submittedId) {
    const labels: Record<string, string> = {
      pending: "قيد المراجعة من الكاشير…", accepted: "✅ تم قبول طلبك — يجهّز الآن",
      rejected: "❌ اعتذر الكاشير عن الطلب", converted: "✅ طلبك في الإعداد", cancelled: "تم الإلغاء",
    };
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6 text-center" dir="rtl">
        <Card className="p-6 max-w-sm space-y-3">
          <Check className="h-12 w-12 mx-auto text-green-600" />
          <h1 className="text-xl font-bold">{labels[submittedStatus] || submittedStatus}</h1>
          <p className="text-sm text-muted-foreground">{ctx.branch_name}</p>
          {submittedStatus === "rejected" && (
            <Button onClick={() => { setSubmittedId(null); setCart([]); }}>إعادة الطلب</Button>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24" dir="rtl">
      <div className="bg-gradient-to-b from-primary/10 to-transparent p-4 text-center">
        <h1 className="text-xl font-bold">{ctx.account_name}</h1>
        <p className="text-sm text-muted-foreground">{ctx.branch_name}{tableCode ? ` · طاولة` : ""}</p>
        {ctx.welcome_message && <p className="text-xs mt-2">{ctx.welcome_message}</p>}
      </div>

      {/* Categories tabs */}
      <div className="sticky top-0 bg-background z-10 border-b overflow-x-auto">
        <div className="flex gap-2 px-3 py-2 min-w-max">
          {categories.map(c => (
            <button key={c.id} onClick={() => setActiveCat(c.id)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${activeCat === c.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Products */}
      <div className="p-3 grid grid-cols-2 gap-3">
        {filtered.map(p => (
          <Card key={p.id} className="overflow-hidden cursor-pointer" onClick={() => openProduct(p)}>
            {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-28 object-cover" />}
            <div className="p-2">
              <p className="text-sm font-bold leading-tight">{p.name}</p>
              {p.description && <p className="text-[10px] text-muted-foreground line-clamp-2">{p.description}</p>}
              <div className="flex items-center justify-between mt-2">
                <span className="font-bold text-primary">₪{Number(p.price).toFixed(2)}</span>
                <Button size="sm" className="h-7" onClick={(e) => { e.stopPropagation(); openProduct(p); }}><Plus className="h-3 w-3" /></Button>
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <p className="col-span-2 text-center text-sm text-muted-foreground py-6">لا أصناف</p>}
      </div>

      {/* Floating cart */}
      {cart.length > 0 && !showCart && (
        <button onClick={() => setShowCart(true)}
          className="fixed bottom-4 inset-x-4 bg-primary text-primary-foreground rounded-xl py-3 px-4 shadow-lg flex items-center justify-between font-bold">
          <span className="flex items-center gap-2"><ShoppingBag className="h-4 w-4" />{cart.reduce((s, l) => s + l.qty, 0)} صنف</span>
          <span>₪{total.toFixed(2)} — متابعة</span>
        </button>
      )}

      {/* Cart sheet */}
      {showCart && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setShowCart(false)}>
          <div className="bg-background w-full rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-3">طلبك</h2>
            <div className="space-y-2">
              {cart.map((l, i) => (
                <div key={i} className="flex items-center gap-2 border-b pb-2">
                  <div className="flex-1">
                    <p className="text-sm font-bold">{l.name}</p>
                    {l.modifiers.length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {l.modifiers.map(m => m.name).join(" • ")}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">₪{l.unit_price.toFixed(2)} × {l.qty}</p>
                  </div>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(i, -1)}><Minus className="h-3 w-3" /></Button>
                  <span className="w-6 text-center text-sm">{l.qty}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(i, 1)}><Plus className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <Input placeholder="اسمك (اختياري)" value={name} onChange={e => setName(e.target.value)} />
              <Input placeholder={ctx.require_phone ? "رقم جوالك *" : "رقم جوالك (اختياري)"} value={phone} onChange={e => setPhone(e.target.value)} />
              <Textarea placeholder="ملاحظات للمطبخ (اختياري)" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex items-center justify-between font-bold mt-3 text-lg">
              <span>الإجمالي</span><span>₪{total.toFixed(2)}</span>
            </div>
            <Button className="w-full mt-3" disabled={submitting} onClick={submit}>
              {submitting ? "جارٍ الإرسال…" : "إرسال الطلب"}
            </Button>
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
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end" onClick={onClose} dir="rtl">
      <div className="bg-background w-full rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {product.image_url && (
          <img src={product.image_url} alt={product.name} className="w-full h-44 object-cover" />
        )}
        <div className="p-4 space-y-4">
          <div>
            <h2 className="text-xl font-bold">{product.name}</h2>
            {product.description && <p className="text-sm text-muted-foreground mt-1">{product.description}</p>}
            <p className="text-primary font-bold mt-1">₪{Number(product.price).toFixed(2)}</p>
          </div>

          {product.modifier_groups.map(g => {
            const isSingle = g.selection_type === "single" || (g.max_select ?? 0) === 1;
            return (
              <div key={g.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-sm">
                    {g.name}
                    {g.is_required && <span className="text-red-600 mr-1">*</span>}
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    {isSingle ? "اختر واحد" : g.max_select ? `حتى ${g.max_select}` : "اختياري"}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {g.options.map(o => {
                    const checked = (selections[g.id] || new Set()).has(o.id);
                    return (
                      <button
                        type="button"
                        key={o.id}
                        onClick={() => toggle(g, o.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm transition-colors ${
                          checked ? "border-primary bg-primary/10" : "border-border bg-background"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`h-4 w-4 rounded-full border-2 grid place-items-center ${checked ? "border-primary" : "border-muted-foreground"}`}>
                            {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
                          </span>
                          {o.name}
                        </span>
                        {Number(o.extra_price) > 0 && (
                          <span className="text-xs text-muted-foreground">+₪{Number(o.extra_price).toFixed(2)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div>
            <p className="text-sm font-bold mb-1">ملاحظات (اختياري)</p>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="بدون بصل، حار، الخ" />
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(q => Math.max(1, q - 1))}>
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-8 text-center font-bold">{qty}</span>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(q => q + 1)}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <Button className="flex-1 mr-3" onClick={handleAdd}>
              إضافة — ₪{(unitPrice * qty).toFixed(2)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}