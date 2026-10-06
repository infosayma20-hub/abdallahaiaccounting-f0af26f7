import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { FinanceShell } from "@/components/finance/shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const fmt = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const METHOD_LABEL: Record<string, string> = {
  moving_avg: "المتوسط المتحرك", weighted_avg_period: "المتوسط المرجّح للفترة", fifo: "FIFO",
};
const SYSTEM_LABEL: Record<string, string> = { perpetual: "جرد مستمر", periodic: "جرد دوري" };
const REF_LABEL: Record<string, string> = {
  invoice: "فاتورة", purchase_invoice: "فاتورة مشتريات", invoice_void: "إلغاء فاتورة",
  pos_order_line_sale: "بيع نقطة البيع", pos_order_line_return: "مرتجع نقطة البيع",
  stock_transfer: "تحويل مخزني", stock_transfer_cancel: "إلغاء تحويل", manual_adjustment: "تسوية يدوية",
  stock_count: "جرد موظف", delivery_note: "سند تسليم", sales_return: "مرتجع مبيعات", purchase_return: "مرتجع مشتريات",
  opening_balance: "رصيد افتتاحي", stock_doc: "سند مخزني", warehouse_assignment: "توزيع مستودع",
};
const TYPE_LABEL: Record<string, string> = { opening: "افتتاحي", in: "وارد", out: "صادر", reversal: "عكس" };

