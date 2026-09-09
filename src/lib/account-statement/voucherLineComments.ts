import { supabase } from "@/integrations/supabase/client";

/**
 * تعليقات أسطر السندات (voucher_lines.line_comment) لعرضها في كشف الحساب.
 *
 * الحركات في جدول `transactions` تحمل بيان الرأس فقط (مثل GENERAL-2026-0426)،
 * بينما ملاحظة المحاسب تُحفظ على مستوى السطر في `voucher_lines`. هذا الملف
 * يبني خريطة: معرّف الحركة → تعليق السطر، بمطابقة (المرجع + رمز الحساب + المبلغ).
 *
 * عرض فقط — لا يعدّل أي بيانات محاسبية.
 */

export interface TxForComment {
  id: string;
  reference: string | null;
  debit_account_code: string;
  credit_account_code: string;
  amount: number;
  foreign_amount?: number | null;
}

interface VoucherLineRow {
  account_code: string;
  debit: number;
  credit: number;
  line_comment: string | null;
}

const near = (a: number, b: number) => Math.abs(Number(a) - Number(b)) < 0.01;

function pickComment(
  lines: VoucherLineRow[],
  accountCode: string,
  side: "debit" | "credit",
  amounts: number[]
): string | null {
  const candidates = lines.filter(
    (l) => l.account_code === accountCode && Number(l[side]) > 0 && (l.line_comment || "").trim()
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return (candidates[0].line_comment || "").trim();
  const byAmount = candidates.find((l) => amounts.some((amt) => near(Number(l[side]), amt)));
  return ((byAmount || candidates[0]).line_comment || "").trim() || null;
}

/**
 * يجلب تعليقات الأسطر لمجموعة حركات ويعيد خريطة transaction_id → التعليق.
 */
export async function fetchVoucherLineComments(
  ownerId: string,
  txs: TxForComment[]
): Promise<Record<string, string>> {
  const refs = Array.from(
    new Set(txs.map((t) => (t.reference || "").trim()).filter((r) => r.length > 0))
  );
  if (refs.length === 0) return {};

  const out: Record<string, string> = {};

  // Supabase `.in()` has a practical URL length limit — نقسّم المراجع لدفعات.
  const CHUNK = 100;
  const linesByRef: Record<string, VoucherLineRow[]> = {};

  for (let i = 0; i < refs.length; i += CHUNK) {
    const slice = refs.slice(i, i + CHUNK);
    const { data: vouchers, error: vErr } = await supabase
      .from("vouchers")
      .select("id, ref_number")
      .eq("user_id", ownerId)
      .in("ref_number", slice);
    if (vErr || !vouchers?.length) continue;

    const refById: Record<string, string> = {};
    vouchers.forEach((v: any) => {
      refById[v.id] = v.ref_number;
    });

    const { data: lines, error: lErr } = await supabase
      .from("voucher_lines")
      .select("voucher_id, account_code, debit, credit, line_comment")
      .in("voucher_id", Object.keys(refById));
    if (lErr || !lines?.length) continue;

    lines.forEach((l: any) => {
      const ref = refById[l.voucher_id];
      if (!ref) return;
      if (!(l.line_comment || "").trim()) return;
      (linesByRef[ref] ||= []).push({
        account_code: l.account_code,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        line_comment: l.line_comment,
      });
    });
  }

  for (const tx of txs) {
    const ref = (tx.reference || "").trim();
    const lines = linesByRef[ref];
    if (!lines?.length) continue;
    const amounts = [Number(tx.amount) || 0];
    if (tx.foreign_amount != null) amounts.push(Number(tx.foreign_amount));

    const parts: string[] = [];
    const d = pickComment(lines, tx.debit_account_code, "debit", amounts);
    const c = pickComment(lines, tx.credit_account_code, "credit", amounts);
    if (d) parts.push(d);
    if (c && c !== d) parts.push(c);
    if (parts.length) out[tx.id] = parts.join(" / ");
  }

  return out;
}
