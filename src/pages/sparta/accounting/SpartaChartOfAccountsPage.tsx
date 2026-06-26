import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SPARTA_HOLDING_ID } from "@/lib/sparta-constants";
import { Plus, ChevronLeft, FileText } from "lucide-react";
import { toast } from "sonner";

type Account = {
  id: string;
  code: string;
  name_ar: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  parent_id: string | null;
  is_postable: boolean;
  is_active: boolean;
  currency: string;
  opening_balance: number;
};

const TYPE_LABEL: Record<Account["type"], string> = {
  asset: "أصول",
  liability: "خصوم",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصاريف",
};

export default function SpartaChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", name_ar: "", type: "asset" as Account["type"], parent_id: "", currency: "ILS", opening_balance: 0 });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sparta_accounts" as any)
      .select("*")
      .eq("holding_id", SPARTA_HOLDING_ID)
      .order("code");
    if (error) toast.error(error.message);
    setAccounts((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const tree = useMemo(() => {
    const map = new Map<string, Account & { children: string[] }>();
    accounts.forEach(a => map.set(a.id, { ...a, children: [] }));
    const roots: string[] = [];
    accounts.forEach(a => {
      if (a.parent_id && map.has(a.parent_id)) map.get(a.parent_id)!.children.push(a.id);
      else roots.push(a.id);
    });
    return { map, roots };
  }, [accounts]);

  const renderNode = (id: string, depth = 0): JSX.Element => {
    const a = tree.map.get(id)!;
    return (
      <div key={id}>
        <div className="flex items-center justify-between gap-2 py-2 px-3 hover:bg-muted/50 rounded" style={{ paddingRight: 12 + depth * 20 }}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-mono text-muted-foreground">{a.code}</span>
            <span className={`text-sm ${!a.is_postable ? "font-bold" : ""}`}>{a.name_ar}</span>
            {!a.is_postable && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">مجموعة</span>}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{TYPE_LABEL[a.type]}</span>
          </div>
          {a.is_postable && (
            <Link to={`/sparta/accounting/ledger/${a.id}`} className="text-xs flex items-center gap-1 text-primary hover:underline">
              <FileText className="h-3 w-3" /> أستاذ
              <ChevronLeft className="h-3 w-3" />
            </Link>
          )}
        </div>
        {a.children.map(c => renderNode(c, depth + 1))}
      </div>
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name_ar.trim()) { toast.error("اكتب الكود والاسم"); return; }
    const { error } = await supabase.from("sparta_accounts" as any).insert({
      holding_id: SPARTA_HOLDING_ID,
      code: form.code.trim(),
      name_ar: form.name_ar.trim(),
      type: form.type,
      parent_id: form.parent_id || null,
      currency: form.currency,
      opening_balance: Number(form.opening_balance) || 0,
      is_postable: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم إضافة الحساب");
    setShowForm(false);
    setForm({ code: "", name_ar: "", type: "asset", parent_id: "", currency: "ILS", opening_balance: 0 });
    load();
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">شجرة الحسابات</h1>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm">
          <Plus className="h-4 w-4" /> حساب جديد
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="rounded-lg border bg-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          <div>
            <label className="block mb-1 text-muted-foreground">الكود</label>
            <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background" />
          </div>
          <div className="sm:col-span-2">
            <label className="block mb-1 text-muted-foreground">الاسم</label>
            <input value={form.name_ar} onChange={e => setForm({ ...form, name_ar: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background" />
          </div>
          <div>
            <label className="block mb-1 text-muted-foreground">النوع</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })} className="w-full border rounded px-2 py-1.5 bg-background">
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block mb-1 text-muted-foreground">الحساب الأب</label>
            <select value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background">
              <option value="">(بدون - حساب رئيسي)</option>
              {accounts.filter(a => a.type === form.type && !a.is_postable).map(a => <option key={a.id} value={a.id}>{a.code} - {a.name_ar}</option>)}
            </select>
          </div>
          <div>
            <label className="block mb-1 text-muted-foreground">العملة</label>
            <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} className="w-full border rounded px-2 py-1.5 bg-background">
              <option value="ILS">شيكل</option>
              <option value="USD">دولار</option>
              <option value="JOD">دينار</option>
              <option value="EUR">يورو</option>
            </select>
          </div>
          <div>
            <label className="block mb-1 text-muted-foreground">الرصيد الافتتاحي</label>
            <input type="number" step="0.01" value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: Number(e.target.value) })} className="w-full border rounded px-2 py-1.5 bg-background" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3 flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded border text-sm">إلغاء</button>
            <button type="submit" className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm">حفظ</button>
          </div>
        </form>
      )}

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">جاري التحميل...</div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">لا توجد حسابات بعد</div>
        ) : (
          <div className="py-2">{tree.roots.map(r => renderNode(r))}</div>
        )}
      </div>
    </div>
  );
}