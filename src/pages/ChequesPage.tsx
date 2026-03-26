import { useState, useEffect, useMemo, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { 
  FileText, Plus, Search, CheckCircle2, 
  Clock, AlertTriangle, Ban, RefreshCw, ChevronDown,
  Building2, Calendar, Hash, User, Banknote,
  ArrowDownCircle, ArrowUpCircle, Eye, Trash2,
  ArrowRight, ArrowUpDown, Zap,
  ChevronLeft, ChevronRight, Loader2, X, Send
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserPlus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import ChequeActionModal, { type ActionType, type ActionFormData, ACTION_CONFIGS } from "@/components/cheques/ChequeActionModal";
import ChequeTimeline from "@/components/cheques/ChequeTimeline";

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

// Available actions per status — differentiate by cheque type
const getAvailableActions = (status: ChequeStatus, chequeType: ChequeType): ActionType[] => {
  if (chequeType === 'صادر') {
    // Outgoing cheque actions
    switch (status) {
      case 'مسجل':
      case 'آجل':
      case 'مستحق':
        return ['cashed', 'recover', 'cancel'];
      case 'مرتجع':
        return ['cashed', 'cancel'];
      default:
        return [];
    }
  }
  // Incoming cheque actions
  switch (status) {
    case 'مسجل':
    case 'آجل':
    case 'مستحق':
      return ['deposit', 'endorse', 'return_to_customer', 'cancel'];
    case 'مودع':
      return ['collected', 'bounced'];
    case 'مظهر':
      return ['collected', 'return_to_customer'];
    case 'مرتجع':
      return ['deposit', 'endorse', 'cancel'];
    default:
      return [];
  }
};

const STATUS_FILTERS = ['الكل', 'مسجل', 'آجل', 'مستحق', 'مودع', 'محصل', 'مرتجع', 'مصروف', 'مظهر', 'ملغي'];
const PER_PAGE = 15;
type SortKey = 'party_name' | 'cheque_type' | 'amount' | 'cheque_date' | 'status' | 'bank_name' | 'cheque_number';
type SortDir = 'asc' | 'desc';

const ChequesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("الكل");
  const [addOpen, setAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusHistory, setStatusHistory] = useState<Record<string, StatusHistory[]>>({});
  const [deleteTarget, setDeleteTarget] = useState<Cheque | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [contacts, setContacts] = useState<{ id: string; contact_name: string; contact_type: string }[]>([]);
  const [accounts, setAccounts] = useState<{ account_code: string; account_name: string; account_type: string }[]>([]);
  const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string; bank_name: string; gl_account_code: string | null }[]>([]);
  const [partySearch, setPartySearch] = useState("");
  const [partyPopoverOpen, setPartyPopoverOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);
  const [quickAddingContact, setQuickAddingContact] = useState(false);

  // Action modal state
  const [actionTarget, setActionTarget] = useState<Cheque | null>(null);
  const [actionType, setActionType] = useState<ActionType | null>(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("cheque_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  interface ChequeRow {
    cheque_type: ChequeType;
    cheque_number: string;
    bank_name: string;
    cheque_date: string;
    amount: string;
    currency: string;
    exchange_rate: string;
    party_name: string;
    party_type: string;
    linked_account: string;
    notes: string;
    source_bank_account_id: string;
  }

  const emptyChequeRow = (type: ChequeType): ChequeRow => ({
    cheque_type: type,
    cheque_number: '',
    bank_name: '',
    cheque_date: '',
    amount: '',
    currency: 'شيكل',
    exchange_rate: '',
    party_name: '',
    party_type: type === 'وارد' ? 'عميل' : 'مورد',
    linked_account: '',
    notes: '',
    source_bank_account_id: '',
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

  const fetchAccounts = async () => {
    if (!user) return;
    const { data } = await supabase.from('accounts').select('account_code, account_name, account_type').eq('user_id', user.id).eq('is_active', true).order('account_code');
    setAccounts(data || []);
  };

  const fetchBankAccounts = async () => {
    if (!user) return;
    const { data } = await supabase.from('bank_accounts').select('id, name, bank_name, gl_account_code').eq('user_id', user.id).eq('is_active', true);
    setBankAccounts(data || []);
  };

  const fetchContacts = async () => {
    if (!user) return;
    const { data } = await supabase.from('contacts').select('id, contact_name, contact_type').eq('user_id', user.id).eq('is_active', true).neq('is_archived', true);
    setContacts(data || []);
  };

  const handleQuickAddContact = async (name: string) => {
    if (!user || !name.trim()) return;
    setQuickAddingContact(true);
    try {
      const contactType = addType === 'وارد' ? 'عميل' : 'مورد';
      const { error } = await supabase.from('contacts').insert({ user_id: user.id, contact_name: name.trim(), contact_type: contactType });
      if (error) throw error;
      toast.success(`تم إضافة "${name.trim()}" كـ${contactType} جديد`);
      // Update all rows with the new party name
      setNewCheques(prev => prev.map(r => ({ ...r, party_name: name.trim() })));
      setPartySearch(name.trim());
      setPartyPopoverOpen(false);
      fetchContacts();
    } catch { toast.error("خطأ في إضافة جهة الاتصال"); }
    finally { setQuickAddingContact(false); }
  };

  const handleAdd = async () => {
    if (!user) return;
    // Validate all rows
    for (let i = 0; i < newCheques.length; i++) {
      const row = newCheques[i];
      if (!row.party_name || !row.amount || !row.cheque_date) {
        toast.error(`يرجى تعبئة الحقول المطلوبة في الشيك ${i + 1}`); return;
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
            debit_account_code: '2100', credit_account_code: '1160',
            amount, currency: row.currency || 'شيكل',
            transaction_type: 'cheque_register', contact_id: contactId,
            reference: `CHQ-REG-${chequeId.slice(0, 8)}`,
            idempotency_key: `CHQ-REG-${chequeId}`,
            ...(row.exchange_rate ? { exchange_rate: parseFloat(row.exchange_rate), foreign_amount: amount } : {}),
          });
        }

        await supabase.from('cheque_status_history').insert({
          cheque_id: chequeId, user_id: user.id,
          from_status: null, to_status: chequeStatus,
          action_type: 'register',
        });
      }

      toast.success(`تم تسجيل ${newCheques.length} شيك ${addType} وإنشاء القيود ✅`);
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

      // Build journal entry if needed
      let txId: string | null = null;
      const cheque = actionTarget;

      if (data.action === 'deposit') {
        updatePayload.deposit_bank_account_id = data.bankAccountId;
        updatePayload.deposit_date = data.depositDate;
        const bank = bankAccounts.find(b => b.id === data.bankAccountId);
        updatePayload.linked_account = bank?.gl_account_code || cheque.linked_account;
        // Journal: debit cheques-in-collection (1125), credit incoming cheques (1150)
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
        // Journal: debit bank (1120), credit cheques-in-collection (1125)
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
        // Journal: debit receivables (1130), credit cheques-in-collection (1125) — returns balance to customer
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
        // Bank fees entry
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
        updatePayload.endorsed_to_name = data.endorsedToName;
        updatePayload.endorsed_to_contact_id = data.endorsedToContactId;
        // Journal: debit supplier payables (2100), credit incoming cheques (1150)
        const { data: txResult } = await supabase.from('transactions').insert({
          user_id: user.id, transaction_date: new Date().toISOString().split('T')[0],
          description: `تظهير شيك - ${cheque.party_name} → ${data.endorsedToName}`,
          debit_account_code: '2100', credit_account_code: '1150',
          amount: cheque.amount, currency: cheque.currency || 'شيكل',
          transaction_type: 'cheque_endorsement', contact_id: data.endorsedToContactId || null,
          reference: `CHQ-END-${cheque.id.slice(0, 8)}`,
          idempotency_key: `CHQ-END-${cheque.id}`,
        }).select('id').single();
        txId = txResult?.id || null;
      }

      if (data.action === 'return_to_customer') {
        const contactId = findContactId(cheque.party_name);
        const today = new Date().toISOString().split('T')[0];
        // Reverse registration: debit receivables (1130), credit incoming cheques (1150)
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
          // Reverse incoming registration: debit receivables (1130), credit incoming cheques (1150)
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
          // Reverse outgoing: debit outgoing cheques (1160), credit supplier payables (2100)
          const { data: txResult } = await supabase.from('transactions').insert({
            user_id: user.id, transaction_date: today,
            description: `إلغاء شيك صادر - ${cheque.party_name} #${cheque.cheque_number || ''} - ${data.cancelReason || ''}`,
            debit_account_code: '1160', credit_account_code: '2100',
            amount: cheque.amount, currency: cheque.currency || 'شيكل',
            transaction_type: 'cheque_cancel', contact_id: contactId,
            reference: `CHQ-CAN-${cheque.id.slice(0, 8)}`,
            idempotency_key: `CHQ-CAN-${cheque.id}`,
          }).select('id').single();
          txId = txResult?.id || null;
        }
      }

      // ===== OUTGOING CHEQUE: CASHED (صُرف في البنك) =====
      if (data.action === 'cashed') {
        updatePayload.cashed_date = data.cashedDate;
        const contactId = cheque.contact_id || findContactId(cheque.party_name);
        const sourceBank = bankAccounts.find(b => b.id === cheque.source_bank_account_id);
        const bankGlCode = sourceBank?.gl_account_code || '1120';
        // Journal: Debit outgoing cheques (1160), Credit bank account
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

      // ===== OUTGOING CHEQUE: BOUNCED (مرتجع من البنك) =====
      if (data.action === 'outgoing_bounced') {
        updatePayload.bounce_date = data.bounceDate;
        updatePayload.bounce_reason = data.bounceReason;
        updatePayload.bank_fees = data.bankFees || 0;
        const contactId = cheque.contact_id || findContactId(cheque.party_name);
        // Reverse: Debit outgoing cheques (1160), Credit supplier payables (2100) — restore obligation
        const { data: txResult } = await supabase.from('transactions').insert({
          user_id: user.id, transaction_date: data.bounceDate || new Date().toISOString().split('T')[0],
          description: `شيك صادر مرتجع - ${cheque.party_name} #${cheque.cheque_number || ''} - ${data.bounceReason}`,
          debit_account_code: '1160', credit_account_code: '2100',
          amount: cheque.amount, currency: cheque.currency || 'شيكل',
          transaction_type: 'cheque_bounce', contact_id: contactId,
          reference: `CHQ-OBNC-${cheque.id.slice(0, 8)}`,
          idempotency_key: `CHQ-OBNC-${cheque.id}`,
        }).select('id').single();
        txId = txResult?.id || null;
        // Bank fees
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

      // ===== OUTGOING CHEQUE: RECOVER (استرداد) =====
      if (data.action === 'recover') {
        const contactId = cheque.contact_id || findContactId(cheque.party_name);
        const today = new Date().toISOString().split('T')[0];
        // Reverse registration: Debit outgoing cheques (1160), Credit supplier payables (2100)
        const { data: txResult } = await supabase.from('transactions').insert({
          user_id: user.id, transaction_date: today,
          description: `استرداد شيك صادر - ${cheque.party_name} #${cheque.cheque_number || ''} - ${data.recoverReason || ''}`,
          debit_account_code: '1160', credit_account_code: '2100',
          amount: cheque.amount, currency: cheque.currency || 'شيكل',
          transaction_type: 'cheque_recover', contact_id: contactId,
          reference: `CHQ-RCV-${cheque.id.slice(0, 8)}`,
          idempotency_key: `CHQ-RCV-${cheque.id}`,
        }).select('id').single();
        txId = txResult?.id || null;
      }

      // Update cheque
      const { error } = await supabase.from('cheques').update(updatePayload as any).eq('id', cheque.id);
      if (error) throw error;

      // Record status history
      const historyDetails: Record<string, any> = {};
      if (data.action === 'deposit') {
        const bank = bankAccounts.find(b => b.id === data.bankAccountId);
        historyDetails.bank_name = bank?.name;
      }
      if (data.action === 'endorse') historyDetails.endorsed_to = data.endorsedToName;
      if (data.action === 'bounced' || data.action === 'outgoing_bounced') { historyDetails.bounce_reason = data.bounceReason; historyDetails.bank_fees = data.bankFees; }
      if (data.action === 'cashed') { const sb = bankAccounts.find(b => b.id === cheque.source_bank_account_id); historyDetails.source_bank = sb?.name; }
      if (data.action === 'recover') { historyDetails.recover_reason = data.recoverReason; }

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

  // =================== BULK ACTIONS ===================
  const handleBulkAction = async (action: ActionType) => {
    if (!user || selected.size === 0) return;
    const selectedCheques = cheques.filter(c => selected.has(c.id));
    // Check all have same status
    const statuses = new Set(selectedCheques.map(c => c.status));
    if (statuses.size > 1) {
      toast.error("يجب أن تكون جميع الشيكات المحددة بنفس الحالة");
      return;
    }
    // For bulk, open modal with first cheque as target (amount = total)
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

  const today = new Date().toISOString().split('T')[0];

  // Filtering
  const filtered = useMemo(() => {
    return cheques.filter(c => {
      if (filterType !== 'all' && c.cheque_type !== filterType) return false;
      if (filterStatus !== 'الكل' && c.status !== filterStatus) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!c.party_name.toLowerCase().includes(s) && !c.cheque_number?.toLowerCase().includes(s) && !c.bank_name?.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [cheques, filterType, filterStatus, search]);

  // Sorting
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

  useEffect(() => { setPage(1); }, [search, filterType, filterStatus]);

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

  // KPIs
  const totalIncoming = cheques.filter(c => c.cheque_type === 'وارد').reduce((s, c) => s + c.amount, 0);
  const totalOutgoing = cheques.filter(c => c.cheque_type === 'صادر').reduce((s, c) => s + c.amount, 0);
  const totalDue = cheques.filter(c => c.status === 'مستحق').reduce((s, c) => s + c.amount, 0);
  const totalPending = cheques.filter(c => c.status === 'آجل').reduce((s, c) => s + c.amount, 0);
  const dueTodayCheques = cheques.filter(c => c.status === 'مستحق' && c.cheque_date <= today);

  const toggleExpand = (id: string) => {
    if (expandedId === id) { setExpandedId(null); } else { setExpandedId(id); fetchHistory(id); }
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; }
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-primary-foreground/80 transition-colors w-full">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? "opacity-100" : "opacity-30"}`} />
    </button>
  );

  // Selected cheques info for bulk bar
  const selectedCheques = cheques.filter(c => selected.has(c.id));
  const selectedTotal = selectedCheques.reduce((s, c) => s + c.amount, 0);
  const selectedStatuses = new Set(selectedCheques.map(c => c.status));
  const bulkSameStatus = selectedStatuses.size === 1;
  const bulkSameType = new Set(selectedCheques.map(c => c.cheque_type)).size === 1;
  const bulkStatus = bulkSameStatus ? [...selectedStatuses][0] : null;
  const bulkType = bulkSameType ? selectedCheques[0]?.cheque_type : null;
  const bulkActions = (bulkStatus && bulkType) ? getAvailableActions(bulkStatus, bulkType) : [];

  return (
    <div className="p-4 md:p-6 pb-24 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/apps")} className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-all shadow-sm">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Banknote className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">إدارة الشيكات</h1>
              <p className="text-xs text-muted-foreground">{filtered.length} شيك من أصل {cheques.length}</p>
            </div>
          </div>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5 rounded-xl shadow-md shadow-primary/20"><Plus className="h-4 w-4" /> شيك جديد</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-2xl" dir="rtl">
            <DialogHeader><DialogTitle className="text-center">تسجيل شيك جديد</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">نوع الشيك *</Label>
                  <Select value={newCheque.cheque_type} onValueChange={(v) => setNewCheque(p => ({ ...p, cheque_type: v as ChequeType, party_type: v === 'وارد' ? 'عميل' : 'مورد' }))}>
                    <SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="وارد">⬇ وارد (من عميل)</SelectItem>
                      <SelectItem value="صادر">⬆ صادر (لمورد)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">العملة</Label>
                  <Select value={newCheque.currency} onValueChange={(v) => setNewCheque(p => ({ ...p, currency: v }))}>
                    <SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="شيكل">₪ شيكل</SelectItem>
                      <SelectItem value="دينار">دينار</SelectItem>
                      <SelectItem value="دولار">$ دولار</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">اسم {newCheque.cheque_type === 'وارد' ? 'العميل' : 'المورد'} *</Label>
                <Popover open={partyPopoverOpen} onOpenChange={setPartyPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Input className="h-9 rounded-xl" value={partySearch} onChange={e => { setPartySearch(e.target.value); setNewCheque(p => ({ ...p, party_name: e.target.value })); setPartyPopoverOpen(true); }} onFocus={() => setPartyPopoverOpen(true)} placeholder={`ابحث أو أضف ${newCheque.cheque_type === 'وارد' ? 'عميل' : 'مورد'}`} />
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-1 rounded-xl max-h-48 overflow-y-auto" align="start" sideOffset={4}>
                    {(() => {
                      const targetType = newCheque.cheque_type === 'وارد' ? 'عميل' : 'مورد';
                      const filteredContacts = contacts.filter(c => c.contact_type === targetType || c.contact_type === 'كلاهما').filter(c => !partySearch || c.contact_name.toLowerCase().includes(partySearch.toLowerCase()));
                      const exactMatch = contacts.some(c => c.contact_name === partySearch.trim());
                      return (
                        <>
                          {filteredContacts.length > 0 ? filteredContacts.map(c => (
                            <button key={c.id} className="w-full text-right px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors flex items-center gap-2" onClick={() => { setNewCheque(p => ({ ...p, party_name: c.contact_name })); setPartySearch(c.contact_name); setPartyPopoverOpen(false); }}>
                              <User className="h-3.5 w-3.5 text-muted-foreground" />{c.contact_name}
                            </button>
                          )) : <p className="text-xs text-muted-foreground text-center py-2">لا توجد نتائج</p>}
                          {partySearch.trim() && !exactMatch && (
                            <button className="w-full text-right px-3 py-2 text-sm rounded-lg hover:bg-primary/10 transition-colors flex items-center gap-2 text-primary font-medium border-t border-border mt-1 pt-2" onClick={() => handleQuickAddContact(partySearch)} disabled={quickAddingContact}>
                              <UserPlus className="h-3.5 w-3.5" />إضافة "{partySearch.trim()}" كـ{targetType} جديد
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">المبلغ *</Label><Input className="h-9 rounded-xl" type="number" value={newCheque.amount} onChange={e => setNewCheque(p => ({ ...p, amount: e.target.value }))} placeholder="0" /></div>
                <div><Label className="text-xs">تاريخ الاستحقاق *</Label><Input className="h-9 rounded-xl" type="date" value={newCheque.cheque_date} onChange={e => setNewCheque(p => ({ ...p, cheque_date: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">رقم الشيك</Label><Input className="h-9 rounded-xl" value={newCheque.cheque_number} onChange={e => setNewCheque(p => ({ ...p, cheque_number: e.target.value }))} placeholder="اختياري" /></div>
                {newCheque.cheque_type === 'وارد' ? (
                  <div><Label className="text-xs">البنك</Label><Input className="h-9 rounded-xl" value={newCheque.bank_name} onChange={e => setNewCheque(p => ({ ...p, bank_name: e.target.value }))} placeholder="اختياري" /></div>
                ) : (
                  <div><Label className="text-xs">البنك</Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{bankAccounts.find(b => b.id === newCheque.source_bank_account_id)?.bank_name || '—'}</p>
                  </div>
                )}
              </div>
              {/* Source bank account for outgoing cheques */}
              {newCheque.cheque_type === 'صادر' && (
                <div>
                  <Label className="text-xs font-semibold flex items-center gap-1"><Building2 className="h-3 w-3" /> دفتر الشيكات (الحساب البنكي المصدر) *</Label>
                  {bankAccounts.length === 0 ? (
                    <p className="text-xs text-muted-foreground mt-2">لا توجد حسابات بنكية — أضف حساباً بنكياً أولاً</p>
                  ) : (
                    <div className="space-y-1.5 mt-2 max-h-40 overflow-y-auto">
                      {bankAccounts.map(bank => (
                        <button key={bank.id} onClick={() => setNewCheque(p => ({ ...p, source_bank_account_id: bank.id, bank_name: bank.bank_name }))} type="button"
                          className={`w-full text-right px-3 py-2.5 rounded-xl border transition-all flex items-center justify-between ${
                            newCheque.source_bank_account_id === bank.id ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
                          }`}>
                          <div className="flex items-center gap-2">
                            <Building2 className={`h-4 w-4 ${newCheque.source_bank_account_id === bank.id ? 'text-primary' : 'text-muted-foreground'}`} />
                            <div>
                              <p className="text-sm font-medium">{bank.name}</p>
                              <p className="text-[10px] text-muted-foreground">{bank.bank_name}</p>
                            </div>
                          </div>
                          {bank.gl_account_code && <span className="text-[10px] text-muted-foreground font-mono">{bank.gl_account_code}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div>
                <Label className="text-xs">الحساب المحاسبي</Label>
                <Popover open={accountPopoverOpen} onOpenChange={setAccountPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Input className="h-9 rounded-xl" value={accountSearch || (newCheque.linked_account ? (() => { const acc = accounts.find(a => a.account_code === newCheque.linked_account); return acc ? `${acc.account_code} - ${acc.account_name}` : newCheque.linked_account; })() : '')} onChange={e => { setAccountSearch(e.target.value); if (!e.target.value) setNewCheque(p => ({ ...p, linked_account: '' })); setAccountPopoverOpen(true); }} onFocus={() => setAccountPopoverOpen(true)} placeholder="ابحث عن حساب من الشجرة" />
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-1 rounded-xl max-h-48 overflow-y-auto" align="start" sideOffset={4}>
                    {(() => {
                      const filteredAccts = accounts.filter(a => !accountSearch || a.account_code.includes(accountSearch) || a.account_name.includes(accountSearch)).slice(0, 20);
                      return filteredAccts.length > 0 ? filteredAccts.map(a => (
                        <button key={a.account_code} className="w-full text-right px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors flex items-center justify-between" onClick={() => { setNewCheque(p => ({ ...p, linked_account: a.account_code })); setAccountSearch(''); setAccountPopoverOpen(false); }}>
                          <span>{a.account_name}</span><span className="text-xs text-muted-foreground font-mono">{a.account_code}</span>
                        </button>
                      )) : <p className="text-xs text-muted-foreground text-center py-2">لا توجد نتائج</p>;
                    })()}
                  </PopoverContent>
                </Popover>
              </div>
              <div><Label className="text-xs">ملاحظات</Label><Input className="h-9 rounded-xl" value={newCheque.notes} onChange={e => setNewCheque(p => ({ ...p, notes: e.target.value }))} placeholder="اختياري" /></div>
              <Button onClick={handleAdd} disabled={submitting} className="w-full rounded-xl h-10 shadow-md shadow-primary/20 gap-2">
                {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}تسجيل الشيك
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards */}
      {cheques.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "شيكات واردة", value: `₪${totalIncoming.toLocaleString()}`, count: cheques.filter(c => c.cheque_type === 'وارد').length, icon: ArrowDownCircle, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800" },
            { label: "شيكات صادرة", value: `₪${totalOutgoing.toLocaleString()}`, count: cheques.filter(c => c.cheque_type === 'صادر').length, icon: ArrowUpCircle, color: "text-destructive", bg: "bg-destructive/5 border-destructive/10" },
            { label: "مستحقة", value: `₪${totalDue.toLocaleString()}`, count: cheques.filter(c => c.status === 'مستحق').length, icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800" },
            { label: "آجلة", value: `₪${totalPending.toLocaleString()}`, count: cheques.filter(c => c.status === 'آجل').length, icon: Clock, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
          ].map((k, i) => (
            <div key={i} className={`rounded-2xl border p-4 ${k.bg}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">{k.label}</p>
                  <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{k.count} شيك</p>
                </div>
                <k.icon className={`h-5 w-5 ${k.color} opacity-50`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Due Today Alert */}
      {dueTodayCheques.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-destructive/15 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-destructive animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-bold text-destructive">{dueTodayCheques.length} شيك مستحق اليوم</p>
                <p className="text-xs text-destructive/70">بقيمة إجمالية {dueTodayCheques.reduce((s, c) => s + c.amount, 0).toLocaleString()} ₪</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 text-xs" onClick={() => { setFilterStatus('مستحق'); setFilterType('all'); }}>
              <Eye className="h-3.5 w-3.5 ml-1" />عرض الآن
            </Button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {cheques.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
            <Input placeholder="ابحث بالاسم، رقم الشيك، البنك..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10 rounded-xl bg-muted/30" />
            {search && <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
              {STATUS_FILTERS.map(st => (
                <button key={st} onClick={() => setFilterStatus(st)} className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${filterStatus === st ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>{st}</button>
              ))}
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px] rounded-xl text-xs"><SelectValue placeholder="نوع الشيك" /></SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="all">كل الأنواع</SelectItem>
                <SelectItem value="وارد">⬇ وارد</SelectItem>
                <SelectItem value="صادر">⬆ صادر</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}

      {/* Empty */}
      {!loading && cheques.length === 0 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4"><Banknote className="h-10 w-10 text-muted-foreground/40" /></div>
          <h3 className="text-base font-semibold text-foreground mb-1">لا توجد شيكات بعد</h3>
          <p className="text-xs text-muted-foreground mb-4">سجّل أول شيك لبدء التتبع</p>
          <Button className="rounded-xl gap-2 shadow-md shadow-primary/20" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> شيك جديد</Button>
        </div>
      )}

      {/* No results */}
      {!loading && cheques.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <Search className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">لا توجد شيكات تطابق البحث</p>
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterType("all"); setFilterStatus("الكل"); }}>مسح الفلاتر</Button>
        </div>
      )}

      {/* TABLE */}
      {!loading && paged.length > 0 && (
        <div className="rounded-2xl border border-border/50 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-3 py-3 text-right w-10"><Checkbox checked={allPageSelected} onCheckedChange={toggleAllPage} className="border-primary-foreground/50 data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="رقم الشيك" field="cheque_number" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الجهة" field="party_name" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="النوع" field="cheque_type" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="المبلغ" field="amount" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الاستحقاق" field="cheque_date" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الحالة" field="status" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="البنك" field="bank_name" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((c, i) => {
                  const sc = statusConfig[c.status];
                  const actions = getAvailableActions(c.status, c.cheque_type);
                  const isSelected = selected.has(c.id);
                  const isExpanded = expandedId === c.id;
                  const history = statusHistory[c.id] || [];
                  return (
                    <Fragment key={c.id}>
                      <tr className={`border-b border-border/50 transition-colors cursor-pointer ${isSelected ? "bg-primary/5" : i % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/5`} onClick={() => toggleExpand(c.id)}>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}><Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(c.id)} /></td>
                        <td className="px-3 py-3 text-xs text-muted-foreground font-mono" dir="ltr">{c.cheque_number || "—"}</td>
                        <td className="px-3 py-3"><p className="text-sm font-semibold text-foreground">{c.party_name}</p></td>
                        <td className="px-3 py-3"><Badge variant="outline" className="text-[10px]">{c.cheque_type === 'وارد' ? '⬇ وارد' : '⬆ صادر'}</Badge></td>
                        <td className={`px-3 py-3 text-sm font-bold tabular-nums ${c.cheque_type === 'وارد' ? 'text-emerald-600' : 'text-destructive'}`}>{c.amount.toLocaleString()} ₪</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums">{fmtDate(c.cheque_date)}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sc.badgeClass}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.color.replace('text-', 'bg-')}`} />{sc.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{c.bank_name || '—'}</td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {actions.length > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-all">
                                    <Zap className="h-3 w-3" />إجراء<ChevronDown className="h-3 w-3" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[180px]">
                                  {actions.map(actionId => {
                                    const ac = ACTION_CONFIGS[actionId];
                                    return (
                                      <DropdownMenuItem key={actionId} onClick={() => { setActionTarget(c); setActionType(actionId); }}
                                        className="gap-2 text-xs cursor-pointer">
                                        <span>{ac.emoji}</span>{ac.label}
                                      </DropdownMenuItem>
                                    );
                                  })}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            <button onClick={() => setDeleteTarget(c)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="حذف">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${c.id}-details`}>
                          <td colSpan={9} className="bg-muted/10 border-b border-border/50 px-6 py-4">
                            <ChequeTimeline cheque={c} history={history} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-primary/5 border-t-2 border-primary/20 font-bold text-sm">
                  <td colSpan={4} className="px-3 py-3 text-right text-foreground">المجموع ({filtered.length} شيك)</td>
                  <td className="px-3 py-3 tabular-nums text-foreground">₪{filtered.reduce((s, c) => s + c.amount, 0).toLocaleString()}</td>
                  <td colSpan={4} className="px-3 py-3 text-xs text-muted-foreground font-normal">إجمالي قيمة الشيكات</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {sorted.length > PER_PAGE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-muted/20">
              <p className="text-xs text-muted-foreground">عرض {Math.min((page - 1) * PER_PAGE + 1, sorted.length)}–{Math.min(page * PER_PAGE, sorted.length)} من {sorted.length}</p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="h-3.5 w-3.5 ml-1" /> السابق</Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.min(totalPages, page + 2)).map(n => (
                  <Button key={n} variant={page === n ? "default" : "outline"} size="sm" className="rounded-lg h-8 w-8 text-xs p-0" onClick={() => setPage(n)}>{n}</Button>
                ))}
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>التالي <ChevronLeft className="h-3.5 w-3.5 mr-1" /></Button>
              </div>
              <p className="text-xs text-muted-foreground">{selected.size > 0 ? `${selected.size} شيك محدد` : `صفحة ${page} من ${totalPages}`}</p>
            </div>
          )}
        </div>
      )}

      {/* Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border-2 border-primary/30 rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-4">
          <span className="text-sm font-bold text-foreground">✓ تم تحديد {selected.size} شيك — ₪{selectedTotal.toLocaleString()}</span>
          {bulkSameStatus && bulkActions.length > 0 ? (
            <div className="flex items-center gap-2">
              {bulkActions.slice(0, 4).map(actionId => {
                const ac = ACTION_CONFIGS[actionId];
                return (
                  <button key={actionId} onClick={() => handleBulkAction(actionId)}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-all">
                    {ac.emoji} {ac.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">يجب أن تكون جميعها بنفس الحالة</span>
          )}
          <button onClick={() => setSelected(new Set())} className="text-xs text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Action Modal */}
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

      {/* Delete Confirmation */}
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
  );
};

export default ChequesPage;
