import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ExternalLink, Trash2, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/hr-utils";
import { useNavigate } from "react-router-dom";

const PAYMENT_LABELS: Record<string, string> = { cash: "نقدي", bank: "بنك", cheque: "شيك", transfer: "تحويل", "نقدي": "نقدي", "شيك": "شيك", "تحويل": "تحويل", "بطاقة": "بطاقة" };
const STATUS_LABELS: Record<string, string> = { posted: "مرحّل", draft: "مسودة", cancelled: "ملغي" };

interface Props {
  employeeName: string;
  userId: string;
}

export default function EmployeeVouchersTab({ employeeName, userId }: Props) {
  const navigate = useNavigate();
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteVoucherId, setDeleteVoucherId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchVouchers();
  }, [employeeName, userId]);

  async function fetchVouchers() {
    setLoading(true);
    try {
      const nameVariants = new Set<string>();
      const normalized = employeeName.replace(/\s+/g, " ").trim();
      nameVariants.add(normalized);
      nameVariants.add(normalized.replace(/عبدالله/g, "عبد الله"));
      nameVariants.add(normalized.replace(/عبد الله/g, "عبدالله"));

      let allVouchers: any[] = [];
      for (const name of nameVariants) {
        const { data } = await supabase
          .from("vouchers")
          .select("*")
          .eq("user_id", userId)
          .eq("type", "payment")
          .neq("status", "cancelled")
          .ilike("description", `%${name}%`)
          .order("date", { ascending: false });
        if (data) allVouchers.push(...data);
      }

      const seen = new Set<string>();
      setVouchers(allVouchers.filter(v => {
        if (seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      }));
    } catch (err) {
      console.error("Error fetching vouchers:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteVoucherId) return;
    setDeleting(true);
    try {
      const voucher = vouchers.find(v => v.id === deleteVoucherId);
      if (voucher?.linked_transaction_id) {
        await supabase.from("transactions")
          .update({ is_deleted: true })
          .eq("id", voucher.linked_transaction_id);
      }
      await supabase.from("vouchers")
        .update({ status: "cancelled" })
        .eq("id", deleteVoucherId);
      toast.success("تم إلغاء السند بنجاح");
      setDeleteVoucherId(null);
      fetchVouchers();
    } catch {
      toast.error("حدث خطأ أثناء الإلغاء");
    } finally {
      setDeleting(false);
    }
  }

  const extractCategory = (desc: string) => {
    const parts = desc.split(" - ");
    return parts.length > 1 ? parts[0].trim() : "—";
  };

  const statusBadge = (status: string) => {
    const label = STATUS_LABELS[status] || status;
    if (status === "posted") return <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{label}</Badge>;
    if (status === "draft") return <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{label}</Badge>;
    return <Badge variant="secondary" className="text-[10px]">{label}</Badge>;
  };

  const total = vouchers.reduce((s, v) => s + Number(v.amount || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="font-medium text-sm text-foreground flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          سندات الصرف ({vouchers.length})
        </h4>
        <Badge variant="outline" className="text-xs">
          الإجمالي: {formatCurrency(total)}
        </Badge>
      </div>

      {loading ? (
        <div className="text-center py-6 text-muted-foreground text-xs">جاري التحميل...</div>
      ) : vouchers.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          لا توجد سندات صرف مسجلة لهذا الموظف
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-right text-xs font-semibold">رقم السند</TableHead>
                <TableHead className="text-right text-xs font-semibold">التاريخ</TableHead>
                <TableHead className="text-right text-xs font-semibold">التصنيف</TableHead>
                <TableHead className="text-right text-xs font-semibold">البيان</TableHead>
                <TableHead className="text-right text-xs font-semibold">الدفع</TableHead>
                <TableHead className="text-right text-xs font-semibold">المبلغ</TableHead>
                <TableHead className="text-right text-xs font-semibold">الحالة</TableHead>
                <TableHead className="text-right text-xs font-semibold">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.map(v => (
                <TableRow key={v.id} className="hover:bg-muted/30">
                  <TableCell>
                    <button
                      onClick={() => navigate(`/finance/voucher/payment?edit=${v.id}`)}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      {v.ref_number}
                    </button>
                  </TableCell>
                  <TableCell className="text-xs">{v.date}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {extractCategory(v.description || "")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs truncate max-w-[180px]" title={v.description}>
                    {v.description || "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {PAYMENT_LABELS[v.payment_method] || v.payment_method || "—"}
                  </TableCell>
                  <TableCell className="text-xs font-semibold text-destructive">
                    {formatCurrency(Number(v.amount || 0))}
                  </TableCell>
                  <TableCell>{statusBadge(v.status || "posted")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="تعديل السند"
                        onClick={() => navigate(`/finance/voucher/payment?edit=${v.id}`)}>
                        <ExternalLink className="h-3.5 w-3.5 text-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title="إلغاء السند"
                        onClick={() => setDeleteVoucherId(v.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!deleteVoucherId} onOpenChange={(open) => !open && setDeleteVoucherId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء سند الصرف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من إلغاء هذا السند؟ سيتم أيضاً إلغاء القيد المحاسبي المرتبط به.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "جاري الإلغاء..." : "إلغاء السند"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}