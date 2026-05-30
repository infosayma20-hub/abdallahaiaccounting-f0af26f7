import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePOSOffline } from "@/hooks/usePOSOffline";
import { usePBXCallListener } from "@/hooks/usePBXCallListener";
import { bridgeOpenDrawer } from "@/lib/print-bridge-client";
import OfflineStatusBar from "@/components/pos/OfflineStatusBar";
import SyncLogSheet from "@/components/pos/SyncLogSheet";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { assertPermission } from "@/lib/permissions/assertPermission";
import { usePosMode } from "@/hooks/usePosMode";
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
  FileText, Keyboard, MoreHorizontal, RefreshCw, ChefHat, Sun, Moon, Phone, MapPin, Send, ClipboardList, Settings,
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
import { sendToBridge } from "@/lib/print-bridge-client";
import { printReceiptImage, printKitchenTicketsImage, printAllImage, printStationTicketImage, STATION_TO_PRINTER, type KitchenJob } from "@/lib/image-print-service";
import { printShiftSummaryImage } from "@/lib/image-print-service";
import { usePrintBridge, type PrintOrder as BridgePrintOrder } from "@/hooks/usePrintBridge";
import InventoryInputModal from "@/components/pos/InventoryInputModal";
import BridgeStatusIndicator from "@/components/pos/BridgeStatusIndicator";
import POSDeliveryPanel from "@/components/pos/POSDeliveryPanel";
import PurchaseModal from "@/components/pos/PurchaseModal";
import ExpenseModal from "@/components/pos/ExpenseModal";
import POSBarcodeScanner from "@/components/pos/POSBarcodeScanner";
import POSDeviceGuard from "@/components/pos/POSDeviceGuard";
import PrintingNotReadyBanner from "@/components/pos/PrintingNotReadyBanner";
import { getDeviceConfig, onDeviceConfigChange, assertDeviceReady, hydrateConfigFromBridge, syncBranchPrintersToBridge } from "@/lib/device-config";
import { getCanSell } from "@/lib/pos-device-auth";
import { usePOSShiftWatcher } from "@/hooks/usePOSShiftWatcher";
import { ShiftClosedElsewhereDialog } from "@/components/pos/ShiftClosedElsewhereDialog";
import { saveBlockedCart, loadBlockedCart, clearBlockedCart } from "@/lib/pos-blocked-cart-draft";
import { checkBridgeStatus } from "@/lib/print-bridge-client";
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
  station_id?: string | null;
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
  /**
   * هل اختار الكاشير نوع الطلب صراحة (استلام / توصيل / طاولة)؟
   * يُستخدم كحارس قبل الطباعة والدفع لمنع الإرسال بدون تحديد النوع.
   */
  orderTypeChosen?: boolean;
  deliveryAddress: string;
  zoneCode: string;
  areaName: string;
  deliveryStatus: string;
  captainName: string;
  captainPhone: string;
  captainVehicle: string;
  savedOrderId: string | null;
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

