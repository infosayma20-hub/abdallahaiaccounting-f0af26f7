import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Edit2, Trash2, Shield, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Policy {
  id: string;
  product_id: string;
  duration_months: number;
  has_serial: boolean;
  warranty_type: string;
  supplier_id: string | null;
  supplier_covers: number;
  terms: string | null;
  is_active: boolean;
  product?: { name_ar: string; sku?: string };
  supplier?: { contact_name: string };
}

const TYPE_LABELS: Record<string, string> = {
  replacement: "استبدال",
  repair: "إصلاح",
  refund: "رد المبلغ",
  case_by_case: "حسب الحالة",
};

export default function WarrantyPoliciesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [form, setForm] = useState({
    product_id: "",
    duration_months: 12,
    has_serial: false,
    warranty_type: "replacement",
    supplier_id: "",
    supplier_covers: 0,
    terms: "",
  });

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("warranty_policies")
      .select("*, product:products(name_ar, sku), supplier:contacts(contact_name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setPolicies((data as any) || []);
  };

  useEffect(() => {
    if (!user) return;
    load();
    supabase.from("products").select("id, name_ar, sku").eq("user_id", user.id).order("name_ar")
      .then(({ data }) => setProducts(data || []));
    supabase.from("contacts").select("id, contact_name").eq("user_id", user.id).eq("contact_type", "مورد").order("contact_name")
      .then(({ data }) => setSuppliers(data || []));
  }, [user]);

  const openNew = () => {
    setEditing(null);
    setForm({ product_id: "", duration_months: 12, has_serial: false, warranty_type: "replacement", supplier_id: "", supplier_covers: 0, terms: "" });
    setOpen(true);
  };

  const openEdit = (p: Policy) => {
    setEditing(p);
    setForm({
      product_id: p.product_id,
      duration_months: p.duration_months,
      has_serial: p.has_serial,
      warranty_type: p.warranty_type,
      supplier_id: p.supplier_id || "",
      supplier_covers: p.supplier_covers,
      terms: p.terms || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user || !form.product_id) {
      toast.error("اختر صنفاً");
      return;
    }
    const payload = {
      user_id: user.id,
      product_id: form.product_id,
      duration_months: form.duration_months,
      has_serial: form.has_serial,
      warranty_type: form.warranty_type,
      supplier_id: form.supplier_id || null,
      supplier_covers: form.supplier_covers,
      terms: form.terms || null,
    };
    const { error } = editing
      ? await supabase.from("warranty_policies").update(payload).eq("id", editing.id)
      : await supabase.from("warranty_policies").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "تم التحديث" : "تم إنشاء السياسة");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("حذف السياسة؟ لن يؤثر على البطاقات الموجودة.")) return;
    const { error } = await supabase.from("warranty_policies").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم الحذف");
    load();
  };

  const filtered = policies.filter((p) =>
    !search || p.product?.name_ar?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl" dir="rtl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/warranty")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <Shield className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">سياسات الكفالة</h1>
            <p className="text-sm text-muted-foreground">حدّد مدة الكفالة ونوعها لكل صنف</p>
          </div>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 ml-2" /> سياسة جديدة
        </Button>
      </div>

      <Card className="p-4 mb-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-10" placeholder="ابحث باسم الصنف..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الصنف</TableHead>
              <TableHead>المدة</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>سيريال؟</TableHead>
              <TableHead>الشركة الأم</TableHead>
              <TableHead>تغطيتها</TableHead>
              <TableHead className="text-left">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  لا توجد سياسات بعد
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.product?.name_ar || "—"}</TableCell>
                  <TableCell>{p.duration_months} شهر</TableCell>
                  <TableCell><Badge variant="secondary">{TYPE_LABELS[p.warranty_type]}</Badge></TableCell>
                  <TableCell>{p.has_serial ? "نعم" : "لا"}</TableCell>
                  <TableCell>{p.supplier?.contact_name || "—"}</TableCell>
                  <TableCell>{p.supplier_covers}%</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(p.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل سياسة الكفالة" : "سياسة كفالة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>الصنف *</Label>
              <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر صنفاً" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name_ar}{p.sku ? ` (${p.sku})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>مدة الكفالة (شهر)</Label>
                <Input type="number" min={1} value={form.duration_months} onChange={(e) => setForm({ ...form, duration_months: Number(e.target.value) })} />
              </div>
              <div>
                <Label>نوع الكفالة</Label>
                <Select value={form.warranty_type} onValueChange={(v) => setForm({ ...form, warranty_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>تتبع برقم سيريال</Label>
                <p className="text-xs text-muted-foreground">بطاقة منفصلة لكل وحدة</p>
              </div>
              <Switch checked={form.has_serial} onCheckedChange={(v) => setForm({ ...form, has_serial: v })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الشركة الأم (مورد)</Label>
                <Select value={form.supplier_id || "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— لا يوجد —</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.contact_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>نسبة تغطية الشركة الأم %</Label>
                <Input type="number" min={0} max={100} value={form.supplier_covers} onChange={(e) => setForm({ ...form, supplier_covers: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>شروط الكفالة</Label>
              <Textarea rows={3} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} placeholder="مثال: لا تشمل الكفالة كسر الشاشة..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save}>{editing ? "تحديث" : "إنشاء"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
