import { useState, lazy, Suspense } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEmployee360 } from "@/hooks/hr/useEmployee360";
import { useEmployeeCostEngine } from "@/hooks/hr/useEmployeeCostEngine";
import { useEmployeeRiskScore } from "@/hooks/hr/useEmployeeRiskScore";
import { useEmployeeForecast } from "@/hooks/hr/useEmployeeForecast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { AlertCircle, CalendarPlus, HandCoins, Receipt, Wallet, Pencil, FileText, MessageSquare, Users } from "lucide-react";
import { FinanceShell } from "@/components/finance/shell";
import { useToast } from "@/hooks/use-toast";

import { EmployeeHeader } from "./components/EmployeeHeader";
import { Employee360Search } from "./components/Employee360Search";
import { EmployeeFinancialPanel } from "./components/EmployeeFinancialPanel";
import { EmployeeAlertsCenter } from "./components/EmployeeAlertsCenter";
import { EmployeeTimeline } from "./components/EmployeeTimeline";
import { OverviewTab } from "./components/tabs/OverviewTab";
import { AttendanceTab } from "./components/tabs/AttendanceTab";
const PayrollTab = lazy(() => import("./components/tabs/PayrollTab").then(m => ({ default: m.PayrollTab })));
const PayrollPreviewTab = lazy(() => import("./components/tabs/PayrollPreviewTab").then(m => ({ default: m.PayrollPreviewTab })));
const MovementsTab = lazy(() => import("./components/tabs/MovementsTab").then(m => ({ default: m.MovementsTab })));
const LeavesTab = lazy(() => import("./components/tabs/LeavesTab").then(m => ({ default: m.LeavesTab })));
const LoansTab = lazy(() => import("./components/tabs/LoansTab").then(m => ({ default: m.LoansTab })));
const DeductionsTab = lazy(() => import("./components/tabs/DeductionsTab").then(m => ({ default: m.DeductionsTab })));
const FormsTab = lazy(() => import("./components/tabs/FormsTab").then(m => ({ default: m.FormsTab })));
const DocumentsTab = lazy(() => import("./components/tabs/DocumentsTab").then(m => ({ default: m.DocumentsTab })));
const MessagesTab = lazy(() => import("./components/tabs/MessagesTab").then(m => ({ default: m.MessagesTab })));
const PosMealsTab = lazy(() => import("./components/tabs/PosMealsTab").then(m => ({ default: m.PosMealsTab })));
const EmployeeChatTab360 = lazy(() => import("./components/tabs/EmployeeChatTab360").then(m => ({ default: m.EmployeeChatTab360 })));

