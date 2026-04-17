import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";

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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">سجل الخصومات (90 يوم)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">لا توجد خصومات.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr className="text-right">
                    <th className="px-4 py-2 font-medium">التاريخ</th>
                    <th className="px-4 py-2 font-medium">النوع</th>
                    <th className="px-4 py-2 font-medium">الوصف</th>
                    <th className="px-4 py-2 font-medium">المبلغ</th>
                    <th className="px-4 py-2 font-medium">المصدر</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((d: any) => (
                    <tr key={d.id} className="border-t hover:bg-muted/30 text-right">
                      <td className="px-4 py-2 tabular-nums">{d.deduction_date}</td>
                      <td className="px-4 py-2">{d.deduction_type || "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground truncate max-w-xs">
                        {d.description || d.notes || "—"}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-rose-600 font-semibold">
                        ₪{fmt(d.amount)}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className="text-[10px]">
                          {d.source || d.source_type || "يدوي"}
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
    </div>
  );
}
