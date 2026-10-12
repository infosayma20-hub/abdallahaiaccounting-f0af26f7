import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { toast } from "sonner";
import { ShoppingCart, Plus, Search, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { purchaseUnitPriceFromTotal } from "@/lib/pos/purchase-amounts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dataOwnerId: string;
  userId: string;
  sessionId?: string;
  canCreateSupplier?: boolean;
  canCreateProduct?: boolean;
  canAffectInventory?: boolean;
  canPayCash?: boolean;
  onSuccess?: () => void;
}

interface Supplier { id: string; contact_name: string; phone: string | null; }
interface ProductItem { id: string; name: string; buy_price: number; quantity: number; unit: string; }

export default function PurchaseModal({ open, onOpenChange, dataOwnerId, userId, sessionId, canCreateSupplier, canCreateProduct, canAffectInventory, canPayCash, onSuccess }: Props) {
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
  const [enteredTotal, setEnteredTotal] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [affectInventory, setAffectInventory] = useState(true);
  const [idemKey, setIdemKey] = useState(() => `POS-PUR-${crypto.randomUUID()}`);

  // New supplier
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!canPayCash) setPaymentType("credit");
    Promise.all([
      supabase.from("contacts").select("id, contact_name, phone").eq("user_id", dataOwnerId).eq("contact_type", "مورد").eq("is_active", true).neq("is_archived", true).order("contact_name"),
      fetchAllRows<any>((from, to) =>
        supabase.from("products").select("id, name, buy_price, quantity, unit").eq("user_id", dataOwnerId).order("name").range(from, to)
      ),
    ]).then(([s, p]) => {
      setSuppliers(s.data || []);
      setProducts(p || []);
    });
  }, [open, dataOwnerId]);

  const effectiveUnitPrice = enteredTotal === null ? unitPrice : purchaseUnitPriceFromTotal(enteredTotal, quantity);
  const totalAmount = (parseFloat(quantity) || 0) * (parseFloat(effectiveUnitPrice) || 0);
  const changeUnitPrice = (value: string) => { setEnteredTotal(null); setUnitPrice(value); };

  const filteredSuppliers = suppliers.filter(s => s.contact_name.includes(supplierSearch)).slice(0, 15);
  const filteredProducts = products.filter(p => p.name.includes(productSearch)).slice(0, 15);

  const handleSave = async () => {
    if (!selectedSupplier) { toast.error("اختر المورد"); return; }
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(effectiveUnitPrice) || 0;
    if (qty <= 0 || price <= 0) { toast.error("أدخل الكمية وسعر الوحدة"); return; }
    if (paymentType === "cash" && !canPayCash) { toast.error("ليس لديك صلاحية الدفع نقداً"); return; }

    if (!sessionId) { toast.error("افتح وردية أولاً"); return; }
    setSaving(true);
    try {
      // كل شيء ذري على الخادم: الصلاحيات، حساب صندوق الوردية/ذمة المورد، المخزون والقيد
      const { data, error } = await supabase.rpc("pos_record_purchase_v1" as any, {
        p_data_owner: dataOwnerId, p_session_id: sessionId, p_supplier_id: selectedSupplier.id,
        p_product_id: noProduct ? null : selectedProduct?.id || null,
        p_quantity: qty, p_unit_price: price, p_payment_type: paymentType,
        p_affect_inventory: !!(selectedProduct && !noProduct && affectInventory && canAffectInventory),
        p_notes: notes, p_idempotency_key: idemKey,
      });
      if (error) throw error;
      const total = Number((data as any)?.total ?? totalAmount);
      toast.success(`تم تسجيل مشتريات بقيمة ₪${total.toFixed(2)} من ${selectedSupplier.contact_name}`);
      onSuccess?.();
      resetForm();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  // إضافة مورد مباشرة بالاسم المكتوب (مثل الفواتير) — الحساب الفرعي تحت 2110 يُنشأ تلقائيًا
  const handleCreateSupplier = async () => {
    const name = supplierSearch.trim();
    if (!name) { toast.error("اكتب اسم المورد"); return; }
    const existing = suppliers.find(s => s.contact_name.trim() === name);
    if (existing) { setSelectedSupplier(existing); setSupplierSearch(existing.contact_name); setShowSupplierDD(false); return; }
    setSavingSupplier(true);
    try {
      const { data: res, error } = await supabase.rpc("pos_create_supplier_v1" as any, { p_data_owner: dataOwnerId, p_name: name });
      if (error) throw error;
      const data = res as any as Supplier;
      setSuppliers(prev => [...prev, data]);
      setSelectedSupplier(data); setSupplierSearch(data.contact_name); setShowSupplierDD(false);
      toast.success(`تمت إضافة المورد «${data.contact_name}»`);
    } catch (e: any) {
      toast.error(e.message || "فشل إنشاء المورد");
    } finally { setSavingSupplier(false); }
  };

  // إضافة صنف مشترى بالاسم المكتوب — مخفي من شاشة البيع حتى يُسعّر من الإدارة
  const handleCreateProduct = async () => {
    const name = productSearch.trim();
    if (!name) { toast.error("اكتب اسم الصنف"); return; }
    const existing = products.find(p => p.name.trim() === name);
    if (existing) { setSelectedProduct(existing); setProductSearch(existing.name); setShowProductDD(false); return; }
    setSavingProduct(true);
    try {
      const buy = parseFloat(effectiveUnitPrice) || 0;
      const { data, error } = await supabase.rpc("pos_create_purchase_product_v1" as any, { p_data_owner: dataOwnerId, p_name: name, p_buy_price: buy });
      if (error) throw error;
      const p = data as any as ProductItem;
      setProducts(prev => [...prev, p]);
      setSelectedProduct(p); setProductSearch(p.name); setShowProductDD(false);
      toast.success(`تمت إضافة الصنف «${p.name}»`);
    } catch (e: any) {
      toast.error(e.message || "فشل إضافة الصنف");
    } finally { setSavingProduct(false); }
  };

  const resetForm = () => {
    setSelectedSupplier(null); setSupplierSearch(""); setSelectedProduct(null); setProductSearch("");
    setQuantity(""); setUnitPrice(""); setPaymentType(canPayCash ? "cash" : "credit"); setNotes(""); setNoProduct(false);
    setEnteredTotal(null); setAffectInventory(true); setIdemKey(`POS-PUR-${crypto.randomUUID()}`);
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
                    disabled={savingSupplier} onClick={handleCreateSupplier}>
                    {savingSupplier ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} إضافة مورد «{supplierSearch.trim()}»
                  </button>
                )}
              </div>
            )}
          </div>

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
                        onClick={() => { setSelectedProduct(p); setProductSearch(p.name); setShowProductDD(false); changeUnitPrice(p.buy_price.toString()); }}>
                        <span>{p.name}</span>
                        <span className="text-muted-foreground text-xs">₪{p.buy_price}</span>
                      </button>
                    ))}
                    {filteredProducts.length === 0 && <div className="p-3 text-sm text-muted-foreground text-center">لا توجد نتائج</div>}
                    {canCreateProduct && (
                      <button className="w-full text-right px-3 py-2 hover:bg-accent text-sm text-primary flex items-center gap-2 border-t"
                        disabled={savingProduct} onClick={handleCreateProduct}>
                        {savingProduct ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} إضافة صنف «{productSearch.trim()}»
                      </button>
                    )}
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
              <Label htmlFor="purchase-quantity">الكمية *</Label>
              <Input id="purchase-quantity" type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label htmlFor="purchase-unit-price">سعر الوحدة *</Label>
              <Input id="purchase-unit-price" type="number" min="0" step="any" value={effectiveUnitPrice} onChange={e => changeUnitPrice(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label htmlFor="purchase-total">الإجمالي (₪)</Label>
              <Input id="purchase-total" type="number" min="0" step="0.01" value={enteredTotal ?? (totalAmount > 0 ? totalAmount.toFixed(2) : "")} onChange={e => setEnteredTotal(e.target.value)} placeholder="0.00" className="font-semibold" />
            </div>
          </div>

          <div>
            <Label>طريقة الدفع</Label>
            <Select value={paymentType} onValueChange={setPaymentType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {canPayCash && <SelectItem value="cash">نقدي من صندوق الوردية</SelectItem>}
                <SelectItem value="credit">آجل على ذمة المورد</SelectItem>
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
