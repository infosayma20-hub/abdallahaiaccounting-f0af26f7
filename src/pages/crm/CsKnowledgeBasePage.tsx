import { useMemo, useState } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useCsKbArticles, csInsert } from "./hooks/useCsData";
import { KB_CATEGORIES } from "./types-cs";

export default function CsKnowledgeBasePage() {
  const { user } = useAuth();
  const { items, loading, refetch } = useCsKbArticles();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState(false);
  const [expand, setExpand] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", category: "other", problem: "", symptoms: "", cause: "", solution: "", video_url: "" });

  const filtered = useMemo(() => items.filter((a) =>
    (cat === "all" || a.category === cat) &&
    (!search || `${a.title} ${a.problem ?? ""} ${a.solution ?? ""}`.toLowerCase().includes(search.toLowerCase()))
  ), [items, search, cat]);

  const save = async () => {
    if (!user || !form.title.trim()) return;
    if (await csInsert("cs_kb_articles", { ...form, tags: [] }, user.id)) {
      setOpen(false); refetch();
      setForm({ title: "", category: "other", problem: "", symptoms: "", cause: "", solution: "", video_url: "" });
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-purple-600" />
          <h2 className="text-base font-bold text-slate-900">قاعدة المعرفة</h2>
          <span className="text-[11px] text-slate-500">({filtered.length})</span>
        </div>
        <Button onClick={() => setOpen(true)} className="h-9 gap-1.5 text-[13px]"><Plus className="h-4 w-4" /> مقال جديد</Button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في المقالات..." className="h-9 pr-9 text-[12px]" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 px-2 rounded-md border border-slate-200 text-[12px] bg-white">
          <option value="all">كل التصنيفات</option>
          {KB_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        {loading ? <p className="p-8 text-center text-slate-400 text-sm">جارٍ التحميل...</p> :
          filtered.length === 0 ? <p className="p-8 text-center text-slate-400 text-sm">لا توجد مقالات بعد. ابدأ ببناء قاعدة المعرفة لتقليل الاعتماد على الدعم البشري.</p> :
          filtered.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <button onClick={() => setExpand(expand === a.id ? null : a.id)} className="w-full p-3 text-right hover:bg-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="text-[13px] font-bold text-slate-900">{a.title}</h3>
                  <div className="text-[10px] text-slate-500 mt-0.5">{KB_CATEGORIES.find((c) => c.value === a.category)?.label || a.category}</div>
                </div>
                <span className="text-[10px] text-slate-400">{expand === a.id ? "▲" : "▼"}</span>
              </button>
              {expand === a.id && (
                <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3 text-[12px]">
                  {a.problem && <S t="المشكلة" b={a.problem} />}
                  {a.symptoms && <S t="الأعراض" b={a.symptoms} />}
                  {a.cause && <S t="السبب" b={a.cause} />}
                  {a.solution && <S t="الحل" b={a.solution} />}
                  {a.video_url && <div><div className="text-[11px] font-bold text-slate-700 mb-1">فيديو</div><a href={a.video_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{a.video_url}</a></div>}
                </div>
              )}
            </div>
          ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>مقال جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <F label="العنوان"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9 text-[12px]" /></F>
            <F label="التصنيف">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full h-9 px-2 rounded-md border border-slate-200 text-[12px] bg-white">
                {KB_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </F>
            <F label="المشكلة"><Textarea value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} rows={2} className="text-[12px]" /></F>
            <F label="الأعراض"><Textarea value={form.symptoms} onChange={(e) => setForm({ ...form, symptoms: e.target.value })} rows={2} className="text-[12px]" /></F>
            <F label="السبب"><Textarea value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })} rows={2} className="text-[12px]" /></F>
            <F label="الحل"><Textarea value={form.solution} onChange={(e) => setForm({ ...form, solution: e.target.value })} rows={4} className="text-[12px]" /></F>
            <F label="رابط الفيديو"><Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} className="h-9 text-[12px]" placeholder="https://" /></F>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function S({ t, b }: { t: string; b: string }) {
  return <div><div className="text-[11px] font-bold text-slate-700 mb-1">{t}</div><div className="text-slate-600 whitespace-pre-wrap">{b}</div></div>;
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">{label}</label>{children}</div>;
}