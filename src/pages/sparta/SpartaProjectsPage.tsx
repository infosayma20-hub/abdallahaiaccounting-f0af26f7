import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSpartaContext } from "@/hooks/sparta/useSpartaContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, FolderKanban, ArrowLeft } from "lucide-react";

type Project = { id:string; code:string|null; name:string; customer_id:string|null; status:string; budget:number; currency:string; progress_pct:number; start_date:string|null; end_date:string|null; };
type Customer = { id:string; name:string };

const STATUS_LABEL: Record<string,{label:string;tone:string}> = {
  planned:{label:"مخطط",tone:"bg-slate-100 text-slate-800"},
  active:{label:"نشط",tone:"bg-emerald-100 text-emerald-800"},
  onhold:{label:"متوقف",tone:"bg-amber-100 text-amber-800"},
  completed:{label:"مكتمل",tone:"bg-blue-100 text-blue-800"},
  cancelled:{label:"ملغى",tone:"bg-rose-100 text-rose-800"},
};

export default function SpartaProjectsPage() {
  const { companyId, isAdmin } = useSpartaContext();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState(false);

  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    const [p, c] = await Promise.all([
      (supabase as any).from("sparta_projects").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      (supabase as any).from("sparta_customers").select("id,name").eq("company_id", companyId).order("name"),
    ]);
    setProjects(p.data || []); setCustomers(c.data || []);
    setLoading(false);
  };
  useEffect(() => { reload(); }, [companyId]);

  const stats = {
    active: projects.filter(p=>p.status==="active").length,
    completed: projects.filter(p=>p.status==="completed").length,
    total_budget: projects.reduce((s,p)=>s+(+p.budget||0),0),
    avg_progress: projects.length ? Math.round(projects.reduce((s,p)=>s+(+p.progress_pct||0),0)/projects.length) : 0,
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">المشاريع</h1><p className="text-sm text-muted-foreground">إدارة مشاريع الشركة</p></div>
        {isAdmin && <Button onClick={()=>setDlg(true)}><Plus className="h-4 w-4 ms-1"/>مشروع جديد</Button>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-lg border p-4"><div className="text-xs text-muted-foreground">مشاريع نشطة</div><div className="text-2xl font-bold">{stats.active}</div></div>
        <div className="bg-card rounded-lg border p-4"><div className="text-xs text-muted-foreground">مشاريع مكتملة</div><div className="text-2xl font-bold">{stats.completed}</div></div>
        <div className="bg-card rounded-lg border p-4"><div className="text-xs text-muted-foreground">إجمالي الميزانية</div><div className="text-xl font-bold">{stats.total_budget.toLocaleString()} ₪</div></div>
        <div className="bg-card rounded-lg border p-4"><div className="text-xs text-muted-foreground">متوسط الإنجاز</div><div className="text-2xl font-bold">{stats.avg_progress}%</div></div>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr><th className="p-3 text-right">المشروع</th><th className="p-3 text-right">العميل</th><th className="p-3 text-right">الحالة</th><th className="p-3 text-right">الإنجاز</th><th className="p-3 text-right">الميزانية</th><th className="p-3 text-right">البدء</th><th className="p-3"></th></tr></thead>
          <tbody>
            {projects.map(p=>(
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="p-3"><div className="font-medium">{p.name}</div>{p.code&&<div className="text-xs text-muted-foreground">{p.code}</div>}</td>
                <td className="p-3">{customers.find(c=>c.id===p.customer_id)?.name||"—"}</td>
                <td className="p-3"><Badge className={STATUS_LABEL[p.status]?.tone||""}>{STATUS_LABEL[p.status]?.label||p.status}</Badge></td>
                <td className="p-3"><div className="flex items-center gap-2"><div className="h-2 w-24 bg-muted rounded"><div className="h-2 bg-primary rounded" style={{width:`${p.progress_pct}%`}}/></div><span className="text-xs">{p.progress_pct}%</span></div></td>
                <td className="p-3">{(+p.budget).toLocaleString()} {p.currency}</td>
                <td className="p-3 text-xs">{p.start_date||"—"}</td>
                <td className="p-3"><Link to={`/sparta/projects/${p.id}`} className="text-primary hover:underline text-sm inline-flex items-center gap-1">فتح <ArrowLeft className="h-3 w-3"/></Link></td>
              </tr>
            ))}
            {projects.length===0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground"><FolderKanban className="h-10 w-10 mx-auto mb-2 opacity-40"/>لا توجد مشاريع</td></tr>}
          </tbody>
        </table>
      </div>

      {dlg && <ProjectDialog onClose={()=>{setDlg(false); reload();}} companyId={companyId!} customers={customers} userId={user?.id||null}/>}
    </div>
  );
}

function ProjectDialog({onClose,companyId,customers,userId}:{onClose:()=>void;companyId:string;customers:Customer[];userId:string|null}) {
  const [f,setF]=useState({name:"",code:"",customer_id:"",status:"planned",budget:0,currency:"ILS",start_date:new Date().toISOString().slice(0,10),end_date:"",description:""});
  const save=async()=>{
    if(!f.name){toast.error("الاسم مطلوب");return;}
    const payload:any={...f,company_id:companyId,created_by:userId};
    if(!payload.customer_id) payload.customer_id=null;
    if(!payload.end_date) payload.end_date=null;
    const{error}=await (supabase as any).from("sparta_projects").insert(payload);
    if(error)toast.error(error.message); else {toast.success("تم إنشاء المشروع"); onClose();}
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl"><DialogHeader><DialogTitle>مشروع جديد</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>اسم المشروع *</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></div>
          <div><Label>الكود</Label><Input value={f.code} onChange={e=>setF({...f,code:e.target.value})}/></div>
          <div><Label>الحالة</Label>
            <Select value={f.status} onValueChange={v=>setF({...f,status:v})}><SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="planned">مخطط</SelectItem><SelectItem value="active">نشط</SelectItem><SelectItem value="onhold">متوقف</SelectItem></SelectContent></Select>
          </div>
          <div className="col-span-2"><Label>العميل</Label>
            <Select value={f.customer_id} onValueChange={v=>setF({...f,customer_id:v})}><SelectTrigger><SelectValue placeholder="—"/></SelectTrigger>
              <SelectContent>{customers.map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label>الميزانية</Label><Input type="number" value={f.budget} onChange={e=>setF({...f,budget:+e.target.value})}/></div>
          <div><Label>العملة</Label><Input value={f.currency} onChange={e=>setF({...f,currency:e.target.value})}/></div>
          <div><Label>تاريخ البدء</Label><Input type="date" value={f.start_date} onChange={e=>setF({...f,start_date:e.target.value})}/></div>
          <div><Label>تاريخ الانتهاء</Label><Input type="date" value={f.end_date} onChange={e=>setF({...f,end_date:e.target.value})}/></div>
          <div className="col-span-2"><Label>الوصف</Label><Textarea value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save}>حفظ</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}