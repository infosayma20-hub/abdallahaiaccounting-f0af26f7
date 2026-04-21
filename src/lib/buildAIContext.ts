import { supabase } from "@/integrations/supabase/client";

export interface AIFinancialContext {
  cash: number;
  bank: number;
  totalSales: number;
  totalExpenses: number;
  netProfit: number;
  receivables: number;
  payables: number;
  recentTransactions: { date: string; description: string; amount: number }[];
  topContacts: { name: string; type: string; balance: number }[];
  inventory: { name: string; quantity: number; buy_price: number; sell_price: number }[];
  dueCheques: { party_name: string; amount: number; cheque_date: string; cheque_type: string }[];
  employees: { full_name: string; department: string }[];
  generatedAt: string;
}

export async function buildAIContext(userId: string): Promise<AIFinancialContext> {
  const txRes = await supabase.from("transactions")
    .select("amount, debit_account_code, credit_account_code, description, transaction_type, is_opening_balance, is_deleted, transaction_date")
    .eq("user_id", userId).eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(200);

  const contactRes = await supabase.from("contacts")
    .select("contact_name, contact_type, current_balance")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(20);

  const prodRes: any = await supabase.from("products")
    .select("name, quantity, buy_price, sell_price")
    .eq("user_id", userId)
    .limit(20);

  const chequeRes: any = await supabase.from("cheques")
    .select("party_name, amount, cheque_date, cheque_type, status")
    .eq("user_id", userId)
    .limit(10);

  const empRes: any = await supabase.from("employees")
    .select("full_name, department")
    .eq("user_id", userId)
    .limit(20);

  const txs = txRes.data || [];
  const plTx = txs.filter(tx =>
    !tx.is_opening_balance &&
    !/رصيد\s*(ابتدائي|افتتاحي|مدور)/i.test(tx.description || '') &&
    tx.transaction_type !== 'رصيد ابتدائي'
  );

  const sumByCode = (items: any[], field: 'debit_account_code' | 'credit_account_code', prefix: string) =>
    items.filter(tx => tx[field]?.startsWith(prefix)).reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

  const totalSales = sumByCode(plTx, 'credit_account_code', '4');
  const totalExpenses = sumByCode(plTx, 'debit_account_code', '5');
  const cashDebit = sumByCode(txs, 'debit_account_code', '1110');
  const cashCredit = sumByCode(txs, 'credit_account_code', '1110');
  const bankDebit = sumByCode(txs, 'debit_account_code', '1120');
  const bankCredit = sumByCode(txs, 'credit_account_code', '1120');
  const recDebit = sumByCode(txs, 'debit_account_code', '1130');
  const recCredit = sumByCode(txs, 'credit_account_code', '1130');
  const payDebit = sumByCode(txs, 'debit_account_code', '2110');
  const payCredit = sumByCode(txs, 'credit_account_code', '2110');
  // Smart Allocation advance accounts: net them off so AI sees true exposure.
  const custAdvCr = sumByCode(txs, 'credit_account_code', '2115');
  const custAdvDr = sumByCode(txs, 'debit_account_code', '2115');
  const supAdvDr  = sumByCode(txs, 'debit_account_code', '1146');
  const supAdvCr  = sumByCode(txs, 'credit_account_code', '1146');

  return {
    cash: cashDebit - cashCredit,
    bank: bankDebit - bankCredit,
    totalSales,
    totalExpenses,
    netProfit: totalSales - totalExpenses,
    receivables: (recDebit - recCredit) - (custAdvCr - custAdvDr),
    payables: (payCredit - payDebit) - (supAdvDr - supAdvCr),
    recentTransactions: txs.slice(0, 30).map(t => ({
      date: t.transaction_date || "",
      description: t.description || "",
      amount: Number(t.amount) || 0,
    })),
    topContacts: (contactRes.data || []).map((c: any) => ({
      name: c.contact_name,
      type: c.contact_type,
      balance: Number(c.current_balance) || 0,
    })),
    inventory: (prodRes.data || []).map((p: any) => ({
      name: p.name || "",
      quantity: Number(p.quantity) || 0,
      buy_price: Number(p.buy_price) || 0,
      sell_price: Number(p.sell_price) || 0,
    })),
    dueCheques: (chequeRes.data || []).map((c: any) => ({
      party_name: c.party_name || "",
      amount: Number(c.amount) || 0,
      cheque_date: c.cheque_date || "",
      cheque_type: c.cheque_type || "",
    })),
    employees: (empRes.data || []).map((e: any) => ({
      full_name: e.full_name || "",
      department: e.department || "",
    })),
    generatedAt: new Date().toISOString(),
  };
}
