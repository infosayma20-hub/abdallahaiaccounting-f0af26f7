import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Loader2, Users, Eye, PenLine, FileText, Package } from "lucide-react";
import { useFormCatalog, type FormRef } from "@/hooks/hr/useFormAudience";
import FormAudienceDialog from "./FormAudienceDialog";
import { BUILTIN_FORMS } from "@/lib/hr/builtinForms";

const MANAGER_ONLY_KEYS = new Set(BUILTIN_FORMS.filter((f) => f.managerOnly).map((f) => f.key));

/**
 * توزيع النماذج على الموظفين — انطلاقاً من النموذج نفسه.
 * لكل نموذج: عدد من يعبّئه وعدد من يطّلع عليه + زر لإدارة الجمهور.
 */
export default function FormDistributionTab() {
  const { rows, loading, refresh } = useFormCatalog();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "builtin" | "template">("all");
  const [active, setActive] = useState<FormRef | null>(null);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (!needle) return true;
      return r.name?.toLowerCase().includes(needle) || (r.category || "").toLowerCase().includes(needle);
    });
  }, [rows, q, kind]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن نموذج..." className="pr-9" />
          </div>
          <div className="flex gap-1.5">
            {([["all", "الكل"], ["builtin", "نماذج مدمجة"], ["template", "قوالب"]] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setKind(k as any)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  kind === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-14 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin ml-2" /> جاري التحميل...
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-14">لا توجد نماذج مطابقة.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {visible.map((r) => (
            <Card key={`${r.kind}-${r.form_key ?? r.template_id}`} className="overflow-hidden">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
                  {r.kind === "builtin" ? (
                    <Package className="h-5 w-5 text-primary" />
                  ) : (
                    <FileText className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <PenLine className="h-3 w-3" /> {r.fill_count}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <Eye className="h-3 w-3" /> {r.view_count}
                    </Badge>
                    {r.fill_is_default && (
                      <Badge variant="outline" className="text-[10px]">متاح للجميع</Badge>
                    )}
                    {!r.is_active && <Badge variant="outline" className="text-[10px]">موقوف</Badge>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() =>
                    setActive({
                      kind: r.kind,
                      form_key: r.form_key,
                      manager_only:
                        r.kind === "builtin" &&
                        !!r.form_key &&
                        MANAGER_ONLY_KEYS.has(r.form_key),
                      template_id: r.template_id,
                      name: r.name,
                    })
                  }
                >
                  <Users className="h-4 w-4 ml-1" /> إدارة الجمهور
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <FormAudienceDialog
        form={active}
        open={!!active}
        onOpenChange={(o) => !o && setActive(null)}
        onSaved={refresh}
      />
    </div>
  );
}
