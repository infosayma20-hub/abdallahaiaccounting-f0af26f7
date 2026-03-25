import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Plus, Search, Hammer, ChevronLeft, Trash2, Edit3, X, Save,
  DollarSign, Package, Paintbrush, Users, Wrench, MoreHorizontal,
  TrendingUp, Eye, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import BackButton from "@/components/BackButton";

type Workshop = {
  id: string;
  name: string;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  description: string | null;
  status: string;
  total_budget: number;
  start_date: string | null;
  expected_end_date: string | null;
  actual_end_date: string | null;
  notes: string | null;
  created_at: string;
};

type WorkshopCost = {
  id: string;
  workshop_id: string;
  cost_type: string;
  description: string | null;
  amount: number;
  cost_date: string;
  supplier_name: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
};

const COST_TYPES = [
  { value: "wood", label: "خشب", icon: "🪵", color: "text-amber-600 bg-amber-500/10" },
  { value: "paint", label: "دهان", icon: "🎨", color: "text-blue-500 bg-blue-500/10" },
  { value: "crystal", label: "كرستا", icon: "✨", color: "text-purple-500 bg-purple-500/10" },
  { value: "labor", label: "عمال", icon: "👷", color: "text-orange-500 bg-orange-500/10" },
  { value: "hardware", label: "عدد ومسامير", icon: "🔩", color: "text-gray-500 bg-gray-500/10" },
  { value: "glass", label: "زجاج", icon: "🪟", color: "text-cyan-500 bg-cyan-500/10" },
  { value: "marble", label: "رخام/حجر", icon: "🧱", color: "text-stone-500 bg-stone-500/10" },
  { value: "transport", label: "نقل وتوصيل", icon: "🚚", color: "text-green-500 bg-green-500/10" },
  { value: "other", label: "أخرى", icon: "📎", color: "text-muted-foreground bg-muted" },
];

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "نشطة", variant: "default" },
  completed: { label: "مكتملة", variant: "secondary" },
  paused: { label: "متوقفة", variant: "outline" },
  cancelled: { label: "ملغاة", variant: "destructive" },
};

const getCostType = (v: string) => COST_TYPES.find(c => c.value === v) || COST_TYPES[COST_TYPES.length - 1];

