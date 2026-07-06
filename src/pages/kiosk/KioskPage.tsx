import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, ArrowLeft, Plus, Minus, ShoppingCart, X, Check, CreditCard, RefreshCw, User as UserIcon, LogOut } from "lucide-react";
import { toast } from "sonner";
import { KioskLang, t, pickName } from "./kiosk-i18n";
import { useKioskMenu, KioskProduct, KioskModifierGroup, KioskModifierOption } from "./useKioskMenu";
import { cn } from "@/lib/utils";

type Step = "welcome" | "menu" | "cart" | "customer" | "payment" | "success";

interface CartItem {
  key: string;
  product: KioskProduct;
  qty: number;
  modifiers: { group_id: string; group_name: string; option_id: string; option_name: string; extra: number }[];
  unitPrice: number; // includes modifier extras
}

interface KioskSettings {
  id: string;
  user_id: string;
  branch_id: string;
  is_active: boolean;
  exit_pin: string;
  default_language: string;
  welcome_image_url: string | null;
  logo_url: string | null;
  primary_color: string | null;
  idle_timeout_seconds: number;
  require_phone: boolean;
  require_name: boolean;
}

export default function KioskPage() {
  const { branchId } = useParams<{ branchId: string }>();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<KioskSettings | null>(null);
  const [settingsErr, setSettingsErr] = useState<string | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [lang, setLang] = useState<KioskLang>("ar");
  const [step, setStep] = useState<Step>("welcome");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [pickerProduct, setPickerProduct] = useState<KioskProduct | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [payStatus, setPayStatus] = useState<"idle" | "processing" | "success" | "failed">("idle");
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null);
  const [showExit, setShowExit] = useState(false);

  // Load settings (public read via RLS anon policy)
  useEffect(() => {
    if (!branchId) return;
    supabase.from("kiosk_settings" as any).select("*").eq("branch_id", branchId).eq("is_active", true).maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setSettingsErr(error?.message || "not_found"); return; }
        setSettings(data as any);
        setLang((data as any).default_language === "en" ? "en" : "ar");
        // Load company logo as fallback for kiosk logo
        supabase.from("company_settings").select("logo_url").eq("user_id", (data as any).user_id).maybeSingle()
          .then(({ data: cs }) => setCompanyLogo((cs as any)?.logo_url || null));
      });
  }, [branchId]);

  const { categories, products, productGroups, groups, loading } = useKioskMenu(settings?.user_id ?? null);

  useEffect(() => {
    if (!activeCat && categories.length) setActiveCat(categories[0].id);
  }, [categories, activeCat]);

  // Idle reset to welcome
  useEffect(() => {
    if (!settings) return;
    if (step === "welcome" || step === "success") return;
    let timer: any;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setStep("welcome");
        setCart([]);
        setCustName(""); setCustPhone("");
      }, (settings.idle_timeout_seconds || 60) * 1000);
    };
    reset();
    const events = ["mousedown", "touchstart", "keydown"];
    events.forEach(e => window.addEventListener(e, reset));
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)); };
  }, [step, settings]);

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.unitPrice * i.qty, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);

  const productsInCat = useMemo(() =>
    activeCat ? products.filter(p => p.category_id === activeCat) : products,
  [products, activeCat]);

  const productGroupList = (productId: string): KioskModifierGroup[] =>
    (productGroups[productId] || []).map(gid => groups[gid]).filter(Boolean);

  const openProduct = (p: KioskProduct) => {
    const gList = productGroupList(p.id);
    if (gList.length === 0) {
      addToCart(p, []);
    } else {
      setPickerProduct(p);
    }
  };

  const addToCart = (p: KioskProduct, mods: CartItem["modifiers"]) => {
    const unit = Number(p.price) + mods.reduce((s, m) => s + m.extra, 0);
    const key = `${p.id}::${mods.map(m => m.option_id).sort().join(",")}`;
    setCart(prev => {
      const existing = prev.find(i => i.key === key);
      if (existing) return prev.map(i => i.key === key ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { key, product: p, qty: 1, modifiers: mods, unitPrice: unit }];
    });
    setPickerProduct(null);
  };

  const changeQty = (key: string, delta: number) => {
    setCart(prev => prev.flatMap(i => {
      if (i.key !== key) return [i];
      const nq = i.qty + delta;
      return nq <= 0 ? [] : [{ ...i, qty: nq }];
    }));
  };

  const submitOrder = async (paymentMethod: "card" | "cashier"): Promise<{ ok: boolean; orderNumber?: string; error?: string }> => {
    if (!settings || !branchId) return { ok: false, error: "no_settings" };
    const items = cart.map((c) => ({
      name: c.product.name,
      qty: c.qty,
      unit_price: c.unitPrice,
      total: c.unitPrice * c.qty,
      product_id: c.product.id,
      note: "",
      modifiers: c.modifiers.map(m => ({ option_name: m.option_name, extra_price: m.extra })),
    }));

    const { data, error } = await supabase.rpc("create_kiosk_call_center_order" as any, {
      p_branch_id: branchId,
      p_customer_name: custName || null,
      p_customer_phone: custPhone || null,
      p_payment_method: paymentMethod === "card" ? "visa" : "cash",
      p_items: items as any,
      p_total: cartTotal,
      p_order_note: paymentMethod === "card" ? "مدفوعة بالبطاقة من الكيوسك" : "الدفع على الكاشير من الكيوسك",
    });

    if (error) return { ok: false, error: error.message };
    const res = (data as any) || {};
    if (!res.ok) return { ok: false, error: res.reason || "order_failed" };
    return { ok: true, orderNumber: res.order_number };
  };

  const attemptCardPayment = async () => {
    setPayStatus("processing");
    // TODO: real terminal integration
    await new Promise(r => setTimeout(r, 2500));
    // Stub: simulate random success (default success for demo)
    const success = true;
    if (!success) { setPayStatus("failed"); return; }
    const res = await submitOrder("card");
    if (!res.ok) { toast.error(res.error || "خطأ"); setPayStatus("failed"); return; }
    setLastOrderNumber(res.orderNumber || null);
    setPayStatus("success");
    setStep("success");
    setCart([]);
  };

  const sendToCashier = async () => {
    const res = await submitOrder("cashier");
    if (!res.ok) { toast.error(res.error || "خطأ"); return; }
    setLastOrderNumber(res.orderNumber || null);
    setPayStatus("idle");
    setStep("success");
    setCart([]);
  };

  const resetAll = () => {
    setCart([]); setCustName(""); setCustPhone(""); setPayStatus("idle"); setLastOrderNumber(null); setStep("welcome");
  };

  const primaryColor = settings?.primary_color || "#E53935";

  if (settingsErr || (!settings && !branchId)) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white text-2xl">{t(lang, "kiosk_disabled")}</div>;
  }
  if (!settings) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white text-2xl">{t(lang, "loading")}</div>;
  }

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className="fixed inset-0 bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col overflow-hidden select-none" style={{ ["--kiosk" as any]: primaryColor }}>
      {/* Exit button top corner */}
      <button onClick={() => setShowExit(true)} className="absolute top-3 end-3 z-50 p-3 rounded-full bg-white/70 hover:bg-white shadow text-slate-600" aria-label="exit">
        <LogOut className="h-5 w-5" />
      </button>

      {step === "welcome" && (
        <WelcomeScreen settings={settings} lang={lang} setLang={setLang} onStart={() => setStep("menu")} />
      )}

      {step === "menu" && (
        <MenuScreen
          lang={lang}
          categories={categories}
          activeCat={activeCat}
          setActiveCat={setActiveCat}
          products={productsInCat}
          loading={loading}
          onPick={openProduct}
          cartCount={cartCount}
          cartTotal={cartTotal}
          onOpenCart={() => setStep("cart")}
          primaryColor={primaryColor}
        />
      )}

      {step === "cart" && (
        <CartScreen
          lang={lang} cart={cart} total={cartTotal}
          onChangeQty={changeQty}
          onBack={() => setStep("menu")}
          onContinue={() => cart.length ? setStep("customer") : toast.error(t(lang, "empty_cart"))}
          primaryColor={primaryColor}
        />
      )}

      {step === "customer" && (
        <CustomerScreen
          lang={lang} settings={settings}
          name={custName} setName={setCustName}
          phone={custPhone} setPhone={setCustPhone}
          onBack={() => setStep("cart")}
          onNext={() => {
            if (settings.require_name && !custName.trim()) { toast.error(t(lang, "name")); return; }
            if (settings.require_phone && custPhone.replace(/\D/g, "").length < 7) { toast.error(t(lang, "phone")); return; }
            setStep("payment");
          }}
          primaryColor={primaryColor}
        />
      )}

      {step === "payment" && (
        <PaymentScreen
          lang={lang} total={cartTotal} status={payStatus}
          onPay={attemptCardPayment}
          onRetry={() => setPayStatus("idle")}
          onCashier={sendToCashier}
          onBack={() => { if (payStatus !== "processing") setStep("customer"); }}
          primaryColor={primaryColor}
        />
      )}

      {step === "success" && (
        <SuccessScreen
          lang={lang} orderNumber={lastOrderNumber || ""}
          paidAtCashier={payStatus === "idle"}
          onNew={resetAll}
          primaryColor={primaryColor}
        />
      )}

      {/* Modifier picker */}
      {pickerProduct && (
        <ModifierPicker
          lang={lang}
          product={pickerProduct}
          groups={productGroupList(pickerProduct.id)}
          onCancel={() => setPickerProduct(null)}
          onConfirm={(mods) => addToCart(pickerProduct, mods)}
          primaryColor={primaryColor}
        />
      )}

      {/* Exit PIN */}
      <ExitPinDialog open={showExit} onClose={() => setShowExit(false)} pin={settings.exit_pin} onSuccess={() => { setShowExit(false); navigate("/apps"); }} lang={lang} />
    </div>
  );
}

