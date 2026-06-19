import { useState, useEffect } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, UserCheck, TrendingUp, Percent, Edit, Truck, UserPlus, ExternalLink, AlertCircle } from "lucide-react";
import BackButton from "@/components/BackButton";
import { Link, useNavigate } from "react-router-dom";
import PromoteEmployeeToRepDialog from "@/components/admin/PromoteEmployeeToRepDialog";

const SalesRepresentativesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reps, setReps] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showPromote, setShowPromote] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedRep, setSelectedRep] = useState<any>(null);
  const [showCommForm, setShowCommForm] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [cashBoxes, setCashBoxes] = useState<any[]>([]);
  const [settingsForm, setSettingsForm] = useState({ default_warehouse_id: "", cash_box_id: "", sales_commission_rate: 0, collection_commission_rate: 0, region: "", linked_account_name: "" });
  const [commForm, setCommForm] = useState({ commission_type: "عمولة مبيعات", reference_type: "فاتورة", reference_description: "", base_amount: 0, commission_rate: 0, commission_amount: 0, linked_account_name: "", notes: "" });

  const fetchReps = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("sales_representatives")
      .select("*, employee:employees!sales_representatives_employee_id_fkey(id, full_name, phone, email, position)")
      .eq("user_id", dataOwnerId!)
      .order("created_at", { ascending: false });
    setReps((data as any[]) || []);
    setLoading(false);
  };

  const fetchCommissions = async (repId: string) => {
    if (!user) return;
    const { data } = await supabase.from("commissions").select("*").eq("representative_id", repId).eq("user_id", dataOwnerId!).order("created_at", { ascending: false });
    setCommissions((data as any[]) || []);
  };

  useEffect(() => { fetchReps(); }, [user]);

  const loadOptions = async () => {
    const [wh, cb] = await Promise.all([
      (supabase as any).from("warehouses").select("id, name").order("name"),
      (supabase as any).from("cash_boxes").select("id, name, currency").eq("is_active", true).order("name"),
    ]);
    setWarehouses(wh.data || []);
    setCashBoxes(cb.data || []);
  };

  const openSettings = async (rep: any) => {
    await loadOptions();
    setEditingId(rep.id);
    setSettingsForm({
      default_warehouse_id: rep.default_warehouse_id || "",
      cash_box_id: rep.cash_box_id || "",
      sales_commission_rate: Number(rep.sales_commission_rate || 0),
      collection_commission_rate: Number(rep.collection_commission_rate || 0),
      region: rep.region || "",
      linked_account_name: rep.linked_account_name || "",
    });
    setShowSettings(true);
  };

  const handleSaveSettings = async () => {
    if (!editingId) return;
    const { error } = await (supabase as any)
      .from("sales_representatives")
      .update({
        default_warehouse_id: settingsForm.default_warehouse_id || null,
        cash_box_id: settingsForm.cash_box_id || null,
        sales_commission_rate: settingsForm.sales_commission_rate,
        collection_commission_rate: settingsForm.collection_commission_rate,
        region: settingsForm.region || null,
        linked_account_name: settingsForm.linked_account_name || null,
      })
      .eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    toast.success("تم تحديث إعدادات المندوب");
    setShowSettings(false);
    setEditingId(null);
    await fetchReps();
    if (selectedRep?.id === editingId) {
      const updated = (await (supabase as any).from("sales_representatives").select("*, employee:employees!sales_representatives_employee_id_fkey(id, full_name, phone, email, position)").eq("id", editingId).maybeSingle()).data;
      if (updated) setSelectedRep(updated);
    }
  };

  const goToEmployee = (rep: any) => {
    if (rep.employee_id) {
      navigate(`/employees?focus=${rep.employee_id}`);
    } else {
      toast.info("هذا المندوب غير مرتبط بموظف. يُفضّل ترقية موظف بدل ذلك.");
    }
  };

  const handleAddCommission = async () => {
    if (!user || !selectedRep) return;
    const { error } = await supabase.from("commissions").insert({ ...commForm, representative_id: selectedRep.id, user_id: dataOwnerId! } as any);
    if (error) toast.error("خطأ"); else { toast.success("تمت الإضافة"); setShowCommForm(false); fetchCommissions(selectedRep.id); }
  };

  const filtered = reps.filter(r => {
    const name = r.employee?.full_name || r.full_name || "";
    return name.includes(search) || (r.region || "").includes(search);
  });
  const totalCommPaid = commissions.filter(c => c.is_paid).reduce((s, c) => s + Number(c.commission_amount), 0);
  const totalCommPending = commissions.filter(c => !c.is_paid).reduce((s, c) => s + Number(c.commission_amount), 0);
  const orphanCount = reps.filter(r => !r.employee_id).length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
      <PageHeader title="إدارة المندوبين" breadcrumb={["المبيعات", "إدارة المندوبين"]} />
      <div className="flex items-center justify-start gap-2 flex-wrap">
        <Button onClick={() => setShowPromote(true)} className="gap-2">
          <UserPlus className="h-4 w-4" /> ترقية موظف إلى مندوب
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <Link to="/admin/sales-reps-live"><Truck className="h-4 w-4" /> متابعة مباشرة (Van Sales)</Link>
        </Button>
      </div>

      {orphanCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="p-3 flex items-center gap-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4" />
            يوجد {orphanCount} مندوب غير مرتبط بسجل موظف. يُنصح بترقية الموظف من ملف الموظف لربطه آلياً.
          </CardContent>
        </Card>
      )}

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
            filtered.map(rep => {
              const displayName = rep.employee?.full_name || rep.full_name;
              return (
                <Card key={rep.id} className={`cursor-pointer transition-all hover:border-primary/50 ${selectedRep?.id === rep.id ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => { setSelectedRep(rep); fetchCommissions(rep.id); }}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-sm flex-shrink-0">{(displayName || "?").charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{displayName}</p>
                      <p className="text-xs text-muted-foreground">{rep.region || "—"} • مبيعات {rep.sales_commission_rate}% • تحصيل {rep.collection_commission_rate}%</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={rep.is_active ? "default" : "secondary"} className="text-[10px]">{rep.is_active ? "نشط" : "متوقف"}</Badge>
                      {!rep.employee_id && <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-700">غير مرتبط</Badge>}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          }
        </div>

        <div className="lg:col-span-2">
          {!selectedRep ? (
            <Card className="h-full flex items-center justify-center min-h-[400px]"><p className="text-muted-foreground">اختر مندوباً لعرض التفاصيل</p></Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{selectedRep.employee?.full_name || selectedRep.full_name}</CardTitle>
                  <div className="flex gap-2">
                    {selectedRep.employee_id && (
                      <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => goToEmployee(selectedRep)}>
                        <ExternalLink className="h-3 w-3" /> ملف الموظف
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => openSettings(selectedRep)}>
                      <Edit className="h-3 w-3" /> إعدادات المندوب
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm mb-6">
                  {[
                    ["الهاتف", selectedRep.employee?.phone || selectedRep.phone],
                    ["البريد", selectedRep.employee?.email || selectedRep.email],
                    ["المنصب", selectedRep.employee?.position],
                    ["المنطقة", selectedRep.region],
                    ["عمولة مبيعات", `${selectedRep.sales_commission_rate}%`],
                    ["عمولة تحصيل", `${selectedRep.collection_commission_rate}%`],
                    ["حساب مرتبط", selectedRep.linked_account_name],
                  ].map(([l, v]) => (
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

      {/* Promote Employee → Rep */}
      <PromoteEmployeeToRepDialog open={showPromote} onOpenChange={setShowPromote} onDone={fetchReps} />

      {/* Settings Dialog (warehouse, cash box, commissions only) */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إعدادات المندوب</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">المستودع المتنقل</label>
              <Select value={settingsForm.default_warehouse_id} onValueChange={v => setSettingsForm({ ...settingsForm, default_warehouse_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر المستودع" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">الصندوق النقدي</label>
              <Select value={settingsForm.cash_box_id} onValueChange={v => setSettingsForm({ ...settingsForm, cash_box_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختر الصندوق" /></SelectTrigger>
                <SelectContent>
                  {cashBoxes.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.currency || "ILS"})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">عمولة مبيعات (%)</label>
              <Input type="number" step="0.01" value={settingsForm.sales_commission_rate} onChange={e => setSettingsForm({ ...settingsForm, sales_commission_rate: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">عمولة تحصيل (%)</label>
              <Input type="number" step="0.01" value={settingsForm.collection_commission_rate} onChange={e => setSettingsForm({ ...settingsForm, collection_commission_rate: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">المنطقة</label>
              <Input value={settingsForm.region} onChange={e => setSettingsForm({ ...settingsForm, region: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">الحساب المرتبط</label>
              <Input value={settingsForm.linked_account_name} onChange={e => setSettingsForm({ ...settingsForm, linked_account_name: e.target.value })} placeholder="مصاريف عمولات" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            ملاحظة: بيانات الاسم والهاتف والبريد تُدار من ملف الموظف، وليست قابلة للتعديل من هنا.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowSettings(false)}>إلغاء</Button>
            <Button onClick={handleSaveSettings}>حفظ</Button>
          </div>
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
