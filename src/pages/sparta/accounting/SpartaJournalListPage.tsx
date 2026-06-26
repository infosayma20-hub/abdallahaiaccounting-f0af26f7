import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SPARTA_HOLDING_ID } from "@/lib/sparta-constants";
import { Plus, RefreshCw, CheckCircle2, FileWarning } from "lucide-react";
import { toast } from "sonner";

type Entry = {
  id: string;
  entry_no: string;
  entry_date: string;
  description: string | null;
  status: "draft" | "posted" | "void";
  total_debit: number;
  total_credit: number;
  ref_type: string | null;
};

const STATUS_BADGE: Record<Entry["status"], { label: string; cls: string }> = {
  draft: { label: "مسودة", cls: "bg-amber-100 text-amber-800" },
  posted: { label: "مُرحَّل", cls: "bg-emerald-100 text-emerald-800" },
  void: { label: "ملغي", cls: "bg-red-100 text-red-800" },
};

export default function SpartaJournalListPage() {
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Entry["status"]>("all");

  const load = async () => {
    setLoading(true);
    let q = supabase.from("sparta_journal_entries" as any).select("*").eq("holding_id", SPARTA_HOLDING_ID).order("entry_date", { ascending: false }).order("entry_no", { ascending: false }).limit(200);
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setItems((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [filter]);

  const reverse = async (e: Entry) => {
    const reason = prompt("سبب عكس القيد:");
    if (!reason) return;
    const { error } = await supabase.rpc("sparta_reverse_journal" as any, { _entry_id: e.id, _reason: reason });
    if (error) toast.error(error.message); else { toast.success("تم عكس القيد"); load(); }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">قيود اليومية</h1>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value as any)} className="border rounded px-2 py-1.5 text-sm bg-background">
            <option value="all">كل القيود</option>
            <option value="draft">مسودات</option>
            <option value="posted">مُرحَّلة</option>
            <option value="void">ملغية</option>
          </select>
          <button onClick={load} className="p-2 rounded border" title="تحديث"><RefreshCw className="h-4 w-4" /></button>
          <Link to="/sparta/accounting/journal/new" className="flex items-center gap-2 px-3 py-2 rounded bg-primary text-primary-foreground text-sm">
            <Plus className="h-4 w-4" /> قيد جديد
          </Link>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">جاري التحميل...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">لا توجد قيود</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-right p-2">رقم القيد</th>
                <th className="text-right p-2">التاريخ</th>
                <th className="text-right p-2">الوصف</th>
                <th className="text-right p-2">المرجع</th>
                <th className="text-right p-2">الإجمالي</th>
                <th className="text-right p-2">الحالة</th>
                <th className="text-right p-2">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {items.map(e => (
                <tr key={e.id} className="border-t hover:bg-muted/30">
                  <td className="p-2 font-mono text-xs">
                    <Link to={`/sparta/accounting/journal/${e.id}`} className="text-primary hover:underline">{e.entry_no}</Link>
                  </td>
                  <td className="p-2">{e.entry_date}</td>
                  <td className="p-2 max-w-xs truncate">{e.description}</td>
                  <td className="p-2 text-xs text-muted-foreground">{e.ref_type || "-"}</td>
                  <td className="p-2 font-mono">{Number(e.total_debit).toFixed(2)}</td>
                  <td className="p-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded ${STATUS_BADGE[e.status].cls}`}>{STATUS_BADGE[e.status].label}</span>
                  </td>
                  <td className="p-2">
                    {e.status === "posted" && !e.ref_type?.startsWith("reverse") && (
                      <button onClick={() => reverse(e)} className="text-xs text-amber-700 hover:underline flex items-center gap-1">
                        <FileWarning className="h-3 w-3" /> عكس
                      </button>
                    )}
                    {e.status === "draft" && (
                      <Link to={`/sparta/accounting/journal/${e.id}`} className="text-xs text-emerald-700 hover:underline flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> فتح للترحيل
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}