/* ---------- Screens ---------- */

function WelcomeScreen({ settings, lang, setLang, onStart }: any) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-10 relative">
      {settings.welcome_image_url && (
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url(${settings.welcome_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      )}
      <div className="relative z-10 flex flex-col items-center gap-8">
        {settings.logo_url ? (
          <img src={settings.logo_url} alt="logo" className="h-36 w-36 rounded-3xl object-contain bg-white p-4 shadow-2xl" />
        ) : (
          <div className="h-36 w-36 rounded-3xl flex items-center justify-center text-white text-6xl font-bold shadow-2xl" style={{ background: settings.primary_color || "#E53935" }}>M</div>
        )}
        <div>
          <h1 className="text-6xl md:text-7xl font-black text-slate-900">{t(lang, "welcome_title")}</h1>
          <p className="text-2xl mt-4 text-slate-600">{t(lang, "welcome_sub")}</p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setLang("ar")} className={cn("px-8 py-3 rounded-2xl text-xl font-bold border-2", lang === "ar" ? "text-white border-transparent" : "border-slate-300 text-slate-700 bg-white")} style={lang === "ar" ? { background: settings.primary_color || "#E53935" } : {}}>العربية</button>
          <button onClick={() => setLang("en")} className={cn("px-8 py-3 rounded-2xl text-xl font-bold border-2", lang === "en" ? "text-white border-transparent" : "border-slate-300 text-slate-700 bg-white")} style={lang === "en" ? { background: settings.primary_color || "#E53935" } : {}}>English</button>
        </div>
        <button onClick={onStart} className="mt-8 px-16 py-8 rounded-3xl text-3xl font-black text-white shadow-2xl hover:scale-105 active:scale-95 transition-transform" style={{ background: settings.primary_color || "#E53935" }}>
          {t(lang, "start_order")}
        </button>
      </div>
    </div>
  );
}

