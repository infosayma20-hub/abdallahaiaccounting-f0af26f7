import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, CheckCircle2, XCircle, FileText } from "lucide-react";

type Req = {
  id: string;
  invoice_id: string;
  requested_by: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  proposed_items: any[];
  original_snapshot: any;
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  new_invoice_id: string | null;
};

export default function RepEditRequestsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [rows, setRows] = useState<Req[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Req | null>(null);
  const [rejecting, setRejecting] = useState<Req | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("rep_edit_requests")
        .select("*")
        .eq("status", tab)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setRows((data || []) as Req[]);
    } catch (e: any) {
      toast({ title: "تعذر تحميل الطلبات", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const approve = async (r: Req) => {
    if (!confirm(`تأكيد الموافقة وتنفيذ التعديل على الفاتورة؟ سيتم إلغاء الفاتورة الأصلية وإصدار قيد جديد بنفس الرقم.`)) return;
    setBusyId(r.id);
    try {
      const { data, error } = await (supabase as any).rpc("apply_rep_invoice_edit", { p_request_id: r.id });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "فشل التنفيذ");
      toast({ title: "تم تنفيذ التعديل", description: `رقم الفاتورة: ${data.invoice_number}` });
      await load();
    } catch (e: any) {
      toast({ title: "فشل الموافقة", description: e.message, variant: "destructive" });
    } finally { setBusyId(null); }
  };

  const reject = async () => {
    if (!rejecting) return;
    if (rejectNote.trim().length < 3) {
      toast({ title: "اكتب سبب الرفض", variant: "destructive" });
      return;
    }
    setBusyId(rejecting.id);
    try {
      const { data, error } = await (supabase as any).rpc("reject_rep_invoice_edit", {
        p_request_id: rejecting.id, p_note: rejectNote.trim(),
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "فشل الرفض");
      toast({ title: "تم رفض الطلب" });
      setRejecting(null); setRejectNote("");
      await load();
    } catch (e: any) {
      toast({ title: "فشل الرفض", description: e.message, variant: "destructive" });
    } finally { setBusyId(null); }
  };

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">طلبات تعديل فواتير المندوبين</h1>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(["pending", "approved", "rejected"] as const).map((t) => (
          <Button
            key={t}
            variant={tab === t ? "default" : "outline"}
            size="sm" onClick={() => setTab(t)} className="h-9"
          >
            {t === "pending" ? "قيد المراجعة" : t === "approved" ? "موافق عليها" : "مرفوضة"}
          </Button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && rows.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground text-sm">لا يوجد طلبات</Card>
      )}

      {rows.map((r) => {
        const inv = r.original_snapshot?.invoice;
        const oldTotal = Number(inv?.total_amount || 0);
        const newTotal = (r.proposed_items || []).reduce(
          (s: number, i: any) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0
        );
        return (
          <Card key={r.id} className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">
                  فاتورة: {inv?.invoice_number || r.invoice_id.slice(0, 8)}
                  <Badge variant="outline" className="mr-2">
                    {inv?.payment_method === "cash" ? "نقدي" : "آجل"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(r.created_at).toLocaleString("ar-EG")}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setViewing(r)}>
                <FileText className="w-4 h-4 ml-1" /> تفاصيل
              </Button>
            </div>

            <div className="text-sm">
              <span className="text-muted-foreground">السبب: </span>{r.reason}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="border rounded p-2">
                <div className="text-xs text-muted-foreground">الإجمالي القديم</div>
                <div className="font-bold">{oldTotal.toFixed(2)} ₪</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-xs text-muted-foreground">الإجمالي الجديد</div>
                <div className={`font-bold ${newTotal > oldTotal ? "text-primary" : newTotal < oldTotal ? "text-destructive" : ""}`}>
                  {newTotal.toFixed(2)} ₪
                </div>
              </div>
            </div>

            {r.status === "pending" && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                <Button
                  variant="outline" className="text-destructive border-destructive/30"
                  onClick={() => { setRejecting(r); setRejectNote(""); }}
                  disabled={busyId === r.id}
                >
                  <XCircle className="w-4 h-4 ml-1" /> رفض
                </Button>
                <Button onClick={() => approve(r)} disabled={busyId === r.id}>
                  {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <CheckCircle2 className="w-4 h-4 ml-1" />}
                  موافقة وتنفيذ
                </Button>
              </div>
            )}

            {r.status === "rejected" && r.review_note && (
              <div className="text-xs text-destructive border-t pt-2">سبب الرفض: {r.review_note}</div>
            )}
            {r.status === "approved" && r.reviewed_at && (
              <div className="text-xs text-primary border-t pt-2">
                تم التنفيذ في {new Date(r.reviewed_at).toLocaleString("ar-EG")}
              </div>
            )}
          </Card>
        );
      })}

      {/* Details Dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل الطلب — مقارنة قبل/بعد</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <h4 className="font-semibold mb-2">البنود الحالية</h4>
                <div className="space-y-1 text-xs">
                  {(viewing.original_snapshot?.items || []).map((it: any, i: number) => (
                    <div key={i} className="border rounded p-2">
                      <div className="truncate">{it.product_name}</div>
                      <div className="text-muted-foreground">
                        {Number(it.quantity)} × {Number(it.unit_price).toFixed(2)} = {(Number(it.quantity) * Number(it.unit_price)).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2">البنود المقترحة</h4>
                <div className="space-y-1 text-xs">
                  {(viewing.proposed_items || []).map((it: any, i: number) => (
                    <div key={i} className="border rounded p-2">
                      <div className="truncate">{it.product_id?.slice(0, 8)}</div>
                      <div className="text-muted-foreground">
                        {Number(it.quantity)} × {Number(it.unit_price).toFixed(2)} = {(Number(it.quantity) * Number(it.unit_price)).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>رفض طلب التعديل</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="اكتب سبب الرفض لإرساله للمندوب..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={!!busyId}>إلغاء</Button>
            <Button variant="destructive" onClick={reject} disabled={!!busyId}>
              {busyId ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}