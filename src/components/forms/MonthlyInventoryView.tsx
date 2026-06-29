import { Card, CardContent } from "@/components/ui/card";
import { Package } from "lucide-react";

type Line = { category: string; item: string; unit: string; qty: number };
type CatSummary = { category: string; qty: number; filled: number; total: number };

interface Props {
  data: any;
}

export default function MonthlyInventoryView({ data }: Props) {
  const lines: Line[] = Array.isArray(data?.lines) ? data.lines : [];
  const branchName: string = data?.branch_name || "";
  const month: string = data?.month || "";
  const totalQty: number = data?.summary?.qty || lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const byCategory: CatSummary[] = Array.isArray(data?.summary?.byCategory)
    ? data.summary.byCategory
    : [];

  // Group lines by category (preserve order of appearance)
  const grouped: [string, Line[]][] = [];
  const map = new Map<string, Line[]>();
  lines.forEach((l) => {
    if (!map.has(l.category)) {
      map.set(l.category, []);
      grouped.push([l.category, map.get(l.category)!]);
    }
    map.get(l.category)!.push(l);
  });

  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3 text-sm">
          <div><span className="text-muted-foreground">الفرع:</span> <b>{branchName || "—"}</b></div>
          <div><span className="text-muted-foreground">الشهر:</span> <b>{month || "—"}</b></div>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs mr-auto">
            <Package className="h-3.5 w-3.5" />
            مجموع الكميات: <b>{totalQty}</b>
          </span>
        </CardContent>
      </Card>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد كميات معبّأة.</p>
      ) : (
        <div className="space-y-3">
          {grouped.map(([category, items]) => {
            const s = byCategory.find((x) => x.category === category);
            const catTotal = s?.qty ?? items.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
            return (
              <div key={category} className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 flex items-center justify-between">
                  <span className="font-semibold text-sm">{category}</span>
                  <span className="text-[11px] text-muted-foreground">
                    أصناف: {items.length} · مجموع الكمية {catTotal}
                  </span>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="text-right p-2 font-medium">الصنف</th>
                      <th className="text-right p-2 font-medium w-[35%]">الوحدة</th>
                      <th className="text-right p-2 font-medium w-[110px]">الكمية</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((l, idx) => (
                      <tr key={`${category}-${idx}`} className="border-b last:border-0">
                        <td className="p-2 align-middle">{l.item}</td>
                        <td className="p-2 align-middle text-muted-foreground">{l.unit}</td>
                        <td className="p-2 align-middle font-semibold">{l.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}