function MenuScreen({ lang, categories, activeCat, setActiveCat, products, loading, onPick, cartCount, cartTotal, onOpenCart, primaryColor }: any) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-8 pt-6 pb-4 bg-white shadow-sm">
        <h2 className="text-3xl font-black text-slate-900">{t(lang, "categories")}</h2>
      </div>
      <div className="flex-1 flex overflow-hidden">
        {/* Categories column */}
        <div className="w-56 shrink-0 overflow-y-auto bg-white border-e border-slate-200 py-4">
          {categories.map((c: any) => (
            <button key={c.id} onClick={() => setActiveCat(c.id)} className={cn("w-full text-start px-6 py-5 text-lg font-bold border-s-4 transition", activeCat === c.id ? "text-white" : "border-transparent text-slate-700 hover:bg-slate-50")} style={activeCat === c.id ? { background: primaryColor, borderColor: primaryColor } : {}}>{c.name}</button>
          ))}
          {!loading && !categories.length && <div className="p-6 text-slate-400">—</div>}
        </div>
        {/* Products grid */}
        <div className="flex-1 overflow-y-auto p-6 pb-40">
          {loading ? <div className="text-center p-10 text-slate-500 text-xl">{t(lang, "loading")}</div> : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
              {products.map((p: any) => (
                <button key={p.id} onClick={() => onPick(p)} className="bg-white rounded-3xl shadow hover:shadow-xl active:scale-95 transition text-start overflow-hidden">
                  <div className="aspect-square bg-slate-100 relative">
                    {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-6xl">🍽️</div>}
                  </div>
                  <div className="p-4">
                    <div className="font-bold text-lg text-slate-900 line-clamp-2">{pickName(lang, p.name, p.name_en)}</div>
                    <div className="mt-2 text-2xl font-black" style={{ color: primaryColor }}>{Number(p.price).toFixed(2)} ₪</div>
                  </div>
                </button>
              ))}
              {!products.length && <div className="col-span-full text-center p-10 text-slate-400">—</div>}
            </div>
          )}
        </div>
      </div>
      {/* Sticky cart bar */}
      <button onClick={onOpenCart} disabled={!cartCount} className="fixed bottom-6 start-1/2 -translate-x-1/2 md:translate-x-0 md:end-8 md:start-auto bottom-8 flex items-center gap-4 px-8 py-5 rounded-full shadow-2xl text-white text-xl font-bold disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: primaryColor }}>
        <ShoppingCart className="h-6 w-6" />
        <span>{t(lang, "cart")} ({cartCount})</span>
        <span className="opacity-90">{cartTotal.toFixed(2)} ₪</span>
      </button>
    </div>
  );
}

