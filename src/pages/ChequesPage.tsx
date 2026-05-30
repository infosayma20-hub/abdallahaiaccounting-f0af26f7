import { useState, useEffect, useMemo, useRef, Fragment, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  FileText, Plus, Search, CheckCircle2,
  Clock, AlertTriangle, Ban, RefreshCw, ChevronDown,
  Building2, Calendar, Hash, User, Banknote,
  ArrowDownCircle, ArrowUpCircle, Eye, Trash2,
  ArrowUpDown, Zap, Download, Printer, FileSpreadsheet,
  ChevronLeft, ChevronRight, Loader2, X, Send, Undo2
} from "lucide-react";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserPlus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import ChequeActionModal, { type ActionType, type ActionFormData, ACTION_CONFIGS } from "@/components/cheques/ChequeActionModal";
import ChequeTimeline from "@/components/cheques/ChequeTimeline";
import UnendorseChequeDialog from "@/components/cheques/UnendorseChequeDialog";
import UndepositChequeDialog from "@/components/cheques/UndepositChequeDialog";

import { setNextExportBranding } from "@/lib/excel-export";
import {
  FinanceShell,
  applyFilters,
  type ActionTab,
  type FilterCondition,
  type FilterField,
} from "@/components/finance/shell";
import { ColumnVisibilityMenu } from "@/components/finance/shell/ColumnVisibilityMenu";
import {
  useColumnVisibility,
  type ColumnDef,
} from "@/components/finance/shell/useColumnVisibility";
import { isChequesRpcEnabled, callChequeLifecycleRpc, type ChequeRpcEvent } from "@/lib/cheque-rpc";
type ChequeStatus = 'مسجل' | 'آجل' | 'مستحق' | 'مودع' | 'محصل' | 'مرتجع' | 'ملغي' | 'مظهر' | 'مصروف';
type ChequeType = 'وارد' | 'صادر';

interface Cheque {
  id: string;
  cheque_type: ChequeType;
  status: ChequeStatus;
  cheque_number: string | null;
  bank_name: string | null;
  cheque_date: string;
  amount: number;
  currency: string;
  party_name: string;
  party_type: string;
  linked_account: string | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  deposit_bank_account_id?: string | null;
  endorsed_to_name?: string | null;
  source_bank_account_id?: string | null;
  contact_id?: string | null;
  cashed_date?: string | null;
}

interface StatusHistory {
  id: string;
  from_status: ChequeStatus | null;
  to_status: ChequeStatus;
  created_at: string;
  reason: string | null;
  action_type?: string | null;
  linked_transaction_id?: string | null;
  details?: Record<string, any> | null;
}

