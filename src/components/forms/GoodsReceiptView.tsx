import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PackageCheck, AlertTriangle, StickyNote } from "lucide-react";

type Entry = {
  category: string;
  item: string;
  qty: string | number;
  unit?: string;
  expiry?: string;
  conformity?: string;
  temperature?: string;
  note?: string;
};

/** عرض للقراءة فقط لنموذج «استلام المواد الأولية» (schema.kind === "goods_receipt"). */
export default function GoodsReceiptView({ data }: { data: any }) {
  const entries: Entry[] = Array.isArray(data?.entries) ? data.entries : [];
  const nonConform = entries.filter((e) => e.conformity === "غير مطابق");

  const grouped: [string, Entry[]][] = [];
  const map = new Map<string, Entry[]>();
  entries.forEach((e) => {
    if (!map.has(e.category)) { map.set(e.category, []); grouped.push([e.category, map.get(e.category)!]); }
    map.get(e.category)!.push(e);
  });

  return (
    <div className="space-y-4" dir="rtl">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3 text-sm">
          <div><span className="text-muted-foreground">تاريخ الاستلام:</span> <b>{data?.receipt_date || "—"}</b></div>
          <div><span className="text-muted-foreground">المورد:</span> <b>{data?.supplier || "—"}</b></div>
          <div><span className="text-muted-foreground">المستلم:</span> <b>{data?.receiver || "—"}</b></div>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs">
            <PackageCheck className="h-3.5 w-3.5" /> أصناف مستلمة: <b>{entries.length}</b>
          </span>
          {nonConform.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10 text-red-600 text-xs">
              <AlertTriangle className="h-3.5 w-3.5" /> غير مطابق: <b>{nonConform.length}</b>
            </span>
          )}
        </CardContent>
      </Card>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد أصناف معبّأة.</p>
      ) : (
        grouped.map(([category, items]) => (
          <div key={category} className="border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-muted/40 font-semibold text-sm">{category}</div>
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-right p-2 font-medium">الصنف</th>
                  <th className="text-right p-2 font-medium w-[70px]">الكمية</th>
                  <th className="text-right p-2 font-medium w-[70px]">الوحدة</th>
                  <th className="text-right p-2 font-medium w-[150px]">الصلاحية / رقم الوجبة</th>
                  <th className="text-right p-2 font-medium w-[90px]">الحرارة</th>
                  <th className="text-right p-2 font-medium w-[100px]">المطابقة</th>
                  <th className="text-right p-2 font-medium">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e, i) => (
                  <tr key={`${category}-${i}`} className="border-b last:border-0">
                    <td className="p-2">{e.item}</td>
                    <td className="p-2 font-semibold tabular-nums">{e.qty || "—"}</td>
                    <td className="p-2">{e.unit || "—"}</td>
                    <td className="p-2">{e.expiry || "—"}</td>
                    <td className="p-2">{e.temperature ? `${e.temperature}°م` : "—"}</td>
                    <td className="p-2">
                      <Badge variant="outline" className={e.conformity === "غير مطابق" ? "text-red-600 border-red-300" : "text-emerald-600 border-emerald-300"}>
                        {e.conformity || "مطابق"}
                      </Badge>
                    </td>
                    <td className="p-2 text-muted-foreground">{e.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {data?.notes && (
        <div className="border rounded-lg p-3 text-sm flex gap-2">
          <StickyNote className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div><div className="text-xs text-muted-foreground mb-1">ملاحظات المستلم</div>{data.notes}</div>
        </div>
      )}
    </div>
  );
}
