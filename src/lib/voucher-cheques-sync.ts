/**
 * Voucher ↔ Cheques sync helper.
 *
 * Used by the voucher edit branch to keep the dedicated `cheques` table
 * in sync with whatever the user has on screen, while protecting cheques
 * that already entered a downstream lifecycle event
 * (deposited / collected / bounced / endorsed / cashed / returned).
 *
 * Golden Rule: delete & re-insert. Never silently keep stale rows.
 * Safety Rule: never destroy a cheque that has financial side-effects.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ChequeFormRow = {
  number: string;
  date: string;
  bank: string;
  amount: string | number;
  accountNumber?: string;
  notes?: string;
};

/** Statuses that mean "cheque is still safely editable". */
const SAFE_STATUSES = new Set(["مسجل", "مسودة"]);

export interface SyncChequesParams {
  userId: string;
  voucherId: string;
  receiptVoucherId: string | null;
  direction: "وارد" | "صادر";
  cheques: ChequeFormRow[];
  partyName: string;
  contactId: string | null;
  currencyLabel: string;
  sourceBankAccountId: string | null;
  fallbackDate: string;
}

/**
 * Delete & recreate the cheques attached to a voucher.
 * Throws if any of the existing cheques is in an unsafe status — caller must
 * cancel the edit instead of silently overwriting downstream accounting.
 */
export async function syncChequesOnEdit(p: SyncChequesParams): Promise<void> {
  const formCount = (p.cheques || []).filter((c) => c.number).length;

  // 1. Fetch existing cheques attached to this voucher
  const { data: existing, error: fetchErr } = await supabase
    .from("cheques")
    .select("id, status, cheque_number")
    .eq("user_id", p.userId)
    .or(`voucher_id.eq.${p.voucherId},receipt_voucher_id.eq.${p.voucherId}`);
  if (fetchErr) throw new Error(`فشل قراءة الشيكات الحالية: ${fetchErr.message}`);

  // 2. Block edits if any existing cheque has moved past "مسجل"
  const locked = (existing || []).filter((c: any) => !SAFE_STATUSES.has(c.status));
  if (locked.length > 0) {
    const numbers = locked.map((c: any) => c.cheque_number || "—").join(", ");
    throw new Error(
      `لا يمكن تعديل الشيكات لأن بعضها دخل مرحلة لاحقة (${locked[0].status}): ${numbers}. ` +
        `يجب التراجع عن الإيداع/التحصيل/التجيير أولاً.`,
    );
  }

  // 3. Hard-delete safe rows (no audit value — they were never posted further)
  if (existing && existing.length > 0) {
    const ids = existing.map((c: any) => c.id);
    const { error: delErr } = await supabase
      .from("cheques")
      .delete()
      .in("id", ids)
      .eq("user_id", p.userId);
    if (delErr) throw new Error(`فشل حذف الشيكات القديمة: ${delErr.message}`);
  }

  // 4. Re-insert the cheques from the form
  const rows = (p.cheques || [])
    .filter((c) => c.number)
    .map((c) => ({
      user_id: p.userId,
      cheque_type: p.direction,
      cheque_number: c.number,
      cheque_date: c.date || p.fallbackDate,
      amount: Number(c.amount) || 0,
      party_name: p.partyName,
      bank_name: c.bank,
      status: "مسجل" as const,
      currency: p.currencyLabel,
      source_bank_account_id: p.sourceBankAccountId,
      receipt_voucher_id: p.receiptVoucherId,
      contact_id: p.contactId,
      account_number: c.accountNumber?.trim() || null,
      notes: c.notes?.trim() || null,
      voucher_id: p.voucherId,
    }));

  if (rows.length > 0) {
    const { error: insErr, data: inserted } = await supabase
      .from("cheques")
      .insert(rows as any)
      .select("id");
    if (insErr) throw new Error(`فشل تسجيل الشيكات: ${insErr.message}`);

    const dbCount = inserted?.length || 0;
    console.info("[voucher-cheques-sync]", {
      voucherId: p.voucherId,
      direction: p.direction,
      formCount,
      dbCount,
    });
    if (dbCount !== formCount) {
      throw new Error(`تم حفظ ${dbCount} من أصل ${formCount} شيكات فقط — تراجع وأعد المحاولة.`);
    }
    toast.success(`تم تحديث ${dbCount} شيك`);
  } else {
    console.info("[voucher-cheques-sync] no cheques to insert", { voucherId: p.voucherId });
  }
}

/**
 * Wipe cheques attached to a voucher when the user changes its payment
 * method away from "شيك". Refuses to delete if any cheque is locked.
 */
export async function wipeUnreferencedCheques(userId: string, voucherId: string): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase
    .from("cheques")
    .select("id, status, cheque_number")
    .eq("user_id", userId)
    .or(`voucher_id.eq.${voucherId},receipt_voucher_id.eq.${voucherId}`);
  if (fetchErr) throw new Error(`فشل قراءة الشيكات الحالية: ${fetchErr.message}`);
  if (!existing || existing.length === 0) return;

  const locked = existing.filter((c: any) => !SAFE_STATUSES.has(c.status));
  if (locked.length > 0) {
    throw new Error(
      `تغيير طريقة الدفع غير مسموح: شيك ${locked[0].cheque_number} في حالة ${locked[0].status}.`,
    );
  }
  const ids = existing.map((c: any) => c.id);
  const { error: delErr } = await supabase
    .from("cheques")
    .delete()
    .in("id", ids)
    .eq("user_id", userId);
  if (delErr) throw new Error(`فشل حذف الشيكات القديمة: ${delErr.message}`);
}
