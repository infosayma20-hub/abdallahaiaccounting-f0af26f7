import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { ArrowDown, ArrowUp, AlertTriangle, CheckCircle2, Wallet, Receipt as ReceiptIcon, Banknote, Building2, CreditCard, FileText, TrendingDown, TrendingUp, Info, ChevronDown, ExternalLink } from "lucide-react";

/**
 * SmartSummaryPanel — موحّد بالشكل، مختلف بالمنطق
 *
 * Pattern: اليمين = Input، اليسار = Summary (نتيجة + أثر)
 * نوع المحتوى يختلف حسب نوع السند:
 *   - receipt/payment → Amount-driven + Impact (قبل/بعد)
 *   - journal         → Balance-driven (مدين/دائن + تحذير عدم توازن)
 *   - invoice/note    → Result-driven (إجمالي/ضريبة/صافي + رصيد العميل)
 */

export type SummaryVariant = "receipt" | "payment" | "journal" | "invoice" | "credit_note" | "debit_note";

interface BaseProps {
  variant: SummaryVariant;
  currencySymbol?: string;
}

interface ReceiptPaymentProps extends BaseProps {
  variant: "receipt" | "payment";
  isPosted?: boolean;
  amount: number;
  partyName?: string | null;
  partyId?: string | null;
  partyType?: "contact" | "employee" | "account";
  /** الرصيد الدفتري قبل الحركة (مدين موجب / دائن سالب للزبائن) */
  balanceBefore?: number | null;
  openInvoicesCount?: number;
  openInvoicesTotal?: number;
  unappliedCredit?: number;
  oldestInvoiceDays?: number;
  paymentMethod?: string;
  chequesTotal?: number;
  chequesCount?: number;
  allocatedTotal?: number;
  date?: string;
  refNumber?: string;
  /** رابط لفتح كشف الحساب (deep link) */
  onOpenStatement?: () => void;
}

interface InvoiceProps extends BaseProps {
  variant: "invoice" | "credit_note" | "debit_note";
  isPosted?: boolean;
  invoiceType: "sales" | "purchase";
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  total: number;
  taxEnabled?: boolean;
  taxInclusive?: boolean;
  itemsCount?: number;
  partyName?: string | null;
  partyId?: string | null;
  /** الرصيد الحالي للعميل قبل هذه الفاتورة */
  balanceBefore?: number | null;
  openInvoicesTotal?: number;
  unappliedCredit?: number;
  creditLimit?: number | null;
  currency?: string;
  exchangeRate?: number;
  date?: string;
  dueDate?: string;
  refNumber?: string;
  onOpenStatement?: () => void;
}

type Props = ReceiptPaymentProps | InvoiceProps;

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAYMENT_ICONS: Record<string, typeof Banknote> = {
  "نقدي": Banknote,
  "شيك": ReceiptIcon,
  "تحويل": Building2,
  "بطاقة": CreditCard,
};

export default function SmartSummaryPanel(props: Props) {
  const { variant, currencySymbol = "₪" } = props;

  if (variant === "receipt" || variant === "payment") {
    return <ReceiptPaymentSummary {...(props as ReceiptPaymentProps)} symbol={currencySymbol} />;
  }

  if (variant === "invoice" || variant === "credit_note" || variant === "debit_note") {
    return <InvoiceSummary {...(props as InvoiceProps)} symbol={currencySymbol} />;
  }

  return null;
}

/* ───────── Receipt / Payment Summary ───────── */

