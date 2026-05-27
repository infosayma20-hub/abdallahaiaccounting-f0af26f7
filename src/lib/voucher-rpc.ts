/**
 * Phase 5B — Voucher RPC adapter.
 *
 * Wraps the canonical financial RPCs:
 *   - create_receipt_with_entry
 *   - create_payment_with_entry
 *   - create_journal_entry_multi_party_atomic
 *   - update_voucher_atomic
 *   - void_voucher_atomic
 *   - allocate_voucher_to_invoices_atomic
 *
 * Gated by the `vouchers_use_rpc` feature flag (default OFF). When the flag
 * is OFF, callers should keep using the existing direct-insert paths in
 * VoucherFormPage. When ON, callers can route accounting writes through this
 * single, audited adapter.
 *
 * No UI is changed by adding this module. It is a passive helper.
 */
import { supabase } from "@/integrations/supabase/client";

/* ---------- Feature flag ---------- */

/**
 * Returns true if `vouchers_use_rpc` is enabled in the tenant's company_settings.
 * Defaults to false on any error, missing flag, or missing settings.
 */
export function isVouchersRpcEnabled(settings: any): boolean {
  try {
    const flags = settings?.feature_flags;
    if (!flags || typeof flags !== "object") return false;
    return flags.vouchers_use_rpc === true;
  } catch {
    return false;
  }
}

/* ---------- Shared types ---------- */

export interface VoucherAllocation {
  invoice_id: string;
  amount: number;
}

export interface VoucherRpcResult {
  success: boolean;
  duplicate?: boolean;
  transaction_id?: string | null;
  reference?: string | null;
  allocations?: any;
  voided_id?: string | null;
  new?: any;
  error?: string;
}

/* ---------- Receipt voucher (سند قبض) ---------- */

export interface ReceiptRpcParams {
  userId: string;
  contactId?: string | null;
  contactName?: string | null;
  amount: number;
  paymentMethod?: string;
  description?: string | null;
  currency?: string;
  idempotencyKey?: string | null;
  voucherDate?: string | null;          // YYYY-MM-DD
  exchangeRate?: number | null;
  reference?: string | null;
  cashAccountCode?: string | null;      // e.g. '1110','1120','1150'
  contactAccountCode?: string | null;   // override AR
  notes?: string | null;
  employeeId?: string | null;
  workshopId?: string | null;
  allocations?: VoucherAllocation[] | null;
  costCenterId?: string | null;
}

export async function callCreateReceiptRpc(
  p: ReceiptRpcParams,
): Promise<VoucherRpcResult> {
  const { data, error } = await supabase.rpc("create_receipt_with_entry", {
    p_user_id: p.userId,
    p_contact_id: p.contactId ?? null,
    p_contact_name: p.contactName ?? null,
    p_amount: p.amount,
    p_payment_method: p.paymentMethod ?? "نقدي",
    p_description: p.description ?? null,
    p_currency: p.currency ?? "شيكل",
    p_idempotency_key: p.idempotencyKey ?? null,
    p_voucher_date: p.voucherDate ?? null,
    p_exchange_rate: p.exchangeRate ?? null,
    p_reference: p.reference ?? null,
    p_cash_account_code: p.cashAccountCode ?? null,
    p_contact_account_code: p.contactAccountCode ?? null,
    p_notes: p.notes ?? null,
    p_employee_id: p.employeeId ?? null,
    p_workshop_id: p.workshopId ?? null,
    p_allocations: (p.allocations ?? null) as any,
    p_cost_center_id: p.costCenterId ?? null,
  });
  if (error) throw error;
  return data as unknown as VoucherRpcResult;
}

/* ---------- Payment voucher (سند صرف) ---------- */

export type PaymentRpcParams = ReceiptRpcParams;

export async function callCreatePaymentRpc(
  p: PaymentRpcParams,
): Promise<VoucherRpcResult> {
  const { data, error } = await supabase.rpc("create_payment_with_entry", {
    p_user_id: p.userId,
    p_contact_id: p.contactId ?? null,
    p_contact_name: p.contactName ?? null,
    p_amount: p.amount,
    p_payment_method: p.paymentMethod ?? "نقدي",
    p_description: p.description ?? null,
    p_currency: p.currency ?? "شيكل",
    p_idempotency_key: p.idempotencyKey ?? null,
    p_voucher_date: p.voucherDate ?? null,
    p_exchange_rate: p.exchangeRate ?? null,
    p_reference: p.reference ?? null,
    p_cash_account_code: p.cashAccountCode ?? null,
    p_contact_account_code: p.contactAccountCode ?? null,
    p_notes: p.notes ?? null,
    p_employee_id: p.employeeId ?? null,
    p_workshop_id: p.workshopId ?? null,
    p_allocations: (p.allocations ?? null) as any,
    p_cost_center_id: p.costCenterId ?? null,
  });
  if (error) throw error;
  return data as unknown as VoucherRpcResult;
}

