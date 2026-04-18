import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Plus, Calendar, Clock, Truck, CheckCircle2, XCircle,
  Loader2, DollarSign, TrendingUp, AlertTriangle, Package, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type DayStatus = "open" | "closed" | "cancelled";

interface SalesRep {
  id: string;
  full_name: string;
  default_warehouse_id: string | null;
}

interface VanDay {
  id: string;
  day_number: string;
  day_date: string;
  status: DayStatus;
  sales_rep_id: string;
  warehouse_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  opening_currency: string;
  actual_cash_collected: number | null;
  expected_cash: number | null;
  cash_variance: number | null;
  total_sales: number;
  total_collections: number;
  total_invoices: number;
  opening_notes: string | null;
  closing_notes: string | null;
  sales_rep?: { full_name: string };
  warehouse?: { name: string };
}

const STATUS_META: Record<DayStatus, { label: string; cls: string; icon: any }> = {
  open: { label: "مفتوح", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300", icon: Clock },
  closed: { label: "مغلق", cls: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300", icon: CheckCircle2 },
  cancelled: { label: "ملغى", cls: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300", icon: XCircle },
};

const VanDaysPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [days, setDays] = useState<VanDay[]>([]);

  // Open day form
  const [openDialog, setOpenDialog] = useState(false);
  const [openRepId, setOpenRepId] = useState("");
  const [openCash, setOpenCash] = useState("0");
  const [openCurrency, setOpenCurrency] = useState("ILS");
  const [openNotes, setOpenNotes] = useState("");

  // Close day
  const [closeDialog, setCloseDialog] = useState(false);
  const [closeDay, setCloseDay] = useState<VanDay | null>(null);
  const [actualCash, setActualCash] = useState("0");
  const [closingNotes, setClosingNotes] = useState("");

  // Filter
  const [filterStatus, setFilterStatus] = useState<"all" | DayStatus>("all");

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: repsData }, { data: daysData }] = await Promise.all([
      supabase.from("sales_representatives").select("id, full_name, default_warehouse_id")
        .eq("user_id", user.id).eq("is_active", true).order("full_name"),
      supabase.from("van_sales_days").select(`
        *,
        sales_rep:sales_representatives(full_name),
        warehouse:warehouses(name)
      `).eq("user_id", user.id).order("opened_at", { ascending: false }).limit(100),
    ]);
    setReps((repsData ?? []) as SalesRep[]);
    setDays((daysData ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [user?.id]);

  const filteredDays = useMemo(
    () => filterStatus === "all" ? days : days.filter(d => d.status === filterStatus),
    [days, filterStatus]
  );

  const openDays = useMemo(() => days.filter(d => d.status === "open"), [days]);

  const handleOpenDay = async () => {
    if (!openRepId) {
      toast({ title: "اختر البائع", variant: "destructive" });
      return;
    }
    const rep = reps.find(r => r.id === openRepId);
    if (!rep?.default_warehouse_id) {
      toast({ title: "البائع لا يملك مستودعاً افتراضياً", description: "اضبطه من شاشة المستودعات أولاً", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc("open_van_day", {
      p_sales_rep_id: openRepId,
      p_opening_cash: Number(openCash) || 0,
      p_opening_currency: openCurrency,
      p_notes: openNotes || null,
      p_load_transfer_id: null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "تعذّر فتح اليوم", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "تم فتح يوم العمل" });
    setOpenDialog(false);
    setOpenRepId(""); setOpenCash("0"); setOpenNotes("");
    loadData();
  };

  const handleCloseDay = async () => {
    if (!closeDay) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("close_van_day", {
      p_day_id: closeDay.id,
      p_actual_cash: Number(actualCash) || 0,
      p_closing_notes: closingNotes || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "تعذّر إغلاق اليوم", description: error.message, variant: "destructive" });
      return;
    }
    const result = data as any;
    const variance = Number(result?.variance ?? 0);
    toast({
      title: "تم إغلاق اليوم",
      description: variance === 0
        ? "النقدية مطابقة تماماً"
        : variance > 0
          ? `فائض: ${variance.toFixed(2)}`
          : `عجز: ${Math.abs(variance).toFixed(2)}`,
      variant: variance < 0 ? "destructive" : "default",
    });
    setCloseDialog(false);
    setCloseDay(null);
    setActualCash("0"); setClosingNotes("");
    loadData();
  };

  const startCloseDay = (day: VanDay) => {
    setCloseDay(day);
    setActualCash("0");
    setClosingNotes("");
    setCloseDialog(true);
  };

  const fmtTime = (iso: string) => new Date(iso).toLocaleString("ar-PS", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">دورة يوم البائع المتجول</h1>
            <p className="text-xs text-muted-foreground">فتح اليوم بتحميل النقدية، ثم إغلاقه بمطابقة المبيعات والكاش</p>
          </div>
          <Button onClick={() => setOpenDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            فتح يوم جديد
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard icon={Clock} label="أيام مفتوحة الآن" value={openDays.length} color="text-emerald-600" bg="bg-emerald-500/10" />
          <KpiCard icon={Calendar} label="إجمالي الأيام" value={days.length} color="text-blue-600" bg="bg-blue-500/10" />
          <KpiCard
            icon={DollarSign}
            label="مبيعات أيام اليوم المفتوحة"
            value={openDays.reduce((s, d) => s + (d.total_sales || 0), 0).toFixed(2)}
            color="text-amber-600" bg="bg-amber-500/10"
          />
        </div>

        {/* Filter */}
        <div className="flex flex-wrap gap-2">
          {(["all", "open", "closed", "cancelled"] as const).map(s => (
            <Button
              key={s}
              size="sm"
              variant={filterStatus === s ? "default" : "outline"}
              onClick={() => setFilterStatus(s)}
            >
              {s === "all" ? "الكل" : STATUS_META[s].label}
            </Button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredDays.length === 0 ? (
          <div className="text-center py-12 border rounded-xl bg-muted/30">
            <Truck className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground">لا توجد أيام عمل بعد</p>
            <Button onClick={() => setOpenDialog(true)} className="mt-3 gap-2" variant="outline">
              <Plus className="h-4 w-4" /> ابدأ يوم عمل
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredDays.map(day => {
              const meta = STATUS_META[day.status];
              const Icon = meta.icon;
              const variance = day.cash_variance ?? 0;
              return (
                <div key={day.id} className="border rounded-xl p-4 bg-card hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-sm">{day.day_number}</span>
                        <Badge variant="outline" className={meta.cls}>
                          <Icon className="h-3 w-3 ml-1" />
                          {meta.label}
                        </Badge>
                      </div>
                      <div className="text-sm font-semibold truncate">
                        {day.sales_rep?.full_name ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {day.warehouse?.name ?? "—"}
                      </div>
                    </div>
                    {day.status === "open" && (
                      <Button size="sm" onClick={() => startCloseDay(day)} className="gap-1 shrink-0">
                        <CheckCircle2 className="h-4 w-4" />
                        إغلاق
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Stat label="فُتح" value={fmtTime(day.opened_at)} />
                    {day.closed_at && <Stat label="أُغلق" value={fmtTime(day.closed_at)} />}
                    <Stat label="نقدية ابتدائية" value={`${day.opening_cash.toFixed(2)} ${day.opening_currency}`} />
                    {day.status === "closed" && (
                      <>
                        <Stat label="مبيعات" value={day.total_sales.toFixed(2)} highlight="text-emerald-600" />
                        <Stat label="تحصيلات" value={day.total_collections.toFixed(2)} highlight="text-blue-600" />
                        <Stat label="عدد الفواتير" value={String(day.total_invoices)} />
                        <Stat label="نقدية متوقعة" value={(day.expected_cash ?? 0).toFixed(2)} />
                        <Stat label="نقدية فعلية" value={(day.actual_cash_collected ?? 0).toFixed(2)} />
                        <div className="col-span-2 mt-1 p-2 rounded-md flex items-center justify-between text-xs"
                          style={{
                            background: variance === 0 ? "hsl(var(--muted))" : variance > 0 ? "hsl(142 70% 45% / 0.1)" : "hsl(0 75% 55% / 0.1)",
                            color: variance === 0 ? "hsl(var(--muted-foreground))" : variance > 0 ? "hsl(142 70% 35%)" : "hsl(0 75% 45%)",
                          }}>
                          <span className="font-semibold flex items-center gap-1">
                            {variance !== 0 && <AlertTriangle className="h-3 w-3" />}
                            {variance === 0 ? "النقدية مطابقة" : variance > 0 ? "فائض نقدي" : "عجز نقدي"}
                          </span>
                          <span className="font-bold font-mono">{Math.abs(variance).toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {(day.opening_notes || day.closing_notes) && (
                    <div className="mt-2 pt-2 border-t text-xs text-muted-foreground space-y-1">
                      {day.opening_notes && <div><span className="font-semibold">فتح:</span> {day.opening_notes}</div>}
                      {day.closing_notes && <div><span className="font-semibold">إغلاق:</span> {day.closing_notes}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Open Day Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>فتح يوم بائع متجول</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>البائع المتجول</Label>
              <Select value={openRepId} onValueChange={setOpenRepId}>
                <SelectTrigger><SelectValue placeholder="اختر البائع" /></SelectTrigger>
                <SelectContent>
                  {reps.map(r => (
                    <SelectItem key={r.id} value={r.id} disabled={!r.default_warehouse_id}>
                      {r.full_name} {!r.default_warehouse_id && "(لا يوجد مستودع)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>النقدية الابتدائية</Label>
                <Input type="number" step="0.01" value={openCash} onChange={e => setOpenCash(e.target.value)} />
              </div>
              <div>
                <Label>العملة</Label>
                <Select value={openCurrency} onValueChange={setOpenCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ILS">شيكل</SelectItem>
                    <SelectItem value="USD">دولار</SelectItem>
                    <SelectItem value="JOD">دينار</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>ملاحظات (اختياري)</Label>
              <Textarea value={openNotes} onChange={e => setOpenNotes(e.target.value)} rows={2} placeholder="أي ملاحظة عن بدء اليوم..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>إلغاء</Button>
            <Button onClick={handleOpenDay} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              فتح اليوم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Day Dialog */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إغلاق ومطابقة يوم {closeDay?.day_number}</DialogTitle>
          </DialogHeader>
          {closeDay && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border p-3 bg-muted/30 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">البائع</span><span className="font-semibold">{closeDay.sales_rep?.full_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">المستودع</span><span>{closeDay.warehouse?.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">فُتح في</span><span>{fmtTime(closeDay.opened_at)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">نقدية ابتدائية</span><span className="font-mono font-bold">{closeDay.opening_cash.toFixed(2)}</span></div>
              </div>
              <div className="rounded-lg border p-3 bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300">
                ⚠️ سيقوم النظام تلقائياً بحساب المبيعات والتحصيلات من فترة فتح اليوم حتى الآن، ومقارنتها مع النقدية الفعلية المُسلَّمة.
              </div>
              <div>
                <Label>النقدية الفعلية المُسلَّمة</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={actualCash}
                  onChange={e => setActualCash(e.target.value)}
                  className="text-lg font-bold font-mono"
                  autoFocus
                />
              </div>
              <div>
                <Label>ملاحظات الإغلاق (اختياري)</Label>
                <Textarea value={closingNotes} onChange={e => setClosingNotes(e.target.value)} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialog(false)}>إلغاء</Button>
            <Button onClick={handleCloseDay} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              إغلاق ومطابقة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const KpiCard = ({ icon: Icon, label, value, color, bg }: any) => (
  <div className="border rounded-xl p-4 bg-card flex items-center gap-3">
    <div className={`h-10 w-10 rounded-lg ${bg} flex items-center justify-center ${color}`}>
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold truncate">{value}</div>
    </div>
  </div>
);

const Stat = ({ label, value, highlight }: { label: string; value: string; highlight?: string }) => (
  <div className="flex justify-between gap-2 py-1 border-b border-dashed border-border/60 last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className={`font-mono font-semibold ${highlight ?? ""}`}>{value}</span>
  </div>
);

export default VanDaysPage;
