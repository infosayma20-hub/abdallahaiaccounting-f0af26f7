import { useEffect, useState } from "react";
import { Wallet, FileText, AlertTriangle, TrendingUp, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  contactId: string;
  contactName?: string;
  contactType?: "sales" | "purchase";
  creditLimit?: number;
  ledgerBalance?: number;
  /** When true, render as a single compact info strip (Mobile-style line). */
  compact?: boolean;
}

interface OpenInvoiceSummary {
  count: number;
  totalRemaining: number;
  oldestDate: string | null;
  oldestNumber: string | null;
}

const fmt = (n: number) =>
  `₪${Number(n || 0).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const daysSince = (iso: string) => {
  const d = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - d) / 86400000));
};

/**
 * Compact 3-up insight strip shown right under the contact picker after selection.
 * Goal: zero clicks needed to see balance, open invoices, and credit usage.
 */
export default function CustomerInsightsBar({
  contactId,
  contactType = "sales",
  creditLimit,
  ledgerBalance = 0,
  compact = false,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<OpenInvoiceSummary>({
    count: 0,
    totalRemaining: 0,
    oldestDate: null,
    oldestNumber: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!contactId) return;
      setLoading(true);
      const { data } = await supabase
        .from("invoices")
        .select("invoice_number, invoice_date, remaining_amount, payment_status, status")
        .eq("contact_id", contactId)
        .gt("remaining_amount", 0)
        .neq("status", "cancelled")
        .order("invoice_date", { ascending: true });
      if (cancelled) return;
      const rows = data || [];
      const totalRemaining = rows.reduce((s, r: any) => s + Number(r.remaining_amount || 0), 0);
      setOpen({
        count: rows.length,
        totalRemaining,
        oldestDate: rows[0]?.invoice_date || null,
        oldestNumber: rows[0]?.invoice_number || null,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  const overLimit = creditLimit && creditLimit > 0 && ledgerBalance > creditLimit;
  const utilization =
    creditLimit && creditLimit > 0 ? Math.min(100, (ledgerBalance / creditLimit) * 100) : 0;

  if (compact) {
    const balLabel =
      ledgerBalance > 0
        ? contactType === "sales" ? "مدين" : "علينا"
        : ledgerBalance < 0
        ? contactType === "sales" ? "دائن" : "لنا"
        : "صفر";
    const balColor =
      ledgerBalance > 0
        ? "text-destructive"
        : ledgerBalance < 0
        ? "text-emerald-600"
        : "text-muted-foreground";
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground leading-tight">
        <span className="inline-flex items-center gap-1">
          <Wallet className="h-3 w-3" />
          الرصيد:
          <span className={`font-semibold tabular-nums ${balColor}`}>
            {fmt(Math.abs(ledgerBalance))}
          </span>
          <span className="text-muted-foreground/80">{balLabel}</span>
        </span>
        <span className="text-border">|</span>
        <span className="inline-flex items-center gap-1">
          <FileText className="h-3 w-3" />
          فواتير مفتوحة:
          <span className="font-semibold tabular-nums text-foreground">
            {loading ? "..." : fmt(open.totalRemaining)}
          </span>
          {!loading && open.count > 0 && (
            <span className="text-muted-foreground/80">({open.count})</span>
          )}
          {open.oldestDate && (
            <span className="text-muted-foreground/80">· أقدم {daysSince(open.oldestDate)}ي</span>
          )}
        </span>
        {creditLimit && creditLimit > 0 && (
          <>
            <span className="text-border">|</span>
            <span className="inline-flex items-center gap-1">
              {overLimit ? (
                <AlertTriangle className="h-3 w-3 text-destructive" />
              ) : (
                <TrendingUp className="h-3 w-3" />
              )}
              الحد الائتماني:
              <span
                className={`font-semibold tabular-nums ${
                  overLimit ? "text-destructive" : "text-foreground"
                }`}
              >
                {fmt(creditLimit)}
              </span>
              <span className="text-muted-foreground/80">({utilization.toFixed(0)}%)</span>
            </span>
          </>
        )}
        {contactId && (
          <a
            href={`/account-statement?contact_id=${contactId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline ms-auto"
          >
            <ExternalLink className="h-3 w-3" /> كشف الحساب
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
      {/* 1) Ledger balance */}
      <div
        className={`rounded-xl p-2.5 border flex items-center gap-2.5 ${
          ledgerBalance > 0
            ? "bg-destructive/5 border-destructive/20"
            : ledgerBalance < 0
            ? "bg-emerald-500/5 border-emerald-500/20"
            : "bg-muted/40 border-border"
        }`}
      >
        <div
          className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
            ledgerBalance > 0
              ? "bg-destructive/15 text-destructive"
              : ledgerBalance < 0
              ? "bg-emerald-500/15 text-emerald-600"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <Wallet className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground leading-tight">رصيد دفتر الحساب</p>
          <p
            className={`text-sm font-bold tabular-nums leading-tight ${
              ledgerBalance > 0
                ? "text-destructive"
                : ledgerBalance < 0
                ? "text-emerald-600"
                : "text-foreground"
            }`}
          >
            {fmt(Math.abs(ledgerBalance))}
            <span className="text-[10px] font-normal text-muted-foreground mr-1">
              {ledgerBalance > 0
                ? contactType === "sales"
                  ? "مدين"
                  : "علينا"
                : ledgerBalance < 0
                ? contactType === "sales"
                  ? "دائن"
                  : "لنا"
                : "صفر"}
            </span>
          </p>
        </div>
      </div>

      {/* 2) Open invoices */}
      <div
        className={`rounded-xl p-2.5 border flex items-center gap-2.5 ${
          open.count > 0 ? "bg-warning/5 border-warning/20" : "bg-muted/40 border-border"
        }`}
      >
        <div
          className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
            open.count > 0 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"
          }`}
        >
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground leading-tight">
            فواتير مفتوحة {loading ? "..." : `(${open.count})`}
          </p>
          <p className="text-sm font-bold tabular-nums leading-tight text-foreground">
            {fmt(open.totalRemaining)}
            {open.oldestDate && (
              <span className="text-[10px] font-normal text-muted-foreground mr-1">
                · أقدم: {daysSince(open.oldestDate)}ي
              </span>
            )}
          </p>
        </div>
      </div>

      {/* 3) Credit limit (or quick action) */}
      {creditLimit && creditLimit > 0 ? (
        <div
          className={`rounded-xl p-2.5 border flex items-center gap-2.5 ${
            overLimit
              ? "bg-destructive/5 border-destructive/30"
              : utilization > 80
              ? "bg-warning/5 border-warning/30"
              : "bg-muted/40 border-border"
          }`}
        >
          <div
            className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
              overLimit
                ? "bg-destructive/15 text-destructive"
                : utilization > 80
                ? "bg-warning/15 text-warning"
                : "bg-primary/10 text-primary"
            }`}
          >
            {overLimit ? <AlertTriangle className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground leading-tight">
              الحد الائتماني · {utilization.toFixed(0)}%
            </p>
            <p className="text-sm font-bold tabular-nums leading-tight text-foreground">
              {fmt(creditLimit)}
            </p>
          </div>
        </div>
      ) : (
        <a
          href={contactId ? `/account-statement?contact_id=${contactId}` : "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl p-2.5 border border-border bg-muted/40 hover:bg-muted/60 transition-colors flex items-center gap-2.5 group"
        >
          <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-primary/10 text-primary">
            <ExternalLink className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground leading-tight">إجراء سريع</p>
            <p className="text-xs font-semibold leading-tight text-foreground group-hover:text-primary transition-colors">
              فتح كشف الحساب
            </p>
          </div>
        </a>
      )}
    </div>
  );
}
