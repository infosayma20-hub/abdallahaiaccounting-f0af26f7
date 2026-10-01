import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Link2, Paperclip, XCircle, Search, ScanLine } from "lucide-react";

/**
 * لوحة المحاسب لطلبية «استلام مباشر»: الموظف، صورة الفاتورة، ربط البنود المؤقتة، والرفض.
 * الاعتماد يتم بالفوترة العادية (تحويل لفاتورة) بعد ربط كل البنود المؤقتة.
 */
export default function DirectReceivingReviewPanel({ order, onChanged }: { order: any; onChanged: () => void }) {
  const [employee, setEmployee] = useState<string>("");
  const [temps, setTemps] = useState<any[]>([]);
  const [linkLine, setLinkLine] = useState<any | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = order.review_status === "pending_review";

  const load = async () => {
    const [{ data: emp }, { data: items }] = await Promise.all([
      order.submitted_by_employee_id
        ? supabase.from("employees").select("full_name").eq("id", order.submitted_by_employee_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      supabase.from("procurement_order_items" as any).select("id, item_name, unit, quantity, temp_barcode, temp_photo_path, product_id")
        .eq("order_id", order.id).is("product_id", null),
    ]);
    setEmployee((emp as any)?.full_name || "");
    setTemps((items as any[]) || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [order.id]);

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("direct-receiving").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { toast.error("تعذر فتح الصورة"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  useEffect(() => {
    if (!linkLine) return;
    const term = q.trim();
    const t = setTimeout(async () => {
      let query = supabase.from("products").select("id, name, barcode, unit").eq("user_id", order.user_id).limit(20);
      if (term) query = query.or(`name.ilike.%${term.replace(/[%,()]/g, " ")}%,barcode.eq.${term.replace(/[%,()]/g, "")}`);
      const { data } = await query;
      setResults((data as any[]) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, linkLine, order.user_id]);

  const link = async (productId: string) => {
    if (!linkLine) return;
    setBusy(true);
    const { error } = await supabase.rpc("direct_receiving_link_temp_line" as any, { p_line_id: linkLine.id, p_product_id: productId });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم ربط البند بالصنف");
    setLinkLine(null); setQ(""); load(); onChanged();
  };

  const reject = async () => {
    if (!reason.trim()) { toast.error("اكتب سبب الرفض"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("direct_receiving_reject" as any, { p_order_id: order.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم رفض الاستلام وإبلاغ الموظف");
    setRejectOpen(false); onChanged();
  };

  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold text-primary"><ScanLine className="h-4 w-4" />استلام مباشر من الموظف</div>
        <span className="text-xs text-muted-foreground">
          {order.review_status === "pending_review" ? "بانتظار التدقيق" : order.review_status === "approved" ? "معتمد ومفوتر" : order.review_status === "rejected" ? "مرفوض" : "الموظف ما زال يستلم"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-muted-foreground">الموظف: </span><b>{employee || "—"}</b></div>
        <div><span className="text-muted-foreground">رقم فاتورة المورد: </span><b>{order.supplier_invoice_no || "—"}</b></div>
      </div>
      {order.attachment_path && (
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => openFile(order.attachment_path)}><Paperclip className="h-3.5 w-3.5" />عرض صورة فاتورة المورد</Button>
      )}
      {order.reject_reason && <div className="text-xs text-destructive">سبب الرفض: {order.reject_reason}</div>}

      {temps.length > 0 && (
        <div className="space-y-1 rounded border border-destructive/30 bg-background p-2">
          <div className="text-xs font-semibold text-destructive">بنود مؤقتة لازم تنربط قبل الفوترة ({temps.length})</div>
          {temps.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <div className="truncate font-medium">{t.item_name} × {t.quantity}</div>
                <div className="text-muted-foreground" dir="ltr">{t.temp_barcode || "بدون باركود"}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                {t.temp_photo_path && <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openFile(t.temp_photo_path)}>صورة</Button>}
                {pending && <Button size="sm" variant="outline" className="h-7 gap-1 px-2" onClick={() => { setLinkLine(t); setQ(t.item_name); }}><Link2 className="h-3 w-3" />ربط بصنف</Button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {pending && (
        <Button size="sm" variant="outline" className="h-8 gap-1 text-destructive" onClick={() => setRejectOpen(true)}><XCircle className="h-3.5 w-3.5" />رفض الاستلام</Button>
      )}

      <Dialog open={!!linkLine} onOpenChange={o => !o && setLinkLine(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>ربط «{linkLine?.item_name}» بصنف</DialogTitle>
            <DialogDescription>اختر صنف المخزون. إذا الصنف ما إله باركود، بينحفظ عليه باركود البند.</DialogDescription></DialogHeader>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث بالاسم أو الباركود…" className="pr-9" />
          </div>
          <div className="max-h-72 divide-y overflow-y-auto rounded border">
            {results.length === 0 ? <div className="p-4 text-center text-xs text-muted-foreground">لا نتائج — أنشئ الصنف من المخزون ثم اربطه</div> :
              results.map(r => (
                <button key={r.id} disabled={busy} onClick={() => link(r.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-muted">
                  <span className="truncate">{r.name}</span><span className="shrink-0 text-xs text-muted-foreground" dir="ltr">{r.barcode || "—"}</span>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader><DialogTitle>رفض الاستلام المباشر</DialogTitle><DialogDescription>السبب بيظهر للموظف. ما في أي أثر على المخزون أو القيود.</DialogDescription></DialogHeader>
          <Textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="سبب الرفض…" />
          <DialogFooter><Button variant="destructive" disabled={busy} onClick={reject}>رفض</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
