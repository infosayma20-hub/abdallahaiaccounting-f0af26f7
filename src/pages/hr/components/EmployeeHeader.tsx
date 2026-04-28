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
  Wallet,
  UserPlus,
  ShieldCheck,
  User as UserIcon,
  UserRound,
  MoreHorizontal,
  Pencil,
  MessageSquare,
  Shield,
  Clock,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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

  const status = employee?.status || (employee?.is_active === false ? "terminated" : "active");
  const isActive = status === "active" || employee?.is_active === true;
  const employeeCode = employee?.employee_code || employee?.code || employee?.employee_number;
  const photoUrl = employee?.photo_url || employee?.avatar_url;
  const gender = (employee?.gender || "").toString().toLowerCase();
  const FallbackIcon = gender === "female" || gender === "أنثى" ? UserRound : UserIcon;

  return (
    <Card className="overflow-hidden shadow-sm" dir="rtl">
      {/* Navy header bar — same language as Attendance Center */}
      <div className="bg-primary text-primary-foreground px-4 md:px-5 py-3 flex items-center gap-3 flex-wrap">
        {/* Right: avatar + name + code */}
        <Avatar className="h-11 w-11 ring-2 ring-primary-foreground/20 shrink-0 bg-primary-foreground/10">
          {photoUrl ? <AvatarImage src={photoUrl} /> : null}
          <AvatarFallback className="bg-primary-foreground/10 text-primary-foreground">
            <FallbackIcon className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="text-[11px] opacity-75 leading-none mb-1">ملف الموظف</div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base md:text-lg font-bold leading-none truncate">{displayName}</h1>
            {employeeCode && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary-foreground/15 tabular-nums">
                #{employeeCode}
              </span>
            )}
            <Badge
              variant="outline"
              className={
                isActive
                  ? "bg-emerald-500/15 text-emerald-100 border-emerald-300/40 text-[10px] h-5"
                  : "bg-muted/20 text-primary-foreground/80 border-primary-foreground/20 text-[10px] h-5"
              }
            >
              {isActive ? "نشط" : "موقوف"}
            </Badge>
          </div>
        </div>

        {/* Left: primary actions ordered low → high risk */}
        <div className="ms-auto flex items-center gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground border-0"
            onClick={() => navigate(`/employees?edit=${employee?.id}`)}
          >
            <Pencil className="h-3.5 w-3.5" />
            تعديل البيانات
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground border-0"
            onClick={() => navigate(`/hr-attendance?employee=${employee?.id}`)}
          >
            <Clock className="h-3.5 w-3.5" />
            الحضور
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground border-0"
            onClick={() => navigate(`/hr-attendance?employee=${employee?.id}&action=message`)}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            إرسال رسالة
          </Button>
          <Button
            size="sm"
            variant="default"
            className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
            onClick={() => onQuickAction("salary")}
          >
            <Wallet className="h-3.5 w-3.5" />
            الراتب
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 gap-1.5 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground border-0"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
                المزيد
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => onQuickAction("leave")}>إضافة إجازة</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onQuickAction("loan")}>إضافة قرض</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onQuickAction("deduction")}>إضافة خصم</DropdownMenuItem>
              <DropdownMenuSeparator />
              {!employee?.auth_user_id && (
                <DropdownMenuItem onClick={() => navigate(`/employees?openAccount=${employee?.id}`)}>
                  <UserPlus className="h-3.5 w-3.5 ms-2" />
                  إنشاء حساب دخول
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-rose-600 focus:text-rose-700"
                onClick={() => navigate(`/hr-attendance?employee=${employee?.id}&action=penalty`)}
              >
                <Shield className="h-3.5 w-3.5 ms-2" />
                إجراء عقابي
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="h-8 text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 gap-1.5"
          >
            <ArrowRight className="h-4 w-4" />
            رجوع
          </Button>
        </div>
      </div>

      {/* Meta strip (light) */}
      <div className="px-4 md:px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
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
        <div className="ms-auto flex items-center gap-2 flex-wrap">
          {employee?.auth_user_id && (
            <Badge variant="outline" className="gap-1.5 bg-primary/5 text-primary border-primary/20">
              <ShieldCheck className="h-3.5 w-3.5" />
              لديه حساب دخول
            </Badge>
          )}
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 gap-1">
            <Wallet className="h-3.5 w-3.5" />
            تكلفة شهرية: ₪{fmt(cost.totalCost)}
          </Badge>
          <EmployeeRiskBadge risk={risk} />
        </div>
      </div>
    </Card>
  );
}
