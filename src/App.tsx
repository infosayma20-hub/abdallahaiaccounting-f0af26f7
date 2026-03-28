import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useRoleRedirect } from "@/hooks/useRoleRedirect";
import { ThemeProvider } from "@/hooks/useTheme";
import { CompanyProvider } from "@/hooks/useCompanyContext";
import { CompanyThemeProvider } from "@/hooks/useCompanyTheme";
import { ReadOnlyProvider } from "@/contexts/ReadOnlyContext";
import WebLayout from "./components/layout/WebLayout";
import RoleGuard from "./components/RoleGuard";

// Lazy-loaded pages for code splitting
const HomeDashboard = lazy(() => import("./pages/HomeDashboard"));
const SmartAccountantPage = lazy(() => import("./pages/SmartAccountantPage"));
const MenuPage = lazy(() => import("./pages/MenuPage"));
const VoiceInput = lazy(() => import("./pages/VoiceInput"));
const ProfitLoss = lazy(() => import("./pages/ProfitLoss"));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage"));
const AccountsPage = lazy(() => import("./pages/AccountsPage"));
const AccountFormPage = lazy(() => import("./pages/AccountFormPage"));
const ContactsPage = lazy(() => import("./pages/ContactsPage"));
const ContactDetailPage = lazy(() => import("./pages/ContactDetailPage"));
const ContactPoliciesPage = lazy(() => import("./pages/ContactPoliciesPage"));
const ExportPage = lazy(() => import("./pages/ExportPage"));
const SmartReportPage = lazy(() => import("./pages/SmartReportPage"));
const JournalEntriesPage = lazy(() => import("./pages/JournalEntriesPage"));
const TrialBalancePage = lazy(() => import("./pages/TrialBalancePage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const InvoicesPage = lazy(() => import("./pages/InvoicesPage"));
const InvoiceCreatePage = lazy(() => import("./pages/InvoiceCreatePage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const StockMovementsPage = lazy(() => import("./pages/StockMovementsPage"));
const InventoryValuationPage = lazy(() => import("./pages/InventoryValuationPage"));
const BalanceSheetPage = lazy(() => import("./pages/BalanceSheetPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));
const EmployeeFormsManagementPage = lazy(() => import("./pages/EmployeeFormsManagementPage"));
const SalesRepresentativesPage = lazy(() => import("./pages/SalesRepresentativesPage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
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
const AppsLauncher = lazy(() => import("./pages/AppsLauncher"));
const OpeningBalancesImportPage = lazy(() => import("./pages/OpeningBalancesImportPage"));
const CurrencyManagementPage = lazy(() => import("./pages/CurrencyManagementPage"));
const FixedAssetsPage = lazy(() => import("./pages/FixedAssetsPage"));
const GeneralLedgerPage = lazy(() => import("./pages/GeneralLedgerPage"));
const AccountStatementPage = lazy(() => import("./pages/AccountStatementPage"));
const HRPayrollReport = lazy(() => import("./pages/reports/HRPayrollReport"));
const HRAttendanceReport = lazy(() => import("./pages/reports/HRAttendanceReport"));
const HRLeaveReport = lazy(() => import("./pages/reports/HRLeaveReport"));
const HRStaffCostReport = lazy(() => import("./pages/reports/HRStaffCostReport"));
const GenericReportPage = lazy(() => import("./pages/reports/GenericReportPage"));
const CollectionDashboardPage = lazy(() => import("./pages/reports/CollectionDashboardPage"));
const PeriodicReportsPage = lazy(() => import("./pages/reports/PeriodicReportsPage"));
const CustomizationPage = lazy(() => import("./pages/CustomizationPage"));
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
const POSCustomerDatabasePage = lazy(() => import("./pages/POSCustomerDatabasePage"));
const SuperAdminDashboard = lazy(() => import("./pages/SuperAdminDashboard"));
const SuperAdminLoginPage = lazy(() => import("./pages/SuperAdminLoginPage"));
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
const MonthlyPayrollInputPage = lazy(() => import("./pages/MonthlyPayrollInputPage"));
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
const BillingPage = lazy(() => import("./pages/BillingPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage"));
const SetupPage = lazy(() => import("./pages/SetupPage"));
const FinanceHomePage = lazy(() => import("./pages/FinanceHomePage"));
const FinanceVoucherPage = lazy(() => import("./pages/FinanceVoucherPage"));
const FinanceJournalPage = lazy(() => import("./pages/FinanceJournalPage"));
const KitchenDisplayPage = lazy(() => import("./pages/KitchenDisplayPage"));
const BankAccountsPage = lazy(() => import("./pages/BankAccountsPage"));
const CashBoxesPage = lazy(() => import("./pages/CashBoxesPage"));
const CashTransferPage = lazy(() => import("./pages/CashTransferPage"));
const VoucherFormPage = lazy(() => import("./pages/VoucherFormPage"));
const JournalNewPage = lazy(() => import("./pages/JournalNewPage"));
const PortalLogin = lazy(() => import("./pages/portal/PortalLogin"));
const PortalDashboard = lazy(() => import("./pages/portal/PortalDashboard"));
const PortalSettings = lazy(() => import("./pages/portal/PortalSettings"));
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

const queryClient = new QueryClient();

// Minimal inline spinner for auth checks and lazy loading
const AuthCheckSpinner = () => (
  <div className="flex h-screen w-full items-center justify-center bg-background">
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

const ProtectedRoute = ({ children, blockCashier }: { children: React.ReactNode; blockCashier?: boolean }) => {
  const { user, loading } = useAuth();
  const { targetPath, checking } = useRoleRedirect();
  if (loading || (blockCashier && checking)) return <AuthCheckSpinner />;
  if (!user) return <Navigate to="/auth" replace />;
  if (blockCashier && targetPath === "/pos") return <Navigate to="/pos" replace />;
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
        <BrowserRouter>
          <AuthProvider>
            <ReadOnlyProvider>
            <CompanyProvider>
            <CompanyThemeProvider>
            <Suspense fallback={<AuthCheckSpinner />}>
            <Routes>
              <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/branch-display/:branchId" element={<BranchDisplayPage />} />
              <Route path="/super-admin/login" element={<SuperAdminLoginPage />} />
              <Route path="/super-admin/dashboard" element={<ProtectedRoute><SuperAdminDashboard /></ProtectedRoute>} />
              <Route path="/employee" element={<ProtectedRoute><RoleGuard allowedRoles={["employee"]} fallback="/auth"><EmployeeApp /></RoleGuard></ProtectedRoute>} />
              <Route path="/receipt/:orderId" element={<DigitalReceiptPage />} />
              <Route path="/survey/:token" element={<SurveyPage />} />
              <Route path="/loading-demo" element={<LoadingDemoPage />} />
              <Route path="/portal" element={<Navigate to="/auth" replace />} />
              <Route path="/portal/dashboard" element={<PortalDashboard />} />
              <Route path="/portal/settings" element={<PortalSettings />} />
              <Route path="/malaki" element={<Navigate to="/auth" replace />} />
              <Route path="/malaki/dashboard" element={<Navigate to="/portal/dashboard" replace />} />
              <Route path="/malaki/settings" element={<Navigate to="/portal/settings" replace />} />
              <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
              <Route path="/setup" element={<ProtectedRoute><SetupPage /></ProtectedRoute>} />
              <Route path="/pos" element={<ProtectedRoute><POSPage /></ProtectedRoute>} />
              <Route path="/pos/floor-plan" element={<ProtectedRoute><FloorPlanPage /></ProtectedRoute>} />
              <Route path="/pos/floor-plan/edit" element={<ProtectedRoute><FloorPlanEditorPage /></ProtectedRoute>} />
              <Route path="/pos/modifiers" element={<ProtectedRoute><ModifierManagerPage /></ProtectedRoute>} />
              <Route path="/pos/kitchen" element={<ProtectedRoute><KitchenDisplayPage /></ProtectedRoute>} />
              <Route path="/purchase-point" element={<Navigate to="/procurement/orders/new" replace />} />
              <Route path="/worker/procurement" element={<ProtectedRoute><WorkerProcurementPage /></ProtectedRoute>} />
              <Route path="/*" element={
                <ProtectedRoute blockCashier>
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
                      <Route path="/transactions" element={<TransactionsPage />} />
                      <Route path="/accounts" element={<AccountsPage />} />
                      <Route path="/accounts/new" element={<AccountFormPage mode="create" />} />
                      <Route path="/accounts/:accountId/edit" element={<AccountFormPage mode="edit" />} />
                      <Route path="/contacts" element={<ContactsPage />} />
                      <Route path="/contacts/policies" element={<ContactPoliciesPage />} />
                      <Route path="/contacts/:id" element={<ContactDetailPage />} />
                      <Route path="/export" element={<ExportPage />} />
                      <Route path="/smart-report" element={<SmartReportPage />} />
                      <Route path="/invoices" element={<InvoicesPage />} />
                      <Route path="/invoices/new" element={<InvoiceCreatePage />} />
                      <Route path="/inventory" element={<InventoryPage />} />
                      <Route path="/reports" element={<ReportsPage />} />
                      <Route path="/cheques" element={<ChequesPage />} />
                      <Route path="/profile" element={<ProfilePage />} />
                      <Route path="/balance-sheet" element={<BalanceSheetPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/billing" element={<BillingPage />} />
                      <Route path="/subscription" element={<SubscriptionPage />} />
                      <Route path="/journal-entries" element={<Navigate to="/transactions" replace />} />
                      <Route path="/trial-balance" element={<TrialBalancePage />} />
                      <Route path="/receipts" element={<Navigate to="/finance/receipts" replace />} />
                      <Route path="/bills" element={<InvoicesPage />} />
                      <Route path="/payments" element={<Navigate to="/finance/payments" replace />} />
                      <Route path="/finance" element={<Navigate to="/finance/receipts" replace />} />
                      <Route path="/finance/receipts" element={<FinanceVoucherPage voucherType="receipt" />} />
                      <Route path="/finance/payments" element={<FinanceVoucherPage voucherType="payment" />} />
                      <Route path="/finance/journals" element={<FinanceJournalPage />} />
                      <Route path="/finance/journal/new" element={<JournalNewPage />} />
                      <Route path="/finance/receipt/new" element={<VoucherFormPage voucherType="receipt" />} />
                      <Route path="/finance/receipt/:id/edit" element={<VoucherFormPage voucherType="receipt" />} />
                      <Route path="/finance/payment/new" element={<VoucherFormPage voucherType="payment" />} />
                      <Route path="/finance/payment/:id/edit" element={<VoucherFormPage voucherType="payment" />} />
                      <Route path="/finance/cheques" element={<ChequesPage />} />
                      <Route path="/finance/bank-accounts" element={<BankAccountsPage />} />
                      <Route path="/finance/cash-boxes" element={<CashBoxesPage />} />
                      <Route path="/finance/cash-boxes/transfer" element={<CashTransferPage />} />
                      <Route path="/inventory-movements" element={<StockMovementsPage />} />
                      <Route path="/inventory-valuation" element={<InventoryValuationPage />} />
                      <Route path="/employees" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><EmployeesPage /></RoleGuard>} />
                      <Route path="/employee-forms-management" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><EmployeeFormsManagementPage /></RoleGuard>} />
                      <Route path="/sales-reps" element={<SalesRepresentativesPage />} />
                      <Route path="/orders" element={<OrdersPage />} />
                      <Route path="/my-attendance" element={<EmployeeAttendancePage />} />
                      <Route path="/hr-attendance" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><HRAttendancePage /></RoleGuard>} />
                      <Route path="/advances" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><AdvancesPage /></RoleGuard>} />
                      <Route path="/loans" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><LoansPage /></RoleGuard>} />
                      <Route path="/hr-deductions" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><HRDeductionsPage /></RoleGuard>} />
                      <Route path="/payroll" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><PayrollPage /></RoleGuard>} />
                      <Route path="/payroll/inputs" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><MonthlyPayrollInputPage /></RoleGuard>} />
                      <Route path="/leaves" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><LeavesPage /></RoleGuard>} />
                      <Route path="/hr/import-employees" element={<Navigate to="/employees" replace />} />
                      <Route path="/payroll-settings" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><PayrollSettingsPage /></RoleGuard>} />
                      <Route path="/opening-balances-import" element={<OpeningBalancesImportPage />} />
                      <Route path="/currency-management" element={<CurrencyManagementPage />} />
                      <Route path="/fixed-assets" element={<FixedAssetsPage />} />
                      <Route path="/general-ledger" element={<GeneralLedgerPage />} />
                      <Route path="/account-statement" element={<AccountStatementPage />} />
                      <Route path="/reports/hr-payroll" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPayrollReport /></RoleGuard>} />
                      <Route path="/reports/hr-attendance" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><HRAttendanceReport /></RoleGuard>} />
                      <Route path="/reports/hr-leaves" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><HRLeaveReport /></RoleGuard>} />
                      <Route path="/reports/hr-staff-cost" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><HRStaffCostReport /></RoleGuard>} />
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
                      <Route path="/reports/below-reorder" element={<GenericReportPage reportKey="below-reorder" />} />
                      <Route path="/reports/dead-stock" element={<GenericReportPage reportKey="dead-stock" />} />
                      <Route path="/reports/product-profitability" element={<GenericReportPage reportKey="product-profitability" />} />
                      <Route path="/reports/employee-directory" element={<GenericReportPage reportKey="employee-directory" />} />
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
                      <Route path="/reports/pos-daily-sales" element={<GenericReportPage reportKey="pos-daily-sales" />} />
                      <Route path="/reports/pos-sales-by-category" element={<GenericReportPage reportKey="pos-sales-by-category" />} />
                      <Route path="/reports/pos-period-comparison" element={<GenericReportPage reportKey="pos-period-comparison" />} />
                      <Route path="/reports/pos-invoice-register" element={<GenericReportPage reportKey="pos-invoice-register" />} />
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
                      <Route path="/customization" element={<CustomizationPage />} />
                      <Route path="/customization/templates" element={<IndustryTemplatesPage />} />
                      <Route path="/customization/request" element={<CustomizationRequestPage />} />
                      <Route path="/support/tickets" element={<SupportTicketsPage />} />
                      <Route path="/support/tickets/:id" element={<TicketDetailPage />} />
                      <Route path="/support/admin" element={<RoleGuard allowedRoles={["admin"]}><SupportAdminPage /></RoleGuard>} />
                      <Route path="/pos-users" element={<POSUserManagementPage />} />
                      <Route path="/pos-customers" element={<POSCustomerDatabasePage />} />
                      <Route path="/pos-reports" element={<POSReportsPage />} />
                      <Route path="/printer-settings" element={<PrinterSettingsPage />} />
                      <Route path="/call-center-reports" element={<CallCenterReportsPage />} />
                      <Route path="/customer-reports" element={<CustomerReportsPage />} />
                      <Route path="/contractor" element={<ContractorApp />} />
                      <Route path="/workshops" element={<WorkshopsPage />} />
                      <Route path="/workshop-reports" element={<WorkshopReportsPage />} />
                      <Route path="/tasks" element={<TaskLoginPage />} />
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
                      <Route path="/procurement/invoices/new" element={<ProcurementInvoiceCreatePage />} />
                      <Route path="/procurement/supplier-statement" element={<SupplierStatementPage />} />
                      <Route path="/procurement/weekly-report" element={<WeeklyProcurementReportPage />} />
                      <Route path="/procurement/settings" element={<ProcurementSettingsPage />} />
                      <Route path="/reports/import-cost-analysis" element={<GenericReportPage reportKey="import-cost-analysis" />} />
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
