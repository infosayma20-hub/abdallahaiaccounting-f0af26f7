import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";

interface Props {
  data: Employee360Data;
}

const STATUS_TONE: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  معتمد: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  "قيد المراجعة": "bg-amber-500/10 text-amber-600 border-amber-500/30",
  rejected: "bg-rose-500/10 text-rose-600 border-rose-500/30",
  مرفوض: "bg-rose-500/10 text-rose-600 border-rose-500/30",
};

export function FormsTab({ data }: Props) {
  const forms = data.forms || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-right">الطلبات والنماذج</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {forms.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">لا توجد طلبات.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr className="text-right">
                  <th className="px-4 py-2 font-medium">التاريخ</th>
                  <th className="px-4 py-2 font-medium">النوع</th>
                  <th className="px-4 py-2 font-medium">ملاحظات المراجعة</th>
                  <th className="px-4 py-2 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((f: any) => (
                  <tr key={f.id} className="border-t hover:bg-muted/30 text-right">
                    <td className="px-4 py-2 tabular-nums">
                      {f.created_at ? new Date(f.created_at).toLocaleDateString("ar") : "—"}
                    </td>
                    <td className="px-4 py-2">{f.form_type || "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground truncate max-w-xs">
                      {f.review_notes || "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className={STATUS_TONE[f.status] || ""}>
                        {f.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
