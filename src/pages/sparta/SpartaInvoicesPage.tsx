import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSpartaContext } from "@/hooks/sparta/useSpartaContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Search, FileText, Eye } from "lucide-react";

interface InvRow {
  id: string; invoice_number: string; invoice_date: string;
  status: "draft" | "posted" | "cancelled";
  total: number; paid_amount: number; balance_due: number;
  currency: string;
  customer: { id: string; name: string } | null;
}

const statusLabel: Record<string, { label: string; cls: any }> = {
  draft:     { label: "مسودة",   cls: "outline" },
  posted:    { label: "معتمدة",  cls: "secondary" },
  cancelled: { label: "ملغاة",   cls: "destructive" },
};

export default function SpartaInvoicesPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { companyId, isAdmin } = useSpartaContext();
  const [rows, setRows] = useState<InvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const customerFilter = sp.get("customer");

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    let qy = supabase
      .from("sparta_invoices")
      .select("id, invoice_number, invoice_date, status, total, paid_amount, balance_due, currency, customer:sparta_customers(id, name)")
      .eq("company_id", companyId)
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (customerFilter) qy = qy.eq("customer_id", customerFilter);
    if (statusFilter !== "all") qy = qy.eq("status", statusFilter);
    const { data, error } = await qy;
    if (error) toast.error(error.message);
    setRows((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { if (companyId) load(); }, [companyId, customerFilter, statusFilter]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      r.invoice_number.toLowerCase().includes(t) ||
      (r.customer?.name || "").toLowerCase().includes(t),
    );
  }, [rows, q]);

  const createDraft = async () => {
    if (!isAdmin || !companyId) return;
    const { data: cust } = await supabase
      .from("sparta_customers").select("id").eq("company_id", companyId).eq("is_active", true).limit(1).maybeSingle();
    if (!cust) {
      toast.error("أضف عميلاً واحداً على الأقل أولاً");
      nav("/sparta/customers");
      return;
    }
    const { data: num } = await supabase.rpc("sparta_next_invoice_number");
    const { data, error } = await supabase
      .from("sparta_invoices")
      .insert({ company_id: companyId, invoice_number: num as string, customer_id: cust.id, status: "draft" })
      .select("id").single();
    if (error) return toast.error(error.message);
    nav(`/sparta/invoices/${data.id}`);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" /> فواتير المبيعات</h1>
          <p className="text-sm text-muted-foreground">إدارة فواتير الزرعات والمستلزمات مع تتبع الدفعات والمدفوعات</p>
        </div>
        {isAdmin && <Button onClick={createDraft}><Plus className="h-4 w-4 ml-1" /> فاتورة جديدة</Button>}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-md flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث برقم الفاتورة أو اسم العميل..." className="pr-9" />
        </div>
        <select className="border rounded-md px-3 py-2 bg-background text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">كل الحالات</option>
          <option value="draft">مسودة</option>
          <option value="posted">معتمدة</option>
          <option value="cancelled">ملغاة</option>
        </select>
      </div>

      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-muted/50 text-right">
            <tr>
              <th className="p-3">الرقم</th>
              <th className="p-3">التاريخ</th>
              <th className="p-3">العميل</th>
              <th className="p-3">الإجمالي</th>
              <th className="p-3">المدفوع</th>
              <th className="p-3">الرصيد</th>
              <th className="p-3">الحالة</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">لا توجد فواتير</td></tr>}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => nav(`/sparta/invoices/${r.id}`)}>
                <td className="p-3 font-mono text-xs">{r.invoice_number}</td>
                <td className="p-3">{r.invoice_date}</td>
                <td className="p-3 font-medium">{r.customer?.name || "—"}</td>
                <td className="p-3">{r.currency} {Number(r.total).toFixed(2)}</td>
                <td className="p-3 text-emerald-600">{r.currency} {Number(r.paid_amount).toFixed(2)}</td>
                <td className="p-3 text-amber-600">{r.currency} {Number(r.balance_due).toFixed(2)}</td>
                <td className="p-3"><Badge variant={statusLabel[r.status].cls}>{statusLabel[r.status].label}</Badge></td>
                <td className="p-3"><Button size="sm" variant="ghost"><Eye className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}