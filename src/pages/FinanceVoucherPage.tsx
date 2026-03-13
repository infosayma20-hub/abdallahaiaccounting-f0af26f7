import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2, Plus, DollarSign, Hash, Calendar, ArrowRight, Search, X,
  ArrowUpDown, ChevronLeft, ChevronRight, FileText
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import VoucherDrawer from "@/components/finance/VoucherDrawer";

type VoucherType = "receipt" | "payment";

interface Props {
  voucherType: VoucherType;
}

const PAYMENT_LABELS: Record<string, string> = { cash: "نقدي", bank: "بنك", cheque: "شيك", transfer: "تحويل" };
const STATUS_LABELS: Record<string, string> = { posted: "مرحّل", draft: "مسودة", cancelled: "ملغي" };

type SortKey = "ref_number" | "date" | "contact_name" | "payment_label" | "amount_display" | "status_label";
type SortDir = "asc" | "desc";
const PER_PAGE = 15;

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

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [vRes, cRes] = await Promise.all([
      supabase.from("vouchers").select("*").eq("user_id", user.id).eq("type", voucherType).order("created_at", { ascending: false }),
      supabase.from("contacts").select("id, contact_name, contact_type").eq("user_id", user.id).neq("is_archived", true),
    ]);
    setVouchers(vRes.data || []);
    setContacts(cRes.data || []);
    setLoading(false);
  }, [user, voucherType]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId) { setEditVoucherId(editId); setDrawerOpen(true); }
    else if (searchParams.get("new") === "1") setDrawerOpen(true);
  }, [searchParams]);

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

  // Filtering
  const filtered = useMemo(() => {
    let data = [...tableData];
    if (statusFilter !== "all") data = data.filter(v => v.status_label === statusFilter);
    if (paymentFilter !== "all") data = data.filter(v => v.payment_label === paymentFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(v =>
        (v.ref_number || "").toLowerCase().includes(q) ||
        (v.description || "").toLowerCase().includes(q) ||
        (v.contact_name || "").toLowerCase().includes(q)
      );
    }
    return data;
  }, [tableData, statusFilter, paymentFilter, searchQuery]);

  // Sorting
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: any = a[sortKey], bv: any = b[sortKey];
      if (typeof av === "string") { av = av.toLowerCase(); bv = (bv || "").toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const paged = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, paymentFilter]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-primary-foreground/80 transition-colors w-full">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? "opacity-100" : "opacity-30"}`} />
    </button>
  );

  // KPIs
  const totalAll = vouchers.filter(v => v.status === "posted").reduce((s, v) => s + Number(v.amount_ils || v.amount || 0), 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const totalMonth = vouchers.filter(v => v.status === "posted" && v.date >= monthStart).reduce((s, v) => s + Number(v.amount_ils || v.amount || 0), 0);
  const fmt = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const PAYMENT_METHODS = ["نقدي", "بنك", "شيك", "تحويل"];

  return (
    <div className="p-4 md:p-6 pb-24 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/finance")} className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-all shadow-sm">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <DollarSign className={`h-5 w-5 ${isReceipt ? "text-emerald-500" : "text-destructive"}`} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{title}</h1>
              <p className="text-xs text-muted-foreground">{isReceipt ? "إدارة سندات القبض والمقبوضات" : "إدارة سندات الصرف والمدفوعات"}</p>
            </div>
          </div>
        </div>
        <Button className="gap-1.5 rounded-xl shadow-md shadow-primary/20" onClick={() => { setEditVoucherId(null); setDrawerOpen(true); }}>
          <Plus className="h-4 w-4" /> {newTitle}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: isReceipt ? "إجمالي المقبوضات" : "إجمالي المدفوعات", value: fmt(totalAll), icon: DollarSign, color: isReceipt ? "text-emerald-500" : "text-destructive", bg: isReceipt ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800" : "bg-destructive/5 border-destructive/10" },
          { label: "هذا الشهر", value: fmt(totalMonth), icon: Calendar, color: isReceipt ? "text-emerald-500" : "text-destructive", bg: isReceipt ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800" : "bg-destructive/5 border-destructive/10" },
          { label: "عدد السندات", value: vouchers.length, icon: Hash, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
          { label: `متوسط ${isReceipt ? "القبض" : "الصرف"}`, value: vouchers.length > 0 ? fmt(totalAll / vouchers.length) : "₪0", icon: FileText, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
        ].map((k, i) => (
          <div key={i} className={`rounded-2xl border p-4 ${k.bg}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground font-medium mb-1">{k.label}</p>
                <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
              </div>
              <k.icon className={`h-5 w-5 ${k.color} opacity-50`} />
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
          <Input
            placeholder="ابحث برقم السند، الوصف، الجهة..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pr-10 rounded-xl bg-muted/30"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Payment method pills + status filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
            <button onClick={() => setPaymentFilter("all")} className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${paymentFilter === "all" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
              الكل
            </button>
            {PAYMENT_METHODS.map(m => (
              <button key={m} onClick={() => setPaymentFilter(m)} className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${paymentFilter === m ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                {m}
              </button>
            ))}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] rounded-xl text-xs">
              <SelectValue placeholder="حالة السند" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="مرحّل">✅ مرحّل</SelectItem>
              <SelectItem value="مسودة">📝 مسودة</SelectItem>
              <SelectItem value="ملغي">🔴 ملغي</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}

      {/* Empty */}
      {!loading && vouchers.length === 0 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <DollarSign className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">لا توجد سندات بعد</h3>
          <p className="text-xs text-muted-foreground mb-4">أضف أول سند لبدء تتبع {isReceipt ? "المقبوضات" : "المدفوعات"}</p>
          <Button className="rounded-xl gap-2 shadow-md shadow-primary/20" onClick={() => { setEditVoucherId(null); setDrawerOpen(true); }}>
            <Plus className="h-4 w-4" /> {newTitle}
          </Button>
        </div>
      )}

      {/* No results */}
      {!loading && vouchers.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <Search className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">لا توجد سندات تطابق البحث</p>
          <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setPaymentFilter("all"); }}>مسح الفلاتر</Button>
        </div>
      )}

      {/* TABLE */}
      {!loading && paged.length > 0 && (
        <div className="rounded-2xl border border-border/50 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="رقم السند" field="ref_number" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="التاريخ" field="date" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label={contactLabel} field="contact_name" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold">البيان</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="طريقة الدفع" field="payment_label" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="المبلغ" field="amount_display" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الحالة" field="status_label" /></th>
                </tr>
              </thead>
              <tbody>
                {paged.map((v, i) => {
                  const statusStyles: Record<string, string> = {
                    "مرحّل": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                    "مسودة": "bg-muted text-muted-foreground",
                    "ملغي": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                  };
                  const dotColor: Record<string, string> = {
                    "مرحّل": "bg-green-500",
                    "مسودة": "bg-muted-foreground",
                    "ملغي": "bg-red-500",
                  };
                  return (
                    <tr
                      key={v.id}
                      className={`border-b border-border/50 transition-colors ${i % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/5`}
                    >
                      <td className="px-3 py-3">
                        <button
                          className="text-primary hover:underline font-mono text-xs cursor-pointer bg-transparent border-none p-0"
                          onClick={() => { setEditVoucherId(v.id); setDrawerOpen(true); }}
                        >
                          {v.ref_number}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-xs text-foreground tabular-nums">{v.date || "—"}</td>
                      <td className="px-3 py-3 text-sm font-medium text-foreground">{v.contact_name}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground truncate max-w-[200px]">{v.description || "—"}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{v.payment_label}</td>
                      <td className="px-3 py-3 text-sm font-bold tabular-nums text-foreground">₪{v.amount_display.toLocaleString()}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusStyles[v.status_label] || "bg-muted text-muted-foreground"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColor[v.status_label] || "bg-muted-foreground"}`} />
                          {v.status_label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-primary/5 border-t-2 border-primary/20 font-bold text-sm">
                  <td colSpan={5} className="px-3 py-3 text-right text-foreground">المجموع ({filtered.length} سند)</td>
                  <td className="px-3 py-3 tabular-nums text-foreground">₪{filtered.reduce((s, v) => s + v.amount_display, 0).toLocaleString()}</td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {sorted.length > PER_PAGE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-muted/20">
              <p className="text-xs text-muted-foreground">
                عرض {Math.min((page - 1) * PER_PAGE + 1, sorted.length)}–{Math.min(page * PER_PAGE, sorted.length)} من {sorted.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronRight className="h-3.5 w-3.5 ml-1" /> السابق
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
                  Math.max(0, page - 3), Math.min(totalPages, page + 2)
                ).map(n => (
                  <Button key={n} variant={page === n ? "default" : "outline"} size="sm" className="rounded-lg h-8 w-8 text-xs p-0" onClick={() => setPage(n)}>
                    {n}
                  </Button>
                ))}
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  التالي <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">صفحة {page} من {totalPages}</p>
            </div>
          )}
        </div>
      )}

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
