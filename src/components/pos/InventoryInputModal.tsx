import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Package, Plus, Search, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dataOwnerId: string;
  userId: string;
  sessionId?: string;
  canCreateProduct?: boolean;
  onSuccess?: () => void;
}

interface ProductItem {
  id: string;
  name: string;
  buy_price: number;
  sell_price: number;
  quantity: number;
  category: string;
  unit: string;
}

export default function InventoryInputModal({ open, onOpenChange, dataOwnerId, userId, sessionId, canCreateProduct, onSuccess }: Props) {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  // New product mini form
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProd, setNewProd] = useState({ name: "", unit: "قطعة", category: "", cost_price: "", sale_price: "" });
  const [savingNew, setSavingNew] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("products")
      .select("id, name, buy_price, sell_price, quantity, category, unit")
      .eq("user_id", dataOwnerId)
      .order("name")
      .then(({ data }) => setProducts(data || []));
  }, [open, dataOwnerId]);

  const filtered = products.filter(p =>
    p.name.includes(search) || p.id.includes(search)
  ).slice(0, 20);

  const handleSave = async () => {
    if (!selectedProduct) { toast.error("اختر صنفاً"); return; }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) { toast.error("أدخل كمية صحيحة"); return; }

    setSaving(true);
    try {
      // 1. Insert inventory movement
      await supabase.from("pos_inventory_movements").insert({
        user_id: dataOwnerId,
        product_id: selectedProduct.id,
        quantity: qty,
        type: "production_in",
        notes,
        shift_id: sessionId || null,
        created_by: userId,
      });

      // 2. Update product stock
      await supabase.from("products").update({
        quantity: selectedProduct.quantity + qty,
      }).eq("id", selectedProduct.id);

      // 3. Create journal entry (inventory debit, production cost credit)
      const amount = qty * selectedProduct.buy_price;
      if (amount > 0) {
        await supabase.from("transactions").insert({
          user_id: dataOwnerId,
          transaction_date: date,
          description: `إدخال بضاعة - ${selectedProduct.name} (${qty} ${selectedProduct.unit || "وحدة"})`,
          debit_account_code: "1140", // المخزون
          credit_account_code: "5110", // تكلفة الإنتاج / المشتريات
          amount,
          currency: "شيكل",
          transaction_type: "inventory_in",
          idempotency_key: `INV-IN-${Date.now()}`,
        });
      }

      toast.success(`تم إضافة ${qty} ${selectedProduct.unit || "وحدة"} من ${selectedProduct.name} للمخزون`);
      onSuccess?.();
      resetForm();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateProduct = async () => {
    if (!newProd.name.trim()) { toast.error("أدخل اسم المنتج"); return; }
    setSavingNew(true);
    try {
      const { data, error } = await supabase.from("products").insert({
        user_id: dataOwnerId,
        name: newProd.name,
        unit: newProd.unit || "قطعة",
        category: newProd.category || "عام",
        buy_price: parseFloat(newProd.cost_price) || 0,
        sell_price: parseFloat(newProd.sale_price) || 0,
        quantity: 0,
        min_quantity: 0,
        is_pos_available: true,
      }).select("id, name, buy_price, sell_price, quantity, category, unit").single();

      if (error) throw error;
      setProducts(prev => [...prev, data]);
      setSelectedProduct(data);
      setSearch(data.name);
      setShowNewProduct(false);
      setNewProd({ name: "", unit: "قطعة", category: "", cost_price: "", sale_price: "" });
      toast.success("تم إضافة المنتج");
    } catch (e: any) {
      toast.error(e.message || "فشل إنشاء المنتج");
    } finally {
      setSavingNew(false);
    }
  };

  const resetForm = () => {
    setSelectedProduct(null);
    setSearch("");
    setQuantity("");
    setNotes("");
    setDate(new Date().toISOString().split("T")[0]);
    setShowNewProduct(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#1B3A5C" }}>
              <Package className="w-4 h-4 text-white" />
            </div>
            إدخال بضاعة للمخزون
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Product selection */}
          <div className="relative">
            <Label>الصنف *</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => { setSearch(e.target.value); setShowDropdown(true); setSelectedProduct(null); }}
                onFocus={() => setShowDropdown(true)}
                placeholder="ابحث عن صنف..."
                className="pr-9"
              />
            </div>
            {showDropdown && search && (
              <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filtered.map(p => (
                  <button
                    key={p.id}
                    className="w-full text-right px-3 py-2 hover:bg-accent text-sm flex justify-between"
                    onClick={() => { setSelectedProduct(p); setSearch(p.name); setShowDropdown(false); }}
                  >
                    <span>{p.name}</span>
                    <span className="text-muted-foreground text-xs">مخزون: {p.quantity}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground text-center">لا توجد نتائج</div>
                )}
                {canCreateProduct && (
                  <button
                    className="w-full text-right px-3 py-2 hover:bg-accent text-sm text-primary flex items-center gap-2 border-t"
                    onClick={() => { setShowNewProduct(true); setShowDropdown(false); }}
                  >
                    <Plus className="w-3 h-3" /> تعريف منتج جديد
                  </button>
                )}
              </div>
            )}
          </div>

          {/* New product mini form */}
          {showNewProduct && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">منتج جديد</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowNewProduct(false)}><X className="w-3 h-3" /></Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Input placeholder="اسم المنتج *" value={newProd.name} onChange={e => setNewProd(p => ({ ...p, name: e.target.value }))} /></div>
                <Input placeholder="الوحدة" value={newProd.unit} onChange={e => setNewProd(p => ({ ...p, unit: e.target.value }))} />
                <Input placeholder="التصنيف" value={newProd.category} onChange={e => setNewProd(p => ({ ...p, category: e.target.value }))} />
                <Input placeholder="سعر التكلفة" type="number" value={newProd.cost_price} onChange={e => setNewProd(p => ({ ...p, cost_price: e.target.value }))} />
                <Input placeholder="سعر البيع" type="number" value={newProd.sale_price} onChange={e => setNewProd(p => ({ ...p, sale_price: e.target.value }))} />
              </div>
              <Button size="sm" onClick={handleCreateProduct} disabled={savingNew} className="w-full">
                {savingNew ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Plus className="w-4 h-4 ml-1" />}
                حفظ وتحديد
              </Button>
            </div>
          )}

          {selectedProduct && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 flex justify-between">
              <span>سعر التكلفة: ₪{selectedProduct.buy_price}</span>
              <span>المخزون الحالي: {selectedProduct.quantity} {selectedProduct.unit}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>الكمية المُضافة *</Label>
              <Input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>التاريخ</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات اختيارية..." rows={2} />
          </div>

          {selectedProduct && quantity && parseFloat(quantity) > 0 && (
            <div className="text-sm font-medium bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-center" style={{ color: "#1B3A5C" }}>
              القيمة المحاسبية: ₪{(parseFloat(quantity) * selectedProduct.buy_price).toFixed(2)}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving} style={{ background: "#1B3A5C" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Package className="w-4 h-4 ml-1" />}
            إضافة للمخزون
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
