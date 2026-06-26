import { useEffect, useMemo, useState } from "react";
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
import { Plus, Users, Calendar, FileText, CheckCircle2, XCircle, Banknote, PlayCircle, Lock } from "lucide-react";

type Emp = {
  id: string; code: string | null; full_name: string; phone: string | null; email: string | null;
  job_title: string | null; department_id: string | null; basic_salary: number; currency: string;
  status: string; employment_type: string; hire_date: string | null;
};
type Att = { id: string; employee_id: string; date: string; check_in: string | null; check_out: string | null; work_hours: number; status: string };
type Leave = { id: string; employee_id: string; leave_type: string; from_date: string; to_date: string; days: number; status: string; reason: string | null };
type Run = { id: string; period_year: number; period_month: number; status: string; total_gross: number; total_deductions: number; total_net: number };
type Line = { id: string; run_id: string; employee_id: string; basic: number; gross: number; advances_deducted: number; net: number };
type Adv = { id: string; employee_id: string; amount: number; amount_remaining: number; monthly_deduction: number; status: string; issue_date: string };

const LEAVE_KIND: Record<string,string> = { annual:"سنوية", sick:"مرضية", unpaid:"بدون راتب", emergency:"طارئة", other:"أخرى" };
const STATUS_TONE: Record<string,string> = {
  active:"bg-emerald-100 text-emerald-800", onleave:"bg-amber-100 text-amber-800", terminated:"bg-rose-100 text-rose-800",
  pending:"bg-amber-100 text-amber-800", approved:"bg-emerald-100 text-emerald-800", rejected:"bg-rose-100 text-rose-800",
  draft:"bg-slate-100 text-slate-800", posted:"bg-emerald-100 text-emerald-800",
};

