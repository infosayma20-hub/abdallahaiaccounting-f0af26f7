import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { 
  FileText, Plus, Search, ArrowLeft, CheckCircle2, 
  Clock, AlertTriangle, Ban, RefreshCw, Download, ChevronDown, ChevronUp,
  Building2, Calendar, Hash, User, Banknote, Filter, 
  ArrowDownCircle, ArrowUpCircle, Table2, LayoutGrid, Eye, Trash2,
  TrendingUp, TrendingDown, History, Image as ImageIcon, StickyNote
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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

// Smart transitions: only show logical next actions
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

const quickFilters = [
  { key: 'today', label: 'مستحقة اليوم', icon: AlertTriangle },
  { key: 'due', label: 'مستحقة', icon: Clock },
  { key: 'soon', label: 'آجلة خلال 7 أيام', icon: Calendar },
  { key: 'returned', label: 'مرتجعة', icon: RefreshCw },
];

const ChequesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<string>("");
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [addOpen, setAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusHistory, setStatusHistory] = useState<Record<string, StatusHistory[]>>({});
  const [deleteTarget, setDeleteTarget] = useState<Cheque | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newCheque, setNewCheque] = useState({
    cheque_type: 'وارد' as ChequeType,
    cheque_number: '',
    bank_name: '',
    cheque_date: '',
    amount: '',
    currency: 'شيكل',
    party_name: '',
    party_type: 'عميل',
    notes: '',
  });

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

  useEffect(() => { fetchCheques(); }, [user]);

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
        notes: newCheque.notes || null,
      });

      if (error) throw error;
      toast.success(`تم تسجيل شيك ${newCheque.cheque_type} بنجاح`);
      setAddOpen(false);
      setNewCheque({ cheque_type: 'وارد', cheque_number: '', bank_name: '', cheque_date: '', amount: '', currency: 'شيكل', party_name: '', party_type: 'عميل', notes: '' });
      fetchCheques();
    } catch (err: any) {
      toast.error("خطأ في حفظ الشيك");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (cheque: Cheque, newStatus: ChequeStatus) => {
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
    // Clear history cache for this cheque
    setStatusHistory(prev => { const n = { ...prev }; delete n[cheque.id]; return n; });
    toast.success(`تم تحويل الحالة إلى "${newStatus}"`);
    fetchCheques();
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      // Delete history first
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
  const in7days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const filtered = useMemo(() => {
    return cheques.filter(c => {
      if (filterType !== 'all' && c.cheque_type !== filterType) return false;
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      if (quickFilter === 'today' && !(c.status === 'مستحق' && c.cheque_date <= today)) return false;
      if (quickFilter === 'due' && c.status !== 'مستحق') return false;
      if (quickFilter === 'soon' && !(c.status === 'آجل' && c.cheque_date <= in7days)) return false;
      if (quickFilter === 'returned' && c.status !== 'مرتجع') return false;
      if (search) {
        const s = search.toLowerCase();
        if (!c.party_name.toLowerCase().includes(s) && !c.cheque_number?.toLowerCase().includes(s) && !c.bank_name?.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [cheques, filterType, filterStatus, quickFilter, search, today, in7days]);

  // Analytics
  const totalIncoming = cheques.filter(c => c.cheque_type === 'وارد').reduce((s, c) => s + c.amount, 0);
  const totalOutgoing = cheques.filter(c => c.cheque_type === 'صادر').reduce((s, c) => s + c.amount, 0);
  const totalDueToday = cheques.filter(c => c.status === 'مستحق').reduce((s, c) => s + c.amount, 0);
  const dueCount = cheques.filter(c => c.status === 'مستحق').length;
  const totalPending = cheques.filter(c => c.status === 'آجل').reduce((s, c) => s + c.amount, 0);
  const totalReturned = cheques.filter(c => c.status === 'مرتجع').reduce((s, c) => s + c.amount, 0);

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
    try { return new Date(d).toLocaleDateString('ar-PS', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; }
  };
  const fmtTime = (d: string) => {
    try { return new Date(d).toLocaleDateString('ar-PS', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
  };

  const kpiCards = [
    { label: 'شيكات واردة', value: totalIncoming, count: cheques.filter(c => c.cheque_type === 'وارد').length, color: 'text-emerald-600', bg: 'bg-emerald-500/10', icon: ArrowDownCircle },
    { label: 'شيكات صادرة', value: totalOutgoing, count: cheques.filter(c => c.cheque_type === 'صادر').length, color: 'text-red-500', bg: 'bg-red-500/10', icon: ArrowUpCircle },
    { label: 'مستحقة', value: totalDueToday, count: dueCount, color: 'text-red-600', bg: 'bg-red-500/10', icon: AlertTriangle },
    { label: 'آجلة', value: totalPending, count: cheques.filter(c => c.status === 'آجل').length, color: 'text-amber-600', bg: 'bg-amber-500/10', icon: Clock },
    { label: 'مرتجعة', value: totalReturned, count: cheques.filter(c => c.status === 'مرتجع').length, color: 'text-rose-700', bg: 'bg-rose-500/10', icon: RefreshCw },
  ];

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-5xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">إدارة الشيكات</h1>
            <p className="text-[11px] text-muted-foreground">{cheques.length} شيك مسجل</p>
          </div>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl gap-1.5 shadow-md shadow-primary/20">
              <Plus className="h-4 w-4" />
              شيك جديد
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
                <Input className="h-9 rounded-xl" value={newCheque.party_name} onChange={e => setNewCheque(p => ({ ...p, party_name: e.target.value }))} placeholder="الاسم" />
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

      {/* ═══ Due Today Alert Banner ═══ */}
      {dueTodayCheques.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-red-500/30 bg-red-500/5 p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600 animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-bold text-red-700 dark:text-red-400">
                  {dueTodayCheques.length} شيك مستحق اليوم
                </p>
                <p className="text-xs text-red-600/70">
                  بقيمة إجمالية {dueTodayCheques.reduce((s, c) => s + c.amount, 0).toLocaleString()} ₪
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl border-red-500/30 text-red-600 hover:bg-red-500/10 text-xs"
              onClick={() => { setQuickFilter('today'); setFilterType('all'); setFilterStatus('all'); }}
            >
              <Eye className="h-3.5 w-3.5 ml-1" />
              عرض الآن
            </Button>
          </div>
        </div>
      )}

      {/* ═══ KPI Analytics Cards ═══ */}
      <div className="grid grid-cols-5 gap-2">
        {kpiCards.map((kpi) => {
          const KIcon = kpi.icon;
          return (
            <Card key={kpi.label} className="border-0 shadow-sm overflow-hidden">
              <CardContent className="p-3 text-center space-y-1">
                <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center mx-auto`}>
                  <KIcon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                <p className={`text-sm font-bold ${kpi.color}`}>{kpi.value.toLocaleString()}</p>
                <p className="text-[9px] text-muted-foreground">{kpi.count} شيك</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ═══ Quick Filters + Search ═══ */}
      <div className="space-y-2">
        <div className="flex gap-1.5 flex-wrap">
          {quickFilters.map((qf) => {
            const QIcon = qf.icon;
            const isActive = quickFilter === qf.key;
            return (
              <button
                key={qf.key}
                onClick={() => setQuickFilter(isActive ? '' : qf.key)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-medium transition-all active:scale-95 ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'bg-secondary text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}
              >
                <QIcon className="h-3 w-3" />
                {qf.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="h-9 pr-9 text-xs rounded-xl" placeholder="بحث بالاسم، رقم الشيك، البنك..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterType} onValueChange={v => { setFilterType(v); setQuickFilter(''); }}>
            <SelectTrigger className="h-9 w-24 text-xs rounded-xl"><SelectValue placeholder="النوع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="وارد">وارد</SelectItem>
              <SelectItem value="صادر">صادر</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setQuickFilter(''); }}>
            <SelectTrigger className="h-9 w-24 text-xs rounded-xl"><SelectValue placeholder="الحالة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="آجل">آجل</SelectItem>
              <SelectItem value="مستحق">مستحق</SelectItem>
              <SelectItem value="مودع">مودع</SelectItem>
              <SelectItem value="محصل">محصل</SelectItem>
              <SelectItem value="مرتجع">مرتجع</SelectItem>
              <SelectItem value="ملغي">ملغي</SelectItem>
            </SelectContent>
          </Select>
          {/* View Toggle */}
          <button
            onClick={() => setViewMode(viewMode === 'cards' ? 'table' : 'cards')}
            className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center hover:bg-primary/10 transition-colors"
            title={viewMode === 'cards' ? 'عرض جدولي' : 'عرض بطاقات'}
          >
            {viewMode === 'cards' ? <Table2 className="h-4 w-4 text-muted-foreground" /> : <LayoutGrid className="h-4 w-4 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* ═══ Results Count ═══ */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{filtered.length} نتيجة</p>
        {quickFilter && (
          <button onClick={() => setQuickFilter('')} className="text-[10px] text-primary hover:underline">
            إزالة الفلتر ✕
          </button>
        )}
      </div>

      {/* ═══ Content ═══ */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">جارِ التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <Banknote className="h-12 w-12 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">لا توجد شيكات</p>
          <p className="text-[11px] text-muted-foreground/60">سجّل أول شيك باستخدام الزر أعلاه</p>
        </div>
      ) : viewMode === 'table' ? (
        /* ═══ TABLE VIEW ═══ */
        <div className="border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-3 py-2.5 text-right font-semibold text-foreground">#</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-foreground">الجهة</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-foreground">النوع</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-foreground">المبلغ</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-foreground">الاستحقاق</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-foreground">الحالة</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-foreground">البنك</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-foreground">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => {
                  const sc = statusConfig[c.status];
                  const transitions = smartTransitions[c.status];
                  return (
                    <tr key={c.id} className="border-t border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2.5 text-muted-foreground">{c.cheque_number || (i + 1)}</td>
                      <td className="px-3 py-2.5 font-semibold text-foreground">{c.party_name}</td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge variant="outline" className="text-[9px]">
                          {c.cheque_type === 'وارد' ? '⬇ وارد' : '⬆ صادر'}
                        </Badge>
                      </td>
                      <td className={`px-3 py-2.5 text-center font-bold ${c.cheque_type === 'وارد' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {c.amount.toLocaleString()} ₪
                      </td>
                      <td className="px-3 py-2.5 text-center text-muted-foreground">{fmtDate(c.cheque_date)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge className={`text-[9px] border-0 ${sc.badgeClass}`}>{sc.label}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-center text-muted-foreground">{c.bank_name || '-'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {transitions.slice(0, 2).map((t) => (
                            <button
                              key={t.status}
                              onClick={() => handleStatusChange(c, t.status)}
                              className={`px-2 py-0.5 rounded-md text-[9px] font-medium transition-all hover:opacity-80 ${
                                t.variant === 'destructive' ? 'bg-destructive/10 text-destructive' : t.variant === 'default' ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ═══ CARD VIEW ═══ */
        <div className="space-y-2">
          {filtered.map((cheque) => {
            const sc = statusConfig[cheque.status];
            const StatusIcon = sc.icon;
            const transitions = smartTransitions[cheque.status];
            const isExpanded = expandedId === cheque.id;
            const history = statusHistory[cheque.id] || [];

            return (
              <Card key={cheque.id} className="border-0 shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  {/* Main Row */}
                  <div
                    className="p-3.5 cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => toggleExpand(cheque.id)}
                  >
                    <div className="flex items-start justify-between">
                      {/* Right: Amount + Date */}
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl ${sc.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <StatusIcon className={`h-5 w-5 ${sc.color}`} />
                        </div>
                        <div>
                          <p className={`text-lg font-extrabold ${cheque.cheque_type === 'وارد' ? 'text-emerald-600' : 'text-red-500'}`}>
                            {cheque.amount.toLocaleString()} <span className="text-xs font-semibold opacity-70">{cheque.currency}</span>
                          </p>
                          <p className="text-sm font-semibold text-foreground mt-0.5">{cheque.party_name}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[9px] h-5 rounded-md">
                              {cheque.cheque_type === 'وارد' ? '⬇ وارد' : '⬆ صادر'}
                            </Badge>
                            <Badge className={`text-[9px] h-5 rounded-md border-0 ${sc.badgeClass}`}>
                              {sc.label}
                            </Badge>
                            {cheque.cheque_number && (
                              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                <Hash className="h-3 w-3" />{cheque.cheque_number}
                              </span>
                            )}
                            {cheque.bank_name && (
                              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                <Building2 className="h-3 w-3" />{cheque.bank_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Left: Date + Expand */}
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {fmtDate(cheque.cheque_date)}
                        </span>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground/40" /> : <ChevronDown className="h-4 w-4 text-muted-foreground/40" />}
                      </div>
                    </div>
                  </div>

                  {/* Smart Action Buttons */}
                  {transitions.length > 0 && (
                    <div className="px-3.5 pb-3 flex gap-1.5 flex-wrap">
                      {transitions.map((t) => (
                        <Button
                          key={t.status}
                          size="sm"
                          variant={t.variant === 'destructive' ? 'destructive' : t.variant === 'default' ? 'default' : 'outline'}
                          className="h-7 text-[10px] rounded-lg gap-1 px-3"
                          onClick={(e) => { e.stopPropagation(); handleStatusChange(cheque, t.status); }}
                        >
                          {t.label}
                        </Button>
                      ))}
                    </div>
                  )}

                  {/* ═══ Expanded Details ═══ */}
                  {isExpanded && (
                    <div className="border-t border-border/30 bg-muted/10 p-3.5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                      {/* Info Grid */}
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>الجهة: <strong className="text-foreground">{cheque.party_name}</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>الاستحقاق: <strong className="text-foreground">{fmtDate(cheque.cheque_date)}</strong></span>
                        </div>
                        {cheque.cheque_number && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Hash className="h-3 w-3" />
                            <span>رقم الشيك: <strong className="text-foreground">{cheque.cheque_number}</strong></span>
                          </div>
                        )}
                        {cheque.bank_name && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            <span>البنك: <strong className="text-foreground">{cheque.bank_name}</strong></span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>تاريخ التسجيل: <strong className="text-foreground">{fmtDate(cheque.created_at)}</strong></span>
                        </div>
                      </div>

                      {/* Notes */}
                      {cheque.notes && (
                        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground bg-muted/30 rounded-xl p-2.5">
                          <StickyNote className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          <span>{cheque.notes}</span>
                        </div>
                      )}

                      {/* Status History Timeline */}
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

                      {/* Delete Button */}
                      <div className="pt-1 border-t border-border/30">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(cheque); }}
                          className="flex items-center gap-1.5 text-[10px] text-destructive hover:underline"
                        >
                          <Trash2 className="h-3 w-3" />
                          حذف الشيك
                        </button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
