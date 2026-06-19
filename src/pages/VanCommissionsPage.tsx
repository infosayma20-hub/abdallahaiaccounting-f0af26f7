import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Calculator, DollarSign, TrendingUp, CheckCircle2,
  Loader2, User, Calendar, Wallet, Receipt, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface SalesRep {
  id: string;
  full_name: string;
  default_warehouse_id: string | null;
  sales_commission_rate: number;
  collection_commission_rate: number;
  linked_account_name: string | null;
}

interface CommissionRow {
  id: string;
  representative_id: string;
  commission_type: string;
  reference_type: string;
  reference_description: string | null;
  base_amount: number;
  commission_rate: number;
  commission_amount: number;
  is_paid: boolean;
  paid_date: string | null;
  created_at: string;
}

interface PeriodTotals {
  salesBase: number;
  collectionBase: number;
  invoicesCount: number;
  receiptsCount: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("ar", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function VanCommissionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [reps, setReps] = useState<SalesRep[]>([]);
  const [selectedRepId, setSelectedRepId] = useState<string>("");
  const [from, setFrom] = useState<string>(monthStartISO());
  const [to, setTo] = useState<string>(todayISO());

  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [totals, setTotals] = useState<PeriodTotals>({
    salesBase: 0,
    collectionBase: 0,
    invoicesCount: 0,
    receiptsCount: 0,
  });

  const [salesRate, setSalesRate] = useState<number>(0);
  const [collectionRate, setCollectionRate] = useState<number>(0);

  const [history, setHistory] = useState<CommissionRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const selectedRep = useMemo(
    () => reps.find((r) => r.id === selectedRepId) || null,
    [reps, selectedRepId]
  );

  // Load reps
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("sales_representatives")
        .select("id, full_name, default_warehouse_id, sales_commission_rate, collection_commission_rate, linked_account_name")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("full_name");
      setLoading(false);
      if (error) {
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
        return;
      }
      setReps(data || []);
      if (data && data.length > 0 && !selectedRepId) setSelectedRepId(data[0].id);
    })();
  }, [user]);

  // Apply rep defaults
  useEffect(() => {
    if (selectedRep) {
      setSalesRate(Number(selectedRep.sales_commission_rate) || 0);
      setCollectionRate(Number(selectedRep.collection_commission_rate) || 0);
    }
  }, [selectedRepId]);

  // Compute totals + history
  const recompute = async () => {
    if (!user || !selectedRep) return;
    setComputing(true);

    // Sales base: sum of invoices in rep's warehouse during [from..to]
    const warehouseId = selectedRep.default_warehouse_id;
    let salesBase = 0;
    let invoicesCount = 0;
    let collectionBase = 0;
    let receiptsCount = 0;

    if (warehouseId) {
      const { data: invs, error: e1 } = await supabase
        .from("invoices")
        .select("id, total_amount")
        .eq("user_id", user.id)
        .eq("warehouse_id", warehouseId)
        .eq("invoice_type", "sale")
        .eq("is_voided", false)
        .gte("invoice_date", from)
        .lte("invoice_date", to)
        .not("status", "in", "(cancelled,void,reversed)");
      if (e1) {
        toast({ title: "خطأ بالمبيعات", description: e1.message, variant: "destructive" });
      } else {
        invoicesCount = invs?.length || 0;
        salesBase = (invs || []).reduce((s, i) => s + Number(i.total_amount || 0), 0);
      }

      // Collections: receipts from customers who have invoices in this warehouse
      const { data: warehouseInvoices } = await supabase
        .from("invoices")
        .select("contact_id")
        .eq("user_id", user.id)
        .eq("warehouse_id", warehouseId)
        .eq("is_voided", false)
        .not("status", "in", "(cancelled,void,reversed)");
      const contactIds = Array.from(
        new Set((warehouseInvoices || []).map((x: any) => x.contact_id).filter(Boolean))
      );

      if (contactIds.length > 0) {
        const { data: rcps } = await supabase
          .from("transactions")
          .select("id, amount")
          .eq("user_id", user.id)
          .in("transaction_type", ["receipt", "سند قبض"])
          .gte("transaction_date", from)
          .lte("transaction_date", to)
          .in("contact_id", contactIds);
        const list = (rcps || []) as Array<{ id: string; amount: number }>;
        receiptsCount = list.length;
        collectionBase = list.reduce((s, r) => s + Number(r.amount || 0), 0);
      }
    }

    setTotals({ salesBase, collectionBase, invoicesCount, receiptsCount });

    // History
    const { data: hist } = await supabase
      .from("commissions")
      .select("*")
      .eq("user_id", user.id)
      .eq("representative_id", selectedRep.id)
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`)
      .order("created_at", { ascending: false });
    setHistory((hist || []) as CommissionRow[]);

    setComputing(false);
  };

  useEffect(() => {
    if (selectedRepId) recompute();
  }, [selectedRepId, from, to]);

  const salesCommission = (totals.salesBase * (salesRate || 0)) / 100;
  const collectionCommission = (totals.collectionBase * (collectionRate || 0)) / 100;
  const totalCommission = salesCommission + collectionCommission;

  const createRecords = async () => {
    if (!user || !selectedRep) return;
    setCreating(true);
    const desc = `الفترة من ${from} إلى ${to}`;
    const rows: any[] = [];
    if (totals.salesBase > 0 && salesRate > 0) {
      rows.push({
        user_id: user.id,
        representative_id: selectedRep.id,
        commission_type: "عمولة مبيعات",
        reference_type: "أخرى",
        reference_description: desc,
        base_amount: totals.salesBase,
        commission_rate: salesRate,
        commission_amount: salesCommission,
        linked_account_name: selectedRep.linked_account_name,
      });
    }
    if (totals.collectionBase > 0 && collectionRate > 0) {
      rows.push({
        user_id: user.id,
        representative_id: selectedRep.id,
        commission_type: "عمولة تحصيل",
        reference_type: "أخرى",
        reference_description: desc,
        base_amount: totals.collectionBase,
        commission_rate: collectionRate,
        commission_amount: collectionCommission,
        linked_account_name: selectedRep.linked_account_name,
      });
    }
    if (rows.length === 0) {
      toast({ title: "لا يوجد ما يُحتسب", description: "البيس أو النسبة = صفر", variant: "destructive" });
      setCreating(false);
      return;
    }
    const { error } = await supabase.from("commissions").insert(rows);
    setCreating(false);
    if (error) {
      toast({ title: "فشل الإنشاء", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "تم بنجاح", description: `تم إنشاء ${rows.length} سجل عمولة` });
    setCreateOpen(false);
    recompute();
  };

  const togglePaid = async (row: CommissionRow) => {
    const { error } = await supabase
      .from("commissions")
      .update({
        is_paid: !row.is_paid,
        paid_date: !row.is_paid ? todayISO() : null,
      })
      .eq("id", row.id);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    recompute();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="container max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold">عمولات البائعين المتجولين</h1>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)} disabled={!selectedRep || totalCommission <= 0}>
            <Plus className="h-4 w-4 ml-1" />
            احتساب وحفظ
          </Button>
        </div>
      </div>

      <div className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-lg border bg-card">
          <div>
            <Label>البائع</Label>
            <Select value={selectedRepId} onValueChange={setSelectedRepId} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="اختر البائع" />
              </SelectTrigger>
              <SelectContent>
                {reps.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.full_name}
                    {!r.default_warehouse_id && " (بدون مستودع)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>من</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>إلى</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {!selectedRep ? (
          <div className="text-center py-12 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>اختر بائعاً لعرض العمولات</p>
          </div>
        ) : !selectedRep.default_warehouse_id ? (
          <div className="text-center py-12 rounded-lg border bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300">
            <p className="font-semibold">لا يوجد مستودع افتراضي لهذا البائع</p>
            <p className="text-sm mt-1">اربط مستودعاً به من صفحة مندوبي المبيعات</p>
            <Button className="mt-3" variant="outline" onClick={() => navigate("/sales-reps")}>
              فتح مندوبي المبيعات
            </Button>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                icon={<Receipt className="h-5 w-5" />}
                label="عدد الفواتير"
                value={String(totals.invoicesCount)}
                tone="blue"
              />
              <KpiCard
                icon={<TrendingUp className="h-5 w-5" />}
                label="إجمالي المبيعات"
                value={fmt(totals.salesBase)}
                tone="emerald"
              />
              <KpiCard
                icon={<Wallet className="h-5 w-5" />}
                label="عدد سندات القبض"
                value={String(totals.receiptsCount)}
                tone="violet"
              />
              <KpiCard
                icon={<DollarSign className="h-5 w-5" />}
                label="إجمالي التحصيلات"
                value={fmt(totals.collectionBase)}
                tone="amber"
              />
            </div>

            {/* Calculator */}
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <h2 className="font-bold flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                احتساب العمولة
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CalcRow
                  label="عمولة المبيعات"
                  base={totals.salesBase}
                  rate={salesRate}
                  onRate={setSalesRate}
                  result={salesCommission}
                />
                <CalcRow
                  label="عمولة التحصيل"
                  base={totals.collectionBase}
                  rate={collectionRate}
                  onRate={setCollectionRate}
                  result={collectionCommission}
                />
              </div>

              <div className="pt-3 border-t flex items-center justify-between">
                <span className="text-sm text-muted-foreground">إجمالي العمولة المستحقة</span>
                <span className="text-2xl font-bold text-primary">{fmt(totalCommission)} ₪</span>
              </div>
            </div>

            {/* History */}
            <div className="rounded-lg border bg-card">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h2 className="font-bold">سجل عمولات الفترة</h2>
                {computing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              {history.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  لا توجد عمولات مسجلة في هذه الفترة
                </div>
              ) : (
                <div className="divide-y">
                  {history.map((h) => (
                    <div key={h.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={h.commission_type === "عمولة مبيعات" ? "default" : "secondary"}>
                            {h.commission_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(h.created_at).toLocaleDateString("ar")}
                          </span>
                        </div>
                        <p className="text-sm truncate">{h.reference_description || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          أساس: {fmt(h.base_amount)} × {h.commission_rate}%
                        </p>
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-primary">{fmt(h.commission_amount)} ₪</div>
                        <Button
                          size="sm"
                          variant={h.is_paid ? "outline" : "default"}
                          className="mt-1 h-7 text-xs"
                          onClick={() => togglePaid(h)}
                        >
                          {h.is_paid ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 ml-1" />
                              مدفوعة {h.paid_date}
                            </>
                          ) : (
                            "تعليم كمدفوعة"
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Confirm dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد إنشاء سجل العمولة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <Row label="البائع" value={selectedRep?.full_name || "—"} />
            <Row label="الفترة" value={`${from} ← ${to}`} />
            <div className="border-t pt-2 space-y-2">
              <Row label="عمولة مبيعات" value={`${fmt(salesCommission)} ₪`} />
              <Row label="عمولة تحصيل" value={`${fmt(collectionCommission)} ₪`} />
              <div className="flex justify-between font-bold text-base pt-2 border-t">
                <span>الإجمالي</span>
                <span className="text-primary">{fmt(totalCommission)} ₪</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={createRecords} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              تأكيد وحفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: string; tone: "blue" | "emerald" | "violet" | "amber" }) {
  const tones: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  };
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-8 w-8 rounded-md flex items-center justify-center ${tones[tone]}`}>{icon}</div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function CalcRow({
  label, base, rate, onRate, result,
}: { label: string; base: number; rate: number; onRate: (n: number) => void; result: number }) {
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="text-sm font-semibold">{label}</div>
      <div className="grid grid-cols-3 gap-2 items-end">
        <div>
          <Label className="text-xs">الأساس</Label>
          <Input value={fmt(base)} disabled className="text-left" />
        </div>
        <div>
          <Label className="text-xs">النسبة %</Label>
          <Input
            type="number"
            step="0.01"
            value={rate}
            onChange={(e) => onRate(Number(e.target.value))}
          />
        </div>
        <div>
          <Label className="text-xs">العمولة</Label>
          <Input value={fmt(result)} disabled className="text-left font-bold text-primary" />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
