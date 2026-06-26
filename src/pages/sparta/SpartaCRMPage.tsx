import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSpartaContext } from "@/hooks/sparta/useSpartaContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Target, Sparkles, Calendar, Phone, Mail, ArrowRightLeft, CheckCircle2 } from "lucide-react";

type Lead = {
  id: string; name: string; company: string | null; phone: string | null;
  email: string | null; source: string | null; status: string; notes: string | null;
  converted_customer_id: string | null; created_at: string;
};
type Opp = {
  id: string; title: string; customer_id: string | null; expected_value: number;
  currency: string; probability: number; stage: string; expected_close_date: string | null;
  notes: string | null; created_at: string;
};
type Activity = {
  id: string; kind: string; subject: string; body: string | null;
  due_at: string | null; done_at: string | null; lead_id: string | null;
  opportunity_id: string | null; customer_id: string | null; created_at: string;
};

const LEAD_STATUS: Record<string, { label: string; tone: string }> = {
  new:        { label: "جديد",        tone: "bg-blue-100 text-blue-800" },
  contacted:  { label: "تم التواصل",  tone: "bg-amber-100 text-amber-800" },
  qualified:  { label: "مؤهل",        tone: "bg-violet-100 text-violet-800" },
  lost:       { label: "مفقود",       tone: "bg-rose-100 text-rose-800" },
  converted:  { label: "محوّل",        tone: "bg-emerald-100 text-emerald-800" },
};
const OPP_STAGE: Record<string, { label: string; tone: string }> = {
  prospect:    { label: "تمهيدية",   tone: "bg-slate-100 text-slate-800" },
  qualified:   { label: "مؤهّلة",     tone: "bg-blue-100 text-blue-800" },
  proposal:    { label: "عرض سعر",   tone: "bg-amber-100 text-amber-800" },
  negotiation: { label: "تفاوض",      tone: "bg-violet-100 text-violet-800" },
  won:         { label: "ربح",        tone: "bg-emerald-100 text-emerald-800" },
  lost:        { label: "خسارة",      tone: "bg-rose-100 text-rose-800" },
};
const KIND: Record<string, string> = {
  call: "مكالمة", meeting: "اجتماع", note: "ملاحظة",
  task: "مهمة", email: "بريد", visit: "زيارة",
};