const POSThemeToggle = ({ darkMode, onToggle }: { darkMode: boolean; onToggle: () => void }) => {
  return (
    <button
      onClick={onToggle}
      className="h-8 w-8 rounded-lg flex items-center justify-center bg-white/10 text-white/50 hover:text-white/90 hover:bg-white/20 transition-all group relative"
      title={darkMode ? "الوضع النهاري" : "الوضع الليلي"}
    >
      {darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      <span className="absolute top-full mt-1.5 px-2 py-1 rounded text-[10px] font-medium bg-black/90 text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
        {darkMode ? "الوضع النهاري" : "الوضع الليلي"}
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
  // الافتراضي: الاستلام مختار تلقائياً لتسهيل العمل (طلبات بدون طاولة)
  orderTypeChosen: true,
  deliveryAddress: "",
  zoneCode: "",
  areaName: "",
  deliveryStatus: "none",
  captainName: "",
  captainPhone: "",
  captainVehicle: "",
  savedOrderId: null,
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
  restricted_cash_box_ids?: string[] | null;
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
  phone?: string;
  tax_number?: string;
  address?: string;
}

interface Terminal {
  id: string;
  name: string;
  company_id: string;
}

interface CashBoxOption {
  id: string;
  name: string;
  type: string;
  branch_id?: string | null;
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


const SortableCategoryChip = ({ cat, isActive, isSortMode, isDragging, onClick, posDark }: {
  cat: { id: string; name: string; color: string; count: number };
  isActive: boolean;
  isSortMode: boolean;
  isDragging: boolean;
  onClick: () => void;
  posDark?: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: cat.id,
    disabled: !isSortMode,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const cardStyle: React.CSSProperties = {
    ...style,
    backgroundColor: isActive ? (posDark ? 'white' : '#0D1B2E') : (posDark ? 'rgba(255,255,255,0.06)' : 'white'),
    borderColor: isSortMode ? "hsl(var(--primary))" : isActive ? (posDark ? 'white' : '#0D1B2E') : (posDark ? 'rgba(255,255,255,0.1)' : '#dbeafe'),
    color: isActive ? (posDark ? '#0D1B2E' : "#fff") : (posDark ? 'rgba(255,255,255,0.7)' : '#475569'),
    boxShadow: isDragging ? "0 8px 25px rgba(0,0,0,0.2)" : isActive ? '0 2px 8px rgba(13,27,46,0.25)' : 'none',
    borderStyle: isSortMode ? "dashed" as const : "solid" as const,
    borderWidth: "1.5px",
    cursor: isSortMode ? "grab" as const : "pointer" as const,
    transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
  };
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...(isSortMode ? listeners : {})}
      onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-full text-[12px] whitespace-nowrap border select-none ${
        isSortMode ? "ring-1 ring-amber-400/50" : ""
      } ${!isActive && !posDark ? "hover:bg-[#eff6ff] hover:border-[#93c5fd]" : ""} ${!isActive && posDark ? "hover:bg-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.2)] hover:text-white" : ""}`}
      style={{ ...cardStyle, minWidth: 80, height: 40, padding: "4px 14px" }}
    >
      {isSortMode && <GripVertical className="h-3 w-3 opacity-60 mb-0.5" />}
      <span className="leading-tight text-center">{cat.name}</span>
      {cat.count > 0 && <span className="text-[9px] opacity-70 mt-0.5">({cat.count})</span>}
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
  // Phase A — Generalization Hard Stop: drives restaurant vs retail UI
  // and replaces the hardcoded Malaky email check for Call Center.
  const { restaurantFeatures, callCenterEnabled } = usePosMode();
  const searchRef = useRef<HTMLInputElement>(null);
  const { printAll: bridgePrintAll } = usePrintBridge();
  // Guard against rapid double-fires on print shortcuts (F8/F9/payment button).
  // Holds the timestamp of the last print click — ignores clicks within 1500ms.
  const lastPrintClickRef = useRef<number>(0);
  const printInProgressRef = useRef<boolean>(false);

  /** Build a stable hash for the current cart contents (for F8 dedupe). */
  const buildCartHash = useCallback((items: { name: string; qty: number; unit_price?: number }[]): string => {
    if (!items?.length) return "empty";
    const sig = items.map(i => `${i.name}x${i.qty}@${i.unit_price || 0}`).join("|");
    let h = 0;
    for (let i = 0; i < sig.length; i++) h = ((h << 5) - h + sig.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
  }, []);

  /** Returns true if a print click should be ignored (throttled or in-flight). */
  const shouldThrottlePrint = useCallback((label: string): boolean => {
    const now = Date.now();
    if (printInProgressRef.current) {
      console.warn(`[frontend-print-blocked-in-progress] ${label}`);
      return true;
    }
    if (now - lastPrintClickRef.current < 1500) {
      console.warn(`[frontend-print-blocked-throttle] ${label} — last click ${now - lastPrintClickRef.current}ms ago`);
      return true;
    }
    lastPrintClickRef.current = now;
    return false;
  }, []);

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
  // Per-shift default-category guard (Malaky: default to "كرسبي فردي" on shift open)
  const defaultCategoryAppliedRef = useRef<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<{ id: string; contact_name: string }[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [showSalesSummary, setShowSalesSummary] = useState(true);
  const [cardSize, setCardSize] = useState<"S" | "M" | "L">(() => {
    return (localStorage.getItem("pos-card-size") as "S" | "M" | "L") || "S";
  });
  const [posDarkMode, setPosDarkMode] = useState(() => localStorage.getItem("pos-theme") === "dark");
  const togglePosDark = useCallback(() => {
    setPosDarkMode(prev => {
      const next = !prev;
      localStorage.setItem("pos-theme", next ? "dark" : "light");
      return next;
    });
  }, []);

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
    // Safe setter — enforces pos.sell.discount permission (defense-in-depth).
    // Allow d === 0 always (used for resetting after sales).
    if (d !== 0 && !posFeatPerm.can("sell", "discount")) {
      toast.error("لا تملك صلاحية تطبيق الخصم");
      updateActiveOrder(o => ({ ...o, orderDiscount: 0 }));
      return;
    }
    updateActiveOrder(o => ({ ...o, orderDiscount: d }));
  }, [updateActiveOrder]);

  const setOrderDiscountType = useCallback((t: "fixed" | "percent") => {
    if (!posFeatPerm.can("sell", "discount")) {
      toast.error("لا تملك صلاحية تطبيق الخصم");
      return;
    }
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
  const [cashBoxes, setCashBoxes] = useState<CashBoxOption[]>([]);
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
  // Cashier policy windows (loaded from company_settings, see fetch below).
  const [cashierCancelWindowMin, setCashierCancelWindowMin] = useState(30);
  const [cashierAmountVisibleMin, setCashierAmountVisibleMin] = useState(60);
  // Replacement-invoice flow: remember the last invoice the cashier just
  // cancelled in THIS session so we can offer a "هذه فاتورة معدّلة" toggle on
  // the next sale. Auto-suggested ON for the first sale after a cancel; the
  // cashier can untick it. Cleared after the next sale completes (or after a
  // reasonable timeout/window).
  const [lastCancelledOrder, setLastCancelledOrder] = useState<{ id: string; order_number: string | null; at: number } | null>(null);
  const [markAsReplacement, setMarkAsReplacement] = useState(false);
  const [detectedBranchId, setDetectedBranchId] = useState<string | null>(null);
  // ── Device-level config (per-machine, stored in localStorage) ──
  const [deviceConfig, setDeviceConfig] = useState(() => getDeviceConfig());
  const [terminalBranchId, setTerminalBranchId] = useState<string | null>(null);
  const [terminalBranchChecked, setTerminalBranchChecked] = useState(false);
  const [cashBoxBranchId, setCashBoxBranchId] = useState<string | null>(null);
  const [cashBoxBranchChecked, setCashBoxBranchChecked] = useState(false);
  // Diagnostic state for the open-shift dialog (per-line readiness)
  const [bridgeOnlineDiag, setBridgeOnlineDiag] = useState<boolean | null>(null);
  const [printersCountDiag, setPrintersCountDiag] = useState<number | null>(null);

  const selectedCashBox = useMemo(
    () => cashBoxes.find((box) => box.id === selectedCashBoxId) || null,
    [cashBoxes, selectedCashBoxId]
  );

  const guardCashBoxBranchId = useCallback((box?: CashBoxOption | null) => {
    // Emergency POS access: do not block users by branch/cash-box binding for now.
    return true;
    const targetBox = box ?? selectedCashBox;
    if (!targetBox || targetBox.id === "__call_center__") return true;
    if (!targetBox.branch_id) {
      toast.error("⛔ لا يمكن فتح الوردية: الصندوق غير مربوط بفرع");
      return false;
    }
    if (deviceConfig.branchId && targetBox.branch_id !== deviceConfig.branchId) {
      setCashBoxBranchId(targetBox.branch_id);
      toast.error("⛔ تعارض في الفرع: هذا الجهاز مخصص لفرع آخر");
      return false;
    }
    return true;
  }, [deviceConfig.branchId, selectedCashBox]);

  // Re-read device config when changed (other tab / settings page).
  useEffect(() => {
    const off = onDeviceConfigChange(() => setDeviceConfig(getDeviceConfig()));
    return off;
  }, []);

  // ── Open-shift dialog readiness diagnostic ──
  // Whenever the dialog opens, re-hydrate from the Print Bridge's
  // device.json (in case localStorage was wiped), refresh bridge online
  // status, and count configured printers for this device's branch.
  useEffect(() => {
    if (!showOpenShift) return;
    let cancelled = false;
    (async () => {
      try { await hydrateConfigFromBridge(); } catch { /* ignore */ }
      if (cancelled) return;
      setDeviceConfig(getDeviceConfig());
      try {
        const ok = await checkBridgeStatus();
        if (!cancelled) setBridgeOnlineDiag(ok);
      } catch {
        if (!cancelled) setBridgeOnlineDiag(false);
      }
      try {
        const cfg = getDeviceConfig();
        if (!user?.id) { setPrintersCountDiag(0); return; }
        const { data: ownerIdRaw } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
        const ownerId = (ownerIdRaw as string | null) || user.id;
        let q: any = (supabase.from("pos_printers") as any)
          .select("id, branch_id, is_active", { count: "exact", head: true })
          .eq("user_id", ownerId)
          .eq("is_active", true);
        if (cfg.branchId) q = q.or(`branch_id.eq.${cfg.branchId},branch_id.is.null`);
        const { count } = await q;
        if (cfg.branchId && (count ?? 0) > 0) {
          await syncBranchPrintersToBridge(cfg.branchId).catch(() => null);
        }
        if (!cancelled) setPrintersCountDiag(count ?? 0);
      } catch {
        if (!cancelled) setPrintersCountDiag(0);
      }
    })();
    return () => { cancelled = true; };
  }, [showOpenShift, user?.id]);

  // Resolve terminal.branch_id from DB whenever the configured terminal changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!deviceConfig.terminalId) {
        setTerminalBranchId(null);
        setTerminalBranchChecked(true);
        return;
      }
      setTerminalBranchChecked(false);
      const { data } = await supabase
        .from("pos_terminals")
        .select("branch_id")
        .eq("id", deviceConfig.terminalId)
        .maybeSingle();
      if (!cancelled) {
        setTerminalBranchId(((data as any)?.branch_id as string) || null);
        setTerminalBranchChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [deviceConfig.terminalId]);

  // Resolve cash_box.branch_id whenever the active session's cash box changes.
  useEffect(() => {
    let cancelled = false;
    const boxId = session?.cash_box_id;
    (async () => {
      if (!boxId) { setCashBoxBranchId(null); setCashBoxBranchChecked(true); return; }
      setCashBoxBranchChecked(false);
      const { data } = await supabase
        .from("cash_boxes")
        .select("branch_id")
        .eq("id", boxId)
        .maybeSingle();
      if (!cancelled) {
        setCashBoxBranchId(((data as any)?.branch_id as string) || null);
        setCashBoxBranchChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.cash_box_id]);

  // ── Concurrent-shift watcher ───────────────────────────────────────
  // Detects when the SAME cashier's session was closed (or marked deleted)
  // from another device. Uses Supabase Realtime + a 30s safety poll.
  // We keep a ref alongside state so `enforceDeviceGuard` (which is read
  // from inside event handlers and sync callbacks) sees the latest value
  // without needing to be re-memoized.
  // IDs of sessions THIS device closed locally. The watcher uses this to
  // suppress the "closed from elsewhere" alert when we're the ones who closed.
  const selfClosedSessionsRef = useRef<Set<string>>(new Set());
  const isSelfClosed = useCallback(
    (id: string) => selfClosedSessionsRef.current.has(id),
    [],
  );
  const { closedFromElsewhere: shiftClosedElsewhere, closedAt: shiftClosedAt } =
    usePOSShiftWatcher(session?.id ?? null, isSelfClosed);
  const shiftClosedElsewhereRef = useRef(false);
  useEffect(() => {
    shiftClosedElsewhereRef.current = shiftClosedElsewhere;
    if (shiftClosedElsewhere) {
      // 💾 Auto-save the current carts so the cashier doesn't lose work.
      // We snapshot at the moment of detection — the dialog blocks further
      // mutations from this point on, so this state matches what the user
      // sees on screen.
      saveBlockedCart(company?.id ?? null, userId ?? null, session?.id ?? null, orders);
      toast.error("⛔ تم إغلاق العهدة من جهاز آخر — توقف البيع والطباعة");
    }
  }, [shiftClosedElsewhere]);

  /**
   * 🛡️ Central enforcement called at the START of every sensitive function:
   * open shift, save draft, send to kitchen, complete order, print, accept call-center order.
   * Returns true ⇢ proceed. Returns false ⇢ caller MUST early-return.
   */
  const enforceDeviceGuard = useCallback((opts?: { silent?: boolean }) => {
    // 🔒 Device authorization (Print Bridge reachable). Single source of truth
    // lives in src/lib/pos-device-auth.ts and is kept in sync by POSDeviceAuthGuard.
    // When the Bridge is unreachable we hard-block selling/printing/drawer/open-shift
    // without unmounting POS — the cashier/admin can recover by clicking "إعادة الفحص"
    // in the sticky banner once the Bridge is back.
    if (!getCanSell()) {
      if (!opts?.silent) toast.error("⛔ وضع عرض فقط — برنامج الطباعة غير متصل على هذا الجهاز");
      return false;
    }
    // 🔒 Concurrent-shift safety: if this shift was closed from another
    // device (Realtime UPDATE or 30s poll caught it), block every sensitive
    // action. The ShiftClosedElsewhereDialog is already open at this point.
    if (shiftClosedElsewhereRef.current) {
      if (!opts?.silent) toast.error("⛔ تم إغلاق العهدة من جهاز آخر — لا يمكن إتمام البيع");
      return false;
    }
    // Emergency POS access: allow selling while device setup is corrected later.
    return true;
    if (!terminalBranchChecked || !cashBoxBranchChecked) {
      if (!opts?.silent) toast.error("⏳ يتم التحقق من فرع الجهاز والصندوق، حاول مرة أخرى");
      return false;
    }
    const result = assertDeviceReady({ terminalBranchId, cashBoxBranchId });
    if (!result.ok) {
      if (!opts?.silent) toast.error(`⛔ ${result.reason || "إعداد الجهاز غير مكتمل"}`);
      return false;
    }
    return true;
  }, [terminalBranchChecked, cashBoxBranchChecked, terminalBranchId, cashBoxBranchId]);

  const openPaymentModal = useCallback(() => {
    if (!enforceDeviceGuard()) return;
    if (!requireOrderTypeChosen()) return;
    setShowPayment(true);
  }, [enforceDeviceGuard, activeOrder?.orderTypeChosen, activeOrder?.tableId]);

  /**
   * يمنع المتابعة (دفع/طباعة) قبل أن يختار الكاشير صراحةً نوع الطلب:
   * استلام أو توصيل أو طاولة. يُظهر toast واضحاً إن لم يتم الاختيار.
   */
  const requireOrderTypeChosen = useCallback((): boolean => {
    const ao = activeOrder;
    if (!ao) return true;
    if (ao.tableId) return true; // طاولة محسوبة كاختيار صريح
    if (ao.orderTypeChosen) return true;
    toast.error("⛔ حدد نوع الطلب أولاً: استلام أو توصيل");
    return false;
  }, [activeOrder]);

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
      view_payment_details: boolean;
      view_pos_reports: boolean;
      require_manager_for_returns: boolean;
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
      view_payment_details: false, view_pos_reports: false, require_manager_for_returns: true,
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
    // Feature permission overrides (composed with posPerms below)
    const posFeatPerm = usePermission("pos");

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
           orderType: 'delivery',
           orderTypeChosen: true,
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
          view_payment_details: p.view_payment_details ?? false,
          view_pos_reports: p.view_pos_reports ?? false,
          require_manager_for_returns: p.require_manager_for_returns ?? true,
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
    const ch = supabase.channel(`dispatch-count-${dataOwnerId}`)
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

  // ── Malaky-only default category on shift open ──
  // For every cashier in the Malaky tenant, when a shift opens and the
  // categories list is loaded, auto-select "كرسبي فردي" once per shift.
  useEffect(() => {
    if (!session?.id) {
      defaultCategoryAppliedRef.current = null;
      return;
    }
    if (defaultCategoryAppliedRef.current === session.id) return;
    const companyName = (company?.name || "").toLowerCase();
    const isMalaky = /malaky|ملكي/.test(companyName);
    if (!isMalaky) return;
    if (!posCategories.some((c) => c.name === "كرسبي فردي")) return;
    setSelectedCategory("كرسبي فردي");
    defaultCategoryAppliedRef.current = session.id;
  }, [session?.id, company?.name, posCategories]);

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
          station_id: products.find((p) => p.id === line.product_id)?.kitchen_station_id || null,
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
          setTimeout(() => openPaymentModal(), 500);
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
      setCompany(comp ? { id: comp.id, name: comp.name, logo_url: comp.logo_url, phone: (comp as any).phone, tax_number: (comp as any).tax_number, address: (comp as any).address } : null);

      if (comp) {
        let term: any = null;
        if (deviceConfig.terminalId) {
          const { data: configuredTerm } = await supabase
            .from("pos_terminals")
            .select("*")
            .eq("id", deviceConfig.terminalId)
            .eq("user_id", dataOwnerId)
            .eq("company_id", comp.id)
            .maybeSingle();
          term = configuredTerm;
        }
        if (!term) {
          const { data: terminals } = await supabase
            .from("pos_terminals")
            .select("*")
            .eq("user_id", dataOwnerId)
            .eq("company_id", comp.id)
            .limit(1);
          term = terminals?.[0];
        }
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
          .select("pos_show_return_policy, pos_return_policy_days, pos_default_opening_balance, pos_allow_order_transfer, pos_require_cash_box, pos_auto_print, logo_url, pos_cashier_cancel_window_minutes, pos_cashier_invoice_amount_visible_minutes")
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
          const cw = Number((posSettings as any).pos_cashier_cancel_window_minutes);
          if (Number.isFinite(cw) && cw > 0) setCashierCancelWindowMin(cw);
          const av = Number((posSettings as any).pos_cashier_invoice_amount_visible_minutes);
          if (Number.isFinite(av) && av > 0) setCashierAmountVisibleMin(av);
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
          
          // Only add call center option if not hidden for this tenant
          const { data: csHidden } = await supabase
            .from("company_settings" as any)
            .select("hidden_apps")
            .eq("user_id", dataOwnerId)
            .maybeSingle();
          const hiddenApps: string[] = (csHidden as any)?.hidden_apps || [];
          const callCenterHidden = hiddenApps.includes("call_center") || hiddenApps.includes("callcenter");
          
          // Emergency POS access: do NOT silently hide cash boxes by branch.
          // The previous filter caused boxes to "disappear" whenever a device
          // was bound to a branch with no matching cash box. Admins setting up
          // multiple branches expect to see every active POS cash box and pick
          // the right one themselves. Selection-side guard remains permissive
          // (see guardCashBoxBranchId), so this is consistent.
          const boxList: CashBoxOption[] = [...(boxes || [])] as CashBoxOption[];
          // Check if this auth user is flagged as a call-center user in pos_users.
          // Such users have no cash box / opening cash — they only dispatch orders.
          const { data: posUserRow } = await supabase
            .from("pos_users")
            .select("is_call_center")
            .eq("auth_user_id", userId)
            .maybeSingle();
          const userIsCallCenter = !!(posUserRow as any)?.is_call_center;

          let finalBoxList: CashBoxOption[];
          if (userIsCallCenter) {
            // Call-center user: force the virtual call-center box only,
            // bypassing the tenant-level callCenterEnabled / hidden_apps gates.
            finalBoxList = [{ id: "__call_center__", name: "كول سنتر", type: "call_center" } as any];
          } else {
            // Phase A: Call Center option is opt-in via company_settings.pos_call_center_enabled.
            if (!callCenterHidden && callCenterEnabled) {
              boxList.push({ id: "__call_center__", name: "كول سنتر", type: "call_center" } as any);
            }
            finalBoxList = boxList;
          }
          setCashBoxes(finalBoxList);

          if (userIsCallCenter) {
            // Auto-select the call-center virtual box and zero out opening cash.
            setSelectedCashBoxId("__call_center__");
            setOpeningCash("0");
          } else {
            // Auto-select from device binding (localStorage)
            const savedBoxId = localStorage.getItem(`pos_default_cash_box_${dataOwnerId}`);
            if (savedBoxId && finalBoxList.some(b => b.id === savedBoxId)) {
              setSelectedCashBoxId(savedBoxId);
              setRememberCashBox(true);
            } else if (finalBoxList.length === 1) {
              setSelectedCashBoxId(finalBoxList[0].id);
            } else {
              setSelectedCashBoxId("");
            }
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
      .select("id, name, color, display_order, is_active, restricted_cash_box_ids")
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
  const pendingDeleteRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const handleDeleteProduct = async (productId: string) => {
    if (!dataOwnerId || !(isAdmin || posPerms.delete_products)) return;
    setDeletingProductId(productId);

    // Find the product to keep a copy for undo
    const deletedProduct = products.find(p => p.id === productId);
    if (!deletedProduct) { setDeletingProductId(null); return; }

    // Remove from UI immediately
    setProducts(prev => prev.filter(p => p.id !== productId));
    setConfirmDeleteProduct(null);
    setDeletingProductId(null);

    // Cancel any previous pending delete
    if (pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timer);
      pendingDeleteRef.current = null;
    }

    // Show undo toast for 10 seconds
    const toastId = toast(`تم حذف "${deletedProduct.name}"`, {
      duration: 10000,
      action: {
        label: "↩ تراجع",
        onClick: () => {
          // Cancel the pending DB delete
          if (pendingDeleteRef.current?.id === productId) {
            clearTimeout(pendingDeleteRef.current.timer);
            pendingDeleteRef.current = null;
          }
          // Restore the product in UI
          setProducts(prev => {
            if (prev.some(p => p.id === productId)) return prev;
            return [...prev, deletedProduct];
          });
          toast.success(`تم استعادة "${deletedProduct.name}" ✓`);
        },
      },
    });

    // Schedule actual DB delete after 10 seconds
    const timer = setTimeout(async () => {
      try {
        await supabase.from("products").delete().eq("id", productId).eq("user_id", dataOwnerId);
      } catch {
        // If DB delete fails, restore in UI
        setProducts(prev => {
          if (prev.some(p => p.id === productId)) return prev;
          return [...prev, deletedProduct];
        });
        toast.error("فشل حذف المنتج من قاعدة البيانات");
      }
      pendingDeleteRef.current = null;
    }, 10000);

    pendingDeleteRef.current = { id: productId, timer };
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

  // Filter categories by current cash box restrictions
  const visiblePosCategories = useMemo(() => {
    const currentBoxId = session?.cash_box_id;
    
    // Check if current box is targeted by any restricted category
    const boxIsTargeted = currentBoxId && posCategories.some(
      cat => cat.restricted_cash_box_ids?.length && cat.restricted_cash_box_ids.includes(currentBoxId)
    );
    
    return posCategories.filter(cat => {
      const hasRestriction = cat.restricted_cash_box_ids && cat.restricted_cash_box_ids.length > 0;
      
      if (boxIsTargeted) {
        // This box is targeted: show ONLY categories that explicitly include it
        return hasRestriction && currentBoxId ? cat.restricted_cash_box_ids!.includes(currentBoxId) : false;
      } else {
        // This box is NOT targeted: show only unrestricted categories
        return !hasRestriction;
      }
    });
  }, [posCategories, session?.cash_box_id]);

  const categoriesWithCounts = useMemo(() => {
    const hiddenCatIds = new Set(
      posCategories.filter(c => !visiblePosCategories.includes(c)).map(c => c.id)
    );
    const hiddenCatNames = new Set(
      posCategories.filter(c => !visiblePosCategories.includes(c)).map(c => c.name)
    );
    const posProducts = products.filter(p => {
      if (!p.is_pos_available) return false;
      if (p.pos_category_id && hiddenCatIds.has(p.pos_category_id)) return false;
      if (!p.pos_category_id && p.category && hiddenCatNames.has(p.category)) return false;
      return true;
    });
    const totalCount = posProducts.length;

    const productCategoryNames = Array.from(
      new Set(
        posProducts
          .map((p) => (p.category || "").trim())
          .filter(Boolean)
      )
    );

    const missingCategoryRows = productCategoryNames
      .filter((name) => !visiblePosCategories.some((c) => c.name === name))
      .map((name) => ({
        id: `legacy-${name}`,
        name,
        color: "#6B7280",
        display_order: 999,
        is_active: true,
      }));

    const mergedCategories = [...visiblePosCategories, ...missingCategoryRows];

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
  }, [products, posCategories, visiblePosCategories]);

  const filteredProducts = useMemo(() => {
    const hiddenCatIds = new Set(
      posCategories.filter(c => !visiblePosCategories.includes(c)).map(c => c.id)
    );
    const hiddenCatNames = new Set(
      posCategories.filter(c => !visiblePosCategories.includes(c)).map(c => c.name)
    );
    let filtered = products.filter((p) => {
      if (!p.is_pos_available) return false;
      if (p.pos_category_id && hiddenCatIds.has(p.pos_category_id)) return false;
      if (!p.pos_category_id && p.category && hiddenCatNames.has(p.category)) return false;
      return true;
    });
    // عند البحث: تجاهل التصنيف وابحث في كل المنتجات لتسهيل العثور على الصنف
    const ignoreCategory = !!debouncedSearch;
    if (!ignoreCategory && selectedCategory === "__uncategorized__") {
      filtered = filtered.filter(p => 
        !p.pos_category_id && !visiblePosCategories.some(c => c.name === p.category)
      );
    } else if (!ignoreCategory && selectedCategory !== "الكل") {
      const cat = visiblePosCategories.find(c => c.name === selectedCategory);
      filtered = filtered.filter((p) => 
        p.pos_category_id === cat?.id || p.category === selectedCategory
      );
    }
    if (debouncedSearch) {
      filtered = filtered.filter(
        (p) => multiWordMatchAny(debouncedSearch, p.name, p.sku, p.barcode)
      );
    }
    // When "الكل" is selected, sort products grouped by category order
    if (selectedCategory === "الكل" && !debouncedSearch) {
      const catOrderMap = new Map<string, number>();
      visiblePosCategories.forEach((c, i) => catOrderMap.set(c.id, i));
      filtered.sort((a, b) => {
        const aCatId = a.pos_category_id || visiblePosCategories.find(c => c.name === a.category)?.id || "";
        const bCatId = b.pos_category_id || visiblePosCategories.find(c => c.name === b.category)?.id || "";
        const aOrder = catOrderMap.get(aCatId) ?? 9999;
        const bOrder = catOrderMap.get(bCatId) ?? 9999;
        return aOrder - bOrder;
      });
    }
    return filtered;
  }, [products, selectedCategory, debouncedSearch, posCategories]);

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
          station_id: product.kitchen_station_id,
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
          station_id: product.kitchen_station_id,
          modifiers: [],
        },
      ];
    });
  }, [cart]);

  // ── Debounce search 300ms ──
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Barcode scan handler (USB scanner Enter / Camera / Manual) ──
  const handleBarcodeScan = useCallback((rawCode: string) => {
    const code = (rawCode || "").trim();
    if (!code) return;
    // طابق بالباركود ثم SKU بالضبط (case-insensitive)
    const lc = code.toLowerCase();
    const matched = products.find(
      (p) => (p.barcode || "").toLowerCase() === lc || (p.sku || "").toLowerCase() === lc
    );
    if (!matched) {
      toast.error(`المنتج غير موجود (${code})`, { duration: 3000 });
      return;
    }
    if (!matched.is_pos_available) {
      toast.error(`المنتج "${matched.name}" غير متاح في نقطة البيع`, { duration: 3000 });
      return;
    }
    if (matched.quantity <= 0) {
      toast.warning(`⚠️ المخزون صفر — ${matched.name}`, { duration: 4000 });
      // نسمح بالإضافة (قد يكون البيع بالسالب مسموحاً) — لكن نحذّر
    }
    addToCart(matched);
    setSearchQuery("");
    setDebouncedSearch("");
    toast.success(`✅ ${matched.name}`, { duration: 1500 });
  }, [products, addToCart]);


  const removeFromCart = useCallback((index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
    if (selectedCartIndex === index) setSelectedCartIndex(null);
  }, [selectedCartIndex]);

  const updateCartItem = useCallback((index: number, field: "qty" | "unit_price" | "discount_pct", value: number) => {
    // Enforce price editing permission (legacy posPerms + feature override)
    if (field === "unit_price") {
      if (!posFeatPerm.can("sell", "change_price")) { toast.error("لا تملك صلاحية تغيير السعر"); return; }
      if (!isAdmin && !posPerms.can_edit_prices) return;
    }
    // Enforce discount permission and max discount
    if (field === "discount_pct") {
      if (!posFeatPerm.can("sell", "discount")) { toast.error("لا تملك صلاحية تطبيق الخصم"); return; }
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
  }, [isAdmin, posPerms, posFeatPerm]);

  // Totals
  const cartTotals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const taxAmount = cart.reduce((sum, item) => sum + (item.total * item.tax_rate / 100), 0);
    // Enforce pos.sell.discount at calculation level — if user lacks permission,
    // the order-level discount is ignored even if state somehow holds a value.
    const canOrderDiscount = posFeatPerm.can("sell", "discount");
    const effOrderDiscount = canOrderDiscount ? orderDiscount : 0;
    let discountAmt = orderDiscountType === "percent" ? subtotal * effOrderDiscount / 100 : effOrderDiscount;
    const total = subtotal + taxAmount - discountAmt;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(taxAmount * 100) / 100,
      discount: Math.round(discountAmt * 100) / 100,
      total: Math.round(total * 100) / 100,
      itemCount: cart.reduce((sum, item) => sum + item.qty, 0),
    };
  }, [cart, orderDiscount, orderDiscountType, posFeatPerm]);

  // Open session
  const handleOpenShift = async () => {
    if (!userId || !company) return;
    if (!terminal) {
      toast.error("⛔ لا يوجد محطة POS مهيأة لهذا الجهاز — افتح إعداد الجهاز أولاً");
      return;
    }
    if (!enforceDeviceGuard()) return;
    if (!isAdmin && !posPerms.can_open_register) { toast.error("ليس لديك صلاحية فتح الوردية"); return; }
    if (!guardCashBoxBranchId()) return;
    const isCallCenter = selectedCashBoxId === "__call_center__";
    const cash = isCallCenter ? 0 : (parseFloat(openingCash) || 0);
    const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";

    const actualCashBoxId = isCallCenter ? null : (selectedCashBoxId || null);

    // Auto-link cash box & terminal to the device branch if not yet linked.
    // The DB trigger `enforce_pos_session_branch_match` requires both to have
    // the same branch_id. For new customers (single-branch setups) we link
    // them silently here so the shift can open without manual setup.
    try {
      const deviceBranchId = deviceConfig.branchId || (terminal as any)?.branch_id || null;
      if (deviceBranchId) {
        if (actualCashBoxId) {
          const box = cashBoxes.find(b => b.id === actualCashBoxId);
          if (box && !(box as any).branch_id) {
            await supabase.from("cash_boxes").update({ branch_id: deviceBranchId } as any).eq("id", actualCashBoxId);
          }
        }
        if (terminal && !(terminal as any).branch_id) {
          await supabase.from("pos_terminals").update({ branch_id: deviceBranchId } as any).eq("id", terminal.id);
        }
      }
    } catch (linkErr) {
      console.warn("[open-shift] auto-link branch failed:", linkErr);
    }

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
      console.error("[open-shift] insert failed:", error);
      // Friendly message for the "already open on another device" case.
      // Our unique partial index pos_sessions_one_open_per_* raises 23505.
      const code = (error as any).code;
      const msg = (error.message || "").toLowerCase();
      if (code === "23505" && (msg.includes("one_open_per_cashier") || msg.includes("one_open_per_auth_user"))) {
        toast.error("⛔ لديك عهدة مفتوحة بالفعل على جهاز آخر — أغلقها أولاً ثم حاول مجدداً");
      } else {
        toast.error(`خطأ في فتح الوردية: ${error.message || "سبب غير معروف"}`);
      }
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

    // 💾 Offer to restore any cart that was auto-saved when a previous
    // shift on this device was force-closed from elsewhere.
    try {
      const draft = loadBlockedCart(company?.id ?? null, userId ?? null);
      if (draft && Array.isArray(draft.orders) && draft.orders.length > 0) {
        toast("لديك سلة محفوظة من العهدة السابقة — هل تريد استعادتها؟", {
          duration: 15000,
          action: {
            label: "استعادة",
            onClick: () => {
              try {
                setOrders(draft.orders as any);
                setActiveOrderIndex(0);
                orderCounter.current = (draft.orders as any[]).length || 1;
                clearBlockedCart(company?.id ?? null, userId ?? null);
                toast.success("تمت استعادة السلة");
              } catch {
                toast.error("تعذّر استعادة السلة");
              }
            },
          },
          cancel: {
            label: "تجاهل",
            onClick: () => clearBlockedCart(company?.id ?? null, userId ?? null),
          },
        });
      }
    } catch { /* ignore */ }

    // Detect branch from cash box name
    if (selectedCashBoxId && dataOwnerId) {
      const selectedBox = cashBoxes.find(b => b.id === selectedCashBoxId);
      const boxName = selectedBox?.name || "";
      // Direct branch_id link (preferred)
      if ((selectedBox as any)?.branch_id) {
        setDetectedBranchId((selectedBox as any).branch_id);
        setCashBoxBranchId((selectedBox as any).branch_id);
        setCashBoxBranchChecked(true);
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

  // Save order as draft (no payment)
  const handleSaveToTable = async () => {
    if (!userId || !session || cart.length === 0 || !company) return;
    if (!enforceDeviceGuard()) return;
    setSavingToTable(true);
    try {
      // Check if there's already an open order for this table/session
      let existingOrder = null;
      if (activeOrder.tableId) {
        const { data } = await supabase
          .from("pos_orders")
          .select("id")
          .eq("table_id", activeOrder.tableId)
          .in("state", ["draft", "open"] as any)
          .maybeSingle();
        existingOrder = data;
      }

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
           is_delivery: activeOrder.orderType === "delivery",
           customer_address: activeOrder.orderType === "delivery" ? activeOrder.deliveryAddress : null,
           zone_code: activeOrder.orderType === "delivery" ? activeOrder.zoneCode || null : null,
           area_name: activeOrder.orderType === "delivery" ? activeOrder.areaName || null : null,
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
            is_delivery: activeOrder.orderType === "delivery",
            customer_address: activeOrder.orderType === "delivery" ? activeOrder.deliveryAddress : null,
            zone_code: activeOrder.orderType === "delivery" ? activeOrder.zoneCode || null : null,
            area_name: activeOrder.orderType === "delivery" ? activeOrder.areaName || null : null,
            pos_customer_id: activeOrder.posCustomerId || null,
          } as any)
          .select()
          .single();

        if (error) throw error;
        updateActiveOrder(o => ({ ...o, savedOrderId: order.id }));

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

      toast.success(activeOrder.tableName ? `💾 تم حفظ الطلب على ${activeOrder.tableName}` : "💾 تم حفظ الطلب كمسودة");

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
    if (!enforceDeviceGuard()) return;
    if (!requireOrderTypeChosen()) return;

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
      stationGroups["_default"] = { stationName: "المطبخ", stationColor: "#ef4444", items: noStationItems };
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
    // Dispatch print jobs per station via bridge
    let printedCount = 0;
    for (const [stationId, group] of Object.entries(stationGroups)) {
      const bridgeKitchenOrder: BridgePrintOrder = {
        orderNumber: tableName || "---",
        branchName: group.stationName || "المطبخ",
        cashier: cashierName,
        tableNumber: tableName,
        orderType: activeOrder.orderType,
        stationId: stationId === "_default" ? undefined : stationId,
        items: group.items.map((item: any) => ({
          id: item.product_id || item.name,
          name: item.name,
          quantity: item.qty,
          price: 0,
          note: item.note || undefined,
          modifiers: (item.modifiers || []).map((m: any) => ({ option_name: m.option_name, extra_price: m.extra_price })),
        })),
        total: 0,
        orderNote: activeOrder.orderNote,
      };
      printStationTicketImage(bridgeKitchenOrder, stationId === "_default" ? "" : stationId, bridgeKitchenOrder.items)
        .then(() => { printedCount++; })
        .catch(() => { console.warn("Bridge print failed for station:", stationId); });
    }
    toast.success(`✅ تم إرسال ${tickets.length} تذكرة مطبخ`);
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
      station_id: products.find((p) => p.id === line.product_id)?.kitchen_station_id || null,
    }));

    // Find or create order tab for this table
    const existingTabIdx = orders.findIndex(o => o.tableId === tableId);
    if (existingTabIdx >= 0) {
      setOrders(prev => prev.map((o, i) => i === existingTabIdx ? {
        ...o,
        name: order.customer_name || tableName,
        cart: cartItems,
        customerName: order.customer_name || "",
        customerId: (order as any).customer_id || null,
        posCustomerId: (order as any).pos_customer_id || null,
        orderDiscount: Number(order.discount_amount) || 0,
        orderDiscountType: "fixed",
        tableId,
        tableName,
        guestCount: (order as any).guest_count || 1,
        guestName: (order as any).guest_name || "",
        orderType: (order as any).order_type || "dine_in",
        orderTypeChosen: true,
        deliveryAddress: (order as any).delivery_address || "",
        zoneCode: (order as any).zone_code || "",
        areaName: (order as any).area_name || "",
        deliveryStatus: (order as any).delivery_status || "none",
        captainName: (order as any).assigned_captain_name || "",
        captainPhone: (order as any).assigned_captain_phone || "",
        captainVehicle: (order as any).assigned_captain_vehicle || "",
        savedOrderId: order.id,
      } : o));
      setActiveOrderIndex(existingTabIdx);
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
        orderTypeChosen: true,
        deliveryAddress: (order as any).delivery_address || "",
        zoneCode: (order as any).zone_code || "",
        areaName: (order as any).area_name || "",
        deliveryStatus: (order as any).delivery_status || "none",
        captainName: (order as any).assigned_captain_name || "",
        captainPhone: (order as any).assigned_captain_phone || "",
        captainVehicle: (order as any).assigned_captain_vehicle || "",
        savedOrderId: order.id,
      };
      setOrders(prev => [...prev, newOrder]);
      setActiveOrderIndex(orders.length);
    }
  };

  // Quick save+print for call center orders (auto-set payment method and complete)
  const [quickProcessing, setQuickProcessing] = useState(false);
  const handleQuickSaveAndPrint = async () => {
    if (!userId || !session || cart.length === 0 || !company) return;
    if (!enforceDeviceGuard()) return;
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
    if (!enforceDeviceGuard()) return;
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

    // Defense-in-depth: block sale if an order-level discount is present but
    // the user lacks pos.sell.discount.
    if (orderDiscount > 0 && !posFeatPerm.can("sell", "discount")) {
      toast.error("لا تملك صلاحية تطبيق خصم");
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
            is_delivery: activeOrder.orderType === "delivery",
            customer_address: activeOrder.orderType === "delivery" ? activeOrder.deliveryAddress : null,
            zone_code: activeOrder.orderType === "delivery" ? activeOrder.zoneCode || null : null,
            area_name: activeOrder.orderType === "delivery" ? activeOrder.areaName || null : null,
            pos_customer_id: activeOrder.posCustomerId || null,
            order_note: orderNote || (effectivePaymentMethod === "employee_account" && employeeNote.trim() ? `حساب موظف: ${selectedEmployee?.full_name} | ${employeeNote.trim()}` : null),
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
                is_delivery: activeOrder.orderType === "delivery",
                customer_address: activeOrder.orderType === "delivery" ? activeOrder.deliveryAddress : null,
                zone_code: activeOrder.orderType === "delivery" ? activeOrder.zoneCode || null : null,
                area_name: activeOrder.orderType === "delivery" ? activeOrder.areaName || null : null,
                pos_customer_id: activeOrder.posCustomerId || null,
                order_note: orderNote || (effectivePaymentMethod === "employee_account" && employeeNote.trim() ? `حساب موظف: ${selectedEmployee?.full_name} | ${employeeNote.trim()}` : null),
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
              is_delivery: activeOrder.orderType === "delivery",
              customer_address: activeOrder.orderType === "delivery" ? activeOrder.deliveryAddress : null,
              zone_code: activeOrder.orderType === "delivery" ? activeOrder.zoneCode || null : null,
              area_name: activeOrder.orderType === "delivery" ? activeOrder.areaName || null : null,
              pos_customer_id: activeOrder.posCustomerId || null,
              order_note: orderNote || (effectivePaymentMethod === "employee_account" && employeeNote.trim() ? `حساب موظف: ${selectedEmployee?.full_name} | ${employeeNote.trim()}` : null),
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
           // Find next available code under 2180
           const { data: siblingAccs } = await supabase
             .from("accounts")
             .select("account_code")
             .eq("user_id", dataOwnerId)
             .eq("parent_code", "2180")
             .order("account_code", { ascending: false })
             .limit(1);
           const lastCode = siblingAccs?.[0]?.account_code;
           const nextCode = lastCode ? String(Number(lastCode) + 1) : "21801";
           const { error: createErr } = await supabase.from("accounts").insert({
             user_id: dataOwnerId,
             account_code: nextCode,
             account_name: empAccName,
             account_type: "التزامات",
             parent_code: "2180",
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
          // Store change in the unit of change_currency (ILS amount when ILS, foreign amount when USD/JOD)
          change: actualChangeCurrency === "ILS" ? actualChangeILS : actualChangeForeign,
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

        // B3.2: read employee meal share % from payroll_settings (default 50%)
        // The full ticket is paid by the company; only a portion is deducted from employee.
        let employeeSharePct = 50;
        try {
          const { data: company } = await supabase
            .from("companies")
            .select("id")
            .eq("owner_id", dataOwnerId)
            .maybeSingle();
          if (company?.id) {
            const { data: psettings } = await supabase
              .from("payroll_settings" as any)
              .select("food_individual_percentage")
              .eq("company_id", company.id)
              .maybeSingle();
            const pct = (psettings as any)?.food_individual_percentage;
            if (pct !== null && pct !== undefined && !isNaN(Number(pct))) {
              employeeSharePct = Math.max(0, Math.min(100, Number(pct)));
            }
          }
        } catch (e) {
          console.warn("[POS B3.2] Failed to read meal share %, using default 50%", e);
        }

        const fullAmount = Number(cartTotals.total) || 0;
        const calculatedAmount = Math.round((fullAmount * employeeSharePct / 100) * 100) / 100;

        // Only record a deduction if the employee actually owes something.
        if (calculatedAmount > 0) {
          const transparencyNote =
            `إجمالي الفاتورة: ${fullAmount.toFixed(2)} | نسبة خصم الموظف: ${employeeSharePct}% | الخصم الفعلي: ${calculatedAmount.toFixed(2)}`;
          await supabase.from("employee_financial_movements").insert({
            user_id: dataOwnerId,
            employee_id: selectedEmployee.id,
            source_type: "pos_meal",
            source_id: orderId,
            source_reference: res.order_number,
            reference_number: res.order_number,
            category: "food",
            description: `وجبة POS - ${itemsSummary}${noteStr}`.slice(0, 250),
            amount: calculatedAmount,
            movement_type: "debit",
            status: "approved",
            movement_date: now.toISOString().split("T")[0],
            salary_month: now.getMonth() + 1,
            salary_year: now.getFullYear(),
            created_by: userId,
            notes: transparencyNote,
          } as any);
        }
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

      // Update pos_customer visits and spending
      const posCustomerId = activeOrder.posCustomerId || (customerDataDiscount?.customerId);
      if (posCustomerId) {
        const { data: pcData } = await supabase
          .from("pos_customers")
          .select("total_visits, total_spent, total_discounts")
          .eq("id", posCustomerId)
          .single();
        if (pcData) {
          await supabase
            .from("pos_customers")
            .update({
              total_visits: ((pcData as any).total_visits || 0) + 1,
              total_spent: ((pcData as any).total_spent || 0) + effectiveTotal,
              total_discounts: ((pcData as any).total_discounts || 0) + effectiveDiscount,
              last_visit: new Date().toISOString(),
            } as any)
            .eq("id", posCustomerId);
        }
      }

      loadProducts();

      // Fetch the unified order display number (KDS daily number = what's shown on
      // the customer screen AND voice-called). The receipt must show the SAME
      // number so customers wait for "their" number on the display.
      let displayNumber = '';
      let queueNumber: number | undefined;
      try {
        const { data: orderRow } = await supabase
          .from("pos_orders")
          .select("display_number, queue_number, daily_display_number")
          .eq("id", orderId)
          .single();
        if (orderRow) {
          const daily = (orderRow as any).daily_display_number;
          displayNumber = daily != null
            ? String(daily)
            : ((orderRow as any).display_number || '');
          // Use daily as the queue number so ReceiptTemplate prints the same
          // value the KDS/customer display shows.
          queueNumber = daily != null
            ? Number(daily)
            : (orderRow as any).queue_number;
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

      // Create kitchen tickets (split by station) + print via bridge
      let kitchenJobs: KitchenJob[] = [];
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
          // Detect if ANY product in the cart has an explicit station assignment.
          // If none do, we BROADCAST the full order to all stations (handled
          // downstream when kitchenJobs is empty) instead of funneling everything
          // to an arbitrary default station — which previously caused only one
          // printer (e.g. pizza) to fire while kitchen/grill stayed silent.
          const hasAnyAssignment = cart.some(i => stationMap.get(i.product_id));

          // Group items by station only when assignments exist; items without
          // an explicit assignment are sent to ALL stations so the kitchen
          // crew never misses an item.
          const stationItems: Record<string, any[]> = {};
          if (hasAnyAssignment) {
            cart.forEach(item => {
              const assigned = stationMap.get(item.product_id);
              const targets: string[] = assigned
                ? [assigned as string]
                : (stationsData as any[]).map((s: any) => s.id); // broadcast unassigned
              for (const stationId of targets) {
                if (!stationItems[stationId]) stationItems[stationId] = [];
                stationItems[stationId].push({
                  name: item.name,
                  qty: item.qty,
                  note: item.note,
                  modifiers: item.modifiers || [],
                });
              }
            });
          }

          // NOTE: kitchen_tickets are created exclusively by the DB trigger
          // (trg_pos_order_lines_kds_sync + kds_create_tickets_for_order) to
          // avoid duplicates with different station_ids. Do NOT insert here.

          // Build filtered kitchen print jobs
          kitchenJobs = Object.entries(stationItems)
            .map(([stationId, items]) => {
              const printer = STATION_TO_PRINTER[stationId] || { key: 'kitchen', label: 'المطبخ' };
              return {
                printerKey: printer.key,
                stationLabel: printer.label,
                items: items.map(i => ({
                  id: i.name,
                  name: i.name,
                  quantity: i.qty,
                  price: 0,
                  note: i.note || undefined,
                  modifiers: (i.modifiers || []).map((m: any) => ({ option_name: m.option_name, extra_price: m.extra_price })),
                })),
              };
            })
            .filter(j => j.items.length > 0);
        }
      } catch (err) {
        console.error("Kitchen ticket creation error:", err);
      }

      // Fire-and-forget: send to print bridge (receipt + filtered kitchen tickets in parallel)
      try {
        const bridgeOrder: BridgePrintOrder = {
          id: orderId,
          orderNumber: res.order_number,
          queueNumber: queueNumber || undefined,
          branchName: company?.name || "مطعم الملكي",
          cashier: session.cashier_name,
          tableNumber: activeOrder.tableName || undefined,
          orderType: activeOrder.orderType,
          customerName: activeOrder.customerName || undefined,
          customerPhone: activeOrder.customerPhone || undefined,
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
          paymentMethod: (() => {
            // For card payments from call center, include the source app name (e.g. "فيزا - Wheel App")
            if (effectivePaymentMethod === "cash") return "نقد";
            if (effectivePaymentMethod === "card") {
              const src = activeOrder.callCenterSourceApp?.trim();
              return src ? `فيزا - ${src}` : "بطاقة";
            }
            return "تحويل";
          })(),
          currency: paymentCurrency,
          exchangeRate: rate,
          tenderedAmount: tendered,
          change: changeILS,
          orderNote,
        };

        const companyPrintInfo = {
          name: company?.name,
          phone: company?.phone || undefined,
          taxNumber: company?.tax_number || undefined,
          terminalName: posDisplayName || undefined,
        };

        // Print receipt + filtered kitchen tickets — all in parallel
        // For DELIVERY orders: skip the cashier receipt and print kitchen tickets only.
        printAllImage(
          bridgeOrder,
          companyPrintInfo,
          kitchenJobs.length > 0 ? kitchenJobs : undefined,
          { skipReceipt: activeOrder.orderType === "delivery" },
        )
          .catch(() => console.warn("Image print failed"));
      } catch (printErr) {
        console.warn("Print bridge error:", printErr);
      }

      // Auto-open cash drawer after successful payment (legacy + feature override)
      if ((isAdmin || posPerms.open_cash_drawer) && posFeatPerm.can("sell", "open_drawer")) {
        bridgeOpenDrawer();
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
    if (!enforceDeviceGuard()) return;
    if (!isAdmin && !posPerms.can_close_register) { toast.error("ليس لديك صلاحية إغلاق الوردية"); return; }
    try { await assertPermission("pos", "sell", "close_shift"); } catch { return; }
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

    // Fetch sales breakdown by payment currency (paid orders only, including returns for tracking)
    const { data: ordersData } = await supabase
      .from("pos_orders")
      .select("id, payment_currency, payment_currency_amount, total, is_return, return_currency, return_exchange_rate, return_currency_amount")
      .eq("session_id", session.id)
      .eq("state", "paid");

    // Separate sales and returns
    const salesOrders = (ordersData || []).filter((o: any) => !o.is_return);
    const returnOrders = (ordersData || []).filter((o: any) => o.is_return);

    // ✅ Multi-currency returns: split by return_currency, only cash refunds reduce drawer
    const returnIds = returnOrders.map((o: any) => o.id);
    let returnsByCurrency: Record<string, number> = { ILS: 0, USD: 0, JOD: 0 };
    if (returnIds.length > 0) {
      const { data: returnPayments } = await supabase
        .from("pos_payments")
        .select("order_id, payment_method, currency, amount")
        .in("order_id", returnIds);

      const orderPayMap: Record<string, { method: string; currency: string }> = {};
      (returnPayments || []).forEach((p: any) => {
        orderPayMap[p.order_id] = {
          method: p.payment_method || "cash",
          currency: p.currency || "ILS",
        };
      });

      returnOrders.forEach((o: any) => {
        const pay = orderPayMap[o.id];
        if (!pay || pay.method !== "cash") return; // card/credit refunds don't touch the drawer
        const cur = o.return_currency || pay.currency || "ILS";
        const amount = cur === "ILS"
          ? Number(o.total) || 0
          : Number(o.return_currency_amount) || 0;
        if (!returnsByCurrency[cur]) returnsByCurrency[cur] = 0;
        returnsByCurrency[cur] += amount;
      });
    }

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
          // change_amount is stored in the unit of change_currency (no rate conversion needed)
          if (chgCur === "ILS") {
            foreignChangeILS += chgAmount;
          } else if (chgCur === "USD") {
            foreignChangeUSD += chgAmount;
          } else if (chgCur === "JOD") {
            foreignChangeJOD += chgAmount;
          }
        }
      });
    }

    // ✅ Complete expected cash formula PER CURRENCY:
    // ILS: opening + ILS_cash_sales - foreign_change_ILS - expenses - purchases_cash - ILS_returns
    // USD: USD_tendered - USD_change - USD_returns
    // JOD: JOD_tendered - JOD_change - JOD_returns
    const ilsCashSales = paymentMethodBreakdown["cash"]?.["ILS"] || 0;
    // ⚠️ Do NOT fall back to session.total_sales when there are no paid orders —
    // that stale value still includes cancelled invoices and produces a false
    // "expected cash" (and a fake deficit) when the cashier voided everything
    // before closing the shift. Cancelled orders must NOT inflate expected cash.
    const effectiveILSCashSales = ilsCashSales;
    const totalReturnsILS = returnsByCurrency.ILS || 0;
    const totalReturnsUSD = returnsByCurrency.USD || 0;
    const totalReturnsJOD = returnsByCurrency.JOD || 0;

    const expectedILS = session.opening_cash + effectiveILSCashSales - foreignChangeILS - totalExpenses - totalPurchasesCash - totalReturnsILS;
    const expectedUSD = foreignTenderedUSD - foreignChangeUSD - totalReturnsUSD;
    const expectedJOD = foreignTenderedJOD - foreignChangeJOD - totalReturnsJOD;

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

    // 🔒 Atomic close via RPC — CAS pattern guards against the race where two
    // devices try to close the same shift at the same time. If `already_closed`
    // comes back true, the other device beat us to it; we must NOT post a
    // second variance row or re-write metric fields.
    // 🛡️ Mark BEFORE the RPC so the realtime UPDATE that fires moments later
    // is recognised as our own close and never raises the "closed elsewhere" alert.
    selfClosedSessionsRef.current.add(session.id);
    const { data: closeRes, error: closeErr } = await supabase.rpc(
      "close_pos_session_atomic",
      { p_session_id: session.id, p_closing_cash: cash },
    );
    if (closeErr) {
      toast.error(`تعذّر إغلاق العهدة: ${closeErr.message}`);
      return;
    }
    const closeRow = Array.isArray(closeRes) ? closeRes[0] : closeRes;
    if (closeRow?.already_closed) {
      toast.error("⛔ العهدة كانت مُغلقة مسبقاً من جهاز آخر — لا حاجة لتسجيل العجز/الفائض هنا");
      // Tear down local UI without writing anything else.
      setShowCloseShift(false);
      setSession(null);
      setOrders([createNewOrder(1)]);
      setActiveOrderIndex(0);
      orderCounter.current = 1;
      if (isAdmin) {
        navigate("/apps", { replace: true });
      } else {
        navigate("/employee", { replace: true });
      }
      return;
    }
    // RPC handled state/closed_at/closing_cash atomically. Persist the
    // remaining metric fields the RPC doesn't touch.
    await supabase
      .from("pos_sessions")
      .update({
        expected_cash: expected,
        cash_variance: variance,
        total_sales: recalcTotalSales,
        total_orders: recalcTotalOrders,
      } as any)
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
        const shiftRef = `SHIFT-${session.id.slice(0, 8)}`;
        const variancePct = Math.round((Math.abs(variance) / (expected || 1)) * 10000) / 100;
        const transparencyNote =
          `وردية ${session.cashier_name || ""} | المتوقع: ${expected.toFixed(2)} | الفعلي: ${cash.toFixed(2)} | ` +
          `${isShortage ? "عجز" : "فائض"}: ${Math.abs(variance).toFixed(2)} (${variancePct}%)`;
        await supabase.from("employee_financial_movements").insert({
          user_id: dataOwnerId,
          employee_id: emp.id,
          source_type: "pos_shortage",
          source_id: session.id,
          source_reference: shiftRef,
          reference_number: shiftRef,
          category: isShortage ? "cash_shortage" : "cash_surplus",
          description: `${isShortage ? "عجز" : "فائض"} صندوق - وردية ${new Date(session.opened_at).toLocaleDateString("ar-PS")}`,
          amount: Math.abs(variance),
          movement_type: isShortage ? "debit" : "credit",
          status: "approved",
          movement_date: now.toISOString().split("T")[0],
          salary_month: now.getMonth() + 1,
          salary_year: now.getFullYear(),
          created_by: userId,
          notes: transparencyNote,
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
    const summaryPayload = {
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
    };
    setShiftSummaryData(summaryPayload);

    // 🖨️ Fire print immediately — don't depend on the dialog's auto-print timer
    // (the dialog can be dismissed before 600ms, or the bridge call can race
    // with navigation). This guarantees the shift summary always prints on close.
    printShiftSummaryImage(summaryPayload as any).catch((err) => {
      console.warn("[shift-close-print] bridge unavailable", err);
    });

    setShowCloseShift(false);
    setShowShiftSummary(true);
  };

  const handleShiftSummaryClosed = async () => {
    setShowShiftSummary(false);
    setSession(null);
    setOrders([createNewOrder(1)]);
    setActiveOrderIndex(0);
    orderCounter.current = 1;
    toast.success("تم إغلاق الوردية بنجاح");
    // Call center users sign out completely — they live on the auth screen
    // between shifts. Admins go back to the apps grid; others to /employee.
    if (isCallCenter) {
      await supabase.auth.signOut();
      navigate("/auth", { replace: true });
    } else if (isAdmin) {
      navigate("/apps", { replace: true });
    } else {
      navigate("/employee", { replace: true });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // Call center quick close — no cash count needed, just logout
  const handleCallCenterCloseShift = async () => {
    if (!session || !userId) return;
    // 🔒 Atomic close — same CAS guard as cashier close.
    selfClosedSessionsRef.current.add(session.id);
    const { error: ccErr } = await supabase.rpc("close_pos_session_atomic", {
      p_session_id: session.id,
      p_closing_cash: 0,
    });
    if (ccErr) {
      toast.error(`تعذّر إغلاق الوردية: ${ccErr.message}`);
      return;
    }
    setSession(null);
    setOrders([createNewOrder(1)]);
    setActiveOrderIndex(0);
    orderCounter.current = 1;
    toast.success("تم إغلاق الوردية بنجاح");
    if (isAdmin) {
      navigate("/apps", { replace: true });
    } else {
      navigate("/employee", { replace: true });
    }
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
      // Allow F2 inside payment modal even when an input is focused (amount field auto-focuses)
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (e.key === "F2" && showPayment) {
          e.preventDefault();
          if (!processing && !(paymentMethod === "credit" && !customerName) && !(paymentMethod === "employee_account" && !selectedEmployee)) {
            handleCompleteOrder();
          }
          return;
        }
        return;
      }

      // F2 inside payment modal = Complete sale
      if (e.key === "F2" && showPayment) {
        e.preventDefault();
        if (!processing && !(paymentMethod === "credit" && !customerName) && !(paymentMethod === "employee_account" && !selectedEmployee)) {
          handleCompleteOrder();
        }
        return;
      }

      // F12 = Call Center Dispatch (for call center users / admin)
      if (e.key === "F12" && cart.length > 0 && (isAdmin || isCallCenter)) {
        setShowCallCenterDispatch(true);
        e.preventDefault();
        return;
      }
      // F4 = Invoice history
      if (e.key === "F4") {
        setShowInvoiceHistory(true);
        e.preventDefault();
      }
      // F2 = Pay (not for call center)
      if (e.key === "F2" && cart.length > 0 && !isCallCenter) {
        openPaymentModal();
        e.preventDefault();
        return;
      }
      // F9 = Send to printer (not for call center)
      if (e.key === "F9" && cart.length > 0 && !isCallCenter) {
        console.log("[frontend-print-click] F9");
        if (shouldThrottlePrint("F9")) { e.preventDefault(); return; }
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
        console.log("[frontend-print-click] F8");
        if (!enforceDeviceGuard()) { e.preventDefault(); return; }
        if (!requireOrderTypeChosen()) { e.preventDefault(); return; }
        if (shouldThrottlePrint("F8")) { e.preventDefault(); return; }
        const cartHash = buildCartHash(cart as any);
        const f8Order: BridgePrintOrder = {
          orderNumber: `F8-${cartHash}`,
          id: `f8-${cartHash}`,
          branchName: company?.name || "مطعم الملكي - سفيان",
          cashier: session?.cashier_name || "",
          tableNumber: activeOrder.tableName || undefined,
          orderType: activeOrder.orderType,
          customerName: activeOrder.customerName || undefined,
          customerPhone: activeOrder.customerPhone || undefined,
          items: cart.map(item => ({
            id: item.product_id || item.id,
            name: item.name,
            quantity: item.qty,
            price: item.unit_price,
            note: item.note || undefined,
            stationId: item.station_id || undefined,
            modifiers: (item.modifiers || []).map(m => ({ option_name: m.option_name, extra_price: m.extra_price })),
          })),
          subtotal: cartTotals.subtotal,
          discount: cartTotals.discount,
          total: cartTotals.total,
          paymentMethod: paymentMethod === "cash" ? "نقد" : paymentMethod === "card" ? "بطاقة" : "تحويل",
        };
        printInProgressRef.current = true;
        printAllImage(f8Order, undefined, undefined, { skipReceipt: activeOrder.orderType === "delivery" })
          .catch(() => console.warn("F8 image print failed"))
          .finally(() => { printInProgressRef.current = false; });
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
  }, [cart, posCategories, products, selectedCategory, addToCart, enforceDeviceGuard, openPaymentModal, isCallCenter, shouldThrottlePrint, buildCartHash, company, session, activeOrder, cartTotals, paymentMethod, showPayment, processing, customerName, selectedEmployee]);

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
    <div className="h-screen flex flex-col overflow-hidden pos-container pos-page-root" dir="rtl" data-pos-layout>
      {/* ⛔ Device-level guard — blocks selling when branch/terminal/bridge are missing or in conflict */}
      <POSDeviceGuard
        config={deviceConfig}
        terminalBranchId={terminalBranchId}
        cashBoxBranchId={cashBoxBranchId}
      />
      {/* ⚠️ Soft banner — printing unavailable. Selling continues to work. */}
      <PrintingNotReadyBanner />
      {/* ══════ TOP BAR — 52px dark navy ══════ */}
      <header
        className="flex items-center px-3 gap-2 shrink-0 text-white overflow-visible"
        style={{ height: 52, background: "#0D1B2E", borderBottom: "1px solid rgba(255,255,255,0.1)" }}
      >
        {/* ── Right Section: Branch Info ── */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate("/apps", { replace: true })}
            className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-white/[0.08] transition-all shrink-0"
            title="رجوع"
          >
            <ArrowRight className="h-[18px] w-[18px]" style={{ color: "rgba(255,255,255,0.6)" }} />
          </button>
          {offlineMode.isOnline ? (
            <Wifi className="h-[18px] w-[18px] text-white shrink-0" />
          ) : (
            <WifiOff className="h-[18px] w-[18px] text-red-400 shrink-0" />
          )}
          <BridgeStatusIndicator />
          {company?.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="h-8 w-8 rounded-full object-cover shrink-0" style={{ border: '1.5px solid rgba(255,255,255,0.15)' }} />
          ) : (
            <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.15)' }}>
              <User className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
            </div>
          )}
          <span className="text-[13px] font-medium whitespace-nowrap shrink-0" style={{ color: "white" }}>
            {session ? session.cashier_name : (company?.name || "").slice(0, 20)}
          </span>
        </div>

        {/* ── Center-Right: Customer Search ── */}
        <div className="relative w-[220px] shrink-0">
          <User className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "rgba(255,255,255,0.4)" }} />
          <input
            value={customerSearch || customerName}
            onChange={(e) => {
              const val = e.target.value;
              setCustomerSearch(val);
              setCustomerName(val, null, "", null);
              setShowContactDropdown(true);
              searchPosCustomers(val);
            }}
            onFocus={(e) => { setShowContactDropdown(true); e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
            placeholder="الزبون..."
            className="w-full h-9 rounded-lg px-3 pr-9 text-[13px] focus:outline-none transition-all"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "white",
            }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; const rt = e.relatedTarget as HTMLElement | null; if (rt?.closest?.('.pos-customer-dropdown')) return; setShowContactDropdown(false); }}
          />
          {(customerSearch || customerName) && (
            <button
              onClick={() => { setCustomerSearch(""); setCustomerName("", null, "", null); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 hover:text-white transition-colors"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {showContactDropdown && (customerSearch || "").length > 0 && (
            <div
              className="pos-customer-dropdown absolute z-50 w-[280px] right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto"
              onMouseDown={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest("input, button, textarea, [role='button']")) return;
                e.preventDefault();
              }}
            >
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
              {/* Inline add new customer */}
              <div className="border-t border-border px-3 py-2 bg-muted/20">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <PlusCircle className="h-3 w-3 text-primary shrink-0" />
                  <span className="text-[11px] font-medium text-primary">إضافة "{customerSearch}" كزبون جديد</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="رقم الهاتف (اختياري)"
                    value={newCustomerPhone}
                    onChange={e => setNewCustomerPhone(e.target.value.replace(/\D/g, ""))}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleQuickAddCustomer(customerSearch || ""); } }}
                    className="flex-1 h-6 rounded border border-border bg-background px-2 text-[11px] text-foreground focus:outline-none focus:border-primary/50 min-w-0"
                    dir="ltr"
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); handleQuickAddCustomer(customerSearch || ""); }}
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

        {/* ── Center: Search Bar + Camera Scan ── */}
        <div className="relative flex-1 min-w-0 max-w-[300px] flex items-center gap-1">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: "rgba(255,255,255,0.4)" }} />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const q = searchQuery.trim();
                  if (!q) return;
                  // ابحث أولاً عن مطابقة دقيقة (سكانر USB يرسل الكود + Enter)
                  const lc = q.toLowerCase();
                  const exact = products.find(
                    (p) => (p.barcode || "").toLowerCase() === lc || (p.sku || "").toLowerCase() === lc
                  );
                  if (exact) {
                    handleBarcodeScan(q);
                    return;
                  }
                  // بدون مطابقة دقيقة → جرّب أول نتيجة بحث ظاهرة
                  if (filteredProducts.length === 1) {
                    addToCart(filteredProducts[0]);
                    setSearchQuery("");
                    setDebouncedSearch("");
                  } else if (filteredProducts.length === 0) {
                    toast.error(`لا توجد نتائج لـ "${q}"`, { duration: 2500 });
                  }
                }
              }}
              placeholder="بحث أو مسح باركود..."
              className="w-full h-9 rounded-lg px-3 pr-9 text-[13px] focus:outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "white",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowBarcodeScanner(true)}
            className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center hover:bg-white/[0.12] transition-all"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
            title="مسح باركود بالكاميرا"
          >
            <Barcode className="h-4 w-4" style={{ color: "rgba(255,255,255,0.85)" }} />
          </button>
        </div>

        {/* ── Center-Left: Icon Buttons ── */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Invoice History */}
          {(isAdmin || posPerms.can_view_invoice_history || posPerms.view_invoice_log) && (
            <button
              onClick={() => setShowInvoiceHistory(true)}
              className="relative h-9 w-9 rounded-lg flex items-center justify-center hover:bg-white/[0.08] transition-all"
              title="سجل الفواتير"
            >
              <FileText className="h-5 w-5" style={{ color: "rgba(255,255,255,0.7)" }} />
              {(isAdmin || posPerms.can_view_profits) && session && session.total_orders > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: "#dc2626" }} />
              )}
            </button>
          )}

          {/* Notifications / Pending Orders */}
          <PendingOrdersPanel
            dataOwnerId={dataOwnerId || ""}
            branchId={deviceConfig.branchId || detectedBranchId}
            sessionId={session?.id || null}
            enabled={!!session && !isCallCenter}
            onAcceptOrder={(order) => {
              // 🛡️ Hard guard — never accept call-center orders when device isn't ready
              if (!enforceDeviceGuard()) return;
              // 🛡️ Branch match — order MUST belong to this device's branch
              const expectedBranch = deviceConfig.branchId;
              if (expectedBranch && order.target_branch_id && order.target_branch_id !== expectedBranch) {
                toast.error("⛔ هذا الطلب موجّه لفرع آخر — لا يمكن قبوله من هذا الجهاز");
                return;
              }
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
          <button onClick={() => navigate("/pos/kitchen")} className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-white/[0.08] transition-all shrink-0" title="المطبخ">
            <ChefHat className="h-5 w-5" style={{ color: "rgba(255,255,255,0.7)" }} />
          </button>

          {/* Tables */}
          <button onClick={() => navigate("/pos/floor-plan")} className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-white/[0.08] transition-all shrink-0" title="الطاولات">
            <UtensilsCrossed className="h-5 w-5" style={{ color: "rgba(255,255,255,0.7)" }} />
          </button>

          {/* Tools dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowOpsDropdown(v => !v)}
              onBlur={() => setTimeout(() => setShowOpsDropdown(false), 200)}
              className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-white/[0.08] transition-all shrink-0"
              title="أدوات"
            >
              <MoreHorizontal className="h-5 w-5" style={{ color: "rgba(255,255,255,0.7)" }} />
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
        </div>

        {/* ── Spacer ── */}
        <div className="flex-1 min-w-0" />

        {/* ── Left Section: Theme + Size + Sort + Close ── */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Theme toggle */}
          <POSThemeToggle darkMode={posDarkMode} onToggle={togglePosDark} />

          {/* Card size selector pills */}
          <div className="flex items-center gap-0 rounded-lg p-0.5 shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}>
            {(["L", "M", "S"] as const).map(size => (
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
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all ${
                  cardSize === size
                    ? "text-white"
                    : ""
                }`}
                style={{
                  background: cardSize === size ? "rgba(255,255,255,0.2)" : "transparent",
                  color: cardSize === size ? "white" : "rgba(255,255,255,0.4)",
                }}
              >
                {size}
              </button>
            ))}
          </div>

          {/* Sort mode */}
          <button
            onClick={() => setIsSortMode(!isSortMode)}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all shrink-0"
            style={{
              background: isSortMode ? "#f59e0b" : "rgba(255,255,255,0.08)",
              color: isSortMode ? "white" : "rgba(255,255,255,0.7)",
            }}
          >
            <GripVertical className="h-3.5 w-3.5" />
            {isSortMode ? "✅" : "ترتيب"}
          </button>

          {/* Close shift */}
          {(isAdmin || posPerms.can_close_register) && posFeatPerm.can("sell", "close_shift") && (
            <button
              onClick={() => {
                if (session?.cash_box_id === null) {
                  handleCallCenterCloseShift();
                } else {
                  setShowCloseShift(true);
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all shrink-0"
              style={{ background: "#dc2626", color: "white" }}
            >
              <X className="h-3.5 w-3.5" />
              إغلاق
            </button>
          )}
        </div>
      </header>

      {/* ══════ OFFLINE STATUS BAR — hidden, data kept in sync log ══════ */}

      {/* ══════ MAIN ══════ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT: Products ── */}
        <div className={`flex-1 flex flex-col min-w-0 ${posDarkMode ? 'pos-dark' : 'pos-light'}`} style={{ background: posDarkMode ? '#0a1628' : '#f1f5f9', transition: 'background-color 0.2s ease' }}>

          {/* Table Selector Bar removed — using dropdown only */}

          {/* ── Category Cards Section ── */}
          <div className="pos-categories-bar px-3 py-2.5 overflow-y-auto shrink-0" style={{ maxHeight: 'none' }}>
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
                <div className="flex flex-wrap gap-2 items-center">
                  {categoriesWithCounts.categories.map((cat) => (
                     <SortableCategoryChip
                      key={cat.id}
                      cat={cat}
                      isActive={selectedCategory === cat.name}
                      isSortMode={isSortMode}
                      isDragging={dragActiveId === cat.id}
                      onClick={() => !isSortMode && setSelectedCategory(cat.name)}
                      posDark={posDarkMode}
                    />
                  ))}

                  {categoriesWithCounts.uncategorized > 0 && (
                  <button
                      onClick={() => !isSortMode && setSelectedCategory("__uncategorized__")}
                      className="flex flex-col items-center justify-center rounded-full text-[12px] whitespace-nowrap select-none"
                      style={{
                        minWidth: 80, height: 40, padding: "4px 14px",
                        transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                        border: selectedCategory === "__uncategorized__"
                          ? `1.5px solid ${posDarkMode ? 'white' : '#0D1B2E'}`
                          : `1.5px solid ${posDarkMode ? 'rgba(255,255,255,0.1)' : '#dbeafe'}`,
                        background: selectedCategory === "__uncategorized__"
                          ? (posDarkMode ? 'white' : '#0D1B2E')
                          : (posDarkMode ? 'rgba(255,255,255,0.06)' : 'white'),
                        color: selectedCategory === "__uncategorized__"
                          ? (posDarkMode ? '#0D1B2E' : 'white')
                          : (posDarkMode ? 'rgba(255,255,255,0.7)' : '#475569'),
                        boxShadow: selectedCategory === "__uncategorized__" ? '0 2px 8px rgba(13,27,46,0.25)' : 'none',
                      }}
                    >
                      <span className="leading-tight">أخرى</span>
                      <span className="text-[9px] opacity-70 mt-0.5">({categoriesWithCounts.uncategorized})</span>
                    </button>
                  )}

                  {/* All — moved to the end (after the last category) */}
                  <button
                    onClick={() => !isSortMode && setSelectedCategory("الكل")}
                    className="flex flex-col items-center justify-center rounded-full text-[12px] whitespace-nowrap select-none"
                    style={{
                      minWidth: 80, height: 40, padding: "4px 14px",
                      transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
                      border: selectedCategory === "الكل"
                        ? `1.5px solid ${posDarkMode ? 'white' : '#0D1B2E'}`
                        : `1.5px solid ${posDarkMode ? 'rgba(255,255,255,0.1)' : '#dbeafe'}`,
                      background: selectedCategory === "الكل"
                        ? (posDarkMode ? 'white' : '#0D1B2E')
                        : (posDarkMode ? 'rgba(255,255,255,0.06)' : 'white'),
                      color: selectedCategory === "الكل"
                        ? (posDarkMode ? '#0D1B2E' : 'white')
                        : (posDarkMode ? 'rgba(255,255,255,0.7)' : '#475569'),
                      boxShadow: selectedCategory === "الكل" ? '0 2px 8px rgba(13,27,46,0.25)' : 'none',
                    }}
                  >
                    <span className="leading-tight">الكل</span>
                    <span className="text-[9px] opacity-70 mt-0.5">({categoriesWithCounts.all})</span>
                  </button>

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
          <ScrollArea className="flex-1" style={{ background: posDarkMode ? '#0a1628' : '#f1f5f9', transition: 'background-color 0.2s ease' }}>
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
                            className={`pos-product-card relative overflow-visible text-center transition-all group select-none ${
                              cardSize === "S" ? "rounded-lg" : ""
                            } ${isSortMode 
                              ? "border-dashed !border-amber-400/60 cursor-grab ring-1 ring-amber-400/20" 
                              : isAddonOpen
                                ? "!border-[#3b82f6] !shadow-[0_0_0_3px_#eff6ff]"
                                : "cursor-pointer hover:!border-[#3b82f6] hover:!shadow-[0_0_0_3px_#eff6ff]"
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
                              <p className={`leading-tight mb-0.5 break-words ${
                                isFewProducts
                                  ? "text-[14px]"
                                  : cardSize === "S" 
                                    ? "text-[12px]" 
                                    : "text-[14px]"
                              }`} dir="rtl" style={{ unicodeBidi: "plaintext", color: posDarkMode ? 'white' : '#1e293b', fontWeight: 500 }}>
                                {product.name}
                              </p>

                              {/* Addon hint */}
                              {cardSize !== "S" && hasAddons && (
                                <p className="text-[9px] text-muted-foreground mb-0.5">
                                  {addonGroups.length} إضافة متاحة
                                </p>
                              )}

                              {/* Price */}
                              <p className={`tabular-nums ${
                                isFewProducts
                                  ? "text-sm"
                                  : cardSize === "S" ? "text-[11px]" : "text-[14px]"
                              }`} style={{ color: posDarkMode ? '#93c5fd' : '#1e40af', fontWeight: 600 }} dir="ltr">
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
        <div className="pos-order-panel w-[320px] flex flex-col shrink-0" style={{ background: '#0D1B2E' }}>
          {/* Order Tabs */}
          <div className="flex items-center gap-1 px-3 pt-3 pb-2 shrink-0">
            {orders.map((order, idx) => {
              const isActive = idx === activeOrderIndex;
              const itemCount = order.cart.reduce((s, i) => s + i.qty, 0);
              return (
                <button
                  key={order.id}
                  onClick={() => setActiveOrderIndex(idx)}
                  className={`group relative flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all ${
                    isActive
                      ? "text-[#0D1B2E]"
                      : "text-white/50 hover:text-white/70"
                  }`}
                  style={isActive ? { background: 'white' } : {}}
                >
                  <span>{order.customerName || order.name}</span>
                  {itemCount > 0 && (
                    <span className={`text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center ${
                      isActive ? "bg-[#0D1B2E]/10 text-[#0D1B2E]" : "bg-white/10 text-white/50"
                    }`}>
                      {itemCount}
                    </span>
                  )}
                  {orders.length > 1 && (
                    <span
                      onClick={(e) => { e.stopPropagation(); removeOrder(idx); }}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
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
              className="h-8 w-8 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors shrink-0 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.08)' }}
              title="طلب جديد"
            >
              <Plus className="h-3.5 w-3.5" />
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

          {/* Order Type Pills */}
          {/* Phase A: in retail/service mode hide dine-in (tables) but keep takeaway+delivery. */}
          <div className="flex items-center gap-2 px-3 pb-2 shrink-0">
            {((restaurantFeatures
              ? (["takeaway", "delivery", "dine_in"] as const)
              : (["takeaway", "delivery"] as const)) as readonly ("takeaway" | "delivery" | "dine_in")[]
            ).map(type => {
              const isActive = type === "dine_in"
                ? !!activeOrder.tableId
                : (activeOrder.orderType === type && !activeOrder.tableId && !!activeOrder.orderTypeChosen);
              const labels: Record<string, string> = { takeaway: "استلام", delivery: "توصيل", dine_in: "طاولة" };
              return (
                <button
                  key={type}
                  onClick={() => {
                    if (type === "dine_in") {
                      setShowTablePicker(!showTablePicker);
                    } else {
                      updateActiveOrder(o => ({ ...o, orderType: type, orderTypeChosen: true, tableId: null, tableName: null }));
                    }
                  }}
                  className="flex-1 py-1.5 rounded-lg text-[12px] font-medium transition-all text-center"
                  style={isActive
                    ? { background: '#1d4ed8', color: 'white' }
                    : { background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }
                  }
                >
                  {labels[type]}
                </button>
              );
            })}
          </div>

          {/* Customer info */}
          <div className="px-3 pb-1 shrink-0">
            {activeOrder.customerName && (
              <div className="flex items-center gap-1.5 text-[11px] text-white/60 mb-1">
                <User className="h-3 w-3" />
                <span>{activeOrder.customerName}</span>
              </div>
            )}
            {activeOrder.tableName && (
              <div className="flex items-center gap-1.5 text-[11px] mb-1" style={{ color: '#93c5fd' }}>
                <UtensilsCrossed className="h-3 w-3" />
                <span>{activeOrder.tableName}</span>
              </div>
            )}
            {cart.length > 0 && (
              <button
                onClick={async () => {
                  const tId = activeOrder.tableId;
                  setCart([]); setSelectedCartIndex(null); setOrderDiscount(0); setOrderNote(""); setCustomerName("", null, "", null); setCustomerSearch("");
                  updateActiveOrder(o => ({ ...o, orderType: "dine_in", orderTypeChosen: false, deliveryAddress: "", tableId: null, tableName: null, guestCount: 1, guestName: "", name: `طلب ${o.name.match(/\d+/)?.[0] || "1"}` }));
                  if (tId) {
                    await supabase.from("restaurant_tables").update({ status: "available" } as any).eq("id", tId);
                    setAvailableTables(prev => prev.map(t => t.id === tId ? { ...t, status: "available" } : t));
                  }
                }}
                className="text-[11px] transition-colors flex items-center gap-1"
                style={{ color: '#fca5a5' }}
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
            <div className="px-3">
              {cart.length === 0 ? (
                <div className="py-16 text-center">
                  <ShoppingCart className="h-16 w-16 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.1)' }} />
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>ابدأ بإضافة المنتجات</p>
                </div>
              ) : (
                <div>
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
                        className="py-3 cursor-pointer transition-all"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                        onClick={() => setSelectedCartIndex(isSelected ? null : index)}
                      >
                        {/* Item name + remove */}
                        <div className="flex items-start justify-between gap-1 mb-1.5">
                          <p className="text-[14px] font-medium truncate leading-tight" style={{ color: 'white' }}>{item.name}</p>
                          {(isAdmin || posPerms.can_remove_cart_items) && (
                            <button
                              className="p-0.5 transition-colors shrink-0"
                              style={{ color: 'rgba(255,255,255,0.3)' }}
                              onClick={(e) => { e.stopPropagation(); removeFromCart(index); }}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {/* Price + Qty row */}
                        <div className="flex items-center justify-between">
                          {(isAdmin || posPerms.can_edit_prices) ? (
                            <div
                              className="flex items-center gap-1.5 px-2.5"
                              style={{
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '20px',
                                height: '30px',
                                transition: 'border-color 0.2s',
                              }}
                            >
                              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>₪</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                className="bg-transparent border-none outline-none font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                style={{
                                  color: 'white',
                                  fontSize: '14px',
                                  width: '45px',
                                  padding: 0,
                                  direction: 'ltr',
                                }}
                                value={item.unit_price}
                                onWheel={e => (e.target as HTMLElement).blur()}
                                onClick={e => e.stopPropagation()}
                                onFocus={e => {
                                  const c = e.currentTarget.parentElement;
                                  if (c) { c.style.borderColor = '#3b82f6'; }
                                }}
                                onBlur={e => {
                                  const c = e.currentTarget.parentElement;
                                  if (c) { c.style.borderColor = 'rgba(255,255,255,0.2)'; }
                                }}
                                onChange={e => {
                                  const v = parseFloat(e.target.value);
                                  if (!isNaN(v) && v >= 0) updateCartItem(index, "unit_price", v);
                                }}
                              />
                            </div>
                          ) : (
                            <span className="text-[14px] tabular-nums" style={{ color: 'white' }}>₪{item.total.toFixed(2)}</span>
                          )}
                          <div className="flex items-center gap-0">
                            <button
                              className="h-7 w-7 flex items-center justify-center rounded-md transition-colors"
                              style={{ background: 'rgba(255,255,255,0.12)', color: 'white' }}
                              onClick={(e) => { e.stopPropagation(); updateCartItem(index, "qty", Math.max(1, item.qty - 1)); }}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center text-[14px] tabular-nums" style={{ color: 'white' }}>{item.qty}</span>
                            <button
                              className="h-7 w-7 flex items-center justify-center rounded-md transition-colors"
                              style={{ background: 'rgba(255,255,255,0.12)', color: 'white' }}
                              onClick={(e) => { e.stopPropagation(); updateCartItem(index, "qty", item.qty + 1); }}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
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

          {/* Footer */}
          <div className="shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            {/* Delivery Panel */}
            <POSDeliveryPanel
              orderId={activeOrder.savedOrderId}
              isDelivery={activeOrder.orderType === "delivery"}
              customerAddress={activeOrder.deliveryAddress}
              zoneCode={activeOrder.zoneCode}
              areaName={activeOrder.areaName}
              deliveryStatus={activeOrder.deliveryStatus}
              captainName={activeOrder.captainName}
              captainPhone={activeOrder.captainPhone}
              captainVehicle={activeOrder.captainVehicle}
              onDeliveryFieldsChange={(fields) => {
                updateActiveOrder(o => ({
                  ...o,
                  deliveryAddress: fields.customerAddress ?? o.deliveryAddress,
                  zoneCode: fields.zoneCode ?? o.zoneCode,
                  areaName: fields.areaName ?? o.areaName,
                }));
              }}
              onDeliveryStatusChange={(status, captain) => {
                updateActiveOrder(o => ({
                  ...o,
                  deliveryStatus: status,
                  captainName: captain?.name ?? o.captainName,
                  captainPhone: captain?.phone ?? o.captainPhone,
                  captainVehicle: captain?.vehicle ?? o.captainVehicle,
                }));
              }}
            />

            {/* Table picker dropdown */}
            {restaurantFeatures && showTablePicker && (
              <div className="mx-3 mt-1 z-50 border rounded-lg shadow-lg p-2 max-h-[200px] overflow-y-auto" style={{ background: '#1a2d4a', borderColor: 'rgba(255,255,255,0.15)' }}>
                {availableTables.length === 0 && (
                  <p className="text-[11px] p-2 text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>جاري التحميل...</p>
                )}
                {activeOrder.tableId && (
                  <button
                    onClick={() => {
                      updateActiveOrder(o => ({ ...o, tableId: null, tableName: null, orderType: "takeaway", orderTypeChosen: false, name: `طلب ${activeOrderIndex + 1}` }));
                      setShowTablePicker(false);
                    }}
                    className="w-full text-right text-xs px-3 py-2 rounded-md flex items-center gap-2"
                    style={{ color: '#fca5a5' }}
                  >
                    <X className="h-3 w-3" />
                    إلغاء الطاولة
                  </button>
                )}
                {availableTables.map(t => (
                  <button
                    key={t.id}
                    onClick={async () => {
                      if (t.status === "occupied") {
                        await loadTableOrder(t.id, t.name);
                        setShowTablePicker(false);
                        return;
                      }
                      updateActiveOrder(o => ({ ...o, tableId: t.id, tableName: t.name, orderType: "dine_in", orderTypeChosen: true, name: t.name }));
                      setShowTablePicker(false);
                    }}
                    className="w-full text-right text-xs px-3 py-2 rounded-md flex items-center justify-between gap-2"
                    style={{
                      color: t.id === activeOrder.tableId ? '#93c5fd' : t.status === "occupied" ? '#fca5a5' : 'rgba(255,255,255,0.7)',
                      background: t.id === activeOrder.tableId ? 'rgba(59,130,246,0.15)' : 'transparent',
                    }}
                  >
                    <span>{t.name}</span>
                    {t.status === "occupied" && <span className="text-[10px]">مشغولة</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Order Note Input */}
            {/* Order Note Input — WHITE background, always visible (Al-Malaky April 2026) */}
            <div className="px-3 pt-2">
              <div className="flex items-center gap-1.5">
                <Input
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                  placeholder="📝 ملاحظة على الفاتورة..."
                  className="h-9 text-[13px] flex-1 font-semibold"
                  style={{
                    background: '#ffffff',
                    border: '2px solid #e5e7eb',
                    color: '#111827',
                  }}
                />
                {orderNote && (
                  <button
                    onClick={() => setOrderNote("")}
                    className="h-9 w-9 rounded-md flex items-center justify-center"
                    style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}
                    title="مسح الملاحظة"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Totals */}
            <div className="px-3 py-3">
              {cartTotals.tax > 0 && (
                <div className="flex justify-between text-[11px] mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <span>الضريبة</span>
                  <span className="tabular-nums">₪{cartTotals.tax.toFixed(2)}</span>
                </div>
              )}
              {cartTotals.discount > 0 && (
                <div className="flex justify-between text-[11px] mb-1" style={{ color: '#fca5a5' }}>
                  <span>الخصم</span>
                  <span className="tabular-nums">-₪{cartTotals.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline">
                <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>الإجمالي</span>
                <motion.span
                  key={cartTotals.total}
                  initial={{ scale: 1.05 }}
                  animate={{ scale: 1 }}
                  className="text-[20px] font-bold tabular-nums"
                  style={{ color: 'white' }}
                >
                  ₪{cartTotals.total.toFixed(2)}
                </motion.span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-3 pb-3 space-y-2">
              {/* Pay button - hidden for call center */}
              {!isCallCenter && (
                <motion.button
                  whileTap={{ scale: 0.99 }}
                  className="w-full h-[48px] rounded-lg text-[14px] font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
                  style={{ backgroundColor: '#16a34a', color: 'white', border: 'none', transition: 'all 0.15s ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#15803d'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#16a34a'; }}
                  onMouseDown={(e) => { e.currentTarget.style.backgroundColor = '#166534'; }}
                  onMouseUp={(e) => { e.currentTarget.style.backgroundColor = '#15803d'; }}
                  disabled={cart.length === 0 || !session}
                  onClick={openPaymentModal}
                >
                  F2 — دفع ₪{(customerDataDiscount ? cartTotals.total - customerDataDiscount.discountAmount : cartTotals.total).toFixed(2)}
                </motion.button>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleSaveToTable}
                  disabled={savingToTable || cart.length === 0}
                  className="flex-1 h-10 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1 transition-all disabled:opacity-40"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
                >
                  F10 حفظ
                </button>
                {!isCallCenter && restaurantFeatures && (
                  <button
                    onClick={handleSendToKitchen}
                    disabled={cart.length === 0}
                    className="flex-1 h-10 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1 transition-all disabled:opacity-40"
                    style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
                  >
                    F9 طباعة
                  </button>
                )}
                {(isAdmin || isCallCenter) && (
                  <button
                    onClick={() => setShowCallCenterDispatch(true)}
                    disabled={!session || cart.length === 0}
                    className="flex-1 h-10 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1 transition-all disabled:opacity-40"
                    style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
                  >
                    F12 تحويل
                  </button>
                )}
              </div>

              {/* Quick save+print - only for non-call-center when accepting call center orders */}
              {!isCallCenter && cart.length > 0 && activeOrder.callCenterOrderId && (
                <button
                  onClick={handleQuickSaveAndPrint}
                  disabled={quickProcessing || processing || !session}
                  className="w-full h-10 rounded-lg text-[12px] font-bold flex items-center justify-center gap-1 text-white transition-all disabled:opacity-40"
                  style={{ backgroundColor: "#7C3AED" }}
                >
                  {quickProcessing ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Printer className="h-3 w-3" />
                      حفظ وطباعة
                    </>
                  )}
                </button>
              )}
              {isCallCenter && (
                <button
                  onClick={() => setShowDispatchLog(true)}
                  className="w-full h-10 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1 transition-all relative"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'white' }}
                >
                  <ClipboardList className="h-3 w-3" />
                  سجل المحوّلة
                  {pendingDispatchCount > 0 && (
                    <Badge className="text-[8px] px-1 py-0 h-4 bg-amber-500 text-white animate-pulse">
                      {pendingDispatchCount}
                    </Badge>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════ MODALS ══════ */}

      {/* Open Shift Dialog */}
      <Dialog open={showOpenShift} onOpenChange={(v) => { if (!v && !session) navigate(isAdmin ? "/apps" : "/choose-workspace", { replace: true }); setShowOpenShift(v); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">فتح وردية جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {(() => {
              const branchOk = !!deviceConfig.branchId;
              const terminalOk = !!deviceConfig.terminalId;
              const bridgeOk = bridgeOnlineDiag === true;
              const printersOk = (printersCountDiag ?? 0) > 0;
              const blocking = !branchOk || !terminalOk;
              // الكول سنتر ما بلزمه Bridge ولا طابعات — فقط فرع + محطة.
              const callCenterBox = selectedCashBoxId === "__call_center__";
              const hideHardwareRows = callCenterEnabled && callCenterBox;
              const Row = ({ ok, label, value }: { ok: boolean | null; label: string; value: string }) => (
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`inline-flex items-center gap-1 font-medium ${
                    ok === true ? "text-success" : ok === false ? "text-destructive" : "text-muted-foreground"
                  }`}>
                    {ok === true ? "✓" : ok === false ? "✗" : "…"} {value}
                  </span>
                </div>
              );
              return (
                <div className={`rounded-md border p-3 space-y-1.5 ${
                  blocking ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/30"
                }`}>
                  <div className="text-[12px] font-semibold mb-1">حالة الجهاز</div>
                  {!hideHardwareRows && (
                    <Row ok={bridgeOnlineDiag} label="برنامج الطباعة" value={bridgeOk ? "متصل" : bridgeOnlineDiag === false ? "غير متصل" : "جارٍ الفحص…"} />
                  )}
                  <Row ok={branchOk} label="الفرع" value={branchOk ? "معرف" : "غير معرف"} />
                  <Row ok={terminalOk} label="محطة POS" value={terminalOk ? "معرفة" : "غير معرفة"} />
                  <Row ok={null} label="الصندوق النقدي" value="اختياري" />
                  {!hideHardwareRows && (
                    <Row ok={printersCountDiag === null ? null : printersOk} label="الطابعات"
                         value={printersCountDiag === null ? "جارٍ الفحص…" : printersOk ? `${printersCountDiag} معرفة` : "غير معرفة"} />
                  )}
                  {blocking && (
                    <div className="pt-2 space-y-2">
                      <div className="text-[12px] text-destructive">
                        لا يمكن فتح الوردية حتى يتم ضبط {!branchOk ? "الفرع" : ""}{!branchOk && !terminalOk ? " و" : ""}{!terminalOk ? "محطة POS" : ""}.
                      </div>
                      {isAdmin ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="w-full h-9"
                          onClick={() => { setShowOpenShift(false); navigate("/onboarding/new-device"); }}
                        >
                          🛠️ فتح إعداد الجهاز
                        </Button>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-[11px] text-muted-foreground bg-muted/50 rounded p-2 text-center">
                            ⚠️ إعداد الجهاز يحتاج صلاحية الإدارة. راجع المسؤول.
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full h-9"
                            onClick={() => { setShowOpenShift(false); navigate("/choose-workspace", { replace: true }); }}
                          >
                            ← العودة لاختيار التطبيق
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
            {/* Cash Box Selector */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">الصندوق</label>
              <select
                value={selectedCashBoxId}
                onChange={(e) => {
                  const nextBox = cashBoxes.find((box) => box.id === e.target.value) || null;
                  if (nextBox && !guardCashBoxBranchId(nextBox)) return;
                  setSelectedCashBoxId(e.target.value);
                  if (e.target.value === "__call_center__") {
                    setOpeningCash("0");
                  }
                }}
                className="w-full h-12 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="">بدون صندوق مؤقتاً</option>
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
            <Button
              onClick={handleOpenShift}
              disabled={!deviceConfig.branchId || !deviceConfig.terminalId}
              className="w-full h-12 text-base font-bold gap-2"
            >
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
                  { key: "F12", desc: "تحويل إلى الفرع" },
                  { key: "F4", desc: "سجل الفواتير" },
                  { key: "F8", desc: "طباعة" },
                  { key: "F9", desc: "إرسال إلى الطابعة" },
                  { key: "F10", desc: "حفظ الطلب" },
                  { key: "F2", desc: "فتح نافذة الدفع / إتمام البيع" },
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

      {/* Payment Modal — Light Theme */}
      {showPayment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowPayment(false); }}
        >
          <div
            className="w-full max-h-[95vh] overflow-hidden flex flex-col shadow-2xl"
            style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e5e7eb', maxWidth: 520 }}
            dir="rtl"
          >
            {/* Header */}
            <div className="flex items-center justify-between shrink-0" style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb' }}>
              <span className="text-[16px] font-semibold" style={{ color: '#111827' }}>طريقة الدفع</span>
              <button
                onClick={() => setShowPayment(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                style={{ background: '#f3f4f6', color: '#6b7280' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#e5e7eb'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#f3f4f6'; }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto" style={{ background: '#f9fafb' }}>
              {/* Amount display */}
              <div className="text-center mx-4 mt-4" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                <p className="text-[13px] mb-1" style={{ color: '#6b7280' }}>المبلغ المطلوب</p>
                {customerDataDiscount && (
                  <p className="text-xs mb-1" style={{ color: '#16a34a' }}>🎁 خصم {customerDataDiscount.discountPct}% = -₪{customerDataDiscount.discountAmount.toFixed(2)}</p>
                )}
                <motion.p key={cartTotals.total} initial={{ scale: 1.05 }} animate={{ scale: 1 }} className="text-[32px] font-bold tabular-nums" style={{ color: '#111827' }}>
                  ₪{(customerDataDiscount ? cartTotals.total - customerDataDiscount.discountAmount : cartTotals.total).toFixed(2)}
                </motion.p>
              </div>

              {/* Payment methods */}
              <div className="grid grid-cols-4 gap-2 mx-4 mt-3">
                {[
                  { key: "cash", label: "نقد", icon: Banknote, selColor: "#16a34a", selBg: "#f0fdf4" },
                  { key: "card", label: "بطاقة", icon: CreditCard, selColor: "#3b82f6", selBg: "#eff6ff" },
                  { key: "credit", label: "آجل", icon: Receipt, selColor: "#f59e0b", selBg: "#fffbeb", requiresPerm: true },
                  { key: "employee_account", label: "حساب موظف", icon: UserCheck, selColor: "#8b5cf6", selBg: "#f5f3ff" },
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
                          (async () => {
                            const uid = dataOwnerId || user?.id;
                            if (!uid) return;
                            const { data: cs } = await supabase.from("company_settings" as any).select("card_bank_account_id").eq("user_id", uid).maybeSingle();
                            if (!(cs as any)?.card_bank_account_id) toast.error("⚠️ لم يتم تعريف حساب بنكي للبطاقة");
                          })();
                        }
                      }}
                      className="flex flex-col items-center gap-2 rounded-[10px] transition-all"
                      style={{
                        padding: '12px 8px',
                        background: isActive ? m.selBg : '#ffffff',
                        border: isActive ? `1.5px solid ${m.selColor}` : '1.5px solid #e5e7eb',
                      }}
                    >
                      <m.icon className="h-6 w-6" style={{ color: isActive ? m.selColor : '#9ca3af' }} />
                      <span className="text-[12px] font-medium text-center" style={{ color: isActive ? m.selColor : '#6b7280' }}>{m.label}</span>
                    </motion.button>
                  );
                })}
              </div>

              {/* Cash-specific controls */}
              {paymentMethod === "cash" && (
                <div className="mx-4 mt-3 space-y-3">
                  {/* Currency selector */}
                  <div>
                    <p className="text-[12px] mb-2" style={{ color: '#6b7280' }}>العملة</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {currencies.map((cur) => {
                        const isActive = paymentCurrency === cur.code;
                        return (
                          <button
                            key={cur.code}
                            onClick={() => { setPaymentCurrency(cur.code); setChangeCurrency("ILS"); setEditedRate(null); setRateEdited(false); setTenderedAmount(""); setManualChangeAmount(null); }}
                            className="flex flex-col items-center gap-0.5 rounded-lg transition-all"
                            style={{
                              padding: '8px 12px',
                              background: isActive ? '#f0fdf4' : '#ffffff',
                              border: isActive ? '1.5px solid #16a34a' : '1.5px solid #e5e7eb',
                            }}
                          >
                            <span className="text-[13px] font-medium" style={{ color: isActive ? '#16a34a' : '#374151' }}>{cur.flag}</span>
                            <span className="text-[11px]" style={{ color: isActive ? '#16a34a' : '#9ca3af' }}>{cur.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Amount received */}
                  <div>
                    <p className="text-[12px] mb-1.5" style={{ color: '#6b7280' }}>
                      المبلغ المستلم ({currencies.find(c => c.code === paymentCurrency)?.name})
                    </p>
                    <input
                      type="number"
                      value={tenderedAmount}
                      onChange={(e) => { setTenderedAmount(e.target.value); setManualChangeAmount(null); }}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      placeholder={(cartTotals.total / (exchangeRates[paymentCurrency] || 1)).toFixed(2)}
                      autoFocus
                      className="w-full text-center text-[18px] font-semibold tabular-nums focus:outline-none transition-colors"
                      style={{
                        height: 48, borderRadius: 8,
                        background: '#ffffff',
                        border: '2px solid #f59e0b',
                        color: '#111827',
                      }}
                    />
                  </div>

                  {/* Exchange rate info */}
                  {paymentCurrency !== "ILS" && exchangeRates[paymentCurrency] && (
                    <div className="space-y-2 p-3 rounded-[10px]" style={{ background: '#ffffff', border: '1px solid #e5e7eb' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold flex items-center gap-1" style={{ color: '#111827' }}>
                          💱 سعر الصرف — {currencies.find(c => c.code === paymentCurrency)?.name}
                        </span>
                        {exchangeRateDetails[paymentCurrency] && (() => {
                          const rateDate = exchangeRateDetails[paymentCurrency].date;
                          const isStale = rateDate && new Date(rateDate).toDateString() !== new Date().toDateString();
                          return isStale ? <span className="text-[10px]" style={{ color: '#d97706' }}>⚠️ لم يُحدَّث اليوم</span> : null;
                        })()}
                      </div>
                      <div className="flex items-center justify-between text-[11px]" style={{ color: '#6b7280' }}>
                        <span>السعر في النظام: {exchangeRateDetails[paymentCurrency]?.rate?.toFixed(4) || '—'} ₪/{paymentCurrency}</span>
                        <span>{exchangeRateDetails[paymentCurrency]?.date ? `آخر تحديث: ${new Date(exchangeRateDetails[paymentCurrency].date).toLocaleDateString("ar-PS")}` : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={editedRate !== null ? editedRate : (exchangeRates[paymentCurrency] || 0)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (val > 0) { setEditedRate(val); setRateEdited(true); setExchangeRates(prev => ({ ...prev, [paymentCurrency]: val })); }
                          }}
                          step="0.0001"
                          className="flex-1 text-sm font-mono h-9 text-center focus:outline-none"
                          style={{
                            background: rateEdited ? '#fffbeb' : '#f9fafb',
                            border: rateEdited ? '1px solid #f59e0b' : '1px solid #e5e7eb',
                            borderRadius: 6, color: '#111827',
                          }}
                        />
                        <span className="text-xs whitespace-nowrap" style={{ color: '#6b7280' }}>₪/{paymentCurrency}</span>
                        {rateEdited && (
                          <button
                            onClick={() => {
                              const original = exchangeRateDetails[paymentCurrency]?.rate || 1;
                              setEditedRate(null); setRateEdited(false);
                              setExchangeRates(prev => ({ ...prev, [paymentCurrency]: exchangeRateDetails[paymentCurrency]?.posOverride || original }));
                            }}
                            className="text-[10px] whitespace-nowrap" style={{ color: '#3b82f6' }}
                          >← الرسمي</button>
                        )}
                      </div>
                      {rateEdited && <p className="text-[10px]" style={{ color: '#d97706' }}>⚠️ سيُسجَّل السعر المعدَّل في سجل المعاملات</p>}
                      <div className="flex justify-between items-center pt-1" style={{ borderTop: '1px solid #f3f4f6' }}>
                        <span className="text-xs" style={{ color: '#6b7280' }}>المطلوب بال{currencies.find(c => c.code === paymentCurrency)?.name}</span>
                        <span className="font-mono font-bold text-sm tabular-nums" style={{ color: '#111827' }}>
                          {currencies.find(c => c.code === paymentCurrency)?.symbol}{(cartTotals.total / (exchangeRates[paymentCurrency] || 1)).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-[10px] flex items-center gap-1 pt-1" style={{ color: '#9ca3af' }}>
                        <span>📒 سيُسجَّل في:</span>
                        <span className="font-medium" style={{ color: '#6b7280' }}>
                          {paymentCurrency === 'USD' ? 'صندوق الدولار (1111)' : paymentCurrency === 'JOD' ? 'صندوق الدينار (1112)' : paymentCurrency === 'EUR' ? 'صندوق اليورو (1113)' : paymentCurrency === 'EGP' ? 'صندوق الجنيه (1114)' : 'الصندوق (1110)'}
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
                    const displayChangeAmount = changeCurrency === "ILS" ? changeILS : changeILS / (exchangeRates[changeCurrency] || rate);
                    const displaySymbol = changeCurrency === "ILS" ? "₪" : changeCurrency === "USD" ? "$" : changeCurrency === "JOD" ? "د.أ " : "₪";

                    return (
                      <div className="p-3 rounded-[10px] space-y-2" style={{ border: '1px solid #e5e7eb', background: '#ffffff' }}>
                        {paymentCurrency !== "ILS" && (
                          <div className="flex justify-between text-xs">
                            <span style={{ color: '#6b7280' }}>ما يعادل بالشيكل</span>
                            <span className="font-bold tabular-nums" style={{ color: '#111827' }}>₪{tenderedInILS.toFixed(2)}</span>
                          </div>
                        )}
                        {changeILS >= 0 ? (
                          <>
                            {paymentCurrency !== "ILS" && changeILS > 0 && (
                              <div className="flex gap-1.5 justify-center py-1">
                                {["ILS", paymentCurrency].filter((v, i, a) => a.indexOf(v) === i).map(cur => {
                                  const isActive = changeCurrency === cur;
                                  const label = cur === "ILS" ? "شيكل ₪" : cur === "USD" ? "دولار $" : cur === "JOD" ? "دينار د.أ" : cur;
                                  return (
                                    <button key={cur} onClick={() => { setChangeCurrency(cur); setManualChangeAmount(null); }}
                                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                                      style={{
                                        background: isActive ? '#16a34a' : '#f3f4f6',
                                        color: isActive ? 'white' : '#6b7280',
                                      }}
                                    >الباقي {label}</button>
                                  );
                                })}
                              </div>
                            )}
                            <div className="flex justify-between items-center p-3 rounded-[10px]" style={{ background: '#f0fdf4', border: '1.5px solid #16a34a' }}>
                              <span className="text-sm font-bold" style={{ color: '#111827' }}>الباقي للزبون</span>
                              <div className="flex items-center gap-1">
                                <span className="text-lg font-bold" style={{ color: '#16a34a' }}>{displaySymbol}</span>
                                <input type="number" inputMode="decimal" step="0.01"
                                  value={manualChangeAmount !== null ? manualChangeAmount : displayChangeAmount.toFixed(2)}
                                  onChange={(e) => setManualChangeAmount(e.target.value)}
                                  onFocus={(e) => { if (manualChangeAmount === null) setManualChangeAmount(displayChangeAmount.toFixed(2)); e.target.select(); }}
                                  className="w-32 text-left text-xl font-black tabular-nums bg-transparent border-none outline-none focus:ring-1 focus:ring-green-400 rounded px-1"
                                  style={{ color: '#16a34a', fontFamily: 'Cairo, sans-serif' }} dir="ltr"
                                />
                              </div>
                            </div>
                            {paymentCurrency !== "ILS" && changeILS > 0 && (
                              <div className="flex justify-between text-[11px] pt-1.5" style={{ color: '#9ca3af', borderTop: '1px solid #f3f4f6' }}>
                                {changeCurrency === "ILS" ? (
                                  <><span>أو بال{currencies.find(c => c.code === paymentCurrency)?.name}</span><span className="font-medium tabular-nums">{curSymbol}{changeInForeign.toFixed(2)}</span></>
                                ) : (
                                  <><span>أو بالشيكل</span><span className="font-medium tabular-nums">₪{changeILS.toFixed(2)}</span></>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex justify-between items-center p-2.5 rounded-lg" style={{ background: '#fef2f2' }}>
                            <span className="text-xs" style={{ color: '#dc2626' }}>المبلغ غير كافٍ</span>
                            <span className="text-lg font-bold tabular-nums" style={{ color: '#dc2626' }}>-₪{Math.abs(changeILS).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Quick amounts */}
                  <div className="flex gap-1.5">
                    {(paymentCurrency === "ILS" ? [10, 20, 50, 100, 200] : [5, 10, 20, 50, 100]).map((amt) => {
                      const cur = currencies.find(c => c.code === paymentCurrency);
                      return (
                        <button key={amt}
                          onClick={() => { setTenderedAmount(String(amt)); setManualChangeAmount(null); }}
                          className="flex-1 text-[13px] tabular-nums font-medium transition-all"
                          style={{
                            height: 38, borderRadius: 8,
                            background: '#ffffff',
                            border: '1px solid #e5e7eb',
                            color: '#374151',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; }}
                        >{cur?.symbol}{amt}</button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Credit customer selection */}
              {paymentMethod === "credit" && (
                <div className="mx-4 mt-3 space-y-2">
                  <label className="text-sm font-bold block" style={{ color: '#111827' }}>اسم الزبون</label>
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: '#9ca3af' }} />
                    <input
                      value={customerSearch || customerName}
                      onChange={(e) => { setCustomerSearch(e.target.value); setCustomerName(e.target.value, null); setShowContactDropdown(true); }}
                      onFocus={() => setShowContactDropdown(true)}
                      placeholder="ابحث عن زبون..."
                      autoFocus
                      className="w-full h-11 pr-10 text-sm focus:outline-none"
                      style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#111827' }}
                    />
                  </div>
                  <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
                    <ScrollArea className="max-h-[200px]">
                      {filteredContacts.length > 0 ? (
                        <div>
                          {filteredContacts.map((contact) => (
                            <button key={contact.id}
                              onClick={() => { setCustomerName(contact.contact_name, contact.id); setCustomerSearch(""); setShowContactDropdown(false); }}
                              className="w-full px-3 py-2.5 text-sm text-right transition flex items-center gap-2"
                              style={{
                                color: customerName === contact.contact_name ? '#16a34a' : '#374151',
                                background: customerName === contact.contact_name ? '#f0fdf4' : 'transparent',
                                borderBottom: '1px solid #f3f4f6',
                              }}
                              onMouseEnter={e => { if (customerName !== contact.contact_name) e.currentTarget.style.background = '#f9fafb'; }}
                              onMouseLeave={e => { if (customerName !== contact.contact_name) e.currentTarget.style.background = 'transparent'; }}
                            >
                              <User className="h-4 w-4 shrink-0" style={{ color: '#9ca3af' }} />
                              <span className="flex-1 truncate">{contact.contact_name}</span>
                              {customerName === contact.contact_name && <CheckCircle className="h-4 w-4 shrink-0" style={{ color: '#16a34a' }} />}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="py-6 text-center text-sm" style={{ color: '#9ca3af' }}>لا يوجد نتائج</div>
                      )}
                    </ScrollArea>
                    <button
                      onClick={() => { setNewCustomerName(customerSearch || ""); setShowQuickAddCustomer(true); setShowContactDropdown(false); }}
                      className="w-full px-3 py-2.5 text-sm text-right transition flex items-center gap-2 font-semibold"
                      style={{ color: '#3b82f6', background: '#eff6ff', borderTop: '1px solid #e5e7eb' }}
                    >
                      <PlusCircle className="h-4 w-4 shrink-0" />
                      <span>إضافة زبون جديد</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Employee account */}
              {paymentMethod === "employee_account" && (
                <div className="mx-4 mt-3 space-y-2">
                  <label className="text-sm font-medium mb-1.5 block" style={{ color: '#111827' }}>اختر الموظف</label>
                  <div className="relative">
                    <UserCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: '#9ca3af' }} />
                    <input
                      value={selectedEmployee ? selectedEmployee.full_name : employeeSearch}
                      onChange={(e) => { setEmployeeSearch(e.target.value); setSelectedEmployee(null); setShowEmployeeDropdown(true); }}
                      onFocus={() => setShowEmployeeDropdown(true)}
                      placeholder="ابحث عن موظف..."
                      className="w-full h-10 pr-10 text-sm focus:outline-none"
                      style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#111827' }}
                    />
                  </div>
                  {showEmployeeDropdown && filteredEmployees.length > 0 && !selectedEmployee && (
                    <div className="z-50 w-full rounded-lg shadow-lg max-h-40 overflow-y-auto" style={{ background: '#ffffff', border: '1px solid #e5e7eb' }}>
                      {filteredEmployees.map((emp) => (
                        <button key={emp.id}
                          onClick={() => { setSelectedEmployee({ id: emp.id, full_name: emp.full_name, account_code: emp.account_code, job_title: emp.job_title }); setEmployeeSearch(""); setShowEmployeeDropdown(false); loadEmployeeBalance(emp.id); }}
                          className="w-full px-3 py-2 text-sm text-right transition flex items-center gap-2"
                          style={{ color: '#374151' }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <UserCheck className="h-3.5 w-3.5 shrink-0" style={{ color: '#8b5cf6' }} />
                          <span>{emp.full_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedEmployee && (
                    <div className="p-3 rounded-[10px]" style={{ background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4" style={{ color: '#8b5cf6' }} />
                          <span className="text-sm font-medium" style={{ color: '#111827' }}>{selectedEmployee.full_name}</span>
                        </div>
                        {selectedEmployee.job_title && <span className="text-xs" style={{ color: '#6b7280' }}>{selectedEmployee.job_title}</span>}
                      </div>
                      <div className="mt-2">
                        <input
                          value={employeeNote}
                          onChange={(e) => setEmployeeNote(e.target.value)}
                          placeholder="ملاحظة (مثال: غداء، أكل، سلفة...)"
                          className="w-full h-8 px-2 text-xs focus:outline-none"
                          style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 6, color: '#111827' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bottom spacing */}
              <div className="h-3" />
            </div>

            {/* Footer — Confirm button */}
            <div className="shrink-0" style={{ padding: '14px 16px 16px', borderTop: '1px solid #e5e7eb', background: '#ffffff' }}>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => handleCompleteOrder()}
                disabled={processing || (paymentMethod === "credit" && !customerName) || (paymentMethod === "employee_account" && !selectedEmployee)}
                className="w-full flex items-center justify-center gap-2 text-[15px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ height: 50, borderRadius: 10, background: '#16a34a', color: 'white', border: 'none' }}
                onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#15803d'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#16a34a'; }}
              >
                {processing ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle className="h-5 w-5" />
                )}
                {processing ? "جاري المعالجة..." : "F2 — إتمام البيع ✅"}
              </motion.button>
            </div>
          </div>
        </div>
      )}

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
              disabled={!closingCash && !closingCashUSD && !closingCashJOD}
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
        cashierMode={!isAdmin}
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
              if (!enforceDeviceGuard()) return;
              if (kitchenTicketData) {
                const kitchenOrder: BridgePrintOrder = {
                  orderNumber: kitchenTicketData.orderNumber || Date.now().toString(),
                  branchName: company?.name || "مطعم الملكي - سفيان",
                  cashier: kitchenTicketData.cashierName || "",
                  items: [],
                  total: 0,
                  orderNote: kitchenTicketData.orderNote || undefined,
                };
                // Send per-station print jobs so each station routes to its own printer
                for (const st of (kitchenTicketData.stations || kitchenTicketData.tickets || [])) {
                  const stationOrder: BridgePrintOrder = {
                    ...kitchenOrder,
                    branchName: st.stationName || kitchenOrder.branchName,
                    stationId: st.stationId,
                    items: (st.items || []).map((item: any) => ({
                      id: item.id || item.name,
                      name: item.name,
                      quantity: item.qty || 1,
                      price: 0,
                      note: item.note || undefined,
                    })),
                  };
                  printStationTicketImage(stationOrder, st.stationId || "", stationOrder.items).catch(() => {});
                }
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
            requireManagerForReturn={!isAdmin && posPerms.require_manager_for_returns}
            cashierMode={!isAdmin && !posPerms.view_payment_details}
            cancelWindowMinutes={cashierCancelWindowMin}
            amountVisibleMinutes={cashierAmountVisibleMin}
            onInvoiceCancelled={(orderId, orderNumber) => {
              setLastCancelledOrder({ id: orderId, order_number: orderNumber, at: Date.now() });
              setMarkAsReplacement(true); // auto-suggest for the very next sale
            }}
            allowOrderTransfer={posAllowOrderTransfer}
            printInvoices={isAdmin || posPerms.print_invoices}
            resendInvoice={isAdmin || posPerms.resend_invoice}
            onRecallToCart={(items, invoiceId, orderNumber, reason, approvedBy) => {
              setCart(items);
              setRecallBanner({ invoiceId, orderNumber, reason, approvedBy });
            }}
            onLoadDraftToCart={(items, orderId) => {
              setCart(items);
              setShowInvoiceHistory(false);
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
        sessionBalance={isAdmin && session ? session.opening_cash + session.total_sales : 0}
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
          updateActiveOrder(o => ({ ...o, orderType: "dine_in", orderTypeChosen: false, deliveryAddress: "" }));
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
            <span className="text-muted-foreground text-xs">يمكنك التراجع خلال 10 ثوانٍ بعد الحذف.</span>
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

      {/* ── Camera Barcode Scanner ── */}
      <POSBarcodeScanner
        open={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={handleBarcodeScan}
      />

      {/* ── Concurrent-shift safeguard ── */}
      {/* Pops the moment Realtime reports the session was closed from another */}
      {/* device. Cart stays untouched; cashier can open a new shift or sign out. */}
      <ShiftClosedElsewhereDialog
        open={shiftClosedElsewhere && !!session}
        closedAt={shiftClosedAt}
        signOutLabel={isAdmin ? "العودة لشاشة التطبيقات" : "العودة لشاشة الموظف"}
        onOpenNewShift={() => {
          // Drop the closed session locally so the OpenShift screen reappears.
          setSession(null);
          setOrders([createNewOrder(1)]);
          setActiveOrderIndex(0);
          orderCounter.current = 1;
        }}
        onSignOut={async () => {
          // Admins go back to the apps grid (NOT the employee/auth screen).
          if (isAdmin) {
            navigate("/apps", { replace: true });
          } else {
            // الكاشير يرجع لشاشة الموظف بدون تسجيل خروج.
            navigate("/employee", { replace: true });
          }
        }}
      />
    </div>
  );
};

export default POSPage;
