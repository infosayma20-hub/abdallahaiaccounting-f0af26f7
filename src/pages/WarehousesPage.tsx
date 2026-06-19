import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Plus, Warehouse, Truck, Building2, Box, Edit2, Trash2, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from "@/integrations/supabase/client";

type WarehouseType = "main" | "branch" | "van" | "virtual";

interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  warehouse_type: WarehouseType;
  branch_id: string | null;
  manager_employee_id: string | null;
  sales_rep_id: string | null;
  address: string | null;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
}

const TYPE_META: Record<WarehouseType, { label: string; icon: any; color: string; bg: string }> = {
  main: { label: "المستودع الرئيسي", icon: Warehouse, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30" },
  branch: { label: "مستودع فرع", icon: Building2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  van: { label: "سيارة بائع متجول", icon: Truck, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
  virtual: { label: "وهمي (بدون مخزون فعلي)", icon: Box, color: "text-muted-foreground", bg: "bg-muted/40" },
};

const WarehousesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [rows, setRows] = useState<WarehouseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<any[]>([]);
  const [reps, setReps] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    warehouse_type: "main" as WarehouseType,
    branch_id: "",
    manager_employee_id: "",
    sales_rep_id: "",
    address: "",
    is_default: false,
    is_active: true,
    notes: "",
  });

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [w, b, r, e] = await Promise.all([
      supabase.from("warehouses" as any).select("*").eq("user_id", dataOwnerId!).order("created_at", { ascending: true }),
      supabase.from("branches").select("id, name").eq("user_id", dataOwnerId!).eq("is_active", true).order("name"),
      supabase.from("sales_representatives").select("id, full_name").eq("user_id", dataOwnerId!).eq("is_active", true).order("full_name"),
      supabase.from("employees" as any).select("id, full_name").eq("user_id", dataOwnerId!).order("full_name").limit(200),
    ]);
    setRows(((w.data as any) || []) as WarehouseRow[]);
    setBranches(b.data || []);
    setReps(r.data || []);
    setEmployees((e.data as any) || []);
    setLoading(false);

    // ensure default warehouse exists
    if (((w.data as any) || []).length === 0) {
      await supabase.rpc("ensure_default_warehouse" as any, { p_user_id: user.id });
      const refresh = await supabase.from("warehouses" as any).select("*").eq("user_id", dataOwnerId!).order("created_at");
      setRows(((refresh.data as any) || []) as WarehouseRow[]);
    }
  };

  useEffect(() => { load(); }, [user]);

  const resetForm = () => {
    setForm({ code: "", name: "", warehouse_type: "main", branch_id: "", manager_employee_id: "", sales_rep_id: "", address: "", is_default: false, is_active: true, notes: "" });
    setEditId(null);
  };

  const openAdd = () => { resetForm(); setShowForm(true); };
  const openEdit = (w: WarehouseRow) => {
    setForm({
      code: w.code,
      name: w.name,
      warehouse_type: w.warehouse_type,
      branch_id: w.branch_id || "",
      manager_employee_id: w.manager_employee_id || "",
      sales_rep_id: w.sales_rep_id || "",
      address: w.address || "",
      is_default: w.is_default,
      is_active: w.is_active,
      notes: w.notes || "",
    });
    setEditId(w.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!user || !form.name.trim() || !form.code.trim()) {
      toast({ title: "الاسم والكود مطلوبان", variant: "destructive" });
      return;
    }
    const payload = {
      user_id: user.id,
      code: form.code.trim(),
      name: form.name.trim(),
      warehouse_type: form.warehouse_type,
      branch_id: form.branch_id || null,
      manager_employee_id: form.manager_employee_id || null,
      sales_rep_id: form.sales_rep_id || null,
      address: form.address.trim() || null,
      is_default: form.is_default,
      is_active: form.is_active,
      notes: form.notes.trim() || null,
    };

    if (editId) {
      const { error } = await supabase.from("warehouses" as any).update(payload).eq("id", editId);
      if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
      toast({ title: "تم التحديث ✅" });
    } else {
      const { error } = await supabase.from("warehouses" as any).insert(payload);
      if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
      toast({ title: "تمت إضافة المستودع ✅" });
    }

    // Sync sales_rep default warehouse
    if (form.sales_rep_id) {
      await supabase.from("sales_representatives").update({ default_warehouse_id: editId } as any).eq("id", form.sales_rep_id);
    }

    setShowForm(false);
    resetForm();
    load();
  };

  const handleDelete = async (id: string, isDefault: boolean) => {
    if (isDefault) { toast({ title: "لا يمكن حذف المستودع الافتراضي", variant: "destructive" }); return; }
    if (!confirm("حذف المستودع نهائياً؟")) return;
    const { error } = await supabase.from("warehouses" as any).delete().eq("id", id);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    toast({ title: "تم الحذف ✅" });
    load();
  };

  return (
    <div className="px-4 pt-6 pb-24 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-all shadow-sm">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">المستودعات</h1>
            <p className="text-xs text-muted-foreground">{rows.length} مستودع — رئيسي • فروع • سيارات بائعين</p>
          </div>
        </div>
        <Button onClick={openAdd} className="rounded-xl gap-1.5">
          <Plus className="h-4 w-4" /> إضافة مستودع
        </Button>
      </div>

      {/* Info banner */}
      <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 text-xs text-primary/80 leading-relaxed">
        💡 <strong>ما الفائدة؟</strong> يمكنك تتبع المخزون في عدة مواقع منفصلة (مستودع رئيسي، فروع، سيارات بائعين متجولين).
        كل بائع متجول يصبح "مستودع متنقل" يمكن تحميله بضاعة وإغلاق يومه ومطابقة جرده.
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(w => {
            const meta = TYPE_META[w.warehouse_type];
            const Icon = meta.icon;
            const repName = reps.find(r => r.id === w.sales_rep_id)?.full_name;
            const branchName = branches.find(b => b.id === w.branch_id)?.name;
            const mgrName = employees.find(e => e.id === w.manager_employee_id)?.full_name;
            return (
              <div key={w.id} className={`rounded-2xl border ${w.is_active ? "border-border" : "border-dashed border-muted-foreground/30 opacity-60"} p-4 ${meta.bg} relative`}>
                {w.is_default && (
                  <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">افتراضي</span>
                )}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${meta.color}`} />
                    <div>
                      <p className="text-sm font-bold text-foreground">{w.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{w.code} • {meta.label}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  {repName && <div>👤 البائع: <span className="text-foreground font-medium">{repName}</span></div>}
                  {branchName && <div>🏢 الفرع: <span className="text-foreground font-medium">{branchName}</span></div>}
                  {mgrName && <div>👔 المسؤول: <span className="text-foreground font-medium">{mgrName}</span></div>}
                  {w.address && <div className="flex items-start gap-1"><MapPin className="h-3 w-3 mt-0.5 shrink-0" /><span>{w.address}</span></div>}
                </div>
                <div className="flex gap-1 mt-3 pt-3 border-t border-border/40">
                  <button onClick={() => openEdit(w)} className="flex-1 p-1.5 rounded-lg hover:bg-background/60 transition-colors flex items-center justify-center gap-1 text-xs text-foreground">
                    <Edit2 className="h-3 w-3" /> تعديل
                  </button>
                  {!w.is_default && (
                    <button onClick={() => handleDelete(w.id, w.is_default)} className="flex-1 p-1.5 rounded-lg hover:bg-destructive/10 transition-colors flex items-center justify-center gap-1 text-xs text-destructive">
                      <Trash2 className="h-3 w-3" /> حذف
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) resetForm(); setShowForm(o); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editId ? "تعديل مستودع" : "إضافة مستودع جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">الكود <span className="text-destructive">*</span></Label>
                <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="WH-001" className="rounded-xl mt-1" />
              </div>
              <div>
                <Label className="text-xs">النوع <span className="text-destructive">*</span></Label>
                <Select value={form.warehouse_type} onValueChange={(v: WarehouseType) => setForm({ ...form, warehouse_type: v })}>
                  <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">🏭 رئيسي</SelectItem>
                    <SelectItem value="branch">🏢 فرع</SelectItem>
                    <SelectItem value="van">🚚 سيارة بائع متجول</SelectItem>
                    <SelectItem value="virtual">📦 وهمي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">الاسم <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثال: سيارة أحمد" className="rounded-xl mt-1" />
            </div>

            {form.warehouse_type === "van" && (
              <div>
                <Label className="text-xs">البائع المرتبط</Label>
                <Select value={form.sales_rep_id || "none"} onValueChange={v => setForm({ ...form, sales_rep_id: v === "none" ? "" : v })}>
                  <SelectTrigger className="rounded-xl mt-1"><SelectValue placeholder="اختر البائع" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— بدون —</SelectItem>
                    {reps.map(r => <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">سيظهر هذا المستودع للبائع تلقائياً عند تسجيل الدخول من /van</p>
              </div>
            )}

            {form.warehouse_type === "branch" && (
              <div>
                <Label className="text-xs">الفرع</Label>
                <Select value={form.branch_id || "none"} onValueChange={v => setForm({ ...form, branch_id: v === "none" ? "" : v })}>
                  <SelectTrigger className="rounded-xl mt-1"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— بدون —</SelectItem>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs">المسؤول (موظف)</Label>
              <Select value={form.manager_employee_id || "none"} onValueChange={v => setForm({ ...form, manager_employee_id: v === "none" ? "" : v })}>
                <SelectTrigger className="rounded-xl mt-1"><SelectValue placeholder="اختر المسؤول" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— بدون —</SelectItem>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">العنوان / الموقع</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="مثال: شارع رام الله — مبنى رقم 5" className="rounded-xl mt-1" />
            </div>

            <div>
              <Label className="text-xs">ملاحظات</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="rounded-xl mt-1 min-h-[60px]" />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
                <Label className="text-xs">نشط</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_default} onCheckedChange={v => setForm({ ...form, is_default: v })} />
                <Label className="text-xs">افتراضي</Label>
              </div>
            </div>

            <Button onClick={handleSave} className="w-full rounded-xl mt-3">
              {editId ? "حفظ التعديلات" : "إضافة المستودع"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WarehousesPage;
