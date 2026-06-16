import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight, Loader2, Plus, Search, X, Trash2, RefreshCw, Printer,
  FileText, BookOpen, Save, User, Building2, Users, Check, DollarSign,
  ArrowUpDown, ChevronLeft, ChevronRight, Copy, Pencil, MoreVertical, Ban,
  SlidersHorizontal
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import DuplicateConfirmModal from "@/components/DuplicateConfirmModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import useFocusHighlight from "@/hooks/useFocusHighlight";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { multiWordMatchAny } from "@/lib/utils";
import { useSaveJournalVoucher } from "@/hooks/useSaveJournalVoucher";
import { ColumnVisibilityMenu } from "@/components/finance/shell/ColumnVisibilityMenu";
import { useColumnVisibility, type ColumnDef } from "@/components/finance/shell/useColumnVisibility";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";

interface JournalLine {
  id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
}

const FinanceJournalPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Phase 5J.1 — focus & highlight from ?focus=<voucher_id>
  const focusedVoucherId = useFocusHighlight();
  const { user } = useAuth();
  const { toast } = useToast();
  const { save: saveJournalVoucher, update: updateJournalVoucher, remove: removeJournalVoucher } = useSaveJournalVoucher();

  const [vouchers, setVouchers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("active");
  const [saving, setSaving] = useState(false);

  // Advanced filters
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterSubtype, setFilterSubtype] = useState("all");
  const [filterContactId, setFilterContactId] = useState("all");
  const [filterAmountMin, setFilterAmountMin] = useState("");
  const [filterAmountMax, setFilterAmountMax] = useState("");

  // Column visibility (notes, contact, subtype hideable)
  const columnDefs: ColumnDef[] = [
    { key: "ref_number", label: "الرقم", required: true },
    { key: "date", label: "التاريخ" },
    { key: "subtype", label: "النوع" },
    { key: "contact_name", label: "الجهة", defaultVisible: false },
    { key: "description", label: "الوصف" },
    { key: "notes", label: "الملاحظات", defaultVisible: false },
    { key: "amount", label: "المبلغ", required: true },
    { key: "status", label: "الحالة" },
    { key: "actions", label: "إجراءات", required: true },
  ];
  const colState = useColumnVisibility("finance-journal-page", columnDefs);
  const show = colState.isVisible;

  // Duplicate
  const [duplicateModal, setDuplicateModal] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<any>(null);

  const handleDuplicate = async (v: any) => {
    setDuplicateTarget(v);
    // Fetch voucher lines for journal
    if (user) {
      const { data: vLines } = await supabase.from("voucher_lines").select("*").eq("voucher_id", v.id).order("line_order");
      setDuplicateTarget({ ...v, _lines: vLines || [] });
    }
    setDuplicateModal(true);
  };

  const confirmDuplicate = () => {
    if (!duplicateTarget) return;
    const draftData = {
      _sourceRef: duplicateTarget.ref_number,
      description: duplicateTarget.description || "",
      notes: duplicateTarget.notes || "",
      subtype: duplicateTarget.subtype || "normal",
      contactId: duplicateTarget.contact_id || "",
      lines: (duplicateTarget._lines || []).map((l: any) => ({
        account_code: l.account_code,
        account_name: l.account_name,
        debit: l.debit || 0,
        credit: l.credit || 0,
        contact_id: l.contact_id || "",
        contact_name: l.contact_name || "",
      })),
    };
    localStorage.setItem("draft_journal_new", JSON.stringify(draftData));
    setDuplicateModal(false);
    navigate("/finance/journal/new?from_duplicate=true");
  };

  // Form
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formRefNumber, setFormRefNumber] = useState("");
  const [formSubtype, setFormSubtype] = useState("normal");
  const [formDescription, setFormDescription] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formContactId, setFormContactId] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [lines, setLines] = useState<JournalLine[]>([
    { id: "1", account_code: "", account_name: "", debit: 0, credit: 0 },
    { id: "2", account_code: "", account_name: "", debit: 0, credit: 0 },
  ]);

  // Quick add contact
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickType, setQuickType] = useState("عميل");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [accountSearches, setAccountSearches] = useState<Record<string, string>>({});
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const handleCancelVoucher = async (voucherId: string) => {
    if (!user) return;
    setCancelling(true);
    try {
      // ✅ Source of Truth: نمر عبر useSaveJournalVoucher.remove
      // يتكفل بحذف voucher_lines + transactions + voucher master + فحص الفترة المقفلة
      const result = await removeJournalVoucher(voucherId);
      if (!result.success) {
        toast({ title: "خطأ", description: result.error || "تعذر إلغاء السند", variant: "destructive" });
        return;
      }
      toast({ title: "تم إلغاء السند والقيود المرتبطة بنجاح ✅" });
      setCancelConfirmId(null);
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [vRes, aRes, cRes] = await Promise.all([
      supabase.from("vouchers").select("*").eq("user_id", user.id).eq("type", "journal").neq("status", "cancelled").order("created_at", { ascending: false }),
      supabase.from("accounts").select("account_code, account_name, account_type").eq("user_id", user.id).eq("is_active", true).order("account_code"),
      supabase.from("contacts").select("id, contact_name, contact_type, current_balance").eq("user_id", user.id).neq("is_archived", true),
    ]);
    setVouchers(vRes.data || []);
    setAccounts(aRes.data || []);
    setContacts(cRes.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId) {
      openVoucherForEdit(editId);
    } else if (searchParams.get("new") === "1") {
      setModalOpen(true);
    }
  }, [searchParams]);

  // Auto-generate ref number when modal opens
  const generateRefNumber = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("vouchers").select("ref_number").eq("user_id", user.id).eq("type", "journal").order("created_at", { ascending: false }).limit(1);
    const lastRef = (data || [])[0]?.ref_number || "";
    const match = lastRef.match(/(\d+)$/);
    const nextNum = match ? String(parseInt(match[1]) + 1).padStart(Math.max(match[1].length, 4), "0") : "0001";
    setFormRefNumber(`QV-${new Date().getFullYear()}-${nextNum}`);
  }, [user]);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
  const diff = Math.abs(totalDebit - totalCredit);

  // Helper to normalize contact types (handle both EN and AR values)
  const isCustomer = (c: any) => ["customer", "عميل", "زبون"].includes(c.contact_type);
  const isSupplier = (c: any) => ["supplier", "مورد"].includes(c.contact_type);
  const isEmployee = (c: any) => ["employee", "موظف"].includes(c.contact_type);

  const filteredContacts = useMemo(() => {
    if (!contactSearch) return contacts;
    return contacts.filter(c => multiWordMatchAny(contactSearch, c.contact_name));
  }, [contacts, contactSearch]);

  const addLine = () => {
    setLines(prev => [...prev, { id: String(Date.now()), account_code: "", account_name: "", debit: 0, credit: 0 }]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter(l => l.id !== id));
  };

  const updateLine = (id: string, field: keyof JournalLine, value: any) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      if (field === "account_code") {
        const acct = accounts.find(a => a.account_code === value);
        return { ...l, account_code: value, account_name: acct?.account_name || "" };
      }
      return { ...l, [field]: value };
    }));
  };

  const resetForm = () => {
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormRefNumber("");
    setFormSubtype("normal");
    setFormDescription("");
    setFormNotes("");
    setFormContactId("");
    setContactSearch("");
    setShowQuickAdd(false);
    setEditingVoucherId(null);
    setLines([
      { id: "1", account_code: "", account_name: "", debit: 0, credit: 0 },
      { id: "2", account_code: "", account_name: "", debit: 0, credit: 0 },
    ]);
    generateRefNumber();
  };

  const openVoucherForEdit = async (voucherId: string) => {
    const [vRes, lRes] = await Promise.all([
      supabase.from("vouchers").select("*").eq("id", voucherId).single(),
      supabase.from("voucher_lines").select("*").eq("voucher_id", voucherId).order("line_order"),
    ]);
    if (vRes.data) {
      const v = vRes.data;
      setFormDate(v.date || new Date().toISOString().split("T")[0]);
      setFormRefNumber(v.ref_number || "");
      setFormSubtype(v.subtype || "normal");
      setFormDescription(v.description || "");
      setFormNotes(v.notes || "");
      setFormContactId(v.contact_id || "");
      setEditingVoucherId(voucherId);
      if (lRes.data && lRes.data.length > 0) {
        setLines(lRes.data.map((l: any) => ({
          id: String(l.id),
          account_code: l.account_code || "",
          account_name: l.account_name || "",
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        })));
      }
      setModalOpen(true);
    }
  };

  const formatAmount = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const handleQuickAddContact = async () => {
    if (!user || !quickName.trim()) return;
    setQuickSaving(true);
    const { data, error } = await supabase.from("contacts").insert({
      user_id: user.id,
      contact_name: quickName.trim(),
      contact_type: quickType,
      phone: quickPhone || null,
    }).select("id, contact_name, contact_type, current_balance").single();
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else if (data) {
      setContacts(prev => [...prev, data]);
      setFormContactId(data.id);
      setShowQuickAdd(false);
      toast({ title: `✅ تم إضافة ${data.contact_name}` });
    }
    setQuickSaving(false);
  };

  const handleSave = async (status: "draft" | "posted") => {
    if (!user) return;
    setSaving(true);

    // ✅ Source of Truth: استدعاء useSaveJournalVoucher.save / update
    // - validation موحّدة (مدين=دائن، حسابات، وصف، فترة مقفلة)
    // - إنشاء voucher + voucher_lines + transactions atomic مع rollback
    // - currency=ILS و transaction_type=journal/opening_balance
    const payload = {
      ref_number: formRefNumber || undefined,
      date: formDate,
      subtype: (formSubtype as "normal" | "opening" | "adjustment" | "closing") || "normal",
      description: formDescription,
      notes: formNotes || null,
      contact_id: formContactId || null,
      lines: lines
        .filter(l => l.account_code && (Number(l.debit) > 0 || Number(l.credit) > 0))
        .map(l => ({
          account_code: l.account_code,
          account_name: l.account_name || null,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          contact_id: formContactId || null,
        })),
      mode: status,
    } as const;

    const result = editingVoucherId
      ? await updateJournalVoucher(editingVoucherId, payload)
      : await saveJournalVoucher(payload);

    if (!result.success) {
      toast({ title: "خطأ", description: result.error || "تعذر حفظ السند", variant: "destructive" });
      setSaving(false);
      return;
    }

    toast({
      title: status === "posted"
        ? `✅ تم ترحيل سند القيد ${result.ref_number || ""}`
        : "تم الحفظ كمسودة",
    });
    setSaving(false);
    setModalOpen(false);
    resetForm();
    fetchData();
  };

  const filtered = useMemo(() => {
    const contactName = (id: string | null | undefined) =>
      id ? (contacts.find((c) => c.id === id)?.contact_name || "") : "";
    return vouchers.filter(v => {
      if (searchQuery) {
        if (!multiWordMatchAny(
          searchQuery,
          v.ref_number,
          v.description,
          v.notes,
          contactName(v.contact_id),
        )) return false;
      }
      if (filterStatus === "active" && v.status === "cancelled") return false;
      if (filterStatus !== "all" && filterStatus !== "active" && v.status !== filterStatus) return false;
      if (filterDateFrom && (!v.date || v.date < filterDateFrom)) return false;
      if (filterDateTo && (!v.date || v.date > filterDateTo)) return false;
      if (filterSubtype !== "all" && (v.subtype || "normal") !== filterSubtype) return false;
      if (filterContactId !== "all" && (v.contact_id || "") !== filterContactId) return false;
      const amt = Number(v.amount || 0);
      if (filterAmountMin && amt < Number(filterAmountMin)) return false;
      if (filterAmountMax && amt > Number(filterAmountMax)) return false;
      return true;
    });
  }, [vouchers, contacts, searchQuery, filterStatus, filterDateFrom, filterDateTo, filterSubtype, filterContactId, filterAmountMin, filterAmountMax]);

  const totalAll = vouchers.filter(v => v.status === "posted").reduce((s, v) => s + Number(v.amount || 0), 0);
  const fmt = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  // formatAmount defined above

  const subtypeLabels: Record<string, string> = { normal: "عادي", opening: "افتتاحي", adjustment: "تسوية", closing: "إقفالي" };

  const PER_PAGE = 15;
  const [pageCurrent, setPageCurrent] = useState(1);
  const [sortKey, setSortKey] = useState<string>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedFiltered = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a: any, b: any) => {
      let av = a[sortKey], bv = b[sortKey];
      if (typeof av === "string") { av = av?.toLowerCase() || ""; bv = bv?.toLowerCase() || ""; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPagesCalc = Math.max(1, Math.ceil(sortedFiltered.length / PER_PAGE));
  const paged = sortedFiltered.slice((pageCurrent - 1) * PER_PAGE, pageCurrent * PER_PAGE);

  useEffect(() => { setPageCurrent(1); }, [searchQuery, filterStatus, filterDateFrom, filterDateTo, filterSubtype, filterContactId, filterAmountMin, filterAmountMax]);

  const activeAdvancedCount =
    (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0) +
    (filterSubtype !== "all" ? 1 : 0) + (filterContactId !== "all" ? 1 : 0) +
    (filterAmountMin ? 1 : 0) + (filterAmountMax ? 1 : 0);

  const clearAdvanced = () => {
    setFilterDateFrom(""); setFilterDateTo("");
    setFilterSubtype("all"); setFilterContactId("all");
    setFilterAmountMin(""); setFilterAmountMax("");
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
    setPageCurrent(1);
  };

  const SortHeader = ({ label, field }: { label: string; field: string }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-primary-foreground/80 transition-colors w-full">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? "opacity-100" : "opacity-30"}`} />
    </button>
  );

  const actionTabs: ActionTab[] = useMemo(() => ([
    {
      key: "general",
      label: "عام",
      groups: [
        { key: "new", label: "إنشاء", items: [
          { key: "new-voucher", label: "سند قيد جديد", icon: Plus, onClick: () => navigate("/finance/journal/new"), variant: "primary" as const },
        ]},
        { key: "data", label: "بيانات", items: [
          { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: fetchData },
        ]},
        { key: "export", label: "إخراج", items: [
          { key: "print", label: "طباعة", icon: Printer, onClick: () => window.print() },
        ]},
      ],
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [fetchData, navigate]);

  return (
    <FinanceShell
      title="القيود اليومية"
      subtitle="إدارة القيود المحاسبية اليدوية"
      breadcrumb={[
        { label: "المالية", href: "/accounting-center" },
        { label: "القيود اليومية" },
      ]}
      actionTabs={actionTabs}
    >
      <div className="space-y-5 max-w-[1500px] mx-auto" dir="rtl">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي السندات", value: vouchers.length, icon: FileText, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
          { label: "إجمالي المبالغ المرحّلة", value: fmt(totalAll), icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800" },
          { label: "مرحّل", value: vouchers.filter(v => v.status === "posted").length, icon: BookOpen, color: "text-blue-500", bg: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800" },
          { label: "مسودة", value: vouchers.filter(v => v.status === "draft").length, icon: FileText, color: "text-orange-500", bg: "bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800" },
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
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
          <Input
            placeholder="ابحث بالمرجع، الوصف..."
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
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1" />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs">
                <SlidersHorizontal className="h-3.5 w-3.5" /> فلاتر متقدمة
                {activeAdvancedCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    {activeAdvancedCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[360px] p-4 space-y-3" dir="rtl">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">فلاتر متقدمة</h4>
                {activeAdvancedCount > 0 && (
                  <button onClick={clearAdvanced} className="text-[11px] text-destructive hover:underline">
                    مسح الكل
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px]">من تاريخ</Label>
                  <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-8 mt-1 text-xs" />
                </div>
                <div>
                  <Label className="text-[11px]">إلى تاريخ</Label>
                  <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-8 mt-1 text-xs" />
                </div>
              </div>
              <div>
                <Label className="text-[11px]">نوع القيد</Label>
                <Select value={filterSubtype} onValueChange={setFilterSubtype}>
                  <SelectTrigger className="h-8 mt-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الأنواع</SelectItem>
                    <SelectItem value="normal">عادي</SelectItem>
                    <SelectItem value="opening">افتتاحي</SelectItem>
                    <SelectItem value="adjustment">تسوية</SelectItem>
                    <SelectItem value="closing">إقفالي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">جهة الاتصال</Label>
                <Select value={filterContactId} onValueChange={setFilterContactId}>
                  <SelectTrigger className="h-8 mt-1 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    <SelectItem value="all">جميع الجهات</SelectItem>
                    {contacts.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px]">أقل مبلغ</Label>
                  <Input type="number" value={filterAmountMin} onChange={e => setFilterAmountMin(e.target.value)} placeholder="0" className="h-8 mt-1 text-xs" />
                </div>
                <div>
                  <Label className="text-[11px]">أعلى مبلغ</Label>
                  <Input type="number" value={filterAmountMax} onChange={e => setFilterAmountMax(e.target.value)} placeholder="—" className="h-8 mt-1 text-xs" />
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <ColumnVisibilityMenu state={colState} />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px] rounded-xl text-xs">
              <SelectValue placeholder="حالة السند" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="active">بدون الملغية</SelectItem>
              <SelectItem value="all">جميع الحالات</SelectItem>
              <SelectItem value="posted">مرحّل</SelectItem>
              <SelectItem value="draft">مسودة</SelectItem>
              <SelectItem value="deferred">مؤجل</SelectItem>
              <SelectItem value="cancelled">ملغي فقط</SelectItem>
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
            <BookOpen className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">لا توجد سندات قيد بعد</h3>
          <p className="text-xs text-muted-foreground mb-4">أضف أول سند قيد لبدء التسجيل المحاسبي</p>
          <Button className="rounded-xl gap-2 shadow-md shadow-primary/20" onClick={() => navigate("/finance/journal/new")}>
            <Plus className="h-4 w-4" /> سند قيد جديد
          </Button>
        </div>
      )}

      {/* No results */}
      {!loading && vouchers.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <Search className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">لا توجد سندات تطابق البحث</p>
          <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setFilterStatus("all"); }}>مسح الفلاتر</Button>
        </div>
      )}

      {/* TABLE */}
      {!loading && paged.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  {show("ref_number") && <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الرقم" field="ref_number" /></th>}
                  {show("date") && <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="التاريخ" field="date" /></th>}
                  {show("subtype") && <th className="px-3 py-3 text-right text-xs font-semibold">النوع</th>}
                  {show("contact_name") && <th className="px-3 py-3 text-right text-xs font-semibold">الجهة</th>}
                  {show("description") && <th className="px-3 py-3 text-right text-xs font-semibold">الوصف</th>}
                  {show("notes") && <th className="px-3 py-3 text-right text-xs font-semibold">الملاحظات</th>}
                  {show("amount") && <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="المبلغ" field="amount" /></th>}
                  {show("status") && <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الحالة" field="status" /></th>}
                  {show("actions") && <th className="px-3 py-3 w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {paged.map((v, i) => {
                  const statusStyles: Record<string, string> = {
                    "posted": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                    "draft": "bg-muted text-muted-foreground",
                    "deferred": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                    "cancelled": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                  };
                  const dotColor: Record<string, string> = {
                    "posted": "bg-green-500",
                    "draft": "bg-muted-foreground",
                    "deferred": "bg-yellow-500",
                    "cancelled": "bg-red-500",
                  };
                  const statusLabelMap: Record<string, string> = { posted: "مرحّل", draft: "مسودة", deferred: "مؤجل", cancelled: "ملغي" };
                  return (
                    <tr
                      key={v.id}
                      data-focus-id={v.id}
                      className={`border-b border-border/50 transition-all duration-500 ${i % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/5 ${focusedVoucherId === v.id ? "!bg-primary/10 ring-2 ring-primary/60" : ""}`}
                    >
                      {show("ref_number") && <td className="px-3 py-3">
                        <button
                          className="text-primary hover:underline font-mono text-xs cursor-pointer bg-transparent border-none p-0"
                          onClick={() => openVoucherForEdit(v.id)}
                        >
                          {v.ref_number}
                        </button>
                      </td>}
                      {show("date") && <td className="px-3 py-3 text-xs text-foreground tabular-nums">{v.date}</td>}
                      {show("subtype") && <td className="px-3 py-3">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-muted text-muted-foreground">
                          {subtypeLabels[v.subtype] || "عادي"}
                        </span>
                      </td>}
                      {show("contact_name") && <td className="px-3 py-3 text-xs text-foreground truncate max-w-[180px]">{v.contact_name || "—"}</td>}
                      {show("description") && <td className="px-3 py-3 text-xs text-muted-foreground truncate max-w-[250px]">{v.description}</td>}
                      {show("notes") && <td className="px-3 py-3 text-xs text-muted-foreground truncate max-w-[250px]">{v.notes || "—"}</td>}
                      {show("amount") && <td className="px-3 py-3 text-sm font-bold tabular-nums text-foreground">{fmt(Number(v.amount || 0))}</td>}
                      {show("status") && <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusStyles[v.status] || "bg-muted text-muted-foreground"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColor[v.status] || "bg-muted-foreground"}`} />
                          {statusLabelMap[v.status] || v.status}
                        </span>
                      </td>}
                      {show("actions") && <td className="px-3 py-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="min-w-[140px]">
                            <DropdownMenuItem onClick={() => openVoucherForEdit(v.id)} className="gap-2 text-xs">
                              <Pencil className="h-3.5 w-3.5" /> تعديل
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDuplicate(v); }} className="gap-2 text-xs">
                              <Copy className="h-3.5 w-3.5" /> نسخ مشابه
                            </DropdownMenuItem>
                            {v.status !== "cancelled" && (
                              <DropdownMenuItem onClick={() => setCancelConfirmId(v.id)} className="gap-2 text-xs text-destructive focus:text-destructive">
                                <Ban className="h-3.5 w-3.5" /> إلغاء السند
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-primary/5 border-t-2 border-primary/20 font-bold text-sm">
                  <td colSpan={["ref_number","date","subtype","contact_name","description","notes"].filter(k => show(k)).length} className="px-3 py-3 text-right text-foreground">المجموع ({filtered.length} سند)</td>
                  {show("amount") && <td className="px-3 py-3 tabular-nums text-foreground">{fmt(filtered.reduce((s, v) => s + Number(v.amount || 0), 0))}</td>}
                  {show("status") && <td className="px-3 py-3" />}
                  {show("actions") && <td className="px-3 py-3" />}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {sortedFiltered.length > PER_PAGE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-muted/20">
              <p className="text-xs text-muted-foreground">
                عرض {Math.min((pageCurrent - 1) * PER_PAGE + 1, sortedFiltered.length)}–{Math.min(pageCurrent * PER_PAGE, sortedFiltered.length)} من {sortedFiltered.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={pageCurrent <= 1} onClick={() => setPageCurrent(p => p - 1)}>
                  <ChevronRight className="h-3.5 w-3.5 ml-1" /> السابق
                </Button>
                {Array.from({ length: totalPagesCalc }, (_, i) => i + 1).slice(
                  Math.max(0, pageCurrent - 3), Math.min(totalPagesCalc, pageCurrent + 2)
                ).map(n => (
                  <Button key={n} variant={pageCurrent === n ? "default" : "outline"} size="sm" className="rounded-lg h-8 w-8 text-xs p-0" onClick={() => setPageCurrent(n)}>
                    {n}
                  </Button>
                ))}
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={pageCurrent >= totalPagesCalc} onClick={() => setPageCurrent(p => p + 1)}>
                  التالي <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">صفحة {pageCurrent} من {totalPagesCalc}</p>
            </div>
          )}
        </div>
      )}

      {/* Full Screen Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto p-0">
          {/* Header */}
          <div className="p-4 text-white rounded-t-lg" style={{ background: "linear-gradient(135deg, #050F1E, #0A2342)" }}>
            <div className="flex items-center justify-between" dir="rtl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold">{editingVoucherId ? "تعديل سند قيد" : "سند قيد جديد"}</h2>
                  {formRefNumber && <p className="text-[11px] text-white/60">{formRefNumber}</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-5" dir="rtl">
            {/* Subtype Tabs */}
            <div className="flex gap-2">
              {(["normal", "opening", "adjustment", "closing"] as const).map(st => (
                <button key={st} onClick={() => setFormSubtype(st)} className={`px-4 py-2 rounded-full text-xs font-medium transition-all ${formSubtype === st ? "bg-[#0A2342] text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                  {subtypeLabels[st]}
                </button>
              ))}
            </div>

            {/* Date & Ref */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">التاريخ *</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">رقم السند</Label>
                <Input value={formRefNumber} readOnly className="mt-1 font-mono bg-muted/50 cursor-default" />
              </div>
            </div>

            {/* Contact */}
            <div>
              <Label className="text-xs">جهة الاتصال (اختياري)</Label>
              <Select value={formContactId} onValueChange={setFormContactId}>
                <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="اختر جهة الاتصال..." /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <div className="px-2 py-1.5 sticky top-0 bg-background z-10">
                    <div className="relative">
                      <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        className="w-full h-8 pr-8 pl-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="بحث..."
                        value={contactSearch}
                        onChange={e => setContactSearch(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  {filteredContacts.filter(isCustomer).length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-1.5 text-xs"><User className="h-3 w-3" /> الزبائن</SelectLabel>
                      {filteredContacts.filter(isCustomer).map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            <span>{c.contact_name}</span>
                            <span className={`text-[10px] font-mono ${Number(c.current_balance || 0) > 0 ? "text-emerald-600" : Number(c.current_balance || 0) < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                              ₪{formatAmount(Math.abs(Number(c.current_balance || 0)))}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {filteredContacts.filter(isSupplier).length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-1.5 text-xs"><Building2 className="h-3 w-3" /> الموردين</SelectLabel>
                      {filteredContacts.filter(isSupplier).map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            <span>{c.contact_name}</span>
                            <span className={`text-[10px] font-mono ${Number(c.current_balance || 0) > 0 ? "text-emerald-600" : Number(c.current_balance || 0) < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                              ₪{formatAmount(Math.abs(Number(c.current_balance || 0)))}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {filteredContacts.filter(isEmployee).length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-1.5 text-xs"><Users className="h-3 w-3" /> موظفون</SelectLabel>
                      {filteredContacts.filter(isEmployee).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>

              {/* Quick Add Contact */}
              {!showQuickAdd ? (
                <button
                  onClick={() => { setShowQuickAdd(true); setQuickName(""); setQuickPhone(""); setQuickType("عميل"); }}
                  className="mt-2 text-xs flex items-center gap-1 text-primary hover:underline"
                >
                  <Plus className="h-3 w-3" /> إضافة جهة اتصال جديدة
                </button>
              ) : (
                <div className="mt-2.5 rounded-xl border p-4 space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">إضافة جهة اتصال سريعة</span>
                    <button onClick={() => setShowQuickAdd(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">الاسم *</Label>
                      <Input value={quickName} onChange={e => setQuickName(e.target.value)} placeholder="اسم جهة الاتصال" className="mt-1 h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">النوع *</Label>
                      <Select value={quickType} onValueChange={setQuickType}>
                        <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="عميل">عميل</SelectItem>
                          <SelectItem value="مورد">مورد</SelectItem>
                          <SelectItem value="أخرى">أخرى</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">رقم الهاتف</Label>
                    <Input value={quickPhone} onChange={e => setQuickPhone(e.target.value)} placeholder="اختياري" className="mt-1 h-9" />
                  </div>
                  <Button
                    size="sm"
                    className="w-full gap-1.5"
                    disabled={!quickName.trim() || quickSaving}
                    onClick={handleQuickAddContact}
                  >
                    {quickSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    حفظ واختيار
                  </Button>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <Label className="text-xs">الوصف *</Label>
              <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="مثال: سلفة راتب - رهام حسون" className="mt-1" />
            </div>

            {/* Journal Lines Table */}
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground">
                    <th className="text-right py-2.5 px-3 w-10">#</th>
                    <th className="text-right py-2.5 px-3">الحساب</th>
                    <th className="text-right py-2.5 px-3 w-32">مدين ₪</th>
                    <th className="text-right py-2.5 px-3 w-32">دائن ₪</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={line.id} className="border-t">
                      <td className="py-2 px-3 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="py-2 px-3">
                        <Select value={line.account_code} onValueChange={v => updateLine(line.id, "account_code", v)}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="ابحث بالرقم أو الاسم..." /></SelectTrigger>
                          <SelectContent className="max-h-[250px]">
                            <div className="px-2 py-1.5 sticky top-0 bg-background z-10">
                              <div className="relative">
                                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <input
                                  className="w-full h-8 pr-8 pl-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                  placeholder="ابحث بالرقم أو الاسم..."
                                  value={accountSearches[line.id] || ""}
                                  onChange={e => setAccountSearches(prev => ({ ...prev, [line.id]: e.target.value }))}
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>
                            </div>
                            {accounts
                              .filter(a => {
                                const q = (accountSearches[line.id] || "");
                                if (!q.trim()) return true;
                                return multiWordMatchAny(q, a.account_code, a.account_name);
                              })
                              .map(a => (
                              <SelectItem key={a.account_code} value={a.account_code}>
                                <span className="font-mono text-muted-foreground ml-2">{a.account_code}</span>
                                {a.account_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-3">
                        <Input type="number" value={line.debit || ""} onChange={e => updateLine(line.id, "debit", Number(e.target.value) || 0)} className="h-9 font-mono text-xs" placeholder="0" />
                      </td>
                      <td className="py-2 px-3">
                        <Input type="number" value={line.credit || ""} onChange={e => updateLine(line.id, "credit", Number(e.target.value) || 0)} className="h-9 font-mono text-xs bg-red-50/50" placeholder="0" />
                      </td>
                      <td className="py-2 px-1">
                        <button onClick={() => removeLine(line.id)} className="p-1 hover:text-red-500 text-muted-foreground" disabled={lines.length <= 2}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={5} className="py-2 px-3">
                      <button onClick={addLine} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Plus className="h-3 w-3" />إضافة سطر
                      </button>
                    </td>
                  </tr>
                  <tr className="border-t font-bold bg-muted/30">
                    <td colSpan={2} className="py-2.5 px-3 text-xs">الإجمالي</td>
                    <td className="py-2.5 px-3 font-mono text-xs">₪{formatAmount(totalDebit)}</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-red-600">₪{formatAmount(totalCredit)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Balance Status */}
            <div className={`rounded-lg p-3 text-xs font-medium ${isBalanced ? "bg-emerald-50 text-emerald-700" : diff > 0 ? "bg-red-50 text-red-700" : "bg-muted text-muted-foreground"}`}>
              {isBalanced ? (
                <span>✓ متوازن — المدين = الدائن = ₪{formatAmount(totalDebit)}</span>
              ) : totalDebit > 0 || totalCredit > 0 ? (
                <span>✗ غير متوازن — فرق: ₪{formatAmount(diff)}</span>
              ) : (
                <span>أدخل المبالغ للتحقق من التوازن</span>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs">ملاحظات (اختياري)</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} className="mt-1" placeholder="ملاحظات إضافية..." />
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-background border-t p-4 flex items-center gap-2 flex-wrap" dir="rtl">
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>إلغاء</Button>
            <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving}>حفظ كمسودة</Button>
            <Button className="flex-1 bg-[#0A2342] hover:bg-[#0D1B2A]" onClick={() => handleSave("posted")} disabled={saving || !isBalanced}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
              ✓ {editingVoucherId ? "تحديث القيد" : "إنشاء القيد"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate Confirm Modal */}
      <DuplicateConfirmModal
        open={duplicateModal}
        onClose={() => setDuplicateModal(false)}
        onConfirm={confirmDuplicate}
        docType="journal"
        info={{
          description: duplicateTarget?.description,
          linesCount: duplicateTarget?._lines?.length,
          sourceRef: duplicateTarget?.ref_number,
        }}
      />

      {/* Cancel Confirmation */}
      <AlertDialog open={!!cancelConfirmId} onOpenChange={() => setCancelConfirmId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء السند</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من إلغاء هذا السند؟ سيتم إلغاء القيود المحاسبية المرتبطة أيضاً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelConfirmId && handleCancelVoucher(cancelConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancelling}
            >
              {cancelling ? "جاري الإلغاء..." : "إلغاء السند"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FinanceJournalPage;
