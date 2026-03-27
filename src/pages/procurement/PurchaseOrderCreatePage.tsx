import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Minus, Trash2, Send, Save, Package, Search, PlusCircle, Wheat, Egg, Beef, Droplets, Sparkles, CupSoda, PackageIcon, UtensilsCrossed, SprayCan, Shirt, X, StickyNote, LayoutGrid, Grid3X3, Grid2X2, ArrowRight, Settings, UserPlus, MapPin, FolderPlus, Pencil } from "lucide-react";
import { useSuppliers, useItemCategories, useProcurementItems, useProcurementOrders, useBranches } from "@/hooks/useProcurement";
import { useSuppliersCrud, useCategoriesCrud, useItemsCrud } from "@/hooks/useProcurementSettings";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { multiWordMatchAny } from "@/lib/utils";

const iconMap: Record<string, any> = {
  wheat: Wheat, egg: Egg, beef: Beef, droplets: Droplets, sparkles: Sparkles,
  "cup-soda": CupSoda, package: PackageIcon, utensils: UtensilsCrossed,
  "spray-can": SprayCan, shirt: Shirt,
};

const ICON_OPTIONS = ["wheat", "egg", "beef", "droplets", "sparkles", "cup-soda", "package", "utensils", "spray-can", "shirt"];
const COLOR_OPTIONS = ["#4A9EE8", "#FFFFFF", "#E74C3C", "#E67E22", "#9B59B6", "#3498DB", "#27AE60", "#1ABC9C", "#2ECC71", "#95A5A6"];
const DEFAULT_UNITS = ["كيلو", "كرتون", "علبة", "رول", "لتر", "قطعة", "شوال", "رزمة", "عدد", "جالون", "سطل", "عبوة", "ألف حبة", "دفتر", "كرتون 30", "عدد 30", "عدد 100"];
const CUSTOM_UNITS_KEY = "po-custom-units";
function loadCustomUnits(): string[] { try { return JSON.parse(localStorage.getItem(CUSTOM_UNITS_KEY) || "[]"); } catch { return []; } }
function saveCustomUnit(u: string) { const arr = loadCustomUnits(); if (!arr.includes(u)) { arr.push(u); localStorage.setItem(CUSTOM_UNITS_KEY, JSON.stringify(arr)); } }

function highlightSearchWords(text: string, query: string): string {
  if (!query.trim()) return text;
  const words = query.trim().split(/\s+/).filter(Boolean);
  let result = text;
  words.forEach(w => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="bg-amber-200/70 dark:bg-amber-500/30 rounded-sm px-0.5">$1</mark>');
  });
  return result;
}

type CardSize = "small" | "medium" | "large";

interface OrderLine {
  id: string;
  product_id: string | null;
  item_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  notes: string;
  branch_id: string;
}

const STORAGE_KEY = "po-prefs";
function loadPrefs() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; } }
function savePrefs(p: any) { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }

const PurchaseOrderCreatePage = () => {
  const { user } = useAuth();
  const { suppliers, refetch: refetchSuppliers } = useSuppliers();
  const { categories: rawCategories } = useItemCategories();
  const { items: procurementItems } = useProcurementItems();
  const { createOrder, updateStatus } = useProcurementOrders();
  const { branches, refetchBranches } = useBranches();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);

  const suppliersCrud = useSuppliersCrud();
  const categoriesCrud = useCategoriesCrud();
  const itemsCrud = useItemsCrud();

  const categories = categoriesCrud.categories.length > 0 ? categoriesCrud.categories : rawCategories;
  const allItems = itemsCrud.items.length > 0
    ? itemsCrud.items.filter((i: any) => i.is_active !== false)
    : procurementItems;
  const allSuppliers = suppliersCrud.suppliers.length > 0 ? suppliersCrud.suppliers : suppliers;

  const prefs = loadPrefs();
  const [supplierId, setSupplierId] = useState("");
  const [defaultBranchId, setDefaultBranchId] = useState("");
  const UNIT_OPTIONS = useMemo(() => [...new Set([...DEFAULT_UNITS, ...loadCustomUnits()])], []);
  const [unitOptions, setUnitOptions] = useState(UNIT_OPTIONS);
  const [customUnitInput, setCustomUnitInput] = useState("");
  const [branchId, setBranchId] = useState(prefs.branchId || "");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cardSize, setCardSize] = useState<CardSize>((prefs.cardSize as CardSize) || "small");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  // Dialog states
  const [manualOpen, setManualOpen] = useState(false);
  const [manualItem, setManualItem] = useState({ item_name: "", unit: "قطعة", unit_price: 0, quantity: 1, notes: "" });
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "" });
  const [branchOpen, setBranchOpen] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: "", address: "", latitude: 31.9, longitude: 35.2 });
  const [itemOpen, setItemOpen] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", category_id: "", unit: "كيلو", default_price: 0, notes: "" });
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: "", icon: "package", color: "#4A9EE8" });
  const [savingDialog, setSavingDialog] = useState(false);

  // Edit item dialog
  const [editItemOpen, setEditItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  useEffect(() => {
    if (supplierId || defaultBranchId) savePrefs({ supplierId, branchId: defaultBranchId, cardSize });
  }, [supplierId, defaultBranchId, cardSize]);

  useEffect(() => { searchRef.current?.focus(); }, [activeCategory]);

  const filteredItems = useMemo(() => {
    let result = allItems;
    if (activeCategory) result = result.filter((i: any) => i.category_id === activeCategory);
    if (searchQuery) {
      result = result.filter((i: any) => multiWordMatchAny(searchQuery, i.name));
    }
    return result;
  }, [allItems, activeCategory, searchQuery]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allItems.forEach((i: any) => { if (i.category_id) counts[i.category_id] = (counts[i.category_id] || 0) + 1; });
    return counts;
  }, [allItems]);

  const getLineQuantity = (itemId: string) => lines.find(l => l.product_id === itemId)?.quantity || 0;
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const totalAmount = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  const addOrUpdateItem = useCallback((item: any, delta: number) => {
    setLines(prev => {
      const existing = prev.find(l => l.product_id === item.id);
      if (existing) {
        const newQty = existing.quantity + delta;
        if (newQty <= 0) return prev.filter(l => l.id !== existing.id);
        return prev.map(l => l.id === existing.id ? { ...l, quantity: newQty } : l);
      } else if (delta > 0) {
        return [...prev, {
          id: crypto.randomUUID(), product_id: item.id, item_name: item.name,
          unit: item.unit, quantity: delta, unit_price: Number(item.default_price) || 0, notes: "", branch_id: defaultBranchId,
        }];
      }
      return prev;
    });
  }, []);

  const addManual = () => {
    if (!manualItem.item_name.trim()) return;
    setLines(prev => [...prev, {
      id: crypto.randomUUID(), product_id: null, item_name: manualItem.item_name,
      unit: manualItem.unit, quantity: manualItem.quantity, unit_price: manualItem.unit_price, notes: manualItem.notes, branch_id: defaultBranchId,
    }]);
    setManualItem({ item_name: "", unit: "قطعة", unit_price: 0, quantity: 1, notes: "" });
    setManualOpen(false);
  };

  const updateLine = (id: string, field: string, value: any) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };
  const removeLine = (id: string) => setLines(prev => prev.filter(l => l.id !== id));
  const clearAll = () => setLines([]);

  const handleSave = async (send: boolean) => {
    if (!supplierId) { toast({ title: "اختر المورد", variant: "destructive" }); return; }
    if (lines.length === 0) { toast({ title: "أضف صنفاً واحداً على الأقل", variant: "destructive" }); return; }
    const linesWithoutBranch = lines.filter(l => !l.branch_id);
    if (linesWithoutBranch.length > 0) { toast({ title: "حدد الفرع لجميع الأصناف", variant: "destructive" }); return; }
    setSaving(true);
    const firstBranch = lines[0]?.branch_id || defaultBranchId || null;
    const result = await createOrder(
      { supplier_id: supplierId, branch_id: firstBranch, order_date: orderDate, expected_delivery_date: expectedDate, notes },
      lines.map(l => ({ product_id: l.product_id, item_name: l.item_name, unit: l.unit, quantity: l.quantity, unit_price: l.unit_price, branch_id: l.branch_id }))
    );
    if (result && send) await updateStatus((result as any).id, "sent");
    setSaving(false);
    if (result) navigate("/procurement/orders");
  };

  const handleAddSupplier = async () => {
    if (!newSupplier.name.trim()) { toast({ title: "أدخل اسم المورد", variant: "destructive" }); return; }
    setSavingDialog(true);
    // Save to pos_suppliers for procurement FK references
    const ok = await suppliersCrud.create({ name: newSupplier.name, phone: newSupplier.phone || null });
    // Also save to contacts table so it appears in account statements & reports
    // Check if contact already exists to avoid duplicates
    if (ok && user) {
      const { data: existing } = await supabase.from("contacts")
        .select("id")
        .eq("user_id", user.id)
        .eq("contact_name", newSupplier.name.trim())
        .eq("contact_type", "مورد")
        .maybeSingle();
      if (!existing) {
        await supabase.from("contacts").insert({
          user_id: user.id,
          contact_name: newSupplier.name.trim(),
          contact_type: "مورد",
          phone: newSupplier.phone || null,
          is_active: true,
          linked_account_code: "2100",
        } as any);
      }
    }
    setSavingDialog(false);
    if (ok) { setSupplierOpen(false); setNewSupplier({ name: "", phone: "" }); refetchSuppliers(); }
  };

  const handleAddBranch = async () => {
    if (!newBranch.name.trim()) { toast({ title: "أدخل اسم الفرع", variant: "destructive" }); return; }
    setSavingDialog(true);
    const { error } = await supabase.from("branches").insert({
      name: newBranch.name, address: newBranch.address || null,
      latitude: newBranch.latitude, longitude: newBranch.longitude,
      user_id: user?.id, is_active: true, radius_meters: 500,
    } as any);
    setSavingDialog(false);
    if (error) { toast({ title: "❌ خطأ", description: error.message, variant: "destructive" }); return; }
    toast({ title: "✅ تم إضافة الفرع" });
    setBranchOpen(false); setNewBranch({ name: "", address: "", latitude: 31.9, longitude: 35.2 });
    refetchBranches();
  };

  const handleAddItem = async () => {
    if (!newItem.name.trim()) { toast({ title: "أدخل اسم الصنف", variant: "destructive" }); return; }
    if (!newItem.unit.trim()) { toast({ title: "أدخل الوحدة", variant: "destructive" }); return; }
    if (!newItem.category_id) { toast({ title: "اختر التصنيف", variant: "destructive" }); return; }
    // Save custom unit
    if (!DEFAULT_UNITS.includes(newItem.unit)) { saveCustomUnit(newItem.unit); setUnitOptions(prev => [...new Set([...prev, newItem.unit])]); }
    setSavingDialog(true);
    const ok = await itemsCrud.create({
      name: newItem.name, category_id: newItem.category_id,
      unit: newItem.unit, default_price: newItem.default_price || 0,
      notes: newItem.notes || null, is_active: true, sort_order: 0,
    });
    if (ok && user) {
      const catName = categories.find((c: any) => c.id === newItem.category_id)?.name || "بضاعة عامة";
      await supabase.from("products").insert({
        user_id: user.id, name: newItem.name, unit: newItem.unit,
        buy_price: newItem.default_price || 0, sell_price: 0, quantity: 0, min_quantity: 0, category: catName,
        is_pos_available: false,
      } as any);
    }
    setSavingDialog(false);
    if (ok) { setItemOpen(false); setNewItem({ name: "", category_id: "", unit: "كيلو", default_price: 0, notes: "" }); }
  };

  const handleAddCategory = async () => {
    if (!newCategory.name.trim()) { toast({ title: "أدخل اسم التصنيف", variant: "destructive" }); return; }
    setSavingDialog(true);
    const ok = await categoriesCrud.create({ name: newCategory.name, icon: newCategory.icon, color: newCategory.color });
    setSavingDialog(false);
    if (ok) { setCategoryOpen(false); setNewCategory({ name: "", icon: "package", color: "#4A9EE8" }); }
  };

  // Edit existing item
  const openEditItem = (item: any) => {
    setEditItem({ id: item.id, name: item.name, category_id: item.category_id || "", unit: item.unit, default_price: Number(item.default_price) || 0 });
    setEditItemOpen(true);
  };

  const handleEditItem = async () => {
    if (!editItem) return;
    if (!editItem.unit?.trim()) { toast({ title: "أدخل الوحدة", variant: "destructive" }); return; }
    if (!DEFAULT_UNITS.includes(editItem.unit)) { saveCustomUnit(editItem.unit); setUnitOptions(prev => [...new Set([...prev, editItem.unit])]); }
    setSavingDialog(true);
    const ok = await itemsCrud.update(editItem.id, {
      name: editItem.name, category_id: editItem.category_id,
      unit: editItem.unit, default_price: editItem.default_price,
    });
    setSavingDialog(false);
    if (ok) { setEditItemOpen(false); setEditItem(null); }
  };

  const getCategoryColor = (catId: string | null) => categories.find((c: any) => c.id === catId)?.color || "#6b7280";

  const gridCols = cardSize === "small" ? "grid-cols-4 sm:grid-cols-5 xl:grid-cols-6" : cardSize === "medium" ? "grid-cols-3 sm:grid-cols-4 xl:grid-cols-5" : "grid-cols-2 xl:grid-cols-3";

  return (
    <TooltipProvider>
      <div className="h-[100vh] flex flex-col overflow-hidden" dir="rtl">
        {/* TOP BAR */}
        <div className="shrink-0 border-b border-border bg-card px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(-1)}>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <span className="font-bold text-sm text-foreground shrink-0">طلب مشتريات جديد</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => navigate("/procurement/settings")}>
              <Settings className="h-3.5 w-3.5" />
            </Button>

            {/* Supplier */}
            <div className="flex items-center gap-1">
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                <SelectContent>{allSuppliers.filter((s: any) => s.is_active !== false).map((s: any) => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}</SelectContent>
              </Select>
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary" onClick={() => setSupplierOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger><TooltipContent>إضافة مورد جديد</TooltipContent></Tooltip>
            </div>


            {/* Dates with labels */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] text-muted-foreground leading-none">تاريخ الطلبية</span>
              <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="h-7 w-[120px] text-[11px]" />
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] text-muted-foreground leading-none">التسليم المتوقع</span>
              <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className="h-7 w-[120px] text-[11px]" />
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
              <span>أصناف <b className="text-foreground">{lines.length}</b></span>
              <span>كمية <b className="text-foreground">{totalQty}</b></span>
              <span>إجمالي <b className="text-foreground">{totalAmount.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</b></span>
            </div>
            <div className="h-4 w-px bg-border mx-1" />
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleSave(false)} disabled={saving}>
              <Save className="h-3.5 w-3.5 ml-1" />مسودة
            </Button>
            <Button size="sm" className="h-8 text-xs bg-[hsl(43,50%,54%)] hover:bg-[hsl(43,50%,45%)] text-white" onClick={() => handleSave(true)} disabled={saving}>
              <Send className="h-3.5 w-3.5 ml-1" />إرسال
            </Button>
          </div>
        </div>

        {/* MAIN 2-COLUMN: Items + Order Lines */}
        <div className="flex-1 flex min-h-0">
          {/* CENTER: Categories (horizontal) + Items Grid */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Category Tabs - wrap style like POS */}
            <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all ${
                    !activeCategory 
                      ? "bg-foreground text-background shadow-md scale-105" 
                      : "border border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <Package className="h-3.5 w-3.5" />
                  <span>الكل</span>
                  <span className="text-[9px] opacity-80">({allItems.length})</span>
                </button>

                {categories.map((cat: any) => {
                  const isActive = activeCategory === cat.id;
                  const Icon = iconMap[cat.icon || ""] || PackageIcon;
                  const count = categoryCounts[cat.id] || 0;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(isActive ? null : cat.id)}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all ${
                        isActive ? "shadow-md scale-105 text-white" : "hover:shadow-sm hover:scale-[1.02]"
                      }`}
                      style={{
                        backgroundColor: isActive ? (cat.color || "#6b7280") : `${cat.color || "#6b7280"}15`,
                        color: isActive ? "white" : (cat.color || "#6b7280"),
                        border: `1.5px solid ${isActive ? (cat.color || "#6b7280") : (cat.color || "#6b7280") + "50"}`,
                        boxShadow: isActive ? `0 4px 12px ${cat.color || "#6b7280"}40` : undefined,
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{cat.name}</span>
                      <span className={`text-[9px] ${isActive ? "opacity-90" : "opacity-60"}`}>({count})</span>
                    </button>
                  );
                })}

                <button onClick={() => setCategoryOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs text-muted-foreground hover:bg-muted/60 hover:text-primary transition-all border border-dashed border-border/60">
                  <Plus className="h-3 w-3" />
                  <span>تصنيف</span>
                </button>
              </div>
            </div>

            {/* Search + controls */}
            <div className="shrink-0 px-3 py-1.5 border-b border-border flex items-center gap-2 bg-background">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input ref={searchRef} placeholder="ابحث عن صنف..." value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)} className="h-7 pr-8 text-xs" />
              </div>
              <Button variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={() => setItemOpen(true)}>
                <Plus className="h-3 w-3 ml-1" />إضافة صنف
              </Button>
              <div className="flex-1" />
              <div className="flex items-center gap-0.5 border rounded-md p-0.5">
                {(["small", "medium", "large"] as CardSize[]).map(size => {
                  const Icon = size === "small" ? Grid3X3 : size === "medium" ? LayoutGrid : Grid2X2;
                  const label = size === "small" ? "صغير" : size === "medium" ? "متوسط" : "كبير";
                  return (
                    <Tooltip key={size}><TooltipTrigger asChild>
                      <button onClick={() => { setCardSize(size); savePrefs({ ...loadPrefs(), cardSize: size }); }}
                        className={`p-1 rounded ${cardSize === size ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
                  );
                })}
              </div>
            </div>

            {/* Grid — click = add 1, right-click = edit */}
            <div className={`flex-1 overflow-y-auto p-2 grid ${gridCols} gap-1.5 auto-rows-min content-start`}>
              {filteredItems.map((item: any) => {
                const qty = getLineQuantity(item.id);
                const catColor = getCategoryColor(item.category_id);
                const isInOrder = qty > 0;

                return (
                  <div
                    key={item.id}
                    className={`relative rounded-xl border overflow-hidden cursor-pointer transition-all select-none group hover:shadow-md active:scale-[0.97] ${
                      isInOrder 
                        ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20 shadow-sm" 
                        : "border-border/50 bg-card hover:bg-muted/30 shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
                    }`}
                    style={{ 
                      borderBottomWidth: "3px", 
                      borderBottomColor: catColor + "60",
                    }}
                    onClick={() => addOrUpdateItem(item, 1)}
                    onContextMenu={e => { e.preventDefault(); openEditItem(item); }}
                  >
                    {/* Qty badge */}
                    {isInOrder && (
                      <div className="absolute -top-1.5 -left-1.5 z-10 bg-primary text-primary-foreground text-[9px] font-bold rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center shadow-md">{qty}</div>
                    )}
                    {/* Edit icon on hover */}
                    <button
                      className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-primary transition-opacity"
                      onClick={e => { e.stopPropagation(); openEditItem(item); }}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>

                    <div className="px-2.5 py-2">
                      {searchQuery ? (
                        <p className="text-xs font-semibold leading-tight mb-0.5" dangerouslySetInnerHTML={{ __html: highlightSearchWords(item.name, searchQuery) }} />
                      ) : (
                        <p className="text-xs font-semibold leading-tight mb-0.5">{item.name}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">{item.unit}</p>
                      {cardSize === "large" && (
                        <p className={`text-[10px] mt-0.5 ${Number(item.default_price) > 0 ? "text-muted-foreground" : "text-orange-400"}`}>
                          {Number(item.default_price) > 0 ? `${Number(item.default_price).toFixed(2)} ₪` : "بدون سعر"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredItems.length === 0 && (
                <div className="col-span-full py-8 text-center text-muted-foreground">
                  <Package className="h-6 w-6 mx-auto mb-1 opacity-30" />
                  <p className="text-xs">لا توجد أصناف مطابقة</p>
                </div>
              )}
            </div>
          </div>

          {/* LEFT: Order Lines Panel */}
          <div className="w-[290px] shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
            <div className="shrink-0 px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-1.5">
                بنود الطلبية
                {lines.length > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1">{lines.length}</Badge>}
              </span>
              {lines.length > 0 && (
                <button onClick={clearAll} className="text-[10px] text-destructive hover:underline flex items-center gap-0.5">
                  <Trash2 className="h-3 w-3" />مسح الكل
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {lines.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Package className="h-6 w-6 mx-auto mb-1 opacity-20" />
                  <p className="text-xs">اضغط على أي صنف لإضافته</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {lines.map(line => {
                    const lineBranch = branches.find((b: any) => b.id === line.branch_id);
                    return (
                    <div key={line.id} className="px-3 py-2.5">
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-xs font-semibold leading-tight">{line.item_name}</span>
                        <button onClick={() => removeLine(line.id)} className="text-muted-foreground hover:text-destructive p-0.5 shrink-0">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      {/* Branch per line */}
                      <Select value={line.branch_id || ""} onValueChange={v => updateLine(line.id, "branch_id", v)}>
                        <SelectTrigger className={`h-5 text-[10px] mb-1 w-full ${!line.branch_id ? "border-orange-400 bg-orange-500/5" : ""}`}>
                          <MapPin className="h-2.5 w-2.5 shrink-0 ml-0.5" />
                          <SelectValue placeholder="حدد الفرع" />
                        </SelectTrigger>
                        <SelectContent>{branches.map((b: any) => <SelectItem key={b.id} value={b.id} className="text-xs">{b.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground mb-1.5">
                        {line.quantity} {line.unit} × {line.unit_price.toFixed(2)} ₪ = <span className="text-foreground font-medium">{(line.quantity * line.unit_price).toFixed(2)} ₪</span>
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted" onClick={() => { if (line.quantity > 1) updateLine(line.id, "quantity", line.quantity - 1); else removeLine(line.id); }}>
                          <Minus className="h-3 w-3" />
                        </button>
                        <Input type="number" value={line.quantity} min={0.001} step="any"
                          onChange={e => updateLine(line.id, "quantity", Number(e.target.value))}
                          className="h-6 w-12 text-center text-xs px-0" />
                        <button className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted" onClick={() => updateLine(line.id, "quantity", line.quantity + 1)}>
                          <Plus className="h-3 w-3" />
                        </button>
                        <Input type="number" value={line.unit_price} min={0} step="any"
                          onChange={e => updateLine(line.id, "unit_price", Number(e.target.value))}
                          className={`h-6 w-16 text-center text-xs px-0 ${line.unit_price === 0 ? "border-orange-400 bg-orange-500/10" : ""}`}
                          placeholder="سعر" />
                        <button onClick={() => setEditingNoteId(editingNoteId === line.id ? null : line.id)}
                          className={`p-0.5 rounded ${line.notes ? "text-accent" : "text-muted-foreground"} hover:text-foreground`}>
                          <StickyNote className="h-3 w-3" />
                        </button>
                      </div>
                      {editingNoteId === line.id && (
                        <Input value={line.notes} placeholder="ملاحظة..."
                          onChange={e => updateLine(line.id, "notes", e.target.value)}
                          className="h-6 text-[11px] mt-1.5" autoFocus />
                      )}
                    </div>
                  );
                  })}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-border p-3 space-y-2 bg-muted/20">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">المجموع التقديري</span>
                <span className="font-bold">{totalAmount.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</span>
              </div>
              <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => handleSave(false)} disabled={saving}>
                <Save className="h-3.5 w-3.5 ml-1" />حفظ مسودة
              </Button>
              <Button size="sm" className="w-full h-8 text-xs bg-[hsl(43,50%,54%)] hover:bg-[hsl(43,50%,45%)] text-white" onClick={() => handleSave(true)} disabled={saving}>
                <Send className="h-3.5 w-3.5 ml-1" />إرسال الطلبية
              </Button>
            </div>
          </div>
        </div>

        {/* ── DIALOGS ── */}

        {/* Manual Item */}
        <Dialog open={manualOpen} onOpenChange={setManualOpen}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>إضافة صنف يدوي</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">اسم الصنف *</Label><Input value={manualItem.item_name} onChange={e => setManualItem({...manualItem, item_name: e.target.value})} placeholder="اسم الصنف" className="text-sm" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">الوحدة</Label><Input value={manualItem.unit} onChange={e => setManualItem({...manualItem, unit: e.target.value})} className="text-sm" /></div>
                <div><Label className="text-xs">الكمية</Label><Input type="number" value={manualItem.quantity} onChange={e => setManualItem({...manualItem, quantity: Number(e.target.value)})} className="text-sm" /></div>
                <div><Label className="text-xs">السعر</Label><Input type="number" value={manualItem.unit_price || ""} onChange={e => setManualItem({...manualItem, unit_price: Number(e.target.value)})} className="text-sm" /></div>
              </div>
              <div><Label className="text-xs">ملاحظة</Label><Input value={manualItem.notes} onChange={e => setManualItem({...manualItem, notes: e.target.value})} className="text-sm" /></div>
              <Button className="w-full" onClick={addManual}><Plus className="h-4 w-4 ml-1" />إضافة للطلبية</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Supplier */}
        <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>إضافة مورد جديد</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">اسم المورد *</Label><Input value={newSupplier.name} onChange={e => setNewSupplier({...newSupplier, name: e.target.value})} placeholder="اسم المورد" className="text-sm" /></div>
              <div><Label className="text-xs">رقم الهاتف</Label><Input value={newSupplier.phone} onChange={e => setNewSupplier({...newSupplier, phone: e.target.value})} placeholder="059-XXX-XXXX" className="text-sm" /></div>
              <Button className="w-full" onClick={handleAddSupplier} disabled={savingDialog}>{savingDialog ? "جاري الحفظ..." : "حفظ المورد"}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Branch */}
        <Dialog open={branchOpen} onOpenChange={setBranchOpen}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>إضافة فرع جديد</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">اسم الفرع *</Label><Input value={newBranch.name} onChange={e => setNewBranch({...newBranch, name: e.target.value})} placeholder="اسم الفرع" className="text-sm" /></div>
              <div><Label className="text-xs">العنوان</Label><Input value={newBranch.address} onChange={e => setNewBranch({...newBranch, address: e.target.value})} placeholder="العنوان (اختياري)" className="text-sm" /></div>
              <Button className="w-full" onClick={handleAddBranch} disabled={savingDialog}>{savingDialog ? "جاري الحفظ..." : "حفظ الفرع"}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Item to Catalog */}
        <Dialog open={itemOpen} onOpenChange={setItemOpen}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>إضافة صنف جديد للكتالوج</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">اسم الصنف *</Label><Input value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="اسم الصنف" className="text-sm" /></div>
              <div>
                <Label className="text-xs">التصنيف *</Label>
                <Select value={newItem.category_id} onValueChange={v => setNewItem({...newItem, category_id: v})}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                  <SelectContent>{categories.map((c: any) => (
                    <SelectItem key={c.id} value={c.id} className="text-sm">
                      <span className="inline-block h-2 w-2 rounded-full ml-1.5" style={{ backgroundColor: c.color || "#6b7280" }} />{c.name}
                    </SelectItem>
                  ))}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">الوحدة *</Label>
                  <Select value={unitOptions.includes(newItem.unit) ? newItem.unit : "__custom"} onValueChange={v => { if (v === "__custom") { setCustomUnitInput(""); setNewItem({...newItem, unit: ""}); } else { setNewItem({...newItem, unit: v}); } }}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {unitOptions.map(u => <SelectItem key={u} value={u} className="text-sm">{u}</SelectItem>)}
                      <SelectItem value="__custom" className="text-sm text-primary">+ وحدة مخصصة</SelectItem>
                    </SelectContent>
                  </Select>
                  {(!unitOptions.includes(newItem.unit)) && (
                    <Input value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})} placeholder="اكتب اسم الوحدة..." className="text-sm mt-1" autoFocus />
                  )}
                </div>
                <div><Label className="text-xs">السعر الافتراضي</Label><Input type="number" value={newItem.default_price || ""} onChange={e => setNewItem({...newItem, default_price: Number(e.target.value)})} placeholder="0.00" className="text-sm" /></div>
              </div>
              <Button className="w-full" onClick={handleAddItem} disabled={savingDialog}>{savingDialog ? "جاري الحفظ..." : "حفظ الصنف في الكتالوج"}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Category */}
        <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>إضافة تصنيف جديد</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">اسم التصنيف *</Label><Input value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} placeholder="اسم التصنيف" className="text-sm" /></div>
              <div>
                <Label className="text-xs">الأيقونة</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {ICON_OPTIONS.map(iconKey => {
                    const Ic = iconMap[iconKey] || PackageIcon;
                    return (
                      <button key={iconKey} onClick={() => setNewCategory({...newCategory, icon: iconKey})}
                        className={`h-8 w-8 rounded-md border flex items-center justify-center transition-colors ${
                          newCategory.icon === iconKey ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                        }`}><Ic className="h-4 w-4" /></button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label className="text-xs">اللون</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {COLOR_OPTIONS.map(color => (
                    <button key={color} onClick={() => setNewCategory({...newCategory, color})}
                      className={`h-7 w-7 rounded-full border-2 transition-transform ${
                        newCategory.color === color ? "border-foreground scale-110" : "border-transparent"
                      }`} style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>
              <Button className="w-full" onClick={handleAddCategory} disabled={savingDialog}>{savingDialog ? "جاري الحفظ..." : "حفظ التصنيف"}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Existing Item */}
        <Dialog open={editItemOpen} onOpenChange={setEditItemOpen}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>تعديل الصنف</DialogTitle></DialogHeader>
            {editItem && (
              <div className="space-y-3">
                <div><Label className="text-xs">اسم الصنف *</Label><Input value={editItem.name} onChange={e => setEditItem({...editItem, name: e.target.value})} className="text-sm" /></div>
                <div>
                  <Label className="text-xs">التصنيف</Label>
                  <Select value={editItem.category_id} onValueChange={v => setEditItem({...editItem, category_id: v})}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                    <SelectContent>{categories.map((c: any) => (
                      <SelectItem key={c.id} value={c.id} className="text-sm">
                        <span className="inline-block h-2 w-2 rounded-full ml-1.5" style={{ backgroundColor: c.color || "#6b7280" }} />{c.name}
                      </SelectItem>
                    ))}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">الوحدة</Label>
                    <Select value={unitOptions.includes(editItem.unit) ? editItem.unit : "__custom"} onValueChange={v => { if (v === "__custom") { setEditItem({...editItem, unit: ""}); } else { setEditItem({...editItem, unit: v}); } }}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {unitOptions.map(u => <SelectItem key={u} value={u} className="text-sm">{u}</SelectItem>)}
                        <SelectItem value="__custom" className="text-sm text-primary">+ وحدة مخصصة</SelectItem>
                      </SelectContent>
                    </Select>
                    {(!unitOptions.includes(editItem.unit)) && (
                      <Input value={editItem.unit} onChange={e => setEditItem({...editItem, unit: e.target.value})} placeholder="اكتب اسم الوحدة..." className="text-sm mt-1" autoFocus />
                    )}
                  </div>
                  <div><Label className="text-xs">السعر الافتراضي</Label><Input type="number" value={editItem.default_price || ""} onChange={e => setEditItem({...editItem, default_price: Number(e.target.value)})} className="text-sm" /></div>
                </div>
                <Button className="w-full" onClick={handleEditItem} disabled={savingDialog}>{savingDialog ? "جاري الحفظ..." : "حفظ التعديلات"}</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default PurchaseOrderCreatePage;
