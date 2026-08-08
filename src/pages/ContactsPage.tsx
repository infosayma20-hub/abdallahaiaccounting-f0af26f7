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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useToast } from "@/hooks/use-toast";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { fetchAllRows } from "@/lib/fetch-all-rows";
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

// Money formatter: always 2 decimals with thousands separators (avoids 2.998 looking like 2,998)
const money2 = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// CreditBar component
const CreditBar = ({ balance, limit }: { balance: number; limit: number }) => {
  const absBalance = Math.abs(balance);
  const isNeg = balance < 0;
  
  if (!limit || limit <= 0) {
    // No credit limit — just show balance
    if (balance === 0) return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <span className={`text-xs font-semibold tabular-nums ${isNeg ? 'text-red-600' : 'text-emerald-600'}`}>
        {isNeg ? '-' : ''}₪{money2(absBalance)}
      </span>
    );
  }
  
  const pct = (absBalance / limit) * 100;
  return (
    <div className="space-y-0.5">
      <span className={`text-xs font-semibold tabular-nums ${isNeg ? 'text-red-600' : pct > 100 ? 'text-red-600' : pct > 80 ? 'text-amber-600' : 'text-foreground'}`}>
        {isNeg ? '-' : ''}₪{money2(absBalance)}
      </span>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground">من ₪{money2(limit)}</span>
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
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id;
  const { toast } = useToast();
  const { settings } = useCompanySettings();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
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
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 100;
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
    if (typeParam === "customer") setFilterTypes(["عميل"]);
    else if (typeParam === "supplier") setFilterTypes(["مورد"]);
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
      .eq("user_id", ownerId)
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
      // Phase 5J — Performance: single bulk RPC replaces per-contact fanout
      // (previously N parallel `get_contact_balance` calls + full transactions
      // download just to derive last_transaction_date). For tenants with
      // thousands of contacts this reduced page load from ~30s to <2s.
      const [contactData, bulkRes] = await Promise.all([
        fetchAllRows<any>((f, t) =>
          supabase.from('contacts').select('*').eq('user_id', ownerId).order('contact_name').range(f, t)
        ),
        (supabase as any).rpc('get_contacts_balances_bulk', { p_user_id: ownerId }),
      ]);

      const bulkRows: Array<{ contact_id: string; balance: number; last_transaction_date: string | null }> =
        (bulkRes?.data as any[]) || [];
      const balanceMap: Record<string, number> = {};
      const lastTxMap: Record<string, string> = {};
      for (const r of bulkRows) {
        balanceMap[r.contact_id] = Number(r.balance) || 0;
        if (r.last_transaction_date) lastTxMap[r.contact_id] = r.last_transaction_date;
      }

      // Transactions state kept for legacy consumers on this page but no
      // longer used for balance/last-date derivation.
      setTransactions([]);

      const enriched = (contactData || []).map((c: any) => ({
        ...c,
        current_balance: balanceMap[c.id] ?? 0,
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
    const { data } = await supabase.from('contact_alerts').select('*').eq('user_id', ownerId).eq('is_read', false).order('created_at', { ascending: false }).limit(50);
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
        filter: `user_id=eq.${ownerId}`
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
      const { data: insertedRows, error } = await supabase.from('contacts').insert({
        user_id: ownerId,
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
      }).select('id').single();
      if (error) throw error;
      
      // Create opening balance transaction if amount provided
      const obAmount = parseFloat(newContact.opening_balance);
      if (obAmount > 0) {
        const newC = insertedRows as { id: string } | null;
        if (!newC?.id) {
          throw new Error("تعذر استرجاع معرّف جهة الاتصال بعد الإنشاء — لم يتم تسجيل الرصيد الافتتاحي");
        }
        {
          const isDebit = newContact.balance_direction === "debit";
          // عميل ومورد → نعتمد اتجاه الرصيد لتحديد الحساب الصحيح
          const isSupplierSide = newContact.type === "مورد" || (newContact.type === "عميل ومورد" && !isDebit);
          const parentCode = isSupplierSide ? "2110" : "1130";
          // حل الحساب الأب إلى حساب فرعي مخصّص لهذه الجهة (يُنشئه إن لم يكن موجوداً
          // ويحدّث linked_account_code). الترحيل المباشر على 1130/2110 ممنوع.
          const { data: leafCode, error: resolveErr } = await supabase.rpc("resolve_postable_account", {
            p_user_id: ownerId,
            p_parent_code: parentCode,
            p_contact_id: newC.id,
            p_contact_name: newContact.name.trim(),
            p_contact_type: newContact.type,
          });
          if (resolveErr || !leafCode) {
            throw new Error(resolveErr?.message || "تعذر تحديد الحساب الفرعي لجهة الاتصال");
          }
          const contactAccountCode = leafCode as string;
          const { data: obRes, error: obErr } = await supabase.rpc("create_opening_balance_entry", {
            p_user_id: ownerId,
            p_debit_account_code: isDebit ? contactAccountCode : "3400",
            p_credit_account_code: isDebit ? "3400" : contactAccountCode,
            p_amount: obAmount,
            p_balance_date: new Date().toISOString().split('T')[0],
            p_description: `رصيد افتتاحي - ${newContact.name.trim()}`,
            p_currency: "شيكل",
            p_contact_id: newC.id,
          p_reference: `OB-${newC.id.slice(0, 8).toUpperCase()}`,
            p_replace_existing: true,
          p_idempotency_key: `OB-CONTACT-${newC.id}-${Date.now()}`,
          });
          const obResult = obRes as { success?: boolean; error?: string } | null;
          if (obErr || (obResult && obResult.success === false)) {
            throw new Error(obErr?.message || obResult?.error || "تعذر تسجيل الرصيد الافتتاحي");
          }
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
      // Detect a contact_type change (e.g. مورد ↔ عميل ومورد). When the type
      // changes we must NEVER touch the opening balance or reassign the linked
      // sub-account — doing so silently deletes the historical OB and can
      // spawn a second AR/AP account for the same contact (the bug that hit
      // منير المحيسن). We only update the profile fields on the contact row.
      const typeChanged = editContact.contact_type !== editData.contact_type;

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

      if (typeChanged) {
        toast({
          title: "تم تعديل جهة الاتصال بنجاح",
          description: "تم تحديث تصنيف الجهة. الرصيد الافتتاحي والحساب المحاسبي محفوظان كما هما.",
        });
        setEditContact(null);
        fetchContacts();
        return;
      }

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
        const isSupplierSide = editData.contact_type === "مورد" || (editData.contact_type === "عميل ومورد" && !isDebit);
        const parentCode = isSupplierSide ? "2110" : "1130";
        const { data: leafCode, error: resolveErr } = await supabase.rpc("resolve_postable_account", {
          p_user_id: ownerId,
          p_parent_code: parentCode,
          p_contact_id: editContact.id,
          p_contact_name: editData.contact_name.trim(),
          p_contact_type: editData.contact_type,
        });
        if (resolveErr || !leafCode) {
          throw new Error(resolveErr?.message || "تعذر تحديد الحساب الفرعي لجهة الاتصال");
        }
        const contactAccountCode = leafCode as string;
        const { data: obRes, error: obErr } = await supabase.rpc("create_opening_balance_entry", {
          p_user_id: ownerId,
          p_debit_account_code: isDebit ? contactAccountCode : "3400",
          p_credit_account_code: isDebit ? "3400" : contactAccountCode,
          p_amount: obAmount,
          p_balance_date: new Date().toISOString().split('T')[0],
          p_description: `رصيد افتتاحي - ${editData.contact_name.trim()}`,
          p_currency: "شيكل",
          p_contact_id: editContact.id,
          p_reference: `OB-${editContact.id.slice(0, 8).toUpperCase()}`,
          p_replace_existing: true,
          p_idempotency_key: `OB-CONTACT-${editContact.id}-${Date.now()}`,
        });
        const obResult = obRes as { success?: boolean; error?: string } | null;
        if (obErr || (obResult && obResult.success === false)) {
          throw new Error(obErr?.message || obResult?.error || "تعذر تسجيل الرصيد الافتتاحي");
        }
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

  const [reverseContact, setReverseContact] = useState<Contact | null>(null);
  const [reversing, setReversing] = useState(false);
  const handleArchiveWithReversals = async () => {
    if (!reverseContact) return;
    setReversing(true);
    try {
      const { data, error } = await supabase.rpc('archive_contact_with_reversals' as any, {
        p_contact_id: reverseContact.id,
        p_reason: `أرشفة "${reverseContact.contact_name}" مع عكس الحركات`,
      });
      if (error) throw error;
      const res = data as any;
      toast({
        title: `تم أرشفة "${reverseContact.contact_name}"`,
        description: `تم عكس ${res?.reversed ?? 0} حركة${res?.skipped ? ` (تخطّي ${res.skipped})` : ''}.`,
      });
      setReverseContact(null);
      fetchContacts();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setReversing(false);
    }
  };

  const markAlertRead = async (alertId: string) => {
    await supabase.from('contact_alerts').update({ is_read: true }).eq('id', alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  const markAllAlertsRead = async () => {
    if (!user) return;
    await supabase.from('contact_alerts').update({ is_read: true }).eq('user_id', ownerId).eq('is_read', false);
    setAlerts([]);
  };

  const openEditDialog = (contact: Contact) => {
    setEditData({ ...contact });
    setEditContact(contact);
  };

  const activeContacts = useMemo(() => contacts.filter(c => showArchived ? (c.is_archived === true) : (!c.is_archived && c.is_active !== false)), [contacts, showArchived]);

  const filtered = useMemo(() => activeContacts.filter(c => {
    const matchesType = filterTypes.length === 0 || filterTypes.some(ft =>
      c.contact_type === ft ||
      (ft === "عميل" && ["زبون", "customer"].includes(c.contact_type)) ||
      (ft === "مورد" && c.contact_type === "supplier")
    );
    const matchesClass = !filterClass || c.contact_class === filterClass;
    const matchesSearch = !searchQuery || 
      multiWordMatchAny(searchQuery, c.contact_name, c.phone, c.tax_number, c.email);
    const createdDate = c.created_at?.split("T")[0] || "";
    const matchesDateFrom = !dateFrom || createdDate >= dateFrom;
    const matchesDateTo = !dateTo || createdDate <= dateTo;
    return matchesType && matchesClass && matchesSearch && matchesDateFrom && matchesDateTo;
  }), [activeContacts, filterTypes, filterClass, searchQuery, dateFrom, dateTo]);

  const nonArchivedContacts = useMemo(() => contacts.filter(c => !c.is_archived), [contacts]);
  const customerCount = nonArchivedContacts.filter(c => ["عميل", "عميل ومورد"].includes(c.contact_type)).length;
  const supplierCount = nonArchivedContacts.filter(c => ["مورد", "عميل ومورد"].includes(c.contact_type)).length;
  const archivedCount = contacts.filter(c => c.is_archived).length;
  
  const totalOverdue = nonArchivedContacts.reduce((s, c) => s + (c.overdue_amount || 0), 0);
  const overLimitCount = nonArchivedContacts.filter(c => c.credit_limit && c.current_balance && c.current_balance > c.credit_limit).length;
  const totalBalance = filtered.reduce((s, c) => s + (c.current_balance || 0), 0);
  const totalOverdueFiltered = filtered.reduce((s, c) => s + (c.overdue_amount || 0), 0);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );
  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterTypes, filterClass, dateFrom, dateTo, showArchived]);

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

  const handlePrint = () => {
    if (filtered.length === 0) { toast({ title: "لا توجد بيانات للطباعة", variant: "destructive" }); return; }
    const typeLabel = (t: string) =>
      ["عميل", "زبون", "customer"].includes(t) ? "زبون"
      : ["مورد", "supplier"].includes(t) ? "مورد"
      : t === "عميل ومورد" ? "زبون ومورد"
      : t || "—";
    const fmt = (n: number | null | undefined) => {
      const v = n || 0;
      if (v === 0) return "—";
      return `₪${money2(Math.abs(v))}${v < 0 ? "-" : ""}`;
    };
    const lastMove = (c: Contact) => (c.last_transaction_date || "").split("T")[0] || "—";

    const rowsHtml = filtered.map(c => `
      <tr>
        <td>${c.contact_name || "—"}</td>
        <td>${typeLabel(c.contact_type)}</td>
        <td>${c.contact_class || "C"}</td>
        <td class="font-mono ${(c.current_balance || 0) < 0 ? "text-red" : ""}">${fmt(c.current_balance)}</td>
        <td class="font-mono">${fmt(c.credit_limit)}</td>
        <td class="font-mono ${(c.overdue_amount || 0) > 0 ? "text-red" : ""}">${fmt(c.overdue_amount)}</td>
        <td>${lastMove(c)}</td>
        <td>${c.avg_payment_days ? `${c.avg_payment_days} يوم` : "—"}</td>
      </tr>
    `).join("");

    const customers = filtered.filter(c => ["عميل", "عميل ومورد", "زبون", "customer"].includes(c.contact_type)).length;
    const suppliers = filtered.filter(c => ["مورد", "عميل ومورد", "supplier"].includes(c.contact_type)).length;
    const overdueRows = filtered.filter(c => (c.overdue_amount || 0) > 0).length;
    const overLimitRows = filtered.filter(c => c.credit_limit && c.current_balance && c.current_balance > c.credit_limit).length;

    const contentHtml = `
      <div class="print-header">
        <div>
          <div class="company-name">${settings.company_name || "الشركة"}</div>
          <div class="report-title">تقرير جهات الاتصال</div>
        </div>
        <div class="print-date">${filtered.length} جهة</div>
      </div>
      <div class="summary-row">
        <div class="summary-card"><div class="summary-label">الإجمالي</div><div class="summary-value">${filtered.length}</div></div>
        <div class="summary-card"><div class="summary-label">الزبائن</div><div class="summary-value">${customers}</div></div>
        <div class="summary-card"><div class="summary-label">الموردين</div><div class="summary-value">${suppliers}</div></div>
        <div class="summary-card"><div class="summary-label">متأخر</div><div class="summary-value red">${overdueRows}</div></div>
        <div class="summary-card"><div class="summary-label">تجاوز السقف</div><div class="summary-value red">${overLimitRows}</div></div>
      </div>
      <table>
        <thead><tr>
          <th>الاسم</th><th>النوع</th><th>الفئة</th><th>الرصيد</th><th>السقف</th><th>المتأخر</th><th>آخر حركة</th><th>أيام الدفع</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr>
          <td colspan="3" style="text-align:right">الإجمالي (${filtered.length} جهة)</td>
          <td class="font-mono font-bold ${totalBalance < 0 ? "text-red" : ""}">${fmt(totalBalance)}</td>
          <td></td>
          <td class="font-mono font-bold ${totalOverdueFiltered > 0 ? "text-red" : ""}">${fmt(totalOverdueFiltered)}</td>
          <td colspan="2"></td>
        </tr></tfoot>
      </table>
    `;

    import("@/lib/printUtils").then(({ printReport }) => {
      printReport({
        title: "تقرير جهات الاتصال",
        companyName: settings.company_name || "الشركة",
        contentHtml,
      });
    });
  };

  const openAddDialog = (type?: "عميل" | "مورد") => {
    setNewContact({
      name: "", type: type ?? "عميل", phone: "", email: "", address: "", tax_number: "",
      contact_class: "C", credit_limit: "", payment_terms_days: "30", industry: "", website: "", notes: "",
      opening_balance: "", balance_direction: type === "مورد" ? "credit" : "debit",
    });
    setShowAddDialog(true);
  };

  const cols = useColumnVisibility("contacts:cols-v1", CONTACT_COLUMNS);
  const show = cols.isVisible;

  const actionTabs: ActionTab[] = [
    {
      key: "home", label: "عام",
      groups: [
        {
          key: "new", label: "جديد", items: [
            { key: "new-contact",  label: "جهة جديدة", icon: Plus,       variant: "primary", onClick: () => openAddDialog() },
            { key: "new-customer", label: "زبون جديد", icon: UserPlus,   onClick: () => openAddDialog("عميل") },
            { key: "new-supplier", label: "مورد جديد", icon: Truck,      onClick: () => openAddDialog("مورد") },
          ],
        },
        {
          key: "actions", label: "إجراءات", items: [
            {
              key: "soa", label: "إرسال كشف", icon: FileText,
              disabled: selectedIds.size !== 1,
              tooltip: selectedIds.size === 1 ? undefined : "اختر جهة واحدة فقط",
              onClick: () => {
                const id = Array.from(selectedIds)[0];
                const c = contacts.find(x => x.id === id);
                if (!c) return;
                navigate(`/account-statement?contact_id=${c.id}&contact_name=${encodeURIComponent(c.contact_name)}&contact_type=${encodeURIComponent(c.contact_type)}`);
              },
            },
            { key: "policies", label: "سياسات الائتمان", icon: Settings, onClick: () => navigate("/contacts/policies") },
            { key: "refresh",  label: "تحديث",         icon: RefreshCw, onClick: fetchContacts, disabled: loading },
          ],
        },
        {
          key: "view", label: "عرض", items: [
            {
              key: "archived", label: showArchived ? `إخفاء المؤرشفين` : `إظهار المؤرشفين${archivedCount ? ` (${archivedCount})` : ""}`,
              icon: showArchived ? ArchiveRestore : Archive,
              onClick: () => setShowArchived(v => !v),
            },
          ],
        },
        {
          key: "export", label: "تصدير وطباعة", items: [
            { key: "excel", label: "Excel",  icon: Download, onClick: exportCSV, disabled: filtered.length === 0, tooltip: filtered.length === 0 ? "لا توجد بيانات للتصدير" : undefined },
            { key: "print", label: "طباعة", icon: Printer,  onClick: handlePrint, disabled: filtered.length === 0, tooltip: filtered.length === 0 ? "لا توجد بيانات للطباعة" : undefined },
          ],
        },
      ],
    },
  ];

  const rightSlot = (
    <>
      <div className="relative">
        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="بحث اسم، هاتف، رقم ضريبي..."
          className="h-8 w-64 pr-8 text-[12.5px]"
          dir="rtl"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <ColumnVisibilityMenu state={cols} />
      <DropdownMenu open={showAlerts} onOpenChange={setShowAlerts}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 relative px-2">
            <Bell className="h-3.5 w-3.5" />
            {alerts.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-destructive text-destructive-foreground text-[9px] px-1 flex items-center justify-center font-bold">
                {alerts.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-auto">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm font-semibold">التنبيهات</span>
            {alerts.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-6" onClick={markAllAlertsRead}>تحديد الكل كمقروء</Button>
            )}
          </div>
          <DropdownMenuSeparator />
          {alerts.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">لا توجد تنبيهات</p>
          ) : alerts.map(alert => {
            const config = alertConfig[alert.alert_type] || alertConfig.credit_limit_exceeded;
            const Icon = config.icon;
            return (
              <div key={alert.id} className="flex items-start gap-2 px-2 py-2 hover:bg-muted/50">
                <Icon className={`h-4 w-4 mt-0.5 ${config.color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{config.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{alert.contact_name} — ₪{alert.amount?.toLocaleString()}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => markAlertRead(alert.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return (
    <>
      <FinanceShell
        title="جهات الاتصال"
        subtitle="إدارة الزبائن والموردين والجهات المالية"
        breadcrumb={[{ label: "الرئيسية", href: "/" }, { label: "جهات الاتصال" }]}
        actionTabs={actionTabs}
        rightSlot={rightSlot}
      >
      {/* KPI quick filters */}
      {!loading && contacts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
          {[
            { icon: Users,         value: contacts.length,   label: "الكل",        active: filterTypes.length === 0,     onClick: () => setFilterTypes([])       },
            { icon: Users,         value: customerCount,     label: "زبائن",       active: filterTypes.includes("عميل"), onClick: () => setFilterTypes(["عميل"]) },
            { icon: ShoppingBag,   value: supplierCount,     label: "موردين",      active: filterTypes.includes("مورد"), onClick: () => setFilterTypes(["مورد"]) },
            { icon: AlertTriangle, value: `₪${money2(totalOverdue)}`, label: "متأخر",      negative: totalOverdue > 0 },
            { icon: AlertTriangle, value: overLimitCount,    label: "تجاوز السقف", negative: overLimitCount > 0 },
          ].map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={kpi.onClick}
                className={`flex items-center gap-2 px-3 py-2 rounded border text-right transition-colors ${
                  kpi.active ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"
                } ${kpi.onClick ? "cursor-pointer" : "cursor-default"}`}
              >
                <div className="w-8 h-8 rounded flex items-center justify-center bg-muted text-muted-foreground shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold tabular-nums truncate ${kpi.negative ? "text-destructive" : "text-foreground"}`}>{kpi.value}</p>
                  <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Secondary filters bar */}
      {!loading && contacts.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3 px-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 min-w-[130px] justify-start font-normal">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">
                  {filterTypes.length === 0
                    ? "كل الأنواع"
                    : filterTypes.length === 1
                      ? contactTypeOptions.find(o => o.value === filterTypes[0])?.label
                      : `${filterTypes.length} أنواع`}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-background z-50 w-44">
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setFilterTypes([]); }} className="text-xs gap-2">
                <Checkbox checked={filterTypes.length === 0} className="pointer-events-none" />
                كل الأنواع
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {contactTypeOptions.map(opt => (
                <DropdownMenuItem
                  key={opt.value}
                  onSelect={(e) => {
                    e.preventDefault();
                    setFilterTypes(prev => prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]);
                  }}
                  className="text-xs gap-2"
                >
                  <Checkbox checked={filterTypes.includes(opt.value)} className="pointer-events-none" />
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Select value={filterClass || "all"} onValueChange={v => setFilterClass(v === "all" ? null : v)}>
            <SelectTrigger className="w-[110px] text-xs h-8">
              <SelectValue placeholder="الفئة" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">كل الفئات</SelectItem>
              {["A","B","C","D"].map(cls => (
                <SelectItem key={cls} value={cls}>فئة {cls}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onClear={() => { setDateFrom(""); setDateTo(""); }}
            compact
          />
          {(filterTypes.length > 0 || filterClass || dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="text-xs gap-1 h-8" onClick={() => { setFilterTypes([]); setFilterClass(null); setDateFrom(""); setDateTo(""); }}>
              <X className="h-3 w-3" /> مسح الفلاتر
            </Button>
          )}
          <div className="mr-auto flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>{filtered.length} جهة</span>
            {selectedIds.size > 0 && <span className="text-primary font-medium">{selectedIds.size} محدد</span>}
          </div>
        </div>
      )}

      {/* Table / Empty / Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={<ContactRound className="h-20 w-20" />}
          title="لا توجد جهات اتصال بعد"
          description="أضف زبائنك ومورديك لتتبع الأرصدة وكشوف الحساب وسياسات الائتمان."
          primaryAction={{ label: "إضافة زبون",   onClick: () => openAddDialog("عميل"), icon: <UserPlus className="h-4 w-4" /> }}
          secondaryAction={{ label: "إضافة مورد", onClick: () => openAddDialog("مورد"), icon: <Truck className="h-4 w-4" /> }}
        />
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="p-3 text-right font-semibold w-8">
                    <Checkbox
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) setSelectedIds(new Set(filtered.map(c => c.id)));
                        else setSelectedIds(new Set());
                      }}
                      className="border-primary-foreground/50 data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary"
                    />
                  </th>
                  <th className="p-3 text-right text-xs font-semibold">الاسم</th>
                  {show("type") && <th className="p-3 text-right text-xs font-semibold">النوع</th>}
                  {show("source") && <th className="p-3 text-center text-xs font-semibold">المصدر</th>}
                  {show("class") && <th className="p-3 text-center text-xs font-semibold">الفئة</th>}
                  <th className="p-3 text-right text-xs font-semibold">الرصيد</th>
                  {show("limit") && <th className="p-3 text-right text-xs font-semibold">السقف</th>}
                  {show("overdue") && <th className="p-3 text-right text-xs font-semibold">المتأخر</th>}
                  {show("last_tx") && <th className="p-3 text-right text-xs font-semibold">آخر حركة</th>}
                  {show("payment_days") && <th className="p-3 text-center text-xs font-semibold">أيام الدفع</th>}
                  <th className="p-3 text-center text-xs font-semibold w-10">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(contact => {
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
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 bg-muted text-foreground">
                            {getInitials(contact.contact_name)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold truncate">{contact.contact_name}</p>
                              {contact.is_archived && (
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">مؤرشف</Badge>
                              )}
                            </div>
                            {contact.phone && <p className="text-[10px] text-muted-foreground tabular-nums">{contact.phone}</p>}
                          </div>
                        </div>
                      </td>
                      {show("type") && (
                        <td className="p-3">
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {contact.contact_type === "عميل" ? "زبون" : contact.contact_type}
                          </Badge>
                        </td>
                      )}
                      {show("source") && (
                        <td className="p-3 text-center">
                          {(() => {
                            const src = (contact as any).source || "manual";
                            const cfg = sourceConfig[src] || sourceConfig.manual;
                            const Icon = cfg.icon;
                            return (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                                <Icon className="h-3 w-3" /> {cfg.label}
                              </span>
                            );
                          })()}
                        </td>
                      )}
                      {show("class") && (
                        <td className="p-3 text-center">
                          <ClassBadge cls={contact.contact_class || "C"} />
                        </td>
                      )}
                      <td className="p-3">
                        <CreditBar balance={contact.current_balance || 0} limit={contact.credit_limit || 0} />
                      </td>
                      {show("limit") && (
                        <td className="p-3">
                          <span className="text-xs tabular-nums">
                            {contact.credit_limit ? `₪${money2(contact.credit_limit)}` : "—"}
                          </span>
                        </td>
                      )}
                      {show("overdue") && (
                        <td className="p-3" onClick={e => e.stopPropagation()}>
                          {hasOverdue ? (
                            <button
                              className="text-xs font-semibold tabular-nums text-destructive hover:underline cursor-pointer inline-flex items-center gap-1"
                              onClick={() => { setOverdueContact(contact); setOverdueDialogOpen(true); }}
                            >
                              ₪{money2(contact.overdue_amount)}
                              <AlertTriangle className="h-3 w-3" />
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                      {show("last_tx") && (
                        <td className="p-3">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {contact.last_transaction_date ? new Date(contact.last_transaction_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : "—"}
                          </span>
                        </td>
                      )}
                      {show("payment_days") && (
                        <td className="p-3 text-center">
                          <span className={`text-xs font-semibold tabular-nums ${(contact.avg_payment_days || 0) > 45 ? 'text-amber-600' : 'text-foreground'}`}>
                            {contact.avg_payment_days || 0} يوم
                          </span>
                        </td>
                      )}
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
                                <DropdownMenuItem className="text-orange-600" onClick={() => setReverseContact(contact)}>
                                  <ArchiveRestore className="h-4 w-4 ml-2" /> أرشفة + عكس الحركات
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
                    <td className="p-3 text-xs tabular-nums">₪{money2(totalBalance)}</td>
                    <td className="p-3"></td>
                    <td className="p-3 text-xs tabular-nums text-red-600">{totalOverdueFiltered > 0 ? `₪${money2(totalOverdueFiltered)}` : ""}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t bg-muted/20 text-sm" dir="rtl">
              <div className="text-xs text-muted-foreground">
                عرض {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} من {filtered.length}
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" disabled={safePage === 1} onClick={() => setCurrentPage(1)}>الأولى</Button>
                <Button variant="outline" size="sm" disabled={safePage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>السابق</Button>
                <span className="px-3 text-xs font-semibold tabular-nums">صفحة {safePage} من {totalPages}</span>
                <Button variant="outline" size="sm" disabled={safePage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>التالي</Button>
                <Button variant="outline" size="sm" disabled={safePage === totalPages} onClick={() => setCurrentPage(totalPages)}>الأخيرة</Button>
              </div>
            </div>
          )}
        </div>
      )}
      </FinanceShell>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0" dir="rtl">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-5 w-5 text-primary" />
              إضافة جهة اتصال جديدة
            </DialogTitle>
            <DialogDescription>
              أنشئ زبوناً أو مورداً جديداً مع بيانات التواصل والشروط المالية والرصيد الافتتاحي.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-5 space-y-6">
            {/* معلومات أساسية */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <ContactRound className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground tracking-wide">معلومات أساسية</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">الاسم *</Label>
                  <Input placeholder="اسم جهة الاتصال" value={newContact.name} onChange={(e) => setNewContact(p => ({ ...p, name: e.target.value }))} dir="rtl" />
                </div>
                <div>
                  <Label className="text-xs">النوع</Label>
                  <Select value={newContact.type} onValueChange={(v) => setNewContact(p => ({ ...p, type: v, balance_direction: v === "مورد" ? "credit" : "debit" }))} dir="rtl">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover z-[60]">
                      {contactTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">التصنيف</Label>
                  <Select value={newContact.contact_class} onValueChange={(v) => setNewContact(p => ({ ...p, contact_class: v }))} dir="rtl">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover z-[60]">
                      <SelectItem value="A">A - مميز</SelectItem>
                      <SelectItem value="B">B - جيد</SelectItem>
                      <SelectItem value="C">C - عادي</SelectItem>
                      <SelectItem value="D">D - مخاطرة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">القطاع</Label>
                  <Input placeholder="مثال: تجزئة" value={newContact.industry} onChange={(e) => setNewContact(p => ({ ...p, industry: e.target.value }))} dir="rtl" />
                </div>
              </div>
            </section>

            {/* بيانات التواصل */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground tracking-wide">بيانات التواصل</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">الهاتف</Label>
                  <Input placeholder="رقم الهاتف" value={newContact.phone} onChange={(e) => setNewContact(p => ({ ...p, phone: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">البريد الإلكتروني</Label>
                  <Input placeholder="email@example.com" value={newContact.email} onChange={(e) => setNewContact(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">العنوان</Label>
                  <Input placeholder="العنوان" value={newContact.address} onChange={(e) => setNewContact(p => ({ ...p, address: e.target.value }))} dir="rtl" />
                </div>
              </div>
            </section>

            {/* بيانات ضريبية */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground tracking-wide">بيانات ضريبية</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">الرقم الضريبي</Label>
                  <Input placeholder="رقم ضريبي" value={newContact.tax_number} onChange={(e) => setNewContact(p => ({ ...p, tax_number: e.target.value }))} />
                </div>
              </div>
            </section>

            {/* سياسة الائتمان */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <Hand className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground tracking-wide">سياسة الائتمان</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">سقف الائتمان ₪</Label>
                  <Input type="number" placeholder="0" value={newContact.credit_limit} onChange={(e) => setNewContact(p => ({ ...p, credit_limit: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">أيام الدفع</Label>
                  <Input type="number" placeholder="30" value={newContact.payment_terms_days} onChange={(e) => setNewContact(p => ({ ...p, payment_terms_days: e.target.value }))} />
                </div>
              </div>
            </section>

            {/* الرصيد الافتتاحي */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground tracking-wide">الرصيد الافتتاحي</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">الرصيد الافتتاحي ₪</Label>
                  <Input type="number" placeholder="0" value={newContact.opening_balance} onChange={(e) => setNewContact(p => ({ ...p, opening_balance: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">طبيعة الرصيد</Label>
                  <Select value={newContact.balance_direction} onValueChange={(v: "debit" | "credit") => setNewContact(p => ({ ...p, balance_direction: v }))} dir="rtl">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover z-[60]">
                      <SelectItem value="debit">مدين (إلنا رصيد)</SelectItem>
                      <SelectItem value="credit">دائن (علينا دين)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* ملاحظات */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <Pencil className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground tracking-wide">ملاحظات</h3>
              </div>
              <Textarea placeholder="ملاحظات..." value={newContact.notes} onChange={(e) => setNewContact(p => ({ ...p, notes: e.target.value }))} dir="rtl" rows={2} />
            </section>
          </div>
          <DialogFooter className="px-6 py-3 border-t bg-muted/30 flex-row-reverse gap-2 sm:justify-start">
            <Button onClick={handleAddContact} disabled={adding || !newContact.name.trim()}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 ml-1" /> إضافة</>}
            </Button>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={adding}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editContact} onOpenChange={(o) => !o && setEditContact(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0" dir="rtl">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Pencil className="h-5 w-5 text-primary" />
              تعديل جهة الاتصال
            </DialogTitle>
            <DialogDescription>
              عدّل البيانات الأساسية وبيانات التواصل والشروط المالية. لا يؤثر التعديل على الحركات السابقة.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-5 space-y-6">
            {/* معلومات أساسية */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <ContactRound className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground tracking-wide">معلومات أساسية</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">الاسم</Label>
                  <Input value={editData.contact_name || ""} onChange={(e) => setEditData((p: any) => ({ ...p, contact_name: e.target.value }))} dir="rtl" />
                </div>
                <div>
                  <Label className="text-xs">النوع</Label>
                  <Select value={editData.contact_type || "عميل"} onValueChange={(v) => setEditData((p: any) => ({ ...p, contact_type: v }))} dir="rtl">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover z-[60]">
                      {contactTypeOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">التصنيف</Label>
                  <Select value={editData.contact_class || "C"} onValueChange={(v) => setEditData((p: any) => ({ ...p, contact_class: v }))} dir="rtl">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover z-[60]">
                      <SelectItem value="A">A - مميز</SelectItem>
                      <SelectItem value="B">B - جيد</SelectItem>
                      <SelectItem value="C">C - عادي</SelectItem>
                      <SelectItem value="D">D - مخاطرة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">الشريحة</Label>
                  <Select value={editData.contact_segment || ""} onValueChange={(v) => setEditData((p: any) => ({ ...p, contact_segment: v }))} dir="rtl">
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent className="bg-popover z-[60]">
                      <SelectItem value="VIP">VIP</SelectItem>
                      <SelectItem value="عادي">عادي</SelectItem>
                      <SelectItem value="مخاطرة عالية">مخاطرة عالية</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">القطاع</Label>
                  <Input value={editData.industry || ""} onChange={(e) => setEditData((p: any) => ({ ...p, industry: e.target.value }))} dir="rtl" />
                </div>
              </div>
            </section>

            {/* بيانات التواصل */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground tracking-wide">بيانات التواصل</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">الهاتف</Label>
                  <Input value={editData.phone || ""} onChange={(e) => setEditData((p: any) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">البريد</Label>
                  <Input value={editData.email || ""} onChange={(e) => setEditData((p: any) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">العنوان</Label>
                  <Input value={editData.address || ""} onChange={(e) => setEditData((p: any) => ({ ...p, address: e.target.value }))} dir="rtl" />
                </div>
              </div>
            </section>

            {/* بيانات ضريبية */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground tracking-wide">بيانات ضريبية</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">الرقم الضريبي</Label>
                  <Input value={editData.tax_number || ""} onChange={(e) => setEditData((p: any) => ({ ...p, tax_number: e.target.value }))} />
                </div>
              </div>
            </section>

            {/* سياسة الائتمان */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <Hand className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground tracking-wide">سياسة الائتمان</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
              </div>
            </section>

            {/* الرصيد الافتتاحي */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground tracking-wide">الرصيد الافتتاحي</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">الرصيد الافتتاحي ₪</Label>
                  <Input type="number" placeholder="0" value={editData.opening_balance || ""} onChange={(e) => setEditData((p: any) => ({ ...p, opening_balance: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">طبيعة الرصيد</Label>
                  <Select value={editData.balance_direction || "credit"} onValueChange={(v) => setEditData((p: any) => ({ ...p, balance_direction: v }))} dir="rtl">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover z-[60]">
                      <SelectItem value="debit">مدين (إلنا رصيد)</SelectItem>
                      <SelectItem value="credit">دائن (علينا دين)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* ملاحظات */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border/60">
                <Pencil className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground tracking-wide">ملاحظات</h3>
              </div>
              <Textarea value={editData.notes || ""} onChange={(e) => setEditData((p: any) => ({ ...p, notes: e.target.value }))} dir="rtl" rows={2} />
            </section>
          </div>
          <DialogFooter className="px-6 py-3 border-t bg-muted/30 flex-row-reverse gap-2 sm:justify-start">
            <Button onClick={handleEditContact} disabled={editing}>
              {editing ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
            </Button>
            <Button variant="outline" onClick={() => setEditContact(null)} disabled={editing}>إلغاء</Button>
          </DialogFooter>
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

      {/* Archive + Reverse Confirmation */}
      <AlertDialog open={!!reverseContact} onOpenChange={(o) => !o && setReverseContact(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-orange-600">أرشفة مع عكس كامل الحركات</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                سيتم إنشاء قيد عكسي IFRS لكل حركة مالية مرتبطة بـ "{reverseContact?.contact_name}" (الفواتير، السندات، إلخ)،
                ثم أرشفة الجهة. الحركات الأصلية تبقى محفوظة بختم "عكس قيد" للتدقيق.
              </span>
              <span className="block text-destructive font-semibold">
                ⚠️ هذا الإجراء يصفّر رصيد الجهة محاسبياً ولا يمكن التراجع عنه إلا يدوياً. يتطلب صلاحية مدير أو محاسب أول.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={handleArchiveWithReversals} disabled={reversing} className="bg-orange-600 text-white hover:bg-orange-700">
              {reversing ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد الأرشفة والعكس"}
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
              <AlertTriangle className="h-5 w-5 text-destructive" />
              الفواتير المتأخرة — {overdueContact?.contact_name}
            </DialogTitle>
            <DialogDescription>قائمة الفواتير التي تجاوز تاريخ استحقاقها مع المبلغ المتبقي وعدد أيام التأخير.</DialogDescription>
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
                        <td className="p-2 text-xs font-bold text-destructive tabular-nums">₪{money2(inv.remaining_amount)}</td>
                        <td className="p-2 text-xs font-bold text-destructive tabular-nums">{daysLate} يوم</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ContactsPage;
