import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Minus, Trash2, Send, Save, Package, Search, PlusCircle, Wheat, Egg, Beef, Droplets, Sparkles, CupSoda, PackageIcon, UtensilsCrossed, SprayCan, Shirt, X, StickyNote, LayoutGrid, Grid3X3, Grid2X2, ArrowRight, Settings } from "lucide-react";
import { useSuppliers, useItemCategories, useProcurementItems, useProcurementOrders, useBranches } from "@/hooks/useProcurement";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const iconMap: Record<string, any> = {
  wheat: Wheat, egg: Egg, beef: Beef, droplets: Droplets, sparkles: Sparkles,
  "cup-soda": CupSoda, package: PackageIcon, utensils: UtensilsCrossed,
  "spray-can": SprayCan, shirt: Shirt,
};

type CardSize = "small" | "medium" | "large";

interface OrderLine {
  id: string;
  product_id: string | null;
  item_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  notes: string;
}

const STORAGE_KEY = "po-prefs";

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function savePrefs(prefs: any) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

const PurchaseOrderCreatePage = () => {
  const { suppliers } = useSuppliers();
  const { categories } = useItemCategories();
  const { items: procurementItems } = useProcurementItems();
  const { createOrder, updateStatus } = useProcurementOrders();
  const branches = useBranches();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);

  const prefs = loadPrefs();
  const [supplierId, setSupplierId] = useState(prefs.supplierId || "");
  const [branchId, setBranchId] = useState(prefs.branchId || "");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cardSize, setCardSize] = useState<CardSize>((prefs.cardSize as CardSize) || "small");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualItem, setManualItem] = useState({ item_name: "", unit: "قطعة", unit_price: 0, quantity: 1, notes: "" });
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  // Persist preferences
  useEffect(() => {
    if (supplierId || branchId) savePrefs({ supplierId, branchId, cardSize });
  }, [supplierId, branchId, cardSize]);

  // Auto-focus search on category change
  useEffect(() => {
    searchRef.current?.focus();
  }, [activeCategory]);

  const filteredItems = useMemo(() => {
    let result = procurementItems;
    if (activeCategory) result = result.filter(i => i.category_id === activeCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i => i.name.toLowerCase().includes(q));
    }
    return result;
  }, [procurementItems, activeCategory, searchQuery]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    procurementItems.forEach(i => {
      if (i.category_id) counts[i.category_id] = (counts[i.category_id] || 0) + 1;
    });
    return counts;
  }, [procurementItems]);

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
          unit: item.unit, quantity: delta, unit_price: Number(item.default_price) || 0, notes: "",
        }];
      }
      return prev;
    });
  }, []);

  const addManual = () => {
    if (!manualItem.item_name.trim()) return;
    setLines(prev => [...prev, {
      id: crypto.randomUUID(), product_id: null, item_name: manualItem.item_name,
      unit: manualItem.unit, quantity: manualItem.quantity, unit_price: manualItem.unit_price, notes: manualItem.notes,
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
    if (!branchId) { toast({ title: "اختر الفرع", variant: "destructive" }); return; }
    if (lines.length === 0) { toast({ title: "أضف صنفاً واحداً على الأقل", variant: "destructive" }); return; }
    setSaving(true);
    const result = await createOrder(
      { supplier_id: supplierId, branch_id: branchId, order_date: orderDate, expected_delivery_date: expectedDate, notes },
      lines.map(l => ({ product_id: l.product_id, item_name: l.item_name, unit: l.unit, quantity: l.quantity, unit_price: l.unit_price }))
    );
    if (result && send) await updateStatus((result as any).id, "sent");
    setSaving(false);
    if (result) navigate("/procurement/orders");
  };

  const getCategoryColor = (catId: string | null) => categories.find(c => c.id === catId)?.color || "#6b7280";

  const gridCols = cardSize === "small" ? "grid-cols-3 sm:grid-cols-4 xl:grid-cols-5" : cardSize === "medium" ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4" : "grid-cols-2 xl:grid-cols-3";

  return (
    <TooltipProvider>
      <div className="h-[100vh] flex flex-col overflow-hidden" dir="rtl">
        {/* TOP BAR */}
        <div className="shrink-0 border-b border-border bg-card px-3 py-2 flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(-1)}>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <span className="font-bold text-sm text-foreground shrink-0">طلب مشتريات</span>
          <div className="h-4 w-px bg-border mx-1" />

          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="المورد" /></SelectTrigger>
            <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="الفرع" /></SelectTrigger>
            <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id} className="text-xs">{b.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="h-8 w-[130px] text-xs" />
          <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className="h-8 w-[130px] text-xs" placeholder="تسليم متوقع" />

          <div className="flex-1" />

          <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
            <span>أصناف: <b className="text-foreground">{lines.length}</b></span>
            <span>كمية: <b className="text-foreground">{totalQty}</b></span>
            <span>إجمالي: <b className="text-foreground">{totalAmount.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</b></span>
          </div>
          <div className="h-4 w-px bg-border mx-1" />
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleSave(false)} disabled={saving}>
            <Save className="h-3.5 w-3.5 ml-1" />مسودة
          </Button>
          <Button size="sm" className="h-8 text-xs bg-[hsl(43,50%,54%)] hover:bg-[hsl(43,50%,45%)] text-white" onClick={() => handleSave(true)} disabled={saving}>
            <Send className="h-3.5 w-3.5 ml-1" />إرسال
          </Button>
        </div>

        {/* MAIN 3-COLUMN AREA */}
        <div className="flex-1 flex min-h-0">
          {/* RIGHT: Categories Sidebar */}
          <div className="w-[160px] shrink-0 border-l border-border bg-muted/30 overflow-y-auto">
            <button
              onClick={() => setActiveCategory(null)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-[13px] transition-colors ${
                !activeCategory ? "bg-accent/10 text-accent font-bold border-l-2 border-accent" : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <Package className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">الكل</span>
              <Badge variant="secondary" className="mr-auto text-[10px] h-5 px-1.5">{procurementItems.length}</Badge>
            </button>
            {categories.map(cat => {
              const isActive = activeCategory === cat.id;
              const Icon = iconMap[cat.icon || ""] || PackageIcon;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(isActive ? null : cat.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-[13px] transition-colors ${
                    isActive ? "font-bold border-l-2" : "text-muted-foreground hover:bg-muted/50 border-l-2 border-transparent"
                  }`}
                  style={isActive ? { borderLeftColor: cat.color || "#6b7280", color: cat.color || undefined, backgroundColor: `${cat.color}15` } : {}}
                >
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color || "#6b7280" }} />
                  <span className="truncate">{cat.name.replace("مواد خام - ", "")}</span>
                  <span className="mr-auto text-[10px] opacity-60">{categoryCounts[cat.id] || 0}</span>
                </button>
              );
            })}
          </div>

          {/* CENTER: Items Grid */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Search + Size controls */}
            <div className="shrink-0 px-3 py-2 border-b border-border flex items-center gap-2 bg-background">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  placeholder="ابحث عن صنف..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="h-8 pr-8 text-xs"
                />
              </div>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setManualOpen(true)}>
                <PlusCircle className="h-3.5 w-3.5 ml-1" />صنف يدوي
              </Button>
              <div className="flex-1" />
              <div className="flex items-center gap-0.5 border rounded-md p-0.5">
                <Tooltip><TooltipTrigger asChild>
                  <button onClick={() => { setCardSize("small"); savePrefs({ ...loadPrefs(), cardSize: "small" }); }}
                    className={`p-1 rounded ${cardSize === "small" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    <Grid3X3 className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger><TooltipContent>صغير</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <button onClick={() => { setCardSize("medium"); savePrefs({ ...loadPrefs(), cardSize: "medium" }); }}
                    className={`p-1 rounded ${cardSize === "medium" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger><TooltipContent>متوسط</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <button onClick={() => { setCardSize("large"); savePrefs({ ...loadPrefs(), cardSize: "large" }); }}
                    className={`p-1 rounded ${cardSize === "large" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    <Grid2X2 className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger><TooltipContent>كبير</TooltipContent></Tooltip>
              </div>
            </div>

            {/* Grid */}
            <div className={`flex-1 overflow-y-auto p-2 grid ${gridCols} gap-1.5 auto-rows-min content-start`}>
              {filteredItems.map(item => {
                const qty = getLineQuantity(item.id);
                const catColor = getCategoryColor(item.category_id);
                const isInOrder = qty > 0;

                if (cardSize === "small") {
                  return (
                    <Tooltip key={item.id}>
                      <TooltipTrigger asChild>
                        <div
                          className={`relative rounded-md border px-2 py-1.5 cursor-pointer transition-all select-none ${
                            isInOrder ? "border-green-500/50 bg-green-500/5" : "border-border/50 hover:bg-muted/30"
                          }`}
                          style={{ borderRightWidth: "3px", borderRightColor: catColor }}
                          onClick={() => addOrUpdateItem(item, 1)}
                        >
                          {isInOrder && (
                            <div className="absolute -top-1.5 -left-1.5 bg-green-600 text-white text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center">{qty}</div>
                          )}
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[12px] font-medium truncate">{item.name}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">{item.unit}</span>
                          </div>
                          <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                            <button className="h-5 w-5 rounded border border-border flex items-center justify-center hover:bg-muted" onClick={() => addOrUpdateItem(item, -1)} disabled={!isInOrder}>
                              <Minus className="h-2.5 w-2.5" />
                            </button>
                            <Input
                              type="number" value={qty || ""} placeholder="0"
                              onChange={e => {
                                const v = Number(e.target.value);
                                const existing = lines.find(l => l.product_id === item.id);
                                if (v <= 0) { if (existing) removeLine(existing.id); }
                                else if (existing) updateLine(existing.id, "quantity", v);
                                else addOrUpdateItem(item, v);
                              }}
                              className="h-5 w-10 text-center text-[11px] px-0 border-border"
                            />
                            <button className="h-5 w-5 rounded border border-border flex items-center justify-center hover:bg-muted" onClick={() => addOrUpdateItem(item, 1)}>
                              <Plus className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <p>{item.name}</p>
                        <p className="text-muted-foreground">{item.unit} • {Number(item.default_price) > 0 ? `${Number(item.default_price).toFixed(2)} ₪` : "بدون سعر"}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                // Medium & Large cards
                return (
                  <div
                    key={item.id}
                    className={`relative rounded-lg border p-2.5 cursor-pointer transition-all select-none ${
                      isInOrder ? "border-green-500/50 bg-green-500/5" : "border-border/50 hover:bg-muted/20"
                    }`}
                    style={{ borderRightWidth: "3px", borderRightColor: catColor }}
                    onClick={() => addOrUpdateItem(item, 1)}
                  >
                    {isInOrder && (
                      <div className="absolute -top-1.5 -left-1.5 bg-green-600 text-white text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center">{qty}</div>
                    )}
                    <p className="text-[12px] font-medium truncate mb-0.5">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground mb-1">الوحدة: {item.unit}</p>
                    {cardSize === "large" && (
                      <p className={`text-[10px] mb-1 ${Number(item.default_price) > 0 ? "text-muted-foreground" : "text-orange-400"}`}>
                        السعر: {Number(item.default_price) > 0 ? `${Number(item.default_price).toFixed(2)} ₪` : "غير محدد"}
                      </p>
                    )}
                    <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                      <button className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted" onClick={() => addOrUpdateItem(item, -1)} disabled={!isInOrder}>
                        <Minus className="h-3 w-3" />
                      </button>
                      <Input type="number" value={qty || ""} placeholder="0"
                        onChange={e => {
                          const v = Number(e.target.value);
                          const existing = lines.find(l => l.product_id === item.id);
                          if (v <= 0) { if (existing) removeLine(existing.id); }
                          else if (existing) updateLine(existing.id, "quantity", v);
                          else addOrUpdateItem(item, v);
                        }}
                        className="h-6 w-12 text-center text-xs px-0"
                      />
                      <button className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted" onClick={() => addOrUpdateItem(item, 1)}>
                        <Plus className="h-3 w-3" />
                      </button>
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
          <div className="w-[280px] shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
            {/* Header */}
            <div className="shrink-0 px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-[13px] font-bold flex items-center gap-1.5">
                بنود الطلبية
                {lines.length > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1">{lines.length}</Badge>}
              </span>
              {lines.length > 0 && (
                <button onClick={clearAll} className="text-[10px] text-destructive hover:underline flex items-center gap-0.5">
                  <Trash2 className="h-3 w-3" />مسح
                </button>
              )}
            </div>

            {/* Lines */}
            <div className="flex-1 overflow-y-auto">
              {lines.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Package className="h-6 w-6 mx-auto mb-1 opacity-20" />
                  <p className="text-[11px]">اختر أصناف من القائمة</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {lines.map(line => (
                    <div key={line.id} className="px-3 py-2">
                      {/* Row 1: Name + Delete */}
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-[12px] font-medium leading-tight">{line.item_name}</span>
                        <button onClick={() => removeLine(line.id)} className="text-muted-foreground hover:text-destructive p-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      {/* Row 2: qty × price = total */}
                      <p className="text-[10px] text-muted-foreground mb-1.5">
                        {line.quantity} {line.unit} × {line.unit_price.toFixed(2)} ₪ = <span className="text-foreground font-medium">{(line.quantity * line.unit_price).toFixed(2)} ₪</span>
                      </p>
                      {/* Row 3: qty stepper + notes */}
                      <div className="flex items-center gap-1.5">
                        <button className="h-5 w-5 rounded border border-border flex items-center justify-center hover:bg-muted text-xs" onClick={() => { if (line.quantity > 1) updateLine(line.id, "quantity", line.quantity - 1); else removeLine(line.id); }}>
                          <Minus className="h-2.5 w-2.5" />
                        </button>
                        <Input type="number" value={line.quantity} min={0.001} step="any"
                          onChange={e => updateLine(line.id, "quantity", Number(e.target.value))}
                          className="h-5 w-10 text-center text-[11px] px-0"
                        />
                        <button className="h-5 w-5 rounded border border-border flex items-center justify-center hover:bg-muted text-xs" onClick={() => updateLine(line.id, "quantity", line.quantity + 1)}>
                          <Plus className="h-2.5 w-2.5" />
                        </button>
                        <Input type="number" value={line.unit_price} min={0} step="any"
                          onChange={e => updateLine(line.id, "unit_price", Number(e.target.value))}
                          className={`h-5 w-14 text-center text-[11px] px-0 ${line.unit_price === 0 ? "border-orange-400 bg-orange-500/10" : ""}`}
                          placeholder="سعر"
                        />
                        <button
                          onClick={() => setEditingNoteId(editingNoteId === line.id ? null : line.id)}
                          className={`p-0.5 rounded ${line.notes ? "text-accent" : "text-muted-foreground"} hover:text-foreground`}
                        >
                          <StickyNote className="h-3 w-3" />
                        </button>
                      </div>
                      {/* Inline note */}
                      {editingNoteId === line.id && (
                        <Input
                          value={line.notes} placeholder="ملاحظة..."
                          onChange={e => updateLine(line.id, "notes", e.target.value)}
                          className="h-6 text-[10px] mt-1.5"
                          autoFocus
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
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

        {/* Manual Item Dialog */}
        <Dialog open={manualOpen} onOpenChange={setManualOpen}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>إضافة صنف يدوي</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>اسم الصنف *</Label><Input value={manualItem.item_name} onChange={e => setManualItem({...manualItem, item_name: e.target.value})} placeholder="اسم الصنف" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>الوحدة</Label><Input value={manualItem.unit} onChange={e => setManualItem({...manualItem, unit: e.target.value})} /></div>
                <div><Label>الكمية</Label><Input type="number" value={manualItem.quantity} onChange={e => setManualItem({...manualItem, quantity: Number(e.target.value)})} /></div>
                <div><Label>السعر</Label><Input type="number" value={manualItem.unit_price || ""} onChange={e => setManualItem({...manualItem, unit_price: Number(e.target.value)})} /></div>
              </div>
              <div><Label>ملاحظة</Label><Input value={manualItem.notes} onChange={e => setManualItem({...manualItem, notes: e.target.value})} /></div>
              <Button className="w-full" onClick={addManual}><Plus className="h-4 w-4 ml-1" />إضافة</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default PurchaseOrderCreatePage;
