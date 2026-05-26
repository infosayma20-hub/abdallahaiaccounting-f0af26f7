import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { createPortal } from "react-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import { useSearchParams, useNavigate } from "react-router-dom";
import JournalEntryPopup from "@/components/JournalEntryPopup";
import TransactionsPrintView from "@/components/TransactionsPrintView";
import {
  ArrowRight, Loader2, RefreshCw, Pencil, Trash2, CheckSquare, X,
  RotateCcw, Archive, Search, ChevronLeft, ChevronRight as ChevronRightIcon,
  Download, Printer, Plus, CalendarDays, MoreVertical, Check, AlertTriangle,
  ExternalLink, Info, Lock
} from "lucide-react";
import { classifyTransaction } from "@/lib/transactionLinkage";
import DateRangeFilter from "@/components/ui/DateRangeFilter";
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
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useToast } from "@/hooks/use-toast";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import * as XLSX from "xlsx";
import { fmtDateDisplay, multiWordMatchAny } from "@/lib/utils";

import { setNextExportBranding } from "@/lib/excel-export";
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
  pos_currency_exchange: { label: "صرف عملة POS", bg: "bg-[#FEF9C3]", text: "text-[#854D0E]" },
  pos_expense:          { label: "مصروف POS",     bg: "bg-[#FEE2E2]", text: "text-[#991B1B]" },
  pos_meal:             { label: "وجبة موظف",     bg: "bg-[#FFEDD5]", text: "text-[#9A3412]" },
  pos_purchase:         { label: "مشتريات POS",   bg: "bg-[#EDE9FE]", text: "text-[#5B21B6]" },
  // تحويلات وأخرى
  cash_transfer:      { label: "تحويل صندوق",    bg: "bg-[#FEF3C7]", text: "text-[#92400E]" },
  bank_transfer:      { label: "تحويل بنكي",     bg: "bg-[#DBEAFE]", text: "text-[#1E40AF]" },
  exchange_diff:      { label: "فروق عملة",      bg: "bg-[#FEF9C3]", text: "text-[#854D0E]" },
  opening_balance:    { label: "رصيد افتتاحي",   bg: "bg-[#E0E7FF]", text: "text-[#3730A3]" },
  manual:             { label: "قيد يدوي",       bg: "bg-[#F3F4F6]", text: "text-[#374151]" },
  journal:            { label: "سند صرف",        bg: "bg-[#FEE2E2]", text: "text-[#991B1B]" },
  // عقود ومقاولات
  contract:           { label: "عقد مقاولة",     bg: "bg-[#FCE7F3]", text: "text-[#9D174D]" },
  contract_payment:   { label: "دفعة عقد",       bg: "bg-[#FCE7F3]", text: "text-[#9D174D]" },
  // ورشات ومناجر
  workshop_cost:      { label: "تكلفة ورشة",     bg: "bg-[#FEF3C7]", text: "text-[#92400E]" },
  workshop_payment:   { label: "دفعة ورشة",      bg: "bg-[#D1FAE5]", text: "text-[#065F46]" },
  workshop_receipt:   { label: "دفعة ورشة",      bg: "bg-[#D1FAE5]", text: "text-[#065F46]" },
  workshop_invoice:   { label: "فاتورة ورشة",    bg: "bg-[#D1FAE5]", text: "text-[#065F46]" },
  workshop_inventory: { label: "مخزون ورشة",     bg: "bg-[#FEF9C3]", text: "text-[#854D0E]" },
  workshop_revenue:   { label: "إيرادات ورشة",   bg: "bg-[#DBEAFE]", text: "text-[#1E40AF]" },
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

