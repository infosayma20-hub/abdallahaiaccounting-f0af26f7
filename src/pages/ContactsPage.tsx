import { useState, useEffect, useMemo } from "react";
import DateRangeFilter from "@/components/ui/DateRangeFilter";
import { multiWordMatchAny } from "@/lib/utils";
import {
  Loader2, RefreshCw, Plus, Search, MoreVertical, FileText, Pencil, Trash2, Eye,
  Download, Settings, Bell, AlertTriangle, Users, ShoppingBag, Filter, X,
  Archive, ArchiveRestore, Printer, ShoppingCart, MessageCircle, Instagram, Hand,
  UserPlus, Truck, ContactRound, Columns3,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { fetchManyContactBalances } from "@/lib/contact-balance";
import { FinanceShell, ActionPane, ColumnVisibilityMenu, useColumnVisibility } from "@/components/finance/shell";
import type { ActionTab, ColumnDef } from "@/components/finance/shell";
import EmptyState from "@/components/EmptyState";

interface Contact {
  id: string;
  contact_name: string;
  contact_type: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_number: string | null;
  linked_account_code: string | null;
  notes: string | null;
  is_active: boolean | null;
  contact_class: string | null;
  contact_segment: string | null;
  sales_rep_id: string | null;
  credit_limit: number | null;
  current_balance: number | null;
  purchase_limit: number | null;
  payment_terms_days: number | null;
  early_pay_discount: number | null;
  industry: string | null;
  company_size: string | null;
  website: string | null;
  total_sales: number | null;
  total_purchases: number | null;
  total_paid: number | null;
  overdue_amount: number | null;
  last_transaction_date: string | null;
  avg_payment_days: number | null;
  is_archived: boolean | null;
  archived_at: string | null;
  created_at: string | null;
}

interface ContactAlert {
  id: string;
  contact_id: string;
  alert_type: string;
  amount: number | null;
  days_overdue: number | null;
  is_read: boolean;
  contact_name: string | null;
  created_at: string;
}

const classConfig: Record<string, { color: string; bg: string; label: string }> = {
  A: { color: "text-emerald-700", bg: "bg-emerald-100 dark:bg-emerald-900/40", label: "مميز" },
  B: { color: "text-blue-700", bg: "bg-blue-100 dark:bg-blue-900/40", label: "جيد" },
  C: { color: "text-amber-700", bg: "bg-amber-100 dark:bg-amber-900/40", label: "عادي" },
  D: { color: "text-red-700", bg: "bg-red-100 dark:bg-red-900/40", label: "مخاطرة" },
};

const contactTypeOptions = [
  { value: "عميل", label: "زبون" },
  { value: "مورد", label: "مورد" },
  { value: "عميل ومورد", label: "زبون ومورد" },
];

const CONTACT_COLUMNS: ColumnDef[] = [
  { key: "name", label: "الاسم", required: true },
  { key: "type", label: "النوع" },
  { key: "source", label: "المصدر", defaultVisible: false },
  { key: "class", label: "الفئة" },
  { key: "balance", label: "الرصيد", required: true },
  { key: "limit", label: "السقف" },
  { key: "overdue", label: "المتأخر" },
  { key: "last_tx", label: "آخر حركة" },
  { key: "payment_days", label: "أيام الدفع", defaultVisible: false },
  { key: "actions", label: "إجراءات", required: true },
];

const sourceConfig: Record<string, { label: string; icon: typeof Hand }> = {
  "e-commerce": { label: "متجر إلكتروني", icon: ShoppingCart },
  whatsapp:    { label: "واتساب",       icon: MessageCircle },
  instagram:   { label: "انستغرام",     icon: Instagram },
  manual:      { label: "يدوي",         icon: Hand },
};

const alertConfig: Record<string, { icon: typeof AlertTriangle; color: string; bg: string; title: string }> = {
  credit_limit_exceeded: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30", title: "تجاوز سقف الائتمان" },
  invoice_overdue_30: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", title: "فاتورة متأخرة 30 يوم" },
  invoice_overdue_60: { icon: AlertTriangle, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30", title: "فاتورة متأخرة 60 يوم" },
  invoice_overdue_90: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30", title: "فاتورة متأخرة 90 يوم" },
  limit_near_80pct: { icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30", title: "اقتراب من السقف" },
};

// CreditBar component
const CreditBar = ({ balance, limit }: { balance: number; limit: number }) => {
  const absBalance = Math.abs(balance);
  const isNeg = balance < 0;
  
  if (!limit || limit <= 0) {
    // No credit limit — just show balance
    if (balance === 0) return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <span className={`text-xs font-semibold tabular-nums ${isNeg ? 'text-red-600' : 'text-emerald-600'}`}>
        {isNeg ? '-' : ''}₪{absBalance.toLocaleString()}
      </span>
    );
  }
  
  const pct = (absBalance / limit) * 100;
  return (
    <div className="space-y-0.5">
      <span className={`text-xs font-semibold tabular-nums ${isNeg ? 'text-red-600' : pct > 100 ? 'text-red-600' : pct > 80 ? 'text-amber-600' : 'text-foreground'}`}>
        {isNeg ? '-' : ''}₪{absBalance.toLocaleString()}
      </span>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground">من ₪{limit.toLocaleString()}</span>
    </div>
  );
};

// ClassBadge component
const ClassBadge = ({ cls }: { cls: string }) => {
  const config = classConfig[cls] || classConfig.C;
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${config.bg} ${config.color}`}>
      {cls}
    </span>
  );
};

const ContactsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterClass, setFilterClass] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [adding, setAdding] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [editing, setEditing] = useState(false);
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [archiveContact, setArchiveContact] = useState<Contact | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [alerts, setAlerts] = useState<ContactAlert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [overdueContact, setOverdueContact] = useState<Contact | null>(null);
  const [overdueDialogOpen, setOverdueDialogOpen] = useState(false);
  const [overdueInvoices, setOverdueInvoices] = useState<any[]>([]);
  const [overdueLoading, setOverdueLoading] = useState(false);
  const [newContact, setNewContact] = useState({
    name: "", type: "عميل", phone: "", email: "", address: "", tax_number: "",
    contact_class: "C", credit_limit: "", payment_terms_days: "30", industry: "", website: "", notes: "",
    opening_balance: "", balance_direction: "debit" as "debit" | "credit",
  });

  // Set filter from URL params
  useEffect(() => {
    const typeParam = searchParams.get("type");
    if (typeParam === "customer") setFilterType("عميل");
    else if (typeParam === "supplier") setFilterType("مورد");
  }, [searchParams]);

  // Auto-open edit dialog when ?edit=<contact_id> is present
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || contacts.length === 0) return;
    const target = contacts.find((c) => c.id === editId);
    if (target) {
      setEditData({ ...target });
      setEditContact(target);
    }
  }, [searchParams, contacts]);

  // Fetch overdue invoices when dialog opens
  useEffect(() => {
    if (!overdueDialogOpen || !overdueContact || !user) return;
    setOverdueLoading(true);
    supabase.from("invoices")
      .select("id, invoice_number, due_date, remaining_amount")
      .eq("user_id", user.id)
      .eq("contact_name", overdueContact.contact_name)
      .not("due_date", "is", null)
      .lt("due_date", new Date().toISOString().split("T")[0])
      .gt("remaining_amount", 0)
      .order("due_date", { ascending: true })
      .then(({ data }) => { setOverdueInvoices(data || []); setOverdueLoading(false); });
  }, [overdueDialogOpen, overdueContact, user]);

  const fetchContacts = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: contactData, error }, { data: txData }] = await Promise.all([
        supabase.from('contacts').select('*').eq('user_id', user.id).order('contact_name'),
        supabase.from('transactions').select('id, amount, debit_account_code, credit_account_code, contact_id, transaction_date, description')
          .eq('user_id', user.id).eq('is_deleted', false),
      ]);
      if (error) throw error;
      const txs = txData || [];
      setTransactions(txs);

      // Phase 5G — Single Source of Truth.
      // Balances now come from the canonical `get_contact_balance` RPC
      // (same source the Account Statement uses). The local AR/AP/2115/1146
      // computation below is kept ONLY for `last_transaction_date` tracking.
      // We no longer trust `contacts.current_balance` for display.
      const lastTxMap: Record<string, string> = {};
      for (const tx of txs) {
        if (!tx.contact_id) continue;
        // Track last transaction date
        if (!lastTxMap[tx.contact_id] || tx.transaction_date > lastTxMap[tx.contact_id]) {
          lastTxMap[tx.contact_id] = tx.transaction_date;
        }
      }

      // Fetch authoritative balances in parallel via RPC (single source).
      const ids = (contactData || []).map((c: any) => c.id);
      const balanceMap = await fetchManyContactBalances(ids);

      // Enrich contacts: balance from RPC overrides any stale stored value.
      const enriched = (contactData || []).map((c: any) => ({
        ...c,
        current_balance: balanceMap[c.id] ?? c.current_balance ?? 0,
        last_transaction_date: lastTxMap[c.id] || c.last_transaction_date,
      }));
      setContacts(enriched);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchAlerts = async () => {
    if (!user) return;
    const { data } = await supabase.from('contact_alerts').select('*').eq('user_id', user.id).eq('is_read', false).order('created_at', { ascending: false }).limit(50);
    setAlerts((data as any[]) || []);
  };

  useEffect(() => { fetchContacts(); fetchAlerts(); }, [user]);

  // Real-time alerts
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`crm-alerts-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'contact_alerts',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        const alert = payload.new as ContactAlert;
        setAlerts(prev => [alert, ...prev]);
        const config = alertConfig[alert.alert_type];
        if (config && Notification.permission === 'granted') {
          new Notification(config.title, {
            body: `${alert.contact_name || ''} — ₪${alert.amount?.toLocaleString() || 0}`,
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleAddContact = async () => {
    if (!newContact.name.trim() || !user) return;
    setAdding(true);
    try {
      const { error } = await supabase.from('contacts').insert({
        user_id: user.id,
        contact_name: newContact.name.trim(),
        contact_type: newContact.type,
        phone: newContact.phone || null,
        email: newContact.email || null,
        address: newContact.address || null,
        tax_number: newContact.tax_number || null,
        contact_class: newContact.contact_class || 'C',
        credit_limit: parseFloat(newContact.credit_limit) || 0,
        payment_terms_days: parseInt(newContact.payment_terms_days) || 30,
        industry: newContact.industry || null,
        website: newContact.website || null,
        notes: newContact.notes || null,
      });
      if (error) throw error;
      
      // Create opening balance transaction if amount provided
      const obAmount = parseFloat(newContact.opening_balance);
      if (obAmount > 0) {
        // Get the newly created contact ID
        const { data: newC } = await supabase.from('contacts').select('id').eq('user_id', user.id).eq('contact_name', newContact.name.trim()).order('created_at', { ascending: false }).limit(1).single();
        if (newC) {
          const isDebit = newContact.balance_direction === "debit";
          const contactAccountCode = newContact.type === "مورد" ? "2110" : "1130";
          await supabase.rpc("create_opening_balance_entry", {
            p_user_id: user.id,
            p_debit_account_code: isDebit ? contactAccountCode : "3400",
            p_credit_account_code: isDebit ? "3400" : contactAccountCode,
            p_amount: obAmount,
            p_balance_date: new Date().toISOString().split('T')[0],
            p_description: `رصيد افتتاحي - ${newContact.name.trim()}`,
            p_currency: "شيكل",
            p_contact_id: newC.id,
            p_reference: `OB-CONTACT-${newC.id}`,
            p_replace_existing: true,
            p_idempotency_key: `OB-CONTACT-${newC.id}`,
          });
          // Phase 5G: do NOT mirror balance into contacts.current_balance.
          // The opening balance entry above writes to the ledger; the UI
          // reads via get_contact_balance. Keeping the stored column stale
          // is intentional — it's no longer the source of truth.
        }
      }

      toast({ title: "تم إضافة جهة الاتصال بنجاح" });
      setNewContact({ name: "", type: "عميل", phone: "", email: "", address: "", tax_number: "", contact_class: "C", credit_limit: "", payment_terms_days: "30", industry: "", website: "", notes: "", opening_balance: "", balance_direction: "debit" });
      setShowAddDialog(false);
      fetchContacts();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleEditContact = async () => {
    if (!editContact || !editData.contact_name?.trim()) return;
    setEditing(true);
    try {
      const { error } = await supabase.from('contacts').update({
        contact_name: editData.contact_name.trim(),
        contact_type: editData.contact_type,
        phone: editData.phone || null,
        email: editData.email || null,
        address: editData.address || null,
        tax_number: editData.tax_number || null,
        contact_class: editData.contact_class || 'C',
        credit_limit: parseFloat(editData.credit_limit) || 0,
        payment_terms_days: parseInt(editData.payment_terms_days) || 30,
        early_pay_discount: parseFloat(editData.early_pay_discount) || 0,
        industry: editData.industry || null,
        website: editData.website || null,
        notes: editData.notes || null,
        contact_segment: editData.contact_segment || null,
      }).eq('id', editContact.id);
      if (error) throw error;

      // Handle opening balance in edit — always clean up old OB first
      const obAmount = parseFloat(editData.opening_balance) || 0;
      // Soft-delete ALL existing opening balance transactions for this contact
      const { data: existingOBs } = await supabase.from('transactions')
        .select('id').eq('contact_id', editContact.id).eq('is_opening_balance', true).eq('is_deleted', false);
      if (existingOBs && existingOBs.length > 0) {
        await supabase.from('transactions')
          .update({ is_deleted: true } as any)
          .in('id', existingOBs.map(t => t.id));
      }
      if (obAmount > 0) {
        const isDebit = editData.balance_direction === "debit";
        const contactAccountCode = editData.contact_type === "مورد" ? "2110" : "1130";
        await supabase.rpc("create_opening_balance_entry", {
          p_user_id: user!.id,
          p_debit_account_code: isDebit ? contactAccountCode : "3400",
          p_credit_account_code: isDebit ? "3400" : contactAccountCode,
          p_amount: obAmount,
          p_balance_date: new Date().toISOString().split('T')[0],
          p_description: `رصيد افتتاحي - ${editData.contact_name.trim()}`,
          p_currency: "شيكل",
          p_contact_id: editContact.id,
          p_reference: `OB-CONTACT-${editContact.id}`,
          p_replace_existing: true,
          p_idempotency_key: `OB-CONTACT-${editContact.id}-${Date.now()}`,
        });
        // Phase 5G: ledger is the source of truth — no mirror to current_balance.
      }
      // Phase 5G: removed the "reset to 0" branch as well — balance is always
      // computed from the ledger, so soft-deleting the OB transactions above
      // already reflects the change without touching contacts.current_balance.

      toast({ title: "تم تعديل جهة الاتصال بنجاح" });
      setEditContact(null);
      fetchContacts();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setEditing(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!deleteContact) return;
    setDeleting(true);
    try {
      // Only allow permanent delete if no transactions
      const { count } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('contact_id', deleteContact.id);
      if (count && count > 0) {
        toast({ title: "لا يمكن حذف جهة اتصال مرتبطة بمعاملات مالية، استخدم الأرشفة بدلاً من ذلك", variant: "destructive" });
        setDeleteContact(null);
        setDeleting(false);
        return;
      }
      const { error } = await supabase.from('contacts').delete().eq('id', deleteContact.id);
      if (error) throw error;
      toast({ title: "تم حذف جهة الاتصال نهائياً" });
      setDeleteContact(null);
      fetchContacts();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleArchiveContact = async () => {
    if (!archiveContact || !user) return;
    setArchiving(true);
    try {
      const { error } = await supabase.from('contacts').update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by: user.id,
      } as any).eq('id', archiveContact.id);
      if (error) throw error;
      toast({ title: `تم أرشفة "${archiveContact.contact_name}"` });
      setArchiveContact(null);
      fetchContacts();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchiveContact = async (contact: Contact) => {
    try {
      const { error } = await supabase.from('contacts').update({
        is_archived: false,
        archived_at: null,
        archived_by: null,
      } as any).eq('id', contact.id);
      if (error) throw error;
      toast({ title: `تم إلغاء أرشفة "${contact.contact_name}"` });
      fetchContacts();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    }
  };

  const markAlertRead = async (alertId: string) => {
    await supabase.from('contact_alerts').update({ is_read: true }).eq('id', alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  const markAllAlertsRead = async () => {
    if (!user) return;
    await supabase.from('contact_alerts').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    setAlerts([]);
  };

  const openEditDialog = (contact: Contact) => {
    setEditData({ ...contact });
    setEditContact(contact);
  };

  const activeContacts = useMemo(() => contacts.filter(c => showArchived ? (c.is_archived === true) : (!c.is_archived)), [contacts, showArchived]);

  const filtered = useMemo(() => activeContacts.filter(c => {
    const matchesType = !filterType || c.contact_type === filterType || 
      (filterType === "عميل" && ["زبون", "customer"].includes(c.contact_type)) ||
      (filterType === "مورد" && c.contact_type === "supplier");
    const matchesClass = !filterClass || c.contact_class === filterClass;
    const matchesSearch = !searchQuery || 
      multiWordMatchAny(searchQuery, c.contact_name, c.phone, c.tax_number, c.email);
    const createdDate = c.created_at?.split("T")[0] || "";
    const matchesDateFrom = !dateFrom || createdDate >= dateFrom;
    const matchesDateTo = !dateTo || createdDate <= dateTo;
    return matchesType && matchesClass && matchesSearch && matchesDateFrom && matchesDateTo;
  }), [activeContacts, filterType, filterClass, searchQuery, dateFrom, dateTo]);

  const nonArchivedContacts = useMemo(() => contacts.filter(c => !c.is_archived), [contacts]);
  const customerCount = nonArchivedContacts.filter(c => ["عميل", "عميل ومورد"].includes(c.contact_type)).length;
  const supplierCount = nonArchivedContacts.filter(c => ["مورد", "عميل ومورد"].includes(c.contact_type)).length;
  const archivedCount = contacts.filter(c => c.is_archived).length;
  
  const totalOverdue = nonArchivedContacts.reduce((s, c) => s + (c.overdue_amount || 0), 0);
  const overLimitCount = nonArchivedContacts.filter(c => c.credit_limit && c.current_balance && c.current_balance > c.credit_limit).length;
  const totalBalance = filtered.reduce((s, c) => s + (c.current_balance || 0), 0);
  const totalOverdueFiltered = filtered.reduce((s, c) => s + (c.overdue_amount || 0), 0);

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return parts[0][0] + parts[1][0];
    return name[0] || "?";
  };

  const exportCSV = () => {
    const headers = ["الاسم", "النوع", "الفئة", "الرصيد", "السقف", "المتأخر", "أيام الدفع", "الهاتف", "البريد"];
    const rows = filtered.map(c => [
      c.contact_name, c.contact_type, c.contact_class || "C",
      c.current_balance || 0, c.credit_limit || 0, c.overdue_amount || 0,
      c.avg_payment_days || 0, c.phone || "", c.email || ""
    ]);
    const csv = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contacts.csv"; a.click();
  };

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <PageHeader title="جهات الاتصال" breadcrumb={["الرئيسية", "جهات الاتصال"]} />
      {/* Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-muted-foreground">{contacts.length} جهة اتصال</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCSV}>
            <Download className="h-4 w-4" /> تصدير
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/contacts/policies")}>
            <Settings className="h-4 w-4" /> السياسات
          </Button>
          <div className="relative">
            <Button variant="outline" size="icon" className="relative" onClick={() => setShowAlerts(!showAlerts)}>
              <Bell className="h-4 w-4" />
              {alerts.length > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {alerts.length}
                </span>
              )}
            </Button>
            {showAlerts && (
              <div className="absolute left-0 top-10 w-80 bg-background border rounded-xl shadow-lg z-50 max-h-96 overflow-auto">
                <div className="flex items-center justify-between p-3 border-b">
                  <span className="text-sm font-semibold">التنبيهات</span>
                  {alerts.length > 0 && (
                    <Button variant="ghost" size="sm" className="text-xs" onClick={markAllAlertsRead}>تحديد الكل كمقروء</Button>
                  )}
                </div>
                {alerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">لا توجد تنبيهات</p>
                ) : alerts.map(alert => {
                  const config = alertConfig[alert.alert_type] || alertConfig.credit_limit_exceeded;
                  const Icon = config.icon;
                  return (
                    <div key={alert.id} className={`flex items-start gap-3 p-3 border-b hover:bg-muted/50 cursor-pointer ${config.bg}`}>
                      <Icon className={`h-4 w-4 mt-0.5 ${config.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold">{config.title}</p>
                        <p className="text-xs text-muted-foreground">{alert.contact_name} — ₪{alert.amount?.toLocaleString()}</p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => markAlertRead(alert.id)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4" /> إضافة
          </Button>
          <Button variant="ghost" size="icon" onClick={fetchContacts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { icon: <Users className="h-5 w-5" />, value: contacts.length, label: "الكل", onClick: () => setFilterType(null) },
            { icon: <Users className="h-5 w-5" />, value: customerCount, label: "زبائن", onClick: () => setFilterType("عميل") },
            { icon: <ShoppingBag className="h-5 w-5" />, value: supplierCount, label: "موردين", onClick: () => setFilterType("مورد") },
            { icon: <AlertTriangle className="h-5 w-5" />, value: `₪${totalOverdue.toLocaleString()}`, label: "متأخر", isNegative: totalOverdue > 0 },
            { icon: <AlertTriangle className="h-5 w-5" />, value: overLimitCount, label: "تجاوز السقف", isNegative: overLimitCount > 0 },
          ].map((kpi, i) => (
            <Card key={i} className="cursor-pointer hover:shadow-md transition-shadow" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 12 }} onClick={kpi.onClick}>
              <CardContent className="p-3 text-center">
                <div className="w-9 h-9 rounded-lg mx-auto mb-1 flex items-center justify-center" style={{ background: "#F0F4F8", color: "#1B3A5C" }}>{kpi.icon}</div>
                <p className="text-lg font-semibold tabular-nums" style={{ color: kpi.isNegative ? "#EF4444" : "#1B3A5C" }}>{kpi.value}</p>
                <p className="text-[10px]" style={{ color: "#6B7280" }}>{kpi.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      {!loading && contacts.length > 0 && (
        <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-3 space-y-3">
            {/* Search & Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث اسم، هاتف، رقم ضريبي..." className="pr-9 text-sm rounded-xl bg-muted/30 border-0 focus-visible:ring-2 focus-visible:ring-primary/20" dir="rtl" />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Select value={filterType || "all"} onValueChange={v => setFilterType(v === "all" ? null : v)}>
                <SelectTrigger className="w-[120px] rounded-xl text-xs h-9">
                  <Filter className="h-3.5 w-3.5 ml-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">الكل</SelectItem>
                  {contactTypeOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterClass || "all"} onValueChange={v => setFilterClass(v === "all" ? null : v)}>
                <SelectTrigger className="w-[90px] rounded-xl text-xs h-9">
                  <SelectValue placeholder="الفئة" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">كل الفئات</SelectItem>
                  {["A","B","C","D"].map(cls => (
                    <SelectItem key={cls} value={cls}>فئة {cls}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant={showArchived ? "default" : "outline"} 
                size="sm" 
                className="text-xs gap-1.5 rounded-xl h-9"
                onClick={() => setShowArchived(!showArchived)}
              >
                <Archive className="h-3.5 w-3.5" />
                {showArchived ? `المؤرشفون (${archivedCount})` : `مؤرشف`}
                {!showArchived && archivedCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{archivedCount}</Badge>
                )}
              </Button>
              <DateRangeFilter
                dateFrom={dateFrom}
                dateTo={dateTo}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
                onClear={() => { setDateFrom(""); setDateTo(""); }}
                compact
              />
              {(filterType || filterClass || dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="text-xs gap-1 h-9" onClick={() => { setFilterType(null); setFilterClass(null); setDateFrom(""); setDateTo(""); }}>
                  <X className="h-3 w-3" /> مسح
                </Button>
              )}
            </div>

            {/* Results count */}
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] text-muted-foreground">{filtered.length} جهة اتصال</span>
              {selectedIds.size > 0 && (
                <span className="text-[11px] text-primary font-medium">{selectedIds.size} محدد</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="border rounded-xl overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="p-3 text-right font-semibold w-8">
                    <Checkbox
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) setSelectedIds(new Set(filtered.map(c => c.id)));
                        else setSelectedIds(new Set());
                      }}
                    />
                  </th>
                  <th className="p-3 text-right font-semibold sticky right-0 bg-muted/50">الاسم</th>
                  <th className="p-3 text-right font-semibold">النوع</th>
                  <th className="p-3 text-center font-semibold">المصدر</th>
                  <th className="p-3 text-center font-semibold">فئة</th>
                  <th className="p-3 text-right font-semibold">الرصيد</th>
                  <th className="p-3 text-right font-semibold">السقف</th>
                  <th className="p-3 text-right font-semibold">المتأخر</th>
                  <th className="p-3 text-right font-semibold">آخر حركة</th>
                  <th className="p-3 text-center font-semibold">أيام الدفع</th>
                  <th className="p-3 text-center font-semibold w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(contact => {
                  const isOverLimit = contact.credit_limit && contact.current_balance && contact.current_balance > contact.credit_limit;
                  const hasOverdue = (contact.overdue_amount || 0) > 0;

                  return (
                    <tr key={contact.id} className="border-b hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/contacts/${contact.id}`)}>
                      <td className="p-3" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(contact.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedIds);
                            if (checked) next.add(contact.id); else next.delete(contact.id);
                            setSelectedIds(next);
                          }}
                        />
                      </td>
                      <td className="p-3 sticky right-0 bg-card">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            contact.contact_type === "مورد" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40"
                          }`}>
                            {getInitials(contact.contact_name)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold truncate">{contact.contact_name}</p>
                              {contact.is_archived && (
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-muted text-muted-foreground">مؤرشف</Badge>
                              )}
                            </div>
                            {contact.phone && <p className="text-[10px] text-muted-foreground tabular-nums">{contact.phone}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant="secondary" className={`text-[10px] ${
                          contact.contact_type === "مورد" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40" : 
                          contact.contact_type === "عميل ومورد" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40" : 
                          "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40"
                        }`}>
                          {contact.contact_type === "عميل" ? "زبون" : contact.contact_type}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        {(() => {
                          const src = (contact as any).source || "manual";
                          const map: Record<string, { label: string; icon: string; bg: string; color: string; border: string }> = {
                            "e-commerce": { label: "متجر إلكتروني", icon: "🛒", bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
                            "whatsapp": { label: "واتساب", icon: "💬", bg: "#ECFDF5", color: "#065F46", border: "#A7F3D0" },
                            "instagram": { label: "انستغرام", icon: "📸", bg: "#FDF2F8", color: "#9D174D", border: "#FBCFE8" },
                            "manual": { label: "يدوي", icon: "✏️", bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
                          };
                          const s = map[src] || map["manual"];
                          return (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "10px", fontSize: "10px", fontWeight: "600", background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                              {s.icon} {s.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="p-3 text-center">
                        <ClassBadge cls={contact.contact_class || "C"} />
                      </td>
                      <td className="p-3">
                        <CreditBar balance={contact.current_balance || 0} limit={contact.credit_limit || 0} />
                      </td>
                      <td className="p-3">
                        <span className="text-xs tabular-nums">
                          {contact.credit_limit ? `₪${contact.credit_limit.toLocaleString()}` : "—"}
                        </span>
                      </td>
                      <td className="p-3" onClick={e => e.stopPropagation()}>
                        {hasOverdue ? (
                          <button
                            className="text-xs font-semibold tabular-nums text-red-600 hover:underline cursor-pointer flex items-center gap-1"
                            onClick={() => { setOverdueContact(contact); setOverdueDialogOpen(true); }}
                          >
                            ₪{(contact.overdue_amount || 0).toLocaleString()}
                            <AlertTriangle className="h-3 w-3 text-red-500" />
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {contact.last_transaction_date ? new Date(contact.last_transaction_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : "—"}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-xs font-semibold tabular-nums ${(contact.avg_payment_days || 0) > 45 ? 'text-amber-600' : 'text-foreground'}`}>
                          {contact.avg_payment_days || 0} يوم
                          {(contact.avg_payment_days || 0) > 45 && <AlertTriangle className="inline h-3 w-3 mr-1" />}
                        </span>
                      </td>
                      <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-background">
                            <DropdownMenuItem onClick={() => navigate(`/contacts/${contact.id}`)}>
                              <Eye className="h-4 w-4 ml-2" /> عرض التفاصيل
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/account-statement?contact_id=${contact.id}&contact_name=${encodeURIComponent(contact.contact_name)}&contact_type=${encodeURIComponent(contact.contact_type)}`)}>
                              <FileText className="h-4 w-4 ml-2" /> كشف حساب
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {!contact.is_archived && (
                              <DropdownMenuItem onClick={() => openEditDialog(contact)}>
                                <Pencil className="h-4 w-4 ml-2" /> تعديل
                              </DropdownMenuItem>
                            )}
                            {contact.is_archived ? (
                              <DropdownMenuItem onClick={() => handleUnarchiveContact(contact)}>
                                <ArchiveRestore className="h-4 w-4 ml-2" /> إلغاء الأرشفة
                              </DropdownMenuItem>
                            ) : (
                              <>
                                <DropdownMenuItem onClick={() => setArchiveContact(contact)}>
                                  <Archive className="h-4 w-4 ml-2" /> أرشفة
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => setDeleteContact(contact)}>
                                  <Trash2 className="h-4 w-4 ml-2" /> حذف نهائي
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-muted-foreground">
                      لا توجد جهات اتصال
                    </td>
                  </tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/30 border-t-2 font-semibold">
                    <td colSpan={4} className="p-3 text-right text-xs">الإجمالي ({filtered.length})</td>
                    <td className="p-3 text-xs tabular-nums">₪{totalBalance.toLocaleString()}</td>
                    <td className="p-3"></td>
                    <td className="p-3 text-xs tabular-nums text-red-600">{totalOverdueFiltered > 0 ? `₪${totalOverdueFiltered.toLocaleString()}` : ""}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>إضافة جهة اتصال جديدة</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">الاسم *</Label>
              <Input placeholder="اسم جهة الاتصال" value={newContact.name} onChange={(e) => setNewContact(p => ({ ...p, name: e.target.value }))} dir="rtl" />
            </div>
            <div>
              <Label className="text-xs">النوع</Label>
              <Select value={newContact.type} onValueChange={(v) => setNewContact(p => ({ ...p, type: v, balance_direction: v === "مورد" ? "credit" : "debit" }))} dir="rtl">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {contactTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">التصنيف</Label>
              <Select value={newContact.contact_class} onValueChange={(v) => setNewContact(p => ({ ...p, contact_class: v }))} dir="rtl">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="A">A - مميز</SelectItem>
                  <SelectItem value="B">B - جيد</SelectItem>
                  <SelectItem value="C">C - عادي</SelectItem>
                  <SelectItem value="D">D - مخاطرة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">الهاتف</Label>
              <Input placeholder="رقم الهاتف" value={newContact.phone} onChange={(e) => setNewContact(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">البريد الإلكتروني</Label>
              <Input placeholder="email@example.com" value={newContact.email} onChange={(e) => setNewContact(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">سقف الائتمان ₪</Label>
              <Input type="number" placeholder="0" value={newContact.credit_limit} onChange={(e) => setNewContact(p => ({ ...p, credit_limit: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">أيام الدفع</Label>
              <Input type="number" placeholder="30" value={newContact.payment_terms_days} onChange={(e) => setNewContact(p => ({ ...p, payment_terms_days: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">الرقم الضريبي</Label>
              <Input placeholder="رقم ضريبي" value={newContact.tax_number} onChange={(e) => setNewContact(p => ({ ...p, tax_number: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">القطاع</Label>
              <Input placeholder="مثال: تجزئة" value={newContact.industry} onChange={(e) => setNewContact(p => ({ ...p, industry: e.target.value }))} dir="rtl" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">العنوان</Label>
              <Input placeholder="العنوان" value={newContact.address} onChange={(e) => setNewContact(p => ({ ...p, address: e.target.value }))} dir="rtl" />
            </div>
            <div>
              <Label className="text-xs">الرصيد الافتتاحي ₪</Label>
              <Input type="number" placeholder="0" value={newContact.opening_balance} onChange={(e) => setNewContact(p => ({ ...p, opening_balance: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">طبيعة الرصيد</Label>
              <Select value={newContact.balance_direction} onValueChange={(v: "debit" | "credit") => setNewContact(p => ({ ...p, balance_direction: v }))} dir="rtl">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="debit">مدين (إلنا رصيد)</SelectItem>
                  <SelectItem value="credit">دائن (علينا دين)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea placeholder="ملاحظات..." value={newContact.notes} onChange={(e) => setNewContact(p => ({ ...p, notes: e.target.value }))} dir="rtl" rows={2} />
            </div>
            <div className="col-span-2">
              <Button onClick={handleAddContact} disabled={adding || !newContact.name.trim()} className="w-full">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "إضافة"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editContact} onOpenChange={(o) => !o && setEditContact(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>تعديل جهة الاتصال</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">الاسم</Label>
              <Input value={editData.contact_name || ""} onChange={(e) => setEditData((p: any) => ({ ...p, contact_name: e.target.value }))} dir="rtl" />
            </div>
            <div>
              <Label className="text-xs">النوع</Label>
              <Select value={editData.contact_type || "عميل"} onValueChange={(v) => setEditData((p: any) => ({ ...p, contact_type: v }))} dir="rtl">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {contactTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">التصنيف</Label>
              <Select value={editData.contact_class || "C"} onValueChange={(v) => setEditData((p: any) => ({ ...p, contact_class: v }))} dir="rtl">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="A">A - مميز</SelectItem>
                  <SelectItem value="B">B - جيد</SelectItem>
                  <SelectItem value="C">C - عادي</SelectItem>
                  <SelectItem value="D">D - مخاطرة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">الهاتف</Label>
              <Input value={editData.phone || ""} onChange={(e) => setEditData((p: any) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">البريد</Label>
              <Input value={editData.email || ""} onChange={(e) => setEditData((p: any) => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">سقف الائتمان ₪</Label>
              <Input type="number" value={editData.credit_limit || ""} onChange={(e) => setEditData((p: any) => ({ ...p, credit_limit: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">أيام الدفع</Label>
              <Input type="number" value={editData.payment_terms_days || ""} onChange={(e) => setEditData((p: any) => ({ ...p, payment_terms_days: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">خصم الدفع المبكر %</Label>
              <Input type="number" value={editData.early_pay_discount || ""} onChange={(e) => setEditData((p: any) => ({ ...p, early_pay_discount: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">الشريحة</Label>
              <Select value={editData.contact_segment || ""} onValueChange={(v) => setEditData((p: any) => ({ ...p, contact_segment: v }))} dir="rtl">
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="VIP">VIP</SelectItem>
                  <SelectItem value="عادي">عادي</SelectItem>
                  <SelectItem value="مخاطرة عالية">مخاطرة عالية</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">الرقم الضريبي</Label>
              <Input value={editData.tax_number || ""} onChange={(e) => setEditData((p: any) => ({ ...p, tax_number: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">القطاع</Label>
              <Input value={editData.industry || ""} onChange={(e) => setEditData((p: any) => ({ ...p, industry: e.target.value }))} dir="rtl" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">العنوان</Label>
              <Input value={editData.address || ""} onChange={(e) => setEditData((p: any) => ({ ...p, address: e.target.value }))} dir="rtl" />
            </div>
            <div>
              <Label className="text-xs">الرصيد الافتتاحي ₪</Label>
              <Input type="number" placeholder="0" value={editData.opening_balance || ""} onChange={(e) => setEditData((p: any) => ({ ...p, opening_balance: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">طبيعة الرصيد</Label>
              <Select value={editData.balance_direction || "credit"} onValueChange={(v) => setEditData((p: any) => ({ ...p, balance_direction: v }))} dir="rtl">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="debit">مدين (إلنا رصيد)</SelectItem>
                  <SelectItem value="credit">دائن (علينا دين)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea value={editData.notes || ""} onChange={(e) => setEditData((p: any) => ({ ...p, notes: e.target.value }))} dir="rtl" rows={2} />
            </div>
            <div className="col-span-2">
              <Button onClick={handleEditContact} disabled={editing} className="w-full">
                {editing ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation */}
      <AlertDialog open={!!archiveContact} onOpenChange={(o) => !o && setArchiveContact(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>أرشفة جهة الاتصال</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم أرشفة "{archiveContact?.contact_name}". لن تظهر في القوائم لكن سيبقى تاريخها المالي محفوظاً. هل تريد المتابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={handleArchiveContact} disabled={archiving}>
              {archiving ? <Loader2 className="h-4 w-4 animate-spin" /> : "أرشفة"}
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteContact} onOpenChange={(o) => !o && setDeleteContact(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف نهائي</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف "{deleteContact?.contact_name}" نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={handleDeleteContact} disabled={deleting} className="bg-destructive text-destructive-foreground">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "حذف نهائي"}
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Overdue Invoices Dialog */}
      <Dialog open={overdueDialogOpen} onOpenChange={v => { setOverdueDialogOpen(v); if (!v) setOverdueContact(null); }}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              الفواتير المتأخرة — {overdueContact?.contact_name}
            </DialogTitle>
          </DialogHeader>
          {overdueLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : overdueInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">لا توجد فواتير متأخرة</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/50 border-b">
                  <th className="p-2 text-right text-xs font-semibold">رقم الفاتورة</th>
                  <th className="p-2 text-right text-xs font-semibold">تاريخ الاستحقاق</th>
                  <th className="p-2 text-right text-xs font-semibold">المتبقي</th>
                  <th className="p-2 text-right text-xs font-semibold">أيام التأخير</th>
                </tr></thead>
                <tbody>
                  {overdueInvoices.map((inv: any) => {
                    const daysLate = Math.max(0, Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000));
                    return (
                      <tr key={inv.id} className="border-b hover:bg-muted/20">
                        <td className="p-2 text-xs font-mono">{inv.invoice_number}</td>
                        <td className="p-2 text-xs">{inv.due_date}</td>
                        <td className="p-2 text-xs font-bold text-red-600 tabular-nums">₪{Number(inv.remaining_amount).toLocaleString()}</td>
                        <td className="p-2 text-xs font-bold text-red-600 tabular-nums">{daysLate} يوم</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContactsPage;
