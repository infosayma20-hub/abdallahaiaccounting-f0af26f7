import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, DollarSign, Save, Search, Banknote, FileText, Plus, Trash2, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { callCreateReceiptRpc } from "@/lib/voucher-rpc";

/**
 * Rep Collect — تحصيل من العميل (نقدي / شيك).
 * - نقدي: مدين صندوق المندوب 1110 / دائن 1130
 * - شيك:  مدين 1150 (شيكات برسم التحصيل) / دائن 1130 + سجل في cheques
 *   الإيداع لاحقاً يتم من شاشة الشيكات في Admin.
 */

type ChequeRow = {
  uid: string;
  cheque_number: string;
  bank_name: string;
  branch: string;
  drawer_name: string;
  cheque_date: string; // YYYY-MM-DD (استحقاق)
  amount: string;
  notes: string;
  image_file: File | null;
};

const newChequeRow = (): ChequeRow => ({
  uid: crypto.randomUUID(),
  cheque_number: "",
  bank_name: "",
  branch: "",
  drawer_name: "",
  cheque_date: "",
  amount: "",
  notes: "",
  image_file: null,
});

export default function RepCollectPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rep, setRep] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [contactId, setContactId] = useState<string>("");
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [method, setMethod] = useState<"cash" | "cheque">("cash");
  const [amount, setAmount] = useState<string>(""); // للنقدي
  const [cheques, setCheques] = useState<ChequeRow[]>([newChequeRow()]);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: r } = await (supabase as any)
        .from("sales_representatives")
        .select("id, user_id, full_name, cash_box_id")
        .eq("auth_user_id", user.id).maybeSingle();
      if (!r) { setLoading(false); return; }
      let cashAccountCode: string | null = null;
      let cashBoxName: string | null = null;
      if (r.cash_box_id) {
        const { data: cb } = await (supabase as any)
          .from("cash_boxes")
          .select("id, name, gl_account_code, is_active")
          .eq("id", r.cash_box_id)
          .maybeSingle();
        if (cb && cb.is_active && cb.gl_account_code) {
          cashAccountCode = cb.gl_account_code;
          cashBoxName = cb.name;
        }
      }
      setRep({ ...r, cash_account_code: cashAccountCode, cash_box_name: cashBoxName });
      const { data: cts } = await (supabase as any)
        .from("contacts")
        .select("id, contact_name, contact_type")
        .eq("user_id", r.user_id)
        .in("contact_type", ["عميل", "عميل ومورد"])
        .eq("is_active", true)
        .eq("is_archived", false)
        .limit(500);
      setContacts((cts || []).map((c: any) => ({ ...c, name: c.contact_name })));
      setLoading(false);
    })();
  }, [user?.id]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts.slice(0, 30);
    return contacts.filter((c) => (c.name || "").toLowerCase().includes(q)).slice(0, 50);
  }, [search, contacts]);

  const selectedContact = contacts.find((c) => c.id === contactId);

  const loadBalance = async (id: string) => {
    if (!rep) return;
    setLoadingBalance(true);
    setBalance(null);
    try {
      const { data, error: txErr } = await (supabase as any)
        .from("transactions")
        .select("amount, debit_account_code, credit_account_code")
        .eq("user_id", rep.user_id)
        .eq("contact_id", id)
        .eq("is_deleted", false);
      if (txErr) throw txErr;
      const rows = data || [];
      const arRoots = ["113", "2115"];
      const matchesAR = (code: string | null | undefined) =>
        !!code && arRoots.some((r) => code === r || code.startsWith(r));
      const debit = rows
        .filter((t: any) => matchesAR(t.debit_account_code))
        .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      const credit = rows
        .filter((t: any) => matchesAR(t.credit_account_code))
        .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      setBalance(debit - credit);
    } catch (e: any) {
      toast({ title: "تعذر جلب الرصيد", description: e.message, variant: "destructive" });
    } finally {
      setLoadingBalance(false);
    }
  };

  const onPickContact = (id: string) => {
    setContactId(id);
    setSearch("");
    loadBalance(id);
  };

  const updateCheque = (uid: string, patch: Partial<ChequeRow>) => {
    setCheques((prev) => prev.map((c) => (c.uid === uid ? { ...c, ...patch } : c)));
  };
  const addCheque = () => setCheques((prev) => [...prev, newChequeRow()]);
  const removeCheque = (uid: string) =>
    setCheques((prev) => (prev.length === 1 ? prev : prev.filter((c) => c.uid !== uid)));

  const chequesTotal = useMemo(
    () => cheques.reduce((s, c) => s + (Number(c.amount) || 0), 0),
    [cheques]
  );

  const totalAmount = method === "cash" ? Number(amount || 0) : chequesTotal;

  /* ---------- Cash save ---------- */
  const saveCash = async () => {
    if (!rep?.cash_account_code) {
      toast({ title: "لا يوجد صندوق نقدي مرتبط", variant: "destructive" });
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast({ title: "أدخل مبلغاً صحيحاً", variant: "destructive" }); return; }
    if (balance !== null && amt > balance + 0.01) {
      const prepay = amt - Math.max(0, balance);
      const ok = window.confirm(
        `المبلغ المُحصَّل (${amt.toFixed(2)} ₪) أكبر من الرصيد المستحق (${(balance ?? 0).toFixed(2)} ₪). سيتم تسجيل دفعة مقدمة بقيمة ${prepay.toFixed(2)} ₪. متابعة؟`
      );
      if (!ok) return;
    }

    const idempotencyKey = `REP-RCP-${Date.now()}`;
    const result = await callCreateReceiptRpc({
      userId: rep.user_id,
      contactId,
      contactName: selectedContact?.name ?? null,
      amount: amt,
      paymentMethod: "نقدي",
      currency: "شيكل",
      cashAccountCode: rep.cash_account_code,
      contactAccountCode: "1130",
      description: `تحصيل نقدي من ${selectedContact?.name ?? "عميل"} — مندوب`,
      idempotencyKey,
    });
    if (!result.success) throw new Error(result.error || "فشل التحصيل");

    if (result.transaction_id) {
      await (supabase as any).from("transactions").update({ sales_rep_id: rep.id }).eq("id", result.transaction_id);
    }
    if (!result.duplicate && result.transaction_id) {
      const { data: existingRV } = await (supabase as any)
        .from("receipt_vouchers").select("id")
        .eq("user_id", rep.user_id).eq("linked_transaction_id", result.transaction_id).maybeSingle();
      if (!existingRV) {
        await (supabase as any).from("receipt_vouchers").insert({
          user_id: rep.user_id,
          contact_id: contactId,
          contact_name: selectedContact?.name ?? null,
          payment_date: new Date().toISOString().slice(0, 10),
          amount: amt,
          payment_method: "نقدي",
          cash_box_id: rep.cash_box_id ?? null,
          deposit_account_code: rep.cash_account_code,
          notes: `تحصيل من بورتال المندوب — ${rep.full_name ?? ""}`.trim(),
          status: "posted",
          linked_transaction_id: result.transaction_id,
        });
      }
    }
    toast({ title: result.duplicate ? "هذا التحصيل مسجّل مسبقاً" : "تم التحصيل بنجاح", description: `${amt.toFixed(2)} ₪` });
  };

  /* ---------- Cheque save ---------- */
  const saveCheques = async () => {
    // Validate
    for (const c of cheques) {
      if (!c.cheque_number.trim()) throw new Error("أدخل رقم الشيك لكل شيك");
      if (!c.bank_name.trim()) throw new Error("أدخل اسم البنك لكل شيك");
      if (!c.cheque_date) throw new Error("أدخل تاريخ استحقاق لكل شيك");
      const a = Number(c.amount);
      if (!a || a <= 0) throw new Error("أدخل مبلغاً صحيحاً لكل شيك");
    }
    const total = chequesTotal;
    if (total <= 0) throw new Error("المجموع غير صالح");
    if (balance !== null && total > balance + 0.01) {
      const prepay = total - Math.max(0, balance);
      const ok = window.confirm(
        `مجموع الشيكات (${total.toFixed(2)} ₪) أكبر من الرصيد المستحق (${(balance ?? 0).toFixed(2)} ₪). سيتم تسجيل دفعة مقدمة بقيمة ${prepay.toFixed(2)} ₪. متابعة؟`
      );
      if (!ok) return;
    }

    // 1) Receipt voucher (Dr 1150 / Cr 1130)
    const idempotencyKey = `REP-CHQ-${Date.now()}`;
    const partyName = selectedContact?.name ?? "عميل";
    const result = await callCreateReceiptRpc({
      userId: rep.user_id,
      contactId,
      contactName: partyName,
      amount: total,
      paymentMethod: "شيك",
      currency: "شيكل",
      cashAccountCode: "1150",
      contactAccountCode: "1130",
      description: `تحصيل بشيكات (${cheques.length}) من ${partyName} — مندوب`,
      idempotencyKey,
    });
    if (!result.success) throw new Error(result.error || "فشل إنشاء سند القبض");
    if (result.duplicate) {
      toast({ title: "هذا التحصيل مسجّل مسبقاً" });
      return;
    }
    const txId = result.transaction_id!;
    await (supabase as any).from("transactions").update({ sales_rep_id: rep.id }).eq("id", txId);

    // 2) Receipt voucher record
    const { data: rvRow, error: rvErr } = await (supabase as any)
      .from("receipt_vouchers")
      .insert({
        user_id: rep.user_id,
        contact_id: contactId,
        contact_name: partyName,
        payment_date: new Date().toISOString().slice(0, 10),
        amount: total,
        payment_method: "شيك",
        cash_box_id: null,
        deposit_account_code: "1150",
        notes: `تحصيل بشيكات من بورتال المندوب — ${rep.full_name ?? ""}`.trim(),
        status: "posted",
        linked_transaction_id: txId,
      })
      .select("id")
      .single();
    if (rvErr) console.warn("[RepCollect] receipt_voucher insert failed:", rvErr);
    const rvId = rvRow?.id ?? null;

    // 3) Per-cheque: upload image (if any) → insert cheque row
    const failures: string[] = [];
    for (const c of cheques) {
      const chequeId = crypto.randomUUID();
      let imageUrl: string | null = null;
      if (c.image_file) {
        try {
          const ext = (c.image_file.name.split(".").pop() || "jpg").toLowerCase();
          const path = `${user!.id}/${chequeId}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("cheque-images")
            .upload(path, c.image_file, { upsert: true, contentType: c.image_file.type });
          if (upErr) throw upErr;
          imageUrl = path; // نخزن المسار (نولّد signed URL لاحقاً عند العرض)
        } catch (e: any) {
          console.warn("[RepCollect] cheque image upload failed:", e.message);
        }
      }

      const { error: chqErr } = await (supabase as any).from("cheques").insert({
        id: chequeId,
        user_id: rep.user_id,
        cheque_type: "وارد",
        status: "مسجل",
        cheque_number: c.cheque_number.trim(),
        bank_name: c.bank_name.trim(),
        account_number: c.branch.trim() || null,
        cheque_date: c.cheque_date,
        amount: Number(c.amount),
        currency: "ILS",
        party_name: c.drawer_name.trim() || partyName,
        party_type: "عميل",
        contact_id: contactId,
        linked_account: "1130",
        image_url: imageUrl,
        notes: c.notes.trim() || null,
        linked_transaction_id: txId,
        receipt_voucher_id: rvId,
      });
      if (chqErr) {
        console.error("[RepCollect] cheque insert failed:", chqErr);
        failures.push(`${c.bank_name} #${c.cheque_number}: ${chqErr.message}`);
      }
    }

    if (failures.length) {
      toast({
        title: `تم حفظ السند ولكن فشل ${failures.length} شيك`,
        description: failures.join("\n"),
        variant: "destructive",
      });
    } else {
      toast({ title: "تم تسجيل التحصيل بنجاح", description: `${cheques.length} شيك — ${total.toFixed(2)} ₪` });
    }
  };

  const save = async () => {
    if (!rep) return;
    if (!contactId) { toast({ title: "اختر عميلاً", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (method === "cash") await saveCash();
      else await saveCheques();
      setAmount("");
      setCheques([newChequeRow()]);
      await loadBalance(contactId);
      navigate("/rep");
    } catch (e: any) {
      toast({ title: "تعذّر الحفظ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (rep && method === "cash" && !rep.cash_account_code) {
    // نسمح للمندوب بتسجيل شيكات حتى لو ما عنده صندوق نقدي مرتبط
  }

  const canSave =
    !!contactId &&
    !saving &&
    (method === "cash" ? Number(amount) > 0 && !!rep?.cash_account_code : chequesTotal > 0);

  return (
    <div className="p-4 space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary" />
          <h2 className="font-bold text-foreground">تحصيل من عميل</h2>
        </div>

        <div className="space-y-2">
          <Label>العميل</Label>
          {contactId && selectedContact ? (
            <div className="flex items-center justify-between p-3 border border-border rounded-md bg-muted/40">
              <div className="font-medium text-sm">{selectedContact.name}</div>
              <button className="text-xs text-muted-foreground underline" onClick={() => { setContactId(""); setBalance(null); }}>تغيير</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="ابحث باسم العميل" value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10 h-11" />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1 border border-border rounded-md">
                {filteredContacts.map((c) => (
                  <button key={c.id} onClick={() => onPickContact(c.id)} className="w-full text-right p-3 hover:bg-muted text-sm border-b border-border last:border-0">
                    {c.name}
                  </button>
                ))}
                {filteredContacts.length === 0 && <div className="p-3 text-sm text-muted-foreground text-center">لا توجد نتائج</div>}
              </div>
            </>
          )}
        </div>

        {contactId && (
          <div className="flex items-center justify-between p-3 rounded-md bg-primary/5 border border-primary/20">
            <div className="text-xs text-muted-foreground">الرصيد المستحق</div>
            <div className="font-bold text-foreground">
              {loadingBalance ? <Loader2 className="w-4 h-4 animate-spin" /> : `${(balance ?? 0).toFixed(2)} ₪`}
            </div>
          </div>
        )}
      </Card>

      {/* Method toggle */}
      <Card className="p-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMethod("cash")}
            className={cn(
              "flex items-center justify-center gap-2 h-12 rounded-md text-sm font-medium transition",
              method === "cash" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"
            )}
          >
            <Banknote className="w-4 h-4" /> نقدي
          </button>
          <button
            type="button"
            onClick={() => setMethod("cheque")}
            className={cn(
              "flex items-center justify-center gap-2 h-12 rounded-md text-sm font-medium transition",
              method === "cheque" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"
            )}
          >
            <FileText className="w-4 h-4" /> شيك
          </button>
        </div>
      </Card>

      {method === "cash" ? (
        <Card className="p-4 space-y-3">
          {!rep?.cash_account_code && (
            <div className="text-xs text-destructive p-2 bg-destructive/10 rounded">
              لا يوجد صندوق نقدي مرتبط بالمندوب — لا يمكن التحصيل نقداً.
            </div>
          )}
          <Label>المبلغ المُحصَّل (₪)</Label>
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="h-12 text-lg text-center font-bold"
          />
        </Card>
      ) : (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label>الشيكات ({cheques.length})</Label>
            <Button type="button" variant="outline" size="sm" onClick={addCheque}>
              <Plus className="w-4 h-4 ml-1" /> إضافة شيك
            </Button>
          </div>

          <div className="space-y-4">
            {cheques.map((c, idx) => (
              <div key={c.uid} className="border border-border rounded-md p-3 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-foreground">شيك #{idx + 1}</div>
                  {cheques.length > 1 && (
                    <button type="button" onClick={() => removeCheque(c.uid)} className="text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">رقم الشيك *</Label>
                    <Input className="h-10" value={c.cheque_number} onChange={(e) => updateCheque(c.uid, { cheque_number: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">البنك *</Label>
                    <Input className="h-10" value={c.bank_name} onChange={(e) => updateCheque(c.uid, { bank_name: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">تاريخ الاستحقاق *</Label>
                    <Input type="date" className="h-10" value={c.cheque_date} onChange={(e) => updateCheque(c.uid, { cheque_date: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">المبلغ (₪) *</Label>
                    <Input type="number" inputMode="decimal" className="h-10 font-bold" value={c.amount} onChange={(e) => updateCheque(c.uid, { amount: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">اسم الساحب</Label>
                    <Input className="h-10" placeholder={selectedContact?.name ?? ""} value={c.drawer_name} onChange={(e) => updateCheque(c.uid, { drawer_name: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">فرع البنك</Label>
                    <Input className="h-10" value={c.branch} onChange={(e) => updateCheque(c.uid, { branch: e.target.value })} />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">ملاحظات</Label>
                  <Textarea rows={2} value={c.notes} onChange={(e) => updateCheque(c.uid, { notes: e.target.value })} />
                </div>

                <div>
                  <Label className="text-xs">صورة الشيك</Label>
                  <label className="flex items-center gap-2 h-10 px-3 border border-dashed border-border rounded-md cursor-pointer hover:bg-muted/50">
                    <Camera className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground truncate">
                      {c.image_file ? c.image_file.name : "اضغط للتصوير أو اختيار صورة"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => updateCheque(c.uid, { image_file: e.target.files?.[0] ?? null })}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between p-3 rounded-md bg-primary/10 border border-primary/30">
            <div className="text-sm text-foreground">المجموع</div>
            <div className="text-lg font-bold text-foreground">{chequesTotal.toFixed(2)} ₪</div>
          </div>
        </Card>
      )}

      <Button className="w-full h-12 text-base" onClick={save} disabled={!canSave}>
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Save className="w-4 h-4 ml-2" />
            {method === "cash"
              ? "حفظ التحصيل"
              : `حفظ سند القبض (${cheques.length} شيك — ${chequesTotal.toFixed(2)} ₪)`}
          </>
        )}
      </Button>
    </div>
  );
}
