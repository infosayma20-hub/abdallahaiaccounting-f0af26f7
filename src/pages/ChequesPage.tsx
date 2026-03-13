import { useState, useEffect, useMemo, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { 
  FileText, Plus, Search, CheckCircle2, 
  Clock, AlertTriangle, Ban, RefreshCw, ChevronDown, ChevronUp,
  Building2, Calendar, Hash, User, Banknote,
  ArrowDownCircle, ArrowUpCircle, Eye, Trash2,
  History, StickyNote, ArrowRight, ArrowUpDown,
  ChevronLeft, ChevronRight, Loader2, X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserPlus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type ChequeStatus = 'مسجل' | 'آجل' | 'مستحق' | 'مودع' | 'محصل' | 'مرتجع' | 'ملغي';
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
}

interface StatusHistory {
  id: string;
  from_status: ChequeStatus | null;
  to_status: ChequeStatus;
  created_at: string;
  reason: string | null;
}

const statusConfig: Record<ChequeStatus, { icon: any; color: string; bg: string; badgeClass: string; label: string }> = {
  'مسجل': { icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted/50', badgeClass: 'bg-muted/60 text-muted-foreground', label: 'مسجل' },
  'آجل': { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-500/10', badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', label: 'آجل' },
  'مستحق': { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-500/10', badgeClass: 'bg-red-500/15 text-red-700 dark:text-red-400', label: 'مستحق' },
  'مودع': { icon: Building2, color: 'text-blue-600', bg: 'bg-blue-500/10', badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', label: 'مودع' },
  'محصل': { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-500/10', badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', label: 'محصل' },
  'مرتجع': { icon: RefreshCw, color: 'text-rose-700', bg: 'bg-rose-500/10', badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-400', label: 'مرتجع' },
  'ملغي': { icon: Ban, color: 'text-muted-foreground', bg: 'bg-muted/30', badgeClass: 'bg-muted/40 text-muted-foreground', label: 'ملغي' },
};

const smartTransitions: Record<ChequeStatus, { status: ChequeStatus; label: string; variant: 'default' | 'destructive' | 'outline' }[]> = {
  'مسجل': [
    { status: 'آجل', label: 'تأجيل', variant: 'outline' },
    { status: 'مستحق', label: 'تحويل لمستحق', variant: 'outline' },
    { status: 'ملغي', label: 'إلغاء', variant: 'destructive' },
  ],
  'آجل': [
    { status: 'مودع', label: 'إيداع', variant: 'default' },
    { status: 'ملغي', label: 'إلغاء', variant: 'destructive' },
  ],
  'مستحق': [
    { status: 'مودع', label: 'إيداع الآن', variant: 'default' },
  ],
  'مودع': [
    { status: 'محصل', label: 'تأكيد التحصيل ✓', variant: 'default' },
    { status: 'مرتجع', label: 'مرتجع', variant: 'destructive' },
  ],
  'محصل': [],
  'مرتجع': [
    { status: 'آجل', label: 'إعادة تأجيل', variant: 'outline' },
  ],
  'ملغي': [],
};

const STATUS_FILTERS = ['الكل', 'مسجل', 'آجل', 'مستحق', 'مودع', 'محصل', 'مرتجع', 'ملغي'];
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
  const [depositTarget, setDepositTarget] = useState<Cheque | null>(null);
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>("");

  const [sortKey, setSortKey] = useState<SortKey>("cheque_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [newCheque, setNewCheque] = useState({
    cheque_type: 'وارد' as ChequeType,
    cheque_number: '',
    bank_name: '',
    cheque_date: '',
    amount: '',
    currency: 'شيكل',
    party_name: '',
    party_type: 'عميل',
    linked_account: '',
    notes: '',
  });

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
      const contactType = newCheque.cheque_type === 'وارد' ? 'عميل' : 'مورد';
      const { error } = await supabase.from('contacts').insert({
        user_id: user.id,
        contact_name: name.trim(),
        contact_type: contactType,
      });
      if (error) throw error;
      toast.success(`تم إضافة "${name.trim()}" كـ${contactType} جديد`);
      setNewCheque(p => ({ ...p, party_name: name.trim() }));
      setPartySearch(name.trim());
      setPartyPopoverOpen(false);
      fetchContacts();
    } catch {
      toast.error("خطأ في إضافة جهة الاتصال");
    } finally {
      setQuickAddingContact(false);
    }
  };

  const fetchCheques = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('cheques')
      .select('*')
      .eq('user_id', user.id)
      .order('cheque_date', { ascending: false });
    if (error) {
      toast.error("خطأ في جلب الشيكات");
    } else {
      setCheques(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCheques(); fetchContacts(); fetchAccounts(); fetchBankAccounts(); }, [user]);

  const fetchHistory = async (chequeId: string) => {
    if (statusHistory[chequeId]) return;
    const { data } = await supabase
      .from('cheque_status_history')
      .select('*')
      .eq('cheque_id', chequeId)
      .order('created_at', { ascending: false });
    setStatusHistory(prev => ({ ...prev, [chequeId]: (data || []) as StatusHistory[] }));
  };

  const handleAdd = async () => {
    if (!user || !newCheque.party_name || !newCheque.amount || !newCheque.cheque_date) {
      toast.error("يرجى تعبئة الحقول المطلوبة");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const chequeStatus: ChequeStatus = newCheque.cheque_date > today ? 'آجل' : 'مستحق';
      const { error } = await supabase.from('cheques').insert({
        user_id: user.id,
        cheque_type: newCheque.cheque_type,
        status: chequeStatus,
        cheque_number: newCheque.cheque_number || null,
        bank_name: newCheque.bank_name || null,
        cheque_date: newCheque.cheque_date,
        amount: parseFloat(newCheque.amount),
        currency: newCheque.currency,
        party_name: newCheque.party_name,
        party_type: newCheque.party_type,
        linked_account: newCheque.linked_account || null,
        notes: newCheque.notes || null,
      });
      if (error) throw error;
      toast.success(`تم تسجيل شيك ${newCheque.cheque_type} بنجاح`);
      setAddOpen(false);
      setNewCheque({ cheque_type: 'وارد', cheque_number: '', bank_name: '', cheque_date: '', amount: '', currency: 'شيكل', party_name: '', party_type: 'عميل', linked_account: '', notes: '' });
      setPartySearch('');
      fetchCheques();
    } catch {
      toast.error("خطأ في حفظ الشيك");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (cheque: Cheque, newStatus: ChequeStatus) => {
    // Intercept deposit: show bank account selection dialog
    if (newStatus === 'مودع') {
      setDepositTarget(cheque);
      setSelectedBankAccount("");
      return;
    }
    const { error } = await supabase.from('cheques').update({ status: newStatus }).eq('id', cheque.id);
    if (error) {
      toast.error("خطأ في تحديث الحالة");
      return;
    }
    await supabase.from('cheque_status_history').insert({
      cheque_id: cheque.id,
      user_id: user!.id,
      from_status: cheque.status,
      to_status: newStatus,
    });
    setStatusHistory(prev => { const n = { ...prev }; delete n[cheque.id]; return n; });
    toast.success(`تم تحويل الحالة إلى "${newStatus}"`);
    fetchCheques();
  };

  const handleDeposit = async () => {
    if (!depositTarget || !selectedBankAccount) {
      toast.error("يرجى اختيار الحساب البنكي");
      return;
    }
    const bank = bankAccounts.find(b => b.id === selectedBankAccount);
    const glCode = bank?.gl_account_code || null;
    
    const { error } = await supabase.from('cheques').update({ 
      status: 'مودع' as ChequeStatus,
      linked_account: glCode || depositTarget.linked_account,
    }).eq('id', depositTarget.id);
    if (error) {
      toast.error("خطأ في إيداع الشيك");
      return;
    }
    await supabase.from('cheque_status_history').insert({
      cheque_id: depositTarget.id,
      user_id: user!.id,
      from_status: depositTarget.status,
      to_status: 'مودع' as ChequeStatus,
      reason: `إيداع في ${bank?.name || 'حساب بنكي'}`,
    });
    setStatusHistory(prev => { const n = { ...prev }; delete n[depositTarget.id]; return n; });
    toast.success(`تم إيداع الشيك في "${bank?.name}"`);
    setDepositTarget(null);
    setSelectedBankAccount("");
    fetchCheques();
  };
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
    } catch {
      toast.error("خطأ في حذف الشيك");
    } finally {
      setDeleting(false);
    }
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
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allPageSelected = paged.length > 0 && paged.every(p => selected.has(p.id));
  const toggleAllPage = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allPageSelected) paged.forEach(p => next.delete(p.id));
      else paged.forEach(p => next.add(p.id));
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
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      fetchHistory(id);
    }
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; }
  };
  const fmtTime = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-primary-foreground/80 transition-colors w-full">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? "opacity-100" : "opacity-30"}`} />
    </button>
  );

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
            <Button className="gap-1.5 rounded-xl shadow-md shadow-primary/20">
              <Plus className="h-4 w-4" /> شيك جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-center">تسجيل شيك جديد</DialogTitle>
            </DialogHeader>
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
                    <Input 
                      className="h-9 rounded-xl" 
                      value={partySearch} 
                      onChange={e => {
                        setPartySearch(e.target.value);
                        setNewCheque(p => ({ ...p, party_name: e.target.value }));
                        setPartyPopoverOpen(true);
                      }}
                      onFocus={() => setPartyPopoverOpen(true)}
                      placeholder={`ابحث أو أضف ${newCheque.cheque_type === 'وارد' ? 'عميل' : 'مورد'}`}
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-1 rounded-xl max-h-48 overflow-y-auto" align="start" sideOffset={4}>
                    {(() => {
                      const targetType = newCheque.cheque_type === 'وارد' ? 'عميل' : 'مورد';
                      const filteredContacts = contacts
                        .filter(c => c.contact_type === targetType || c.contact_type === 'كلاهما')
                        .filter(c => !partySearch || c.contact_name.toLowerCase().includes(partySearch.toLowerCase()));
                      const exactMatch = contacts.some(c => c.contact_name === partySearch.trim());
                      return (
                        <>
                          {filteredContacts.length > 0 ? filteredContacts.map(c => (
                            <button
                              key={c.id}
                              className="w-full text-right px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors flex items-center gap-2"
                              onClick={() => {
                                setNewCheque(p => ({ ...p, party_name: c.contact_name }));
                                setPartySearch(c.contact_name);
                                setPartyPopoverOpen(false);
                              }}
                            >
                              <User className="h-3.5 w-3.5 text-muted-foreground" />
                              {c.contact_name}
                            </button>
                          )) : (
                            <p className="text-xs text-muted-foreground text-center py-2">لا توجد نتائج</p>
                          )}
                          {partySearch.trim() && !exactMatch && (
                            <button
                              className="w-full text-right px-3 py-2 text-sm rounded-lg hover:bg-primary/10 transition-colors flex items-center gap-2 text-primary font-medium border-t border-border mt-1 pt-2"
                              onClick={() => handleQuickAddContact(partySearch)}
                              disabled={quickAddingContact}
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              إضافة "{partySearch.trim()}" كـ{targetType} جديد
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">المبلغ *</Label>
                  <Input className="h-9 rounded-xl" type="number" value={newCheque.amount} onChange={e => setNewCheque(p => ({ ...p, amount: e.target.value }))} placeholder="0" />
                </div>
                <div>
                  <Label className="text-xs">تاريخ الاستحقاق *</Label>
                  <Input className="h-9 rounded-xl" type="date" value={newCheque.cheque_date} onChange={e => setNewCheque(p => ({ ...p, cheque_date: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">رقم الشيك</Label>
                  <Input className="h-9 rounded-xl" value={newCheque.cheque_number} onChange={e => setNewCheque(p => ({ ...p, cheque_number: e.target.value }))} placeholder="اختياري" />
                </div>
                <div>
                  <Label className="text-xs">البنك</Label>
                  <Input className="h-9 rounded-xl" value={newCheque.bank_name} onChange={e => setNewCheque(p => ({ ...p, bank_name: e.target.value }))} placeholder="اختياري" />
                </div>
              </div>
              <div>
                <Label className="text-xs">الحساب المحاسبي</Label>
                <Popover open={accountPopoverOpen} onOpenChange={setAccountPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Input
                      className="h-9 rounded-xl"
                      value={accountSearch || (newCheque.linked_account ? (() => {
                        const acc = accounts.find(a => a.account_code === newCheque.linked_account);
                        return acc ? `${acc.account_code} - ${acc.account_name}` : newCheque.linked_account;
                      })() : '')}
                      onChange={e => {
                        setAccountSearch(e.target.value);
                        if (!e.target.value) setNewCheque(p => ({ ...p, linked_account: '' }));
                        setAccountPopoverOpen(true);
                      }}
                      onFocus={() => setAccountPopoverOpen(true)}
                      placeholder="ابحث عن حساب من الشجرة"
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-1 rounded-xl max-h-48 overflow-y-auto" align="start" sideOffset={4}>
                    {(() => {
                      const filteredAccts = accounts.filter(a =>
                        !accountSearch ||
                        a.account_code.includes(accountSearch) ||
                        a.account_name.includes(accountSearch)
                      ).slice(0, 20);
                      return filteredAccts.length > 0 ? filteredAccts.map(a => (
                        <button
                          key={a.account_code}
                          className="w-full text-right px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors flex items-center justify-between"
                          onClick={() => {
                            setNewCheque(p => ({ ...p, linked_account: a.account_code }));
                            setAccountSearch('');
                            setAccountPopoverOpen(false);
                          }}
                        >
                          <span>{a.account_name}</span>
                          <span className="text-xs text-muted-foreground font-mono">{a.account_code}</span>
                        </button>
                      )) : (
                        <p className="text-xs text-muted-foreground text-center py-2">لا توجد نتائج</p>
                      );
                    })()}
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs">ملاحظات</Label>
                <Input className="h-9 rounded-xl" value={newCheque.notes} onChange={e => setNewCheque(p => ({ ...p, notes: e.target.value }))} placeholder="اختياري" />
              </div>
              <Button onClick={handleAdd} disabled={submitting} className="w-full rounded-xl h-10 shadow-md shadow-primary/20 gap-2">
                {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                تسجيل الشيك
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
                <p className="text-sm font-bold text-destructive">
                  {dueTodayCheques.length} شيك مستحق اليوم
                </p>
                <p className="text-xs text-destructive/70">
                  بقيمة إجمالية {dueTodayCheques.reduce((s, c) => s + c.amount, 0).toLocaleString()} ₪
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 text-xs"
              onClick={() => { setFilterStatus('مستحق'); setFilterType('all'); }}
            >
              <Eye className="h-3.5 w-3.5 ml-1" />
              عرض الآن
            </Button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {cheques.length > 0 && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
            <Input
              placeholder="ابحث بالاسم، رقم الشيك، البنك..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-10 rounded-xl bg-muted/30"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Status pills + type filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
              {STATUS_FILTERS.map(st => (
                <button key={st} onClick={() => setFilterStatus(st)} className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${filterStatus === st ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                  {st}
                </button>
              ))}
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px] rounded-xl text-xs">
                <SelectValue placeholder="نوع الشيك" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="all">كل الأنواع</SelectItem>
                <SelectItem value="وارد">⬇ وارد</SelectItem>
                <SelectItem value="صادر">⬆ صادر</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selected.size > 0 && (
            <div className="text-xs text-primary font-semibold">{selected.size} شيك محدد</div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}

      {/* Empty */}
      {!loading && cheques.length === 0 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Banknote className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">لا توجد شيكات بعد</h3>
          <p className="text-xs text-muted-foreground mb-4">سجّل أول شيك لبدء التتبع</p>
          <Button className="rounded-xl gap-2 shadow-md shadow-primary/20" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> شيك جديد
          </Button>
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
                  <th className="px-3 py-3 text-right w-10">
                    <Checkbox checked={allPageSelected} onCheckedChange={toggleAllPage} className="border-primary-foreground/50 data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary" />
                  </th>
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
                  const transitions = smartTransitions[c.status];
                  const isSelected = selected.has(c.id);
                  const isExpanded = expandedId === c.id;
                  const history = statusHistory[c.id] || [];
                  return (
                    <>
                      <tr
                        key={c.id}
                        className={`border-b border-border/50 transition-colors cursor-pointer ${
                          isSelected ? "bg-primary/5" : i % 2 === 0 ? "bg-background" : "bg-muted/20"
                        } hover:bg-primary/5`}
                        onClick={() => toggleExpand(c.id)}
                      >
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(c.id)} />
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground font-mono" dir="ltr">{c.cheque_number || "—"}</td>
                        <td className="px-3 py-3">
                          <p className="text-sm font-semibold text-foreground">{c.party_name}</p>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="outline" className="text-[10px]">
                            {c.cheque_type === 'وارد' ? '⬇ وارد' : '⬆ صادر'}
                          </Badge>
                        </td>
                        <td className={`px-3 py-3 text-sm font-bold tabular-nums ${c.cheque_type === 'وارد' ? 'text-emerald-600' : 'text-destructive'}`}>
                          {c.amount.toLocaleString()} ₪
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums">{fmtDate(c.cheque_date)}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sc.badgeClass}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.color.replace('text-', 'bg-')}`} />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{c.bank_name || '—'}</td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {transitions.slice(0, 2).map((t) => (
                              <button
                                key={t.status}
                                onClick={() => handleStatusChange(c, t.status)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all hover:opacity-80 ${
                                  t.variant === 'destructive' ? 'bg-destructive/10 text-destructive' : t.variant === 'default' ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground'
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                            <button
                              onClick={() => setDeleteTarget(c)}
                              className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                              title="حذف"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* Expanded Details Row */}
                      {isExpanded && (
                        <tr key={`${c.id}-details`}>
                          <td colSpan={9} className="bg-muted/10 border-b border-border/50 px-6 py-4">
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <User className="h-3 w-3" />
                                  <span>الجهة: <strong className="text-foreground">{c.party_name}</strong></span>
                                </div>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  <span>الاستحقاق: <strong className="text-foreground">{fmtDate(c.cheque_date)}</strong></span>
                                </div>
                                {c.linked_account && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Hash className="h-3 w-3" />
                                    <span>الحساب: <strong className="text-foreground">{c.linked_account}</strong></span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  <span>التسجيل: <strong className="text-foreground">{fmtDate(c.created_at)}</strong></span>
                                </div>
                              </div>
                              {c.notes && (
                                <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground bg-muted/30 rounded-xl p-2.5">
                                  <StickyNote className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                  <span>{c.notes}</span>
                                </div>
                              )}
                              {history.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-semibold text-foreground flex items-center gap-1 mb-2">
                                    <History className="h-3.5 w-3.5 text-primary" />
                                    سجل تغيير الحالات
                                  </p>
                                  <div className="space-y-1.5 mr-3 border-r-2 border-primary/20 pr-3">
                                    {history.map((h) => (
                                      <div key={h.id} className="flex items-center gap-2 text-[10px]">
                                        <div className="w-2 h-2 rounded-full bg-primary -mr-[17px]" />
                                        <span className="text-muted-foreground">{fmtTime(h.created_at)}</span>
                                        <span className="text-foreground">
                                          {h.from_status ? `${h.from_status} → ${h.to_status}` : `تسجيل: ${h.to_status}`}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
              {/* Footer totals */}
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
              <p className="text-xs text-muted-foreground">
                {selected.size > 0 ? `${selected.size} شيك محدد` : `صفحة ${page} من ${totalPages}`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Deposit Dialog */}
      <Dialog open={!!depositTarget} onOpenChange={(v) => { if (!v) { setDepositTarget(null); setSelectedBankAccount(""); } }}>
        <DialogContent className="max-w-sm rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-center">إيداع شيك في حساب بنكي</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="bg-muted/30 rounded-xl p-3 text-sm space-y-1">
              <p className="text-muted-foreground">الجهة: <strong className="text-foreground">{depositTarget?.party_name}</strong></p>
              <p className="text-muted-foreground">المبلغ: <strong className={depositTarget?.cheque_type === 'وارد' ? 'text-emerald-600' : 'text-destructive'}>{depositTarget?.amount.toLocaleString()} {depositTarget?.currency}</strong></p>
              <p className="text-muted-foreground">الاستحقاق: <strong className="text-foreground">{depositTarget?.cheque_date && fmtDate(depositTarget.cheque_date)}</strong></p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">اختر الحساب البنكي *</Label>
              {bankAccounts.length === 0 ? (
                <div className="text-center py-4 space-y-2">
                  <Building2 className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-xs text-muted-foreground">لا توجد حسابات بنكية</p>
                  <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => navigate('/finance/bank-accounts')}>
                    إضافة حساب بنكي
                  </Button>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {bankAccounts.map(bank => (
                    <button
                      key={bank.id}
                      onClick={() => setSelectedBankAccount(bank.id)}
                      className={`w-full text-right px-3 py-2.5 rounded-xl border transition-all flex items-center justify-between ${
                        selectedBankAccount === bank.id
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border hover:border-primary/30 hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className={`h-4 w-4 ${selectedBankAccount === bank.id ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{bank.name}</p>
                          <p className="text-[10px] text-muted-foreground">{bank.bank_name}</p>
                        </div>
                      </div>
                      {bank.gl_account_code && (
                        <span className="text-[10px] text-muted-foreground font-mono">{bank.gl_account_code}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleDeposit}
                disabled={!selectedBankAccount}
                className="flex-1 rounded-xl h-10 shadow-md shadow-primary/20 gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                تأكيد الإيداع
              </Button>
              <Button variant="outline" className="rounded-xl h-10" onClick={() => { setDepositTarget(null); setSelectedBankAccount(""); }}>
                إلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف الشيك</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد من حذف شيك "{deleteTarget?.party_name}" بقيمة {deleteTarget?.amount.toLocaleString()} {deleteTarget?.currency}؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="rounded-xl">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl gap-2"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <RefreshCw className="h-4 w-4 animate-spin" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChequesPage;
