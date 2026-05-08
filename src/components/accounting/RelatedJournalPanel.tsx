import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, FileText, ExternalLink, Wallet } from "lucide-react";

/**
 * Phase 5J — Cross-Link panel.
 *
 * Renders a compact "linked records" surface inside an Invoice preview, a
 * Voucher edit page, or a Journal row. The component is read-only and
 * uses ONLY the existing canonical sources:
 *   - `transactions`           (the ledger; matched by `reference`)
 *   - `payment_invoice_links`  (allocation rows; only when invoice case)
 *
 * It NEVER mutates data and NEVER bypasses RPC. It is purely UX glue so
 * the user can walk: invoice → ledger, voucher → invoice → ledger,
 * journal row → source — without dead ends.
 *
 * Provide exactly one of:
 *   - `invoiceId` + `invoiceNumber`   → shows allocations + ledger entries
 *   - `voucherNumber`                 → shows ledger entry + linked invoices
 *   - `transactionId`                 → minimal "open ledger" deep link
 */
export interface RelatedJournalPanelProps {
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  voucherNumber?: string | null;
  transactionId?: string | null;
  className?: string;
}

interface LedgerRow {
  id: string;
  transaction_date: string | null;
  amount: number;
  debit_account_code: string | null;
  credit_account_code: string | null;
  reference: string | null;
  description: string | null;
}

interface AllocationRow {
  id: string;
  invoice_id: string;
  transaction_id: string | null;
  payment_id: string | null;
  allocated_amount: number;
  source: string;
  invoice_number?: string;
  invoice_total?: number;
  invoice_remaining?: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat("ar", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
}

export function RelatedJournalPanel(props: RelatedJournalPanelProps) {
  const { invoiceId, invoiceNumber, voucherNumber, transactionId } = props;
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        // 1) Ledger lookup by reference (invoice number / voucher number)
        const ref = invoiceNumber || voucherNumber;
        if (ref) {
          const { data } = await supabase
            .from("transactions")
            .select("id, transaction_date, amount, debit_account_code, credit_account_code, reference, description")
            .eq("reference", ref)
            .eq("is_deleted", false)
            .order("transaction_date", { ascending: false })
            .limit(20);
          if (!cancelled) setLedger((data as any) || []);
        } else if (transactionId) {
          const { data } = await supabase
            .from("transactions")
            .select("id, transaction_date, amount, debit_account_code, credit_account_code, reference, description")
            .eq("id", transactionId)
            .limit(1);
          if (!cancelled) setLedger((data as any) || []);
        }

        // 2) Allocations
        if (invoiceId) {
          // For invoice context: show every allocation against this invoice
          const { data } = await supabase
            .from("payment_invoice_links")
            .select("id, invoice_id, transaction_id, payment_id, allocated_amount, source")
            .eq("invoice_id", invoiceId);
          if (!cancelled) setAllocations(((data as any) || []) as AllocationRow[]);
        } else if (voucherNumber) {
          // For voucher context: find the txn, then allocations linking that txn
          const { data: txns } = await supabase
            .from("transactions")
            .select("id")
            .eq("reference", voucherNumber)
            .eq("is_deleted", false);
          const txnIds = (txns || []).map((t: any) => t.id);
          if (txnIds.length) {
            const { data: rows } = await supabase
              .from("payment_invoice_links")
              .select("id, invoice_id, transaction_id, payment_id, allocated_amount, source")
              .in("transaction_id", txnIds);
            // Hydrate invoice numbers
            const invIds = Array.from(new Set((rows || []).map((r: any) => r.invoice_id)));
            let invMap: Record<string, { invoice_number: string; total_amount: number; remaining_amount: number }> = {};
            if (invIds.length) {
              const { data: invs } = await supabase
                .from("invoices")
                .select("id, invoice_number, total_amount, remaining_amount")
                .in("id", invIds);
              invMap = Object.fromEntries(
                (invs || []).map((i: any) => [i.id, { invoice_number: i.invoice_number, total_amount: i.total_amount, remaining_amount: i.remaining_amount }])
              );
            }
            if (!cancelled) {
              setAllocations(
                ((rows as any) || []).map((r: any) => ({
                  ...r,
                  invoice_number: invMap[r.invoice_id]?.invoice_number,
                  invoice_total: invMap[r.invoice_id]?.total_amount,
                  invoice_remaining: invMap[r.invoice_id]?.remaining_amount,
                }))
              );
            }
          } else if (!cancelled) {
            setAllocations([]);
          }
        } else if (!cancelled) {
          setAllocations([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [invoiceId, invoiceNumber, voucherNumber, transactionId]);

  const hasAnything = ledger.length > 0 || allocations.length > 0;

  return (
    <div className={`rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3 ${props.className ?? ""}`} dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="h-4 w-4 text-primary" />
          الروابط المحاسبية
        </div>
        {loading && <span className="text-xs text-muted-foreground">جارٍ التحميل…</span>}
      </div>

      {/* Ledger entries */}
      {ledger.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">قيود اليومية المرتبطة</div>
          <div className="space-y-1">
            {ledger.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-background px-3 py-2 text-xs"
              >
                <div className="flex flex-col">
                  <span className="font-mono">
                    {t.debit_account_code} → {t.credit_account_code}
                  </span>
                  <span className="text-muted-foreground">{t.transaction_date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold">{fmt(t.amount)}</span>
                  <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                    <Link to={`/transactions?focus=${t.id}`}>
                      <ExternalLink className="h-3 w-3" /> عرض القيد
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Allocations */}
      {allocations.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">
            {invoiceId ? "السندات المخصصة على هذه الفاتورة" : "الفواتير المخصصة من هذا السند"}
          </div>
          <div className="space-y-1">
            {allocations.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-background px-3 py-2 text-xs"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {invoiceId ? (
                      <>
                        <Wallet className="inline h-3 w-3 ml-1 text-primary" />
                        تخصيص #{a.id.slice(0, 6)}
                      </>
                    ) : (
                      <>
                        <FileText className="inline h-3 w-3 ml-1 text-primary" />
                        {a.invoice_number ?? `فاتورة #${a.invoice_id.slice(0, 6)}`}
                      </>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    <Badge variant="outline" className="ml-1">{a.source}</Badge>
                    {!invoiceId && a.invoice_total != null && (
                      <>الإجمالي {fmt(a.invoice_total)} • المتبقي {fmt(a.invoice_remaining ?? 0)}</>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {fmt(a.allocated_amount)}
                  </span>
                  {!invoiceId && (
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                      <Link to={`/invoices?focus=${a.invoice_id}`}>
                        <ExternalLink className="h-3 w-3" /> فتح الفاتورة
                      </Link>
                    </Button>
                  )}
                  {invoiceId && a.transaction_id && (
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                      <Link to={`/transactions?focus=${a.transaction_id}`}>
                        <ExternalLink className="h-3 w-3" /> عرض السند
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !hasAnything && (
        <div className="rounded-lg border border-amber-300/70 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          <div className="font-semibold mb-0.5">غير مرحّل محاسبياً</div>
          <div>
            هذا السند محفوظ، لكن لم يتم إنشاء قيد يومية مرتبط به بعد. لذلك لن يظهر في كشف الحساب أو ميزان المراجعة.
            اضغط <span className="font-semibold">«تحديث السند»</span> لإعادة الترحيل وإنشاء القيد المحاسبي.
          </div>
        </div>
      )}
    </div>
  );
}

export default RelatedJournalPanel;