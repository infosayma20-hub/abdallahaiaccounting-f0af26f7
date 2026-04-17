import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { HrEmployeeRow } from "@/hooks/hr/useHrCommandCenter";

interface Props {
  employees: HrEmployeeRow[];
}

export function HrAttendanceToday({ employees }: Props) {
  const navigate = useNavigate();
  const present = employees.filter((e) => e.presentToday === "present" && e.is_active);
  const late = employees.filter((e) => e.presentToday === "late" && e.is_active);
  const absent = employees.filter((e) => e.presentToday === "absent" && e.is_active);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/hr-attendance")}
            className="text-xs text-primary hover:underline"
          >
            عرض التفاصيل ←
          </button>
          <CardTitle className="text-base text-right">حضور اليوم</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <SummaryCell
            label="حاضر"
            count={present.length}
            tone="positive"
            Icon={CheckCircle2}
          />
          <SummaryCell label="متأخر" count={late.length} tone="warning" Icon={Clock} />
          <SummaryCell label="غائب" count={absent.length} tone="danger" Icon={XCircle} />
        </div>

        <Tabs defaultValue="absent">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="absent">غياب ({absent.length})</TabsTrigger>
            <TabsTrigger value="late">تأخير ({late.length})</TabsTrigger>
            <TabsTrigger value="present">حضور ({present.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="absent" className="mt-3">
            <List list={absent} tone="danger" navigate={navigate} />
          </TabsContent>
          <TabsContent value="late" className="mt-3">
            <List list={late} tone="warning" navigate={navigate} />
          </TabsContent>
          <TabsContent value="present" className="mt-3">
            <List list={present} tone="positive" navigate={navigate} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function SummaryCell({
  label,
  count,
  tone,
  Icon,
}: {
  label: string;
  count: number;
  tone: "positive" | "warning" | "danger";
  Icon: typeof CheckCircle2;
}) {
  const cls = {
    positive: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    danger: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 text-center ${cls}`}>
      <Icon className="h-4 w-4 mx-auto mb-1 opacity-80" />
      <p className="text-2xl font-bold tabular-nums">{count}</p>
      <p className="text-[11px] opacity-80">{label}</p>
    </div>
  );
}

function List({
  list,
  tone,
  navigate,
}: {
  list: HrEmployeeRow[];
  tone: "positive" | "warning" | "danger";
  navigate: ReturnType<typeof useNavigate>;
}) {
  if (list.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-4">— لا يوجد —</p>;
  }
  const cls = {
    positive: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    warning: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    danger: "bg-rose-500/10 text-rose-700 border-rose-500/30",
  }[tone];
  const label = tone === "positive" ? "حاضر" : tone === "warning" ? "متأخر" : "غائب";
  return (
    <ul className="divide-y divide-border max-h-[280px] overflow-y-auto">
      {list.slice(0, 25).map((e) => (
        <li key={e.id}>
          <button
            onClick={() => navigate(`/hr/employee/${e.id}`)}
            className="w-full flex items-center justify-between gap-3 py-2 px-1 hover:bg-muted/40 transition-colors text-right"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{e.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {e.branch || e.department || "—"}
              </p>
            </div>
            <Badge variant="outline" className={`${cls} text-[10px] shrink-0`}>
              {label}
            </Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}
