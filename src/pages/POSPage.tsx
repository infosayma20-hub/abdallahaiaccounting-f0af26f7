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
  Apple, Zap, Coffee, Box, BarChart3, TrendingUp, PlusCircle, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import POSReceiptDialog from "@/components/POSReceiptDialog";

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

interface OrderTab {
  id: string;
  name: string;
  cart: CartItem[];
  customerName: string;
  orderDiscount: number;
  orderDiscountType: "fixed" | "percent";
  orderNote: string;
  selectedCartIndex: number | null;
}

const createNewOrder = (index: number): OrderTab => ({
  id: crypto.randomUUID(),
  name: `طلب ${index}`,
  cart: [],
  customerName: "",
  orderDiscount: 0,
  orderDiscountType: "fixed",
  orderNote: "",
  selectedCartIndex: null,
});

interface Product {
  id: string;
  name: string;
  sell_price: number;
  buy_price: number;
  quantity: number;
  category: string;
  pos_category_id: string | null;
  unit: string;
  sku: string | null;
  barcode: string | null;
  tax_rate: number;
  is_pos_available: boolean;
  color: string;
  image_url: string | null;
  min_quantity: number;
}

interface POSCategory {
  id: string;
  name: string;
  color: string;
  display_order: number;
  is_active: boolean;
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
const CATEGORY_CONFIG: Record<string, { icon: typeof Package; color: string }> = {
  "طعام": { icon: UtensilsCrossed, color: "#16A34A" },
  "أغذية": { icon: UtensilsCrossed, color: "#16A34A" },
  "مشروبات": { icon: Coffee, color: "#16A34A" },
  "إلكترونيات": { icon: Monitor, color: "#3B82F6" },
  "ملابس": { icon: Shirt, color: "#8B5CF6" },
  "ألعاب": { icon: Gamepad2, color: "#F97316" },
  "بضاعة عامة": { icon: Box, color: "#6B7280" },
  "عام": { icon: Box, color: "#6B7280" },
};

const DEFAULT_CAT_CONFIG = { icon: Package, color: "#6B7280" };

function getCatConfig(category: string) {
  return CATEGORY_CONFIG[category] || DEFAULT_CAT_CONFIG;
}

const POSPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const searchRef = useRef<HTMLInputElement>(null);

  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [posCategories, setPosCategories] = useState<POSCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("الكل");
  const [searchQuery, setSearchQuery] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<{ id: string; contact_name: string }[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  // ── Multi-order tabs ──
  const [orders, setOrders] = useState<OrderTab[]>([createNewOrder(1)]);
  const [activeOrderIndex, setActiveOrderIndex] = useState(0);
  const activeOrder = orders[activeOrderIndex] || orders[0];
  const orderCounter = useRef(1);

  // Derived from active order
  const cart = activeOrder.cart;
  const customerName = activeOrder.customerName;
  const orderDiscount = activeOrder.orderDiscount;
  const orderDiscountType = activeOrder.orderDiscountType;
  const orderNote = activeOrder.orderNote;
  const selectedCartIndex = activeOrder.selectedCartIndex;

  const updateActiveOrder = useCallback((updater: (order: OrderTab) => OrderTab) => {
    setOrders(prev => prev.map((o, i) => i === activeOrderIndex ? updater(o) : o));
  }, [activeOrderIndex]);

  const setCart = useCallback((cartOrFn: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
    updateActiveOrder(o => ({
      ...o,
      cart: typeof cartOrFn === "function" ? cartOrFn(o.cart) : cartOrFn,
    }));
  }, [updateActiveOrder]);

  const setCustomerName = useCallback((name: string) => {
    updateActiveOrder(o => ({ ...o, customerName: name }));
  }, [updateActiveOrder]);

  const setOrderDiscount = useCallback((d: number) => {
    updateActiveOrder(o => ({ ...o, orderDiscount: d }));
  }, [updateActiveOrder]);

  const setOrderDiscountType = useCallback((t: "fixed" | "percent") => {
    updateActiveOrder(o => ({ ...o, orderDiscountType: t }));
  }, [updateActiveOrder]);

  const setOrderNote = useCallback((n: string) => {
    updateActiveOrder(o => ({ ...o, orderNote: n }));
  }, [updateActiveOrder]);

  const setSelectedCartIndex = useCallback((idx: number | null) => {
    updateActiveOrder(o => ({ ...o, selectedCartIndex: idx }));
  }, [updateActiveOrder]);

  const addNewOrder = useCallback(() => {
    orderCounter.current += 1;
    const newOrder = createNewOrder(orderCounter.current);
    setOrders(prev => [...prev, newOrder]);
    setActiveOrderIndex(prev => prev + 1 < orders.length + 1 ? orders.length : prev);
  }, [orders.length]);

  const removeOrder = useCallback((index: number) => {
    if (orders.length <= 1) return;
    setOrders(prev => prev.filter((_, i) => i !== index));
    setActiveOrderIndex(prev => {
      if (prev >= index && prev > 0) return prev - 1;
      return Math.min(prev, orders.length - 2);
    });
  }, [orders.length]);

  // Dialogs
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");

  // New product form
  const PRESET_COLORS = [
    "#16A34A", "#22C55E", "#84CC16", "#EAB308", "#F59E0B",
    "#F97316", "#EF4444", "#DC2626", "#EC4899", "#D946EF",
    "#A855F7", "#8B5CF6", "#6366F1", "#3B82F6", "#0EA5E9",
    "#06B6D4", "#14B8A6", "#10B981", "#6B7280", "#374151",
  ];
  const [newProduct, setNewProduct] = useState({
    name: "", sell_price: "", buy_price: "", category: "", pos_category_id: "" as string, unit: "قطعة",
    quantity: "", min_quantity: "", is_pos_available: true, newCategory: "",
  });
  const [newCategoryColor, setNewCategoryColor] = useState("#16A34A");
  const [showCustomColor, setShowCustomColor] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  // Category management
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#6B7280");
  const [savingCategory, setSavingCategory] = useState(false);
  const [catSearchQuery, setCatSearchQuery] = useState("");
  
  // Payment
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [paymentCurrency, setPaymentCurrency] = useState<string>("ILS");
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [processing, setProcessing] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});

  const currencies = [
    { code: "ILS", symbol: "₪", name: "شيكل", flag: "IL" },
    { code: "USD", symbol: "$", name: "دولار", flag: "US" },
    { code: "JOD", symbol: "د.ا", name: "دينار", flag: "JO" },
    { code: "EUR", symbol: "€", name: "يورو", flag: "EU" },
  ];

  // Receipt
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);

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

      await Promise.all([loadProducts(), loadCategories(), loadExchangeRates(), loadContacts()]);
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
      .select("id, name, sell_price, buy_price, quantity, category, pos_category_id, unit, sku, barcode, tax_rate, is_pos_available, color, image_url, min_quantity")
      .eq("user_id", userId)
      .order("name");

    setProducts(
      (data || []).map((p) => ({
        ...p,
        pos_category_id: (p as any).pos_category_id || null,
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

  const loadCategories = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("pos_categories")
      .select("id, name, color, display_order, is_active")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("display_order");
    setPosCategories((data as POSCategory[]) || []);
  };

  const existingCategories = useMemo(() => {
    const cats = posCategories.map(c => c.name);
    products.forEach(p => {
      if (p.category && !cats.includes(p.category)) cats.push(p.category);
    });
    return cats.sort();
  }, [products, posCategories]);

  const handleSaveCategory = async () => {
    if (!userId || !newCatName.trim() || savingCategory) return;
    setSavingCategory(true);
    try {
      const { error } = await supabase.from("pos_categories").insert({
        user_id: userId,
        name: newCatName.trim(),
        color: newCatColor,
        display_order: posCategories.length,
      });
      if (error) throw error;
      toast.success(`✅ تم إنشاء تصنيف "${newCatName}"`);
      setNewCatName("");
      setNewCatColor("#6B7280");
      await loadCategories();
    } catch (err: any) {
      toast.error("خطأ: " + err.message);
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    if (!userId) return;
    const { error } = await supabase.from("pos_categories").delete().eq("id", catId).eq("user_id", userId);
    if (error) { toast.error("خطأ: " + error.message); return; }
    toast.success("تم حذف التصنيف");
    await loadCategories();
    if (selectedCategory !== "الكل") setSelectedCategory("الكل");
  };

  const handleSaveNewProduct = async () => {
    if (!userId || !newProduct.name.trim() || savingProduct) return;
    
    let finalCategoryId = newProduct.pos_category_id || null;
    let finalCategoryName = "";
    
    if (showNewCategory && newProduct.newCategory.trim()) {
      const { data: newCat, error: catErr } = await supabase.from("pos_categories").insert({
        user_id: userId,
        name: newProduct.newCategory.trim(),
        color: newCategoryColor,
        display_order: posCategories.length,
      }).select().single();
      if (catErr) { toast.error("خطأ في إنشاء التصنيف: " + catErr.message); return; }
      finalCategoryId = (newCat as any).id;
      finalCategoryName = newProduct.newCategory.trim();
    } else if (finalCategoryId) {
      const cat = posCategories.find(c => c.id === finalCategoryId);
      finalCategoryName = cat?.name || newProduct.category;
    } else {
      finalCategoryName = newProduct.category || "عام";
    }

    setSavingProduct(true);
    try {
      const insertData: any = {
        user_id: userId,
        name: newProduct.name.trim(),
        sell_price: Number(newProduct.sell_price) || 0,
        buy_price: Number(newProduct.buy_price) || 0,
        category: finalCategoryName,
        unit: newProduct.unit || "قطعة",
        quantity: Number(newProduct.quantity) || 0,
        min_quantity: Number(newProduct.min_quantity) || 0,
        is_pos_available: newProduct.is_pos_available,
      };
      if (finalCategoryId) insertData.pos_category_id = finalCategoryId;

      const { error } = await supabase.from("products").insert(insertData).select().single();
      if (error) throw error;
      toast.success(`✅ تم إضافة "${newProduct.name}" بنجاح`);
      setShowAddProduct(false);
      setNewProduct({ name: "", sell_price: "", buy_price: "", category: "", pos_category_id: "", unit: "قطعة", quantity: "", min_quantity: "", is_pos_available: true, newCategory: "" });
      setShowNewCategory(false);
      await Promise.all([loadProducts(), loadCategories()]);
    } catch (err: any) {
      toast.error("خطأ: " + err.message);
    } finally {
      setSavingProduct(false);
    }
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

  const categoriesWithCounts = useMemo(() => {
    const posProducts = products.filter(p => p.is_pos_available);
    const totalCount = posProducts.length;
    
    const catCounts: { id: string; name: string; color: string; count: number }[] = posCategories.map(cat => ({
      id: cat.id,
      name: cat.name,
      color: cat.color,
      count: posProducts.filter(p => p.pos_category_id === cat.id || p.category === cat.name).length,
    }));

    const uncategorized = posProducts.filter(p => 
      !p.pos_category_id && !posCategories.some(c => c.name === p.category)
    ).length;

    return { all: totalCount, categories: catCounts, uncategorized };
  }, [products, posCategories]);

  const filteredProducts = useMemo(() => {
    let filtered = products.filter((p) => p.is_pos_available);
    if (selectedCategory === "__uncategorized__") {
      filtered = filtered.filter(p => 
        !p.pos_category_id && !posCategories.some(c => c.name === p.category)
      );
    } else if (selectedCategory !== "الكل") {
      const cat = posCategories.find(c => c.name === selectedCategory);
      filtered = filtered.filter((p) => 
        p.pos_category_id === cat?.id || p.category === selectedCategory
      );
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
  }, [products, selectedCategory, searchQuery, posCategories]);

  const getProductCatColor = useCallback((product: Product) => {
    if (product.pos_category_id) {
      const cat = posCategories.find(c => c.id === product.pos_category_id);
      if (cat) return cat.color;
    }
    const cat = posCategories.find(c => c.name === product.category);
    if (cat) return cat.color;
    return getCatConfig(product.category).color;
  }, [posCategories]);

  // Cart operations
  const addToCart = useCallback((product: Product) => {
    if (product.quantity <= 0) {
      toast.warning(`⚠️ تنبيه: ${product.name} - المخزون صفر، سيتم البيع بالسالب`);
    }
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
        p_payments: [{
          method: paymentMethod,
          amount: cartTotals.total,
          tendered: tendered,
          change: change,
        }],
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

      loadProducts();

      const receiptInfo = {
        orderNumber: res.order_number,
        date: new Date().toISOString(),
        cashierName: session.cashier_name,
        companyName: company?.name || "شركتي",
        terminalName: terminal?.name || "نقطة بيع",
        customerName: customerName,
        items: cart.map(item => ({
          name: item.name,
          qty: item.qty,
          unit_price: item.unit_price,
          discount_pct: item.discount_pct,
          total: item.total,
          note: item.note,
        })),
        subtotal: cartTotals.subtotal,
        tax: cartTotals.tax,
        discount: cartTotals.discount,
        total: cartTotals.total,
        paymentMethod,
        tenderedAmount: tendered,
        change,
        currency: paymentCurrency,
        orderNote,
      };

      setReceiptData(receiptInfo);
      setShowPayment(false);
      setShowReceipt(true);

      // If multiple orders, remove the completed one; otherwise reset it
      if (orders.length > 1) {
        removeOrder(activeOrderIndex);
      } else {
        setCart([]);
        setCustomerName("");
        setOrderDiscount(0);
        setOrderNote("");
        setSelectedCartIndex(null);
      }
      setTenderedAmount("");
      setPaymentMethod("cash");
      setPaymentCurrency("ILS");
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
    setOrders([createNewOrder(1)]);
    setActiveOrderIndex(0);
    orderCounter.current = 1;
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
    <div className="h-screen flex flex-col overflow-hidden pos-container" dir="rtl">
      {/* ══════ TOP BAR ══════ */}
      <header className="h-12 bg-[hsl(222,47%,5%)] flex items-center px-3 gap-2 shrink-0 text-white">
        {/* Back */}
        <button
          onClick={() => navigate("/apps")}
          className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
        </button>

        {/* Company badge */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-primary/20">
          <ShoppingBag className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold">{company?.name || "شركتي"}</span>
        </div>

        {terminal && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/8 text-white/70 text-xs">
            <Monitor className="h-3 w-3" />
            <span>{terminal.name}</span>
          </div>
        )}

        <div className="w-px h-5 bg-white/10 mx-1" />

        {session && (
          <div className="flex items-center gap-3 text-xs text-white/60">
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span>{session.cashier_name}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{new Date(session.opened_at).toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          </div>
        )}

        <div className="flex-1" />

        {/* Sales summary */}
        {session && (
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary/15">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              <span className="text-white/60">مبيعات اليوم:</span>
              <span className="font-bold text-primary tabular-nums">₪{session.total_sales.toFixed(0)}</span>
            </div>
            <span className="text-white/40">{session.total_orders} طلب</span>
          </div>
        )}

        <button
          onClick={() => setShowCloseShift(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors text-xs font-medium"
        >
          <X className="h-3 w-3" />
          إغلاق الوردية
        </button>
      </header>

      {/* ══════ MAIN ══════ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT: Products ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-[hsl(var(--background))]">
          {/* Search Bar */}
          <div className="px-4 py-2.5 border-b border-border">
            <div className="relative max-w-xl">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="البحث عن المنتجات... (F2)"
                className="pr-10 pl-10 h-10 bg-card border-border rounded-xl text-sm shadow-none focus-visible:ring-1 focus-visible:ring-primary/30"
              />
              <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 cursor-pointer hover:text-primary transition-colors" />
            </div>
          </div>

          {/* ── Odoo-Style Category Chips ── */}
          <div className="px-4 py-2 border-b border-border">
            <div className="flex flex-wrap gap-2 items-center">
              {/* All */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedCategory("الكل")}
                className={`h-9 px-4 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                  selectedCategory === "الكل"
                    ? "bg-foreground text-background shadow-md"
                    : "bg-card text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20"
                }`}
              >
                الكل ({categoriesWithCounts.all})
              </motion.button>

              {/* Category chips - Odoo pastel style */}
              {categoriesWithCounts.categories.map((cat) => {
                const isActive = selectedCategory === cat.name;
                return (
                  <motion.button
                    key={cat.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedCategory(cat.name)}
                    className={`h-9 px-4 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 border`}
                    style={{
                      backgroundColor: isActive ? cat.color : cat.color + "20",
                      borderColor: isActive ? cat.color : cat.color + "50",
                      color: isActive ? "#fff" : cat.color,
                      boxShadow: isActive ? `0 2px 8px ${cat.color}40` : "none",
                    }}
                  >
                    {cat.name}
                    {cat.count > 0 && (
                      <span className="mr-1 opacity-75">({cat.count})</span>
                    )}
                  </motion.button>
                );
              })}

              {categoriesWithCounts.uncategorized > 0 && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedCategory("__uncategorized__")}
                  className={`h-9 px-4 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 border ${
                    selectedCategory === "__uncategorized__"
                      ? "bg-muted-foreground text-background border-muted-foreground shadow-md"
                      : "bg-card text-muted-foreground border-border hover:border-muted-foreground/30"
                  }`}
                >
                  أخرى ({categoriesWithCounts.uncategorized})
                </motion.button>
              )}

              {/* Management buttons */}
              <button
                onClick={() => setShowCategoryManager(true)}
                className="h-9 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-all border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5"
              >
                <Plus className="h-3 w-3 inline-block ml-0.5" />
                تصنيف
              </button>
              <button
                onClick={() => setShowAddProduct(true)}
                className="h-9 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-all border-2 border-dashed border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50"
              >
                <PlusCircle className="h-3 w-3 inline-block ml-0.5" />
                منتج
              </button>
            </div>
          </div>

          {/* ── Products Grid ── */}
          <ScrollArea className="flex-1">
            <div className="p-4 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
              <AnimatePresence mode="popLayout">
                {filteredProducts.map((product) => {
                  const productColor = getProductCatColor(product);
                  const catConfig = getCatConfig(product.category);
                  const CatIcon = catConfig.icon;
                  const isLowStock = product.min_quantity > 0 && product.quantity <= product.min_quantity && product.quantity > 0;
                  const qtyInCart = cartQtyMap[product.id] || 0;

                  return (
                    <motion.button
                      key={product.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      whileHover={{ y: -2, boxShadow: "0 8px 25px -5px rgba(0,0,0,0.15)" }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => addToCart(product)}
                      className="relative bg-card rounded-xl overflow-hidden text-center transition-all group border border-border hover:border-opacity-60"
                      style={{
                        borderBottomWidth: "3px",
                        borderBottomColor: productColor + "60",
                      }}
                    >
                      {/* Cart qty badge */}
                      <AnimatePresence>
                        {qtyInCart > 0 && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            className="absolute top-1.5 left-1.5 z-10 min-w-[22px] h-[22px] rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center px-1 shadow-lg"
                          >
                            {qtyInCart}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Low stock indicator */}
                      {isLowStock && (
                        <div className="absolute top-1.5 right-1.5 z-10">
                          <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                        </div>
                      )}

                      {/* Product visual */}
                      <div className="p-3 pb-2">
                        {product.image_url ? (
                          <div className="w-full aspect-square rounded-lg overflow-hidden mb-2 bg-muted/30">
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                            <div className="hidden w-full h-full flex items-center justify-center" style={{ backgroundColor: productColor + "12" }}>
                              <CatIcon className="h-8 w-8" style={{ color: productColor }} />
                            </div>
                          </div>
                        ) : (
                          <div
                            className="w-full aspect-square rounded-lg flex items-center justify-center mb-2 transition-colors"
                            style={{ backgroundColor: productColor + "10" }}
                          >
                            <CatIcon className="h-8 w-8 transition-transform duration-200 group-hover:scale-110" style={{ color: productColor + "80" }} />
                          </div>
                        )}

                        {/* Name */}
                        <p className="text-[13px] font-medium text-foreground leading-tight line-clamp-2 min-h-[2.4em] mb-1.5">
                          {product.name}
                        </p>

                        {/* Price */}
                        <p className="text-sm font-bold text-primary tabular-nums">
                          ₪{product.sell_price.toFixed(2)}
                        </p>

                        {/* Stock */}
                        <div className="text-[10px] mt-1 tabular-nums text-muted-foreground/60">
                          {product.unit}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </AnimatePresence>

              {filteredProducts.length === 0 && (
                <div className="col-span-full py-20 text-center text-muted-foreground">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium mb-1">ابدأ بإضافة المنتجات</p>
                  <p className="text-xs text-muted-foreground/60">لا توجد منتجات في هذا التصنيف</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── RIGHT: Order Panel ── */}
        <div className="w-[340px] lg:w-[380px] flex flex-col bg-card border-r border-border shrink-0">
          {/* Order Tabs */}
          <div className="flex items-center border-b border-border shrink-0 overflow-x-auto">
            {orders.map((order, idx) => {
              const isActive = idx === activeOrderIndex;
              const itemCount = order.cart.reduce((s, i) => s + i.qty, 0);
              return (
                <button
                  key={order.id}
                  onClick={() => setActiveOrderIndex(idx)}
                  className={`group relative flex items-center gap-1.5 px-3 h-11 text-xs font-medium whitespace-nowrap transition-all border-b-2 ${
                    isActive
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <ShoppingCart className="h-3 w-3" />
                  <span>{order.name}</span>
                  {itemCount > 0 && (
                    <span className={`text-[10px] font-bold rounded-full px-1.5 py-0 ${
                      isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {itemCount}
                    </span>
                  )}
                  {orders.length > 1 && (
                    <span
                      onClick={(e) => { e.stopPropagation(); removeOrder(idx); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-destructive transition-all mr-0.5"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => {
                orderCounter.current += 1;
                const newOrder = createNewOrder(orderCounter.current);
                setOrders(prev => [...prev, newOrder]);
                setActiveOrderIndex(orders.length);
              }}
              className="h-11 px-2.5 flex items-center justify-center text-muted-foreground/50 hover:text-primary hover:bg-primary/5 transition-colors shrink-0"
              title="طلب جديد"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Cart Header */}
          <div className="h-10 px-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              {activeOrder.customerName ? (
                <span className="text-xs font-medium text-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {activeOrder.customerName}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/60">بدون زبون</span>
              )}
            </div>
            {cart.length > 0 && (
              <button
                onClick={() => { setCart([]); setSelectedCartIndex(null); setOrderDiscount(0); setOrderNote(""); }}
                className="text-[11px] text-destructive/70 hover:text-destructive transition-colors flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
                إفراغ
              </button>
            )}
          </div>

          {/* Cart Items */}
          <ScrollArea className="flex-1">
            <div className="p-2">
              {cart.length === 0 ? (
                <div className="py-16 text-center">
                  <ShoppingCart className="h-16 w-16 mx-auto mb-4 text-muted-foreground/15" />
                  <p className="text-sm font-medium text-muted-foreground/60">ابدأ بإضافة المنتجات</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {cart.map((item, index) => {
                    const product = products.find(p => p.id === item.product_id);
                    const catConfig = product ? getCatConfig(product.category) : DEFAULT_CAT_CONFIG;
                    const CatIcon = catConfig.icon;
                    const isSelected = selectedCartIndex === index;
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`p-2.5 rounded-lg transition-all cursor-pointer ${
                          isSelected
                            ? "bg-primary/5 ring-1 ring-primary/20"
                            : "hover:bg-muted/40"
                        }`}
                        onClick={() => setSelectedCartIndex(isSelected ? null : index)}
                      >
                        <div className="flex items-start gap-2.5">
                          {/* Thumbnail */}
                          <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: catConfig.color + "12" }}>
                            {product?.image_url ? (
                              <img src={product.image_url} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <CatIcon className="h-4 w-4" style={{ color: catConfig.color + "80" }} />
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <p className="text-[13px] font-semibold text-foreground truncate leading-tight">{item.name}</p>
                              <button
                                className="p-0.5 text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                                onClick={(e) => { e.stopPropagation(); removeFromCart(index); }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => { e.stopPropagation(); updateCartItem(index, "unit_price", Math.max(0, Number(e.target.value))); }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-14 text-[11px] tabular-nums bg-transparent border-b border-dashed border-border text-muted-foreground outline-none focus:border-primary/40 py-0 px-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                min={0}
                                step={0.01}
                              />
                              <span className="text-[10px] text-muted-foreground/50">₪</span>
                              {item.discount_pct > 0 && (
                                <span className="text-[10px] text-destructive/70 font-medium">-{item.discount_pct}%</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Qty + total */}
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center bg-muted/60 rounded-lg overflow-hidden">
                            <button
                              className="h-7 w-7 flex items-center justify-center hover:bg-muted transition-colors"
                              onClick={(e) => { e.stopPropagation(); updateCartItem(index, "qty", Math.max(1, item.qty - 1)); }}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-8 text-center text-xs font-bold tabular-nums">{item.qty}</span>
                            <button
                              className="h-7 w-7 flex items-center justify-center hover:bg-muted transition-colors"
                              onClick={(e) => { e.stopPropagation(); updateCartItem(index, "qty", item.qty + 1); }}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <motion.span
                            key={item.total}
                            initial={{ scale: 1.1, color: "hsl(var(--primary))" }}
                            animate={{ scale: 1, color: "hsl(var(--foreground))" }}
                            className="text-sm font-bold tabular-nums"
                          >
                            ₪{item.total.toFixed(2)}
                          </motion.span>
                        </div>

                        {/* Note (expandable) */}
                        {isSelected && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            className="mt-2"
                          >
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
                              className="h-7 text-[11px] bg-muted/30 border-dashed border-border"
                            />
                          </motion.div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Bottom area - Customer + Note + Totals + Actions */}
          <div className="border-t border-border bg-card shrink-0">
            {/* Customer & Note row */}
            {cart.length > 0 && (
              <div className="px-3 pt-2 pb-1 flex items-center gap-2 text-xs">
                <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground transition-colors">
                  <User className="h-3 w-3" />
                  العميل
                </button>
                <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground transition-colors">
                  <StickyNote className="h-3 w-3" />
                  الملاحظات
                </button>
              </div>
            )}

            {/* Totals */}
            <div className="px-3 py-2 space-y-1">
              {cartTotals.tax > 0 && (
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>الضريبة</span>
                  <span className="tabular-nums">₪{cartTotals.tax.toFixed(2)}</span>
                </div>
              )}
              {cartTotals.discount > 0 && (
                <div className="flex justify-between text-[11px] text-destructive/70">
                  <span>الخصم</span>
                  <span className="tabular-nums">-₪{cartTotals.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-1">
                <span className="text-sm text-muted-foreground">الإجمالي</span>
                <motion.span
                  key={cartTotals.total}
                  initial={{ scale: 1.05 }}
                  animate={{ scale: 1 }}
                  className="text-2xl font-bold text-primary tabular-nums"
                >
                  ₪{cartTotals.total.toFixed(2)}
                </motion.span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="p-3 pt-0 flex gap-2">
              <button
                disabled={cart.length === 0}
                onClick={() => { setCart([]); setSelectedCartIndex(null); setOrderDiscount(0); setOrderNote(""); }}
                className="h-11 w-11 rounded-xl flex items-center justify-center border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 transition-all disabled:opacity-30 disabled:pointer-events-none"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                disabled={cart.length === 0}
                onClick={() => window.print()}
                className="h-11 w-11 rounded-xl flex items-center justify-center border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-30 disabled:pointer-events-none"
              >
                <Printer className="h-4 w-4" />
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                className="flex-1 h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 text-white transition-all disabled:opacity-40 disabled:pointer-events-none"
                style={{ backgroundColor: cart.length > 0 ? "#16A34A" : "hsl(var(--muted))" }}
                disabled={cart.length === 0 || !session}
                onClick={() => setShowPayment(true)}
              >
                <span className="text-xs bg-white/20 rounded px-1.5 py-0.5 font-mono">F12</span>
                دفع ₪{cartTotals.total.toFixed(2)}
                <Printer className="h-4 w-4 opacity-70" />
              </motion.button>
            </div>
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
            <DialogTitle className="text-lg font-bold">طريقة الدفع</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Total display */}
            <div className="text-center py-5 px-4 bg-primary/8 rounded-2xl border border-primary/10">
              <p className="text-xs text-muted-foreground mb-1">المبلغ المطلوب</p>
              <motion.p
                key={cartTotals.total}
                initial={{ scale: 1.05 }}
                animate={{ scale: 1 }}
                className="text-4xl font-bold text-primary tabular-nums"
              >
                ₪{cartTotals.total.toFixed(2)}
              </motion.p>
            </div>

            {/* Payment methods */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: "cash", label: "نقد", icon: Banknote, color: "#16A34A" },
                { key: "card", label: "شبكة", icon: CreditCard, color: "#3B82F6" },
                { key: "credit", label: "آجل", icon: Receipt, color: "#F59E0B" },
              ].map((m) => {
                const isActive = paymentMethod === m.key;
                return (
                  <motion.button
                    key={m.key}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setPaymentMethod(m.key)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 ${
                      isActive
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-card hover:border-muted-foreground/20"
                    }`}
                  >
                    <m.icon className="h-6 w-6" style={{ color: isActive ? m.color : "hsl(var(--muted-foreground))" }} />
                    <span className={`text-xs font-semibold ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{m.label}</span>
                  </motion.button>
                );
              })}
            </div>

            {/* Tendered amount for cash */}
            {paymentMethod === "cash" && (
              <div className="space-y-3">
                {/* Currency selector */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground text-left">العملة</p>
                  <div className="grid grid-cols-4 gap-2">
                    {currencies.map((cur) => {
                      const isActive = paymentCurrency === cur.code;
                      return (
                        <motion.button
                          key={cur.code}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => setPaymentCurrency(cur.code)}
                          className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all ${
                            isActive
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/20"
                          }`}
                        >
                          <span className="text-sm font-bold">{cur.flag}</span>
                          <span className={`text-[11px] font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{cur.name}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Exchange rate info */}
                {paymentCurrency !== "ILS" && exchangeRates[paymentCurrency] && (
                  <div className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-muted/50 border border-border">
                    <div>
                      <span className="text-muted-foreground">سعر الصرف</span>
                    </div>
                    <div className="text-left">
                      <span className="font-medium tabular-nums">
                        {currencies.find(c => c.code === paymentCurrency)?.symbol}1 = ₪{exchangeRates[paymentCurrency]?.toFixed(4)}
                      </span>
                      <div className="text-muted-foreground">
                        المطلوب بال{currencies.find(c => c.code === paymentCurrency)?.name}:{" "}
                        <span className="font-bold text-foreground tabular-nums">
                          {currencies.find(c => c.code === paymentCurrency)?.symbol}
                          {(cartTotals.total / (exchangeRates[paymentCurrency] || 1)).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Amount input */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground text-left">
                    المبلغ المستلم ({currencies.find(c => c.code === paymentCurrency)?.name})
                  </p>
                  <Input
                    type="number"
                    value={tenderedAmount}
                    onChange={(e) => setTenderedAmount(e.target.value)}
                    placeholder={(cartTotals.total / (exchangeRates[paymentCurrency] || 1)).toFixed(2)}
                    className="text-xl h-14 text-center font-bold tabular-nums"
                    autoFocus
                  />
                </div>

                {/* Change calculation */}
                {(() => {
                  const tendered = parseFloat(tenderedAmount) || 0;
                  if (tendered <= 0) return null;
                  const rate = exchangeRates[paymentCurrency] || 1;
                  const tenderedInILS = paymentCurrency === "ILS" ? tendered : tendered * rate;
                  const change = tenderedInILS - cartTotals.total;
                  const curSymbol = currencies.find(c => c.code === paymentCurrency)?.symbol || "";

                  return (
                    <div className="p-3 rounded-xl border border-border space-y-2">
                      {paymentCurrency !== "ILS" && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">ما يعادل بالشيكل</span>
                          <span className="font-bold tabular-nums">₪{tenderedInILS.toFixed(2)}</span>
                        </div>
                      )}
                      {change >= 0 ? (
                        <div className="flex justify-between items-center p-2.5 bg-primary/5 rounded-lg">
                          <span className="text-xs text-muted-foreground">الباقي للزبون</span>
                          <span className="text-xl font-bold text-primary tabular-nums">₪{change.toFixed(2)}</span>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center p-2.5 bg-destructive/5 rounded-lg">
                          <span className="text-xs text-destructive">المبلغ غير كافٍ</span>
                          <span className="text-lg font-bold text-destructive tabular-nums">-₪{Math.abs(change).toFixed(2)}</span>
                        </div>
                      )}
                      {paymentCurrency !== "ILS" && change > 0 && (
                        <div className="flex justify-between text-[11px] text-muted-foreground border-t border-border pt-1.5">
                          <span>أو الباقي بال{currencies.find(c => c.code === paymentCurrency)?.name}</span>
                          <span className="font-medium tabular-nums">{curSymbol}{(change / rate).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Quick amounts */}
                <div className="flex gap-2">
                  {(paymentCurrency === "ILS"
                    ? [10, 20, 50, 100, 200]
                    : [5, 10, 20, 50, 100]
                  ).map((amt) => {
                    const cur = currencies.find(c => c.code === paymentCurrency);
                    return (
                      <button
                        key={amt}
                        onClick={() => setTenderedAmount(String(amt))}
                        className="flex-1 py-2 text-xs rounded-lg bg-muted/60 hover:bg-primary/10 hover:text-primary transition-all font-medium tabular-nums"
                      >
                        {cur?.symbol}{amt}
                      </button>
                    );
                  })}
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

          {/* Complete sale button */}
          <motion.div whileTap={{ scale: 0.98 }}>
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
              {processing ? "جاري المعالجة..." : "إتمام البيع ✅"}
            </Button>
          </motion.div>
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
                    ? "bg-primary/10 text-primary"
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

      {/* ── Add Product Dialog ── */}
      <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <PlusCircle className="h-5 w-5 text-primary" />
              إضافة منتج جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">اسم المنتج *</label>
              <Input
                autoFocus
                value={newProduct.name}
                onChange={(e) => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                placeholder="مثال: شوكولاته"
                className="h-10"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">سعر البيع *</label>
                <Input type="number" value={newProduct.sell_price} onChange={(e) => setNewProduct(prev => ({ ...prev, sell_price: e.target.value }))} placeholder="₪0.00" className="h-10" min={0} step={0.01} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">سعر الشراء</label>
                <Input type="number" value={newProduct.buy_price} onChange={(e) => setNewProduct(prev => ({ ...prev, buy_price: e.target.value }))} placeholder="₪0.00" className="h-10" min={0} step={0.01} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" />
                فئة نقطة البيع
              </label>
              {!showNewCategory ? (
                <div className="flex gap-2">
                  <select
                    value={newProduct.pos_category_id}
                    onChange={(e) => {
                      const catId = e.target.value;
                      const cat = posCategories.find(c => c.id === catId);
                      setNewProduct(prev => ({ ...prev, pos_category_id: catId, category: cat?.name || "" }));
                    }}
                    className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">— بدون تصنيف —</option>
                    {posCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setShowNewCategory(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input autoFocus value={newProduct.newCategory} onChange={(e) => setNewProduct(prev => ({ ...prev, newCategory: e.target.value }))} placeholder="اسم التصنيف الجديد..." className="h-10" />
                    <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => { setShowNewCategory(false); setShowCustomColor(false); setNewProduct(prev => ({ ...prev, newCategory: "" })); setNewCategoryColor("#16A34A"); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground mb-1.5 block">اللون</span>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_COLORS.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => { setNewCategoryColor(color); setShowCustomColor(false); }}
                          className="w-7 h-7 rounded-md border-2 transition-all duration-150 hover:scale-110"
                          style={{
                            backgroundColor: color,
                            borderColor: newCategoryColor === color ? "#000" : "transparent",
                            boxShadow: newCategoryColor === color ? "0 0 0 2px white, 0 0 0 4px " + color : "none",
                          }}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowCustomColor(!showCustomColor)}
                        className="w-7 h-7 rounded-md border-2 border-dashed border-muted-foreground/40 flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {showCustomColor && (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="color"
                          value={newCategoryColor}
                          onChange={(e) => setNewCategoryColor(e.target.value)}
                          className="w-10 h-8 rounded cursor-pointer border-0 p-0"
                        />
                        <span className="text-xs text-muted-foreground font-mono">{newCategoryColor}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">الوحدة</label>
              <select
                value={newProduct.unit}
                onChange={(e) => setNewProduct(prev => ({ ...prev, unit: e.target.value }))}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="قطعة">قطعة</option>
                <option value="كغ">كغ</option>
                <option value="لتر">لتر</option>
                <option value="متر">متر</option>
                <option value="علبة">علبة</option>
                <option value="كرتون">كرتون</option>
              </select>
            </div>
            <div className="p-3 rounded-xl bg-muted/50 border border-border space-y-3">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-primary" />
                ربط مع المخزون
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">الكمية الافتتاحية</label>
                  <Input type="number" value={newProduct.quantity} onChange={(e) => setNewProduct(prev => ({ ...prev, quantity: e.target.value }))} placeholder="0" className="h-9 text-sm" min={0} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">الحد الأدنى للتنبيه</label>
                  <Input type="number" value={newProduct.min_quantity} onChange={(e) => setNewProduct(prev => ({ ...prev, min_quantity: e.target.value }))} placeholder="0" className="h-9 text-sm" min={0} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowAddProduct(false)} className="flex-1">إلغاء</Button>
            <Button onClick={handleSaveNewProduct} disabled={!newProduct.name.trim() || savingProduct} className="flex-1 gap-1">
              {savingProduct ? "جارِ الحفظ..." : "حفظ وإضافة ✓"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Category Manager Dialog ── */}
      <Dialog open={showCategoryManager} onOpenChange={setShowCategoryManager}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Tag className="h-5 w-5 text-primary" />
              إدارة التصنيفات
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">اسم التصنيف الجديد</label>
                <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveCategory()} placeholder="مثال: حلويات" className="h-10" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">اللون</label>
                <input type="color" value={newCatColor} onChange={(e) => setNewCatColor(e.target.value)} className="h-10 w-12 rounded-md border border-input cursor-pointer" />
              </div>
              <Button onClick={handleSaveCategory} disabled={!newCatName.trim() || savingCategory} className="h-10">
                {savingCategory ? "..." : "إنشاء"}
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={catSearchQuery} onChange={(e) => setCatSearchQuery(e.target.value)} placeholder="بحث..." className="pr-10 h-9 text-sm" />
            </div>
            <ScrollArea className="max-h-[350px]">
              <div className="space-y-1">
                {posCategories
                  .filter(c => !catSearchQuery || c.name.toLowerCase().includes(catSearchQuery.toLowerCase()))
                  .map((cat) => {
                    const count = products.filter(p => p.is_pos_available && (p.pos_category_id === cat.id || p.category === cat.name)).length;
                    return (
                      <div key={cat.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border hover:bg-muted/50 group">
                        <div className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-md shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="text-sm font-medium">{cat.name}</span>
                          <span className="text-xs text-muted-foreground">({count} منتج)</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteCategory(cat.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                {posCategories.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Tag className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">لا توجد تصنيفات بعد</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryManager(false)} className="w-full">إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Receipt Dialog ── */}
      <POSReceiptDialog open={showReceipt} onOpenChange={setShowReceipt} data={receiptData} />
    </div>
  );
};

export default POSPage;
