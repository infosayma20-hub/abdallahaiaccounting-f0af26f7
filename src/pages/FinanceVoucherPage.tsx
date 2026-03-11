import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2, Plus, FileText, DollarSign, Hash, Calendar
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import VoucherDrawer from "@/components/finance/VoucherDrawer";
import BackButton from "@/components/BackButton";
import SortableReportTable, { ColumnDef, TotalsConfig } from "@/components/reports/SortableReportTable";

type VoucherType = "receipt" | "payment";

interface Props {
  voucherType: VoucherType;
}

const PAYMENT_LABELS: Record<string, string> = { cash: "نقدي", bank: "بنك", cheque: "شيك", transfer: "تحويل" };
const STATUS_LABELS: Record<string, string> = { posted: "مرحّل", draft: "مسودة", cancelled: "ملغي" };

const FinanceVoucherPage = ({ voucherType }: Props) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const isReceipt = voucherType === "receipt";
  const title = isReceipt ? "سندات القبض" : "سندات الصرف";
  const newTitle = isReceipt ? "سند قبض جديد" : "سند صرف جديد";
  const contactLabel = isReceipt ? "المستلم من" : "المدفوع لـ";

  const [vouchers, setVouchers] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editVoucherId, setEditVoucherId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [vRes, cRes] = await Promise.all([
      supabase.from("vouchers").select("*").eq("user_id", user.id).eq("type", voucherType).order("created_at", { ascending: false }),
      supabase.from("contacts").select("id, contact_name, contact_type").eq("user_id", user.id),
    ]);
    setVouchers(vRes.data || []);
    setContacts(cRes.data || []);
    setLoading(false);
  }, [user, voucherType]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId) {
      setEditVoucherId(editId);
      setDrawerOpen(true);
    } else if (searchParams.get("new") === "1") {
      setDrawerOpen(true);
    }
  }, [searchParams]);

  // Transform data for the table
  const tableData = useMemo(() => {
    return vouchers.map(v => {
      const contact = contacts.find(c => c.id === v.contact_id);
      return {
        ...v,
        contact_name: contact?.contact_name || "—",
        payment_label: PAYMENT_LABELS[v.payment_method] || "—",
        status_label: STATUS_LABELS[v.status] || v.status,
        amount_display: Number(v.amount_ils || v.amount || 0),
      };
    });
  }, [vouchers, contacts]);

  const columns: ColumnDef[] = useMemo(() => [
    {
      key: "ref_number", label: "رقم السند", type: "text", sortable: true, filterable: true,
      format: (val: any, row: any) => (
        <button
          className="text-primary hover:underline font-mono cursor-pointer bg-transparent border-none p-0"
          onClick={() => { setEditVoucherId(row.id); setDrawerOpen(true); }}
        >
          {val}
        </button>
      ),
    },
    { key: "date", label: "التاريخ", type: "date", sortable: true, filterable: true, filterType: "date-range" },
    { key: "contact_name", label: contactLabel, type: "text", sortable: true, filterable: true },
    { key: "description", label: "البيان", type: "text", sortable: true, filterable: true },
    {
      key: "payment_label", label: "طريقة الدفع", type: "text", sortable: true, filterable: true,
      filterType: "select", filterOptions: ["نقدي", "بنك", "شيك", "تحويل"],
    },
    { key: "amount_display", label: "المبلغ", type: "currency", sortable: true, filterable: true, filterType: "number-range" },
    {
      key: "status_label", label: "الحالة", type: "badge", sortable: true, filterable: true,
      filterType: "select", filterOptions: ["مرحّل", "مسودة", "ملغي"],
      format: (val: any) => {
        if (val === "مرحّل") return <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">مرحّل</Badge>;
        if (val === "ملغي") return <Badge className="bg-red-100 text-red-700 text-[10px]">ملغي</Badge>;
        return <Badge variant="secondary" className="text-[10px]">مسودة</Badge>;
      },
    },
  ], [contactLabel]);

  const totals: TotalsConfig = { amount_display: "sum" };

  const totalAll = vouchers.filter(v => v.status === "posted").reduce((s, v) => s + Number(v.amount_ils || v.amount || 0), 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const totalMonth = vouchers.filter(v => v.status === "posted" && v.date >= monthStart).reduce((s, v) => s + Number(v.amount_ils || v.amount || 0), 0);
  const fmt = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  return (
    <div className="px-4 lg:px-8 pt-6 pb-8 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-foreground">{title}</h1>
            <p className="text-xs text-muted-foreground">{isReceipt ? "إدارة سندات القبض والمقبوضات" : "إدارة سندات الصرف والمدفوعات"}</p>
          </div>
        </div>
        <Button size="sm" className="gap-2" onClick={() => { setEditVoucherId(null); setDrawerOpen(true); }}>
          <Plus className="h-4 w-4" />{newTitle}
        </Button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <DollarSign className={`h-5 w-5 mx-auto mb-1 ${isReceipt ? "text-emerald-500" : "text-destructive"}`} />
          <p className="text-lg font-bold text-foreground">{fmt(totalAll)}</p>
          <p className="text-[10px] text-muted-foreground">{isReceipt ? "إجمالي المقبوضات" : "إجمالي المدفوعات"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Calendar className={`h-5 w-5 mx-auto mb-1 ${isReceipt ? "text-emerald-500" : "text-destructive"}`} />
          <p className="text-lg font-bold text-foreground">{fmt(totalMonth)}</p>
          <p className="text-[10px] text-muted-foreground">هذا الشهر</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Hash className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-2xl font-bold text-foreground">{vouchers.length}</p>
          <p className="text-[10px] text-muted-foreground">عدد السندات</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <FileText className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-lg font-bold text-foreground">{vouchers.length > 0 ? fmt(totalAll / vouchers.length) : "₪0"}</p>
          <p className="text-[10px] text-muted-foreground">متوسط {isReceipt ? "القبض" : "الصرف"}</p>
        </CardContent></Card>
      </div>

      {/* Sortable Table */}
      <SortableReportTable
        columns={columns}
        data={tableData}
        totalsRow={totals}
        loading={loading}
        reportTitle={title}
        storageKey={`vouchers-${voucherType}`}
        defaultSort={[{ key: "date", dir: "desc" }]}
      />

      {/* Voucher Drawer */}
      <VoucherDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditVoucherId(null); }}
        voucherType={voucherType}
        onSaved={fetchData}
        editVoucherId={editVoucherId}
      />
    </div>
  );
};

export default FinanceVoucherPage;
