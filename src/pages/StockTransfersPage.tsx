import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus, ArrowLeftRight, Truck, Building2, Warehouse, Box,
  CheckCircle2, XCircle, Trash2, Loader2, Package, Search, X, FileText,
  RefreshCw, FileSpreadsheet, Printer, Info, User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { multiWordMatchAny } from "@/lib/utils";
import { FinanceShell, ActionPane } from "@/components/finance/shell";
import type { ActionTab } from "@/components/finance/shell";
import EmptyState from "@/components/EmptyState";

type TransferType = "load_van" | "return_van" | "transfer" | "adjustment";
type TransferStatus = "draft" | "confirmed" | "cancelled";

interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  warehouse_type: "main" | "branch" | "van" | "virtual";
  sales_rep_id: string | null;
}

interface TransferRow {
  id: string;
  transfer_number: string;
  transfer_date: string;
  transfer_type: TransferType;
  status: TransferStatus;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  sales_rep_id: string | null;
  total_items: number;
  total_quantity: number;
  total_value: number;
  notes: string | null;
  from_warehouse?: { name: string; warehouse_type: string };
  to_warehouse?: { name: string; warehouse_type: string };
  sales_rep?: { full_name: string };
}

interface ItemDraft {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
}

interface ProductRow {
  id: string;
  name: string;
  unit: string | null;
  buy_price: number;
  quantity: number;
}

const TYPE_META: Record<TransferType, { label: string; icon: any; color: string }> = {
  load_van: { label: "تحميل بائع", icon: Truck, color: "text-muted-foreground" },
  return_van: { label: "إرجاع من بائع", icon: ArrowLeftRight, color: "text-muted-foreground" },
  transfer: { label: "تحويل بين مستودعات", icon: ArrowLeftRight, color: "text-muted-foreground" },
  adjustment: { label: "تسوية / تعديل", icon: Box, color: "text-muted-foreground" },
};

