/**
 * Smart Allocation Engine for Receipt & Payment Vouchers.
 *
 * Pure utilities (no React, no Supabase) used by VoucherFormPage and
 * SmartAllocationPanel. Handles:
 *   - intent detection (settlement / advance / refund / reverse settlement)
 *   - FIFO + exact-match auto-allocation
 *   - classification of the unallocated remainder
 *   - safety warnings before posting
 */

export type VoucherKind = "receipt" | "payment";
export type AllocationMode = "auto" | "manual" | "advance" | "refund";

export interface InvoiceLite {
  id: string;
  invoice_number: string | null;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number | null;
  remaining_amount: number | null;
  status: string | null;
  currency?: string | null;
  exchange_rate?: number | null;
  /** Underlying invoice_type from DB ("sale" | "purchase") — needed when we
   *  also load opposite-type invoices to support refund / reverse settlement. */
  invoice_type?: string | null;
}

export interface AllocatableInvoice extends InvoiceLite {
  selected: boolean;
  allocatedAmount: number;
}

/**
 * Voucher *intent* — what the user is really doing. We derive this from the
 * combination of (voucher kind, party type, available invoices, allocation
 * mode). The UI uses it to render the badge and the warning copy; the save
 * pipeline uses it to pick the correct accounting treatment.
 */
export type VoucherIntent =
  | "settlement"          // receipt + customer + invoices, OR payment + supplier + invoices
  | "reverse_settlement"  // payment + customer + open sale invoices (return / refund against AR)
  | "advance"             // receipt + customer + no invoices (customer prepayment)
  | "supplier_advance"    // payment + supplier + no invoices (advance to supplier)
  | "refund"              // payment + customer + no invoices (refund overpayment)
  | "direct";             // GL-account based, no contact — passthrough

export interface ClassificationResult {
  intent: VoucherIntent;
  /** Human-readable Arabic label for the badge. */
  label: string;
  /** Helper sentence for the user (Arabic). */
  message: string;
  /** Severity for UI tinting. */
  tone: "success" | "info" | "warning" | "neutral";
}

export interface AllocationSummary {
  totalAmount: number;
  totalAllocated: number;
  unallocated: number;
  fullyMatched: boolean;
  partiallyAllocated: boolean;
  hasOverpayment: boolean;
  selectedCount: number;
}

/* ───────────────────────── Currency conversion ───────────────────────── */

const isILS = (c?: string | null) => !c || c === "ILS" || c === "شيكل";

/** Remaining of a single invoice expressed in the *voucher* currency. */
export function invoiceRemainingInVoucherCurrency(
  inv: InvoiceLite,
  voucherCurrency: string,
  voucherExchangeRate: number,
): number {
  const raw = Math.max(0, (inv.remaining_amount ?? inv.total_amount) - (inv.paid_amount ?? 0));
  const invIsILS = isILS(inv.currency);
  const vIsILS = isILS(voucherCurrency);

  if (invIsILS && vIsILS) return raw;
  if (!invIsILS && !vIsILS && inv.currency === voucherCurrency) return raw;
  if (!invIsILS && vIsILS) return raw * (inv.exchange_rate || 1);
  if (invIsILS && !vIsILS) return voucherExchangeRate > 0 ? raw / voucherExchangeRate : raw;
  // both foreign, different
  const inILS = raw * (inv.exchange_rate || 1);
  return voucherExchangeRate > 0 ? inILS / voucherExchangeRate : inILS;
}

/* ───────────────────────── Allocation algorithms ───────────────────────── */

function sortByOldest(invoices: InvoiceLite[]): InvoiceLite[] {
  // Oldest due-date first; fall back to oldest invoice_date.
  return [...invoices].sort((a, b) => {
    const aDue = a.due_date || a.invoice_date;
    const bDue = b.due_date || b.invoice_date;
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return (a.invoice_date || "").localeCompare(b.invoice_date || "");
  });
}

/**
 * Run FIFO (oldest-first) allocation across a list of invoices.
 * If `voucherAmount` exactly matches a single invoice's remaining, the matched
 * invoice is preferred over the strict FIFO order (high-confidence match).
 */
