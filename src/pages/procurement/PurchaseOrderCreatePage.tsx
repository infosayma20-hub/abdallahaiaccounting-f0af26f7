import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Minus, Trash2, Send, Save, Package, Search, Wheat, Beef, Droplets, Sparkles, CupSoda, UtensilsCrossed, Shield, X, StickyNote, LayoutGrid, Grid3X3, Grid2X2, ArrowRight, Settings, UserPlus, MapPin, FolderPlus, Pencil, Milk, Egg, SprayCan, Shirt, Boxes } from "lucide-react";
import { useSuppliers, useItemCategories, useProcurementItems, useProcurementOrders, useBranches } from "@/hooks/useProcurement";
import { useSuppliersCrud, useCategoriesCrud, useItemsCrud } from "@/hooks/useProcurementSettings";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { SupplierPicker } from "@/components/procurement/SupplierPicker";
import ProductUnitSelect from "@/components/inventory/ProductUnitSelect";
import { multiWordMatchAny } from "@/lib/utils";

const iconMap: Record<string, any> = {
  wheat: Wheat, egg: Egg, beef: Beef, droplets: Droplets, sparkles: Sparkles,
  "cup-soda": CupSoda, package: Package, utensils: UtensilsCrossed,
  "spray-can": SprayCan, shirt: Shirt, milk: Milk, shield: Shield,
};

const ICON_OPTIONS = ["wheat", "egg", "beef", "droplets", "sparkles", "cup-soda", "package", "utensils", "spray-can", "shirt", "milk", "shield"];
const COLOR_OPTIONS = ["#4A9EE8", "#FFFFFF", "#E74C3C", "#E67E22", "#9B59B6", "#3498DB", "#27AE60", "#1ABC9C", "#2ECC71", "#95A5A6"];
// قوائم الوحدات صارت من قاعدة البيانات عبر ProductUnitSelect (وحدات المستأجر + إضافة مخصصة)

