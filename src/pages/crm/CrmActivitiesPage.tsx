import { useMemo, useState } from "react";
import { Plus, CheckCircle2, Clock, AlertCircle, Phone, MessageCircle } from "lucide-react";
import { useCrmActivities } from "./hooks/useCrmData";
import { ACTIVITY_META, PRIORITY_META, type CrmActivity } from "./types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";
import { fmtDateDisplay } from "@/lib/utils";

const today = () => new Date().toISOString().split("T")[0];

export default function CrmActivitiesPage() {
  const { user } = useAuth();
  const { activities, loading, refetch } = useCrmActivities();
  const [filter, setFilter] = useState<"today" | "overdue" | "upcoming" | "completed" | "all">("today");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", activity_type: "call" as any, due_date: today(),
    priority: "medium" as any, description: "",
  });

  const filtered = useMemo(() => {
    const t = today();
    switch (filter) {
      case "today":     return activities.filter(a => a.status === "pending" && a.due_date === t);
      case "overdue":   return activities.filter(a => a.status === "pending" && a.due_date && a.due_date < t);
      case "upcoming":  return activities.filter(a => a.status === "pending" && a.due_date && a.due_date > t);
      case "completed": return activities.filter(a => a.status === "completed");
      default:          return activities;
    }
  }, [activities, filter]);

  const counts = useMemo(() => {
    const t = today();
    return {
      today: activities.filter(a => a.status === "pending" && a.due_date === t).length,
      overdue: activities.filter(a => a.status === "pending" && a.due_date && a.due_date < t).length,
      upcoming: activities.filter(a => a.status === "pending" && a.due_date && a.due_date > t).length,
      completed: activities.filter(a => a.status === "completed").length,
      all: activities.length,
    };
  }, [activities]);

  const complete = async (a: CrmActivity) => {
    const { error } = await supabase.from("crm_activities").update({
      status: "completed", completed_at: new Date().toISOString(),
    }).eq("id", a.id);
    if (error) { toast.error("تعذر التحديث"); return; }
    toast.success("تم إنجاز المتابعة");
    refetch();
  };

  const save = async () => {
    if (!user || !form.title.trim()) { toast.error("العنوان مطلوب"); return; }
    const { error } = await supabase.from("crm_activities").insert({
      ...form, user_id: dataOwnerId!, due_date: form.due_date || null,
    } as any);
    if (error) { toast.error("تعذر الحفظ"); return; }
    toast.success("تم إنشاء المتابعة");
    setDialogOpen(false);
    setForm({ title: "", activity_type: "call", due_date: today(), priority: "medium", description: "" });
    refetch();
  };

  const fld = "h-9 w-full rounded-md border border-slate-200 px-3 text-[13px] focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none bg-white";
  const lbl = "block text-[11px] font-semibold text-slate-700 mb-1";

  const tabs: Array<[string, typeof filter, number, string]> = [
    ["اليوم", "today", counts.today, "#0369A1"],
    ["متأخرة", "overdue", counts.overdue, "#B91C1C"],
    ["قادمة", "upcoming", counts.upcoming, "#7C3AED"],
    ["مكتملة", "completed", counts.completed, "#15803D"],
    ["الكل", "all", counts.all, "#475569"],
  ];

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 overflow-x-auto bg-white rounded-xl p-1.5 border border-slate-200">
          {tabs.map(([label, value, count, color]) => {
            const active = filter === value;
            return (
              <button key={value} onClick={() => setFilter(value)}
                className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap transition ${active ? "text-white" : "text-slate-600 hover:bg-slate-100"}`}
                style={active ? { background: color } : {}}
              >
                {label}
                <span className={`mr-1.5 px-1.5 py-0.5 rounded-md text-[10px] ${active ? "bg-black/20" : "bg-slate-100 text-slate-500"}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <button onClick={() => setDialogOpen(true)}
          className="h-9 px-4 rounded-lg bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 transition flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> متابعة جديدة
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <div className="text-4xl mb-2">📋</div>
          <h3 className="text-sm font-bold text-slate-700">لا توجد متابعات في هذا التصنيف</h3>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {filtered.map((a, i) => {
            const meta = ACTIVITY_META[a.activity_type];
            const t = today();
            const isOverdue = a.status === "pending" && a.due_date && a.due_date < t;
            return (
              <div key={a.id} className={`flex items-center gap-3 p-3.5 ${i > 0 ? "border-t border-slate-100" : ""} hover:bg-slate-50 transition`}>
                <div className="text-2xl">{meta.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: meta.color + "15", color: meta.color }}>
                      {meta.label}
                    </span>
                    {a.priority !== "medium" && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ background: PRIORITY_META[a.priority].bg, color: PRIORITY_META[a.priority].color }}>
                        {PRIORITY_META[a.priority].label}
                      </span>
                    )}
                    {isOverdue && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 flex items-center gap-1">
                        <AlertCircle className="h-2.5 w-2.5" /> متأخرة
                      </span>
                    )}
                  </div>
                  <h4 className="text-[13px] font-bold text-slate-900 truncate">{a.title}</h4>
                  {a.description && <p className="text-[11px] text-slate-500 truncate mt-0.5">{a.description}</p>}
                </div>
                <div className="text-left text-[11px]">
                  {a.due_date && (
                    <div className={`flex items-center gap-1 ${isOverdue ? "text-red-600 font-bold" : "text-slate-600"}`}>
                      <Clock className="h-3 w-3" /> {fmtDateDisplay(a.due_date)}
                    </div>
                  )}
                  {a.completed_at && (
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-3 w-3" /> {fmtDateDisplay(a.completed_at)}
                    </div>
                  )}
                </div>
                {a.status === "pending" && (
                  <button onClick={() => complete(a)}
                    className="h-8 px-3 rounded-md bg-green-50 border border-green-200 text-green-700 text-[11px] font-semibold hover:bg-green-100 transition">
                    إنجاز ✓
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle className="text-right text-base">متابعة جديدة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className={lbl}>عنوان المتابعة *</label>
              <input className={fld} value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="مثال: اتصال متابعة مع عميل الهلال" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>النوع</label>
                <select className={fld} value={form.activity_type} onChange={(e) => setForm(p => ({ ...p, activity_type: e.target.value as any }))}>
                  {Object.entries(ACTIVITY_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>الأولوية</label>
                <select className={fld} value={form.priority} onChange={(e) => setForm(p => ({ ...p, priority: e.target.value as any }))}>
                  {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className={lbl}>تاريخ الاستحقاق</label>
                <input type="date" className={fld} value={form.due_date} onChange={(e) => setForm(p => ({ ...p, due_date: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className={lbl}>تفاصيل</label>
                <textarea className={`${fld} h-16 py-2 resize-none`} value={form.description}
                  onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={save}>إنشاء</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
