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
  CheckCircle, AlertCircle, Wifi, WifiOff, MessageSquare, StickyNote,
  UtensilsCrossed, Gamepad2, Shirt, Monitor, ShoppingBag, Printer,
  Apple, Zap, Coffee, Box, BarChart3, TrendingUp,
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
  note: string;
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
  min_quantity: number;
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

// ── Category config ──
const CATEGORY_CONFIG: Record<string, { icon: typeof Package; color: string; borderColor: string; bgColor: string }> = {
  "طعام": { icon: UtensilsCrossed, color: "#16A34A", borderColor: "border-green-500", bgColor: "bg-green-500" },
  "أغذية": { icon: UtensilsCrossed, color: "#16A34A", borderColor: "border-green-500", bgColor: "bg-green-500" },
  "مشروبات": { icon: Coffee, color: "#16A34A", borderColor: "border-green-500", bgColor: "bg-green-500" },
  "إلكترونيات": { icon: Monitor, color: "#3B82F6", borderColor: "border-blue-500", bgColor: "bg-blue-500" },
  "ملابس": { icon: Shirt, color: "#8B5CF6", borderColor: "border-violet-500", bgColor: "bg-violet-500" },
  "ألعاب": { icon: Gamepad2, color: "#F97316", borderColor: "border-orange-500", bgColor: "bg-orange-500" },
  "بضاعة عامة": { icon: Box, color: "#6B7280", borderColor: "border-gray-400", bgColor: "bg-gray-500" },
  "عام": { icon: Box, color: "#6B7280", borderColor: "border-gray-400", bgColor: "bg-gray-500" },
};

const DEFAULT_CAT_CONFIG = { icon: Package, color: "#6B7280", borderColor: "border-gray-400", bgColor: "bg-gray-500" };