const STATUS_META: Record<TransferStatus, { label: string; cls: string }> = {
  draft:     { label: "مسودة", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400" },
  confirmed: { label: "مؤكد",  cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400" },
  cancelled: { label: "ملغى",  cls: "bg-destructive/10 text-destructive border-destructive/20" },
};

const WH_ICON: Record<string, any> = { main: Warehouse, branch: Building2, van: Truck, virtual: Box };

const StockTransfersPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [reps, setReps] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | TransferStatus>("all");

  const [form, setForm] = useState({
    transfer_type: "load_van" as TransferType,
    from_warehouse_id: "",
    to_warehouse_id: "",
    sales_rep_id: "",
    notes: "",
    transfer_date: new Date().toISOString().slice(0, 10),
  });

  const [items, setItems] = useState<ItemDraft[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showProdDropdown, setShowProdDropdown] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [w, r, t, p] = await Promise.all([
      supabase.from("warehouses" as any).select("id, code, name, warehouse_type, sales_rep_id")
        .eq("user_id", user.id).eq("is_active", true).order("warehouse_type").order("name"),
      supabase.from("sales_representatives").select("id, full_name, default_warehouse_id")
        .eq("user_id", user.id).eq("is_active", true).order("full_name"),
      supabase.from("stock_transfers" as any).select(`
        id, transfer_number, transfer_date, transfer_type, status,
        from_warehouse_id, to_warehouse_id, sales_rep_id,
        total_items, total_quantity, total_value, notes,
        from_warehouse:warehouses!stock_transfers_from_warehouse_id_fkey(name, warehouse_type),
        to_warehouse:warehouses!stock_transfers_to_warehouse_id_fkey(name, warehouse_type),
        sales_rep:sales_representatives(full_name)
      `).eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("products").select("id, name, unit, buy_price, quantity")
        .eq("user_id", user.id).order("name"),
    ]);
    setWarehouses(((w.data as any) || []) as WarehouseRow[]);
    setReps(r.data || []);
    setTransfers(((t.data as any) || []) as TransferRow[]);
    setProducts(((p.data as any) || []) as ProductRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Auto-suggest from/to warehouses based on transfer type
  useEffect(() => {
    if (!showForm) return;
    const main = warehouses.find(w => w.warehouse_type === "main");
    if (form.transfer_type === "load_van") {
      if (!form.from_warehouse_id && main) setForm(f => ({ ...f, from_warehouse_id: main.id }));
    } else if (form.transfer_type === "return_van") {
      if (!form.to_warehouse_id && main) setForm(f => ({ ...f, to_warehouse_id: main.id }));
    }
  }, [form.transfer_type, showForm, warehouses]);

  // When sales rep selected → auto-fill van warehouse
  useEffect(() => {
    if (!form.sales_rep_id) return;
    const rep = reps.find(r => r.id === form.sales_rep_id);
    if (!rep?.default_warehouse_id) return;
    if (form.transfer_type === "load_van" && !form.to_warehouse_id) {
      setForm(f => ({ ...f, to_warehouse_id: rep.default_warehouse_id }));
    } else if (form.transfer_type === "return_van" && !form.from_warehouse_id) {
      setForm(f => ({ ...f, from_warehouse_id: rep.default_warehouse_id }));
    }
  }, [form.sales_rep_id]);

  const filteredTransfers = useMemo(
    () => statusFilter === "all" ? transfers : transfers.filter(t => t.status === statusFilter),
    [transfers, statusFilter]
  );

  const filteredProducts = useMemo(
    () => products.filter(p => multiWordMatchAny(productSearch, p.name)).slice(0, 15),
    [products, productSearch]
  );

  const totalValue = useMemo(
    () => items.reduce((s, i) => s + (i.quantity * i.unit_cost), 0),
    [items]
  );

  const resetForm = () => {
    setForm({
      transfer_type: "load_van", from_warehouse_id: "", to_warehouse_id: "",
      sales_rep_id: "", notes: "", transfer_date: new Date().toISOString().slice(0, 10),
    });
    setItems([]);
    setProductSearch("");
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const addProduct = (p: ProductRow) => {
    if (items.find(i => i.product_id === p.id)) {
      toast({ title: "المنتج مضاف مسبقاً" });
      return;
    }
    setItems(prev => [...prev, {
      product_id: p.id, product_name: p.name, unit: p.unit || "قطعة",
      quantity: 1, unit_cost: p.buy_price || 0,
    }]);
    setProductSearch("");
    setShowProdDropdown(false);
  };

  const updateItem = (idx: number, field: keyof ItemDraft, val: any) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const validate = (): string | null => {
    if (!form.from_warehouse_id) return "حدد مستودع المصدر";
    if (!form.to_warehouse_id) return "حدد مستودع الوجهة";
    if (form.from_warehouse_id === form.to_warehouse_id) return "المستودعات يجب أن تكون مختلفة";
    if (items.length === 0) return "أضف بنداً واحداً على الأقل";
    if (items.some(i => !i.quantity || i.quantity <= 0)) return "كل الكميات يجب أن تكون أكبر من صفر";
    return null;
  };

  const saveDraft = async (confirmAfter: boolean) => {
    if (!user) return;
    const err = validate();
    if (err) { toast({ title: err, variant: "destructive" }); return; }

    setSaving(true);
    try {
      const { data: transfer, error: tErr } = await supabase
        .from("stock_transfers" as any)
        .insert({
          user_id: user.id,
          transfer_type: form.transfer_type,
          from_warehouse_id: form.from_warehouse_id,
          to_warehouse_id: form.to_warehouse_id,
          sales_rep_id: form.sales_rep_id || null,
          transfer_date: form.transfer_date,
          notes: form.notes.trim() || null,
          status: "draft",
          created_by: user.id,
          total_items: items.length,
          total_quantity: items.reduce((s, i) => s + i.quantity, 0),
          total_value: totalValue,
        })
        .select("id")
        .single();
      if (tErr) throw tErr;

      const tid = (transfer as any).id;
      const itemsPayload = items.map(it => ({
        transfer_id: tid,
        user_id: user.id,
        product_id: it.product_id,
        product_name: it.product_name,
        unit: it.unit,
        quantity: it.quantity,
        unit_cost: it.unit_cost,
        line_total: it.quantity * it.unit_cost,
      }));
      const { error: iErr } = await supabase.from("stock_transfer_items" as any).insert(itemsPayload);
      if (iErr) throw iErr;

      if (confirmAfter) {
        const { data: rpcRes, error: rErr } = await supabase
          .rpc("confirm_stock_transfer" as any, { p_transfer_id: tid });
        if (rErr) throw rErr;
        if ((rpcRes as any)?.success === false) throw new Error((rpcRes as any).error);
        toast({ title: "تم تأكيد السند", description: "تم تحديث المخزون في المستودعين" });
      } else {
        toast({ title: "تم حفظ المسودة" });
      }

      setShowForm(false);
      resetForm();
      load();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const confirmExisting = async (id: string) => {
    if (!confirm("تأكيد السند؟ سيتم تحديث المخزون.")) return;
    const { data, error } = await supabase.rpc("confirm_stock_transfer" as any, { p_transfer_id: id });
    if (error || (data as any)?.success === false) {
      toast({ title: "خطأ", description: error?.message || (data as any).error, variant: "destructive" });
      return;
    }
    toast({ title: "تم التأكيد" });
    load();
  };

  const cancelTransfer = async (id: string) => {
    const reason = prompt("سبب الإلغاء (اختياري):") || undefined;
    if (reason === null) return;
    const { data, error } = await supabase.rpc("cancel_stock_transfer" as any, { p_transfer_id: id, p_reason: reason });
    if (error || (data as any)?.success === false) {
      toast({ title: "خطأ", description: error?.message || (data as any).error, variant: "destructive" });
      return;
    }
    toast({ title: "تم الإلغاء" });
    load();
  };

  const deleteDraft = async (id: string) => {
    if (!confirm("حذف المسودة؟")) return;
    const { error } = await supabase.from("stock_transfers" as any).delete().eq("id", id);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    toast({ title: "تم الحذف" });
    load();
  };

  const wName = (id: string | null | undefined) => warehouses.find(w => w.id === id)?.name || "—";

  const actionTabs: ActionTab[] = [
    {
      key: "home", label: "عام",
      groups: [
        {
          key: "new", label: "جديد", items: [
            { key: "new-transfer", label: "تحويل مخزون", icon: Plus, variant: "primary", onClick: openNew },
          ],
        },
        {
          key: "actions", label: "إجراءات", items: [
            { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: load, disabled: loading },
            {
              key: "confirm", label: "اعتماد", icon: CheckCircle2,
              disabled: true,
              tooltip: "استخدم زر «تأكيد» داخل سطر السند نفسه.",
            },
            {
              key: "cancel", label: "إلغاء", icon: XCircle,
              disabled: true,
              tooltip: "استخدم زر «إلغاء» داخل سطر السند نفسه.",
            },
          ],
        },
        {
          key: "view", label: "عرض", items: [
            { key: "filters", label: "فلاتر", icon: Info, disabled: true, tooltip: "استخدم شريط الحالة أعلى القائمة." },
            { key: "columns", label: "أعمدة", icon: Info, disabled: true, tooltip: "العرض على شكل بطاقات — لا توجد أعمدة قابلة للإخفاء." },
          ],
        },
        {
          key: "export", label: "تصدير وطباعة", items: [
            { key: "excel", label: "Excel",  icon: FileSpreadsheet, disabled: true, tooltip: "تصدير سندات التحويل غير متاح حالياً." },
            { key: "print", label: "طباعة", icon: Printer,         onClick: () => window.print(), disabled: filteredTransfers.length === 0, tooltip: filteredTransfers.length === 0 ? "لا توجد بيانات للطباعة" : undefined },
          ],
        },
      ],
    },
  ];

  return (
    <FinanceShell
      title="سندات تحويل المخزون"
      subtitle={`${transfers.length} سند — تحميل بائعين وتحويل بين فروع`}
      breadcrumb={[
        { label: "الرئيسية", href: "/" },
        { label: "المخزون", href: "/inventory" },
        { label: "سندات تحويل المخزون" },
      ]}
      actionTabs={actionTabs}
    >

      {/* Info banner */}
      <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 mb-3 text-xs text-primary/80 leading-relaxed flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <strong>سند التحويل</strong> يحرّك البضاعة بين المستودعات (مثلاً: تحميل بائع متجول صباحاً، إرجاع المتبقي مساءً). عند التأكيد يتم تسجيل حركة "صادر" من المستودع المصدر و"وارد" للوجهة تلقائياً.
        </span>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap mb-3">
        {(["all", "draft", "confirmed", "cancelled"] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"
            }`}
          >
            {s === "all" ? "الكل" : STATUS_META[s].label}
            <span className="mr-1.5 opacity-70">
              ({s === "all" ? transfers.length : transfers.filter(t => t.status === s).length})
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredTransfers.length === 0 ? (
        <EmptyState
          icon={<ArrowLeftRight className="h-20 w-20" />}
          title="لا توجد سندات تحويل"
          description="أنشئ سند تحويل لتحريك البضاعة بين المستودعات والبائعين المتجولين."
          primaryAction={{ label: "تحويل جديد", onClick: openNew, icon: <Plus className="h-4 w-4" /> }}
        />
      ) : (
        <div className="space-y-2.5 overflow-x-auto">
          {filteredTransfers.map(t => {
            const TM = TYPE_META[t.transfer_type];
            const SM = STATUS_META[t.status];
            const FromIcon = WH_ICON[t.from_warehouse?.warehouse_type || "main"];
            const ToIcon = WH_ICON[t.to_warehouse?.warehouse_type || "main"];
            return (
              <div key={t.id} className="rounded-xl border border-border bg-card p-3.5 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-muted ${TM.color}`}>
                      <TM.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{t.transfer_number}</span>
                        <Badge variant="outline" className={`text-xs ${SM.cls}`}>{SM.label}</Badge>
                        <span className="text-xs text-muted-foreground">{TM.label}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><FromIcon className="w-3 h-3" />{t.from_warehouse?.name || "—"}</span>
                        <ArrowLeftRight className="w-3 h-3" />
                        <span className="flex items-center gap-1"><ToIcon className="w-3 h-3" />{t.to_warehouse?.name || "—"}</span>
                        {t.sales_rep && (
                          <>
                            <span className="opacity-50">•</span>
                            <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" />{t.sales_rep.full_name}</span>
                          </>
                        )}
                        <span className="opacity-50">•</span>
                        <span>{t.transfer_date}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs">
                        <span className="text-muted-foreground">{t.total_items} صنف</span>
                        <span className="text-muted-foreground">إجمالي: {t.total_quantity}</span>
                        {t.total_value > 0 && <span className="text-muted-foreground">₪{t.total_value.toFixed(2)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {t.status === "draft" && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-600 dark:text-emerald-400" onClick={() => confirmExisting(t.id)}>
                          <CheckCircle2 className="w-4 h-4 ml-1" />تأكيد
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => deleteDraft(t.id)}>
                          <Trash2 className="w-4 h-4 ml-1" />حذف
                        </Button>
                      </>
                    )}
                    {t.status === "confirmed" && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => cancelTransfer(t.id)}>
                        <XCircle className="w-4 h-4 ml-1" />إلغاء
                      </Button>
                    )}
                  </div>
                </div>
                {t.notes && (
                  <div className="mt-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-2 py-1.5">{t.notes}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New transfer dialog */}
      <Dialog open={showForm} onOpenChange={(v) => { if (!v) resetForm(); setShowForm(v); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5" />
              سند تحويل مخزون جديد
            </DialogTitle>
            <DialogDescription>
              حدّد نوع التحويل والمستودعات والأصناف. عند التأكيد ستُسجَّل الحركات تلقائياً في كلا المستودعين.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Transfer type tabs */}
            <div>
              <Label className="text-xs">نوع السند</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1.5">
                {(Object.keys(TYPE_META) as TransferType[]).map(t => {
                  const M = TYPE_META[t];
                  const active = form.transfer_type === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, transfer_type: t }))}
                      className={`p-2.5 rounded-lg border-2 text-xs font-medium transition-all flex flex-col items-center gap-1.5 ${
                        active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/30"
                      }`}
                    >
                      <M.icon className={`w-5 h-5 ${active ? "text-primary" : M.color}`} />
                      <span>{M.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date + Sales rep */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">التاريخ</Label>
                <Input type="date" value={form.transfer_date} onChange={e => setForm(f => ({ ...f, transfer_date: e.target.value }))} />
              </div>
              {(form.transfer_type === "load_van" || form.transfer_type === "return_van") && (
                <div>
                  <Label className="text-xs">البائع المتجول</Label>
                  <Select value={form.sales_rep_id || "_none"} onValueChange={v => setForm(f => ({ ...f, sales_rep_id: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="اختر بائعاً..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— بدون —</SelectItem>
                      {reps.map(r => <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* From / To warehouses */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">من مستودع *</Label>
                <Select value={form.from_warehouse_id || "_none"} onValueChange={v => setForm(f => ({ ...f, from_warehouse_id: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="اختر مستودع المصدر..." /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} ({w.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">إلى مستودع *</Label>
                <Select value={form.to_warehouse_id || "_none"} onValueChange={v => setForm(f => ({ ...f, to_warehouse_id: v === "_none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="اختر مستودع الوجهة..." /></SelectTrigger>
                  <SelectContent>
                    {warehouses.filter(w => w.id !== form.from_warehouse_id).map(w => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} ({w.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">الأصناف</Label>
                <span className="text-xs text-muted-foreground">{items.length} صنف • قيمة: ₪{totalValue.toFixed(2)}</span>
              </div>

              {/* Product search */}
              <div className="relative mb-2">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setShowProdDropdown(true); }}
                  onFocus={() => setShowProdDropdown(true)}
                  placeholder="ابحث عن صنف لإضافته..."
                  className="pr-9"
                />
                {showProdDropdown && productSearch && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {filteredProducts.map(p => (
                      <button
                        key={p.id}
                        className="w-full text-right px-3 py-2 hover:bg-accent text-sm flex justify-between items-center border-b last:border-b-0"
                        onClick={() => addProduct(p)}
                      >
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">₪{p.buy_price} • {p.unit || "قطعة"}</div>
                        </div>
                        <span className="text-xs text-muted-foreground">مخزون: {p.quantity}</span>
                      </button>
                    ))}
                    {filteredProducts.length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground text-center">لا توجد نتائج</div>
                    )}
                  </div>
                )}
              </div>

              {/* Items table */}
              {items.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs">
                      <tr>
                        <th className="text-right px-2 py-2 font-medium">الصنف</th>
                        <th className="text-right px-2 py-2 font-medium w-24">الكمية</th>
                        <th className="text-right px-2 py-2 font-medium w-24">سعر التكلفة</th>
                        <th className="text-right px-2 py-2 font-medium w-24">الإجمالي</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-2 py-1.5">
                            <div className="text-sm">{it.product_name}</div>
                            <div className="text-xs text-muted-foreground">{it.unit}</div>
                          </td>
                          <td className="px-2 py-1.5">
                            <Input type="number" min="0.01" step="0.01" value={it.quantity}
                              onChange={e => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm" />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input type="number" min="0" step="0.01" value={it.unit_cost}
                              onChange={e => updateItem(idx, "unit_cost", parseFloat(e.target.value) || 0)}
                              className="h-8 text-sm" />
                          </td>
                          <td className="px-2 py-1.5 text-sm font-medium">
                            ₪{(it.quantity * it.unit_cost).toFixed(2)}
                          </td>
                          <td className="px-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(idx)}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-xs text-muted-foreground border-2 border-dashed rounded-lg">
                  <Package className="w-8 h-8 mx-auto mb-1 opacity-40" />
                  لا توجد أصناف — ابحث وأضف من الأعلى
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs">ملاحظات</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="ملاحظات اختيارية..." />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>إلغاء</Button>
            <Button variant="secondary" onClick={() => saveDraft(false)} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <FileText className="w-4 h-4 ml-1" />}
              حفظ كمسودة
            </Button>
            <Button onClick={() => saveDraft(true)} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <CheckCircle2 className="w-4 h-4 ml-1" />}
              حفظ وتأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FinanceShell>
  );
};

export default StockTransfersPage;
