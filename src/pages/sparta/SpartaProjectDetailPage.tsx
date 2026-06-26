import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSpartaContext } from "@/hooks/sparta/useSpartaContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, ArrowRight, Clock, Receipt, ListChecks } from "lucide-react";

type Project = any;
type Task = { id:string; title:string; status:string; priority:string; assigned_to:string|null; due_date:string|null; progress_pct:number; estimated_hours:number; actual_hours:number };
type TS = { id:string; date:string; hours:number; employee_id:string; notes:string|null };
type Exp = { id:string; expense_date:string; category:string|null; description:string|null; amount:number; currency:string };
type Emp = { id:string; full_name:string };

const STATUSES = [
  { key:"todo", label:"للتنفيذ" },
  { key:"doing", label:"قيد التنفيذ" },
  { key:"review", label:"للمراجعة" },
  { key:"done", label:"منجزة" },
  { key:"blocked", label:"معلقة" },
];

export default function SpartaProjectDetailPage() {
  const { id } = useParams<{ id:string }>();
  const { companyId, isAdmin } = useSpartaContext();
  const { user } = useAuth();
  const [project, setProject] = useState<Project|null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timesheets, setTS] = useState<TS[]>([]);
  const [expenses, setExp] = useState<Exp[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [prof, setProf] = useState<{revenue:number;expenses:number;profit:number}>({revenue:0,expenses:0,profit:0});
  const [tab, setTab] = useState("overview");
  const [dlg, setDlg] = useState<""|"task"|"ts"|"exp">("");

  const reload = async () => {
    if (!id || !companyId) return;
    const [p, t, ts, ex, em, pr] = await Promise.all([
      (supabase as any).from("sparta_projects").select("*").eq("id", id).maybeSingle(),
      (supabase as any).from("sparta_project_tasks").select("*").eq("project_id", id).order("sort_order"),
      (supabase as any).from("sparta_project_timesheets").select("*").eq("project_id", id).order("date",{ascending:false}),
      (supabase as any).from("sparta_project_expenses").select("*").eq("project_id", id).order("expense_date",{ascending:false}),
      (supabase as any).from("sparta_employees").select("id,full_name").eq("company_id", companyId).order("full_name"),
      (supabase as any).rpc("sparta_project_profitability", { p_project_id: id }),
    ]);
    setProject(p.data); setTasks(t.data||[]); setTS(ts.data||[]); setExp(ex.data||[]); setEmps(em.data||[]);
    if (pr.data && pr.data[0]) setProf(pr.data[0]);
  };
  useEffect(() => { reload(); }, [id, companyId]);

  const empName = (id:string|null) => emps.find(e=>e.id===id)?.full_name || "—";
  const updateTaskStatus = async (taskId:string, status:string) => {
    await (supabase as any).from("sparta_project_tasks").update({status, progress_pct: status==="done"?100:undefined}).eq("id", taskId);
    reload();
  };

  if (!project) return <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/sparta/projects" className="text-sm text-primary inline-flex items-center gap-1 mb-2"><ArrowRight className="h-3 w-3"/>كل المشاريع</Link>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <div className="text-sm text-muted-foreground">{project.code} · <Badge variant="outline">{project.status}</Badge></div>
        </div>
        <div className="text-end">
          <div className="text-xs text-muted-foreground">الإنجاز</div>
          <div className="text-3xl font-bold">{project.progress_pct}%</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="الميزانية" value={`${(+project.budget).toLocaleString()} ${project.currency}`}/>
        <KPI label="الإيرادات" value={`${prof.revenue.toLocaleString()} ${project.currency}`}/>
        <KPI label="المصاريف" value={`${prof.expenses.toLocaleString()} ${project.currency}`}/>
        <KPI label="الربح" value={`${prof.profit.toLocaleString()} ${project.currency}`} accent={prof.profit>=0?"text-emerald-600":"text-rose-600"}/>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="tasks">المهام ({tasks.length})</TabsTrigger>
          <TabsTrigger value="timesheets">الساعات</TabsTrigger>
          <TabsTrigger value="expenses">المصاريف</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          <div className="bg-card rounded-lg border p-4">
            <div className="text-sm text-muted-foreground mb-1">الوصف</div>
            <div>{project.description||"—"}</div>
          </div>
          <div className="bg-card rounded-lg border p-4 grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">البدء: </span>{project.start_date||"—"}</div>
            <div><span className="text-muted-foreground">الانتهاء: </span>{project.end_date||"—"}</div>
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="space-y-3">
          <div className="flex justify-end"><Button onClick={()=>setDlg("task")}><Plus className="h-4 w-4 ms-1"/>مهمة</Button></div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {STATUSES.map(s=>(
              <div key={s.key} className="bg-muted/30 rounded-lg p-2 min-h-[200px]">
                <div className="font-semibold text-sm mb-2 px-1">{s.label} ({tasks.filter(t=>t.status===s.key).length})</div>
                <div className="space-y-2">
                  {tasks.filter(t=>t.status===s.key).map(t=>(
                    <div key={t.id} className="bg-card border rounded p-2 text-sm">
                      <div className="font-medium">{t.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">{empName(t.assigned_to)}{t.due_date?` · ${t.due_date}`:""}</div>
                      <div className="mt-2 flex gap-1 flex-wrap">
                        {STATUSES.filter(x=>x.key!==t.status).map(x=>(
                          <button key={x.key} className="text-[10px] px-1.5 py-0.5 bg-muted hover:bg-primary hover:text-primary-foreground rounded" onClick={()=>updateTaskStatus(t.id,x.key)}>→{x.label}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="timesheets" className="space-y-3">
          <div className="flex justify-end"><Button onClick={()=>setDlg("ts")}><Plus className="h-4 w-4 ms-1"/>تسجيل ساعات</Button></div>
          <div className="bg-card rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">الموظف</th><th className="p-3 text-right">الساعات</th><th className="p-3 text-right">ملاحظات</th></tr></thead>
              <tbody>
                {timesheets.map(t=>(
                  <tr key={t.id} className="border-t"><td className="p-3">{t.date}</td><td className="p-3">{empName(t.employee_id)}</td><td className="p-3">{t.hours}</td><td className="p-3">{t.notes||"—"}</td></tr>
                ))}
                {timesheets.length===0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground"><Clock className="h-8 w-8 mx-auto opacity-40"/></td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-3">
          <div className="flex justify-end"><Button onClick={()=>setDlg("exp")}><Plus className="h-4 w-4 ms-1"/>مصروف</Button></div>
          <div className="bg-card rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">التصنيف</th><th className="p-3 text-right">الوصف</th><th className="p-3 text-right">المبلغ</th></tr></thead>
              <tbody>
                {expenses.map(e=>(
                  <tr key={e.id} className="border-t"><td className="p-3">{e.expense_date}</td><td className="p-3">{e.category||"—"}</td><td className="p-3">{e.description||"—"}</td><td className="p-3">{e.amount.toLocaleString()} {e.currency}</td></tr>
                ))}
                {expenses.length===0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground"><Receipt className="h-8 w-8 mx-auto opacity-40"/></td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {dlg==="task" && <TaskDialog projectId={id!} companyId={companyId!} emps={emps} userId={user?.id||null} onClose={()=>{setDlg(""); reload();}}/>}
      {dlg==="ts" && <TSDialog projectId={id!} companyId={companyId!} emps={emps} userId={user?.id||null} tasks={tasks} onClose={()=>{setDlg(""); reload();}}/>}
      {dlg==="exp" && <ExpDialog projectId={id!} companyId={companyId!} userId={user?.id||null} currency={project.currency} onClose={()=>{setDlg(""); reload();}}/>}
    </div>
  );
}

function KPI({label,value,accent}:{label:string;value:any;accent?:string}) {
  return <div className="bg-card rounded-lg border p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-xl font-bold ${accent||""}`}>{value}</div></div>;
}

function TaskDialog({projectId,companyId,emps,userId,onClose}:{projectId:string;companyId:string;emps:Emp[];userId:string|null;onClose:()=>void}) {
  const [f,setF]=useState({title:"",assigned_to:"",due_date:"",priority:"normal",estimated_hours:0,description:""});
  const save=async()=>{
    if(!f.title){toast.error("العنوان مطلوب");return;}
    const payload:any={...f,project_id:projectId,company_id:companyId,created_by:userId};
    if(!payload.assigned_to)payload.assigned_to=null;
    if(!payload.due_date)payload.due_date=null;
    const{error}=await (supabase as any).from("sparta_project_tasks").insert(payload);
    if(error)toast.error(error.message); else {toast.success("تم"); onClose();}
  };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent dir="rtl"><DialogHeader><DialogTitle>مهمة جديدة</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>العنوان *</Label><Input value={f.title} onChange={e=>setF({...f,title:e.target.value})}/></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>المسؤول</Label>
            <Select value={f.assigned_to} onValueChange={v=>setF({...f,assigned_to:v})}><SelectTrigger><SelectValue placeholder="—"/></SelectTrigger>
              <SelectContent>{emps.map(e=><SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label>الأولوية</Label>
            <Select value={f.priority} onValueChange={v=>setF({...f,priority:v})}><SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="low">منخفض</SelectItem><SelectItem value="normal">عادي</SelectItem><SelectItem value="high">مرتفع</SelectItem><SelectItem value="urgent">عاجل</SelectItem></SelectContent></Select>
          </div>
          <div><Label>تاريخ الاستحقاق</Label><Input type="date" value={f.due_date} onChange={e=>setF({...f,due_date:e.target.value})}/></div>
          <div><Label>الساعات المقدرة</Label><Input type="number" value={f.estimated_hours} onChange={e=>setF({...f,estimated_hours:+e.target.value})}/></div>
        </div>
        <div><Label>الوصف</Label><Textarea value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save}>حفظ</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

function TSDialog({projectId,companyId,emps,tasks,userId,onClose}:{projectId:string;companyId:string;emps:Emp[];tasks:Task[];userId:string|null;onClose:()=>void}) {
  const [f,setF]=useState({task_id:"",employee_id:"",date:new Date().toISOString().slice(0,10),hours:1,notes:""});
  const save=async()=>{
    if(!f.employee_id||!f.hours){toast.error("الموظف والساعات مطلوبان");return;}
    const payload:any={...f,project_id:projectId,company_id:companyId,created_by:userId};
    if(!payload.task_id)payload.task_id=null;
    const{error}=await (supabase as any).from("sparta_project_timesheets").insert(payload);
    if(error)toast.error(error.message); else {toast.success("تم"); onClose();}
  };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent dir="rtl"><DialogHeader><DialogTitle>تسجيل ساعات</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>الموظف</Label>
          <Select value={f.employee_id} onValueChange={v=>setF({...f,employee_id:v})}><SelectTrigger><SelectValue placeholder="—"/></SelectTrigger>
            <SelectContent>{emps.map(e=><SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="col-span-2"><Label>المهمة (اختياري)</Label>
          <Select value={f.task_id} onValueChange={v=>setF({...f,task_id:v})}><SelectTrigger><SelectValue placeholder="—"/></SelectTrigger>
            <SelectContent>{tasks.map(t=><SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent></Select>
        </div>
        <div><Label>التاريخ</Label><Input type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})}/></div>
        <div><Label>الساعات</Label><Input type="number" step="0.25" value={f.hours} onChange={e=>setF({...f,hours:+e.target.value})}/></div>
        <div className="col-span-2"><Label>ملاحظات</Label><Textarea value={f.notes} onChange={e=>setF({...f,notes:e.target.value})}/></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save}>حفظ</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}

function ExpDialog({projectId,companyId,userId,currency,onClose}:{projectId:string;companyId:string;userId:string|null;currency:string;onClose:()=>void}) {
  const [f,setF]=useState({category:"",description:"",amount:0,currency:currency||"ILS",expense_date:new Date().toISOString().slice(0,10)});
  const save=async()=>{
    if(f.amount<=0){toast.error("المبلغ مطلوب");return;}
    const{error}=await (supabase as any).from("sparta_project_expenses").insert({...f,project_id:projectId,company_id:companyId,created_by:userId});
    if(error)toast.error(error.message); else {toast.success("تم"); onClose();}
  };
  return (
    <Dialog open onOpenChange={onClose}><DialogContent dir="rtl"><DialogHeader><DialogTitle>مصروف مشروع</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>التصنيف</Label><Input value={f.category} onChange={e=>setF({...f,category:e.target.value})}/></div>
        <div><Label>التاريخ</Label><Input type="date" value={f.expense_date} onChange={e=>setF({...f,expense_date:e.target.value})}/></div>
        <div><Label>المبلغ</Label><Input type="number" value={f.amount} onChange={e=>setF({...f,amount:+e.target.value})}/></div>
        <div><Label>العملة</Label><Input value={f.currency} onChange={e=>setF({...f,currency:e.target.value})}/></div>
        <div className="col-span-2"><Label>الوصف</Label><Textarea value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save}>حفظ</Button></DialogFooter>
    </DialogContent></Dialog>
  );
}