function getCatConfig(category: string) {
  return CATEGORY_CONFIG[category] || DEFAULT_CAT_CONFIG;
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
  const [contacts, setContacts] = useState<{ id: string; contact_name: string }[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);

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
  const [selectedCartIndex, setSelectedCartIndex] = useState<number | null>(null);

  // Discount
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderDiscountType, setOrderDiscountType] = useState<"fixed" | "percent">("fixed");
  const [orderNote, setOrderNote] = useState("");

  const userId = user?.id;

  // ── Cart quantity map for badges on product cards ──
  const cartQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    cart.forEach((item) => {
      if (item.product_id) {
        map[item.product_id] = (map[item.product_id] || 0) + item.qty;
      }
    });
    return map;
  }, [cart]);

  // Initialize
  useEffect(() => {
    if (!userId) return;
    initializePOS();
  }, [userId]);

  const initializePOS = async () => {
    if (!userId) return;
    setLoading(true);
    try {
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

      await Promise.all([loadProducts(), loadExchangeRates(), loadContacts()]);
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
      .select("id, name, sell_price, buy_price, quantity, category, unit, sku, barcode, tax_rate, is_pos_available, color, image_url, min_quantity")
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
        min_quantity: Number(p.min_quantity) || 0,
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

  const loadContacts = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("contacts")
      .select("id, contact_name")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("contact_name");
    setContacts(data || []);
  };

  const filteredContacts = useMemo(() => {
    if (!customerSearch) return contacts;
    const q = customerSearch.toLowerCase();
    return contacts.filter(c => c.contact_name.toLowerCase().includes(q));
  }, [contacts, customerSearch]);

  // Categories with counts
  const categoriesWithCounts = useMemo(() => {
    const posProducts = products.filter(p => p.is_pos_available);
    const cats = new Map<string, number>();
    posProducts.forEach(p => {
      const c = p.category || "عام";
      cats.set(c, (cats.get(c) || 0) + 1);
    });
    return [
      { name: "الكل", count: posProducts.length },
      ...Array.from(cats.entries()).map(([name, count]) => ({ name, count }))
    ];
  }, [products]);

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
    // Allow selling even if stock is zero - just show warning
    if (product.quantity <= 0) {
      toast.warning(`⚠️ تنبيه: ${product.name} - المخزون صفر، سيتم البيع بالسالب`);
    }
    // Check low stock warning
    const currentInCart = cart.find(i => i.product_id === product.id)?.qty || 0;
    if (product.quantity > 0 && product.min_quantity > 0 && (product.quantity - currentInCart - 1) <= product.min_quantity) {
      toast.warning(`⚠️ تنبيه: ${product.name} - باقي ${product.quantity - currentInCart - 1} قطع فقط`);
    }

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
          total: product.sell_price,
          note: "",
        },
      ];
    });
  }, [cart]);

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

      setSession((prev) =>
        prev
          ? {
              ...prev,
              total_sales: prev.total_sales + cartTotals.total,
              total_orders: prev.total_orders + 1,
            }
          : null
      );

      // Reload products to get updated stock
      loadProducts();

      setCart([]);
      setShowPayment(false);
      setTenderedAmount("");
      setCustomerName("");
      setPaymentMethod("cash");
      setPaymentCurrency("ILS");
      setOrderDiscount(0);
      setOrderNote("");
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
      {/* ══════ HEADER ══════ */}
      <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate("/apps")} className="shrink-0">
          <ArrowRight className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <ShoppingBag className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm text-foreground">{company?.name || "شركتي"}</span>
        </div>

        {terminal && (
          <Badge variant="secondary" className="text-xs gap-1 cursor-pointer hover:bg-muted">
            <Monitor className="h-3 w-3" />
            {terminal.name}
          </Badge>
        )}

        <div className="w-px h-6 bg-border" />

        {session && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              <span className="font-medium">{session.cashier_name}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>{new Date(session.opened_at).toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          </div>
        )}

        <div className="flex-1" />

        {/* Live sales indicator */}
        {session && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10">
            <BarChart3 className="h-4 w-4 text-primary" />
            <div className="text-xs">
              <span className="text-muted-foreground">مبيعات اليوم: </span>
              <span className="font-bold text-primary tabular-nums">₪{session.total_sales.toFixed(0)}</span>
            </div>
            <div className="w-px h-4 bg-border mx-1" />
            <span className="text-xs text-muted-foreground">{session.total_orders} طلب</span>
          </div>
        )}

        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowCloseShift(true)}
          className="text-xs gap-1.5"
        >
          <X className="h-3.5 w-3.5" />
          إغلاق الوردية
        </Button>
      </header>

      {/* ══════ MAIN AREA ══════ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT: Product Grid ── */}
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

          {/* ── Category Tabs ── */}
          <div className="px-3 py-2 border-b border-border">
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
              {categoriesWithCounts.map((cat) => {
                const isActive = selectedCategory === cat.name;
                const config = cat.name === "الكل"
                  ? { icon: ShoppingCart, color: "hsl(var(--primary))", bgColor: "bg-primary", borderColor: "" }
                  : getCatConfig(cat.name);
                const Icon = config.icon;

                return (
                  <button
                    key={cat.name}
                    onClick={() => setSelectedCategory(cat.name)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                      isActive
                        ? "text-white shadow-md"
                        : "bg-card border border-border text-muted-foreground hover:bg-muted/80"
                    }`}
                    style={isActive ? { backgroundColor: config.color } : {}}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{cat.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive ? "bg-white/25 text-white" : "bg-muted text-muted-foreground"
                    }`}>
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Products Grid ── */}
          <ScrollArea className="flex-1">
            <div className="p-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
              {filteredProducts.map((product) => {
                const catConfig = getCatConfig(product.category);
                const CatIcon = catConfig.icon;
                const isOutOfStock = false; // Allow selling even with zero stock
                const isLowStock = product.min_quantity > 0 && product.quantity <= product.min_quantity && product.quantity > 0;
                const qtyInCart = cartQtyMap[product.id] || 0;

                return (
                  <motion.button
                    key={product.id}
                    whileTap={isOutOfStock ? {} : { scale: 0.95 }}
                    onClick={() => addToCart(product)}
                    disabled={isOutOfStock}
                    className={`relative bg-card rounded-xl p-3 text-center transition-all group overflow-hidden ${
                      isOutOfStock
                        ? "opacity-60 cursor-not-allowed border-2 border-destructive/30"
                        : isLowStock
                        ? "border-2 border-destructive hover:shadow-lg"
                        : "border-2 hover:shadow-lg hover:border-opacity-70"
                    }`}
                    style={{
                      borderColor: isOutOfStock ? undefined : isLowStock ? undefined : catConfig.color + "40",
                    }}
                  >
                    {/* Top color bar */}
                    <div
                      className="absolute top-0 inset-x-0 h-1"
                      style={{ backgroundColor: catConfig.color }}
                    />

                    {/* Cart quantity badge */}
                    {qtyInCart > 0 && (
                      <div className="absolute top-1 left-1 z-10 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow-lg">
                        {qtyInCart}
                      </div>
                    )}

                    {/* Out of stock overlay */}
                    {isOutOfStock && (
                      <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] z-[5] flex items-center justify-center rounded-xl">
                        <span className="text-xs font-bold text-destructive bg-destructive/10 px-3 py-1.5 rounded-full">
                          نفد من المخزون
                        </span>
                      </div>
                    )}

                    {/* Product image or category icon */}
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-12 h-12 mx-auto mb-2 rounded-lg object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div
                      className={`w-12 h-12 mx-auto mb-2 rounded-lg flex items-center justify-center ${product.image_url ? 'hidden' : ''}`}
                      style={{ backgroundColor: catConfig.color + "18" }}
                    >
                      <CatIcon className="h-6 w-6" style={{ color: catConfig.color }} />
                    </div>

                    <p className="text-xs font-medium text-foreground leading-tight line-clamp-2 mb-1 min-h-[2rem]">
                      {product.name}
                    </p>
                    <p className="text-sm font-bold text-primary tabular-nums">₪{product.sell_price.toFixed(2)}</p>

                    {/* Stock indicator */}
                    <div className={`text-[10px] mt-1.5 px-2 py-0.5 rounded-full inline-block ${
                      isOutOfStock
                        ? "bg-destructive/10 text-destructive font-bold"
                        : isLowStock
                        ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 font-medium"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {isOutOfStock ? "نفد" : `${product.quantity} ${product.unit}`}
                    </div>
                  </motion.button>
                );
              })}

              {filteredProducts.length === 0 && (
                <div className="col-span-full py-16 text-center text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">لا توجد منتجات</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── RIGHT: Cart Panel ── */}
        <div className="w-[380px] lg:w-[420px] flex flex-col bg-card shrink-0">
          {/* Cart Header */}
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="font-bold text-sm text-foreground">السلة</span>
              {cartTotals.itemCount > 0 && (
                <Badge className="text-xs bg-primary/10 text-primary border-0">
                  {cartTotals.itemCount}
                </Badge>
              )}
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
                <div className="py-12 px-4 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
                    <ShoppingCart className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">السلة فارغة</p>
                  <p className="text-xs text-muted-foreground/70">اضغط على منتج لإضافته</p>
                  
                  {/* Quick suggestions */}
                  {products.filter(p => p.is_pos_available).slice(0, 3).length > 0 && (
                    <div className="mt-6">
                      <p className="text-[11px] text-muted-foreground/60 mb-2 flex items-center justify-center gap-1">
                        <Zap className="h-3 w-3" />
                        اختصارات سريعة
                      </p>
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {products.filter(p => p.is_pos_available).slice(0, 4).map(p => (
                          <button
                            key={p.id}
                            onClick={() => addToCart(p)}
                            className="px-3 py-1.5 text-[11px] rounded-full bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                cart.map((item, index) => {
                  const product = products.find(p => p.id === item.product_id);
                  const catConfig = product ? getCatConfig(product.category) : DEFAULT_CAT_CONFIG;
                  const CatIcon = catConfig.icon;
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
                      <div className="flex items-start gap-2">
                        {/* Product image/icon */}
                        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: catConfig.color + "18" }}>
                          {product?.image_url ? (
                            <img src={product.image_url} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <CatIcon className="h-5 w-5" style={{ color: catConfig.color }} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={(e) => { e.stopPropagation(); removeFromCart(index); }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-muted-foreground tabular-nums">₪{item.unit_price.toFixed(2)}</span>
                            {item.discount_pct > 0 && (
                              <Badge variant="secondary" className="text-[10px] px-1 h-4">
                                -{item.discount_pct}%
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Qty controls + total */}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-0.5 bg-muted rounded-lg">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); updateCartItem(index, "qty", Math.max(1, item.qty - 1)); }}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm font-bold tabular-nums">{item.qty}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); updateCartItem(index, "qty", item.qty + 1); }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <span className="text-sm font-bold text-primary tabular-nums">= ₪{item.total.toFixed(2)}</span>
                      </div>

                      {/* Item note */}
                      <div className="mt-1.5">
                        <Input
                          value={item.note}
                          onChange={(e) => {
                            e.stopPropagation();
                            setCart(prev => {
                              const updated = [...prev];
                              updated[index] = { ...updated[index], note: e.target.value };
                              return updated;
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="ملاحظة..."
                          className="h-6 text-[11px] bg-muted/30 border-dashed"
                        />
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Order Note */}
          {cart.length > 0 && (
            <div className="px-3 pt-2">
              <div className="flex items-center gap-1.5 mb-1">
                <StickyNote className="h-3 w-3 text-muted-foreground" />
                <label className="text-xs font-medium text-muted-foreground">ملاحظة على الفاتورة</label>
              </div>
              <Input
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder="أضف ملاحظة..."
                className="h-8 text-xs bg-muted/30 border-dashed"
              />
            </div>
          )}

          {/* Totals */}
          <div className="border-t border-border p-3 space-y-1.5 bg-card">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>المجموع الفرعي</span>
              <span className="tabular-nums">₪{cartTotals.subtotal.toFixed(2)}</span>
            </div>
            {cartTotals.tax > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>الضريبة</span>
                <span className="tabular-nums">₪{cartTotals.tax.toFixed(2)}</span>
              </div>
            )}
            {cartTotals.discount > 0 && (
              <div className="flex justify-between text-xs text-destructive">
                <span>الخصم</span>
                <span className="tabular-nums">-₪{cartTotals.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-foreground pt-1.5 border-t border-border">
              <span>الإجمالي</span>
              <span className="text-primary tabular-nums">₪{cartTotals.total.toFixed(2)}</span>
            </div>
          </div>

          {/* ── Action Buttons ── */}
          <div className="p-3 border-t border-border flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={cart.length === 0}
              onClick={() => { setCart([]); setSelectedCartIndex(null); setOrderDiscount(0); setOrderNote(""); }}
              className="text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              مسح
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={cart.length === 0}
              onClick={() => window.print()}
              className="text-xs gap-1"
            >
              <Printer className="h-3.5 w-3.5" />
              طباعة
            </Button>
            <Button
              className="flex-1 h-12 text-base font-bold gap-2 rounded-xl"
              style={{ backgroundColor: "#16A34A" }}
              size="lg"
              disabled={cart.length === 0 || !session}
              onClick={() => setShowPayment(true)}
            >
              <CreditCard className="h-5 w-5" />
              دفع ₪{cartTotals.total.toFixed(2)}
              <span className="text-xs opacity-70 mr-1">F12</span>
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
            <DialogTitle className="text-xl">طريقة الدفع</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Total */}
            <div className="text-center p-5 bg-primary/10 rounded-2xl">
              <p className="text-sm text-muted-foreground">المبلغ المطلوب</p>
              <p className="text-4xl font-bold text-primary mt-1 tabular-nums">₪{cartTotals.total.toFixed(2)}</p>
            </div>

            {/* Payment Methods */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: "cash", label: "نقد", emoji: "💵" },
                { key: "card", label: "شبكة", emoji: "💳" },
                { key: "credit", label: "مختلط", emoji: "🔄" },
              ].map((method) => (
                <button
                  key={method.key}
                  onClick={() => setPaymentMethod(method.key)}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    paymentMethod === method.key
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <span className="text-3xl block mb-1.5">{method.emoji}</span>
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
                    <div className="mt-2 p-2.5 bg-muted/50 rounded-xl space-y-1.5 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>سعر الصرف</span>
                        <span>1 {currencies.find(c => c.code === paymentCurrency)?.symbol} = ₪{exchangeRates[paymentCurrency]?.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between font-medium text-foreground">
                        <span>المطلوب بال{currencies.find(c => c.code === paymentCurrency)?.name}</span>
                        <span>{currencies.find(c => c.code === paymentCurrency)?.symbol}{(cartTotals.total / (exchangeRates[paymentCurrency] || 1)).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">المبلغ المستلم ({currencies.find(c => c.code === paymentCurrency)?.name})</label>
                  <Input
                    type="number"
                    value={tenderedAmount}
                    onChange={(e) => setTenderedAmount(e.target.value)}
                    placeholder={paymentCurrency === "ILS"
                      ? cartTotals.total.toFixed(2)
                      : (cartTotals.total / (exchangeRates[paymentCurrency] || 1)).toFixed(2)}
                    className="h-14 text-xl text-center font-bold"
                    autoFocus
                  />
                  {(() => {
                    const tendered = parseFloat(tenderedAmount) || 0;
                    if (tendered <= 0) return null;
                    const rate = exchangeRates[paymentCurrency] || 1;
                    const tenderedInILS = paymentCurrency === "ILS" ? tendered : tendered * rate;
                    const change = tenderedInILS - cartTotals.total;
                    const curSymbol = currencies.find(c => c.code === paymentCurrency)?.symbol || "";

                    return (
                      <div className="mt-2 p-3 rounded-xl border border-border space-y-2">
                        {paymentCurrency !== "ILS" && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">ما يعادل بالشيكل</span>
                            <span className="font-bold text-foreground tabular-nums">₪{tenderedInILS.toFixed(2)}</span>
                          </div>
                        )}
                        {change >= 0 ? (
                          <div className="flex justify-between text-sm items-center p-2 bg-primary/5 rounded-lg">
                            <span className="text-muted-foreground">الباقي للزبون</span>
                            <span className="text-xl font-bold text-primary tabular-nums">₪{change.toFixed(2)}</span>
                          </div>
                        ) : (
                          <div className="flex justify-between text-sm items-center p-2 bg-destructive/5 rounded-lg">
                            <span className="text-destructive">المبلغ غير كافٍ</span>
                            <span className="text-lg font-bold text-destructive tabular-nums">-₪{Math.abs(change).toFixed(2)}</span>
                          </div>
                        )}
                        {paymentCurrency !== "ILS" && change > 0 && (
                          <div className="flex justify-between text-xs text-muted-foreground border-t border-border pt-1.5">
                            <span>أو الباقي بال{currencies.find(c => c.code === paymentCurrency)?.name}</span>
                            <span className="font-medium tabular-nums">{curSymbol}{(change / rate).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {/* Quick amounts */}
                  <div className="flex gap-2 mt-2">
                    {(paymentCurrency === "ILS"
                      ? [10, 20, 50, 100, 200]
                      : [5, 10, 20, 50, 100]
                    ).map((amt) => {
                      const cur = currencies.find(c => c.code === paymentCurrency);
                      return (
                        <button
                          key={amt}
                          onClick={() => setTenderedAmount(String(amt))}
                          className="flex-1 py-2 text-xs rounded-lg bg-muted hover:bg-primary/10 transition font-medium"
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
              <div className="relative">
                <label className="text-sm font-medium mb-1.5 block">اسم العميل</label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                  <Input
                    value={customerSearch || customerName}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setCustomerName(e.target.value);
                      setShowContactDropdown(true);
                    }}
                    onFocus={() => setShowContactDropdown(true)}
                    placeholder="ابحث عن زبون..."
                    className="h-10 pr-8"
                  />
                </div>
                {showContactDropdown && filteredContacts.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {filteredContacts.map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => {
                          setCustomerName(contact.contact_name);
                          setCustomerSearch("");
                          setShowContactDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-sm text-right hover:bg-muted/50 transition flex items-center gap-2"
                      >
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span>{contact.contact_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={handleCompleteOrder}
              disabled={processing || (paymentMethod === "credit" && !customerName)}
              className="w-full h-14 text-lg font-bold gap-2 rounded-xl"
              style={{ backgroundColor: "#16A34A" }}
            >
              {processing ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle className="h-5 w-5" />
              )}
              {processing ? "جاري المعالجة..." : `إتمام البيع ✅`}
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
                <span className="font-medium tabular-nums">₪{session?.opening_cash.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">إجمالي المبيعات</span>
                <span className="font-medium text-primary tabular-nums">₪{session?.total_sales.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">عدد الطلبات</span>
                <span className="font-medium">{session?.total_orders}</span>
              </div>
              <div className="flex justify-between font-bold pt-2 border-t border-border">
                <span>المتوقع في الصندوق</span>
                <span className="tabular-nums">₪{((session?.opening_cash || 0) + (session?.total_sales || 0)).toFixed(2)}</span>
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
                <div className={`text-center mt-2 p-2 rounded-lg text-sm font-bold ${
                  parseFloat(closingCash) - (session.opening_cash + session.total_sales) === 0
                    ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
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
