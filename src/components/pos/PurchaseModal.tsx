import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShoppingCart, Plus, Search, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dataOwnerId: string;
  userId: string;
  sessionId?: string;
  canCreateSupplier?: boolean;
  canAffectInventory?: boolean;
  canPayCash?: boolean;
  onSuccess?: () => void;
}

interface Supplier { id: string; contact_name: string; phone: string | null; }
interface ProductItem { id: string; name: string; buy_price: number; quantity: number; unit: string; }

export default function PurchaseModal({ open, onOpenChange, dataOwnerId, userId, sessionId, canCreateSupplier, canAffectInventory, canPayCash, onSuccess }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [showSupplierDD, setShowSupplierDD] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [showProductDD, setShowProductDD] = useState(false);
  const [noProduct, setNoProduct] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [paymentType, setPaymentType] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [affectInventory, setAffectInventory] = useState(true);

  // New supplier
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "", account_name: "" });
  const [savingSupplier, setSavingSupplier] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      supabase.from("contacts").select("id, contact_name, phone").eq("user_id", dataOwnerId).eq("contact_type", "مورد").eq("is_active", true).neq("is_archived", true).order("contact_name"),
      supabase.from("products").select("id, name, buy_price, quantity, unit").eq("user_id", dataOwnerId).order("name"),
    ]).then(([s, p]) => {
      setSuppliers(s.data || []);
      setProducts(p.data || []);
    });
  }, [open, dataOwnerId]);

  const totalAmount = (parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0);

  const filteredSuppliers = suppliers.filter(s => s.contact_name.includes(supplierSearch)).slice(0, 15);
  const filteredProducts = products.filter(p => p.name.includes(productSearch)).slice(0, 15);

  const handleSave = async () => {
    if (!selectedSupplier) { toast.error("اختر المورد"); return; }
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    if (qty <= 0 || price <= 0) { toast.error("أدخل الكمية وسعر الوحدة"); return; }
    if (paymentType === "cash" && !canPayCash) { toast.error("ليس لديك صلاحية الدفع نقداً"); return; }

    setSaving(true);
    try {
      // 1. Create purchase record
      await supabase.from("pos_purchases").insert({
        user_id: dataOwnerId,
        supplier_id: selectedSupplier.id,
        product_id: noProduct ? null : selectedProduct?.id || null,
        quantity: qty,
        unit_price: price,
        total_amount: totalAmount,
        payment_type: paymentType,
        notes,
        shift_id: sessionId || null,
        created_by: userId,
      });

      // 2. If product selected and affect inventory
      if (selectedProduct && affectInventory && canAffectInventory) {
        await supabase.from("pos_inventory_movements").insert({
          user_id: dataOwnerId,
          product_id: selectedProduct.id,
          quantity: qty,
          type: "purchase_in",
          notes: `شراء من ${selectedSupplier.contact_name}`,
          shift_id: sessionId || null,
          created_by: userId,
        });
        await supabase.from("products").update({
          quantity: selectedProduct.quantity + qty,
        }).eq("id", selectedProduct.id);
      }

      // 3. Journal entry
      const creditCode = paymentType === "cash" ? "1110" : "2110"; // صندوق أو ذمم موردين
      await supabase.from("transactions").insert({
        user_id: dataOwnerId,
        transaction_date: new Date().toISOString().split("T")[0],
        description: `مشتريات - ${selectedSupplier.contact_name}${selectedProduct ? ` - ${selectedProduct.name}` : ""}`,
        debit_account_code: "5110",
        credit_account_code: creditCode,
        amount: totalAmount,
        currency: "شيكل",
        transaction_type: paymentType === "cash" ? "purchase_cash" : "purchase_credit",
        contact_id: selectedSupplier.id,
        reference: `PUR-POS-${Date.now()}`,
        payment_method: paymentType === "cash" ? "نقدي" : "آجل",
        idempotency_key: `POS-PUR-${Date.now()}`,
      });

      toast.success(`تم تسجيل مشتريات بقيمة ₪${totalAmount.toFixed(2)} من ${selectedSupplier.contact_name}`);
      onSuccess?.();
      resetForm();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSupplier = async () => {
    if (!newSupplier.name.trim()) { toast.error("أدخل اسم المورد"); return; }
    setSavingSupplier(true);
    try {
      const { data, error } = await supabase.from("contacts").insert({
        user_id: dataOwnerId,
        contact_name: newSupplier.name,
        contact_type: "مورد",
        phone: newSupplier.phone || null,
        is_active: true,
      }).select("id, contact_name, phone").single();
      if (error) throw error;
      setSuppliers(prev => [...prev, data]);
      setSelectedSupplier(data);
      setSupplierSearch(data.contact_name);
      setShowNewSupplier(false);
      setNewSupplier({ name: "", phone: "", account_name: "" });
      toast.success("تم إضافة المورد");
    } catch (e: any) {
      toast.error(e.message || "فشل إنشاء المورد");
    } finally {
      setSavingSupplier(false);
    }
  };

  const resetForm = () => {
    setSelectedSupplier(null); setSupplierSearch(""); setSelectedProduct(null); setProductSearch("");
    setQuantity(""); setUnitPrice(""); setPaymentType("cash"); setNotes(""); setNoProduct(false);
    setShowNewSupplier(false); setAffectInventory(true);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#1B3A5C" }}>
              <ShoppingCart className="w-4 h-4 text-white" />
            </div>
            تسجيل مشتريات
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Supplier */}
          <div className="relative">
            <Label>المورد *</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={supplierSearch}
                onChange={e => { setSupplierSearch(e.target.value); setShowSupplierDD(true); setSelectedSupplier(null); }}
                onFocus={() => setShowSupplierDD(true)}
                placeholder="ابحث عن مورد..."
                className="pr-9"
              />
            </div>
            {showSupplierDD && supplierSearch && (
              <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {filteredSuppliers.map(s => (
                  <button key={s.id} className="w-full text-right px-3 py-2 hover:bg-accent text-sm"
                    onClick={() => { setSelectedSupplier(s); setSupplierSearch(s.contact_name); setShowSupplierDD(false); }}>
                    {s.contact_name} {s.phone && <span className="text-muted-foreground text-xs mr-2">{s.phone}</span>}
                  </button>
                ))}
                {filteredSuppliers.length === 0 && <div className="p-3 text-sm text-muted-foreground text-center">لا توجد نتائج</div>}
                {canCreateSupplier && (
                  <button className="w-full text-right px-3 py-2 hover:bg-accent text-sm text-primary flex items-center gap-2 border-t"
                    onClick={() => { setShowNewSupplier(true); setShowSupplierDD(false); }}>
                    <Plus className="w-3 h-3" /> إضافة مورد جديد
                  </button>
                )}
              </div>
            )}
          </div>

          {showNewSupplier && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">مورد جديد</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowNewSupplier(false)}><X className="w-3 h-3" /></Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="اسم المورد *" value={newSupplier.name} onChange={e => setNewSupplier(p => ({ ...p, name: e.target.value }))} className="col-span-2" />
                <Input placeholder="الهاتف" value={newSupplier.phone} onChange={e => setNewSupplier(p => ({ ...p, phone: e.target.value }))} />
                <Input placeholder="اسم الحساب" value={newSupplier.account_name} onChange={e => setNewSupplier(p => ({ ...p, account_name: e.target.value }))} />
              </div>
              <Button size="sm" onClick={handleCreateSupplier} disabled={savingSupplier} className="w-full">
                {savingSupplier ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Plus className="w-4 h-4 ml-1" />}
                حفظ وتحديد
              </Button>
            </div>
          )}

          {/* Product */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>الصنف المشترى</Label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={noProduct} onChange={e => { setNoProduct(e.target.checked); setSelectedProduct(null); setProductSearch(""); }} className="rounded" />
                غير مرتبط بصنف
              </label>
            </div>
            {!noProduct && (
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setShowProductDD(true); setSelectedProduct(null); }}
                  onFocus={() => setShowProductDD(true)}
                  placeholder="ابحث عن صنف..."
                  className="pr-9"
                />
                {showProductDD && productSearch && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {filteredProducts.map(p => (
                      <button key={p.id} className="w-full text-right px-3 py-2 hover:bg-accent text-sm flex justify-between"
                        onClick={() => { setSelectedProduct(p); setProductSearch(p.name); setShowProductDD(false); setUnitPrice(p.buy_price.toString()); }}>
                        <span>{p.name}</span>
                        <span className="text-muted-foreground text-xs">₪{p.buy_price}</span>
                      </button>
                    ))}
                    {filteredProducts.length === 0 && <div className="p-3 text-sm text-muted-foreground text-center">لا توجد نتائج</div>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Affect inventory toggle */}
          {selectedProduct && canAffectInventory && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={affectInventory} onChange={e => setAffectInventory(e.target.checked)} className="rounded" />
              إضافة الكمية للمخزون تلقائياً
            </label>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>الكمية *</Label>
              <Input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>سعر الوحدة *</Label>
              <Input type="number" min="0" step="0.01" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>الإجمالي</Label>
              <Input value={`₪${totalAmount.toFixed(2)}`} readOnly className="bg-muted/50 font-semibold" />
            </div>
          </div>

          <div>
            <Label>طريقة الدفع</Label>
            <Select value={paymentType} onValueChange={setPaymentType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">نقدي</SelectItem>
                <SelectItem value="credit">آجل</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات اختيارية..." rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving} style={{ background: "#1B3A5C" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <ShoppingCart className="w-4 h-4 ml-1" />}
            تسجيل المشتريات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