export default function SpartaCRMPage() {
  const { companyId } = useSpartaContext();
  const [tab, setTab] = useState("leads");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [acts, setActs] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<"" | "lead" | "opp" | "act">("");

  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    const [l, o, a] = await Promise.all([
      (supabase as any).from("sparta_leads").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      (supabase as any).from("sparta_opportunities").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      (supabase as any).from("sparta_activities").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(200),
    ]);
    if (l.error) toast.error(l.error.message);
    if (o.error) toast.error(o.error.message);
    if (a.error) toast.error(a.error.message);
    setLeads((l.data as Lead[]) || []);
    setOpps((o.data as Opp[]) || []);
    setActs((a.data as Activity[]) || []);
    setLoading(false);
  };
  useEffect(() => { reload(); }, [companyId]);

  const summary = useMemo(() => ({
    newLeads: leads.filter((l) => l.status === "new").length,
    activeOpps: opps.filter((o) => !["won", "lost"].includes(o.stage)).length,
    pipelineValue: opps.filter((o) => !["lost"].includes(o.stage))
      .reduce((s, o) => s + Number(o.expected_value || 0) * (o.probability / 100), 0),
    overdueAct: acts.filter((a) => !a.done_at && a.due_at && new Date(a.due_at) < new Date()).length,
  }), [leads, opps, acts]);

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="h-6 w-6 text-primary" /> إدارة علاقات العملاء</h1>
          <p className="text-sm text-muted-foreground">عملاء محتملون، فرص بيعية وأنشطة متابعة</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="عملاء محتملون جدد" value={summary.newLeads} tone="text-blue-600" />
        <Kpi label="فرص نشطة" value={summary.activeOpps} tone="text-violet-600" />
        <Kpi label="قيمة الـ Pipeline المرجّحة" value={summary.pipelineValue.toLocaleString("ar-PS", { maximumFractionDigits: 0 })} suffix="₪" tone="text-emerald-600" />
        <Kpi label="أنشطة متأخرة" value={summary.overdueAct} tone="text-rose-600" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="leads">العملاء المحتملون ({leads.length})</TabsTrigger>
          <TabsTrigger value="opps">الفرص البيعية ({opps.length})</TabsTrigger>
          <TabsTrigger value="acts">سجل الأنشطة ({acts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button onClick={() => setDlg("lead")}><Plus className="h-4 w-4 ml-1" />عميل محتمل جديد</Button>
          </div>
          <div className="border rounded-lg overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-right p-3">الاسم</th>
                  <th className="text-right p-3">العيادة/الشركة</th>
                  <th className="text-right p-3">الاتصال</th>
                  <th className="text-right p-3">المصدر</th>
                  <th className="text-right p-3">الحالة</th>
                  <th className="text-right p-3">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">جاري التحميل…</td></tr>
                : leads.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا يوجد عملاء محتملون بعد</td></tr>
                : leads.map((l) => (
                  <tr key={l.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-medium">{l.name}</td>
                    <td className="p-3">{l.company || "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {l.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{l.phone}</div>}
                      {l.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{l.email}</div>}
                    </td>
                    <td className="p-3">{l.source || "—"}</td>
                    <td className="p-3"><Badge className={LEAD_STATUS[l.status]?.tone}>{LEAD_STATUS[l.status]?.label || l.status}</Badge></td>
                    <td className="p-3">
                      {l.status !== "converted" ? (
                        <Button size="sm" variant="outline" onClick={async () => {
                          const { data, error } = await (supabase as any).rpc("sparta_convert_lead", { p_lead_id: l.id, p_create_opportunity: true });
                          if (error) return toast.error(error.message);
                          toast.success("تم التحويل لعميل + فرصة بيعية");
                          reload();
                        }}><ArrowRightLeft className="h-3 w-3 ml-1" />تحويل</Button>
                      ) : <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />محوّل</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="opps" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button onClick={() => setDlg("opp")}><Plus className="h-4 w-4 ml-1" />فرصة بيعية</Button>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {opps.length === 0 && <div className="p-6 text-center text-muted-foreground col-span-full border rounded-lg bg-card">لا توجد فرص بيعية بعد</div>}
            {opps.map((o) => (
              <div key={o.id} className="border rounded-lg p-4 bg-card hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-semibold flex items-center gap-2"><Target className="h-4 w-4 text-primary" />{o.title}</div>
                  <Badge className={OPP_STAGE[o.stage]?.tone}>{OPP_STAGE[o.stage]?.label}</Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>القيمة المتوقعة: <span className="font-bold text-foreground">{Number(o.expected_value).toLocaleString("ar-PS")} {o.currency}</span></div>
                  <div>الاحتمالية: {o.probability}%</div>
                  {o.expected_close_date && <div className="flex items-center gap-1"><Calendar className="h-3 w-3" />الإغلاق المتوقع: {o.expected_close_date}</div>}
                  {o.notes && <div className="pt-1 border-t mt-2 text-foreground/80">{o.notes}</div>}
                </div>
                <div className="flex gap-2 mt-3">
                  <Select value={o.stage} onValueChange={async (v) => {
                    const { error } = await (supabase as any).from("sparta_opportunities").update({ stage: v, probability: v === "won" ? 100 : v === "lost" ? 0 : o.probability }).eq("id", o.id);
                    if (error) return toast.error(error.message);
                    reload();
                  }}>
                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(OPP_STAGE).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="acts" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button onClick={() => setDlg("act")}><Plus className="h-4 w-4 ml-1" />نشاط جديد</Button>
          </div>
          <div className="border rounded-lg overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-right p-3">النوع</th>
                  <th className="text-right p-3">الموضوع</th>
                  <th className="text-right p-3">الموعد</th>
                  <th className="text-right p-3">الحالة</th>
                  <th className="text-right p-3"></th>
                </tr>
              </thead>
              <tbody>
                {acts.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا يوجد سجل أنشطة</td></tr>
                : acts.map((a) => {
                  const overdue = !a.done_at && a.due_at && new Date(a.due_at) < new Date();
                  return (
                    <tr key={a.id} className="border-t hover:bg-muted/30">
                      <td className="p-3"><Badge variant="outline">{KIND[a.kind] || a.kind}</Badge></td>
                      <td className="p-3">{a.subject}{a.body && <div className="text-xs text-muted-foreground mt-1">{a.body}</div>}</td>
                      <td className="p-3 text-xs">{a.due_at ? new Date(a.due_at).toLocaleString("ar-PS") : "—"}</td>
                      <td className="p-3">
                        {a.done_at ? <Badge className="bg-emerald-100 text-emerald-800">منجز</Badge>
                          : overdue ? <Badge className="bg-rose-100 text-rose-800">متأخر</Badge>
                          : <Badge className="bg-blue-100 text-blue-800">معلّق</Badge>}
                      </td>
                      <td className="p-3">
                        {!a.done_at && <Button size="sm" variant="ghost" onClick={async () => {
                          const { error } = await (supabase as any).from("sparta_activities").update({ done_at: new Date().toISOString() }).eq("id", a.id);
                          if (error) return toast.error(error.message);
                          reload();
                        }}><CheckCircle2 className="h-4 w-4 text-emerald-600" /></Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {dlg === "lead" && <LeadDialog onClose={() => setDlg("")} onSaved={reload} />}
      {dlg === "opp" && <OppDialog onClose={() => setDlg("")} onSaved={reload} />}
      {dlg === "act" && <ActDialog onClose={() => setDlg("")} onSaved={reload} leads={leads} opps={opps} />}
    </div>
  );
}

function Kpi({ label, value, suffix, tone }: { label: string; value: number | string; suffix?: string; tone: string }) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-bold ${tone}`}>{value}{suffix ? ` ${suffix}` : ""}</div>
    </div>
  );
}

function LeadDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: "", company: "", phone: "", email: "", source: "", notes: "" });
  const save = async () => {
    if (!f.name.trim()) return toast.error("الاسم مطلوب");
    const { error } = await (supabase as any).from("sparta_leads").insert(f);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ"); onSaved(); onClose();
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>عميل محتمل جديد</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="الاسم *"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="العيادة/الشركة"><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الهاتف"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="البريد"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          </div>
          <Field label="المصدر"><Input value={f.source} placeholder="مثل: معرض، إحالة، فيسبوك" onChange={(e) => setF({ ...f, source: e.target.value })} /></Field>
          <Field label="ملاحظات"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save}>حفظ</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OppDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ title: "", expected_value: 0, currency: "ILS", probability: 30, stage: "prospect", expected_close_date: "", notes: "" });
  const save = async () => {
    if (!f.title.trim()) return toast.error("العنوان مطلوب");
    const payload: any = { ...f, expected_close_date: f.expected_close_date || null };
    const { error } = await (supabase as any).from("sparta_opportunities").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ"); onSaved(); onClose();
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>فرصة بيعية جديدة</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="العنوان *"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="القيمة المتوقعة"><Input type="number" value={f.expected_value} onChange={(e) => setF({ ...f, expected_value: Number(e.target.value) })} /></Field>
            <Field label="العملة">
              <Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ILS">شيكل</SelectItem>
                  <SelectItem value="USD">دولار</SelectItem>
                  <SelectItem value="JOD">دينار</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الاحتمالية %"><Input type="number" min={0} max={100} value={f.probability} onChange={(e) => setF({ ...f, probability: Number(e.target.value) })} /></Field>
            <Field label="المرحلة">
              <Select value={f.stage} onValueChange={(v) => setF({ ...f, stage: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prospect">تمهيدية</SelectItem>
                  <SelectItem value="qualified">مؤهّلة</SelectItem>
                  <SelectItem value="proposal">عرض سعر</SelectItem>
                  <SelectItem value="negotiation">تفاوض</SelectItem>
                  <SelectItem value="won">ربح</SelectItem>
                  <SelectItem value="lost">خسارة</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="تاريخ الإغلاق المتوقع"><Input type="date" value={f.expected_close_date} onChange={(e) => setF({ ...f, expected_close_date: e.target.value })} /></Field>
          <Field label="ملاحظات"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save}>حفظ</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActDialog({ onClose, onSaved, leads, opps }: { onClose: () => void; onSaved: () => void; leads: Lead[]; opps: Opp[] }) {
  const [f, setF] = useState({ kind: "call", subject: "", body: "", due_at: "", lead_id: "", opportunity_id: "" });
  const save = async () => {
    if (!f.subject.trim()) return toast.error("الموضوع مطلوب");
    const payload: any = {
      kind: f.kind, subject: f.subject, body: f.body || null,
      due_at: f.due_at ? new Date(f.due_at).toISOString() : null,
      lead_id: f.lead_id || null, opportunity_id: f.opportunity_id || null,
    };
    const { error } = await (supabase as any).from("sparta_activities").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ"); onSaved(); onClose();
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>نشاط جديد</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="النوع">
              <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="موعد الاستحقاق"><Input type="datetime-local" value={f.due_at} onChange={(e) => setF({ ...f, due_at: e.target.value })} /></Field>
          </div>
          <Field label="الموضوع *"><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <Field label="تفاصيل"><Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="مرتبط بعميل محتمل">
              <Select value={f.lead_id || "_none"} onValueChange={(v) => setF({ ...f, lead_id: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— لا شيء —</SelectItem>
                  {leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="مرتبط بفرصة بيعية">
              <Select value={f.opportunity_id || "_none"} onValueChange={(v) => setF({ ...f, opportunity_id: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— لا شيء —</SelectItem>
                  {opps.map((o) => <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={save}>حفظ</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}