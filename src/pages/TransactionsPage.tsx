import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useNavigate } from "react-router-dom";
import JournalEntryPopup from "@/components/JournalEntryPopup";
import TransactionsPrintView from "@/components/TransactionsPrintView";
import {
  ArrowRight, Loader2, RefreshCw, Pencil, Trash2, CheckSquare, X,
  RotateCcw, Archive, Search, ChevronLeft, ChevronRight as ChevronRightIcon,
  Download, Printer, Plus, CalendarDays, MoreVertical, Check, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import * as XLSX from "xlsx";
import { fmtDateDisplay } from "@/lib/utils";

interface Transaction {
  id: string;
  description: string;
  debit_account_code: string;
  credit_account_code: string;
  transaction_type: string;
  amount: number;
  currency: string;
  transaction_date: string;
  reference: string | null;
  is_deleted: boolean;
  is_opening_balance: boolean;
  contact_id: string | null;
  notes: string | null;
  payment_method: string | null;
}

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
}

// ━━ Type Badge ━━
const typeBadgeConfig: Record<string, { label: string; bg: string; text: string }> = {
  // مبيعات
  sale:               { label: "فاتورة مبيعات",  bg: "bg-[#DBEAFE]", text: "text-[#1E40AF]" },
  pos_sale:           { label: "مبيعات POS",     bg: "bg-[#DBEAFE]", text: "text-[#1E40AF]" },
  pos_cogs:           { label: "تكلفة مبيعات",   bg: "bg-[#FEF3C7]", text: "text-[#92400E]" },
  pos_transfer:       { label: "ترحيل وردية",    bg: "bg-[#DBEAFE]", text: "text-[#1E40AF]" },
  sale_cash:          { label: "بيع نقدي",       bg: "bg-[#DBEAFE]", text: "text-[#1E40AF]" },
  sale_credit:        { label: "بيع آجل",        bg: "bg-[#E0E7FF]", text: "text-[#3730A3]" },
  sale_bank:          { label: "بيع بنكي",       bg: "bg-[#DBEAFE]", text: "text-[#1E40AF]" },
  sale_cheque:        { label: "بيع شيك",        bg: "bg-[#DBEAFE]", text: "text-[#1E40AF]" },
  // مشتريات
  purchase:           { label: "فاتورة مشتريات", bg: "bg-[#EDE9FE]", text: "text-[#5B21B6]" },
  purchase_invoice:   { label: "فاتورة مشتريات", bg: "bg-[#EDE9FE]", text: "text-[#5B21B6]" },
  purchase_cash:      { label: "شراء نقدي",      bg: "bg-[#EDE9FE]", text: "text-[#5B21B6]" },
  purchase_credit:    { label: "شراء آجل",       bg: "bg-[#EDE9FE]", text: "text-[#5B21B6]" },
  purchase_bank:      { label: "شراء بنكي",      bg: "bg-[#EDE9FE]", text: "text-[#5B21B6]" },
  purchase_cheque:    { label: "شراء شيك",       bg: "bg-[#EDE9FE]", text: "text-[#5B21B6]" },
  // سندات
  receipt:            { label: "سند قبض",        bg: "bg-[#D1FAE5]", text: "text-[#065F46]" },
  payment:            { label: "سند صرف",        bg: "bg-[#FEE2E2]", text: "text-[#991B1B]" },
  // مصروفات ورواتب
  expense:            { label: "مصروفات",        bg: "bg-[#FEE2E2]", text: "text-[#991B1B]" },
  salary:             { label: "رواتب",          bg: "bg-[#FFEDD5]", text: "text-[#9A3412]" },
  // موظفين
  employee_payment:   { label: "دفعة موظف",      bg: "bg-[#FFEDD5]", text: "text-[#9A3412]" },
  employee_advance:   { label: "سلفة موظف",      bg: "bg-[#FEF3C7]", text: "text-[#92400E]" },
  employee_salary:    { label: "راتب موظف",      bg: "bg-[#FFEDD5]", text: "text-[#9A3412]" },
  employee_deduction: { label: "خصم موظف",       bg: "bg-[#FEE2E2]", text: "text-[#991B1B]" },
  loan_payment:       { label: "قسط قرض",        bg: "bg-[#FEF3C7]", text: "text-[#92400E]" },
  loan_disbursement:  { label: "صرف قرض",        bg: "bg-[#FFEDD5]", text: "text-[#9A3412]" },
  // مخزون
  inventory_in:       { label: "إدخال مخزون",    bg: "bg-[#D1FAE5]", text: "text-[#065F46]" },
  inventory_out:      { label: "إخراج مخزون",    bg: "bg-[#FEE2E2]", text: "text-[#991B1B]" },
  import_cost:        { label: "تكلفة استيراد",   bg: "bg-[#EDE9FE]", text: "text-[#5B21B6]" },
  return:             { label: "مرتجع",          bg: "bg-[#FFEDD5]", text: "text-[#9A3412]" },
  purchase_return:    { label: "مرتجع مشتريات",  bg: "bg-[#FFEDD5]", text: "text-[#9A3412]" },
  sale_return:        { label: "مرتجع مبيعات",   bg: "bg-[#FFEDD5]", text: "text-[#9A3412]" },
  // شيكات
  cheque_register:    { label: "تسجيل شيك",      bg: "bg-[#E0E7FF]", text: "text-[#3730A3]" },
  cheque_deposit:     { label: "إيداع شيك",      bg: "bg-[#DBEAFE]", text: "text-[#1E40AF]" },
  cheque_collection:  { label: "تحصيل شيك",      bg: "bg-[#D1FAE5]", text: "text-[#065F46]" },
  cheque_bounce:      { label: "شيك مرتجع",      bg: "bg-[#FEE2E2]", text: "text-[#991B1B]" },
  cheque_endorsement: { label: "تظهير شيك",      bg: "bg-[#FEF3C7]", text: "text-[#92400E]" },
  cheque_return:      { label: "إرجاع شيك",      bg: "bg-[#FFEDD5]", text: "text-[#9A3412]" },
  cheque_cancel:      { label: "إلغاء شيك",      bg: "bg-[#F3F4F6]", text: "text-[#374151]" },
  bank_fee:           { label: "عمولة بنكية",    bg: "bg-[#FEF9C3]", text: "text-[#854D0E]" },
  // تحويلات وأخرى
  cash_transfer:      { label: "تحويل صندوق",    bg: "bg-[#FEF3C7]", text: "text-[#92400E]" },
  bank_transfer:      { label: "تحويل بنكي",     bg: "bg-[#DBEAFE]", text: "text-[#1E40AF]" },
  exchange_diff:      { label: "فروق عملة",      bg: "bg-[#FEF9C3]", text: "text-[#854D0E]" },
  opening_balance:    { label: "رصيد افتتاحي",   bg: "bg-[#F3F4F6]", text: "text-[#374151]" },
  manual:             { label: "قيد يدوي",       bg: "bg-[#F3F4F6]", text: "text-[#374151]" },
  journal:            { label: "قيد يومية",      bg: "bg-[#F3F4F6]", text: "text-[#374151]" },
  // عقود ومقاولات
  contract:           { label: "عقد مقاولة",     bg: "bg-[#FCE7F3]", text: "text-[#9D174D]" },
  contract_payment:   { label: "دفعة عقد",       bg: "bg-[#FCE7F3]", text: "text-[#9D174D]" },
  // أصول ثابتة
  asset_purchase:     { label: "شراء أصل",       bg: "bg-[#CCFBF1]", text: "text-[#115E59]" },
  depreciation:       { label: "إهلاك",          bg: "bg-[#F3F4F6]", text: "text-[#374151]" },
  asset_disposal:     { label: "استبعاد أصل",    bg: "bg-[#FEE2E2]", text: "text-[#991B1B]" },
};

