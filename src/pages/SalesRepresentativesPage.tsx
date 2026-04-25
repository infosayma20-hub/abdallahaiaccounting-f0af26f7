import { useState, useEffect } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, UserCheck, TrendingUp, Percent, Edit, Trash2, Truck } from "lucide-react";
import BackButton from "@/components/BackButton";
import { Link } from "react-router-dom";
import { multiWordMatchAny } from "@/lib/utils";

const SalesRepresentativesPage = () => {
  const { user } = useAuth();
  const [reps, setReps] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedRep, setSelectedRep] = useState<any>(null);
  const [showCommForm, setShowCommForm] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", region: "", sales_commission_rate: 0, collection_commission_rate: 0, linked_account_name: "", notes: "", is_active: true });
  const [commForm, setCommForm] = useState({ commission_type: "عمولة مبيعات", reference_type: "فاتورة", reference_description: "", base_amount: 0, commission_rate: 0, commission_amount: 0, linked_account_name: "", notes: "" });

  const fetchReps = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("sales_representatives").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setReps((data as any[]) || []);
    setLoading(false);
  };

  const fetchCommissions = async (repId: string) => {
    if (!user) return;
    const { data } = await supabase.from("commissions").select("*").eq("representative_id", repId).eq("user_id", user.id).order("created_at", { ascending: false });
    setCommissions((data as any[]) || []);
  };

  useEffect(() => { fetchReps(); }, [user]);

  const handleSave = async () => {
    if (!user || !form.full_name) { toast.error("اسم المندوب مطلوب"); return; }
    const payload = { ...form, user_id: user.id };
    if (editingId) {
      const { error } = await supabase.from("sales_representatives").update(payload as any).eq("id", editingId);
      if (error) toast.error("خطأ"); else { toast.success("تم التحديث"); setShowForm(false); setEditingId(null); fetchReps(); }
    } else {
      const { error } = await supabase.from("sales_representatives").insert(payload as any);
      if (error) toast.error("خطأ"); else { toast.success("تمت الإضافة"); setShowForm(false); fetchReps(); }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد؟")) return;
    await supabase.from("sales_representatives").delete().eq("id", id);
    toast.success("تم الحذف"); fetchReps(); if (selectedRep?.id === id) setSelectedRep(null);
  };

  const handleAddCommission = async () => {
    if (!user || !selectedRep) return;
    const { error } = await supabase.from("commissions").insert({ ...commForm, representative_id: selectedRep.id, user_id: user.id } as any);
    if (error) toast.error("خطأ"); else { toast.success("تمت الإضافة"); setShowCommForm(false); fetchCommissions(selectedRep.id); }
  };

  const filtered = reps.filter(r => r.full_name.includes(search) || r.region?.includes(search));
  const totalCommPaid = commissions.filter(c => c.is_paid).reduce((s, c) => s + Number(c.commission_amount), 0);
  const totalCommPending = commissions.filter(c => !c.is_paid).reduce((s, c) => s + Number(c.commission_amount), 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
      <PageHeader title="إدارة المندوبين" breadcrumb={["المبيعات", "إدارة المندوبين"]} />
      <div className="flex items-center justify-start gap-2 flex-wrap">
        <Button onClick={() => { setForm({ full_name: "", phone: "", email: "", region: "", sales_commission_rate: 0, collection_commission_rate: 0, linked_account_name: "", notes: "", is_active: true }); setEditingId(null); setShowForm(true); }} className="gap-2"><Plus className="h-4 w-4" /> إضافة مندوب</Button>
        <Button asChild variant="outline" className="gap-2">
          <Link to="/admin/sales-reps-live"><Truck className="h-4 w-4" /> متابعة مباشرة (Van Sales)</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <UserCheck className="h-5 w-5" />, value: reps.filter(r => r.is_active).length, label: "مندوب نشط" },
          { icon: <TrendingUp className="h-5 w-5" />, value: commissions.length, label: "عمولات" },
          { icon: <Percent className="h-5 w-5" />, value: totalCommPending.toLocaleString(), label: "عمولات معلقة" },
          { icon: <Percent className="h-5 w-5" />, value: totalCommPaid.toLocaleString(), label: "عمولات مدفوعة" },
        ].map((kpi, i) => (
          <Card key={i}><CardContent className="p-4 text-center">
            <div className="w-9 h-9 rounded-lg mx-auto mb-2 flex items-center justify-center" style={{ background: "#F0F4F8", color: "#1B3A5C" }}>{kpi.icon}</div>
            <p className="text-2xl font-semibold" style={{ color: "#1B3A5C" }}>{kpi.value}</p>
            <p className="text-xs" style={{ color: "#6B7280" }}>{kpi.label}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="بحث بالاسم أو المنطقة..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-2 max-h-[70vh] overflow-y-auto">
          {loading ? <p className="text-muted-foreground text-center py-8">جاري التحميل...</p> :
            filtered.length === 0 ? <p className="text-muted-foreground text-center py-8">لا يوجد مندوبون</p> :
            filtered.map(rep => (
              <Card key={rep.id} className={`cursor-pointer transition-all hover:border-primary/50 ${selectedRep?.id === rep.id ? "border-primary bg-primary/5" : ""}`}
                onClick={() => { setSelectedRep(rep); fetchCommissions(rep.id); }}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-sm flex-shrink-0">{rep.full_name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{rep.full_name}</p>
                    <p className="text-xs text-muted-foreground">{rep.region || "—"} • مبيعات {rep.sales_commission_rate}% • تحصيل {rep.collection_commission_rate}%</p>
                  </div>
                  <Badge variant={rep.is_active ? "default" : "secondary"} className="text-[10px]">{rep.is_active ? "نشط" : "متوقف"}</Badge>
                </CardContent>
              </Card>
            ))
          }
        </div>

        <div className="lg:col-span-2">
          {!selectedRep ? (
            <Card className="h-full flex items-center justify-center min-h-[400px]"><p className="text-muted-foreground">اختر مندوباً لعرض التفاصيل</p></Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{selectedRep.full_name}</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setForm(selectedRep); setEditingId(selectedRep.id); setShowForm(true); }}><Edit className="h-3 w-3" /></Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(selectedRep.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm mb-6">
                  {[["الهاتف", selectedRep.phone], ["البريد", selectedRep.email], ["المنطقة", selectedRep.region], ["عمولة مبيعات", `${selectedRep.sales_commission_rate}%`], ["عمولة تحصيل", `${selectedRep.collection_commission_rate}%`], ["حساب مرتبط", selectedRep.linked_account_name]].map(([l, v]) => (
                    <div key={l as string} className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">{l}</span><span className="font-medium text-foreground">{v || "—"}</span></div>
                  ))}
                </div>

                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium text-foreground">سجل العمولات</h3>
                  <Button size="sm" onClick={() => setShowCommForm(true)} className="gap-1"><Plus className="h-3 w-3" /> إضافة عمولة</Button>
                </div>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">المرجع</TableHead>
                    <TableHead className="text-right">المبلغ الأساسي</TableHead>
                    <TableHead className="text-right">النسبة</TableHead>
                    <TableHead className="text-right">العمولة</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {commissions.map(c => (
                      <TableRow key={c.id}>
                        <TableCell><Badge variant="outline">{c.commission_type}</Badge></TableCell>
                        <TableCell className="text-xs">{c.reference_description || "—"}</TableCell>
                        <TableCell>{Number(c.base_amount).toLocaleString()}</TableCell>
                        <TableCell>{c.commission_rate}%</TableCell>
                        <TableCell className="font-medium">{Number(c.commission_amount).toLocaleString()}</TableCell>
                        <TableCell><Badge variant={c.is_paid ? "default" : "secondary"}>{c.is_paid ? "مدفوعة" : "معلقة"}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {commissions.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">لا توجد عمولات</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Add/Edit Rep Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "تعديل مندوب" : "إضافة مندوب"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground">الاسم *</label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">الهاتف</label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">البريد</label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">المنطقة</label><Input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">عمولة مبيعات (%)</label><Input type="number" value={form.sales_commission_rate} onChange={e => setForm({ ...form, sales_commission_rate: Number(e.target.value) })} /></div>
            <div><label className="text-xs text-muted-foreground">عمولة تحصيل (%)</label><Input type="number" value={form.collection_commission_rate} onChange={e => setForm({ ...form, collection_commission_rate: Number(e.target.value) })} /></div>
            <div className="col-span-2"><label className="text-xs text-muted-foreground">الحساب المرتبط</label><Input value={form.linked_account_name} onChange={e => setForm({ ...form, linked_account_name: e.target.value })} placeholder="مثال: مصاريف عمولات مبيعات" /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button><Button onClick={handleSave}>{editingId ? "تحديث" : "حفظ"}</Button></div>
        </DialogContent>
      </Dialog>

      {/* Add Commission Dialog */}
      <Dialog open={showCommForm} onOpenChange={setShowCommForm}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إضافة عمولة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-muted-foreground">النوع</label>
              <Select value={commForm.commission_type} onValueChange={v => setCommForm({ ...commForm, commission_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="عمولة مبيعات">عمولة مبيعات</SelectItem><SelectItem value="عمولة تحصيل">عمولة تحصيل</SelectItem></SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">نوع المرجع</label>
              <Select value={commForm.reference_type} onValueChange={v => setCommForm({ ...commForm, reference_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="فاتورة">فاتورة</SelectItem><SelectItem value="سند قبض">سند قبض</SelectItem><SelectItem value="أخرى">أخرى</SelectItem></SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">وصف المرجع</label><Input value={commForm.reference_description} onChange={e => setCommForm({ ...commForm, reference_description: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">المبلغ الأساسي</label><Input type="number" value={commForm.base_amount} onChange={e => { const base = Number(e.target.value); setCommForm({ ...commForm, base_amount: base, commission_amount: base * commForm.commission_rate / 100 }); }} /></div>
            <div><label className="text-xs text-muted-foreground">نسبة العمولة (%)</label><Input type="number" value={commForm.commission_rate} onChange={e => { const rate = Number(e.target.value); setCommForm({ ...commForm, commission_rate: rate, commission_amount: commForm.base_amount * rate / 100 }); }} /></div>
            <div><label className="text-xs text-muted-foreground">مبلغ العمولة (محسوب)</label><Input type="number" value={commForm.commission_amount} readOnly className="bg-muted" /></div>
            <div><label className="text-xs text-muted-foreground">الحساب المرتبط</label><Input value={commForm.linked_account_name} onChange={e => setCommForm({ ...commForm, linked_account_name: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => setShowCommForm(false)}>إلغاء</Button><Button onClick={handleAddCommission}>حفظ</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesRepresentativesPage;
