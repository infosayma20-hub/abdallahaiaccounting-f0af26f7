import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Package, Plus, Minus, Trash2, LogOut, Camera, Upload,
  X, ChevronDown, Banknote, Clock, Building2, CreditCard,
  FileText, CheckCircle, AlertCircle, StickyNote, Image as ImageIcon,
  ShoppingCart, TrendingDown, TrendingUp, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { multiWordMatchAny } from "@/lib/utils";

// Types
interface PurchaseCartItem {
  id: string;
  product_id: string | null;
  name: string;
  unit: string;
  qty: number;
  unit_price: number;
  previous_price: number;
  tax_pct: number;
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
  barcode: string | null;
  tax_rate: number;
  image_url: string | null;
  min_quantity: number;
}

interface Supplier {
  id: string;
  company_name: string;
  contact_person: string | null;
  phone: string | null;
}

const PAYMENT_METHODS = [
  { id: "cash", label: "نقدي", icon: Banknote },
  { id: "credit", label: "آجل", icon: Clock },
  { id: "transfer", label: "تحويل", icon: Building2 },
  { id: "check", label: "شيك", icon: CreditCard },
];

const PurchasePointPage = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("الكل");

  // Cart
  const [cart, setCart] = useState<PurchaseCartItem[]>([]);
  const [selectedCartIndex, setSelectedCartIndex] = useState<number | null>(null);

  // Invoice details
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [invoiceNote, setInvoiceNote] = useState("");
  const [invoiceImageUrl, setInvoiceImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [taxRate] = useState(16);

  // Dialogs
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ company_name: "", contact_person: "", phone: "" });
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const userId = user?.id;
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";

  // Resolve team owner
  useEffect(() => {
    if (!userId) return;
    supabase.rpc("get_team_owner_id", { _user_id: userId }).then(({ data }) => {
      setDataOwnerId(data || userId);
    });
  }, [userId]);

  // Load data
  useEffect(() => {
    if (!dataOwnerId) return;
    loadData();
  }, [dataOwnerId]);

  const loadData = async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    try {
      const [productsRes, suppliersRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, sell_price, buy_price, quantity, category, unit, barcode, tax_rate, image_url, min_quantity")
          .eq("user_id", dataOwnerId)
          .order("name"),
        supabase
          .from("suppliers")
          .select("id, company_name, contact_person, phone")
          .eq("user_id", dataOwnerId)
          .eq("is_active", true)
          .order("company_name"),
      ]);

      setProducts(
        (productsRes.data || []).map((p: any) => ({
          ...p,
          sell_price: Number(p.sell_price),
          buy_price: Number(p.buy_price),
          quantity: Number(p.quantity),
          tax_rate: Number(p.tax_rate) || 0,
          min_quantity: Number(p.min_quantity) || 0,
        }))
      );
      setSuppliers(suppliersRes.data || []);
    } catch (err) {
      console.error(err);
      toast.error("خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  // Categories
  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category).filter(Boolean));
    return ["الكل", ...Array.from(cats)];
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    let filtered = products;
    if (selectedCategory !== "الكل") {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      filtered = filtered.filter(p => multiWordMatchAny(searchQuery, p.name, p.barcode));
    }
    return filtered;
  }, [products, selectedCategory, searchQuery]);

  // Cart calculations
  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.qty * i.unit_price, 0), [cart]);
  const taxAmount = useMemo(() => subtotal * (taxRate / 100), [subtotal, taxRate]);
  const totalAmount = subtotal + taxAmount;

  // Add to cart
  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.findIndex((i) => i.product_id === product.id);
      if (existing >= 0) {
        return prev.map((item, idx) =>
          idx === existing
            ? { ...item, qty: item.qty + 1, total: (item.qty + 1) * item.unit_price }
            : item
        );
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          product_id: product.id,
          name: product.name,
          unit: product.unit || "قطعة",
          qty: 1,
          unit_price: product.buy_price,
          previous_price: product.buy_price,
          tax_pct: product.tax_rate,
          total: product.buy_price,
          note: "",
        },
      ];
    });
  }, []);

  // Update cart item
  const updateCartItem = useCallback((index: number, updates: Partial<PurchaseCartItem>) => {
    setCart((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, ...updates };
        updated.total = updated.qty * updated.unit_price;
        return updated;
      })
    );
  }, []);

  const removeCartItem = useCallback((index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
    setSelectedCartIndex(null);
  }, []);

  // Upload image
  const handleImageUpload = async (file: File) => {
    if (!dataOwnerId || !file) return;
    setUploadingImage(true);
    try {
      const fileName = `${dataOwnerId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage
        .from("purchase-invoices")
        .upload(fileName, file, { upsert: true });
      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from("purchase-invoices")
        .getPublicUrl(fileName);

      setInvoiceImageUrl(urlData.publicUrl);
      toast.success("تم رفع صورة الفاتورة");
    } catch (err: any) {
      console.error(err);
      toast.error("خطأ في رفع الصورة");
    } finally {
      setUploadingImage(false);
    }
  };

  // Save supplier
  const saveSupplier = async () => {
    if (!newSupplier.company_name.trim() || !dataOwnerId) return;
    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        user_id: dataOwnerId,
        company_name: newSupplier.company_name.trim(),
        contact_person: newSupplier.contact_person || null,
        phone: newSupplier.phone || null,
      })
      .select("id, company_name, contact_person, phone")
      .single();

    if (error) {
      toast.error("خطأ في حفظ المورد");
      return;
    }
    setSuppliers((prev) => [...prev, data]);
    setSelectedSupplier(data);
    setShowAddSupplier(false);
    setNewSupplier({ company_name: "", contact_person: "", phone: "" });
    toast.success("تم إضافة المورد");
  };

  // Submit invoice
  const submitInvoice = async (status: "draft" | "pending") => {
    if (!dataOwnerId || cart.length === 0) {
      toast.error("أضف أصنافاً للفاتورة أولاً");
      return;
    }
    setSubmitting(true);
    try {
      // Create invoice
      const { data: invoice, error: invErr } = await supabase
        .from("purchase_invoices")
        .insert({
          user_id: dataOwnerId,
          supplier_id: selectedSupplier?.id || null,
          supplier_name: selectedSupplier?.company_name || null,
          subtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          payment_method: paymentMethod,
          invoice_image_url: invoiceImageUrl,
          status,
          created_by: userId,
          notes: invoiceNote || null,
        })
        .select()
        .single();

      if (invErr) throw invErr;

      // Create items
      const items = cart.map((item) => ({
        invoice_id: invoice.id,
        product_id: item.product_id,
        product_name: item.name,
        unit: item.unit,
        quantity: item.qty,
        unit_price: item.unit_price,
        tax_pct: item.tax_pct,
        total_amount: item.total,
        previous_price: item.previous_price,
        price_change_pct:
          item.previous_price > 0
            ? Number((((item.unit_price - item.previous_price) / item.previous_price) * 100).toFixed(1))
            : null,
        notes: item.note || null,
      }));

      const { error: itemsErr } = await supabase
        .from("purchase_invoice_items")
        .insert(items);

      if (itemsErr) throw itemsErr;

      // If approved directly (owner), update stock
      if (status === "pending") {
        toast.success(`تم إرسال الفاتورة ${invoice.invoice_number} للاعتماد`);
      } else {
        toast.success(`تم حفظ المسودة ${invoice.invoice_number}`);
      }

      // Reset
      setCart([]);
      setSelectedSupplier(null);
      setInvoiceImageUrl(null);
      setInvoiceNote("");
      setPaymentMethod("cash");
      setShowConfirmSubmit(false);
    } catch (err: any) {
      console.error(err);
      toast.error("خطأ في حفظ الفاتورة: " + (err.message || ""));
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered suppliers
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers;
    return suppliers.filter((s) => multiWordMatchAny(supplierSearch, s.company_name));
  }, [suppliers, supplierSearch]);

  // Cart qty map
  const cartQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    cart.forEach((item) => {
      if (item.product_id) map[item.product_id] = (map[item.product_id] || 0) + item.qty;
    });
    return map;
  }, [cart]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB]" dir="rtl">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#0070F2] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#637381]">جاري تحميل نقطة المشتريات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#F8F9FB] overflow-hidden" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
      {/* Header */}
      <header className="bg-white border-b border-[#E2E8F0] px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-[#0070F2] p-2 rounded-lg">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-[#1A2332]">نقطة المشتريات</h1>
            <p className="text-[11px] text-[#637381]">
              {displayName} · {new Date().toLocaleDateString("ar-PS", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/apps")}
          className="text-[#637381] hover:text-[#1A2332] gap-1.5"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-xs">خروج</span>
        </Button>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Products grid */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search + Categories */}
          <div className="p-3 space-y-2 bg-white border-b border-[#E2E8F0]">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#637381]" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن صنف أو باركود..."
                className="pr-9 h-10 bg-[#F8F9FB] border-[#E2E8F0] text-sm rounded-lg"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
                    selectedCategory === cat
                      ? "bg-[#0070F2] text-white border-[#0070F2]"
                      : "bg-white text-[#637381] border-[#E2E8F0] hover:border-[#0070F2]/40"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Products grid */}
          <ScrollArea className="flex-1 p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5">
              {filteredProducts.map((product) => {
                const inCart = cartQtyMap[product.id] || 0;
                const lowStock = product.quantity <= product.min_quantity && product.min_quantity > 0;
                return (
                  <motion.button
                    key={product.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => addToCart(product)}
                    className="relative bg-white rounded-xl border border-[#E2E8F0] p-3 text-right hover:shadow-md hover:border-[#0070F2]/30 transition-all group"
                  >
                    {/* Cart badge */}
                    {inCart > 0 && (
                      <div className="absolute -top-1.5 -left-1.5 bg-[#0070F2] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center z-10">
                        {inCart}
                      </div>
                    )}

                    {/* Image/icon */}
                    <div className="w-full h-14 bg-[#F8F9FB] rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                      {product.image_url ? (
                        <img src={product.image_url} className="h-full w-full object-contain" alt="" />
                      ) : (
                        <Package className="w-7 h-7 text-[#CBD5E1]" />
                      )}
                    </div>

                    {/* Name */}
                    <p className="text-xs font-semibold text-[#1A2332] truncate">{product.name}</p>
                    <p className="text-[10px] text-[#637381]">{product.unit}</p>

                    {/* Buy price */}
                    <p className="text-xs text-[#0070F2] font-mono font-semibold mt-1">
                      ₪{product.buy_price.toFixed(2)}
                    </p>

                    {/* Stock indicator */}
                    <div className={`text-[10px] mt-1 flex items-center gap-1 ${lowStock ? "text-red-500" : "text-[#637381]"}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${lowStock ? "bg-red-500" : "bg-green-400"}`} />
                      مخزون: {product.quantity} {product.unit}
                    </div>
                  </motion.button>
                );
              })}
            </div>
            {filteredProducts.length === 0 && (
              <div className="text-center py-16 text-[#637381]">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا توجد أصناف</p>
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right: Invoice panel */}
        <div className="w-[380px] lg:w-[420px] bg-white border-r border-[#E2E8F0] flex flex-col shrink-0">
          {/* Invoice header */}
          <div className="px-4 py-3 border-b border-[#E2E8F0]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#1A2332] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#0070F2]" />
                فاتورة شراء جديدة
              </h2>
              <Badge variant="outline" className="text-[10px]">
                {cart.length} أصناف
              </Badge>
            </div>
          </div>

          {/* Cart items */}
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-1.5">
              {cart.length === 0 ? (
                <div className="text-center py-12 text-[#637381]">
                  <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-xs">اضغط على الأصناف لإضافتها</p>
                </div>
              ) : (
                cart.map((item, index) => {
                  const priceChanged = item.unit_price !== item.previous_price && item.previous_price > 0;
                  const priceUp = item.unit_price > item.previous_price;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedCartIndex(selectedCartIndex === index ? null : index)}
                      className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                        selectedCartIndex === index
                          ? "border-[#0070F2] bg-[#0070F2]/5"
                          : "border-[#E2E8F0] hover:border-[#0070F2]/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[#1A2332] truncate">{item.name}</p>
                          <p className="text-[10px] text-[#637381]">{item.unit}</p>
                        </div>
                        <p className="text-xs font-bold text-[#1A2332] font-mono whitespace-nowrap">
                          ₪{item.total.toFixed(2)}
                        </p>
                      </div>

                      {/* Qty + Price controls */}
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); if (item.qty <= 1) removeCartItem(index); else updateCartItem(index, { qty: item.qty - 1 }); }}
                            className="w-6 h-6 rounded bg-[#F8F9FB] border border-[#E2E8F0] flex items-center justify-center hover:bg-red-50 hover:border-red-200"
                          >
                            {item.qty <= 1 ? <Trash2 className="w-3 h-3 text-red-500" /> : <Minus className="w-3 h-3 text-[#637381]" />}
                          </button>
                          <input
                            type="number"
                            value={item.qty}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateCartItem(index, { qty: Math.max(1, Number(e.target.value) || 1) })}
                            className="w-10 h-6 text-center text-xs font-mono border border-[#E2E8F0] rounded bg-white"
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); updateCartItem(index, { qty: item.qty + 1 }); }}
                            className="w-6 h-6 rounded bg-[#F8F9FB] border border-[#E2E8F0] flex items-center justify-center hover:bg-blue-50 hover:border-blue-200"
                          >
                            <Plus className="w-3 h-3 text-[#637381]" />
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-[#637381]">×</span>
                          <input
                            type="number"
                            value={item.unit_price}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateCartItem(index, { unit_price: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-16 h-6 text-center text-xs font-mono border border-[#E2E8F0] rounded bg-white"
                          />
                          <span className="text-[10px] text-[#637381]">₪</span>
                        </div>
                      </div>

                      {/* Price change indicator */}
                      {priceChanged && (
                        <div className={`flex items-center gap-1 mt-1.5 text-[10px] ${priceUp ? "text-red-500" : "text-[#188038]"}`}>
                          {priceUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          <span>
                            {priceUp ? "ارتفاع" : "انخفاض"} السعر{" "}
                            {Math.abs(((item.unit_price - item.previous_price) / item.previous_price) * 100).toFixed(1)}%
                          </span>
                          <span className="text-[#637381]">(سابق: ₪{item.previous_price.toFixed(2)})</span>
                        </div>
                      )}

                      {/* Expanded: note */}
                      {selectedCartIndex === index && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="mt-2">
                          <Input
                            value={item.note}
                            onChange={(e) => updateCartItem(index, { note: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="ملاحظة على الصنف..."
                            className="h-7 text-[11px] bg-[#F8F9FB]"
                          />
                        </motion.div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Bottom: Totals + Actions */}
          <div className="border-t border-[#E2E8F0] p-3 space-y-3 bg-[#FAFBFC]">
            {/* Totals */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-[#637381]">
                <span>المجموع الفرعي</span>
                <span className="font-mono">₪{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[#637381]">
                <span>الضريبة ({taxRate}%)</span>
                <span className="font-mono">₪{taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-[#1A2332] pt-1 border-t border-[#E2E8F0]">
                <span>الإجمالي</span>
                <span className="font-mono text-[#0070F2]">₪{totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Supplier selection */}
            <div className="relative">
              <label className="text-[10px] font-medium text-[#637381] mb-1 block">المورد</label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Input
                    value={selectedSupplier ? selectedSupplier.company_name : supplierSearch}
                    onChange={(e) => {
                      setSupplierSearch(e.target.value);
                      setSelectedSupplier(null);
                      setShowSupplierDropdown(true);
                    }}
                    onFocus={() => setShowSupplierDropdown(true)}
                    placeholder="اختر أو ابحث عن مورد..."
                    className="h-8 text-xs bg-white"
                  />
                  {selectedSupplier && (
                    <button
                      onClick={() => { setSelectedSupplier(null); setSupplierSearch(""); }}
                      className="absolute left-2 top-1/2 -translate-y-1/2"
                    >
                      <X className="w-3 h-3 text-[#637381]" />
                    </button>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowAddSupplier(true)} className="h-8 px-2">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
              {showSupplierDropdown && !selectedSupplier && filteredSuppliers.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-[#E2E8F0] rounded-lg shadow-lg max-h-32 overflow-y-auto">
                  {filteredSuppliers.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSelectedSupplier(s);
                        setShowSupplierDropdown(false);
                        setSupplierSearch("");
                      }}
                      className="w-full px-3 py-2 text-right text-xs hover:bg-[#F8F9FB] transition-colors"
                    >
                      <p className="font-medium text-[#1A2332]">{s.company_name}</p>
                      {s.contact_person && <p className="text-[10px] text-[#637381]">{s.contact_person}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Payment method */}
            <div>
              <label className="text-[10px] font-medium text-[#637381] mb-1 block">طريقة الدفع</label>
              <div className="grid grid-cols-4 gap-1.5">
                {PAYMENT_METHODS.map((pm) => (
                  <button
                    key={pm.id}
                    onClick={() => setPaymentMethod(pm.id)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-[10px] font-medium transition-all ${
                      paymentMethod === pm.id
                        ? "border-[#0070F2] bg-[#0070F2]/5 text-[#0070F2]"
                        : "border-[#E2E8F0] text-[#637381] hover:border-[#0070F2]/30"
                    }`}
                  >
                    <pm.icon className="w-3.5 h-3.5" />
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Invoice image */}
            <div>
              <label className="text-[10px] font-medium text-[#637381] mb-1 block">صورة فاتورة المورد</label>
              {invoiceImageUrl ? (
                <div className="relative rounded-lg overflow-hidden border border-[#E2E8F0]">
                  <img src={invoiceImageUrl} className="w-full h-20 object-cover" alt="" />
                  <div className="absolute inset-0 bg-black/10 flex items-center justify-center gap-2">
                    <button onClick={() => setShowImagePreview(true)} className="bg-white/90 p-1.5 rounded-full">
                      <Eye className="w-3.5 h-3.5 text-[#1A2332]" />
                    </button>
                    <button onClick={() => setInvoiceImageUrl(null)} className="bg-red-500 p-1.5 rounded-full">
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                  <div className="absolute bottom-1 right-1 bg-[#188038] text-white text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <CheckCircle className="w-2.5 h-2.5" />
                    مرفقة
                  </div>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const inp = document.createElement("input");
                      inp.type = "file";
                      inp.accept = "image/*";
                      inp.capture = "environment";
                      inp.onchange = (e: any) => {
                        const f = e.target.files?.[0];
                        if (f) handleImageUpload(f);
                      };
                      inp.click();
                    }}
                    disabled={uploadingImage}
                    className="flex-1 h-8 text-[10px] gap-1"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    التقاط صورة
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="flex-1 h-8 text-[10px] gap-1"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    رفع ملف
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f);
                    }}
                  />
                </div>
              )}
              {uploadingImage && (
                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-[#0070F2]">
                  <div className="w-3 h-3 border border-[#0070F2] border-t-transparent rounded-full animate-spin" />
                  جاري الرفع...
                </div>
              )}
            </div>

            {/* Note */}
            <Textarea
              value={invoiceNote}
              onChange={(e) => setInvoiceNote(e.target.value)}
              placeholder="ملاحظات على الفاتورة..."
              className="h-14 text-xs resize-none bg-white"
            />

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => submitInvoice("draft")}
                disabled={cart.length === 0 || submitting}
                className="flex-1 h-9 text-xs gap-1"
              >
                <StickyNote className="w-3.5 h-3.5" />
                حفظ مسودة
              </Button>
              <Button
                onClick={() => setShowConfirmSubmit(true)}
                disabled={cart.length === 0 || submitting}
                className="flex-1 h-9 text-xs gap-1 bg-[#0070F2] hover:bg-[#005BC4] text-white"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                إرسال للاعتماد
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Add Supplier Dialog */}
      <Dialog open={showAddSupplier} onOpenChange={setShowAddSupplier}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm">إضافة مورد جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[#637381] mb-1 block">اسم الشركة *</label>
              <Input
                value={newSupplier.company_name}
                onChange={(e) => setNewSupplier((p) => ({ ...p, company_name: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[#637381] mb-1 block">جهة الاتصال</label>
              <Input
                value={newSupplier.contact_person}
                onChange={(e) => setNewSupplier((p) => ({ ...p, contact_person: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[#637381] mb-1 block">الهاتف</label>
              <Input
                value={newSupplier.phone}
                onChange={(e) => setNewSupplier((p) => ({ ...p, phone: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddSupplier(false)} className="text-xs">إلغاء</Button>
            <Button onClick={saveSupplier} disabled={!newSupplier.company_name.trim()} className="text-xs bg-[#0070F2]">حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Submit Dialog */}
      <Dialog open={showConfirmSubmit} onOpenChange={setShowConfirmSubmit}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm">تأكيد إرسال الفاتورة</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-xs text-[#637381]">
            <div className="flex justify-between">
              <span>المورد:</span>
              <span className="font-medium text-[#1A2332]">{selectedSupplier?.company_name || "غير محدد"}</span>
            </div>
            <div className="flex justify-between">
              <span>عدد الأصناف:</span>
              <span className="font-medium text-[#1A2332]">{cart.length}</span>
            </div>
            <div className="flex justify-between">
              <span>طريقة الدفع:</span>
              <span className="font-medium text-[#1A2332]">{PAYMENT_METHODS.find((m) => m.id === paymentMethod)?.label}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-[#E2E8F0] pt-2">
              <span className="text-[#1A2332]">الإجمالي:</span>
              <span className="text-[#0070F2] font-mono">₪{totalAmount.toFixed(2)}</span>
            </div>
            {!invoiceImageUrl && (
              <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 p-2 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>لم يتم إرفاق صورة الفاتورة</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmSubmit(false)} className="text-xs">إلغاء</Button>
            <Button
              onClick={() => submitInvoice("pending")}
              disabled={submitting}
              className="text-xs bg-[#0070F2]"
            >
              {submitting ? "جاري الإرسال..." : "تأكيد الإرسال"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={showImagePreview} onOpenChange={setShowImagePreview}>
        <DialogContent className="max-w-lg p-0" dir="rtl">
          {invoiceImageUrl && (
            <img src={invoiceImageUrl} className="w-full rounded-lg" alt="صورة الفاتورة" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchasePointPage;
