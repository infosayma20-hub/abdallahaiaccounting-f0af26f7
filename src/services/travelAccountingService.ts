import { supabase } from "@/integrations/supabase/client";
import { resolveBankAccountCode } from "@/lib/resolveBankCode";

/**
 * Maps service_type to revenue account code
 */
const REVENUE_MAP: Record<string, string> = {
  hajj: "4151",
  umrah: "4151",
  flight: "4152",
  hotel: "4153",
  visa: "4154",
  tourism_package: "4155",
  honeymoon: "4155",
  transport: "4150",
  insurance: "4150",
};

/**
 * Maps item_type to cost account code
 */
const COST_MAP: Record<string, string> = {
  visa: "5340",
  flight: "5320",
  hotel: "5330",
  transport_air: "5350",
  transport_ground: "5350",
  transport_train: "5350",
  transport_bus: "5350",
  insurance: "5300",
  guide: "5300",
  meal_plan: "5300",
  other: "5300",
};

/**
 * Maps payment method to debit account code.
 *
 * Bank / card / online methods intentionally leave the code as `null` so callers
 * resolve the tenant's real leaf bank account via `resolveBankAccountCode`
 * (posting on the parent 1120 is forbidden after the hierarchy backfill).
 */
const PAYMENT_ACCOUNT_MAP: Record<string, string | null> = {
  cash: "1110",             // الصندوق
  bank_transfer: null,      // resolved per tenant → leaf under 1120
  credit_card: null,        // resolved per tenant → leaf under 1120
  check: "1150",            // شيكات
  installment: "1135",      // ذمم عملاء السياحة
  online: null,             // resolved per tenant → leaf under 1120
};

export function getRevenueAccountCode(serviceType: string): string {
  return REVENUE_MAP[serviceType] || "4150";
}

export function getCostAccountCode(itemType: string): string {
  return COST_MAP[itemType] || "5300";
}

export function getPaymentAccountCode(paymentMethod: string): string {
  return PAYMENT_ACCOUNT_MAP[paymentMethod] || "1110";
}

/**
 * Async variant that resolves bank-backed payment methods to a real leaf
 * account for the given user. Prefer this in code paths that write journal
 * entries; the sync version is kept only for legacy call sites.
 */
export async function resolvePaymentAccountCode(
  paymentMethod: string,
  userId: string
): Promise<string> {
  const mapped = PAYMENT_ACCOUNT_MAP[paymentMethod];
  if (mapped) return mapped;
  // null in map means "bank-backed" → resolve leaf
  if (paymentMethod in PAYMENT_ACCOUNT_MAP) {
    return await resolveBankAccountCode(userId);
  }
  return "1110";
}

/**
 * Ensures travel-specific accounts exist for a user
 */
export async function ensureTravelAccounts(userId: string): Promise<void> {
  await supabase.rpc("ensure_travel_accounts", { p_user_id: userId });
}

/**
 * Creates the booking confirmation journal entry
 * Debit: Cash/Bank/Receivables → Credit: Travel Revenue
 */
