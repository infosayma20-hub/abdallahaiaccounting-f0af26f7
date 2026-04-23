import { useMemo } from "react";
import { FileText, Search, CheckCircle, AlertTriangle, Info, Wand2, Hand, Wallet, Undo2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { multiWordMatchAny } from "@/lib/utils";
import {
  AllocatableInvoice,
  AllocationMode,
  VoucherKind,
  classifyVoucher,
  computeSummary,
  invoiceRemainingInVoucherCurrency,
  totalOutstanding,
} from "@/lib/voucher-allocation";

interface Props {
  voucherKind: VoucherKind;
  partyType: "contact" | "employee" | "account";
  hasContact: boolean;
  invoices: AllocatableInvoice[];
  amount: number;
  currency: string;
  exchangeRate: number;
  currencySymbol: string;
  mode: AllocationMode;
  onModeChange: (m: AllocationMode) => void;
  onToggle: (id: string) => void;
  onUpdateAllocation: (id: string, val: number) => void;
  onAutoAllocate: () => void;
  onClear: () => void;
  invoiceSearch: string;
  onInvoiceSearch: (s: string) => void;
}

const MODE_OPTIONS: { value: AllocationMode; label: string; icon: any; hint: string }[] = [
  { value: "auto",    label: "تخصيص تلقائي", icon: Wand2,  hint: "أقدم الفواتير أولاً، أو مطابقة المبلغ بالضبط" },
  { value: "manual",  label: "تخصيص يدوي",   icon: Hand,   hint: "اختر بنفسك أيّ الفواتير تريد ربطها" },
  { value: "advance", label: "دفعة مقدمة",   icon: Wallet, hint: "احتفظ بالمبلغ كرصيد بدون ربطه بفاتورة" },
];

const REFUND_OPTION = { value: "refund" as AllocationMode, label: "إرجاع للعميل", icon: Undo2, hint: "تخفيض رصيد العميل (استرداد دفعة)" };

const formatAmount = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SmartAllocationPanel = ({
  voucherKind, partyType, hasContact, invoices, amount, currency, exchangeRate, currencySymbol,
  mode, onModeChange, onToggle, onUpdateAllocation, onAutoAllocate, onClear, invoiceSearch, onInvoiceSearch,
}: Props) => {
  const isReceipt = voucherKind === "receipt";

  const summary = useMemo(() => computeSummary(invoices, amount), [invoices, amount]);
  const classification = useMemo(
    () => classifyVoucher({
      voucherKind, partyType, hasContact,
      openInvoiceCount: invoices.length, mode, summary,
    }),
    [voucherKind, partyType, hasContact, invoices.length, mode, summary],
  );

  const outstanding = useMemo(() => totalOutstanding(invoices, currency, exchangeRate), [invoices, currency, exchangeRate]);

  const filtered = useMemo(() => {
    if (!invoiceSearch.trim()) return invoices;
    return invoices.filter(i => multiWordMatchAny(invoiceSearch, i.invoice_number || ""));
  }, [invoices, invoiceSearch]);

  if (partyType !== "contact" || !hasContact) return null;

  const modeOptions = isReceipt ? MODE_OPTIONS : [...MODE_OPTIONS, REFUND_OPTION];

  const toneClasses = {
    success: "bg-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
    info:    "bg-primary/5 border-primary/20 text-primary",
    warning: "bg-amber-500/5 border-amber-500/30 text-amber-700 dark:text-amber-400",
    neutral: "bg-muted/40 border-border text-muted-foreground",
  }[classification.tone];

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            ربط بفاتورة
          </h3>
          <div className="text-[10px] text-muted-foreground flex items-center gap-3">
            <span>📂 {invoices.length} فاتورة مفتوحة</span>
            <span>💰 إجمالي مستحق: {currencySymbol}{formatAmount(outstanding)}</span>
          </div>
        </div>

        {/* Mode selector */}
        {/* Hierarchy: Auto (default — strongest) > Manual (secondary) > Advance (subtle / exceptional) */}
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-2">
          {modeOptions.map(opt => {
            const Icon = opt.icon;
            const active = mode === opt.value;
            const isPrimary = opt.value === "auto";
            const isException = opt.value === "advance" || opt.value === "refund";

            // Visual weight per role
            const baseClass = isPrimary
              ? // Default / recommended
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60"
              : isException
                ? // Subtle, dashed — exceptional choice
                  active
                    ? "border-amber-500/60 bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20"
                    : "border-dashed border-border/60 bg-transparent text-muted-foreground hover:bg-secondary/30 hover:text-foreground hover:border-border"
                : // Manual — neutral secondary
                  active
                    ? "border-foreground/40 bg-secondary text-foreground ring-1 ring-foreground/10"
                    : "border-border bg-card hover:bg-secondary/40";

            const iconColor = isPrimary && active
              ? "text-primary-foreground"
              : isException && active
                ? "text-amber-700"
                : active
                  ? "text-foreground"
                  : isPrimary
                    ? "text-primary"
                    : "text-muted-foreground";

            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onModeChange(opt.value);
                  if (opt.value === "auto") onAutoAllocate();
                  if (opt.value === "advance" || opt.value === "refund") onClear();
                }}
                className={`relative text-right rounded-xl border p-2.5 transition-all ${baseClass}`}
                title={opt.hint}
              >
                {isPrimary && !active && (
                  <span className="absolute -top-1.5 right-2 text-[8px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                    موصى به
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${iconColor}`} />
                  <span className={`text-xs font-bold ${isPrimary && active ? "text-primary-foreground" : ""}`}>
                    {opt.label}
                  </span>
                </div>
                <p className={`text-[10px] mt-0.5 leading-tight ${
                  isPrimary && active ? "text-primary-foreground/85" : "text-muted-foreground"
                }`}>
                  {opt.hint}
                </p>
              </button>
            );
          })}
        </div>

        {/* Classification badge */}
        <div className={`rounded-xl border p-3 ${toneClasses}`}>
          <div className="flex items-start gap-2">
            {classification.tone === "success" && <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
            {classification.tone === "warning" && <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
            {classification.tone === "info"    && <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />}
            {classification.tone === "neutral" && <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />}
            <div className="flex-1">
              <p className="text-xs font-bold">{classification.label}</p>
              <p className="text-[11px] mt-0.5 opacity-80">{classification.message}</p>
            </div>
          </div>
        </div>

        {/* Search + Invoice table — only when allocation modes are active */}
        {(mode === "auto" || mode === "manual") && invoices.length > 0 && (
          <>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={invoiceSearch}
                onChange={e => onInvoiceSearch(e.target.value)}
                placeholder="ابحث برقم الفاتورة..."
                className="pr-9"
              />
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-right" style={{ background: "#0D1B2A" }}>
                    <th className="p-2.5 text-white font-medium w-10">✓</th>
                    <th className="p-2.5 text-white font-medium">رقم الفاتورة</th>
                    <th className="p-2.5 text-white font-medium">التاريخ</th>
                    <th className="p-2.5 text-white font-medium">الاستحقاق</th>
                    <th className="p-2.5 text-white font-medium text-left">المتبقي</th>
                    <th className="p-2.5 text-white font-medium text-left w-28">المخصص</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv, idx) => {
                    const remaining = invoiceRemainingInVoucherCurrency(inv, currency, exchangeRate);
                    return (
                      <tr key={inv.id} className={`border-t border-border/30 ${inv.selected ? "bg-primary/5" : idx % 2 === 0 ? "bg-background" : "bg-secondary/20"}`}>
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={inv.selected}
                            onChange={() => onToggle(inv.id)}
                            className="w-4 h-4 rounded border-border accent-primary"
                          />
                        </td>
                        <td className="p-2.5 font-mono font-medium text-foreground">{inv.invoice_number || "-"}</td>
                        <td className="p-2.5 text-muted-foreground">{inv.invoice_date}</td>
                        <td className="p-2.5 text-muted-foreground">{inv.due_date || "-"}</td>
                        <td className="p-2.5 text-left font-mono font-bold">{currencySymbol}{formatAmount(remaining)}</td>
                        <td className="p-2.5">
                          {inv.selected && (
                            <Input
                              type="number"
                              value={inv.allocatedAmount || ""}
                              onChange={e => onUpdateAllocation(inv.id, parseFloat(e.target.value) || 0)}
                              className="h-7 text-xs font-mono text-left w-24"
                              min={0}
                              max={remaining}
                              step={0.01}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Summary footer */}
        {amount > 0 && (
          <div className="rounded-xl border border-border p-3 space-y-1.5 text-xs bg-secondary/20">
            <div className="flex justify-between">
              <span className="text-muted-foreground">قيمة السند:</span>
              <span className="font-mono font-bold">{currencySymbol}{formatAmount(summary.totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">الموزَّع على فواتير:</span>
              <span className="font-mono">({currencySymbol}{formatAmount(summary.totalAllocated)})</span>
            </div>
            <div className="border-t border-border/40 pt-1.5 flex justify-between font-bold">
              <span>غير موزَّع:</span>
              <span className="font-mono">{currencySymbol}{formatAmount(Math.abs(summary.unallocated))}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SmartAllocationPanel;
