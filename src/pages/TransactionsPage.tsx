import { useState, useEffect } from "react";
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
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface Transaction {
  id: string;
  fields: {
    Description?: string;
    "Debit Account"?: string | string[];
    "Credit Account"?: string | string[];
    "Debit Account Name"?: string;
    "Credit Account Name"?: string;
    "Transaction Type"?: string;
    Amount?: number;
    Currency?: string;
    Date?: string;
    Reference?: string;
    Deleted?: boolean;
  };
}

interface Account {
  id: string;
  fields: {
    "Account Name"?: string;
    "Account Type"?: string;
  };
}

const typeColors: Record<string, string> = {
  "سند صرف": "bg-destructive/10 text-destructive",
  "سند قبض": "bg-primary/10 text-primary",
  "قيد يومية": "bg-warning/10 text-warning",
  "فاتورة مشتريات": "bg-accent text-accent-foreground",
  "فاتورة مبيعات": "bg-primary/10 text-primary",
};

const getPaymentMethodTag = (tx: Transaction): { label: string; emoji: string } | null => {
  const debit = (tx.fields["Debit Account Name"] || tx.fields["Debit"] || "").toString().toLowerCase();
  const credit = (tx.fields["Credit Account Name"] || tx.fields["Credit"] || "").toString().toLowerCase();
  const allAccounts = debit + " " + credit;

  // Check for cash (صندوق)
  if (allAccounts.includes("صندوق")) {
    return { label: "نقدي", emoji: "🟢" };
  }
  // Check for credit/deferred (ذمم)
  if (allAccounts.includes("ذمم")) {
    return { label: "آجل", emoji: "📋" };
  }
  // Check for bank (بنك)
  if (allAccounts.includes("بنك")) {
    return { label: "تحويل", emoji: "💳" };
  }
  return null;
};

const transactionTypes = [
  { value: "سند صرف", label: "سند صرف" },
  { value: "سند قبض", label: "سند قبض" },
  { value: "قيد يومية", label: "قيد يومية" },
  { value: "فاتورة مشتريات", label: "فاتورة مشتريات" },
  { value: "فاتورة مبيعات", label: "فاتورة مبيعات" },
];

const TransactionsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editFields, setEditFields] = useState({
    Description: "",
    "Transaction Type": "",
    Amount: "",
    Currency: "",
    Date: "",
    "Debit Account Name": "",
    "Credit Account Name": "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Bulk select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Trash view state
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
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-transactions?clientId=${user.id}`, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        }),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-accounts?clientId=${user.id}`, {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        }),
      ]);
      if (!txRes.ok) throw new Error("Failed to fetch transactions");
      const txData = await txRes.json();
      if (txData?.error) throw new Error(txData.error);
      setTransactions(txData?.records || []);
      if (accRes.ok) {
        const accData = await accRes.json();
        setAccounts(accData?.records || []);
      }
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
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-transactions?clientId=${user.id}&deleted=true`, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      if (!res.ok) throw new Error("Failed to fetch deleted transactions");
      const data = await res.json();
      setDeletedTransactions(data?.records || []);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoadingTrash(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);

  useEffect(() => {
    if (showTrash) fetchDeletedTransactions();
  }, [showTrash]);

  const openEdit = (tx: Transaction) => {
    if (selectMode) return;
    setEditingTx(tx);
    setEditFields({
      Description: tx.fields.Description || "",
      "Transaction Type": tx.fields["Transaction Type"] || "",
      Amount: String(tx.fields.Amount || ""),
      Currency: tx.fields.Currency || "شيكل",
      Date: tx.fields.Date || "",
      "Debit Account Name": tx.fields["Debit Account Name"] || "",
      "Credit Account Name": tx.fields["Credit Account Name"] || "",
    });
  };

  const handleSave = async () => {
    if (!editingTx) return;
    setSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-update-transaction`, {
        method: "POST",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: editingTx.id,
          fields: {
            Description: editFields.Description,
            "Transaction Type": editFields["Transaction Type"],
            Amount: Number(editFields.Amount),
            Currency: editFields.Currency,
            Date: editFields.Date,
            "Debit Account Name": editFields["Debit Account Name"],
            "Credit Account Name": editFields["Credit Account Name"],
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "فشل التحديث");
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
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-update-transaction`, {
        method: "POST",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: editingTx.id, action: "delete" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "فشل الحذف");
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
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map(tx => tx.id)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(
        ids.map(id =>
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-update-transaction`, {
            method: "POST",
            headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ recordId: id, action: "delete" }),
          })
        )
      );
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

  const handleRestore = async (recordId: string) => {
    setRestoringId(recordId);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-update-transaction`, {
        method: "POST",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, action: "restore" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "فشل الاسترجاع");
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
      await Promise.all(
        deletedTransactions.map(tx =>
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-update-transaction`, {
            method: "POST",
            headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ recordId: tx.id, action: "restore" }),
          })
        )
      );
      toast({ title: `تم استرجاع ${deletedTransactions.length} معاملة بنجاح ✅` });
      fetchDeletedTransactions();
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setBulkDeleting(false);
    }
  };

  const accountNames = accounts.map(a => a.fields["Account Name"]).filter(Boolean) as string[];

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
              {showTrash ? `${deletedTransactions.length} معاملة محذوفة` : `${transactions.length} معاملة`}
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
            <Checkbox
              checked={selectedIds.size === transactions.length && transactions.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm text-foreground">
              {selectedIds.size > 0 ? `تم تحديد ${selectedIds.size}` : "حدد المعاملات"}
            </span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5 rounded-xl"
            disabled={selectedIds.size === 0}
            onClick={() => setShowBulkDeleteConfirm(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            حذف ({selectedIds.size})
          </Button>
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

          {loadingTrash && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {!loadingTrash && deletedTransactions.length === 0 && (
            <div className="text-center py-16 space-y-2">
              <Archive className="h-12 w-12 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">سلة المحذوفات فارغة</p>
            </div>
          )}

          {!loadingTrash && deletedTransactions.length > 0 && (
            <div className="space-y-2.5">
              {deletedTransactions.map((tx) => (
                <Card key={tx.id} className="border-0 shadow-sm overflow-hidden opacity-75">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground line-through">{tx.fields.Description || "بدون وصف"}</p>
                        {tx.fields.Date && <p className="text-[10px] text-muted-foreground mt-1">{tx.fields.Date}</p>}
                      </div>
                      <p className="text-sm font-bold text-foreground tabular-nums">
                        {tx.fields.Amount?.toLocaleString()} {tx.fields.Currency || ""}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {tx.fields["Transaction Type"] && (
                          <Badge variant="secondary" className={`text-[10px] ${typeColors[tx.fields["Transaction Type"]] || ""}`}>
                            {tx.fields["Transaction Type"]}
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 rounded-xl text-xs"
                        onClick={() => handleRestore(tx.id)}
                        disabled={restoringId === tx.id}
                      >
                        {restoringId === tx.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        استرجاع
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Search & Filter */}
      {!showTrash && !loading && !error && transactions.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالوصف، الحساب، المبلغ، المرجع..."
              className="pr-9 rounded-xl text-sm"
              dir="rtl"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter} dir="rtl">
            <SelectTrigger className="w-[140px] rounded-xl">
              <Filter className="h-3.5 w-3.5 ml-1.5 text-muted-foreground" />
              <SelectValue placeholder="الكل" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">جميع الأنواع</SelectItem>
              {transactionTypes.map(t => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Main transactions list */}
      {!showTrash && (
        <>
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {error && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={fetchData}>إعادة المحاولة</Button>
              </CardContent>
            </Card>
          )}

          {!loading && !error && (() => {
            const q = searchQuery.toLowerCase().trim();
            const filtered = transactions.filter(tx => {
              const f = tx.fields;
              // Type filter
              if (typeFilter !== "all" && f["Transaction Type"] !== typeFilter) return false;
              // Search filter
              if (!q) return true;
              const searchable = [
                f.Description || "",
                f["Debit Account Name"] || "",
                f["Credit Account Name"] || "",
                f["Transaction Type"] || "",
                f.Reference || "",
                f.Date || "",
                String(f.Amount || ""),
                f.Currency || "",
              ].join(" ").toLowerCase();
              return searchable.includes(q);
            });

            if (filtered.length === 0 && (q || typeFilter !== "all")) {
              return (
                <div className="text-center py-12 space-y-2">
                  <Search className="h-10 w-10 text-muted-foreground/20 mx-auto" />
                  <p className="text-sm text-muted-foreground">لا توجد نتائج مطابقة</p>
                  <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setTypeFilter("all"); }}>
                    مسح البحث
                  </Button>
                </div>
              );
            }

            return (
              <div className="space-y-2.5">
                {q || typeFilter !== "all" ? (
                  <p className="text-[10px] text-muted-foreground px-1">{filtered.length} نتيجة</p>
                ) : null}
                {filtered.map((tx) => {
                  const payTag = getPaymentMethodTag(tx);
                  const isSelected = selectedIds.has(tx.id);
                  return (
                    <Card
                      key={tx.id}
                      className={`border-0 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 overflow-hidden ${isSelected ? "ring-2 ring-primary bg-primary/5" : ""}`}
                      onClick={() => selectMode ? toggleSelect(tx.id) : openEdit(tx)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {selectMode && (
                            <div className="pt-0.5">
                              <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(tx.id)} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-2.5">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-foreground">{tx.fields.Description || "بدون وصف"}</p>
                                  {!selectMode && <Pencil className="h-3 w-3 text-muted-foreground opacity-50" />}
                                </div>
                                {tx.fields.Date && (
                                  <p className="text-[10px] text-muted-foreground mt-1">{tx.fields.Date}</p>
                                )}
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-bold text-foreground tabular-nums">
                                  {tx.fields.Amount?.toLocaleString()} {tx.fields.Currency || ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {tx.fields["Transaction Type"] && (
                                <Badge variant="secondary" className={`text-[10px] ${typeColors[tx.fields["Transaction Type"]] || ""}`}>
                                  {tx.fields["Transaction Type"]}
                                </Badge>
                              )}
                              {payTag && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">
                                  {payTag.emoji} {payTag.label}
                                </span>
                              )}
                              {tx.fields["Debit Account Name"] && (
                                <span className="text-[10px] text-muted-foreground">مدين: {tx.fields["Debit Account Name"]}</span>
                              )}
                              {tx.fields["Credit Account Name"] && (
                                <span className="text-[10px] text-muted-foreground">دائن: {tx.fields["Credit Account Name"]}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingTx} onOpenChange={(open) => !open && setEditingTx(null)}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المعاملة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الوصف</label>
              <Input value={editFields.Description} onChange={(e) => setEditFields(f => ({ ...f, Description: e.target.value }))} dir="rtl" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">نوع المعاملة</label>
              <Select value={editFields["Transaction Type"]} onValueChange={(v) => setEditFields(f => ({ ...f, "Transaction Type": v }))} dir="rtl">
                <SelectTrigger><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {transactionTypes.map(t => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">المبلغ</label>
                <Input type="number" value={editFields.Amount} onChange={(e) => setEditFields(f => ({ ...f, Amount: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">العملة</label>
                <Input value={editFields.Currency} onChange={(e) => setEditFields(f => ({ ...f, Currency: e.target.value }))} dir="rtl" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">التاريخ</label>
              <Input type="date" value={editFields.Date} onChange={(e) => setEditFields(f => ({ ...f, Date: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الحساب المدين</label>
              <Select value={editFields["Debit Account Name"]} onValueChange={(v) => setEditFields(f => ({ ...f, "Debit Account Name": v }))} dir="rtl">
                <SelectTrigger><SelectValue placeholder="اختر الحساب المدين" /></SelectTrigger>
                <SelectContent className="bg-background z-50 max-h-48">
                  {accountNames.map(name => (<SelectItem key={name} value={name}>{name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الحساب الدائن</label>
              <Select value={editFields["Credit Account Name"]} onValueChange={(v) => setEditFields(f => ({ ...f, "Credit Account Name": v }))} dir="rtl">
                <SelectTrigger><SelectValue placeholder="اختر الحساب الدائن" /></SelectTrigger>
                <SelectContent className="bg-background z-50 max-h-48">
                  {accountNames.map(name => (<SelectItem key={name} value={name}>{name}</SelectItem>))}
                </SelectContent>
              </Select>
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
            <AlertDialogTitle>نقل إلى سلة المحذوفات</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم نقل المعاملة إلى سلة المحذوفات. يمكنك استرجاعها لاحقاً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              نقل للمحذوفات
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>نقل {selectedIds.size} معاملة للمحذوفات</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم نقل {selectedIds.size} معاملة إلى سلة المحذوفات. يمكنك استرجاعها لاحقاً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel disabled={bulkDeleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={bulkDeleting}>
              {bulkDeleting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              نقل للمحذوفات ({selectedIds.size})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TransactionsPage;
