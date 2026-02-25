import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { 
  FileText, Plus, Search, Filter, ArrowLeft, CheckCircle2, 
  Clock, AlertTriangle, Ban, RefreshCw, Download, ChevronDown,
  Building2, Calendar, Hash, Banknote, User
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

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
  created_at: string;
}

const statusConfig: Record<ChequeStatus, { icon: any; color: string; bg: string }> = {
  'مسجل': { icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted/50' },
  'آجل': { icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
  'مستحق': { icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
  'مودع': { icon: Building2, color: 'text-primary', bg: 'bg-primary/10' },
  'محصل': { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  'مرتجع': { icon: RefreshCw, color: 'text-destructive', bg: 'bg-destructive/10' },
  'ملغي': { icon: Ban, color: 'text-muted-foreground', bg: 'bg-muted/30' },
};

const allowedTransitions: Record<ChequeStatus, ChequeStatus[]> = {
  'مسجل': ['آجل', 'مستحق', 'ملغي'],
  'آجل': ['مستحق', 'مودع', 'مرتجع', 'ملغي'],
  'مستحق': ['مودع', 'مرتجع', 'ملغي'],
  'مودع': ['محصل', 'مرتجع'],
  'محصل': [],
  'مرتجع': ['آجل'],
  'ملغي': [],
};

const ChequesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
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
      console.error(error);
    } else {
      setCheques(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCheques(); }, [user]);

  const handleAdd = async () => {
    if (!user || !newCheque.party_name || !newCheque.amount || !newCheque.cheque_date) {
      toast.error("يرجى تعبئة الحقول المطلوبة");
      return;
    }
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

    if (error) {
      toast.error("خطأ في حفظ الشيك");
    } else {
      toast.success(`تم تسجيل شيك ${newCheque.cheque_type} بنجاح`);
      setAddOpen(false);
      setNewCheque({ cheque_type: 'وارد', cheque_number: '', bank_name: '', cheque_date: '', amount: '', currency: 'شيكل', party_name: '', party_type: 'عميل', notes: '' });
      fetchCheques();
    }
  };

  const handleStatusChange = async (cheque: Cheque, newStatus: ChequeStatus) => {
    const { error } = await supabase.from('cheques').update({ status: newStatus }).eq('id', cheque.id);
    if (error) {
      toast.error("خطأ في تحديث الحالة");
      return;
    }
    // Log status change
    await supabase.from('cheque_status_history').insert({
      cheque_id: cheque.id,
      user_id: user!.id,
      from_status: cheque.status,
      to_status: newStatus,
    });
    toast.success(`تم تحويل الحالة إلى "${newStatus}"`);
    fetchCheques();
  };

  const filtered = cheques.filter(c => {
    if (filterType !== 'all' && c.cheque_type !== filterType) return false;
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (search && !c.party_name.includes(search) && !c.cheque_number?.includes(search) && !c.bank_name?.includes(search)) return false;
    return true;
  });

  const totalIncoming = cheques.filter(c => c.cheque_type === 'وارد').reduce((s, c) => s + c.amount, 0);
  const totalOutgoing = cheques.filter(c => c.cheque_type === 'صادر').reduce((s, c) => s + c.amount, 0);
  const totalDue = cheques.filter(c => c.status === 'مستحق').reduce((s, c) => s + c.amount, 0);
  const totalCollected = cheques.filter(c => c.status === 'محصل').reduce((s, c) => s + c.amount, 0);

  return (
    <div className="px-4 pt-4 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-muted/50 hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">إدارة الشيكات</h1>
            <p className="text-[11px] text-muted-foreground">{cheques.length} شيك مسجل</p>
          </div>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl gap-1.5">
              <Plus className="h-4 w-4" />
              شيك جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>تسجيل شيك جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">نوع الشيك</Label>
                  <Select value={newCheque.cheque_type} onValueChange={(v) => setNewCheque(p => ({ ...p, cheque_type: v as ChequeType, party_type: v === 'وارد' ? 'عميل' : 'مورد' }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="وارد">وارد (من عميل)</SelectItem>
                      <SelectItem value="صادر">صادر (لمورد)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">العملة</Label>
                  <Select value={newCheque.currency} onValueChange={(v) => setNewCheque(p => ({ ...p, currency: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="شيكل">شيكل</SelectItem>
                      <SelectItem value="دينار">دينار</SelectItem>
                      <SelectItem value="دولار">دولار</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">اسم {newCheque.cheque_type === 'وارد' ? 'العميل' : 'المورد'} *</Label>
                <Input className="h-9" value={newCheque.party_name} onChange={e => setNewCheque(p => ({ ...p, party_name: e.target.value }))} placeholder="الاسم" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">المبلغ *</Label>
                  <Input className="h-9" type="number" value={newCheque.amount} onChange={e => setNewCheque(p => ({ ...p, amount: e.target.value }))} placeholder="0" />
                </div>
                <div>
                  <Label className="text-xs">تاريخ الشيك *</Label>
                  <Input className="h-9" type="date" value={newCheque.cheque_date} onChange={e => setNewCheque(p => ({ ...p, cheque_date: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">رقم الشيك</Label>
                  <Input className="h-9" value={newCheque.cheque_number} onChange={e => setNewCheque(p => ({ ...p, cheque_number: e.target.value }))} placeholder="اختياري" />
                </div>
                <div>
                  <Label className="text-xs">البنك</Label>
                  <Input className="h-9" value={newCheque.bank_name} onChange={e => setNewCheque(p => ({ ...p, bank_name: e.target.value }))} placeholder="اختياري" />
                </div>
              </div>
              <div>
                <Label className="text-xs">ملاحظات</Label>
                <Input className="h-9" value={newCheque.notes} onChange={e => setNewCheque(p => ({ ...p, notes: e.target.value }))} placeholder="اختياري" />
              </div>
              <Button onClick={handleAdd} className="w-full">تسجيل الشيك</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">واردة</p>
            <p className="text-sm font-bold text-emerald-600">{totalIncoming.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">صادرة</p>
            <p className="text-sm font-bold text-destructive">{totalOutgoing.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">مستحقة</p>
            <p className="text-sm font-bold text-warning">{totalDue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">محصلة</p>
            <p className="text-sm font-bold text-primary">{totalCollected.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-9 pr-9 text-xs" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-9 w-24 text-xs"><SelectValue placeholder="النوع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="وارد">وارد</SelectItem>
            <SelectItem value="صادر">صادر</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-24 text-xs"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="آجل">آجل</SelectItem>
            <SelectItem value="مستحق">مستحق</SelectItem>
            <SelectItem value="مودع">مودع</SelectItem>
            <SelectItem value="محصل">محصل</SelectItem>
            <SelectItem value="مرتجع">مرتجع</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cheques List */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">جارِ التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">لا توجد شيكات</p>
          </div>
        ) : (
          filtered.map(cheque => {
            const sc = statusConfig[cheque.status];
            const StatusIcon = sc.icon;
            const transitions = allowedTransitions[cheque.status];
            return (
              <Card key={cheque.id} className="border-0 shadow-sm overflow-hidden">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${sc.bg}`}>
                        <StatusIcon className={`h-4 w-4 ${sc.color}`} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{cheque.party_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[9px] h-4">
                            {cheque.cheque_type === 'وارد' ? '⬇ وارد' : '⬆ صادر'}
                          </Badge>
                          <Badge className={`text-[9px] h-4 ${sc.bg} ${sc.color} border-0`}>
                            {cheque.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className={`text-sm font-bold ${cheque.cheque_type === 'وارد' ? 'text-emerald-600' : 'text-destructive'}`}>
                        {cheque.amount.toLocaleString()} {cheque.currency}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{cheque.cheque_date}</p>
                    </div>
                  </div>

                  {/* Details row */}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    {cheque.cheque_number && (
                      <span className="flex items-center gap-0.5"><Hash className="h-3 w-3" />{cheque.cheque_number}</span>
                    )}
                    {cheque.bank_name && (
                      <span className="flex items-center gap-0.5"><Building2 className="h-3 w-3" />{cheque.bank_name}</span>
                    )}
                  </div>

                  {/* Status Transition Buttons */}
                  {transitions.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap pt-1 border-t border-border/50">
                      {transitions.map(next => {
                        const nc = statusConfig[next];
                        const NIcon = nc.icon;
                        return (
                          <button
                            key={next}
                            onClick={() => handleStatusChange(cheque, next)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium ${nc.bg} ${nc.color} hover:opacity-80 transition-all active:scale-95`}
                          >
                            <NIcon className="h-3 w-3" />
                            {next}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ChequesPage;
