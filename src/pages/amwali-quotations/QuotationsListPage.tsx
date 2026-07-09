import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, FileText, Copy, Pencil, Trash2, CheckCircle2, XCircle, Settings, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAmwaliQuotationList, AMWALI_KEYS } from "@/hooks/useAmwaliQuotations";
import { useQueryClient } from "@tanstack/react-query";
import { currencySymbol, fmtMoney } from "@/lib/amwali-quotations/calc";

const STATUS_LABEL: Record<string, string> = { draft: "مسودة", approved: "معتمد", cancelled: "ملغي" };
const STATUS_VARIANT: Record<string, "secondary" | "default" | "destructive"> = {
  draft: "secondary",
  approved: "default",
  cancelled: "destructive",
};

const QuotationsListPage = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useAmwaliQuotationList();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  const filtered = useMemo(() => {
    return rows.filter((r: any) => {
      if (status !== "all" && r.status !== status) return false;
      if (q) {
        const s = q.toLowerCase();
        return [r.quote_number, r.customer_name, r.company_name, r.phone, r.email]
          .some((v) => v && String(v).toLowerCase().includes(s));
      }
      return true;
    });
  }, [rows, q, status]);

  const handleDelete = async (id: string) => {
    if (!confirm("حذف عرض السعر نهائياً؟")) return;
    const { error } = await supabase.from("amwali_quotations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: AMWALI_KEYS.list });
  };

  const handleDuplicate = async (id: string) => {
    try {
      const { data: src, error } = await supabase.from("amwali_quotations").select("*").eq("id", id).maybeSingle();
      if (error || !src) throw error;
      const { data: items } = await supabase.from("amwali_quotation_items").select("*").eq("quotation_id", id);
      const { data: nextNum, error: nErr } = await supabase.rpc("next_amwali_quote_number");
      if (nErr) throw nErr;
      const { id: _oldId, quote_number: _oldQn, created_at: _c, updated_at: _u, approved_at, approved_by, cancelled_at, created_by, ...rest } = src as any;
      const { data: { user } } = await supabase.auth.getUser();
      const { data: inserted, error: insErr } = await supabase
        .from("amwali_quotations")
        .insert({ ...rest, quote_number: nextNum as string, status: "draft" as const, approved_at: null, approved_by: null, cancelled_at: null, created_by: user?.id ?? null })
        .select().maybeSingle();
      if (insErr || !inserted) throw insErr;
      if (items?.length) {
        const cloned = items.map((it: any) => {
          const { id: _iId, created_at: _c2, quotation_id: _qId, ...rest2 } = it;
          return { ...rest2, quotation_id: inserted.id };
        });
        await supabase.from("amwali_quotation_items").insert(cloned);
      }
      toast.success("تم نسخ العرض");
      qc.invalidateQueries({ queryKey: AMWALI_KEYS.list });
      nav(`/amwali-quotations/${inserted.id}/edit`);
    } catch (e: any) {
      toast.error(e?.message || "فشل النسخ");
    }
  };

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => nav(-1)}>
          <ArrowRight className="ml-1 h-4 w-4" /> رجوع
        </Button>
        <h1 className="flex-1 text-xl font-bold text-[#0D1B2E]">عروض أسعار أموالي</h1>
        <Button variant="outline" size="sm" onClick={() => nav("/amwali-quotations/settings")}>
          <Settings className="ml-1 h-4 w-4" /> إعدادات القالب
        </Button>
        <Button size="sm" onClick={() => nav("/amwali-quotations/new")}>
          <Plus className="ml-1 h-4 w-4" /> عرض سعر جديد
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input placeholder="بحث برقم العرض أو الزبون..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
            <SelectItem value="approved">معتمد</SelectItem>
            <SelectItem value="cancelled">ملغي</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">{filtered.length} عرض سعر</div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-[#0D1B2E]">
            <tr>
              <th className="px-3 py-2 text-right">رقم العرض</th>
              <th className="px-3 py-2 text-right">الزبون</th>
              <th className="px-3 py-2 text-right">التاريخ</th>
              <th className="px-3 py-2 text-right">صالح حتى</th>
              <th className="px-3 py-2 text-right">الإجمالي</th>
              <th className="px-3 py-2 text-right">الحالة</th>
              <th className="px-3 py-2 text-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">جاري التحميل...</td></tr>}
            {!isLoading && filtered.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">لا توجد عروض أسعار</td></tr>}
            {filtered.map((r: any) => (
              <tr key={r.id} className="border-t hover:bg-slate-50">
                <td className="px-3 py-2 font-mono font-semibold text-[#0D1B2E]">{r.quote_number}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.customer_name || "-"}</div>
                  <div className="text-xs text-muted-foreground">{r.company_name || ""}</div>
                </td>
                <td className="px-3 py-2">{r.quote_date}</td>
                <td className="px-3 py-2">{r.valid_until || "-"}</td>
                <td className="px-3 py-2 font-semibold">{fmtMoney(r.grand_total)} {currencySymbol(r.currency)}</td>
                <td className="px-3 py-2"><Badge variant={STATUS_VARIANT[r.status] || "secondary"}>{STATUS_LABEL[r.status] || r.status}</Badge></td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" title="تعديل" onClick={() => nav(`/amwali-quotations/${r.id}/edit`)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title="طباعة" onClick={() => nav(`/amwali-quotations/${r.id}/edit?print=1`)}><FileText className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title="نسخ" onClick={() => handleDuplicate(r.id)}><Copy className="h-4 w-4" /></Button>
                    {r.status !== "approved" && (
                      <Button size="icon" variant="ghost" title="اعتماد" onClick={async () => {
                        const { data: { user } } = await supabase.auth.getUser();
                        const { error } = await supabase.from("amwali_quotations").update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user?.id ?? null }).eq("id", r.id);
                        if (error) return toast.error(error.message);
                        toast.success("تم اعتماد العرض");
                        qc.invalidateQueries({ queryKey: AMWALI_KEYS.list });
                      }}><CheckCircle2 className="h-4 w-4 text-green-600" /></Button>
                    )}
                    {r.status !== "cancelled" && (
                      <Button size="icon" variant="ghost" title="إلغاء" onClick={async () => {
                        const { error } = await supabase.from("amwali_quotations").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", r.id);
                        if (error) return toast.error(error.message);
                        toast.success("تم إلغاء العرض");
                        qc.invalidateQueries({ queryKey: AMWALI_KEYS.list });
                      }}><XCircle className="h-4 w-4 text-orange-600" /></Button>
                    )}
                    <Button size="icon" variant="ghost" title="حذف" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default QuotationsListPage;