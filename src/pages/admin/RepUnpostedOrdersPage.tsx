import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, RefreshCw, AlertTriangle } from "lucide-react";

interface UnpostedInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  payment_method: string;
  contact_name: string | null;
  warehouse_id: string | null;
  status: string;
}

export default function RepUnpostedOrdersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<UnpostedInvoice[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("invoices")
      .select("id, invoice_number, invoice_date, total_amount, payment_method, contact_name, warehouse_id, status, is_voided")
      .eq("source", "rep")
      .is("linked_transaction_id", null)
      .eq("is_voided", false)
      .not("status", "in", "(cancelled,void,reversed)")
      .order("invoice_date", { ascending: false });
    if (error) {
      toast({ title: "تعذّر تحميل القائمة", description: error.message, variant: "destructive" });
    } else {
      setRows(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const postNow = async (id: string) => {
    setBusyId(id);
    try {
      const { data, error } = await (supabase as any).rpc("rep_invoice_post_now", { p_invoice_id: id });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "فشل الترحيل");
      toast({ title: "تم الترحيل بنجاح", description: data.unknown_cost ? "بعض البنود بدون سعر تكلفة" : undefined });
      await load();
    } catch (e: any) {
      toast({ title: "فشل الترحيل", description: e.message, variant: "destructive" });
    } finally { setBusyId(null); }
  };

  const voidLegacy = async (id: string) => {
    const reason = prompt("سبب الإلغاء (اختياري):") || "legacy void";
    setBusyId(id);
    try {
      const { data, error } = await (supabase as any).rpc("rep_invoice_void_legacy", { p_invoice_id: id, p_reason: reason });
      if (error) throw error;
      if (!data?.success) throw new Error("فشل الإلغاء");
      toast({ title: "تم الإلغاء" });
      await load();
    } catch (e: any) {
      toast({ title: "فشل الإلغاء", description: e.message, variant: "destructive" });
    } finally { setBusyId(null); }
  };

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">طلبات مندوب غير مرحّلة</h1>
          <p className="text-sm text-muted-foreground mt-1">فواتير المندوبين القديمة بدون قيد محاسبي ولا حركة مخزون</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ml-2 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-500" />
          لا توجد طلبات غير مرحّلة. كل شيء على ما يرام.
        </Card>
      ) : (
        <Card className="p-4">
          <div className="flex items-start gap-2 p-3 mb-3 rounded-md bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              هذه الفواتير لم تُسجَّل في دفتر اليومية ولم تُخصم من المخزون. اختر "ترحيل الآن" لإصلاحها أو "إلغاء" إذا كانت طلبات تجريبية.
            </div>
          </div>
          <div className="space-y-2">
            {rows.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 p-3 border border-border rounded-md hover:bg-muted/30">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{inv.invoice_number}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{inv.payment_method}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {inv.invoice_date} • {inv.contact_name || "بيع نقدي"} • {Number(inv.total_amount).toFixed(2)} ₪
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => postNow(inv.id)} disabled={busyId === inv.id}>
                    {busyId === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 ml-1" />} ترحيل
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => voidLegacy(inv.id)} disabled={busyId === inv.id}>
                    <XCircle className="w-4 h-4 ml-1 text-destructive" /> إلغاء
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}