function CartScreen({ lang, cart, total, onChangeQty, onBack, onContinue, primaryColor }: any) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-8 pt-6 pb-4 bg-white shadow-sm flex items-center justify-between">
        <h2 className="text-3xl font-black text-slate-900">{t(lang, "cart")}</h2>
        <button onClick={onBack} className="text-lg text-slate-500 font-bold px-4 py-2">← {t(lang, "back")}</button>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {cart.length === 0 && <div className="text-center p-10 text-slate-400 text-xl">{t(lang, "empty_cart")}</div>}
        {cart.map((i: CartItem) => (
          <div key={i.key} className="bg-white rounded-2xl p-5 flex items-center gap-4 shadow">
            {i.product.image_url && <img src={i.product.image_url} alt="" className="h-20 w-20 rounded-xl object-cover" />}
            <div className="flex-1">
              <div className="font-bold text-xl text-slate-900">{pickName(lang, i.product.name, i.product.name_en)}</div>
              {i.modifiers.length > 0 && <div className="text-sm text-slate-500 mt-1">{i.modifiers.map(m => m.option_name).join(" • ")}</div>}
              <div className="mt-2 text-lg font-black" style={{ color: primaryColor }}>{(i.unitPrice * i.qty).toFixed(2)} ₪</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onChangeQty(i.key, -1)} className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-2xl"><Minus className="h-5 w-5" /></button>
              <span className="w-10 text-center text-2xl font-bold">{i.qty}</span>
              <button onClick={() => onChangeQty(i.key, +1)} className="h-12 w-12 rounded-full text-white flex items-center justify-center" style={{ background: primaryColor }}><Plus className="h-5 w-5" /></button>
            </div>
          </div>
        ))}
      </div>
      <div className="p-6 bg-white border-t shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-2xl font-bold text-slate-600">{t(lang, "total")}</span>
          <span className="text-4xl font-black" style={{ color: primaryColor }}>{total.toFixed(2)} ₪</span>
        </div>
        <button onClick={onContinue} disabled={!cart.length} className="w-full py-6 rounded-2xl text-white text-2xl font-black shadow-lg disabled:opacity-40" style={{ background: primaryColor }}>{t(lang, "continue")}</button>
      </div>
    </div>
  );
}