const TabFallback = () => (
  <div className="p-6">
    <Skeleton className="h-64 w-full" />
  </div>
);

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

  const emp: any = data.employee;
  const actionTabs = [
    {
      key: "general",
      label: "عام",
      groups: [
        {
          key: "new",
          label: "جديد",
          items: [
            { key: "leave", label: "طلب إجازة", icon: CalendarPlus, variant: "primary" as const, onClick: () => handleQuickAction("leave") },
            { key: "loan", label: "سلفة/قرض", icon: HandCoins, onClick: () => handleQuickAction("loan") },
            { key: "deduction", label: "خصم", icon: Receipt, onClick: () => handleQuickAction("deduction") },
          ],
        },
        {
          key: "manage",
          label: "إجراءات",
          items: [
            { key: "salary", label: "تعديل الراتب", icon: Wallet, onClick: () => handleQuickAction("salary") },
            { key: "edit", label: "ملف الموظف", icon: Pencil, onClick: () => navigate(`/employees?edit=${id}`) },
            { key: "docs", label: "المستندات", icon: FileText, onClick: () => setTab("documents") },
            { key: "chat", label: "مراسلة", icon: MessageSquare, onClick: () => setTab("chat") },
          ],
        },
        {
          key: "nav",
          label: "تنقل",
          items: [
            { key: "back", label: "الموظفين", icon: Users, variant: "ghost" as const, onClick: () => navigate("/employees") },
          ],
        },
      ],
    },
  ];

  return (
    <FinanceShell
      title={emp?.full_name || "ملف الموظف"}
      subtitle={[emp?.job_title || emp?.position, emp?.department].filter(Boolean).join(" — ") || "ملف الموظف 360"}
      breadcrumb={[{ label: "الموارد البشرية" }, { label: "الموظفون", href: "/employees" }, { label: "موظف 360" }]}
actionTabs={actionTabs}
      compact
      headerSlot={<Employee360Search currentId={id} />}
    >
      <div className="space-y-3 hr-themed" dir="rtl">
      <EmployeeHeader
        employee={data.employee}
        cost={cost}
        risk={risk}
        onQuickAction={handleQuickAction}
        onTabChange={setTab}
      />

      <EmployeeFinancialPanel cost={cost} risk={risk} forecast={forecast} onNavigateTab={setTab} />

      <EmployeeAlertsCenter risk={risk} forecast={forecast} />

      <Tabs value={tab} onValueChange={setTab} className="space-y-3">
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="inline-flex w-auto min-w-full md:min-w-0 h-auto flex-wrap justify-start gap-0.5 bg-transparent border-b border-border rounded-none p-0">
            {[
              ["overview", "نظرة عامة"],
              ["attendance", "الحضور"],
              ["payroll", "الراتب"],
              ["payroll-preview", "معاينة الراتب"],
              ["movements", "الحركات المالية"],
              ["leaves", "الإجازات"],
              ["loans", "القروض"],
              ["deductions", "الخصومات"],
              ["pos-meals", "وجبات POS"],
              ["forms", "الطلبات"],
              ["documents", "المستندات"],
              ["messages", "الرسائل والإجراءات"],
              ["chat", "المراسلة"],
              ["timeline", "السجل الزمني"],
            ].map(([v, label]) => (
              <TabsTrigger
                key={v}
                value={v}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-primary text-[12.5px] px-3 py-1.5"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>


        <TabsContent value="overview" className="mt-0">
          <OverviewTab data={data} cost={cost} />
        </TabsContent>

        <TabsContent value="chat" className="mt-0">
          <Suspense fallback={<TabFallback />}>
            <EmployeeChatTab360 employeeId={data.employee.id} employeeName={(data.employee as any).full_name} />
          </Suspense>
        </TabsContent>
        <TabsContent value="attendance" className="mt-0">
          <AttendanceTab data={data} />
        </TabsContent>
        <TabsContent value="payroll" className="mt-0">
          <Suspense fallback={<TabFallback />}><PayrollTab data={data} cost={cost} /></Suspense>
        </TabsContent>
        <TabsContent value="payroll-preview" className="mt-0">
          <Suspense fallback={<TabFallback />}><PayrollPreviewTab employeeId={data.employee.id} /></Suspense>
        </TabsContent>
        <TabsContent value="movements" className="mt-0">
          <Suspense fallback={<TabFallback />}><MovementsTab employeeId={data.employee.id} /></Suspense>
        </TabsContent>
        <TabsContent value="leaves" className="mt-0">
          <Suspense fallback={<TabFallback />}><LeavesTab data={data} /></Suspense>
        </TabsContent>
        <TabsContent value="loans" className="mt-0">
          <Suspense fallback={<TabFallback />}><LoansTab data={data} /></Suspense>
        </TabsContent>
        <TabsContent value="deductions" className="mt-0">
          <Suspense fallback={<TabFallback />}><DeductionsTab data={data} /></Suspense>
        </TabsContent>
        <TabsContent value="pos-meals" className="mt-0">
          <Suspense fallback={<TabFallback />}><PosMealsTab employeeId={data.employee.id} /></Suspense>
        </TabsContent>
        <TabsContent value="forms" className="mt-0">
          <Suspense fallback={<TabFallback />}><FormsTab data={data} /></Suspense>
        </TabsContent>
        <TabsContent value="documents" className="mt-0">
          <Suspense fallback={<TabFallback />}><DocumentsTab data={data} /></Suspense>
        </TabsContent>
        <TabsContent value="messages" className="mt-0">
          <Suspense fallback={<TabFallback />}><MessagesTab data={data} /></Suspense>
        </TabsContent>
        <TabsContent value="timeline" className="mt-0">
          <EmployeeTimeline events={data.timeline} />
        </TabsContent>
      </Tabs>
      </div>
    </FinanceShell>
  );
}
