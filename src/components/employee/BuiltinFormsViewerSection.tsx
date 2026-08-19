import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BUILTIN_FORMS } from "@/lib/hr/builtinForms";
import { INVENTORY_BALANCE_LABELS } from "@/lib/hr/inventoryBalanceItems";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Eye, Loader2 } from "lucide-react";

const GENERIC_LABELS: Record<string, string> = {
  employee_name: "اسم الموظف",
  branch: "الفرع",
  shift: "الشفت",
  department: "القسم",
  notes: "ملاحظات",
  reason: "السبب",
  date: "التاريخ",
  attachment_url: "مرفق",
  ...INVENTORY_BALANCE_LABELS,
};

const fieldLabel = (k: string) => GENERIC_LABELS[k] || k;

/**
 * قسم «نماذج للاطلاع»: يعرض النماذج المدمجة التي عبّأها موظفون آخرون
 * (مثل رصيد الأصناف اليومي من مدراء الفروع) للموظف الذي مُنح صلاحية الاطلاع.
 * الحماية فعلية على مستوى قاعدة البيانات (RLS) وليست إخفاء واجهة فقط.
 */
export default function BuiltinFormsViewerSection({
  viewKeys,
  selfEmployeeId,
}: {
  viewKeys: string[];
  selfEmployeeId: string;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<any | null>(null);
  const [filterKey, setFilterKey] = useState<string>(viewKeys[0] || "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (viewKeys.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from("employee_forms")
        .select("id, form_type, form_data, status, created_at, employee_id")
        .in("form_type", viewKeys)
        .neq("employee_id", selfEmployeeId)
        .order("created_at", { ascending: false })
        .limit(100);
      const list = data || [];
      const ids = Array.from(new Set(list.map((r: any) => r.employee_id).filter(Boolean)));
      let nameMap: Record<string, string> = {};
      if (ids.length) {
        const { data: emps } = await supabase.from("employees").select("id, full_name").in("id", ids);
        nameMap = Object.fromEntries((emps || []).map((e: any) => [e.id, e.full_name]));
      }
      if (!cancelled) {
        setRows(list);
        setNames(nameMap);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [viewKeys.join(","), selfEmployeeId]);

  if (viewKeys.length === 0) return null;

  const formName = (key: string) => BUILTIN_FORMS.find(f => f.key === key)?.name || key;
  const visible = rows.filter(r => !filterKey || r.form_type === filterKey);

  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground mb-2">نماذج للاطلاع</h3>

      {viewKeys.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-2">
          {viewKeys.map(k => (
            <button
              key={k}
              onClick={() => setFilterKey(k)}
              className={`px-3 py-1.5 rounded-full text-xs border ${filterKey === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >
              {formName(k)}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري التحميل...
        </div>
      ) : visible.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-2xl">
          لا توجد نماذج معبّأة بعد.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(r => (
            <button
              key={r.id}
              onClick={() => setActive(r)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-border hover:bg-muted/50 active:scale-[0.99] transition-all text-right"
            >
              <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
                <Eye className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {names[r.employee_id] || "موظف"}
                  {r.form_data?.branch ? ` — ${r.form_data.branch}` : ""}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {formName(r.form_type)} · {new Date(r.created_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
                </div>
              </div>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!active} onOpenChange={o => !o && setActive(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {active ? formName(active.form_type) : ""}
            </DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[10px]">
                  {names[active.employee_id] || "موظف"}
                </Badge>
                <span>{new Date(active.created_at).toLocaleString("ar-EG")}</span>
              </div>
              <div className="border rounded-xl divide-y">
                {Object.entries(active.form_data || {}).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 p-2.5">
                    <span className="text-xs text-muted-foreground">{fieldLabel(k)}</span>
                    <span className="text-sm font-medium break-all">
                      {typeof v === "string" && v.startsWith("http") ? (
                        <a href={v} target="_blank" rel="noreferrer" className="text-primary underline">
                          فتح المرفق
                        </a>
                      ) : (
                        String(v ?? "")
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
