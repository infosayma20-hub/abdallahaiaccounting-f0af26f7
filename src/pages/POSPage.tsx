import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePOSOffline } from "@/hooks/usePOSOffline";
import { usePBXCallListener } from "@/hooks/usePBXCallListener";
import { openCashDrawer } from "@/lib/cash-drawer";
import OfflineStatusBar from "@/components/pos/OfflineStatusBar";
import SyncLogSheet from "@/components/pos/SyncLogSheet";
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
  FileText, Keyboard, MoreHorizontal, RefreshCw, ChefHat, Sun, Moon, Phone, MapPin, Send, ClipboardList,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import TableSelectorBar, { type TableBarItem } from "@/components/pos/TableSelectorBar";
import AllOrdersSheet from "@/components/pos/AllOrdersSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import POSReceiptDialog from "@/components/POSReceiptDialog";
import ShiftSummaryReceipt from "@/components/ShiftSummaryReceipt";
import InvoiceHistoryDrawer from "@/components/pos/InvoiceHistoryDrawer";
import CallCenterDispatchDialog from "@/components/pos/CallCenterDispatchDialog";
import PendingOrdersPanel from "@/components/pos/PendingOrdersPanel";
import DispatchedOrdersLog from "@/components/pos/DispatchedOrdersLog";
import CustomerDataModal from "@/components/pos/CustomerDataModal";
import { type SelectedModifier } from "@/components/pos/ModifierModal";
import InlineAddonPanel from "@/components/pos/InlineAddonPanel";
import QuickModifierBar from "@/components/pos/QuickModifierBar";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";
import { dispatchPrintJob, type PrintLine } from "@/lib/pos-print";
import { usePrintBridge, type PrintOrder as BridgePrintOrder } from "@/hooks/usePrintBridge";
import InventoryInputModal from "@/components/pos/InventoryInputModal";
import PurchaseModal from "@/components/pos/PurchaseModal";
import ExpenseModal from "@/components/pos/ExpenseModal";
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
import { multiWordMatchAny } from "@/lib/utils";

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
  customerId: string | null;
  customerPhone: string;
  posCustomerId: string | null;
  orderDiscount: number;
  orderDiscountType: "fixed" | "percent";
  orderNote: string;
  selectedCartIndex: number | null;
  tableId: string | null;
  tableName: string | null;
  guestCount: number;
  guestName: string;
  orderType: "dine_in" | "takeaway" | "delivery";
  deliveryAddress: string;
  callCenterOrderId?: string | null;
  callCenterPaymentMethod?: string | null;
  callCenterSourceApp?: string | null;
}

interface POSCustomer {
  id: string;
  name: string | null;
  whatsapp: string | null;
  address: string | null;
  total_visits: number | null;
  total_spent: number | null;
}

const POSThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="h-8 w-8 rounded-lg flex items-center justify-center bg-white/10 text-white/50 hover:text-white/90 hover:bg-white/20 transition-all group relative"
      title={theme === "dark" ? "وضع فاتح" : "وضع داكن"}
    >
      {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      <span className="absolute top-full mt-1.5 px-2 py-1 rounded text-[10px] font-medium bg-black/90 text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
        {theme === "dark" ? "وضع فاتح" : "وضع داكن"}
      </span>
    </button>
  );
};

