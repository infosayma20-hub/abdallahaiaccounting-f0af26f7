import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";
import { tFormType, tFormStatus, formStatusTone } from "@/lib/hrLabels";

interface Props {
  data: Employee360Data;
}

export function FormsTab({ data }: Props) {
  const forms = data.forms || [];

  return (
    <Card dir="rtl" className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-right">الطلبات والنماذج</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {forms.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">لا توجد طلبات.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" dir="rtl">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-3 py-3 text-right text-xs font-semibold">التاريخ</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold">نوع الطلب</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold">ملاحظات HR</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((f: any) => (
                  <tr key={f.id} className="border-t hover:bg-muted/30 text-right">
                    <td className="px-3 py-2 tabular-nums">
                      {f.created_at ? new Date(f.created_at).toLocaleDateString("ar") : "—"}
                    </td>
                    <td className="px-3 py-2">{tFormType(f.form_type)}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-xs">
                      {f.review_notes || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={formStatusTone(f.status)}>
                        {tFormStatus(f.status)}
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