export default function SpartaHRPage() {
  const { companyId, isAdmin } = useSpartaContext();
  const { user } = useAuth();
  const [tab, setTab] = useState("dashboard");
  const [emps, setEmps] = useState<Emp[]>([]);
  const [atts, setAtts] = useState<Att[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [advs, setAdvs] = useState<Adv[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<""|"emp"|"att"|"leave"|"adv"|"run">("");
  const [selectedRun, setSelectedRun] = useState<string|null>(null);

  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    const [e, a, l, r, ln, ad] = await Promise.all([
      (supabase as any).from("sparta_employees").select("*").eq("company_id", companyId).order("full_name"),
      (supabase as any).from("sparta_attendance").select("*").eq("company_id", companyId).order("date", { ascending: false }).limit(500),
      (supabase as any).from("sparta_leaves").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      (supabase as any).from("sparta_payroll_runs").select("*").eq("company_id", companyId).order("period_year", { ascending: false }).order("period_month", { ascending: false }),
      (supabase as any).from("sparta_payroll_lines").select("*").eq("company_id", companyId),
      (supabase as any).from("sparta_employee_advances").select("*").eq("company_id", companyId).order("issue_date", { ascending: false }),
    ]);
    setEmps(e.data||[]); setAtts(a.data||[]); setLeaves(l.data||[]); setRuns(r.data||[]); setLines(ln.data||[]); setAdvs(ad.data||[]);
    setLoading(false);
  };
  useEffect(() => { reload(); }, [companyId]);

  const empName = (id: string) => emps.find(x=>x.id===id)?.full_name || "—";
  const today = new Date().toISOString().slice(0,10);
  const presentToday = atts.filter(a=>a.date===today && a.status==="present").length;
  const pendingLeaves = leaves.filter(l=>l.status==="pending").length;
  const lastRun = runs[0];

  if (loading) return <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">الموارد البشرية</h1>
          <p className="text-sm text-muted-foreground">إدارة الموظفين والحضور والرواتب</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="dashboard">لوحة المتابعة</TabsTrigger>
          <TabsTrigger value="employees">الموظفون</TabsTrigger>
          <TabsTrigger value="attendance">الحضور</TabsTrigger>
          <TabsTrigger value="leaves">الإجازات</TabsTrigger>
          <TabsTrigger value="advances">السلف</TabsTrigger>
          <TabsTrigger value="payroll">الرواتب</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="عدد الموظفين" value={emps.filter(e=>e.status==="active").length} icon={<Users className="h-5 w-5"/>}/>
            <KPI label="حضور اليوم" value={presentToday} icon={<CheckCircle2 className="h-5 w-5"/>}/>
            <KPI label="إجازات معلقة" value={pendingLeaves} icon={<Calendar className="h-5 w-5"/>}/>
            <KPI label="صافي راتب آخر شهر" value={`${(lastRun?.total_net||0).toLocaleString()} ₪`} icon={<Banknote className="h-5 w-5"/>}/>
          </div>
        </TabsContent>

        <TabsContent value="employees" className="space-y-3">
          <div className="flex justify-between">
            <div className="text-sm text-muted-foreground">{emps.length} موظف</div>
            {isAdmin && <Button onClick={()=>setDlg("emp")}><Plus className="h-4 w-4 ms-1"/>موظف جديد</Button>}
          </div>
          <div className="bg-card rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr><th className="p-3 text-right">الاسم</th><th className="p-3 text-right">الوظيفة</th><th className="p-3 text-right">الراتب</th><th className="p-3 text-right">النوع</th><th className="p-3 text-right">الحالة</th><th className="p-3 text-right">هاتف</th></tr></thead>
              <tbody>
                {emps.map(e=>(
                  <tr key={e.id} className="border-t">
                    <td className="p-3">{e.full_name}{e.code?<span className="text-xs text-muted-foreground"> ({e.code})</span>:null}</td>
                    <td className="p-3">{e.job_title||"—"}</td>
                    <td className="p-3">{e.basic_salary.toLocaleString()} {e.currency}</td>
                    <td className="p-3 text-xs">{e.employment_type}</td>
                    <td className="p-3"><Badge className={STATUS_TONE[e.status]||""}>{e.status}</Badge></td>
                    <td className="p-3">{e.phone||"—"}</td>
                  </tr>
                ))}
                {emps.length===0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا يوجد موظفون</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-3">
          <div className="flex justify-between">
            <div className="text-sm text-muted-foreground">آخر {atts.length} سجل</div>
            {isAdmin && <Button onClick={()=>setDlg("att")}><Plus className="h-4 w-4 ms-1"/>تسجيل حضور</Button>}
          </div>
          <div className="bg-card rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">الموظف</th><th className="p-3 text-right">دخول</th><th className="p-3 text-right">خروج</th><th className="p-3 text-right">ساعات</th><th className="p-3 text-right">الحالة</th></tr></thead>
              <tbody>
                {atts.slice(0,200).map(a=>(
                  <tr key={a.id} className="border-t">
                    <td className="p-3">{a.date}</td><td className="p-3">{empName(a.employee_id)}</td>
                    <td className="p-3 text-xs">{a.check_in?new Date(a.check_in).toLocaleTimeString("ar"):""}</td>
                    <td className="p-3 text-xs">{a.check_out?new Date(a.check_out).toLocaleTimeString("ar"):""}</td>
                    <td className="p-3">{a.work_hours||0}</td>
                    <td className="p-3"><Badge variant="outline">{a.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="leaves" className="space-y-3">
          <div className="flex justify-between">
            <div className="text-sm text-muted-foreground">{leaves.length} طلب</div>
            <Button onClick={()=>setDlg("leave")}><Plus className="h-4 w-4 ms-1"/>طلب إجازة</Button>
          </div>
          <div className="bg-card rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr><th className="p-3 text-right">الموظف</th><th className="p-3 text-right">النوع</th><th className="p-3 text-right">من</th><th className="p-3 text-right">إلى</th><th className="p-3 text-right">أيام</th><th className="p-3 text-right">الحالة</th><th className="p-3"></th></tr></thead>
              <tbody>
                {leaves.map(l=>(
                  <tr key={l.id} className="border-t">
                    <td className="p-3">{empName(l.employee_id)}</td>
                    <td className="p-3">{LEAVE_KIND[l.leave_type]||l.leave_type}</td>
                    <td className="p-3">{l.from_date}</td><td className="p-3">{l.to_date}</td><td className="p-3">{l.days}</td>
                    <td className="p-3"><Badge className={STATUS_TONE[l.status]||""}>{l.status}</Badge></td>
                    <td className="p-3">
                      {l.status==="pending" && isAdmin && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={async()=>{await (supabase as any).from("sparta_leaves").update({status:"approved",approved_by:user?.id,approved_at:new Date().toISOString()}).eq("id",l.id); reload();}}><CheckCircle2 className="h-3.5 w-3.5"/></Button>
                          <Button size="sm" variant="outline" onClick={async()=>{await (supabase as any).from("sparta_leaves").update({status:"rejected"}).eq("id",l.id); reload();}}><XCircle className="h-3.5 w-3.5"/></Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="advances" className="space-y-3">
          <div className="flex justify-between">
            <div className="text-sm text-muted-foreground">{advs.length} سلفة</div>
            {isAdmin && <Button onClick={()=>setDlg("adv")}><Plus className="h-4 w-4 ms-1"/>سلفة جديدة</Button>}
          </div>
          <div className="bg-card rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">الموظف</th><th className="p-3 text-right">المبلغ</th><th className="p-3 text-right">المتبقي</th><th className="p-3 text-right">قسط شهري</th><th className="p-3 text-right">الحالة</th></tr></thead>
              <tbody>
                {advs.map(a=>(
                  <tr key={a.id} className="border-t">
                    <td className="p-3">{a.issue_date}</td><td className="p-3">{empName(a.employee_id)}</td>
                    <td className="p-3">{a.amount.toLocaleString()}</td>
                    <td className="p-3">{a.amount_remaining.toLocaleString()}</td>
                    <td className="p-3">{a.monthly_deduction.toLocaleString()}</td>
                    <td className="p-3"><Badge variant="outline">{a.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-3">
          {isAdmin && <Button onClick={()=>setDlg("run")}><PlayCircle className="h-4 w-4 ms-1"/>تشغيل راتب شهر</Button>}
          <div className="grid lg:grid-cols-2 gap-3">
            <div className="bg-card rounded-lg border">
              <div className="p-3 border-b font-semibold">التشغيلات</div>
              <table className="w-full text-sm">
                <thead className="bg-muted/30"><tr><th className="p-2 text-right">الفترة</th><th className="p-2 text-right">الحالة</th><th className="p-2 text-right">الصافي</th><th className="p-2"></th></tr></thead>
                <tbody>
                  {runs.map(r=>(
                    <tr key={r.id} className={`border-t cursor-pointer hover:bg-muted/30 ${selectedRun===r.id?"bg-muted/40":""}`} onClick={()=>setSelectedRun(r.id)}>
                      <td className="p-2">{r.period_year}/{String(r.period_month).padStart(2,"0")}</td>
                      <td className="p-2"><Badge className={STATUS_TONE[r.status]||""}>{r.status}</Badge></td>
                      <td className="p-2">{r.total_net.toLocaleString()} ₪</td>
                      <td className="p-2">
                        {r.status==="draft" && isAdmin && (
                          <Button size="sm" variant="outline" onClick={async(e)=>{e.stopPropagation(); const{error}=await (supabase as any).rpc("sparta_post_payroll",{p_run_id:r.id}); if(error)toast.error(error.message); else {toast.success("تم الترحيل"); reload();}}}><Lock className="h-3.5 w-3.5 ms-1"/>ترحيل</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {runs.length===0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">لا توجد تشغيلات</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="bg-card rounded-lg border">
              <div className="p-3 border-b font-semibold">سطور الراتب</div>
              <table className="w-full text-sm">
                <thead className="bg-muted/30"><tr><th className="p-2 text-right">الموظف</th><th className="p-2 text-right">أساسي</th><th className="p-2 text-right">سلف</th><th className="p-2 text-right">صافي</th></tr></thead>
                <tbody>
                  {selectedRun ? lines.filter(l=>l.run_id===selectedRun).map(l=>(
                    <tr key={l.id} className="border-t">
                      <td className="p-2">{empName(l.employee_id)}</td>
                      <td className="p-2">{l.basic.toLocaleString()}</td>
                      <td className="p-2">{l.advances_deducted.toLocaleString()}</td>
                      <td className="p-2 font-semibold">{l.net.toLocaleString()}</td>
                    </tr>
                  )) : <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">اختر تشغيلة</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {dlg==="emp" && <EmpDialog onClose={()=>{setDlg(""); reload();}} companyId={companyId!} userId={user?.id||null}/>}
      {dlg==="att" && <AttDialog onClose={()=>{setDlg(""); reload();}} companyId={companyId!} emps={emps}/>}
      {dlg==="leave" && <LeaveDialog onClose={()=>{setDlg(""); reload();}} companyId={companyId!} emps={emps} userId={user?.id||null}/>}
      {dlg==="adv" && <AdvDialog onClose={()=>{setDlg(""); reload();}} companyId={companyId!} emps={emps} userId={user?.id||null}/>}
      {dlg==="run" && <RunDialog onClose={()=>{setDlg(""); reload();}} />}
    </div>
  );
}

function KPI({label,value,icon}:{label:string;value:any;icon:React.ReactNode}) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="flex items-center justify-between text-muted-foreground text-xs mb-2">{label}{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function EmpDialog({onClose,companyId,userId}:{onClose:()=>void;companyId:string;userId:string|null}) {
  const [f,setF]=useState({full_name:"",code:"",job_title:"",phone:"",email:"",basic_salary:0,employment_type:"full",currency:"ILS",hire_date:new Date().toISOString().slice(0,10)});
  const save=async()=>{
    if(!f.full_name){toast.error("الاسم مطلوب");return;}
    const{error}=await (supabase as any).from("sparta_employees").insert({...f,company_id:companyId,created_by:userId});
    if(error)toast.error(error.message); else {toast.success("تم الحفظ"); onClose();}
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl"><DialogHeader><DialogTitle>موظف جديد</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>الاسم الكامل *</Label><Input value={f.full_name} onChange={e=>setF({...f,full_name:e.target.value})}/></div>
          <div><Label>الكود</Label><Input value={f.code} onChange={e=>setF({...f,code:e.target.value})}/></div>
          <div><Label>الوظيفة</Label><Input value={f.job_title} onChange={e=>setF({...f,job_title:e.target.value})}/></div>
          <div><Label>الهاتف</Label><Input value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/></div>
          <div><Label>البريد</Label><Input value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></div>
          <div><Label>تاريخ التعيين</Label><Input type="date" value={f.hire_date} onChange={e=>setF({...f,hire_date:e.target.value})}/></div>
          <div><Label>الراتب الأساسي</Label><Input type="number" value={f.basic_salary} onChange={e=>setF({...f,basic_salary:+e.target.value})}/></div>
          <div><Label>نوع التوظيف</Label>
            <Select value={f.employment_type} onValueChange={v=>setF({...f,employment_type:v})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="full">دوام كامل</SelectItem><SelectItem value="part">جزئي</SelectItem><SelectItem value="contract">عقد</SelectItem><SelectItem value="intern">تدريب</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save}>حفظ</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttDialog({onClose,companyId,emps}:{onClose:()=>void;companyId:string;emps:Emp[]}) {
  const [f,setF]=useState({employee_id:"",date:new Date().toISOString().slice(0,10),check_in:"",check_out:"",status:"present",notes:""});
  const save=async()=>{
    if(!f.employee_id){toast.error("اختر الموظف");return;}
    const ci=f.check_in?new Date(`${f.date}T${f.check_in}`).toISOString():null;
    const co=f.check_out?new Date(`${f.date}T${f.check_out}`).toISOString():null;
    const wh=ci&&co?Math.max(0,(new Date(co).getTime()-new Date(ci).getTime())/3600000):0;
    const{error}=await (supabase as any).from("sparta_attendance").upsert({company_id:companyId,employee_id:f.employee_id,date:f.date,check_in:ci,check_out:co,work_hours:+wh.toFixed(2),status:f.status,notes:f.notes},{onConflict:"employee_id,date"});
    if(error)toast.error(error.message); else {toast.success("تم الحفظ"); onClose();}
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl"><DialogHeader><DialogTitle>تسجيل حضور</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>الموظف</Label>
            <Select value={f.employee_id} onValueChange={v=>setF({...f,employee_id:v})}><SelectTrigger><SelectValue placeholder="اختر"/></SelectTrigger>
              <SelectContent>{emps.map(e=><SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label>التاريخ</Label><Input type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})}/></div>
          <div><Label>الحالة</Label>
            <Select value={f.status} onValueChange={v=>setF({...f,status:v})}><SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="present">حاضر</SelectItem><SelectItem value="absent">غائب</SelectItem><SelectItem value="leave">إجازة</SelectItem><SelectItem value="holiday">عطلة</SelectItem></SelectContent></Select>
          </div>
          <div><Label>دخول</Label><Input type="time" value={f.check_in} onChange={e=>setF({...f,check_in:e.target.value})}/></div>
          <div><Label>خروج</Label><Input type="time" value={f.check_out} onChange={e=>setF({...f,check_out:e.target.value})}/></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save}>حفظ</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeaveDialog({onClose,companyId,emps,userId}:{onClose:()=>void;companyId:string;emps:Emp[];userId:string|null}) {
  const [f,setF]=useState({employee_id:"",leave_type:"annual",from_date:"",to_date:"",reason:""});
  const days=useMemo(()=>{ if(!f.from_date||!f.to_date)return 0; const d=(new Date(f.to_date).getTime()-new Date(f.from_date).getTime())/86400000+1; return Math.max(d,0);},[f.from_date,f.to_date]);
  const save=async()=>{
    if(!f.employee_id||!f.from_date||!f.to_date){toast.error("املأ الحقول");return;}
    const{error}=await (supabase as any).from("sparta_leaves").insert({...f,company_id:companyId,days,created_by:userId});
    if(error)toast.error(error.message); else {toast.success("تم الحفظ"); onClose();}
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl"><DialogHeader><DialogTitle>طلب إجازة</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>الموظف</Label>
            <Select value={f.employee_id} onValueChange={v=>setF({...f,employee_id:v})}><SelectTrigger><SelectValue placeholder="اختر"/></SelectTrigger>
              <SelectContent>{emps.map(e=><SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label>النوع</Label>
            <Select value={f.leave_type} onValueChange={v=>setF({...f,leave_type:v})}><SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{Object.entries(LEAVE_KIND).map(([k,v])=><SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label>الأيام</Label><Input value={days} disabled/></div>
          <div><Label>من</Label><Input type="date" value={f.from_date} onChange={e=>setF({...f,from_date:e.target.value})}/></div>
          <div><Label>إلى</Label><Input type="date" value={f.to_date} onChange={e=>setF({...f,to_date:e.target.value})}/></div>
          <div className="col-span-2"><Label>السبب</Label><Textarea value={f.reason} onChange={e=>setF({...f,reason:e.target.value})}/></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save}>حفظ</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdvDialog({onClose,companyId,emps,userId}:{onClose:()=>void;companyId:string;emps:Emp[];userId:string|null}) {
  const [f,setF]=useState({employee_id:"",amount:0,installments_count:1,notes:""});
  const monthly=useMemo(()=>f.installments_count>0?+(f.amount/f.installments_count).toFixed(2):0,[f.amount,f.installments_count]);
  const save=async()=>{
    if(!f.employee_id||f.amount<=0){toast.error("اختر الموظف والمبلغ");return;}
    const{error}=await (supabase as any).from("sparta_employee_advances").insert({company_id:companyId,employee_id:f.employee_id,amount:f.amount,installments_count:f.installments_count,monthly_deduction:monthly,amount_remaining:f.amount,notes:f.notes,created_by:userId});
    if(error)toast.error(error.message); else {toast.success("تم الحفظ"); onClose();}
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl"><DialogHeader><DialogTitle>سلفة جديدة</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>الموظف</Label>
            <Select value={f.employee_id} onValueChange={v=>setF({...f,employee_id:v})}><SelectTrigger><SelectValue placeholder="اختر"/></SelectTrigger>
              <SelectContent>{emps.map(e=><SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label>المبلغ</Label><Input type="number" value={f.amount} onChange={e=>setF({...f,amount:+e.target.value})}/></div>
          <div><Label>عدد الأقساط</Label><Input type="number" min={1} value={f.installments_count} onChange={e=>setF({...f,installments_count:+e.target.value})}/></div>
          <div className="col-span-2 text-sm text-muted-foreground">القسط الشهري: {monthly}</div>
          <div className="col-span-2"><Label>ملاحظات</Label><Textarea value={f.notes} onChange={e=>setF({...f,notes:e.target.value})}/></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save}>حفظ</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunDialog({onClose}:{onClose:()=>void}) {
  const now=new Date();
  const [y,setY]=useState(now.getFullYear());
  const [m,setM]=useState(now.getMonth()+1);
  const [busy,setBusy]=useState(false);
  const run=async()=>{
    setBusy(true);
    const{error}=await (supabase as any).rpc("sparta_run_payroll",{p_year:y,p_month:m});
    setBusy(false);
    if(error)toast.error(error.message); else {toast.success("تم توليد الرواتب"); onClose();}
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl"><DialogHeader><DialogTitle>تشغيل راتب شهر</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>السنة</Label><Input type="number" value={y} onChange={e=>setY(+e.target.value)}/></div>
          <div><Label>الشهر</Label><Input type="number" min={1} max={12} value={m} onChange={e=>setM(+e.target.value)}/></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={run} disabled={busy}>{busy?"...":"تشغيل"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}