import { supabase } from "@/integrations/supabase/client";

// Shared types for Supabase-native data
export interface SupabaseTransaction {
  id: string;
  transaction_date: string;
  description: string;
  transaction_type: string;
  debit_account_code: string;
  credit_account_code: string;
  amount: number;
  currency: string;
  reference: string | null;
  payment_method: string | null;
  is_deleted: boolean | null;
  is_opening_balance: boolean | null;
  contact_id: string | null;
}

export interface SupabaseAccount {
  id: string;
  account_name: string;
  account_code: string;
  account_type: string;
  is_active: boolean | null;
  parent_code: string | null;
}

// Fetch transactions from Supabase
export async function fetchTransactions(userId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, transaction_date, description, transaction_type, debit_account_code, credit_account_code, amount, currency, reference, payment_method, is_deleted, is_opening_balance, contact_id")
    .eq("user_id", userId)
    .order("transaction_date", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return data || [];
}

// Fetch accounts from Supabase
export async function fetchAccounts(userId: string) {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, account_name, account_code, account_type, is_active")
    .eq("user_id", userId)
    .order("account_code");
  if (error) throw error;
  return data || [];
}

// Build a map of account_code → account info
export function buildAccountMap(accounts: SupabaseAccount[]) {
  const map: Record<string, SupabaseAccount> = {};
  accounts.forEach(a => { map[a.account_code] = a; });
  return map;
}

// Get account type for a given code
export function getAccountType(code: string, accountMap: Record<string, SupabaseAccount>): string {
  return accountMap[code]?.account_type || "";
}

// Get account name for a given code
export function getAccountName(code: string, accountMap: Record<string, SupabaseAccount>): string {
  const acc = accountMap[code];
  return acc ? `${acc.account_code} - ${acc.account_name}` : code;
}

// Get just the account name without code
export function getAccountNameOnly(code: string, accountMap: Record<string, SupabaseAccount>): string {
  return accountMap[code]?.account_name || code;
}

// Check if transaction is an opening balance
export function isOpeningBalance(tx: SupabaseTransaction): boolean {
  if (tx.is_opening_balance) return true;
  const type = (tx.transaction_type || "").trim();
  const desc = (tx.description || "").trim();
  return /رصيد\s*(ابتدائي|افتتاحي|مدور|أول\s*المدة)/i.test(desc) ||
    /رصيد\s*(ابتدائي|افتتاحي|مدور)/i.test(type) || type === "رصيد ابتدائي" || type === "opening_balance";
}

// Normalize account type to standard categories
export function normalizeAccountType(type: string): string {
  const t = type.toLowerCase().trim();
  if (["asset", "أصول", "أصل"].includes(t)) return "Asset";
  if (["liability", "التزامات", "التزام", "خصوم"].includes(t)) return "Liability";
  if (["equity", "owner's equity", "حقوق ملكية", "حقوق الملكية", "رأس مال"].includes(t)) return "Equity";
  if (["revenue", "إيرادات", "إيراد", "دخل"].includes(t)) return "Revenue";
  if (["expenses", "expense", "مصروفات", "مصروف", "المصروفات"].includes(t)) return "Expenses";
  return type;
}
