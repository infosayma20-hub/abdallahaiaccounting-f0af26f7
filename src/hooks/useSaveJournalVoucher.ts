/**
 * useSaveJournalVoucher — Single Source of Truth لحفظ سندات القيد.
 *
 * يُستخدم في:
 *  - src/pages/JournalNewPage.tsx (الصفحة الكاملة)
 *  - src/components/JournalEntryPopup.tsx (النافذة السريعة)
 *
 * يضمن تسلسلاً موحّداً:
 *   1) Validation صارمة (مدين=دائن، حسابات، أسطر، مبلغ، وصف)
 *   2) إنشاء voucher (master) في جدول `vouchers`
 *   3) إنشاء voucher_lines المرتبطة بـ voucher_id
 *   4) عند الترحيل: إنشاء transactions (Debit×Credit pairs) مع idempotency_key مستقر
 *   5) ربط `vouchers.linked_transaction_id` لدعم cascade delete
 *   6) Rollback يدوي إذا فشلت أي مرحلة بعد إنشاء voucher
 *
 * ⚠️ ممنوع تكرار هذا المنطق في أي مكان آخر — أي شاشة جديدة تحفظ قيد يومية يجب أن تستدعي هذا الـ hook.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  isVouchersRpcEnabled,
  callCreateJournalMultiPartyRpc,
  type JournalLine as RpcJournalLine,
} from "@/lib/voucher-rpc";

export interface JournalSaveLine {
  account_code: string;
  account_name?: string | null;
  debit: number;
  credit: number;
  contact_id?: string | null;
  contact_name?: string | null;
  line_comment?: string | null;
  cost_center_id?: string | null;
}

export interface JournalSaveInput {
  /** ref_number — لو فاضي يُعاد توليده تلقائياً (QV-YYYY-####) */
  ref_number?: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** subtype: normal | opening | adjustment | closing */
  subtype: "normal" | "opening" | "adjustment" | "closing";
  description: string;
  notes?: string | null;
  /** جهة اتصال على مستوى السند ككل (اختياري) */
  contact_id?: string | null;
  /** مركز تكلفة عام على مستوى السند (اختياري) — يُستخدم للسطور التي لا تحدد مركزها */
  cost_center_id?: string | null;
  lines: JournalSaveLine[];
  /** posted = ينعكس في دفتر اليومية، draft = لا ينعكس، deferred = موقّت */
  mode?: "draft" | "posted" | "deferred";
  attachments?: any[];
  line_sort_order?: "debit_first" | "original";
}

export interface JournalSaveResult {
  success: boolean;
  voucher_id?: string;
  ref_number?: string;
  error?: string;
  /** إن كان rollback تم بعد إنشاء voucher */
  rolledBack?: boolean;
}

const SUBTYPE_TO_TX_TYPE: Record<string, string> = {
  normal: "journal",
  opening: "opening_balance",
  adjustment: "journal",
  closing: "journal",
};

/** Code of the neutral asset clearing account used when a voucher transfers
 *  a balance between two parties on the SAME control account (e.g. 2110→2110
 *  with different supplier_ids). The account is auto-created via the DB
 *  function `ensure_party_transfer_clearing_account`. Net effect on the
 *  general ledger is zero — it exists only to preserve per-contact analytics
 *  in account statements. */
const PARTY_TRANSFER_CLEARING_CODE = "1199";

/** Build transactions from validated voucher lines.
 *  - Default: pair-match debit×credit lines.
 *  - Edge case: if a debit line and credit line share the SAME account but
 *    different contacts, route both through the clearing account so each
 *    contact's statement of account reflects the real movement.
 */