const createNewOrder = (index: number, tableId?: string | null, tableName?: string | null, guestCount?: number, guestName?: string): OrderTab => ({
  id: crypto.randomUUID(),
  name: tableName ? `${tableName}` : `طلب ${index}`,
  cart: [],
  customerName: guestName || "",
  customerId: null,
  customerPhone: "",
  posCustomerId: null,
  orderDiscount: 0,
  orderDiscountType: "fixed",
  orderNote: "",
  selectedCartIndex: null,
  tableId: tableId || null,
  tableName: tableName || null,
  guestCount: guestCount || 1,
  guestName: guestName || "",
  orderType: tableId ? "dine_in" : "takeaway",
  deliveryAddress: "",
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
  kitchen_station_id: string | null;
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
  cash_box_id?: string | null;
}

interface Company {
  id: string;
  name: string;
  logo_url?: string;
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
    backgroundColor: isActive ? cat.color : cat.color + "18",
    borderColor: isSortMode ? "hsl(var(--primary))" : isActive ? cat.color : cat.color + "60",
    color: isActive ? "#fff" : undefined,
    boxShadow: isDragging ? "0 8px 25px rgba(0,0,0,0.2)" : isActive ? `0 2px 8px ${cat.color}40` : `0 1px 3px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)`,
    borderStyle: isSortMode ? "dashed" as const : "solid" as const,
    borderWidth: "1.5px",
    cursor: isSortMode ? "grab" as const : "pointer" as const,
  };
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...(isSortMode ? listeners : {})}
      onClick={onClick}
      className={`h-7 px-3 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all border select-none ${
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
  const { printAll: bridgePrintAll } = usePrintBridge();

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
  const [employees, setEmployees] = useState<{ id: string; full_name: string; base_salary: number; account_code?: string; job_title?: string }[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; full_name: string; account_code?: string; job_title?: string } | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [employeeBalance, setEmployeeBalance] = useState(0);
  const [employeeNote, setEmployeeNote] = useState("");

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
  const [showAllOrders, setShowAllOrders] = useState(false);

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

  const setCustomerName = useCallback((name: string, contactId?: string | null, phone?: string, posCustomerId?: string | null) => {
    updateActiveOrder(o => ({
      ...o,
      customerName: name,
      customerId: contactId !== undefined ? contactId : o.customerId,
      customerPhone: phone !== undefined ? phone : o.customerPhone,
      posCustomerId: posCustomerId !== undefined ? posCustomerId : o.posCustomerId,
      name: !o.tableId ? (name || `طلب ${orderCounter.current}`) : o.name,
    }));
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
  const [posCustomerResults, setPosCustomerResults] = useState<POSCustomer[]>([]);

  // Dialogs
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeviceBlocked, setShowDeviceBlocked] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showShortcutsGuide, setShowShortcutsGuide] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showCustomerDataModal, setShowCustomerDataModal] = useState(false);
  const [customerDataDiscount, setCustomerDataDiscount] = useState<{
    discountPct: number; discountAmount: number; customerId: string | null;
    contactType: string; contactValue: string; customerName: string;
  } | null>(null);
  // Quick add customer
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [closingCashUSD, setClosingCashUSD] = useState("");
  const [closingCashJOD, setClosingCashJOD] = useState("");
  const [cashBoxes, setCashBoxes] = useState<{ id: string; name: string; type: string }[]>([]);
  const [selectedCashBoxId, setSelectedCashBoxId] = useState<string>("");
  const [rememberCashBox, setRememberCashBox] = useState(false);

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
  const [changeCurrency, setChangeCurrency] = useState<string>("ILS");
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [manualChangeAmount, setManualChangeAmount] = useState<string | null>(null);
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
  const [posReturnPolicy, setPosReturnPolicy] = useState({ show: true, days: 7 });
  const [posAutoPrint, setPosAutoPrint] = useState(true);
  const [posAllowOrderTransfer, setPosAllowOrderTransfer] = useState(false);
  const [posRequireCashBox, setPosRequireCashBox] = useState(false);
  const [detectedBranchId, setDetectedBranchId] = useState<string | null>(null);

  // Derived display name for POS terminal/cash box
  const posDisplayName = (session?.cash_box_id && cashBoxes.find(b => b.id === session.cash_box_id)?.name) || terminal?.name || "نقطة بيع";

  // Kitchen
  const [showKitchenTicket, setShowKitchenTicket] = useState(false);
  const [kitchenTicketData, setKitchenTicketData] = useState<any>(null);
  const [savingToTable, setSavingToTable] = useState(false);

   // Shift Summary
   const [showShiftSummary, setShowShiftSummary] = useState(false);
   const [shiftSummaryData, setShiftSummaryData] = useState<any>(null);

   // Invoice History
   const [showInvoiceHistory, setShowInvoiceHistory] = useState(false);
   const [recallBanner, setRecallBanner] = useState<{ invoiceId: string; orderNumber: string; reason: string; approvedBy: string | null } | null>(null);

   // POS User Permissions
   const [posPerms, setPosPerms] = useState<{
     can_open_register: boolean;
     can_close_register: boolean;
     can_view_shift_details: boolean;
     can_view_profits: boolean;
     can_apply_discount: boolean;
     max_discount_percent: number;
     can_edit_prices: boolean;
     can_void_sales: boolean;
     can_refund: boolean;
     allow_credit_sale: boolean;
     open_cash_drawer: boolean;
     can_remove_cart_items: boolean;
     can_view_invoice_history: boolean;
     can_edit_invoices: boolean;
     can_cancel_invoices: boolean;
     require_manager_for_invoices: boolean;
     print_invoices: boolean;
     resend_invoice: boolean;
     manage_products_categories: boolean;
     edit_products: boolean;
     delete_products: boolean;
     view_inventory: boolean;
     add_customer: boolean;
     view_customers: boolean;
     edit_customers: boolean;
     view_sales_report: boolean;
     export_reports: boolean;
     view_invoice_log: boolean;
     edit_cancel_invoices: boolean;
     can_add_inventory: boolean;
     can_create_product: boolean;
     can_record_purchases: boolean;
     can_pay_purchases_cash: boolean;
     can_create_supplier: boolean;
     can_affect_inventory_on_purchase: boolean;
     can_record_expenses: boolean;
     can_create_expense_category: boolean;
   }>({
     can_open_register: true, can_close_register: true, can_view_shift_details: true, can_view_profits: false,
      can_apply_discount: true, max_discount_percent: 100, can_edit_prices: true, can_void_sales: true,
      can_refund: true, allow_credit_sale: true, open_cash_drawer: false, can_remove_cart_items: true,
      can_view_invoice_history: true, can_edit_invoices: true, can_cancel_invoices: true, require_manager_for_invoices: true,
      print_invoices: true, resend_invoice: false,
      manage_products_categories: false, edit_products: false, delete_products: false, view_inventory: false,
      add_customer: true, view_customers: false, edit_customers: false,
     view_sales_report: false, export_reports: false,
     view_invoice_log: false, edit_cancel_invoices: false,
     can_add_inventory: false, can_create_product: false, can_record_purchases: false,
     can_pay_purchases_cash: false, can_create_supplier: false, can_affect_inventory_on_purchase: false,
     can_record_expenses: false, can_create_expense_category: false,
   });

   // Financial operation modals
   const [showInventoryInput, setShowInventoryInput] = useState(false);
   const [showPurchaseModal, setShowPurchaseModal] = useState(false);
   const [showExpenseModal, setShowExpenseModal] = useState(false);
   const [showOpsDropdown, setShowOpsDropdown] = useState(false);
    const [showSyncLog, setShowSyncLog] = useState(false);
     const [showCallCenterDispatch, setShowCallCenterDispatch] = useState(false);
     const [showDispatchLog, setShowDispatchLog] = useState(false);
     const [isCallCenter, setIsCallCenter] = useState(false);
     const [pendingDispatchCount, setPendingDispatchCount] = useState(0);

   // Modifiers
   const [modifierGroups, setModifierGroups] = useState<any[]>([]);
   const [productModifierMap, setProductModifierMap] = useState<Record<string, string[]>>({});
    const [showModifierModal, setShowModifierModal] = useState(false);
    const [modifierProduct, setModifierProduct] = useState<Product | null>(null);
    const [openAddonProductId, setOpenAddonProductId] = useState<string | null>(null);
   const [activeQuickMod, setActiveQuickMod] = useState<string | null>(null);

   const userId = user?.id;
   const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
    const isAdmin = userId === dataOwnerId; // Employee has different dataOwnerId

  // Load tables when picker opens
  useEffect(() => {
    if (!showTablePicker || !dataOwnerId) return;
    (async () => {
      const { data } = await supabase
        .from("restaurant_tables")
        .select("id, name, seats, status")
        .eq("user_id", dataOwnerId)
        .eq("is_active", true)
        .order("name");
      if (data) {
        setAvailableTables(data.map((t: any) => ({
          id: t.id,
          name: t.name,
          seats: t.seats || 0,
          status: t.status || "available",
          section_name: t.section?.name || "",
        })));
      }
    })();
  }, [showTablePicker, dataOwnerId]);

   // ── Offline Mode ──
   const offlineMode = usePOSOffline({
     userId: dataOwnerId || userId || null,
     sessionId: session?.id || null,
     terminalId: terminal?.id || null,
     companyId: company?.id || null,
    });

   // ── PBX Call Listener ──
   const handlePBXCall = useCallback((event: any) => {
     // Create a new order tab with customer info
     orderCounter.current += 1;
     const newOrder = createNewOrder(
       orderCounter.current,
       undefined,
       undefined,
       undefined,
       event.customer_name || event.caller_number
     );
     setOrders(prev => [...prev, newOrder]);
     setActiveOrderIndex(prev => prev + 1);

     // Set customer data on next tick after order is created
     setTimeout(() => {
       setCustomerName(
         event.customer_name || event.caller_number,
         null,
         event.customer_phone || event.caller_number,
         event.customer_id || null
       );
       if (event.customer_address) {
         updateActiveOrder(o => ({
           ...o,
           orderType: 'توصيل' as any,
           deliveryAddress: event.customer_address || '',
         }));
       }
     }, 100);
   }, [setCustomerName, updateActiveOrder]);

   usePBXCallListener({
     userId: dataOwnerId || userId || null,
     enabled: !!session,
     onIncomingCall: handlePBXCall,
   });

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

  // Load POS user permissions
  useEffect(() => {
    if (!userId || !dataOwnerId || isAdmin) return;
    const loadPerms = async () => {
      // Find pos_user linked to this auth user
      const { data: posUser } = await supabase
        .from("pos_users")
        .select("id, is_call_center")
        .eq("auth_user_id", userId)
        .maybeSingle();
      if (!posUser) return;
      if ((posUser as any).is_call_center) setIsCallCenter(true);
      const { data: perms } = await supabase
        .from("pos_user_permissions")
        .select("*")
        .eq("pos_user_id", posUser.id)
        .maybeSingle();
      if (perms) {
        const p = perms as any;
        setPosPerms({
          can_open_register: p.can_open_register ?? true,
          can_close_register: p.can_close_register ?? true,
          can_view_shift_details: p.can_view_shift_details ?? true,
          can_view_profits: p.can_view_profits ?? false,
          can_apply_discount: p.can_apply_discount ?? true,
          max_discount_percent: p.max_discount_percent ?? 100,
          can_edit_prices: p.can_edit_prices ?? true,
          can_void_sales: p.can_void_sales ?? false,
          can_refund: p.can_refund ?? false,
          allow_credit_sale: p.allow_credit_sale ?? false,
          open_cash_drawer: p.open_cash_drawer ?? false,
          can_remove_cart_items: p.can_remove_cart_items ?? true,
           can_view_invoice_history: p.can_view_invoice_history ?? true,
           can_edit_invoices: p.can_edit_invoices ?? false,
           can_cancel_invoices: (p as any).can_cancel_invoices ?? false,
           require_manager_for_invoices: p.require_manager_for_invoices ?? true,
          print_invoices: p.print_invoices ?? true,
          resend_invoice: p.resend_invoice ?? false,
          manage_products_categories: p.manage_products_categories ?? false,
          edit_products: p.edit_products ?? false,
          delete_products: p.delete_products ?? false,
          view_inventory: p.view_inventory ?? false,
          add_customer: p.add_customer ?? false,
          view_customers: p.view_customers ?? false,
          edit_customers: p.edit_customers ?? false,
          view_sales_report: p.view_sales_report ?? false,
          export_reports: p.export_reports ?? false,
          view_invoice_log: p.view_invoice_log ?? false,
          edit_cancel_invoices: p.edit_cancel_invoices ?? false,
          can_add_inventory: p.can_add_inventory ?? false,
          can_create_product: p.can_create_product ?? false,
          can_record_purchases: p.can_record_purchases ?? false,
          can_pay_purchases_cash: p.can_pay_purchases_cash ?? false,
          can_create_supplier: p.can_create_supplier ?? false,
          can_affect_inventory_on_purchase: p.can_affect_inventory_on_purchase ?? false,
          can_record_expenses: p.can_record_expenses ?? false,
          can_create_expense_category: p.can_create_expense_category ?? false,
         });
      }
    };
    loadPerms();
  }, [userId, dataOwnerId, isAdmin]);

  // Track pending dispatched orders count for call center
  useEffect(() => {
    if (!isCallCenter || !dataOwnerId) return;
    const loadCount = async () => {
      const { count } = await supabase
        .from("call_center_orders" as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", dataOwnerId)
        .eq("status", "pending");
      setPendingDispatchCount(count || 0);
    };
    loadCount();
    const ch = supabase.channel("dispatch-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_center_orders", filter: `user_id=eq.${dataOwnerId}` }, () => loadCount())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isCallCenter, dataOwnerId]);

  useEffect(() => {
    if (!userId || !dataOwnerId) return;
    initializePOS();
  }, [userId, dataOwnerId]);

  // Refresh products & categories when page regains focus (e.g. after editing in inventory)
  useEffect(() => {
    const handleFocus = () => {
      if (dataOwnerId && session) {
        loadProducts();
        loadCategories();
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [dataOwnerId, session]);

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
          customerId: (orderData as any).customer_id || null,
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
      setCompany(comp ? { id: comp.id, name: comp.name, logo_url: comp.logo_url } : null);

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

        // Load POS settings needed at startup (receipt policy + default opening cash)
        const { data: posSettings } = await supabase
          .from("company_settings" as any)
          .select("pos_show_return_policy, pos_return_policy_days, pos_default_opening_balance, pos_allow_order_transfer, pos_require_cash_box, pos_auto_print, logo_url")
          .eq("user_id", dataOwnerId)
          .maybeSingle();

        // If company doesn't have logo from pos_companies, try company_settings
        if (!company?.logo_url && (posSettings as any)?.logo_url) {
          setCompany(prev => prev ? { ...prev, logo_url: (posSettings as any).logo_url } : prev);
        }

        if (posSettings) {
          setPosReturnPolicy({
            show: (posSettings as any).pos_show_return_policy ?? true,
            days: (posSettings as any).pos_return_policy_days ?? 7,
          });
          setPosAllowOrderTransfer((posSettings as any).pos_allow_order_transfer ?? false);
          setPosRequireCashBox((posSettings as any).pos_require_cash_box ?? false);
          setPosAutoPrint((posSettings as any).pos_auto_print ?? true);
        }

        const rawDefaultOpeningCash = (posSettings as any)?.pos_default_opening_balance;
        if (rawDefaultOpeningCash && Number(rawDefaultOpeningCash) > 0) {
          setOpeningCash(String(Number(rawDefaultOpeningCash)));
        }

        const { data: sessions } = await supabase
          .from("pos_sessions")
          .select("*")
          .eq("user_id", dataOwnerId)
          .eq("state", "open")
          .eq("cashier_auth_user_id", userId)
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
            cash_box_id: (sessions[0] as any).cash_box_id || null,
          });

          // Detect branch from cash box name for existing session
          const existingBoxId = (sessions[0] as any).cash_box_id;
          if (existingBoxId && dataOwnerId) {
            const { data: boxData } = await supabase
              .from("cash_boxes")
              .select("name, branch_id")
              .eq("id", existingBoxId)
              .maybeSingle();
            // Direct branch_id link (preferred)
            if ((boxData as any)?.branch_id) {
              setDetectedBranchId((boxData as any).branch_id);
            } else if (boxData?.name) {
              // Fallback: name matching
              const { data: allBranches } = await supabase
                .from("branches")
                .select("id, name")
                .eq("user_id", dataOwnerId)
                .eq("is_active", true);
              if (allBranches) {
                const boxNameNorm = boxData.name.trim();
                const matched = allBranches.find(br => 
                  boxNameNorm.includes(br.name) || br.name.includes(boxNameNorm.split(/\s+/)[0])
                );
                setDetectedBranchId(matched?.id || null);
              }
            }
          }
        } else {
          // ── Device fingerprint check (only if enabled in settings) ──
          const { data: csSettings } = await supabase
            .from("company_settings" as any)
            .select("pos_require_device_fingerprint")
            .eq("user_id", comp.user_id || userId)
            .maybeSingle();
          
          if ((csSettings as any)?.pos_require_device_fingerprint) {
            const { getDeviceFingerprint } = await import("@/lib/device-fingerprint");
            const fingerprint = await getDeviceFingerprint();
            const { data: deviceRecord } = await supabase
              .from("pos_devices")
              .select("id, is_active, device_name")
              .eq("device_fingerprint", fingerprint)
              .eq("company_id", comp.id)
              .maybeSingle();

            if (!deviceRecord || !deviceRecord.is_active) {
              setShowDeviceBlocked(true);
              setLoading(false);
              return;
            }

            await supabase.from("pos_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", deviceRecord.id);
          }

          // Load POS cash boxes for shift opening
          const { data: boxes } = await supabase
            .from("cash_boxes")
            .select("id, name, type, branch_id")
            .eq("user_id", dataOwnerId)
            .eq("type", "pos")
            .eq("is_active", true);
          const boxesWithCallCenter = [
            ...(boxes || []),
            { id: "__call_center__", name: "كول سنتر", type: "call_center" },
          ];
          setCashBoxes(boxesWithCallCenter);
          // Auto-select from device binding (localStorage)
          const savedBoxId = localStorage.getItem(`pos_default_cash_box_${dataOwnerId}`);
          if (savedBoxId && boxes?.some(b => b.id === savedBoxId)) {
            setSelectedCashBoxId(savedBoxId);
            setRememberCashBox(true);
          } else if (boxes && boxes.length === 1) {
            setSelectedCashBoxId(boxes[0].id);
          }
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
      .select("id, name, sell_price, buy_price, quantity, category, pos_category_id, unit, sku, barcode, tax_rate, is_pos_available, color, image_url, min_quantity, sort_order, kitchen_station_id")
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
        kitchen_station_id: (p as any).kitchen_station_id || null,
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
    if (!userId || !dataOwnerId || !(isAdmin || posPerms.manage_products_categories) || !newCatName.trim() || savingCategory) return;
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
    if (!dataOwnerId || !(isAdmin || posPerms.manage_products_categories)) return;
    const { error } = await supabase.from("pos_categories").delete().eq("id", catId).eq("user_id", dataOwnerId);
    if (error) { toast.error("خطأ: " + error.message); return; }
    toast.success("تم حذف التصنيف");
    await loadCategories();
    if (selectedCategory !== "الكل") setSelectedCategory("الكل");
  };

  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<{ id: string; name: string } | null>(null);

  const handleDeleteProduct = async (productId: string) => {
    if (!dataOwnerId || !(isAdmin || posPerms.delete_products)) return;
    setDeletingProductId(productId);
    try {
      const { error } = await supabase.from("products").delete().eq("id", productId).eq("user_id", dataOwnerId);
      if (error) { toast.error("خطأ في الحذف: " + error.message); return; }
      setProducts(prev => prev.filter(p => p.id !== productId));
      toast.success("تم حذف المنتج بنجاح");
      setConfirmDeleteProduct(null);
    } catch {
      toast.error("حدث خطأ أثناء الحذف");
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleSaveNewProduct = async () => {
    if (!userId || !dataOwnerId || !(isAdmin || posPerms.manage_products_categories) || !newProduct.name.trim() || savingProduct) return;
    
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

    // Fallback: if no rates found for foreign currencies, fetch from free API
    const foreignCodes = ['USD', 'EUR', 'JOD', 'GBP', 'EGP', 'TRY'];
    const missingCodes = foreignCodes.filter(c => !rates[c] || rates[c] === 1);
    if (missingCodes.length > 0) {
      try {
        // Try fawazahmed0 first (supports JOD and EGP accurately)
        const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/ils.json');
        if (res.ok) {
          const json = await res.json();
          const ilsRates = json?.ils;
          if (ilsRates) {
            for (const code of missingCodes) {
              const lc = code.toLowerCase();
              if (ilsRates[lc] && ilsRates[lc] > 0) {
                const rateVal = parseFloat((1 / ilsRates[lc]).toFixed(6));
                if (!rates[code] || rates[code] === 1) {
                  rates[code] = rateVal;
                  details[code] = { rate: rateVal, date: new Date().toISOString().split('T')[0], source: 'api_fallback', posOverride: null };
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('Fallback exchange rate fetch failed:', e);
        // Try frankfurter as second fallback
        try {
          const stillMissing = foreignCodes.filter(c => !rates[c] || rates[c] === 1);
          if (stillMissing.length > 0) {
            const res2 = await fetch(`https://api.frankfurter.app/latest?from=ILS&to=${stillMissing.join(',')}`);
            if (res2.ok) {
              const json2 = await res2.json();
              if (json2?.rates) {
                for (const code of stillMissing) {
                  if (json2.rates[code] && json2.rates[code] > 0) {
                    const rateVal = parseFloat((1 / json2.rates[code]).toFixed(6));
                    rates[code] = rateVal;
                    details[code] = { rate: rateVal, date: new Date().toISOString().split('T')[0], source: 'api_fallback', posOverride: null };
                  }
                }
              }
            }
          }
        } catch (e2) {
          console.warn('Secondary fallback exchange rate fetch failed:', e2);
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
      .eq("contact_type", "عميل")
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
    // Load HR employees
    const { data: empData } = await supabase
      .from("employees")
      .select("id, full_name, base_salary, job_title")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .order("full_name");
    // Load POS users (cashiers) and merge with employees
    const { data: posUsersData } = await supabase
      .from("pos_users")
      .select("id, name, employee_id")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .order("name");
    // Resolve each employee's linked account code
    const { data: accData } = await supabase
      .from("accounts")
      .select("account_code, account_name")
      .eq("user_id", dataOwnerId)
      .like("account_code", "118%")
      .eq("is_active", true);
    
    const empMap = new Map<string, boolean>();
    const emps: { id: string; full_name: string; base_salary: number; account_code?: string; job_title?: string }[] = [];
    
    // Add HR employees first
    (empData || []).forEach(emp => {
      empMap.set(emp.id, true);
      empMap.set(emp.full_name.toLowerCase(), true);
      const linked = (accData || []).find(a => a.account_name === `ذمم موظف - ${emp.full_name}`);
      emps.push({ ...emp, job_title: emp.job_title || undefined, account_code: linked?.account_code || undefined });
    });
    
    // Add POS users that aren't already in the employees list
    (posUsersData || []).forEach(pu => {
      if (pu.employee_id && empMap.has(pu.employee_id)) return;
      if (empMap.has(pu.name.toLowerCase())) return;
      const linked = (accData || []).find(a => a.account_name === `ذمم موظف - ${pu.name}`);
      emps.push({ id: pu.id, full_name: pu.name, base_salary: 0, account_code: linked?.account_code || undefined });
    });
    
    setEmployees(emps);
  };

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch) return employees;
    return employees.filter(e => multiWordMatchAny(employeeSearch, e.full_name));
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
    return contacts.filter(c => multiWordMatchAny(customerSearch, c.contact_name));
  }, [contacts, customerSearch]);

  // Search POS customers by name or phone
  const searchPosCustomers = useCallback(async (query: string) => {
    if (!query || query.length < 2 || !dataOwnerId) { setPosCustomerResults([]); return; }
    const q = `%${query}%`;
    const { data } = await supabase
      .from("pos_customers")
      .select("id, name, whatsapp, address, total_visits, total_spent")
      .eq("user_id", dataOwnerId)
      .or(`name.ilike.${q},whatsapp.ilike.${q}`)
      .limit(10);
    setPosCustomerResults((data as POSCustomer[]) || []);
  }, [dataOwnerId]);

  const handleQuickAddCustomer = async (overrideName?: string) => {
    const nameToUse = overrideName || newCustomerName;
    if (!nameToUse.trim() || !dataOwnerId) return;
    setSavingCustomer(true);
    try {
      // Save only to pos_customers (separate from main contacts)
      const { data: posCustomer, error } = await supabase
        .from("pos_customers")
        .insert({
          user_id: dataOwnerId,
          name: nameToUse.trim(),
          whatsapp: newCustomerPhone.trim() || null,
          address: newCustomerAddress.trim() || null,
          total_visits: 0,
          total_spent: 0,
          marketing_consent: true,
          consent_date: new Date().toISOString(),
        } as any)
        .select("id, name, whatsapp")
        .single();
      if (error) throw error;

      if (posCustomer) {
        setCustomerName(posCustomer.name || "", null, posCustomer.whatsapp || "", posCustomer.id);
        setCustomerSearch("");
        setShowContactDropdown(false);
        toast.success(`تمت إضافة الزبون "${posCustomer.name}" بنجاح`);
      }
    } catch (err: any) {
      toast.error("فشل في إضافة الزبون: " + (err.message || "خطأ غير معروف"));
    }
    setSavingCustomer(false);
    setShowQuickAddCustomer(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerAddress("");
  };

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
      filtered = filtered.filter(
        (p) => multiWordMatchAny(searchQuery, p.name, p.sku, p.barcode)
      );
    }
    // When "الكل" is selected, sort products grouped by category order
    if (selectedCategory === "الكل" && !searchQuery) {
      const catOrderMap = new Map<string, number>();
      posCategories.forEach((c, i) => catOrderMap.set(c.id, i));
      filtered.sort((a, b) => {
        const aCatId = a.pos_category_id || posCategories.find(c => c.name === a.category)?.id || "";
        const bCatId = b.pos_category_id || posCategories.find(c => c.name === b.category)?.id || "";
        const aOrder = catOrderMap.get(aCatId) ?? 9999;
        const bOrder = catOrderMap.get(bCatId) ?? 9999;
        return aOrder - bOrder;
      });
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
    if (!over || active.id === over.id || !userId) return;
    const oldIndex = posCategories.findIndex(c => c.id === active.id);
    const newIndex = posCategories.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(posCategories, oldIndex, newIndex);
    setPosCategories(reordered);
    // Save per-user category order preference
    const orderIds = reordered.map(c => c.id);
    await supabase.from("pos_user_preferences").upsert({
      auth_user_id: userId,
      preference_key: "category_order",
      preference_value: { order: orderIds },
    } as any, { onConflict: "auth_user_id,preference_key" });
    toast.success("تم حفظ ترتيب التصنيفات");
  }, [posCategories, userId]);

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
    // Save per-user product order preference
    const orderIds = reordered.map(p => p.id);
    const prefKey = selectedCategory === "الكل" ? "product_order_all" : `product_order_${selectedCategory}`;
    await supabase.from("pos_user_preferences").upsert({
      auth_user_id: userId,
      preference_key: prefKey,
      preference_value: { order: orderIds },
    } as any, { onConflict: "auth_user_id,preference_key" });
    toast.success("تم حفظ ترتيب المنتجات");
  }, [filteredProducts, userId, isAdmin, selectedCategory]);

  // Cart operations
  const addToCart = useCallback((product: Product) => {
    // Check if product has modifier groups
    const groupIds = productModifierMap[product.id];
    if (groupIds && groupIds.length > 0) {
      // Toggle inline addon panel instead of modal
      setOpenAddonProductId(prev => prev === product.id ? null : product.id);
      return;
    }

    setOpenAddonProductId(null);
    addToCartDirect(product);
  }, [cart, productModifierMap]);

  const addToCartDirect = useCallback((product: Product, modifiers?: SelectedModifier[], note?: string, qty?: number) => {
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
    // Enforce price editing permission
    if (field === "unit_price" && !isAdmin && !posPerms.can_edit_prices) return;
    // Enforce discount permission and max discount
    if (field === "discount_pct") {
      if (!isAdmin && !posPerms.can_apply_discount) { toast.error("ليس لديك صلاحية تطبيق الخصم"); return; }
      if (!isAdmin && value > posPerms.max_discount_percent) { toast.error(`الحد الأقصى للخصم ${posPerms.max_discount_percent}%`); value = posPerms.max_discount_percent; }
    }
    setCart((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      const { qty, unit_price, discount_pct } = updated[index];
      updated[index].total = qty * unit_price * (1 - discount_pct / 100);
      return updated;
    });
  }, [isAdmin, posPerms]);

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
    if (!isAdmin && !posPerms.can_open_register) { toast.error("ليس لديك صلاحية فتح الوردية"); return; }
    if (!selectedCashBoxId) {
      toast.error("يجب اختيار الصندوق قبل فتح الوردية");
      return;
    }
    const isCallCenter = selectedCashBoxId === "__call_center__";
    const cash = isCallCenter ? 0 : (parseFloat(openingCash) || 0);
    const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";

    const actualCashBoxId = isCallCenter ? null : (selectedCashBoxId || null);

    const { data, error } = await supabase
      .from("pos_sessions")
      .insert({
        user_id: dataOwnerId,
        company_id: company.id,
        terminal_id: terminal.id,
        cashier_name: displayName,
        cashier_auth_user_id: userId,
        opening_cash: cash,
        state: "open",
        cash_box_id: actualCashBoxId,
      } as any)
      .select()
      .single();

    if (error) {
      toast.error("خطأ في فتح الوردية");
      return;
    }

    // Save/remove device binding
    if (rememberCashBox && selectedCashBoxId) {
      localStorage.setItem(`pos_default_cash_box_${dataOwnerId}`, selectedCashBoxId);
    } else {
      localStorage.removeItem(`pos_default_cash_box_${dataOwnerId}`);
    }

    setSession({
      id: data.id,
      state: "open",
      opening_cash: cash,
      total_sales: 0,
      total_orders: 0,
      opened_at: data.opened_at,
      cashier_name: displayName,
      cash_box_id: actualCashBoxId,
    });
    setShowOpenShift(false);
    toast.success("تم فتح الوردية بنجاح");

    // Detect branch from cash box name
    if (selectedCashBoxId && dataOwnerId) {
      const selectedBox = cashBoxes.find(b => b.id === selectedCashBoxId);
      const boxName = selectedBox?.name || "";
      // Direct branch_id link (preferred)
      if ((selectedBox as any)?.branch_id) {
        setDetectedBranchId((selectedBox as any).branch_id);
      } else {
        const { data: allBranches } = await supabase
          .from("branches")
          .select("id, name")
          .eq("user_id", dataOwnerId)
          .eq("is_active", true);
        if (allBranches && boxName) {
          const boxNameNorm = boxName.trim();
          const matched = allBranches.find(br => 
            boxNameNorm.includes(br.name) || br.name.includes(boxNameNorm.split(/\s+/)[0])
          );
          setDetectedBranchId(matched?.id || null);
        }
      }
    }

    // Password change check disabled — no longer forcing first-login password change

    // Load per-user UI preferences
    if (userId) {
      const { data: prefs } = await supabase
        .from("pos_user_preferences")
        .select("preference_key, preference_value")
        .eq("auth_user_id", userId);
      if (prefs) {
        for (const p of prefs) {
          if (p.preference_key === "card_size") {
            const sz = (p.preference_value as any)?.size;
            if (sz && ["S", "M", "L"].includes(sz)) setCardSize(sz);
          }
          if (p.preference_key === "category_order") {
            const orderIds = (p.preference_value as any)?.order;
            if (Array.isArray(orderIds) && orderIds.length > 0) {
              setPosCategories(prev => {
                const ordered: POSCategory[] = [];
                for (const id of orderIds) {
                  const cat = prev.find(c => c.id === id);
                  if (cat) ordered.push(cat);
                }
                // Add any new categories not in the saved order
                for (const cat of prev) {
                  if (!ordered.find(c => c.id === cat.id)) ordered.push(cat);
                }
                return ordered;
              });
            }
          }
          // Load per-user product order preferences
          if (p.preference_key.startsWith("product_order_")) {
            const orderIds = (p.preference_value as any)?.order;
            if (Array.isArray(orderIds) && orderIds.length > 0) {
              setProducts(prev => {
                const updated = [...prev];
                orderIds.forEach((id: string, i: number) => {
                  const idx = updated.findIndex(u => u.id === id);
                  if (idx !== -1) updated[idx] = { ...updated[idx], sort_order: i } as any;
                });
                return updated.sort((a, b) => ((a as any).sort_order || 0) - ((b as any).sort_order || 0));
              });
            }
          }
        }
      }
    }
  };

  // Handle password change for first-login cashiers
  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("كلمات المرور غير متطابقة");
      return;
    }
    setChangingPassword(true);
    try {
      // Clear the flag FIRST (before updateUser which may refresh session/tokens)
      if (userId) {
        const { error: rpcErr } = await supabase.rpc("clear_must_change_password" as any);
        if (rpcErr) {
          console.error("Failed to clear must_change_password via RPC, trying direct update:", rpcErr);
          // Fallback: direct update
          await supabase
            .from("pos_users")
            .update({ must_change_password: false } as any)
            .eq("auth_user_id", userId);
        }
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setShowChangePassword(false);
      setNewPassword("");
      setConfirmNewPassword("");
      toast.success("تم تغيير كلمة المرور بنجاح ✅");
    } catch (err: any) {
      toast.error(err.message || "فشل تغيير كلمة المرور");
    }
    setChangingPassword(false);
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
          customer_id: activeOrder.customerId || null,
          guest_count: activeOrder.guestCount,
          guest_name: activeOrder.guestName || null,
          order_type: activeOrder.orderType,
          delivery_address: activeOrder.orderType === "delivery" ? activeOrder.deliveryAddress : null,
          pos_customer_id: activeOrder.posCustomerId || null,
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
            customer_id: activeOrder.customerId || null,
            subtotal: cartTotals.subtotal,
            discount_amount: cartTotals.discount,
            tax_amount: cartTotals.tax,
            total: cartTotals.total,
            state: "draft",
            table_id: activeOrder.tableId,
            guest_count: activeOrder.guestCount,
            guest_name: activeOrder.guestName || null,
            order_type: activeOrder.orderType,
            delivery_address: activeOrder.orderType === "delivery" ? activeOrder.deliveryAddress : null,
            pos_customer_id: activeOrder.posCustomerId || null,
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

        // Link call center order to POS order if applicable
        if (activeOrder.callCenterOrderId && order.id) {
          await supabase
            .from("call_center_orders" as any)
            .update({ pos_order_id: order.id } as any)
            .eq("id", activeOrder.callCenterOrderId);
        }
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
  const handleSendToKitchen = async () => {
    if (cart.length === 0) return;

    const time = new Date().toLocaleTimeString("ar-PS", { hour: "2-digit", minute: "2-digit" });
    const tableName = activeOrder.tableName || activeOrder.customerName || "بدون طاولة";
    const cashierName = session?.cashier_name || "";

    // Build product→station map from loaded products
    const productStationMap = new Map<string, string | null>();
    products.forEach(p => productStationMap.set(p.id, p.kitchen_station_id));

    // Load station names
    const { data: stationsData } = await supabase
      .from("kitchen_stations")
      .select("id, name, color")
      .eq("is_active", true);
    const stationNames = new Map((stationsData || []).map((s: any) => [s.id, { name: s.name, color: s.color }]));

    // Group items by station
    const stationGroups: Record<string, { stationName: string; stationColor: string; items: any[] }> = {};
    const noStationItems: any[] = [];

    cart.forEach(item => {
      const stationId = item.product_id ? productStationMap.get(item.product_id) : null;
      const itemData = { name: item.name, qty: item.qty, note: item.note, modifiers: item.modifiers || [] };
      if (stationId && stationNames.has(stationId)) {
        if (!stationGroups[stationId]) {
          const info = stationNames.get(stationId)!;
          stationGroups[stationId] = { stationName: info.name, stationColor: info.color, items: [] };
        }
        stationGroups[stationId].items.push(itemData);
      } else {
        noStationItems.push(itemData);
      }
    });

    // If no stations defined, put all in one group
    if (Object.keys(stationGroups).length === 0) {
      stationGroups["_default"] = { stationName: "المطبخ", stationColor: "#ef4444", items: noStationItems.length ? noStationItems : cart.map(item => ({ name: item.name, qty: item.qty, note: item.note, modifiers: item.modifiers || [] })) };
    } else if (noStationItems.length > 0) {
      // Attach unassigned items to first station
      const firstKey = Object.keys(stationGroups)[0];
      stationGroups[firstKey].items.push(...noStationItems);
    }

    // Build kitchen ticket data for dialog display
    const tickets = Object.entries(stationGroups).map(([stationId, group]) => ({
      stationId,
      stationName: group.stationName,
      stationColor: group.stationColor,
      items: group.items,
    }));

    setKitchenTicketData({
      tableName,
      guestCount: activeOrder.guestCount,
      cashierName,
      time,
      tickets,
      orderNote: activeOrder.orderNote,
    });
    // Dispatch print jobs per station
    let printedCount = 0;
    let failedCount = 0;
    for (const [stationId, group] of Object.entries(stationGroups)) {
      const lines: PrintLine[] = [
        { text: `🍳 طلب مطبخ — ${group.stationName}`, align: "center", bold: true, size: 2 },
        { text: "", separator: true },
        { text: `طاولة: ${tableName}    ${time}`, align: "right", bold: true },
      ];
      if (activeOrder.guestCount > 0) {
        lines.push({ text: `عدد الضيوف: ${activeOrder.guestCount}`, align: "right" });
      }
      lines.push({ text: "", separator: true });
      group.items.forEach(item => {
        lines.push({ text: `${item.qty}× ${item.name}`, align: "right", bold: true });
        (item.modifiers || []).forEach((m: any) => {
          lines.push({ text: `  ← ${m.option_name}${m.extra_price > 0 ? ` +₪${m.extra_price}` : ""}`, align: "right" });
        });
        if (item.note) lines.push({ text: `  📝 ${item.note}`, align: "right" });
      });
      if (activeOrder.orderNote) {
        lines.push({ text: "", separator: true });
        lines.push({ text: `📝 ${activeOrder.orderNote}`, align: "right" });
      }
      lines.push({ text: "", separator: true });
      lines.push({ text: `كاشير: ${cashierName}`, align: "center" });

      const htmlContent = lines.map(l => l.separator ? "<hr>" : `<p style="text-align:${l.align || "right"};${l.bold ? "font-weight:bold;" : ""}${l.size === 2 ? "font-size:18px;" : ""}">${l.text}</p>`).join("");

      const result = await dispatchPrintJob({
        category: "kitchen",
        stationId: stationId === "_default" ? undefined : stationId,
        content: htmlContent,
        lines,
      });
      if (result.printed.length > 0) printedCount++;
      if (result.failed.length > 0) failedCount++;
    }

    if (printedCount > 0 && failedCount === 0) {
      toast.success(`✅ تم إرسال ${tickets.length} تذكرة مطبخ`);
    } else if (failedCount > 0) {
      toast.warning(`⚠️ تم إرسال ${printedCount} تذكرة، فشل ${failedCount}`);
      // Show dialog only when printing failed so user can retry manually
      setShowKitchenTicket(true);
    } else if (printedCount === 0) {
      // No printers configured — show dialog as fallback
      setShowKitchenTicket(true);
    }
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
        name: order.customer_name || tableName,
        cart: cartItems,
        customerName: order.customer_name || "",
        customerId: (order as any).customer_id || null,
        customerPhone: "",
        posCustomerId: (order as any).pos_customer_id || null,
        orderDiscount: Number(order.discount_amount) || 0,
        orderDiscountType: "fixed",
        orderNote: "",
        selectedCartIndex: null,
        tableId,
        tableName,
        guestCount: (order as any).guest_count || 1,
        guestName: (order as any).guest_name || "",
        orderType: (order as any).order_type || "dine_in",
        deliveryAddress: (order as any).delivery_address || "",
      };
      setOrders(prev => [...prev, newOrder]);
      setActiveOrderIndex(orders.length);
    }
  };

  // Quick save+print for call center orders (auto-set payment method and complete)
  const [quickProcessing, setQuickProcessing] = useState(false);
  const handleQuickSaveAndPrint = async () => {
    if (!userId || !session || cart.length === 0 || !company) return;
    const ccPayment = activeOrder.callCenterPaymentMethod || "cash";
    const sourceApp = activeOrder.callCenterSourceApp || "";
    
    // Map call center payment to POS payment method
    let posPayMethod = ccPayment === "cash" ? "cash" : "card";
    
    // If visa payment, check if source_app matches a delivery app with a visa GL account
    if (ccPayment !== "cash" && sourceApp && dataOwnerId) {
      const { data: appMatch } = await supabase
        .from("delivery_apps" as any)
        .select("visa_gl_account_code, name")
        .eq("user_id", dataOwnerId)
        .eq("is_active", true);
      
      if (appMatch) {
        const matchedApp = (appMatch as any[]).find(
          (app: any) => app.name && sourceApp.toLowerCase().includes(app.name.toLowerCase())
        );
        if (matchedApp?.visa_gl_account_code) {
          // Use the delivery app's specific visa GL account
          posPayMethod = `card:${matchedApp.visa_gl_account_code}`;
        }
        // If no match found, falls back to default "card" (bank account)
      }
    }
    
    // Send to kitchen first
    await handleSendToKitchen();
    
    // Complete with the correct payment method
    setQuickProcessing(true);
    try {
      await handleCompleteOrder(posPayMethod);
    } finally {
      setQuickProcessing(false);
    }
  };

  // Complete order
  const handleCompleteOrder = async (overridePaymentMethod?: string) => {
    if (!userId || !session || cart.length === 0) return;
    if (!company) return;
    // Handle "card:GLCODE" format from delivery app visa accounts
    let effectivePaymentMethod = overridePaymentMethod || paymentMethod;
    let visaGlAccountCode: string | null = null;
    if (effectivePaymentMethod.startsWith("card:")) {
      visaGlAccountCode = effectivePaymentMethod.split(":")[1];
      effectivePaymentMethod = "card";
    }
    if (effectivePaymentMethod === "employee_account" && !selectedEmployee) {
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
            customer_id: activeOrder.customerId || null,
            subtotal: cartTotals.subtotal,
            discount_amount: effectiveDiscount,
            tax_amount: cartTotals.tax,
            total: effectiveTotal,
            order_type: activeOrder.orderType,
            delivery_address: activeOrder.orderType === "delivery" ? activeOrder.deliveryAddress : null,
            pos_customer_id: activeOrder.posCustomerId || null,
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
              customer_id: activeOrder.customerId || null,
              subtotal: cartTotals.subtotal,
              discount_amount: effectiveDiscount,
              tax_amount: cartTotals.tax,
              total: effectiveTotal,
              state: "draft",
              table_id: activeOrder.tableId,
              guest_count: activeOrder.guestCount,
              guest_name: activeOrder.guestName || null,
              order_type: activeOrder.orderType,
              delivery_address: activeOrder.orderType === "delivery" ? activeOrder.deliveryAddress : null,
              pos_customer_id: activeOrder.posCustomerId || null,
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
            customer_id: activeOrder.customerId || null,
            subtotal: cartTotals.subtotal,
            discount_amount: effectiveDiscount,
            tax_amount: cartTotals.tax,
            total: effectiveTotal,
            state: "draft",
            order_type: activeOrder.orderType,
            delivery_address: activeOrder.orderType === "delivery" ? activeOrder.deliveryAddress : null,
            pos_customer_id: activeOrder.posCustomerId || null,
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

      // Link call center order to POS order if applicable
      if (activeOrder.callCenterOrderId && orderId) {
        await supabase
          .from("call_center_orders" as any)
          .update({ pos_order_id: orderId } as any)
          .eq("id", activeOrder.callCenterOrderId);
      }

      const rate = exchangeRates[paymentCurrency] || 1;
      const foreignTotal = paymentCurrency === "ILS" ? effectiveTotal : effectiveTotal / rate;
      const tendered = parseFloat(tenderedAmount) || foreignTotal;
      const changeInForeign = Math.max(0, tendered - foreignTotal);
      const changeILS = paymentCurrency === "ILS" ? changeInForeign : changeInForeign * rate;

      // Determine actual change amounts based on changeCurrency selection
      // If cashier manually overrode the change amount, use that value
      const actualChangeCurrency = paymentCurrency === "ILS" ? "ILS" : changeCurrency;
      let actualChangeILS: number;
      let actualChangeForeign: number;
      if (manualChangeAmount !== null) {
        const manualVal = parseFloat(manualChangeAmount) || 0;
        if (actualChangeCurrency === "ILS") {
          actualChangeILS = manualVal;
          actualChangeForeign = 0;
        } else {
          actualChangeILS = 0;
          actualChangeForeign = manualVal;
        }
      } else {
        actualChangeILS = actualChangeCurrency === "ILS" ? changeILS : 0;
        actualChangeForeign = actualChangeCurrency !== "ILS" ? changeILS / (exchangeRates[actualChangeCurrency] || rate) : 0;
      }

      // Generate survey token if customer data was collected
      const surveyToken = customerDataDiscount ? crypto.randomUUID() : null;

      // Auto-create employee sub-account if missing
      let employeeAccountCode = selectedEmployee?.account_code;
      if (effectivePaymentMethod === "employee_account" && selectedEmployee && !employeeAccountCode) {
        const empAccName = `ذمم موظف - ${selectedEmployee.full_name}`;
        // Check if account already exists
        const { data: existingAcc } = await supabase
          .from("accounts")
          .select("account_code")
          .eq("user_id", dataOwnerId)
          .eq("account_name", empAccName)
          .maybeSingle();
        if (existingAcc) {
          employeeAccountCode = existingAcc.account_code;
        } else {
          // Find next available code under 1180
          const { data: siblingAccs } = await supabase
            .from("accounts")
            .select("account_code")
            .eq("user_id", dataOwnerId)
            .like("account_code", "118%")
            .order("account_code", { ascending: false })
            .limit(1);
          const lastCode = siblingAccs?.[0]?.account_code;
          const nextCode = lastCode ? String(Number(lastCode) + 1) : "1181";
          const { error: createErr } = await supabase.from("accounts").insert({
            user_id: dataOwnerId,
            account_code: nextCode,
            account_name: empAccName,
            account_type: "أصول",
            parent_code: "1180",
            is_system: false,
          });
          if (!createErr) {
            employeeAccountCode = nextCode;
            // Update local state
            setEmployees(prev => prev.map(e => e.id === selectedEmployee.id ? { ...e, account_code: nextCode } : e));
          }
        }
      }

      const { data: result, error: completeError } = await supabase.rpc("complete_pos_order", {
        p_order_id: orderId,
        p_user_id: dataOwnerId,
        p_payments: [{
          method: effectivePaymentMethod,
          amount: cartTotals.total,
          tendered: paymentCurrency === "ILS" ? tendered : tendered * rate,
          change: actualChangeILS,
          change_currency: actualChangeCurrency,
          change_foreign_amount: actualChangeForeign,
          currency: paymentCurrency,
          exchange_rate: rate,
          foreign_amount: foreignTotal,
          rate_source: rateEdited ? "cashier" : "system",
          ...(effectivePaymentMethod === "employee_account" && employeeAccountCode
            ? { employee_account_code: employeeAccountCode }
            : {}),
          ...(visaGlAccountCode ? { visa_gl_account_code: visaGlAccountCode } : {}),
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

      const newTotalSales = (session?.total_sales || 0) + effectiveTotal;
      const newTotalOrders = (session?.total_orders || 0) + 1;

      setSession((prev) =>
        prev
          ? {
              ...prev,
              total_sales: newTotalSales,
              total_orders: newTotalOrders,
            }
          : null
      );

      // Persist totals to DB
      await supabase
        .from("pos_sessions")
        .update({
          total_sales: newTotalSales,
          total_orders: newTotalOrders,
        })
        .eq("id", session.id);

      // Record employee account movement
      if (effectivePaymentMethod === "employee_account" && selectedEmployee) {
        const now = new Date();
        const itemsSummary = cart.map(i => `${i.name} x${i.qty}`).join(", ");
        const noteStr = employeeNote.trim() ? ` | ${employeeNote.trim()}` : "";
        await supabase.from("employee_financial_movements").insert({
          user_id: dataOwnerId,
          employee_id: selectedEmployee.id,
          source_type: "pos_meal",
          source_id: orderId,
          source_reference: res.order_number,
          description: `مسحوبات POS - ${itemsSummary}${noteStr}`.slice(0, 250),
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

      // Fetch display_number and queue_number from the created order
      let displayNumber = '';
      let queueNumber: number | undefined;
      try {
        const { data: orderRow } = await supabase
          .from("pos_orders")
          .select("display_number, queue_number")
          .eq("id", orderId)
          .single();
        if (orderRow) {
          displayNumber = (orderRow as any).display_number || '';
          queueNumber = (orderRow as any).queue_number;
        }
      } catch {}

      const tableName = activeOrder.tableName;
      const receiptInfo = {
        orderId,
        orderNumber: res.order_number,
        displayNumber,
        queueNumber,
        date: new Date().toISOString(),
        cashierName: session.cashier_name,
        companyName: company?.name || "شركتي",
        logoUrl: company?.logo_url || "",
        terminalName: posDisplayName,
        customerName: customerName,
        customerPhone: activeOrder.customerPhone || "",
        tableName: tableName || undefined,
        guestCount: activeOrder.tableId ? activeOrder.guestCount : undefined,
        items: cart.map(item => ({
          name: item.name,
          qty: item.qty,
          unit_price: item.unit_price,
          discount_pct: item.discount_pct,
          total: item.total,
          note: item.note,
          modifiers: item.modifiers || [],
        })),
        subtotal: cartTotals.subtotal,
        tax: cartTotals.tax,
        discount: effectiveDiscount,
        total: effectiveTotal,
        paymentMethod: effectivePaymentMethod,
        tenderedAmount: tendered,
        change: changeILS,
        currency: paymentCurrency,
        exchangeRate: rate,
        foreignAmount: foreignTotal,
        orderNote,
        orderType: activeOrder.orderType,
        deliveryAddress: activeOrder.orderType === "delivery" ? activeOrder.deliveryAddress : "",
      };

      setReceiptData(receiptInfo);
      setShowPayment(false);
      setShowReceipt(true); // Show receipt for viewing (print is still silent via bridge)

      // Fire-and-forget: send to print bridge (local thermal printers)
      try {
        const bridgeOrder: BridgePrintOrder = {
          orderNumber: res.order_number,
          branchName: company?.name || "مطعم الملكي",
          cashier: session.cashier_name,
          tableNumber: activeOrder.tableName || undefined,
          orderType: activeOrder.orderType,
          items: cart.map(item => ({
            id: item.product_id || item.id,
            name: item.name,
            quantity: item.qty,
            price: item.unit_price,
            note: item.note || undefined,
            modifiers: (item.modifiers || []).map(m => ({ option_name: m.option_name, extra_price: m.extra_price })),
          })),
          subtotal: cartTotals.subtotal,
          discount: effectiveDiscount,
          total: effectiveTotal,
          paymentMethod: effectivePaymentMethod === "cash" ? "نقد" : effectivePaymentMethod === "card" ? "بطاقة" : "تحويل",
          currency: paymentCurrency,
          exchangeRate: rate,
          tenderedAmount: tendered,
          change: changeILS,
          orderNote,
        };
        bridgePrintAll(bridgeOrder);
      } catch (printErr) {
        console.warn("Print bridge error:", printErr);
      }

      // Create kitchen tickets (split by station)
      try {
        const { data: stationsData } = await supabase
          .from("kitchen_stations")
          .select("id")
          .eq("is_active", true);

        if (stationsData && stationsData.length > 0) {
          // Load product station assignments
          const productIds = cart.filter(i => i.product_id).map(i => i.product_id);
          const { data: productsWithStations } = await supabase
            .from("products")
            .select("id, kitchen_station_id")
            .in("id", productIds);

          const stationMap = new Map((productsWithStations || []).map((p: any) => [p.id, p.kitchen_station_id]));
          const defaultStationId = (stationsData as any[])[0].id;

          // Group items by station
          const stationItems: Record<string, any[]> = {};
          cart.forEach(item => {
            const stationId = stationMap.get(item.product_id) || defaultStationId;
            if (!stationItems[stationId]) stationItems[stationId] = [];
            stationItems[stationId].push({
              name: item.name,
              qty: item.qty,
              note: item.note,
              modifiers: item.modifiers || [],
            });
          });

          // Create a ticket per station
          const ticketInserts = Object.entries(stationItems).map(([stationId, items]) => ({
            user_id: dataOwnerId,
            order_id: orderId,
            station_id: stationId,
            items,
            status: "pending",
          }));

          if (ticketInserts.length > 0) {
            await supabase.from("kitchen_tickets").insert(ticketInserts as any);
          }
        }
      } catch (err) {
        console.error("Kitchen ticket creation error:", err);
      }

      // Auto-open cash drawer after successful payment
      if (isAdmin || posPerms.open_cash_drawer) {
        openCashDrawer();
      }

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
        setCustomerName("", null, "", null);
        setOrderDiscount(0);
        setOrderNote("");
        setSelectedCartIndex(null);
        setRecallBanner(null);
        updateActiveOrder(o => ({ ...o, tableId: null, tableName: null, guestCount: 1, guestName: "" }));
      }
      setSelectedEmployee(null);
      setEmployeeSearch("");
      setEmployeeBalance(0);
      setEmployeeNote("");
      setTenderedAmount("");
      setPaymentMethod("cash");
      setPaymentCurrency("ILS");
      setChangeCurrency("ILS");
      setManualChangeAmount(null);
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

  // Determine POS accounting date based on cutoff hour
  const getPosAccountingDate = (openedAt: string, cutoffHour: number) => {
    const d = new Date(openedAt);
    const hour = d.getHours();
    if (hour < cutoffHour) {
      d.setDate(d.getDate() - 1);
    }
    return d.toISOString().split("T")[0];
  };

  // Close session
  const handleCloseShift = async () => {
    if (!session || !userId) return;
    if (!isAdmin && !posPerms.can_close_register) { toast.error("ليس لديك صلاحية إغلاق الوردية"); return; }
    const cash = parseFloat(closingCash) || 0;
    const cashUSD = parseFloat(closingCashUSD) || 0;
    const cashJOD = parseFloat(closingCashJOD) || 0;

    // Fetch total expenses for this session
    const { data: expensesData } = await supabase
      .from("pos_expenses")
      .select("amount")
      .eq("shift_id", session.id);
    const totalExpenses = (expensesData || []).reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);

    // Fetch total POS purchases (cash out) for this session
    const { data: purchasesData } = await supabase
      .from("pos_purchases")
      .select("total_amount, payment_type")
      .eq("shift_id", session.id);
    const totalPurchasesCash = (purchasesData || [])
      .filter((p: any) => p.payment_type === "نقدي" || p.payment_type === "cash" || !p.payment_type)
      .reduce((sum: number, p: any) => sum + (Number(p.total_amount) || 0), 0);

    // Fetch sales breakdown by payment currency (paid orders only, excluding returns)
    const { data: ordersData } = await supabase
      .from("pos_orders")
      .select("id, payment_currency, payment_currency_amount, total, is_return")
      .eq("session_id", session.id)
      .eq("state", "paid");

    // Separate sales and returns
    const salesOrders = (ordersData || []).filter((o: any) => !o.is_return);
    const returnOrders = (ordersData || []).filter((o: any) => o.is_return);
    const totalReturnsCash = returnOrders.reduce((s: number, o: any) => s + (Number(o.total) || 0), 0);

    const currencyBreakdown: Record<string, { sales: number; count: number }> = {};
    salesOrders.forEach((o: any) => {
      const cur = o.payment_currency || "ILS";
      if (!currencyBreakdown[cur]) currencyBreakdown[cur] = { sales: 0, count: 0 };
      currencyBreakdown[cur].sales += Number(o.payment_currency_amount) || Number(o.total) || 0;
      currencyBreakdown[cur].count += 1;
    });

    // Fetch payment method breakdown by currency (sales only, not returns)
    const salesOrderIds = salesOrders.map((o: any) => o.id);
    const orderIds = (ordersData || []).map((o: any) => o.id);
    const paymentMethodBreakdown: Record<string, Record<string, number>> = {};
    let foreignChangeILS = 0;
    let foreignChangeUSD = 0;
    let foreignChangeJOD = 0;
    let foreignTenderedUSD = 0;
    let foreignTenderedJOD = 0;
    if (salesOrderIds.length > 0) {
      const { data: paymentsData } = await supabase
        .from("pos_payments")
        .select("payment_method, amount, currency, change_amount, change_currency, tendered, exchange_rate")
        .in("order_id", salesOrderIds);
      (paymentsData || []).forEach((p: any) => {
        const method = p.payment_method || "cash";
        const cur = p.currency || "ILS";
        if (!paymentMethodBreakdown[method]) paymentMethodBreakdown[method] = {};
        paymentMethodBreakdown[method][cur] = (paymentMethodBreakdown[method][cur] || 0) + Number(p.amount || 0);
        if (method === "cash" && cur !== "ILS") {
          const tenderedILS = Number(p.tendered || 0);
          const rate = Number(p.exchange_rate || 1);
          const tenderedForeign = rate > 0 ? tenderedILS / rate : 0;
          if (cur === "USD") foreignTenderedUSD += tenderedForeign;
          if (cur === "JOD") foreignTenderedJOD += tenderedForeign;

          const chgCur = (p as any).change_currency || "ILS";
          const chgAmount = Number(p.change_amount || 0);
          if (chgCur === "ILS") {
            foreignChangeILS += chgAmount;
          } else if (chgCur === "USD") {
            const chgRate = exchangeRates?.["USD"] || rate;
            foreignChangeUSD += chgAmount / chgRate;
          } else if (chgCur === "JOD") {
            const chgRate = exchangeRates?.["JOD"] || rate;
            foreignChangeJOD += chgAmount / chgRate;
          }
        }
      });
    }

    // Complete expected cash formula:
    // المتوقع = الافتتاحي + مبيعات نقدية - باقي عملات أجنبية - مصاريف - مشتريات نقدية - مرتجعات نقدية
    const ilsCashSales = paymentMethodBreakdown["cash"]?.["ILS"] || 0;
    const effectiveILSCashSales = salesOrderIds.length === 0 && (session.total_sales || 0) > 0
      ? (session.total_sales || 0)
      : ilsCashSales;
    const expectedILS = session.opening_cash + effectiveILSCashSales - foreignChangeILS - totalExpenses - totalPurchasesCash - totalReturnsCash;
    // Foreign expected = actual foreign tendered minus foreign change given back
    const expectedUSD = foreignTenderedUSD - foreignChangeUSD;
    const expectedJOD = foreignTenderedJOD - foreignChangeJOD;

    // Per-currency variance
    const varianceILS = cash - expectedILS;
    const varianceUSD = cashUSD - expectedUSD;
    const varianceJOD = cashJOD - expectedJOD;

    // Total variance in ILS equivalent
    const usdRate = exchangeRates?.["USD"] || 3.6;
    const jodRate = exchangeRates?.["JOD"] || 5.0;
    const totalVariance = varianceILS + (varianceUSD * usdRate) + (varianceJOD * jodRate);

    const expected = expectedILS; // keep for DB backward compat
    const variance = totalVariance;
    const closedAt = new Date().toISOString();

    // Load cutoff hour from settings
    let cutoffHour = 6;
    const { data: csData } = await supabase
      .from("company_settings" as any)
      .select("pos_day_cutoff_hour")
      .eq("user_id", dataOwnerId)
      .maybeSingle();
    if (csData && (csData as any).pos_day_cutoff_hour != null) {
      cutoffHour = (csData as any).pos_day_cutoff_hour;
    }

    const accountingDate = getPosAccountingDate(session.opened_at, cutoffHour);

    // Recalculate session totals from actual paid orders (excludes transferred-out orders since their session_id changed)
    const recalcTotalSales = (ordersData || []).filter((o: any) => !o.is_return).reduce((s: number, o: any) => s + (Number(o.total) || 0), 0);
    const recalcTotalOrders = (ordersData || []).filter((o: any) => !o.is_return).length;

    await supabase
      .from("pos_sessions")
      .update({
        state: "closed",
        closing_cash: cash,
        expected_cash: expected,
        cash_variance: variance,
        closed_at: closedAt,
        total_sales: recalcTotalSales,
        total_orders: recalcTotalOrders,
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
          transaction_date: accountingDate,
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

    // Batch transfer: move sales per currency from box GL to main accounts
    // Since complete_pos_order now routes ALL cash to box GL, 
    // we DON'T need a batch transfer from 1110 to box GL anymore.
    // The per-currency transfer to main accounts happens at manual transfer time (CashTransferPage).

    // Get cash box name for receipt
    let cashBoxName = "";
    if (session.cash_box_id) {
      const { data: cbData } = await supabase
        .from("cash_boxes")
        .select("name")
        .eq("id", session.cash_box_id)
        .maybeSingle();
      cashBoxName = cbData?.name || "";
    }

    // Prepare shift summary data
    setShiftSummaryData({
      companyName: company?.name || "شركتي",
      logoUrl: company?.logo_url || "",
      terminalName: posDisplayName,
      cashierName: session.cashier_name,
      cashBoxName,
      openedAt: session.opened_at,
      closedAt,
      openingCash: session.opening_cash,
      totalSales: recalcTotalSales,
      totalExpenses,
      totalOrders: recalcTotalOrders,
      closingCash: cash,
      closingCashUSD: cashUSD,
      closingCashJOD: cashJOD,
      expectedCash: expectedILS,
      expectedCashUSD: expectedUSD,
      expectedCashJOD: expectedJOD,
      variance: totalVariance,
      varianceILS,
      varianceUSD,
      varianceJOD,
      sessionId: session.id,
      currencyBreakdown,
      paymentMethodBreakdown,
      exchangeRates,
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
    if (isAdmin) {
      navigate("/apps", { replace: true });
    } else {
      setShowLogoutConfirm(true);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // Call center quick close — no cash count needed, just logout
  const handleCallCenterCloseShift = async () => {
    if (!session || !userId) return;
    const closedAt = new Date().toISOString();
    await supabase
      .from("pos_sessions")
      .update({ state: "closed", closed_at: closedAt, closing_cash: 0 } as any)
      .eq("id", session.id);
    setSession(null);
    setOrders([createNewOrder(1)]);
    setActiveOrderIndex(0);
    orderCounter.current = 1;
    toast.success("تم إغلاق الوردية بنجاح");
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // F11 = Fullscreen toggle
      if (e.key === "F11") {
        e.preventDefault();
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
        return;
      }
      // Skip if typing in input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // F2 = Call Center Dispatch (for call center users / admin)
      if (e.key === "F2" && cart.length > 0 && (isAdmin || isCallCenter)) {
        setShowCallCenterDispatch(true);
        e.preventDefault();
        return;
      }
      // F4 = Invoice history
      if (e.key === "F4") {
        setShowInvoiceHistory(true);
        e.preventDefault();
      }
      // F12 = Pay
      if (e.key === "F12" && cart.length > 0) {
        setShowPayment(true);
        e.preventDefault();
        return;
      }
      // F9 = Send to printer
      if (e.key === "F9" && cart.length > 0) {
        handleSendToKitchen();
        e.preventDefault();
        return;
      }
      // F10 = Save order
      if (e.key === "F10" && cart.length > 0) {
        handleSaveToTable();
        e.preventDefault();
        return;
      }
      // F8 = Print (silent via bridge)
      if (e.key === "F8" && cart.length > 0) {
        const f8Order: BridgePrintOrder = {
          orderNumber: Date.now().toString(),
          branchName: company?.name || "مطعم الملكي - سفيان",
          cashier: session?.cashier_name || "",
          tableNumber: activeOrder.tableName || undefined,
          orderType: activeOrder.orderType,
          items: cart.map(item => ({
            id: item.product_id || item.id,
            name: item.name,
            quantity: item.qty,
            price: item.unit_price,
            note: item.note || undefined,
            printerKey: "kitchen" as const,
            modifiers: (item.modifiers || []).map(m => ({ option_name: m.option_name, extra_price: m.extra_price })),
          })),
          subtotal: cartTotals.subtotal,
          discount: cartTotals.discount,
          total: cartTotals.total,
          paymentMethod: paymentMethod === "cash" ? "نقد" : paymentMethod === "card" ? "بطاقة" : "تحويل",
        };
        bridgePrintAll(f8Order);
        e.preventDefault();
        return;
      }
      // Delete / Backspace = Clear cart
      if (e.key === "Delete" && e.ctrlKey) {
        setCart([]); setSelectedCartIndex(null); setOrderDiscount(0); setOrderNote("");
        setCustomerDataDiscount(null);
        e.preventDefault();
        return;
      }

      // Alt + 0 = All categories
      if (e.altKey && e.key === "0") {
        setSelectedCategory("الكل");
        e.preventDefault();
        return;
      }
      // Alt + 1-9 = Select category by index
      if (e.altKey && e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        const sortedCats = [...posCategories].sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
        if (idx < sortedCats.length) {
          setSelectedCategory(sortedCats[idx].name);
        }
        e.preventDefault();
        return;
      }

      // Ctrl + number (1-9) = Add product by position in current view
      if (e.ctrlKey && !e.altKey && e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        const visibleProducts = products.filter(p => {
          if (!p.is_pos_available) return false;
          if (selectedCategory === "__uncategorized__") return !p.pos_category_id && !posCategories.some(c => c.name === p.category);
          if (selectedCategory !== "الكل") {
            const cat = posCategories.find(c => c.name === selectedCategory);
            return p.pos_category_id === cat?.id || p.category === selectedCategory;
          }
          return true;
        });
        if (idx < visibleProducts.length) {
          addToCart(visibleProducts[idx]);
        }
        e.preventDefault();
        return;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [cart, posCategories, products, selectedCategory, addToCart]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background" dir="rtl">
        <div
          className="w-10 h-10 rounded-full border-2 border-transparent"
          style={{
            borderTopColor: "hsl(var(--accent))",
            borderRightColor: "hsl(var(--accent) / 0.3)",
            animation: "navSpinRing 0.7s linear infinite",
          }}
        />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden pos-container" dir="rtl" data-pos-layout>
      {/* ══════ COMPACT TOP BAR — 36px ══════ */}
      <header className="flex items-center px-2 gap-1.5 shrink-0 text-white" style={{ height: 36, background: "#0A2342" }}>
        {/* Back */}
        <button
          onClick={() => navigate("/apps", { replace: true })}
          className="h-6 w-6 rounded flex items-center justify-center hover:bg-white/10 transition-colors shrink-0"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>

        {/* Connection dot */}
        <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" title={`متصل${offlineMode.lastSyncAt ? ` • آخر مزامنة: ${offlineMode.lastSyncAt}` : ""}`} />

        {/* Company + Cashier name — compact */}
        <span className="text-[11px] font-medium whitespace-nowrap shrink-0 text-white/80 max-w-[160px] truncate">
          {(company?.name || "QOYOD").slice(0, 15)} {session ? `| ${session.cashier_name}` : ""}
        </span>

        {/* Search — integrated in top bar */}
        <div className="relative flex-1 min-w-0 max-w-[240px]">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40 pointer-events-none" />
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث..."
            className="w-full h-[22px] rounded px-2 pr-7 text-[11px] bg-white/10 text-white placeholder:text-white/40 border border-white/15 focus:outline-none focus:border-white/40"
          />
        </div>

        {/* Customer — integrated in top bar */}
        <div className="relative w-[160px] shrink-0">
          <User className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40 pointer-events-none" />
          <input
            value={customerSearch || customerName}
            onChange={(e) => {
              const val = e.target.value;
              setCustomerSearch(val);
              setCustomerName(val, null, "", null);
              setShowContactDropdown(true);
              searchPosCustomers(val);
            }}
            onFocus={() => setShowContactDropdown(true)}
            placeholder="الزبون..."
            className="w-full h-[22px] rounded px-2 pr-7 text-[11px] bg-white/10 text-white placeholder:text-white/40 border border-white/15 focus:outline-none focus:border-white/40"
          />
          {(customerSearch || customerName) && (
            <button
              onClick={() => { setCustomerSearch(""); setCustomerName("", null, "", null); }}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          {showContactDropdown && (customerSearch || "").length > 0 && (
            <div className="absolute z-50 w-[280px] right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {posCustomerResults.length > 0 && (
                <>
                  <p className="px-3 py-1 text-[10px] text-muted-foreground font-semibold border-b border-border bg-muted/30">زبائن نقطة البيع</p>
                  {posCustomerResults.map((pc) => (
                    <button
                      key={pc.id}
                      onClick={() => {
                        setCustomerName(pc.name || "", null, pc.whatsapp || "", pc.id);
                        if (pc.address) updateActiveOrder(o => ({ ...o, deliveryAddress: pc.address || "" }));
                        setCustomerSearch("");
                        setShowContactDropdown(false);
                      }}
                      className="w-full px-3 py-1.5 text-xs text-right hover:bg-muted/50 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <UserCheck className="h-3 w-3 text-emerald-600 shrink-0" />
                          <span className="font-semibold truncate text-[11px] text-foreground">{pc.name || "بدون اسم"}</span>
                        </div>
                        <span className="text-[10px] text-foreground/60 shrink-0">{pc.total_visits || 0} زيارة</span>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {filteredContacts.length > 0 && (
                <>
                  <p className="px-3 py-1 text-[10px] text-muted-foreground font-semibold border-b border-border bg-muted/30">جهات الاتصال</p>
                  {filteredContacts.map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => {
                        setCustomerName(contact.contact_name, contact.id);
                        setCustomerSearch("");
                        setShowContactDropdown(false);
                      }}
                      className="w-full px-3 py-1.5 text-[11px] text-right hover:bg-muted/50 transition flex items-center gap-2 text-foreground"
                    >
                      <User className="h-3 w-3 text-foreground/50 shrink-0" />
                      <span className="font-medium">{contact.contact_name}</span>
                    </button>
                  ))}
                </>
              )}
              {/* Inline add new customer with phone */}
              <div className="border-t border-border px-3 py-2 bg-muted/20">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <PlusCircle className="h-3 w-3 text-primary shrink-0" />
                  <span className="text-[11px] font-medium text-primary">إضافة "{customerSearch}" كزبون جديد</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="tel"
                    placeholder="رقم الهاتف (اختياري)"
                    value={newCustomerPhone}
                    onChange={e => setNewCustomerPhone(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleQuickAddCustomer(customerSearch || ""); } }}
                    className="flex-1 h-6 rounded border border-border bg-background px-2 text-[11px] text-foreground focus:outline-none focus:border-primary/50 min-w-0"
                    dir="ltr"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickAddCustomer(customerSearch || "");
                    }}
                    disabled={savingCustomer}
                    className="h-6 px-2 rounded bg-primary text-primary-foreground text-[10px] font-medium hover:bg-primary/90 transition shrink-0 flex items-center gap-1"
                  >
                    <CheckCircle className="h-3 w-3" />
                    حفظ
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0" />

        {/* Invoice History */}
        {(isAdmin || posPerms.can_view_invoice_history || posPerms.view_invoice_log) && (
        <button
          onClick={() => setShowInvoiceHistory(true)}
          className="relative h-6 w-6 rounded flex items-center justify-center hover:bg-white/15 transition-all shrink-0"
          title="سجل الفواتير"
        >
          <FileText className="h-3.5 w-3.5 text-white/70 hover:text-white" />
          {session && session.total_orders > 0 && (
            <span className="absolute -top-0.5 -left-0.5 rounded-full px-1 py-px text-[8px] font-bold" style={{ background: "#4A9EE8", color: "#0A2342" }}>
              {session.total_orders}
            </span>
          )}
        </button>
        )}

        {/* Pending Call Center Orders */}
        <PendingOrdersPanel
          dataOwnerId={dataOwnerId || ""}
          branchId={detectedBranchId}
          sessionId={session?.id || null}
          enabled={!!session && !isCallCenter}
          onAcceptOrder={(order) => {
            orderCounter.current += 1;
            const newOrder = createNewOrder(orderCounter.current);
            newOrder.customerName = order.customer_name || "";
            newOrder.customerPhone = order.customer_phone || "";
            newOrder.orderType = order.delivery_type === "delivery" ? "delivery" : "takeaway";
            newOrder.deliveryAddress = order.delivery_address || "";
            newOrder.callCenterOrderId = order.id;
            newOrder.callCenterPaymentMethod = order.payment_method || "cash";
            newOrder.callCenterSourceApp = order.source_app || null;
            newOrder.orderNote = [
              order.source_app ? `مصدر: ${order.source_app}` : "",
              order.payment_method === "visa" ? "💳 فيزا" : "💵 نقدي",
              order.order_note || "",
            ].filter(Boolean).join(" | ");
            newOrder.cart = (order.items || []).map((item: any, i: number) => ({
              id: crypto.randomUUID(),
              product_id: item.product_id || null,
              name: item.name,
              qty: item.qty,
              unit_price: item.unit_price,
              cost_price: 0,
              discount_pct: 0,
              tax_rate: 0,
              unit: "قطعة",
              total: item.total || item.unit_price * item.qty,
              note: item.note || "",
            }));
            newOrder.name = `📞 ${order.customer_name}`;
            setOrders(prev => [...prev, newOrder]);
            setActiveOrderIndex(orders.length);
          }}
        />

        {/* Kitchen */}
        <button onClick={() => navigate("/pos/kitchen")} className="h-6 w-6 rounded flex items-center justify-center hover:bg-white/15 transition-all shrink-0" title="المطبخ">
          <ChefHat className="h-3.5 w-3.5 text-white/70" />
        </button>

        {/* Tables */}
        <button onClick={() => navigate("/pos/floor-plan")} className="h-6 w-6 rounded flex items-center justify-center hover:bg-white/15 transition-all shrink-0" title="الطاولات">
          <UtensilsCrossed className="h-3.5 w-3.5 text-white/70" />
        </button>

        {/* Tools dropdown — consolidated */}
        <div className="relative">
          <button
            onClick={() => setShowOpsDropdown(v => !v)}
            onBlur={() => setTimeout(() => setShowOpsDropdown(false), 200)}
            className="h-6 w-6 rounded flex items-center justify-center hover:bg-white/15 transition-all shrink-0"
            title="أدوات"
          >
            <MoreHorizontal className="h-3.5 w-3.5" style={{ color: "#4A9EE8" }} />
          </button>
          {showOpsDropdown && (
            <div className="absolute top-full mt-1 right-0 z-50 rounded-lg shadow-xl min-w-[200px] py-1 border" style={{ background: "#fff", color: "#1a1a1a" }} dir="rtl">
              {session && (isAdmin || posPerms.can_add_inventory) && (
                <button className="w-full text-right px-4 py-2 text-xs flex items-center gap-2 hover:bg-gray-100 transition-colors" onClick={() => { setShowInventoryInput(true); setShowOpsDropdown(false); }}>
                  <Package className="h-3.5 w-3.5" style={{ color: "#4A9EE8" }} /> إدخال بضاعة
                </button>
              )}
              {session && (isAdmin || posPerms.can_record_purchases) && (
                <button className="w-full text-right px-4 py-2 text-xs flex items-center gap-2 hover:bg-gray-100 transition-colors" onClick={() => { setShowPurchaseModal(true); setShowOpsDropdown(false); }}>
                  <ShoppingBag className="h-3.5 w-3.5" style={{ color: "#4A9EE8" }} /> تسجيل مشتريات
                </button>
              )}
              {session && (isAdmin || posPerms.can_record_expenses) && (
                <button className="w-full text-right px-4 py-2 text-xs flex items-center gap-2 hover:bg-gray-100 transition-colors" onClick={() => { setShowExpenseModal(true); setShowOpsDropdown(false); }}>
                  <Receipt className="h-3.5 w-3.5" style={{ color: "#4A9EE8" }} /> صرف مصروف
                </button>
              )}
              <div className="border-t border-gray-200 my-1" />
              <button className="w-full text-right px-4 py-2 text-xs flex items-center gap-2 hover:bg-gray-100 transition-colors" onClick={() => { navigate("/pos-customers"); setShowOpsDropdown(false); }}>
                <UserCheck className="h-3.5 w-3.5" style={{ color: "#4A9EE8" }} /> قاعدة بيانات الزبائن
              </button>
              <button className="w-full text-right px-4 py-2 text-xs flex items-center gap-2 hover:bg-gray-100 transition-colors" onClick={() => { setShowSyncLog(true); setShowOpsDropdown(false); }}>
                <RefreshCw className="h-3.5 w-3.5" style={{ color: "#4A9EE8" }} /> سجل المزامنة
                {offlineMode.pendingCount > 0 && (
                  <span className="mr-auto text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5">{offlineMode.pendingCount}</span>
                )}
              </button>
              <div className="border-t border-gray-200 my-1" />
              <button className="w-full text-right px-4 py-2 text-xs flex items-center gap-2 hover:bg-gray-100 transition-colors" onClick={() => setShowShortcutsGuide(true)}>
                <Keyboard className="h-3.5 w-3.5" style={{ color: "#4A9EE8" }} /> اختصارات لوحة المفاتيح
              </button>
              <button className="w-full text-right px-4 py-2 text-xs flex items-center gap-2 hover:bg-gray-100 transition-colors" onClick={() => {
                if (!document.fullscreenElement) document.documentElement.requestFullscreen();
                else document.exitFullscreen();
                setShowOpsDropdown(false);
              }}>
                <Monitor className="h-3.5 w-3.5" style={{ color: "#4A9EE8" }} /> ملء الشاشة (F11)
              </button>
            </div>
          )}
        </div>

        {/* Theme toggle — compact */}
        <POSThemeToggle />

        {/* Card size toggle — compact */}
        <div className="flex items-center gap-0 bg-white/10 rounded p-0.5 shrink-0">
          {(["S", "M", "L"] as const).map(size => (
            <button
              key={size}
              onClick={() => {
                setCardSize(size);
                localStorage.setItem("pos-card-size", size);
                if (userId) {
                  supabase.from("pos_user_preferences").upsert({
                    auth_user_id: userId,
                    preference_key: "card_size",
                    preference_value: { size },
                    updated_at: new Date().toISOString(),
                  } as any, { onConflict: "auth_user_id,preference_key" });
                }
              }}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${
                cardSize === size
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {size}
            </button>
          ))}
        </div>

        {/* Sort mode — compact */}
        <button
          onClick={() => setIsSortMode(!isSortMode)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all shrink-0 ${
            isSortMode
              ? "bg-amber-500 text-white shadow-md"
              : "bg-white/10 text-white/60 hover:text-white/90"
          }`}
        >
          <GripVertical className="h-3 w-3" />
          {isSortMode ? "✅" : "ترتيب"}
        </button>

        {/* Close shift — compact */}
        {(isAdmin || posPerms.can_close_register) && (
        <button
          onClick={() => {
            if (session?.cash_box_id === null) {
              handleCallCenterCloseShift();
            } else {
              setShowCloseShift(true);
            }
          }}
          className="flex items-center gap-1 px-2 py-1 rounded bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors text-[10px] font-medium shrink-0"
        >
          <X className="h-3 w-3" />
          إغلاق
        </button>
        )}
      </header>

      {/* ══════ OFFLINE STATUS BAR ══════ */}
      <OfflineStatusBar
        isOnline={offlineMode.isOnline}
        pendingCount={offlineMode.pendingCount}
        lastSyncAt={offlineMode.lastSyncAt}
        isSyncing={offlineMode.isSyncing}
        syncProgress={offlineMode.syncProgress}
        onForceSync={offlineMode.syncPendingQueue}
      />

      {/* ══════ MAIN ══════ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT: Products ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-[hsl(var(--background))]">

          {/* ── Table Selector Bar ── */}
          <TableSelectorBar
            dataOwnerId={dataOwnerId || ""}
            activeTableId={activeOrder.tableId}
            onTableSelect={(table: TableBarItem) => {
              if (table.id === activeOrder.tableId) {
                // Deselect current table
                updateActiveOrder(o => ({ ...o, tableId: null, tableName: null, name: `طلب ${activeOrderIndex + 1}` }));
              } else if (table.status === "occupied") {
                loadTableOrder(table.id, table.name);
              } else {
                // Available/cleaning table → check if another tab already has this table
                const existingTabIdx = orders.findIndex(o => o.tableId === table.id);
                if (existingTabIdx >= 0) {
                  setActiveOrderIndex(existingTabIdx);
                } else if (activeOrder.cart.length === 0 && !activeOrder.tableId) {
                  // Current tab is empty and has no table → assign to it
                  updateActiveOrder(o => ({ ...o, tableId: table.id, tableName: table.name, name: table.name }));
                } else {
                  // Current tab has items or another table → create new tab
                  const newOrder = createNewOrder(orders.length + 1, table.id, table.name);
                  setOrders(prev => [...prev, newOrder]);
                  setActiveOrderIndex(orders.length);
                }
              }
            }}
            onNewTable={() => navigate("/pos/floor-plan/edit")}
          />

          {/* ── Compact Category Chips — max 2 rows ── */}
          <div className="px-2 py-1.5 border-b border-border/70 bg-muted/20 overflow-y-auto shrink-0" style={{ maxHeight: 'none' }}>
            {isSortMode && (
              <div className="mb-1 flex items-center gap-2 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-[10px]">
                <GripVertical className="h-3 w-3" />
                <span className="font-medium">وضع الترتيب — اسحب التصنيفات أو المنتجات</span>
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
                <div className="flex flex-wrap gap-1.5 items-center">
                  {/* All */}
                  <button
                    onClick={() => !isSortMode && setSelectedCategory("الكل")}
                    className={`h-7 px-3 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all ${
                      selectedCategory === "الكل"
                        ? "bg-foreground text-background shadow-sm"
                        : "bg-card text-muted-foreground hover:text-foreground border border-border"
                    }`}
                  >
                    الكل ({categoriesWithCounts.all})
                  </button>

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
                    <button
                      onClick={() => !isSortMode && setSelectedCategory("__uncategorized__")}
                      className={`h-7 px-3 rounded-full text-[11px] font-medium whitespace-nowrap transition-all border ${
                        selectedCategory === "__uncategorized__"
                          ? "bg-muted-foreground text-background border-muted-foreground"
                          : "bg-card text-muted-foreground border-border"
                      }`}
                    >
                      أخرى ({categoriesWithCounts.uncategorized})
                    </button>
                  )}

                  {!isSortMode && (isAdmin || posPerms.manage_products_categories) && (
                    <>
                      <button
                        onClick={() => setShowCategoryManager(true)}
                        className="h-7 px-2 rounded-full text-[10px] font-medium whitespace-nowrap border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                      >
                        + تصنيف
                      </button>
                      <button
                        onClick={() => setShowAddProduct(true)}
                        className="h-7 px-2 rounded-full text-[10px] font-medium whitespace-nowrap border border-dashed border-primary/30 text-primary hover:bg-primary/10"
                      >
                        ⊕ منتج
                      </button>
                    </>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </div>


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
                <div dir="rtl" className={`p-2 grid ${
                  filteredProducts.length <= 10 && filteredProducts.length > 0
                    ? filteredProducts.length <= 3
                      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3"
                      : filteredProducts.length <= 6
                        ? "grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 gap-3"
                        : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2"
                    : cardSize === "S" 
                      ? "grid-cols-6 sm:grid-cols-7 lg:grid-cols-8 xl:grid-cols-9 2xl:grid-cols-11 gap-1.5" 
                      : cardSize === "M" 
                        ? "grid-cols-5 sm:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-9 gap-1.5" 
                        : "grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2"
                }`}>
                  {filteredProducts.map((product) => {
                    const productColor = getProductCatColor(product);
                    const catConfig = getCatConfig(product.category);
                    const CatIcon = catConfig.icon;
                    const isLowStock = product.min_quantity > 0 && product.quantity <= product.min_quantity && product.quantity > 0;
                    const qtyInCart = cartQtyMap[product.id] || 0;
                    const isFewProducts = filteredProducts.length <= 10;

                    return (
                      <SortableProductCard key={product.id} id={product.id} isSortMode={isSortMode}>
                        {({ isDragging, style, ref, listeners, attributes }) => {
                          const hasAddons = !!(productModifierMap[product.id]?.length);
                          const isAddonOpen = openAddonProductId === product.id;
                          const addonGroups = hasAddons ? modifierGroups.filter(g => productModifierMap[product.id]?.includes(g.id)) : [];

                          return (
                          <div
                            ref={ref}
                            {...attributes}
                            {...listeners}
                            data-addon-card={isAddonOpen ? "true" : undefined}
                            onClick={() => !isSortMode && addToCart(product)}
                            className={`relative bg-card overflow-visible text-center transition-all group border select-none ${
                              cardSize === "S" ? "rounded-lg" : "rounded-xl"
                            } ${isSortMode 
                              ? "border-dashed border-amber-400/60 cursor-grab ring-1 ring-amber-400/20" 
                              : isAddonOpen
                                ? "border-primary bg-accent shadow-lg"
                                : "border-border/80 hover:border-opacity-60 cursor-pointer shadow-[0_1px_4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] hover:shadow-[0_3px_10px_rgba(0,0,0,0.1)]"
                            } ${isDragging ? "shadow-2xl scale-105 rotate-1" : ""}`}
                            style={{
                              ...style,
                              borderBottomWidth: cardSize === "S" ? "2px" : "3px",
                              borderBottomColor: isSortMode ? "hsl(var(--primary))" : productColor + "60",
                              zIndex: isAddonOpen ? 10 : "auto",
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

                            {/* Delete product button */}
                            {!isSortMode && (isAdmin || posPerms.delete_products) && (
                              <button
                                className="absolute top-1 right-1 z-20 w-5 h-5 rounded-full bg-destructive/80 hover:bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteProduct({ id: product.id, name: product.name }); }}
                                title="حذف المنتج"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}

                            {/* Low stock indicator */}
                            {isLowStock && !isSortMode && (
                              <div className={`absolute ${(isAdmin || posPerms.delete_products) ? "top-7" : "top-1"} right-1 z-10`}>
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
                              <p className={`font-semibold text-foreground leading-tight mb-0.5 break-words ${
                                isFewProducts
                                  ? "text-[13px] font-bold"
                                  : cardSize === "S" 
                                    ? "text-[12px]" 
                                    : "text-[12px]"
                              }`} dir="rtl" style={{ unicodeBidi: "plaintext" }}>
                                {product.name}
                              </p>

                              {/* Addon hint */}
                              {cardSize !== "S" && hasAddons && (
                                <p className="text-[9px] text-muted-foreground mb-0.5">
                                  {addonGroups.length} إضافة متاحة
                                </p>
                              )}

                              {/* Price */}
                              <p className={`font-bold text-primary tabular-nums ${
                                isFewProducts
                                  ? "text-sm"
                                  : cardSize === "S" ? "text-[11px]" : "text-[12px]"
                              }`}>
                                ₪{product.sell_price.toFixed(2)}
                              </p>
                            </div>

                            {/* Inline Addon Panel */}
                            <AnimatePresence>
                              {isAddonOpen && addonGroups.length > 0 && (
                                <InlineAddonPanel
                                  product={{ id: product.id, name: product.name, sell_price: product.sell_price }}
                                  groups={addonGroups}
                                  onConfirm={(data) => {
                                    addToCartDirect(product, data.modifiers, data.note, data.quantity);
                                    setOpenAddonProductId(null);
                                    toast.success(`✓ أضيف للطلب — ${product.name}`);
                                  }}
                                  onClose={() => setOpenAddonProductId(null)}
                                />
                              )}
                            </AnimatePresence>
                          </div>
                          );
                        }}
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
        <div className="w-[340px] lg:w-[380px] flex flex-col bg-card border-r-2 border-border/60 shrink-0 shadow-[2px_0_8px_rgba(0,0,0,0.04)]">
          {/* Order Tabs — compact h-8 */}
          <div className="flex items-center border-b border-border/70 shrink-0 overflow-x-auto h-8">
            <button
              onClick={() => setShowAllOrders(true)}
              className="flex items-center gap-1 text-muted-foreground/60 hover:text-foreground transition-colors h-8 px-2 flex-shrink-0"
              title="عرض جميع الطلبات"
            >
              <LayoutGrid className="w-3 h-3" />
              <span className="text-[10px] font-medium">طلبات</span>
            </button>
            <div className="w-px h-4 bg-border flex-shrink-0" />

            {orders.map((order, idx) => {
              const isActive = idx === activeOrderIndex;
              const itemCount = order.cart.reduce((s, i) => s + i.qty, 0);
              return (
                <button
                  key={order.id}
                  onClick={() => setActiveOrderIndex(idx)}
                  className={`group relative flex items-center gap-1 px-2 h-8 text-[11px] font-medium whitespace-nowrap transition-all border-b-2 ${
                    isActive
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ShoppingCart className="h-3 w-3" />
                  <span className="max-w-[80px] truncate">{order.customerName || order.name}</span>
                  {itemCount > 0 && (
                    <span className={`text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center ${
                      isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {itemCount}
                    </span>
                  )}
                  {orders.length > 1 && (
                    <span
                      onClick={(e) => { e.stopPropagation(); removeOrder(idx); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-destructive transition-all"
                    >
                      <X className="h-2.5 w-2.5" />
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
              className="h-8 px-2 flex items-center justify-center text-muted-foreground/50 hover:text-primary transition-colors shrink-0"
              title="طلب جديد"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {/* All Orders Sheet */}
          <AllOrdersSheet
            open={showAllOrders}
            onClose={() => setShowAllOrders(false)}
            orders={orders.map(o => ({
              id: o.id,
              name: o.name,
              itemCount: o.cart.reduce((s, i) => s + i.qty, 0),
              total: o.cart.reduce((s, i) => s + i.total, 0),
              tableId: o.tableId,
              tableName: o.tableName,
            }))}
            activeOrderIndex={activeOrderIndex}
            onSelectOrder={(idx) => setActiveOrderIndex(idx)}
            onRemoveOrder={(idx) => removeOrder(idx)}
          />

          {/* Cart Header */}
          <div className="h-10 px-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              {activeOrder.tableName && (
                <span className="text-xs font-semibold text-primary flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded-md">
                  <UtensilsCrossed className="h-3 w-3" />
                  {activeOrder.tableName}{activeOrder.customerName ? ` - ${activeOrder.customerName}` : ""}
                </span>
              )}
              {!activeOrder.tableName && activeOrder.customerName ? (
                <span className="text-xs font-medium text-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {activeOrder.customerName}
                </span>
              ) : !activeOrder.tableName ? (
                <span className="text-xs text-muted-foreground/60">بدون زبون</span>
              ) : null}
              {activeOrder.orderType !== "dine_in" && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                  activeOrder.orderType === "delivery" 
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" 
                    : "bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400"
                }`}>
                  {activeOrder.orderType === "delivery" ? "🚚 توصيل" : "🛍️ استلام"}
                </span>
              )}
            </div>
            {cart.length > 0 && (
              <button
                onClick={() => { setCart([]); setSelectedCartIndex(null); setOrderDiscount(0); setOrderNote(""); setCustomerName("", null, "", null); updateActiveOrder(o => ({ ...o, orderType: "dine_in", deliveryAddress: "", name: `طلب ${o.name.match(/\d+/)?.[0] || "1"}` })); setCustomerSearch(""); }}
                className="text-[11px] text-destructive/70 hover:text-destructive transition-colors flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
                إفراغ
              </button>
            )}
          </div>

          {/* Recall Banner */}
          {recallBanner && (
            <div className="mx-3 mb-1 px-3 py-2 rounded-lg text-xs" style={{ background: "#FEF9C3", border: "1px solid #D97706", color: "#92400E", fontFamily: "Tajawal, sans-serif" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" style={{ color: "#D97706" }} />
                  <span className="font-semibold">تعديل على فاتورة #{recallBanner.orderNumber}</span>
                </div>
                <button onClick={() => { setRecallBanner(null); setCart([]); }} className="text-[10px] underline hover:no-underline">إلغاء التعديل</button>
              </div>
              <div className="mt-1 text-[11px]">السبب: {recallBanner.reason}{recallBanner.approvedBy && ` — موافقة: ${recallBanner.approvedBy}`}</div>
            </div>
          )}

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
                              {(isAdmin || posPerms.can_remove_cart_items) && (
                              <button
                                className="p-0.5 text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                                onClick={(e) => { e.stopPropagation(); removeFromCart(index); }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                              )}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => { e.stopPropagation(); updateCartItem(index, "unit_price", Math.max(0, Number(e.target.value))); }}
                                onClick={(e) => e.stopPropagation()}
                                disabled={!isAdmin && !posPerms.can_edit_prices}
                                className="w-14 text-[11px] tabular-nums bg-transparent border-b border-dashed border-border text-muted-foreground outline-none focus:border-primary/40 py-0 px-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
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

                        {/* Modifier sub-items */}
                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="mr-11 mt-1 space-y-0.5">
                            {item.modifiers.map((mod, mi) => (
                              <div key={mi} className="flex justify-between items-center">
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <span className="text-muted-foreground/30">└</span>
                                  {mod.option_name}
                                </span>
                                {mod.extra_price !== 0 && (
                                  <span className={`text-[10px] font-mono ${mod.extra_price > 0 ? "text-primary" : "text-destructive"}`}>
                                    {mod.extra_price > 0 ? "+" : ""}₪{Math.abs(mod.extra_price).toFixed(2)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

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
            {/* Order Type + Notes row */}
            {(
              <div className="px-3 pt-2 pb-1 space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  {/* Table Picker (replaces dine_in) */}
                  <div className="relative">
                    <button
                      onClick={() => setShowTablePicker(!showTablePicker)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md transition-all ${
                        activeOrder.tableId
                          ? "bg-primary/15 text-primary border border-primary/30 font-bold"
                          : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      <span>🍽️</span>
                      {activeOrder.tableName || "طاولة"}
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    {showTablePicker && (
                      <div className="absolute top-full right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-2 min-w-[180px] max-h-[250px] overflow-y-auto">
                        {availableTables.length === 0 && (
                          <p className="text-[11px] text-muted-foreground p-2 text-center">جاري التحميل...</p>
                        )}
                        {activeOrder.tableId && (
                          <button
                            onClick={() => {
                              updateActiveOrder(o => ({ ...o, tableId: null, tableName: null, orderType: "takeaway", name: `طلب ${activeOrderIndex + 1}` }));
                              setShowTablePicker(false);
                            }}
                            className="w-full text-right text-xs px-3 py-2 rounded-md hover:bg-destructive/10 text-destructive flex items-center gap-2"
                          >
                            <X className="h-3 w-3" />
                            إلغاء الطاولة
                          </button>
                        )}
                        {availableTables.map(t => (
                          <button
                            key={t.id}
                            onClick={() => {
                              updateActiveOrder(o => ({ ...o, tableId: t.id, tableName: t.name, orderType: "dine_in", name: t.name }));
                              setShowTablePicker(false);
                            }}
                            className={`w-full text-right text-xs px-3 py-2 rounded-md flex items-center justify-between gap-2 ${
                              t.id === activeOrder.tableId
                                ? "bg-primary/15 text-primary font-bold"
                                : t.status === "occupied"
                                ? "text-destructive/70 hover:bg-destructive/5"
                                : "hover:bg-muted/60"
                            }`}
                          >
                            <span>{t.name}</span>
                            {t.status === "occupied" && <span className="text-[10px]">مشغولة</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Takeaway + Delivery */}
                  {(["takeaway", "delivery"] as const).map(type => {
                    const isActive = activeOrder.orderType === type && !activeOrder.tableId;
                    const labels: Record<string, { label: string; icon: string }> = {
                      takeaway: { label: "استلام", icon: "🛍️" },
                      delivery: { label: "توصيل", icon: "🚚" },
                    };
                    return (
                      <button
                        key={type}
                        onClick={() => updateActiveOrder(o => ({ ...o, orderType: type, tableId: null, tableName: null }))}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md transition-all ${
                          isActive
                            ? "bg-primary/15 text-primary border border-primary/30 font-bold"
                            : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                        }`}
                      >
                        <span>{labels[type].icon}</span>
                        {labels[type].label}
                      </button>
                    );
                  })}

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Notes button */}
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
                </div>

                {/* Customer phone display */}
                {activeOrder.customerPhone && (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/30 rounded-md px-2 py-1">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span className="font-mono">{activeOrder.customerPhone}</span>
                  </div>
                )}

                {/* Delivery address input */}
                {activeOrder.orderType === "delivery" && (
                  <Input
                    value={activeOrder.deliveryAddress}
                    onChange={(e) => updateActiveOrder(o => ({ ...o, deliveryAddress: e.target.value }))}
                    placeholder="📍 عنوان التوصيل..."
                    className="h-8 text-xs bg-amber-50 dark:bg-amber-950/20 border-amber-300/50"
                    autoFocus={!activeOrder.deliveryAddress}
                  />
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
            <div className="px-3 py-2 space-y-1 border-t border-border/60 shadow-[0_-1px_3px_rgba(0,0,0,0.04)]">
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
              {cart.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={handleSendToKitchen}
                    className="flex-1 h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border-2 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-all"
                  >
                    🖨️ إرسال إلى الطابعة
                    <span className="text-[10px] bg-amber-500/20 rounded px-1 py-0.5 font-mono">F9</span>
                  </button>
                  <button
                    onClick={handleSaveToTable}
                    disabled={savingToTable}
                    className="flex-1 h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border-2 border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400 hover:bg-sky-500/20 transition-all disabled:opacity-40"
                  >
                    💾 {savingToTable ? "جاري الحفظ..." : "حفظ الطلب"}
                    <span className="text-[10px] bg-sky-500/20 rounded px-1 py-0.5 font-mono">F10</span>
                  </button>
                </div>
              )}
              {/* Quick Save & Print for Call Center orders */}
              {cart.length > 0 && activeOrder.callCenterOrderId && (
                <button
                  onClick={handleQuickSaveAndPrint}
                  disabled={quickProcessing || processing || !session}
                  className="w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 text-white transition-all disabled:opacity-40"
                  style={{ backgroundColor: "#7C3AED" }}
                >
                  {quickProcessing ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Printer className="h-4 w-4" />
                      حفظ وطباعة
                      <Badge variant="outline" className="text-[10px] border-white/30 text-white px-1.5 py-0 h-5">
                        {activeOrder.callCenterPaymentMethod === "cash" ? "💵 نقدي" : "💳 فيزا"}
                      </Badge>
                    </>
                  )}
                </button>
              )}
              {/* Call Center Dispatch Button - replaces customer data for call center users */}
               {cart.length > 0 && (isAdmin || isCallCenter) && (
                <button
                  onClick={() => setShowCallCenterDispatch(true)}
                  disabled={!session}
                  className="w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border-2 border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400 hover:bg-orange-500/20 transition-all disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                  تحويل إلى الفرع
                  <span className="text-[10px] bg-orange-500/20 rounded px-1.5 py-0.5 font-mono">F2</span>
                </button>
              )}
              {/* Dispatched Orders Log for Call Center */}
              {isCallCenter && (
                <button
                  onClick={() => setShowDispatchLog(true)}
                  className="w-full h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border-2 border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-500/20 transition-all relative"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  سجل الفواتير المحوّلة
                  {pendingDispatchCount > 0 && (
                    <Badge className="text-[10px] px-1.5 py-0 h-5 bg-amber-500 text-white animate-pulse">
                      {pendingDispatchCount} قيد القبول
                    </Badge>
                  )}
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
                    setCustomerName("", null, "", null); updateActiveOrder(o => ({ ...o, orderType: "dine_in", deliveryAddress: "", name: o.tableName ? o.tableName : `طلب ${o.name.match(/\d+/)?.[0] || "1"}` })); setCustomerSearch("");
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
      <Dialog open={showOpenShift} onOpenChange={(v) => { if (!v && !session) navigate("/apps", { replace: true }); setShowOpenShift(v); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">فتح وردية جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Cash Box Selector */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">الصندوق</label>
              <select
                value={selectedCashBoxId}
                onChange={(e) => {
                  setSelectedCashBoxId(e.target.value);
                  if (e.target.value === "__call_center__") {
                    setOpeningCash("0");
                  }
                }}
                className="w-full h-12 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="">-- اختر الصندوق --</option>
                {cashBoxes.map(box => (
                  <option key={box.id} value={box.id}>{box.name}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberCashBox}
                  onChange={(e) => setRememberCashBox(e.target.checked)}
                  className="rounded border-input"
                />
                <span className="text-xs text-muted-foreground">تذكر هذا الصندوق لهذا الجهاز</span>
              </label>
            </div>
            {selectedCashBoxId !== "__call_center__" && (
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">النقدية الافتتاحية (₪)</label>
                <Input
                  type="number"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  placeholder="0.00"
                  className="text-lg h-12 text-center font-bold"
                  autoFocus={!selectedCashBoxId}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleOpenShift} className="w-full h-12 text-base font-bold gap-2">
              <CheckCircle className="h-5 w-5" />
              فتح الوردية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog (first login) */}
      <Dialog open={showChangePassword} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" dir="rtl" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-xl">🔐 تغيير كلمة المرور</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">يرجى تغيير كلمة المرور الافتراضية قبل المتابعة.</p>
          <div className="space-y-3 py-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">كلمة المرور الجديدة *</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6 أحرف على الأقل"
                className="h-11"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">تأكيد كلمة المرور *</label>
              <Input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="أعد إدخال كلمة المرور"
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleChangePassword} disabled={changingPassword || newPassword.length < 6} className="w-full h-11 font-bold">
              {changingPassword ? "جاري التغيير..." : "تغيير كلمة المرور"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeviceBlocked} onOpenChange={async (v) => { if (!v) { await supabase.auth.signOut(); navigate("/auth", { replace: true }); } setShowDeviceBlocked(v); }}>
        <DialogContent className="sm:max-w-md" dir="rtl" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-xl text-destructive flex items-center gap-2">
              <AlertCircle className="h-6 w-6" />
              جهاز غير مصرح
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              هذا الجهاز غير مسجّل أو معطّل في نظام إدارة الأجهزة. لا يمكن فتح وردية من جهاز غير معتمد.
            </p>
            <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3">
              يرجى التواصل مع المدير لتسجيل هذا الجهاز من صفحة "إدارة أجهزة نقاط البيع".
            </p>
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={async () => { await supabase.auth.signOut(); navigate("/auth", { replace: true }); }} className="w-full h-12 gap-2">
              <LogOut className="h-5 w-5" />
              تسجيل الخروج
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shortcuts Guide Dialog */}
      <Dialog open={showShortcutsGuide} onOpenChange={setShowShortcutsGuide}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              دليل اختصارات لوحة المفاتيح
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Action shortcuts */}
            <div>
              <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">⚡ الأوامر</h3>
              <div className="space-y-1.5">
                {[
                  { key: "F2", desc: "تحويل إلى الفرع" },
                  { key: "F4", desc: "سجل الفواتير" },
                  { key: "F8", desc: "طباعة" },
                  { key: "F9", desc: "إرسال إلى الطابعة" },
                  { key: "F10", desc: "حفظ الطلب" },
                  { key: "F12", desc: "فتح نافذة الدفع" },
                  { key: "Ctrl+Del", desc: "إفراغ السلة بالكامل" },
                ].map(s => (
                  <div key={s.key} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/50">
                    <span className="text-sm text-foreground">{s.desc}</span>
                    <kbd className="text-xs font-mono bg-background border border-border rounded px-2 py-0.5 shadow-sm text-muted-foreground">{s.key}</kbd>
                  </div>
                ))}
              </div>
            </div>
            {/* Category shortcuts */}
            <div>
              <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">📂 التصنيفات</h3>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-foreground">كل التصنيفات</span>
                  <kbd className="text-xs font-mono bg-background border border-border rounded px-2 py-0.5 shadow-sm text-muted-foreground">Alt+0</kbd>
                </div>
                <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-foreground">التصنيف الأول إلى التاسع</span>
                  <kbd className="text-xs font-mono bg-background border border-border rounded px-2 py-0.5 shadow-sm text-muted-foreground">Alt+1 ... Alt+9</kbd>
                </div>
              </div>
            </div>
            {/* Product shortcuts */}
            <div>
              <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">📦 المنتجات</h3>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-foreground">إضافة المنتج 1-9 من الشبكة</span>
                  <kbd className="text-xs font-mono bg-background border border-border rounded px-2 py-0.5 shadow-sm text-muted-foreground">Ctrl+1 ... Ctrl+9</kbd>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="sm:max-w-lg max-h-[95vh] flex flex-col p-0 gap-0 overflow-hidden" dir="rtl">
          <DialogHeader className="flex-shrink-0 px-6 pt-5 pb-3">
            <DialogTitle className="text-lg font-bold">طريقة الدفع</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 pb-2 overflow-y-auto flex-1 min-h-0 scrollbar-thin">
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
                { key: "card", label: "بطاقة", icon: CreditCard, color: "#3B82F6" },
                { key: "credit", label: "آجل", icon: Receipt, color: "#F59E0B", requiresPerm: true },
                { key: "employee_account", label: "حساب موظف", icon: UserCheck, color: "#8B5CF6" },
              ].filter(m => {
                if (m.requiresPerm && !isAdmin && !posPerms.allow_credit_sale) return false;
                return true;
              }).map((m) => {
                const isActive = paymentMethod === m.key;
                return (
                  <motion.button
                    key={m.key}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                      setPaymentMethod(m.key);
                      if (m.key === "card") {
                        // Check if card bank account is configured
                        (async () => {
                          const uid = dataOwnerId || user?.id;
                          if (!uid) return;
                          const { data: cs } = await supabase
                            .from("company_settings" as any)
                            .select("card_bank_account_id")
                            .eq("user_id", uid)
                            .maybeSingle();
                          if (!(cs as any)?.card_bank_account_id) {
                            toast.error("⚠️ لم يتم تعريف حساب بنكي للبطاقة — يرجى تحديده من الإعدادات → المالية");
                          }
                        })();
                      }
                    }}
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
                          onClick={() => { setPaymentCurrency(cur.code); setChangeCurrency("ILS"); setEditedRate(null); setRateEdited(false); setTenderedAmount(""); setManualChangeAmount(null); }}
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

                {/* Amount input — moved above exchange rate */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground text-left">
                    المبلغ المستلم ({currencies.find(c => c.code === paymentCurrency)?.name})
                  </p>
                  <Input
                    type="number"
                    value={tenderedAmount}
                    onChange={(e) => { setTenderedAmount(e.target.value); setManualChangeAmount(null); }}
                    placeholder={(cartTotals.total / (exchangeRates[paymentCurrency] || 1)).toFixed(2)}
                    className="text-xl h-14 text-center font-bold tabular-nums"
                    autoFocus
                  />
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

                {/* Change calculation */}
                {(() => {
                  const tendered = parseFloat(tenderedAmount) || 0;
                  if (tendered <= 0) return null;
                   const rate = exchangeRates[paymentCurrency] || 1;
                   const tenderedInILS = paymentCurrency === "ILS" ? tendered : tendered * rate;
                   const effectiveT = customerDataDiscount ? cartTotals.total - customerDataDiscount.discountAmount : cartTotals.total;
                   const changeILS = tenderedInILS - effectiveT;
                  const curSymbol = currencies.find(c => c.code === paymentCurrency)?.symbol || "";
                  const changeInForeign = paymentCurrency !== "ILS" ? changeILS / rate : 0;

                  // Determine displayed change based on changeCurrency
                  const displayChangeAmount = changeCurrency === "ILS" ? changeILS : changeILS / (exchangeRates[changeCurrency] || rate);
                  const displaySymbol = changeCurrency === "ILS" ? "₪" : changeCurrency === "USD" ? "$" : changeCurrency === "JOD" ? "د.أ " : "₪";
                  const displaySuffix = changeCurrency === "JOD" ? "" : "";

                  return (
                    <div className="p-3 rounded-xl border border-border space-y-2">
                      {paymentCurrency !== "ILS" && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">ما يعادل بالشيكل</span>
                          <span className="font-bold tabular-nums">₪{tenderedInILS.toFixed(2)}</span>
                        </div>
                      )}
                      {changeILS >= 0 ? (
                        <>
                          {/* Change currency selector - only for foreign payments */}
                          {paymentCurrency !== "ILS" && changeILS > 0 && (
                            <div className="flex gap-1.5 justify-center py-1">
                              {["ILS", paymentCurrency].filter((v, i, a) => a.indexOf(v) === i).map(cur => {
                                const isActive = changeCurrency === cur;
                                const label = cur === "ILS" ? "شيكل ₪" : cur === "USD" ? "دولار $" : cur === "JOD" ? "دينار د.أ" : cur;
                                return (
                                  <button
                                    key={cur}
                                    onClick={() => { setChangeCurrency(cur); setManualChangeAmount(null); }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                      isActive
                                        ? "bg-primary text-primary-foreground shadow-md"
                                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                                    }`}
                                  >
                                    الباقي {label}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Main change display - editable */}
                          <div className="flex justify-between items-center p-3 bg-accent/20 rounded-xl border-2 border-accent">
                            <span className="text-sm font-bold text-foreground">الباقي للزبون</span>
                            <div className="flex items-center gap-1">
                              <span className="text-lg font-bold" style={{ color: "#16a34a" }}>{displaySymbol}</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                value={manualChangeAmount !== null ? manualChangeAmount : displayChangeAmount.toFixed(2)}
                                onChange={(e) => setManualChangeAmount(e.target.value)}
                                onFocus={(e) => { if (manualChangeAmount === null) setManualChangeAmount(displayChangeAmount.toFixed(2)); e.target.select(); }}
                                className="w-24 text-left text-2xl font-black tabular-nums bg-transparent border-none outline-none focus:ring-1 focus:ring-primary rounded px-1"
                                style={{ color: "#16a34a" }}
                                dir="ltr"
                              />
                            </div>
                          </div>

                          {/* Show other currency equivalent as secondary info */}
                          {paymentCurrency !== "ILS" && changeILS > 0 && (
                            <div className="flex justify-between text-[11px] text-muted-foreground border-t border-border pt-1.5">
                              {changeCurrency === "ILS" ? (
                                <>
                                  <span>أو بال{currencies.find(c => c.code === paymentCurrency)?.name}</span>
                                  <span className="font-medium tabular-nums">{curSymbol}{changeInForeign.toFixed(2)}</span>
                                </>
                              ) : (
                                <>
                                  <span>أو بالشيكل</span>
                                  <span className="font-medium tabular-nums">₪{changeILS.toFixed(2)}</span>
                                </>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex justify-between items-center p-2.5 bg-destructive/5 rounded-lg">
                          <span className="text-xs text-destructive">المبلغ غير كافٍ</span>
                          <span className="text-lg font-bold text-destructive tabular-nums">-₪{Math.abs(changeILS).toFixed(2)}</span>
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
                        onClick={() => { setTenderedAmount(String(amt)); setManualChangeAmount(null); }}
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
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-2"
              >
                <label className="text-sm font-bold block">اسم الزبون</label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={customerSearch || customerName}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setCustomerName(e.target.value, null);
                      setShowContactDropdown(true);
                    }}
                    onFocus={() => setShowContactDropdown(true)}
                    placeholder="ابحث عن زبون..."
                    className="h-11 pr-10 text-sm"
                    autoFocus
                  />
                </div>

                {/* Inline scrollable customer list */}
                <div className="border border-border rounded-xl overflow-hidden bg-card">
                  <ScrollArea className="max-h-[200px]">
                    {filteredContacts.length > 0 ? (
                      <div className="divide-y divide-border">
                        {filteredContacts.map((contact) => (
                          <button
                            key={contact.id}
                            onClick={() => {
                              setCustomerName(contact.contact_name, contact.id);
                              setCustomerSearch("");
                              setShowContactDropdown(false);
                            }}
                            className={`w-full px-3 py-2.5 text-sm text-right hover:bg-primary/5 transition flex items-center gap-2 ${
                              customerName === contact.contact_name ? "bg-primary/10 font-semibold" : ""
                            }`}
                          >
                            <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="flex-1 truncate">{contact.contact_name}</span>
                            {customerName === contact.contact_name && (
                              <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        لا يوجد نتائج
                      </div>
                    )}
                  </ScrollArea>
                  <button
                    onClick={() => {
                      setNewCustomerName(customerSearch || "");
                      setShowQuickAddCustomer(true);
                      setShowContactDropdown(false);
                    }}
                    className="w-full px-3 py-2.5 text-sm text-right hover:bg-primary/10 transition flex items-center gap-2 border-t border-border text-primary font-semibold bg-primary/5"
                  >
                    <PlusCircle className="h-4 w-4 shrink-0" />
                    <span>إضافة زبون جديد</span>
                  </button>
                </div>
              </motion.div>
            )}

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
                  <div className="z-50 w-full bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {filteredEmployees.map((emp) => (
                      <button
                        key={emp.id}
                        onClick={() => {
                          setSelectedEmployee({ id: emp.id, full_name: emp.full_name, account_code: emp.account_code, job_title: emp.job_title });
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
                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-purple-500" />
                        <span className="text-sm font-medium">{selectedEmployee.full_name}</span>
                      </div>
                      {selectedEmployee.job_title && (
                        <span className="text-xs text-muted-foreground">{selectedEmployee.job_title}</span>
                      )}
                    </div>
                    <div className="mt-2">
                      <Input
                        value={employeeNote}
                        onChange={(e) => setEmployeeNote(e.target.value)}
                        placeholder="ملاحظة (مثال: غداء، أكل، سلفة...)"
                        className="h-8 text-xs bg-background/50"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Complete sale button */}
          <div className="flex-shrink-0 px-6 pb-5 pt-3 border-t border-border bg-background">
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button
                onClick={() => handleCompleteOrder()}
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
          </div>
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
              <label className="text-sm font-medium mb-1.5 block">النقدية — شيكل (₪)</label>
              <Input
                type="number"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                placeholder="0.00"
                className="text-2xl h-14 text-center font-bold"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">دولار ($)</label>
                <Input
                  type="number"
                  value={closingCashUSD}
                  onChange={(e) => setClosingCashUSD(e.target.value)}
                  placeholder="0.00"
                  className="text-lg h-12 text-center font-bold"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">دينار (د.أ)</label>
                <Input
                  type="number"
                  value={closingCashJOD}
                  onChange={(e) => setClosingCashJOD(e.target.value)}
                  placeholder="0.00"
                  className="text-lg h-12 text-center font-bold"
                />
              </div>
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
               تم إغلاق الوردية بنجاح. سيتم تسجيل خروجك الآن.
             </p>
           </div>
           <DialogFooter className="flex gap-2 sm:gap-2">
             <Button
               variant="destructive"
               className="w-full gap-2"
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
      <POSReceiptDialog open={showReceipt} onOpenChange={setShowReceipt} data={receiptData} showReturnPolicy={posReturnPolicy.show} returnPolicyDays={posReturnPolicy.days} autoPrint={posAutoPrint} />

      {/* ── Kitchen Ticket Dialog ── */}
      <Dialog open={showKitchenTicket} onOpenChange={setShowKitchenTicket}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto" dir="rtl">
          <div className="text-center space-y-1 pb-2 border-b border-dashed border-border">
            <p className="text-lg font-bold">🍳 تذاكر المطبخ</p>
            <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString("ar-PS")}</p>
          </div>
          {kitchenTicketData && (
            <div className="space-y-4 py-2">
              <div className="flex justify-between text-sm">
                <span className="font-bold text-foreground">{kitchenTicketData.tableName}</span>
                <span className="text-muted-foreground">{kitchenTicketData.time}</span>
              </div>
              {kitchenTicketData.guestCount > 0 && (
                <p className="text-xs text-muted-foreground">عدد الضيوف: {kitchenTicketData.guestCount}</p>
              )}

              {/* Station-grouped tickets */}
              {(kitchenTicketData.tickets || []).map((ticket: any, ti: number) => (
                <div key={ti} className="border border-border rounded-xl overflow-hidden">
                  <div className="px-3 py-2 flex items-center gap-2" style={{ backgroundColor: ticket.stationColor + "18" }}>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ticket.stationColor }} />
                    <span className="text-xs font-bold" style={{ color: ticket.stationColor }}>{ticket.stationName}</span>
                    <span className="text-[10px] text-muted-foreground mr-auto">{ticket.items.length} صنف</span>
                  </div>
                  <div className="px-3 py-2 space-y-2">
                    {ticket.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-base font-bold text-primary min-w-[28px]">{item.qty}×</span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-foreground">{item.name}</p>
                          {item.modifiers?.map((m: any, mi: number) => (
                            <p key={mi} className="text-xs text-muted-foreground">← {m.option_name}{m.extra_price > 0 ? ` +₪${m.extra_price}` : ''}</p>
                          ))}
                          {item.note && <p className="text-xs text-amber-600 mt-0.5">📝 {item.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

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
            <Button onClick={() => {
              if (kitchenTicketData) {
                const kitchenOrder: BridgePrintOrder = {
                  orderNumber: kitchenTicketData.orderNumber || Date.now().toString(),
                  branchName: company?.name || "مطعم الملكي - سفيان",
                  cashier: kitchenTicketData.cashierName || "",
                  items: (kitchenTicketData.stations || []).flatMap((st: any) =>
                    (st.items || []).map((item: any) => ({
                      id: item.id || item.name,
                      name: item.name,
                      quantity: item.qty || 1,
                      price: 0,
                      note: item.note || undefined,
                      printerKey: "kitchen" as const,
                    }))
                  ),
                  total: 0,
                  orderNote: kitchenTicketData.orderNote || undefined,
                };
                bridgePrintAll(kitchenOrder);
              }
              setShowKitchenTicket(false);
            }} className="flex-1 gap-1">
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
          toast.success(`✅ تم تطبيق خصم ${data.discountPct}% — وفّر الزبون ₪${data.discountAmount.toFixed(2)}`);
        }}
        onSkip={() => {
          setCustomerDataDiscount(null);
          setShowCustomerDataModal(false);
        }}
      />

      {/* Modifier Modal removed — replaced by InlineAddonPanel */}

      {/* Quick Add Customer Dialog */}
      <Dialog open={showQuickAddCustomer} onOpenChange={setShowQuickAddCustomer}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-primary" />
              إضافة زبون جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">اسم الزبون *</label>
              <Input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="أدخل اسم الزبون"
                className="h-10"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">رقم الهاتف (اختياري)</label>
              <Input
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                placeholder="05X XXX XXXX"
                className="h-10"
                dir="ltr"
                type="tel"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">العنوان (اختياري)</label>
              <Input
                value={newCustomerAddress}
                onChange={(e) => setNewCustomerAddress(e.target.value)}
                placeholder="المدينة، الشارع..."
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowQuickAddCustomer(false)}>إلغاء</Button>
            <Button
              onClick={() => handleQuickAddCustomer()}
              disabled={!newCustomerName.trim() || savingCustomer}
              className="gap-2"
            >
              {savingCustomer ? <Clock className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              حفظ وتحديد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice History Drawer */}
      <AnimatePresence>
        {showInvoiceHistory && (
          <InvoiceHistoryDrawer
            open={showInvoiceHistory}
            onClose={() => setShowInvoiceHistory(false)}
            dataOwnerId={dataOwnerId || ""}
            sessionId={session?.id || null}
            cashierName={session?.cashier_name || ""}
            terminalName={terminal?.name || ""}
            canEditInvoices={isAdmin || posPerms.can_edit_invoices || posPerms.edit_cancel_invoices}
            canCancelInvoices={isAdmin || posPerms.can_cancel_invoices || posPerms.edit_cancel_invoices}
            requireManagerForRecall={!isAdmin && !(posPerms.can_edit_invoices) && posPerms.require_manager_for_invoices}
            requireManagerForCancel={!isAdmin && posPerms.require_manager_for_invoices}
            allowOrderTransfer={posAllowOrderTransfer}
            printInvoices={isAdmin || posPerms.print_invoices}
            resendInvoice={isAdmin || posPerms.resend_invoice}
            onRecallToCart={(items, invoiceId, orderNumber, reason, approvedBy) => {
              setCart(items);
              setRecallBanner({ invoiceId, orderNumber, reason, approvedBy });
            }}
          />
        )}
      </AnimatePresence>

      {/* Financial Operation Modals */}
      <InventoryInputModal
        open={showInventoryInput}
        onOpenChange={setShowInventoryInput}
        dataOwnerId={dataOwnerId || ""}
        userId={userId || ""}
        sessionId={session?.id}
        canCreateProduct={isAdmin || posPerms.can_create_product}
        onSuccess={() => {
          // Refresh products
          if (dataOwnerId) {
            supabase.from("products").select("*").eq("user_id", dataOwnerId).eq("is_pos_available", true).then(({ data }) => {
              if (data) setProducts(data as any);
            });
          }
        }}
      />
      <PurchaseModal
        open={showPurchaseModal}
        onOpenChange={setShowPurchaseModal}
        dataOwnerId={dataOwnerId || ""}
        userId={userId || ""}
        sessionId={session?.id}
        canCreateSupplier={isAdmin || posPerms.can_create_supplier}
        canAffectInventory={isAdmin || posPerms.can_affect_inventory_on_purchase}
        canPayCash={isAdmin || posPerms.can_pay_purchases_cash}
        onSuccess={() => {
          if (dataOwnerId) {
            supabase.from("products").select("*").eq("user_id", dataOwnerId).eq("is_pos_available", true).then(({ data }) => {
              if (data) setProducts(data as any);
            });
          }
        }}
      />
      <ExpenseModal
        open={showExpenseModal}
        onOpenChange={setShowExpenseModal}
        dataOwnerId={dataOwnerId || ""}
        userId={userId || ""}
        sessionId={session?.id}
        canCreateCategory={isAdmin || posPerms.can_create_expense_category}
        sessionBalance={session ? session.opening_cash + session.total_sales : 0}
      />
      <SyncLogSheet open={showSyncLog} onOpenChange={setShowSyncLog} />
      
      {/* Call Center Dispatch Dialog */}
      <CallCenterDispatchDialog
        open={showCallCenterDispatch}
        onOpenChange={setShowCallCenterDispatch}
        dataOwnerId={dataOwnerId || ""}
        cart={cart.map(item => ({ name: item.name, qty: item.qty, unit_price: item.unit_price, total: item.total, note: item.note, product_id: item.product_id }))}
        total={customerDataDiscount ? cartTotals.total - customerDataDiscount.discountAmount : cartTotals.total}
        customerName={customerName}
        customerPhone={activeOrder.customerPhone}
        deliveryAddress={activeOrder.deliveryAddress}
        orderNote={orderNote}
        onSuccess={() => {
          // Clear cart after successful dispatch
          setCart([]); setSelectedCartIndex(null); setOrderDiscount(0); setOrderNote("");
          setCustomerDataDiscount(null);
          setCustomerName("", null, "", null);
          updateActiveOrder(o => ({ ...o, orderType: "dine_in", deliveryAddress: "" }));
        }}
      />

      {/* Dispatched Orders Log */}
      <DispatchedOrdersLog
        open={showDispatchLog}
        onClose={() => setShowDispatchLog(false)}
        dataOwnerId={dataOwnerId || ""}
      />

      {/* Confirm Delete Product Dialog */}
      <Dialog open={!!confirmDeleteProduct} onOpenChange={(v) => { if (!v) setConfirmDeleteProduct(null); }}>
        <DialogContent className="max-w-xs z-[1200]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive text-base">
              <Trash2 className="h-5 w-5" />
              حذف المنتج
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            هل أنت متأكد من حذف "{confirmDeleteProduct?.name}"؟
            <br />
            <span className="text-destructive text-xs">لا يمكن التراجع عن هذا الإجراء.</span>
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteProduct(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!!deletingProductId}
              onClick={() => confirmDeleteProduct && handleDeleteProduct(confirmDeleteProduct.id)}
            >
              {deletingProductId ? "جاري الحذف..." : "حذف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default POSPage;