export function autoAllocate(
  invoices: AllocatableInvoice[],
  voucherAmount: number,
  voucherCurrency: string,
  voucherExchangeRate: number,
): AllocatableInvoice[] {
  if (voucherAmount <= 0 || invoices.length === 0) {
    return invoices.map(i => ({ ...i, selected: false, allocatedAmount: 0 }));
  }

  // 1) Exact match on a single invoice — high-confidence
  const exact = invoices.find(i => {
    const rem = invoiceRemainingInVoucherCurrency(i, voucherCurrency, voucherExchangeRate);
    return Math.abs(rem - voucherAmount) < 0.01;
  });
  if (exact) {
    return invoices.map(i => i.id === exact.id
      ? { ...i, selected: true, allocatedAmount: voucherAmount }
      : { ...i, selected: false, allocatedAmount: 0 });
  }

  // 2) Oldest first — distribute until exhausted
  const ordered = sortByOldest(invoices);
  let remaining = voucherAmount;
  const allocByInv = new Map<string, number>();
  for (const inv of ordered) {
    if (remaining <= 0.001) break;
    const cap = invoiceRemainingInVoucherCurrency(inv, voucherCurrency, voucherExchangeRate);
    const take = Math.min(cap, remaining);
    if (take > 0) {
      allocByInv.set(inv.id, take);
      remaining -= take;
    }
  }

  return invoices.map(i => {
    const a = allocByInv.get(i.id);
    return a && a > 0
      ? { ...i, selected: true, allocatedAmount: round2(a) }
      : { ...i, selected: false, allocatedAmount: 0 };
  });
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

/* ───────────────────────── Summary + classification ───────────────────────── */

export function computeSummary(
  invoices: AllocatableInvoice[],
  voucherAmount: number,
): AllocationSummary {
  const selected = invoices.filter(i => i.selected && (i.allocatedAmount || 0) > 0);
  const totalAllocated = selected.reduce((s, i) => s + (i.allocatedAmount || 0), 0);
  const unallocated = round2(voucherAmount - totalAllocated);
  return {
    totalAmount: voucherAmount,
    totalAllocated: round2(totalAllocated),
    unallocated,
    fullyMatched: Math.abs(unallocated) < 0.01 && totalAllocated > 0,
    partiallyAllocated: totalAllocated > 0 && unallocated > 0.01,
    hasOverpayment: unallocated > 0.01 && selected.length > 0,
    selectedCount: selected.length,
  };
}

export function classifyVoucher(args: {
  voucherKind: VoucherKind;
  partyType: "contact" | "employee" | "account";
  hasContact: boolean;
  openInvoiceCount: number;
  mode: AllocationMode;
  summary: AllocationSummary;
}): ClassificationResult {
  const { voucherKind, partyType, hasContact, openInvoiceCount, mode, summary } = args;

  if (partyType === "account" || partyType === "employee" || !hasContact) {
    return {
      intent: "direct",
      label: "قيد مباشر",
      message: "سيُرحَّل السند مباشرة على الحساب المختار دون ربط بفاتورة.",
      tone: "neutral",
    };
  }

  // Refund / advance refund — payment voucher to a customer
  if (voucherKind === "payment" && mode === "refund") {
    return {
      intent: "refund",
      label: "إرجاع للعميل",
      message: "سيتم تخفيض رصيد العميل (إرجاع دفعة مقدمة أو استرداد).",
      tone: "info",
    };
  }

  // Explicit advance choice
  if (mode === "advance") {
    return {
      intent: voucherKind === "receipt" ? "advance" : "supplier_advance",
      label: voucherKind === "receipt" ? "دفعة مقدمة من العميل" : "دفعة مقدمة للمورد",
      message: voucherKind === "receipt"
        ? "سيُسجَّل المبلغ كرصيد دائن للعميل (دفعة مقدمة) دون ربطه بأي فاتورة."
        : "سيُسجَّل المبلغ كرصيد مدين للمورد (دفعة مقدمة) دون ربطه بأي فاتورة.",
      tone: "info",
    };
  }

  // No invoices to allocate against
  if (openInvoiceCount === 0) {
    if (voucherKind === "receipt") {
      return {
        intent: "advance",
        label: "دفعة مقدمة من العميل",
        message: "لا توجد فواتير مفتوحة — سيُسجَّل المبلغ كرصيد دائن للعميل (دفعة مقدمة).",
        tone: "info",
      };
    }
    // payment + customer + no invoices → likely refund
    return {
      intent: "refund",
      label: "إرجاع / تخفيض رصيد العميل",
      message: "لا توجد فواتير لهذا العميل — سيُعتبر السند إرجاع دفعة مقدمة أو تخفيض ذمة.",
      tone: "warning",
    };
  }

  // Invoices exist
  if (summary.fullyMatched) {
    return {
      intent: voucherKind === "receipt" ? "settlement" : (mode === "auto" || summary.selectedCount > 0 ? (isCustomerPayment(voucherKind, hasContact) ? "reverse_settlement" : "settlement") : "settlement"),
      label: "تم التوزيع بالكامل",
      message: summary.selectedCount === 1
        ? "تم توزيع المبلغ بالكامل على الفاتورة المختارة."
        : `تم توزيع المبلغ على ${summary.selectedCount} فواتير بنجاح.`,
      tone: "success",
    };
  }

  if (summary.partiallyAllocated && summary.hasOverpayment) {
    return {
      intent: voucherKind === "receipt" ? "settlement" : "settlement",
      label: "توزيع جزئي + رصيد مقدم",
      message: `تم توزيع جزء من المبلغ، والمتبقي (${summary.unallocated.toFixed(2)}) سيبقى ${voucherKind === "receipt" ? "كرصيد دائن للعميل" : "كرصيد مدين للمورد"}.`,
      tone: "warning",
    };
  }

  if (summary.totalAllocated > 0 && summary.unallocated < -0.01) {
    return {
      intent: "settlement",
      label: "تخصيص يفوق المبلغ",
      message: "المبلغ المخصص للفواتير أكبر من قيمة السند — يجب تخفيض التخصيص.",
      tone: "warning",
    };
  }

  // Nothing allocated yet but invoices exist. Tailor the copy to the mode the
  // user is currently sitting in, so we don't tell them to "pick auto" when
  // they're already on auto (which means the amount is zero or invalid).
  if (mode === "auto") {
    if (summary.totalAmount <= 0) {
      return {
        intent: voucherKind === "receipt" ? "advance" : "supplier_advance",
        label: "أدخل المبلغ أولاً",
        message: `يوجد ${openInvoiceCount} فاتورة مفتوحة لهذه الجهة — أدخل المبلغ ليتم التوزيع تلقائياً.`,
        tone: "info",
      };
    }
    return {
      intent: voucherKind === "receipt" ? "advance" : "supplier_advance",
      label: "تعذَّر التوزيع التلقائي",
      message: "تحقق من المبلغ المُدخل أو الفواتير المفتوحة.",
      tone: "warning",
    };
  }
  if (mode === "manual") {
    return {
      intent: voucherKind === "receipt" ? "advance" : "supplier_advance",
      label: "اختر الفواتير يدوياً",
      message: `يوجد ${openInvoiceCount} فاتورة مفتوحة — اختر الفواتير التي تريد ربط السند بها.`,
      tone: "info",
    };
  }
  return {
    intent: voucherKind === "receipt" ? "advance" : "supplier_advance",
    label: voucherKind === "receipt" ? "غير موزَّع — يحتاج قرار" : "غير موزَّع — يحتاج قرار",
    message: `يوجد ${openInvoiceCount} فاتورة مفتوحة. اختر "تخصيص تلقائي" لتوزيع المبلغ، أو "دفعة مقدمة" لإبقائه كرصيد.`,
    tone: "warning",
  };
}

function isCustomerPayment(voucherKind: VoucherKind, hasContact: boolean): boolean {
  return voucherKind === "payment" && hasContact;
}

/* ───────────────────────── Posting safeguards ───────────────────────── */

export interface PostingGuardResult {
  ok: boolean;
  /** Hard block — must not post. */
  block?: string;
  /** Soft warning — user must confirm. */
  confirm?: string;
}

export function checkPostingGuards(args: {
  voucherKind: VoucherKind;
  partyType: "contact" | "employee" | "account";
  hasContact: boolean;
  openInvoiceCount: number;
  mode: AllocationMode;
  summary: AllocationSummary;
}): PostingGuardResult {
  const { partyType, hasContact, openInvoiceCount, mode, summary } = args;

  // GL / employee paths — no allocation logic applies.
  if (partyType !== "contact" || !hasContact) return { ok: true };

  // Allocated more than the voucher amount → block.
  if (summary.unallocated < -0.01) {
    return {
      ok: false,
      block: `إجمالي المبالغ المخصصة (${summary.totalAllocated.toFixed(2)}) أكبر من قيمة السند (${summary.totalAmount.toFixed(2)}).`,
    };
  }

  // Invoices exist + manual mode + nothing allocated → confirm.
  if (openInvoiceCount > 0 && summary.totalAllocated === 0 && mode !== "advance" && mode !== "refund") {
    return {
      ok: true,
      confirm: `يوجد ${openInvoiceCount} فاتورة مفتوحة لهذه الجهة لم يتم ربط السند بها. هل تريد المتابعة وتسجيل السند كدفعة على الحساب؟`,
    };
  }

  return { ok: true };
}

/* ───────────────────────── Helpers exported for the UI ───────────────────── */

export function totalOutstanding(
  invoices: InvoiceLite[],
  voucherCurrency: string,
  voucherExchangeRate: number,
): number {
  return round2(invoices.reduce((sum, i) =>
    sum + invoiceRemainingInVoucherCurrency(i, voucherCurrency, voucherExchangeRate), 0));
}
