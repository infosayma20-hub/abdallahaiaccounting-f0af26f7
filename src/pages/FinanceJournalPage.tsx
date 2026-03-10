import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight, Loader2, Plus, Search, X, Trash2,
  FileText, BookOpen, Save
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface JournalLine {
  id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
}

const FinanceJournalPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();

  const [vouchers, setVouchers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Form
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formRefNumber, setFormRefNumber] = useState("");
  const [formSubtype, setFormSubtype] = useState("normal");
  const [formDescription, setFormDescription] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [lines, setLines] = useState<JournalLine[]>([
    { id: "1", account_code: "", account_name: "", debit: 0, credit: 0 },
    { id: "2", account_code: "", account_name: "", debit: 0, credit: 0 },
  ]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [vRes, aRes] = await Promise.all([
      supabase.from("vouchers").select("*").eq("user_id", user.id).eq("type", "journal").order("created_at", { ascending: false }),
      supabase.from("accounts").select("account_code, account_name, account_type").eq("user_id", user.id).eq("is_active", true).order("account_code"),
    ]);
    setVouchers(vRes.data || []);
    setAccounts(aRes.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (searchParams.get("new") === "1") setModalOpen(true); }, [searchParams]);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
  const diff = Math.abs(totalDebit - totalCredit);

  const addLine = () => {
    setLines(prev => [...prev, { id: String(Date.now()), account_code: "", account_name: "", debit: 0, credit: 0 }]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter(l => l.id !== id));
  };

  const updateLine = (id: string, field: keyof JournalLine, value: any) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      if (field === "account_code") {
        const acct = accounts.find(a => a.account_code === value);
        return { ...l, account_code: value, account_name: acct?.account_name || "" };
      }
      return { ...l, [field]: value };
    }));
  };

  const resetForm = () => {
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormRefNumber("");
    setFormSubtype("normal");
    setFormDescription("");
    setFormNotes("");
    setLines([
      { id: "1", account_code: "", account_name: "", debit: 0, credit: 0 },
      { id: "2", account_code: "", account_name: "", debit: 0, credit: 0 },
    ]);
  };

  const handleSave = async (status: "draft" | "posted") => {
    if (!user) return;
    if (!formDescription.trim()) { toast({ title: "خطأ", description: "الوصف مطلوب", variant: "destructive" }); return; }
    if (status === "posted" && !isBalanced) { toast({ title: "خطأ", description: "القيد غير متوازن", variant: "destructive" }); return; }

    const validLines = lines.filter(l => l.account_code && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (validLines.length < 2) { toast({ title: "خطأ", description: "أدخل سطرين على الأقل", variant: "destructive" }); return; }

    setSaving(true);

    const { data: voucher, error } = await supabase.from("vouchers").insert({
      user_id: user.id,
      type: "journal",
      subtype: formSubtype,
      ref_number: formRefNumber || "",
      date: formDate,
      amount: totalDebit,
      amount_ils: totalDebit,
      description: formDescription,
      notes: formNotes || null,
      status,
      posted_by: status === "posted" ? user.id : null,
      posted_at: status === "posted" ? new Date().toISOString() : null,
    }).select().single();

    if (error || !voucher) {
      toast({ title: "خطأ", description: error?.message || "حدث خطأ", variant: "destructive" });
      setSaving(false);
      return;
    }

    // Insert voucher lines
    await supabase.from("voucher_lines").insert(
      validLines.map((l, i) => ({
        voucher_id: voucher.id,
        account_code: l.account_code,
        account_name: l.account_name,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        line_order: i + 1,
      }))
    );

    // If posted, create transactions for each debit/credit pair
    if (status === "posted") {
      const debitLines = validLines.filter(l => Number(l.debit) > 0);
      const creditLines = validLines.filter(l => Number(l.credit) > 0);
      // Create a single compound entry using first debit/credit
      if (debitLines.length > 0 && creditLines.length > 0) {
        await supabase.from("transactions").insert({
          user_id: user.id,
          transaction_date: formDate,
          description: formDescription,
          debit_account_code: debitLines[0].account_code,
          credit_account_code: creditLines[0].account_code,
          amount: totalDebit,
          currency: "شيكل",
          transaction_type: formSubtype === "opening" ? "opening_balance" : "journal",
          reference: voucher.ref_number,
          idempotency_key: `VOUCHER-${voucher.id}`,
        });
      }
    }

    toast({ title: status === "posted" ? `✅ تم ترحيل سند القيد ${voucher.ref_number}` : "تم الحفظ كمسودة" });
    setSaving(false);
    setModalOpen(false);
    resetForm();
    fetchData();
  };

  const filtered = useMemo(() => {
    if (!searchQuery) return vouchers;
    const q = searchQuery.toLowerCase();
    return vouchers.filter(v => v.ref_number?.toLowerCase().includes(q) || v.description?.toLowerCase().includes(q));
  }, [vouchers, searchQuery]);

  const formatAmount = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const subtypeLabels: Record<string, string> = { normal: "عادي", opening: "افتتاحي", adjustment: "تسوية", closing: "إقفالي" };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/finance")} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold" style={{ color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}>سندات القيد</h1>
        </div>
        <Button size="sm" className="gap-2 bg-[#0A2342] hover:bg-[#0D1B2A]" onClick={() => { resetForm(); setModalOpen(true); }}>
          <Plus className="h-4 w-4" />سند قيد جديد
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="ابحث بالمرجع، الوصف..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pr-10" />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">لا توجد سندات قيد بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-xs">
                    <th className="text-right py-2.5 px-3">الرقم</th>
                    <th className="text-right py-2.5 px-3">التاريخ</th>
                    <th className="text-right py-2.5 px-3">النوع</th>
                    <th className="text-right py-2.5 px-3">الوصف</th>
                    <th className="text-right py-2.5 px-3">المبلغ</th>
                    <th className="text-right py-2.5 px-3">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(v => (
                    <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-mono text-xs font-medium">{v.ref_number}</td>
                      <td className="py-2.5 px-3 text-xs">{v.date}</td>
                      <td className="py-2.5 px-3"><Badge variant="secondary" className="text-[10px]">{subtypeLabels[v.subtype] || "عادي"}</Badge></td>
                      <td className="py-2.5 px-3 text-xs truncate max-w-[250px]">{v.description}</td>
                      <td className="py-2.5 px-3 font-mono text-xs font-bold">₪{formatAmount(Number(v.amount || 0))}</td>
                      <td className="py-2.5 px-3">
                        {v.status === "posted" ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">مرحّل</Badge> :
                         v.status === "cancelled" ? <Badge className="bg-red-100 text-red-700 text-[10px]">ملغي</Badge> :
                         <Badge variant="secondary" className="text-[10px]">مسودة</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full Screen Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto p-0">
          {/* Header */}
          <div className="p-4 text-white rounded-t-lg" style={{ background: "linear-gradient(135deg, #050F1E, #0A2342)" }}>
            <div className="flex items-center justify-between" dir="rtl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold">سند قيد جديد</h2>
                  {formRefNumber && <p className="text-[11px] text-white/60">{formRefNumber}</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-5" dir="rtl">
            {/* Subtype Tabs */}
            <div className="flex gap-2">
              {(["normal", "opening", "adjustment", "closing"] as const).map(st => (
                <button key={st} onClick={() => setFormSubtype(st)} className={`px-4 py-2 rounded-full text-xs font-medium transition-all ${formSubtype === st ? "bg-[#0A2342] text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                  {subtypeLabels[st]}
                </button>
              ))}
            </div>

            {/* Date & Ref */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">التاريخ *</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">المرجع</Label>
                <Input value={formRefNumber} onChange={e => setFormRefNumber(e.target.value)} placeholder="تلقائي" className="mt-1 font-mono" />
              </div>
            </div>

            {/* Description */}
            <div>
              <Label className="text-xs">الوصف *</Label>
              <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="مثال: سلفة راتب - رهام حسون" className="mt-1" />
            </div>

            {/* Journal Lines Table */}
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground">
                    <th className="text-right py-2.5 px-3 w-10">#</th>
                    <th className="text-right py-2.5 px-3">الحساب</th>
                    <th className="text-right py-2.5 px-3 w-32">مدين ₪</th>
                    <th className="text-right py-2.5 px-3 w-32">دائن ₪</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={line.id} className="border-t">
                      <td className="py-2 px-3 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="py-2 px-3">
                        <Select value={line.account_code} onValueChange={v => updateLine(line.id, "account_code", v)}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="ابحث بالرقم أو الاسم..." /></SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {accounts.map(a => (
                              <SelectItem key={a.account_code} value={a.account_code}>
                                <span className="font-mono text-muted-foreground ml-2">{a.account_code}</span>
                                {a.account_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-3">
                        <Input type="number" value={line.debit || ""} onChange={e => updateLine(line.id, "debit", Number(e.target.value) || 0)} className="h-9 font-mono text-xs" placeholder="0" />
                      </td>
                      <td className="py-2 px-3">
                        <Input type="number" value={line.credit || ""} onChange={e => updateLine(line.id, "credit", Number(e.target.value) || 0)} className="h-9 font-mono text-xs bg-red-50/50" placeholder="0" />
                      </td>
                      <td className="py-2 px-1">
                        <button onClick={() => removeLine(line.id)} className="p-1 hover:text-red-500 text-muted-foreground" disabled={lines.length <= 2}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={5} className="py-2 px-3">
                      <button onClick={addLine} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Plus className="h-3 w-3" />إضافة سطر
                      </button>
                    </td>
                  </tr>
                  <tr className="border-t font-bold bg-muted/30">
                    <td colSpan={2} className="py-2.5 px-3 text-xs">الإجمالي</td>
                    <td className="py-2.5 px-3 font-mono text-xs">₪{formatAmount(totalDebit)}</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-red-600">₪{formatAmount(totalCredit)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Balance Status */}
            <div className={`rounded-lg p-3 text-xs font-medium ${isBalanced ? "bg-emerald-50 text-emerald-700" : diff > 0 ? "bg-red-50 text-red-700" : "bg-muted text-muted-foreground"}`}>
              {isBalanced ? (
                <span>✓ متوازن — المدين = الدائن = ₪{formatAmount(totalDebit)}</span>
              ) : totalDebit > 0 || totalCredit > 0 ? (
                <span>✗ غير متوازن — فرق: ₪{formatAmount(diff)}</span>
              ) : (
                <span>أدخل المبالغ للتحقق من التوازن</span>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs">ملاحظات (اختياري)</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} className="mt-1" placeholder="ملاحظات إضافية..." />
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-background border-t p-4 flex items-center gap-2 flex-wrap" dir="rtl">
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>إلغاء</Button>
            <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving}>حفظ كمسودة</Button>
            <Button className="flex-1 bg-[#0A2342] hover:bg-[#0D1B2A]" onClick={() => handleSave("posted")} disabled={saving || !isBalanced}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
              ✓ إنشاء القيد
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinanceJournalPage;
