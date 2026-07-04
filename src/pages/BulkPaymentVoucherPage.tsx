import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2, Save, CheckCircle, ArrowRight, AlertTriangle, Users, User, BookOpen, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { fetchAllAccountsForOwner } from "@/lib/fetchAllAccounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/layout/PageHeader";
import BackButton from "@/components/BackButton";
import JournalAccountPicker, { type PickerAccount } from "@/components/journal/JournalAccountPicker";
import { broadcastChange } from "@/lib/crossTabSync";

/* ────────────────────────────────────────────────────────────────
   Bulk Payment Voucher (سند صرف جماعي)
   ---------------------------------------------------------------
   Golden rules honored:
   - Uses the SAME `vouchers` + `voucher_lines` + `transactions`
     tables as normal payment vouchers (no schema changes).
   - `vouchers.subtype = 'bulk'` marks the batch.
   - Compound entry: N debit `voucher_lines` + 1 credit line
     (cash/bank). DB trigger `enforce_voucher_lines_balanced`
     validates automatically.
   - Posting mirrors legacy pattern: one `transactions` row per
     debit line (debit=line.account, credit=cash/bank),
     `reference = voucher.ref_number`, unique idempotency_key.
   - On any failure while posting, we roll back inserted rows so we
     never leave a partially-posted voucher.
   ──────────────────────────────────────────────────────────────── */

const MAX_LINES = 105;

type LineKind = "account" | "employee" | "contact";

interface LineRow {
  id: string;
  kind: LineKind;
  account_code: string;      // GL account (for kind='account') OR resolved sub-account (employee/contact)
  account_name: string;
  employee_id?: string;
  employee_name?: string;
  contact_id?: string;
  contact_name?: string;
  description: string;
  amount: number;
}

interface AccountRow { id: string; account_code: string; account_name: string; account_type: string; parent_code: string | null }
interface EmployeeRow { id: string; full_name: string }
interface ContactRow { id: string; contact_name: string; linked_account_code: string | null; contact_type: string | null }
interface CashBoxRow { id: string; name: string; gl_account_code: string }
interface BankAccountRow { id: string; name: string; bank_name: string; gl_account_code: string }

const newLine = (): LineRow => ({
  id: crypto.randomUUID(),
  kind: "account",
  account_code: "",
  account_name: "",
  description: "",
  amount: 0,
});