function CustomerScreen({ lang, settings, name, setName, phone, setPhone, onBack, onNext, primaryColor }: any) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-8 pt-6 pb-4 bg-white shadow-sm flex items-center justify-between">
        <h2 className="text-3xl font-black text-slate-900">{t(lang, "customer_info")}</h2>
        <button onClick={onBack} className="text-lg text-slate-500 font-bold px-4 py-2">← {t(lang, "back")}</button>
      </div>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-xl mx-auto space-y-6 mt-6">
          <div className="flex items-center justify-center mb-6">
            <div className="h-24 w-24 rounded-full flex items-center justify-center text-white" style={{ background: primaryColor }}>
              <UserIcon className="h-12 w-12" />
            </div>
          </div>
          {settings.require_name && (
            <div>
              <Label className="text-lg font-bold">{t(lang, "name")}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="h-16 text-2xl mt-2 rounded-2xl" autoFocus />
            </div>
          )}
          {settings.require_phone && (
            <div>
              <Label className="text-lg font-bold">{t(lang, "phone")}</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" className="h-16 text-2xl mt-2 rounded-2xl" placeholder="05XXXXXXXX" />
            </div>
          )}
        </div>
      </div>
      <div className="p-6 bg-white border-t shadow-2xl">
        <button onClick={onNext} className="w-full py-6 rounded-2xl text-white text-2xl font-black shadow-lg" style={{ background: primaryColor }}>{t(lang, "proceed_payment")}</button>
      </div>
    </div>
  );
}