export async function createBookingJournalEntry(params: {
  userId: string;
  bookingNumber: string;
  customerName: string;
  serviceType: string;
  sellingPrice: number;
  amountPaid: number;
  paymentMethod: string;
}): Promise<string | null> {
  const { userId, bookingNumber, customerName, serviceType, sellingPrice, amountPaid, paymentMethod } = params;
  const revenueCode = getRevenueAccountCode(serviceType);
  
  if (amountPaid > 0 && amountPaid >= sellingPrice) {
    // Full payment: Debit cash/bank, Credit revenue
    const debitCode = await resolvePaymentAccountCode(paymentMethod, userId);
    const { data, error } = await supabase.from("transactions").insert({
      user_id: userId,
      transaction_date: new Date().toISOString().split("T")[0],
      description: `حجز سياحي - ${bookingNumber} - ${customerName || ""}`,
      debit_account_code: debitCode,
      credit_account_code: revenueCode,
      amount: sellingPrice,
      currency: "شيكل",
      transaction_type: "travel_booking",
      reference: bookingNumber,
      payment_method: paymentMethod === "cash" ? "نقدي" : paymentMethod === "bank_transfer" ? "بنك" : paymentMethod,
      idempotency_key: `TRVBOOK-${bookingNumber}`,
    }).select("id").single();
    return data?.id || null;
  } else {
    // Partial or no payment: Debit receivables, Credit revenue
    const { data } = await supabase.from("transactions").insert({
      user_id: userId,
      transaction_date: new Date().toISOString().split("T")[0],
      description: `حجز سياحي (آجل) - ${bookingNumber} - ${customerName || ""}`,
      debit_account_code: "1135", // ذمم عملاء السياحة
      credit_account_code: revenueCode,
      amount: sellingPrice,
      currency: "شيكل",
      transaction_type: "travel_booking",
      reference: bookingNumber,
      payment_method: "آجل",
      idempotency_key: `TRVBOOK-${bookingNumber}`,
    }).select("id").single();

    // If partial payment, also record the payment received
    if (amountPaid > 0) {
      const debitCode = await resolvePaymentAccountCode(paymentMethod, userId);
      await supabase.from("transactions").insert({
        user_id: userId,
        transaction_date: new Date().toISOString().split("T")[0],
        description: `دفعة حجز سياحي - ${bookingNumber} - ${customerName || ""}`,
        debit_account_code: debitCode,
        credit_account_code: "1135", // ذمم عملاء السياحة
        amount: amountPaid,
        currency: "شيكل",
        transaction_type: "travel_payment",
        reference: bookingNumber,
        payment_method: paymentMethod === "cash" ? "نقدي" : paymentMethod === "bank_transfer" ? "بنك" : paymentMethod,
        idempotency_key: `TRVPAY-${bookingNumber}-initial`,
      });
    }
    return data?.id || null;
  }
}

/**
 * Creates a payment journal entry
 * Debit: Cash/Bank → Credit: Travel Receivables
 */
export async function createPaymentJournalEntry(params: {
  userId: string;
  bookingNumber: string;
  customerName: string;
  amount: number;
  paymentMethod: string;
  bookingId: string;
}): Promise<void> {
  const { userId, bookingNumber, customerName, amount, paymentMethod } = params;
  const debitCode = await resolvePaymentAccountCode(paymentMethod, userId);
  
  await supabase.from("transactions").insert({
    user_id: userId,
    transaction_date: new Date().toISOString().split("T")[0],
    description: `دفعة حجز سياحي - ${bookingNumber} - ${customerName || ""}`,
    debit_account_code: debitCode,
    credit_account_code: "1135",
    amount,
    currency: "شيكل",
    transaction_type: "travel_payment",
    reference: bookingNumber,
    payment_method: paymentMethod === "cash" ? "نقدي" : paymentMethod === "bank_transfer" ? "بنك" : paymentMethod,
    idempotency_key: `TRVPAY-${bookingNumber}-${Date.now()}`,
  });
}

/**
 * Reverses all journal entries for a cancelled booking
 */
export async function reverseCancellationEntries(params: {
  userId: string;
  bookingNumber: string;
  customerName: string;
}): Promise<void> {
  const { userId, bookingNumber, customerName } = params;
  
  // Find all original entries
  const { data: originals } = await supabase
    .from("transactions")
    .select("*")
    .eq("reference", bookingNumber)
    .eq("is_deleted", false);

  if (!originals || originals.length === 0) return;

  // Create reversal entries (swap debit/credit)
  const reversals = originals.map(tx => ({
    user_id: userId,
    transaction_date: new Date().toISOString().split("T")[0],
    description: `عكس قيد - إلغاء حجز ${bookingNumber} - ${customerName || ""}`,
    debit_account_code: tx.credit_account_code,
    credit_account_code: tx.debit_account_code,
    amount: tx.amount,
    currency: tx.currency,
    transaction_type: "travel_cancellation",
    reference: bookingNumber,
    payment_method: tx.payment_method,
    idempotency_key: `TRVCANCEL-${tx.id}`,
  }));

  await supabase.from("transactions").insert(reversals);
}