const InventoryCostingPage = () => {
  const { dataOwnerId } = useDataOwnerId();
  const [rec, setRec] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<any[]>([]);
  const [cardLoading, setCardLoading] = useState(false);

  const loadRec = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase.rpc as any)("inventory_costing_reconciliation");
    setRec(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadRec(); }, [loadRec]);

  useEffect(() => {
    if (!dataOwnerId) return;
    (async () => {
      const [{ data: ws }, { data: bal }] = await Promise.all([
        supabase.from("warehouses").select("id,name").eq("user_id", dataOwnerId),
        (supabase.from as any)("inventory_cost_balances").select("product_id").eq("user_id", dataOwnerId).limit(5000),
      ]);
      setWarehouses(ws || []);
      const ids = [...new Set((bal || []).map((b: any) => b.product_id))] as string[];
      const names: { id: string; name: string }[] = [];
      for (let i = 0; i < ids.length; i += 300) {
        const { data } = await supabase.from("products").select("id,name").in("id", ids.slice(i, i + 300));
        names.push(...(data || []));
      }
      setProducts(names.sort((a, b) => a.name.localeCompare(b.name, "ar")));
    })();
  }, [dataOwnerId]);

  useEffect(() => {
    if (!productId) { setEntries([]); return; }
    (async () => {
      setCardLoading(true);
      let q = (supabase.from as any)("inventory_cost_entries")
        .select("seq,entry_type,reference_type,warehouse_id,quantity,unit_cost,total_cost,cost_source,negative_stock,negative_variance,balance_qty_after,balance_value_after,avg_cost_after,movement_at")
        .eq("product_id", productId).order("seq", { ascending: true }).limit(2000);
      if (warehouseId !== "all") q = q.eq("warehouse_id", warehouseId);
      const { data } = await q;
      setEntries(data || []);
      setCardLoading(false);
    })();
  }, [productId, warehouseId]);

  const whName = useMemo(() => Object.fromEntries(warehouses.map(w => [w.id, w.name])), [warehouses]);
  const filteredProducts = useMemo(
    () => products.filter(p => !search || p.name.includes(search)).slice(0, 200),
    [products, search],
  );

  const diff = rec?.enabled ? Number(rec.engine_value) - Number(rec.gl_engine_account) : 0;
  const unpostedNet = (rec?.unposted || []).reduce((s: number, u: any) => s + Number(u.net_value || 0), 0);
  const unexplained = rec?.enabled ? diff - Number(rec.opening_value || 0) - unpostedNet : 0;

  return (
    <FinanceShell
      title="تكلفة المخزون"
      subtitle={rec?.enabled ? `${SYSTEM_LABEL[rec.system]} — ${METHOD_LABEL[rec.method]}` : "محرك التكلفة غير مفعّل"}
      breadcrumb={[{ label: "الرئيسية", href: "/" }, { label: "المخزون", href: "/inventory" }, { label: "تكلفة المخزون" }]}
    >
      <div dir="rtl">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !rec?.enabled ? (
          <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
            محرك تكلفة المخزون غير مفعّل لهذه الشركة.{" "}
            <Link to="/settings?section=inventory" className="text-primary underline">فعّله من الإعدادات</Link>
          </div>
        ) : (
          <Tabs dir="rtl" defaultValue="rec">
            <TabsList>
              <TabsTrigger value="rec">المطابقة</TabsTrigger>
              <TabsTrigger value="card">كرت الصنف</TabsTrigger>
            </TabsList>

            <TabsContent value="rec" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border p-4">
                  <p className="text-[11px] text-muted-foreground">قيمة المخزون حسب المحرك</p>
                  <p className="text-lg font-bold tabular-nums">₪{fmt(rec.engine_value)}</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-[11px] text-muted-foreground">رصيد حساب {rec.inventory_account || "المخزون"} في الدفاتر</p>
                  <p className="text-lg font-bold tabular-nums">₪{fmt(rec.gl_engine_account)}</p>
                </div>
                <div className={`rounded-lg border p-4 ${Math.abs(diff) < 0.01 ? "border-border" : "border-destructive/50"}`}>
                  <p className="text-[11px] text-muted-foreground">الفرق</p>
                  <p className={`text-lg font-bold tabular-nums flex items-center gap-1 ${Math.abs(diff) < 0.01 ? "" : "text-destructive"}`}>
                    {Math.abs(diff) < 0.01 ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4" />}
                    ₪{fmt(diff)}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-[11px] text-muted-foreground">مجموعة المخزون 1140 كاملة</p>
                  <p className="text-lg font-bold tabular-nums">₪{fmt(rec.gl_inventory_group)}</p>
                </div>
              </div>

              <div className={`rounded-lg border p-3 text-sm flex items-center gap-2 ${Math.abs(unexplained) < 0.01 ? "border-border" : "border-destructive/50 text-destructive"}`}>
                {Math.abs(unexplained) < 0.01 ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4" />}
                <span>
                  الفرق = الرصيد الافتتاحي للتكلفة ₪{fmt(rec.opening_value)} + حركات بدون قيد تلقائي ₪{fmt(unpostedNet)}
                  {" — "}فرق غير مفسَّر: <b className="tabular-nums">₪{fmt(unexplained)}</b>
                </span>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>ساري منذ: {rec.effective_from ? new Date(rec.effective_from).toLocaleString("ar") : "—"}</p>
                <p>
                  الفرق المتوقع = القيمة الافتتاحية + الحركات التي لا تُرحَّل تلقائيًا (الجدول أدناه).
                  {rec.system === "periodic" && " في الجرد الدوري لا تُرحَّل حركات التكلفة؛ تُثبت القيمة في تسوية آخر المدة."}
                </p>
                {(rec.negative_lines > 0 || rec.zero_cost_lines > 0) && (
                  <p className="text-destructive">أرصدة سالبة: {rec.negative_lines} — أصناف بكمية وبدون تكلفة: {rec.zero_cost_lines}</p>
                )}
              </div>

              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr><th className="p-2 text-right">نوع الحركة (بدون قيد تلقائي)</th><th className="p-2 text-right">عدد</th><th className="p-2 text-right">صافي القيمة</th></tr>
                  </thead>
                  <tbody>
                    {(rec.unposted || []).length === 0 ? (
                      <tr><td colSpan={3} className="p-3 text-center text-muted-foreground">كل الحركات لها قيود</td></tr>
                    ) : rec.unposted.map((u: any) => (
                      <tr key={u.reference_type} className="border-t border-border">
                        <td className="p-2">{REF_LABEL[u.reference_type] || u.reference_type}</td>
                        <td className="p-2 tabular-nums">{u.entries}</td>
                        <td className="p-2 tabular-nums">₪{fmt(u.net_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" onClick={loadRec}><RefreshCw className="h-4 w-4 ml-1" />تحديث</Button>
            </TabsContent>

            <TabsContent value="card" className="space-y-3">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="w-64">
                  <Input placeholder="بحث عن صنف…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Select dir="rtl" value={productId} onValueChange={setProductId}>
                  <SelectTrigger className="w-72"><SelectValue placeholder="اختر الصنف" /></SelectTrigger>
                  <SelectContent>
                    {filteredProducts.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select dir="rtl" value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل المستودعات</SelectItem>
                    {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {cardLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : !productId ? (
                <p className="text-sm text-muted-foreground">اختر صنفًا لعرض حركاته وتكلفته بعد كل حركة.</p>
              ) : (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        {["التاريخ", "المستودع", "النوع", "المصدر", "الكمية", "تكلفة الوحدة", "إجمالي التكلفة", "الرصيد", "قيمة الرصيد", "المتوسط بعد الحركة"].map(h =>
                          <th key={h} className="p-2 text-right whitespace-nowrap">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(e => (
                        <tr key={e.seq} className={`border-t border-border ${e.entry_type === "reversal" ? "text-muted-foreground" : ""}`}>
                          <td className="p-2 whitespace-nowrap">{new Date(e.movement_at).toLocaleString("ar")}</td>
                          <td className="p-2">{whName[e.warehouse_id] || "—"}</td>
                          <td className="p-2">{TYPE_LABEL[e.entry_type] || e.entry_type}{e.negative_stock ? " ⚠" : ""}</td>
                          <td className="p-2">{e.entry_type === "opening" ? "رصيد افتتاحي للتكلفة" : (REF_LABEL[e.reference_type] || e.reference_type || "—")}</td>
                          <td className="p-2 tabular-nums">{fmt(e.quantity)}</td>
                          <td className="p-2 tabular-nums">{fmt(e.unit_cost)}</td>
                          <td className="p-2 tabular-nums">{fmt(e.total_cost)}</td>
                          <td className="p-2 tabular-nums">{fmt(e.balance_qty_after)}</td>
                          <td className="p-2 tabular-nums">{fmt(e.balance_value_after)}</td>
                          <td className="p-2 tabular-nums">{fmt(e.avg_cost_after)}</td>
                        </tr>
                      ))}
                      {entries.length === 0 && <tr><td colSpan={10} className="p-3 text-center text-muted-foreground">لا توجد حركات</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </FinanceShell>
  );
};

export default InventoryCostingPage;