const statusConfig: Record<ChequeStatus, { icon: any; color: string; bg: string; badgeClass: string; label: string }> = {
  'مسجل': { icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted/50', badgeClass: 'bg-muted/60 text-muted-foreground', label: 'مسجل' },
  'آجل': { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-500/10', badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', label: 'آجل' },
  'مستحق': { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-500/10', badgeClass: 'bg-red-500/15 text-red-700 dark:text-red-400', label: 'مستحق' },
  'مودع': { icon: Building2, color: 'text-blue-600', bg: 'bg-blue-500/10', badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', label: 'مودع' },
  'محصل': { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-500/10', badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', label: 'محصل' },
  'مرتجع': { icon: RefreshCw, color: 'text-rose-700', bg: 'bg-rose-500/10', badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-400', label: 'مرتجع' },
  'ملغي': { icon: Ban, color: 'text-muted-foreground', bg: 'bg-muted/30', badgeClass: 'bg-muted/40 text-muted-foreground', label: 'ملغي' },
  'مظهر': { icon: Send, color: 'text-purple-600', bg: 'bg-purple-500/10', badgeClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-400', label: 'مظهَّر' },
  'مصروف': { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-500/10', badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', label: 'مصروف' },
};

const getAvailableActions = (status: ChequeStatus, chequeType: ChequeType): ActionType[] => {
  if (chequeType === 'صادر') {
    switch (status) {
      case 'مسجل': case 'آجل': case 'مستحق': return ['cashed', 'recover', 'cancel'];
      case 'مرتجع': return ['cashed', 'cancel'];
      default: return [];
    }
  }
  switch (status) {
    case 'مسجل': case 'آجل': case 'مستحق': return ['deposit', 'endorse', 'return_to_customer', 'cancel'];
    case 'مودع': return ['collected', 'bounced'];
    case 'مظهر': return ['collected', 'return_to_customer'];
    case 'مرتجع': return ['deposit', 'endorse', 'cancel'];
    default: return [];
  }
};

const PENDING_STATUSES = ['مسجل', 'آجل', 'مستحق', 'مودع'];
// Statuses that should still trigger due-date alerts/follow-up.
// "مظهر" stays endorsed (not back in our hands), but we still need to
// watch its due date because we are liable if the endorsee bounces it.
const DUE_WATCH_STATUSES = [...PENDING_STATUSES, 'مظهر'];
const PER_PAGE = 15;
type SortKey = 'party_name' | 'cheque_type' | 'amount' | 'cheque_date' | 'status' | 'bank_name' | 'cheque_number' | 'created_at';
type SortDir = 'asc' | 'desc';

const ChequesPage = () => {
  const { user } = useAuth();
  const { settings } = useCompanySettings();
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("الكل");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusHistory, setStatusHistory] = useState<Record<string, StatusHistory[]>>({});
  const [deleteTarget, setDeleteTarget] = useState<Cheque | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [contacts, setContacts] = useState<{ id: string; contact_name: string; contact_type: string }[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string; bank_name: string; gl_account_code: string | null }[]>([]);
  const [partySearch, setPartySearch] = useState("");
  const [partyDropdownOpen, setPartyDropdownOpen] = useState(false);
  const [partyHighlight, setPartyHighlight] = useState(0);
  const partyDropdownRef = useRef<HTMLDivElement>(null);
  const [quickAddingContact, setQuickAddingContact] = useState(false);
  const [actionTarget, setActionTarget] = useState<Cheque | null>(null);
  const [unendorseTarget, setUnendorseTarget] = useState<Cheque | null>(null);
  const [undepositTarget, setUndepositTarget] = useState<Cheque | null>(null);
  const [actionType, setActionType] = useState<ActionType | null>(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("cheque_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('all');
  const [shellFilters, setShellFilters] = useState<FilterCondition[]>([]);

  // ============ COLUMN VISIBILITY ============
  const columnDefs: ColumnDef[] = useMemo(() => ([
    { key: 'select', label: 'تحديد', required: true },
    { key: 'cheque_type', label: 'النوع', required: true },
    { key: 'cheque_number', label: 'رقم الشيك' },
    { key: 'party_name', label: 'الجهة', required: true },
    { key: 'bank_name', label: 'البنك' },
    { key: 'amount', label: 'المبلغ', required: true },
    { key: 'created_at', label: 'تاريخ الإصدار', defaultVisible: false },
    { key: 'cheque_date', label: 'تاريخ الاستحقاق', required: true },
    { key: 'remaining', label: 'المتبقي' },
    { key: 'status', label: 'الحالة', required: true },
    { key: 'actions', label: 'إجراءات', required: true },
  ]), []);
  const colState = useColumnVisibility('cheques-page', columnDefs);
  const show = colState.isVisible;
  // Always-visible required cells = 7 (select, type, party, amount, cheque_date, status, actions).
  // Optional cells (cheque_number, bank_name, created_at, remaining) add when shown.
  const visibleColCount = useMemo(
    () => columnDefs.filter(c => colState.isVisible(c.key)).length,
    [columnDefs, colState],
  );

  interface ChequeRow {
    cheque_type: ChequeType;
    cheque_number: string;
    bank_name: string;
    bank_account: string;
    cheque_date: string;
    issue_date: string;
    amount: string;
    currency: string;
    exchange_rate: string;
    party_name: string;
    party_type: string;
    linked_account: string;
    notes: string;
    source_bank_account_id: string;
    deposit_cash_box_id: string;
  }

  const emptyChequeRow = (type: ChequeType): ChequeRow => ({
    cheque_type: type,
    cheque_number: '',
    bank_name: '',
    bank_account: '',
    cheque_date: '',
    issue_date: new Date().toISOString().split('T')[0],
    amount: '',
    currency: 'شيكل',
    exchange_rate: '',
    party_name: '',
    party_type: type === 'وارد' ? 'عميل' : 'مورد',
    linked_account: '',
    notes: '',
    source_bank_account_id: '',
    deposit_cash_box_id: '',
  });

  const [addType, setAddType] = useState<ChequeType>('وارد');
  const [newCheques, setNewCheques] = useState([emptyChequeRow('وارد')]);

  const openAddDialog = (type: ChequeType) => {
    setAddType(type);
    setNewCheques([emptyChequeRow(type)]);
    setPartySearch('');
    setAddOpen(true);
  };

  const updateChequeRow = (index: number, field: string, value: any) => {
    setNewCheques(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
  };

  const addChequeRow = () => {
    const last = newCheques[newCheques.length - 1];
    const nextNum = last.cheque_number ? String(parseInt(last.cheque_number) + 1 || '') : '';
    setNewCheques(prev => [...prev, {
      ...emptyChequeRow(addType),
      party_name: last.party_name,
      party_type: last.party_type,
      bank_name: last.bank_name,
      bank_account: last.bank_account,
      source_bank_account_id: last.source_bank_account_id,
      currency: last.currency,
      exchange_rate: last.exchange_rate,
      cheque_date: last.cheque_date,
      cheque_number: nextNum,
    }]);
  };

  const removeChequeRow = (index: number) => {
    if (newCheques.length <= 1) return;
    setNewCheques(prev => prev.filter((_, i) => i !== index));
  };

  // =================== DATA FETCHING ===================
  const fetchBankAccounts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('bank_accounts').select('id, name, bank_name, gl_account_code').eq('user_id', user.id).eq('is_active', true);
    setBankAccounts(data || []);
  }, [user]);

  const fetchContacts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('contacts').select('id, contact_name, contact_type').eq('user_id', user.id).eq('is_active', true).neq('is_archived', true);
    setContacts(data || []);
  }, [user]);

  const fetchCheques = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.from('cheques').select('*').eq('user_id', user.id).order('cheque_date', { ascending: false });
    if (error) toast.error("خطأ في جلب الشيكات");
    else setCheques((data || []) as unknown as Cheque[]);
    setLoading(false);
  }, [user]);

  const findContactId = (partyName: string): string | null => {
    return contacts.find(c => c.contact_name === partyName)?.id || null;
  };

  const fetchHistory = async (chequeId: string) => {
    if (statusHistory[chequeId]) return;
    const { data } = await supabase.from('cheque_status_history').select('*').eq('cheque_id', chequeId).order('created_at', { ascending: false });
    setStatusHistory(prev => ({ ...prev, [chequeId]: (data || []) as StatusHistory[] }));
  };

  const handleQuickAddContact = async (name: string) => {
    if (!user || !name.trim()) return;
    setQuickAddingContact(true);
    try {
      const contactType = addType === 'وارد' ? 'عميل' : 'مورد';
      const { error } = await supabase.from('contacts').insert({ user_id: user.id, contact_name: name.trim(), contact_type: contactType });
      if (error) throw error;
      toast.success(`تم إضافة "${name.trim()}" كـ${contactType} جديد`);
      setNewCheques(prev => prev.map(r => ({ ...r, party_name: name.trim() })));
      setPartySearch(name.trim());
      setPartyDropdownOpen(false);
      fetchContacts();
    } catch { toast.error("خطأ في إضافة جهة الاتصال"); }
    finally { setQuickAddingContact(false); }
  };

  // =================== ADD HANDLER ===================
  const handleAdd = async () => {
    if (!user) return;
    for (let i = 0; i < newCheques.length; i++) {
      const row = newCheques[i];
      if (!row.party_name || !row.amount || !row.cheque_date) {
        toast.error(`يرجى تعبئة الحقول المطلوبة في الشيك ${i + 1}`); return;
      }
      if (!row.cheque_number) {
        toast.error(`يرجى إدخال رقم الشيك ${i + 1}`); return;
      }
      if (!row.bank_name && addType === 'وارد') {
        toast.error(`يرجى إدخال اسم البنك في الشيك ${i + 1}`); return;
      }
      if (addType === 'صادر' && !row.source_bank_account_id) {
        toast.error(`يرجى اختيار الحساب البنكي في الشيك ${i + 1}`); return;
      }
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      for (const row of newCheques) {
        const today = new Date().toISOString().split('T')[0];
        const chequeStatus: ChequeStatus = row.cheque_date > today ? 'آجل' : 'مستحق';
        const amount = parseFloat(row.amount);
        const contactId = findContactId(row.party_name);
        const sourceBank = bankAccounts.find(b => b.id === row.source_bank_account_id);

        const { data: chequeData, error } = await supabase.from('cheques').insert({
          user_id: user.id, cheque_type: addType, status: chequeStatus,
          cheque_number: row.cheque_number || null,
          bank_name: addType === 'صادر' ? (sourceBank?.bank_name || row.bank_name || null) : (row.bank_name || null),
          cheque_date: row.cheque_date, amount, currency: row.currency,
          party_name: row.party_name, party_type: row.party_type,
          linked_account: row.linked_account || null, notes: row.notes || null,
          source_bank_account_id: row.source_bank_account_id || null,
          contact_id: contactId,
          account_number: row.bank_account?.trim() || null,
        } as any).select('id').single();
        if (error) throw error;
        const chequeId = chequeData?.id || '';

        // Journal entry
        if (addType === 'وارد') {
          await supabase.from('transactions').insert({
            user_id: user.id, transaction_date: row.cheque_date,
            description: `تسجيل شيك وارد - ${row.party_name} #${row.cheque_number || ''}`,
            debit_account_code: '1150', credit_account_code: '1130',
            amount, currency: row.currency || 'شيكل',
            transaction_type: 'cheque_register', contact_id: contactId,
            reference: `CHQ-REG-${chequeId.slice(0, 8)}`,
            idempotency_key: `CHQ-REG-${chequeId}`,
            ...(row.exchange_rate ? { exchange_rate: parseFloat(row.exchange_rate), foreign_amount: amount } : {}),
          });
        } else {
          await supabase.from('transactions').insert({
            user_id: user.id, transaction_date: row.cheque_date,
            description: `تسجيل شيك صادر - ${row.party_name} #${row.cheque_number || ''}`,
            debit_account_code: '2110', credit_account_code: '1160',
            amount, currency: row.currency || 'شيكل',
            transaction_type: 'cheque_register', contact_id: contactId,
            reference: `CHQ-REG-${chequeId.slice(0, 8)}`,
            idempotency_key: `CHQ-REG-${chequeId}`,
            ...(row.exchange_rate ? { exchange_rate: parseFloat(row.exchange_rate), foreign_amount: amount } : {}),
          });
        }

        await supabase.from('cheque_status_history').insert({
          cheque_id: chequeId, user_id: user.id,
          from_status: null, to_status: chequeStatus, action_type: 'register',
        });
      }
      toast.success(`تم تسجيل ${newCheques.length} شيك ${addType} وإنشاء القيود`);
      setAddOpen(false);
      setNewCheques([emptyChequeRow(addType)]);
      setPartySearch('');
      fetchCheques();
    } catch { toast.error("خطأ في حفظ الشيكات"); }
    finally { setSubmitting(false); }
  };

  // =================== ACTION HANDLER ===================
  const handleAction = async (data: ActionFormData) => {
    if (!actionTarget || !user) return;
    setActionSubmitting(true);
    try {
      const config = ACTION_CONFIGS[data.action];
      const newStatus = config.nextStatus as ChequeStatus;
      const updatePayload: Record<string, any> = { status: newStatus };
      let txId: string | null = null;
      const cheque = actionTarget;

      // ─────────────────────────────────────────────────────────────
      // Phase 6 — RPC PATH (gated by feature flag `cheques_use_rpc`).
      // Default OFF. When ON, lifecycle accounting goes through the
      // single `create_cheque_lifecycle_event` RPC instead of direct
      // inserts. Status update + history are still written below using
      // the legacy code path so UI behavior remains identical.
      // ─────────────────────────────────────────────────────────────
      const useRpc = isChequesRpcEnabled(settings);
      if (useRpc) {
        const eventMap: Record<ActionType, ChequeRpcEvent | null> = {
          deposit: 'deposit',
          collected: 'collect',
          bounced: 'bounce',
          endorse: 'endorse',
          cancel: 'cancel_with_reverse',
          cashed: 'cashed',
          outgoing_bounced: 'outgoing_bounced',
          recover: 'recover',
          return_to_customer: 'return_to_customer',
        } as any;
        const evt = eventMap[data.action];
        if (evt) {
          // Resolve bank account code where the event needs one
          let bankCode: string | null = null;
          if (data.action === 'deposit') {
            const bank = bankAccounts.find(b => b.id === data.bankAccountId);
            bankCode = bank?.gl_account_code || null;
            if (data.bankAccountId) updatePayload.deposit_bank_account_id = data.bankAccountId;
            if (data.depositDate) updatePayload.deposit_date = data.depositDate;
            if (bankCode) updatePayload.linked_account = bankCode;
          } else if (data.action === 'collected') {
            const bank = bankAccounts.find(b => b.id === cheque.deposit_bank_account_id);
            bankCode = bank?.gl_account_code || '1120';
            if (data.collectionDate) updatePayload.collection_date = data.collectionDate;
          } else if (data.action === 'cashed') {
            const sb = bankAccounts.find(b => b.id === cheque.source_bank_account_id);
            bankCode = sb?.gl_account_code || '1120';
            if (data.cashedDate) updatePayload.cashed_date = data.cashedDate;
          } else if (data.action === 'bounced' || data.action === 'outgoing_bounced') {
            if (data.bounceDate) updatePayload.bounce_date = data.bounceDate;
            if (data.bounceReason) updatePayload.bounce_reason = data.bounceReason;
            updatePayload.bank_fees = data.bankFees || 0;
          } else if (data.action === 'endorse') {
            updatePayload.endorsed_to_name = data.endorsedToName;
            updatePayload.endorsed_to_contact_id = data.endorsedToContactId;
          }

          const eventDate =
            data.depositDate || data.collectionDate || data.bounceDate || data.cashedDate ||
            new Date().toISOString().split('T')[0];

          const reason =
            data.bounceReason || data.cancelReason || data.returnReason || data.recoverReason || null;

          const result = await callChequeLifecycleRpc({
            userId: user.id,
            chequeId: cheque.id,
            event: evt,
            eventDate,
            bankAccountCode: bankCode,
            notes: data.notes || null,
            bankFees: (data.action === 'bounced' || data.action === 'outgoing_bounced') ? (data.bankFees || null) : null,
            endorsedToContactId: data.action === 'endorse' ? (data.endorsedToContactId || null) : null,
            reason,
          });

          if (!result.success) throw new Error(result.error || 'فشل تنفيذ الإجراء');
          txId = result.transaction_id || null;

          // Apply UI-side updates (status + extra columns) — RPC already updated cheque.status,
          // but we keep the explicit update for non-accounting columns (deposit_bank_account_id, etc.)
          const { error: updErr } = await supabase.from('cheques').update(updatePayload as any).eq('id', cheque.id);
          if (updErr) throw updErr;

          // RPC already wrote cheque_status_history; just refresh UI
          setStatusHistory(prev => { const n = { ...prev }; delete n[cheque.id]; return n; });
          toast.success(`تم: ${config.emoji} ${config.label} (RPC)`);
          setActionTarget(null);
          setActionType(null);
          fetchCheques();
          setActionSubmitting(false);
          return;
        }
        // Fall through to legacy path if event not mapped
      }

      if (data.action === 'deposit') {
        updatePayload.deposit_bank_account_id = data.bankAccountId;
        updatePayload.deposit_date = data.depositDate;
        const bank = bankAccounts.find(b => b.id === data.bankAccountId);
        updatePayload.linked_account = bank?.gl_account_code || cheque.linked_account;
        const { data: txResult } = await supabase.from('transactions').insert({
          user_id: user.id, transaction_date: data.depositDate || new Date().toISOString().split('T')[0],
          description: `إيداع شيك وارد - ${cheque.party_name} #${cheque.cheque_number || ''}`,
          debit_account_code: '1125', credit_account_code: '1150',
          amount: cheque.amount, currency: cheque.currency || 'شيكل',
          transaction_type: 'cheque_deposit', reference: `CHQ-DEP-${cheque.id.slice(0, 8)}`,
          idempotency_key: `CHQ-DEP-${cheque.id}`,
        }).select('id').single();
        txId = txResult?.id || null;
      }

      if (data.action === 'collected') {
        updatePayload.collection_date = data.collectionDate;
        const bank = bankAccounts.find(b => b.id === cheque.deposit_bank_account_id);
        const bankCode = bank?.gl_account_code || '1120';
        const { data: txResult } = await supabase.from('transactions').insert({
          user_id: user.id, transaction_date: data.collectionDate || new Date().toISOString().split('T')[0],
          description: `تحصيل شيك وارد - ${cheque.party_name} #${cheque.cheque_number || ''}`,
          debit_account_code: bankCode, credit_account_code: '1125',
          amount: cheque.amount, currency: cheque.currency || 'شيكل',
          transaction_type: 'cheque_collection', reference: `CHQ-COL-${cheque.id.slice(0, 8)}`,
          idempotency_key: `CHQ-COL-${cheque.id}`,
        }).select('id').single();
        txId = txResult?.id || null;
      }

      if (data.action === 'bounced') {
        updatePayload.bounce_date = data.bounceDate;
        updatePayload.bounce_reason = data.bounceReason;
        updatePayload.bank_fees = data.bankFees || 0;
        const contactId = findContactId(cheque.party_name);
        const { data: txResult } = await supabase.from('transactions').insert({
          user_id: user.id, transaction_date: data.bounceDate || new Date().toISOString().split('T')[0],
          description: `شيك مرتجع - ${cheque.party_name} #${cheque.cheque_number || ''} - ${data.bounceReason}`,
          debit_account_code: '1130', credit_account_code: '1125',
          amount: cheque.amount, currency: cheque.currency || 'شيكل',
          transaction_type: 'cheque_bounce', contact_id: contactId,
          reference: `CHQ-BNC-${cheque.id.slice(0, 8)}`,
          idempotency_key: `CHQ-BNC-${cheque.id}`,
        }).select('id').single();
        txId = txResult?.id || null;
        if (data.bankFees && data.bankFees > 0) {
          await supabase.from('transactions').insert({
            user_id: user.id, transaction_date: data.bounceDate || new Date().toISOString().split('T')[0],
            description: `رسوم بنكية - شيك مرتجع ${cheque.cheque_number || ''}`,
            debit_account_code: '5200', credit_account_code: '1120',
            amount: data.bankFees, currency: 'شيكل',
            transaction_type: 'bank_fee', reference: `CHQ-FEE-${cheque.id.slice(0, 8)}`,
            idempotency_key: `CHQ-FEE-${cheque.id}`,
          });
        }
      }

      if (data.action === 'endorse') {
        // Endorsement MUST go through the unified RPC
        // (preserves original_contact_id, prevents duplicate endorsements,
        //  enforces fiscal-period lock, validates supplier contact_id).
        if (!data.endorsedToContactId) {
          throw new Error('تجيير الشيك يتطلب اختيار المورد المظهَّر إليه من القائمة (contact_id).');
        }
        const result = await callChequeLifecycleRpc({
          userId: user.id,
          chequeId: cheque.id,
          event: 'endorse',
          eventDate: new Date().toISOString().split('T')[0],
          bankAccountCode: null,
          notes: data.notes || null,
          bankFees: null,
          endorsedToContactId: data.endorsedToContactId,
          reason: null,
        });
        if (!result.success) throw new Error(result.error || 'فشل تنفيذ التجيير');
        // RPC already updated cheque + history; just refresh UI
        setStatusHistory(prev => { const n = { ...prev }; delete n[cheque.id]; return n; });
        toast.success(`تم تظهير الشيك للمورد`);
        setActionTarget(null);
        setActionType(null);
        fetchCheques();
        setActionSubmitting(false);
        return;
      }

      if (data.action === 'return_to_customer') {
        const contactId = findContactId(cheque.party_name);
        const today = new Date().toISOString().split('T')[0];
        const { data: txResult } = await supabase.from('transactions').insert({
          user_id: user.id, transaction_date: today,
          description: `إرجاع شيك للزبون - ${cheque.party_name} #${cheque.cheque_number || ''} - ${data.returnReason || ''}`,
          debit_account_code: '1130', credit_account_code: '1150',
          amount: cheque.amount, currency: cheque.currency || 'شيكل',
          transaction_type: 'cheque_return', contact_id: contactId,
          reference: `CHQ-RTN-${cheque.id.slice(0, 8)}`,
          idempotency_key: `CHQ-RTN-${cheque.id}`,
        }).select('id').single();
        txId = txResult?.id || null;
      }

      if (data.action === 'cancel') {
        const contactId = findContactId(cheque.party_name);
        const today = new Date().toISOString().split('T')[0];
        if (cheque.cheque_type === 'وارد') {
          const { data: txResult } = await supabase.from('transactions').insert({
            user_id: user.id, transaction_date: today,
            description: `إلغاء شيك وارد - ${cheque.party_name} #${cheque.cheque_number || ''} - ${data.cancelReason || ''}`,
            debit_account_code: '1130', credit_account_code: '1150',
            amount: cheque.amount, currency: cheque.currency || 'شيكل',
            transaction_type: 'cheque_cancel', contact_id: contactId,
            reference: `CHQ-CAN-${cheque.id.slice(0, 8)}`,
            idempotency_key: `CHQ-CAN-${cheque.id}`,
          }).select('id').single();
          txId = txResult?.id || null;
        } else {
          const { data: txResult } = await supabase.from('transactions').insert({
            user_id: user.id, transaction_date: today,
            description: `إلغاء شيك صادر - ${cheque.party_name} #${cheque.cheque_number || ''} - ${data.cancelReason || ''}`,
            debit_account_code: '1160', credit_account_code: '2110',
            amount: cheque.amount, currency: cheque.currency || 'شيكل',
            transaction_type: 'cheque_cancel', contact_id: contactId,
            reference: `CHQ-CAN-${cheque.id.slice(0, 8)}`,
            idempotency_key: `CHQ-CAN-${cheque.id}`,
          }).select('id').single();
          txId = txResult?.id || null;
        }
      }

      if (data.action === 'cashed') {
        updatePayload.cashed_date = data.cashedDate;
        const contactId = cheque.contact_id || findContactId(cheque.party_name);
        const sourceBank = bankAccounts.find(b => b.id === cheque.source_bank_account_id);
        const bankGlCode = sourceBank?.gl_account_code || '1120';
        const { data: txResult } = await supabase.from('transactions').insert({
          user_id: user.id, transaction_date: data.cashedDate || new Date().toISOString().split('T')[0],
          description: `صرف شيك صادر - ${cheque.party_name} #${cheque.cheque_number || ''}`,
          debit_account_code: '1160', credit_account_code: bankGlCode,
          amount: cheque.amount, currency: cheque.currency || 'شيكل',
          transaction_type: 'cheque_cashed', contact_id: contactId,
          reference: `CHQ-CASH-${cheque.id.slice(0, 8)}`,
          idempotency_key: `CHQ-CASH-${cheque.id}`,
        }).select('id').single();
        txId = txResult?.id || null;
      }

      if (data.action === 'outgoing_bounced') {
        updatePayload.bounce_date = data.bounceDate;
        updatePayload.bounce_reason = data.bounceReason;
        updatePayload.bank_fees = data.bankFees || 0;
        const contactId = cheque.contact_id || findContactId(cheque.party_name);
        const { data: txResult } = await supabase.from('transactions').insert({
          user_id: user.id, transaction_date: data.bounceDate || new Date().toISOString().split('T')[0],
          description: `شيك صادر مرتجع - ${cheque.party_name} #${cheque.cheque_number || ''} - ${data.bounceReason}`,
          debit_account_code: '1160', credit_account_code: '2110',
          amount: cheque.amount, currency: cheque.currency || 'شيكل',
          transaction_type: 'cheque_bounce', contact_id: contactId,
          reference: `CHQ-OBNC-${cheque.id.slice(0, 8)}`,
          idempotency_key: `CHQ-OBNC-${cheque.id}`,
        }).select('id').single();
        txId = txResult?.id || null;
        if (data.bankFees && data.bankFees > 0) {
          await supabase.from('transactions').insert({
            user_id: user.id, transaction_date: data.bounceDate || new Date().toISOString().split('T')[0],
            description: `رسوم بنكية - شيك صادر مرتجع ${cheque.cheque_number || ''}`,
            debit_account_code: '5200', credit_account_code: '1120',
            amount: data.bankFees, currency: 'شيكل',
            transaction_type: 'bank_fee', reference: `CHQ-OFEE-${cheque.id.slice(0, 8)}`,
            idempotency_key: `CHQ-OFEE-${cheque.id}`,
          });
        }
      }

      if (data.action === 'recover') {
        const contactId = cheque.contact_id || findContactId(cheque.party_name);
        const today = new Date().toISOString().split('T')[0];
        const { data: txResult } = await supabase.from('transactions').insert({
          user_id: user.id, transaction_date: today,
          description: `استرداد شيك صادر - ${cheque.party_name} #${cheque.cheque_number || ''} - ${data.recoverReason || ''}`,
          debit_account_code: '1160', credit_account_code: '2110',
          amount: cheque.amount, currency: cheque.currency || 'شيكل',
          transaction_type: 'cheque_recover', contact_id: contactId,
          reference: `CHQ-RCV-${cheque.id.slice(0, 8)}`,
          idempotency_key: `CHQ-RCV-${cheque.id}`,
        }).select('id').single();
        txId = txResult?.id || null;
      }

      const { error } = await supabase.from('cheques').update(updatePayload as any).eq('id', cheque.id);
      if (error) throw error;

      const historyDetails: Record<string, any> = {};
      if (data.action === 'deposit') { const bank = bankAccounts.find(b => b.id === data.bankAccountId); historyDetails.bank_name = bank?.name; }
      // 'endorse' handled exclusively via RPC above (returns early)
      if (data.action === 'bounced' || data.action === 'outgoing_bounced') { historyDetails.bounce_reason = data.bounceReason; historyDetails.bank_fees = data.bankFees; }
      if (data.action === 'cashed') { const sb = bankAccounts.find(b => b.id === cheque.source_bank_account_id); historyDetails.source_bank = sb?.name; }
      if (data.action === 'recover') historyDetails.recover_reason = data.recoverReason;

      await supabase.from('cheque_status_history').insert({
        cheque_id: cheque.id, user_id: user.id,
        from_status: cheque.status, to_status: newStatus,
        reason: data.notes || data.returnReason || data.cancelReason || data.bounceReason || null,
        action_type: data.action,
        linked_transaction_id: txId,
        details: Object.keys(historyDetails).length > 0 ? historyDetails : null,
      });

      setStatusHistory(prev => { const n = { ...prev }; delete n[cheque.id]; return n; });
      toast.success(`تم: ${config.emoji} ${config.label}`);
      setActionTarget(null);
      setActionType(null);
      fetchCheques();
    } catch (err: any) {
      toast.error(err.message || "خطأ في تنفيذ الإجراء");
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleBulkAction = async (action: ActionType) => {
    if (!user || selected.size === 0) return;
    const selectedCheques = cheques.filter(c => selected.has(c.id));
    const statuses = new Set(selectedCheques.map(c => c.status));
    if (statuses.size > 1) { toast.error("يجب أن تكون جميع الشيكات المحددة بنفس الحالة"); return; }
    setActionTarget(selectedCheques[0]);
    setActionType(action);
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await supabase.from('cheque_status_history').delete().eq('cheque_id', deleteTarget.id);
      const { error } = await supabase.from('cheques').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success("تم حذف الشيك");
      setDeleteTarget(null);
      fetchCheques();
    } catch { toast.error("خطأ في حذف الشيك"); }
    finally { setDeleting(false); }
  };

  // =================== EXPORT EXCEL ===================
  const exportExcel = () => {
    if (filtered.length === 0) { toast.error("لا توجد بيانات للتصدير"); return; }
    const rows = filtered.map(c => ({
      'النوع': c.cheque_type,
      'رقم الشيك': c.cheque_number || '',
      'الجهة': c.party_name,
      'البنك': c.bank_name || '',
      'المبلغ': c.amount,
      'العملة': c.currency,
      'تاريخ الاستحقاق': c.cheque_date,
      'تاريخ التسجيل': c.created_at?.split('T')[0] || '',
      'الحالة': c.status,
      'ملاحظات': c.notes || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الشيكات');
    setNextExportBranding({
      title: "تقرير الشيكات",
      currency: "متعدد العملات",
      extraInfo: [`عدد الشيكات: ${rows.length.toLocaleString()}`],
    });
    XLSX.writeFile(wb, `شيكات-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("تم تصدير الشيكات بنجاح");
  };

  const handlePrint = () => {
    if (filtered.length === 0) { toast.error("لا توجد بيانات للطباعة"); return; }
    const statusLabels: Record<string, string> = { pending: "معلق", deposited: "مودع", cashed: "محصّل", bounced: "مرتجع", endorsed: "مظهّر", cancelled: "ملغي" };
    const rows = filtered.map(c => `
      <tr>
        <td>${c.cheque_type === "وارد" ? "وارد" : "صادر"}</td>
        <td class="font-mono">${c.cheque_number || "—"}</td>
        <td>${c.party_name}</td>
        <td>${c.bank_name || "—"}</td>
        <td class="font-mono font-bold">₪${c.amount.toLocaleString()}</td>
        <td>${c.cheque_date || "—"}</td>
        <td>${c.created_at?.split('T')[0] || "—"}</td>
        <td>${statusLabels[c.status] || c.status}</td>
      </tr>
    `).join("");

    const totalAmount = filtered.reduce((s, c) => s + c.amount, 0);

    const contentHtml = `
      <div class="print-header">
        <div>
          <div class="company-name">${settings.company_name || "الشركة"}</div>
          <div class="report-title">تقرير إدارة الشيكات</div>
        </div>
        <div class="print-date">${filtered.length} شيك</div>
      </div>
      <div class="summary-row">
        <div class="summary-card"><div class="summary-label">إجمالي المبالغ</div><div class="summary-value">₪${totalAmount.toLocaleString()}</div></div>
        <div class="summary-card"><div class="summary-label">عدد الشيكات</div><div class="summary-value">${filtered.length}</div></div>
        <div class="summary-card"><div class="summary-label">واردة</div><div class="summary-value">${filtered.filter(c => c.cheque_type === "وارد").length}</div></div>
        <div class="summary-card"><div class="summary-label">صادرة</div><div class="summary-value">${filtered.filter(c => c.cheque_type === "صادر").length}</div></div>
      </div>
      <table>
        <thead><tr>
          <th>النوع</th><th>رقم الشيك</th><th>الجهة</th><th>البنك</th><th>المبلغ</th><th>الاستحقاق</th><th>الإصدار</th><th>الحالة</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="4" style="text-align:right">المجموع (${filtered.length} شيك)</td>
          <td class="font-mono font-bold">₪${totalAmount.toLocaleString()}</td>
          <td colspan="3"></td>
        </tr></tfoot>
      </table>
    `;

    import("@/lib/printUtils").then(({ printReport }) => {
      printReport({
        title: "تقرير إدارة الشيكات",
        companyName: settings.company_name || "الشركة",
        contentHtml,
      });
    });
  };

  const today = new Date().toISOString().split('T')[0];

  // =================== FILTERING ===================
  const filtered = useMemo(() => {
    const base = cheques.filter(c => {
      if (filterType !== 'all' && c.cheque_type !== filterType) return false;
      if (filterStatus !== 'الكل' && c.status !== filterStatus) return false;
      if (dateFrom && c.cheque_date < dateFrom) return false;
      if (dateTo && c.cheque_date > dateTo) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!c.party_name.toLowerCase().includes(s) && !c.cheque_number?.toLowerCase().includes(s) && !c.bank_name?.toLowerCase().includes(s)) return false;
      }
      return true;
    });
    return applyFilters(base, shellFilters);
  }, [cheques, filterType, filterStatus, search, dateFrom, dateTo, shellFilters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: any = a[sortKey], bv: any = b[sortKey];
      if (typeof av === 'string') { av = (av || '').toLowerCase(); bv = (bv || '').toLowerCase(); }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const paged = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => { if (user) { fetchCheques(); fetchContacts(); fetchBankAccounts(); } }, [user]);
  useEffect(() => { setPage(1); }, [search, filterType, filterStatus, dateFrom, dateTo]);

  // Alert once per session for endorsed cheques due within 7 days (we remain liable)
  useEffect(() => {
    if (!cheques.length) return;
    const flagKey = `cheques_endorsed_due_alert_${new Date().toISOString().slice(0,10)}`;
    if (sessionStorage.getItem(flagKey)) return;
    const today = new Date().toISOString().split('T')[0];
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const dueEndorsed = cheques.filter(c => c.status === 'مظهر' && c.cheque_date >= today && c.cheque_date <= in7);
    const overdueEndorsed = cheques.filter(c => c.status === 'مظهر' && c.cheque_date < today);
    if (dueEndorsed.length || overdueEndorsed.length) {
      const parts: string[] = [];
      if (overdueEndorsed.length) parts.push(`${overdueEndorsed.length} مظهَّر متأخر`);
      if (dueEndorsed.length) parts.push(`${dueEndorsed.length} مظهَّر مستحق خلال 7 أيام`);
      toast.warning(`شيكات مظهَّرة بحاجة متابعة: ${parts.join(' • ')}`, {
        description: 'أنت ضامن لها أمام المظهَّر إليه إذا ارتدّت.',
        duration: 8000,
      });
      sessionStorage.setItem(flagKey, '1');
    }
  }, [cheques]);


  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const allPageSelected = paged.length > 0 && paged.every(p => selected.has(p.id));
  const toggleAllPage = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allPageSelected) paged.forEach(p => next.delete(p.id)); else paged.forEach(p => next.add(p.id));
      return next;
    });
  };

  // =================== KPIs ===================
  const pendingIncoming = cheques.filter(c => c.cheque_type === 'وارد' && PENDING_STATUSES.includes(c.status));
  const pendingOutgoing = cheques.filter(c => c.cheque_type === 'صادر' && PENDING_STATUSES.includes(c.status));
  const sevenDaysFromNow = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const dueWithin7 = cheques.filter(c => DUE_WATCH_STATUSES.includes(c.status) && c.cheque_date <= sevenDaysFromNow && c.cheque_date >= today);
  const overdueWatch = cheques.filter(c => DUE_WATCH_STATUSES.includes(c.status) && c.cheque_date < today);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const collectedThisMonth = cheques.filter(c => ['محصل', 'مصروف'].includes(c.status) && c.updated_at?.startsWith(thisMonth));

  const toggleExpand = (id: string) => {
    if (expandedId === id) setExpandedId(null);
    else { setExpandedId(id); fetchHistory(id); }
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return d; }
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-primary-foreground/80 transition-colors w-full">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? "opacity-100" : "opacity-30"}`} />
    </button>
  );

  const selectedCheques = cheques.filter(c => selected.has(c.id));
  const selectedTotal = selectedCheques.reduce((s, c) => s + c.amount, 0);
  const selectedStatuses = new Set(selectedCheques.map(c => c.status));
  const bulkSameStatus = selectedStatuses.size === 1;
  const bulkSameType = new Set(selectedCheques.map(c => c.cheque_type)).size === 1;
  const bulkStatus = bulkSameStatus ? [...selectedStatuses][0] : null;
  const bulkType = bulkSameType ? selectedCheques[0]?.cheque_type : null;
  const bulkActions = (bulkStatus && bulkType) ? getAvailableActions(bulkStatus as ChequeStatus, bulkType) : [];

  // Tab definitions
  const tabs = [
    { key: 'all', label: 'الكل', count: cheques.length },
    { key: 'وارد', label: 'واردة', count: cheques.filter(c => c.cheque_type === 'وارد').length },
    { key: 'صادر', label: 'صادرة', count: cheques.filter(c => c.cheque_type === 'صادر').length },
    { key: 'معلقة', label: 'معلقة', count: cheques.filter(c => PENDING_STATUSES.includes(c.status)).length },
    { key: 'مستحقة', label: 'مستحقة قريباً', count: dueWithin7.length },
  ];

  const applyTab = (key: string) => {
    if (key === 'all') { setFilterType('all'); setFilterStatus('الكل'); }
    else if (key === 'وارد') { setFilterType('وارد'); setFilterStatus('الكل'); }
    else if (key === 'صادر') { setFilterType('صادر'); setFilterStatus('الكل'); }
    else if (key === 'معلقة') { setFilterType('all'); setFilterStatus('الكل'); }
    else if (key === 'مستحقة') { setFilterType('all'); setFilterStatus('الكل'); }
    setPage(1);
  };

  const handleTab = (key: string) => { setActiveTab(key); applyTab(key); };

  // Apply tab-level filtering
  const tabFiltered = useMemo(() => {
    if (activeTab === 'معلقة') return filtered.filter(c => PENDING_STATUSES.includes(c.status));
    if (activeTab === 'مستحقة') return filtered.filter(c => DUE_WATCH_STATUSES.includes(c.status) && c.cheque_date <= sevenDaysFromNow && c.cheque_date >= today);
    return filtered;
  }, [filtered, activeTab, sevenDaysFromNow, today]);

  const tabSorted = useMemo(() => {
    const arr = [...tabFiltered];
    arr.sort((a, b) => {
      let av: any = a[sortKey], bv: any = b[sortKey];
      if (typeof av === 'string') { av = (av || '').toLowerCase(); bv = (bv || '').toLowerCase(); }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [tabFiltered, sortKey, sortDir]);

  const tabTotalPages = Math.max(1, Math.ceil(tabSorted.length / PER_PAGE));
  const tabPaged = tabSorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // ============ ACTION PANE (D365 ribbon) ============
  const hasSelection = selected.size > 0;
  const bulkActionAvailable = (a: ActionType) => hasSelection && bulkActions.includes(a);
  const bulkTooltip = (a: ActionType) =>
    !hasSelection
      ? "حدد شيك أو أكثر من القائمة"
      : !bulkSameType || !bulkSameStatus
      ? "يجب أن تكون جميع الشيكات بنفس النوع والحالة"
      : !bulkActions.includes(a)
      ? "غير متاح لهذه الحالة"
      : undefined;

  const actionTabs: ActionTab[] = [{
    key: "general",
    label: "عام",
    groups: [
      { key: "new", label: "جديد", items: [
        { key: "incoming", label: "شيك وارد", icon: ArrowDownCircle, variant: "primary", onClick: () => openAddDialog('وارد') },
        { key: "outgoing", label: "شيك صادر", icon: ArrowUpCircle, onClick: () => openAddDialog('صادر') },
      ]},
      { key: "actions", label: "إجراءات", items: [
        { key: "collect", label: "تحصيل", icon: CheckCircle2, onClick: () => handleBulkAction('collected'),
          disabled: !bulkActionAvailable('collected'), tooltip: bulkTooltip('collected') },
        { key: "cash", label: "صرف", icon: Banknote, onClick: () => handleBulkAction('cashed'),
          disabled: !bulkActionAvailable('cashed'), tooltip: bulkTooltip('cashed') },
        { key: "endorse", label: "تظهير", icon: Send, onClick: () => handleBulkAction('endorse'),
          disabled: !bulkActionAvailable('endorse'), tooltip: bulkTooltip('endorse') },
        { key: "return", label: "إرجاع/رفض", icon: Undo2, onClick: () => handleBulkAction('bounced'),
          disabled: !bulkActionAvailable('bounced'), tooltip: bulkTooltip('bounced') },
        { key: "cancel", label: "إلغاء", icon: Ban, variant: "danger", onClick: () => handleBulkAction('cancel'),
          disabled: !bulkActionAvailable('cancel'), tooltip: bulkTooltip('cancel') },
        { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: () => fetchCheques() },
      ]},
      { key: "export", label: "تصدير وطباعة", items: [
        { key: "excel", label: "Excel", icon: FileSpreadsheet, onClick: exportExcel, disabled: filtered.length === 0,
          tooltip: filtered.length === 0 ? "لا توجد بيانات للتصدير" : undefined },
        { key: "print", label: "طباعة", icon: Printer, onClick: handlePrint, disabled: filtered.length === 0,
          tooltip: filtered.length === 0 ? "لا توجد بيانات للطباعة" : undefined },
      ]},
    ],
  }];

  // ============ FILTER FIELDS (FiltersPanel) ============
  const bankOptions = useMemo(() => {
    const s = new Set<string>();
    cheques.forEach(c => { if (c.bank_name) s.add(c.bank_name); });
    return Array.from(s).sort().map(v => ({ value: v, label: v }));
  }, [cheques]);
  const partyOptions = useMemo(() => {
    const s = new Set<string>();
    cheques.forEach(c => { if (c.party_name) s.add(c.party_name); });
    return Array.from(s).sort().map(v => ({ value: v, label: v }));
  }, [cheques]);
  const currencyOptions = useMemo(() => {
    const s = new Set<string>();
    cheques.forEach(c => { if (c.currency) s.add(c.currency); });
    return Array.from(s).sort().map(v => ({ value: v, label: v }));
  }, [cheques]);
  const statusOptions = (Object.keys(statusConfig) as ChequeStatus[])
    .map(s => ({ value: s, label: statusConfig[s].label }));
  const filterFields: FilterField[] = useMemo(() => ([
    { key: 'cheque_type', label: 'النوع', type: 'option', options: [
      { value: 'وارد', label: 'وارد' }, { value: 'صادر', label: 'صادر' },
    ]},
    { key: 'status', label: 'الحالة', type: 'option', options: statusOptions },
    { key: 'bank_name', label: 'البنك', type: 'option', options: bankOptions },
    { key: 'party_name', label: 'الطرف', type: 'option', options: partyOptions },
    { key: 'cheque_date', label: 'تاريخ الاستحقاق', type: 'date' },
    { key: 'currency', label: 'العملة', type: 'option', options: currencyOptions },
    { key: 'amount', label: 'المبلغ', type: 'number' },
  ]), [bankOptions, partyOptions, currencyOptions]);

  return (
    <FinanceShell
      title="إدارة الشيكات"
      subtitle="تتبع شيكاتك الواردة والصادرة وعمليات التحصيل والصرف والتظهير."
      breadcrumb={[{ label: "المالية", href: "/accounting-center" }, { label: "الشيكات" }]}
      actionTabs={actionTabs}
      filterFields={filterFields}
      filters={shellFilters}
      onFiltersChange={setShellFilters}
      storageKey="cheques-page"
      rightSlot={
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="رقم الشيك، الجهة، البنك..."
              className="h-8 w-56 pr-8 text-xs"
            />
          </div>
          <ColumnVisibilityMenu state={colState} />
        </div>
      }
    >
    <div className="space-y-5" dir="rtl">

      {/* ============ STATS CARDS ============ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'واردة معلقة', amount: pendingIncoming.reduce((s, c) => s + c.amount, 0), count: pendingIncoming.length, icon: ArrowDownCircle, tone: 'foreground' as const },
          { label: 'صادرة معلقة', amount: pendingOutgoing.reduce((s, c) => s + c.amount, 0), count: pendingOutgoing.length, icon: ArrowUpCircle, tone: 'foreground' as const },
          { label: 'مستحقة خلال 7 أيام', amount: dueWithin7.reduce((s, c) => s + c.amount, 0), count: dueWithin7.length, icon: AlertTriangle, tone: 'warning' as const },
          { label: 'محصّلة هذا الشهر', amount: collectedThisMonth.reduce((s, c) => s + c.amount, 0), count: collectedThisMonth.length, icon: CheckCircle2, tone: 'foreground' as const },
        ].map((card, i) => (
          <div key={i} className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium mb-1.5 text-muted-foreground">{card.label}</p>
                <p className={`text-xl font-bold tabular-nums ${card.tone === 'warning' ? 'text-amber-600' : 'text-foreground'}`}>₪{card.amount.toLocaleString()}</p>
                <p className="text-[10px] mt-1 text-muted-foreground">{card.count} شيك</p>
              </div>
              <card.icon className={`h-5 w-5 mt-0.5 ${card.tone === 'warning' ? 'text-amber-600' : 'text-muted-foreground'}`} />
            </div>
          </div>
        ))}
      </div>

      {/* ============ FILTER TABS ============ */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => handleTab(t.key)}
            className={`px-4 py-2.5 text-xs font-medium transition-all relative border-b-2 ${
              activeTab === t.key
                ? 'text-foreground border-primary font-semibold'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`mr-1.5 text-[9px] px-1.5 py-0.5 rounded-full ${
                activeTab === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search and advanced filters are in the shell header / FiltersPanel */}

      {/* ============ DUE ALERT ============ */}
      {dueWithin7.filter(c => c.cheque_date <= today).length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-100 dark:bg-amber-900/40">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-900 dark:text-amber-200">{dueWithin7.filter(c => c.cheque_date <= today).length} شيك مستحق اليوم</p>
                <p className="text-xs text-amber-700 dark:text-amber-300">بقيمة {dueWithin7.filter(c => c.cheque_date <= today).reduce((s, c) => s + c.amount, 0).toLocaleString()} ₪</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => { handleTab('مستحقة'); }}>
              <Eye className="h-3.5 w-3.5 ml-1" />عرض
            </Button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}

      {/* Empty */}
      {!loading && cheques.length === 0 && (
        <div className="text-center py-16 space-y-3 border border-dashed border-border rounded-lg bg-card">
          <Banknote className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">لا توجد شيكات بعد</h3>
            <p className="text-xs text-muted-foreground mt-1">سجّل أول شيك لبدء تتبع الشيكات الواردة والصادرة.</p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <Button size="sm" onClick={() => openAddDialog('وارد')} className="gap-1.5">
              <ArrowDownCircle className="h-3.5 w-3.5" /> تسجيل شيك وارد
            </Button>
            <Button size="sm" variant="outline" onClick={() => openAddDialog('صادر')} className="gap-1.5">
              <ArrowUpCircle className="h-3.5 w-3.5" /> تسجيل شيك صادر
            </Button>
          </div>
        </div>
      )}

      {/* No results */}
      {!loading && cheques.length > 0 && tabFiltered.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <Search className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">لا توجد شيكات تطابق البحث</p>
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterType("all"); setFilterStatus("الكل"); setDateFrom(''); setDateTo(''); setShellFilters([]); handleTab('all'); }}>مسح الفلاتر</Button>
        </div>
      )}

      {/* ============ TABLE ============ */}
      {!loading && tabPaged.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 40 }} />
                <col style={{ width: 80 }} />
                {show('cheque_number') && <col style={{ width: 100 }} />}
                <col style={{ width: 'auto' }} />
                {show('bank_name') && <col style={{ width: 130 }} />}
                <col style={{ width: 110 }} />
                {show('created_at') && <col style={{ width: 100 }} />}
                <col style={{ width: 100 }} />
                {show('remaining') && <col style={{ width: 85 }} />}
                <col style={{ width: 110 }} />
                <col style={{ width: 140 }} />
              </colgroup>
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-2 py-3 text-right"><Checkbox checked={allPageSelected} onCheckedChange={toggleAllPage} className="border-white/50 data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary" /></th>
                  <th className="px-2 py-3 text-right text-xs font-semibold">النوع</th>
                  {show('cheque_number') && <th className="px-2 py-3 text-right text-xs font-semibold"><SortHeader label="رقم الشيك" field="cheque_number" /></th>}
                  <th className="px-2 py-3 text-right text-xs font-semibold"><SortHeader label="الجهة" field="party_name" /></th>
                  {show('bank_name') && <th className="px-2 py-3 text-right text-xs font-semibold"><SortHeader label="البنك" field="bank_name" /></th>}
                  <th className="px-2 py-3 text-right text-xs font-semibold"><SortHeader label="المبلغ" field="amount" /></th>
                  {show('created_at') && <th className="px-2 py-3 text-right text-xs font-semibold">الإصدار</th>}
                  <th className="px-2 py-3 text-right text-xs font-semibold"><SortHeader label="الاستحقاق" field="cheque_date" /></th>
                  {show('remaining') && <th className="px-2 py-3 text-right text-xs font-semibold">المتبقي</th>}
                  <th className="px-2 py-3 text-right text-xs font-semibold"><SortHeader label="الحالة" field="status" /></th>
                  <th className="px-2 py-3 text-right text-xs font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {tabPaged.map((c, i) => {
                  const sc = statusConfig[c.status];
                  const actions = getAvailableActions(c.status, c.cheque_type);
                  const isSelected = selected.has(c.id);
                  const isExpanded = expandedId === c.id;
                  const history = statusHistory[c.id] || [];
                  const isDueSoon = DUE_WATCH_STATUSES.includes(c.status) && c.cheque_date <= sevenDaysFromNow;
                  const days = Math.ceil((new Date(c.cheque_date).getTime() - Date.now()) / 86400000);
                  const remainingClass = days < 0 ? 'text-destructive font-bold' : days <= 7 ? 'text-amber-600 font-bold' : 'text-muted-foreground';
                  return (
                    <Fragment key={c.id}>
                      <tr
                        className={`border-b border-border transition-colors cursor-pointer hover:bg-muted/40 ${
                          isSelected ? 'bg-primary/5' : i % 2 === 0 ? 'bg-card' : 'bg-muted/20'
                        }`}
                        onClick={() => toggleExpand(c.id)}
                      >
                        <td className="px-2 py-3" onClick={e => e.stopPropagation()}><Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(c.id)} /></td>
                        <td className="px-2 py-3">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground">
                            {c.cheque_type === 'وارد'
                              ? <ArrowDownCircle className="h-3.5 w-3.5 text-muted-foreground" />
                              : <ArrowUpCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                            {c.cheque_type}
                          </span>
                        </td>
                        {show('cheque_number') && (
                          <td className="px-2 py-3 text-xs font-mono truncate text-muted-foreground" dir="ltr">{c.cheque_number || "—"}</td>
                        )}
                        <td className="px-2 py-3"><p className="text-sm font-semibold truncate text-foreground">{c.party_name}</p></td>
                        {show('bank_name') && (
                          <td className="px-2 py-3 text-xs truncate text-muted-foreground">{c.bank_name || '—'}</td>
                        )}
                        <td className="px-2 py-3 text-sm font-bold tabular-nums text-foreground">{c.amount.toLocaleString()} ₪</td>
                        {show('created_at') && (
                          <td className="px-2 py-3 text-[11px] tabular-nums text-muted-foreground">{fmtDate(c.created_at?.split('T')[0] || '')}</td>
                        )}
                        <td className={`px-2 py-3 text-[11px] tabular-nums ${isDueSoon ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>{fmtDate(c.cheque_date)}</td>
                        {show('remaining') && (
                          <td className={`px-2 py-3 text-[11px] tabular-nums ${remainingClass}`}>
                            {(() => {
                              if (!DUE_WATCH_STATUSES.includes(c.status)) return '—';
                              if (days < 0) return `متأخر ${Math.abs(days)} يوم`;
                              if (days === 0) return 'اليوم';
                              return `${days} يوم`;
                            })()}
                          </td>
                        )}
                        <td className="px-2 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sc.badgeClass}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.color.replace('text-', 'bg-')}`} />{sc.label}
                          </span>
                        </td>
                        <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1 justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px] px-2">
                                  <Zap className="h-3 w-3" /> إجراء <ChevronDown className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[200px]">
                                {actions.map(actionId => {
                                  const ac = ACTION_CONFIGS[actionId];
                                  return (
                                    <DropdownMenuItem key={actionId} onClick={() => { setActionTarget(c); setActionType(actionId); }} className="text-xs cursor-pointer">
                                      {ac.label}
                                    </DropdownMenuItem>
                                  );
                                })}
                                {c.status === 'مظهر' && c.cheque_type === 'وارد' && (
                                  <DropdownMenuItem onClick={() => setUnendorseTarget(c)} className="text-xs cursor-pointer">
                                    <Undo2 className="ml-2 h-3.5 w-3.5" /> إلغاء التجيير
                                  </DropdownMenuItem>
                                )}
                                {c.status === 'مودع' && c.cheque_type === 'وارد' && (
                                  <DropdownMenuItem onClick={() => setUndepositTarget(c)} className="text-xs cursor-pointer">
                                    <Undo2 className="ml-2 h-3.5 w-3.5" /> إلغاء الإيداع
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => setDeleteTarget(c)}
                                  className="text-xs cursor-pointer text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="ml-2 h-3.5 w-3.5" /> حذف
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${c.id}-details`}>
                          <td colSpan={visibleColCount} className="border-b border-border bg-muted/20 px-6 py-4">
                            <ChequeTimeline cheque={c} history={history} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-primary bg-muted/40 font-bold text-sm">
                  <td colSpan={Math.max(1, Math.floor(visibleColCount / 2))} className="px-2 py-3 text-right text-foreground">المجموع ({tabFiltered.length} شيك)</td>
                  <td className="px-2 py-3 tabular-nums text-foreground">₪{tabFiltered.reduce((s, c) => s + c.amount, 0).toLocaleString()}</td>
                  <td colSpan={Math.max(1, visibleColCount - Math.floor(visibleColCount / 2) - 1)} className="px-2 py-3 text-xs font-normal text-muted-foreground">إجمالي قيمة الشيكات</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {tabSorted.length > PER_PAGE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
              <p className="text-xs text-muted-foreground">عرض {Math.min((page - 1) * PER_PAGE + 1, tabSorted.length)}–{Math.min(page * PER_PAGE, tabSorted.length)} من {tabSorted.length}</p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="h-3.5 w-3.5 ml-1" /> السابق</Button>
                {Array.from({ length: tabTotalPages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.min(tabTotalPages, page + 2)).map(n => (
                  <Button key={n} variant={page === n ? "default" : "outline"} size="sm" className="rounded-lg h-8 w-8 text-xs p-0" onClick={() => setPage(n)}>{n}</Button>
                ))}
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page >= tabTotalPages} onClick={() => setPage(p => p + 1)}>التالي <ChevronLeft className="h-3.5 w-3.5 mr-1" /></Button>
              </div>
              <p className="text-xs text-muted-foreground">{selected.size > 0 ? `${selected.size} محدد` : `صفحة ${page}/${tabTotalPages}`}</p>
            </div>
          )}
        </div>
      )}


      {/* ============ BULK ACTION BAR ============ */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-xl shadow-lg px-5 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-4">
          <span className="text-sm font-semibold text-foreground">{selected.size} شيك — ₪{selectedTotal.toLocaleString()}</span>
          {bulkSameStatus && bulkActions.length > 0 ? (
            <div className="flex items-center gap-2">
              {bulkActions.slice(0, 4).map(actionId => {
                const ac = ACTION_CONFIGS[actionId];
                return (
                  <Button key={actionId} size="sm" variant="outline"
                    onClick={() => handleBulkAction(actionId)}
                    className="h-7 text-xs">
                    {ac.label}
                  </Button>
                );
              })}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">يجب أن تكون بنفس الحالة</span>
          )}
          <Button size="icon" variant="ghost" onClick={() => setSelected(new Set())} className="h-7 w-7 text-muted-foreground"><X className="h-4 w-4" /></Button>
        </div>
      )}

      {/* ============ ADD DIALOG ============ */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-center text-lg flex items-center justify-center gap-2">
              {addType === 'وارد'
                ? <ArrowDownCircle className="h-5 w-5 text-muted-foreground" />
                : <ArrowUpCircle className="h-5 w-5 text-muted-foreground" />}
              {addType === 'وارد' ? 'تسجيل شيك وارد' : 'تسجيل شيك صادر'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            {/* Party */}
            <div className="relative" ref={partyDropdownRef}>
              <Label className="text-xs font-semibold">الجهة ({addType === 'وارد' ? 'من' : 'إلى'}) *</Label>
              {(() => {
                const preferred = addType === 'وارد' ? 'عميل' : 'مورد';
                const q = partySearch.trim().toLowerCase();
                const filtered = q.length >= 2
                  ? contacts
                      .filter(c => c.contact_name.toLowerCase().includes(q))
                      .sort((a, b) => {
                        const ap = a.contact_type === preferred || a.contact_type === 'عميل ومورد' ? 0 : 1;
                        const bp = b.contact_type === preferred || b.contact_type === 'عميل ومورد' ? 0 : 1;
                        return ap - bp;
                      })
                      .slice(0, 20)
                  : [];
                const exact = q.length > 0 && contacts.some(c => c.contact_name.trim().toLowerCase() === q);
                const showDropdown = partyDropdownOpen && q.length >= 2;
                const commit = (name: string) => {
                  setPartySearch(name);
                  setNewCheques(prev => prev.map(r => ({ ...r, party_name: name })));
                  setPartyDropdownOpen(false);
                };
                return (
                  <>
                    <div className="relative">
                      <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        className="h-9 rounded-xl pr-9"
                        value={partySearch}
                        placeholder="ابحث باسم الجهة (حرفين على الأقل)..."
                        onChange={e => {
                          setPartySearch(e.target.value);
                          setNewCheques(prev => prev.map(r => ({ ...r, party_name: e.target.value })));
                          setPartyDropdownOpen(true);
                          setPartyHighlight(0);
                        }}
                        onFocus={() => setPartyDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setPartyDropdownOpen(false), 150)}
                        onKeyDown={e => {
                          if (e.key === 'Escape') { e.preventDefault(); setPartyDropdownOpen(false); return; }
                          if (!showDropdown) return;
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setPartyHighlight(h => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setPartyHighlight(h => Math.max(h - 1, 0));
                          } else if (e.key === 'Enter') {
                            if (filtered[partyHighlight]) {
                              e.preventDefault();
                              commit(filtered[partyHighlight].contact_name);
                            } else if (!exact && q.length >= 2) {
                              e.preventDefault();
                              handleQuickAddContact(partySearch);
                            }
                          }
                        }}
                      />
                      {partySearch && (
                        <button type="button" onMouseDown={e => { e.preventDefault(); setPartySearch(''); setNewCheques(prev => prev.map(r => ({ ...r, party_name: '' }))); setPartyDropdownOpen(false); }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {showDropdown && (
                      <div className="absolute z-[60] top-full mt-1 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg max-h-56 overflow-y-auto">
                        {filtered.length > 0 ? filtered.map((c, i) => (
                          <button key={c.id} type="button"
                            onMouseDown={e => { e.preventDefault(); commit(c.contact_name); }}
                            onMouseEnter={() => setPartyHighlight(i)}
                            className={`w-full text-right px-3 py-2 text-sm flex items-center gap-2 transition-colors ${i === partyHighlight ? 'bg-secondary' : 'hover:bg-muted'}`}>
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="flex-1 truncate">{c.contact_name}</span>
                            <span className="text-[10px] text-muted-foreground">{c.contact_type}</span>
                          </button>
                        )) : (
                          <p className="text-xs text-muted-foreground text-center py-3">لا توجد نتائج</p>
                        )}
                        {q.length >= 2 && !exact && (
                          <button type="button" disabled={quickAddingContact}
                            onMouseDown={e => { e.preventDefault(); handleQuickAddContact(partySearch); }}
                            className="w-full text-right px-3 py-2 text-sm flex items-center gap-2 text-primary font-medium border-t border-border hover:bg-primary/5 disabled:opacity-60">
                            <UserPlus className="h-3.5 w-3.5" />
                            {quickAddingContact ? 'جاري الإضافة...' : `إضافة "${partySearch.trim()}" كـ${addType === 'وارد' ? 'عميل' : 'مورد'} جديد`}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Source bank for outgoing */}
            {addType === 'صادر' && (
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1"><Building2 className="h-3 w-3" /> الدفع من (حساب بنكي) *</Label>
                {bankAccounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-2">لا توجد حسابات بنكية</p>
                ) : (
                  <div className="flex gap-2 mt-1.5 overflow-x-auto pb-1">
                    {bankAccounts.map(bank => (
                      <button key={bank.id} onClick={() => setNewCheques(prev => prev.map(r => ({ ...r, source_bank_account_id: bank.id, bank_name: bank.bank_name })))} type="button"
                        className={`px-3 py-2 rounded-xl border transition-all flex items-center gap-2 flex-shrink-0 ${
                          newCheques[0]?.source_bank_account_id === bank.id ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
                        }`}>
                        <Building2 className={`h-3.5 w-3.5 ${newCheques[0]?.source_bank_account_id === bank.id ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="text-xs font-medium">{bank.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Cheque Rows */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">الشيكات ({newCheques.length})</Label>
                <Button type="button" variant="outline" size="sm" className="gap-1 text-xs rounded-lg h-7" onClick={addChequeRow}>
                  <Plus className="h-3 w-3" /> إضافة شيك
                </Button>
              </div>

              {newCheques.map((row, idx) => (
                <div key={idx} className="border border-border/60 rounded-xl p-3 space-y-2 relative bg-muted/20">
                  {newCheques.length > 1 && (
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-[10px]">شيك {idx + 1}</Badge>
                      <button onClick={() => removeChequeRow(idx)} className="text-destructive hover:bg-destructive/10 rounded-lg p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">رقم الشيك *</Label>
                      <Input className="h-8 rounded-lg text-xs" value={row.cheque_number} onChange={e => updateChequeRow(idx, 'cheque_number', e.target.value)} placeholder="رقم" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">اسم البنك {addType === 'وارد' ? '*' : ''}</Label>
                      <Input className="h-8 rounded-lg text-xs" value={row.bank_name} onChange={e => updateChequeRow(idx, 'bank_name', e.target.value)} placeholder="البنك" disabled={addType === 'صادر'} />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">المبلغ *</Label>
                      <Input className="h-8 rounded-lg text-xs" type="number" value={row.amount} onChange={e => updateChequeRow(idx, 'amount', e.target.value)} placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">العملة</Label>
                      <Select value={row.currency} onValueChange={(v) => updateChequeRow(idx, 'currency', v)}>
                        <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="شيكل">₪ شيكل</SelectItem>
                          <SelectItem value="دينار">دينار</SelectItem>
                          <SelectItem value="دولار">$ دولار</SelectItem>
                          <SelectItem value="يورو">€ يورو</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">تاريخ الإصدار</Label>
                      <Input className="h-8 rounded-lg text-xs" type="date" value={row.issue_date} onChange={e => updateChequeRow(idx, 'issue_date', e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">تاريخ الاستحقاق *</Label>
                      <Input className="h-8 rounded-lg text-xs" type="date" value={row.cheque_date} onChange={e => updateChequeRow(idx, 'cheque_date', e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">رقم الحساب البنكي</Label>
                      <Input className="h-8 rounded-lg text-xs" value={row.bank_account} onChange={e => updateChequeRow(idx, 'bank_account', e.target.value)} placeholder="اختياري" />
                    </div>
                    {row.currency !== 'شيكل' && (
                      <div>
                        <Label className="text-[10px] text-muted-foreground">سعر الصرف</Label>
                        <Input className="h-8 rounded-lg text-xs" type="number" step="0.01" value={row.exchange_rate} onChange={e => updateChequeRow(idx, 'exchange_rate', e.target.value)} placeholder="1.00" />
                      </div>
                    )}
                    <div className={row.currency !== 'شيكل' ? '' : 'col-span-1'}>
                      <Label className="text-[10px] text-muted-foreground">ملاحظات</Label>
                      <Input className="h-8 rounded-lg text-xs" value={row.notes} onChange={e => updateChequeRow(idx, 'notes', e.target.value)} placeholder="اختياري" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            {newCheques.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-primary/5 border border-primary/20">
                <span className="text-xs font-semibold">الإجمالي: {newCheques.length} شيك</span>
                <span className="text-sm font-bold text-primary">₪{newCheques.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0).toLocaleString()}</span>
              </div>
            )}

            <Button onClick={handleAdd} disabled={submitting} className="w-full rounded-xl h-10 shadow-md shadow-primary/20 gap-2">
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              تسجيل {newCheques.length > 1 ? `${newCheques.length} شيكات` : 'الشيك'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ ACTION MODAL ============ */}
      <ChequeActionModal
        open={!!actionTarget && !!actionType}
        onOpenChange={(v) => { if (!v) { setActionTarget(null); setActionType(null); } }}
        action={actionType}
        chequeNumber={actionTarget?.cheque_number || null}
        chequeAmount={actionTarget?.amount || 0}
        chequeCurrency={actionTarget?.currency || 'شيكل'}
        chequeType={actionTarget?.cheque_type || 'وارد'}
        partyName={actionTarget?.party_name || ''}
        bankAccounts={bankAccounts}
        contacts={contacts}
        sourceBankAccount={actionTarget?.source_bank_account_id ? bankAccounts.find(b => b.id === actionTarget.source_bank_account_id) : null}
        onConfirm={handleAction}
        submitting={actionSubmitting}
      />

      {/* ============ UNENDORSE DIALOG ============ */}
      <UnendorseChequeDialog
        cheque={unendorseTarget}
        userId={user?.id || null}
        open={!!unendorseTarget}
        onOpenChange={(v) => { if (!v) setUnendorseTarget(null); }}
        onSuccess={() => {
          setUnendorseTarget(null);
          setStatusHistory({});
          fetchCheques();
        }}
      />

      {/* ============ UNDEPOSIT DIALOG ============ */}
      <UndepositChequeDialog
        cheque={undepositTarget}
        userId={user?.id || null}
        open={!!undepositTarget}
        onOpenChange={(v) => { if (!v) setUndepositTarget(null); }}
        onSuccess={() => {
          setUndepositTarget(null);
          setStatusHistory({});
          fetchCheques();
        }}
      />

      {/* ============ DELETE CONFIRMATION ============ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف الشيك</AlertDialogTitle>
            <AlertDialogDescription className="text-right">هل أنت متأكد من حذف شيك "{deleteTarget?.party_name}" بقيمة {deleteTarget?.amount.toLocaleString()} {deleteTarget?.currency}؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="rounded-xl">إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl gap-2" onClick={handleDelete} disabled={deleting}>
              {deleting && <RefreshCw className="h-4 w-4 animate-spin" />}حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </FinanceShell>
  );
};

export default ChequesPage;
