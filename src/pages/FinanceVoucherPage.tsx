import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight, Loader2, Plus, Search,
  ArrowDown, ArrowUp, FileText, DollarSign, Hash, Calendar
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import VoucherDrawer from "@/components/finance/VoucherDrawer";
import BackButton from "@/components/BackButton";

type VoucherType = "receipt" | "payment";

interface Props {
  voucherType: VoucherType;
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");

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
  useEffect(() => { if (searchParams.get("new") === "1") setDrawerOpen(true); }, [searchParams]);

  const filtered = useMemo(() => {
    return vouchers.filter(v => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!v.ref_number?.toLowerCase().includes(q) && !v.description?.toLowerCase().includes(q)) return false;
      }
      if (filterStatus !== "all" && v.status !== filterStatus) return false;
      if (filterPayment !== "all" && v.payment_method !== filterPayment) return false;
      return true;
    });
  }, [vouchers, searchQuery, filterStatus, filterPayment]);

  const totalAll = vouchers.filter(v => v.status === "posted").reduce((s, v) => s + Number(v.amount_ils || v.amount || 0), 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const thisMonth = vouchers.filter(v => v.status === "posted" && v.date >= monthStart);
  const totalMonth = thisMonth.reduce((s, v) => s + Number(v.amount_ils || v.amount || 0), 0);
  const fmt = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const PAYMENT_LABELS: Record<string, string> = { cash: "نقدي", bank: "بنك", cheque: "شيك", transfer: "تحويل" };

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
        <Button size="sm" className="gap-2" onClick={() => setDrawerOpen(true)}>
          <Plus className="h-4 w-4" />{newTitle}
        </Button>
      </div>

      {/* KPI Strip - Fixed Assets style */}
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

      {/* Filters - Fixed Assets style */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="ابحث بالرقم، الاسم، البيان..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pr-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            <SelectItem value="posted">مرحّل</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
            <SelectItem value="cancelled">ملغي</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPayment} onValueChange={setFilterPayment}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="طريقة الدفع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الطرق</SelectItem>
            <SelectItem value="cash">نقدي</SelectItem>
            <SelectItem value="bank">بنك</SelectItem>
            <SelectItem value="cheque">شيك</SelectItem>
            <SelectItem value="transfer">تحويل</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table - Fixed Assets style */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">لا توجد سندات بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم السند</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">{contactLabel}</TableHead>
                    <TableHead className="text-right">البيان</TableHead>
                    <TableHead className="text-right">طريقة الدفع</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(v => {
                    const contact = contacts.find(c => c.id === v.contact_id);
                    return (
                      <TableRow key={v.id}>
                        <TableCell className="text-xs font-medium">{v.ref_number}</TableCell>
                        <TableCell className="text-xs">{v.date}</TableCell>
                        <TableCell className="text-xs">{contact?.contact_name || "—"}</TableCell>
                        <TableCell className="text-xs truncate max-w-[200px]">{v.description}</TableCell>
                        <TableCell className="text-xs">{PAYMENT_LABELS[v.payment_method] || "—"}</TableCell>
                        <TableCell className="text-xs font-bold">{fmt(Number(v.amount_ils || v.amount || 0))}</TableCell>
                        <TableCell>
                          {v.status === "posted" ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">مرحّل</Badge> :
                           v.status === "cancelled" ? <Badge className="bg-red-100 text-red-700 text-[10px]">ملغي</Badge> :
                           <Badge variant="secondary" className="text-[10px]">مسودة</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Voucher Drawer */}
      <VoucherDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        voucherType={voucherType}
        onSaved={fetchData}
      />
    </div>
  );
};

export default FinanceVoucherPage;
