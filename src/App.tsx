import { Suspense, lazy } from "react";
import { useCrossTabSync } from "@/hooks/useCrossTabSync";
import VersionBadge from "@/components/VersionBadge";
import AppUpdatePrompt from "@/components/AppUpdatePrompt";
const CrossTabSyncProvider = () => { useCrossTabSync(); return null; };
import GlobalFormFocusProvider from "@/components/forms/GlobalFormFocusProvider";
import { useSearchParams } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useRoleRedirect } from "@/hooks/useRoleRedirect";
import { ThemeProvider } from "@/hooks/useTheme";
import { CompanyProvider } from "@/hooks/useCompanyContext";
import { CompanyThemeProvider } from "@/hooks/useCompanyTheme";
import { ReadOnlyProvider } from "@/contexts/ReadOnlyContext";
import WebLayout from "./components/layout/WebLayout";
import FeedbackShell from "./components/layout/FeedbackShell";
import RoleGuard from "./components/RoleGuard";
import HRPermGuard from "./components/HRPermGuard";
import HRShell from "./components/hr/HRShell";
import InvoicesPage from "./pages/InvoicesPage";
const ModuleGuard = lazy(() => import("./components/layout/ModuleGuard"));
const FeatureGuard = lazy(() => import("./components/permissions/FeatureGuard"));
const POSDeviceAuthGuard = lazy(() => import("./components/pos/POSDeviceAuthGuard"));

