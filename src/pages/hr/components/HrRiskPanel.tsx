import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldAlert, ShieldX, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { HrEmployeeRow } from "@/hooks/hr/useHrCommandCenter";

interface Props {
  employees: HrEmployeeRow[];
}

const fmt = (v: number) =>
  new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

export function HrRiskPanel({ employees }: Props) {
  const navigate = useNavigate();
  const high = employees.filter((e) => e.riskLevel === "high").sort((a, b) => b.riskScore - a.riskScore);
  const medium = employees.filter((e) => e.riskLevel === "medium").sort((a, b) => b.riskScore - a.riskScore);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-right flex items-center justify-end gap-2">
          <ShieldAlert className="h-4 w-4 text-rose-600" />
          الموظفون في منطقة الخطر
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="high">
          <TabsList className="w-full justify-start mb-3">
            <TabsTrigger value="high" className="gap-2">
              <ShieldX className="h-3.5 w-3.5 text-rose-600" />
              عالي ({high.length})
            </TabsTrigger>
            <TabsTrigger value="medium" className="gap-2">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
              متوسط ({medium.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="high" className="mt-0">
            <RiskList list={high} navigate={navigate} tone="danger" />
          </TabsContent>
          <TabsContent value="medium" className="mt-0">
            <RiskList list={medium} navigate={navigate} tone="warning" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function RiskList({
  list,
  navigate,
  tone,
}: {
  list: HrEmployeeRow[];
  navigate: ReturnType<typeof useNavigate>;
  tone: "danger" | "warning";
}) {
  if (list.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        ✓ لا يوجد موظفون في هذا المستوى
      </p>
    );
  }

  const scoreCls = tone === "danger" ? "text-rose-600" : "text-amber-600";
  const scoreBg =
    tone === "danger"
      ? "bg-rose-500/10 border-rose-500/30"
      : "bg-amber-500/10 border-amber-500/30";

  return (
    <ul className="divide-y divide-border max-h-[360px] overflow-y-auto">
      {list.slice(0, 20).map((e) => (
        <li key={e.id}>
          <button
            onClick={() => navigate(`/hr/employee/${e.id}`)}
            className="w-full flex items-center justify-between gap-3 py-2.5 px-1 hover:bg-muted/40 transition-colors text-right"
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{e.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {e.topIssue || e.job_title || "—"}
              </p>
            </div>
            <Badge variant="outline" className={`${scoreBg} ${scoreCls} font-bold tabular-nums shrink-0`}>
              {e.riskScore}
            </Badge>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0 hidden sm:inline">
              ₪{fmt(e.monthlyCost)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
