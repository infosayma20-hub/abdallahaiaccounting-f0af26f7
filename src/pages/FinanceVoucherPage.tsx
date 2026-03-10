import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight, Loader2, Plus, Search, RefreshCw,
  ArrowDown, ArrowUp, FileText
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import VoucherDrawer from "@/components/finance/VoucherDrawer";

type VoucherType = "receipt" | "payment";

interface Props {
  voucherType: VoucherType;
}

const FinanceVoucherPage = ({ voucherType }: Props) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const isReceipt = voucherType === "receipt";
  const accentColor = isReceipt ? "#16A34A" : "#DC2626";
  const accentBg = isReceipt ? "bg-emerald-50" : "bg-red-50";
  const title = isReceipt ? "سندات القبض" : "سندات الصرف";
  const newTitle = isReceipt ? "سند قبض جديد" : "سند صرف جديد";
  const contactLabel = isReceipt ? "المستلم من" : "المدفوع لـ";

  const [vouchers, setVouchers] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
    if (!searchQuery) return vouchers;
    const q = searchQuery.toLowerCase();
    return vouchers.filter(v => v.ref_number?.toLowerCase().includes(q) || v.description?.toLowerCase().includes(q));
  }, [vouchers, searchQuery]);

  const totalAll = vouchers.filter(v => v.status === "posted").reduce((s, v) => s + Number(v.amount_ils || v.amount || 0), 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const thisMonth = vouchers.filter(v => v.status === "posted" && v.date >= monthStart);
  const totalMonth = thisMonth.reduce((s, v) => s + Number(v.amount_ils || v.amount || 0), 0);
  const formatAmount = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/finance")} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold" style={{ color: accentColor, fontFamily: "Tajawal, sans-serif" }}>{title}</h1>
        </div>
        <Button size="sm" className="gap-2" style={{ backgroundColor: accentColor }} onClick={() => setDrawerOpen(true)}>
          <Plus className="h-4 w-4" />{newTitle}
        </Button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className={accentBg}>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">{isReceipt ? "إجمالي المقبوضات" : "إجمالي المدفوعات"}</p>
            <p className="text-lg font-bold font-mono" style={{ color: accentColor }}>₪{formatAmount(totalAll)}</p>
          </CardContent>
        </Card>
        <Card className={accentBg}>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">هذا الشهر</p>
            <p className="text-lg font-bold font-mono" style={{ color: accentColor }}>₪{formatAmount(totalMonth)}</p>
          </CardContent>
        </Card>
        <Card className={accentBg}>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">عدد السندات</p>
            <p className="text-lg font-bold font-mono" style={{ color: accentColor }}>{vouchers.length}</p>
          </CardContent>
        </Card>
        <Card className={accentBg}>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground mb-1">متوسط {isReceipt ? "القبض" : "الصرف"}</p>
            <p className="text-lg font-bold font-mono" style={{ color: accentColor }}>₪{vouchers.length > 0 ? formatAmount(totalAll / vouchers.length) : "0.00"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="ابحث بالرقم، الاسم، البيان..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pr-10" />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">لا توجد سندات بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-xs">
                    <th className="text-right py-2.5 px-3">رقم السند</th>
                    <th className="text-right py-2.5 px-3">التاريخ</th>
                    <th className="text-right py-2.5 px-3">{contactLabel}</th>
                    <th className="text-right py-2.5 px-3">البيان</th>
                    <th className="text-right py-2.5 px-3">طريقة الدفع</th>
                    <th className="text-right py-2.5 px-3">المبلغ</th>
                    <th className="text-right py-2.5 px-3">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(v => {
                    const contact = contacts.find(c => c.id === v.contact_id);
                    return (
                      <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-xs font-medium">{v.ref_number}</td>
                        <td className="py-2.5 px-3 text-xs">{v.date}</td>
                        <td className="py-2.5 px-3 text-xs">{contact?.contact_name || "—"}</td>
                        <td className="py-2.5 px-3 text-xs truncate max-w-[200px]">{v.description}</td>
                        <td className="py-2.5 px-3 text-xs">
                          {v.payment_method === "cash" ? "نقدي" : v.payment_method === "bank" ? "بنك" : v.payment_method === "cheque" ? "شيك" : v.payment_method === "transfer" ? "تحويل" : "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs font-bold" style={{ color: accentColor }}>₪{formatAmount(Number(v.amount_ils || v.amount || 0))}</td>
                        <td className="py-2.5 px-3">
                          {v.status === "posted" ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">مرحّل</Badge> :
                           v.status === "cancelled" ? <Badge className="bg-red-100 text-red-700 text-[10px]">ملغي</Badge> :
                           <Badge variant="secondary" className="text-[10px]">مسودة</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
