import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ArrowRight,
  Building2,
  Calendar,
  Briefcase,
  Plus,
  Plane,
  HandCoins,
  Receipt,
  Wallet,
} from "lucide-react";
import type { RiskScoreResult } from "@/hooks/hr/useEmployeeRiskScore";
import type { CostEngineResult } from "@/hooks/hr/useEmployeeCostEngine";
import { EmployeeRiskBadge } from "./EmployeeRiskBadge";

interface Props {
  employee: any;
  cost: CostEngineResult;
  risk: RiskScoreResult;
  onQuickAction: (action: "leave" | "loan" | "deduction" | "salary") => void;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);

export function EmployeeHeader({ employee, cost, risk, onQuickAction }: Props) {
  const navigate = useNavigate();
  const displayName: string =
    employee?.full_name || employee?.name || "موظف";
  const initials =
    (displayName || "؟")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n: string) => n[0])
      .join("") || "؟";

  const status = employee?.status || (employee?.is_active === false ? "terminated" : "active");
  const isActive = status === "active" || employee?.is_active === true;

  return (
    <Card className="p-5 md:p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="text-muted-foreground hover:text-foreground gap-1.5"
        >
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Button>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Badge
            variant="outline"
            className={
              isActive
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                : "bg-muted text-muted-foreground"
            }
          >
            {isActive ? "نشط" : "موقوف"}
          </Badge>
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 gap-1">
            <Wallet className="h-3.5 w-3.5" />
            تكلفة شهرية: ₪{fmt(cost.totalCost)}
          </Badge>
          <EmployeeRiskBadge risk={risk} />
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
        <Avatar className="h-20 w-20 md:h-24 md:w-24 ring-2 ring-border shrink-0">
          <AvatarImage src={employee?.photo_url || employee?.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 space-y-2 text-right">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">
            {displayName}
          </h1>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground justify-end">
            {(employee?.job_title || employee?.position) && (
              <span className="flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" />
                {employee.job_title || employee.position}
              </span>
            )}
            {employee?.department && (
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                {employee.department}
              </span>
            )}
            {(employee?.hire_date || employee?.start_date) && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                تاريخ التعيين: {new Date(employee.hire_date || employee.start_date).toLocaleDateString("ar")}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 pt-5 border-t flex flex-wrap gap-2 justify-end">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onQuickAction("leave")}>
          <Plane className="h-3.5 w-3.5" />
          <Plus className="h-3 w-3" />
          إجازة
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onQuickAction("loan")}>
          <HandCoins className="h-3.5 w-3.5" />
          <Plus className="h-3 w-3" />
          قرض
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onQuickAction("deduction")}>
          <Receipt className="h-3.5 w-3.5" />
          <Plus className="h-3 w-3" />
          خصم
        </Button>
        <Button size="sm" variant="default" className="gap-1.5" onClick={() => onQuickAction("salary")}>
          <Wallet className="h-3.5 w-3.5" />
          تعديل راتب
        </Button>
      </div>
    </Card>
  );
}
