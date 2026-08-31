import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Calendar,
  Briefcase,
  Wallet,
  ShieldCheck,
  User as UserIcon,
  UserRound,
} from "lucide-react";
import type { RiskScoreResult } from "@/hooks/hr/useEmployeeRiskScore";
import type { CostEngineResult } from "@/hooks/hr/useEmployeeCostEngine";
import { EmployeeRiskBadge } from "./EmployeeRiskBadge";

interface Props {
  employee: any;
  cost: CostEngineResult;
  risk: RiskScoreResult;
  /** kept for API back-compat — actions now live in the FinanceShell ribbon */
  onQuickAction?: (action: "leave" | "loan" | "deduction" | "salary") => void;
  onTabChange?: (tab: string) => void;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);

/**
 * Compact D365-style identity strip.
 * Actions moved to the FinanceShell action ribbon — this shows identity only.
 */
export function EmployeeHeader({ employee, cost, risk }: Props) {
  const displayName: string = employee?.full_name || employee?.name || "موظف";
  const status = employee?.status || (employee?.is_active === false ? "terminated" : "active");
  const isActive = status === "active" || employee?.is_active === true;
  const employeeCode = employee?.employee_number || employee?.employee_code || employee?.code;
  const photoUrl = employee?.photo_url || employee?.avatar_url;
  const gender = (employee?.gender || "").toString().toLowerCase();
  const FallbackIcon = gender === "female" || gender === "أنثى" ? UserRound : UserIcon;
  const jobTitle = employee?.job_title || employee?.position;
  const hireDate = employee?.start_date || employee?.hire_date;

  return (
    <div
      dir="rtl"
      className="rounded-lg border border-border bg-card px-3 py-2 flex items-center gap-x-4 gap-y-1.5 flex-wrap"
    >
      <Avatar className="h-9 w-9 shrink-0">
        {photoUrl ? <AvatarImage src={photoUrl} /> : null}
        <AvatarFallback className="bg-muted text-muted-foreground">
          <FallbackIcon className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex items-center gap-2 flex-wrap">
        <span className="text-[14px] font-bold truncate">{displayName}</span>
        {employeeCode && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground tabular-nums">
            #{employeeCode}
          </span>
        )}
        <Badge
          variant="outline"
          className={
            isActive
              ? "h-5 text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
              : "h-5 text-[10px] bg-muted text-muted-foreground"
          }
        >
          {isActive ? "نشط" : "موقوف"}
        </Badge>
      </div>

      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[12px] text-muted-foreground">
        {jobTitle && (
          <span className="flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            {jobTitle}
          </span>
        )}
        {employee?.department && (
          <span className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            {employee.department}
          </span>
        )}
        {hireDate && (
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            التعيين: {new Date(hireDate).toLocaleDateString("ar")}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {employee?.auth_user_id && (
          <Badge variant="outline" className="h-5 gap-1 text-[10px] bg-primary/5 text-primary border-primary/20">
            <ShieldCheck className="h-3 w-3" />
            حساب دخول
          </Badge>
        )}
        <Badge variant="outline" className="h-5 gap-1 text-[10px] bg-primary/5 text-primary border-primary/20">
          <Wallet className="h-3 w-3" />
          ₪{fmt(cost.totalCost)} / شهر
        </Badge>
        <EmployeeRiskBadge risk={risk} />
      </div>
    </div>
  );
}
