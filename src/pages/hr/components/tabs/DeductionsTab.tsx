import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";
import { HRTable, HRTHead, HRTH, HRTR, HRTD, HRMoney } from "../HRTable";
import { tDeductionType, tDeductionSource } from "@/lib/hrLabels";

interface Props {
  data: Employee360Data;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(v || 0));

export function DeductionsTab({ data }: Props) {
  const list = data.deductions.list || [];
  const posCount = list.filter((d: any) => d.source === "pos" || d.source_type === "pos").length;
  const manualCount = list.length - posCount;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-right">
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground mb-1">خصومات الشهر</p>
          <p className="text-xl font-bold tabular-nums text-rose-600">₪{fmt(data.deductions.monthTotal)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground mb-1">آخر 30 يوم</p>
          <p className="text-xl font-bold tabular-nums text-amber-600">₪{fmt(data.deductions.last30DaysTotal)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground mb-1">من نقطة البيع</p>
          <p className="text-xl font-bold tabular-nums">{posCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground mb-1">يدوية</p>
          <p className="text-xl font-bold tabular-nums">{manualCount}</p>
        </Card>
      </div>

      <Card dir="rtl" className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">سجل الخصومات (90 يوم)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">لا توجد خصومات.</p>
          ) : (
            <HRTable>
              <HRTHead>
                <HRTH>التاريخ</HRTH>
                <HRTH>النوع</HRTH>
                <HRTH>الوصف</HRTH>
                <HRTH>المبلغ</HRTH>
                <HRTH>المصدر</HRTH>
              </HRTHead>
              <tbody>
                {list.map((d: any) => (
                  <HRTR key={d.id}>
                    <HRTD numeric>{d.deduction_date}</HRTD>
                    <HRTD>{tDeductionType(d.deduction_type)}</HRTD>
                    <HRTD className="text-muted-foreground truncate max-w-xs">
                      {d.description || d.notes || "—"}
                    </HRTD>
                    <HRTD numeric className="text-rose-600 font-semibold">
                      <HRMoney value={d.amount} />
                    </HRTD>
                    <HRTD>
                      <Badge variant="outline" className="text-[10px]">
                        {tDeductionSource(d.source || d.source_type)}
                      </Badge>
                    </HRTD>
                  </HRTR>
                ))}
              </tbody>
            </HRTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