function TypeBadge({ type }: { type: string }) {
  const c = typeBadgeConfig[type] || { label: type || "—", bg: "bg-[#F3F4F6]", text: "text-[#374151]" };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const TransactionsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings } = useCompanySettings();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPrintView, setShowPrintView] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editFields, setEditFields] = useState({ description: "", transaction_type: "", amount: "", currency: "", transaction_date: "", debit_account_code: "", credit_account_code: "" });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [typeFilter, setTypeFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  // Expansion
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Sort
  const [sortField, setSortField] = useState<"date" | "debit" | "credit">("date");
  const [sortAsc, setSortAsc] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Journal Entry Modal
  const [showJournalEntry, setShowJournalEntry] = useState(false);

  // Trash
  const [showTrash, setShowTrash] = useState(false);
  const [deletedTransactions, setDeletedTransactions] = useState<Transaction[]>([]);
  const [loadingTrash, setLoadingTrash] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [txRes, accRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', user.id).eq('is_deleted', false).order('transaction_date', { ascending: false }),
        supabase.from('accounts').select('*').eq('user_id', user.id).order('account_code'),
      ]);
      if (txRes.error) throw txRes.error;
      if (accRes.error) throw accRes.error;
      setTransactions(txRes.data || []);
      setAccounts(accRes.data || []);
    } catch (err: any) {
      setError(err.message || "خطأ في جلب البيانات");
    } finally {
      setLoading(false);
    }
  };

  const fetchDeletedTransactions = async () => {
    if (!user) return;
    setLoadingTrash(true);
    try {
      const { data, error } = await supabase.from('transactions').select('*').eq('user_id', user.id).eq('is_deleted', true).order('transaction_date', { ascending: false });
      if (error) throw error;
      setDeletedTransactions(data || []);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoadingTrash(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);
  useEffect(() => { if (showTrash) fetchDeletedTransactions(); }, [showTrash]);

  const getAccountName = (code: string) => {
    const acc = accounts.find(a => a.account_code === code);
    return acc?.account_name || code;
  };

  // ━━ Unique transaction types for filter ━━
  const uniqueTypes = useMemo(() => {
    const types = new Set(transactions.map(t => t.transaction_type).filter(Boolean));
    return Array.from(types);
  }, [transactions]);

  // ━━ Unique accounts used ━━
  const usedAccounts = useMemo(() => {
    const codes = new Set<string>();
    transactions.forEach(t => {
      codes.add(t.debit_account_code);
      codes.add(t.credit_account_code);
    });
    return accounts.filter(a => codes.has(a.account_code));
  }, [transactions, accounts]);

  // ━━ Date filter logic ━━
  const getDateRange = (filter: string): { from: string; to: string } | null => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    switch (filter) {
      case "today": {
        const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        return { from: ds, to: ds };
      }
      case "this_week": {
        const day = now.getDay();
        const start = new Date(now);
        start.setDate(d - day);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return { from: start.toISOString().slice(0,10), to: end.toISOString().slice(0,10) };
      }
      case "this_month": {
        return { from: `${y}-${String(m+1).padStart(2,'0')}-01`, to: `${y}-${String(m+1).padStart(2,'0')}-31` };
      }
      case "last_month": {
        const lm = m === 0 ? 11 : m - 1;
        const ly = m === 0 ? y - 1 : y;
        return { from: `${ly}-${String(lm+1).padStart(2,'0')}-01`, to: `${ly}-${String(lm+1).padStart(2,'0')}-31` };
      }
      default: return null;
    }
  };

  // ━━ Filtered + sorted transactions ━━
  const filteredTransactions = useMemo(() => {
    let result = transactions.filter(tx => {
      if (typeFilter !== "all" && tx.transaction_type !== typeFilter) return false;
      if (accountFilter !== "all" && tx.debit_account_code !== accountFilter && tx.credit_account_code !== accountFilter) return false;
      if (dateFilter !== "all") {
        const range = getDateRange(dateFilter);
        if (range && (tx.transaction_date < range.from || tx.transaction_date > range.to)) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDesc = (tx.description || '').toLowerCase().includes(q);
        const matchRef = (tx.reference || '').toLowerCase().includes(q);
        const matchDebit = getAccountName(tx.debit_account_code).toLowerCase().includes(q);
        const matchCredit = getAccountName(tx.credit_account_code).toLowerCase().includes(q);
        if (!matchDesc && !matchRef && !matchDebit && !matchCredit) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") cmp = a.transaction_date.localeCompare(b.transaction_date);
      else if (sortField === "debit") cmp = a.amount - b.amount;
      else if (sortField === "credit") cmp = a.amount - b.amount;
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [transactions, typeFilter, accountFilter, dateFilter, searchQuery, sortField, sortAsc, accounts]);

  // ━━ Totals ━━
  const totalDebit = useMemo(() => filteredTransactions.reduce((s, t) => s + (t.amount || 0), 0), [filteredTransactions]);
  const totalCredit = useMemo(() => filteredTransactions.reduce((s, t) => s + (t.amount || 0), 0), [filteredTransactions]);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  // ━━ Pagination ━━
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, currentPage, pageSize]);

  useEffect(() => { setCurrentPage(1); }, [typeFilter, accountFilter, dateFilter, searchQuery, pageSize]);

  // ━━ Expand/Collapse ━━
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ━━ Sort ━━
  const toggleSort = (field: "date" | "debit" | "credit") => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <span className="text-[#94A3B8] text-[10px]">⇅</span>;
    return <span className="text-[#1A56DB] text-[10px]">{sortAsc ? "↑" : "↓"}</span>;
  };

  // ━━ Selection ━━
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedTransactions.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginatedTransactions.map(t => t.id)));
  };

  // ━━ CRUD operations ━━
  const openEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditFields({
      description: tx.description || "", transaction_type: tx.transaction_type || "",
      amount: String(tx.amount || ""), currency: tx.currency || "شيكل",
      transaction_date: tx.transaction_date || "",
      debit_account_code: tx.debit_account_code || "", credit_account_code: tx.credit_account_code || "",
    });
  };

  const handleSave = async () => {
    if (!editingTx) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('transactions').update({
        description: editFields.description, transaction_type: editFields.transaction_type,
        amount: Number(editFields.amount), currency: editFields.currency,
        transaction_date: editFields.transaction_date,
        debit_account_code: editFields.debit_account_code, credit_account_code: editFields.credit_account_code,
      }).eq('id', editingTx.id);
      if (error) throw error;
      toast({ title: "تم تعديل المعاملة بنجاح ✅" });
      setEditingTx(null);
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const cancelLinkedVouchers = async (txIds: string[]) => {
    if (!user || txIds.length === 0) return;
    // Cancel linked receipt vouchers
    await supabase.from('receipt_vouchers')
      .update({ status: 'cancelled' } as any)
      .eq('user_id', user.id)
      .in('linked_transaction_id', txIds);
    // Cancel linked payment vouchers
    await supabase.from('vouchers')
      .update({ status: 'cancelled' } as any)
      .eq('user_id', user.id)
      .in('linked_transaction_id', txIds);
    // Cancel linked invoices
    await supabase.from('invoices')
      .update({ status: 'cancelled' } as any)
      .eq('user_id', user.id)
      .in('linked_transaction_id', txIds);
    // Cancel linked purchase invoices
    await supabase.from('purchase_invoices')
      .update({ status: 'cancelled' } as any)
      .eq('user_id', user.id)
      .in('linked_transaction_id', txIds);
  };

  const restoreLinkedVouchers = async (txIds: string[]) => {
    if (!user || txIds.length === 0) return;
    await supabase.from('receipt_vouchers')
      .update({ status: 'posted' } as any)
      .eq('user_id', user.id)
      .in('linked_transaction_id', txIds);
    await supabase.from('vouchers')
      .update({ status: 'posted' } as any)
      .eq('user_id', user.id)
      .in('linked_transaction_id', txIds);
    await supabase.from('invoices')
      .update({ status: 'posted' } as any)
      .eq('user_id', user.id)
      .in('linked_transaction_id', txIds);
    await supabase.from('purchase_invoices')
      .update({ status: 'posted' } as any)
      .eq('user_id', user.id)
      .in('linked_transaction_id', txIds);
  };

  const handleDelete = async () => {
    if (!editingTx) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('transactions').update({ is_deleted: true }).eq('id', editingTx.id);
      if (error) throw error;
      await cancelLinkedVouchers([editingTx.id]);
      toast({ title: "تم نقل المعاملة والمستندات المرتبطة إلى سلة المحذوفات" });
      setEditingTx(null); setShowDeleteConfirm(false); fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setDeleting(false); }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from('transactions').update({ is_deleted: true }).in('id', ids);
      if (error) throw error;
      await cancelLinkedVouchers(ids);
      toast({ title: `تم نقل ${ids.length} معاملة والمستندات المرتبطة إلى سلة المحذوفات` });
      setShowBulkDeleteConfirm(false); setSelectedIds(new Set()); fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setBulkDeleting(false); }
  };

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      const { error } = await supabase.from('transactions').update({ is_deleted: false }).eq('id', id);
      if (error) throw error;
      await restoreLinkedVouchers([id]);
      toast({ title: "تم استرجاع المعاملة والمستندات المرتبطة بنجاح ✅" });
      fetchDeletedTransactions(); fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setRestoringId(null); }
  };

  const handleRestoreAll = async () => {
    setBulkDeleting(true);
    try {
      const ids = deletedTransactions.map(tx => tx.id);
      const { error } = await supabase.from('transactions').update({ is_deleted: false }).in('id', ids);
      if (error) throw error;
      await restoreLinkedVouchers(ids);
      toast({ title: `تم استرجاع ${ids.length} معاملة والمستندات المرتبطة بنجاح ✅` });
      fetchDeletedTransactions(); fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setBulkDeleting(false); }
  };

  // ━━ Export ━━
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Company header rows
    const headerRows = [
      [settings.company_name || "الشركة"],
      [settings.address ? `${settings.address} ${settings.city || ""}`.trim() : ""],
      [settings.phone ? `هاتف: ${settings.phone}` : "", settings.email || "", settings.tax_number ? `رقم ضريبي: ${settings.tax_number}` : ""],
      [],
      ["تقرير الحركات المحاسبية"],
      [`تاريخ الإصدار: ${new Date().toLocaleDateString("ar-EG")}`, "", `عدد القيود: ${filteredTransactions.length}`],
      [],
    ];

    const dataRows = filteredTransactions.map((tx, i) => ({
      "#": i + 1,
      "التاريخ": fmtDateDisplay(tx.transaction_date),
      "المرجع": tx.reference || "",
      "الوصف": tx.description || "",
      "النوع": typeBadgeConfig[tx.transaction_type]?.label || tx.transaction_type,
      "حساب مدين": `${tx.debit_account_code} - ${getAccountName(tx.debit_account_code)}`,
      "حساب دائن": `${tx.credit_account_code} - ${getAccountName(tx.credit_account_code)}`,
      "المدين": tx.amount,
      "الدائن": tx.amount,
      "العملة": tx.currency,
    }));

    const ws = XLSX.utils.aoa_to_sheet(headerRows);
    XLSX.utils.sheet_add_json(ws, dataRows, { origin: "A8" });
    
    // Merge company name cell
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: 5 } },
    ];

    // Add totals row
    const totalRowIdx = 8 + dataRows.length;
    XLSX.utils.sheet_add_aoa(ws, [
      ["", "", "", "", "", "", "الإجمالي", totalDebit, totalCredit, ""],
    ], { origin: `A${totalRowIdx + 1}` });

    XLSX.utils.book_append_sheet(wb, ws, "دفتر اليومية");
    XLSX.writeFile(wb, `دفتر_اليومية_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handlePrint = () => {
    setShowPrintView(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setShowPrintView(false), 500);
    }, 300);
  };

  const companyInfo = useMemo(() => ({
    name: settings.company_name || "الشركة",
    logo_url: settings.logo_url || "",
    address: settings.address || "",
    phone: settings.phone || "",
    email: settings.email || "",
    website: settings.website || "",
    tax_number: settings.tax_number || "",
  }), [settings]);

  const printTransactions = useMemo(() => filteredTransactions.map(tx => ({
    ...tx,
    debit_account_name: getAccountName(tx.debit_account_code),
    credit_account_name: getAccountName(tx.credit_account_code),
  })), [filteredTransactions, accounts]);

  const filterLabel = useMemo(() => {
    const parts: string[] = [];
    if (typeFilter !== "all") parts.push(typeBadgeConfig[typeFilter]?.label || typeFilter);
    if (accountFilter !== "all") parts.push(getAccountName(accountFilter));
    if (dateFilter !== "all") {
      const labels: Record<string, string> = { today: "اليوم", this_week: "هذا الأسبوع", this_month: "هذا الشهر", last_month: "الشهر السابق" };
      parts.push(labels[dateFilter] || dateFilter);
    }
    return parts.length ? parts.join(" • ") : "كل القيود";
  }, [typeFilter, accountFilter, dateFilter, accounts]);

  const formatDate = (d: string) => fmtDateDisplay(d);

  // ━━ Trash View ━━
  if (showTrash) {
    return (
      <div className="px-6 pt-6 space-y-4 max-w-7xl mx-auto" dir="rtl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowTrash(false)} className="p-2 rounded-lg hover:bg-[#F1F5F9] transition-colors">
              <ArrowRight className="h-5 w-5 text-[#1A2332]" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-[#1A2332]">سلة المحذوفات</h1>
              <p className="text-sm text-[#637381] mt-0.5">{deletedTransactions.length} معاملة محذوفة</p>
            </div>
          </div>
          {deletedTransactions.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRestoreAll} disabled={bulkDeleting}>
              {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              استرجاع الكل ({deletedTransactions.length})
            </Button>
          )}
        </div>
        {loadingTrash && <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#1A56DB]" /></div>}
        {!loadingTrash && deletedTransactions.length === 0 && (
          <div className="text-center py-16 space-y-2">
            <Archive className="h-12 w-12 text-[#CBD5E1] mx-auto" />
            <p className="text-sm text-[#637381]">سلة المحذوفات فارغة</p>
          </div>
        )}
        {!loadingTrash && deletedTransactions.map(tx => (
          <Card key={tx.id} className="border border-[#E2E8F0] shadow-none opacity-75">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-[#1A2332] line-through">{tx.description || "بدون وصف"}</p>
                <p className="text-xs text-[#637381] mt-1">{fmtDateDisplay(tx.transaction_date)} — ₪{tx.amount?.toFixed(2)}</p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => handleRestore(tx.id)} disabled={restoringId === tx.id}>
                {restoringId === tx.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                استرجاع
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white" dir="rtl">
      {/* ━━━ HEADER ━━━ */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/apps")} className="p-2 rounded-lg hover:bg-[#F1F5F9] transition-colors">
            <ArrowRight className="h-5 w-5 text-[#1A2332]" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-[#1A2332] tracking-tight">تقرير الحركات المحاسبية</h1>
            <p className="text-sm text-[#637381] mt-0.5">
              {filteredTransactions.length} قيد
              {" • "}
              <span className="text-[#1A56DB] font-medium">مدين: ₪{totalDebit.toFixed(2)}</span>
              {" • "}
              <span className="text-[#0E9F6E] font-medium">دائن: ₪{totalCredit.toFixed(2)}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-sm text-[#374151] border-[#D1D5DB]" onClick={() => setShowTrash(true)}>
            <Archive className="w-4 h-4" />
            المحذوفات
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-sm text-[#374151] border-[#D1D5DB]" onClick={handleExportExcel}>
            <Download className="w-4 h-4" />
            Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-sm text-[#374151] border-[#D1D5DB]" onClick={handlePrint}>
            <Printer className="w-4 h-4" />
            طباعة
          </Button>
        </div>
      </div>

      {/* ━━━ FILTERS BAR ━━━ */}
      <div className="flex items-center gap-3 px-6 py-3 bg-[#F8F9FA] border-b border-[#E2E8F0] flex-wrap">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="w-4 h-4 text-[#94A3B8]" />
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="text-sm border border-[#D1D5DB] rounded-lg px-3 py-1.5 bg-white text-[#374151] focus:border-[#1A56DB] focus:ring-1 focus:ring-[#1A56DB] outline-none"
          >
            <option value="all">كل الفترات</option>
            <option value="today">اليوم</option>
            <option value="this_week">هذا الأسبوع</option>
            <option value="this_month">هذا الشهر</option>
            <option value="last_month">الشهر السابق</option>
          </select>
        </div>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="text-sm border border-[#D1D5DB] rounded-lg px-3 py-1.5 bg-white text-[#374151] focus:border-[#1A56DB] focus:ring-1 focus:ring-[#1A56DB] outline-none"
        >
          <option value="all">كل الأنواع</option>
          {uniqueTypes.map(t => (
            <option key={t} value={t}>{typeBadgeConfig[t]?.label || t}</option>
          ))}
        </select>

        <select
          value={accountFilter}
          onChange={e => setAccountFilter(e.target.value)}
          className="text-sm border border-[#D1D5DB] rounded-lg px-3 py-1.5 bg-white text-[#374151] focus:border-[#1A56DB] focus:ring-1 focus:ring-[#1A56DB] outline-none max-w-[200px]"
        >
          <option value="all">كل الحسابات</option>
          {usedAccounts.map(a => (
            <option key={a.account_code} value={a.account_code}>{a.account_code} - {a.account_name}</option>
          ))}
        </select>

        <div className="flex-1 relative min-w-[180px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ابحث بالمرجع، الوصف، الحساب..."
            className="w-full pr-9 pl-3 py-1.5 text-sm border border-[#D1D5DB] rounded-lg bg-white focus:border-[#1A56DB] focus:ring-1 focus:ring-[#1A56DB] outline-none"
          />
        </div>

        <span className="text-xs text-[#637381] whitespace-nowrap">{filteredTransactions.length} نتيجة</span>

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 text-[#637381] ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* ━━ Bulk selection bar ━━ */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-6 py-2 bg-[#EFF6FF] border-b border-[#BFDBFE]">
          <span className="text-sm text-[#1E40AF] font-medium">تم تحديد {selectedIds.size} قيد</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-[#1E40AF]" onClick={() => setSelectedIds(new Set())}>إلغاء التحديد</Button>
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setShowBulkDeleteConfirm(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              حذف ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}

      {/* ━━━ TABLE ━━━ */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#1A56DB]" />
          </div>
        )}

        {error && (
          <div className="text-center py-16">
            <p className="text-sm text-[#DC2626]">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={fetchData}>إعادة المحاولة</Button>
          </div>
        )}

        {!loading && !error && filteredTransactions.length === 0 && (
          <div className="text-center py-20 space-y-2">
            <p className="text-sm text-[#637381]">لا توجد قيود مطابقة</p>
          </div>
        )}

        {!loading && !error && filteredTransactions.length > 0 && (
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              <col className="w-[3%]" />
              <col className="w-[9%]" />
              <col className="w-[12%]" />
              <col style={{ width: 'auto' }} />
              <col className="w-[10%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[4%]" />
            </colgroup>
            {/* ━━ Header ━━ */}
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#F8F9FA] border-b-2 border-[#E2E8F0]">
                <th className="px-2 py-2.5 text-center">
                  <Checkbox
                    checked={selectedIds.size === paginatedTransactions.length && paginatedTransactions.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th
                  className="text-right px-2 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider cursor-pointer hover:bg-[#EFF6FF] select-none"
                  onClick={() => toggleSort("date")}
                >
                  <div className="flex items-center gap-1">التاريخ <SortIcon field="date" /></div>
                </th>
                <th className="text-right px-2 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">المرجع</th>
                <th className="text-right px-2 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">الوصف / الحسابات</th>
                <th className="text-right px-2 py-2.5 text-xs font-semibold text-[#637381] uppercase tracking-wider">النوع</th>
                <th
                  className="text-left px-2 py-2.5 text-xs font-semibold text-[#1A56DB] uppercase tracking-wider cursor-pointer hover:bg-[#EFF6FF] select-none"
                  onClick={() => toggleSort("debit")}
                >
                  <div className="flex items-center justify-end gap-1"><SortIcon field="debit" /> مدين ₪</div>
                </th>
                <th
                  className="text-left px-2 py-2.5 text-xs font-semibold text-[#0E9F6E] uppercase tracking-wider cursor-pointer hover:bg-[#EFF6FF] select-none"
                  onClick={() => toggleSort("credit")}
                >
                  <div className="flex items-center justify-end gap-1"><SortIcon field="credit" /> دائن ₪</div>
                </th>
                <th className="px-1" />
              </tr>
            </thead>

            {/* ━━ Body ━━ */}
            <tbody>
              {paginatedTransactions.map((tx) => {
                const isExpanded = expandedIds.has(tx.id);
                const isSelected = selectedIds.has(tx.id);
                return (
                  <tr key={tx.id} className="contents">
                    {/* Main Row */}
                    <tr
                      className={`group border-b border-[#F1F5F9] hover:bg-[#F0F4FF] transition-colors cursor-pointer ${isSelected ? "bg-[#EFF6FF]" : "bg-white"}`}
                      onClick={() => toggleExpand(tx.id)}
                    >
                      <td className="px-2 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(tx.id)} />
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="text-sm font-mono text-[#637381]">{formatDate(tx.transaction_date)}</span>
                      </td>
                      <td className="px-2 py-2.5 overflow-hidden">
                        <button
                          onClick={e => { e.stopPropagation(); openEdit(tx); }}
                          title={tx.reference || ""}
                          className="text-sm font-medium text-[#1A56DB] hover:text-[#1648B8] hover:underline font-mono truncate block max-w-full text-right"
                        >
                          {tx.reference || "—"}
                        </button>
                      </td>
                      <td className="px-2 py-2.5 overflow-hidden">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <ChevronRightIcon className={`w-3.5 h-3.5 text-[#94A3B8] transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`} />
                          <span title={tx.description || ""} className="text-sm text-[#1A2332] font-medium truncate">{tx.description || "بدون وصف"}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <TypeBadge type={tx.transaction_type} />
                      </td>
                      <td className="px-2 py-2.5 text-left">
                        <span className="font-mono font-semibold text-sm text-[#1A56DB]">₪{tx.amount?.toFixed(2)}</span>
                      </td>
                      <td className="px-2 py-2.5 text-left">
                        <span className="font-mono font-semibold text-sm text-[#0E9F6E]">₪{tx.amount?.toFixed(2)}</span>
                      </td>
                      <td className="px-1 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1 rounded hover:bg-[#E2E8F0] opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical className="w-4 h-4 text-[#637381]" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(tx)}>
                              <Pencil className="h-4 w-4 ml-2" /> تعديل
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-[#DC2626]" onClick={() => { setEditingTx(tx); setShowDeleteConfirm(true); }}>
                              <Trash2 className="h-4 w-4 ml-2" /> حذف
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>

                    {/* ━━ Expanded detail lines ━━ */}
                    {isExpanded && (
                      <>
                        <tr className="bg-[#FAFAFA] border-b border-[#F1F5F9]">
                          <td />
                          <td />
                          <td />
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2 pr-8">
                              <span className="text-[#CBD5E1] text-lg leading-none">├</span>
                              <span className="font-mono text-[10px] text-[#637381] bg-[#F1F5F9] px-1.5 py-0.5 rounded">{tx.debit_account_code}</span>
                              <span className="text-[#374151] text-xs">{getAccountName(tx.debit_account_code)}</span>
                            </div>
                          </td>
                          <td />
                          <td className="px-3 py-2 text-left">
                            <span className="font-mono text-xs font-semibold text-[#1A56DB]">₪{tx.amount?.toFixed(2)}</span>
                          </td>
                          <td className="px-3 py-2 text-left" />
                          <td />
                        </tr>
                        <tr className="bg-[#FAFAFA] border-b border-[#E2E8F0]">
                          <td />
                          <td />
                          <td />
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2 pr-8">
                              <span className="text-[#CBD5E1] text-lg leading-none">└</span>
                              <span className="font-mono text-[10px] text-[#637381] bg-[#F1F5F9] px-1.5 py-0.5 rounded">{tx.credit_account_code}</span>
                              <span className="text-[#374151] text-xs">{getAccountName(tx.credit_account_code)}</span>
                            </div>
                          </td>
                          <td />
                          <td className="px-3 py-2 text-left" />
                          <td className="px-3 py-2 text-left">
                            <span className="font-mono text-xs font-semibold text-[#0E9F6E]">₪{tx.amount?.toFixed(2)}</span>
                          </td>
                          <td />
                        </tr>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>

            {/* ━━ Footer Totals ━━ */}
            <tfoot className="sticky bottom-0 bg-white border-t-2 border-[#D1D5DB] shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
              <tr>
                <td colSpan={3} className="px-3 py-3">
                  <span className="text-sm font-bold text-[#374151]">الإجمالي — {filteredTransactions.length} قيد</span>
                </td>
                <td colSpan={2} className="px-3 py-3">
                  {isBalanced
                    ? <span className="text-xs font-bold text-[#059669] bg-[#ECFDF5] px-2 py-1 rounded-full">✅ متطابق</span>
                    : <span className="text-xs font-bold text-[#DC2626] bg-[#FEF2F2] px-2 py-1 rounded-full">⚠️ فرق: ₪{Math.abs(totalDebit - totalCredit).toFixed(2)}</span>
                  }
                </td>
                <td className="px-3 py-3 text-left">
                  <span className="font-mono font-bold text-base text-[#1A56DB]">₪{totalDebit.toFixed(2)}</span>
                </td>
                <td className="px-3 py-3 text-left">
                  <span className="font-mono font-bold text-base text-[#0E9F6E]">₪{totalCredit.toFixed(2)}</span>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* ━━━ Pagination ━━━ */}
      {!loading && !error && filteredTransactions.length > 0 && (
        <div className="flex items-center justify-between px-6 py-3 bg-white border-t border-[#E2E8F0]">
          <div className="flex items-center gap-2 text-sm text-[#637381]">
            <span>عرض</span>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="border border-[#D1D5DB] rounded px-2 py-1 text-sm bg-white"
            >
              {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span>من {filteredTransactions.length} قيد</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="px-3 py-1.5 text-sm border border-[#D1D5DB] rounded-lg hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← السابق
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let page: number;
              if (totalPages <= 5) page = i + 1;
              else if (currentPage <= 3) page = i + 1;
              else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
              else page = currentPage - 2 + i;
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 text-sm rounded-lg ${currentPage === page ? "bg-[#1A56DB] text-white" : "hover:bg-[#F1F5F9] text-[#374151]"}`}
                >
                  {page}
                </button>
              );
            })}
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="px-3 py-1.5 text-sm border border-[#D1D5DB] rounded-lg hover:bg-[#F1F5F9] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              التالي →
            </button>
          </div>
        </div>
      )}

      {/* ━━━ Edit Dialog ━━━ */}
      <Dialog open={!!editingTx && !showDeleteConfirm} onOpenChange={(o) => !o && setEditingTx(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle className="text-[#1A2332]">تعديل القيد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={editFields.description} onChange={e => setEditFields(p => ({ ...p, description: e.target.value }))} placeholder="الوصف" dir="rtl" />
            <div className="flex gap-2">
              <Input type="number" value={editFields.amount} onChange={e => setEditFields(p => ({ ...p, amount: e.target.value }))} placeholder="المبلغ" className="flex-1" />
              <Select value={editFields.currency} onValueChange={v => setEditFields(p => ({ ...p, currency: v }))} dir="rtl">
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="شيكل">شيكل</SelectItem>
                  <SelectItem value="دينار">دينار</SelectItem>
                  <SelectItem value="دولار">دولار</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input type="date" value={editFields.transaction_date} onChange={e => setEditFields(p => ({ ...p, transaction_date: e.target.value }))} />
            <Select value={editFields.debit_account_code} onValueChange={v => setEditFields(p => ({ ...p, debit_account_code: v }))} dir="rtl">
              <SelectTrigger><SelectValue placeholder="الحساب المدين" /></SelectTrigger>
              <SelectContent className="bg-background z-50 max-h-48">
                {accounts.map(a => <SelectItem key={a.account_code} value={a.account_code}>{a.account_code} - {a.account_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={editFields.credit_account_code} onValueChange={v => setEditFields(p => ({ ...p, credit_account_code: v }))} dir="rtl">
              <SelectTrigger><SelectValue placeholder="الحساب الدائن" /></SelectTrigger>
              <SelectContent className="bg-background z-50 max-h-48">
                {accounts.map(a => <SelectItem key={a.account_code} value={a.account_code}>{a.account_code} - {a.account_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1 bg-[#1A56DB] hover:bg-[#1648B8] text-white">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
              </Button>
              <Button variant="destructive" size="icon" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ━━━ Delete Confirmations ━━━ */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف القيد</AlertDialogTitle>
            <AlertDialogDescription>سيتم نقل القيد إلى سلة المحذوفات</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-[#DC2626] text-white hover:bg-[#B91C1C]">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "حذف"}
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف {selectedIds.size} قيد</AlertDialogTitle>
            <AlertDialogDescription>سيتم نقل القيود المحددة إلى سلة المحذوفات</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={handleBulkDelete} disabled={bulkDeleting} className="bg-[#DC2626] text-white hover:bg-[#B91C1C]">
              {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : `حذف ${selectedIds.size}`}
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* ━━ Journal Entry Modal ━━ */}
      <JournalEntryPopup
        open={showJournalEntry}
        onClose={() => setShowJournalEntry(false)}
        onSuccess={() => { setShowJournalEntry(false); fetchData(); }}
      />

      {/* ━━ Print View (portal to body) ━━ */}
      {showPrintView && createPortal(
        <div id="print-portal">
          <TransactionsPrintView
            company={companyInfo}
            transactions={printTransactions}
            totalDebit={totalDebit}
            totalCredit={totalCredit}
            isBalanced={isBalanced}
            filterLabel={filterLabel}
          />
        </div>,
        document.body
      )}
    </div>
  );
};

export default TransactionsPage;
