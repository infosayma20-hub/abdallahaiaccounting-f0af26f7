import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SPARTA_HOLDING_ID } from "@/lib/sparta-constants";
import { Plus, Trash2, Save, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

type Account = { id: string; code: string; name_ar: string; is_postable: boolean };
type Line = { id?: string; account_id: string; debit: number; credit: number; description: string };
type Entry = { id: string; entry_no: string; entry_date: string; description: string | null; status: string; total_debit: number; total_credit: number };

export default function SpartaJournalFormPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { account_id: "", debit: 0, credit: 0, description: "" },
    { account_id: "", debit: 0, credit: 0, description: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const isPosted = entry?.status === "posted" || entry?.status === "void";

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("sparta_accounts" as any).select("id, code, name_ar, is_postable").eq("holding_id", SPARTA_HOLDING_ID).eq("is_postable", true).eq("is_active", true).order("code");
      setAccounts((data as any) || []);
    })();
  }, []);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const { data: e } = await supabase.from("sparta_journal_entries" as any).select("*").eq("id", id).maybeSingle();
      if (!e) { toast.error("قيد غير موجود"); navigate("/sparta/accounting/journal"); return; }
      setEntry(e as any);
      setDate((e as any).entry_date);
      setDescription((e as any).description || "");
      const { data: ls } = await supabase.from("sparta_journal_lines" as any).select("*").eq("entry_id", id).order("line_no");
      setLines(((ls as any) || []).map((l: any) => ({ id: l.id, account_id: l.account_id, debit: Number(l.debit), credit: Number(l.credit), description: l.description || "" })));
    })();
  }, [id]);

  const totalD = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalC = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalD - totalC) < 0.01 && totalD > 0;

  const updateLine = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLine = () => setLines(ls => [...ls, { account_id: "", debit: 0, credit: 0, description: "" }]);
  const removeLine = (i: number) => setLines(ls => ls.filter((_, idx) => idx !== i));

  const save = async (postAfter = false) => {
    if (lines.some(l => !l.account_id)) { toast.error("اختر حساباً لكل سطر"); return; }
    if (lines.some(l => Number(l.debit) > 0 && Number(l.credit) > 0)) { toast.error("لا يمكن أن يكون السطر مديناً ودائناً معاً"); return; }
    if (postAfter && !balanced) { toast.error("القيد غير متوازن"); return; }
    setLoading(true);
    try {
      let entryId = id;
      if (isNew) {
        const { data: noData } = await supabase.rpc("sparta_next_entry_no" as any, { _holding_id: SPARTA_HOLDING_ID });
        const { data: newE, error: insE } = await supabase.from("sparta_journal_entries" as any).insert({
          holding_id: SPARTA_HOLDING_ID, entry_no: noData as any, entry_date: date, description, status: "draft",
        }).select("id").single();
        if (insE) throw insE;
        entryId = (newE as any).id;
      } else {
        const { error: upE } = await supabase.from("sparta_journal_entries" as any).update({ entry_date: date, description }).eq("id", id);
        if (upE) throw upE;
        await supabase.from("sparta_journal_lines" as any).delete().eq("entry_id", id);
      }
      const payload = lines.map((l, i) => ({
        entry_id: entryId, holding_id: SPARTA_HOLDING_ID, account_id: l.account_id,
        debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, description: l.description || null, line_no: i + 1,
      }));
      const { error: lErr } = await supabase.from("sparta_journal_lines" as any).insert(payload);
      if (lErr) throw lErr;
      if (postAfter) {
        const { error: pErr } = await supabase.rpc("sparta_post_journal" as any, { _entry_id: entryId });
        if (pErr) throw pErr;
        toast.success("تم ترحيل القيد");
      } else {
        toast.success("تم حفظ المسودة");
      }
      navigate("/sparta/accounting/journal");
    } catch (e: any) {
      toast.error(e.message || "فشل الحفظ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{isNew ? "قيد جديد" : `القيد ${entry?.entry_no || ""}`}</h1>
        <button onClick={() => navigate("/sparta/accounting/journal")} className="text-sm flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowRight className="h-4 w-4" /> العودة للقائمة
        </button>
      </div>

      {isPosted && (
        <div className="rounded border bg-emerald-50 text-emerald-900 p-3 text-sm">
          هذا القيد مُرحَّل ولا يمكن تعديله. لإجراء تصحيح استخدم "عكس القيد" من قائمة القيود.
        </div>
      )}

      <div className="rounded-lg border bg-card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <label className="block mb-1 text-muted-foreground">التاريخ</label>
          <input type="date" disabled={isPosted} value={date} onChange={e => setDate(e.target.value)} className="w-full border rounded px-2 py-1.5 bg-background" />
        </div>
        <div>
          <label className="block mb-1 text-muted-foreground">الوصف</label>
          <input disabled={isPosted} value={description} onChange={e => setDescription(e.target.value)} className="w-full border rounded px-2 py-1.5 bg-background" placeholder="بيان القيد..." />
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-right p-2 w-10">#</th>
              <th className="text-right p-2">الحساب</th>
              <th className="text-right p-2 w-32">مدين</th>
              <th className="text-right p-2 w-32">دائن</th>
              <th className="text-right p-2">بيان السطر</th>
              <th className="text-right p-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="p-2 text-muted-foreground text-xs">{i + 1}</td>
                <td className="p-2">
                  <select disabled={isPosted} value={l.account_id} onChange={e => updateLine(i, { account_id: e.target.value })} className="w-full border rounded px-2 py-1 bg-background">
                    <option value="">-- اختر حساباً --</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name_ar}</option>)}
                  </select>
                </td>
                <td className="p-2">
                  <input type="number" step="0.01" disabled={isPosted} value={l.debit || ""} onChange={e => updateLine(i, { debit: Number(e.target.value), credit: 0 })} className="w-full border rounded px-2 py-1 bg-background text-left font-mono" />
                </td>
                <td className="p-2">
                  <input type="number" step="0.01" disabled={isPosted} value={l.credit || ""} onChange={e => updateLine(i, { credit: Number(e.target.value), debit: 0 })} className="w-full border rounded px-2 py-1 bg-background text-left font-mono" />
                </td>
                <td className="p-2">
                  <input disabled={isPosted} value={l.description} onChange={e => updateLine(i, { description: e.target.value })} className="w-full border rounded px-2 py-1 bg-background" />
                </td>
                <td className="p-2">
                  {!isPosted && lines.length > 2 && (
                    <button onClick={() => removeLine(i)} className="text-red-600 hover:text-red-800"><Trash2 className="h-4 w-4" /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30 font-semibold">
            <tr>
              <td colSpan={2} className="p-2 text-left">
                {!isPosted && <button onClick={addLine} className="text-xs flex items-center gap-1 text-primary"><Plus className="h-3 w-3" /> سطر جديد</button>}
              </td>
              <td className="p-2 font-mono text-left">{totalD.toFixed(2)}</td>
              <td className="p-2 font-mono text-left">{totalC.toFixed(2)}</td>
              <td className="p-2 text-xs" colSpan={2}>
                {balanced ? <span className="text-emerald-700">✓ متوازن</span> : <span className="text-red-700">الفرق: {(totalD - totalC).toFixed(2)}</span>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {!isPosted && (
        <div className="flex justify-end gap-2">
          <button onClick={() => save(false)} disabled={loading} className="px-4 py-2 rounded border text-sm flex items-center gap-2">
            <Save className="h-4 w-4" /> حفظ كمسودة
          </button>
          <button onClick={() => save(true)} disabled={loading || !balanced} className="px-4 py-2 rounded bg-emerald-600 text-white text-sm flex items-center gap-2 disabled:opacity-50">
            <CheckCircle2 className="h-4 w-4" /> حفظ وترحيل
          </button>
        </div>
      )}
    </div>
  );
}