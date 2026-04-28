import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";
import { tFormType, tFormStatus, formStatusTone } from "@/lib/hrLabels";
import { HRTable, HRTHead, HRTH, HRTR, HRTD } from "../HRTable";

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
          <HRTable>
            <HRTHead>
              <HRTH>التاريخ</HRTH>
              <HRTH>نوع الطلب</HRTH>
              <HRTH>ملاحظات HR</HRTH>
              <HRTH>الحالة</HRTH>
            </HRTHead>
            <tbody>
              {forms.map((f: any) => (
                <HRTR key={f.id}>
                  <HRTD numeric>
                    {f.created_at ? new Date(f.created_at).toLocaleDateString("ar") : "—"}
                  </HRTD>
                  <HRTD>{tFormType(f.form_type)}</HRTD>
                  <HRTD className="text-muted-foreground truncate max-w-xs">
                    {f.review_notes || "—"}
                  </HRTD>
                  <HRTD>
                    <Badge variant="outline" className={formStatusTone(f.status)}>
                      {tFormStatus(f.status)}
                    </Badge>
                  </HRTD>
                </HRTR>
              ))}
            </tbody>
          </HRTable>
        )}
      </CardContent>
    </Card>
  );
}
