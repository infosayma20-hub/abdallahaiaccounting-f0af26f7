import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Minus, Trash2, Send, Save, Package, Search, ChevronDown, PlusCircle, Wheat, Egg, Beef, Droplets, Sparkles, CupSoda, PackageIcon, UtensilsCrossed, SprayCan, Shirt } from "lucide-react";
import { useSuppliers, useItemCategories, useProcurementItems, useProcurementOrders, useBranches } from "@/hooks/useProcurement";
import { useNavigate } from "react-router-dom";
import BackButton from "@/components/BackButton";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const iconMap: Record<string, any> = {
  wheat: Wheat, egg: Egg, beef: Beef, droplets: Droplets, sparkles: Sparkles,
  "cup-soda": CupSoda, package: PackageIcon, utensils: UtensilsCrossed,
  "spray-can": SprayCan, shirt: Shirt,
};

interface OrderLine {
  id: string;
  product_id: string | null;
  item_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  notes: string;
}

const PurchaseOrderCreatePage = () => {
  const { suppliers } = useSuppliers();
  const { categories } = useItemCategories();
  const { items: procurementItems } = useProcurementItems();
  const { createOrder, updateStatus } = useProcurementOrders();
  const branches = useBranches();
  const navigate = useNavigate();

  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [linesOpen, setLinesOpen] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualItem, setManualItem] = useState({ item_name: "", unit: "قطعة", unit_price: 0, quantity: 1, notes: "" });

  // Filter items by category and search
  const filteredItems = useMemo(() => {
    let result = procurementItems;
    if (activeCategory) {
      result = result.filter(i => i.category_id === activeCategory);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i => i.name.toLowerCase().includes(q));
    }
    return result;
  }, [procurementItems, activeCategory, searchQuery]);

  // Count items per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    procurementItems.forEach(i => {
      if (i.category_id) counts[i.category_id] = (counts[i.category_id] || 0) + 1;
    });
    return counts;
  }, [procurementItems]);

  // Get quantity of item in order lines
  const getLineQuantity = (itemId: string) => {
    const line = lines.find(l => l.product_id === itemId);
    return line?.quantity || 0;
  };

  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const totalAmount = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  const addOrUpdateItem = (item: any, delta: number) => {
    const existing = lines.find(l => l.product_id === item.id);
    if (existing) {
      const newQty = existing.quantity + delta;
      if (newQty <= 0) {
        setLines(lines.filter(l => l.id !== existing.id));
      } else {
        setLines(lines.map(l => l.id === existing.id ? { ...l, quantity: newQty } : l));
      }
    } else if (delta > 0) {
      setLines([...lines, {
        id: crypto.randomUUID(),
        product_id: item.id,
        item_name: item.name,
        unit: item.unit,
        quantity: delta,
        unit_price: Number(item.default_price) || 0,
        notes: "",
      }]);
    }
  };

  const addManual = () => {
    if (!manualItem.item_name.trim()) return;
    setLines([...lines, {
      id: crypto.randomUUID(),
      product_id: null,
      item_name: manualItem.item_name,
      unit: manualItem.unit,
      quantity: manualItem.quantity,
      unit_price: manualItem.unit_price,
      notes: manualItem.notes,
    }]);
    setManualItem({ item_name: "", unit: "قطعة", unit_price: 0, quantity: 1, notes: "" });
    setManualOpen(false);
  };

  const updateLine = (id: string, field: string, value: any) => {
    setLines(lines.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const removeLine = (id: string) => {
    setLines(lines.filter(l => l.id !== id));
  };

  const handleSave = async (send: boolean) => {
    if (!supplierId) { toast({ title: "اختر المورد", variant: "destructive" }); return; }
    if (!branchId) { toast({ title: "اختر الفرع", variant: "destructive" }); return; }
    if (lines.length === 0) { toast({ title: "أضف صنفاً واحداً على الأقل", variant: "destructive" }); return; }
    setSaving(true);
    const result = await createOrder(
      { supplier_id: supplierId, branch_id: branchId, order_date: orderDate, expected_delivery_date: expectedDate, notes },
      lines.map(l => ({ product_id: l.product_id, item_name: l.item_name, unit: l.unit, quantity: l.quantity, unit_price: l.unit_price }))
    );
    if (result && send) {
      await updateStatus((result as any).id, "sent");
    }
    setSaving(false);
    if (result) navigate("/procurement/orders");
  };

  const getCategoryColor = (catId: string | null) => {
    const cat = categories.find(c => c.id === catId);
    return cat?.color || "#6b7280";
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <BackButton />
        <h1 className="text-xl font-bold text-foreground">طلب مشتريات جديد</h1>
      </div>

      <div className="flex flex-col lg:flex-row-reverse gap-4">
        {/* RIGHT PANEL - Order Info */}
        <div className="lg:w-[35%] space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">بيانات الطلبية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>المورد *</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name} {s.phone ? `- ${s.phone}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الفرع *</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>تاريخ الطلبية</Label>
                  <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
                </div>
                <div>
                  <Label>التسليم المتوقع</Label>
                  <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>ملاحظات</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
              </div>
            </CardContent>
          </Card>

          {/* Summary Card */}
          <Card className="border-accent/30">
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">عدد الأصناف</span>
                <span className="font-bold">{lines.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">إجمالي الكمية</span>
                <span className="font-bold">{totalQty}</span>
              </div>
              <div className="flex justify-between text-base border-t pt-2">
                <span className="font-medium">القيمة التقديرية</span>
                <span className="font-bold text-lg">{totalAmount.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</span>
              </div>
            </CardContent>
          </Card>

          {/* Order Lines Collapsible */}
          {lines.length > 0 && (
            <Collapsible open={linesOpen} onOpenChange={setLinesOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        بنود الطلبية
                        <Badge variant="secondary" className="text-xs">{lines.length}</Badge>
                      </CardTitle>
                      <ChevronDown className={`h-4 w-4 transition-transform ${linesOpen ? "rotate-180" : ""}`} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>الصنف</TableHead>
                          <TableHead>الوحدة</TableHead>
                          <TableHead className="w-20">الكمية</TableHead>
                          <TableHead className="w-24">السعر</TableHead>
                          <TableHead>الإجمالي</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map(line => (
                          <TableRow key={line.id}>
                            <TableCell className="font-medium text-xs">{line.item_name}</TableCell>
                            <TableCell className="text-xs">{line.unit}</TableCell>
                            <TableCell>
                              <Input
                                type="number" min={0.001} step="any"
                                value={line.quantity}
                                onChange={e => updateLine(line.id, "quantity", Number(e.target.value))}
                                className="h-7 w-16 text-center text-xs"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number" min={0} step="any"
                                value={line.unit_price}
                                onChange={e => updateLine(line.id, "unit_price", Number(e.target.value))}
                                className={`h-7 w-20 text-center text-xs ${line.unit_price === 0 ? "border-orange-400 bg-orange-500/10" : ""}`}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{(line.quantity * line.unit_price).toLocaleString("en", { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeLine(line.id)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <Button className="w-full" variant="accent" onClick={() => handleSave(true)} disabled={saving}>
              <Send className="h-4 w-4 ml-1" />
              إرسال الطلبية
            </Button>
            <Button className="w-full" variant="outline" onClick={() => handleSave(false)} disabled={saving}>
              <Save className="h-4 w-4 ml-1" />
              حفظ كمسودة
            </Button>
          </div>
        </div>

        {/* LEFT PANEL - Category Browser */}
        <div className="lg:w-[65%] space-y-3">
          {/* Search + Manual Add */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث عن صنف..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pr-9"
              />
            </div>
            <Dialog open={manualOpen} onOpenChange={setManualOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0">
                  <PlusCircle className="h-4 w-4 ml-1" />
                  صنف يدوي
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md" dir="rtl">
                <DialogHeader>
                  <DialogTitle>إضافة صنف يدوي</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>اسم الصنف *</Label>
                    <Input value={manualItem.item_name} onChange={e => setManualItem({...manualItem, item_name: e.target.value})} placeholder="اسم الصنف" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label>الوحدة</Label>
                      <Input value={manualItem.unit} onChange={e => setManualItem({...manualItem, unit: e.target.value})} />
                    </div>
                    <div>
                      <Label>الكمية</Label>
                      <Input type="number" value={manualItem.quantity} onChange={e => setManualItem({...manualItem, quantity: Number(e.target.value)})} />
                    </div>
                    <div>
                      <Label>السعر</Label>
                      <Input type="number" value={manualItem.unit_price || ""} onChange={e => setManualItem({...manualItem, unit_price: Number(e.target.value)})} />
                    </div>
                  </div>
                  <div>
                    <Label>ملاحظة</Label>
                    <Input value={manualItem.notes} onChange={e => setManualItem({...manualItem, notes: e.target.value})} />
                  </div>
                  <Button className="w-full" onClick={addManual}>
                    <Plus className="h-4 w-4 ml-1" />
                    إضافة
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Category Tabs */}
          <ScrollArea className="w-full" dir="rtl">
            <div className="flex gap-1.5 pb-2">
              <button
                onClick={() => setActiveCategory(null)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  !activeCategory
                    ? "bg-accent text-accent-foreground border-accent"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                الكل
                <span className="mr-1 opacity-70">{procurementItems.length}</span>
              </button>
              {categories.map(cat => {
                const Icon = iconMap[cat.icon || ""] || PackageIcon;
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(isActive ? null : cat.id)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${
                      isActive
                        ? "text-white border-transparent"
                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                    }`}
                    style={isActive ? { backgroundColor: cat.color || "#6b7280" } : {}}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {cat.name.split(" - ")[0].split(" ")[0]}
                    <span className="opacity-70">{categoryCounts[cat.id] || 0}</span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          {/* Items Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 max-h-[calc(100vh-280px)] overflow-y-auto">
            {filteredItems.map(item => {
              const qty = getLineQuantity(item.id);
              const catColor = getCategoryColor(item.category_id);
              return (
                <div
                  key={item.id}
                  className={`relative rounded-lg border p-3 transition-all ${
                    qty > 0
                      ? "border-green-500/50 bg-green-500/5 ring-1 ring-green-500/20"
                      : "border-border/50 hover:border-muted-foreground/30 hover:bg-muted/20"
                  }`}
                  style={{ borderRightWidth: "3px", borderRightColor: catColor }}
                >
                  {/* Quantity badge */}
                  {qty > 0 && (
                    <div className="absolute -top-2 -left-2 bg-green-600 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
                      {qty}
                    </div>
                  )}

                  <p className="text-sm font-medium truncate mb-1">{item.name}</p>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    الوحدة: {item.unit}
                  </p>
                  {Number(item.default_price) > 0 ? (
                    <p className="text-[11px] text-muted-foreground mb-2">
                      السعر: {Number(item.default_price).toLocaleString("en", { minimumFractionDigits: 2 })} ₪
                    </p>
                  ) : (
                    <p className="text-[11px] text-orange-400 mb-2">السعر: غير محدد</p>
                  )}

                  {/* Quantity controls */}
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => addOrUpdateItem(item, -1)}
                      disabled={qty === 0}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      value={qty || ""}
                      onChange={e => {
                        const val = Number(e.target.value);
                        if (val <= 0) {
                          setLines(lines.filter(l => l.product_id !== item.id));
                        } else {
                          const existing = lines.find(l => l.product_id === item.id);
                          if (existing) {
                            setLines(lines.map(l => l.product_id === item.id ? { ...l, quantity: val } : l));
                          } else {
                            addOrUpdateItem(item, val);
                          }
                        }
                      }}
                      placeholder="0"
                      className="h-7 w-12 text-center text-xs px-1"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => addOrUpdateItem(item, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {filteredItems.length === 0 && (
              <div className="col-span-full py-12 text-center text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>لا توجد أصناف مطابقة</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderCreatePage;
