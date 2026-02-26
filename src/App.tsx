import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import WebLayout from "./components/layout/WebLayout";
import HomeDashboard from "./pages/HomeDashboard";
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

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
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
              <Route path="/*" element={
                <ProtectedRoute>
                  <WebLayout>
                    <Routes>
                      <Route path="/" element={<HomeDashboard />} />
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
                      <Route path="/receipts" element={<TransactionsPage />} />
                      <Route path="/bills" element={<InvoicesPage />} />
                      <Route path="/payments" element={<TransactionsPage />} />
                      <Route path="/inventory-movements" element={<StockMovementsPage />} />
                      <Route path="/inventory-valuation" element={<InventoryValuationPage />} />
                      <Route path="/employees" element={<EmployeesPage />} />
                      <Route path="/sales-reps" element={<SalesRepresentativesPage />} />
                      <Route path="/orders" element={<OrdersPage />} />
                      <Route path="/my-attendance" element={<EmployeeAttendancePage />} />
                      <Route path="/hr-attendance" element={<HRAttendancePage />} />
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
