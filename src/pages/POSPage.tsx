import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Search, ArrowRight, ShoppingCart, Trash2, Plus, Minus,
  CreditCard, Banknote, Receipt, Clock, User, ChevronDown,
  Barcode, RotateCcw, LogOut, Package, Percent, Hash,
  CheckCircle, AlertCircle, Wifi, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

// Types
interface CartItem {
  id: string;
  product_id: string | null;
  name: string;
  qty: number;
  unit_price: number;
  cost_price: number;
  discount_pct: number;
  tax_rate: number;
  unit: string;
  total: number;
}

interface Product {
  id: string;
  name: string;
  sell_price: number;
  buy_price: number;
  quantity: number;
  category: string;
  unit: string;
  sku: string | null;
  barcode: string | null;
  tax_rate: number;
  is_pos_available: boolean;
  color: string;
  image_url: string | null;
}

interface Session {
  id: string;
  state: string;
  opening_cash: number;
  total_sales: number;
  total_orders: number;
  opened_at: string;
  cashier_name: string;
}

interface Company {
  id: string;
  name: string;
}

interface Terminal {
  id: string;
  name: string;
  company_id: string;
}

const POSPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const searchRef = useRef<HTMLInputElement>(null);

  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("الكل");
  const [searchQuery, setSearchQuery] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  
  // Payment
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [paymentCurrency, setPaymentCurrency] = useState<string>("ILS");
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});

  const currencies = [
    { code: "ILS", symbol: "₪", name: "شيكل", flag: "🇮🇱" },
    { code: "USD", symbol: "$", name: "دولار", flag: "🇺🇸" },
    { code: "JOD", symbol: "د.ا", name: "دينار", flag: "🇯🇴" },
    { code: "EUR", symbol: "€", name: "يورو", flag: "🇪🇺" },
  ];

  // Numpad
  const [numpadTarget, setNumpadTarget] = useState<"qty" | "unit_price" | "discount_pct" | null>(null);
  const [numpadValue, setNumpadValue] = useState("");
  const [selectedCartIndex, setSelectedCartIndex] = useState<number | null>(null);

  // Discount
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderDiscountType, setOrderDiscountType] = useState<"fixed" | "percent">("fixed");

  const userId = user?.id;

  // Initialize
  useEffect(() => {
    if (!userId) return;
    initializePOS();
  }, [userId]);

  const initializePOS = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // Check for existing company or create one
      let { data: companies } = await supabase
        .from("pos_companies")
        .select("*")
        .eq("user_id", userId)
        .limit(1);

      let comp = companies?.[0];
      if (!comp) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_name, display_name")
          .eq("user_id", userId)
          .single();

        const { data: newComp } = await supabase
          .from("pos_companies")
          .insert({
            user_id: userId,
            name: profile?.company_name || "شركتي",
          })
          .select()
          .single();
        comp = newComp;
      }
      setCompany(comp ? { id: comp.id, name: comp.name } : null);

      // Check for terminal or create one
      if (comp) {
        let { data: terminals } = await supabase
          .from("pos_terminals")
          .select("*")
          .eq("user_id", userId)
          .eq("company_id", comp.id)
          .limit(1);

        let term = terminals?.[0];
        if (!term) {
          const { data: newTerm } = await supabase
            .from("pos_terminals")
            .insert({
              user_id: userId,
              company_id: comp.id,
              name: "نقطة بيع 1",
            })
            .select()
            .single();
          term = newTerm;
        }
        setTerminal(term ? { id: term.id, name: term.name, company_id: term.company_id } : null);

        // Check for open session
        const { data: sessions } = await supabase
          .from("pos_sessions")
          .select("*")
          .eq("user_id", userId)
          .eq("state", "open")
          .limit(1);

        if (sessions?.[0]) {
          setSession({
            id: sessions[0].id,
            state: sessions[0].state,
            opening_cash: Number(sessions[0].opening_cash),
            total_sales: Number(sessions[0].total_sales),
            total_orders: sessions[0].total_orders,
            opened_at: sessions[0].opened_at,
            cashier_name: sessions[0].cashier_name || "",
          });
        } else {
          setShowOpenShift(true);
        }
      }

      // Load products and exchange rates
      await Promise.all([loadProducts(), loadExchangeRates()]);
    } catch (err) {
      console.error("POS init error:", err);
      toast.error("خطأ في تحميل نقطة البيع");
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("products")
      .select("id, name, sell_price, buy_price, quantity, category, unit, sku, barcode, tax_rate, is_pos_available, color, image_url")
      .eq("user_id", userId)
      .order("name");

    setProducts(
      (data || []).map((p) => ({
        ...p,
        tax_rate: Number(p.tax_rate) || 0,
        is_pos_available: p.is_pos_available !== false,
        color: p.color || "#3B82F6",
        sell_price: Number(p.sell_price),
        buy_price: Number(p.buy_price),
        quantity: Number(p.quantity),
      }))
    );
  };

  const loadExchangeRates = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("exchange_rates")
      .select("currency_id, mid_rate, currencies!inner(code)")
      .eq("user_id", userId)
      .order("rate_date", { ascending: false });

    const rates: Record<string, number> = { ILS: 1 };
    if (data) {
      const seen = new Set<string>();
      for (const r of data) {
        const code = (r as any).currencies?.code;
        if (code && !seen.has(code)) {
          seen.add(code);
          rates[code] = Number(r.mid_rate) || 1;
        }
      }
    }
    setExchangeRates(rates);
  };

  // Categories
  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category).filter(Boolean));
    return ["الكل", ...Array.from(cats)];
  }, [products]);

  const categoryColors: Record<string, string> = {
    "الكل": "hsl(var(--primary))",
    "عام": "#3B82F6",
    "أغذية": "#F59E0B",
    "مشروبات": "#06B6D4",
    "إلكترونيات": "#8B5CF6",
    "ملابس": "#EC4899",
    "أدوات منزلية": "#10B981",
  };

  // Filtered products
  const filteredProducts = useMemo(() => {
    let filtered = products.filter((p) => p.is_pos_available);
    if (selectedCategory !== "الكل") {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [products, selectedCategory, searchQuery]);

  // Cart operations
  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.findIndex((item) => item.product_id === product.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = {
          ...updated[existing],
          qty: updated[existing].qty + 1,
          total: (updated[existing].qty + 1) * updated[existing].unit_price * (1 - updated[existing].discount_pct / 100),
        };
        return updated;
      }
      const lineTotal = product.sell_price;
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          product_id: product.id,
          name: product.name,
          qty: 1,
          unit_price: product.sell_price,
          cost_price: product.buy_price,
          discount_pct: 0,
          tax_rate: product.tax_rate,
          unit: product.unit,
          total: lineTotal,
        },
      ];
    });
  }, []);

  const removeFromCart = useCallback((index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
    if (selectedCartIndex === index) setSelectedCartIndex(null);
  }, [selectedCartIndex]);

  const updateCartItem = useCallback((index: number, field: "qty" | "unit_price" | "discount_pct", value: number) => {
    setCart((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      const { qty, unit_price, discount_pct } = updated[index];
      updated[index].total = qty * unit_price * (1 - discount_pct / 100);
      return updated;
    });
  }, []);

  // Totals
  const cartTotals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const taxAmount = cart.reduce((sum, item) => sum + (item.total * item.tax_rate / 100), 0);
    let discountAmt = orderDiscountType === "percent" ? subtotal * orderDiscount / 100 : orderDiscount;
    const total = subtotal + taxAmount - discountAmt;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(taxAmount * 100) / 100,
      discount: Math.round(discountAmt * 100) / 100,
      total: Math.round(total * 100) / 100,
      itemCount: cart.reduce((sum, item) => sum + item.qty, 0),
    };
  }, [cart, orderDiscount, orderDiscountType]);

  // Open session
  const handleOpenShift = async () => {
    if (!userId || !company || !terminal) return;
    const cash = parseFloat(openingCash) || 0;
    const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";

    const { data, error } = await supabase
      .from("pos_sessions")
      .insert({
        user_id: userId,
        company_id: company.id,
        terminal_id: terminal.id,
        cashier_name: displayName,
        opening_cash: cash,
        state: "open",
      })
      .select()
      .single();

    if (error) {
      toast.error("خطأ في فتح الوردية");
      return;
    }

    setSession({
      id: data.id,
      state: "open",
      opening_cash: cash,
      total_sales: 0,
      total_orders: 0,
      opened_at: data.opened_at,
      cashier_name: displayName,
    });
    setShowOpenShift(false);
    toast.success("تم فتح الوردية بنجاح");
  };

  // Complete order
  const handleCompleteOrder = async () => {
    if (!userId || !session || cart.length === 0) return;
    if (!company) return;

    setProcessing(true);
    try {
      // Create order
      const { data: order, error: orderError } = await supabase
        .from("pos_orders")
        .insert({
          user_id: userId,
          company_id: company.id,
          session_id: session.id,
          customer_name: customerName || null,
          subtotal: cartTotals.subtotal,
          discount_amount: cartTotals.discount,
          tax_amount: cartTotals.tax,
          total: cartTotals.total,
          state: "draft",
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order lines
      const lines = cart.map((item) => ({
        user_id: userId,
        order_id: order.id,
        product_id: item.product_id,
        product_name: item.name,
        qty: item.qty,
        unit: item.unit,
        unit_price: item.unit_price,
        discount_pct: item.discount_pct,
        discount_amount: item.unit_price * item.qty * item.discount_pct / 100,
        tax_rate: item.tax_rate,
        tax_amount: item.total * item.tax_rate / 100,
        subtotal: item.qty * item.unit_price,
        total: item.total,
        cost_price: item.cost_price,
      }));

      await supabase.from("pos_order_lines").insert(lines);

      // Complete with atomic function
      const tendered = parseFloat(tenderedAmount) || cartTotals.total;
      const change = Math.max(0, tendered - cartTotals.total);

      const { data: result, error: completeError } = await supabase.rpc("complete_pos_order", {
        p_order_id: order.id,
        p_user_id: userId,
        p_payments: JSON.stringify([{
          method: paymentMethod,
          amount: cartTotals.total,
          tendered: tendered,
          change: change,
        }]),
      });

      if (completeError) throw completeError;

      const res = result as any;
      if (!res?.success) {
        throw new Error(res?.error || "خطأ في إتمام الطلب");
      }

      // Update session locally
      setSession((prev) =>
        prev
          ? {
              ...prev,
              total_sales: prev.total_sales + cartTotals.total,
              total_orders: prev.total_orders + 1,
            }
          : null
      );

      // Clear cart
      setCart([]);
      setShowPayment(false);
      setTenderedAmount("");
      setCustomerName("");
      setPaymentMethod("cash");
      setPaymentCurrency("ILS");
      setOrderDiscount(0);
      setSelectedCartIndex(null);

      toast.success(
        <div className="flex flex-col gap-1" dir="rtl">
          <span className="font-bold">✅ تم إتمام البيع</span>
          <span className="text-sm">رقم الطلب: {res.order_number}</span>
          <span className="text-sm">المبلغ: ₪{cartTotals.total.toFixed(2)}</span>
          {change > 0 && <span className="text-sm">الباقي: ₪{change.toFixed(2)}</span>}
        </div>
      );
    } catch (err: any) {
      toast.error(err.message || "خطأ في إتمام الطلب");
    } finally {
      setProcessing(false);
    }
  };

  // Close session
  const handleCloseShift = async () => {
    if (!session || !userId) return;
    const cash = parseFloat(closingCash) || 0;
    const expected = session.opening_cash + session.total_sales;
    const variance = cash - expected;

    await supabase
      .from("pos_sessions")
      .update({
        state: "closed",
        closing_cash: cash,
        expected_cash: expected,
        cash_variance: variance,
        closed_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    setShowCloseShift(false);
    setSession(null);
    setCart([]);
    toast.success("تم إغلاق الوردية بنجاح");
    navigate("/apps");
  };

  // Numpad
  const handleNumpad = (key: string) => {
    if (key === "C") {
      setNumpadValue("");
      return;
    }
    if (key === "⌫") {
      setNumpadValue((prev) => prev.slice(0, -1));
      return;
    }
    if (key === "." && numpadValue.includes(".")) return;
    setNumpadValue((prev) => prev + key);
  };

  const applyNumpad = () => {
    if (selectedCartIndex === null || !numpadTarget) return;
    const val = parseFloat(numpadValue) || 0;
    updateCartItem(selectedCartIndex, numpadTarget, val);
    setNumpadValue("");
    setNumpadTarget(null);
  };

  // Keyboard shortcut
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        searchRef.current?.focus();
        e.preventDefault();
      }
      if (e.key === "F12" && cart.length > 0) {
        setShowPayment(true);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [cart]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">جاري تحميل نقطة البيع...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden" dir="rtl">
      {/* ── Top Bar ── */}
      <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-4 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate("/apps")} className="shrink-0">
          <ArrowRight className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 text-sm">
          <Package className="h-4 w-4 text-primary" />
          <span className="font-bold text-foreground">{company?.name || "نقطة البيع"}</span>
          {terminal && <Badge variant="secondary" className="text-xs">{terminal.name}</Badge>}
        </div>

        <div className="flex-1" />

        {session && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              <span>{session.cashier_name}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>{new Date(session.opened_at).toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {session.total_orders} طلب | ₪{session.total_sales.toFixed(0)}
            </Badge>
          </div>
        )}

        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowCloseShift(true)}
          className="text-xs gap-1"
        >
          <LogOut className="h-3.5 w-3.5" />
          إغلاق الوردية
        </Button>
      </header>

      {/* ── Main Area ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left: Product Grid ── */}
        <div className="flex-1 flex flex-col min-w-0 border-l border-border">
          {/* Search */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث عن منتج... (F2)"
                className="pr-10 h-10 bg-muted/50 rounded-xl text-sm"
              />
              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer hover:text-primary" />
            </div>
          </div>

          {/* Categories */}
          <div className="px-3 py-2 border-b border-border overflow-x-auto">
            <div className="flex gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  style={
                    selectedCategory === cat
                      ? {}
                      : { borderBottom: `3px solid ${categoryColors[cat] || "#6B7280"}` }
                  }
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          <ScrollArea className="flex-1">
            <div className="p-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {filteredProducts.map((product) => (
                <motion.button
                  key={product.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => addToCart(product)}
                  className="relative bg-card border border-border rounded-xl p-3 text-center hover:border-primary/50 hover:shadow-md transition-all group"
                >
                  {/* Color indicator */}
                  <div
                    className="absolute top-0 inset-x-3 h-1 rounded-b-full"
                    style={{ backgroundColor: product.color }}
                  />

                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-10 h-10 mx-auto mb-1.5 rounded-lg object-cover" />
                  ) : (
                    <div
                      className="w-10 h-10 mx-auto mb-1.5 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: product.color }}
                    >
                      {product.name.charAt(0)}
                    </div>
                  )}

                  <p className="text-xs font-medium text-foreground leading-tight line-clamp-2 mb-1">
                    {product.name}
                  </p>
                  <p className="text-sm font-bold text-primary">₪{product.sell_price.toFixed(2)}</p>

                  {/* Stock indicator */}
                  <div className={`text-[10px] mt-1 ${product.quantity <= 0 ? "text-destructive" : product.quantity <= 5 ? "text-warning" : "text-muted-foreground"}`}>
                    {product.quantity <= 0 ? "نفذ" : `${product.quantity} ${product.unit}`}
                  </div>
                </motion.button>
              ))}

              {filteredProducts.length === 0 && (
                <div className="col-span-full py-16 text-center text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">لا توجد منتجات</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── Right: Cart Panel ── */}
        <div className="w-[380px] lg:w-[420px] flex flex-col bg-card shrink-0">
          {/* Cart Header */}
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="font-bold text-sm text-foreground">السلة</span>
              <Badge variant="secondary" className="text-xs">{cartTotals.itemCount}</Badge>
            </div>
            {cart.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setCart([]); setSelectedCartIndex(null); }}
                className="text-xs text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 ml-1" />
                إفراغ
              </Button>
            )}
          </div>

          {/* Cart Items */}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {cart.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">السلة فارغة</p>
                  <p className="text-xs mt-1">اضغط على منتج لإضافته</p>
                </div>
              ) : (
                cart.map((item, index) => {
                  const product = products.find(p => p.id === item.product_id);
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-2.5 rounded-lg border transition-all ${
                        selectedCartIndex === index
                          ? "border-primary bg-primary/5"
                          : "border-transparent hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedCartIndex(selectedCartIndex === index ? null : index)}
                    >
                      <div className="flex items-center gap-2">
                        {/* Product image */}
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                          {product?.image_url ? (
                            <img src={product.image_url} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: product?.color || 'hsl(var(--primary))' }}>
                              <Package className="h-4 w-4 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                            <span>{item.qty} × ₪{item.unit_price.toFixed(2)}</span>
                            {item.discount_pct > 0 && (
                              <Badge variant="secondary" className="text-[10px] px-1">
                                -{item.discount_pct}%
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-bold text-primary shrink-0">₪{item.total.toFixed(2)}</p>
                      </div>

                      {/* Always visible controls */}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-muted rounded-lg">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); updateCartItem(index, "qty", Math.max(1, item.qty - 1)); }}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm font-bold">{item.qty}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); updateCartItem(index, "qty", item.qty + 1); }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); removeFromCart(index); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Totals */}
          <div className="border-t border-border p-3 space-y-1.5 bg-card">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>المجموع الفرعي</span>
              <span>₪{cartTotals.subtotal.toFixed(2)}</span>
            </div>
            {cartTotals.tax > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>الضريبة</span>
                <span>₪{cartTotals.tax.toFixed(2)}</span>
              </div>
            )}
            {cartTotals.discount > 0 && (
              <div className="flex justify-between text-xs text-destructive">
                <span>الخصم</span>
                <span>-₪{cartTotals.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-foreground pt-1 border-t border-border">
              <span>الإجمالي</span>
              <span className="text-primary">₪{cartTotals.total.toFixed(2)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-3 border-t border-border space-y-2">
            <Button
              className="w-full h-14 text-lg font-bold gap-2 rounded-xl"
              size="lg"
              disabled={cart.length === 0 || !session}
              onClick={() => setShowPayment(true)}
            >
              <CreditCard className="h-5 w-5" />
              دفع (F12)
            </Button>
          </div>
        </div>
      </div>

      {/* ══════ MODALS ══════ */}

      {/* Open Shift Dialog */}
      <Dialog open={showOpenShift} onOpenChange={(v) => { if (!v && !session) navigate("/apps"); setShowOpenShift(v); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">فتح وردية جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">النقدية الافتتاحية (₪)</label>
              <Input
                type="number"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0.00"
                className="text-lg h-12 text-center font-bold"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleOpenShift} className="w-full h-12 text-base font-bold gap-2">
              <CheckCircle className="h-5 w-5" />
              فتح الوردية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">الدفع</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Total */}
            <div className="text-center p-4 bg-primary/10 rounded-xl">
              <p className="text-sm text-muted-foreground">المبلغ المطلوب</p>
              <p className="text-3xl font-bold text-primary mt-1">₪{cartTotals.total.toFixed(2)}</p>
            </div>

            {/* Payment Methods */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "cash", label: "نقد", icon: Banknote, emoji: "💵" },
                { key: "credit", label: "حساب", icon: Receipt, emoji: "📒" },
                { key: "card", label: "بطاقة", icon: CreditCard, emoji: "💳" },
              ].map((method) => (
                <button
                  key={method.key}
                  onClick={() => setPaymentMethod(method.key)}
                  className={`p-3 rounded-xl border-2 text-center transition-all ${
                    paymentMethod === method.key
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <span className="text-2xl block mb-1">{method.emoji}</span>
                  <span className="text-xs font-medium">{method.label}</span>
                </button>
              ))}
            </div>

            {/* Tendered (cash only) */}
            {paymentMethod === "cash" && (
              <div className="space-y-3">
                {/* Currency selector */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block">العملة</label>
                  <div className="grid grid-cols-4 gap-2">
                    {currencies.map((cur) => (
                      <button
                        key={cur.code}
                        onClick={() => {
                          setPaymentCurrency(cur.code);
                          setTenderedAmount("");
                        }}
                        className={`p-2 rounded-xl border-2 text-center transition-all ${
                          paymentCurrency === cur.code
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/30"
                        }`}
                      >
                        <span className="text-lg block">{cur.flag}</span>
                        <span className="text-[10px] font-medium block mt-0.5">{cur.name}</span>
                      </button>
                    ))}
                  </div>
                  {paymentCurrency !== "ILS" && exchangeRates[paymentCurrency] && (
                    <div className="mt-1.5 text-xs text-muted-foreground text-center bg-muted/50 rounded-lg p-1.5">
                      سعر الصرف: 1 {currencies.find(c => c.code === paymentCurrency)?.symbol} = ₪{exchangeRates[paymentCurrency]?.toFixed(4)}
                      <span className="mx-1">|</span>
                      المطلوب: {currencies.find(c => c.code === paymentCurrency)?.symbol}
                      {(cartTotals.total / (exchangeRates[paymentCurrency] || 1)).toFixed(2)}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">المبلغ المدفوع</label>
                  <Input
                    type="number"
                    value={tenderedAmount}
                    onChange={(e) => setTenderedAmount(e.target.value)}
                    placeholder={paymentCurrency === "ILS" 
                      ? cartTotals.total.toFixed(2) 
                      : (cartTotals.total / (exchangeRates[paymentCurrency] || 1)).toFixed(2)}
                    className="h-12 text-lg text-center font-bold"
                  />
                  {(() => {
                    const tendered = parseFloat(tenderedAmount) || 0;
                    const tenderedInILS = paymentCurrency === "ILS" 
                      ? tendered 
                      : tendered * (exchangeRates[paymentCurrency] || 1);
                    const change = tenderedInILS - cartTotals.total;
                    if (change > 0) {
                      return (
                        <div className="text-center mt-2 p-2 bg-primary/10 rounded-lg">
                          <span className="text-sm text-muted-foreground">الباقي: </span>
                          <span className="text-lg font-bold text-primary">₪{change.toFixed(2)}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {/* Quick amounts */}
                  <div className="flex gap-2 mt-2">
                    {(paymentCurrency === "ILS" 
                      ? [10, 20, 50, 100, 200] 
                      : paymentCurrency === "USD" ? [5, 10, 20, 50, 100]
                      : paymentCurrency === "JOD" ? [5, 10, 20, 50, 100]
                      : [5, 10, 20, 50, 100]
                    ).map((amt) => {
                      const cur = currencies.find(c => c.code === paymentCurrency);
                      return (
                        <button
                          key={amt}
                          onClick={() => setTenderedAmount(String(amt))}
                          className="flex-1 py-1.5 text-xs rounded-lg bg-muted hover:bg-primary/10 transition"
                        >
                          {cur?.symbol}{amt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Customer for credit */}
            {paymentMethod === "credit" && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">اسم العميل</label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="أدخل اسم العميل..."
                  className="h-10"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={handleCompleteOrder}
              disabled={processing || (paymentMethod === "credit" && !customerName)}
              className="w-full h-12 text-base font-bold gap-2"
            >
              {processing ? (
                <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle className="h-5 w-5" />
              )}
              {processing ? "جاري المعالجة..." : "تأكيد الدفع"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Shift Dialog */}
      <Dialog open={showCloseShift} onOpenChange={setShowCloseShift}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">إغلاق الوردية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">النقدية الافتتاحية</span>
                <span className="font-medium">₪{session?.opening_cash.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">إجمالي المبيعات</span>
                <span className="font-medium text-primary">₪{session?.total_sales.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">عدد الطلبات</span>
                <span className="font-medium">{session?.total_orders}</span>
              </div>
              <div className="flex justify-between font-bold pt-2 border-t border-border">
                <span>المتوقع في الصندوق</span>
                <span>₪{((session?.opening_cash || 0) + (session?.total_sales || 0)).toFixed(2)}</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">عد النقدية الفعلي (₪)</label>
              <Input
                type="number"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                placeholder="0.00"
                className="text-lg h-12 text-center font-bold"
              />
              {closingCash && session && (
                <div className={`text-center mt-2 p-2 rounded-lg text-sm ${
                  parseFloat(closingCash) - (session.opening_cash + session.total_sales) === 0
                    ? "bg-success/10 text-primary"
                    : "bg-destructive/10 text-destructive"
                }`}>
                  الفرق: ₪{(parseFloat(closingCash) - (session.opening_cash + session.total_sales)).toFixed(2)}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCloseShift} variant="destructive" className="w-full h-12 text-base font-bold gap-2">
              <LogOut className="h-5 w-5" />
              إغلاق الوردية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default POSPage;