function PaymentScreen({ lang, total, status, onPay, onRetry, onCashier, onBack, primaryColor }: any) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8">
      <button onClick={onBack} className="absolute top-6 start-6 text-lg text-slate-500 font-bold px-4 py-2">← {t(lang, "back")}</button>
      <div className="text-2xl text-slate-500 font-bold">{t(lang, "total")}</div>
      <div className="text-7xl font-black" style={{ color: primaryColor }}>{total.toFixed(2)} ₪</div>

      {status === "idle" && (
        <button onClick={onPay} className="flex items-center gap-4 px-16 py-8 rounded-3xl text-white text-3xl font-black shadow-2xl" style={{ background: primaryColor }}>
          <CreditCard className="h-8 w-8" /> {t(lang, "pay_with_card")}
        </button>
      )}
      {status === "processing" && (
        <div className="flex flex-col items-center gap-4 text-2xl text-slate-700">
          <RefreshCw className="h-16 w-16 animate-spin" style={{ color: primaryColor }} />
          {t(lang, "processing_payment")}
        </div>
      )}
      {status === "failed" && (
        <div className="flex flex-col items-center gap-6">
          <div className="text-3xl font-black text-red-600">{t(lang, "payment_failed")}</div>
          <div className="flex gap-4">
            <button onClick={onRetry} className="px-10 py-6 rounded-2xl text-white text-xl font-black shadow-xl" style={{ background: primaryColor }}>{t(lang, "try_again")}</button>
            <button onClick={onCashier} className="px-10 py-6 rounded-2xl text-xl font-black shadow-xl bg-slate-900 text-white">{t(lang, "pay_at_cashier")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SuccessScreen({ lang, orderNumber, paidAtCashier, onNew, primaryColor }: any) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-8">
      <div className="h-40 w-40 rounded-full bg-green-500 flex items-center justify-center shadow-2xl">
        <Check className="h-24 w-24 text-white" strokeWidth={4} />
      </div>
      <div>
        <div className="text-5xl font-black text-slate-900">{t(lang, "thank_you")}</div>
        {paidAtCashier && <div className="mt-3 text-2xl text-amber-700 font-bold">{t(lang, "pay_at_cashier")}</div>}
      </div>
      <div className="bg-white px-12 py-6 rounded-3xl shadow-2xl">
        <div className="text-lg text-slate-500 font-bold">{t(lang, "order_number")}</div>
        <div className="text-6xl font-black mt-2" style={{ color: primaryColor }}>{orderNumber}</div>
      </div>
      <button onClick={onNew} className="mt-6 px-14 py-6 rounded-2xl text-white text-2xl font-black shadow-xl" style={{ background: primaryColor }}>{t(lang, "new_order")}</button>
    </div>
  );
}

/* ---------- Modifier picker ---------- */

function ModifierPicker({ lang, product, groups, onCancel, onConfirm, primaryColor }: {
  lang: KioskLang; product: KioskProduct; groups: KioskModifierGroup[]; onCancel: () => void;
  onConfirm: (mods: CartItem["modifiers"]) => void; primaryColor: string;
}) {
  const [sel, setSel] = useState<Record<string, string[]>>({});

  const toggle = (g: KioskModifierGroup, o: KioskModifierOption) => {
    setSel(prev => {
      const cur = prev[g.id] || [];
      if (g.selection_type === "single") return { ...prev, [g.id]: [o.id] };
      const has = cur.includes(o.id);
      if (has) return { ...prev, [g.id]: cur.filter(x => x !== o.id) };
      if (cur.length >= (g.max_select || 99)) return prev;
      return { ...prev, [g.id]: [...cur, o.id] };
    });
  };

  const canConfirm = groups.every(g => !g.is_required || (sel[g.id] && sel[g.id].length >= (g.min_select || 1)));

  const confirm = () => {
    const mods: CartItem["modifiers"] = [];
    groups.forEach(g => (sel[g.id] || []).forEach(oid => {
      const opt = g.options.find(o => o.id === oid);
      if (opt) mods.push({ group_id: g.id, group_name: g.name, option_id: opt.id, option_name: pickName(lang, opt.name, opt.name_en), extra: Number(opt.extra_price || 0) });
    }));
    onConfirm(mods);
  };

  const extraSum = Object.values(sel).flat().reduce((s, oid) => {
    for (const g of groups) { const o = g.options.find(x => x.id === oid); if (o) return s + Number(o.extra_price || 0); }
    return s;
  }, 0);

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0" dir={lang === "ar" ? "rtl" : "ltr"}>
        <DialogHeader className="p-6 border-b">
          <DialogTitle className="text-3xl font-black">{pickName(lang, product.name, product.name_en)}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {product.image_url && <img src={product.image_url} alt="" className="w-full h-64 object-cover rounded-2xl" />}
          {groups.map(g => (
            <div key={g.id}>
              <div className="flex items-center gap-3 mb-3">
                <div className="text-2xl font-black">{pickName(lang, g.name, g.name_en)}</div>
                <span className={cn("px-3 py-1 rounded-full text-xs font-bold", g.is_required ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500")}>
                  {t(lang, g.is_required ? "required" : "optional")}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {g.options.map(o => {
                  const on = (sel[g.id] || []).includes(o.id);
                  return (
                    <button key={o.id} onClick={() => toggle(g, o)} className={cn("p-4 rounded-2xl border-2 text-start transition", on ? "text-white shadow-lg" : "border-slate-200 bg-white text-slate-800")} style={on ? { background: primaryColor, borderColor: primaryColor } : {}}>
                      <div className="font-bold text-lg">{pickName(lang, o.name, o.name_en)}</div>
                      {Number(o.extra_price) > 0 && <div className="text-sm mt-1 opacity-90">+ {Number(o.extra_price).toFixed(2)} ₪</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="p-6 border-t bg-white gap-3 sm:justify-between flex-row">
          <Button variant="outline" size="lg" className="text-lg h-14 px-8 rounded-2xl" onClick={onCancel}><X className="h-5 w-5 me-2" />{t(lang, "back")}</Button>
          <Button size="lg" className="text-lg h-14 px-8 rounded-2xl text-white flex-1" style={{ background: primaryColor }} disabled={!canConfirm} onClick={confirm}>
            {t(lang, "add")} {extraSum > 0 && <span className="ms-2 opacity-90">(+{extraSum.toFixed(2)} ₪)</span>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Exit PIN ---------- */

function ExitPinDialog({ open, onClose, pin, onSuccess, lang }: { open: boolean; onClose: () => void; pin: string; onSuccess: () => void; lang: KioskLang }) {
  const [entered, setEntered] = useState("");
  useEffect(() => { if (!open) setEntered(""); }, [open]);
  const press = (d: string) => {
    const n = (entered + d).slice(0, 6);
    setEntered(n);
    if (n.length >= pin.length) {
      if (n === pin) onSuccess();
      else { toast.error(t(lang, "wrong_pin")); setTimeout(() => setEntered(""), 300); }
    }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir={lang === "ar" ? "rtl" : "ltr"}>
        <DialogHeader><DialogTitle className="text-2xl text-center">{t(lang, "exit_pin")}</DialogTitle></DialogHeader>
        <div className="flex justify-center gap-2 my-4">
          {Array.from({ length: pin.length }).map((_, i) => (
            <div key={i} className={cn("h-4 w-4 rounded-full", i < entered.length ? "bg-slate-900" : "bg-slate-200")} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
            <button key={i} disabled={!d} onClick={() => d === "⌫" ? setEntered(e => e.slice(0, -1)) : press(d)} className={cn("h-16 rounded-xl text-2xl font-bold", d ? "bg-slate-100 hover:bg-slate-200 active:scale-95" : "invisible")}>{d}</button>
          ))}
        </div>
        <Button variant="ghost" onClick={onClose} className="mt-2">{t(lang, "back")}</Button>
      </DialogContent>
    </Dialog>
  );
}