/* ---------- Journal voucher (سند قيد متعدد الأطراف) ---------- */

export interface JournalLine {
  debit_account_code: string;
  credit_account_code: string;
  amount: number;
  description?: string | null;
  contact_id?: string | null;
  workshop_id?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  cost_center_id?: string | null;
}

export interface JournalRpcParams {
  userId: string;
  entryDate: string;             // YYYY-MM-DD
  description: string;
  lines: JournalLine[];
  currency?: string;
  reference?: string | null;
  idempotencyKey?: string | null;
  source?: string;
  exchangeRate?: number | null;
  notes?: string | null;
  costCenterId?: string | null;
}

export async function callCreateJournalMultiPartyRpc(
  p: JournalRpcParams,
): Promise<VoucherRpcResult> {
  const { data, error } = await supabase.rpc(
    "create_journal_entry_multi_party_atomic",
    {
      p_user_id: p.userId,
      p_entry_date: p.entryDate,
      p_description: p.description,
      p_lines: p.lines as any,
      p_currency: p.currency ?? "شيكل",
      p_reference: p.reference ?? null,
      p_idempotency_key: p.idempotencyKey ?? null,
      p_source: p.source ?? "manual",
      p_exchange_rate: p.exchangeRate ?? null,
      p_notes: p.notes ?? null,
      p_cost_center_id: p.costCenterId ?? null,
    },
  );
  if (error) throw error;
  return data as unknown as VoucherRpcResult;
}

/* ---------- Update voucher (edit) ---------- */

export interface UpdateVoucherRpcParams {
  userId: string;
  transactionId: string;
  kind: "receipt" | "payment" | "journal";
  voucherDate: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  description: string;
  contactId?: string | null;
  contactName?: string | null;
  cashAccountCode?: string | null;
  contactAccountCode?: string | null;
  exchangeRate?: number | null;
  reference?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  journalLines?: JournalLine[] | null;
  allocations?: VoucherAllocation[] | null;
  employeeId?: string | null;
  workshopId?: string | null;
  costCenterId?: string | null;
}

export async function callUpdateVoucherRpc(
  p: UpdateVoucherRpcParams,
): Promise<VoucherRpcResult> {
  const { data, error } = await supabase.rpc("update_voucher_atomic", {
    p_user_id: p.userId,
    p_transaction_id: p.transactionId,
    p_kind: p.kind,
    p_voucher_date: p.voucherDate,
    p_amount: p.amount,
    p_currency: p.currency,
    p_payment_method: p.paymentMethod,
    p_description: p.description,
    p_contact_id: p.contactId ?? null,
    p_contact_name: p.contactName ?? null,
    p_cash_account_code: p.cashAccountCode ?? null,
    p_contact_account_code: p.contactAccountCode ?? null,
    p_exchange_rate: p.exchangeRate ?? null,
    p_reference: p.reference ?? null,
    p_notes: p.notes ?? null,
    p_idempotency_key: p.idempotencyKey ?? null,
    p_journal_lines: (p.journalLines ?? null) as any,
    p_allocations: (p.allocations ?? null) as any,
    p_employee_id: p.employeeId ?? null,
    p_workshop_id: p.workshopId ?? null,
    p_cost_center_id: p.costCenterId ?? null,
  });
  if (error) throw error;
  return data as unknown as VoucherRpcResult;
}

/* ---------- Void voucher ---------- */

export interface VoidVoucherRpcParams {
  userId: string;
  transactionId: string;
  reason?: string | null;
  createReverse?: boolean;
  voidDate?: string | null;
}

export async function callVoidVoucherRpc(
  p: VoidVoucherRpcParams,
): Promise<VoucherRpcResult> {
  const { data, error } = await supabase.rpc("void_voucher_atomic", {
    p_user_id: p.userId,
    p_transaction_id: p.transactionId,
    p_reason: p.reason ?? null,
    p_create_reverse: p.createReverse ?? false,
    p_void_date: p.voidDate ?? null,
  });
  if (error) throw error;
  return data as unknown as VoucherRpcResult;
}

/* ---------- Allocate voucher to invoices (standalone) ---------- */

export interface AllocateRpcParams {
  userId: string;
  paymentId?: string | null;       // legacy receipt_vouchers.id
  transactionId?: string | null;   // new pathway: transactions.id
  voucherAmount: number;
  allocations: VoucherAllocation[];
  allowOverpay?: boolean;
}

export async function callAllocateVoucherRpc(
  p: AllocateRpcParams,
): Promise<VoucherRpcResult> {
  const { data, error } = await supabase.rpc(
    "allocate_voucher_to_invoices_atomic",
    {
      p_user_id: p.userId,
      p_payment_id: p.paymentId ?? null,
      p_transaction_id: p.transactionId ?? null,
      p_voucher_amount: p.voucherAmount,
      p_allocations: p.allocations as any,
      p_allow_overpay: p.allowOverpay ?? false,
    },
  );
  if (error) throw error;
  return data as unknown as VoucherRpcResult;
}