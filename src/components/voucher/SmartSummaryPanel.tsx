import { motion, AnimatePresence } from "framer-motion";
import { ArrowDown, ArrowUp, AlertTriangle, CheckCircle2, Wallet, Receipt as ReceiptIcon, Banknote, Building2, CreditCard, FileText, TrendingDown, TrendingUp, Info } from "lucide-react";

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
  amount: number;
  partyName?: string | null;
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
}

type Props = ReceiptPaymentProps;

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

  return null;
}

/* ───────── Receipt / Payment Summary ───────── */

function ReceiptPaymentSummary({
  variant,
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
      {/* Hero — Amount */}
      <div
        className={`relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${headerColor} p-5`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-muted-foreground tracking-wide">
            {isReceipt ? "💰 المبلغ المقبوض" : "💸 المبلغ المدفوع"}
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isReceipt ? "bg-emerald-500/15 text-emerald-700" : "bg-rose-500/15 text-rose-700"}`}>
            {isReceipt ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
            {isReceipt ? "وارد" : "صادر"}
          </span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={amount}
            initial={{ opacity: 0.5, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className={`text-3xl font-bold ${accentText} tracking-tight`}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {symbol}{fmt(amount)}
          </motion.div>
        </AnimatePresence>
        {refNumber && (
          <div className="mt-2 text-[10px] text-muted-foreground font-mono">{refNumber}</div>
        )}
      </div>

      {/* Payment method + cheque check */}
      {paymentMethod && (
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">طريقة الدفع</span>
            <span className="flex items-center gap-1.5 font-semibold text-foreground">
              <PayIcon className="h-3.5 w-3.5" /> {paymentMethod}
            </span>
          </div>
          {paymentMethod === "شيك" && chequesCount > 0 && (
            <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">عدد الشيكات</span>
                <span className="font-semibold text-foreground">{chequesCount}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">إجمالي الشيكات</span>
                <span className={`font-semibold ${chequeMismatch ? "text-amber-600" : "text-foreground"}`}>
                  {symbol}{fmt(chequesTotal)}
                </span>
              </div>
              {chequeMismatch && (
                <div className="text-[10px] text-amber-600 flex items-center gap-1 pt-1">
                  <AlertTriangle className="h-3 w-3" />
                  الفرق: {symbol}{fmt(Math.abs(chequesTotal - amount))}
                </div>
              )}
            </div>
          )}
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
            <BalanceRow label="الرصيد قبل" value={before} symbol={symbol} muted />
            <div className="flex items-center justify-between text-[11px] py-1 border-y border-dashed border-border/40">
              <span className="text-muted-foreground">{isReceipt ? "− تحصيل" : "+ صرف"}</span>
              <span
                className={`font-bold ${accentText}`}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {balanceDelta >= 0 ? "+" : "−"}{symbol}{fmt(Math.abs(balanceDelta))}
              </span>
            </div>
            <BalanceRow label="الرصيد بعد" value={after} symbol={symbol} bold />
          </div>
        </div>
      )}

      {/* Open invoices info */}
      {partyType === "contact" && openInvoicesCount > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" /> فواتير مفتوحة
            </span>
            <span className="font-semibold text-foreground">{openInvoicesCount}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">إجمالي المتبقي</span>
            <span className="font-semibold text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
              {symbol}{fmt(openInvoicesTotal)}
            </span>
          </div>
          {unappliedCredit > 0 && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">دفعات غير مخصصة</span>
              <span className="font-semibold text-amber-600" style={{ fontVariantNumeric: "tabular-nums" }}>
                {symbol}{fmt(unappliedCredit)}
              </span>
            </div>
          )}
          {oldestInvoiceDays > 0 && (
            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/40">
              <span className="text-muted-foreground">أقدم فاتورة</span>
              <span className="font-semibold text-rose-600">منذ {oldestInvoiceDays} يوم</span>
            </div>
          )}
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
        {!noAmount && !exceedsOpenInvoices && !willOverpay && !chequeMismatch && (
          <Warning tone="ok" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            القيد جاهز للحفظ والترحيل
          </Warning>
        )}
      </div>

      {date && (
        <div className="text-[10px] text-muted-foreground text-center pt-1">
          📅 {date}
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