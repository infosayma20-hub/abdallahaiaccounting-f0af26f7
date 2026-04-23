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

export interface JournalSaveLine {
  account_code: string;
  account_name?: string | null;
  debit: number;
  credit: number;
  contact_id?: string | null;
  contact_name?: string | null;
  line_comment?: string | null;
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
        }))
      );
      if (lErr) throw lErr;

      // ── (5) عند الترحيل: إنشاء transactions ──
      if (mode === "posted") {
        const debitLines = validLines.filter((l) => Number(l.debit) > 0);
        const creditLines = validLines.filter((l) => Number(l.credit) > 0);

        const txns: any[] = [];
        const txType = SUBTYPE_TO_TX_TYPE[input.subtype] || "journal";

        // مزدوج بسيط أو معقد: نطابق Debit × Credit pairs بالحد الأدنى
        const dQueue = debitLines.map((l) => ({ ...l, remaining: Number(l.debit) }));
        const cQueue = creditLines.map((l) => ({ ...l, remaining: Number(l.credit) }));

        let di = 0;
        let ci = 0;
        let pairIdx = 0;
        while (di < dQueue.length && ci < cQueue.length) {
          const dl = dQueue[di];
          const cl = cQueue[ci];
          const amount = Math.min(dl.remaining, cl.remaining);
          if (amount > 0) {
            const lineContactId =
              (dl.contact_id && dl.contact_id !== "__none__" && dl.contact_id) ||
              (cl.contact_id && cl.contact_id !== "__none__" && cl.contact_id) ||
              input.contact_id ||
              null;
            const contactName = dl.contact_name || cl.contact_name || null;
            txns.push({
              user_id: user.id,
              transaction_date: input.date,
              description: contactName
                ? `${input.description.trim()} - ${contactName}`
                : input.description.trim(),
              debit_account_code: dl.account_code,
              credit_account_code: cl.account_code,
              amount,
              currency: "ILS",
              transaction_type: txType,
              reference: voucher.ref_number,
              contact_id: lineContactId,
              idempotency_key: `VOUCHER-${voucher.id}-${pairIdx}`,
            });
            pairIdx++;
          }
          dl.remaining -= amount;
          cl.remaining -= amount;
          if (dl.remaining <= 0.0001) di++;
          if (cl.remaining <= 0.0001) ci++;
        }

        if (txns.length > 0) {
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

  return { save, saving };
}
