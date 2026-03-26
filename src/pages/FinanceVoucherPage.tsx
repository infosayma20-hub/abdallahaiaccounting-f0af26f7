import { useState, useEffect, useMemo, useCallback } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2, Plus, DollarSign, Hash, Calendar, ArrowRight, Search, X,
  ArrowUpDown, ChevronLeft, ChevronRight, FileText, Copy, Pencil, Trash2
} from "lucide-react";
import DuplicateConfirmModal from "@/components/DuplicateConfirmModal";
import DeleteDocumentDialog from "@/components/documents/DeleteDocumentDialog";
import EditPostedWarningDialog from "@/components/documents/EditPostedWarningDialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDocumentPermissions } from "@/hooks/useDocumentPermissions";
import { toast } from "@/hooks/use-toast";
import { multiWordMatchAny } from "@/lib/utils";

type VoucherType = "receipt" | "payment";

interface Props {
  voucherType: VoucherType;
}

const PAYMENT_LABELS: Record<string, string> = { cash: "نقدي", bank: "بنك", cheque: "شيك", transfer: "تحويل", "نقدي": "نقدي", "شيك": "شيك", "تحويل": "تحويل", "بطاقة": "بطاقة" };
const STATUS_LABELS: Record<string, string> = { posted: "مرحّل", draft: "مسودة", cancelled: "ملغي" };

type SortKey = "ref_number" | "date" | "contact_name" | "payment_label" | "amount_display" | "status_label";
type SortDir = "asc" | "desc";
const PER_PAGE = 15;

