import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Send, Save, Package, Search } from "lucide-react";
import { useSuppliers, useProducts, useProcurementOrders, useBranches } from "@/hooks/useProcurement";
import { useNavigate } from "react-router-dom";
import BackButton from "@/components/BackButton";
import { toast } from "@/hooks/use-toast";

interface OrderLine {
  id: string;
  product_id: string | null;
  item_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
}

const PurchaseOrderCreatePage = () => {
  const { suppliers } = useSuppliers();
  const { products } = useProducts();
  const { createOrder, updateStatus } = useProcurementOrders();
  const branches = useBranches();
  const navigate = useNavigate();

  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [manualItem, setManualItem] = useState({ item_name: "", unit: "قطعة", unit_price: 0 });
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products;
    const q = productSearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q) || p.barcode?.includes(q));
  }, [products, productSearch]);

  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const totalAmount = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  const addFromCatalog = (product: any) => {
    const existing = lines.find(l => l.product_id === product.id);
    if (existing) {
      setLines(lines.map(l => l.id === existing.id ? { ...l, quantity: l.quantity + 1 } : l));
      return;
    }
    setLines([...lines, {
      id: crypto.randomUUID(),
      product_id: product.id,
      item_name: product.name,
      unit: product.unit,
      quantity: 1,
      unit_price: Number(product.buy_price),
    }]);
  };

  const addManual = () => {
    if (!manualItem.item_name.trim()) return;
    setLines([...lines, { id: crypto.randomUUID(), product_id: null, ...manualItem, quantity: 1 }]);
    setManualItem({ item_name: "", unit: "قطعة", unit_price: 0 });
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

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <BackButton />
        <h1 className="text-xl font-bold text-foreground">طلب مشتريات جديد</h1>
      </div>

      <div className="flex flex-col lg:flex-row-reverse gap-4">
        {/* RIGHT PANEL - Order Info */}
        <div className="lg:w-[40%] space-y-4">
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
                  <Label>تاريخ التسليم المتوقع</Label>
                  <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>ملاحظات</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
              </div>
            </CardContent>
          </Card>

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

        {/* LEFT PANEL - Item Entry */}
        <div className="lg:w-[60%] space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">بنود الطلبية</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="catalog" dir="rtl">
                <TabsList className="mb-3">
                  <TabsTrigger value="catalog">من كتالوج المنتجات</TabsTrigger>
                  <TabsTrigger value="manual">صنف يدوي</TabsTrigger>
                </TabsList>
                <TabsContent value="catalog">
                  <div className="relative mb-3">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث في المنتجات..."
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      className="pr-9"
                    />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[250px] overflow-y-auto">
                    {filteredProducts.slice(0, 50).map(product => (
                      <button
                        key={product.id}
                        onClick={() => addFromCatalog(product)}
                        className="p-3 rounded-lg border border-border/50 hover:border-accent/50 hover:bg-accent/5 text-right transition-all"
                      >
                        <p className="text-sm font-medium truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.unit} • {Number(product.buy_price).toLocaleString("en", { minimumFractionDigits: 2 })} ₪</p>
                      </button>
                    ))}
                    {filteredProducts.length === 0 && (
                      <p className="col-span-full text-center text-sm text-muted-foreground py-6">لا توجد منتجات</p>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="manual">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-xs">اسم الصنف</Label>
                      <Input value={manualItem.item_name} onChange={e => setManualItem({...manualItem, item_name: e.target.value})} placeholder="اسم الصنف" />
                    </div>
                    <div className="w-24">
                      <Label className="text-xs">الوحدة</Label>
                      <Input value={manualItem.unit} onChange={e => setManualItem({...manualItem, unit: e.target.value})} />
                    </div>
                    <div className="w-28">
                      <Label className="text-xs">السعر</Label>
                      <Input type="number" value={manualItem.unit_price || ""} onChange={e => setManualItem({...manualItem, unit_price: Number(e.target.value)})} />
                    </div>
                    <Button onClick={addManual} className="shrink-0">
                      <Plus className="h-4 w-4 ml-1" /> إضافة
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {lines.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>اختر أصنافاً من القائمة أعلاه أو أضف يدوياً</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الصنف</TableHead>
                      <TableHead>الوحدة</TableHead>
                      <TableHead className="w-24">الكمية</TableHead>
                      <TableHead className="w-28">السعر</TableHead>
                      <TableHead>الإجمالي</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map(line => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">{line.item_name}</TableCell>
                        <TableCell>{line.unit}</TableCell>
                        <TableCell>
                          <Input
                            type="number" min={0.001} step="any"
                            value={line.quantity}
                            onChange={e => updateLine(line.id, "quantity", Number(e.target.value))}
                            className="h-8 w-20 text-center"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number" min={0} step="any"
                            value={line.unit_price}
                            onChange={e => updateLine(line.id, "unit_price", Number(e.target.value))}
                            className="h-8 w-24 text-center"
                          />
                        </TableCell>
                        <TableCell className="font-mono">{(line.quantity * line.unit_price).toLocaleString("en", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => removeLine(line.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderCreatePage;
