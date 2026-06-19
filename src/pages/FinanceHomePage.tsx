import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowDown, ArrowUp, Landmark, FileText, AlertTriangle, 
  ChevronLeft, Plus, TrendingUp, TrendingDown, ExternalLink,
  ArrowRight, RefreshCw, Printer
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";

const FinanceHomePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [cheques, setCheques] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      const [vRes, cRes, bRes] = await Promise.all([
        supabase.from("vouchers").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("cheques").select("*").eq("user_id", user.id),
        supabase.from("bank_accounts").select("*").eq("user_id", user.id).eq("is_active", true),
      ]);
      setVouchers(vRes.data || []);
      setCheques(cRes.data || []);
      setBankAccounts(bRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

  const receiptsThisMonth = useMemo(() => vouchers.filter(v => v.type === "receipt" && v.status === "posted" && v.date >= monthStart), [vouchers, monthStart]);
  const paymentsThisMonth = useMemo(() => vouchers.filter(v => v.type === "payment" && v.status === "posted" && v.date >= monthStart), [vouchers, monthStart]);

  const totalReceipts = receiptsThisMonth.reduce((s, v) => s + Number(v.amount_ils || v.amount || 0), 0);
  const totalPayments = paymentsThisMonth.reduce((s, v) => s + Number(v.amount_ils || v.amount || 0), 0);

  // Statuses that are CLOSED — never raise a due-date alert for them.
  // Endorsed ("مظهر") is intentionally NOT here: we are still liable until cleared.
  const CLOSED_CHEQUE_STATUSES = ["محصل", "مصروف", "ملغي", "مرتجع"];
  const isOpenForDueAlert = (c: any) => !CLOSED_CHEQUE_STATUSES.includes(c.status);

  const dueSoonCheques = cheques.filter(c => {
    if (!c.cheque_date || !isOpenForDueAlert(c)) return false;
    const due = new Date(c.cheque_date);
    const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  });

  const todayCheques = cheques.filter(c => {
    if (!c.cheque_date || !isOpenForDueAlert(c)) return false;
    return c.cheque_date === now.toISOString().split("T")[0];
  });

  const endorsedDueSoon = dueSoonCheques.filter(c => c.status === "مظهر");

  const draftVouchers = vouchers.filter(v => v.status === "draft");
  const returnedCheques = cheques.filter(c => c.status === "مرتجع");

  const typeColor = (type: string) => {
    if (type === "receipt") return "bg-emerald-100 text-emerald-700";
    if (type === "payment") return "bg-red-100 text-red-700";
    return "bg-blue-100 text-blue-700";
  };
  const typeLabel = (type: string) => {
    if (type === "receipt") return "قبض";
    if (type === "payment") return "صرف";
    return "قيد";
  };
  const statusBadge = (status: string) => {
    if (status === "posted") return <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">مرحّل</Badge>;
    if (status === "cancelled") return <Badge className="bg-red-100 text-red-700 text-[10px]">ملغي</Badge>;
    return <Badge variant="secondary" className="text-[10px]">مسودة</Badge>;
  };

  const formatAmount = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const arabicDate = now.toLocaleDateString("ar-PS", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const alerts: { color: string; text: string; path: string }[] = [];
  if (todayCheques.length > 0) alerts.push({ color: "🔴", text: `${todayCheques.length} شيكات مستحقة اليوم بإجمالي ₪${formatAmount(todayCheques.reduce((s, c) => s + Number(c.amount), 0))}`, path: "/finance/cheques" });
  if (dueSoonCheques.length > 0) {
    const endorsedNote = endorsedDueSoon.length > 0 ? ` (منها ${endorsedDueSoon.length} مظهَّر)` : "";
    alerts.push({ color: "🟡", text: `${dueSoonCheques.length} شيكات مستحقة خلال 7 أيام${endorsedNote}`, path: "/finance/cheques" });
  }
  if (draftVouchers.length > 0) alerts.push({ color: "🔵", text: `${draftVouchers.length} سندات في حالة مسودة لم تُرحَّل`, path: "/finance/receipts" });
  if (returnedCheques.length > 0) alerts.push({ color: "⚫", text: `${returnedCheques.length} شيكات مرتجعة تحتاج معالجة`, path: "/finance/cheques" });

  const actionTabs: ActionTab[] = [
    {
      key: "general",
      label: "عام",
      groups: [
        { key: "new", label: "إنشاء", items: [
          { key: "receipt", label: "سند قبض", icon: ArrowDown, onClick: () => navigate("/finance/receipt/new"), variant: "primary" as const },
          { key: "payment", label: "سند صرف", icon: ArrowUp, onClick: () => navigate("/finance/payment/new") },
          { key: "journal", label: "سند قيد", icon: FileText, onClick: () => navigate("/finance/journal/new") },
          { key: "cheque", label: "تسجيل شيك", icon: FileText, onClick: () => navigate("/finance/cheques?new=1") },
        ]},
        { key: "data", label: "بيانات", items: [
          { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: () => window.location.reload() },
          { key: "print", label: "طباعة", icon: Printer, onClick: () => window.print() },
        ]},
      ],
    },
  ];

  return (
    <FinanceShell
      title="المالية"
      subtitle="مستندات، شيكات، وأرصدة البنوك"
      breadcrumb={[
        { label: "المالية", href: "/accounting-center" },
        { label: "الرئيسية" },
      ]}
      actionTabs={actionTabs}
      rightSlot={<span className="text-[12px] text-muted-foreground hidden sm:block">{arabicDate}</span>}
    >
      <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-emerald-200 bg-emerald-50/50 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/finance/receipts")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <ArrowDown className="h-4 w-4 text-emerald-600" />
              </div>
              <span className="text-xs text-muted-foreground">إجمالي القبض هذا الشهر</span>
            </div>
            <p className="text-xl font-bold text-emerald-700" style={{ fontFamily: "JetBrains Mono, monospace" }}>₪{formatAmount(totalReceipts)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{receiptsThisMonth.length} سند قبض</p>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50/50 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/finance/payments")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <ArrowUp className="h-4 w-4 text-red-600" />
              </div>
              <span className="text-xs text-muted-foreground">إجمالي الصرف هذا الشهر</span>
            </div>
            <p className="text-xl font-bold text-red-700" style={{ fontFamily: "JetBrains Mono, monospace" }}>₪{formatAmount(totalPayments)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{paymentsThisMonth.length} سند صرف</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/50 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/finance/bank-accounts")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Landmark className="h-4 w-4 text-blue-600" />
              </div>
              <span className="text-xs text-muted-foreground">الحسابات البنكية</span>
            </div>
            <p className="text-xl font-bold" style={{ color: "#0A2342", fontFamily: "JetBrains Mono, monospace" }}>{bankAccounts.length}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{bankAccounts.length} حساب بنكي نشط</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50/50 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/finance/cheques")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                <FileText className="h-4 w-4 text-orange-600" />
              </div>
              <span className="text-xs text-muted-foreground">شيكات مستحقة قريباً</span>
            </div>
            <p className="text-xl font-bold text-orange-700" style={{ fontFamily: "JetBrains Mono, monospace" }}>{dueSoonCheques.length} شيك</p>
            <p className="text-[11px] text-muted-foreground mt-1">إجمالي ₪{formatAmount(dueSoonCheques.reduce((s, c) => s + Number(c.amount), 0))}</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              تنبيهات تحتاج متابعة
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {alerts.map((alert, i) => (
              <button key={i} onClick={() => navigate(alert.path)} className="w-full text-right flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-amber-100/60 transition-colors text-sm">
                <span>{alert.color}</span>
                <span className="flex-1">{alert.text}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Documents */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">آخر المستندات المالية</CardTitle>
          <Button variant="link" size="sm" className="text-xs" onClick={() => navigate("/finance/receipts")}>
            عرض الكل <ArrowRight className="h-3 w-3 mr-1" />
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {vouchers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">لا توجد مستندات مالية بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-right py-2 px-2">النوع</th>
                    <th className="text-right py-2 px-2">الرقم</th>
                    <th className="text-right py-2 px-2">التاريخ</th>
                    <th className="text-right py-2 px-2">البيان</th>
                    <th className="text-right py-2 px-2">المبلغ</th>
                    <th className="text-right py-2 px-2">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.slice(0, 10).map((v) => (
                    <tr key={v.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2.5 px-2">
                        <Badge className={`${typeColor(v.type)} text-[10px]`}>{typeLabel(v.type)}</Badge>
                      </td>
                      <td className="py-2.5 px-2">
                        <button
                          className="font-mono text-xs text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
                          onClick={() => navigate(`/finance/${v.type === "receipt" ? "receipts" : v.type === "payment" ? "payments" : "journals"}?edit=${v.id}`)}
                        >
                          {v.ref_number}
                        </button>
                      </td>
                      <td className="py-2.5 px-2 text-xs">{v.date}</td>
                      <td className="py-2.5 px-2 text-xs truncate max-w-[200px]">{v.description}</td>
                      <td className="py-2.5 px-2 font-mono text-xs font-medium">₪{formatAmount(Number(v.amount_ils || v.amount || 0))}</td>
                      <td className="py-2.5 px-2">{statusBadge(v.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bank Balances */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">أرصدة الحسابات البنكية</CardTitle>
          <Button variant="link" size="sm" className="text-xs" onClick={() => navigate("/finance/bank-accounts")}>
            إدارة الحسابات <ArrowRight className="h-3 w-3 mr-1" />
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {bankAccounts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-3">لم تُعرَّف حسابات بنكية بعد</p>
              <Button size="sm" variant="outline" onClick={() => navigate("/finance/bank-accounts?new=1")}>
                <Plus className="h-4 w-4 ml-1" />إضافة حساب بنكي
              </Button>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {bankAccounts.map(bank => (
                <div key={bank.id} className="min-w-[220px] border rounded-xl overflow-hidden flex-shrink-0">
                  <div className="bg-[#0A2342] text-white p-3">
                    <div className="flex items-center gap-2">
                      <Landmark className="h-4 w-4" />
                      <span className="text-xs font-bold">{bank.bank_name}</span>
                    </div>
                    <p className="text-[10px] text-white/60 mt-0.5">{bank.name}</p>
                  </div>
                  <div className="p-3">
                    <p className="font-mono font-bold text-lg" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                      {bank.currency === "ILS" ? "₪" : bank.currency === "USD" ? "$" : "د.أ"}{formatAmount(Number(bank.opening_balance || 0))}
                    </p>
                    <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
                      <span>{bank.account_type === "savings" ? "توفير" : "جاري"}</span>
                      <span>{bank.currency}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </FinanceShell>
  );
};

export default FinanceHomePage;
