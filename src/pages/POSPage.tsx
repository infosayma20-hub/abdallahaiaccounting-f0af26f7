import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  Eye, EyeOff, UserCheck, LayoutGrid, Grid3X3, Grid2X2, GripVertical,
} from "lucide-react";
import TableSelectorBar, { type TableBarItem } from "@/components/pos/TableSelectorBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import POSReceiptDialog from "@/components/POSReceiptDialog";
import ShiftSummaryReceipt from "@/components/ShiftSummaryReceipt";
import CustomerDataModal from "@/components/pos/CustomerDataModal";
import ModifierModal, { type SelectedModifier } from "@/components/pos/ModifierModal";
import QuickModifierBar from "@/components/pos/QuickModifierBar";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  modifiers?: SelectedModifier[];
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
  tableId: string | null;
  tableName: string | null;
  guestCount: number;
  guestName: string;
}

const createNewOrder = (index: number, tableId?: string | null, tableName?: string | null, guestCount?: number, guestName?: string): OrderTab => ({
  id: crypto.randomUUID(),
  name: tableName ? `${tableName}` : `طلب ${index}`,
  cart: [],
  customerName: guestName || "",
  orderDiscount: 0,
  orderDiscountType: "fixed",
  orderNote: "",
  selectedCartIndex: null,
  tableId: tableId || null,
  tableName: tableName || null,
  guestCount: guestCount || 1,
  guestName: guestName || "",
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

// ── Sortable Category Chip ──
const SortableCategoryChip = ({ cat, isActive, isSortMode, isDragging, onClick }: {
  cat: { id: string; name: string; color: string; count: number };
  isActive: boolean;
  isSortMode: boolean;
  isDragging: boolean;
  onClick: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: cat.id,
    disabled: !isSortMode,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    backgroundColor: isActive ? cat.color : cat.color + "20",
    borderColor: isSortMode ? "hsl(var(--primary))" : isActive ? cat.color : cat.color + "50",
    color: isActive ? "#fff" : "#1E293B",
    boxShadow: isDragging ? "0 8px 25px rgba(0,0,0,0.2)" : isActive ? `0 2px 8px ${cat.color}40` : "none",
    borderStyle: isSortMode ? "dashed" as const : "solid" as const,
    cursor: isSortMode ? "grab" as const : "pointer" as const,
  };
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...(isSortMode ? listeners : {})}
      onClick={onClick}
      className={`h-9 px-4 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 border select-none ${
        isSortMode ? "ring-1 ring-amber-400/50" : ""
      }`}
      style={style}
    >
      {isSortMode && <GripVertical className="h-3 w-3 inline-block ml-1 opacity-60" />}
      {cat.name}
      {cat.count > 0 && <span className="mr-1 opacity-75">({cat.count})</span>}
    </button>
  );
};

// ── Sortable Product Card wrapper ──
const SortableProductCard = ({ id, children, isSortMode }: {
  id: string;
  children: (props: { isDragging: boolean; style: React.CSSProperties; ref: (el: HTMLElement | null) => void; listeners: any; attributes: any }) => React.ReactNode;
  isSortMode: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !isSortMode,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 999 : "auto",
  };
  return <>{children({ isDragging, style, ref: setNodeRef, listeners: isSortMode ? listeners : {}, attributes })}</>;
};

const POSPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const searchRef = useRef<HTMLInputElement>(null);

  // URL params for table context
  const urlTableId = searchParams.get("table_id");
  const urlTableName = searchParams.get("table_name");
  const urlGuests = parseInt(searchParams.get("guests") || "1");
  const urlGuestName = decodeURIComponent(searchParams.get("guest_name") || "");
  const urlOrderId = searchParams.get("order_id");
  const urlAction = searchParams.get("action"); // e.g. "pay"
  const orderLoadedRef = useRef(false);

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
  const [showSalesSummary, setShowSalesSummary] = useState(true);
  const [cardSize, setCardSize] = useState<"S" | "M" | "L">(() => {
    return (localStorage.getItem("pos-card-size") as "S" | "M" | "L") || "M";
  });

  // Employee account payment
  const [employees, setEmployees] = useState<{ id: string; full_name: string; base_salary: number }[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; full_name: string } | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [employeeBalance, setEmployeeBalance] = useState(0);

  // Sort mode
  const [isSortMode, setIsSortMode] = useState(false);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 400, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 5 } })
  );

  // ── Multi-order tabs ──
  const [orders, setOrders] = useState<OrderTab[]>([createNewOrder(1, urlTableId, urlTableName, urlGuests, urlGuestName)]);
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

  // Bottom panel toggles
  const [showCustomerInput, setShowCustomerInput] = useState(false);
  const [showOrderNoteInput, setShowOrderNoteInput] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [availableTables, setAvailableTables] = useState<{ id: string; name: string; seats: number; status: string; section_name: string }[]>([]);

  // Dialogs
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showCustomerDataModal, setShowCustomerDataModal] = useState(false);
  const [customerDataDiscount, setCustomerDataDiscount] = useState<{
    discountPct: number; discountAmount: number; customerId: string | null;
    contactType: string; contactValue: string; customerName: string;
  } | null>(null);
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
  const [exchangeRateDetails, setExchangeRateDetails] = useState<Record<string, { rate: number; date: string; source: string; posOverride: number | null }>>({});
  const [editedRate, setEditedRate] = useState<number | null>(null);
  const [rateEdited, setRateEdited] = useState(false);

  const currencies = [
    { code: "ILS", symbol: "₪", name: "شيكل", flag: "IL" },
    { code: "USD", symbol: "$", name: "دولار", flag: "US" },
    { code: "JOD", symbol: "د.ا", name: "دينار", flag: "JO" },
    { code: "EUR", symbol: "€", name: "يورو", flag: "EU" },
    { code: "EGP", symbol: "ج.م", name: "جنيه", flag: "EG" },
  ];

  // Receipt
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);

  // Kitchen
  const [showKitchenTicket, setShowKitchenTicket] = useState(false);
  const [kitchenTicketData, setKitchenTicketData] = useState<any>(null);
  const [savingToTable, setSavingToTable] = useState(false);

   // Shift Summary
   const [showShiftSummary, setShowShiftSummary] = useState(false);
   const [shiftSummaryData, setShiftSummaryData] = useState<any>(null);

   // Modifiers
   const [modifierGroups, setModifierGroups] = useState<any[]>([]);
   const [productModifierMap, setProductModifierMap] = useState<Record<string, string[]>>({});
   const [showModifierModal, setShowModifierModal] = useState(false);
   const [modifierProduct, setModifierProduct] = useState<Product | null>(null);
   const [activeQuickMod, setActiveQuickMod] = useState<string | null>(null);

   const userId = user?.id;
   const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
   const isAdmin = userId === dataOwnerId; // Employee has different dataOwnerId

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

  // Resolve team owner ID for multi-tenant data access
  useEffect(() => {
    if (!userId) return;
    supabase.rpc("get_team_owner_id", { _user_id: userId }).then(({ data }) => {
      setDataOwnerId(data || userId);
    });
  }, [userId]);

  // Initialize
  useEffect(() => {
    if (!userId || !dataOwnerId) return;
    initializePOS();
  }, [userId, dataOwnerId]);

  // Auto-load order from URL params (when coming from floor plan)
  useEffect(() => {
    if (!urlTableId || !urlOrderId || loading || orderLoadedRef.current) return;
    orderLoadedRef.current = true;
    
    const loadOrderFromUrl = async () => {
      try {
        const { data: orderData } = await supabase
          .from("pos_orders")
          .select("id, guest_count, guest_name, customer_name, subtotal, total, discount_amount, tax_amount")
          .eq("id", urlOrderId)
          .maybeSingle();

        if (!orderData) return;

        const { data: lines } = await supabase
          .from("pos_order_lines")
          .select("*")
          .eq("order_id", orderData.id);

        if (!lines || lines.length === 0) return;

        const cartItems: CartItem[] = lines.map((line: any) => ({
          id: crypto.randomUUID(),
          product_id: line.product_id,
          name: line.product_name,
          qty: line.qty,
          unit_price: Number(line.unit_price),
          cost_price: Number(line.cost_price) || 0,
          discount_pct: Number(line.discount_pct) || 0,
          tax_rate: Number(line.tax_rate) || 0,
          unit: line.unit || "قطعة",
          total: Number(line.total),
          note: "",
        }));

        setOrders(prev => prev.map((o, i) => i === 0 ? {
          ...o,
          cart: cartItems,
          tableId: urlTableId,
          tableName: urlTableName || o.tableName,
          guestCount: (orderData as any).guest_count || 1,
          guestName: (orderData as any).guest_name || "",
          customerName: orderData.customer_name || "",
        } : o));

        // If action is "pay", auto-open payment dialog
        if (urlAction === "pay" && cartItems.length > 0) {
          setTimeout(() => setShowPayment(true), 500);
        }
      } catch (err) {
        console.error("Error loading order from URL:", err);
      }
    };

    loadOrderFromUrl();
  }, [urlTableId, urlOrderId, urlTableName, urlAction, loading]);

  const initializePOS = async () => {
    if (!userId || !dataOwnerId) return;
    setLoading(true);
    try {
      let { data: companies } = await supabase
        .from("pos_companies")
        .select("*")
        .eq("user_id", dataOwnerId)
        .limit(1);

      let comp = companies?.[0];
      if (!comp) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_name, display_name")
          .eq("user_id", dataOwnerId)
          .single();

        const { data: newComp } = await supabase
          .from("pos_companies")
          .insert({
            user_id: dataOwnerId,
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
          .eq("user_id", dataOwnerId)
          .eq("company_id", comp.id)
          .limit(1);

        let term = terminals?.[0];
        if (!term) {
          const { data: newTerm } = await supabase
            .from("pos_terminals")
            .insert({
              user_id: dataOwnerId,
              company_id: comp.id,
              name: "نقطة بيع 1",
            })
            .select()
            .single();
          term = newTerm;
        }
        setTerminal(term ? { id: term.id, name: term.name, company_id: term.company_id } : null);

        const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";
        const { data: sessions } = await supabase
          .from("pos_sessions")
          .select("*")
          .eq("user_id", dataOwnerId)
          .eq("state", "open")
          .eq("cashier_name", displayName)
          .order("opened_at", { ascending: false })
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

      await Promise.all([loadProducts(), loadCategories(), loadExchangeRates(), loadContacts(), loadEmployees(), loadModifiers()]);
    } catch (err) {
      console.error("POS init error:", err);
      toast.error("خطأ في تحميل نقطة البيع");
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    if (!dataOwnerId) return;
    const { data } = await supabase
      .from("products")
      .select("id, name, sell_price, buy_price, quantity, category, pos_category_id, unit, sku, barcode, tax_rate, is_pos_available, color, image_url, min_quantity, sort_order")
      .eq("user_id", dataOwnerId)
      .order("sort_order")
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
    if (!dataOwnerId) return;
    const { data } = await supabase
      .from("pos_categories")
      .select("id, name, color, display_order, is_active")
      .eq("user_id", dataOwnerId)
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
    if (!userId || !dataOwnerId || !isAdmin || !newCatName.trim() || savingCategory) return;
    setSavingCategory(true);
    try {
      const { error } = await supabase.from("pos_categories").insert({
        user_id: dataOwnerId,
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
    if (!dataOwnerId || !isAdmin) return;
    const { error } = await supabase.from("pos_categories").delete().eq("id", catId).eq("user_id", dataOwnerId);
    if (error) { toast.error("خطأ: " + error.message); return; }
    toast.success("تم حذف التصنيف");
    await loadCategories();
    if (selectedCategory !== "الكل") setSelectedCategory("الكل");
  };

  const handleSaveNewProduct = async () => {
    if (!userId || !dataOwnerId || !isAdmin || !newProduct.name.trim() || savingProduct) return;
    
    let finalCategoryId = newProduct.pos_category_id || null;
    let finalCategoryName = "";
    
    if (showNewCategory && newProduct.newCategory.trim()) {
      const { data: newCat, error: catErr } = await supabase.from("pos_categories").insert({
        user_id: dataOwnerId,
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
        user_id: dataOwnerId,
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
    if (!dataOwnerId) return;
    const { data } = await supabase
      .from("exchange_rates")
      .select("currency_id, mid_rate, sell_rate, buy_rate, rate_date, source, pos_rate_override, allow_pos_edit, currencies!inner(code)")
      .eq("user_id", dataOwnerId)
      .order("rate_date", { ascending: false });

    const rates: Record<string, number> = { ILS: 1 };
    const details: Record<string, { rate: number; date: string; source: string; posOverride: number | null }> = {};
    if (data) {
      const seen = new Set<string>();
      for (const r of data) {
        const code = (r as any).currencies?.code;
        if (code && !seen.has(code)) {
          seen.add(code);
          const sellRate = Number((r as any).sell_rate) || Number(r.mid_rate) || 1;
          rates[code] = Number((r as any).pos_rate_override) || sellRate;
          details[code] = {
            rate: sellRate,
            date: (r as any).rate_date,
            source: (r as any).source || 'auto',
            posOverride: (r as any).pos_rate_override ? Number((r as any).pos_rate_override) : null,
          };
        }
      }
    }
    setExchangeRates(rates);
    setExchangeRateDetails(details);
  };

  const loadContacts = async () => {
    if (!dataOwnerId) return;
    const { data } = await supabase
      .from("contacts")
      .select("id, contact_name")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .order("contact_name");
    setContacts(data || []);
  };

   const loadModifiers = async () => {
     if (!dataOwnerId) return;
     const { data: groups } = await supabase
       .from("modifier_groups")
       .select("id, name, selection_type, is_required, min_select, max_select, sort_order, is_active")
       .eq("user_id", dataOwnerId)
       .eq("is_active", true)
       .order("sort_order");
     if (!groups || groups.length === 0) { setModifierGroups([]); return; }
     const groupIds = groups.map(g => g.id);
     const { data: options } = await supabase
       .from("modifier_options")
       .select("id, group_id, name, extra_price, is_default, color, sort_order, is_active")
       .in("group_id", groupIds)
       .eq("is_active", true)
       .order("sort_order");
     const fullGroups = groups.map(g => ({
       ...g,
       options: (options || []).filter(o => o.group_id === g.id).map(o => ({ ...o, extra_price: Number(o.extra_price) })),
     }));
     setModifierGroups(fullGroups);
     // Load product-modifier links
     const { data: links } = await supabase
       .from("product_modifier_groups")
       .select("product_id, group_id")
       .in("group_id", groupIds);
     const map: Record<string, string[]> = {};
     (links || []).forEach(l => {
       if (!map[l.product_id]) map[l.product_id] = [];
       map[l.product_id].push(l.group_id);
     });
     setProductModifierMap(map);
   };

   const loadEmployees = async () => {
    if (!dataOwnerId) return;
    const { data } = await supabase
      .from("employees")
      .select("id, full_name, base_salary")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .order("full_name");
    setEmployees(data || []);
  };

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch) return employees;
    const q = employeeSearch.toLowerCase();
    return employees.filter(e => e.full_name.toLowerCase().includes(q));
  }, [employees, employeeSearch]);

  const loadEmployeeBalance = async (empId: string) => {
    const now = new Date();
    const { data } = await supabase
      .from("employee_financial_movements")
      .select("amount")
      .eq("employee_id", empId)
      .eq("status", "approved")
      .eq("movement_type", "debit")
      .eq("salary_month", now.getMonth() + 1)
      .eq("salary_year", now.getFullYear());
    setEmployeeBalance((data || []).reduce((s, m) => s + Number(m.amount), 0));
  };

  const filteredContacts = useMemo(() => {
    if (!customerSearch) return contacts;
    const q = customerSearch.toLowerCase();
    return contacts.filter(c => c.contact_name.toLowerCase().includes(q));
  }, [contacts, customerSearch]);

  const categoriesWithCounts = useMemo(() => {
    const posProducts = products.filter(p => p.is_pos_available);
    const totalCount = posProducts.length;

    const productCategoryNames = Array.from(
      new Set(
        posProducts
          .map((p) => (p.category || "").trim())
          .filter(Boolean)
      )
    );

    const missingCategoryRows = productCategoryNames
      .filter((name) => !posCategories.some((c) => c.name === name))
      .map((name) => ({
        id: `legacy-${name}`,
        name,
        color: "#6B7280",
        display_order: 999,
        is_active: true,
      }));

    const mergedCategories = [...posCategories, ...missingCategoryRows];

    const catCounts: { id: string; name: string; color: string; count: number }[] = mergedCategories.map(cat => ({
      id: cat.id,
      name: cat.name,
      color: cat.color,
      count: posProducts.filter(p => p.pos_category_id === cat.id || p.category === cat.name).length,
    }));

    const uncategorized = posProducts.filter(p =>
      !p.pos_category_id && !mergedCategories.some(c => c.name === p.category)
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

  // ── DnD Handlers ──
  const handleCategoryDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setDragActiveId(null);
    if (!isAdmin || !over || active.id === over.id || !userId) return;
    const oldIndex = posCategories.findIndex(c => c.id === active.id);
    const newIndex = posCategories.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(posCategories, oldIndex, newIndex);
    setPosCategories(reordered);
    // Save to DB
    for (let i = 0; i < reordered.length; i++) {
      await supabase.from("pos_categories" as any).update({ display_order: i, sort_order: i } as any).eq("id", reordered[i].id);
    }
    toast.success("تم حفظ ترتيب التصنيفات");
  }, [posCategories, userId, isAdmin]);

  const handleProductDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setDragActiveId(null);
    if (!isAdmin || !over || active.id === over.id || !userId) return;
    const currentProducts = filteredProducts;
    const oldIndex = currentProducts.findIndex(p => p.id === active.id);
    const newIndex = currentProducts.findIndex(p => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(currentProducts, oldIndex, newIndex);
    // Update local state
    setProducts(prev => {
      const updated = [...prev];
      reordered.forEach((p, i) => {
        const idx = updated.findIndex(u => u.id === p.id);
        if (idx !== -1) updated[idx] = { ...updated[idx], sort_order: i } as any;
      });
      return updated.sort((a, b) => ((a as any).sort_order || 0) - ((b as any).sort_order || 0));
    });
    // Save to DB
    for (let i = 0; i < reordered.length; i++) {
      await supabase.from("products" as any).update({ sort_order: i } as any).eq("id", reordered[i].id);
    }
    toast.success("تم حفظ ترتيب المنتجات");
  }, [filteredProducts, userId, isAdmin]);

  // Cart operations
  const addToCart = useCallback((product: Product) => {
    // Check if product has modifier groups
    const groupIds = productModifierMap[product.id];
    if (groupIds && groupIds.length > 0) {
      setModifierProduct(product);
      setShowModifierModal(true);
      return;
    }

    addToCartDirect(product);
  }, [cart, productModifierMap]);

  const addToCartDirect = useCallback((product: Product, modifiers?: SelectedModifier[], note?: string, qty?: number) => {
    if (product.quantity <= 0) {
      toast.warning(`⚠️ تنبيه: ${product.name} - المخزون صفر، سيتم البيع بالسالب`);
    }
    const currentInCart = cart.find(i => i.product_id === product.id)?.qty || 0;
    if (product.quantity > 0 && product.min_quantity > 0 && (product.quantity - currentInCart - 1) <= product.min_quantity) {
      toast.warning(`⚠️ تنبيه: ${product.name} - باقي ${product.quantity - currentInCart - 1} قطع فقط`);
    }

    const modifierExtra = (modifiers || []).reduce((s, m) => s + m.extra_price, 0);
    const unitPrice = product.sell_price + modifierExtra;
    const itemQty = qty || 1;

    // If product has modifiers, always add as new line (don't merge)
    if (modifiers && modifiers.length > 0) {
      setCart((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          product_id: product.id,
          name: product.name,
          qty: itemQty,
          unit_price: unitPrice,
          cost_price: product.buy_price,
          discount_pct: 0,
          tax_rate: product.tax_rate,
          unit: product.unit,
          total: itemQty * unitPrice,
          note: note || "",
          modifiers,
        },
      ]);
      return;
    }

    setCart((prev) => {
      const existing = prev.findIndex((item) => item.product_id === product.id && (!item.modifiers || item.modifiers.length === 0));
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
          modifiers: [],
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
        user_id: dataOwnerId,
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

  // Save order to table (draft - no payment)
  const handleSaveToTable = async () => {
    if (!userId || !session || cart.length === 0 || !activeOrder.tableId || !company) return;
    setSavingToTable(true);
    try {
      // Check if there's already an open order for this table
      const { data: existingOrder } = await supabase
        .from("pos_orders")
        .select("id")
        .eq("table_id", activeOrder.tableId)
        .in("state", ["draft", "open"] as any)
        .maybeSingle();

      if (existingOrder) {
        // Replace all items in existing order with current cart
        await supabase.from("pos_order_lines").delete().eq("order_id", existingOrder.id);

        const lines = cart.map((item) => ({
          user_id: dataOwnerId,
          order_id: existingOrder.id,
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

        // Update order totals
        await supabase.from("pos_orders").update({
          subtotal: cartTotals.subtotal,
          total: cartTotals.total,
          tax_amount: cartTotals.tax,
          discount_amount: cartTotals.discount,
          customer_name: customerName || null,
          guest_count: activeOrder.guestCount,
          guest_name: activeOrder.guestName || null,
        } as any).eq("id", existingOrder.id);
      } else {
        // Create new draft order
        const { data: order, error } = await supabase
          .from("pos_orders")
          .insert({
            user_id: dataOwnerId,
            company_id: company.id,
            session_id: session.id,
            customer_name: customerName || null,
            subtotal: cartTotals.subtotal,
            discount_amount: cartTotals.discount,
            tax_amount: cartTotals.tax,
            total: cartTotals.total,
            state: "draft",
            table_id: activeOrder.tableId,
            guest_count: activeOrder.guestCount,
            guest_name: activeOrder.guestName || null,
            order_type: "dine_in",
          } as any)
          .select()
          .single();

        if (error) throw error;

        const lines = cart.map((item) => ({
          user_id: dataOwnerId,
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
      }

      toast.success(`💾 تم حفظ الطلب على ${activeOrder.tableName}`);

      // Clear this order tab or remove it
      if (orders.length > 1) {
        removeOrder(activeOrderIndex);
      } else {
        orderCounter.current += 1;
        setOrders([createNewOrder(orderCounter.current)]);
        setActiveOrderIndex(0);
      }
    } catch (err: any) {
      toast.error(err.message || "خطأ في حفظ الطلب");
    } finally {
      setSavingToTable(false);
    }
  };

  // Send to kitchen (print kitchen ticket)
  const handleSendToKitchen = () => {
    if (cart.length === 0) return;
    setKitchenTicketData({
      tableName: activeOrder.tableName || "بدون طاولة",
      guestCount: activeOrder.guestCount,
      cashierName: session?.cashier_name || "",
      time: new Date().toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" }),
      items: cart.map(item => ({
        name: item.name,
        qty: item.qty,
        note: item.note,
      })),
      orderNote: activeOrder.orderNote,
    });
    setShowKitchenTicket(true);
  };

  // Load existing table order into cart
  const loadTableOrder = async (tableId: string, tableName: string) => {
    const { data: order } = await supabase
      .from("pos_orders")
      .select("id, guest_count, guest_name, customer_name, subtotal, total, discount_amount, tax_amount")
      .eq("table_id", tableId)
      .in("state", ["draft", "open"] as any)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!order) return;

    const { data: lines } = await supabase
      .from("pos_order_lines")
      .select("*")
      .eq("order_id", order.id);

    if (!lines || lines.length === 0) return;

    const cartItems: CartItem[] = lines.map((line: any) => ({
      id: crypto.randomUUID(),
      product_id: line.product_id,
      name: line.product_name,
      qty: line.qty,
      unit_price: Number(line.unit_price),
      cost_price: Number(line.cost_price) || 0,
      discount_pct: Number(line.discount_pct) || 0,
      tax_rate: Number(line.tax_rate) || 0,
      unit: line.unit || "قطعة",
      total: Number(line.total),
      note: "",
    }));

    // Find or create order tab for this table
    const existingTabIdx = orders.findIndex(o => o.tableId === tableId);
    if (existingTabIdx >= 0) {
      setActiveOrderIndex(existingTabIdx);
      updateActiveOrder(o => ({ ...o, cart: cartItems }));
    } else {
      const newOrder: OrderTab = {
        id: crypto.randomUUID(),
        name: tableName,
        cart: cartItems,
        customerName: order.customer_name || "",
        orderDiscount: Number(order.discount_amount) || 0,
        orderDiscountType: "fixed",
        orderNote: "",
        selectedCartIndex: null,
        tableId,
        tableName,
        guestCount: (order as any).guest_count || 1,
        guestName: (order as any).guest_name || "",
      };
      setOrders(prev => [...prev, newOrder]);
      setActiveOrderIndex(orders.length);
    }
  };

  // Complete order
  const handleCompleteOrder = async () => {
    if (!userId || !session || cart.length === 0) return;
    if (!company) return;
    if (paymentMethod === "employee_account" && !selectedEmployee) {
      toast.error("يرجى اختيار الموظف أولاً");
      return;
    }

    setProcessing(true);
    try {
      let orderId: string;
      let orderObj: any;
      
      // Apply customer data discount
      const effectiveTotal = customerDataDiscount 
        ? cartTotals.total - customerDataDiscount.discountAmount 
        : cartTotals.total;
      const effectiveDiscount = cartTotals.discount + (customerDataDiscount?.discountAmount || 0);

      // Check if there's an existing draft/open order for this table (saved earlier)
      if (activeOrder.tableId) {
        const { data: existingOrder } = await supabase
          .from("pos_orders")
          .select("id")
          .eq("table_id", activeOrder.tableId)
          .in("state", ["draft", "open"] as any)
          .maybeSingle();

        if (existingOrder) {
          // Use existing order - update its totals and delete old lines
          await supabase.from("pos_order_lines").delete().eq("order_id", existingOrder.id);
          await supabase.from("pos_orders").update({
            customer_name: customerName || null,
            subtotal: cartTotals.subtotal,
            discount_amount: effectiveDiscount,
            tax_amount: cartTotals.tax,
            total: effectiveTotal,
            ...(customerDataDiscount ? { pos_customer_id: customerDataDiscount.customerId, customer_discount_pct: customerDataDiscount.discountPct } as any : {}),
            session_id: session.id,
          } as any).eq("id", existingOrder.id);
          orderId = existingOrder.id;
          orderObj = { id: existingOrder.id };
        } else {
          // Create new order
          const { data: order, error: orderError } = await supabase
            .from("pos_orders")
            .insert({
              user_id: dataOwnerId,
              company_id: company.id,
              session_id: session.id,
              customer_name: customerName || null,
              subtotal: cartTotals.subtotal,
              discount_amount: effectiveDiscount,
              tax_amount: cartTotals.tax,
              total: effectiveTotal,
              state: "draft",
              table_id: activeOrder.tableId,
              guest_count: activeOrder.guestCount,
              guest_name: activeOrder.guestName || null,
              order_type: "dine_in",
              ...(customerDataDiscount ? { pos_customer_id: customerDataDiscount.customerId, customer_discount_pct: customerDataDiscount.discountPct } as any : {}),
            } as any)
            .select()
            .single();
          if (orderError) throw orderError;
          orderId = order.id;
          orderObj = order;
        }
      } else {
        const { data: order, error: orderError } = await supabase
          .from("pos_orders")
          .insert({
            user_id: dataOwnerId,
            company_id: company.id,
            session_id: session.id,
            customer_name: customerName || null,
            subtotal: cartTotals.subtotal,
            discount_amount: effectiveDiscount,
            tax_amount: cartTotals.tax,
            total: effectiveTotal,
            state: "draft",
            ...(customerDataDiscount ? { pos_customer_id: customerDataDiscount.customerId, customer_discount_pct: customerDataDiscount.discountPct } as any : {}),
          } as any)
          .select()
          .single();
        if (orderError) throw orderError;
        orderId = order.id;
        orderObj = order;
      }

      const lines = cart.map((item) => ({
        user_id: dataOwnerId,
        order_id: orderId,
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

      const rate = exchangeRates[paymentCurrency] || 1;
      const foreignTotal = paymentCurrency === "ILS" ? effectiveTotal : effectiveTotal / rate;
      const tendered = parseFloat(tenderedAmount) || foreignTotal;
      const changeInForeign = Math.max(0, tendered - foreignTotal);
      const change = paymentCurrency === "ILS" ? changeInForeign : changeInForeign * rate;

      // Generate survey token if customer data was collected
      const surveyToken = customerDataDiscount ? crypto.randomUUID() : null;

      const { data: result, error: completeError } = await supabase.rpc("complete_pos_order", {
        p_order_id: orderId,
        p_user_id: dataOwnerId,
        p_payments: [{
          method: paymentMethod,
          amount: cartTotals.total,
          tendered: paymentCurrency === "ILS" ? tendered : tendered * rate,
          change: change,
          currency: paymentCurrency,
          exchange_rate: rate,
          foreign_amount: foreignTotal,
          rate_source: rateEdited ? "cashier" : "system",
        }],
      });

      if (completeError) throw completeError;

      const res = result as any;
      if (!res?.success) {
        throw new Error(res?.error || "خطأ في إتمام الطلب");
      }

      // Fallback: manually release table if trigger didn't fire
      if (activeOrder.tableId) {
        await supabase
          .from("restaurant_tables")
          .update({
            status: "available",
            current_order_id: null,
            current_guests: 0,
            occupied_at: null,
          })
          .eq("id", activeOrder.tableId);
      }

      setSession((prev) =>
        prev
          ? {
              ...prev,
              total_sales: prev.total_sales + effectiveTotal,
              total_orders: prev.total_orders + 1,
            }
          : null
      );

      // Record employee account movement
      if (paymentMethod === "employee_account" && selectedEmployee) {
        const now = new Date();
        const itemsSummary = cart.map(i => `${i.name} x${i.qty}`).join(", ");
        await supabase.from("employee_financial_movements").insert({
          user_id: dataOwnerId,
          employee_id: selectedEmployee.id,
          source_type: "pos_meal",
          source_id: orderId,
          source_reference: res.order_number,
          description: `مسحوبات POS - ${itemsSummary}`.slice(0, 200),
          amount: cartTotals.total,
          movement_type: "debit",
          status: "approved",
          movement_date: now.toISOString().split("T")[0],
          salary_month: now.getMonth() + 1,
          salary_year: now.getFullYear(),
          created_by: userId,
        } as any);
      }

      // Save POS rate override if cashier edited the rate
      if (rateEdited && paymentCurrency !== "ILS" && rate !== 1) {
        const currencyDetail = exchangeRateDetails[paymentCurrency];
        if (currencyDetail) {
          await supabase
            .from("exchange_rates")
            .update({ pos_rate_override: rate } as any)
            .eq("user_id", dataOwnerId)
            .order("rate_date", { ascending: false })
            .limit(1);
        }
      }

      loadProducts();

      const tableName = activeOrder.tableName;
      const receiptInfo = {
        orderNumber: res.order_number,
        date: new Date().toISOString(),
        cashierName: session.cashier_name,
        companyName: company?.name || "شركتي",
        terminalName: terminal?.name || "نقطة بيع",
        customerName: customerName,
        tableName: tableName || undefined,
        guestCount: activeOrder.tableId ? activeOrder.guestCount : undefined,
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
        discount: effectiveDiscount,
        total: effectiveTotal,
        paymentMethod,
        tenderedAmount: tendered,
        change,
        currency: paymentCurrency,
        exchangeRate: rate,
        foreignAmount: foreignTotal,
        orderNote,
      };

      setReceiptData(receiptInfo);
      setShowPayment(false);
      setShowReceipt(true);

      // Send digital receipt & survey if customer data was collected
      if (customerDataDiscount && surveyToken) {
        try {
          // Create survey record
          await supabase.from("customer_surveys").insert({
            user_id: dataOwnerId,
            order_id: orderId,
            customer_id: customerDataDiscount.customerId,
            cashier_user_id: userId,
            survey_token: surveyToken,
            status: "sent",
          } as any);

          // Update order with survey token
          await supabase.from("pos_orders").update({
            digital_receipt_sent: true,
            survey_sent: true,
            survey_token: surveyToken,
          } as any).eq("id", orderId);

          // Send via edge function
          const { data: sendResult } = await supabase.functions.invoke("send-customer-receipt", {
            body: {
              orderId,
              contactType: customerDataDiscount.contactType,
              contactValue: customerDataDiscount.contactValue,
              customerName: customerDataDiscount.customerName,
              companyName: company?.name || "شركتي",
              surveyToken,
            },
          });

          if (sendResult?.whatsappUrl) {
            window.open(sendResult.whatsappUrl, "_blank");
          }
        } catch (e) {
          console.error("Failed to send receipt:", e);
        }
      }

      // Reset order tab
      if (orders.length > 1) {
        removeOrder(activeOrderIndex);
      } else {
        setCart([]);
        setCustomerName("");
        setOrderDiscount(0);
        setOrderNote("");
        setSelectedCartIndex(null);
        updateActiveOrder(o => ({ ...o, tableId: null, tableName: null, guestCount: 1, guestName: "" }));
      }
      setSelectedEmployee(null);
      setEmployeeSearch("");
      setEmployeeBalance(0);
      setTenderedAmount("");
      setPaymentMethod("cash");
      setPaymentCurrency("ILS");
      setEditedRate(null);
      setRateEdited(false);
      setCustomerDataDiscount(null);

      if (tableName) {
        toast.success(`✅ تم السداد - ${tableName} متاحة الآن`);
      }
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
    const closedAt = new Date().toISOString();

    await supabase
      .from("pos_sessions")
      .update({
        state: "closed",
        closing_cash: cash,
        expected_cash: expected,
        cash_variance: variance,
        closed_at: closedAt,
      })
      .eq("id", session.id);

    // Record variance as employee deduction/surplus in HR if employee exists
    if (variance !== 0) {
      // Find employee linked to this auth user
      const { data: emp } = await supabase
        .from("employees")
        .select("id, full_name")
        .eq("auth_user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      // Find contact linked to employee name for account statement
      let contactId: string | null = null;
      if (emp) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("id")
          .eq("user_id", dataOwnerId)
          .eq("contact_name", emp.full_name)
          .maybeSingle();
        contactId = contact?.id || null;
      }

      if (emp) {
        const isShortage = variance < 0;
        // Add to employee_deductions
        await supabase.from("employee_deductions").insert({
          user_id: dataOwnerId,
          employee_id: emp.id,
          deduction_type: isShortage ? "عجز صندوق" : "فائض صندوق",
          amount: Math.abs(variance),
          description: `${isShortage ? "عجز" : "فائض"} وردية POS - ${session.cashier_name} - ${new Date().toLocaleDateString("ar-PS")}`,
          deduction_date: new Date().toISOString().split("T")[0],
          notes: `جلسة: ${session.id}`,
        });

        // Create accounting entry linked to employee contact
        await supabase.from("transactions").insert({
          user_id: dataOwnerId,
          transaction_date: new Date().toISOString().split("T")[0],
          description: `${isShortage ? "عجز" : "فائض"} صندوق - ${session.cashier_name}`,
          debit_account_code: isShortage ? "1130" : "1110",
          credit_account_code: isShortage ? "1110" : "1130",
          amount: Math.abs(variance),
          currency: "شيكل",
          transaction_type: isShortage ? "cash_shortage" : "cash_surplus",
          contact_id: contactId,
          reference: `SHIFT-${session.id.slice(0, 8)}`,
          idempotency_key: `SHIFT-VAR-${session.id}`,
        });

        // Also record in centralized financial movements
        const now = new Date();
        await supabase.from("employee_financial_movements").insert({
          user_id: dataOwnerId,
          employee_id: emp.id,
          source_type: "pos_shortage",
          source_id: session.id,
          source_reference: `SHIFT-${session.id.slice(0, 8)}`,
          description: `${isShortage ? "عجز" : "فائض"} صندوق - وردية ${new Date(session.opened_at).toLocaleDateString("ar-PS")}`,
          amount: Math.abs(variance),
          movement_type: isShortage ? "debit" : "credit",
          status: "pending",
          movement_date: now.toISOString().split("T")[0],
          salary_month: now.getMonth() + 1,
          salary_year: now.getFullYear(),
          created_by: userId,
        } as any);
      }
    }

    // Prepare shift summary data
    setShiftSummaryData({
      companyName: company?.name || "شركتي",
      terminalName: terminal?.name || "نقطة بيع",
      cashierName: session.cashier_name,
      openedAt: session.opened_at,
      closedAt,
      openingCash: session.opening_cash,
      totalSales: session.total_sales,
      totalOrders: session.total_orders,
      closingCash: cash,
      expectedCash: expected,
      variance,
      sessionId: session.id,
    });

    setShowCloseShift(false);
    setShowShiftSummary(true);
  };

  const handleShiftSummaryClosed = () => {
    setShowShiftSummary(false);
    setSession(null);
    setOrders([createNewOrder(1)]);
    setActiveOrderIndex(0);
    orderCounter.current = 1;
    toast.success("تم إغلاق الوردية بنجاح");
    setShowLogoutConfirm(true);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
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

        {/* Sales summary - admin only */}
        {session && isAdmin && (
          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={() => setShowSalesSummary(prev => !prev)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white/80"
              title={showSalesSummary ? "إخفاء المبيعات" : "إظهار المبيعات"}
            >
              {showSalesSummary ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
            {showSalesSummary && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary/15">
                  <BarChart3 className="h-3.5 w-3.5 text-primary" />
                  <span className="text-white/60">مبيعات اليوم:</span>
                  <span className="font-bold text-primary tabular-nums">₪{session.total_sales.toFixed(0)}</span>
                </div>
                <span className="text-white/40">{session.total_orders} طلب</span>
              </>
            )}
          </div>
        )}

        {/* Card size toggle */}
        <div className="flex items-center gap-0.5 bg-white/10 rounded-lg p-0.5">
          {(["S", "M", "L"] as const).map(size => (
            <button
              key={size}
              onClick={() => {
                setCardSize(size);
                localStorage.setItem("pos-card-size", size);
              }}
              className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
                cardSize === size
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-white/50 hover:text-white/80 hover:bg-white/10"
              }`}
              title={size === "S" ? "بطاقات صغيرة" : size === "M" ? "بطاقات متوسطة" : "بطاقات كبيرة"}
            >
              {size}
            </button>
          ))}
        </div>

        {/* Sort mode toggle - admin only */}
        {isAdmin && (
          <button
            onClick={() => setIsSortMode(!isSortMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isSortMode
                ? "bg-amber-500 text-white shadow-md"
                : "bg-white/10 text-white/60 hover:text-white/90 hover:bg-white/15"
            }`}
          >
            <GripVertical className="h-3 w-3" />
            {isSortMode ? "✅ تم" : "ترتيب"}
          </button>
        )}

        <button
          onClick={() => navigate("/pos/floor-plan")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-medium"
        >
          <UtensilsCrossed className="h-3 w-3" />
          الطاولات
        </button>

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
            {/* Sort mode banner */}
            {isSortMode && isAdmin && (
              <div className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs">
                <GripVertical className="h-3.5 w-3.5" />
                <span className="font-medium">وضع الترتيب — اسحب التصنيفات أو المنتجات لإعادة ترتيبها</span>
              </div>
            )}
            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragStart={(e: DragStartEvent) => setDragActiveId(String(e.active.id))}
              onDragEnd={handleCategoryDragEnd}
            >
              <SortableContext
                items={categoriesWithCounts.categories.map(c => c.id)}
                strategy={horizontalListSortingStrategy}
                disabled={!isSortMode}
              >
                <div className="flex flex-wrap gap-2 items-center">
                  {/* All */}
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => !isSortMode && setSelectedCategory("الكل")}
                    className={`h-9 px-4 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                      selectedCategory === "الكل"
                        ? "bg-foreground text-background shadow-md"
                        : "bg-card text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20"
                    }`}
                  >
                    الكل ({categoriesWithCounts.all})
                  </motion.button>

                  {/* Sortable category chips */}
                  {categoriesWithCounts.categories.map((cat) => (
                    <SortableCategoryChip
                      key={cat.id}
                      cat={cat}
                      isActive={selectedCategory === cat.name}
                      isSortMode={isSortMode}
                      isDragging={dragActiveId === cat.id}
                      onClick={() => !isSortMode && setSelectedCategory(cat.name)}
                    />
                  ))}

                  {categoriesWithCounts.uncategorized > 0 && (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => !isSortMode && setSelectedCategory("__uncategorized__")}
                      className={`h-9 px-4 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 border ${
                        selectedCategory === "__uncategorized__"
                          ? "bg-muted-foreground text-background border-muted-foreground shadow-md"
                          : "bg-card text-muted-foreground border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      أخرى ({categoriesWithCounts.uncategorized})
                    </motion.button>
                  )}

                  {/* Management buttons - admin only */}
                  {!isSortMode && isAdmin && (
                    <>
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
                    </>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* ── Table Selector Bar ── */}
          <TableSelectorBar
            dataOwnerId={dataOwnerId || ""}
            activeTableId={activeOrder.tableId}
            onTableSelect={(table: TableBarItem) => {
              if (table.status === "occupied" && table.id !== activeOrder.tableId) {
                // Load the existing order from this occupied table
                loadTableOrder(table.id, table.name);
              } else if (table.status === "available" || table.status === "cleaning") {
                // Assign this table to the current order
                updateActiveOrder(o => ({ ...o, tableId: table.id, tableName: table.name, name: table.name }));
              } else if (table.id === activeOrder.tableId) {
                // Clicking the active table again - deselect
                updateActiveOrder(o => ({ ...o, tableId: null, tableName: null, name: `طلب ${activeOrderIndex + 1}` }));
              }
            }}
            onNewTable={() => navigate("/pos/floor-plan/edit")}
          />

          {/* ── Products Grid ── */}
          <ScrollArea className="flex-1">
            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragStart={(e: DragStartEvent) => setDragActiveId(String(e.active.id))}
              onDragEnd={handleProductDragEnd}
            >
              <SortableContext
                items={filteredProducts.map(p => p.id)}
                strategy={rectSortingStrategy}
                disabled={!isSortMode}
              >
                <div className={`p-3 grid gap-2 ${
                  cardSize === "S" 
                    ? "grid-cols-5 sm:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-10 gap-1.5" 
                    : cardSize === "M" 
                      ? "grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2" 
                      : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3"
                }`}>
                  {filteredProducts.map((product) => {
                    const productColor = getProductCatColor(product);
                    const catConfig = getCatConfig(product.category);
                    const CatIcon = catConfig.icon;
                    const isLowStock = product.min_quantity > 0 && product.quantity <= product.min_quantity && product.quantity > 0;
                    const qtyInCart = cartQtyMap[product.id] || 0;

                    return (
                      <SortableProductCard key={product.id} id={product.id} isSortMode={isSortMode}>
                        {({ isDragging, style, ref, listeners, attributes }) => (
                          <div
                            ref={ref}
                            {...attributes}
                            {...listeners}
                            onClick={() => !isSortMode && addToCart(product)}
                            className={`relative bg-card overflow-hidden text-center transition-all group border select-none ${
                              cardSize === "S" ? "rounded-lg" : "rounded-xl"
                            } ${isSortMode 
                              ? "border-dashed border-amber-400/60 cursor-grab ring-1 ring-amber-400/20" 
                              : "border-border hover:border-opacity-60 cursor-pointer"
                            } ${isDragging ? "shadow-2xl scale-105 rotate-1" : "hover:shadow-md"}`}
                            style={{
                              ...style,
                              borderBottomWidth: cardSize === "S" ? "2px" : "3px",
                              borderBottomColor: isSortMode ? "hsl(var(--primary))" : productColor + "60",
                            }}
                          >
                            {/* Sort mode grip icon */}
                            {isSortMode && (
                              <div className="absolute top-0.5 right-0.5 z-10">
                                <GripVertical className="h-3 w-3 text-amber-500/70" />
                              </div>
                            )}

                            {/* Cart qty badge */}
                            {qtyInCart > 0 && !isSortMode && (
                              <div
                                className={`absolute top-1 left-1 z-10 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center shadow-lg ${
                                  cardSize === "S" 
                                    ? "min-w-[18px] h-[18px] text-[9px] px-0.5" 
                                    : "min-w-[22px] h-[22px] text-[11px] px-1"
                                }`}
                              >
                                {qtyInCart}
                              </div>
                            )}

                            {/* Low stock indicator */}
                            {isLowStock && !isSortMode && (
                              <div className="absolute top-1 right-1 z-10">
                                <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                              </div>
                            )}

                            {/* Product visual */}
                            <div className={
                              cardSize === "S" ? "p-1.5 pb-1" : cardSize === "M" ? "p-2 pb-1.5" : "p-2 pb-1.5"
                            }>
                              {/* Icon/Image - hidden in S size */}
                              {cardSize !== "S" && (
                                product.image_url ? (
                                  <div className={`w-full rounded-lg overflow-hidden mb-1 bg-muted/30 ${
                                    cardSize === "M" ? "aspect-[5/3]" : "aspect-[4/3]"
                                  }`}>
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
                                      <CatIcon className={cardSize === "M" ? "h-5 w-5" : "h-6 w-6"} style={{ color: productColor }} />
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    className={`w-full rounded-lg flex items-center justify-center mb-1 transition-colors ${
                                      cardSize === "M" ? "aspect-[5/3]" : "aspect-[4/3]"
                                    }`}
                                    style={{ backgroundColor: productColor + "10" }}
                                  >
                                    <CatIcon 
                                      className={`transition-transform duration-200 group-hover:scale-110 ${
                                        cardSize === "M" ? "h-5 w-5" : "h-6 w-6"
                                      }`} 
                                      style={{ color: productColor + "80" }} 
                                    />
                                  </div>
                                )
                              )}

                              {/* Name */}
                              <p className={`font-medium text-foreground leading-tight mb-0.5 ${
                                cardSize === "S" 
                                  ? "text-[10px] line-clamp-2 min-h-[2.4em] font-bold" 
                                  : cardSize === "M"
                                    ? "text-[11px] line-clamp-1 min-h-[1.3em]"
                                    : "text-[11px] line-clamp-2 min-h-[2.2em]"
                              }`}>
                                {product.name}
                              </p>

                              {/* Price */}
                              <p className={`font-bold text-primary tabular-nums ${
                                cardSize === "S" ? "text-[10px]" : "text-xs"
                              }`}>
                                ₪{product.sell_price.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        )}
                      </SortableProductCard>
                    );
                  })}

                  {filteredProducts.length === 0 && (
                    <div className="col-span-full py-20 text-center text-muted-foreground">
                      <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-medium mb-1">ابدأ بإضافة المنتجات</p>
                      <p className="text-xs text-muted-foreground/60">لا توجد منتجات في هذا التصنيف</p>
                    </div>
                  )}
                </div>
              </SortableContext>
            </DndContext>
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
              {activeOrder.tableName && (
                <span className="text-xs font-semibold text-primary flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded-md">
                  <UtensilsCrossed className="h-3 w-3" />
                  {activeOrder.tableName}
                </span>
              )}
              {activeOrder.customerName ? (
                <span className="text-xs font-medium text-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {activeOrder.customerName}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/60">{activeOrder.tableName ? "" : "بدون زبون"}</span>
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
              <div className="px-3 pt-2 pb-1 space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => setShowCustomerInput(!showCustomerInput)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors ${
                      showCustomerInput || customerName
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-muted/50 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <User className="h-3 w-3" />
                    {customerName || "العميل"}
                  </button>
                  <button
                    onClick={() => setShowOrderNoteInput(!showOrderNoteInput)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors ${
                      showOrderNoteInput || orderNote
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-muted/50 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <StickyNote className="h-3 w-3" />
                    {orderNote ? "📝 ملاحظة" : "الملاحظات"}
                  </button>
                  <button
                    onClick={async () => {
                      setShowTablePicker(!showTablePicker);
                      if (availableTables.length === 0) {
                        const ownerId = dataOwnerId;
                        const { data } = await supabase
                          .from("restaurant_tables")
                          .select("id, name, seats, status, section_id")
                          .eq("user_id", ownerId)
                          .eq("is_active", true)
                          .order("name");
                        if (data) {
                          const { data: secs } = await supabase
                            .from("restaurant_sections")
                            .select("id, name")
                            .eq("user_id", ownerId);
                          const secMap = Object.fromEntries((secs || []).map(s => [s.id, s.name]));
                          setAvailableTables(data.map(t => ({
                            ...t,
                            section_name: secMap[t.section_id] || "",
                          })));
                        }
                      }
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors ${
                      activeOrder.tableId
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-muted/50 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <UtensilsCrossed className="h-3 w-3" />
                    {activeOrder.tableName || "الطاولة"}
                  </button>
                </div>

                {/* Table picker */}
                {showTablePicker && (
                  <div className="relative">
                    <div className="absolute z-50 w-full bottom-full mb-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto p-1">
                      {availableTables.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-2 text-center">لا توجد طاولات. <button onClick={() => navigate("/pos/floor-plan/edit")} className="text-primary underline">أنشئ طاولات</button></p>
                      ) : (
                        <>
                          {activeOrder.tableId && (
                            <button
                              onClick={() => {
                                updateActiveOrder(o => ({ ...o, tableId: null, tableName: null, name: `طلب ${activeOrderIndex + 1}` }));
                                setShowTablePicker(false);
                              }}
                              className="w-full px-3 py-1.5 text-xs text-right hover:bg-muted/50 transition flex items-center gap-2 text-destructive"
                            >
                              <X className="h-3 w-3 shrink-0" />
                              <span>إزالة الطاولة</span>
                            </button>
                          )}
                          {availableTables.map(t => (
                            <button
                              key={t.id}
                              onClick={async () => {
                                if (t.status === "occupied" && t.id !== activeOrder.tableId) {
                                  // Load existing order from occupied table
                                  await loadTableOrder(t.id, t.name);
                                  setShowTablePicker(false);
                                  return;
                                }
                                updateActiveOrder(o => ({ ...o, tableId: t.id, tableName: t.name, name: t.name }));
                                setShowTablePicker(false);
                              }}
                              className={`w-full px-3 py-1.5 text-xs text-right hover:bg-muted/50 transition flex items-center justify-between gap-2 ${
                                t.id === activeOrder.tableId ? "bg-primary/10" : ""
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <UtensilsCrossed className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="font-medium">{t.name}</span>
                                <span className="text-muted-foreground">({t.seats} كرسي)</span>
                              </div>
                              <span className={`text-[10px] ${
                                t.status === "available" ? "text-emerald-600" :
                                t.status === "occupied" ? "text-red-500" :
                                t.status === "reserved" ? "text-amber-500" : "text-sky-500"
                              }`}>
                                {t.status === "available" ? "فارغة" : t.status === "occupied" ? "📋 عرض الطلب" : t.status === "reserved" ? "محجوزة" : "تنظيف"}
                              </span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Customer input */}
                {showCustomerInput && (
                  <div className="relative">
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">@</span>
                    <Input
                      value={customerSearch || customerName}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setCustomerName(e.target.value);
                        setShowContactDropdown(true);
                      }}
                      onFocus={() => setShowContactDropdown(true)}
                      placeholder="ابحث عن زبون..."
                      className="h-8 text-xs pr-7"
                      autoFocus
                    />
                    {showContactDropdown && filteredContacts.length > 0 && (
                      <div className="absolute z-50 w-full bottom-full mb-1 bg-popover border border-border rounded-lg shadow-lg max-h-32 overflow-y-auto">
                        {filteredContacts.map((contact) => (
                          <button
                            key={contact.id}
                            onClick={() => {
                              setCustomerName(contact.contact_name);
                              setCustomerSearch("");
                              setShowContactDropdown(false);
                              setShowCustomerInput(false);
                            }}
                            className="w-full px-3 py-1.5 text-xs text-right hover:bg-muted/50 transition flex items-center gap-2"
                          >
                            <User className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span>{contact.contact_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Order note input */}
                {showOrderNoteInput && (
                  <Input
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    placeholder="ملاحظة على الفاتورة..."
                    className="h-8 text-xs bg-muted/30 border-dashed"
                    autoFocus
                  />
                )}
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
            <div className="p-3 pt-0 space-y-2">
              {/* Top row: Kitchen + Save (only when table is selected) */}
              {activeOrder.tableId && cart.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={handleSendToKitchen}
                    className="flex-1 h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border-2 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-all"
                  >
                    🍳 إرسال للمطبخ
                  </button>
                  <button
                    onClick={handleSaveToTable}
                    disabled={savingToTable}
                    className="flex-1 h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border-2 border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400 hover:bg-sky-500/20 transition-all disabled:opacity-40"
                  >
                    💾 {savingToTable ? "جاري الحفظ..." : "حفظ الطلب"}
                  </button>
                </div>
              )}
              {/* Customer data discount button */}
              {cart.length > 0 && (
                <button
                  onClick={() => setShowCustomerDataModal(true)}
                  className={`w-full h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    customerDataDiscount
                      ? "border-2 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "border border-dashed border-amber-400/50 bg-amber-500/5 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                  }`}
                >
                  {customerDataDiscount ? `✅ خصم ${customerDataDiscount.discountPct}% مطبّق — ${customerDataDiscount.customerName || customerDataDiscount.contactValue}` : "🎁 خصم مقابل بيانات العميل"}
                </button>
              )}
              {/* Bottom row: Delete + Print + Pay */}
              <div className="flex gap-2">
                <button
                  disabled={cart.length === 0}
                  onClick={async () => {
                    const tableId = activeOrder.tableId;
                    setCart([]); setSelectedCartIndex(null); setOrderDiscount(0); setOrderNote("");
                    setCustomerDataDiscount(null);
                    if (tableId) {
                      const { data: existingOrder } = await supabase
                        .from("pos_orders")
                        .select("id")
                        .eq("table_id", tableId)
                        .in("state", ["draft", "open"] as any)
                        .maybeSingle();
                      if (existingOrder) {
                        await supabase.from("pos_order_lines").delete().eq("order_id", existingOrder.id);
                        await supabase.from("pos_orders").update({ state: "cancelled" } as any).eq("id", existingOrder.id);
                      }
                      await supabase.from("restaurant_tables").update({
                        status: "available", current_order_id: null, current_guests: 0, occupied_at: null,
                      }).eq("id", tableId);
                      updateActiveOrder(o => ({ ...o, tableId: null, tableName: null }));
                      toast.success("تم إفراغ الطاولة وإرجاعها فارغة");
                    }
                  }}
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
                  دفع ₪{(customerDataDiscount ? cartTotals.total - customerDataDiscount.discountAmount : cartTotals.total).toFixed(2)}
                  <Printer className="h-4 w-4 opacity-70" />
                </motion.button>
              </div>
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
              {customerDataDiscount && (
                <p className="text-xs text-emerald-600 mb-1">🎁 خصم {customerDataDiscount.discountPct}% = -₪{customerDataDiscount.discountAmount.toFixed(2)}</p>
              )}
              <motion.p
                key={cartTotals.total}
                initial={{ scale: 1.05 }}
                animate={{ scale: 1 }}
                className="text-4xl font-bold text-primary tabular-nums"
              >
                ₪{(customerDataDiscount ? cartTotals.total - customerDataDiscount.discountAmount : cartTotals.total).toFixed(2)}
              </motion.p>
            </div>

            {/* Payment methods */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { key: "cash", label: "نقد", icon: Banknote, color: "#16A34A" },
                { key: "card", label: "شبكة", icon: CreditCard, color: "#3B82F6" },
                { key: "credit", label: "آجل", icon: Receipt, color: "#F59E0B" },
                { key: "employee_account", label: "حساب موظف", icon: UserCheck, color: "#8B5CF6" },
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
                  <div className="grid grid-cols-5 gap-2">
                    {currencies.map((cur) => {
                      const isActive = paymentCurrency === cur.code;
                      return (
                        <motion.button
                          key={cur.code}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => { setPaymentCurrency(cur.code); setEditedRate(null); setRateEdited(false); setTenderedAmount(""); }}
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

                {/* Exchange rate info - enhanced */}
                {paymentCurrency !== "ILS" && exchangeRates[paymentCurrency] && (
                  <div className="space-y-2 p-3 rounded-xl bg-muted/50 border border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                        💱 سعر الصرف — {currencies.find(c => c.code === paymentCurrency)?.name}
                      </span>
                      {exchangeRateDetails[paymentCurrency] && (() => {
                        const rateDate = exchangeRateDetails[paymentCurrency].date;
                        const isStale = rateDate && new Date(rateDate).toDateString() !== new Date().toDateString();
                        return isStale ? (
                          <span className="text-[10px] text-amber-600 flex items-center gap-0.5">⚠️ لم يُحدَّث اليوم</span>
                        ) : null;
                      })()}
                    </div>

                    {/* System rate info */}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>السعر في النظام: {exchangeRateDetails[paymentCurrency]?.rate?.toFixed(4) || '—'} ₪/{paymentCurrency}</span>
                      <span>{exchangeRateDetails[paymentCurrency]?.date ? `آخر تحديث: ${new Date(exchangeRateDetails[paymentCurrency].date).toLocaleDateString("ar-PS")}` : ''}</span>
                    </div>

                    {/* Editable rate */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 relative">
                        <Input
                          type="number"
                          value={editedRate !== null ? editedRate : (exchangeRates[paymentCurrency] || 0)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (val > 0) {
                              setEditedRate(val);
                              setRateEdited(true);
                              setExchangeRates(prev => ({ ...prev, [paymentCurrency]: val }));
                            }
                          }}
                          step="0.0001"
                          className={`text-sm font-mono h-9 ${rateEdited ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : ''}`}
                        />
                        {rateEdited && (
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-amber-600 font-medium">✏️ معدّل</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">₪/{paymentCurrency}</span>
                      {rateEdited && (
                        <button
                          onClick={() => {
                            const original = exchangeRateDetails[paymentCurrency]?.rate || 1;
                            setEditedRate(null);
                            setRateEdited(false);
                            setExchangeRates(prev => ({ ...prev, [paymentCurrency]: exchangeRateDetails[paymentCurrency]?.posOverride || original }));
                          }}
                          className="text-[10px] text-primary hover:underline whitespace-nowrap"
                        >
                          ← الرسمي
                        </button>
                      )}
                    </div>
                    {rateEdited && (
                      <p className="text-[10px] text-amber-600">⚠️ سيُسجَّل السعر المعدَّل في سجل المعاملات</p>
                    )}

                    {/* Required in foreign */}
                    <div className="flex justify-between items-center pt-1 border-t border-border">
                      <span className="text-xs text-muted-foreground">المطلوب بال{currencies.find(c => c.code === paymentCurrency)?.name}</span>
                      <span className="font-mono font-bold text-sm tabular-nums">
                        {currencies.find(c => c.code === paymentCurrency)?.symbol}
                        {(cartTotals.total / (exchangeRates[paymentCurrency] || 1)).toFixed(2)}
                      </span>
                    </div>

                    {/* Account info */}
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 pt-1">
                      <span>📒 سيُسجَّل في:</span>
                      <span className="font-medium">
                        {paymentCurrency === 'USD' ? 'صندوق الدولار (1111)' :
                         paymentCurrency === 'JOD' ? 'صندوق الدينار (1112)' :
                         paymentCurrency === 'EUR' ? 'صندوق اليورو (1113)' :
                         paymentCurrency === 'EGP' ? 'صندوق الجنيه (1114)' : 'الصندوق (1110)'}
                      </span>
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
                   const effectiveT = customerDataDiscount ? cartTotals.total - customerDataDiscount.discountAmount : cartTotals.total;
                   const change = tenderedInILS - effectiveT;
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

            {/* Employee selector for employee_account */}
            {paymentMethod === "employee_account" && (
              <div className="relative space-y-2">
                <label className="text-sm font-medium mb-1.5 block">اختر الموظف</label>
                <div className="relative">
                  <UserCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={selectedEmployee ? selectedEmployee.full_name : employeeSearch}
                    onChange={(e) => {
                      setEmployeeSearch(e.target.value);
                      setSelectedEmployee(null);
                      setShowEmployeeDropdown(true);
                    }}
                    onFocus={() => setShowEmployeeDropdown(true)}
                    placeholder="ابحث عن موظف..."
                    className="h-10 pr-10"
                  />
                </div>
                {showEmployeeDropdown && filteredEmployees.length > 0 && !selectedEmployee && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {filteredEmployees.map((emp) => (
                      <button
                        key={emp.id}
                        onClick={() => {
                          setSelectedEmployee({ id: emp.id, full_name: emp.full_name });
                          setEmployeeSearch("");
                          setShowEmployeeDropdown(false);
                          loadEmployeeBalance(emp.id);
                        }}
                        className="w-full px-3 py-2 text-sm text-right hover:bg-muted/50 transition flex items-center gap-2"
                      >
                        <UserCheck className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                        <span>{emp.full_name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedEmployee && (
                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium">{selectedEmployee.full_name}</span>
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] text-muted-foreground">رصيد مسحوبات الشهر</p>
                      <p className="text-sm font-bold text-destructive tabular-nums">₪{employeeBalance.toFixed(0)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Complete sale button */}
          <motion.div whileTap={{ scale: 0.98 }}>
            <Button
              onClick={handleCompleteOrder}
              disabled={processing || (paymentMethod === "credit" && !customerName) || (paymentMethod === "employee_account" && !selectedEmployee)}
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

      {/* Close Shift Dialog - Employee sees only cash count input */}
      <Dialog open={showCloseShift} onOpenChange={setShowCloseShift}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">تسليم العهدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-xl p-4 text-center space-y-2">
              <div className="text-sm text-muted-foreground">قم بعد النقدية الموجودة في الصندوق وأدخل المبلغ أدناه</div>
              <div className="text-xs text-muted-foreground/70">سيتم مقارنة المبلغ مع السجلات تلقائياً</div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">المبلغ الموجود في الصندوق (₪)</label>
              <Input
                type="number"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                placeholder="0.00"
                className="text-2xl h-14 text-center font-bold"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              onClick={handleCloseShift} 
              variant="destructive" 
              className="w-full h-12 text-base font-bold gap-2"
              disabled={!closingCash}
            >
              <LogOut className="h-5 w-5" />
              تسليم العهدة وإغلاق الوردية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shift Summary Receipt */}
      <ShiftSummaryReceipt
        open={showShiftSummary}
        onOpenChange={(open) => {
          if (!open) handleShiftSummaryClosed();
        }}
        data={shiftSummaryData}
      />

      {/* Logout after Shift Close — cashier must log out, admin can stay */}
      <Dialog open={showLogoutConfirm} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-sm" dir="rtl" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
              تم إغلاق الوردية
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-4 space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-muted-foreground text-sm">
              {isAdmin
                ? "تم إغلاق الوردية بنجاح. هل تريد تسجيل الخروج؟"
                : "تم إغلاق الوردية بنجاح. سيتم تسجيل خروجك الآن."}
            </p>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            {isAdmin && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowLogoutConfirm(false)}
              >
                البقاء
              </Button>
            )}
            <Button
              variant="destructive"
              className={isAdmin ? "flex-1 gap-2" : "w-full gap-2"}
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              تسجيل الخروج
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
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">اسم التصنيف الجديد</label>
                <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveCategory()} placeholder="مثال: حلويات" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">اللون</label>
                <div className="flex flex-wrap gap-2 items-center">
                  {[
                    "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16",
                    "#22C55E", "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9",
                    "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7", "#D946EF",
                    "#EC4899", "#F43F5E", "#78716C", "#6B7280", "#1E293B",
                  ].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewCatColor(color)}
                      className={`w-7 h-7 rounded-lg border-2 transition-all hover:scale-110 ${newCatColor === color ? "border-foreground ring-2 ring-primary/30 scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <div className="relative">
                    <input
                      type="color"
                      value={newCatColor}
                      onChange={(e) => setNewCatColor(e.target.value)}
                      className="absolute inset-0 w-7 h-7 opacity-0 cursor-pointer"
                    />
                    <div className="w-7 h-7 rounded-lg border-2 border-dashed border-muted-foreground/40 flex items-center justify-center hover:border-primary/60 transition-colors cursor-pointer">
                      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </div>
              <Button onClick={handleSaveCategory} disabled={!newCatName.trim() || savingCategory} className="h-10 w-full">
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

      {/* ── Kitchen Ticket Dialog ── */}
      <Dialog open={showKitchenTicket} onOpenChange={setShowKitchenTicket}>
        <DialogContent className="max-w-xs" dir="rtl">
          <div className="text-center space-y-1 pb-2 border-b border-dashed border-border">
            <p className="text-lg font-bold">🍳 طلب مطبخ</p>
            <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString("ar-PS")}</p>
          </div>
          {kitchenTicketData && (
            <div className="space-y-3 py-2">
              <div className="flex justify-between text-sm">
                <span className="font-bold text-foreground">طاولة: {kitchenTicketData.tableName}</span>
                <span className="text-muted-foreground">{kitchenTicketData.time}</span>
              </div>
              {kitchenTicketData.guestCount > 0 && (
                <p className="text-xs text-muted-foreground">عدد الضيوف: {kitchenTicketData.guestCount}</p>
              )}
              <div className="border-t border-dashed border-border pt-2 space-y-2">
                {kitchenTicketData.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-lg font-bold text-primary min-w-[28px]">{item.qty}×</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">{item.name}</p>
                      {item.note && <p className="text-xs text-amber-600 mt-0.5">📝 {item.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
              {kitchenTicketData.orderNote && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2 text-xs text-amber-800 dark:text-amber-300">
                  📝 {kitchenTicketData.orderNote}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground text-center pt-1">كاشير: {kitchenTicketData.cashierName}</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowKitchenTicket(false)} className="flex-1">إغلاق</Button>
            <Button onClick={() => { window.print(); setShowKitchenTicket(false); }} className="flex-1 gap-1">
              <Printer className="h-4 w-4" />
              طباعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Data Modal */}
      <CustomerDataModal
        open={showCustomerDataModal}
        onOpenChange={setShowCustomerDataModal}
        subtotal={cartTotals.subtotal}
        discountPct={10}
        dataOwnerId={dataOwnerId || ""}
        onApply={(data) => {
          setCustomerDataDiscount(data);
          setShowCustomerDataModal(false);
          toast.success(`✅ تم تطبيق خصم ${data.discountPct}% — وفّر العميل ₪${data.discountAmount.toFixed(2)}`);
        }}
        onSkip={() => {
          setCustomerDataDiscount(null);
          setShowCustomerDataModal(false);
        }}
      />
    </div>
  );
};

export default POSPage;
