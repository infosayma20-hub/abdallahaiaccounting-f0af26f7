import { useState, useEffect } from "react";
import { ArrowRight, Loader2, Plus, Package, Search, AlertTriangle, TrendingUp, TrendingDown, Pencil, Trash2, History, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Product {
  id: string;
  name: string;
  category: string;
  sku: string | null;
  buy_price: number;
  sell_price: number;
  quantity: number;
  min_quantity: number;
  unit: string;
  notes: string | null;
  created_at: string;
}

interface StockMovement {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reference_note: string | null;
  created_at: string;
}

const DEFAULT_CATEGORIES = ["بضاعة عامة", "مواد خام", "مواد تعبئة", "قطع غيار", "أخرى"];
const DEFAULT_UNITS = ["قطعة", "كيلو", "لتر", "متر", "علبة", "كرتونة", "طن"];

const InventoryPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [showMovementsDialog, setShowMovementsDialog] = useState(false);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [customUnitInput, setCustomUnitInput] = useState("");
  const [showCustomUnit, setShowCustomUnit] = useState(false);

  // Derive unique categories and units from existing products + defaults
  const CATEGORIES = [...new Set([...DEFAULT_CATEGORIES, ...products.map(p => p.category)])].filter(Boolean);
  const UNITS = [...new Set([...DEFAULT_UNITS, ...products.map(p => p.unit)])].filter(Boolean);

  const [form, setForm] = useState({
    name: "",
    category: "بضاعة عامة",
    sku: "",
    buy_price: "",
    sell_price: "",
    quantity: "",
    min_quantity: "",
    unit: "قطعة",
    notes: "",
  });

  const fetchProducts = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      toast({ title: "خطأ في تحميل المنتجات", variant: "destructive" });
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, [user]);

  const resetForm = () => {
    setForm({ name: "", category: "بضاعة عامة", sku: "", buy_price: "", sell_price: "", quantity: "", min_quantity: "", unit: "قطعة", notes: "" });
    setEditMode(false);
    setSelectedProduct(null);
  };

  const openEdit = (product: Product) => {
    setForm({
      name: product.name,
      category: product.category,
      sku: product.sku || "",
      buy_price: String(product.buy_price),
      sell_price: String(product.sell_price),
      quantity: String(product.quantity),
      min_quantity: String(product.min_quantity),
      unit: product.unit,
      notes: product.notes || "",
    });
    setSelectedProduct(product);
    setEditMode(true);
    setShowProductDialog(true);
  };

  const handleSave = async () => {
    if (!user || !form.name.trim()) {
      toast({ title: "يرجى إدخال اسم المنتج", variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      category: form.category as any,
      sku: form.sku.trim() || null,
      buy_price: parseFloat(form.buy_price) || 0,
      sell_price: parseFloat(form.sell_price) || 0,
      quantity: parseFloat(form.quantity) || 0,
      min_quantity: parseFloat(form.min_quantity) || 0,
      unit: form.unit,
      notes: form.notes.trim() || null,
    };

    if (editMode && selectedProduct) {
      const { error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", selectedProduct.id);

      if (error) {
        toast({ title: "خطأ في تحديث المنتج", variant: "destructive" });
      } else {
        toast({ title: "تم تحديث المنتج ✅" });
      }
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) {
        console.error("Insert product error:", error);
        toast({ title: "خطأ في إضافة المنتج", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "تم إضافة المنتج ✅" });
      }
    }

    setSaving(false);
    setShowProductDialog(false);
    resetForm();
    fetchProducts();
  };

  const handleDelete = async (product: Product) => {
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) {
      toast({ title: "خطأ في حذف المنتج", variant: "destructive" });
    } else {
      toast({ title: "تم حذف المنتج 🗑️" });
      fetchProducts();
    }
  };

  const openMovements = async (product: Product) => {
    setSelectedProduct(product);
    setShowMovementsDialog(true);
    setMovementsLoading(true);

    const { data, error } = await supabase
      .from("stock_movements")
      .select("*")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false });

    setMovements(data || []);
    setMovementsLoading(false);
  };

  const filtered = products.filter(p => {
    if (filterCategory !== "all" && p.category !== filterCategory) return false;
    if (searchQuery && !p.name.includes(searchQuery) && !(p.sku || "").includes(searchQuery)) return false;
    return true;
  });

  const totalValue = products.reduce((s, p) => s + p.quantity * p.buy_price, 0);
  const lowStockCount = products.filter(p => p.quantity <= p.min_quantity && p.min_quantity > 0).length;

  const movementTypeLabel: Record<string, { label: string; color: string; icon: typeof TrendingUp }> = {
    "وارد": { label: "وارد", color: "text-primary", icon: TrendingUp },
    "صادر": { label: "صادر", color: "text-destructive", icon: TrendingDown },
    "تعديل يدوي": { label: "تعديل", color: "text-warning", icon: Pencil },
  };

  return (
    <div className="px-4 pt-6 pb-24 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="w-9 h-9 rounded-full bg-muted/60 backdrop-blur-sm flex items-center justify-center hover:bg-muted transition-all duration-200 shadow-sm">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">المخزون</h1>
            <p className="text-xs text-muted-foreground">{products.length} منتج</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => { resetForm(); setShowProductDialog(true); }}>
          <Plus className="h-4 w-4" /> إضافة منتج
        </Button>
      </div>

      {/* Stats */}
      {products.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 p-4 border border-primary/10">
            <Package className="h-5 w-5 text-primary mb-1" />
            <p className="text-lg font-bold text-primary">₪{totalValue.toLocaleString()}</p>
            <p className="text-[10px] text-primary/70 font-medium">قيمة المخزون (بسعر التكلفة)</p>
          </div>
          <div className={`rounded-2xl p-4 border ${lowStockCount > 0 ? "bg-gradient-to-br from-destructive/5 to-destructive/10 border-destructive/10" : "bg-gradient-to-br from-muted/30 to-muted/50 border-border/30"}`}>
            <AlertTriangle className={`h-5 w-5 mb-1 ${lowStockCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            <p className={`text-lg font-bold ${lowStockCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>{lowStockCount}</p>
            <p className={`text-[10px] font-medium ${lowStockCount > 0 ? "text-destructive/70" : "text-muted-foreground"}`}>منتجات منخفضة المخزون</p>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      {products.length > 0 && (
        <>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ابحث باسم المنتج أو الكود..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pr-10 rounded-xl border-border/50 bg-muted/30"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setFilterCategory("all")} className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${filterCategory === "all" ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
              الكل
            </button>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setFilterCategory(cat)} className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${filterCategory === cat ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                {cat}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}

      {/* Empty State */}
      {!loading && products.length === 0 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Package className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">لا توجد منتجات بعد</h3>
          <p className="text-xs text-muted-foreground mb-4">أضف أول منتج لبدء تتبع المخزون</p>
          <Button className="rounded-xl gap-2 shadow-md shadow-primary/20" onClick={() => { resetForm(); setShowProductDialog(true); }}>
            <Plus className="h-4 w-4" /> إضافة منتج
          </Button>
        </div>
      )}

      {/* Product List */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(product => {
            const isLow = product.quantity <= product.min_quantity && product.min_quantity > 0;
            return (
              <Card key={product.id} className="border-0 shadow-sm rounded-2xl hover:shadow-md transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isLow ? "bg-destructive/10" : "bg-primary/10"}`}>
                        <Package className={`h-5 w-5 ${isLow ? "text-destructive" : "text-primary"}`} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">{product.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {product.category} {product.sku ? `• ${product.sku}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className={`text-sm font-bold ${isLow ? "text-destructive" : "text-foreground"}`}>
                        {product.quantity} {product.unit}
                      </p>
                      {isLow && (
                        <Badge className="text-[9px] px-2 py-0 border-0 bg-destructive/10 text-destructive">
                          <AlertTriangle className="h-3 w-3 ml-0.5" /> منخفض
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex gap-4 text-[10px] text-muted-foreground">
                      <span>شراء: ₪{Number(product.buy_price).toLocaleString()}</span>
                      <span>بيع: ₪{Number(product.sell_price).toLocaleString()}</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openMovements(product)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="حركات المخزون">
                        <History className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => openEdit(product)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="تعديل">
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDelete(product)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="حذف">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Product Dialog */}
      <Dialog open={showProductDialog} onOpenChange={(o) => { setShowProductDialog(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-background" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editMode ? "تعديل المنتج" : "إضافة منتج جديد"}</DialogTitle>
            <DialogDescription>{editMode ? "عدّل بيانات المنتج" : "أدخل بيانات المنتج الجديد"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">اسم المنتج *</label>
              <Input placeholder="مثال: قميص أبيض" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="rounded-xl" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">التصنيف</label>
                {showCustomCategory ? (
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="اسم التصنيف الجديد"
                      value={customCategoryInput}
                      onChange={e => setCustomCategoryInput(e.target.value)}
                      className="rounded-xl flex-1"
                      autoFocus
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-xl px-3"
                      disabled={!customCategoryInput.trim()}
                      onClick={() => {
                        setForm(p => ({ ...p, category: customCategoryInput.trim() }));
                        setShowCustomCategory(false);
                        setCustomCategoryInput("");
                      }}
                    >
                      ✓
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="rounded-xl px-2"
                      onClick={() => { setShowCustomCategory(false); setCustomCategoryInput(""); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Select value={form.category} onValueChange={v => {
                    if (v === "__custom__") { setShowCustomCategory(true); return; }
                    setForm(p => ({ ...p, category: v }));
                  }}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      <SelectItem value="__custom__" className="text-primary font-semibold border-t border-border mt-1 pt-1">
                        <span className="flex items-center gap-1"><Plus className="h-3 w-3" /> إضافة تصنيف جديد</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الوحدة</label>
                {showCustomUnit ? (
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="اسم الوحدة الجديدة"
                      value={customUnitInput}
                      onChange={e => setCustomUnitInput(e.target.value)}
                      className="rounded-xl flex-1"
                      autoFocus
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-xl px-3"
                      disabled={!customUnitInput.trim()}
                      onClick={() => {
                        setForm(p => ({ ...p, unit: customUnitInput.trim() }));
                        setShowCustomUnit(false);
                        setCustomUnitInput("");
                      }}
                    >
                      ✓
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="rounded-xl px-2"
                      onClick={() => { setShowCustomUnit(false); setCustomUnitInput(""); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Select value={form.unit} onValueChange={v => {
                    if (v === "__custom__") { setShowCustomUnit(true); return; }
                    setForm(p => ({ ...p, unit: v }));
                  }}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      <SelectItem value="__custom__" className="text-primary font-semibold border-t border-border mt-1 pt-1">
                        <span className="flex items-center gap-1"><Plus className="h-3 w-3" /> إضافة وحدة جديدة</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">كود المنتج (SKU)</label>
              <Input placeholder="اختياري" value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))} className="rounded-xl" dir="ltr" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">سعر الشراء (₪)</label>
                <Input type="number" placeholder="0" value={form.buy_price} onChange={e => setForm(p => ({ ...p, buy_price: e.target.value }))} className="rounded-xl" dir="ltr" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">سعر البيع (₪)</label>
                <Input type="number" placeholder="0" value={form.sell_price} onChange={e => setForm(p => ({ ...p, sell_price: e.target.value }))} className="rounded-xl" dir="ltr" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الكمية الحالية</label>
                <Input type="number" placeholder="0" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} className="rounded-xl" dir="ltr" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الحد الأدنى (للتنبيه)</label>
                <Input type="number" placeholder="0" value={form.min_quantity} onChange={e => setForm(p => ({ ...p, min_quantity: e.target.value }))} className="rounded-xl" dir="ltr" />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
              <Input placeholder="اختياري" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="rounded-xl" />
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl gap-2 shadow-md shadow-primary/20">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editMode ? "حفظ التعديلات" : "إضافة المنتج"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock Movements Dialog */}
      <Dialog open={showMovementsDialog} onOpenChange={setShowMovementsDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-background" dir="rtl">
          <DialogHeader>
            <DialogTitle>حركات المخزون</DialogTitle>
            <DialogDescription>{selectedProduct?.name}</DialogDescription>
          </DialogHeader>
          {movementsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : movements.length === 0 ? (
            <div className="text-center py-8">
              <History className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">لا توجد حركات مسجلة بعد</p>
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              {movements.map(m => {
                const config = movementTypeLabel[m.movement_type] || { label: m.movement_type, color: "text-muted-foreground", icon: History };
                const Icon = config.icon;
                return (
                  <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Icon className={`h-4 w-4 ${config.color}`} />
                      <div>
                        <p className={`text-sm font-semibold ${config.color}`}>{config.label}: {m.quantity}</p>
                        {m.reference_note && <p className="text-[10px] text-muted-foreground">{m.reference_note}</p>}
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleDateString("ar")}</p>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryPage;
