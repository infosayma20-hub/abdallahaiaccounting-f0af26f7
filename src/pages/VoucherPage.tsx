import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Loader2, RefreshCw, Plus, Search, X, FileText,
  ArrowDownCircle, ArrowUpCircle, Pencil, Trash2,
  Calendar, DollarSign, BookOpen
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Transaction {
  id: string;
  description: string | null;
  transaction_type: string | null;
  amount: number;
  currency: string | null;
  transaction_date: string | null;
  debit_account_code: string | null;
  credit_account_code: string | null;
  reference: string | null;
  is_deleted: boolean | null;
  contact_id: string | null;
}

interface Account {
  account_code: string;
  account_name: string;
  account_type: string;
}

interface VoucherPageProps {
  voucherType: "سند قبض" | "سند صرف";
}

const VoucherPage = ({ voucherType }: VoucherPageProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const isReceipt = voucherType === "سند قبض";
  const title = isReceipt ? "سندات القبض" : "سندات الصرف";
  const Icon = isReceipt ? ArrowDownCircle : ArrowUpCircle;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Create voucher state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newVoucher, setNewVoucher] = useState({
    Description: "",
    Amount: "",
    Currency: "شيكل",
    Date: new Date().toISOString().split("T")[0],
    DebitAccountCode: "",
    CreditAccountCode: "",
  });

  // Edit state
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editFields, setEditFields] = useState({
    Description: "",
    Amount: "",
    Currency: "",
    Date: "",
    DebitAccountCode: "",
    CreditAccountCode: "",
  });
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Build account code → name map
  const accountMap = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach(a => { map[a.account_code] = a.account_name; });
    return map;
  }, [accounts]);

  const resolveAccountName = (code: string | null) => {
    if (!code) return "—";
    return accountMap[code] || code;
  };

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [txRes, accRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, description, transaction_type, amount, currency, transaction_date, debit_account_code, credit_account_code, reference, is_deleted, contact_id")
          .eq("user_id", user.id)
          .eq("is_deleted", false)
          .order("transaction_date", { ascending: false })
          .limit(2000),
        supabase
          .from("accounts")
          .select("account_code, account_name, account_type")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("account_code"),
      ]);
      if (txRes.error) throw txRes.error;
      setTransactions(txRes.data || []);
      if (!accRes.error) setAccounts(accRes.data || []);
    } catch (err: any) {
      setError(err.message || "خطأ في جلب البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);

  const accountOptions = useMemo(
    () => accounts.map(a => ({ code: a.account_code, label: `${a.account_code} - ${a.account_name}` })).sort((a, b) => a.code.localeCompare(b.code)),
    [accounts]
  );

  // Filter vouchers by type
  const vouchers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return transactions
      .filter(tx => tx.transaction_type === voucherType)
      .filter(tx => {
        if (!q) return true;
        const searchable = [
          tx.description || "",
          resolveAccountName(tx.debit_account_code),
          resolveAccountName(tx.credit_account_code),
          tx.reference || "",
          tx.transaction_date || "",
          String(tx.amount || ""),
        ].join(" ").toLowerCase();
        return searchable.includes(q);
      });
  }, [transactions, voucherType, searchQuery, accountMap]);

  // Stats
  const totalAmount = vouchers.reduce((s, v) => s + (v.amount || 0), 0);
  const thisMonthVouchers = vouchers.filter(v => {
    const d = v.transaction_date;
    if (!d) return false;
    const now = new Date();
    const vDate = new Date(d);
    return vDate.getMonth() === now.getMonth() && vDate.getFullYear() === now.getFullYear();
  });
  const thisMonthTotal = thisMonthVouchers.reduce((s, v) => s + (v.amount || 0), 0);

  const handleCreate = async () => {
    if (!newVoucher.Amount || !newVoucher.DebitAccountCode || !newVoucher.CreditAccountCode) {
      toast({ title: "يرجى ملء جميع الحقول المطلوبة", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { error } = await supabase.from("transactions").insert({
        user_id: user!.id,
        description: newVoucher.Description || null,
        transaction_type: voucherType,
        amount: Number(newVoucher.Amount),
        currency: newVoucher.Currency || "شيكل",
        transaction_date: newVoucher.Date || new Date().toISOString().split("T")[0],
        debit_account_code: newVoucher.DebitAccountCode,
        credit_account_code: newVoucher.CreditAccountCode,
        is_deleted: false,
      });
      if (error) throw error;
      toast({ title: `تم إنشاء ${voucherType} بنجاح ✅` });
      setShowCreate(false);
      setNewVoucher({
        Description: "",
        Amount: "",
        Currency: "شيكل",
        Date: new Date().toISOString().split("T")[0],
        DebitAccountCode: "",
        CreditAccountCode: "",
      });
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditFields({
      Description: tx.description || "",
      Amount: String(tx.amount || ""),
      Currency: tx.currency || "شيكل",
      Date: tx.transaction_date || "",
      DebitAccountCode: tx.debit_account_code || "",
      CreditAccountCode: tx.credit_account_code || "",
    });
  };

  const handleSave = async () => {
    if (!editingTx || !user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("transactions").update({
        description: editFields.Description,
        transaction_type: voucherType,
        amount: Number(editFields.Amount),
        currency: editFields.Currency,
        transaction_date: editFields.Date,
        debit_account_code: editFields.DebitAccountCode,
        credit_account_code: editFields.CreditAccountCode,
      }).eq("id", editingTx.id).eq("user_id", user.id);
      if (error) throw error;
      toast({ title: "تم تعديل السند بنجاح ✅" });
      setEditingTx(null);
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingTx || !user) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("transactions")
        .update({ is_deleted: true })
        .eq("id", editingTx.id)
        .eq("user_id", user.id);
      if (error) throw error;
      toast({ title: "تم حذف السند 🗑️" });
      setEditingTx(null);
      setShowDeleteConfirm(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const getPaymentMethod = (tx: Transaction) => {
    const all = (resolveAccountName(tx.debit_account_code) + " " + resolveAccountName(tx.credit_account_code)).toLowerCase();
    if (all.includes("صندوق")) return { label: "نقدي", color: "bg-emerald-500/10 text-emerald-600" };
    if (all.includes("بنك")) return { label: "تحويل بنكي", color: "bg-blue-500/10 text-blue-600" };
    if (all.includes("ذمم")) return { label: "آجل", color: "bg-amber-500/10 text-amber-600" };
    return null;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pt-6 pb-8 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isReceipt ? "bg-primary/10" : "bg-destructive/10"}`}>
              <Icon className={`h-5 w-5 ${isReceipt ? "text-primary" : "text-destructive"}`} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{title}</h1>
              <p className="text-xs text-muted-foreground">{vouchers.length} سند</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => setShowCreate(true)} className="gap-2 rounded-xl">
            <Plus className="h-4 w-4" />
            {isReceipt ? "سند قبض جديد" : "سند صرف جديد"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">إجمالي السندات</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{vouchers.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">إجمالي المبالغ</p>
            <p className={`text-lg font-bold tabular-nums ${isReceipt ? "text-primary" : "text-destructive"}`}>
              {totalAmount.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">هذا الشهر</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{thisMonthVouchers.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">مبلغ الشهر</p>
            <p className={`text-lg font-bold tabular-nums ${isReceipt ? "text-primary" : "text-destructive"}`}>
              {thisMonthTotal.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      {!loading && !error && vouchers.length > 0 && (
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث بالوصف، الحساب، المبلغ..."
            className="pr-9 rounded-xl"
            dir="rtl"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchData}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && vouchers.length === 0 && (
        <div className="text-center py-20 space-y-4">
          <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center ${isReceipt ? "bg-primary/10" : "bg-destructive/10"}`}>
            <FileText className={`h-8 w-8 ${isReceipt ? "text-primary/40" : "text-destructive/40"}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">لا توجد سندات بعد</p>
            <p className="text-xs text-muted-foreground mt-1">أنشئ أول {voucherType} الآن</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2 rounded-xl">
            <Plus className="h-4 w-4" />
            {isReceipt ? "إنشاء سند قبض" : "إنشاء سند صرف"}
          </Button>
        </div>
      )}

      {/* Vouchers List - Table style */}
      {!loading && !error && vouchers.length > 0 && (
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-right p-3 text-xs font-semibold text-muted-foreground">#</th>
                  <th className="text-right p-3 text-xs font-semibold text-muted-foreground">التاريخ</th>
                  <th className="text-right p-3 text-xs font-semibold text-muted-foreground">الوصف</th>
                  <th className="text-right p-3 text-xs font-semibold text-muted-foreground">الحساب المدين</th>
                  <th className="text-right p-3 text-xs font-semibold text-muted-foreground">الحساب الدائن</th>
                  <th className="text-right p-3 text-xs font-semibold text-muted-foreground">المبلغ</th>
                  <th className="text-right p-3 text-xs font-semibold text-muted-foreground">طريقة الدفع</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v, idx) => {
                  const pm = getPaymentMethod(v);
                  return (
                    <tr
                      key={v.id}
                      className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors"
                      onClick={() => openEdit(v)}
                    >
                      <td className="p-3 text-muted-foreground tabular-nums">{idx + 1}</td>
                      <td className="p-3 text-muted-foreground tabular-nums whitespace-nowrap">{v.transaction_date || "—"}</td>
                      <td className="p-3 font-medium text-foreground max-w-[200px] truncate">{v.description || "بدون وصف"}</td>
                      <td className="p-3 text-primary whitespace-nowrap">{resolveAccountName(v.debit_account_code)}</td>
                      <td className="p-3 text-destructive whitespace-nowrap">{resolveAccountName(v.credit_account_code)}</td>
                      <td className={`p-3 font-bold tabular-nums whitespace-nowrap ${isReceipt ? "text-primary" : "text-destructive"}`}>
                        {v.amount?.toLocaleString()} {v.currency || ""}
                      </td>
                      <td className="p-3">
                        {pm && (
                          <Badge variant="secondary" className={`text-[10px] ${pm.color}`}>
                            {pm.label}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground/40" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/40 font-bold">
                  <td colSpan={5} className="p-3 text-foreground">الإجمالي</td>
                  <td className={`p-3 tabular-nums ${isReceipt ? "text-primary" : "text-destructive"}`}>
                    {totalAmount.toLocaleString()}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Create Voucher Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon className={`h-5 w-5 ${isReceipt ? "text-primary" : "text-destructive"}`} />
              {isReceipt ? "سند قبض جديد" : "سند صرف جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> التاريخ
              </label>
              <Input
                type="date"
                value={newVoucher.Date}
                onChange={(e) => setNewVoucher(f => ({ ...f, Date: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> الوصف / البيان
              </label>
              <Textarea
                value={newVoucher.Description}
                onChange={(e) => setNewVoucher(f => ({ ...f, Description: e.target.value }))}
                placeholder={isReceipt ? "مثال: تحصيل دفعة من العميل أحمد" : "مثال: سداد مبلغ للمورد خالد"}
                className="resize-none"
                rows={2}
                dir="rtl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5" /> المبلغ *
                </label>
                <Input
                  type="number"
                  value={newVoucher.Amount}
                  onChange={(e) => setNewVoucher(f => ({ ...f, Amount: e.target.value }))}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">العملة</label>
                <Select value={newVoucher.Currency} onValueChange={(v) => setNewVoucher(f => ({ ...f, Currency: v }))} dir="rtl">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="شيكل">شيكل</SelectItem>
                    <SelectItem value="دولار">دولار</SelectItem>
                    <SelectItem value="دينار">دينار</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="bg-muted/30 rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-foreground">القيد المحاسبي</p>
              <div>
                <label className="text-xs font-medium text-primary mb-1.5 block">
                  الحساب المدين (من حـ/) *
                </label>
                <Select
                  value={newVoucher.DebitAccountCode}
                  onValueChange={(v) => setNewVoucher(f => ({ ...f, DebitAccountCode: v }))}
                  dir="rtl"
                >
                  <SelectTrigger><SelectValue placeholder="اختر الحساب المدين" /></SelectTrigger>
                  <SelectContent className="bg-background z-50 max-h-48">
                    {accountOptions.map(a => (<SelectItem key={a.code} value={a.code}>{a.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-destructive mb-1.5 block">
                  الحساب الدائن (إلى حـ/) *
                </label>
                <Select
                  value={newVoucher.CreditAccountCode}
                  onValueChange={(v) => setNewVoucher(f => ({ ...f, CreditAccountCode: v }))}
                  dir="rtl"
                >
                  <SelectTrigger><SelectValue placeholder="اختر الحساب الدائن" /></SelectTrigger>
                  <SelectContent className="bg-background z-50 max-h-48">
                    {accountOptions.map(a => (<SelectItem key={a.code} value={a.code}>{a.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preview */}
            {newVoucher.Amount && newVoucher.DebitAccountCode && newVoucher.CreditAccountCode && (
              <div className="bg-muted/20 border border-border rounded-xl p-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground">معاينة القيد</p>
                <div className="flex justify-between text-xs">
                  <span className="text-primary font-medium">من حـ/ {resolveAccountName(newVoucher.DebitAccountCode)}</span>
                  <span className="tabular-nums font-bold">{Number(newVoucher.Amount).toLocaleString()} {newVoucher.Currency}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-destructive font-medium pr-4">إلى حـ/ {resolveAccountName(newVoucher.CreditAccountCode)}</span>
                  <span className="tabular-nums font-bold">{Number(newVoucher.Amount).toLocaleString()} {newVoucher.Currency}</span>
                </div>
              </div>
            )}

            <Button onClick={handleCreate} className="w-full gap-2 rounded-xl" disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {isReceipt ? "إنشاء سند القبض" : "إنشاء سند الصرف"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingTx} onOpenChange={(open) => !open && setEditingTx(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              تعديل السند
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">التاريخ</label>
              <Input type="date" value={editFields.Date} onChange={(e) => setEditFields(f => ({ ...f, Date: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">الوصف</label>
              <Textarea
                value={editFields.Description}
                onChange={(e) => setEditFields(f => ({ ...f, Description: e.target.value }))}
                className="resize-none" rows={2} dir="rtl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">المبلغ</label>
                <Input type="number" value={editFields.Amount} onChange={(e) => setEditFields(f => ({ ...f, Amount: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">العملة</label>
                <Select value={editFields.Currency} onValueChange={(v) => setEditFields(f => ({ ...f, Currency: v }))} dir="rtl">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="شيكل">شيكل</SelectItem>
                    <SelectItem value="دولار">دولار</SelectItem>
                    <SelectItem value="دينار">دينار</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="bg-muted/30 rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-foreground">القيد المحاسبي</p>
              <div>
                <label className="text-xs font-medium text-primary mb-1.5 block">الحساب المدين</label>
                <Select value={editFields.DebitAccountCode} onValueChange={(v) => setEditFields(f => ({ ...f, DebitAccountCode: v }))} dir="rtl">
                  <SelectTrigger><SelectValue placeholder="اختر الحساب المدين" /></SelectTrigger>
                  <SelectContent className="bg-background z-50 max-h-48">
                    {accountOptions.map(a => (<SelectItem key={a.code} value={a.code}>{a.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-destructive mb-1.5 block">الحساب الدائن</label>
                <Select value={editFields.CreditAccountCode} onValueChange={(v) => setEditFields(f => ({ ...f, CreditAccountCode: v }))} dir="rtl">
                  <SelectTrigger><SelectValue placeholder="اختر الحساب الدائن" /></SelectTrigger>
                  <SelectContent className="bg-background z-50 max-h-48">
                    {accountOptions.map(a => (<SelectItem key={a.code} value={a.code}>{a.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} className="flex-1 gap-2 rounded-xl" disabled={saving || deleting}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                حفظ التعديلات
              </Button>
              <Button variant="destructive" size="icon" className="rounded-xl" onClick={() => setShowDeleteConfirm(true)} disabled={saving || deleting}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف السند</AlertDialogTitle>
            <AlertDialogDescription>سيتم نقل السند إلى سلة المحذوفات. يمكنك استرجاعه لاحقاً.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VoucherPage;
