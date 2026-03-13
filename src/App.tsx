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
import HomeDashboard from "./pages/HomeDashboard";
import SmartAccountantPage from "./pages/SmartAccountantPage";
import MenuPage from "./pages/MenuPage";
import VoiceInput from "./pages/VoiceInput";
import ProfitLoss from "./pages/ProfitLoss";
import TransactionsPage from "./pages/TransactionsPage";
import AccountsPage from "./pages/AccountsPage";
import ContactsPage from "./pages/ContactsPage";
import ContactDetailPage from "./pages/ContactDetailPage";
import ContactPoliciesPage from "./pages/ContactPoliciesPage";
import ExportPage from "./pages/ExportPage";
import SmartReportPage from "./pages/SmartReportPage";
import JournalEntriesPage from "./pages/JournalEntriesPage";
import TrialBalancePage from "./pages/TrialBalancePage";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import PricingPage from "./pages/PricingPage";
import InvoicesPage from "./pages/InvoicesPage";
import InvoiceCreatePage from "./pages/InvoiceCreatePage";
import InventoryPage from "./pages/InventoryPage";
import StockMovementsPage from "./pages/StockMovementsPage";
import InventoryValuationPage from "./pages/InventoryValuationPage";
import BalanceSheetPage from "./pages/BalanceSheetPage";
import ReportsPage from "./pages/ReportsPage";
import EmployeesPage from "./pages/EmployeesPage";
import SalesRepresentativesPage from "./pages/SalesRepresentativesPage";
import OrdersPage from "./pages/OrdersPage";
import ChequesPage from "./pages/ChequesPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import ProfilePage from "./pages/ProfilePage";
import NotFound from "./pages/NotFound";
// LoadingScreen removed from route guards — now using lightweight AuthCheckSpinner
import EmployeeAttendancePage from "./pages/EmployeeAttendancePage";
import HRAttendancePage from "./pages/HRAttendancePage";
import BranchDisplayPage from "./pages/BranchDisplayPage";
import EmployeeApp from "./pages/EmployeeApp";
import RoleGuard from "./components/RoleGuard";
import VoucherPage from "./pages/VoucherPage";
import AppsLauncher from "./pages/AppsLauncher";
import OpeningBalancesImportPage from "./pages/OpeningBalancesImportPage";
import CurrencyManagementPage from "./pages/CurrencyManagementPage";
import FixedAssetsPage from "./pages/FixedAssetsPage";
import GeneralLedgerPage from "./pages/GeneralLedgerPage";
import AccountStatementPage from "./pages/AccountStatementPage";
import HRPayrollReport from "./pages/reports/HRPayrollReport";
import HRAttendanceReport from "./pages/reports/HRAttendanceReport";
import HRLeaveReport from "./pages/reports/HRLeaveReport";
import HRStaffCostReport from "./pages/reports/HRStaffCostReport";
import GenericReportPage from "./pages/reports/GenericReportPage";
import CollectionDashboardPage from "./pages/reports/CollectionDashboardPage";
import PeriodicReportsPage from "./pages/reports/PeriodicReportsPage";
import CustomizationPage from "./pages/CustomizationPage";
import SettingsPage from "./pages/SettingsPage";
import IndustryTemplatesPage from "./pages/IndustryTemplatesPage";
import CustomizationRequestPage from "./pages/CustomizationRequestPage";
import SupportTicketsPage from "./pages/SupportTicketsPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import SupportAdminPage from "./pages/SupportAdminPage";
import POSPage from "./pages/POSPage";
import POSUserManagementPage from "./pages/POSUserManagementPage";
import POSReportsPage from "./pages/POSReportsPage";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import PurchasePointPage from "./pages/PurchasePointPage";
import FloorPlanPage from "./pages/FloorPlanPage";
import FloorPlanEditorPage from "./pages/FloorPlanEditorPage";
import DigitalReceiptPage from "./pages/DigitalReceiptPage";
import SurveyPage from "./pages/SurveyPage";
import CustomerReportsPage from "./pages/CustomerReportsPage";
import ModifierManagerPage from "./pages/ModifierManagerPage";
import ContractorApp from "./pages/ContractorApp";
import WorkerProcurementPage from "./pages/WorkerProcurementPage";
import ContractsListPage from "./pages/ContractsListPage";
import ContractFormPage from "./pages/ContractFormPage";
import ContractPreviewPage from "./pages/ContractPreviewPage";
import LoadingDemoPage from "./pages/LoadingDemoPage";
import ImportShipmentsPage from "./pages/ImportShipmentsPage";
import ImportWizardPage from "./pages/ImportWizardPage";
import ImportDetailPage from "./pages/ImportDetailPage";
import BillingPage from "./pages/BillingPage";
import OnboardingPage from "./pages/OnboardingPage";
import SubscriptionPage from "./pages/SubscriptionPage";
import SetupPage from "./pages/SetupPage";
import FinanceHomePage from "./pages/FinanceHomePage";
import FinanceVoucherPage from "./pages/FinanceVoucherPage";
import FinanceJournalPage from "./pages/FinanceJournalPage";
import BankAccountsPage from "./pages/BankAccountsPage";
import CashBoxesPage from "./pages/CashBoxesPage";
import CashTransferPage from "./pages/CashTransferPage";
import VoucherFormPage from "./pages/VoucherFormPage";
import JournalNewPage from "./pages/JournalNewPage";
import PortalLogin from "./pages/portal/PortalLogin";
import PortalDashboard from "./pages/portal/PortalDashboard";
import PortalSettings from "./pages/portal/PortalSettings";