export default function WorkshopsPage() {
  const { user } = useAuth();
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Workshop detail view
  const [selectedWorkshop, setSelectedWorkshop] = useState<Workshop | null>(null);
  const [costs, setCosts] = useState<WorkshopCost[]>([]);
  const [loadingCosts, setLoadingCosts] = useState(false);

  // Dialogs
  const [showNewWorkshop, setShowNewWorkshop] = useState(false);
  const [showNewCost, setShowNewCost] = useState(false);
  const [editingWorkshop, setEditingWorkshop] = useState<Workshop | null>(null);

  // Form states
  const [wsForm, setWsForm] = useState({ name: "", customer_name: "", customer_phone: "", address: "", description: "", total_budget: 0, start_date: format(new Date(), "yyyy-MM-dd"), expected_end_date: "" });
  const [costForm, setCostForm] = useState({ cost_type: "wood", description: "", amount: 0, cost_date: format(new Date(), "yyyy-MM-dd"), supplier_name: "", payment_method: "نقدي", notes: "" });

  useEffect(() => { if (user) loadWorkshops(); }, [user]);

  const loadWorkshops = async () => {
    setLoading(true);
    const { data } = await supabase.from("workshops").select("*").order("created_at", { ascending: false });
    setWorkshops((data as any) || []);
    setLoading(false);
  };

  const loadCosts = async (workshopId: string) => {
    setLoadingCosts(true);
    const { data } = await supabase.from("workshop_costs").select("*").eq("workshop_id", workshopId).order("cost_date", { ascending: false });
    setCosts((data as any) || []);
    setLoadingCosts(false);
  };

  const openWorkshop = (ws: Workshop) => {
    setSelectedWorkshop(ws);
    loadCosts(ws.id);
  };

  const handleCreateWorkshop = async () => {
    if (!wsForm.name.trim()) { toast.error("اسم الورشة مطلوب"); return; }
    const { error } = await supabase.from("workshops").insert({
      user_id: user!.id,
      name: wsForm.name,
      customer_name: wsForm.customer_name || null,
      customer_phone: wsForm.customer_phone || null,
      address: wsForm.address || null,
      description: wsForm.description || null,
      total_budget: wsForm.total_budget || 0,
      start_date: wsForm.start_date || null,
      expected_end_date: wsForm.expected_end_date || null,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("تم إنشاء الورشة");
    setShowNewWorkshop(false);
    setWsForm({ name: "", customer_name: "", customer_phone: "", address: "", description: "", total_budget: 0, start_date: format(new Date(), "yyyy-MM-dd"), expected_end_date: "" });
    loadWorkshops();
  };

  const handleAddCost = async () => {
    if (!selectedWorkshop || costForm.amount <= 0) { toast.error("المبلغ مطلوب"); return; }
    const { error } = await supabase.from("workshop_costs").insert({
      workshop_id: selectedWorkshop.id,
      user_id: user!.id,
      cost_type: costForm.cost_type,
      description: costForm.description || null,
      amount: costForm.amount,
      cost_date: costForm.cost_date,
      supplier_name: costForm.supplier_name || null,
      payment_method: costForm.payment_method,
      notes: costForm.notes || null,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("تم إضافة التكلفة");
    setShowNewCost(false);
    setCostForm({ cost_type: "wood", description: "", amount: 0, cost_date: format(new Date(), "yyyy-MM-dd"), supplier_name: "", payment_method: "نقدي", notes: "" });
    loadCosts(selectedWorkshop.id);
  };

  const handleDeleteCost = async (costId: string) => {
    const { error } = await supabase.from("workshop_costs").delete().eq("id", costId);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حذف التكلفة");
    if (selectedWorkshop) loadCosts(selectedWorkshop.id);
  };

  const handleUpdateStatus = async (ws: Workshop, newStatus: string) => {
    const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === "completed") updates.actual_end_date = format(new Date(), "yyyy-MM-dd");
    const { error } = await supabase.from("workshops").update(updates).eq("id", ws.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم تحديث الحالة");
    loadWorkshops();
    if (selectedWorkshop?.id === ws.id) setSelectedWorkshop({ ...ws, ...updates });
  };

  const filteredWorkshops = useMemo(() => {
    return workshops.filter(ws => {
      if (statusFilter !== "all" && ws.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return ws.name.toLowerCase().includes(q) || ws.customer_name?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [workshops, search, statusFilter]);

  // Cost summaries
  const costSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    let total = 0;
    costs.forEach(c => {
      summary[c.cost_type] = (summary[c.cost_type] || 0) + c.amount;
      total += c.amount;
    });
    return { byType: summary, total };
  }, [costs]);

  // ─── Workshop Detail View ───
  if (selectedWorkshop) {
    const status = STATUS_MAP[selectedWorkshop.status] || STATUS_MAP.active;
    return (
      <div className="min-h-full bg-background pb-24" dir="rtl">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSelectedWorkshop(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-foreground truncate">{selectedWorkshop.name}</h1>
              <p className="text-sm text-muted-foreground">{selectedWorkshop.customer_name || "بدون زبون"}</p>
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-card border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">الميزانية</p>
              <p className="text-lg font-bold text-foreground">{selectedWorkshop.total_budget?.toLocaleString()} ₪</p>
            </div>
            <div className="rounded-xl bg-card border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">إجمالي التكاليف</p>
              <p className="text-lg font-bold text-destructive">{costSummary.total.toLocaleString()} ₪</p>
            </div>
            <div className="rounded-xl bg-card border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">المتبقي</p>
              <p className={`text-lg font-bold ${(selectedWorkshop.total_budget - costSummary.total) >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                {(selectedWorkshop.total_budget - costSummary.total).toLocaleString()} ₪
              </p>
            </div>
            <div className="rounded-xl bg-card border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">عدد البنود</p>
              <p className="text-lg font-bold text-foreground">{costs.length}</p>
            </div>
          </div>

          {/* Cost breakdown by type */}
          {Object.keys(costSummary.byType).length > 0 && (
            <div className="rounded-xl bg-card border border-border p-4 space-y-3">
              <h3 className="text-sm font-bold text-foreground">تفصيل التكاليف</h3>
              <div className="space-y-2">
                {COST_TYPES.filter(ct => costSummary.byType[ct.value]).map(ct => {
                  const amount = costSummary.byType[ct.value];
                  const pct = costSummary.total > 0 ? (amount / costSummary.total * 100) : 0;
                  return (
                    <div key={ct.value} className="flex items-center gap-3">
                      <span className="text-lg w-8 text-center">{ct.icon}</span>
                      <span className="text-sm flex-1 text-foreground">{ct.label}</span>
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-bold text-foreground w-24 text-left tabular-nums">{amount.toLocaleString()} ₪</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Status actions */}
          {selectedWorkshop.status === "active" && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(selectedWorkshop, "paused")} className="flex-1">⏸️ إيقاف مؤقت</Button>
              <Button size="sm" onClick={() => handleUpdateStatus(selectedWorkshop, "completed")} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white">✅ اكتمال</Button>
            </div>
          )}
          {selectedWorkshop.status === "paused" && (
            <Button size="sm" onClick={() => handleUpdateStatus(selectedWorkshop, "active")} className="w-full">▶️ استئناف</Button>
          )}

          {/* Add cost button */}
          <Button onClick={() => setShowNewCost(true)} className="w-full gap-2">
            <Plus className="h-4 w-4" /> إضافة تكلفة جديدة
          </Button>

          {/* Costs list */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-foreground">سجل التكاليف</h3>
            {loadingCosts ? (
              <p className="text-sm text-muted-foreground text-center py-8">جاري التحميل...</p>
            ) : costs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">لا توجد تكاليف مسجلة بعد</p>
              </div>
            ) : (
              <div className="space-y-2">
                {costs.map(cost => {
                  const ct = getCostType(cost.cost_type);
                  return (
                    <motion.div
                      key={cost.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl bg-card border border-border p-3 flex items-center gap-3"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${ct.color}`}>
                        {ct.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{ct.label}</p>
                          {cost.supplier_name && <span className="text-[10px] text-muted-foreground">— {cost.supplier_name}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{cost.description || cost.payment_method}</p>
                        <p className="text-[10px] text-muted-foreground/60">{format(new Date(cost.cost_date), "dd/MM/yyyy")}</p>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-destructive tabular-nums">{cost.amount.toLocaleString()} ₪</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteCost(cost.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Add Cost Dialog */}
        <Dialog open={showNewCost} onOpenChange={setShowNewCost}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة تكلفة جديدة</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Cost type selector */}
              <div className="space-y-2">
                <Label>نوع التكلفة</Label>
                <div className="grid grid-cols-3 gap-2">
                  {COST_TYPES.map(ct => (
                    <button
                      key={ct.value}
                      onClick={() => setCostForm(f => ({ ...f, cost_type: ct.value }))}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        costForm.cost_type === ct.value
                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                          : "border-border hover:bg-accent/5"
                      }`}
                    >
                      <span className="text-xl block">{ct.icon}</span>
                      <span className="text-[10px] font-medium text-foreground">{ct.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>المبلغ (₪)</Label>
                  <Input type="number" value={costForm.amount || ""} onChange={e => setCostForm(f => ({ ...f, amount: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1">
                  <Label>التاريخ</Label>
                  <Input type="date" value={costForm.cost_date} onChange={e => setCostForm(f => ({ ...f, cost_date: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>الوصف</Label>
                <Input value={costForm.description} onChange={e => setCostForm(f => ({ ...f, description: e.target.value }))} placeholder="مثل: خشب سويدي 18مم" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>اسم المورد</Label>
                  <Input value={costForm.supplier_name} onChange={e => setCostForm(f => ({ ...f, supplier_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>طريقة الدفع</Label>
                  <div className="flex gap-1">
                    {["نقدي", "بنك", "آجل"].map(m => (
                      <button
                        key={m}
                        onClick={() => setCostForm(f => ({ ...f, payment_method: m }))}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          costForm.payment_method === m
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowNewCost(false)}>إلغاء</Button>
              <Button onClick={handleAddCost} disabled={costForm.amount <= 0}>إضافة</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── Workshops List View ───
  return (
    <div className="min-h-full bg-background pb-24" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Tajawal, sans-serif" }}>🪵 الورشات</h1>
            <p className="text-sm text-muted-foreground">إدارة ورشات العمل وتتبع التكاليف</p>
          </div>
          <Button onClick={() => setShowNewWorkshop(true)} className="gap-2">
            <Plus className="h-4 w-4" /> ورشة جديدة
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className="pr-9" />
          </div>
          <div className="flex gap-1">
            {[
              { v: "all", l: "الكل" },
              { v: "active", l: "نشطة" },
              { v: "completed", l: "مكتملة" },
              { v: "paused", l: "متوقفة" },
            ].map(f => (
              <button
                key={f.v}
                onClick={() => setStatusFilter(f.v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  statusFilter === f.v
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/5"
                }`}
              >
                {f.l}
              </button>
            ))}
          </div>
        </div>

        {/* Workshops grid */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">جاري التحميل...</div>
        ) : filteredWorkshops.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Hammer className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">لا توجد ورشات</p>
            <p className="text-xs mt-1">أنشئ أول ورشة لبدء تتبع التكاليف</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredWorkshops.map((ws, idx) => {
              const status = STATUS_MAP[ws.status] || STATUS_MAP.active;
              return (
                <motion.div
                  key={ws.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => openWorkshop(ws)}
                  className="rounded-2xl bg-card border border-border p-4 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-foreground">{ws.name}</h3>
                      <p className="text-xs text-muted-foreground">{ws.customer_name || "بدون زبون"}</p>
                    </div>
                    <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">الميزانية: <strong className="text-foreground">{ws.total_budget?.toLocaleString()} ₪</strong></span>
                    {ws.start_date && (
                      <span className="text-muted-foreground/60">{format(new Date(ws.start_date), "dd/MM/yyyy")}</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Workshop Dialog */}
      <Dialog open={showNewWorkshop} onOpenChange={setShowNewWorkshop}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>ورشة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>اسم الورشة *</Label>
              <Input value={wsForm.name} onChange={e => setWsForm(f => ({ ...f, name: e.target.value }))} placeholder="مثل: مطبخ أحمد العلي" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>اسم الزبون</Label>
                <Input value={wsForm.customer_name} onChange={e => setWsForm(f => ({ ...f, customer_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>رقم الهاتف</Label>
                <Input value={wsForm.customer_phone} onChange={e => setWsForm(f => ({ ...f, customer_phone: e.target.value }))} dir="ltr" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>العنوان</Label>
              <Input value={wsForm.address} onChange={e => setWsForm(f => ({ ...f, address: e.target.value }))} placeholder="المدينة / الحي" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>الميزانية (₪)</Label>
                <Input type="number" value={wsForm.total_budget || ""} onChange={e => setWsForm(f => ({ ...f, total_budget: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>تاريخ البدء</Label>
                <Input type="date" value={wsForm.start_date} onChange={e => setWsForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Textarea value={wsForm.description} onChange={e => setWsForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewWorkshop(false)}>إلغاء</Button>
            <Button onClick={handleCreateWorkshop}>إنشاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
