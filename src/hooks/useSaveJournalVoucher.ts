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
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { formatDbError } from "@/lib/db-error-toast";
import { broadcastChange } from "@/lib/crossTabSync";
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
  /** الوصف — الآن اختياري (تم استبداله بحقل الملاحظات + دفتر السندات) */
  description?: string;
  notes?: string | null;
  /** دفتر السندات — إن لم يُمرر يُستخدم الدفتر الافتراضي */
  book_id?: string | null;
  /** جهة اتصال على مستوى السند ككل (اختياري) */
  contact_id?: string | null;
  /** مركز تكلفة عام على مستوى السند (اختياري) — يُستخدم للسطور التي لا تحدد مركزها */
  cost_center_id?: string | null;
  lines: JournalSaveLine[];
  /** posted = ينعكس في دفتر اليومية، draft = لا ينعكس، deferred = موقّت */
  mode?: "draft" | "posted" | "deferred";
  attachments?: any[];
  line_sort_order?: "debit_first" | "original";
  /** Currency label (Arabic), e.g. "شيكل" / "دولار" / "دينار" / "يورو". Default "شيكل" (ILS). */
  currency_label?: string;
  /** Currency code (ISO-ish), e.g. "ILS" / "USD" / "JOD" / "EUR". Default "ILS". */
  currency_code?: string;
  /** Exchange rate to ILS (1 unit of currency_code = N ILS). Required when currency_code != "ILS". */
  exchange_rate?: number;
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
  voucherCostCenterId?: string | null;
  currencyLabel: string;
  currencyCode: string;
  exchangeRate: number;
}): { txns: any[]; usedClearing: boolean } {
  const { userId, date, description, lines, txType, reference, voucherId, voucherContactId, voucherCostCenterId, currencyLabel, currencyCode, exchangeRate } = args;
  const isForeign = currencyCode !== "ILS";
  const rate = isForeign ? (Number(exchangeRate) || 1) : 1;

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
      const dCC = (dl as any).cost_center_id || voucherCostCenterId || null;
      const cCC = (cl as any).cost_center_id || voucherCostCenterId || null;
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
          amount: amount * rate,
          currency: currencyLabel,
          foreign_amount: isForeign ? amount : null,
          exchange_rate: isForeign ? rate : null,
          transaction_type: txType,
          reference,
          contact_id: dContact,
          cost_center_id: dCC,
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
          amount: amount * rate,
          currency: currencyLabel,
          foreign_amount: isForeign ? amount : null,
          exchange_rate: isForeign ? rate : null,
          transaction_type: txType,
          reference,
          contact_id: cContact,
          cost_center_id: cCC,
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
          amount: amount * rate,
          currency: currencyLabel,
          foreign_amount: isForeign ? amount : null,
          exchange_rate: isForeign ? rate : null,
          transaction_type: txType,
          reference,
          contact_id: lineContactId,
          cost_center_id: dCC || cCC,
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
  const year = new Date().getFullYear();
  const prefix = `QV-${year}-`;
  const { data } = await supabase
    .from("vouchers")
    .select("ref_number")
    .eq("user_id", userId)
    .eq("type", "journal")
    .like("ref_number", `${prefix}%`);
  let maxNum = 0;
  let width = 4;
  for (const row of data || []) {
    const m = (row as any).ref_number?.match(/(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
      if (m[1].length > width) width = m[1].length;
    }
  }
  return `${prefix}${String(maxNum + 1).padStart(width, "0")}`;
}

/** Validation موحّد. يُرجع رسالة خطأ بالعربية أو null إذا كل شيء سليم. */
export function validateJournalInput(input: JournalSaveInput): string | null {
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
  // Tenant owner. Team-member accounts (e.g. accountant/sub-users) MUST write
  // vouchers + transactions under the OWNER's id so they surface in the same
  // tenant-scoped screens (Account Statement, GL, Trial Balance, etc.).
  // Using auth.user.id here breaks tenant isolation and hides posted entries.
  const { dataOwnerId } = useDataOwnerId();
  const [saving, setSaving] = useState(false);

  const save = async (input: JournalSaveInput): Promise<JournalSaveResult> => {
    if (!user) return { success: false, error: "غير مسجل الدخول" };
    const ownerId = dataOwnerId || user.id;

    const mode = input.mode || "posted";
    const validationError = validateJournalInput({ ...input, mode });
    if (validationError) return { success: false, error: validationError };

    // ── (0) حماية الفترة المقفلة (fiscal period lock) ──
    const lockError = await checkFiscalPeriodLock(ownerId, input.date);
    if (lockError) return { success: false, error: lockError };

    // ── (0.1) حارس منع التكرار (Duplicate Guard) ──
    // منع إنشاء سند مطابق (نفس المالك/التاريخ/المبلغ/الوصف) خلال آخر 5 دقائق.
    // السبب: ضغطات "حفظ" متكررة أو تبويبات مفتوحة أو استعادة مسودّة تعيد الإرسال.
    // الحارس آمن: يتجاهل المسودّات ولا يمنع التكرار المشروع بعد 5 دقائق.
    try {
      const totalDebitForCheck = input.lines.reduce(
        (s, l) => s + (Number(l.debit) || 0),
        0
      );
      const descForCheck = (input.description?.trim() || input.notes?.trim() || "").slice(0, 500);
      if (mode !== "draft" && totalDebitForCheck > 0) {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: dupRows } = await supabase
          .from("vouchers")
          .select("id, ref_number, created_at")
          .eq("user_id", ownerId)
          .eq("type", "journal")
          .eq("date", input.date)
          .eq("amount", totalDebitForCheck)
          .eq("description", descForCheck)
          .in("status", ["posted", "deferred"])
          .gte("created_at", fiveMinAgo)
          .limit(1);
        if (dupRows && dupRows.length > 0) {
          return {
            success: false,
            error: `⚠️ يوجد سند مطابق تم إنشاؤه للتو (${(dupRows[0] as any).ref_number || ""}). تم منع التكرار.`,
          };
        }
      }
    } catch (e) {
      // Fail-soft: لا نمنع الحفظ لو فشل الاستعلام
      console.warn("[dup-guard] check failed:", e);
    }

    setSaving(true);
    let createdVoucherId: string | null = null;

    try {
      // ── (1) Auto-fill account_code للسطور التي تحوي contact_id فقط ──
      const validLines = input.lines.filter(
        (l) => (l.account_code || l.contact_id) && (Number(l.debit) > 0 || Number(l.credit) > 0)
      );

      const totalDebit = validLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
      const masterCode = input.currency_code || "ILS";
      const masterRate = masterCode === "ILS" ? 1 : (Number(input.exchange_rate) || 1);
      const totalDebitIls = totalDebit * masterRate;

      // ── (2) رقم السند ──
      // ⚠️ لا نولّد الرقم على العميل — نتركه NULL ليولّده تريجر
      // trg_generate_voucher_ref مع pg_advisory_xact_lock (آمن ضد التزامن 100%).
      // رقم QV المعروض في الواجهة للمعاينة فقط؛ إرساله يعطّل التريغر الآمن.
      const requestedRef = input.ref_number?.trim() || null;
      const clientRef = requestedRef && !/^QV-\d{4}-\d+$/i.test(requestedRef) ? requestedRef : null;

      // ── (2.1) دفتر السندات + الرقم المستقل داخل الدفتر ──
      // - إن لم يُمرر book_id نستخدم الدفتر الافتراضي "GENERAL".
      // - ثم نصدر رقماً مستقلاً بصيغة CODE-YYYY-#### عبر RPC آمن ضد التزامن.
      let bookId: string | null = input.book_id || null;
      let bookNumber: string | null = null;
      try {
        if (!bookId) {
          const { data: defBook } = await supabase.rpc(
            "ensure_default_journal_book" as any,
            { _user_id: ownerId }
          );
          bookId = (defBook as any) || null;
        }
        if (bookId) {
          const year = new Date(input.date).getFullYear();
          const { data: allocated } = await supabase.rpc(
            "allocate_journal_book_number" as any,
            { _book_id: bookId, _year: year }
          );
          const row = Array.isArray(allocated) ? allocated[0] : allocated;
          bookNumber = (row as any)?.book_number || null;
        }
      } catch (e) {
        // Fail-soft: لا نمنع الحفظ لو فشل تخصيص رقم الدفتر — يبقى book_id
        console.warn("[journal-books] allocate number failed:", e);
      }

      const headerDescription = (input.description?.trim() || input.notes?.trim() || bookNumber || clientRef || "");

      // ── (3) إنشاء voucher master ──
      // ⚠️ نُنشئ السند دائماً بحالة draft أولاً، ثم نُرحّله بعد إنشاء
      // الـ transactions وربط linked_transaction_id، لتفادي trigger
      // guard_voucher_must_have_journal الذي يرفض posted بدون ربط.
      const finalStatus: "posted" | "draft" | "deferred" =
        mode === "posted" ? "posted" : mode === "deferred" ? "deferred" : "draft";
      const initialStatus = finalStatus === "posted" ? "draft" : finalStatus;
      const { data: voucher, error: vErr } = await supabase
        .from("vouchers")
        .insert({
          user_id: ownerId,
          type: "journal",
          subtype: input.subtype,
          ref_number: clientRef,
          date: input.date,
          contact_id: input.contact_id || null,
          cost_center_id: input.cost_center_id || null,
          amount: totalDebit,
          amount_ils: totalDebitIls,
            currency: masterCode,
            exchange_rate: masterRate,
          description: headerDescription,
          notes: input.notes || null,
          status: initialStatus,
          posted_by: null,
          posted_at: null,
          attachments: input.attachments && input.attachments.length > 0 ? input.attachments : [],
          line_sort_order: input.line_sort_order || "original",
          book_id: bookId,
          book_number: bookNumber,
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
        const currencyCode = input.currency_code || "ILS";
        const currencyLabel = input.currency_label || "شيكل";
        const rate = currencyCode === "ILS" ? 1 : (Number(input.exchange_rate) || 1);
        const { txns, usedClearing } = buildTransactionsFromLines({
          userId: ownerId,
          date: input.date,
          description: headerDescription,
          lines: validLines,
          txType,
          reference: voucher.ref_number,
          voucherId: voucher.id,
          voucherContactId: input.contact_id,
          voucherCostCenterId: input.cost_center_id || null,
          currencyLabel,
          currencyCode,
          exchangeRate: rate,
        });
        if (usedClearing) {
          await supabase.rpc("ensure_party_transfer_clearing_account" as any, {
            p_user_id: ownerId,
          });
        }

        // Phase 5E: route through canonical multi-party RPC when the flag
        // is ON. Same pair-matching algorithm — only the writer changes.
        const vouchersRpcOn = await fetchVouchersRpcFlag(ownerId);
        if (vouchersRpcOn && txns.length > 0) {
          const rpcLines: RpcJournalLine[] = txns.map((t) => ({
            debit_account_code: t.debit_account_code,
            credit_account_code: t.credit_account_code,
            amount: t.amount,
            description: t.description,
            contact_id: t.contact_id,
            cost_center_id: t.cost_center_id,
          }));
          const result = await callCreateJournalMultiPartyRpc({
            userId: ownerId,
            entryDate: input.date,
            description: headerDescription,
            lines: rpcLines,
            currency: currencyLabel,
            reference: voucher.ref_number,
            idempotencyKey: `VOUCHER-${voucher.id}`,
            source: "journal_voucher",
            notes: input.notes || null,
            costCenterId: input.cost_center_id || null,
            // 🌍 Multi-currency fix — Phase 1
            // Pass the header exchange rate through to the RPC so foreign_amount
            // and exchange_rate are persisted on every transaction row. Without
            // this, foreign-currency journals landed with foreign_amount=NULL
            // and became unconvertible in statements (mixed-currency warning).
            // Only takes effect when currencyCode <> "ILS"; ILS entries stay
            // exactly as before (RPC skips the fields when rate is null/1).
            exchangeRate: currencyCode === "ILS" ? null : rate,
          });
          if (result?.success === false || result?.error) {
            throw new Error(result?.error || "فشل إنشاء القيد المحاسبي المرتبط");
          }
          const firstTxId = result?.transaction_id || null;
          if (firstTxId) {
            await supabase
              .from("vouchers")
              .update({
                linked_transaction_id: firstTxId,
                status: "posted",
                posted_by: user.id,
                posted_at: new Date().toISOString(),
              })
              .eq("id", voucher.id);
          } else {
            throw new Error("فشل إنشاء القيد المحاسبي المرتبط");
          }
        } else if (txns.length > 0) {
          // ختم كل الحركات ببيانات دفتر السندات (للفلترة السريعة على كشوف الحسابات)
          const stampedTxns = txns.map((t) => ({ ...t, book_id: bookId, book_number: bookNumber }));
          const { data: txData, error: tErr } = await supabase
            .from("transactions")
            .insert(stampedTxns)
            .select("id");
          if (tErr) throw tErr;

          // ربط أول transaction بالـ voucher + ترحيل السند
          if (txData && txData.length > 0) {
            await supabase
              .from("vouchers")
              .update({
                linked_transaction_id: txData[0].id,
                status: "posted",
                posted_by: user.id,
                posted_at: new Date().toISOString(),
              })
              .eq("id", voucher.id);
          } else {
            throw new Error("فشل إنشاء القيد المحاسبي المرتبط");
          }
        }
      }

      setSaving(false);
      // بث فوري لكل التبويبات المفتوحة (كشف الحساب، دفتر اليومية، ملخصات) لكي تُحدّث نفسها مباشرةً بدون انتظار Realtime.
      try { broadcastChange("journal_entry", "created", voucher.id); } catch {}
      try { broadcastChange("transaction", "created", voucher.id); } catch {}
      return { success: true, voucher_id: voucher.id, ref_number: voucher.ref_number };
    } catch (err: any) {
      // ── Rollback يدوي: لو فشلنا بعد إنشاء voucher نحذفه (cascade ينظف voucher_lines) ──
      if (createdVoucherId) {
        await supabase.from("voucher_lines").delete().eq("voucher_id", createdVoucherId);
        // امسح transactions المرتبطة بهذا السند بالتحديد عبر RPC آمنة تتجاوز قيود RLS
        // (المستخدم قد لا يملك صلاحية حذف transactions مباشرةً — مما كان يترك حركات يتيمة).
        try {
          await supabase.rpc("delete_voucher_transactions", {
            p_voucher_id: createdVoucherId,
            p_owner_id: ownerId,
          });
        } catch { /* أفضل جهد — نتابع للحذف النهائي للسند */ }
        await supabase.from("vouchers").delete().eq("id", createdVoucherId);
      }
      setSaving(false);
      return {
        success: false,
        error: formatDbError(err, "فشل حفظ السند"),
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
    const ownerId = dataOwnerId || user.id;

    const mode = input.mode || "posted";
    const validationError = validateJournalInput({ ...input, mode });
    if (validationError) return { success: false, error: validationError };

    // فحص الفترة المقفلة على التاريخ الجديد
    const lockError = await checkFiscalPeriodLock(ownerId, input.date);
    if (lockError) return { success: false, error: lockError };

    setSaving(true);
    // Declared outside the try so the catch block can restore lines if any
    // step after the delete fails.
    let snapshotLines: any[] | null = null;
    try {
      // (1) تحقق من ملكية السند قبل التعديل
      const { data: existing, error: fetchErr } = await supabase
        .from("vouchers")
        .select("id, ref_number, date, user_id, type")
        .eq("id", voucherId)
        .eq("user_id", ownerId)
        .maybeSingle();
      if (fetchErr || !existing) throw new Error("السند غير موجود أو ليس لديك صلاحية");

      // فحص الفترة على التاريخ القديم أيضاً (منع تحريك سند خارج فترة مقفلة)
      const oldDateLock = await checkFiscalPeriodLock(ownerId, existing.date);
      if (oldDateLock) {
        setSaving(false);
        return { success: false, error: oldDateLock.replace("الحفظ", "التعديل") };
      }

      // (2) حذف lines + transactions القديمة (نحتفظ بـ voucher master)
      // ⚠️ نأخذ لقطة (snapshot) من الأسطر قبل الحذف، لكي نستطيع استعادتها
      // في حال فشل أي خطوة لاحقة. بدون هذه اللقطة، أي فشل بين "حذف الأسطر"
      // و"إعادة إدراجها" كان يترك السند posted بدون سطور (اختفاء كامل من
      // شاشة العرض بينما تبقى الحركات المحاسبية سليمة).
      const { data: snapRows } = await supabase
        .from("voucher_lines")
        .select("account_code, account_name, debit, credit, description, line_order, contact_id, contact_name, line_comment, cost_center_id")
        .eq("voucher_id", voucherId);
      snapshotLines = (snapRows as any[]) || [];
      await supabase.from("voucher_lines").delete().eq("voucher_id", voucherId);
      // ⚠️ يجب تنزيل حالة السند إلى draft وتفريغ linked_transaction_id قبل حذف
      // الحركات، لأن FK vouchers.linked_transaction_id ON DELETE SET NULL
      // سيُصفّرها تلقائياً أثناء الحذف، فيُطلق تريغر guard_voucher_must_have_journal
      // برسالة "لا يمكن ترحيل السند بدون قيد محاسبي مرتبط".
      {
        const { error: preErr } = await supabase
          .from("vouchers")
          .update({ status: "draft", linked_transaction_id: null })
          .eq("id", voucherId);
        if (preErr) throw new Error(`فشل تجهيز السند للتعديل: ${preErr.message}`);
      }
      // ⚠️ الحذف عبر RPC آمنة (security definer) لضمان نجاح التنظيف حتى للمحاسبين/الكاشير
      // الذين لا يملكون صلاحية حذف مباشرة على جدول transactions.
      // الفشل هنا يجب أن يوقف العملية كي لا نُنتج حركات يتيمة (المشكلة الأصلية).
      {
        const { error: rpcDelErr } = await supabase.rpc("delete_voucher_transactions", {
          p_voucher_id: voucherId,
          p_owner_id: ownerId,
        });
        if (rpcDelErr) throw new Error(`فشل حذف الحركات القديمة: ${rpcDelErr.message}`);
      }

      // (3) إعادة بناء lines + transactions باستخدام نفس منطق save
      const validLines = input.lines.filter(
        (l) => (l.account_code || l.contact_id) && (Number(l.debit) > 0 || Number(l.credit) > 0)
      );
      const totalDebit = validLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
      const masterCodeU = input.currency_code || "ILS";
      const masterRateU = masterCodeU === "ILS" ? 1 : (Number(input.exchange_rate) || 1);
      const totalDebitIlsU = totalDebit * masterRateU;

      // تحديث الـ master — نُنزّل الحالة إلى draft مؤقتاً عند إعادة الترحيل
      // حتى لا يفشل trigger guard_voucher_must_have_journal بسبب
      // linked_transaction_id=null أثناء إعادة بناء الـ transactions.
      const finalStatusU: "posted" | "draft" | "deferred" =
        mode === "posted" ? "posted" : mode === "deferred" ? "deferred" : "draft";
      const intermediateStatusU = finalStatusU === "posted" ? "draft" : finalStatusU;
      const { error: uErr } = await supabase
        .from("vouchers")
        .update({
          subtype: input.subtype,
          date: input.date,
          contact_id: input.contact_id || null,
          cost_center_id: input.cost_center_id || null,
          amount: totalDebit,
          amount_ils: totalDebitIlsU,
          currency: masterCodeU,
          exchange_rate: masterRateU,
          description: input.description?.trim() || input.notes?.trim() || existing.ref_number || "",
          notes: input.notes || null,
          status: intermediateStatusU,
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
          cost_center_id: l.cost_center_id || input.cost_center_id || null,
        }))
      );
      if (lErr) throw lErr;

      // إعادة إنشاء transactions (إذا posted)
      if (mode === "posted") {
        const txType = SUBTYPE_TO_TX_TYPE[input.subtype] || "journal";
        const currencyCode = input.currency_code || "ILS";
        const currencyLabel = input.currency_label || "شيكل";
        const rate = currencyCode === "ILS" ? 1 : (Number(input.exchange_rate) || 1);
        const { txns, usedClearing } = buildTransactionsFromLines({
          userId: ownerId,
          date: input.date,
          description: input.description?.trim() || input.notes?.trim() || existing.ref_number || "",
          lines: validLines,
          txType,
          reference: existing.ref_number,
          voucherId,
          voucherContactId: input.contact_id,
          voucherCostCenterId: input.cost_center_id || null,
          currencyLabel,
          currencyCode,
          exchangeRate: rate,
        });
        if (usedClearing) {
          await supabase.rpc("ensure_party_transfer_clearing_account" as any, {
            p_user_id: ownerId,
          });
        }

        // Phase 5E: same RPC routing for the update path. The legacy delete
        // by reference above already cleaned the old txns, so the RPC will
        // recreate them atomically with stable idempotency keys.
        const vouchersRpcOnU = await fetchVouchersRpcFlag(ownerId);
        if (vouchersRpcOnU && txns.length > 0) {
          const rpcLines: RpcJournalLine[] = txns.map((t) => ({
            debit_account_code: t.debit_account_code,
            credit_account_code: t.credit_account_code,
            amount: t.amount,
            description: t.description,
            contact_id: t.contact_id,
            cost_center_id: t.cost_center_id,
          }));
          const result = await callCreateJournalMultiPartyRpc({
            userId: ownerId,
            entryDate: input.date,
            description: input.description?.trim() || input.notes?.trim() || existing.ref_number || "",
            lines: rpcLines,
            currency: currencyLabel,
            reference: existing.ref_number,
            idempotencyKey: `VOUCHER-${voucherId}-${Date.now()}`,
            source: "journal_voucher_edit",
            notes: input.notes || null,
            costCenterId: input.cost_center_id || null,
            // 🌍 Multi-currency fix — Phase 1 (mirror of create-path)
            exchangeRate: currencyCode === "ILS" ? null : rate,
          });
          if (result?.success === false || result?.error) {
            throw new Error(result?.error || "فشل إنشاء القيد المحاسبي المرتبط");
          }
          const firstTxId = result?.transaction_id || null;
          if (firstTxId) {
            await supabase
              .from("vouchers")
              .update({
                linked_transaction_id: firstTxId,
                status: "posted",
                posted_by: user.id,
                posted_at: new Date().toISOString(),
              })
              .eq("id", voucherId);
          } else {
            throw new Error("فشل إنشاء القيد المحاسبي المرتبط");
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
              .update({
                linked_transaction_id: txData[0].id,
                status: "posted",
                posted_by: user.id,
                posted_at: new Date().toISOString(),
              })
              .eq("id", voucherId);
          } else {
            throw new Error("فشل إنشاء القيد المحاسبي المرتبط");
          }
        }
      }

      setSaving(false);
      try { broadcastChange("journal_entry", "updated", voucherId); } catch {}
      try { broadcastChange("transaction", "updated", voucherId); } catch {}
      return { success: true, voucher_id: voucherId, ref_number: existing.ref_number };
    } catch (err: any) {
      setSaving(false);
      // ── محاولة استعادة أسطر السند إذا فشل التعديل بعد الحذف ──
      // نتجنّب ترك السند فارغاً؛ نعيد إدراج اللقطة كما كانت (best-effort).
      try {
        const { data: currentLines } = await supabase
          .from("voucher_lines")
          .select("id")
          .eq("voucher_id", voucherId)
          .limit(1);
        if ((!currentLines || currentLines.length === 0) && (snapshotLines?.length ?? 0) > 0) {
          await supabase.from("voucher_lines").insert(
            (snapshotLines as any[]).map((l) => ({
              voucher_id: voucherId,
              account_code: l.account_code,
              account_name: l.account_name,
              debit: l.debit,
              credit: l.credit,
              description: l.description,
              line_order: l.line_order,
              contact_id: l.contact_id,
              contact_name: l.contact_name,
              line_comment: l.line_comment,
              cost_center_id: l.cost_center_id,
            }))
          );
        }
      } catch (restoreErr) {
        console.error("[useSaveJournalVoucher] failed to restore voucher_lines snapshot:", restoreErr);
      }
      return { success: false, error: formatDbError(err, "فشل تعديل السند") };
    }
  };

  /**
   * حذف سند — يحذف voucher_lines + transactions المرتبطة + voucher master.
   * يفحص الفترة المقفلة لمنع حذف سند داخل فترة مغلقة.
   */
  const remove = async (voucherId: string): Promise<JournalSaveResult> => {
    if (!user) return { success: false, error: "غير مسجل الدخول" };
    const ownerId = dataOwnerId || user.id;
    setSaving(true);
    try {
      const { data: existing, error: fetchErr } = await supabase
        .from("vouchers")
        .select("id, ref_number, date, user_id")
        .eq("id", voucherId)
        .eq("user_id", ownerId)
        .maybeSingle();
      if (fetchErr || !existing) throw new Error("السند غير موجود أو ليس لديك صلاحية");

      const lockError = await checkFiscalPeriodLock(ownerId, existing.date);
      if (lockError) {
        setSaving(false);
        return { success: false, error: lockError.replace("الحفظ", "الحذف") };
      }

      await supabase.from("voucher_lines").delete().eq("voucher_id", voucherId);
      // Demote to draft + clear linked_transaction_id BEFORE deleting transactions,
      // otherwise vouchers.linked_transaction_id (ON DELETE SET NULL) will fire
      // guard_voucher_must_have_journal on a still-posted voucher.
      {
        const { error: preErr } = await supabase
          .from("vouchers")
          .update({ status: "draft", linked_transaction_id: null })
          .eq("id", voucherId);
        if (preErr) throw preErr;
      }
      // Delete linked transactions via secure RPC (voucher still exists → RPC passes ownership checks).
      {
        const { error: rpcDelErr } = await supabase.rpc("delete_voucher_transactions", {
          p_voucher_id: voucherId,
          p_owner_id: ownerId,
        });
        if (rpcDelErr) throw rpcDelErr;
      }
      // Finally delete the voucher itself.
      const { error: dErr } = await supabase.from("vouchers").delete().eq("id", voucherId);
      if (dErr) throw dErr;
      // Fallback: some legacy rows may not carry the idempotency key — sweep by reference
      if (existing.ref_number) {
        const { error: txErr2 } = await supabase
          .from("transactions")
          .update({ is_deleted: true, idempotency_key: null } as any)
          .eq("user_id", ownerId)
          .eq("reference", existing.ref_number)
          .eq("is_deleted", false);
        if (txErr2) throw txErr2;
      }
      // Belt-and-suspenders: soft-mark any residual row that references this voucher id
      await supabase
        .from("transactions")
        .update({ is_deleted: true })
        .eq("user_id", ownerId)
        .ilike("idempotency_key", `VOUCHER-${voucherId}%`);

      setSaving(false);
      try { broadcastChange("journal_entry", "deleted", voucherId); } catch {}
      try { broadcastChange("transaction", "deleted", voucherId); } catch {}
      return { success: true, voucher_id: voucherId, ref_number: existing.ref_number };
    } catch (err: any) {
      setSaving(false);
      return { success: false, error: formatDbError(err, "فشل حذف السند") };
    }
  };

  return { save, update, remove, saving };
}