function ReceiptPaymentSummary({
  variant,
  isPosted = false,
  amount,
  partyName,
  partyType,
  balanceBefore,
  openInvoicesCount = 0,
  openInvoicesTotal = 0,
  unappliedCredit = 0,
  oldestInvoiceDays = 0,
  paymentMethod,
  chequesTotal = 0,
  chequesCount = 0,
  allocatedTotal = 0,
  date,
  refNumber,
  onOpenStatement,
  symbol,
}: ReceiptPaymentProps & { symbol: string }) {
  const isReceipt = variant === "receipt";
  const headerColor = isReceipt ? "from-emerald-500/10 to-emerald-500/5" : "from-rose-500/10 to-rose-500/5";
  const accentText = isReceipt ? "text-emerald-600" : "text-rose-600";
  const accentBg = isReceipt ? "bg-emerald-500" : "bg-rose-500";

  // For receipts: amount REDUCES debit (customer pays us → balance decreases)
  // For payments: amount REDUCES our debt (we pay supplier → their credit decreases / employee balance decreases)
  // We treat balanceBefore as positive=debit (they owe us), negative=credit (we owe them)
  const before = balanceBefore ?? 0;
  const after = isReceipt ? before - amount : before + amount;
  const balanceDelta = after - before;

  // Warnings
  const exceedsOpenInvoices =
    isReceipt && partyType === "contact" && amount > 0 && openInvoicesTotal > 0 && amount > openInvoicesTotal + 0.01;
  const willOverpay = isReceipt && amount > 0 && before > 0 && amount > before + 0.01;
  const noAmount = !amount || amount <= 0;
  const chequeMismatch =
    paymentMethod === "شيك" && chequesCount > 0 && Math.abs(chequesTotal - amount) > 0.01;
  const allocationMismatch =
    partyType === "contact" && allocatedTotal > 0 && Math.abs(allocatedTotal - amount) > 0.01;

  const PayIcon = paymentMethod ? PAYMENT_ICONS[paymentMethod] || Wallet : Wallet;

  return (
    <div className="space-y-3">
      {/* Hero — Amount (compact + amount-first) */}
      <div
        className={`relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${headerColor} px-4 pt-3 pb-3.5`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-muted-foreground/80 tracking-wide">
            {isReceipt ? "المبلغ المقبوض" : "المبلغ المدفوع"}
          </span>
          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${isReceipt ? "bg-emerald-500/15 text-emerald-700" : "bg-rose-500/15 text-rose-700"}`}>
            {isReceipt ? <ArrowDown className="h-2.5 w-2.5" /> : <ArrowUp className="h-2.5 w-2.5" />}
            {isReceipt ? "وارد" : "صادر"}
          </span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={amount}
            initial={{ opacity: 0.5, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className={`text-[2rem] leading-tight font-bold ${accentText} tracking-tight`}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {symbol}{fmt(amount)}
          </motion.div>
        </AnimatePresence>
        {refNumber && (
          <div className="mt-1 text-[10px] text-muted-foreground/70 font-mono">{refNumber}</div>
        )}
      </div>

      {/* Payment method (compact line, only icon + label) */}
      {paymentMethod && (
        <div className="flex items-center justify-between px-1 text-[11px]">
          <span className="text-muted-foreground">طريقة الدفع</span>
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <PayIcon className="h-3 w-3 text-muted-foreground" /> {paymentMethod}
            {paymentMethod === "شيك" && chequesCount > 0 && (
              <span className="text-[10px] text-muted-foreground/70">· {chequesCount}</span>
            )}
          </span>
        </div>
      )}

      {/* Impact: Before / After */}
      {partyName && partyType !== "account" && (
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <TrendingDown className="h-3.5 w-3.5" />
            الأثر على {partyType === "employee" ? "الموظف" : isReceipt ? "الزبون" : "المورد"}
          </div>
          <div className="space-y-2">
            <BalanceBreakdown
              total={before}
              label={isPosted ? "الرصيد حسب القيود المرحلة" : "الرصيد الحالي حسب كشف الحساب"}
              openInvoicesTotal={partyType === "contact" ? openInvoicesTotal : 0}
              unappliedCredit={partyType === "contact" ? unappliedCredit : 0}
              symbol={symbol}
              isReceipt={isReceipt}
              onOpenStatement={onOpenStatement}
            />
            <div className="flex items-center justify-between text-[11px] py-1 border-y border-dashed border-border/40">
              <span className="text-muted-foreground">أثر هذا المستند</span>
              <span
                className={`font-bold ${accentText}`}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {balanceDelta >= 0 ? "+" : "−"}{symbol}{fmt(Math.abs(balanceDelta))}
              </span>
            </div>
            <BalanceRow label={isPosted ? "الرصيد بعد القيد" : "الرصيد المتوقع بعد الحفظ"} value={after} symbol={symbol} bold />
          </div>
        </div>
      )}

      {/* Oldest invoice flag (only meta not in breakdown) */}
      {partyType === "contact" && openInvoicesCount > 0 && oldestInvoiceDays > 0 && (
        <div className="flex items-center justify-between px-1 text-[11px]">
          <span className="text-muted-foreground flex items-center gap-1">
            <FileText className="h-3 w-3" /> أقدم فاتورة مفتوحة
          </span>
          <span className="text-[10px] text-rose-600/90 font-medium">منذ {oldestInvoiceDays} يوم</span>
        </div>
      )}

      {/* Allocation status */}
      {partyType === "contact" && amount > 0 && (
        <AllocationStatus
          allocated={allocatedTotal}
          amount={amount}
          symbol={symbol}
          mismatch={allocationMismatch}
        />
      )}

      {/* Warnings */}
      <div className="space-y-2">
        {noAmount && (
          <Warning tone="info" icon={<Info className="h-3.5 w-3.5" />}>
            أدخل المبلغ لرؤية الأثر الكامل
          </Warning>
        )}
        {exceedsOpenInvoices && (
          <Warning tone="warn" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
            المبلغ يتجاوز إجمالي الفواتير المفتوحة بمقدار {symbol}{fmt(amount - openInvoicesTotal)} — سيتحول الفائض إلى دفعة مقدمة
          </Warning>
        )}
        {willOverpay && !exceedsOpenInvoices && (
          <Warning tone="warn" icon={<TrendingUp className="h-3.5 w-3.5" />}>
            المبلغ يتجاوز رصيد العميل المدين بـ {symbol}{fmt(amount - before)} — سيُسجَّل كرصيد دائن
          </Warning>
        )}
        {chequeMismatch && (
          <Warning tone="warn" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
            إجمالي الشيكات ({symbol}{fmt(chequesTotal)}) لا يساوي المبلغ — الفرق {symbol}{fmt(Math.abs(chequesTotal - amount))}
          </Warning>
        )}
        {!noAmount && !exceedsOpenInvoices && !willOverpay && !chequeMismatch && (
          <Warning tone="ok" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            القيد جاهز للحفظ والترحيل
          </Warning>
        )}
      </div>

      {date && (
        <div className="text-[10px] text-muted-foreground/60 text-center pt-1 font-mono">
          {date}
        </div>
      )}
    </div>
  );
}

/* ───────── helpers ───────── */

function BalanceRow({
  label,
  value,
  symbol,
  bold,
  muted,
}: {
  label: string;
  value: number;
  symbol: string;
  bold?: boolean;
  muted?: boolean;
}) {
  // positive = مدين (they owe us / customer debit)
  // negative = دائن
  const isDebit = value > 0.005;
  const isCredit = value < -0.005;
  const color = muted
    ? "text-muted-foreground"
    : isDebit
      ? "text-rose-600"
      : isCredit
        ? "text-emerald-600"
        : "text-foreground";
  const tag = isDebit ? "مدين" : isCredit ? "دائن" : "متوازن";
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${isDebit ? "bg-rose-500/10 text-rose-600" : isCredit ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
          {tag}
        </span>
        <span
          className={`${bold ? "text-sm font-bold" : "text-xs font-semibold"} ${color}`}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {symbol}{fmt(Math.abs(value))}
        </span>
      </span>
    </div>
  );
}

function BalanceBreakdown({
  total,
  openInvoicesTotal,
  unappliedCredit,
  symbol,
  isReceipt,
  onOpenStatement,
}: {
  total: number;
  openInvoicesTotal: number;
  unappliedCredit: number;
  symbol: string;
  isReceipt: boolean;
  onOpenStatement?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Determine balance nature first — drives interpretation of breakdown
  const isDebit = total > 0.005;     // they owe us (customer debit / receivable)
  const isCredit = total < -0.005;   // we owe them (supplier credit / payable)
  const isZero = !isDebit && !isCredit;

  // Bridge math (sign-aware):
  //   Customer (debit, total > 0): ledger ≈ openInvoices − unappliedCredit + other
  //   Supplier (credit, total < 0): ledger ≈ −openInvoices + unappliedAdvance + other
  //   "other" = movements not represented by open docs (paid history, journals, opening balance…)
  const expectedFromDocs = isCredit
    ? -(Math.max(0, openInvoicesTotal)) + Math.max(0, unappliedCredit)
    :  (Math.max(0, openInvoicesTotal)) - Math.max(0, unappliedCredit);
  const other = total - expectedFromDocs;
  const hasOther = Math.abs(other) > 0.01;
  const hasOpen = openInvoicesTotal > 0.01;
  const hasUnapplied = unappliedCredit > 0.01;
  // Only show breakdown when at least 2 components contribute — otherwise the "breakdown" is the value itself
  const componentCount = (hasOpen ? 1 : 0) + (hasUnapplied ? 1 : 0) + (hasOther ? 1 : 0);
  const hasBreakdown = !isZero && componentCount >= 2;

  const totalColor = isDebit
    ? "text-rose-600"
    : isCredit
      ? "text-emerald-600"
      : "text-foreground";
  const tag = isDebit ? "مدين" : isCredit ? "دائن" : "متوازن";
  const tagBg = isDebit
    ? "bg-rose-500/10 text-rose-600"
    : isCredit
      ? "bg-emerald-500/10 text-emerald-600"
      : "bg-muted text-muted-foreground";

  return (
    <div className="space-y-1.5">
      {/* Total row — clickable if breakdown available */}
      <button
        type="button"
        onClick={() => hasBreakdown && setExpanded(e => !e)}
        disabled={!hasBreakdown}
        className={`w-full flex items-center justify-between text-[11px] ${hasBreakdown ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
      >
        <span className="flex items-center gap-1 text-muted-foreground">
          الرصيد الإجمالي
          <span className="text-[9px] text-muted-foreground/60">(كشف الحساب)</span>
          {hasBreakdown && (
            <ChevronDown
              className={`h-3 w-3 text-muted-foreground/60 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${tagBg}`}>{tag}</span>
          <span
            className={`text-xs font-semibold ${totalColor}`}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {symbol}{fmt(Math.abs(total))}
          </span>
        </span>
      </button>

      {/* Breakdown — explains the gap between ledger and open invoices */}
      <AnimatePresence initial={false}>
        {expanded && hasBreakdown && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 rounded-lg bg-muted/40 border border-border/40 px-2.5 py-2 space-y-1.5 text-[10.5px]">
              {hasOpen && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <FileText className="h-2.5 w-2.5" /> فواتير مفتوحة
                  </span>
                  <span
                    className={`font-medium ${isCredit ? "text-emerald-600" : "text-rose-600"}`}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {isCredit ? "−" : "+"}{symbol}{fmt(openInvoicesTotal)}
                  </span>
                </div>
              )}
              {hasUnapplied && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Wallet className="h-2.5 w-2.5" /> دفعات غير مخصصة
                  </span>
                  <span
                    className={`font-medium ${isCredit ? "text-rose-600" : "text-emerald-600"}`}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {isCredit ? "+" : "−"}{symbol}{fmt(unappliedCredit)}
                  </span>
                </div>
              )}
              {hasOther && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Info className="h-2.5 w-2.5" /> حركات أخرى
                    <span className="text-[9px] text-muted-foreground/70">(دفعات سابقة، قيود)</span>
                  </span>
                  <span
                    className={`font-medium ${other >= 0 ? "text-rose-600" : "text-emerald-600"}`}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {other >= 0 ? "+" : "−"}{symbol}{fmt(Math.abs(other))}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-dashed border-border/50">
                <span className="text-muted-foreground font-medium">
                  = صافي الرصيد {isDebit ? "(مدين)" : isCredit ? "(دائن)" : ""}
                </span>
                <span className={`font-bold ${totalColor}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {symbol}{fmt(Math.abs(total))}
                </span>
              </div>
              {onOpenStatement && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpenStatement(); }}
                  className="w-full flex items-center justify-center gap-1 mt-1 pt-1.5 border-t border-border/40 text-[10px] text-primary hover:underline"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  عرض كشف الحساب الكامل
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AllocationStatus({
  allocated,
  amount,
  symbol,
  mismatch,
}: {
  allocated: number;
  amount: number;
  symbol: string;
  mismatch: boolean;
}) {
  const pct = amount > 0 ? Math.min(100, (allocated / amount) * 100) : 0;
  const remaining = Math.max(0, amount - allocated);
  const fullyAllocated = !mismatch && allocated > 0 && Math.abs(allocated - amount) < 0.01;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">المخصص للفواتير</span>
        <span
          className={`font-semibold ${fullyAllocated ? "text-emerald-600" : mismatch ? "text-amber-600" : "text-foreground"}`}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {symbol}{fmt(allocated)} / {symbol}{fmt(amount)}
        </span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3 }}
          className={`h-full ${fullyAllocated ? "bg-emerald-500" : mismatch ? "bg-amber-500" : "bg-primary"}`}
        />
      </div>
      {remaining > 0.01 && (
        <div className="text-[10px] text-muted-foreground">
          متبقي للتخصيص: <span className="font-semibold text-foreground">{symbol}{fmt(remaining)}</span>
        </div>
      )}
    </div>
  );
}

function Warning({
  children,
  tone,
  icon,
}: {
  children: React.ReactNode;
  tone: "ok" | "info" | "warn" | "error";
  icon?: React.ReactNode;
}) {
  const styles = {
    ok: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
    info: "bg-sky-500/10 text-sky-700 border-sky-500/20",
    warn: "bg-amber-500/10 text-amber-700 border-amber-500/20",
    error: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  }[tone];
  return (
    <div className={`flex items-start gap-2 text-[11px] leading-relaxed rounded-lg border px-2.5 py-2 ${styles}`}>
      {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
      <span>{children}</span>
    </div>
  );
}

/* ───────── Invoice / Credit Note / Debit Note Summary ─────────
 * Result-driven: subtotal → discount → tax → total
 *                + customer balance impact + warnings
 */
function InvoiceSummary({
  variant,
  invoiceType,
  subtotal,
  totalDiscount,
  totalTax,
  total,
  taxEnabled = true,
  taxInclusive = false,
  itemsCount = 0,
  partyName,
  balanceBefore,
  openInvoicesTotal = 0,
  unappliedCredit = 0,
  creditLimit,
  currency,
  exchangeRate = 1,
  dueDate,
  refNumber,
  onOpenStatement,
  symbol,
}: InvoiceProps & { symbol: string }) {
  const isCreditNote = variant === "credit_note";
  const isPurchase = invoiceType === "purchase";
  const isSales = invoiceType === "sales" && variant === "invoice";

  // Direction:
  //   sales invoice → INCREASES customer debit (they owe more)
  //   purchase invoice → INCREASES our liability to supplier (their credit grows)
  //   credit note (sales) → REDUCES customer debit
  const before = balanceBefore ?? 0;
  const delta = isCreditNote
    ? (isSales ? -total : total)
    : (isPurchase ? -total : total);
  const after = before + delta;

  // Warnings
  const noItems = !itemsCount || total <= 0;
  const overCreditLimit =
    isSales && (creditLimit ?? 0) > 0 && after > (creditLimit ?? 0) + 0.01;
  const headerColor = isCreditNote
    ? "from-amber-500/10 to-amber-500/5"
    : isPurchase
      ? "from-rose-500/10 to-rose-500/5"
      : "from-emerald-500/10 to-emerald-500/5";
  const accentText = isCreditNote
    ? "text-amber-700"
    : isPurchase
      ? "text-rose-600"
      : "text-emerald-600";
  const heroLabel = isCreditNote
    ? "إجمالي الإشعار"
    : isPurchase
      ? "إجمالي فاتورة المشتريات"
      : "إجمالي فاتورة المبيعات";

  return (
    <div className="space-y-3">
      {/* Hero — Total */}
      <div className={`relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${headerColor} px-4 pt-3 pb-3.5`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-muted-foreground/80 tracking-wide">
            {heroLabel}
          </span>
          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${isPurchase ? "bg-rose-500/15 text-rose-700" : isCreditNote ? "bg-amber-500/15 text-amber-700" : "bg-emerald-500/15 text-emerald-700"}`}>
            {isPurchase ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
            {isCreditNote ? "مرتجع" : isPurchase ? "صادر" : "وارد"}
          </span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={total}
            initial={{ opacity: 0.5, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className={`text-[2rem] leading-tight font-bold ${accentText} tracking-tight`}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {symbol}{fmt(total)}
          </motion.div>
        </AnimatePresence>
        {refNumber && (
          <div className="mt-1 text-[10px] text-muted-foreground/70 font-mono">{refNumber}</div>
        )}
      </div>

      {/* Breakdown */}
      <div className="rounded-xl border border-border/60 bg-card p-3 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">عدد البنود</span>
          <span className="font-semibold text-foreground tabular-nums">{itemsCount}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">
            {taxEnabled && taxInclusive ? "الإجمالي الفرعي (بدون ضريبة)" : "الإجمالي الفرعي"}
          </span>
          <span className="font-semibold text-foreground tabular-nums">{symbol}{fmt(subtotal)}</span>
        </div>
        {totalDiscount > 0 && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-rose-600">(−) الخصومات</span>
            <span className="font-semibold text-rose-600 tabular-nums">{symbol}{fmt(totalDiscount)}</span>
          </div>
        )}
        {taxEnabled && totalTax > 0 && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">
              {taxInclusive ? "الضريبة (مستخرجة)" : "(+) الضريبة 16%"}
            </span>
            <span className="font-semibold text-foreground tabular-nums">{symbol}{fmt(totalTax)}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-dashed border-border/50 text-[12px]">
          <span className="font-semibold text-foreground">الإجمالي النهائي</span>
          <span className={`font-bold ${accentText} tabular-nums`}>{symbol}{fmt(total)}</span>
        </div>
        {currency && currency !== "شيكل" && exchangeRate !== 1 && (
          <div className="flex items-center justify-between text-[10px] pt-1 border-t border-border/30">
            <span className="text-muted-foreground">المكافئ بالشيكل</span>
            <span className="font-medium text-foreground tabular-nums">₪{fmt(total * exchangeRate)}</span>
          </div>
        )}
      </div>

      {/* Customer/Supplier Impact */}
      {partyName && (
        <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            {isPurchase || isCreditNote ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
            الأثر على {isPurchase ? "المورد" : "الزبون"}
          </div>
          <div className="space-y-2">
            <BalanceBreakdown
              total={before}
              openInvoicesTotal={openInvoicesTotal}
              unappliedCredit={unappliedCredit}
              symbol={symbol}
              isReceipt={false}
              onOpenStatement={onOpenStatement}
            />
            <div className="flex items-center justify-between text-[11px] py-1 border-y border-dashed border-border/40">
              <span className="text-muted-foreground">
                {isCreditNote ? "− تخفيض" : isPurchase ? "+ التزام جديد" : "+ ذمة جديدة"}
              </span>
              <span
                className={`font-bold ${delta >= 0 ? (isPurchase ? "text-emerald-600" : "text-rose-600") : "text-emerald-600"}`}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {delta >= 0 ? "+" : "−"}{symbol}{fmt(Math.abs(delta))}
              </span>
            </div>
            <BalanceRow label="الرصيد بعد" value={after} symbol={symbol} bold />
          </div>
        </div>
      )}

      {/* Warnings */}
      <div className="space-y-2">
        {noItems && (
          <Warning tone="info" icon={<Info className="h-3.5 w-3.5" />}>
            أضِف بنوداً لرؤية الأثر الكامل على الذمة
          </Warning>
        )}
        {!noItems && overCreditLimit && (
          <Warning tone="warn" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
            الرصيد بعد الفاتورة يتجاوز الحد الائتماني المسموح ({symbol}{fmt(creditLimit ?? 0)})
          </Warning>
        )}
        {!noItems && !overCreditLimit && (
          <Warning tone="ok" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            الفاتورة جاهزة للحفظ والترحيل
          </Warning>
        )}
      </div>

      {dueDate && (
        <div className="text-[10px] text-muted-foreground/60 text-center pt-1 font-mono">
          استحقاق: {dueDate}
        </div>
      )}
    </div>
  );
}