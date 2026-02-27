import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Loader2, RefreshCw, Pencil, Trash2, CheckSquare, X, RotateCcw, Archive, Search, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

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
}

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
}

const typeColors: Record<string, string> = {
  "سند صرف": "bg-destructive/10 text-destructive",
  "سند قبض": "bg-primary/10 text-primary",
  "قيد يومية": "bg-warning/10 text-warning",
  "فاتورة مشتريات": "bg-accent text-accent-foreground",
  "فاتورة مبيعات": "bg-primary/10 text-primary",
  "رصيد ابتدائي": "bg-muted text-muted-foreground",
};

const getPaymentMethodTag = (tx: Transaction, accounts: Account[]): { label: string; emoji: string } | null => {
  const debitAcc = accounts.find(a => a.account_code === tx.debit_account_code);
  const creditAcc = accounts.find(a => a.account_code === tx.credit_account_code);
  const allNames = ((debitAcc?.account_name || '') + ' ' + (creditAcc?.account_name || '')).toLowerCase();
  if (allNames.includes("صندوق")) return { label: "نقدي", emoji: "🟢" };
  if (allNames.includes("ذمم")) return { label: "آجل", emoji: "📋" };
  if (allNames.includes("بنك")) return { label: "تحويل", emoji: "💳" };
  return null;
};

const transactionTypes = [
  { value: "سند صرف", label: "سند صرف" },
  { value: "سند قبض", label: "سند قبض" },
  { value: "قيد يومية", label: "قيد يومية" },
  { value: "فاتورة مشتريات", label: "فاتورة مشتريات" },
  { value: "فاتورة مبيعات", label: "فاتورة مبيعات" },
  { value: "رصيد ابتدائي", label: "رصيد ابتدائي" },
];

const TransactionsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editFields, setEditFields] = useState({
    description: "",
    transaction_type: "",
    amount: "",
    currency: "",
    transaction_date: "",
    debit_account_code: "",
    credit_account_code: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [typeFilter, setTypeFilter] = useState("all");

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

  const getAccountDisplay = (code: string) => {
    const acc = accounts.find(a => a.account_code === code);
    return acc ? `${acc.account_code} - ${acc.account_name}` : code;
  };

  const openEdit = (tx: Transaction) => {
    if (selectMode) return;
    setEditingTx(tx);
    setEditFields({
      description: tx.description || "",
      transaction_type: tx.transaction_type || "",
      amount: String(tx.amount || ""),
      currency: tx.currency || "شيكل",
      transaction_date: tx.transaction_date || "",
      debit_account_code: tx.debit_account_code || "",
      credit_account_code: tx.credit_account_code || "",
    });
  };

  const handleSave = async () => {
    if (!editingTx) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('transactions').update({
        description: editFields.description,
        transaction_type: editFields.transaction_type,
        amount: Number(editFields.amount),
        currency: editFields.currency,
        transaction_date: editFields.transaction_date,
        debit_account_code: editFields.debit_account_code,
        credit_account_code: editFields.credit_account_code,
      }).eq('id', editingTx.id);
      if (error) throw error;
      toast({ title: "تم تعديل المعاملة بنجاح ✅" });
      setEditingTx(null);
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingTx) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('transactions').update({ is_deleted: true }).eq('id', editingTx.id);
      if (error) throw error;
      toast({ title: "تم نقل المعاملة إلى سلة المحذوفات 🗑️" });
      setEditingTx(null);
      setShowDeleteConfirm(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTransactions.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredTransactions.map(tx => tx.id)));
  };

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from('transactions').update({ is_deleted: true }).in('id', ids);
      if (error) throw error;
      toast({ title: `تم نقل ${ids.length} معاملة إلى سلة المحذوفات 🗑️` });
      setShowBulkDeleteConfirm(false);
      exitSelectMode();
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      const { error } = await supabase.from('transactions').update({ is_deleted: false }).eq('id', id);
      if (error) throw error;
      toast({ title: "تم استرجاع المعاملة بنجاح ✅" });
      fetchDeletedTransactions();
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setRestoringId(null);
    }
  };

  const handleRestoreAll = async () => {
    setBulkDeleting(true);
    try {
      const ids = deletedTransactions.map(tx => tx.id);
      const { error } = await supabase.from('transactions').update({ is_deleted: false }).in('id', ids);
      if (error) throw error;
      toast({ title: `تم استرجاع ${ids.length} معاملة بنجاح ✅` });
      fetchDeletedTransactions();
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setBulkDeleting(false);
    }
  };

  // Filter transactions
  const filteredTransactions = transactions.filter(tx => {
    if (typeFilter !== "all" && tx.transaction_type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!(tx.description || '').toLowerCase().includes(q) &&
          !getAccountDisplay(tx.debit_account_code).toLowerCase().includes(q) &&
          !getAccountDisplay(tx.credit_account_code).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const accountNames = accounts.map(a => `${a.account_code} - ${a.account_name}`);

  return (
    <div className="px-4 pt-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => showTrash ? setShowTrash(false) : navigate("/")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">{showTrash ? "سلة المحذوفات" : "المعاملات"}</h1>
            <p className="text-xs text-muted-foreground">
              {showTrash ? `${deletedTransactions.length} معاملة محذوفة` : `${filteredTransactions.length} معاملة`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!showTrash && (
            <>
              {!selectMode ? (
                <Button variant="ghost" size="icon" onClick={() => setSelectMode(true)} disabled={loading || transactions.length === 0}>
                  <CheckSquare className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="ghost" size="icon" onClick={exitSelectMode}>
                  <X className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => setShowTrash(true)} className="relative">
                <Archive className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={showTrash ? fetchDeletedTransactions : fetchData} disabled={loading || loadingTrash}>
            <RefreshCw className={`h-4 w-4 ${(loading || loadingTrash) ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Select mode toolbar */}
      {selectMode && !showTrash && (
        <div className="flex items-center justify-between bg-muted/50 rounded-xl p-3 border border-border">
          <div className="flex items-center gap-3">
            <Checkbox checked={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0} onCheckedChange={toggleSelectAll} />
            <span className="text-sm text-foreground">{selectedIds.size > 0 ? `تم تحديد ${selectedIds.size}` : "حدد المعاملات"}</span>
          </div>
          <Button variant="destructive" size="sm" className="gap-1.5 rounded-xl" disabled={selectedIds.size === 0} onClick={() => setShowBulkDeleteConfirm(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            حذف ({selectedIds.size})
          </Button>
        </div>
      )}

      {/* Search & Filter */}
      {!showTrash && !loading && !error && transactions.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ابحث في المعاملات..." className="pr-9 rounded-xl text-sm" dir="rtl" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter} dir="rtl">
            <SelectTrigger className="w-[130px] rounded-xl text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">جميع الأنواع</SelectItem>
              {transactionTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Trash view */}
      {showTrash && (
        <>
          {deletedTransactions.length > 0 && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={handleRestoreAll} disabled={bulkDeleting}>
                {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                استرجاع الكل ({deletedTransactions.length})
              </Button>
            </div>
          )}
          {loadingTrash && <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
          {!loadingTrash && deletedTransactions.length === 0 && (
            <div className="text-center py-16 space-y-2">
              <Archive className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">سلة المحذوفات فارغة</p>
            </div>
          )}
          {!loadingTrash && deletedTransactions.map((tx) => (
            <Card key={tx.id} className="border-0 shadow-sm overflow-hidden opacity-75">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-semibold text-foreground line-through flex-1">{tx.description || "بدون وصف"}</p>
                  <p className="text-sm font-bold text-foreground tabular-nums">{tx.amount?.toLocaleString()} {tx.currency}</p>
                </div>
                <div className="flex items-center justify-between mt-2">
                  {tx.transaction_type && <Badge variant="secondary" className={`text-[10px] ${typeColors[tx.transaction_type] || ""}`}>{tx.transaction_type}</Badge>}
                  <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs" onClick={() => handleRestore(tx.id)} disabled={restoringId === tx.id}>
                    {restoringId === tx.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    استرجاع
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}

      {/* Main transactions list */}
      {!showTrash && loading && <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
      
      {!showTrash && error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchData}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      )}

      {!showTrash && !loading && !error && filteredTransactions.length === 0 && (
        <div className="text-center py-16 space-y-2">
          <p className="text-sm text-muted-foreground">لا توجد معاملات</p>
        </div>
      )}

      {!showTrash && !loading && !error && (
        <div className="space-y-2.5 pb-24">
          {filteredTransactions.map((tx) => {
            const payTag = getPaymentMethodTag(tx, accounts);
            const isSelected = selectedIds.has(tx.id);

            return (
              <Card
                key={tx.id}
                className={`border-0 shadow-sm overflow-hidden transition-all duration-200 active:scale-[0.98] cursor-pointer ${isSelected ? "ring-2 ring-primary bg-primary/5" : ""}`}
                onClick={() => selectMode ? toggleSelect(tx.id) : openEdit(tx)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start gap-2.5 flex-1">
                      {selectMode && <Checkbox checked={isSelected} className="mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-relaxed">{tx.description || "بدون وصف"}</p>
                        {tx.transaction_date && <p className="text-[10px] text-muted-foreground mt-1">{tx.transaction_date}</p>}
                      </div>
                    </div>
                    <p className="text-sm font-bold text-foreground tabular-nums">{tx.amount?.toLocaleString()} {tx.currency}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {tx.transaction_type && <Badge variant="secondary" className={`text-[10px] ${typeColors[tx.transaction_type] || ""}`}>{tx.transaction_type}</Badge>}
                      {payTag && <Badge variant="outline" className="text-[9px] gap-1">{payTag.emoji} {payTag.label}</Badge>}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span>{getAccountDisplay(tx.debit_account_code).split(' - ')[1] || tx.debit_account_code}</span>
                      <span>←</span>
                      <span>{getAccountDisplay(tx.credit_account_code).split(' - ')[1] || tx.credit_account_code}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingTx} onOpenChange={(o) => !o && setEditingTx(null)}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>تعديل المعاملة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={editFields.description} onChange={(e) => setEditFields(p => ({ ...p, description: e.target.value }))} placeholder="الوصف" dir="rtl" />
            <Select value={editFields.transaction_type} onValueChange={(v) => setEditFields(p => ({ ...p, transaction_type: v }))} dir="rtl">
              <SelectTrigger><SelectValue placeholder="نوع المعاملة" /></SelectTrigger>
              <SelectContent className="bg-background z-50">
                {transactionTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input type="number" value={editFields.amount} onChange={(e) => setEditFields(p => ({ ...p, amount: e.target.value }))} placeholder="المبلغ" className="flex-1" />
              <Select value={editFields.currency} onValueChange={(v) => setEditFields(p => ({ ...p, currency: v }))} dir="rtl">
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="شيكل">شيكل</SelectItem>
                  <SelectItem value="دينار">دينار</SelectItem>
                  <SelectItem value="دولار">دولار</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input type="date" value={editFields.transaction_date} onChange={(e) => setEditFields(p => ({ ...p, transaction_date: e.target.value }))} />
            <Select value={editFields.debit_account_code} onValueChange={(v) => setEditFields(p => ({ ...p, debit_account_code: v }))} dir="rtl">
              <SelectTrigger><SelectValue placeholder="الحساب المدين" /></SelectTrigger>
              <SelectContent className="bg-background z-50 max-h-48">
                {accounts.map(a => <SelectItem key={a.account_code} value={a.account_code}>{a.account_code} - {a.account_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={editFields.credit_account_code} onValueChange={(v) => setEditFields(p => ({ ...p, credit_account_code: v }))} dir="rtl">
              <SelectTrigger><SelectValue placeholder="الحساب الدائن" /></SelectTrigger>
              <SelectContent className="bg-background z-50 max-h-48">
                {accounts.map(a => <SelectItem key={a.account_code} value={a.account_code}>{a.account_code} - {a.account_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1 rounded-xl">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
              </Button>
              <Button variant="destructive" size="icon" className="rounded-xl" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmations */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المعاملة</AlertDialogTitle>
            <AlertDialogDescription>سيتم نقل المعاملة إلى سلة المحذوفات</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "حذف"}
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف {selectedIds.size} معاملة</AlertDialogTitle>
            <AlertDialogDescription>سيتم نقل المعاملات المحددة إلى سلة المحذوفات</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={handleBulkDelete} disabled={bulkDeleting} className="bg-destructive text-destructive-foreground">
              {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : `حذف ${selectedIds.size}`}
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TransactionsPage;