const FinanceVoucherPage = ({ voucherType }: Props) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { canEdit, canDelete } = useDocumentPermissions();

  const isReceipt = voucherType === "receipt";
  const title = isReceipt ? "سندات القبض" : "سندات الصرف";
  const newTitle = isReceipt ? "سند قبض جديد" : "سند صرف جديد";
  const contactLabel = isReceipt ? "المستلم من" : "المدفوع لـ";

  const [vouchers, setVouchers] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  // Duplicate
  const [duplicateModal, setDuplicateModal] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<any>(null);

  // Delete
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // Edit posted warning
  const [editWarning, setEditWarning] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);

  const handleEdit = (v: any) => {
    const isPosted = v.status === "posted" || v.status_label === "مرحّل";
    if (isPosted) {
      setEditTarget(v);
      setEditWarning(true);
    } else {
      navigateToEdit(v);
    }
  };

  const navigateToEdit = (v: any) => {
    const editPath = isReceipt
      ? `/finance/receipt/${v.id}/edit`
      : `/finance/payment/${v.id}/edit`;
    navigate(editPath);
  };

  const confirmEditPosted = () => {
    if (!editTarget) return;
    // Log edit action
    if (user) {
      supabase.from("document_edit_history" as any).insert({
        document_id: editTarget.id,
        document_type: isReceipt ? "receipt" : "payment",
        old_data: editTarget,
        edit_reason: "فتح تعديل مستند مرحّل",
        edited_by: user.id,
        user_id: user.id,
      } as any);
    }
    setEditWarning(false);
    navigateToEdit(editTarget);
  };

  const handleDelete = (v: any) => {
    setDeleteTarget(v);
    setDeleteDialog(true);
  };

  const confirmDelete = async (reason: string) => {
    if (!deleteTarget || !user) return;
    try {
      const table = isReceipt ? "receipt_vouchers" : "vouchers";
      // Just cancel the voucher — DB trigger handles cascading to linked transaction
      const { error } = await supabase
        .from(table as any)
        .update({ status: "cancelled" } as any)
        .eq("id", deleteTarget.id);

      if (error) throw error;

      // Log deletion
      await supabase.from("document_edit_history" as any).insert({
        document_id: deleteTarget.id,
        document_type: isReceipt ? "receipt" : "payment",
        old_data: deleteTarget,
        edit_reason: reason,
        edited_by: user.id,
        user_id: user.id,
        changes: { action: "delete", reason },
      } as any);

      toast({ title: "تم حذف المستند والقيد المرتبط بنجاح ✅" });
      setDeleteDialog(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ في الحذف", description: err.message, variant: "destructive" });
    }
  };

  const handleDuplicate = (v: any) => {
    setDuplicateTarget(v);
    setDuplicateModal(true);
  };

  const confirmDuplicate = () => {
    if (!duplicateTarget) return;
    const draftData = {
      _sourceRef: duplicateTarget.ref_number,
      paymentMethod: PAYMENT_LABELS[duplicateTarget.payment_method] || "نقدي",
      notes: duplicateTarget.notes || "",
      contactId: duplicateTarget.contact_id || null,
      depositType: duplicateTarget.cash_box_id ? "cash_box" : "bank",
      selectedCashBox: duplicateTarget.cash_box_id || "",
      selectedBankAccount: duplicateTarget.bank_account_id || "",
    };
    localStorage.setItem(`draft_${voucherType}_new`, JSON.stringify(draftData));
    setDuplicateModal(false);
    navigate(isReceipt ? "/finance/receipt/new?from_duplicate=true" : "/finance/payment/new?from_duplicate=true");
  };

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    if (isReceipt) {
      // Receipts are stored in receipt_vouchers table
      const [rvRes, cRes] = await Promise.all([
        supabase.from("receipt_vouchers").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("contacts").select("id, contact_name, contact_type").eq("user_id", user.id).neq("is_archived", true),
      ]);
      // Map receipt_vouchers fields to unified format
      const mapped = (rvRes.data || []).map((rv: any) => ({
        ...rv,
        ref_number: rv.receipt_number,
        date: rv.payment_date,
        amount_ils: rv.amount,
        amount: rv.amount,
        type: "receipt",
        // payment_method is already in Arabic in receipt_vouchers
      }));
      setVouchers(mapped);
      setContacts(cRes.data || []);
    } else {
      // Payments are stored in vouchers table
      const [vRes, cRes] = await Promise.all([
        supabase.from("vouchers").select("*").eq("user_id", user.id).eq("type", "payment").order("created_at", { ascending: false }),
        supabase.from("contacts").select("id, contact_name, contact_type").eq("user_id", user.id).neq("is_archived", true),
      ]);
      setVouchers(vRes.data || []);
      setContacts(cRes.data || []);
    }

    setLoading(false);
  }, [user, voucherType, isReceipt]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId) {
      const editPath = isReceipt
        ? `/finance/receipt/${editId}/edit`
        : `/finance/payment/${editId}/edit`;
      navigate(editPath);
    } else if (searchParams.get("new") === "1") {
      navigate(isReceipt ? "/finance/receipt/new" : "/finance/payment/new");
    }
  }, [searchParams, isReceipt, navigate]);

  const tableData = useMemo(() => {
    return vouchers.map(v => {
      // For receipts, contact_name is directly on the record
      // For payments, we look up from contacts list
      const contactName = v.contact_name || contacts.find(c => c.id === v.contact_id)?.contact_name || "—";
      return {
        ...v,
        contact_name: contactName,
        payment_label: PAYMENT_LABELS[v.payment_method] || v.payment_method || "—",
        status_label: STATUS_LABELS[v.status] || v.status,
        amount_display: Number(v.amount_ils || v.amount || 0),
      };
    });
  }, [vouchers, contacts]);

  // Filtering
  const filtered = useMemo(() => {
    let data = [...tableData];
    if (statusFilter === "active") data = data.filter(v => v.status_label !== "ملغي");
    else if (statusFilter !== "all") data = data.filter(v => v.status_label === statusFilter);
    if (paymentFilter !== "all") data = data.filter(v => v.payment_label === paymentFilter);
    if (searchQuery) {
      data = data.filter(v => multiWordMatchAny(searchQuery, v.ref_number, v.description, v.notes, v.contact_name));
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
      <PageHeader title={title} breadcrumb={["المالية", title]} />
      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{isReceipt ? "إدارة سندات القبض والمقبوضات" : "إدارة سندات الصرف والمدفوعات"}</p>
        <Button className="gap-1.5 rounded-xl shadow-md shadow-primary/20" onClick={() => {
          if (isReceipt) { navigate("/finance/receipt/new"); }
          else { navigate("/finance/payment/new"); }
        }}>
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
      <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-3 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
            <Input
              placeholder="ابحث برقم السند، الوصف، الجهة..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pr-10 rounded-xl bg-muted/30 border-0 focus-visible:ring-2 focus-visible:ring-primary/20"
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
              <SelectTrigger className="w-[140px] rounded-xl text-xs h-9">
                <SelectValue placeholder="حالة السند" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="active">بدون الملغية</SelectItem>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="مرحّل">✅ مرحّل</SelectItem>
                <SelectItem value="مسودة">📝 مسودة</SelectItem>
                <SelectItem value="ملغي">🔴 ملغي فقط</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground mr-auto">{filtered.length} سند</span>
          </div>
        </CardContent>
      </Card>

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
          <Button className="rounded-xl gap-2 shadow-md shadow-primary/20" onClick={() => {
            if (isReceipt) { navigate("/finance/receipt/new"); }
            else { navigate("/finance/payment/new"); }
          }}>
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
                  <th className="px-3 py-3 w-10"></th>
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
                          onClick={() => {
                            const editPath = isReceipt
                              ? `/finance/receipt/${v.id}/edit`
                              : `/finance/payment/${v.id}/edit`;
                            navigate(editPath);
                          }}
                        >
                          {v.ref_number}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-xs text-foreground tabular-nums">{v.date || "—"}</td>
                      <td className="px-3 py-3 text-sm font-medium text-foreground">{v.contact_name}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground truncate max-w-[200px]">{v.description || v.notes || "—"}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{v.payment_label}</td>
                      <td className="px-3 py-3 text-sm font-bold tabular-nums text-foreground">₪{v.amount_display.toLocaleString()}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusStyles[v.status_label] || "bg-muted text-muted-foreground"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColor[v.status_label] || "bg-muted-foreground"}`} />
                          {v.status_label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-0.5">
                          {canEdit(v) && (
                            <button
                              onClick={e => { e.stopPropagation(); handleEdit(v); }}
                              className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                              title="تعديل"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canDelete(v) && v.status !== "cancelled" && (
                            <button
                              onClick={e => { e.stopPropagation(); handleDelete(v); }}
                              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title="حذف"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); handleDuplicate(v); }}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                            title="جديد مشابه"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
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

      {/* Duplicate Confirm Modal */}
      <DuplicateConfirmModal
        open={duplicateModal}
        onClose={() => setDuplicateModal(false)}
        onConfirm={confirmDuplicate}
        docType={isReceipt ? "receipt" : "payment"}
        info={{
          contactName: duplicateTarget?.contact_name,
          paymentMethod: duplicateTarget?.payment_label,
          sourceRef: duplicateTarget?.ref_number,
        }}
      />

      {/* Edit Posted Warning */}
      <EditPostedWarningDialog
        open={editWarning}
        onClose={() => setEditWarning(false)}
        onConfirm={confirmEditPosted}
        docNumber={editTarget?.ref_number}
        docAmount={editTarget?.amount_display}
      />

      {/* Delete Dialog */}
      <DeleteDocumentDialog
        open={deleteDialog}
        onClose={() => setDeleteDialog(false)}
        onConfirm={confirmDelete}
        docNumber={deleteTarget?.ref_number}
        docAmount={deleteTarget?.amount_display}
      />
    </div>
  );
};

export default FinanceVoucherPage;
