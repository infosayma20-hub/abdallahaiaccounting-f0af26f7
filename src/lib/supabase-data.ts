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
  foreign_amount: number | null;
  exchange_rate: number | null;
  cost_center_id?: string | null;
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
    .select("id, transaction_date, description, transaction_type, debit_account_code, credit_account_code, amount, currency, reference, payment_method, is_deleted, is_opening_balance, contact_id, foreign_amount, exchange_rate, reversed_by_id, cost_center_id")
    .eq("user_id", userId)
    .is("reversed_by_id", null)
    .neq("transaction_type", "reversal")
    .order("transaction_date", { ascending: false })
    .limit(20000);
  if (error) throw error;
  return data || [];
}

// Fetch accounts from Supabase
export async function fetchAccounts(userId: string) {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, account_name, account_code, account_type, is_active, parent_code")
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
  if (["purchases", "مشتريات"].includes(t)) return "Purchases";
  if (["expenses", "expense", "مصروفات", "مصروف", "المصروفات", "مصاريف"].includes(t)) return "Expenses";
  return type;
}

// Get the hierarchy depth of an account (1 = root, 2 = child of root, etc.)
export function getAccountDepth(code: string, accountMap: Record<string, SupabaseAccount>): number {
  let depth = 1;
  let current = accountMap[code];
  while (current?.parent_code && accountMap[current.parent_code]) {
    depth++;
    current = accountMap[current.parent_code];
  }
  return depth;
}

// Get all children (direct and indirect) of an account code
export function getChildAccounts(parentCode: string, accounts: SupabaseAccount[]): SupabaseAccount[] {
  const directChildren = accounts.filter(a => a.parent_code === parentCode);
  const allChildren: SupabaseAccount[] = [...directChildren];
  directChildren.forEach(child => {
    allChildren.push(...getChildAccounts(child.account_code, accounts));
  });
  return allChildren;
}

// Build hierarchical account tree for reporting
export interface AccountNode {
  account: SupabaseAccount;
  balance: number;
  children: AccountNode[];
  depth: number;
}

export function buildAccountTree(
  accounts: SupabaseAccount[],
  balances: Record<string, number>,
  filterFn?: (acc: SupabaseAccount) => boolean
): AccountNode[] {
  const filtered = filterFn ? accounts.filter(filterFn) : accounts;
  const rootAccounts = filtered.filter(a => !a.parent_code || !filtered.find(p => p.account_code === a.parent_code));
  
  const buildNode = (acc: SupabaseAccount, depth: number): AccountNode => {
    const children = filtered
      .filter(a => a.parent_code === acc.account_code)
      .map(child => buildNode(child, depth + 1));
    
    const ownBalance = balances[acc.account_code] || 0;
    const childrenBalance = children.reduce((s, c) => s + c.balance, 0);
    
    return {
      account: acc,
      balance: children.length > 0 ? childrenBalance + ownBalance : ownBalance,
      children,
      depth,
    };
  };

  return rootAccounts.map(acc => buildNode(acc, 1));
}

// Flatten tree to a list respecting max depth level
export interface FlatAccountLine {
  code: string;
  name: string;
  balance: number;
  depth: number;
  isParent: boolean;
  hasChildren: boolean;
}

export function flattenAccountTree(nodes: AccountNode[], maxLevel: number): FlatAccountLine[] {
  const result: FlatAccountLine[] = [];
  
  const walk = (node: AccountNode) => {
    if (node.depth > maxLevel) return;
    
    const hasVisibleChildren = node.children.length > 0 && node.depth < maxLevel;
    
    result.push({
      code: node.account.account_code,
      name: node.account.account_name,
      balance: node.balance,
      depth: node.depth,
      isParent: node.children.length > 0,
      hasChildren: node.children.length > 0,
    });
    
    if (hasVisibleChildren) {
      node.children.forEach(child => walk(child));
    }
  };
  
  nodes.forEach(n => walk(n));
  return result;
}
