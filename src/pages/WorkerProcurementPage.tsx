import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Package, Plus, Minus, Trash2, LogOut, Camera, Upload,
  X, Banknote, Clock, Building2, CreditCard, FileText, CheckCircle,
  ShoppingCart, HardHat, ChevronDown, StickyNote, Image as ImageIcon,
  Send, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { multiWordMatchAny } from "@/lib/utils";

// Types
interface CartItem {
  id: string;
  product_id: string | null;
  name: string;
  unit: string;
  qty: number;
  unit_price: number;
  total: number;
  note: string;
  category: string;
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
  image_url: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
  budget: number;
  total_expenses: number;
  tasks: string[] | null;
}

const PAYMENT_METHODS = [
  { id: "cash", label: "نقدي", icon: Banknote },
  { id: "credit", label: "آجل", icon: Clock },
  { id: "transfer", label: "تحويل", icon: Building2 },
  { id: "check", label: "شيك", icon: CreditCard },
];

const WorkerProcurementPage = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  // Search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("الكل");

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Invoice
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [invoiceImage, setInvoiceImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Add item modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingProduct, setAddingProduct] = useState<Product | null>(null);
  const [addQty, setAddQty] = useState(1);
  const [addPrice, setAddPrice] = useState(0);
  const [addNote, setAddNote] = useState("");

  // Profile info
  const [workerName, setWorkerName] = useState("");

  // Resolve owner_id for data access
  const [ownerId, setOwnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Get profile to find owner (invited_by or self)
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, invited_by")
        .eq("user_id", user.id)
        .single();

      const resolvedOwner = profile?.invited_by || user.id;
      setOwnerId(resolvedOwner);
      setWorkerName(profile?.display_name || user.email || "");

      // Get projects assigned to this worker
      const { data: assignments } = await supabase
        .from("project_workers")
        .select("project_id")
        .eq("user_id", dataOwnerId!);

      const projectIds = (assignments || []).map(a => a.project_id);

      if (projectIds.length > 0) {
        const { data: projectsData } = await supabase
          .from("contractor_projects")
          .select("id, name, budget, total_expenses, tasks")
          .in("id", projectIds);
        setProjects(projectsData || []);
        if (projectsData && projectsData.length === 1) {
          setSelectedProjectId(projectsData[0].id);
        }
      }

      // Load products from owner's inventory
      const prodQuery = supabase
        .from("products")
        .select("id, name, sell_price, buy_price, quantity, category, unit, barcode, image_url") as any;
      const { data: prods } = await prodQuery
        .eq("user_id", resolvedOwner)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      setProducts(prods || []);
      setLoading(false);
    };
    load();
  }, [user]);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // Categories
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return ["الكل", ...Array.from(cats)];
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    let filtered = products;
    if (selectedCategory !== "الكل") {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      filtered = filtered.filter(p => multiWordMatchAny(searchQuery, p.name, p.barcode));
    }
    return filtered;
  }, [products, selectedCategory, searchQuery]);

  // Cart totals
  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const taxAmount = subtotal * 0.16;
  const grandTotal = subtotal + taxAmount;

  // Add product to cart
  const openAddModal = (product: Product) => {
    setAddingProduct(product);
    setAddQty(1);
    setAddPrice(product.buy_price || product.sell_price || 0);
    setAddNote("");
    setShowAddModal(true);
  };

  const confirmAddToCart = () => {
    if (!addingProduct) return;
    const existing = cart.findIndex(c => c.product_id === addingProduct.id);
    if (existing >= 0) {
      const updated = [...cart];
      updated[existing].qty += addQty;
      updated[existing].unit_price = addPrice;
      updated[existing].total = updated[existing].qty * addPrice;
      setCart(updated);
    } else {
      setCart([...cart, {
        id: crypto.randomUUID(),
        product_id: addingProduct.id,
        name: addingProduct.name,
        unit: addingProduct.unit || "قطعة",
        qty: addQty,
        unit_price: addPrice,
        total: addQty * addPrice,
        note: addNote,
        category: addingProduct.category || "",
      }]);
    }
    setShowAddModal(false);
    toast.success(`تم إضافة ${addingProduct.name}`);
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(c => c.id !== id));
  };

  const updateCartQty = (id: string, delta: number) => {
    setCart(cart.map(c => {
      if (c.id !== id) return c;
      const newQty = Math.max(1, c.qty + delta);
      return { ...c, qty: newQty, total: newQty * c.unit_price };
    }));
  };

  // Upload invoice image
  const handleUploadImage = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `procurement/${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("purchase-invoices")
      .upload(path, file);
    if (error) {
      toast.error("فشل رفع الصورة");
    } else {
      const { data: urlData } = supabase.storage.from("purchase-invoices").getPublicUrl(path);
      setInvoiceImage(urlData.publicUrl);
      toast.success("تم رفع الصورة");
    }
    setUploading(false);
  };

  // Submit request
  const handleSubmit = async (isDraft = false) => {
    if (!user || !ownerId || !selectedProjectId) {
      toast.error("يرجى اختيار المشروع");
      return;
    }
    if (cart.length === 0) {
      toast.error("السلة فارغة");
      return;
    }
    setSubmitting(true);
    try {
      // Create procurement request
      const { data: request, error: reqError } = await supabase
        .from("procurement_requests")
        .insert({
          project_id: selectedProjectId,
          worker_id: user.id,
          worker_name: workerName,
          status: isDraft ? "draft" : "pending",
          payment_method: paymentMethod,
          supplier_name: supplierName || null,
          supplier_invoice_url: invoiceImage,
          notes: invoiceNotes || null,
          subtotal,
          tax_amount: taxAmount,
          total: grandTotal,
          owner_id: ownerId,
        })
        .select("id")
        .single();

      if (reqError) throw reqError;

      // Insert items
      const items = cart.map(c => ({
        request_id: request.id,
        product_id: c.product_id,
        item_name: c.name,
        category: c.category || null,
        unit: c.unit,
        quantity: c.qty,
        unit_price: c.unit_price,
        notes: c.note || null,
      }));

      const { error: itemsError } = await supabase
        .from("procurement_request_items" as any)
        .insert(items);

      if (itemsError) throw itemsError;

      toast.success(isDraft ? "تم حفظ المسودة" : "تم إرسال الطلب للاعتماد ✅");
      // Reset
      setCart([]);
      setSupplierName("");
      setInvoiceNotes("");
      setInvoiceImage(null);
    } catch (err: any) {
      toast.error("حدث خطأ: " + err.message);
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-muted/30 overflow-hidden" dir="rtl">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <HardHat className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-foreground text-sm">نقطة المشتريات — المشاريع</h1>
            <p className="text-xs text-muted-foreground">
              {workerName} · {format(new Date(), "d MMMM yyyy")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {projects.length > 1 && (
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-[200px] text-xs">
                <SelectValue placeholder="اختر المشروع" />
              </SelectTrigger>
              <SelectContent>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {projects.length === 1 && (
            <Badge variant="outline" className="text-xs">
              <Building2 className="w-3 h-3 ml-1" />
              {projects[0].name}
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => { signOut(); navigate("/auth"); }}>
            <LogOut className="w-4 h-4 ml-1" /> خروج
          </Button>
        </div>
      </header>

      {/* Project budget bar */}
      {selectedProject && (
        <div className="bg-card border-b border-border px-4 py-2 flex items-center gap-4 text-xs shrink-0">
          <span className="text-muted-foreground">الميزانية:</span>
          <span className="font-bold text-foreground tabular-nums">₪{selectedProject.budget.toLocaleString()}</span>
          <span className="text-muted-foreground">المصروف:</span>
          <span className="font-bold text-destructive tabular-nums">₪{(selectedProject.total_expenses || 0).toLocaleString()}</span>
          <span className="text-muted-foreground">المتبقي:</span>
          <span className="font-bold text-primary tabular-nums">
            ₪{(selectedProject.budget - (selectedProject.total_expenses || 0)).toLocaleString()}
          </span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min(100, ((selectedProject.total_expenses || 0) / Math.max(1, selectedProject.budget)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left — Cart */}
        <div className="w-[380px] lg:w-[420px] border-l border-border bg-card flex flex-col shrink-0">
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <span className="font-bold text-sm text-foreground">فاتورة مشتريات جديدة</span>
            </div>
            {selectedProject && (
              <p className="text-xs text-muted-foreground mt-1">المشروع: {selectedProject.name}</p>
            )}
            <Badge variant="secondary" className="mt-1 text-xs">{cart.length} أصناف</Badge>
          </div>

          <ScrollArea className="flex-1">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <ShoppingCart className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">اضغط على الأصناف لإضافتها</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {cart.map((item) => (
                  <div key={item.id} className="bg-muted/50 rounded-lg p-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs text-foreground truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.qty} × ₪{item.unit_price.toFixed(2)} = <span className="font-bold text-primary">₪{item.total.toFixed(2)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateCartQty(item.id, -1)}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="text-xs font-bold w-6 text-center tabular-nums">{item.qty}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateCartQty(item.id, 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeFromCart(item.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Totals & details */}
          <div className="border-t border-border p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">المجموع الفرعي</span>
              <span className="tabular-nums">₪{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">الضريبة (16%)</span>
              <span className="tabular-nums">₪{taxAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-sm">
              <span>الإجمالي</span>
              <span className="text-primary tabular-nums">₪{grandTotal.toFixed(2)}</span>
            </div>

            {/* Supplier */}
            <div>
              <label className="text-xs text-muted-foreground">المورد</label>
              <Input
                placeholder="اسم المورد..."
                value={supplierName}
                onChange={e => setSupplierName(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            </div>

            {/* Payment method */}
            <div>
              <label className="text-xs text-muted-foreground">طريقة الدفع</label>
              <div className="grid grid-cols-4 gap-1 mt-1">
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setPaymentMethod(m.id)}
                    className={`flex flex-col items-center gap-0.5 p-2 rounded-lg border text-xs transition-colors ${
                      paymentMethod === m.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <m.icon className="w-4 h-4" />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Invoice image */}
            <div>
              <label className="text-xs text-muted-foreground">صورة فاتورة المورد</label>
              <div className="flex gap-1 mt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs h-8"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.capture = "environment";
                    input.onchange = (e: any) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadImage(file);
                    };
                    input.click();
                  }}
                  disabled={uploading}
                >
                  <Camera className="w-3 h-3 ml-1" /> التقاط صورة
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs h-8"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="w-3 h-3 ml-1" /> رفع ملف
                </Button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadImage(f); }} />
              {invoiceImage && (
                <div className="mt-1 relative">
                  <img src={invoiceImage} alt="فاتورة" className="w-full h-16 object-cover rounded-lg" />
                  <button className="absolute top-0.5 left-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5"
                    onClick={() => setInvoiceImage(null)}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Notes */}
            <Textarea
              placeholder="ملاحظات على الفاتورة..."
              value={invoiceNotes}
              onChange={e => setInvoiceNotes(e.target.value)}
              className="text-xs h-14 resize-none"
            />

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                className="flex-1 h-10"
                onClick={() => handleSubmit(false)}
                disabled={submitting || cart.length === 0 || !selectedProjectId}
              >
                <Send className="w-4 h-4 ml-1" />
                {submitting ? "جاري الإرسال..." : "إرسال للاعتماد"}
              </Button>
              <Button
                variant="outline"
                className="h-10"
                onClick={() => handleSubmit(true)}
                disabled={submitting || cart.length === 0 || !selectedProjectId}
              >
                <Save className="w-4 h-4 ml-1" /> مسودة
              </Button>
            </div>
          </div>
        </div>

        {/* Right — Product catalog */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b border-border bg-card shrink-0">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="ابحث عن صنف أو باركود..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pr-9 h-10"
              />
            </div>
          </div>

          {/* Categories */}
          <div className="px-3 py-2 border-b border-border bg-card shrink-0">
            <ScrollArea className="w-full" dir="rtl">
              <div className="flex gap-1.5 pb-1">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      selectedCategory === cat
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Product grid */}
          <ScrollArea className="flex-1 p-3">
            {!selectedProjectId ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <HardHat className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">يرجى اختيار المشروع أولاً</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <Package className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">لا توجد أصناف</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {filteredProducts.map(product => {
                  const inCart = cart.find(c => c.product_id === product.id);
                  return (
                    <motion.button
                      key={product.id}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => openAddModal(product)}
                      className={`relative bg-card border rounded-xl p-3 text-center hover:shadow-md transition-all ${
                        inCart ? "border-primary ring-1 ring-primary/30" : "border-border"
                      }`}
                    >
                      {inCart && (
                        <Badge className="absolute -top-1.5 -left-1.5 h-5 min-w-5 text-[10px] bg-primary">
                          {inCart.qty}
                        </Badge>
                      )}
                      <div className="w-12 h-12 mx-auto mb-2 bg-muted rounded-xl flex items-center justify-center">
                        {product.image_url ? (
                          <img src={product.image_url} className="w-full h-full object-cover rounded-xl" alt="" />
                        ) : (
                          <Package className="w-5 h-5 text-muted-foreground/50" />
                        )}
                      </div>
                      <p className="font-medium text-xs text-foreground line-clamp-1">{product.name}</p>
                      <p className="text-[10px] text-muted-foreground">{product.unit || "قطعة"}</p>
                      <p className="text-xs font-bold text-primary mt-0.5 tabular-nums">
                        ₪{(product.buy_price || product.sell_price || 0).toFixed(2)}
                      </p>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${product.quantity > 0 ? "bg-green-500" : "bg-destructive"}`} />
                        <span className="text-[10px] text-muted-foreground">مخزون: {product.quantity} {product.unit || "قطعة"}</span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Add item modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">إضافة صنف: {addingProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">الكمية المطلوبة</label>
              <div className="flex items-center gap-2 mt-1">
                <Button size="icon" variant="outline" className="h-8 w-8"
                  onClick={() => setAddQty(Math.max(1, addQty - 1))}>
                  <Minus className="w-3 h-3" />
                </Button>
                <Input
                  type="number"
                  value={addQty}
                  onChange={e => setAddQty(Math.max(1, Number(e.target.value)))}
                  className="h-8 text-center w-20 tabular-nums"
                />
                <Button size="icon" variant="outline" className="h-8 w-8"
                  onClick={() => setAddQty(addQty + 1)}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">سعر الوحدة (₪)</label>
              <Input
                type="number"
                value={addPrice}
                onChange={e => setAddPrice(Number(e.target.value))}
                className="h-8 mt-1 tabular-nums"
              />
            </div>
            {addingProduct && (
              <p className="text-xs text-muted-foreground">
                المخزون الحالي: {addingProduct.quantity} {addingProduct.unit || "قطعة"}
              </p>
            )}
            <div>
              <label className="text-xs text-muted-foreground">ملاحظة خاصة</label>
              <Input
                placeholder="اختياري..."
                value={addNote}
                onChange={e => setAddNote(e.target.value)}
                className="h-8 mt-1"
              />
            </div>
            <div className="flex justify-between text-sm font-bold">
              <span>الإجمالي:</span>
              <span className="text-primary tabular-nums">₪{(addQty * addPrice).toFixed(2)}</span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>إلغاء</Button>
            <Button onClick={confirmAddToCart}>
              <CheckCircle className="w-4 h-4 ml-1" /> إضافة للفاتورة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkerProcurementPage;