function buildTransactionsFromLines(args: {
  userId: string;
  date: string;
  description: string;
  lines: JournalSaveLine[];
  txType: string;
  reference: string;
  voucherId: string;
  voucherContactId?: string | null;
}): { txns: any[]; usedClearing: boolean } {
  const { userId, date, description, lines, txType, reference, voucherId, voucherContactId } = args;

  const cleanContact = (c?: string | null) =>
    c && c !== "__none__" ? c : null;

  const debitLines = lines
    .filter((l) => Number(l.debit) > 0)
    .map((l, idx) => ({ ...l, _idx: idx, remaining: Number(l.debit) }));
  const creditLines = lines
    .filter((l) => Number(l.credit) > 0)
    .map((l, idx) => ({ ...l, _idx: idx, remaining: Number(l.credit) }));

  const txns: any[] = [];
  let pairIdx = 0;
  let usedClearing = false;

  let di = 0;
  let ci = 0;
  while (di < debitLines.length && ci < creditLines.length) {
    const dl = debitLines[di];
    const cl = creditLines[ci];
    const amount = Math.min(dl.remaining, cl.remaining);
    if (amount > 0) {
      const dContact = cleanContact(dl.contact_id);
      const cContact = cleanContact(cl.contact_id);
      const sameAccount = dl.account_code === cl.account_code;
      const differentContacts =
        !!dContact && !!cContact && dContact !== cContact;

      if (sameAccount && differentContacts) {
        // Route via clearing account so each contact's SOA records the move.
        usedClearing = true;
        txns.push({
          user_id: userId,
          transaction_date: date,
          description: dl.contact_name
            ? `${description} - ${dl.contact_name}`
            : description,
          debit_account_code: dl.account_code,
          credit_account_code: PARTY_TRANSFER_CLEARING_CODE,
          amount,
          currency: "ILS",
          transaction_type: txType,
          reference,
          contact_id: dContact,
          idempotency_key: `VOUCHER-${voucherId}-${pairIdx}D`,
        });
        txns.push({
          user_id: userId,
          transaction_date: date,
          description: cl.contact_name
            ? `${description} - ${cl.contact_name}`
            : description,
          debit_account_code: PARTY_TRANSFER_CLEARING_CODE,
          credit_account_code: cl.account_code,
          amount,
          currency: "ILS",
          transaction_type: txType,
          reference,
          contact_id: cContact,
          idempotency_key: `VOUCHER-${voucherId}-${pairIdx}C`,
        });
      } else {
        const lineContactId = dContact || cContact || cleanContact(voucherContactId);
        const contactName = dl.contact_name || cl.contact_name || null;
        txns.push({
          user_id: userId,
          transaction_date: date,
          description: contactName ? `${description} - ${contactName}` : description,
          debit_account_code: dl.account_code,
          credit_account_code: cl.account_code,
          amount,
          currency: "ILS",
          transaction_type: txType,
          reference,
          contact_id: lineContactId,
          idempotency_key: `VOUCHER-${voucherId}-${pairIdx}`,
        });
      }
      pairIdx++;
    }
    dl.remaining -= amount;
    cl.remaining -= amount;
    if (dl.remaining <= 0.0001) di++;
    if (cl.remaining <= 0.0001) ci++;
  }

  return { txns, usedClearing };
}

/** توليد رقم سند جديد بصيغة QV-YYYY-#### */
async function generateRefNumber(userId: string): Promise<string> {
  const { data } = await supabase
    .from("vouchers")
    .select("ref_number")
    .eq("user_id", userId)
    .eq("type", "journal")
    .order("created_at", { ascending: false })
    .limit(1);
  const lastRef = (data || [])[0]?.ref_number || "";
  const match = lastRef.match(/(\d+)$/);
  const nextNum = match
    ? String(parseInt(match[1]) + 1).padStart(Math.max(match[1].length, 4), "0")
    : "0001";
  return `QV-${new Date().getFullYear()}-${nextNum}`;
}

