import { supabase } from "@/integrations/supabase/client";

/**
 * Ensures a contact has a dedicated sub-account under the correct AR/AP parent.
 * Wraps the `resolve_postable_account` RPC — it creates a new leaf account
 * (e.g. 21100034) linked to this contact when none exists, and updates the
 * contact's `linked_account_code`.
 *
 * NEVER store a parent code (2110 / 1130 / 2180) on `contacts.linked_account_code` —
 * doing so causes every voucher to post to the first shared leaf and merges
 * multiple suppliers/customers on the same statement.
 */
export async function ensureContactSubAccount(params: {
  ownerId: string;
  contactId: string;
  contactType: string | null | undefined;
  contactName?: string | null;
}): Promise<string> {
  const { ownerId, contactId, contactType, contactName } = params;
  const type = (contactType || "").trim();
  const parent =
    type === "مورد" || type === "supplier" ? "2110"
    : type === "موظف" || type === "employee" ? "2180"
    : type === "عميل ومورد" || type === "customer_supplier" ? "1130"
    : "1130"; // default: customer

  const { data, error } = await supabase.rpc("resolve_postable_account", {
    p_user_id: ownerId,
    p_parent_code: parent,
    p_contact_id: contactId,
    p_contact_name: contactName || null,
    p_contact_type: type || null,
  });
  if (error) throw error;
  const code = data as unknown as string | null;
  if (!code) throw new Error("تعذر إنشاء الحساب الفرعي لجهة الاتصال");
  return code;
}