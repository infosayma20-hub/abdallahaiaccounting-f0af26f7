import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, ArrowLeft, Plus, Minus, ShoppingCart, X, Check, CreditCard, RefreshCw, User as UserIcon, LogOut, Trash2, Globe, Store, ShoppingBag, Flame, Drumstick, Utensils, Banknote } from "lucide-react";
import { toast } from "sonner";
import { KioskLang, t, pickName } from "./kiosk-i18n";
import { useKioskMenu, KioskProduct, KioskModifierGroup, KioskModifierOption } from "./useKioskMenu";
import { cn } from "@/lib/utils";
import malakyLogo from "@/assets/malaky-logo.png.asset.json";
import { kioskImageFor } from "./kiosk-images";

// Malaky brand tokens (used for typography accents only; primary CTA color still
// comes from kiosk_settings.primary_color so admins can override per branch).
const MALAKY_BLUE = "#243B8F";

type OrderType = "dine_in" | "takeaway";

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
  const [orderType, setOrderType] = useState<OrderType>("takeaway");
  const [justAdded, setJustAdded] = useState<KioskProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  // Load settings from PUBLIC-SAFE view (no exit_pin / visa ids exposed to anon)
  useEffect(() => {
    if (!branchId) return;
    supabase.from("kiosk_settings_public" as any).select("*").eq("branch_id", branchId).maybeSingle()
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
    setJustAdded(p);
    setTimeout(() => setJustAdded(null), 1400);
  };

  const changeQty = (key: string, delta: number) => {
    setCart(prev => prev.flatMap(i => {
      if (i.key !== key) return [i];
      const nq = i.qty + delta;
      return nq <= 0 ? [] : [{ ...i, qty: nq }];
    }));
  };

  const cartQtyForProduct = (productId: string) =>
    cart.filter(i => i.product.id === productId).reduce((s, i) => s + i.qty, 0);
  const clearCart = () => setCart([]);
  const cancelOrder = () => { setCart([]); setStep("welcome"); };

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
      <button onClick={() => setShowExit(true)} className="absolute top-3 right-3 z-50 p-3 rounded-full bg-white/70 hover:bg-white shadow text-slate-600" aria-label="exit">
        <LogOut className="h-5 w-5" />
      </button>

      {step === "welcome" && (
        <WelcomeScreen settings={settings} companyLogo={companyLogo} lang={lang} setLang={setLang} onStart={() => setStep("menu")} />
      )}

      {step === "menu" && (
        <MenuScreen
          lang={lang}
          setLang={setLang}
          categories={categories}
          activeCat={activeCat}
          setActiveCat={setActiveCat}
          products={productsInCat}
          loading={loading}
          onPick={openProduct}
          onQuickAdd={(p: KioskProduct) => {
            // If product has modifier groups, open picker; else add directly
            openProduct(p);
          }}
          onChangeQty={changeQty}
          cart={cart}
          cartCount={cartCount}
          cartTotal={cartTotal}
          cartQtyForProduct={cartQtyForProduct}
          onClearCart={clearCart}
          onCancelOrder={cancelOrder}
          orderType={orderType}
          setOrderType={setOrderType}
          settings={settings}
          companyLogo={companyLogo}
          onOpenCart={() => setStep("cart")}
          cartOpen={cartOpen}
          setCartOpen={setCartOpen}
          justAdded={justAdded}
          onContinue={() => cart.length ? setStep("customer") : toast.error(t(lang, "empty_cart"))}
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
      <ExitPinDialog open={showExit} onClose={() => setShowExit(false)} branchId={branchId!} onSuccess={() => { setShowExit(false); navigate("/apps"); }} lang={lang} />
    </div>
  );
}

/* ---------- Screens ---------- */

function WelcomeScreen({ settings, companyLogo, lang, setLang, onStart }: any) {
  const effectiveLogo = settings.logo_url || companyLogo || malakyLogo.url;
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-10 relative">
      {settings.welcome_image_url && (
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url(${settings.welcome_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      )}
      <div className="relative z-10 flex flex-col items-center gap-8">
        <img src={effectiveLogo} alt="logo" className="h-36 w-36 rounded-3xl object-contain bg-white p-4 shadow-2xl" />
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

function MenuScreen({
  lang, setLang, categories, activeCat, setActiveCat, products, loading, onPick,
  cart, cartCount, cartTotal, cartQtyForProduct,
  onChangeQty, onClearCart, onCancelOrder,
  orderType, setOrderType, settings, companyLogo,
  cartOpen, setCartOpen, justAdded,
  onContinue, primaryColor,
}: any) {
  const effectiveLogo = settings?.logo_url || companyLogo || malakyLogo.url;
  const popularIds = new Set((products as KioskProduct[]).slice(0, 3).map(p => p.id));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F8FAFC] relative">
      {/* Subtle brand-shape background — decorative only */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -end-40 h-[26rem] w-[26rem] rounded-full opacity-[0.05]" style={{ background: primaryColor }} />
        <div className="absolute -bottom-56 -start-40 h-[32rem] w-[32rem] rounded-full opacity-[0.05]" style={{ background: MALAKY_BLUE }} />
      </div>

      <div className="relative flex-1 flex flex-col overflow-hidden">
        {/* ==== Header ==== */}
        <div className="shrink-0 bg-white border-b border-slate-200 px-4 pt-3 pb-3 flex flex-col gap-3">
          {/* Row 1: centered logo, with language + cancel on the sides */}
          <div className="relative flex items-center gap-3 min-h-[5.5rem]">
            <img
              src={effectiveLogo}
              alt="Malaky"
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-24 w-auto max-w-[220px] object-contain"
            />
            <div className="flex-1" />
            <button
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              className="relative z-10 flex items-center gap-1.5 px-3 h-11 rounded-xl border-2 border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 active:scale-95 transition"
            >
              <Globe className="h-4 w-4" />
              {lang === "ar" ? "EN" : "ع"}
            </button>
            <button
              onClick={onCancelOrder}
              className="relative z-10 flex items-center gap-1.5 px-3 h-11 rounded-xl border-2 font-bold text-sm active:scale-95 transition"
              style={{ borderColor: primaryColor, color: primaryColor }}
            >
              <X className="h-4 w-4" />
              {t(lang, "cancel_order")}
            </button>
          </div>

          {/* Row 2: Order type toggle */}
          <div className="flex items-center bg-slate-100 rounded-2xl p-1.5 gap-1 mx-auto">
            <button
              onClick={() => setOrderType("takeaway")}
              className={cn("flex items-center gap-2 px-6 py-3 rounded-xl text-base font-bold transition active:scale-95", orderType === "takeaway" ? "text-white shadow" : "text-slate-600")}
              style={orderType === "takeaway" ? { background: primaryColor } : {}}
            >
              <ShoppingBag className="h-5 w-5" />
              {t(lang, "takeaway")}
            </button>
            <button
              onClick={() => setOrderType("dine_in")}
              className={cn("flex items-center gap-2 px-6 py-3 rounded-xl text-base font-bold transition active:scale-95", orderType === "dine_in" ? "text-white shadow" : "text-slate-600")}
              style={orderType === "dine_in" ? { background: primaryColor } : {}}
            >
              <Store className="h-5 w-5" />
              {t(lang, "dine_in")}
            </button>
          </div>
        </div>

        {/* ==== Main 3-column layout ==== */}
        <div className="flex-1 flex flex-row overflow-hidden">
          {/* Categories sidebar — far right (first in RTL) */}
          <div className="w-56 lg:w-64 shrink-0 bg-white border-e border-slate-200 overflow-hidden flex flex-col">
            <div className="px-4 py-4 border-b border-slate-100">
              <h3 className="text-lg font-black" style={{ color: MALAKY_BLUE }}>{t(lang, "categories")}</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {categories.map((c: any) => {
                const active = activeCat === c.id;
                const count = products.filter((p: KioskProduct) => p.category_id === c.id).length;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveCat(c.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition active:scale-95",
                      active ? "text-white shadow" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                    )}
                    style={active ? { background: primaryColor } : {}}
                  >
                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", active ? "bg-white/20" : "bg-white text-slate-500")}>
                      <Utensils className="h-4 w-4" />
                    </div>
                    <span className="flex-1 text-start truncate">{c.name}</span>
                    {count > 0 && (
                      <span className={cn("text-xs font-black px-2 py-1 rounded-full shrink-0", active ? "bg-white/20 text-white" : "bg-white text-slate-500")}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
              {!loading && !categories.length && <div className="p-2 text-slate-400 text-sm">—</div>}
            </div>
          </div>

          {/* Products grid — center */}
          <div className="flex-1 overflow-y-auto p-4 pb-4">
            {loading ? (
              <div className="text-center p-10 text-slate-500 text-xl">{t(lang, "loading")}</div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {products.map((p: KioskProduct) => {
                    const qty = cartQtyForProduct(p.id);
                    const img = kioskImageFor(p);
                    const isPopular = popularIds.has(p.id);
                    return (
                      <div key={p.id} className="bg-white rounded-3xl shadow-sm active:shadow-md transition overflow-hidden flex flex-col border border-slate-100">
                        <button onClick={() => onPick(p)} className="relative aspect-square bg-slate-50 overflow-hidden active:scale-[0.98] transition-transform duration-200">
                          <img src={img} alt={pickName(lang, p.name, p.name_en)} loading="lazy" width={512} height={512} className="w-full h-full object-cover" />
                          {isPopular && (
                            <span className="absolute top-2 start-2 flex items-center gap-1 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow" style={{ background: primaryColor }}>
                              <Flame className="h-3 w-3" />
                              {t(lang, "most_ordered")}
                            </span>
                          )}
                        </button>
                        <div className="p-3 flex flex-col items-center gap-1.5">
                          <div className="font-black text-sm leading-snug text-center line-clamp-2 min-h-[2.5rem] w-full break-words" style={{ color: MALAKY_BLUE }}>{pickName(lang, p.name, p.name_en)}</div>
                          <div className="text-xl font-black" style={{ color: primaryColor }}>{Number(p.price).toFixed(2)} ₪</div>
                          {qty > 0 ? (
                            <div className="w-full flex items-center justify-between bg-slate-50 rounded-2xl px-2 py-1.5 mt-1">
                              <button
                                onClick={() => {
                                  const item = cart.find((c: CartItem) => c.product.id === p.id);
                                  if (item) onChangeQty(item.key, -1);
                                }}
                                className="h-11 w-11 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 active:scale-95"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="text-xl font-black">{qty}</span>
                              <button
                                onClick={() => onPick(p)}
                                className="h-11 w-11 rounded-full flex items-center justify-center text-white active:scale-95"
                                style={{ background: primaryColor }}
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => onPick(p)}
                              className="w-full mt-1 flex items-center justify-center gap-2 h-14 rounded-2xl font-black text-base transition text-white active:scale-95 shadow-sm"
                              style={{ background: primaryColor }}
                            >
                              <Plus className="h-5 w-5" />
                              {t(lang, "add_to_order")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!products.length && <div className="col-span-full text-center p-10 text-slate-400">—</div>}
                </div>
                <div className="text-center mt-6 text-xs text-slate-400 font-bold">
                  ⓘ {t(lang, "prices_include_vat")}
                </div>
              </>
            )}
          </div>

          {/* Cart panel — left */}
          <div className="w-72 lg:w-80 shrink-0 bg-white border-s border-slate-200 overflow-hidden flex flex-col">
            <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full flex items-center justify-center text-white" style={{ background: primaryColor }}>
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black" style={{ color: MALAKY_BLUE }}>{t(lang, "your_order")}</h3>
                  <div className="text-xs text-slate-500 font-bold">{cartCount} {t(lang, "items")}</div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <div className="h-16 w-16 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <ShoppingCart className="h-8 w-8" />
                  </div>
                  <div className="text-base font-black text-slate-800">{t(lang, "empty_cart")}</div>
                  <div className="text-xs text-slate-500">{t(lang, "empty_cart_sub")}</div>
                </div>
              )}
              {cart.map((i: CartItem) => (
                <div key={i.key} className="bg-slate-50 rounded-2xl p-3">
                  <div className="flex items-start gap-2">
                    <img src={kioskImageFor(i.product)} alt="" loading="lazy" className="h-14 w-14 rounded-xl object-cover shrink-0" />
                    <div className="flex-1 min-w-0 font-bold text-sm leading-snug break-words line-clamp-2" style={{ color: MALAKY_BLUE }}>
                      {pickName(lang, i.product.name, i.product.name_en)}
                    </div>
                    <button onClick={() => onChangeQty(i.key, -i.qty)} className="h-8 w-8 rounded-full bg-white text-slate-400 hover:text-red-600 flex items-center justify-center border border-slate-200 shrink-0 active:scale-95">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 bg-white rounded-full px-1 py-1 border border-slate-200">
                      <button onClick={() => onChangeQty(i.key, -1)} className="h-9 w-9 rounded-full flex items-center justify-center text-slate-600 active:scale-95">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center text-base font-bold">{i.qty}</span>
                      <button onClick={() => onChangeQty(i.key, +1)} className="h-9 w-9 rounded-full flex items-center justify-center text-white active:scale-95" style={{ background: primaryColor }}>
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="text-base font-black whitespace-nowrap" style={{ color: primaryColor }}>
                      {(i.unitPrice * i.qty).toFixed(2)} ₪
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-100 p-4 space-y-2">
              <div className="flex items-center justify-between pt-2 border-t border-dashed border-slate-200">
                <span className="text-base font-black" style={{ color: MALAKY_BLUE }}>{t(lang, "total")}</span>
                <span className="text-2xl font-black" style={{ color: primaryColor }}>{cartTotal.toFixed(2)} ₪</span>
              </div>
              <button
                onClick={onContinue}
                disabled={!cart.length}
                className="w-full mt-3 h-16 rounded-2xl text-white text-lg font-black shadow-lg disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.99]"
                style={{ background: primaryColor }}
              >
                <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
                {t(lang, "continue")}
              </button>
              {cart.length > 0 && (
                <button onClick={onClearCart} className="w-full py-3 flex items-center justify-center gap-2 text-sm font-bold text-slate-500 hover:text-red-600 rounded-xl border border-slate-200">
                  <Trash2 className="h-4 w-4" />
                  {t(lang, "clear_cart")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ==== Add-to-cart success toast ==== */}
      {justAdded && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center pointer-events-none animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl px-8 py-6 flex flex-col items-center gap-3 max-w-xs animate-scale-in">
            <div className="h-16 w-16 rounded-full flex items-center justify-center text-white shadow-lg" style={{ background: primaryColor }}>
              <Check className="h-9 w-9" strokeWidth={3} />
            </div>
            <div className="text-xl font-black" style={{ color: MALAKY_BLUE }}>{t(lang, "added_title")}</div>
            <div className="text-sm text-slate-500 text-center font-bold">{t(lang, "added_sub")}</div>
            <img src={kioskImageFor(justAdded)} alt="" className="h-14 w-14 rounded-xl object-cover" />
          </div>
        </div>
      )}
    </div>
  );
}

function CartScreen({ lang, cart, total, onChangeQty, onBack, onContinue, primaryColor }: any) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F8FAFC]">
      <div className="px-5 pt-5 pb-3 bg-white border-b border-slate-200 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-base text-slate-600 font-bold px-3 h-11 rounded-xl hover:bg-slate-50 active:scale-95">
          <ArrowRight className="h-5 w-5 rtl:rotate-180" />
          {t(lang, "back_to_menu")}
        </button>
        <h2 className="text-2xl font-black" style={{ color: MALAKY_BLUE }}>{t(lang, "review_order")}</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cart.length === 0 && <div className="text-center p-10 text-slate-400 text-xl">{t(lang, "empty_cart")}</div>}
        {cart.map((i: CartItem) => (
          <div key={i.key} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm border border-slate-100">
            <img src={kioskImageFor(i.product)} alt="" loading="lazy" className="h-16 w-16 rounded-xl object-cover shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-black text-base truncate" style={{ color: MALAKY_BLUE }}>{pickName(lang, i.product.name, i.product.name_en)}</div>
              {i.modifiers.length > 0 && <div className="text-xs text-slate-500 mt-0.5 truncate">{i.modifiers.map(m => m.option_name).join(" • ")}</div>}
              <div className="mt-1 flex items-center gap-1.5 bg-slate-50 rounded-full px-1 py-1 border border-slate-200 w-fit">
                <button onClick={() => onChangeQty(i.key, -1)} className="h-9 w-9 rounded-full flex items-center justify-center text-slate-600 active:scale-95"><Minus className="h-4 w-4" /></button>
                <span className="w-7 text-center text-base font-black">{i.qty}</span>
                <button onClick={() => onChangeQty(i.key, +1)} className="h-9 w-9 rounded-full text-white flex items-center justify-center active:scale-95" style={{ background: primaryColor }}><Plus className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="text-base font-black shrink-0" style={{ color: primaryColor }}>{(i.unitPrice * i.qty).toFixed(2)} ₪</div>
          </div>
        ))}
      </div>
      <div className="p-4 bg-white border-t shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.15)] space-y-2">
        <div className="flex items-center justify-between pt-2 border-t border-dashed border-slate-200">
          <span className="text-lg font-black" style={{ color: MALAKY_BLUE }}>{t(lang, "total")}</span>
          <span className="text-3xl font-black" style={{ color: primaryColor }}>{total.toFixed(2)} ₪</span>
        </div>
        <button onClick={onContinue} disabled={!cart.length} className="w-full mt-3 h-16 rounded-2xl text-white text-lg font-black shadow-lg disabled:opacity-40 active:scale-[0.99]" style={{ background: primaryColor }}>{t(lang, "confirm_and_pay")}</button>
        <button onClick={onBack} className="w-full h-14 rounded-2xl text-base font-black border-2 active:scale-[0.99]" style={{ borderColor: primaryColor, color: primaryColor }}>{t(lang, "back_to_menu")}</button>
      </div>
    </div>
  );
}

function CustomerScreen({ lang, settings, name, setName, phone, setPhone, onBack, onNext, primaryColor }: any) {
  const [focused, setFocused] = useState<"name" | "phone" | null>(
    settings.require_name ? "name" : settings.require_phone ? "phone" : null
  );
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-5 pt-5 pb-3 bg-white border-b border-slate-200 flex items-center justify-between gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-base text-slate-600 font-bold px-3 h-11 rounded-xl border border-slate-200 hover:bg-slate-50 active:scale-95">
          <ArrowRight className="h-5 w-5 rtl:rotate-180" />
          {t(lang, "back")}
        </button>
        <h2 className="text-2xl font-black text-slate-900">{t(lang, "customer_info")}</h2>
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
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                onFocus={() => setFocused("name")}
                readOnly
                onClick={() => setFocused("name")}
                className={cn("h-16 text-2xl mt-2 rounded-2xl cursor-pointer", focused === "name" && "ring-2 ring-offset-2")}
                style={focused === "name" ? { borderColor: primaryColor } : {}}
              />
            </div>
          )}
          {settings.require_phone && (
            <div>
              <Label className="text-lg font-bold">{t(lang, "phone")}</Label>
              <Input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                readOnly
                onClick={() => setFocused("phone")}
                onFocus={() => setFocused("phone")}
                className={cn("h-16 text-2xl mt-2 rounded-2xl cursor-pointer", focused === "phone" && "ring-2 ring-offset-2")}
                style={focused === "phone" ? { borderColor: primaryColor } : {}}
                placeholder="05XXXXXXXX"
              />
            </div>
          )}
        </div>
      </div>
      {focused && (
        <KioskKeyboard
          mode={focused === "phone" ? "numeric" : "text"}
          value={focused === "phone" ? phone : name}
          onChange={(v: string) => (focused === "phone" ? setPhone(v) : setName(v))}
          onDone={() => {
            if (focused === "name" && settings.require_phone) setFocused("phone");
            else setFocused(null);
          }}
          primaryColor={primaryColor}
        />
      )}
      <div className="p-6 bg-white border-t shadow-2xl">
        <button onClick={onNext} className="w-full py-6 rounded-2xl text-white text-2xl font-black shadow-lg" style={{ background: primaryColor }}>{t(lang, "proceed_payment")}</button>
      </div>
    </div>
  );
}

function PaymentScreen({ lang, total, status, onPay, onRetry, onCashier, onBack, primaryColor }: any) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 px-5 pt-5 pb-3 bg-white border-b border-slate-200 flex items-center">
        <button onClick={onBack} className="flex items-center gap-1.5 text-base text-slate-600 font-bold px-3 h-11 rounded-xl border border-slate-200 hover:bg-slate-50 active:scale-95">
          <ArrowRight className="h-5 w-5 rtl:rotate-180" />
          {t(lang, "back")}
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8">
      <div className="text-2xl text-slate-500 font-bold">{t(lang, "total")}</div>
      <div className="text-7xl font-black" style={{ color: primaryColor }}>{total.toFixed(2)} ₪</div>

      {status === "idle" && (
        <div className="flex flex-col items-center gap-5 w-full max-w-xl">
          <button onClick={onPay} className="w-full flex items-center justify-center gap-4 px-16 py-8 rounded-3xl text-white text-3xl font-black shadow-2xl active:scale-95 transition-transform" style={{ background: primaryColor }}>
            <CreditCard className="h-8 w-8" /> {t(lang, "pay_with_card")}
          </button>
          <button onClick={onCashier} className="w-full flex items-center justify-center gap-4 px-16 py-8 rounded-3xl bg-white border-2 border-slate-300 text-slate-900 text-3xl font-black shadow-xl active:scale-95 transition-transform">
            <Banknote className="h-8 w-8" /> {t(lang, "pay_at_cashier")}
          </button>
        </div>
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
    </div>
  );
}

function SuccessScreen({ lang, orderNumber, paidAtCashier, onNew, primaryColor }: any) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-6 bg-[#F8FAFC] relative">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -end-32 h-96 w-96 rounded-full opacity-[0.06]" style={{ background: primaryColor }} />
        <div className="absolute -bottom-40 -start-40 h-[26rem] w-[26rem] rounded-full opacity-[0.06]" style={{ background: MALAKY_BLUE }} />
      </div>
      <div className="relative h-32 w-32 rounded-full flex items-center justify-center shadow-2xl animate-scale-in" style={{ background: primaryColor }}>
        <Check className="h-20 w-20 text-white" strokeWidth={4} />
      </div>
      <div className="relative">
        <div className="text-5xl font-black" style={{ color: MALAKY_BLUE }}>{t(lang, "thank_you")}</div>
        <div className="mt-2 text-lg font-bold text-slate-600">{t(lang, "order_received")}</div>
        {paidAtCashier && <div className="mt-2 text-base text-amber-700 font-bold">{t(lang, "pay_at_cashier")}</div>}
      </div>
      <div className="relative bg-white px-10 py-5 rounded-3xl shadow-xl border border-slate-100">
        <div className="text-sm text-slate-500 font-bold text-center">{t(lang, "order_number")}</div>
        <div className="text-5xl font-black mt-1 text-center" style={{ color: primaryColor }}>#{orderNumber}</div>
      </div>
      <div className="relative text-slate-500 font-bold">{t(lang, "preparing_soon")}</div>
      <button onClick={onNew} className="relative mt-2 w-full max-w-sm h-16 rounded-2xl text-white text-lg font-black shadow-xl active:scale-[0.99]" style={{ background: primaryColor }}>{t(lang, "back_to_home")}</button>
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

function ExitPinDialog({ open, onClose, branchId, onSuccess, lang }: { open: boolean; onClose: () => void; branchId: string; onSuccess: () => void; lang: KioskLang }) {
  const [entered, setEntered] = useState("");
  const [verifying, setVerifying] = useState(false);
  useEffect(() => { if (!open) setEntered(""); }, [open]);
  const verify = async (candidate: string) => {
    setVerifying(true);
    const { data, error } = await supabase.rpc("verify_kiosk_exit_pin" as any, { p_branch_id: branchId, p_pin: candidate });
    setVerifying(false);
    if (!error && data === true) onSuccess();
    else { toast.error(t(lang, "wrong_pin")); setTimeout(() => setEntered(""), 300); }
  };
  const press = (d: string) => {
    if (verifying) return;
    const n = (entered + d).slice(0, 6);
    setEntered(n);
  };
  const submit = () => { if (!verifying && entered.length >= 4) void verify(entered); };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir={lang === "ar" ? "rtl" : "ltr"}>
        <DialogHeader><DialogTitle className="text-2xl text-center">{t(lang, "exit_pin")}</DialogTitle></DialogHeader>
        <div className="flex justify-center gap-2 my-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={cn("h-4 w-4 rounded-full", i < entered.length ? "bg-slate-900" : "bg-slate-200")} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2" dir="rtl">
          {["1","2","3","4","5","6","7","8","9","⌫","0","✓"].map((d, i) => (
            <button key={i} onClick={() => d === "⌫" ? setEntered(e => e.slice(0, -1)) : d === "✓" ? submit() : press(d)} disabled={verifying} className={cn("h-16 rounded-xl text-2xl font-bold", d === "✓" ? "bg-green-500 text-white hover:bg-green-600 active:scale-95" : "bg-slate-100 hover:bg-slate-200 active:scale-95")}>{d}</button>
          ))}
        </div>
        <Button variant="ghost" onClick={onClose} className="mt-2" disabled={verifying}>{t(lang, "back")}</Button>
      </DialogContent>
    </Dialog>
  );
}