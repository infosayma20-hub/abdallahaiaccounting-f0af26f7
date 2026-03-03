import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useRoleRedirect } from "@/hooks/useRoleRedirect";
import { ThemeProvider } from "@/hooks/useTheme";
import WebLayout from "./components/layout/WebLayout";
import HomeDashboard from "./pages/HomeDashboard";
import SmartAccountantPage from "./pages/SmartAccountantPage";
import MenuPage from "./pages/MenuPage";
import VoiceInput from "./pages/VoiceInput";
import ProfitLoss from "./pages/ProfitLoss";
import TransactionsPage from "./pages/TransactionsPage";
import AccountsPage from "./pages/AccountsPage";
import ContactsPage from "./pages/ContactsPage";
import ExportPage from "./pages/ExportPage";
import SmartReportPage from "./pages/SmartReportPage";
import JournalEntriesPage from "./pages/JournalEntriesPage";
import TrialBalancePage from "./pages/TrialBalancePage";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import PricingPage from "./pages/PricingPage";
import InvoicesPage from "./pages/InvoicesPage";
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
import LoadingScreen from "./components/LoadingScreen";
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
import CustomizationPage from "./pages/CustomizationPage";
import IndustryTemplatesPage from "./pages/IndustryTemplatesPage";
import CustomizationRequestPage from "./pages/CustomizationRequestPage";
import SupportTicketsPage from "./pages/SupportTicketsPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import SupportAdminPage from "./pages/SupportAdminPage";
import POSPage from "./pages/POSPage";
import POSUserManagementPage from "./pages/POSUserManagementPage";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const AppsRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { targetPath, checking, user } = useRoleRedirect();
  if (checking) return <LoadingScreen />;
  if (user && targetPath) return <Navigate to={targetPath} replace />;
  return <>{children}</>;
};

const SmartRedirect = () => {
  const { targetPath, checking } = useRoleRedirect();
  if (checking) return <LoadingScreen />;
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
            <Routes>
              <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/branch-display/:branchId" element={<BranchDisplayPage />} />
              <Route path="/super-admin/dashboard" element={<ProtectedRoute><SuperAdminDashboard /></ProtectedRoute>} />
              <Route path="/employee" element={<ProtectedRoute><RoleGuard allowedRoles={["employee"]} fallback="/auth"><EmployeeApp /></RoleGuard></ProtectedRoute>} />
              <Route path="/pos" element={<ProtectedRoute><POSPage /></ProtectedRoute>} />
              <Route path="/apps" element={<AppsRoute><WebLayout><AppsLauncher /></WebLayout></AppsRoute>} />
              <Route path="/*" element={
                <ProtectedRoute>
                  <WebLayout>
                    <Routes>
                      <Route path="/" element={<SmartRedirect />} />
                      <Route path="/dashboard" element={<HomeDashboard />} />
                      <Route path="/smart-accountant" element={<SmartAccountantPage />} />
                      <Route path="/menu" element={<MenuPage />} />
                      <Route path="/voice" element={<VoiceInput />} />
                      <Route path="/profit-loss" element={<ProfitLoss />} />
                      <Route path="/transactions" element={<TransactionsPage />} />
                      <Route path="/accounts" element={<AccountsPage />} />
                      <Route path="/contacts" element={<ContactsPage />} />
                      <Route path="/export" element={<ExportPage />} />
                      <Route path="/smart-report" element={<SmartReportPage />} />
                      <Route path="/pricing" element={<PricingPage />} />
                      <Route path="/invoices" element={<InvoicesPage />} />
                      <Route path="/inventory" element={<InventoryPage />} />
                      <Route path="/reports" element={<ReportsPage />} />
                      <Route path="/cheques" element={<ChequesPage />} />
                      <Route path="/profile" element={<ProfilePage />} />
                      <Route path="/balance-sheet" element={<BalanceSheetPage />} />
                      <Route path="/settings" element={<ProfilePage />} />
                      <Route path="/journal-entries" element={<JournalEntriesPage />} />
                      <Route path="/trial-balance" element={<TrialBalancePage />} />
                      <Route path="/receipts" element={<VoucherPage voucherType="سند قبض" />} />
                      <Route path="/bills" element={<InvoicesPage />} />
                      <Route path="/payments" element={<VoucherPage voucherType="سند صرف" />} />
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
                      <Route path="/customization" element={<CustomizationPage />} />
                      <Route path="/customization/templates" element={<IndustryTemplatesPage />} />
                      <Route path="/customization/request" element={<CustomizationRequestPage />} />
                      <Route path="/support/tickets" element={<SupportTicketsPage />} />
                      <Route path="/support/tickets/:id" element={<TicketDetailPage />} />
                      <Route path="/support/admin" element={<RoleGuard allowedRoles={["admin"]}><SupportAdminPage /></RoleGuard>} />
                      <Route path="/pos-users" element={<POSUserManagementPage />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </WebLayout>
                </ProtectedRoute>
              } />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
