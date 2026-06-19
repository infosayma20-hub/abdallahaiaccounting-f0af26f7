import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEmployee360 } from "@/hooks/hr/useEmployee360";
import { useEmployeeCostEngine } from "@/hooks/hr/useEmployeeCostEngine";
import { useEmployeeRiskScore } from "@/hooks/hr/useEmployeeRiskScore";
import { useEmployeeForecast } from "@/hooks/hr/useEmployeeForecast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { EmployeeHeader } from "./components/EmployeeHeader";
import { EmployeeFinancialPanel } from "./components/EmployeeFinancialPanel";
import { EmployeeTimeline } from "./components/EmployeeTimeline";
import { OverviewTab } from "./components/tabs/OverviewTab";
import { AttendanceTab } from "./components/tabs/AttendanceTab";
import { PayrollTab } from "./components/tabs/PayrollTab";
import { PayrollPreviewTab } from "./components/tabs/PayrollPreviewTab";
import { MovementsTab } from "./components/tabs/MovementsTab";
import { LeavesTab } from "./components/tabs/LeavesTab";
import { LoansTab } from "./components/tabs/LoansTab";
import { DeductionsTab } from "./components/tabs/DeductionsTab";
import { FormsTab } from "./components/tabs/FormsTab";
import { DocumentsTab } from "./components/tabs/DocumentsTab";
import { MessagesTab } from "./components/tabs/MessagesTab";
import { PosMealsTab } from "./components/tabs/PosMealsTab";

export default function Employee360Page() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data, isLoading, isError, error } = useEmployee360(id);
  const cost = useEmployeeCostEngine(data);
  const risk = useEmployeeRiskScore(data, cost);
  const forecast = useEmployeeForecast(data, cost);
  const [tab, setTabState] = useState<string>(searchParams.get("tab") || "overview");
  const setTab = (next: string) => {
    setTabState(next);
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", next);
    setSearchParams(sp, { replace: true });
  };

  const handleQuickAction = (action: "leave" | "loan" | "deduction" | "salary") => {
    if (!id) return;
    const routes: Record<typeof action, string> = {
      leave: `/leaves?employee=${id}&new=1`,
      loan: `/loans?employee=${id}&new=1`,
      deduction: `/hr-deductions?employee=${id}&new=1`,
      salary: `/employees?edit=${id}&tab=salary`,
    };
    navigate(routes[action]);
    toast({
      title: "جارٍ التحويل",
      description: "سيتم فتح النموذج المناسب للموظف.",
    });
  };

  if (isLoading) {
    return (
      <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-4" dir="rtl">
        <Skeleton className="h-40 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !data?.employee) {
    return (
      <div className="container max-w-3xl mx-auto p-6" dir="rtl">
        <Card className="p-8 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-rose-500" />
          <h2 className="text-lg font-bold mb-2">تعذر تحميل بيانات الموظف</h2>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "الموظف غير موجود أو لا تملك صلاحية الوصول."}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-4 hr-themed" dir="rtl">
      <EmployeeHeader
        employee={data.employee}
        cost={cost}
        risk={risk}
        onQuickAction={handleQuickAction}
        onTabChange={setTab}
      />

      <EmployeeFinancialPanel cost={cost} risk={risk} forecast={forecast} onNavigateTab={setTab} />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="inline-flex w-auto min-w-full md:min-w-0 h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
            <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
            <TabsTrigger value="attendance">الحضور</TabsTrigger>
            <TabsTrigger value="payroll">الراتب</TabsTrigger>
            <TabsTrigger value="payroll-preview">معاينة الراتب</TabsTrigger>
            <TabsTrigger value="movements">الحركات المالية</TabsTrigger>
            <TabsTrigger value="leaves">الإجازات</TabsTrigger>
            <TabsTrigger value="loans">القروض</TabsTrigger>
            <TabsTrigger value="deductions">الخصومات</TabsTrigger>
            <TabsTrigger value="pos-meals">وجبات POS</TabsTrigger>
            <TabsTrigger value="forms">الطلبات</TabsTrigger>
            <TabsTrigger value="documents">المستندات</TabsTrigger>
            <TabsTrigger value="messages">الرسائل والإجراءات</TabsTrigger>
            <TabsTrigger value="timeline">السجل الزمني</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-0">
          <OverviewTab data={data} cost={cost} />
        </TabsContent>
        <TabsContent value="attendance" className="mt-0">
          <AttendanceTab data={data} />
        </TabsContent>
        <TabsContent value="payroll" className="mt-0">
          <PayrollTab data={data} cost={cost} />
        </TabsContent>
        <TabsContent value="payroll-preview" className="mt-0">
          <PayrollPreviewTab employeeId={data.employee.id} />
        </TabsContent>
        <TabsContent value="movements" className="mt-0">
          <MovementsTab employeeId={data.employee.id} />
        </TabsContent>
        <TabsContent value="leaves" className="mt-0">
          <LeavesTab data={data} />
        </TabsContent>
        <TabsContent value="loans" className="mt-0">
          <LoansTab data={data} />
        </TabsContent>
        <TabsContent value="deductions" className="mt-0">
          <DeductionsTab data={data} />
        </TabsContent>
        <TabsContent value="pos-meals" className="mt-0">
          <PosMealsTab employeeId={data.employee.id} />
        </TabsContent>
        <TabsContent value="forms" className="mt-0">
          <FormsTab data={data} />
        </TabsContent>
        <TabsContent value="documents" className="mt-0">
          <DocumentsTab data={data} />
        </TabsContent>
        <TabsContent value="messages" className="mt-0">
          <MessagesTab data={data} />
        </TabsContent>
        <TabsContent value="timeline" className="mt-0">
          <EmployeeTimeline events={data.timeline} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