export default function BulkPaymentVoucherPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const ownerId = useDataOwnerId();

  // Header
  const [refNumber, setRefNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  // Source (single for whole voucher)
  const [source, setSource] = useState<"cash" | "bank">("cash");
  const [cashBoxId, setCashBoxId] = useState<string>("");
  const [bankAccountId, setBankAccountId] = useState<string>("");

  // Loaded data
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [bankAccountsList, setBankAccountsList] = useState<BankAccountRow[]>([]);

  // Lines
  const [lines, setLines] = useState<LineRow[]>([newLine(), newLine()]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /* ── Postable (leaf-only) accounts for the picker ── */
  const postableAccounts = useMemo<PickerAccount[]>(() => {
    const parents = new Set(
      accounts.map(a => String(a.parent_code || "").trim()).filter(Boolean)
    );
    return accounts
      .filter(a => !parents.has(String(a.account_code || "").trim()))
      .map(a => ({ account_code: a.account_code, account_name: a.account_name, account_type: a.account_type }));
  }, [accounts]);

  /* ── Generate ref number (BPV-YYYY-NNNN so it's distinguishable) ── */
  const regenerateRef = useCallback(async () => {
    if (!ownerId) return;
    const { data } = await supabase
      .from("vouchers")
      .select("ref_number")
      .eq("user_id", ownerId)
      .eq("type", "payment")
      .like("ref_number", "BPV-%")
      .order("created_at", { ascending: false })
      .limit(1);
    const lastRef = (data || [])[0]?.ref_number || "";
    const m = lastRef.match(/(\d+)$/);
    const next = m ? String(parseInt(m[1]) + 1).padStart(Math.max(m[1].length, 4), "0") : "0001";
    setRefNumber(`BPV-${new Date().getFullYear()}-${next}`);
  }, [ownerId]);

  /* ── Initial load ── */
  useEffect(() => {
    if (!user || !ownerId) return;
    (async () => {
      const [emp, con, cb, ba] = await Promise.all([
        supabase.from("employees").select("id, full_name").eq("user_id", ownerId).eq("is_active", true).order("full_name"),
        supabase.from("contacts").select("id, contact_name, linked_account_code, contact_type").eq("user_id", ownerId).order("contact_name"),
        supabase.from("cash_boxes").select("id, name, gl_account_code").eq("user_id", ownerId).eq("is_active", true),
        supabase.from("bank_accounts").select("id, name, bank_name, gl_account_code").eq("user_id", ownerId).eq("is_active", true),
      ]);
      setEmployees((emp.data || []) as EmployeeRow[]);
      setContacts((con.data || []) as ContactRow[]);
      setCashBoxes((cb.data || []) as CashBoxRow[]);
      setBankAccountsList((ba.data || []) as BankAccountRow[]);
      if ((cb.data || []).length) setCashBoxId(cb.data![0].id);
      if ((ba.data || []).length) setBankAccountId(ba.data![0].id);

      // Full paginated accounts load — handles >1000
      const acc = await fetchAllAccountsForOwner<AccountRow>(
        ownerId,
        "id, account_code, account_name, account_type, parent_code",
        { activeOnly: true }
      );
      setAccounts(acc);

      await regenerateRef();
    })();
  }, [user, ownerId, regenerateRef]);

  /* ── Line handlers ── */
  const addLine = () => {
    if (lines.length >= MAX_LINES) {
      toast.warning(`الحد الأقصى ${MAX_LINES} سطر بالسند الواحد`);
      return;
    }
    setLines(prev => [...prev, newLine()]);
  };
  const removeLine = (id: string) => setLines(prev => prev.filter(l => l.id !== id));
  const updateLine = (id: string, patch: Partial<LineRow>) =>
    setLines(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));

  const changeKind = (id: string, kind: LineKind) => {
    // reset party fields on kind change
    updateLine(id, {
      kind,
      account_code: "",
      account_name: "",
      employee_id: undefined,
      employee_name: undefined,
      contact_id: undefined,
      contact_name: undefined,
    });
  };

  const totalAmount = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0),
    [lines]
  );

  const sourceAccountCode = useMemo(() => {
    if (source === "cash") return cashBoxes.find(c => c.id === cashBoxId)?.gl_account_code || "";
    return bankAccountsList.find(b => b.id === bankAccountId)?.gl_account_code || "";
  }, [source, cashBoxId, bankAccountId, cashBoxes, bankAccountsList]);

  /* ── Validation ── */
  const validationError = useMemo(() => {
    if (!description.trim()) return "أدخل بيان السند";
    if (!sourceAccountCode) return source === "cash" ? "اختر الصندوق" : "اختر البنك";
    if (lines.length === 0) return "أضف سطر واحد على الأقل";
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!(Number(l.amount) > 0)) return `السطر ${i + 1}: المبلغ يجب أن يكون أكبر من صفر`;
      if (l.kind === "account" && !l.account_code) return `السطر ${i + 1}: اختر الحساب`;
      if (l.kind === "employee" && !l.employee_id) return `السطر ${i + 1}: اختر الموظف`;
      if (l.kind === "contact" && !l.contact_id) return `السطر ${i + 1}: اختر الجهة`;
    }
    if (!(totalAmount > 0)) return "الإجمالي يجب أن يكون أكبر من صفر";
    return null;
  }, [description, lines, sourceAccountCode, source, totalAmount]);

  /* ── Resolve employee sub-account under 2180 ── */
  const resolveEmployeeAccount = async (empId: string, empName: string): Promise<string> => {
    const { data: existing } = await supabase
      .from("accounts")
      .select("account_code")
      .eq("user_id", ownerId!)
      .eq("parent_code", "2180")
      .like("account_name", `%${empName}%`)
      .limit(1)
      .maybeSingle();
    if (existing) return (existing as any).account_code;

    const { data: maxRow } = await supabase
      .from("accounts")
      .select("account_code")
      .eq("user_id", ownerId!)
      .eq("parent_code", "2180")
      .order("account_code", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextCode = maxRow ? String(parseInt((maxRow as any).account_code) + 1) : "21801";
    const { error: insErr } = await supabase.from("accounts").insert({
      user_id: ownerId!,
      account_code: nextCode,
      account_name: `ذمم موظف - ${empName}`,
      account_type: "التزامات",
      parent_code: "2180",
      is_system: false,
    } as any);
    if (insErr) throw insErr;
    return nextCode;
  };

  /* ── Resolve contact account ── */
  const resolveContactAccount = (contactId: string): string => {
    const c = contacts.find(x => x.id === contactId);
    return c?.linked_account_code || "2110"; // fallback: AP
  };

  /* ── Save ── */
  const handleSave = async (asDraft: boolean) => {
    if (!user || !ownerId) return;
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSaving(true);

    let voucherId: string | null = null;
    const insertedTxIds: string[] = [];
    try {
      // 1) Resolve each line's account_code
      const resolved: Array<LineRow & { resolvedCode: string; resolvedName: string; contactIdForTx: string | null }> = [];
      for (const l of lines) {
        let code = l.account_code;
        let name = l.account_name;
        let cid: string | null = null;
        if (l.kind === "employee") {
          code = await resolveEmployeeAccount(l.employee_id!, l.employee_name!);
          name = `ذمم موظف - ${l.employee_name}`;
        } else if (l.kind === "contact") {
          code = resolveContactAccount(l.contact_id!);
          const c = contacts.find(x => x.id === l.contact_id);
          name = c?.contact_name || "";
          cid = l.contact_id!;
        }
        if (!code) throw new Error(`تعذر تحديد الحساب المحاسبي للسطر`);
        resolved.push({ ...l, resolvedCode: code, resolvedName: name, contactIdForTx: cid });
      }

      // 2) Ensure ref number
      let finalRef = refNumber;
      if (!finalRef) {
        await regenerateRef();
        finalRef = refNumber;
      }

      // 3) Insert voucher header
      const payMethod = source === "cash" ? "cash" : "transfer";
      const { data: voucher, error: vErr } = await supabase
        .from("vouchers")
        .insert({
          user_id: ownerId,
          type: "payment",
          subtype: "bulk",
          ref_number: finalRef,
          date: paymentDate,
          payment_method: payMethod,
          amount: totalAmount,
          amount_ils: totalAmount,
          currency: "ILS",
          exchange_rate: 1,
          description: description.trim(),
          notes: notes || null,
          status: asDraft ? "draft" : "posted",
          bank_account_id: source === "bank" ? bankAccountId : null,
          posted_by: !asDraft ? user.id : null,
          posted_at: !asDraft ? new Date().toISOString() : null,
        } as any)
        .select("id, ref_number")
        .single();
      if (vErr) throw vErr;
      voucherId = voucher!.id;

      // 4) Insert voucher_lines (N debit + 1 credit). Trigger validates balance.
      const debitLines = resolved.map((r, idx) => ({
        voucher_id: voucherId!,
        account_code: r.resolvedCode,
        account_name: r.resolvedName || null,
        debit: r.amount,
        credit: 0,
        description: r.description || description.trim(),
        line_order: idx + 1,
        contact_id: r.contactIdForTx,
        contact_name: r.kind === "contact" ? r.resolvedName : (r.kind === "employee" ? r.employee_name : null),
      }));
      const creditLine = {
        voucher_id: voucherId!,
        account_code: sourceAccountCode,
        account_name: source === "cash"
          ? (cashBoxes.find(c => c.id === cashBoxId)?.name || null)
          : (bankAccountsList.find(b => b.id === bankAccountId)?.name || null),
        debit: 0,
        credit: totalAmount,
        description: description.trim(),
        line_order: debitLines.length + 1,
      };
      const { error: linesErr } = await supabase.from("voucher_lines").insert([...debitLines, creditLine] as any);
      if (linesErr) throw linesErr;

      // 5) Post: N transactions, one per debit line, all sharing reference
      if (!asDraft) {
        const payMethodAr = source === "cash" ? "نقدي" : "بنك";
        for (let i = 0; i < resolved.length; i++) {
          const r = resolved[i];
          const desc = r.description?.trim() || `${description.trim()} - ${r.resolvedName || ""}`.trim();
          const { data: tx, error: txErr } = await supabase.from("transactions").insert({
            user_id: ownerId,
            transaction_date: paymentDate,
            description: desc,
            debit_account_code: r.resolvedCode,
            credit_account_code: sourceAccountCode,
            amount: r.amount,
            currency: "شيكل",
            transaction_type: r.kind === "employee" ? "employee_payment" : (r.kind === "account" ? "journal" : "payment"),
            contact_id: r.contactIdForTx,
            payment_method: payMethodAr,
            idempotency_key: `BULK-${voucher!.ref_number}-${i + 1}`,
            reference: voucher!.ref_number,
          } as any).select("id").single();
          if (txErr) throw txErr;
          if (tx?.id) insertedTxIds.push(tx.id);
        }
      }

      broadcastChange("payment_voucher", "created", voucherId);
      toast.success(asDraft ? "تم حفظ المسودة" : `تم ترحيل السند ${voucher!.ref_number}`);
      setSaved(true);
      setTimeout(() => navigate("/finance/payments"), 800);
    } catch (err: any) {
      console.error("[BulkVoucher] save failed", err);
      // Rollback: delete any inserted transactions, then delete voucher (cascades lines)
      try {
        if (insertedTxIds.length) {
          await supabase.from("transactions").update({ is_deleted: true, idempotency_key: null } as any).in("id", insertedTxIds);
        }
        if (voucherId) {
          await supabase.from("vouchers").delete().eq("id", voucherId).eq("user_id", ownerId);
        }
      } catch (cleanupErr) {
        console.error("[BulkVoucher] cleanup failed", cleanupErr);
      }
      toast.error(err?.message || "فشل حفظ السند الجماعي");
    } finally {
      setSaving(false);
    }
  };

  /* ── Render ── */
  const kindIcon = (k: LineKind) => k === "employee" ? User : k === "contact" ? Building2 : BookOpen;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <PageHeader
            title="سند صرف جماعي"
            subtitle="صرف دفعة واحدة لعدة موظفين أو موردين أو حسابات — قيد محاسبي مركّب واحد"
            icon={Users}
          />
        </div>

        {/* Header form */}
        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>رقم السند</Label>
              <Input value={refNumber} onChange={e => setRefNumber(e.target.value)} disabled={saved} dir="ltr" />
            </div>
            <div>
              <Label>التاريخ</Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} disabled={saved} />
            </div>
            <div>
              <Label>طريقة الدفع</Label>
              <Select value={source} onValueChange={(v: any) => setSource(v)} disabled={saved}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدي (صندوق)</SelectItem>
                  <SelectItem value="bank">تحويل بنكي</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {source === "cash" ? (
              <div className="md:col-span-1">
                <Label>الصندوق</Label>
                <Select value={cashBoxId} onValueChange={setCashBoxId} disabled={saved}>
                  <SelectTrigger><SelectValue placeholder="اختر الصندوق" /></SelectTrigger>
                  <SelectContent>
                    {cashBoxes.map(cb => (
                      <SelectItem key={cb.id} value={cb.id}>{cb.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="md:col-span-1">
                <Label>الحساب البنكي</Label>
                <Select value={bankAccountId} onValueChange={setBankAccountId} disabled={saved}>
                  <SelectTrigger><SelectValue placeholder="اختر البنك" /></SelectTrigger>
                  <SelectContent>
                    {bankAccountsList.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.bank_name} - {b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="md:col-span-2">
              <Label>البيان (يُطبَّق على السند كله)</Label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="مثلاً: سلف موظفين شهر تموز 2026"
                disabled={saved}
              />
            </div>
            <div className="md:col-span-3">
              <Label>ملاحظات (اختياري)</Label>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} disabled={saved} />
            </div>
          </CardContent>
        </Card>

        {/* Lines table */}
        <Card>
          <CardContent className="p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-base flex items-center gap-2">
                <Users className="w-4 h-4" /> السطور ({lines.length}/{MAX_LINES})
              </div>
              <Button size="sm" variant="outline" onClick={addLine} disabled={saved || lines.length >= MAX_LINES}>
                <Plus className="w-4 h-4 ml-1" /> إضافة سطر
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-right p-2 w-10">#</th>
                    <th className="text-right p-2 w-32">النوع</th>
                    <th className="text-right p-2 min-w-[260px]">الجهة / الحساب</th>
                    <th className="text-right p-2 min-w-[200px]">البيان</th>
                    <th className="text-right p-2 w-32">المبلغ</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => {
                    const Icon = kindIcon(l.kind);
                    return (
                      <tr key={l.id} className="border-b last:border-0 align-top">
                        <td className="p-2 text-muted-foreground">{idx + 1}</td>
                        <td className="p-2">
                          <Select value={l.kind} onValueChange={(v: any) => changeKind(l.id, v)} disabled={saved}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="account"><span className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5" /> حساب</span></SelectItem>
                              <SelectItem value="employee"><span className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> موظف</span></SelectItem>
                              <SelectItem value="contact"><span className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> مورد / جهة</span></SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          {l.kind === "account" && (
                            <JournalAccountPicker
                              lineId={l.id}
                              value={l.account_code}
                              accountName={l.account_name}
                              accounts={postableAccounts}
                              onSelect={(a) => updateLine(l.id, { account_code: a.account_code, account_name: a.account_name })}
                              onClear={() => updateLine(l.id, { account_code: "", account_name: "" })}
                            />
                          )}
                          {l.kind === "employee" && (
                            <Select
                              value={l.employee_id || ""}
                              onValueChange={(v) => {
                                const e = employees.find(x => x.id === v);
                                updateLine(l.id, { employee_id: v, employee_name: e?.full_name || "" });
                              }}
                              disabled={saved}
                            >
                              <SelectTrigger className="h-9"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                              <SelectContent className="max-h-80">
                                {employees.map(e => (
                                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {l.kind === "contact" && (
                            <Select
                              value={l.contact_id || ""}
                              onValueChange={(v) => {
                                const c = contacts.find(x => x.id === v);
                                updateLine(l.id, { contact_id: v, contact_name: c?.contact_name || "" });
                              }}
                              disabled={saved}
                            >
                              <SelectTrigger className="h-9"><SelectValue placeholder="اختر الجهة" /></SelectTrigger>
                              <SelectContent className="max-h-80">
                                {contacts.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td className="p-2">
                          <Input
                            value={l.description}
                            onChange={e => updateLine(l.id, { description: e.target.value })}
                            placeholder="بيان السطر (اختياري)"
                            disabled={saved}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={l.amount || ""}
                            onChange={e => updateLine(l.id, { amount: parseFloat(e.target.value) || 0 })}
                            className="text-right font-mono"
                            disabled={saved}
                          />
                        </td>
                        <td className="p-2">
                          <Button size="icon" variant="ghost" onClick={() => removeLine(l.id)} disabled={saved || lines.length <= 1}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td colSpan={4} className="p-2 text-right">الإجمالي</td>
                    <td className="p-2 text-right font-mono text-primary">
                      {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Validation banner */}
        {validationError && (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4" /> {validationError}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 sticky bottom-0 bg-background/95 backdrop-blur border-t pt-3">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowRight className="w-4 h-4 ml-1" /> رجوع
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleSave(true)} disabled={saving || saved || !!validationError}>
              <Save className="w-4 h-4 ml-1" /> حفظ مسودة
            </Button>
            <Button onClick={() => handleSave(false)} disabled={saving || saved || !!validationError}>
              <CheckCircle className="w-4 h-4 ml-1" /> {saving ? "جارٍ الترحيل..." : "حفظ وترحيل"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}