/** Validation موحّد. يُرجع رسالة خطأ بالعربية أو null إذا كل شيء سليم. */
export function validateJournalInput(input: JournalSaveInput): string | null {
  if (!input.description?.trim()) return "الوصف مطلوب";
  if (!input.date) return "التاريخ مطلوب";

  const validLines = (input.lines || []).filter(
    (l) => l.account_code && (Number(l.debit) > 0 || Number(l.credit) > 0)
  );
  if (validLines.length < 2) return "أدخل سطرين صالحين على الأقل";

  for (let i = 0; i < validLines.length; i++) {
    const l = validLines[i];
    if (Number(l.debit) > 0 && Number(l.credit) > 0) {
      return `السطر ${i + 1}: لا يمكن مدين ودائن معاً`;
    }
  }

  // Block pure noise: same account + same contact appearing on both sides.
  // (Same account with DIFFERENT contacts is allowed — it's a valid party transfer.)
  const norm = (c: string | null | undefined) =>
    !c || c === "__none__" ? "" : c;
  const debitKeys = new Set(
    validLines
      .filter((l) => Number(l.debit) > 0)
      .map((l) => `${l.account_code}|${norm(l.contact_id)}`),
  );
  for (const l of validLines) {
    if (Number(l.credit) > 0) {
      const key = `${l.account_code}|${norm(l.contact_id)}`;
      if (debitKeys.has(key)) {
        return `الحساب ${l.account_code} يظهر مديناً ودائناً لنفس الطرف — هذا يلغي أثر القيد. استخدم طرفين مختلفين أو احذف أحد السطرين.`;
      }
    }
  }

  const totalDebit = validLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = validLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

  if (input.mode === "posted") {
    if (Math.abs(totalDebit - totalCredit) >= 0.01) {
      return `القيد غير متوازن: مدين ${totalDebit.toFixed(2)} ≠ دائن ${totalCredit.toFixed(2)}`;
    }
    if (totalDebit <= 0) return "الإجمالي صفر — لا يمكن الترحيل";
  }

  return null;
}

/**
 * فحص الفترة المالية المقفلة.
 * يُرجع رسالة خطأ إذا كان التاريخ ضمن فترة مقفلة (status='closed') للمستخدم،
 * أو null إذا لم يكن هناك قفل.
 */
async function checkFiscalPeriodLock(userId: string, date: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("fiscal_periods")
    .select("period_name, start_date, end_date, status")
    .eq("user_id", userId)
    .eq("status", "closed")
    .lte("start_date", date)
    .gte("end_date", date)
    .limit(1);
  if (error) return null; // لا نعطّل الحفظ إذا فشل فحص الفترة
  if (data && data.length > 0) {
    const p = data[0];
    return `لا يمكن الحفظ: التاريخ ${date} يقع ضمن فترة مقفلة (${p.period_name}). افتح الفترة من إعدادات الفترات المحاسبية أو غيّر التاريخ.`;
  }
  return null;
}

/**
 * Phase 5E — fetch the `vouchers_use_rpc` feature flag for this user from
 * company_settings. Returns false on any error so the legacy path is taken.
 */
async function fetchVouchersRpcFlag(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("company_settings")
      .select("feature_flags")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return false;
    return isVouchersRpcEnabled({ feature_flags: (data as any).feature_flags });
  } catch {
    return false;
  }
}