function highlightSearchWords(text: string, query: string): string {
  const escapeHtml = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const safe = escapeHtml(text ?? "");
  if (!query.trim()) return safe;
  const words = query.trim().split(/\s+/).filter(Boolean);
  let result = safe;
  words.forEach(w => {
    const escaped = escapeHtml(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  /** معرف البند في قاعدة البيانات (وضع التعديل فقط) */
  db_id?: string;
  /** الكمية المفوترة/المستلمة على البند — لا يُسمح بالنزول تحتها ولا بالحذف */
  received?: number;
}

const STORAGE_KEY = "po-prefs";
function loadPrefs() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; } }
function savePrefs(p: any) { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }

const PurchaseOrderCreatePage = () => {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id;
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

  const { id: editId } = useParams<{ id: string }>();
  const isEdit = !!editId;
  const [editOrder, setEditOrder] = useState<{ order_number: string; status: string } | null>(null);
  const [editLoading, setEditLoading] = useState(isEdit);
  const prefs = loadPrefs();
  const [supplierId, setSupplierId] = useState("");
  const [defaultBranchId, setDefaultBranchId] = useState(prefs.branchId || "");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [cardSize, setCardSize] = useState<CardSize>((prefs.cardSize as CardSize) || "small");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // ── قائمة واحدة موحّدة: أصناف المخزون + أصناف كتالوج المشتريات غير المربوطة بالمخزون ──
  const [inventoryProducts, setInventoryProducts] = useState<any[]>([]);
  const [purchaseUnitByProduct, setPurchaseUnitByProduct] = useState<Record<string, string>>({});
  const [posCats, setPosCats] = useState<any[]>([]);
  const [activePosCategory, setActivePosCategory] = useState<string | null>(null);
  const [ensuringId, setEnsuringId] = useState<string | null>(null);
  const procIdByProductIdRef = useRef<Record<string, string>>({});
  const [, bumpProcIdVersion] = useState(0);

  // Dialog states
  const [manualOpen, setManualOpen] = useState(false);
  const [manualItem, setManualItem] = useState({ item_name: "", unit: "قطعة", unit_price: 0, quantity: 1, notes: "" });
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "" });
  const [supplierPickerKey, setSupplierPickerKey] = useState(0);
  const [branchOpen, setBranchOpen] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: "", address: "", latitude: 31.9, longitude: 35.2 });
  const [itemOpen, setItemOpen] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", category_id: "", unit: "كيلو", default_price: 0, notes: "" });
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: "", icon: "package", color: "#4A9EE8" });
  const [savingDialog, setSavingDialog] = useState(false);

  const [editItemOpen, setEditItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  // تعديل سريع لتصنيف صنف مخزون من نفس الشاشة
  const [editProdCatOpen, setEditProdCatOpen] = useState(false);
  const [editProdCat, setEditProdCat] = useState<{ id: string; name: string; pos_category_id: string } | null>(null);
  const openEditProductCategory = (item: any) => {
    setEditProdCat({ id: item.id, name: item.name, pos_category_id: item.pos_category_id || "" });
    setEditProdCatOpen(true);
  };
  const handleSaveProductCategory = async () => {
    if (!editProdCat) return;
    setSavingDialog(true);
    const { error } = await supabase.from("products")
      .update({ pos_category_id: editProdCat.pos_category_id || null })
      .eq("id", editProdCat.id);
    setSavingDialog(false);
    if (error) { toast({ title: "فشل حفظ التصنيف", description: error.message, variant: "destructive" }); return; }
    setInventoryProducts(prev => prev.map((p: any) => p.id === editProdCat.id ? { ...p, pos_category_id: editProdCat.pos_category_id || null } : p));
    setEditProdCatOpen(false);
    toast({ title: "تم تحديث تصنيف الصنف" });
  };

  useEffect(() => {
    if (supplierId || defaultBranchId) savePrefs({ ...loadPrefs(), supplierId, branchId: defaultBranchId, cardSize });
  }, [supplierId, defaultBranchId, cardSize]);

  // وضع التعديل: تحميل الطلبية وبنودها والكميات المستلمة على كل بند
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      setEditLoading(true);
      const [{ data: reason }, { data: order, error: oErr }, { data: items }] = await Promise.all([
        supabase.rpc("procurement_order_edit_block_reason" as any, { p_order_id: editId }),
        supabase.from("procurement_orders" as any).select("*").eq("id", editId).maybeSingle(),
        supabase.from("procurement_order_items" as any).select("*").eq("order_id", editId),
      ]);
      if (cancelled) return;
      if (oErr || !order) { toast({ title: "تعذر تحميل الطلبية", variant: "destructive" }); navigate("/procurement/orders"); return; }
      if (reason) { toast({ title: "لا يمكن تعديل هذه الطلبية", description: String(reason), variant: "destructive" }); navigate("/procurement/orders"); return; }
      const ids = ((items as any[]) || []).map(i => i.id);
      const receivedById: Record<string, number> = {};
      if (ids.length) {
        const { data: inv } = await supabase.from("purchase_invoice_items" as any)
          .select("quantity, procurement_order_item_id, invoice_id").in("procurement_order_item_id", ids);
        const invIds = [...new Set(((inv as any[]) || []).map(r => r.invoice_id))];
        const active = new Set<string>();
        if (invIds.length) {
          const { data: invs } = await supabase.from("purchase_invoices" as any).select("id, status").in("id", invIds);
          ((invs as any[]) || []).forEach(v => { if (!["cancelled", "rejected"].includes(v.status || "")) active.add(v.id); });
        }
        ((inv as any[]) || []).forEach(r => {
          if (active.has(r.invoice_id)) receivedById[r.procurement_order_item_id] = (receivedById[r.procurement_order_item_id] || 0) + Number(r.quantity || 0);
        });
      }
      if (cancelled) return;
      const o: any = order;
      setEditOrder({ order_number: o.order_number, status: o.status });
      setSupplierId(o.supplier_id || "");
      setOrderDate(o.order_date || new Date().toISOString().split("T")[0]);
      setExpectedDate(o.expected_delivery_date || "");
      setNotes(o.notes || "");
      if (o.branch_id) setDefaultBranchId(o.branch_id);
      setLines(((items as any[]) || []).map(i => ({
        id: i.id, db_id: i.id, product_id: i.product_id, item_name: i.item_name, unit: i.unit || "قطعة",
        quantity: Number(i.quantity) || 0, unit_price: Number(i.unit_price) || 0, notes: i.notes || "",
        branch_id: i.branch_id || o.branch_id || "", received: receivedById[i.id] || 0,
      })));
      setEditLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // تحميل أصناف المخزون وتصنيفات نقطة البيع للتصفح بنمط نقطة البيع
  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    (async () => {
      const [cats, prods] = await Promise.all([
        supabase.from("pos_categories").select("id, name, color, sort_order, display_order")
          .eq("user_id", ownerId).eq("is_active", true)
          .order("sort_order").order("display_order"),
        // جلب كل الأصناف بدون سقف (الافتراضي 1000) — دفعات متتابعة
        (async () => {
          const all: any[] = [];
          const PAGE = 1000;
          for (let from = 0; ; from += PAGE) {
            const { data } = await supabase.from("products")
              .select("id, name, unit, pos_category_id, category, buy_price, barcode")
              .eq("user_id", ownerId).order("name")
              .range(from, from + PAGE - 1);
            if (!data || data.length === 0) break;
            all.push(...data);
            if (data.length < PAGE) break;
          }
          return all;
        })(),
      ]);
      if (cancelled) return;
      if (cats.data) setPosCats(cats.data as any[]);
      setInventoryProducts(prods as any[]);
      // وحدات الشراء المعرفة ببطاقة الصنف (product_units) — وحدة الشراء الافتراضية لكل منتج
      const { data: pu } = await supabase.from("product_units" as any)
        .select("product_id, unit_name, is_purchase, is_default")
        .eq("user_id", ownerId).eq("is_active", true);
      if (cancelled) return;
      const map: Record<string, string> = {};
      ((pu as any[]) || []).forEach(u => {
        const cur = map[u.product_id];
        if (!cur || u.is_purchase || u.is_default) map[u.product_id] = u.unit_name;
      });
      setPurchaseUnitByProduct(map);
    })();
    return () => { cancelled = true; };
  }, [ownerId]);

  useEffect(() => { searchRef.current?.focus(); }, [activePosCategory]);

  // ── التأكد من وجود صنف مشتريات مرتبط بالمنتج (ربط تلقائي) ──
  const ensureProcItem = useCallback(async (product: any): Promise<string | null> => {
    const cached = procIdByProductIdRef.current[product.id];
    if (cached) return cached;
    setEnsuringId(product.id);
    try {
      const { data, error } = await supabase.rpc("ensure_procurement_item_from_product", { p_product_id: product.id });
      if (error || !data) throw error || new Error("تعذر ربط الصنف");
      procIdByProductIdRef.current[product.id] = data as string;
      bumpProcIdVersion(v => v + 1);
      return data as string;
    } catch (e: any) {
      toast({ title: "تعذر إضافة الصنف للطلبية", description: e?.message || "", variant: "destructive" });
      return null;
    } finally {
      setEnsuringId(null);
    }
  }, []);

  // إضافة/تعديل بند: صنف مخزون يُربط تلقائيًا بكتالوج المشتريات أولًا، وصنف كتالوج فقط يُضاف مباشرة
  const handleItemAction = useCallback(async (item: any, delta: number) => {
    if (item.__catalogOnly) {
      addOrUpdateItem({ id: item.id, name: item.name, unit: item.unit || "قطعة", default_price: Number(item.default_price) || 0 }, delta);
      return;
    }
    const procId = await ensureProcItem(item);
    if (!procId) return;
    // وحدة الشراء من بطاقة الصنف (product_units) لها الأولوية على الوحدة العامة
    const unit = purchaseUnitByProduct[item.id] || item.unit || "قطعة";
    addOrUpdateItem({ id: procId, name: item.name, unit, default_price: Number(item.buy_price) || 0 }, delta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensureProcItem, defaultBranchId]);

  const mergedItems = useMemo(() => {
    const catalogOnly = allItems.filter((i: any) => !i.inventory_product_id).map((i: any) => ({ ...i, __catalogOnly: true }));
    return [...inventoryProducts, ...catalogOnly];
  }, [inventoryProducts, allItems]);

  const GRID_PAGE = 240;
  const [gridLimit, setGridLimit] = useState(GRID_PAGE);
  const filteredItems = useMemo(() => {
    let result: any[] = mergedItems;
    if (activePosCategory === "__uncat") result = result.filter((i: any) => !i.pos_category_id);
    else if (activePosCategory) result = result.filter((i: any) => i.pos_category_id === activePosCategory);
    if (searchQuery) {
      result = result.filter((i: any) => multiWordMatchAny(searchQuery, i.name));
    }
    return result;
  }, [mergedItems, activePosCategory, searchQuery]);
  useEffect(() => { setGridLimit(GRID_PAGE); }, [filteredItems]);

  const posCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let uncat = 0;
    mergedItems.forEach((i: any) => {
      if (i.pos_category_id) counts[i.pos_category_id] = (counts[i.pos_category_id] || 0) + 1;
      else uncat++;
    });
    return { counts, uncat };
  }, [mergedItems]);

  const getLineQuantity = (itemId: string) => lines.find(l => l.product_id === itemId)?.quantity || 0;
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const totalAmount = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  const addOrUpdateItem = useCallback((item: any, delta: number) => {
    setLines(prev => {
      const existing = prev.find(l => l.product_id === item.id);
      if (existing) {
        const newQty = existing.quantity + delta;
        if ((existing.received || 0) > 0 && newQty < (existing.received || 0)) {
          toast({ title: "لا يمكن النزول تحت الكمية المستلمة", description: `${existing.item_name}: ${existing.received}`, variant: "destructive" });
          return prev;
        }
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
  }, [defaultBranchId]);

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
  const removeLine = (id: string) => {
    const l = lines.find(x => x.id === id);
    if (l && (l.received || 0) > 0) {
      toast({ title: "لا يمكن حذف بند عليه استلام", description: l.item_name, variant: "destructive" });
      return;
    }
    setLines(prev => prev.filter(x => x.id !== id));
  };
  const clearAll = () => {
    if (lines.some(l => (l.received || 0) > 0)) {
      setLines(prev => prev.filter(l => (l.received || 0) > 0));
      toast({ title: "حُذفت البنود غير المستلمة فقط" });
      return;
    }
    setLines([]);
  };

  const handleSave = async (send: boolean) => {
    if (!supplierId) { toast({ title: "اختر المورد", variant: "destructive" }); return; }
    if (lines.length === 0) { toast({ title: "أضف صنفاً واحداً على الأقل", variant: "destructive" }); return; }
    const linesWithoutBranch = lines.filter(l => !l.branch_id);
    if (linesWithoutBranch.length > 0) { toast({ title: "حدد الفرع لجميع الأصناف", variant: "destructive" }); return; }
    const belowReceived = lines.find(l => (l.received || 0) > 0 && l.quantity < (l.received || 0));
    if (belowReceived) { toast({ title: "كمية أقل من المستلم", description: `${belowReceived.item_name}: المستلم ${belowReceived.received}`, variant: "destructive" }); return; }
    setSaving(true);
    const firstBranch = lines[0]?.branch_id || defaultBranchId || null;
    if (isEdit && editId) {
      const { error } = await supabase.rpc("update_procurement_order" as any, {
        p_order_id: editId,
        p_header: { supplier_id: supplierId, branch_id: firstBranch, order_date: orderDate, expected_delivery_date: expectedDate || null, notes },
        p_items: lines.map(l => ({ id: l.db_id || null, product_id: l.product_id, item_name: l.item_name, unit: l.unit, quantity: l.quantity, unit_price: l.unit_price, branch_id: l.branch_id, notes: l.notes })),
      });
      if (error) { setSaving(false); toast({ title: "تعذر حفظ التعديلات", description: error.message, variant: "destructive" }); return; }
      if (send && editOrder?.status === "draft") await updateStatus(editId, "sent");
      setSaving(false);
      toast({ title: "✅ تم حفظ تعديلات الطلبية" });
      navigate("/procurement/orders");
      return;
    }
    const result = await createOrder(
      { supplier_id: supplierId, branch_id: firstBranch, order_date: orderDate, expected_delivery_date: expectedDate, notes },
      lines.map(l => ({ product_id: l.product_id, item_name: l.item_name, unit: l.unit, quantity: l.quantity, unit_price: l.unit_price, branch_id: l.branch_id, notes: l.notes }))
    );
    if (result && send) await updateStatus((result as any).id, "sent");
    setSaving(false);
    if (result) navigate("/procurement/orders");
  };

  const handleAddSupplier = async () => {
    const name = newSupplier.name.trim();
    const phone = newSupplier.phone.trim() || null;
    if (!name) { toast({ title: "أدخل اسم المورد", variant: "destructive" }); return; }
    if (!ownerId) return;
    setSavingDialog(true);
    try {
      // 1) سجل المورد في دليل المشتريات (procurement_orders.supplier_id يشير إليه) — بدون تكرار بالاسم
      const { data: existingSup } = await supabase.from("pos_suppliers")
        .select("id").eq("user_id", ownerId).eq("name", name).limit(1).maybeSingle();
      let supId = (existingSup as any)?.id as string | undefined;
      if (!supId) {
        const { data: created, error } = await supabase.from("pos_suppliers")
          .insert({ user_id: ownerId, name, phone } as any).select("id").single();
        if (error) throw error;
        supId = (created as any).id;
      }

      // 2) جهة الاتصال (هي ما تعرضه قائمة اختيار المورد) + الحساب الفرعي للمورد
      const { data: existingC } = await supabase.from("contacts")
        .select("id").eq("user_id", ownerId).eq("contact_name", name).eq("contact_type", "مورد").limit(1).maybeSingle();
      if (!existingC) {
        const { data: newC, error: cErr } = await supabase.from("contacts").insert({
          user_id: ownerId, contact_name: name, contact_type: "مورد",
          phone, is_active: true, linked_account_code: null,
        } as any).select("id").single();
        if (cErr) throw cErr;
        const { ensureContactSubAccount } = await import("@/lib/contactAccountResolver");
        try {
          await ensureContactSubAccount({ ownerId, contactId: (newC as any).id, contactType: "مورد", contactName: name });
        } catch (e) { console.error("ensureContactSubAccount failed:", e); }
      }

      toast({ title: "✅ تم حفظ المورد واختياره" });
      setSupplierId(supId!);
      setSupplierOpen(false);
      setNewSupplier({ name: "", phone: "" });
      setSupplierPickerKey(k => k + 1);
      refetchSuppliers(); suppliersCrud.refetch();
    } catch (e: any) {
      toast({ title: "تعذر حفظ المورد", description: e?.message, variant: "destructive" });
    } finally {
      setSavingDialog(false);
    }
  };

  const handleAddBranch = async () => {
    if (!newBranch.name.trim()) { toast({ title: "أدخل اسم الفرع", variant: "destructive" }); return; }
    setSavingDialog(true);
    const { error } = await supabase.from("branches").insert({
      name: newBranch.name, address: newBranch.address || null,
      latitude: newBranch.latitude, longitude: newBranch.longitude,
      user_id: ownerId, is_active: true, radius_meters: 500,
    } as any);
    setSavingDialog(false);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    toast({ title: "تم إضافة الفرع" });
    setBranchOpen(false); setNewBranch({ name: "", address: "", latitude: 31.9, longitude: 35.2 });
    refetchBranches();
  };

  const handleAddItem = async () => {
    if (!newItem.name.trim()) { toast({ title: "أدخل اسم الصنف", variant: "destructive" }); return; }
    if (!newItem.unit.trim()) { toast({ title: "أدخل الوحدة", variant: "destructive" }); return; }
    if (!newItem.category_id) { toast({ title: "اختر التصنيف", variant: "destructive" }); return; }
    if (!DEFAULT_UNITS.includes(newItem.unit)) { saveCustomUnit(newItem.unit); setUnitOptions(prev => [...new Set([...prev, newItem.unit])]); }
    setSavingDialog(true);
    const ok = await itemsCrud.create({
      name: newItem.name, category_id: newItem.category_id,
      unit: newItem.unit, default_price: newItem.default_price || 0,
      notes: newItem.notes || null, is_active: true, sort_order: 0,
    });
    // الربط بالمخزون يتم تلقائياً في قاعدة البيانات (نفس المنتج، نفس التصنيف)
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

  const gridCols = cardSize === "small" ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" : cardSize === "medium" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <TooltipProvider>
      <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden" dir="rtl">
        {/* ═══ HEADER (D365 FinanceShell style) ═══ */}
        <div className="shrink-0 border-b border-border bg-card">
          {/* Row 1: Title + command strip + totals */}
          <div className="px-3 h-11 flex items-center gap-1 border-b border-border/50">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(-1)} aria-label="رجوع">
              <ArrowRight className="h-4 w-4" />
            </Button>
            <span className="font-bold text-sm text-foreground whitespace-nowrap ms-1 me-3">{isEdit ? `تعديل طلبية ${editOrder?.order_number || ""}` : "طلب مشتريات جديد"}</span>

            <div className="flex items-center gap-0.5 border-s border-border ps-2 overflow-x-auto">
              <Button size="sm" className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => handleSave(!isEdit || editOrder?.status === "draft")} disabled={saving || editLoading || !supplierId || lines.length === 0}>
                {isEdit ? <><Save className="h-3.5 w-3.5" />حفظ التعديلات</> : <><Send className="h-3.5 w-3.5" />حفظ وترحيل</>}
              </Button>
              {(!isEdit || editOrder?.status === "draft") && (
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={() => handleSave(false)} disabled={saving || editLoading}>
                  <Save className="h-3.5 w-3.5" />{isEdit ? "حفظ كمسودة" : "حفظ مسودة"}
                </Button>
              )}
              <span className="w-px h-5 bg-border mx-1" />
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setItemOpen(true)}>
                <Plus className="h-3.5 w-3.5" />صنف جديد
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setCategoryOpen(true)}>
                <FolderPlus className="h-3.5 w-3.5" />تصنيف
              </Button>
              {lines.length > 0 && (
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive" onClick={clearAll}>
                  <Trash2 className="h-3.5 w-3.5" />مسح البنود
                </Button>
              )}
              <span className="w-px h-5 bg-border mx-1" />
              <div className="flex items-center gap-0.5">
                {(["large", "medium", "small"] as CardSize[]).map(size => {
                  const Icon = size === "large" ? Grid2X2 : size === "medium" ? LayoutGrid : Grid3X3;
                  const label = size === "large" ? "بطاقات كبيرة" : size === "medium" ? "بطاقات متوسطة" : "بطاقات صغيرة";
                  return (
                    <Tooltip key={size}><TooltipTrigger asChild>
                      <button onClick={() => { setCardSize(size); savePrefs({ ...loadPrefs(), cardSize: size }); }} aria-label={label}
                        className={`p-1.5 rounded ${cardSize === size ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
                  );
                })}
              </div>
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/procurement/settings")} aria-label="إعدادات المشتريات">
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger><TooltipContent>إعدادات المشتريات</TooltipContent></Tooltip>
            </div>

            <div className="hidden sm:flex items-center gap-4 text-xs ms-auto ps-3 whitespace-nowrap">
              <span className="text-muted-foreground">الأصناف: <b className="text-foreground">{lines.length}</b></span>
              <span className="text-muted-foreground">الكمية: <b className="text-foreground">{totalQty}</b></span>
              <span className="text-muted-foreground">الإجمالي: <b className="text-foreground">{totalAmount.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</b></span>
            </div>
          </div>

          {/* Row 2: Search + Supplier, Dates, Branch */}
          <div className="px-3 py-1.5 flex items-center gap-3 flex-wrap">
            <div className="relative w-full sm:w-[220px]">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input ref={searchRef} placeholder="ابحث عن صنف..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} className="h-8 pr-8 text-xs" />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">المورد:</Label>
              <SupplierPicker refreshKey={supplierPickerKey} suppliers={allSuppliers as any} value={supplierId} onChange={setSupplierId} ownerId={ownerId} onSuppliersChanged={() => { refetchSuppliers(); suppliersCrud.refetch(); }} />
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary" onClick={() => setSupplierOpen(true)} aria-label="إضافة مورد جديد">
                  <UserPlus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger><TooltipContent>إضافة مورد جديد</TooltipContent></Tooltip>
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">تاريخ الطلب:</Label>
              <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="h-8 w-[135px] text-xs" />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">التسليم المتوقع:</Label>
              <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className="h-8 w-[135px] text-xs" />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">الفرع:</Label>
              <Select value={defaultBranchId} onValueChange={v => {
                setDefaultBranchId(v);
                setLines(prev => {
                  if (prev.length === 0) return prev;
                  toast({ title: "تم تطبيق الفرع على جميع الأصناف" });
                  return prev.map(l => ({ ...l, branch_id: v }));
                });
              }}>
                <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                <SelectContent>{branches.map((b: any) => <SelectItem key={b.id} value={b.id} className="text-xs">{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ═══ MAIN 2-COLUMN ═══ */}
        <div className="flex-1 flex min-h-0">
          {/* CENTER: Categories + Items Grid */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Category chips — wrapping rows (all visible, no scroll) */}
            <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-1.5 max-h-40 overflow-y-auto">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setActivePosCategory(null)}
                  className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                    !activePosCategory ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"
                  }`}
                >
                  الكل <span className="text-[10px] opacity-80">({mergedItems.length})</span>
                </button>
                {posCats.map((cat: any) => {
                  const isActive = activePosCategory === cat.id;
                  const count = posCategoryCounts.counts[cat.id] || 0;
                  if (count === 0) return null;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActivePosCategory(isActive ? null : cat.id)}
                      className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                        isActive ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"
                      }`}
                    >
                      <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cat.color || "#6b7280" }} />
                      <span>{cat.name}</span>
                      <span className="text-[10px] opacity-80">({count})</span>
                    </button>
                  );
                })}
                {posCategoryCounts.uncat > 0 && (
                  <button
                    onClick={() => setActivePosCategory(activePosCategory === "__uncat" ? null : "__uncat")}
                    className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                      activePosCategory === "__uncat" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"
                    }`}
                  >
                    <Package className="h-3.5 w-3.5" />
                    غير مصنف <span className="text-[10px] opacity-80">({posCategoryCounts.uncat})</span>
                  </button>
                )}
              </div>
            </div>


            {/* Grid */}
            <div
              key={`grid-${filteredItems.length}-${filteredItems[0]?.id ?? ""}`}
              className={`flex-1 overflow-y-auto p-2 grid ${gridCols} gap-1.5 auto-rows-min content-start`}
              onScroll={e => {
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight > el.scrollHeight - 600) {
                  const cur = Number(el.dataset.limit || GRID_PAGE);
                  if (cur < filteredItems.length) {
                    el.dataset.limit = String(cur + GRID_PAGE);
                    setGridLimit(cur + GRID_PAGE);
                  }
                }
              }}
            >
              {filteredItems.slice(0, gridLimit).map((item: any) => {
                const isInventory = !item.__catalogOnly;
                const procId = isInventory ? procIdByProductIdRef.current[item.id] : item.id;
                const qty = procId ? getLineQuantity(procId) : 0;
                const catColor = getCategoryColor(item.category_id);
                const isInOrder = qty > 0;

                return (
                  <div
                    key={item.id}
                    className={`relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 select-none group hover:shadow-md active:scale-[0.97] border-2 ${
                      isInOrder
                        ? "border-[#2D7A4F] bg-[#2D7A4F]/10 dark:bg-[#2D7A4F]/20 shadow-sm"
                        : "border-border bg-card hover:border-primary/40 hover:shadow-sm"
                    } ${ensuringId === item.id ? "opacity-60 pointer-events-none animate-pulse" : ""}`}
                    onClick={() => handleItemAction(item, 1)}
                    onContextMenu={e => { e.preventDefault(); if (!isInventory) openEditItem(item); }}
                  >
                    {/* Quantity badge */}
                    {isInOrder && (
                      <div className="absolute top-1 left-1 z-10 bg-[#2D7A4F] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">{qty}</div>
                    )}
                    <button
                      className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-primary transition-opacity"
                      title={isInventory ? "تغيير التصنيف" : "تعديل الصنف"}
                      onClick={e => { e.stopPropagation(); isInventory ? openEditProductCategory(item) : openEditItem(item); }}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>

                    <div className="px-2.5 py-2.5">
                      {searchQuery ? (
                        <p className="text-sm font-semibold leading-tight mb-0.5 text-right" dangerouslySetInnerHTML={{ __html: highlightSearchWords(item.name, searchQuery) }} />
                      ) : (
                        <p className="text-sm font-semibold leading-tight mb-0.5 text-right">{item.name}</p>
                      )}
                      <p className="text-xs text-muted-foreground text-right">{item.unit}</p>
                      {cardSize === "large" && (
                        <p className={`text-xs mt-0.5 text-right ${
                          Number(isInventory ? item.buy_price : item.default_price) > 0 ? "text-muted-foreground" : "text-orange-400"
                        }`}>
                          {Number(isInventory ? item.buy_price : item.default_price) > 0
                            ? `${Number(isInventory ? item.buy_price : item.default_price).toFixed(2)} ₪`
                            : "بدون سعر"}
                        </p>
                      )}
                      {/* Inline quantity controls */}
                      {isInOrder && (
                        <div className="flex items-center justify-between mt-2 gap-1" onClick={e => e.stopPropagation()}>
                          <button className="w-7 h-7 rounded-md bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                            onClick={() => handleItemAction(item, -1)}>
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center font-bold text-sm text-foreground">{qty}</span>
                          <button className="w-7 h-7 rounded-md bg-[#2D7A4F] hover:bg-[#246B42] text-white flex items-center justify-center transition-colors"
                            onClick={() => handleItemAction(item, 1)}>
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
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
          <div className={`${mobileCartOpen ? "fixed inset-0 z-50 flex" : "hidden"} md:static md:flex w-full md:w-[440px] xl:w-[520px] shrink-0 border-r border-border bg-card flex-col overflow-hidden`}>
            <div className="shrink-0 px-3 py-2.5 border-b border-border flex items-center justify-between">
              <span className="text-sm font-bold flex items-center gap-1.5">
                بنود الطلبية
                {lines.length > 0 && <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{lines.length}</Badge>}
              </span>
              <div className="flex items-center gap-2">
                {lines.length > 0 && (
                  <button onClick={clearAll} className="text-xs text-destructive hover:underline flex items-center gap-1">
                    <Trash2 className="h-3.5 w-3.5" />
                    مسح الكل
                  </button>
                )}
                <button onClick={() => setMobileCartOpen(false)} className="md:hidden p-1 text-muted-foreground hover:text-foreground" aria-label="إغلاق السلة">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {lines.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-xs">اضغط على أي صنف لإضافته</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {lines.map(line => (
                    <div key={line.id} className="px-2 py-1.5">
                      {/* Row 1: name + total + delete */}
                      <div className="flex items-center justify-between gap-1">
                        <button type="button" onClick={() => setEditingNoteId(editingNoteId === line.id ? null : line.id)} className="text-xs font-semibold leading-tight truncate text-start hover:underline" title="اضغط لإضافة ملاحظة">{line.item_name}{line.notes && <span className="block text-[10px] font-normal text-[#D97706] truncate">📝 {line.notes}</span>}{(line.received || 0) > 0 && <span className="block text-[10px] font-normal text-primary">مستلم: {line.received}</span>}</button>
                        <div className="flex items-center gap-1 shrink-0">
                          <LineTotalInput quantity={line.quantity} unitPrice={line.unit_price}
                            onPrice={p => updateLine(line.id, "unit_price", p)} />
                          <button onClick={() => removeLine(line.id)} disabled={(line.received || 0) > 0} className="text-muted-foreground hover:text-destructive p-0.5 disabled:opacity-30 disabled:cursor-not-allowed">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Row 2: qty controls + price + unit + note */}
                      <div className="flex items-center gap-1 mt-1">
                        <button className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors shrink-0"
                          onClick={() => { if ((line.received || 0) > 0 && line.quantity - 1 < (line.received || 0)) return; if (line.quantity > 1) updateLine(line.id, "quantity", line.quantity - 1); else removeLine(line.id); }}>
                          <Minus className="h-3 w-3" />
                        </button>
                        <Input type="number" value={line.quantity} min={0.001} step="any"
                          onChange={e => updateLine(line.id, "quantity", Number(e.target.value))}
                          className="h-6 w-12 text-center text-xs font-bold px-0" />
                        <button className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors shrink-0"
                          onClick={() => updateLine(line.id, "quantity", line.quantity + 1)}>
                          <Plus className="h-3 w-3" />
                        </button>
                        <span className="text-[10px] text-muted-foreground shrink-0">{line.unit} ×</span>
                        <Input type="number" value={line.unit_price} min={0} step="any"
                          onChange={e => updateLine(line.id, "unit_price", Number(e.target.value))}
                          className={`h-6 w-16 text-center text-xs px-0 ${line.unit_price === 0 ? "border-[#D97706] bg-[#D97706]/10" : ""}`}
                          placeholder="سعر" />
                        <button onClick={() => setEditingNoteId(editingNoteId === line.id ? null : line.id)}
                          className={`p-0.5 rounded shrink-0 ${line.notes ? "text-[#D97706]" : "text-muted-foreground"} hover:text-foreground`}>
                          <StickyNote className="h-3 w-3" />
                        </button>
                        <Select value={line.branch_id || ""} onValueChange={v => updateLine(line.id, "branch_id", v)}>
                          <SelectTrigger title={branches.find((b: any) => b.id === line.branch_id)?.name || "حدد الفرع"} className={`h-6 w-6 p-0 justify-center shrink-0 [&>svg:last-child]:hidden ${line.branch_id ? "text-primary" : "border-[#D97706] bg-[#D97706]/10 text-[#D97706] animate-pulse"}`}>
                            <MapPin className="h-3.5 w-3.5" />
                          </SelectTrigger>
                          <SelectContent>{branches.map((b: any) => <SelectItem key={b.id} value={b.id} className="text-xs">{b.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>

                      {editingNoteId === line.id && (
                        <Input value={line.notes} placeholder="ملاحظة..."
                          onChange={e => updateLine(line.id, "notes", e.target.value)}
                          className="h-6 text-xs mt-1" autoFocus />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-border px-3 py-2 bg-muted/20 space-y-2">
              <div className="flex items-center gap-1.5">
                <StickyNote className={`h-4 w-4 shrink-0 ${notes ? "text-[#D97706]" : "text-muted-foreground"}`} />
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظة على الطلبية كاملة..." className="h-8 text-xs" />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">المجموع التقديري</span>
                <span className="font-bold text-base">{totalAmount.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ MOBILE CART BAR ═══ */}
        <div className="md:hidden shrink-0 border-t border-border bg-card">
          <button onClick={() => setMobileCartOpen(true)} className="w-full px-4 py-3 flex items-center justify-between gap-2">
            <span className="text-sm font-bold flex items-center gap-1.5">
              بنود الطلبية
              {lines.length > 0 && <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{lines.length}</Badge>}
            </span>
            <span className="text-sm font-bold">{totalAmount.toLocaleString("en", { minimumFractionDigits: 2 })} ₪</span>
          </button>
        </div>

        {/* ═══ DIALOGS ═══ */}

        {/* Manual Item */}
        <Dialog open={manualOpen} onOpenChange={setManualOpen}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>إضافة صنف يدوي</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">اسم الصنف *</Label><Input value={manualItem.item_name} onChange={e => setManualItem({...manualItem, item_name: e.target.value})} placeholder="اسم الصنف" className="text-sm" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">الوحدة</Label><ProductUnitSelect value={manualItem.unit} onChange={v => setManualItem({...manualItem, unit: v})} ownerId={ownerId} /></div>
                <div><Label className="text-xs">الكمية</Label><Input type="number" value={manualItem.quantity} onChange={e => setManualItem({...manualItem, quantity: Number(e.target.value)})} className="text-sm" /></div>
                <div><Label className="text-xs">السعر</Label><Input type="number" value={manualItem.unit_price || ""} onChange={e => setManualItem({...manualItem, unit_price: Number(e.target.value)})} className="text-sm" /></div>
              </div>
              <div><Label className="text-xs">ملاحظة</Label><Input value={manualItem.notes} onChange={e => setManualItem({...manualItem, notes: e.target.value})} className="text-sm" /></div>
              <Button className="w-full gap-1.5" onClick={addManual}><Plus className="h-4 w-4" />إضافة للطلبية</Button>
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
                  <ProductUnitSelect value={newItem.unit} onChange={v => setNewItem({...newItem, unit: v})} ownerId={ownerId} />
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
                    const Ic = iconMap[iconKey] || Package;
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

        {/* تغيير تصنيف صنف مخزون بسرعة */}
        <Dialog open={editProdCatOpen} onOpenChange={setEditProdCatOpen}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>تغيير تصنيف: {editProdCat?.name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">التصنيف</Label>
                <Select value={editProdCat?.pos_category_id || "__none"} onValueChange={v => setEditProdCat(prev => prev ? { ...prev, pos_category_id: v === "__none" ? "" : v } : prev)}>
                  <SelectTrigger className="text-sm" dir="rtl"><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="__none">بدون تصنيف</SelectItem>
                    {posCats.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: c.color || "#888" }} />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={handleSaveProductCategory} disabled={savingDialog}>{savingDialog ? "جاري الحفظ..." : "حفظ التصنيف"}</Button>
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
                    <ProductUnitSelect value={editItem.unit} onChange={v => setEditItem({...editItem, unit: v})} ownerId={ownerId} />
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

/**
 * إجمالي البند قابل للتعديل: المستخدم يكتب المجموع، ويُحسب سعر الوحدة = المجموع ÷ الكمية.
 * يُحفظ النص أثناء الكتابة محليًا كي لا يقفز الرقم بسبب التقريب، ويعود للقيمة المحسوبة عند الخروج.
 */
function LineTotalInput({ quantity, unitPrice, onPrice }: { quantity: number; unitPrice: number; onPrice: (p: number) => void }) {
  const computed = Math.round(quantity * unitPrice * 100) / 100;
  const [draft, setDraft] = useState<string | null>(null);
  const canSplit = quantity > 0;
  return (
    <span className="flex items-center gap-0.5 self-center">
      <Input
        type="number" inputMode="decimal" min={0} step="any" dir="ltr"
        value={draft ?? String(computed)}
        disabled={!canSplit}
        title={canSplit ? "اكتب المجموع ليُحسب سعر الوحدة تلقائيًا" : "أدخل الكمية أولًا"}
        onFocus={e => { setDraft(String(computed)); e.currentTarget.select(); }}
        onChange={e => {
          const raw = e.target.value;
          setDraft(raw);
          const total = Number(raw);
          if (raw.trim() === "" || !Number.isFinite(total) || total < 0 || !canSplit) return;
          // سعر الوحدة بست خانات عشرية حتى يرجع المجموع كما كتبه المستخدم بالضبط (400 ÷ 230 = 1.739130)
          onPrice(Math.round((total / quantity) * 1e6) / 1e6);
        }}
        onBlur={() => setDraft(null)}
        className="h-6 w-20 text-center text-xs font-bold px-1"
      />
      <span className="text-xs font-bold">₪</span>
    </span>
  );
}
