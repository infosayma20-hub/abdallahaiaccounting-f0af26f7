import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { X, Users, Package, Banknote, CreditCard, BookOpen, ChevronLeft, ChevronRight, Loader2, Check, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { motion, AnimatePresence } from "framer-motion";

interface TransactionBuilderProps {
  transactionType: "بيع" | "شراء";
  onClose: () => void;
  onSubmit: (data: TransactionBuilderData) => void;
  sending?: boolean;
}

export interface TransactionBuilderData {
  transaction_type: "بيع" | "شراء";
  party: { id: string; name: string; type: "زبون" | "مورد" };
  product: { id: string; name: string; unit: string };
  quantity: number;
  unit_price: number;
  total: number;
  payment_method: "نقد" | "حساب" | "شيك";
  cheque_info: string | null;
  timestamp: string;
}

type BuilderStep = "party" | "product" | "quantity" | "price" | "payment";

interface PartyOption { id: string; name: string; type: string }
interface ProductOption { id: string; name: string; unit: string; sell_price?: number; buy_price?: number }

const STEPS: BuilderStep[] = ["party", "product", "quantity", "price", "payment"];

const TransactionBuilder = ({ transactionType, onClose, onSubmit, sending }: TransactionBuilderProps) => {
  const { user } = useAuth();
  const [activeStep, setActiveStep] = useState<BuilderStep>("party");

  // Data
  const [parties, setParties] = useState<PartyOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [partySearch, setPartySearch] = useState("");
  const [productSearch, setProductSearch] = useState("");

  // Selected values
  const [selectedParty, setSelectedParty] = useState<PartyOption | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"نقد" | "حساب" | "شيك" | null>(null);
  const [chequeInfo, setChequeInfo] = useState("");

  const [showPartyDropdown, setShowPartyDropdown] = useState(true);
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Quick add product
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductUnit, setNewProductUnit] = useState("قطعة");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);

  // Quick add contact
  const [showQuickAddContact, setShowQuickAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [addingContact, setAddingContact] = useState(false);

  const quantityRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const partyInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  const isSale = transactionType === "بيع";
  const contactType = isSale ? "عميل" : "مورد";

  // Load contacts
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("contacts").select("id, contact_name, contact_type")
      .eq("user_id", dataOwnerId!).eq("is_active", true).neq("is_archived", true)
      .eq("contact_type", contactType)
      .then(({ data }) => {
        setParties((data || []).map(c => ({ id: c.id, name: c.contact_name, type: c.contact_type })));
      });
  }, [user?.id, contactType]);

  // Load products
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("products").select("id, name, unit, sell_price, buy_price")
      .eq("user_id", dataOwnerId!)
      .then(({ data }) => {
        setProducts((data || []).map(p => ({
          id: p.id, name: p.name, unit: p.unit || "قطعة",
          sell_price: p.sell_price, buy_price: p.buy_price,
        })));
      });
  }, [user?.id]);

  const filteredParties = useMemo(() => {
    if (!partySearch) return parties;
    return parties.filter(p => p.name.includes(partySearch));
  }, [parties, partySearch]);

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products;
    return products.filter(p => p.name.includes(productSearch));
  }, [products, productSearch]);

  const total = useMemo(() => {
    const q = parseFloat(quantity) || 0;
    const p = parseFloat(unitPrice) || 0;
    return q * p;
  }, [quantity, unitPrice]);

  const selectParty = useCallback((p: PartyOption) => {
    setSelectedParty(p);
    setShowPartyDropdown(false);
    setActiveStep("product");
    setShowProductDropdown(true);
    setTimeout(() => productInputRef.current?.focus(), 100);
  }, []);

  const selectProduct = useCallback((p: ProductOption) => {
    setSelectedProduct(p);
    setShowProductDropdown(false);
    const defaultPrice = isSale ? p.sell_price : p.buy_price;
    if (defaultPrice) setUnitPrice(String(defaultPrice));
    setActiveStep("quantity");
    setTimeout(() => quantityRef.current?.focus(), 100);
  }, [isSale]);

  const handleQuantityNext = () => {
    if (!quantity) return;
    setActiveStep("price");
    setTimeout(() => priceRef.current?.focus(), 100);
  };

  const handlePriceNext = () => {
    if (!unitPrice) return;
    setActiveStep("payment");
  };

  // Go back to previous step
  const goBack = () => {
    const currentIndex = STEPS.indexOf(activeStep);
    if (currentIndex > 0) {
      setActiveStep(STEPS[currentIndex - 1]);
    }
  };

  // Payment selection - just select, don't submit
  const handlePayment = (method: "نقد" | "حساب" | "شيك") => {
    setPaymentMethod(method);
  };

  const submitTransaction = () => {
    if (!selectedParty || !selectedProduct || !paymentMethod) return;
    onSubmit({
      transaction_type: transactionType,
      party: { id: selectedParty.id, name: selectedParty.name, type: isSale ? "زبون" : "مورد" },
      product: { id: selectedProduct.id, name: selectedProduct.name, unit: selectedProduct.unit },
      quantity: parseFloat(quantity) || 0,
      unit_price: parseFloat(unitPrice) || 0,
      total,
      payment_method: paymentMethod,
      cheque_info: paymentMethod === "شيك" ? chequeInfo || null : null,
      timestamp: new Date().toISOString(),
    });
  };

  const canSubmit = selectedParty && selectedProduct && parseFloat(quantity) > 0 && paymentMethod;

  const stepIndex = STEPS.indexOf(activeStep);

  // Back button component
  const BackButton = () => {
    if (stepIndex === 0) return null;
    return (
      <button
        onClick={goBack}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
      >
        <ArrowRight className="h-3.5 w-3.5" />
        <span>رجوع</span>
      </button>
    );
  };

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="bg-card rounded-2xl border border-primary/20 shadow-xl overflow-hidden"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-primary/10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
            {isSale ? <Banknote className="h-3.5 w-3.5 text-primary" /> : <Package className="h-3.5 w-3.5 text-primary" />}
          </div>
          <span className="text-sm font-bold text-foreground">
            {isSale ? "فاتورة بيع" : "فاتورة شراء"}
          </span>
          {total > 0 && (
            <span className="text-xs font-bold text-primary tabular-nums mr-2">
              المجموع: ₪{total.toLocaleString()}
            </span>
          )}
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-secondary flex items-center justify-center transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Progress - clickable */}
      <div className="flex gap-1 px-4 pt-3">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => {
              // Only allow going back to completed steps
              if (i < stepIndex) setActiveStep(STEPS[i]);
            }}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= stepIndex ? "bg-primary cursor-pointer hover:bg-primary/80" : "bg-secondary cursor-default"
            }`}
          />
        ))}
      </div>

      {/* Active Step Content */}
      <div className="p-4 space-y-3">
        {/* Step: Party */}
        {activeStep === "party" && (
          <div className="space-y-2">
            <BackButton />
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {isSale ? "اختر الزبون" : "اختر المورد"} @
            </label>
            <input
              ref={partyInputRef}
              autoFocus
              value={partySearch}
              onChange={e => { setPartySearch(e.target.value); setShowPartyDropdown(true); }}
              placeholder={isSale ? "ابحث عن زبون..." : "ابحث عن مورد..."}
              className="w-full h-10 rounded-xl bg-secondary/50 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none border-2 border-primary/40 focus:border-primary transition-colors"
            />
            {showPartyDropdown && !showQuickAddContact && (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-popover shadow-md">
                {filteredParties.length === 0 ? (
                  <div className="p-3 space-y-2">
                    <p className="text-[11px] text-muted-foreground text-center">لا توجد نتائج</p>
                    <button
                      onClick={() => { setShowQuickAddContact(true); setNewContactName(partySearch); }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      إضافة "{partySearch || (isSale ? "زبون جديد" : "مورد جديد")}"
                    </button>
                  </div>
                ) : (
                  <>
                    {filteredParties.map(p => (
                      <button key={p.id} onClick={() => selectParty(p)} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent/50 transition-colors text-right">
                        <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-foreground">{p.name}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => { setShowQuickAddContact(true); setNewContactName(partySearch); }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 border-t border-border text-primary text-xs font-bold hover:bg-primary/5 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      إضافة {isSale ? "زبون" : "مورد"} جديد
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Quick Add Contact Form */}
            {showQuickAddContact && (
              <div className="rounded-xl border-2 border-primary/30 bg-secondary/30 p-3 space-y-2">
                <p className="text-xs font-bold text-foreground">إضافة {isSale ? "زبون" : "مورد"} جديد</p>
                <input
                  autoFocus
                  value={newContactName}
                  onChange={e => setNewContactName(e.target.value)}
                  placeholder="الاسم"
                  className="w-full h-9 rounded-lg bg-background px-3 text-sm text-foreground outline-none border border-border focus:border-primary transition-colors"
                />
                <input
                  value={newContactPhone}
                  onChange={e => setNewContactPhone(e.target.value)}
                  placeholder="رقم الهاتف (اختياري)"
                  type="tel"
                  inputMode="tel"
                  className="w-full h-9 rounded-lg bg-background px-3 text-sm text-foreground outline-none border border-border focus:border-primary transition-colors"
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!newContactName.trim() || !user?.id) return;
                      setAddingContact(true);
                      const { data, error } = await supabase.from("contacts").insert({
                        user_id: dataOwnerId!,
                        contact_name: newContactName.trim(),
                        contact_type: contactType,
                        phone: newContactPhone.trim() || null,
                        is_active: true,
                      }).select("id, contact_name, contact_type").single();
                      setAddingContact(false);
                      if (error) {
                        toast.error("خطأ في إضافة الجهة");
                        return;
                      }
                      if (data) {
                        const newP = { id: data.id, name: data.contact_name, type: data.contact_type };
                        setParties(prev => [...prev, newP]);
                        selectParty(newP);
                        setShowQuickAddContact(false);
                        setNewContactName("");
                        setNewContactPhone("");
                        toast.success(`تم إضافة ${isSale ? "الزبون" : "المورد"} بنجاح`);
                      }
                    }}
                    disabled={!newContactName.trim() || addingContact}
                    className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
                  >
                    {addingContact ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    حفظ
                  </button>
                  <button
                    onClick={() => { setShowQuickAddContact(false); setNewContactName(""); setNewContactPhone(""); }}
                    className="px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-bold hover:bg-secondary/70 transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: Product */}
        {activeStep === "product" && (
          <div className="space-y-2">
            <BackButton />
            <div className="flex items-center gap-2">
              {selectedParty && (
                <span className="px-2.5 py-1 rounded-full bg-primary/10 text-[11px] font-medium text-primary">
                  {selectedParty.name}
                </span>
              )}
            </div>
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />
              اختر المنتج #
            </label>
            <input
              ref={productInputRef}
              autoFocus
              value={productSearch}
              onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
              placeholder="ابحث عن منتج..."
              className="w-full h-10 rounded-xl bg-secondary/50 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none border-2 border-primary/40 focus:border-primary transition-colors"
            />
            {showProductDropdown && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-popover shadow-md">
                {filteredProducts.length === 0 && !showQuickAddProduct ? (
                  <div className="p-3 space-y-2">
                    <p className="text-[11px] text-muted-foreground text-center">لا توجد منتجات</p>
                    <button
                      onClick={() => { setShowQuickAddProduct(true); setNewProductName(productSearch); }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      إضافة "{productSearch || "منتج جديد"}"
                    </button>
                  </div>
                ) : filteredProducts.map(p => (
                  <button key={p.id} onClick={() => selectProduct(p)} className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-accent/50 transition-colors text-right">
                    <div className="flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-foreground">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground">({p.unit})</span>
                    </div>
                    <span className="text-[10px] text-primary tabular-nums">
                      ₪{((isSale ? p.sell_price : p.buy_price) || 0).toLocaleString()}
                    </span>
                  </button>
                ))}
                {filteredProducts.length > 0 && !showQuickAddProduct && (
                  <button
                    onClick={() => { setShowQuickAddProduct(true); setNewProductName(productSearch); }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 border-t border-border text-primary text-xs font-bold hover:bg-primary/5 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    إضافة منتج جديد
                  </button>
                )}
              </div>
            )}

            {/* Quick Add Product Form */}
            {showQuickAddProduct && (
              <div className="rounded-xl border-2 border-primary/30 bg-secondary/30 p-3 space-y-2">
                <p className="text-xs font-bold text-foreground">تعريف منتج جديد</p>
                <input
                  autoFocus
                  value={newProductName}
                  onChange={e => setNewProductName(e.target.value)}
                  placeholder="اسم المنتج"
                  className="w-full h-9 rounded-lg bg-background px-3 text-sm text-foreground outline-none border border-border focus:border-primary transition-colors"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newProductUnit}
                    onChange={e => setNewProductUnit(e.target.value)}
                    className="h-9 rounded-lg bg-background px-2 text-xs text-foreground outline-none border border-border focus:border-primary transition-colors"
                  >
                    <option value="قطعة">قطعة</option>
                    <option value="كغ">كغ</option>
                    <option value="طن">طن</option>
                    <option value="لتر">لتر</option>
                    <option value="متر">متر</option>
                    <option value="علبة">علبة</option>
                    <option value="كرتون">كرتون</option>
                  </select>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={newProductPrice}
                    onChange={e => setNewProductPrice(e.target.value)}
                    placeholder="السعر"
                    className="h-9 rounded-lg bg-background px-3 text-sm text-foreground text-center tabular-nums outline-none border border-border focus:border-primary transition-colors"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!newProductName.trim() || !user?.id) return;
                      setAddingProduct(true);
                      const { data, error } = await supabase.from("products").insert({
                        user_id: dataOwnerId!,
                        name: newProductName.trim(),
                        unit: newProductUnit,
                        sell_price: parseFloat(newProductPrice) || 0,
                        buy_price: parseFloat(newProductPrice) || 0,
                        quantity: 0,
                      }).select("id, name, unit, sell_price, buy_price").single();
                      setAddingProduct(false);
                      if (error) {
                        toast.error("خطأ في إضافة المنتج");
                        return;
                      }
                      if (data) {
                        const newP = { id: data.id, name: data.name, unit: data.unit || "قطعة", sell_price: data.sell_price, buy_price: data.buy_price };
                        setProducts(prev => [...prev, newP]);
                        selectProduct(newP);
                        setShowQuickAddProduct(false);
                        setNewProductName("");
                        setNewProductPrice("");
                        toast.success("تم إضافة المنتج بنجاح");
                      }
                    }}
                    disabled={!newProductName.trim() || addingProduct}
                    className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
                  >
                    {addingProduct ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    حفظ
                  </button>
                  <button
                    onClick={() => { setShowQuickAddProduct(false); setNewProductName(""); setNewProductPrice(""); }}
                    className="px-3 py-2 rounded-lg bg-secondary text-foreground text-xs font-bold hover:bg-secondary/70 transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step: Quantity & Price side by side */}
        {(activeStep === "quantity" || activeStep === "price") && (
          <div className="space-y-3">
            <BackButton />
            <div className="flex items-center gap-2 flex-wrap">
              {selectedParty && (
                <span className="px-2.5 py-1 rounded-full bg-primary/10 text-[11px] font-medium text-primary">{selectedParty.name}</span>
              )}
              {selectedProduct && (
                <span className="px-2.5 py-1 rounded-full bg-accent/50 text-[11px] font-medium text-foreground">
                  {selectedProduct.name} ({selectedProduct.unit})
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">الكمية</label>
                <input
                  ref={quantityRef}
                  autoFocus={activeStep === "quantity"}
                  type="number"
                  inputMode="decimal"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleQuantityNext()}
                  placeholder="0"
                  className={`w-full h-10 rounded-xl bg-secondary/50 px-3 text-sm text-foreground text-center tabular-nums outline-none border-2 transition-colors ${activeStep === "quantity" ? "border-primary/40 focus:border-primary" : "border-transparent"}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">سعر القطعة</label>
                <input
                  ref={priceRef}
                  autoFocus={activeStep === "price"}
                  type="number"
                  inputMode="decimal"
                  value={unitPrice}
                  onChange={e => setUnitPrice(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handlePriceNext()}
                  placeholder="0"
                  className={`w-full h-10 rounded-xl bg-secondary/50 px-3 text-sm text-foreground text-center tabular-nums outline-none border-2 transition-colors ${activeStep === "price" ? "border-primary/40 focus:border-primary" : "border-transparent"}`}
                />
              </div>
            </div>
            {total > 0 && (
              <div className="text-center text-sm font-bold text-primary tabular-nums">
                الإجمالي: ₪{total.toLocaleString()}
              </div>
            )}
            {activeStep === "quantity" && (
              <button onClick={handleQuantityNext} disabled={!quantity} className="w-full py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-1">
                التالي <ChevronLeft className="h-3 w-3" />
              </button>
            )}
            {activeStep === "price" && (
              <button onClick={handlePriceNext} disabled={!unitPrice} className="w-full py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-1">
                اختر طريقة الدفع <ChevronLeft className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Step: Payment */}
        {activeStep === "payment" && (
          <div className="space-y-3">
            <BackButton />
            <div className="flex items-center gap-2 flex-wrap">
              {selectedParty && <span className="px-2.5 py-1 rounded-full bg-primary/10 text-[11px] font-medium text-primary">{selectedParty.name}</span>}
              {selectedProduct && <span className="px-2.5 py-1 rounded-full bg-accent/50 text-[11px] font-medium text-foreground">{selectedProduct.name} × {quantity}</span>}
              {total > 0 && <span className="px-2.5 py-1 rounded-full bg-primary/15 text-[11px] font-bold text-primary tabular-nums">₪{total.toLocaleString()}</span>}
            </div>
            <label className="text-xs font-semibold text-muted-foreground">طريقة الدفع</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: "نقد" as const, icon: "💵", label: "نقد" },
                { key: "حساب" as const, icon: "📒", label: "حساب" },
                { key: "شيك" as const, icon: "🏦", label: "شيك" },
              ]).map(({ key, icon, label }) => (
                <button
                  key={key}
                  onClick={() => handlePayment(key)}
                  disabled={sending}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                    paymentMethod === key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary/30 text-foreground hover:border-primary/30 hover:bg-primary/5"
                  }`}
                >
                  <span className="text-lg">{icon}</span>
                  <span className="text-xs">{label}</span>
                </button>
              ))}
            </div>

            {paymentMethod === "شيك" && (
              <input
                value={chequeInfo}
                onChange={e => setChequeInfo(e.target.value)}
                placeholder="رقم الشيك / تاريخ الاستحقاق"
                className="w-full h-10 rounded-xl bg-secondary/50 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none border-2 border-primary/30 focus:border-primary transition-colors"
                dir="rtl"
              />
            )}

            {/* Confirm button - always visible when payment selected */}
            {paymentMethod && (
              <button
                onClick={submitTransaction}
                disabled={sending || !canSubmit}
                className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  sending ? "bg-primary/60 text-primary-foreground" : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {sending ? "جاري الإرسال..." : "تأكيد وإرسال"}
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default TransactionBuilder;