const queryClient = new QueryClient();

// Minimal inline spinner for auth checks (not full-screen splash)
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
            <Routes>
              <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/branch-display/:branchId" element={<BranchDisplayPage />} />
              <Route path="/super-admin/dashboard" element={<ProtectedRoute><SuperAdminDashboard /></ProtectedRoute>} />
              <Route path="/employee" element={<ProtectedRoute><RoleGuard allowedRoles={["employee"]} fallback="/auth"><EmployeeApp /></RoleGuard></ProtectedRoute>} />
              <Route path="/receipt/:orderId" element={<DigitalReceiptPage />} />
              <Route path="/survey/:token" element={<SurveyPage />} />
              <Route path="/loading-demo" element={<LoadingDemoPage />} />
              <Route path="/portal" element={<PortalLogin />} />
              <Route path="/portal/dashboard" element={<PortalDashboard />} />
              <Route path="/portal/settings" element={<PortalSettings />} />
              {/* Legacy malaki routes redirect to portal */}
              <Route path="/malaki" element={<Navigate to="/portal" replace />} />
              <Route path="/malaki/dashboard" element={<Navigate to="/portal/dashboard" replace />} />
              <Route path="/malaki/settings" element={<Navigate to="/portal/settings" replace />} />
              <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
              <Route path="/setup" element={<ProtectedRoute><SetupPage /></ProtectedRoute>} />
              <Route path="/pos" element={<ProtectedRoute><POSPage /></ProtectedRoute>} />
              <Route path="/pos/floor-plan" element={<ProtectedRoute><FloorPlanPage /></ProtectedRoute>} />
              <Route path="/pos/floor-plan/edit" element={<ProtectedRoute><FloorPlanEditorPage /></ProtectedRoute>} />
              <Route path="/pos/modifiers" element={<ProtectedRoute><ModifierManagerPage /></ProtectedRoute>} />
              <Route path="/purchase-point" element={<ProtectedRoute><PurchasePointPage /></ProtectedRoute>} />
              <Route path="/worker/procurement" element={<ProtectedRoute><WorkerProcurementPage /></ProtectedRoute>} />
              <Route path="/*" element={
                <ProtectedRoute blockCashier>
                  <WebLayout>
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
                      <Route path="/contacts" element={<ContactsPage />} />
                      <Route path="/contacts/policies" element={<ContactPoliciesPage />} />
                      <Route path="/contacts/:id" element={<ContactDetailPage />} />
                      <Route path="/export" element={<ExportPage />} />
                      <Route path="/smart-report" element={<SmartReportPage />} />
                      {/* pricing is now a public route */}
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
                      <Route path="/finance" element={<FinanceHomePage />} />
                      <Route path="/finance/receipts" element={<FinanceVoucherPage voucherType="receipt" />} />
                      <Route path="/finance/payments" element={<FinanceVoucherPage voucherType="payment" />} />
                      <Route path="/finance/journals" element={<FinanceJournalPage />} />
                      <Route path="/finance/journal/new" element={<JournalNewPage />} />
                      <Route path="/finance/receipt/new" element={<VoucherFormPage voucherType="receipt" />} />
                      <Route path="/finance/payment/new" element={<VoucherFormPage voucherType="payment" />} />
                      <Route path="/finance/cheques" element={<ChequesPage />} />
                      <Route path="/finance/bank-accounts" element={<BankAccountsPage />} />
                      <Route path="/finance/cash-boxes" element={<CashBoxesPage />} />
                      <Route path="/finance/cash-boxes/transfer" element={<CashTransferPage />} />
                      <Route path="/inventory-movements" element={<StockMovementsPage />} />
                      <Route path="/inventory-valuation" element={<InventoryValuationPage />} />
                      <Route path="/employees" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><EmployeesPage /></RoleGuard>} />
                      <Route path="/sales-reps" element={<SalesRepresentativesPage />} />
                      <Route path="/orders" element={<OrdersPage />} />
                      <Route path="/my-attendance" element={<EmployeeAttendancePage />} />
                      <Route path="/hr-attendance" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><HRAttendancePage /></RoleGuard>} />
                      <Route path="/opening-balances-import" element={<OpeningBalancesImportPage />} />
                      <Route path="/currency-management" element={<CurrencyManagementPage />} />
                      <Route path="/fixed-assets" element={<FixedAssetsPage />} />
                      <Route path="/general-ledger" element={<GeneralLedgerPage />} />
                      <Route path="/account-statement" element={<AccountStatementPage />} />
                      <Route path="/reports/hr-payroll" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><HRPayrollReport /></RoleGuard>} />
                      <Route path="/reports/hr-attendance" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><HRAttendanceReport /></RoleGuard>} />
                      <Route path="/reports/hr-leaves" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><HRLeaveReport /></RoleGuard>} />
                      <Route path="/reports/hr-staff-cost" element={<RoleGuard allowedRoles={["admin", "hr_manager"]}><HRStaffCostReport /></RoleGuard>} />
                      {/* Financial */}
                      <Route path="/reports/ar-aging" element={<GenericReportPage reportKey="ar-aging" />} />
                      <Route path="/reports/ap-aging" element={<GenericReportPage reportKey="ap-aging" />} />
                      <Route path="/reports/cash-flow" element={<GenericReportPage reportKey="cash-flow" />} />
                      <Route path="/reports/cash-movement" element={<GenericReportPage reportKey="cash-movement" />} />
                      <Route path="/reports/bank-movement" element={<GenericReportPage reportKey="bank-movement" />} />
                      <Route path="/reports/cheques" element={<GenericReportPage reportKey="cheques" />} />
                      {/* Sales */}
                      <Route path="/reports/total-sales" element={<GenericReportPage reportKey="total-sales" />} />
                      <Route path="/reports/invoice-register" element={<GenericReportPage reportKey="invoice-register" />} />
                      <Route path="/reports/by-customer" element={<GenericReportPage reportKey="by-customer" />} />
                      <Route path="/reports/collections" element={<GenericReportPage reportKey="collections" />} />
                      <Route path="/reports/daily-sales" element={<GenericReportPage reportKey="daily-sales" />} />
                      <Route path="/reports/sales-returns" element={<GenericReportPage reportKey="sales-returns" />} />
                      <Route path="/reports/sales-by-product" element={<GenericReportPage reportKey="sales-by-product" />} />
                      <Route path="/reports/sales-performance" element={<GenericReportPage reportKey="sales-performance" />} />
                      {/* Purchases */}
                      <Route path="/reports/total-purchases" element={<GenericReportPage reportKey="total-purchases" />} />
                      <Route path="/reports/purchase-invoice-register" element={<GenericReportPage reportKey="purchase-invoice-register" />} />
                      <Route path="/reports/by-supplier" element={<GenericReportPage reportKey="by-supplier" />} />
                      <Route path="/reports/supplier-payments" element={<GenericReportPage reportKey="supplier-payments" />} />
                      <Route path="/reports/purchase-returns" element={<GenericReportPage reportKey="purchase-returns" />} />
                      <Route path="/reports/supplier-comparison" element={<GenericReportPage reportKey="supplier-comparison" />} />
                      {/* Inventory */}
                      <Route path="/reports/inventory-valuation" element={<GenericReportPage reportKey="inventory-valuation" />} />
                      <Route path="/reports/stock-movement" element={<GenericReportPage reportKey="stock-movement" />} />
                      <Route path="/reports/below-reorder" element={<GenericReportPage reportKey="below-reorder" />} />
                      <Route path="/reports/dead-stock" element={<GenericReportPage reportKey="dead-stock" />} />
                      <Route path="/reports/product-profitability" element={<GenericReportPage reportKey="product-profitability" />} />
                      {/* HR */}
                      <Route path="/reports/employee-directory" element={<GenericReportPage reportKey="employee-directory" />} />
                      {/* Fixed Assets */}
                      <Route path="/reports/asset-register" element={<GenericReportPage reportKey="asset-register" />} />
                      <Route path="/reports/monthly-depreciation" element={<GenericReportPage reportKey="monthly-depreciation" />} />
                      <Route path="/reports/depreciation-schedule" element={<GenericReportPage reportKey="depreciation-schedule" />} />
                      <Route path="/reports/fully-depreciated" element={<GenericReportPage reportKey="fully-depreciated" />} />
                      <Route path="/reports/asset-disposal" element={<GenericReportPage reportKey="asset-disposal" />} />
                      <Route path="/reports/assets-by-location" element={<GenericReportPage reportKey="assets-by-location" />} />
                      {/* Currency */}
                      <Route path="/reports/exchange-rates" element={<GenericReportPage reportKey="exchange-rates" />} />
                      <Route path="/reports/currency-conversions" element={<GenericReportPage reportKey="currency-conversions" />} />
                      <Route path="/reports/foreign-balances" element={<GenericReportPage reportKey="foreign-balances" />} />
                      <Route path="/reports/exchange-gain-loss" element={<GenericReportPage reportKey="exchange-gain-loss" />} />
                      {/* Orders */}
                      <Route path="/reports/all-orders" element={<GenericReportPage reportKey="all-orders" />} />
                      <Route path="/reports/order-performance" element={<GenericReportPage reportKey="order-performance" />} />
                      {/* POS */}
                      <Route path="/reports/pos-daily-sales" element={<GenericReportPage reportKey="pos-daily-sales" />} />
                      <Route path="/reports/pos-cash-reconciliation" element={<GenericReportPage reportKey="pos-cash-reconciliation" />} />
                      <Route path="/reports/pos-cashier-performance" element={<GenericReportPage reportKey="pos-cashier-performance" />} />
                      <Route path="/reports/pos-cancelled" element={<GenericReportPage reportKey="pos-cancelled" />} />
                      <Route path="/reports/pos-peak-hours" element={<GenericReportPage reportKey="pos-peak-hours" />} />
                      {/* Receivables & Payables */}
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
                      {/* Invoice Tracking & Collection */}
                      <Route path="/reports/invoice-lifecycle" element={<GenericReportPage reportKey="invoice-lifecycle" />} />
                      <Route path="/reports/dso-detailed" element={<GenericReportPage reportKey="dso-detailed" />} />
                      <Route path="/reports/ar-aging-advanced" element={<GenericReportPage reportKey="ar-aging-advanced" />} />
                      <Route path="/reports/collection-efficiency" element={<GenericReportPage reportKey="collection-efficiency" />} />
                      <Route path="/reports/payment-allocation" element={<GenericReportPage reportKey="payment-allocation" />} />
                      <Route path="/reports/unpaid-invoices" element={<GenericReportPage reportKey="unpaid-invoices" />} />
                      <Route path="/reports/collection-dashboard" element={<CollectionDashboardPage />} />
                      {/* Management */}
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
                      <Route path="/pos-reports" element={<POSReportsPage />} />
                      <Route path="/customer-reports" element={<CustomerReportsPage />} />
                      <Route path="/contractor" element={<ContractorApp />} />
                      <Route path="/contracts" element={<ContractsListPage />} />
                      <Route path="/contracts/new" element={<ContractFormPage />} />
                      <Route path="/contracts/:id/edit" element={<ContractFormPage />} />
                      <Route path="/contracts/:id/preview" element={<ContractPreviewPage />} />
                      <Route path="/purchases/import" element={<ImportShipmentsPage />} />
                      <Route path="/purchases/import/new" element={<ImportWizardPage />} />
                      <Route path="/purchases/import/:id" element={<ImportDetailPage />} />
                      <Route path="/reports/import-cost-analysis" element={<GenericReportPage reportKey="import-cost-analysis" />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </WebLayout>
                </ProtectedRoute>
              } />
            </Routes>
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
