/**
 * Stage 3D-1 — Service Credit Sales Invoice Command V1 (client contract only).
 *
 * NOT wired to any screen. The legacy `InvoiceCreatePage` flow is unchanged and
 * remains the only live create path. This module exists so the command contract
 * is typed and testable; the server refuses the command unless the tenant flag
 * `commands.invoice_service_credit_v1` is ON (OFF for every company today).
 *
 * Eligibility is decided SERVER-SIDE. Totals are recomputed SERVER-SIDE; the
 * client may only *declare* its totals so the server can shadow-compare them.
 */
import { supabase } from "@/integrations/supabase/client";
import { buildCommandEnvelopeV1, type CommandSource } from "./command-envelope-v1";

export const SERVICE_CREDIT_SALES_INVOICE_COMMAND =
  "finance.create_service_credit_sales_invoice.v1";

export const INVOICE_SERVICE_CREDIT_FLAGS = {
  command: "commands.invoice_service_credit_v1",
  posting: "posting.invoice_service_credit_v1",
  events: "events.invoice_service_credit_v1",
} as const;

export interface ServiceInvoiceLineV1 {
  description: string;
  product_id?: string | null; // must be a service product when present
  quantity: number;
  unit_price: number;
  discount?: number;
  discount_type?: "percent" | "amount";
  tax_rate?: number;
  unit_of_measure?: string | null;
}

export interface ServiceCreditSalesInvoicePayloadV1 {
  invoice_type: "sale";
  payment_mode: "credit";
  contact_id: string;
  contact_name?: string | null;
  invoice_date: string; // YYYY-MM-DD
  due_date?: string | null;
  currency?: string;
  exchange_rate?: number | null;
  tax_inclusive?: boolean;
  invoice_discount?: number;
  invoice_discount_type?: "percent" | "amount";
  notes?: string | null;
  payment_terms?: string | null;
  source?: "manual" | "web";
  lines: ServiceInvoiceLineV1[];
  /** Client-computed totals — advisory only, used for shadow parity. */
  declared_totals?: {
    subtotal?: number;
    total_discount?: number;
    tax_amount?: number;
    total_amount?: number;
    currency?: string;
    line_count?: number;
  };
}

export type ServiceCreditSalesInvoiceResultV1 =
  | {
      version: 1;
      status: "succeeded";
      command_id: string;
      replayed?: boolean;
      invoice_id: string;
      invoice_number: string | null;
      transaction_id: string;
      posting_version: 1;
      [k: string]: unknown;
    }
  | { version: 1; status: "shadow"; route: "legacy"; [k: string]: unknown }
  | { version: 1; status: "unsupported"; reason: string; route: "legacy" }
  | { version: 1; status: "failed"; error: string; [k: string]: unknown };

/** Client-side pre-check mirroring the server guard. Never authoritative. */
export function isLikelyEligible(p: ServiceCreditSalesInvoicePayloadV1): boolean {
  if (!p) return false;
  if (p.invoice_type !== "sale" || p.payment_mode !== "credit") return false;
  if (!p.contact_id) return false;
  if (!Array.isArray(p.lines) || p.lines.length === 0) return false;
  return p.lines.every(
    (l) => !!l.description?.trim() && Number(l.quantity) > 0 && Number(l.unit_price) >= 0,
  );
}

export async function createServiceCreditSalesInvoiceV1(args: {
  payload: ServiceCreditSalesInvoicePayloadV1;
  idempotencyKey: string;
  source?: CommandSource;
  companyId?: string | null;
  branchId?: string | null;
  correlationId?: string | null;
}): Promise<ServiceCreditSalesInvoiceResultV1> {
  const envelope = buildCommandEnvelopeV1({
    commandType: SERVICE_CREDIT_SALES_INVOICE_COMMAND,
    idempotencyKey: args.idempotencyKey,
    payload: args.payload,
    source: args.source ?? "web",
    companyId: args.companyId ?? null,
    branchId: args.branchId ?? null,
    correlationId: args.correlationId ?? null,
    effectiveDate: args.payload.invoice_date ?? null,
  });

  const { data, error } = await supabase.rpc(
    "create_service_credit_sales_invoice_command_v1" as any,
    { p_envelope: envelope as any } as any,
  );
  if (error) {
    return { version: 1, status: "failed", error: error.message };
  }
  return data as unknown as ServiceCreditSalesInvoiceResultV1;
}
