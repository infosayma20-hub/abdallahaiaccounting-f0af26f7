/**
 * OrderFormPage — thin shell that composes:
 * - useOrderForm  (data + save logic)
 * - buildOrderTabs (tab renderers)
 * - QuickAddProductDialog (inline quick product creation)
 *
 * All UI pieces live under src/pages/orders/form/.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { isOrderProcurementLinkEnabled } from "@/config/orderProcurementLink";
import { Button } from "@/components/ui/button";
import { FinanceShell, FastTabs } from "@/components/finance/shell";
import { useOrderForm } from "./orders/form/useOrderForm";
import { buildOrderTabs } from "./orders/form/OrderFormTabs";
import { QuickAddProductDialog, type QuickAddForm } from "./orders/form/components/QuickAddProductDialog";

const DEFAULT_QA: QuickAddForm = {
  name: "",
  category: "بضاعة عامة",
  unit: "قطعة",
  sell_price: 0,
  buy_price: 0,
  quantity: 0,
  min_quantity: 0,
};

export default function OrderFormPage() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const procurementLinkEnabled = isOrderProcurementLinkEnabled(dataOwnerId || user?.id);
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();

  const {
    form, setForm,
    items, setItems,
    products, setProducts,
    contacts, setContacts,
    suppliers, createSupplier,

    loading, saving,
    addItem, updateItem, removeItem, recalcTotal,
    handleSave,
    isEdit,
  } = useOrderForm({ user, editId });

  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [cityOpen, setCityOpen] = useState(false);

  // Quick-add product dialog state
  const [qaOpen, setQaOpen] = useState(false);
  const [qaTargetIdx, setQaTargetIdx] = useState<number | null>(null);
  const [qaSaving, setQaSaving] = useState(false);
  const [qaForm, setQaForm] = useState<QuickAddForm>(DEFAULT_QA);

  const categorySuggestions = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => { if (p.category) s.add(p.category); });
    return Array.from(s).sort();
  }, [products]);

  const openQuickAdd = (idx: number, prefillName = "") => {
    setQaTargetIdx(idx);
    setQaForm({
      ...DEFAULT_QA,
      name: prefillName || items[idx]?.product_name || "",
      sell_price: items[idx]?.unit_price || 0,
    });
    setQaOpen(true);
  };

  const handleQuickAddSave = async () => {
    if (!user) return;
    if (!qaForm.name.trim()) { toast.error("اسم المنتج مطلوب"); return; }
    setQaSaving(true);
    try {
      const payload: any = {
        user_id: user.id,
        name: qaForm.name.trim(),
        category: (qaForm.category || "بضاعة عامة").trim(),
        unit: (qaForm.unit || "قطعة").trim(),
        sell_price: Number(qaForm.sell_price) || 0,
        buy_price: Number(qaForm.buy_price) || 0,
        quantity: Number(qaForm.quantity) || 0,
        min_quantity: Number(qaForm.min_quantity) || 0,
        product_type: "product",
        source: "manual",
      };
      const { data, error } = await supabase.from("products").insert(payload).select().single();
      if (error) throw error;
      setProducts((prev) => [...prev, data]);
      if (qaTargetIdx !== null) {
        const next = [...items];
        const row = next[qaTargetIdx];
        if (row) {
          row.product_id = data.id;
          row.product_name = data.name;
          row.unit_price = Number(data.sell_price) || row.unit_price || 0;
          row.total = row.quantity * row.unit_price - row.discount;
          setItems(next);
          recalcTotal(next);
        }
      }
      toast.success(`تمت إضافة "${data.name}" ✅`);
      setQaOpen(false);
    } catch (e: any) {
      toast.error("خطأ في الإضافة: " + (e?.message || ""));
    } finally {
      setQaSaving(false);
    }
  };

  const createContact = async (name: string) => {
    if (!user) return;
    const { data, error } = await supabase.from("contacts").insert({
      user_id: user.id,
      contact_name: name,
      contact_type: "عميل",
      phone: form.customer_phone || null,
      address: form.customer_address || null,
      is_active: true,
    } as any).select("id, contact_name, phone, address, contact_type").single();
    if (error) { toast.error(error.message); return; }
    if (data) {
      setContacts((prev) => [...prev, data]);
      setForm((prev) => ({ ...prev, customer_name: data.contact_name }));
      toast.success("تم إضافة العميل");
    }
  };

  const tabs = useMemo(
    () => buildOrderTabs({
      form, setForm, items, products, contacts, suppliers,
      ownerId: user?.id ?? null,
      procurementLinkEnabled,
      customerOpen, setCustomerOpen, customerSearch, setCustomerSearch,
      cityOpen, setCityOpen,
      onCreateContact: createContact,
      onCreateSupplier: createSupplier,
      addItem, updateItem, removeItem,
      openQuickAdd,
    }),
    [form, items, products, contacts, suppliers, customerOpen, customerSearch, cityOpen, user?.id, procurementLinkEnabled]
  );

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground" dir="rtl">جاري تحميل الطلبية...</div>;
  }

  return (
    <FinanceShell
      title={isEdit ? "تعديل الطلبية" : "طلبية جديدة"}
      subtitle={isEdit ? `تحديث بيانات الطلبية ${editId?.slice(0, 8)}` : "إنشاء طلبية بيع جديدة وتعقّب حالتها"}
      breadcrumb={[{ label: "المبيعات" }, { label: "الطلبيات", href: "/orders" }, { label: isEdit ? "تعديل" : "جديد" }]}
      rightSlot={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => navigate("/orders")}>
            <X className="h-3.5 w-3.5" /> إلغاء
          </Button>
          <Button size="sm" className="h-8 gap-1.5" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5" /> {saving ? "جاري الحفظ..." : (isEdit ? "حفظ التعديلات" : "إنشاء الطلبية")}
          </Button>
        </div>
      }
    >
      <div className="max-w-5xl mx-auto">
        <FastTabs items={tabs} />
        <div className="h-16" />
      </div>

      <QuickAddProductDialog
        open={qaOpen}
        onOpenChange={setQaOpen}
        form={qaForm}
        setForm={setQaForm}
        saving={qaSaving}
        onSave={handleQuickAddSave}
        categorySuggestions={categorySuggestions}
      />
    </FinanceShell>
  );
}