// Lazy-loaded pages for code splitting
const HomeDashboard = lazy(() => import("./pages/HomeDashboard"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const SmartAccountantPage = lazy(() => import("./pages/SmartAccountantPage"));
const MenuPage = lazy(() => import("./pages/MenuPage"));
const VoiceInput = lazy(() => import("./pages/VoiceInput"));
const ProfitLoss = lazy(() => import("./pages/ProfitLoss"));
// TransactionsPage replaced by JournalEntriesPage on /transactions route
const AccountsPage = lazy(() => import("./pages/AccountsPage"));
const AccountFormPage = lazy(() => import("./pages/AccountFormPage"));
const ContactsPage = lazy(() => import("./pages/ContactsPage"));
const ContactDetailPage = lazy(() => import("./pages/ContactDetailPage"));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage"));
const ContactPoliciesPage = lazy(() => import("./pages/ContactPoliciesPage"));
const ExportPage = lazy(() => import("./pages/ExportPage"));
const SmartReportPage = lazy(() => import("./pages/SmartReportPage"));
const JournalEntriesPage = lazy(() => import("./pages/JournalEntriesPage"));
const TrialBalancePage = lazy(() => import("./pages/TrialBalancePage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const ShareQRPage = lazy(() => import("./pages/ShareQRPage"));
const RecurringInvoicesPage = lazy(() => import("./pages/RecurringInvoicesPage"));
const InvoiceCreatePage = lazy(() => import("./pages/InvoiceCreatePage"));
const CreditDebitNotesPage = lazy(() => import("./pages/CreditDebitNotesPage"));
const CreditDebitNoteCreatePage = lazy(() => import("./pages/CreditDebitNoteCreatePage"));
const ReturnsListPage = lazy(() => import("./pages/ReturnsListPage"));
const ReturnCreatePage = lazy(() => import("./pages/ReturnCreatePage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const StockMovementsPage = lazy(() => import("./pages/StockMovementsPage"));
const InventoryValuationPage = lazy(() => import("./pages/InventoryValuationPage"));
const BalanceSheetPage = lazy(() => import("./pages/BalanceSheetPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));
const EmployeeFormsManagementPage = lazy(() => import("./pages/EmployeeFormsManagementPage"));
const SalesRepresentativesPage = lazy(() => import("./pages/SalesRepresentativesPage"));
const WarehousesPage = lazy(() => import("./pages/WarehousesPage"));
const StockTransfersPage = lazy(() => import("./pages/StockTransfersPage"));
const VanDaysPage = lazy(() => import("./pages/VanDaysPage"));
const VanCommissionsPage = lazy(() => import("./pages/VanCommissionsPage"));
const VanReportsPage = lazy(() => import("./pages/VanReportsPage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const DeliveryNotesPage = lazy(() => import("./pages/DeliveryNotesPage"));
const DeliveryNoteCreatePage = lazy(() => import("./pages/DeliveryNoteCreatePage"));
const ChequesPage = lazy(() => import("./pages/ChequesPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const HelpCenterPage = lazy(() => import("./pages/HelpCenterPage"));
const EmployeeAttendancePage = lazy(() => import("./pages/EmployeeAttendancePage"));
const HRAttendancePage = lazy(() => import("./pages/HRAttendancePage"));
const BranchDisplayPage = lazy(() => import("./pages/BranchDisplayPage"));
const EmployeeApp = lazy(() => import("./pages/EmployeeApp"));
const ChooseWorkspacePage = lazy(() => import("./pages/ChooseWorkspacePage"));
const AppsLauncher = lazy(() => import("./pages/AppsLauncher"));
const RepLayout = lazy(() => import("./pages/rep/RepLayout"));
const RepDashboardPage = lazy(() => import("./pages/rep/RepDashboardPage"));
const RepNewOrderPage = lazy(() => import("./pages/rep/RepNewOrderPage"));
const RepOrdersPage = lazy(() => import("./pages/rep/RepOrdersPage"));
const RepCollectPage = lazy(() => import("./pages/rep/RepCollectPage"));
const RepExpensePage = lazy(() => import("./pages/rep/RepExpensePage"));
const RepSalesBySupplierPage = lazy(() => import("./pages/rep/RepSalesBySupplierPage"));
const RepHomePage = lazy(() => import("./pages/rep/RepHomePage"));
const RepCustomersPage = lazy(() => import("./pages/rep/RepCustomersPage"));
const RepCustomerStatementPage = lazy(() => import("./pages/rep/RepCustomerStatementPage"));
const RepReturnsPage = lazy(() => import("./pages/rep/RepReturnsPage"));
const RepSettingsPage = lazy(() => import("./pages/rep/RepSettingsPage"));
const RepReportsHubPage = lazy(() => import("./pages/rep/RepReportsPage"));
const RepReportsPage = lazy(() => import("./pages/manager/RepReportsPage"));
const SalesRepsLivePage = lazy(() => import("./pages/admin/SalesRepsLivePage"));
const SalesRepOrdersPage = lazy(() => import("./pages/admin/SalesRepOrdersPage"));
const RepUnpostedOrdersPage = lazy(() => import("./pages/admin/RepUnpostedOrdersPage"));
const OpeningBalancesImportPage = lazy(() => import("./pages/OpeningBalancesImportPage"));
const CurrencyManagementPage = lazy(() => import("./pages/CurrencyManagementPage"));
const FixedAssetsPage = lazy(() => import("./pages/FixedAssetsPage"));
const WarrantyHomePage = lazy(() => import("./pages/warranty/WarrantyHomePage"));
const WarrantyPoliciesPage = lazy(() => import("./pages/warranty/WarrantyPoliciesPage"));
const WarrantyCardsPage = lazy(() => import("./pages/warranty/WarrantyCardsPage"));
const WarrantyClaimsPage = lazy(() => import("./pages/warranty/WarrantyClaimsPage"));
const WarrantySupplierClaimsPage = lazy(() => import("./pages/warranty/WarrantySupplierClaimsPage"));
const WarrantyReportsPage = lazy(() => import("./pages/warranty/WarrantyReportsPage"));
const GeneralLedgerPage = lazy(() => import("./pages/GeneralLedgerPage"));
const AccountStatementPage = lazy(() => import("./pages/AccountStatementV2Page"));
const HRPayrollReport = lazy(() => import("./pages/reports/HRPayrollReport"));
const HRAttendanceReport = lazy(() => import("./pages/reports/HRAttendanceReport"));
const HRReportsPage = lazy(() => import("./pages/reports/HRReportsPage"));
const HRLeaveReport = lazy(() => import("./pages/reports/HRLeaveReport"));
const HRStaffCostReport = lazy(() => import("./pages/reports/HRStaffCostReport"));
const GenericReportPage = lazy(() => import("./pages/reports/GenericReportPage"));
const PosInvoiceDetailPage = lazy(() => import("./pages/pos/PosInvoiceDetailPage"));
const CollectionDashboardPage = lazy(() => import("./pages/reports/CollectionDashboardPage"));
const PeriodicReportsPage = lazy(() => import("./pages/reports/PeriodicReportsPage"));
const ReportBuilderPage = lazy(() => import("./pages/reports/ReportBuilderPage"));
const MyReportsPage = lazy(() => import("./pages/reports/MyReportsPage"));
const VanSalesReportsPage = lazy(() => import("./pages/reports/VanSalesReportsPage"));
const DashboardsPage = lazy(() => import("./pages/dashboards/DashboardsPage"));
const DashboardViewPage = lazy(() => import("./pages/dashboards/DashboardViewPage"));
const PublicDashboardPage = lazy(() => import("./pages/dashboards/PublicDashboardPage"));
const CustomizationPage = lazy(() => import("./pages/CustomizationPage"));
const TemplateDesignerPage = lazy(() => import("./pages/TemplateDesignerPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const IndustryTemplatesPage = lazy(() => import("./pages/IndustryTemplatesPage"));
const CustomizationRequestPage = lazy(() => import("./pages/CustomizationRequestPage"));
const SupportTicketsPage = lazy(() => import("./pages/SupportTicketsPage"));
const TicketDetailPage = lazy(() => import("./pages/TicketDetailPage"));
const SupportAdminPage = lazy(() => import("./pages/SupportAdminPage"));
const POSPage = lazy(() => import("./pages/POSPage"));
const POSUserManagementPage = lazy(() => import("./pages/POSUserManagementPage"));
const POSReportsPage = lazy(() => import("./pages/POSReportsPage"));
const CallCenterReportsPage = lazy(() => import("./pages/CallCenterReportsPage"));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));
const POSCustomerDatabasePage = lazy(() => import("./pages/POSCustomerDatabasePage"));
const SuperAdminDashboard = lazy(() => import("./pages/SuperAdminDashboard"));
const SuperAdminLoginPage = lazy(() => import("./pages/SuperAdminLoginPage"));
const UnsubscribePage = lazy(() => import("./pages/UnsubscribePage"));
const FloorPlanPage = lazy(() => import("./pages/FloorPlanPage"));
const FloorPlanEditorPage = lazy(() => import("./pages/FloorPlanEditorPage"));
const DigitalReceiptPage = lazy(() => import("./pages/DigitalReceiptPage"));
const SurveyPage = lazy(() => import("./pages/SurveyPage"));
const CustomerReportsPage = lazy(() => import("./pages/CustomerReportsPage"));
const ModifierManagerPage = lazy(() => import("./pages/ModifierManagerPage"));
const ContractorApp = lazy(() => import("./pages/ContractorApp"));
const WorkshopsPage = lazy(() => import("./pages/WorkshopsPage"));
const WorkshopReportsPage = lazy(() => import("./pages/WorkshopReportsPage"));
const WorkerProcurementPage = lazy(() => import("./pages/WorkerProcurementPage"));
const ContractsListPage = lazy(() => import("./pages/ContractsListPage"));
const ContractFormPage = lazy(() => import("./pages/ContractFormPage"));
const ContractPreviewPage = lazy(() => import("./pages/ContractPreviewPage"));
const LoadingDemoPage = lazy(() => import("./pages/LoadingDemoPage"));
const AdvancesPage = lazy(() => import("./pages/AdvancesPage"));
const LoansPage = lazy(() => import("./pages/LoansPage"));
const HRDeductionsPage = lazy(() => import("./pages/HRDeductionsPage"));
const PayrollSettingsPage = lazy(() => import("./pages/PayrollSettingsPage"));
const PayrollPage = lazy(() => import("./pages/PayrollPage"));
const PayrollApprovalCenter = lazy(() => import("./pages/hr/PayrollApprovalCenter"));
const PayrollPaymentCenter = lazy(() => import("./pages/hr/PayrollPaymentCenter"));
const Employee360Page = lazy(() => import("./pages/hr/Employee360Page"));
const HrCommandCenter = lazy(() => import("./pages/hr/HrCommandCenter"));
const HrDefinitionsPage = lazy(() => import("./pages/hr/HrDefinitionsPage"));
const HrDayTypesPage = lazy(() => import("./pages/hr/HrDayTypesPage"));
const HrWorkShiftsPage = lazy(() => import("./pages/hr/HrWorkShiftsPage"));
const HrSettingsPage = lazy(() => import("./pages/hr/HrSettingsPage"));
const PolicyAssignmentPage = lazy(() => import("./pages/hr/PolicyAssignmentPage"));
const BranchRosterPage = lazy(() => import("./pages/manager/BranchRosterPage"));
const MonthlyPayrollInputPage = lazy(() => import("./pages/MonthlyPayrollInputPage"));
const PayrollEngineComparisonPage = lazy(() => import("./pages/hr/__internal/PayrollEngineComparisonPage"));
const PayrollSettingsV2Page = lazy(() => import("./pages/hr/__internal/payroll-settings/PayrollSettingsPage"));
const PayrollPreviewAllPage = lazy(() => import("./pages/hr/PayrollPreviewAllPage"));
const LeavesPage = lazy(() => import("./pages/LeavesPage"));
const ImportShipmentsPage = lazy(() => import("./pages/ImportShipmentsPage"));
const PurchaseOrderCreatePage = lazy(() => import("./pages/procurement/PurchaseOrderCreatePage"));
const PurchaseOrdersPage = lazy(() => import("./pages/procurement/PurchaseOrdersPage"));
const ProcurementInvoicesPage = lazy(() => import("./pages/procurement/ProcurementInvoicesPage"));
const ProcurementInvoiceCreatePage = lazy(() => import("./pages/procurement/ProcurementInvoiceCreatePage"));
const SupplierStatementPage = lazy(() => import("./pages/procurement/SupplierStatementPage"));
const WeeklyProcurementReportPage = lazy(() => import("./pages/procurement/WeeklyProcurementReportPage"));
const ProcurementSettingsPage = lazy(() => import("./pages/procurement/ProcurementSettingsPage"));
const ImportWizardPage = lazy(() => import("./pages/ImportWizardPage"));
const ImportDetailPage = lazy(() => import("./pages/ImportDetailPage"));

const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage"));
const SetupPage = lazy(() => import("./pages/SetupPage"));
const FinanceHomePage = lazy(() => import("./pages/FinanceHomePage"));
const FinanceVoucherPage = lazy(() => import("./pages/FinanceVoucherPage"));
const FinanceReceiptsPage = lazy(() => import("./pages/FinanceReceiptsPage"));
const FinancePaymentsPage = lazy(() => import("./pages/FinancePaymentsPage"));
const FinanceJournalPage = lazy(() => import("./pages/FinanceJournalPage"));
const AccountingCenterPage = lazy(() => import("./pages/AccountingCenterPage"));
const KitchenDisplayPage = lazy(() => import("./pages/KitchenDisplayPage"));
const CustomerOrderDisplayPage = lazy(() => import("./pages/CustomerOrderDisplayPage"));
const KitchenDisplayPublicPage = lazy(() => import("./pages/KitchenDisplayPublicPage"));
const KdsControlPage = lazy(() => import("./pages/KdsControlPage"));
const BankAccountsPage = lazy(() => import("./pages/BankAccountsPage"));
const CostCentersPage = lazy(() => import("./pages/CostCentersPage"));
const CashBoxesPage = lazy(() => import("./pages/CashBoxesPage"));
const CashTransferPage = lazy(() => import("./pages/CashTransferPage"));
const CashLiquidityPage = lazy(() => import("./pages/CashLiquidityPage"));
const VoucherFormPage = lazy(() => import("./pages/VoucherFormPage"));
const JournalNewPage = lazy(() => import("./pages/JournalNewPage"));
const PortalLogin = lazy(() => import("./pages/portal/PortalLogin"));
const PortalDashboard = lazy(() => import("./pages/portal/PortalDashboard"));
const TaskLoginPage = lazy(() => import("./pages/tasks/TaskLoginPage"));
const TaskBoardPage = lazy(() => import("./pages/tasks/TaskBoardPage"));
const TaskAdminPage = lazy(() => import("./pages/tasks/TaskAdminPage"));
const TaskDisplayPage = lazy(() => import("./pages/tasks/TaskDisplayPage"));
const TravelDashboard = lazy(() => import("./pages/travel/TravelDashboard"));
const TravelBookingsPage = lazy(() => import("./pages/travel/TravelBookingsPage"));
const TravelBookingFormPage = lazy(() => import("./pages/travel/TravelBookingFormPage"));
const TravelSuppliersPage = lazy(() => import("./pages/travel/TravelSuppliersPage"));
const TravelPackagesPage = lazy(() => import("./pages/travel/TravelPackagesPage"));
const TravelReportsPage = lazy(() => import("./pages/travel/TravelReportsPage"));
const TravelBookingDetailPage = lazy(() => import("./pages/travel/TravelBookingDetailPage"));
const TravelBookingPrintPage = lazy(() => import("./pages/travel/TravelBookingPrintPage"));
const TravelSettingsPage = lazy(() => import("./pages/travel/TravelSettingsPage"));
const PrinterSettingsPage = lazy(() => import("./pages/PrinterSettingsPage"));
const DeviceSetupPage = lazy(() => import("./pages/DeviceSetupPage"));
const DeviceSetupGuard = lazy(() => import("./components/pos/DeviceSetupGuard"));
const NewDeviceOnboardingPage = lazy(() => import("./pages/NewDeviceOnboardingPage"));
const PrintTemplatesPage = lazy(() => import("./pages/PrintTemplatesPage"));
const PrintPreviewPage = lazy(() => import("./pages/PrintPreviewPage"));
const TaxCenterPage = lazy(() => import("./pages/tax/TaxCenterPage"));
const PublicStatementPage = lazy(() => import("./pages/PublicStatementPage"));
const StoreTrackerDashboard = lazy(() => import("./pages/store-tracker/StoreTrackerDashboard"));
const StoreTrackerOrderDetail = lazy(() => import("./pages/store-tracker/StoreTrackerOrderDetail"));

// CRM Module
const CrmLayout = lazy(() => import("./pages/crm/CrmLayout"));
const CrmDashboard = lazy(() => import("./pages/crm/CrmDashboard"));
const CrmLeadsPage = lazy(() => import("./pages/crm/CrmLeadsPage"));
const CrmPipelinePage = lazy(() => import("./pages/crm/CrmPipelinePage"));
const CrmActivitiesPage = lazy(() => import("./pages/crm/CrmActivitiesPage"));
const CustomerCenterPage = lazy(() => import("./pages/crm/CustomerCenterPage"));
const Customer360Page = lazy(() => import("./pages/crm/Customer360Page"));
const OpportunityDetailsPage = lazy(() => import("./pages/crm/OpportunityDetailsPage"));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
    },
  },
});

// Wrapper to force remount InvoiceCreatePage when edit param changes
const InvoiceCreatePageWrapper = () => {
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit") || "new";
  return <InvoiceCreatePage key={editId} />;
};

// Minimal inline spinner for auth checks and lazy loading
const AuthCheckSpinner = () => (
  <div className="flex h-full min-h-[200px] w-full items-center justify-center">
    <div
      className="w-8 h-8 rounded-full border-2 border-transparent"
      style={{
        borderTopColor: "hsl(var(--accent))",
        borderRightColor: "hsl(var(--accent) / 0.3)",
        animation: "navSpinRing 0.7s linear infinite",
      }}
    />
  </div>
);

const ProtectedRoute = ({ children, blockCashier, blockStoreTracker, blockSalesRep }: { children: React.ReactNode; blockCashier?: boolean; blockStoreTracker?: boolean; blockSalesRep?: boolean }) => {
  const { user, loading } = useAuth();
  const { targetPath, checking } = useRoleRedirect();
  const location = useLocation();
  if (loading || ((blockCashier || blockStoreTracker || blockSalesRep) && checking)) return <AuthCheckSpinner />;
  if (!user) return <Navigate to="/auth" replace />;
  // امنع وميض شاشة المندوب/الموظف قبل ما نتأكد إذا لازم يروح لاختيار workspace
  if (checking && (location.pathname.startsWith("/rep") || location.pathname.startsWith("/employee"))) return <AuthCheckSpinner />;
  const hasWorkspaceChoice = (() => {
    try { return !!sessionStorage.getItem(`workspace-choice:${user.id}`); }
    catch { return false; }
  })();
  if (!checking && targetPath === "/choose-workspace" && !hasWorkspaceChoice && location.pathname !== "/choose-workspace") return <Navigate to="/choose-workspace" replace />;
  if (blockCashier && targetPath === "/pos") return <Navigate to="/pos" replace />;
  if (blockStoreTracker && targetPath === "/store-tracker") return <Navigate to="/store-tracker" replace />;
  if (blockSalesRep && targetPath === "/rep") return <Navigate to="/rep" replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { targetPath, checking, user } = useRoleRedirect();
  if (checking) return <AuthCheckSpinner />;
  if (user && targetPath) return <Navigate to={targetPath} replace />;
  return <>{children}</>;
};

const SmartRedirect = () => {
  const { targetPath, checking } = useRoleRedirect();
  if (checking) return <AuthCheckSpinner />;
  return <Navigate to={targetPath || "/apps"} replace />;
};

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <CrossTabSyncProvider />
        <BrowserRouter>
          <AuthProvider>
            <ReadOnlyProvider>
            <CompanyProvider>
            <CompanyThemeProvider>
            <GlobalFormFocusProvider />
            <VersionBadge />
            <AppUpdatePrompt />
            <Suspense fallback={<AuthCheckSpinner />}>
            <Routes>
              <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/share" element={<ShareQRPage />} />
              <Route path="/branch-display/:branchId" element={<BranchDisplayPage />} />
              <Route path="/super-admin/login" element={<SuperAdminLoginPage />} />
              <Route path="/super-admin/dashboard" element={<ProtectedRoute><SuperAdminDashboard /></ProtectedRoute>} />
              <Route path="/unsubscribe" element={<UnsubscribePage />} />
              <Route path="/choose-workspace" element={<ProtectedRoute><ChooseWorkspacePage /></ProtectedRoute>} />
              <Route path="/employee" element={<ProtectedRoute><RoleGuard allowedRoles={["employee"]} fallback="/auth"><EmployeeApp /></RoleGuard></ProtectedRoute>} />
              <Route path="/employee/roster" element={<ProtectedRoute><RoleGuard allowedRoles={["employee", "branch_scheduler", "admin", "hr_manager"]} fallback="/auth" allowEmployeePerm="can_manage_schedule"><EmployeeApp initialTab="manager-roster" /></RoleGuard></ProtectedRoute>} />
              <Route path="/employee/team" element={<ProtectedRoute><RoleGuard allowedRoles={["employee", "branch_scheduler", "admin", "hr_manager"]} fallback="/auth" allowEmployeePerm="can_view_team"><EmployeeApp initialTab="manager-team" /></RoleGuard></ProtectedRoute>} />
              <Route path="/employee/team-attendance" element={<ProtectedRoute><RoleGuard allowedRoles={["employee", "branch_scheduler", "admin", "hr_manager"]} fallback="/auth" allowEmployeePerm="can_manage_attendance"><EmployeeApp initialTab="manager-attendance" /></RoleGuard></ProtectedRoute>} />
              <Route path="/employee/team-requests" element={<ProtectedRoute><RoleGuard allowedRoles={["employee", "branch_scheduler", "admin", "hr_manager"]} fallback="/auth" allowEmployeePerm="can_manage_attendance"><EmployeeApp initialTab="manager-requests" /></RoleGuard></ProtectedRoute>} />
              <Route path="/employee/shift-swaps" element={<ProtectedRoute><RoleGuard allowedRoles={["employee", "branch_scheduler", "admin", "hr_manager"]} fallback="/auth" allowEmployeePerm="can_manage_schedule"><EmployeeApp initialTab="manager-swaps" /></RoleGuard></ProtectedRoute>} />
              <Route path="/rep" element={<ProtectedRoute><RepLayout /></ProtectedRoute>}>
                <Route index element={<Navigate to="/rep/home" replace />} />
                <Route path="home" element={<RepHomePage />} />
                <Route path="dashboard" element={<RepDashboardPage />} />
                <Route path="new-order" element={<RepNewOrderPage />} />
                <Route path="collect" element={<RepCollectPage />} />
                <Route path="expense" element={<RepExpensePage />} />
                <Route path="orders" element={<RepOrdersPage />} />
                <Route path="sales-by-supplier" element={<RepSalesBySupplierPage />} />
                <Route path="customers" element={<RepCustomersPage />} />
                <Route path="customer-statement" element={<RepCustomerStatementPage />} />
                <Route path="returns" element={<RepReturnsPage />} />
                <Route path="sales-order" element={<Navigate to="/rep/new-order" replace />} />
                <Route path="reports" element={<RepReportsHubPage />} />
                <Route path="settings" element={<RepSettingsPage />} />
                {/* alias: إغلاق اليوم موجود ضمن لوحة /rep الرئيسية */}
                <Route path="close-day" element={<Navigate to="/rep/dashboard" replace />} />
              </Route>
              <Route path="/receipt/:orderId" element={<DigitalReceiptPage />} />
              <Route path="/survey/:token" element={<SurveyPage />} />
              <Route path="/share/statement/:token" element={<PublicStatementPage />} />
              <Route path="/share/dashboard/:token" element={<PublicDashboardPage />} />
              <Route path="/loading-demo" element={<LoadingDemoPage />} />
              <Route path="/portal" element={<Navigate to="/auth" replace />} />
              <Route path="/portal/dashboard" element={<PortalDashboard />} />
              <Route path="/malaki" element={<Navigate to="/auth" replace />} />
              <Route path="/malaki/dashboard" element={<Navigate to="/portal/dashboard" replace />} />
              <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
              <Route path="/setup" element={<ProtectedRoute><SetupPage /></ProtectedRoute>} />
              <Route path="/device-setup" element={<ProtectedRoute><DeviceSetupGuard><DeviceSetupPage /></DeviceSetupGuard></ProtectedRoute>} />
              <Route path="/onboarding/new-device" element={<ProtectedRoute><DeviceSetupGuard><NewDeviceOnboardingPage /></DeviceSetupGuard></ProtectedRoute>} />
              <Route path="/pos" element={<ProtectedRoute><ModuleGuard><POSDeviceAuthGuard><POSPage /></POSDeviceAuthGuard></ModuleGuard></ProtectedRoute>} />
              <Route path="/pos/floor-plan" element={<ProtectedRoute><ModuleGuard><FloorPlanPage /></ModuleGuard></ProtectedRoute>} />
              <Route path="/pos/floor-plan/edit" element={<ProtectedRoute><ModuleGuard><FloorPlanEditorPage /></ModuleGuard></ProtectedRoute>} />
              <Route path="/pos/modifiers" element={<ProtectedRoute><ModuleGuard><ModifierManagerPage /></ModuleGuard></ProtectedRoute>} />
              <Route path="/pos/kitchen" element={<ProtectedRoute><ModuleGuard><KitchenDisplayPage /></ModuleGuard></ProtectedRoute>} />
              <Route path="/pos/order-display" element={<CustomerOrderDisplayPage />} />
              <Route path="/pos/kitchen-display" element={<KitchenDisplayPublicPage />} />
              <Route path="/pos/kds-control" element={<ProtectedRoute><ModuleGuard><KdsControlPage /></ModuleGuard></ProtectedRoute>} />
              <Route path="/purchase-point" element={<Navigate to="/procurement/orders/new" replace />} />
              <Route path="/worker/procurement" element={<ProtectedRoute><WorkerProcurementPage /></ProtectedRoute>} />
              <Route path="/store-tracker" element={<ProtectedRoute><StoreTrackerDashboard /></ProtectedRoute>} />
              <Route path="/store-tracker/orders/:id" element={<ProtectedRoute><StoreTrackerOrderDetail /></ProtectedRoute>} />
              {/* Feedback: standalone shell — no AppSidebar, no WebLayout, no tabs */}
              <Route
                path="/feedback"
                element={
                  <ProtectedRoute>
                    <Suspense fallback={<AuthCheckSpinner />}>
                      <FeatureGuard app="call_center_feedback" feature="customers" perm="view" label="متابعة الزبائن">
                        <FeedbackShell>
                          <FeedbackPage />
                        </FeedbackShell>
                      </FeatureGuard>
                    </Suspense>
                  </ProtectedRoute>
                }
              />
              <Route path="/*" element={
                <ProtectedRoute blockCashier blockStoreTracker blockSalesRep>
                  <WebLayout>
                    <Suspense fallback={<AuthCheckSpinner />}>
                    <Routes>
                      <Route path="/" element={<SmartRedirect />} />
                      <Route path="/apps" element={<AppsLauncher />} />
                      <Route path="/dashboard" element={<HomeDashboard />} />
                      <Route path="/smart-accountant" element={<SmartAccountantPage />} />
                      <Route path="/menu" element={<MenuPage />} />
                      <Route path="/voice" element={<VoiceInput />} />
                      <Route path="/profit-loss" element={<ProfitLoss />} />
                      <Route path="/transactions" element={<JournalEntriesPage />} />
                      <Route path="/accounts" element={<AccountsPage />} />
                      <Route path="/accounts/new" element={<AccountFormPage mode="create" />} />
                      <Route path="/accounts/:accountId/edit" element={<AccountFormPage mode="edit" />} />
                      <Route path="/contacts" element={<ContactsPage />} />

                      {/* CRM Module — Phase 1 */}
                      <Route path="/crm" element={<CrmLayout />}>
                        <Route index element={<CrmDashboard />} />
                        <Route path="leads" element={<CrmLeadsPage />} />
                        <Route path="pipeline" element={<CrmPipelinePage />} />
                        <Route path="activities" element={<CrmActivitiesPage />} />
                        <Route path="customers" element={<CustomerCenterPage />} />
                        <Route path="customer/:id" element={<Customer360Page />} />
                        <Route path="opportunity/:id" element={<OpportunityDetailsPage />} />
                      </Route>
                      <Route path="/contacts/policies" element={<ContactPoliciesPage />} />
                      <Route path="/contacts/:id" element={<ContactDetailPage />} />
                      <Route path="/export" element={<ExportPage />} />
                      <Route path="/smart-report" element={<SmartReportPage />} />
                      <Route path="/invoices" element={<InvoicesPage />} />
                      <Route path="/invoices/recurring" element={<RecurringInvoicesPage />} />
                      <Route path="/invoices/new" element={<FeatureGuard app="sales" feature="invoices" perm="create" label="إنشاء فاتورة"><InvoiceCreatePageWrapper /></FeatureGuard>} />
                      <Route path="/credit-notes" element={<CreditDebitNotesPage noteType="credit" />} />
                      <Route path="/credit-notes/new" element={<CreditDebitNoteCreatePage noteType="credit" />} />
                      <Route path="/debit-notes" element={<CreditDebitNotesPage noteType="debit" />} />
                      <Route path="/debit-notes/new" element={<CreditDebitNoteCreatePage noteType="debit" />} />
                     <Route path="/sales/returns" element={<ReturnsListPage returnType="sales" />} />
                     <Route path="/sales/returns/new" element={<ReturnCreatePage returnType="sales" />} />
                     <Route path="/purchases/returns" element={<ReturnsListPage returnType="purchase" />} />
                     <Route path="/purchases/returns/new" element={<ReturnCreatePage returnType="purchase" />} />
                      <Route path="/inventory" element={<InventoryPage />} />
                      <Route path="/reports" element={<ReportsPage />} />
                      <Route path="/reports/builder" element={<ReportBuilderPage />} />
                      <Route path="/reports/my-reports" element={<MyReportsPage />} />
                      <Route path="/dashboards" element={<DashboardsPage />} />
                      <Route path="/dashboards/:id" element={<DashboardViewPage />} />
                      <Route path="/cheques" element={<ChequesPage />} />
                      <Route path="/profile" element={<ProfilePage />} />
                      <Route path="/balance-sheet" element={<BalanceSheetPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/billing" element={<Navigate to="/pricing" replace />} />
                      <Route path="/subscription" element={<Navigate to="/pricing" replace />} />
                      <Route path="/journal-entries" element={<Navigate to="/transactions" replace />} />
                      <Route path="/trial-balance" element={<TrialBalancePage />} />
                      <Route path="/receipts" element={<Navigate to="/finance/receipts" replace />} />
                      <Route path="/bills" element={<InvoicesPage />} />
                      <Route path="/payments" element={<Navigate to="/finance/payments" replace />} />
                      <Route path="/finance" element={<Navigate to="/finance/receipts" replace />} />
                      <Route path="/accounting-center" element={<AccountingCenterPage />} />
                     <Route path="/finance/receipts" element={<FinanceReceiptsPage />} />
                      <Route path="/finance/payments" element={<FinancePaymentsPage />} />
                      <Route path="/finance/journals" element={<FinanceJournalPage />} />
                      <Route path="/finance/journal/new" element={<FeatureGuard app="finance" feature="journal" perm="create" label="إنشاء قيد"><JournalNewPage /></FeatureGuard>} />
                      <Route path="/finance/receipt/new" element={<FeatureGuard app="finance" feature="receipts" perm="create" label="سند قبض جديد"><VoucherFormPage voucherType="receipt" /></FeatureGuard>} />
                      <Route path="/finance/receipt/:id/edit" element={<FeatureGuard app="finance" feature="receipts" perm="update" label="تعديل سند قبض"><VoucherFormPage voucherType="receipt" /></FeatureGuard>} />
                      <Route path="/finance/payment/new" element={<FeatureGuard app="finance" feature="payments" perm="create" label="سند صرف جديد"><VoucherFormPage voucherType="payment" /></FeatureGuard>} />
                      <Route path="/finance/payment/:id/edit" element={<FeatureGuard app="finance" feature="payments" perm="update" label="تعديل سند صرف"><VoucherFormPage voucherType="payment" /></FeatureGuard>} />
                      <Route path="/finance/cheques" element={<ChequesPage />} />
                      <Route path="/finance/bank-accounts" element={<BankAccountsPage />} />
                      <Route path="/finance/cash-boxes" element={<CashBoxesPage />} />
                      <Route path="/finance/cash-boxes/transfer" element={<CashTransferPage />} />
                      <Route path="/finance/cost-centers" element={<CostCentersPage />} />
                      <Route path="/reports/cash-liquidity" element={<CashLiquidityPage />} />
                      <Route path="/inventory-movements" element={<StockMovementsPage />} />
                      <Route path="/inventory-valuation" element={<InventoryValuationPage />} />
                      <Route path="/employees" element={<HRShell><ModuleGuard><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_view_employees", "can_edit_employees", "can_add_employees"]}><EmployeesPage /></HRPermGuard></RoleGuard></ModuleGuard></HRShell>} />
                      <Route path="/hr" element={<HRShell><ModuleGuard><RoleGuard allowedRoles={["admin", "hr_manager"]}><HrCommandCenter /></RoleGuard></ModuleGuard></HRShell>} />
                      <Route path="/hr/people" element={<HRShell><ModuleGuard><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_view_employees", "can_edit_employees", "can_add_employees"]}><EmployeesPage /></HRPermGuard></RoleGuard></ModuleGuard></HRShell>} />
                      <Route path="/hr/definitions" element={<HRShell><ModuleGuard><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_manage_hr_settings", "can_manage_day_types", "can_manage_shift_templates"]}><HrDefinitionsPage /></HRPermGuard></RoleGuard></ModuleGuard></HRShell>} />
                      <Route path="/hr/day-types" element={<HRShell><ModuleGuard><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_manage_day_types", "can_manage_hr_settings"]}><HrDayTypesPage /></HRPermGuard></RoleGuard></ModuleGuard></HRShell>} />
                      <Route path="/hr/shifts" element={<HRShell><ModuleGuard><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_manage_shift_templates", "can_view_roster", "can_manage_schedule"]}><HrWorkShiftsPage /></HRPermGuard></RoleGuard></ModuleGuard></HRShell>} />
                      <Route path="/manager/roster" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager", "branch_scheduler"]} allowEmployeePerm="can_manage_schedule"><HRPermGuard requires={["can_view_roster", "can_manage_schedule", "can_publish_roster"]}><BranchRosterPage /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/manager/rep-reports" element={<RoleGuard allowedRoles={["admin", "accountant_senior"]}><RepReportsPage /></RoleGuard>} />
                      <Route path="/attendance/roster" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager", "branch_scheduler"]} allowEmployeePerm="can_manage_schedule"><HRPermGuard requires={["can_view_roster", "can_manage_schedule", "can_publish_roster"]}><BranchRosterPage /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/hr/settings" element={<HRShell><ModuleGuard><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_manage_hr_settings"]}><HrSettingsPage /></HRPermGuard></RoleGuard></ModuleGuard></HRShell>} />
                      <Route path="/hr/policy-assignment" element={<HRShell><ModuleGuard><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_manage_hr_settings"]}><PolicyAssignmentPage /></HRPermGuard></RoleGuard></ModuleGuard></HRShell>} />
                      <Route path="/hr/employee/:id" element={<HRShell><ModuleGuard><RoleGuard allowedRoles={["admin", "hr_manager"]}><Employee360Page /></RoleGuard></ModuleGuard></HRShell>} />
                      <Route path="/employee-forms-management" element={<HRShell><ModuleGuard><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_manage_forms", "can_approve_requests"]}><EmployeeFormsManagementPage /></HRPermGuard></RoleGuard></ModuleGuard></HRShell>} />
                      <Route path="/sales-reps" element={<SalesRepresentativesPage />} />
                      <Route path="/admin/sales-reps-live" element={<RoleGuard allowedRoles={["admin"]}><SalesRepsLivePage /></RoleGuard>} />
                      <Route path="/admin/sales-rep-orders" element={<RoleGuard allowedRoles={["admin"]}><SalesRepOrdersPage /></RoleGuard>} />
                      <Route path="/admin/rep-unposted-orders" element={<RoleGuard allowedRoles={["admin"]}><RepUnpostedOrdersPage /></RoleGuard>} />
                      <Route path="/warehouses" element={<WarehousesPage />} />
                      <Route path="/stock-transfers" element={<StockTransfersPage />} />
                      <Route path="/van-days" element={<VanDaysPage />} />
                      {/* /van أصبح alias قديم — يوجّه إلى تطبيق المندوب الموحد /rep */}
                      <Route path="/van" element={<Navigate to="/rep" replace />} />
                      <Route path="/van-commissions" element={<VanCommissionsPage />} />
                      <Route path="/van-reports" element={<VanReportsPage />} />
                      <Route path="/orders" element={<OrdersPage />} />
                      <Route path="/orders/:id" element={<OrderDetailPage />} />
                      <Route path="/delivery-notes" element={<DeliveryNotesPage />} />
                      <Route path="/delivery-notes/new" element={<DeliveryNoteCreatePage />} />
                      <Route path="/delivery-notes/:id" element={<DeliveryNoteCreatePage />} />
                      <Route path="/my-attendance" element={<EmployeeAttendancePage />} />
                      <Route path="/hr-attendance" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_view_attendance", "can_manage_attendance"]}><HRAttendancePage /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/advances" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_manage_advances"]}><AdvancesPage /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/loans" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_manage_loans"]}><LoansPage /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/hr-deductions" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_manage_deductions"]}><HRDeductionsPage /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/payroll" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_view_payroll", "can_process_payroll"]}><PayrollPage /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/payroll/inputs" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_process_payroll"]}><MonthlyPayrollInputPage /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/payroll/preview-all" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_preview_payroll", "can_process_payroll"]}><PayrollPreviewAllPage /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/payroll/approval" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_approve_payroll"]}><PayrollApprovalCenter /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/payroll/payment" element={<HRShell><RoleGuard allowedRoles={["admin", "accountant_senior"]}><PayrollPaymentCenter /></RoleGuard></HRShell>} />
                      <Route path="/hr/__engine-comparison" element={<RoleGuard allowedRoles={["admin"]}><PayrollEngineComparisonPage /></RoleGuard>} />
                      <Route path="/hr/__payroll-settings-v2" element={<RoleGuard allowedRoles={["admin"]}><PayrollSettingsV2Page /></RoleGuard>} />
                      <Route path="/leaves" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_view_leaves", "can_approve_leaves", "can_manage_leave_policy"]}><LeavesPage /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/hr/import-employees" element={<Navigate to="/employees" replace />} />
                      <Route path="/payroll-settings" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_manage_hr_settings"]}><PayrollSettingsPage /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/opening-balances-import" element={<OpeningBalancesImportPage />} />
                      <Route path="/currency-management" element={<CurrencyManagementPage />} />
                      <Route path="/fixed-assets" element={<FixedAssetsPage />} />
                      <Route path="/warranty" element={<WarrantyHomePage />} />
                      <Route path="/warranty/policies" element={<WarrantyPoliciesPage />} />
                      <Route path="/warranty/cards" element={<WarrantyCardsPage />} />
                      <Route path="/warranty/claims" element={<WarrantyClaimsPage />} />
                      <Route path="/warranty/supplier-claims" element={<WarrantySupplierClaimsPage />} />
                      <Route path="/warranty/reports" element={<WarrantyReportsPage />} />
                      <Route path="/general-ledger" element={<GeneralLedgerPage />} />
                      <Route path="/account-statement" element={<AccountStatementPage />} />
                      <Route path="/reports/hr-payroll" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_view_hr_payroll_reports", "can_view_salary_info"]}><HRPayrollReport /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/reports/hr-attendance" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_view_hr_attendance_reports", "can_view_hr_reports"]}><HRAttendanceReport /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/hr/reports" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_view_hr_reports", "can_view_hr_attendance_reports"]}><HRReportsPage /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/reports/hr-leaves" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_view_hr_leave_reports", "can_view_hr_reports"]}><HRLeaveReport /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/reports/hr-staff-cost" element={<HRShell><RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPermGuard requires={["can_view_hr_staff_cost_reports", "can_view_staff_cost"]}><HRStaffCostReport /></HRPermGuard></RoleGuard></HRShell>} />
                      <Route path="/reports/ar-aging" element={<GenericReportPage reportKey="ar-aging" />} />
                      <Route path="/reports/ap-aging" element={<GenericReportPage reportKey="ap-aging" />} />
                      <Route path="/reports/cash-flow" element={<GenericReportPage reportKey="cash-flow" />} />
                      <Route path="/reports/cash-movement" element={<GenericReportPage reportKey="cash-movement" />} />
                      <Route path="/reports/bank-movement" element={<GenericReportPage reportKey="bank-movement" />} />
                      <Route path="/reports/cheques" element={<GenericReportPage reportKey="cheques" />} />
                      <Route path="/reports/total-sales" element={<GenericReportPage reportKey="total-sales" />} />
                      <Route path="/reports/invoice-register" element={<GenericReportPage reportKey="invoice-register" />} />
                      <Route path="/reports/by-customer" element={<GenericReportPage reportKey="by-customer" />} />
                      <Route path="/reports/collections" element={<GenericReportPage reportKey="collections" />} />
                      <Route path="/reports/daily-sales" element={<GenericReportPage reportKey="daily-sales" />} />
                      <Route path="/reports/sales-returns" element={<GenericReportPage reportKey="sales-returns" />} />
                      <Route path="/reports/sales-by-product" element={<GenericReportPage reportKey="sales-by-product" />} />
                      <Route path="/reports/sales-performance" element={<GenericReportPage reportKey="sales-performance" />} />
                      <Route path="/reports/total-purchases" element={<GenericReportPage reportKey="total-purchases" />} />
                      <Route path="/reports/purchase-invoice-register" element={<GenericReportPage reportKey="purchase-invoice-register" />} />
                      <Route path="/reports/by-supplier" element={<GenericReportPage reportKey="by-supplier" />} />
                      <Route path="/reports/supplier-payments" element={<GenericReportPage reportKey="supplier-payments" />} />
                      <Route path="/reports/purchase-returns" element={<GenericReportPage reportKey="purchase-returns" />} />
                      <Route path="/reports/supplier-comparison" element={<GenericReportPage reportKey="supplier-comparison" />} />
                      <Route path="/reports/inventory-valuation" element={<GenericReportPage reportKey="inventory-valuation" />} />
                      <Route path="/reports/stock-movement" element={<GenericReportPage reportKey="stock-movement" />} />
                      <Route path="/reports/purchases-by-product" element={<GenericReportPage reportKey="purchases-by-product" />} />
                      <Route path="/reports/inventory-reconciliation" element={<GenericReportPage reportKey="inventory-reconciliation" />} />
                      <Route path="/reports/product-card" element={<GenericReportPage reportKey="product-card" />} />
                      <Route path="/reports/below-reorder" element={<GenericReportPage reportKey="below-reorder" />} />
                      <Route path="/reports/dead-stock" element={<GenericReportPage reportKey="dead-stock" />} />
                      <Route path="/reports/product-profitability" element={<GenericReportPage reportKey="product-profitability" />} />
                      <Route path="/reports/employee-directory" element={<GenericReportPage reportKey="employee-directory" />} />
                      <Route path="/reports/employee-withdrawals" element={<GenericReportPage reportKey="employee-withdrawals" />} />
                      <Route path="/reports/asset-register" element={<GenericReportPage reportKey="asset-register" />} />
                      <Route path="/reports/monthly-depreciation" element={<GenericReportPage reportKey="monthly-depreciation" />} />
                      <Route path="/reports/depreciation-schedule" element={<GenericReportPage reportKey="depreciation-schedule" />} />
                      <Route path="/reports/fully-depreciated" element={<GenericReportPage reportKey="fully-depreciated" />} />
                      <Route path="/reports/asset-disposal" element={<GenericReportPage reportKey="asset-disposal" />} />
                      <Route path="/reports/assets-by-location" element={<GenericReportPage reportKey="assets-by-location" />} />
                      <Route path="/reports/exchange-rates" element={<GenericReportPage reportKey="exchange-rates" />} />
                      <Route path="/reports/currency-conversions" element={<GenericReportPage reportKey="currency-conversions" />} />
                      <Route path="/reports/foreign-balances" element={<GenericReportPage reportKey="foreign-balances" />} />
                      <Route path="/reports/exchange-gain-loss" element={<GenericReportPage reportKey="exchange-gain-loss" />} />
                      <Route path="/reports/all-orders" element={<GenericReportPage reportKey="all-orders" />} />
                      <Route path="/reports/order-performance" element={<GenericReportPage reportKey="order-performance" />} />
                      <Route path="/reports/vat-reconciliation" element={<GenericReportPage reportKey="vat-reconciliation" />} />
                      <Route path="/reports/pos-gl-reconciliation" element={<GenericReportPage reportKey="pos-gl-reconciliation" />} />
                      <Route path="/reports/pos-daily-sales" element={<GenericReportPage reportKey="pos-daily-sales" />} />
                      <Route path="/reports/pos-sales-by-category" element={<GenericReportPage reportKey="pos-sales-by-category" />} />
                      <Route path="/reports/pos-period-comparison" element={<GenericReportPage reportKey="pos-period-comparison" />} />
                      <Route path="/reports/pos-invoice-register" element={<GenericReportPage reportKey="pos-invoice-register" />} />
                      <Route path="/pos/invoice/:id" element={<PosInvoiceDetailPage />} />
                      <Route path="/reports/pos-pending-orders" element={<GenericReportPage reportKey="pos-pending-orders" />} />
                      <Route path="/reports/pos-invoice-timing" element={<GenericReportPage reportKey="pos-invoice-timing" />} />
                      <Route path="/reports/pos-shift-open-close" element={<GenericReportPage reportKey="pos-shift-open-close" />} />
                      <Route path="/reports/pos-payment-methods" element={<GenericReportPage reportKey="pos-payment-methods" />} />
                      <Route path="/reports/pos-credit-sales" element={<GenericReportPage reportKey="pos-credit-sales" />} />
                      <Route path="/reports/pos-product-movement" element={<GenericReportPage reportKey="pos-product-movement" />} />
                      <Route path="/reports/pos-category-totals" element={<GenericReportPage reportKey="pos-category-totals" />} />
                      <Route path="/reports/pos-cash-reconciliation" element={<GenericReportPage reportKey="pos-cash-reconciliation" />} />
                      <Route path="/reports/pos-cashier-performance" element={<GenericReportPage reportKey="pos-cashier-performance" />} />
                      <Route path="/reports/pos-cancelled" element={<GenericReportPage reportKey="pos-cancelled" />} />
                      <Route path="/reports/pos-peak-hours" element={<GenericReportPage reportKey="pos-peak-hours" />} />
                      <Route path="/reports/ar-aging-detail" element={<GenericReportPage reportKey="ar-aging-detail" />} />
                      <Route path="/reports/dso-report" element={<GenericReportPage reportKey="dso-report" />} />
                      <Route path="/reports/checks-receivable" element={<GenericReportPage reportKey="checks-receivable" />} />
                      <Route path="/reports/customer-profitability" element={<GenericReportPage reportKey="customer-profitability" />} />
                      <Route path="/reports/customer-statement-all" element={<GenericReportPage reportKey="customer-statement-all" />} />
                      <Route path="/reports/ap-aging-detail" element={<GenericReportPage reportKey="ap-aging-detail" />} />
                      <Route path="/reports/dpo-report" element={<GenericReportPage reportKey="dpo-report" />} />
                      <Route path="/reports/checks-payable" element={<GenericReportPage reportKey="checks-payable" />} />
                      <Route path="/reports/supplier-purchase-analysis" element={<GenericReportPage reportKey="supplier-purchase-analysis" />} />
                      <Route path="/reports/supplier-statement-all" element={<GenericReportPage reportKey="supplier-statement-all" />} />
                      <Route path="/reports/invoice-lifecycle" element={<GenericReportPage reportKey="invoice-lifecycle" />} />
                      <Route path="/reports/dso-detailed" element={<GenericReportPage reportKey="dso-detailed" />} />
                      <Route path="/reports/ar-aging-advanced" element={<GenericReportPage reportKey="ar-aging-advanced" />} />
                      <Route path="/reports/collection-efficiency" element={<GenericReportPage reportKey="collection-efficiency" />} />
                      <Route path="/reports/payment-allocation" element={<GenericReportPage reportKey="payment-allocation" />} />
                      <Route path="/reports/unpaid-invoices" element={<GenericReportPage reportKey="unpaid-invoices" />} />
                      <Route path="/reports/collection-dashboard" element={<CollectionDashboardPage />} />
                      <Route path="/reports/financial-kpi" element={<GenericReportPage reportKey="financial-kpi" />} />
                      <Route path="/reports/month-comparison" element={<GenericReportPage reportKey="month-comparison" />} />
                      <Route path="/reports/periodic" element={<PeriodicReportsPage />} />
                      <Route path="/reports/van-sales" element={<VanSalesReportsPage />} />
                      <Route path="/customization" element={<CustomizationPage />} />
                      <Route path="/customization/templates" element={<IndustryTemplatesPage />} />
                      <Route path="/customization/request" element={<CustomizationRequestPage />} />
                      <Route path="/support/tickets" element={<SupportTicketsPage />} />
                      <Route path="/support/tickets/:id" element={<TicketDetailPage />} />
                      <Route path="/support/admin" element={<RoleGuard allowedRoles={["admin"]}><SupportAdminPage /></RoleGuard>} />
                      
                      <Route path="/pos-users" element={<ModuleGuard><FeatureGuard app="settings" feature="users" perm="manage" label="إدارة مستخدمي نقطة البيع"><POSUserManagementPage /></FeatureGuard></ModuleGuard>} />
                      <Route path="/pos-customers" element={<ModuleGuard><POSCustomerDatabasePage /></ModuleGuard>} />
                      <Route path="/pos-reports" element={<ModuleGuard><POSReportsPage /></ModuleGuard>} />
                      <Route path="/printer-settings" element={<PrinterSettingsPage />} />
                      <Route path="/call-center-reports" element={<CallCenterReportsPage />} />
                      <Route path="/customer-reports" element={<CustomerReportsPage />} />
                      <Route path="/contractor" element={<ContractorApp />} />
                      <Route path="/workshops" element={<WorkshopsPage />} />
                      <Route path="/workshop-reports" element={<WorkshopReportsPage />} />
                      <Route path="/tasks" element={<TaskBoardPage />} />
                      <Route path="/tasks/board" element={<TaskBoardPage />} />
                      <Route path="/tasks/admin" element={<TaskAdminPage />} />
                      <Route path="/tasks/display" element={<TaskDisplayPage />} />
                      <Route path="/travel" element={<TravelDashboard />} />
                      <Route path="/travel/bookings" element={<TravelBookingsPage />} />
                      <Route path="/travel/bookings/new" element={<TravelBookingFormPage />} />
                      <Route path="/travel/bookings/:id" element={<TravelBookingDetailPage />} />
                      <Route path="/travel/bookings/:id/edit" element={<TravelBookingFormPage />} />
                      <Route path="/travel/bookings/:id/print" element={<TravelBookingPrintPage />} />
                      <Route path="/travel/suppliers" element={<TravelSuppliersPage />} />
                      <Route path="/travel/packages" element={<TravelPackagesPage />} />
                      <Route path="/travel/reports" element={<TravelReportsPage />} />
                      <Route path="/travel/settings" element={<TravelSettingsPage />} />
                      <Route path="/contracts" element={<ContractsListPage />} />
                      <Route path="/contracts/new" element={<ContractFormPage />} />
                      <Route path="/contracts/:id/edit" element={<ContractFormPage />} />
                      <Route path="/contracts/:id/preview" element={<ContractPreviewPage />} />
                      <Route path="/purchases/import" element={<ImportShipmentsPage />} />
                      <Route path="/purchases/import/new" element={<ImportWizardPage />} />
                      <Route path="/purchases/import/:id" element={<ImportDetailPage />} />
                      <Route path="/procurement/orders" element={<PurchaseOrdersPage />} />
                      <Route path="/procurement/orders/new" element={<PurchaseOrderCreatePage />} />
                      <Route path="/procurement/invoices" element={<ProcurementInvoicesPage />} />
                      <Route path="/procurement/invoices/new" element={<FeatureGuard app="purchases" feature="purchase_invoices" perm="create" label="فاتورة مشتريات جديدة"><ProcurementInvoiceCreatePage /></FeatureGuard>} />
                      <Route path="/procurement/supplier-statement" element={<SupplierStatementPage />} />
                      <Route path="/procurement/weekly-report" element={<WeeklyProcurementReportPage />} />
                      <Route path="/procurement/settings" element={<ProcurementSettingsPage />} />
                      <Route path="/reports/import-cost-analysis" element={<GenericReportPage reportKey="import-cost-analysis" />} />
                      <Route path="/print-preview" element={<PrintPreviewPage />} />
                      <Route path="/print-templates" element={<PrintTemplatesPage />} />
                      <Route path="/print-templates/designer/:templateType" element={<TemplateDesignerPage />} />
                      <Route path="/tax" element={<TaxCenterPage />} />
                      <Route path="/help" element={<HelpCenterPage />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                    </Suspense>
                  </WebLayout>
                </ProtectedRoute>
              } />
            </Routes>
            </Suspense>
            </CompanyThemeProvider>
            </CompanyProvider>
            </ReadOnlyProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