function AccountSearchSelect({ accounts, value, onChange, placeholder }: {
  accounts: Account[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find(a => a.account_code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal text-right" dir="rtl">
          {selected ? `${selected.account_code} - ${selected.account_name}` : <span className="text-muted-foreground">{placeholder}</span>}
          <ChevronRightIcon className="mr-auto h-4 w-4 shrink-0 opacity-50 rotate-90" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-[60]" align="start" dir="rtl">
        <Command dir="rtl">
          <CommandInput placeholder="ابحث عن حساب..." className="text-right" />
          <CommandList className="max-h-52">
            <CommandEmpty>لا توجد نتائج</CommandEmpty>
            {accounts.map(a => (
              <CommandItem
                key={a.account_code}
                value={`${a.account_code} ${a.account_name}`}
                onSelect={() => { onChange(a.account_code); setOpen(false); }}
                className="text-right"
              >
                <span className="font-mono text-[10px] text-muted-foreground ml-2">{a.account_code}</span>
                {a.account_name}
                {a.account_code === value && <Check className="mr-auto h-3.5 w-3.5 text-primary" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const TransactionsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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

  // Integrity banner
  const [showIntegrityBanner, setShowIntegrityBanner] = useState(() => {
    return localStorage.getItem("amwali_integrity_banner_dismissed") !== "1";
  });
  const dismissIntegrityBanner = () => {
    setShowIntegrityBanner(false);
    localStorage.setItem("amwali_integrity_banner_dismissed", "1");
  };

  const fetchData = async () => {
    if (!user || !dataOwnerId) return;
    setLoading(true);
    setError(null);
    try {
      const [txRes, accRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', dataOwnerId).eq('is_deleted', false).order('transaction_date', { ascending: false }),
        supabase.from('accounts').select('*').eq('user_id', dataOwnerId).order('account_code'),
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
    if (!user || !dataOwnerId) return;
    setLoadingTrash(true);
    try {
      const { data, error } = await supabase.from('transactions').select('*').eq('user_id', dataOwnerId).eq('is_deleted', true).order('transaction_date', { ascending: false });
      if (error) throw error;
      setDeletedTransactions(data || []);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoadingTrash(false);
    }
  };

  useEffect(() => { fetchData(); }, [user, dataOwnerId]);
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
      if (dateFrom && tx.transaction_date < dateFrom) return false;
      if (dateTo && tx.transaction_date > dateTo) return false;
      if (searchQuery.trim()) {
        if (!multiWordMatchAny(searchQuery, tx.description, tx.reference, getAccountName(tx.debit_account_code), getAccountName(tx.credit_account_code))) return false;
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
  }, [transactions, typeFilter, accountFilter, dateFilter, dateFrom, dateTo, searchQuery, sortField, sortAsc, accounts]);

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

  useEffect(() => { setCurrentPage(1); }, [typeFilter, accountFilter, dateFilter, dateFrom, dateTo, searchQuery, pageSize]);

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
    if (sortField !== field) return <span className="opacity-40 text-[10px]">⇅</span>;
    return <span className="text-white text-[10px] font-bold">{sortAsc ? "↑" : "↓"}</span>;
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
  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredTransactions.map(t => t.id)));
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

  // DB triggers now handle cascading automatically when is_deleted changes
  // No need for manual cancelLinkedVouchers/restoreLinkedVouchers

  const handleDelete = async () => {
    if (!editingTx) return;
    // ━━ حماية النزاهة المحاسبية ━━
    const linkage = classifyTransaction(editingTx);
    if (linkage.isLinked) {
      toast({
        title: "لا يمكن الحذف من دفتر اليومية",
        description: "هذا القيد مرتبط بمستند. اذهب للمستند الأصلي لإلغائه — سيقوم النظام بإنشاء قيد عكسي تلقائياً.",
        variant: "destructive",
      });
      setShowDeleteConfirm(false);
      return;
    }
    setDeleting(true);
    try {
      const { error } = await supabase.from('transactions').update({ is_deleted: true }).eq('id', editingTx.id);
      if (error) throw error;
      toast({ title: "تم نقل القيد اليدوي إلى سلة المحذوفات" });
      setEditingTx(null); setShowDeleteConfirm(false); fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setDeleting(false); }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      // ━━ حماية النزاهة المحاسبية: تصفية القيود اليدوية فقط ━━
      const allIds = Array.from(selectedIds);
      const manualIds = allIds.filter(id => {
        const tx = transactions.find(t => t.id === id);
        if (!tx) return false;
        return !classifyTransaction(tx).isLinked;
      });
      const blockedCount = allIds.length - manualIds.length;

      if (manualIds.length === 0) {
        toast({
          title: "لا يمكن الحذف من دفتر اليومية",
          description: "كل القيود المحددة مرتبطة بمستندات (فواتير/سندات). الرجاء الذهاب للمستند الأصلي لإلغائه.",
          variant: "destructive",
        });
        setShowBulkDeleteConfirm(false);
        setBulkDeleting(false);
        return;
      }

      const { error } = await supabase.from('transactions').update({ is_deleted: true }).in('id', manualIds);
      if (error) throw error;
      toast({
        title: `تم نقل ${manualIds.length} قيد يدوي إلى سلة المحذوفات`,
        description: blockedCount > 0 ? `تم تجاهل ${blockedCount} قيد مرتبط بمستندات (يجب إلغاؤها من المستند الأصلي).` : undefined,
      });
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
    setNextExportBranding({ title: "دفتر اليومية" });
    XLSX.writeFile(wb, `دفتر_اليومية_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handlePrint = () => {
    const rows = filteredTransactions.map(tx => `
      <tr>
        <td>${fmtDateDisplay(tx.transaction_date)}</td>
        <td>${tx.reference || "—"}</td>
        <td>${tx.description || "بدون وصف"}</td>
        <td>${tx.transaction_type === "journal" ? "يدوي" : tx.transaction_type === "auto" ? "آلي" : tx.transaction_type || ""}</td>
        <td class="text-left font-mono text-primary">₪${tx.amount?.toFixed(2)}</td>
        <td class="text-left font-mono text-green">₪${tx.amount?.toFixed(2)}</td>
      </tr>
    `).join("");

    const contentHtml = `
      <div class="print-header">
        <div>
          <div class="company-name">${settings.company_name || "الشركة"}</div>
          <div class="report-title">تقرير الحركات المحاسبية</div>
        </div>
        <div class="print-date">${filterLabel}</div>
      </div>
      <div class="summary-row">
        <div class="summary-card"><div class="summary-label">إجمالي القيود</div><div class="summary-value">${filteredTransactions.length}</div></div>
        <div class="summary-card"><div class="summary-label">المدين</div><div class="summary-value text-primary">₪${totalDebit.toFixed(2)}</div></div>
        <div class="summary-card"><div class="summary-label">الدائن</div><div class="summary-value green">₪${totalCredit.toFixed(2)}</div></div>
        <div class="summary-card"><div class="summary-label">التوازن</div><div class="summary-value ${isBalanced ? 'green' : 'red'}">${isBalanced ? "متطابق ✅" : `فرق: ₪${Math.abs(totalDebit - totalCredit).toFixed(2)}`}</div></div>
      </div>
      <table>
        <thead><tr>
          <th>التاريخ</th><th>المرجع</th><th>الوصف</th><th>النوع</th><th>مدين ₪</th><th>دائن ₪</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="4" style="text-align:right">المجموع (${filteredTransactions.length} قيد)</td>
          <td class="text-left font-mono font-bold text-primary">₪${totalDebit.toFixed(2)}</td>
          <td class="text-left font-mono font-bold text-green">₪${totalCredit.toFixed(2)}</td>
        </tr></tfoot>
      </table>
    `;

    import("@/lib/printUtils").then(({ printReport }) => {
      printReport({
        title: "تقرير الحركات المحاسبية",
        companyName: settings.company_name || "الشركة",
        contentHtml,
      });
    });
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
    <div className="p-4 md:p-6 pb-24 space-y-5" dir="rtl">
      <PageHeader title="تقرير الحركات المحاسبية" breadcrumb={["المحاسبة", "الحركات المحاسبية"]} />

      {/* ━━ شريط تنبيه نزاهة دفتر اليومية ━━ */}
      {showIntegrityBanner && (
        <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="rounded-full bg-primary/10 p-2 flex-shrink-0">
            <Info className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 text-xs text-foreground leading-relaxed">
            القيود المرتبطة بمستندات تُلغى من المستند الأصلي فقط <span className="font-semibold">(حسب IFRS)</span>.
          </div>
          <button
            onClick={dismissIntegrityBanner}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/50 transition-colors flex-shrink-0"
            aria-label="إغلاق"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {filteredTransactions.length} قيد • <span className="text-primary font-medium">مدين: ₪{totalDebit.toFixed(2)}</span> • <span className="text-success font-medium">دائن: ₪{totalCredit.toFixed(2)}</span>
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs" onClick={() => setShowTrash(true)}>
            <Archive className="w-3.5 h-3.5" /> المحذوفات
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs" onClick={handleExportExcel}>
            <Download className="w-3.5 h-3.5" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs" onClick={handlePrint}>
            <Printer className="w-3.5 h-3.5" /> طباعة
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي القيود", value: filteredTransactions.length, icon: CalendarDays, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
          { label: "المدين", value: `₪${totalDebit.toFixed(2)}`, icon: ArrowRight, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
          { label: "الدائن", value: `₪${totalCredit.toFixed(2)}`, icon: ArrowRight, color: "text-emerald-500", bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800" },
          { label: "التوازن", value: isBalanced ? "✅ متطابق" : `⚠️ فرق: ₪${Math.abs(totalDebit - totalCredit).toFixed(2)}`, icon: CheckSquare, color: isBalanced ? "text-emerald-500" : "text-destructive", bg: isBalanced ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800" : "bg-destructive/5 border-destructive/10" },
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
              placeholder="ابحث بالمرجع، الوصف، الحساب..."
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

          {/* Type pills + date/account filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
              <button onClick={() => setTypeFilter("all")} className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${typeFilter === "all" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                الكل
              </button>
              {uniqueTypes.slice(0, 8).map(t => (
                <button key={t} onClick={() => setTypeFilter(t)} className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${typeFilter === t ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                  {typeBadgeConfig[t]?.label || t}
                </button>
              ))}
            </div>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[140px] rounded-xl text-xs h-9">
                <SelectValue placeholder="الفترة" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="all">كل الفترات</SelectItem>
                <SelectItem value="today">اليوم</SelectItem>
                <SelectItem value="this_week">هذا الأسبوع</SelectItem>
                <SelectItem value="this_month">هذا الشهر</SelectItem>
                <SelectItem value="last_month">الشهر السابق</SelectItem>
              </SelectContent>
            </Select>
            <DateRangeFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={(v) => { setDateFrom(v); setDateFilter("all"); }}
              onDateToChange={(v) => { setDateTo(v); setDateFilter("all"); }}
              onClear={() => { setDateFrom(""); setDateTo(""); }}
              compact
            />
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="w-[180px] rounded-xl text-xs h-9">
                <SelectValue placeholder="كل الحسابات" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50 max-h-48">
                <SelectItem value="all">كل الحسابات</SelectItem>
                {usedAccounts.map(a => (
                  <SelectItem key={a.account_code} value={a.account_code}>{a.account_code} - {a.account_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground mr-auto">{filteredTransactions.length} قيد</span>
          </div>
        </CardContent>
      </Card>

      {/* Bulk selection bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-primary/5 border border-primary/20 rounded-xl">
          <div className="flex items-center gap-2">
            <span className="text-sm text-primary font-medium">تم تحديد {selectedIds.size} قيد</span>
            {selectedIds.size < filteredTransactions.length && (
              <Button variant="ghost" size="sm" className="text-primary underline underline-offset-2 px-1 h-auto py-0" onClick={selectAllFiltered}>
                تحديد الكل ({filteredTransactions.length})
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-primary" onClick={() => setSelectedIds(new Set())}>إلغاء التحديد</Button>
            <Button variant="destructive" size="sm" className="gap-1.5 rounded-xl" onClick={() => setShowBulkDeleteConfirm(true)}>
              <Trash2 className="h-3.5 w-3.5" /> حذف ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-center py-16">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-2" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={fetchData}>إعادة المحاولة</Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filteredTransactions.length === 0 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Search className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground mb-3">لا توجد قيود مطابقة</p>
          <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setTypeFilter("all"); setAccountFilter("all"); setDateFilter("all"); setDateFrom(""); setDateTo(""); }}>مسح الفلاتر</Button>
        </div>
      )}

      {/* TABLE */}
      {!loading && !error && paginatedTransactions.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed border-collapse">
              <colgroup>
                <col className="w-[3%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[30%]" />
                <col className="w-[10%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[4%]" />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#1B2559] text-white">
                  <th className="px-2 py-3.5 text-center">
                    <Checkbox
                      checked={selectedIds.size === paginatedTransactions.length && paginatedTransactions.length > 0}
                      onCheckedChange={toggleSelectAll}
                      className="border-white/40 data-[state=checked]:bg-white data-[state=checked]:text-[#1B2559]"
                    />
                  </th>
                  <th className="px-3 py-3.5 text-right text-[11px] font-semibold cursor-pointer select-none hover:bg-white/10 transition-colors" onClick={() => toggleSort("date")}>
                    <div className="flex items-center gap-1.5">التاريخ <SortIcon field="date" /></div>
                  </th>
                  <th className="px-3 py-3.5 text-right text-[11px] font-semibold">المرجع</th>
                  <th className="px-3 py-3.5 text-right text-[11px] font-semibold">الوصف / الحسابات</th>
                  <th className="px-3 py-3.5 text-right text-[11px] font-semibold">النوع</th>
                  <th className="px-3 py-3.5 text-right text-[11px] font-semibold cursor-pointer select-none hover:bg-white/10 transition-colors" onClick={() => toggleSort("debit")}>
                    <div className="flex items-center justify-end gap-1.5"><SortIcon field="debit" /> مدين ₪</div>
                  </th>
                  <th className="px-3 py-3.5 text-right text-[11px] font-semibold cursor-pointer select-none hover:bg-white/10 transition-colors" onClick={() => toggleSort("credit")}>
                    <div className="flex items-center justify-end gap-1.5"><SortIcon field="credit" /> دائن ₪</div>
                  </th>
                  <th className="px-3 py-3.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.map((tx, i) => {
                  const isExpanded = expandedIds.has(tx.id);
                  const isSelected = selectedIds.has(tx.id);
                  return (
                    <tr key={tx.id} className="contents">
                      <tr
                        className={`group border-b border-border/50 transition-colors cursor-pointer ${i % 2 === 0 ? "bg-background" : "bg-muted/20"} ${isSelected ? "bg-primary/5" : ""} hover:bg-primary/5`}
                        onClick={() => toggleExpand(tx.id)}
                      >
                        <td className="px-2 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(tx.id)} />
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-xs text-foreground tabular-nums">{formatDate(tx.transaction_date)}</span>
                        </td>
                        <td className="px-3 py-3 overflow-hidden">
                          <button
                            onClick={e => { e.stopPropagation(); openEdit(tx); }}
                            title={tx.reference || ""}
                            className="text-primary hover:underline font-mono text-xs cursor-pointer bg-transparent border-none p-0 truncate block max-w-full text-right"
                          >
                            {tx.reference || "—"}
                          </button>
                        </td>
                        <td className="px-3 py-3 overflow-hidden max-w-0">
                          <div className="flex items-center gap-1.5 min-w-0" title={tx.description || ""}>
                            <ChevronRightIcon className={`w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`} />
                            <span className="text-sm text-foreground font-medium truncate">{tx.description || "بدون وصف"}</span>
                            {(() => {
                              const lk = classifyTransaction(tx);
                              return (
                                <span
                                  className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${
                                    lk.isLinked
                                      ? "bg-primary/10 text-primary border border-primary/20"
                                      : "bg-muted text-muted-foreground border border-border"
                                  }`}
                                  title={lk.isLinked ? "قيد مرتبط بمستند — للتعديل اذهب للمستند الأصلي" : "قيد يدوي قابل للتعديل والحذف"}
                                >
                                  {lk.label}
                                </span>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <TypeBadge type={tx.transaction_type} />
                        </td>
                        <td className="px-3 py-3 text-left">
                          <span className="font-mono font-semibold text-sm text-primary">₪{tx.amount?.toFixed(2)}</span>
                        </td>
                        <td className="px-3 py-3 text-left">
                          <span className="font-mono font-semibold text-sm text-emerald-500">₪{tx.amount?.toFixed(2)}</span>
                        </td>
                        <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                          {(() => {
                            const lk = classifyTransaction(tx);
                            return (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                    <MoreVertical className="w-4 h-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {lk.isLinked ? (
                                    <>
                                      {lk.navigatePath && (
                                        <DropdownMenuItem onClick={() => navigate(lk.navigatePath!)}>
                                          <ExternalLink className="h-4 w-4 ml-2" /> الذهاب للمستند الأصلي
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem onClick={() => openEdit(tx)}>
                                        <Search className="h-4 w-4 ml-2" /> عرض التفاصيل
                                      </DropdownMenuItem>
                                      <DropdownMenuItem disabled className="text-muted-foreground/60 cursor-not-allowed">
                                        <Lock className="h-4 w-4 ml-2" /> محمي — قيد مرتبط
                                      </DropdownMenuItem>
                                    </>
                                  ) : (
                                    <>
                                      <DropdownMenuItem onClick={() => openEdit(tx)}>
                                        <Pencil className="h-4 w-4 ml-2" /> تعديل
                                      </DropdownMenuItem>
                                      <DropdownMenuItem className="text-destructive" onClick={() => { setEditingTx(tx); setShowDeleteConfirm(true); }}>
                                        <Trash2 className="h-4 w-4 ml-2" /> حذف
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            );
                          })()}
                        </td>
                      </tr>

                      {/* Expanded detail lines */}
                      {isExpanded && (
                        <>
                          <tr className="bg-muted/30 border-b border-border/30">
                            <td />
                            <td />
                            <td />
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2 pr-8">
                                <span className="text-muted-foreground text-lg leading-none">├</span>
                                <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{tx.debit_account_code}</span>
                                <span className="text-foreground text-xs">{getAccountName(tx.debit_account_code)}</span>
                              </div>
                            </td>
                            <td />
                            <td className="px-3 py-2 text-left">
                              <span className="font-mono text-xs font-semibold text-primary">₪{tx.amount?.toFixed(2)}</span>
                            </td>
                            <td />
                            <td />
                          </tr>
                          <tr className="bg-muted/30 border-b border-border/50">
                            <td />
                            <td />
                            <td />
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2 pr-8">
                                <span className="text-muted-foreground text-lg leading-none">└</span>
                                <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{tx.credit_account_code}</span>
                                <span className="text-foreground text-xs">{getAccountName(tx.credit_account_code)}</span>
                              </div>
                            </td>
                            <td />
                            <td />
                            <td className="px-3 py-2 text-left">
                              <span className="font-mono text-xs font-semibold text-emerald-500">₪{tx.amount?.toFixed(2)}</span>
                            </td>
                            <td />
                          </tr>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-primary/5 border-t-2 border-primary/20 font-bold text-sm">
                  <td colSpan={3} className="px-3 py-3 text-right text-foreground">المجموع ({filteredTransactions.length} قيد)</td>
                  <td colSpan={2} className="px-3 py-3">
                    {isBalanced
                      ? <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full dark:bg-emerald-900/30">✅ متطابق</span>
                      : <span className="text-xs font-bold text-destructive bg-destructive/10 px-2 py-1 rounded-full">⚠️ فرق: ₪{Math.abs(totalDebit - totalCredit).toFixed(2)}</span>
                    }
                  </td>
                  <td className="px-3 py-3 text-left">
                    <span className="font-mono font-bold text-base text-primary">₪{totalDebit.toFixed(2)}</span>
                  </td>
                  <td className="px-3 py-3 text-left">
                    <span className="font-mono font-bold text-base text-emerald-500">₪{totalCredit.toFixed(2)}</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {filteredTransactions.length > pageSize && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-muted/20">
              <p className="text-xs text-muted-foreground">
                عرض {Math.min((currentPage - 1) * pageSize + 1, filteredTransactions.length)}–{Math.min(currentPage * pageSize, filteredTransactions.length)} من {filteredTransactions.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronRightIcon className="h-3.5 w-3.5 ml-1" /> السابق
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pg: number;
                  if (totalPages <= 5) pg = i + 1;
                  else if (currentPage <= 3) pg = i + 1;
                  else if (currentPage >= totalPages - 2) pg = totalPages - 4 + i;
                  else pg = currentPage - 2 + i;
                  return (
                    <Button key={pg} variant={currentPage === pg ? "default" : "outline"} size="sm" className="rounded-lg h-8 w-8 text-xs p-0" onClick={() => setCurrentPage(pg)}>
                      {pg}
                    </Button>
                  );
                })}
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                  التالي <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">صفحة {currentPage} من {totalPages}</p>
            </div>
          )}
        </div>
      )}

      {/* ━━━ Edit Dialog ━━━ */}
      <Dialog open={!!editingTx && !showDeleteConfirm} onOpenChange={(o) => !o && setEditingTx(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingTx && classifyTransaction(editingTx).isLinked ? "تفاصيل القيد (للقراءة)" : "تعديل القيد"}
            </DialogTitle>
          </DialogHeader>
          {editingTx && (() => {
            const linkage = classifyTransaction(editingTx);
            const readonly = linkage.isLinked;
            return (
              <div className="space-y-3">
                {readonly && (
                  <div className="flex items-start gap-2 rounded-xl bg-primary/5 border border-primary/20 p-3">
                    <Lock className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-foreground leading-relaxed flex-1">
                      <span className="font-semibold">قيد محمي ({linkage.label}).</span>{" "}
                      للتعديل أو الإلغاء، اذهب للمستند الأصلي — سيقوم النظام بإنشاء قيد عكسي تلقائياً.
                    </div>
                  </div>
                )}
                <Input
                  value={editFields.description}
                  onChange={e => setEditFields(p => ({ ...p, description: e.target.value }))}
                  placeholder="الوصف" dir="rtl"
                  disabled={readonly}
                />
                <div className="flex gap-2">
                  <Input
                    type="number" value={editFields.amount}
                    onChange={e => setEditFields(p => ({ ...p, amount: e.target.value }))}
                    placeholder="المبلغ" className="flex-1"
                    disabled={readonly}
                  />
                  <Select value={editFields.currency} onValueChange={v => setEditFields(p => ({ ...p, currency: v }))} dir="rtl" disabled={readonly}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      <SelectItem value="شيكل">شيكل</SelectItem>
                      <SelectItem value="دينار">دينار</SelectItem>
                      <SelectItem value="دولار">دولار</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="date" value={editFields.transaction_date}
                  onChange={e => setEditFields(p => ({ ...p, transaction_date: e.target.value }))}
                  disabled={readonly}
                />
                {readonly ? (
                  <>
                    <div className="rounded-xl border border-border p-2 bg-muted/30">
                      <div className="text-[10px] text-muted-foreground mb-1">الحساب المدين</div>
                      <div className="text-sm text-foreground">
                        <span className="font-mono text-xs text-muted-foreground ml-2">{editFields.debit_account_code}</span>
                        {getAccountName(editFields.debit_account_code)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border p-2 bg-muted/30">
                      <div className="text-[10px] text-muted-foreground mb-1">الحساب الدائن</div>
                      <div className="text-sm text-foreground">
                        <span className="font-mono text-xs text-muted-foreground ml-2">{editFields.credit_account_code}</span>
                        {getAccountName(editFields.credit_account_code)}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <AccountSearchSelect
                      accounts={accounts}
                      value={editFields.debit_account_code}
                      onChange={v => setEditFields(p => ({ ...p, debit_account_code: v }))}
                      placeholder="الحساب المدين"
                    />
                    <AccountSearchSelect
                      accounts={accounts}
                      value={editFields.credit_account_code}
                      onChange={v => setEditFields(p => ({ ...p, credit_account_code: v }))}
                      placeholder="الحساب الدائن"
                    />
                  </>
                )}
                <div className="flex gap-2 pt-2">
                  {readonly ? (
                    <>
                      {linkage.navigatePath && (
                        <Button onClick={() => { navigate(linkage.navigatePath!); setEditingTx(null); }} className="flex-1 gap-2">
                          <ExternalLink className="h-4 w-4" /> الذهاب للمستند الأصلي
                        </Button>
                      )}
                      <Button variant="outline" onClick={() => setEditingTx(null)} className={linkage.navigatePath ? "" : "flex-1"}>
                        إغلاق
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={handleSave} disabled={saving} className="flex-1">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
                      </Button>
                      <Button variant="destructive" size="icon" onClick={() => setShowDeleteConfirm(true)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
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
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
            <AlertDialogAction onClick={handleBulkDelete} disabled={bulkDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
