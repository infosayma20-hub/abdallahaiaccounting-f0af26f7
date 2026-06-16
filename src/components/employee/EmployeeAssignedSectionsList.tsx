import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardList, Loader2, CheckCircle2, Play, Eye, ChevronDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import DynamicTemplateView from "@/components/employee/DynamicTemplateView";

interface Row {
  id: string;
  form_id: string;
  template_id: string | null;
  section_key: string;
  section_title: string;
  status: string;
  notes: string | null;
  created_at: string;
  assigned_by: string | null;
  employee_forms?: {
    title: string | null;
    form_data: any;
    form_templates?: { name: string; schema: any } | null;
  } | null;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: "جديد", cls: "bg-amber-100 text-amber-700 border-amber-300" },
  in_progress: { text: "قيد التنفيذ", cls: "bg-sky-100 text-sky-700 border-sky-300" },
  done: { text: "منجز", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" },
};

export default function EmployeeAssignedSectionsList({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("form_section_assignments" as any)
      .select("id, form_id, template_id, section_key, section_title, status, notes, created_at, assigned_by, employee_forms:form_id(title, form_data, form_templates:template_id(name, schema))")
      .eq("assignee_employee_id", employeeId)
      .order("created_at", { ascending: false });
    setRows(((data as unknown) as Row[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!employeeId) return;
    load();
    const ch = supabase
      .channel(`asn-${employeeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "form_section_assignments", filter: `assignee_employee_id=eq.${employeeId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const updateStatus = async (row: Row, status: "in_progress" | "done") => {
    setBusy(row.id);
    try {
      const { error } = await supabase
        .from("form_section_assignments" as any)
        .update({ status })
        .eq("id", row.id);
      if (error) throw error;
      toast({ title: status === "done" ? "تم وضع البند كمنجز ✅" : "بدأت التنفيذ" });
      load();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!rows.length) return null;

  // Build a section-only sub-schema/data for the assigned section to render via DynamicTemplateView
  const sectionSubview = (row: Row) => {
    const tpl = row.employee_forms?.form_templates;
    const fullSchema = tpl?.schema as any;
    const fullData = row.employee_forms?.form_data || {};
    const sec = (fullSchema?.sections || []).find((s: any) => s.key === row.section_key);
    if (!sec) return null;
    return {
      schema: { sections: [sec] } as any,
      data: { [row.section_key]: fullData[row.section_key] },
      title: tpl?.name ? `${tpl.name} — ${row.section_title}` : row.section_title,
    };
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold flex items-center gap-2 pt-1">
        <ClipboardList className="h-4 w-4 text-primary" />
        بنود مسندة لي ({rows.length})
      </h3>
      {rows.map((r) => {
        const st = STATUS_LABEL[r.status] || STATUS_LABEL.pending;
        const open = openId === r.id;
        const sub = sectionSubview(r);
        return (
          <Card key={r.id} className="border-primary/30 bg-card">
            <CardContent className="p-3 space-y-2">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : r.id)}
                className="w-full flex items-start justify-between gap-2 text-right"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold truncate">{r.section_title}</span>
                    <Badge variant="outline" className={`text-[10px] ${st.cls}`}>{st.text}</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {r.employee_forms?.form_templates?.name || r.employee_forms?.title || "نموذج"} • {format(new Date(r.created_at), "dd/MM/yyyy")}
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <div className="border-t pt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                  {sub ? (
                    <div className="rounded-md bg-muted/30 p-2 text-xs">
                      <DynamicTemplateView schema={sub.schema} data={sub.data} title={sub.title} />
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">لا تتوفر تفاصيل القسم.</p>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {r.status !== "in_progress" && r.status !== "done" && (
                      <Button size="sm" variant="secondary" className="h-7 gap-1 text-[11px]" disabled={busy === r.id} onClick={() => updateStatus(r, "in_progress")}>
                        <Play className="h-3 w-3" /> بدء التنفيذ
                      </Button>
                    )}
                    {r.status !== "done" && (
                      <Button size="sm" className="h-7 gap-1 text-[11px] bg-emerald-600 hover:bg-emerald-700" disabled={busy === r.id} onClick={() => updateStatus(r, "done")}>
                        <CheckCircle2 className="h-3 w-3" /> تم الإنجاز
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}