export function useSaveJournalVoucher() {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const save = async (input: JournalSaveInput): Promise<JournalSaveResult> => {
    if (!user) return { success: false, error: "غير مسجل الدخول" };

    const mode = input.mode || "posted";
    const validationError = validateJournalInput({ ...input, mode });
    if (validationError) return { success: false, error: validationError };

    // ── (0) حماية الفترة المقفلة (fiscal period lock) ──
    const lockError = await checkFiscalPeriodLock(user.id, input.date);
    if (lockError) return { success: false, error: lockError };

    setSaving(true);
    let createdVoucherId: string | null = null;

    try {
      // ── (1) Auto-fill account_code للسطور التي تحوي contact_id فقط ──
      const validLines = input.lines.filter(
        (l) => (l.account_code || l.contact_id) && (Number(l.debit) > 0 || Number(l.credit) > 0)
      );

      const totalDebit = validLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);

      // ── (2) رقم السند ──
      const refNumber = input.ref_number?.trim() || (await generateRefNumber(user.id));

      // ── (3) إنشاء voucher master ──
      const { data: voucher, error: vErr } = await supabase
        .from("vouchers")
        .insert({
          user_id: user.id,
          type: "journal",
          subtype: input.subtype,
          ref_number: refNumber,
          date: input.date,
          contact_id: input.contact_id || null,
          cost_center_id: input.cost_center_id || null,
          amount: totalDebit,
          amount_ils: totalDebit,
          description: input.description.trim(),
          notes: input.notes || null,
          status: mode === "posted" ? "posted" : mode === "deferred" ? "deferred" : "draft",
          posted_by: mode === "posted" ? user.id : null,
          posted_at: mode === "posted" ? new Date().toISOString() : null,
          attachments: input.attachments && input.attachments.length > 0 ? input.attachments : [],
          line_sort_order: input.line_sort_order || "original",
        })
        .select("id, ref_number")
        .single();

      if (vErr || !voucher) throw vErr || new Error("فشل إنشاء السند");
      createdVoucherId = voucher.id;

      // ── (4) إنشاء voucher_lines ──
      const { error: lErr } = await supabase.from("voucher_lines").insert(
        validLines.map((l, i) => ({
          voucher_id: voucher.id,
          account_code: l.account_code,
          account_name: l.account_name || null,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          line_order: i + 1,
          contact_id: l.contact_id && l.contact_id !== "__none__" ? l.contact_id : null,
          contact_name: l.contact_name || null,
          line_comment: l.line_comment || null,
          cost_center_id: l.cost_center_id || input.cost_center_id || null,
        }))
      );
      if (lErr) throw lErr;

      // ── (5) عند الترحيل: إنشاء transactions ──
      if (mode === "posted") {
        const txType = SUBTYPE_TO_TX_TYPE[input.subtype] || "journal";
        const { txns, usedClearing } = buildTransactionsFromLines({
          userId: user.id,
          date: input.date,
          description: input.description.trim(),
          lines: validLines,
          txType,
          reference: voucher.ref_number,
          voucherId: voucher.id,
          voucherContactId: input.contact_id,
        });
        if (usedClearing) {
          await supabase.rpc("ensure_party_transfer_clearing_account" as any, {
            p_user_id: user.id,
          });
        }

        // Phase 5E: route through canonical multi-party RPC when the flag
        // is ON. Same pair-matching algorithm — only the writer changes.
        const vouchersRpcOn = await fetchVouchersRpcFlag(user.id);
        if (vouchersRpcOn && txns.length > 0) {
          const rpcLines: RpcJournalLine[] = txns.map((t) => ({
            debit_account_code: t.debit_account_code,
            credit_account_code: t.credit_account_code,
            amount: t.amount,
            description: t.description,
            contact_id: t.contact_id,
          }));
          const result = await callCreateJournalMultiPartyRpc({
            userId: user.id,
            entryDate: input.date,
            description: input.description.trim(),
            lines: rpcLines,
            currency: "ILS",
            reference: voucher.ref_number,
            idempotencyKey: `VOUCHER-${voucher.id}`,
            source: "journal_voucher",
            notes: input.notes || null,
          });
          const firstTxId = result?.transaction_id || null;
          if (firstTxId) {
            await supabase
              .from("vouchers")
              .update({ linked_transaction_id: firstTxId })
              .eq("id", voucher.id);
          }
        } else if (txns.length > 0) {
          const { data: txData, error: tErr } = await supabase
            .from("transactions")
            .insert(txns)
            .select("id");
          if (tErr) throw tErr;

          // ربط أول transaction بالـ voucher لدعم cascade delete
          if (txData && txData.length > 0) {
            await supabase
              .from("vouchers")
              .update({ linked_transaction_id: txData[0].id })
              .eq("id", voucher.id);
          }
        }
      }

      setSaving(false);
      return { success: true, voucher_id: voucher.id, ref_number: voucher.ref_number };
    } catch (err: any) {
      // ── Rollback يدوي: لو فشلنا بعد إنشاء voucher نحذفه (cascade ينظف voucher_lines) ──
      if (createdVoucherId) {
        await supabase.from("voucher_lines").delete().eq("voucher_id", createdVoucherId);
        await supabase.from("transactions").delete().eq("reference", input.ref_number || "").eq("user_id", user.id);
        await supabase.from("vouchers").delete().eq("id", createdVoucherId);
      }
      setSaving(false);
      return {
        success: false,
        error: err?.message || "فشل حفظ السند",
        rolledBack: !!createdVoucherId,
      };
    }
  };

  /**
   * تعديل سند موجود — يحذف الـ lines/transactions القديمة ويعيد إنشاءها عبر نفس
   * تسلسل الحفظ، ضماناً لعدم تسرب أي قيود "شبح".
   */
  const update = async (
    voucherId: string,
    input: JournalSaveInput
  ): Promise<JournalSaveResult> => {
    if (!user) return { success: false, error: "غير مسجل الدخول" };

    const mode = input.mode || "posted";
    const validationError = validateJournalInput({ ...input, mode });
    if (validationError) return { success: false, error: validationError };

    // فحص الفترة المقفلة على التاريخ الجديد
    const lockError = await checkFiscalPeriodLock(user.id, input.date);
    if (lockError) return { success: false, error: lockError };

    setSaving(true);
    try {
      // (1) تحقق من ملكية السند قبل التعديل
      const { data: existing, error: fetchErr } = await supabase
        .from("vouchers")
        .select("id, ref_number, date, user_id, type")
        .eq("id", voucherId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (fetchErr || !existing) throw new Error("السند غير موجود أو ليس لديك صلاحية");

      // فحص الفترة على التاريخ القديم أيضاً (منع تحريك سند خارج فترة مقفلة)
      const oldDateLock = await checkFiscalPeriodLock(user.id, existing.date);
      if (oldDateLock) {
        setSaving(false);
        return { success: false, error: oldDateLock.replace("الحفظ", "التعديل") };
      }

      // (2) حذف lines + transactions القديمة (نحتفظ بـ voucher master)
      await supabase.from("voucher_lines").delete().eq("voucher_id", voucherId);
      await supabase
        .from("transactions")
        .delete()
        .eq("reference", existing.ref_number)
        .eq("user_id", user.id);

      // (3) إعادة بناء lines + transactions باستخدام نفس منطق save
      const validLines = input.lines.filter(
        (l) => (l.account_code || l.contact_id) && (Number(l.debit) > 0 || Number(l.credit) > 0)
      );
      const totalDebit = validLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);

      // تحديث الـ master
      const { error: uErr } = await supabase
        .from("vouchers")
        .update({
          subtype: input.subtype,
          date: input.date,
          contact_id: input.contact_id || null,
          amount: totalDebit,
          amount_ils: totalDebit,
          description: input.description.trim(),
          notes: input.notes || null,
          status: mode === "posted" ? "posted" : mode === "deferred" ? "deferred" : "draft",
          attachments: input.attachments && input.attachments.length > 0 ? input.attachments : [],
          line_sort_order: input.line_sort_order || "original",
          linked_transaction_id: null,
        })
        .eq("id", voucherId);
      if (uErr) throw uErr;

      // إعادة إنشاء voucher_lines
      const { error: lErr } = await supabase.from("voucher_lines").insert(
        validLines.map((l, i) => ({
          voucher_id: voucherId,
          account_code: l.account_code,
          account_name: l.account_name || null,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          line_order: i + 1,
          contact_id: l.contact_id && l.contact_id !== "__none__" ? l.contact_id : null,
          contact_name: l.contact_name || null,
          line_comment: l.line_comment || null,
        }))
      );
      if (lErr) throw lErr;

      // إعادة إنشاء transactions (إذا posted)
      if (mode === "posted") {
        const txType = SUBTYPE_TO_TX_TYPE[input.subtype] || "journal";
        const { txns, usedClearing } = buildTransactionsFromLines({
          userId: user.id,
          date: input.date,
          description: input.description.trim(),
          lines: validLines,
          txType,
          reference: existing.ref_number,
          voucherId,
          voucherContactId: input.contact_id,
        });
        if (usedClearing) {
          await supabase.rpc("ensure_party_transfer_clearing_account" as any, {
            p_user_id: user.id,
          });
        }

        // Phase 5E: same RPC routing for the update path. The legacy delete
        // by reference above already cleaned the old txns, so the RPC will
        // recreate them atomically with stable idempotency keys.
        const vouchersRpcOnU = await fetchVouchersRpcFlag(user.id);
        if (vouchersRpcOnU && txns.length > 0) {
          const rpcLines: RpcJournalLine[] = txns.map((t) => ({
            debit_account_code: t.debit_account_code,
            credit_account_code: t.credit_account_code,
            amount: t.amount,
            description: t.description,
            contact_id: t.contact_id,
          }));
          const result = await callCreateJournalMultiPartyRpc({
            userId: user.id,
            entryDate: input.date,
            description: input.description.trim(),
            lines: rpcLines,
            currency: "ILS",
            reference: existing.ref_number,
            idempotencyKey: `VOUCHER-${voucherId}-${Date.now()}`,
            source: "journal_voucher_edit",
            notes: input.notes || null,
          });
          const firstTxId = result?.transaction_id || null;
          if (firstTxId) {
            await supabase
              .from("vouchers")
              .update({ linked_transaction_id: firstTxId })
              .eq("id", voucherId);
          }
        } else if (txns.length > 0) {
          const { data: txData, error: tErr } = await supabase
            .from("transactions")
            .insert(txns)
            .select("id");
          if (tErr) throw tErr;
          if (txData && txData.length > 0) {
            await supabase
              .from("vouchers")
              .update({ linked_transaction_id: txData[0].id })
              .eq("id", voucherId);
          }
        }
      }

      setSaving(false);
      return { success: true, voucher_id: voucherId, ref_number: existing.ref_number };
    } catch (err: any) {
      setSaving(false);
      return { success: false, error: err?.message || "فشل تعديل السند" };
    }
  };

  /**
   * حذف سند — يحذف voucher_lines + transactions المرتبطة + voucher master.
   * يفحص الفترة المقفلة لمنع حذف سند داخل فترة مغلقة.
   */
  const remove = async (voucherId: string): Promise<JournalSaveResult> => {
    if (!user) return { success: false, error: "غير مسجل الدخول" };
    setSaving(true);
    try {
      const { data: existing, error: fetchErr } = await supabase
        .from("vouchers")
        .select("id, ref_number, date, user_id")
        .eq("id", voucherId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (fetchErr || !existing) throw new Error("السند غير موجود أو ليس لديك صلاحية");

      const lockError = await checkFiscalPeriodLock(user.id, existing.date);
      if (lockError) {
        setSaving(false);
        return { success: false, error: lockError.replace("الحفظ", "الحذف") };
      }

      await supabase.from("voucher_lines").delete().eq("voucher_id", voucherId);
      await supabase
        .from("transactions")
        .delete()
        .eq("reference", existing.ref_number)
        .eq("user_id", user.id);
      const { error: dErr } = await supabase.from("vouchers").delete().eq("id", voucherId);
      if (dErr) throw dErr;

      setSaving(false);
      return { success: true, voucher_id: voucherId, ref_number: existing.ref_number };
    } catch (err: any) {
      setSaving(false);
      return { success: false, error: err?.message || "فشل حذف السند" };
    }
  };

  return { save, update, remove, saving };
}
