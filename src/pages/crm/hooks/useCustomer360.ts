// Customer 360 — composes contacts + contact_class_policies + live financials
// + CRM activity into a single read model. NEVER writes back to contacts/policies.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchContactBalance } from "@/lib/contact-balance";
import type {
  ContactSnapshot,
  PolicySnapshot,
  LiveFinancials,
} from "../lib/policyEngine";

export interface Customer360Data {
  contact: ContactSnapshot | null;
  policy: PolicySnapshot | null;
  financials: LiveFinancials | null;
  loading: boolean;
  error: string | null;
}

const EMPTY_FIN: LiveFinancials = {
  outstanding: 0,
  overdue: 0,
  total_ytd: 0,
  invoices_count: 0,
  last_sale_date: null,
  ledger_balance: 0,
};

export function useCustomer360(contactId: string | null | undefined): Customer360Data & { refetch: () => void } {
  const { user } = useAuth();
  const [contact, setContact] = useState<ContactSnapshot | null>(null);
  const [policy, setPolicy] = useState<PolicySnapshot | null>(null);
  const [financials, setFinancials] = useState<LiveFinancials | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !contactId) {
      setContact(null);
      setPolicy(null);
      setFinancials(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1) Master contact
      const { data: c, error: cErr } = await supabase
        .from("contacts")
        .select(
          "id, contact_name, contact_class, credit_limit, current_balance, payment_terms_days, avg_payment_days, total_sales, overdue_amount, last_transaction_date",
        )
        .eq("id", contactId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (cErr) throw cErr;
      const contactData = c as ContactSnapshot | null;
      setContact(contactData);

      // 2) Policy by class (reusable rules engine)
      if (contactData?.contact_class) {
        const { data: p } = await supabase
          .from("contact_class_policies")
          .select(
            "class, label, color, credit_limit_default, payment_terms_days, discount_pct, followup_days, description",
          )
          .eq("user_id", user.id)
          .eq("class", contactData.contact_class)
          .maybeSingle();
        setPolicy((p as PolicySnapshot | null) ?? null);
      } else {
        setPolicy(null);
      }

      // 3) Live financials from invoices (respect is_deleted policy)
      const today = new Date().toISOString().split("T")[0];
      const yearStart = `${new Date().getFullYear()}-01-01`;

      const { data: invs } = await supabase
        .from("invoices")
        .select("total_amount, status, invoice_date, due_date, paid_amount")
        .eq("user_id", user.id)
        .eq("contact_id", contactId)
        .neq("status", "cancelled");

      const list = (invs as any[]) || [];
      // Phase 5G — Single Source of Truth.
      // `outstanding` (and the credit decisions that depend on it) must come
      // from the ledger via get_contact_balance, NOT from invoices alone.
      // Invoices ignore on-account payments, refunds, and journal adjustments.
      const ledgerBalance = await fetchContactBalance(contactId);
      // For customers, a positive ledger balance == outstanding receivable.
      // For suppliers, the same convention reads as "we owe them" (positive).
      const outstanding = Math.max(0, ledgerBalance);
      const overdue = list
        .filter((i) => i.status !== "paid" && i.due_date && i.due_date < today)
        .reduce((s, i) => s + (Number(i.total_amount || 0) - Number(i.paid_amount || 0)), 0);
      const total_ytd = list
        .filter((i) => i.invoice_date >= yearStart)
        .reduce((s, i) => s + Number(i.total_amount || 0), 0);
      const sortedDates = list.map((i) => i.invoice_date).filter(Boolean).sort().reverse();

      setFinancials({
        outstanding,
        overdue,
        total_ytd,
        invoices_count: list.length,
        last_sale_date: sortedDates[0] ?? null,
        ledger_balance: ledgerBalance,
      });
    } catch (e: any) {
      setError(e?.message ?? "تعذر تحميل بيانات العميل");
      setFinancials(EMPTY_FIN);
    } finally {
      setLoading(false);
    }
  }, [user, contactId]);

  useEffect(() => {
    load();
  }, [load]);

  return { contact, policy, financials, loading, error, refetch: load };
}
