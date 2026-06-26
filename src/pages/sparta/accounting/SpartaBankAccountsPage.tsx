import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SPARTA_HOLDING_ID } from "@/lib/sparta-constants";
import { Plus, RefreshCw, X, Landmark } from "lucide-react";
import { toast } from "sonner";

type Bank = { id: string; name: string; bank_name: string | null; account_number: string | null; currency: string; current_balance: number; is_active: boolean };
type Txn = { id: string; txn_date: string; direction: string; amount: number; description: string | null; reference: string | null; reconciled: boolean };

export default function SpartaBankAccountsPage() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [active, setActive] = useState<Bank | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [showTxn, setShowTxn] = useState(false);
  const [form, setForm] = useState({ name: "", bank_name: "", account_number: "", currency: "ILS", opening_balance: 0 });
  const [txnForm, setTxnForm] = useState({ txn_date: new Date().toISOString().slice(0, 10), direction: "in", amount: 0, description: "", reference: "" });

  const loadBanks = async () => {
    const { data } = await supabase.from("sparta_bank_accounts" as any).select("*").eq("company_id", SPARTA_HOLDING_ID).order("name");
    setBanks((data as any) || []);
  };
  const loadTxns = async (id: string) => {
    const { data } = await supabase.from("sparta_bank_transactions" as any).select("*").eq("bank_account_id", id).order("txn_date", { ascending: false }).limit(100);
    setTxns((data as any) || []);
  };
  useEffect(() => { loadBanks(); }, []);
  useEffect(() => { if (active) loadTxns(active.id); }, [active]);

  const saveBank = async () => {
    if (!form.name) return toast.error("اسم الحساب مطلوب");
    const { error } = await supabase.from("sparta_bank_accounts" as any).insert({ company_id: SPARTA_HOLDING_ID, ...form, current_balance: form.opening_balance });
    if (error) return toast.error(error.message);
    toast.success("تم"); setShowNew(false); loadBanks();
  };
  const saveTxn = async () => {
    if (!active || !txnForm.amount) return toast.error("أدخل المبلغ");
    const { error } = await supabase.from("sparta_bank_transactions" as any).insert({ company_id: SPARTA_HOLDING_ID, bank_account_id: active.id, ...txnForm, ref_type: "manual" });
    if (error) return toast.error(error.message);
    toast.success("تم"); setShowTxn(false); setTxnForm({ ...txnForm, amount: 0, description: "", reference: "" });
    loadTxns(active.id); loadBanks();
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">الحسابات البنكية</h1>
        <div className="flex gap-2">
          <button onClick={loadBanks} className="p-2 rounded border"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-3 py-2 rounded bg-primary text-primary-foreground text-sm"><Plus className="h-4 w-4" /> حساب جديد</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          {banks.length === 0 && <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">لا توجد حسابات بنكية</div>}
          {banks.map(b => (
            <button key={b.id} onClick={() => setActive(b)} className={`w-full text-right rounded-lg border p-3 hover:bg-muted/50 ${active?.id === b.id ? "ring-2 ring-primary" : ""}`}>
              <div className="flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" /><span className="font-semibold">{b.name}</span></div>
              <div className="text-xs text-muted-foreground mt-1">{b.bank_name || "—"} • {b.account_number || "—"}</div>
              <div className="font-mono mt-1 text-lg">{Number(b.current_balance).toFixed(2)} {b.currency}</div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 rounded-lg border bg-card overflow-hidden">
          {!active ? <div className="p-8 text-center text-sm text-muted-foreground">اختر حسابًا لعرض حركاته</div> :
            <>
              <div className="p-3 border-b flex items-center justify-between">
                <div className="font-semibold">حركات {active.name}</div>
                <button onClick={() => setShowTxn(true)} className="text-sm px-3 py-1 rounded bg-primary text-primary-foreground flex items-center gap-1"><Plus className="h-3 w-3" /> حركة</button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs"><tr>
                  <th className="text-right p-2">التاريخ</th><th className="text-right p-2">النوع</th>
                  <th className="text-right p-2">المبلغ</th><th className="text-right p-2">الوصف</th>
                  <th className="text-right p-2">المرجع</th><th className="text-right p-2">تسوية</th>
                </tr></thead>
                <tbody>
                  {txns.map(t => (
                    <tr key={t.id} className="border-t">
                      <td className="p-2">{t.txn_date}</td>
                      <td className="p-2"><span className={`text-xs px-2 py-0.5 rounded ${t.direction === "in" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{t.direction === "in" ? "وارد" : "صادر"}</span></td>
                      <td className="p-2 font-mono">{Number(t.amount).toFixed(2)}</td>
                      <td className="p-2">{t.description || "-"}</td>
                      <td className="p-2 text-xs text-muted-foreground">{t.reference || "-"}</td>
                      <td className="p-2">{t.reconciled ? "✓" : "—"}</td>
                    </tr>
                  ))}
                  {txns.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">لا توجد حركات</td></tr>}
                </tbody>
              </table>
            </>
          }
        </div>
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowNew(false)}>
          <div className="bg-background rounded-lg p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><h3 className="font-bold">حساب بنكي جديد</h3><button onClick={() => setShowNew(false)}><X className="h-4 w-4" /></button></div>
            <div className="space-y-3 text-sm">
              <div><label>اسم الحساب</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background" /></div>
              <div><label>اسم البنك</label><input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background" /></div>
              <div><label>رقم الحساب</label><input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label>العملة</label><select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background"><option>ILS</option><option>USD</option><option>JOD</option><option>EUR</option></select></div>
                <div><label>الرصيد الافتتاحي</label><input type="number" value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 bg-background" /></div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4"><button onClick={() => setShowNew(false)} className="px-3 py-1.5 rounded border text-sm">إلغاء</button><button onClick={saveBank} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm">حفظ</button></div>
          </div>
        </div>
      )}

      {showTxn && active && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowTxn(false)}>
          <div className="bg-background rounded-lg p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><h3 className="font-bold">حركة بنكية ({active.name})</h3><button onClick={() => setShowTxn(false)}><X className="h-4 w-4" /></button></div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><label>التاريخ</label><input type="date" value={txnForm.txn_date} onChange={e => setTxnForm({ ...txnForm, txn_date: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background" /></div>
              <div><label>النوع</label><select value={txnForm.direction} onChange={e => setTxnForm({ ...txnForm, direction: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background"><option value="in">وارد</option><option value="out">صادر</option></select></div>
              <div className="col-span-2"><label>المبلغ</label><input type="number" value={txnForm.amount} onChange={e => setTxnForm({ ...txnForm, amount: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 bg-background" /></div>
              <div className="col-span-2"><label>الوصف</label><input value={txnForm.description} onChange={e => setTxnForm({ ...txnForm, description: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background" /></div>
              <div className="col-span-2"><label>المرجع</label><input value={txnForm.reference} onChange={e => setTxnForm({ ...txnForm, reference: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4"><button onClick={() => setShowTxn(false)} className="px-3 py-1.5 rounded border text-sm">إلغاء</button><button onClick={saveTxn} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm">حفظ</button></div>
          </div>
        </div>
      )}
    </div>
  );
}