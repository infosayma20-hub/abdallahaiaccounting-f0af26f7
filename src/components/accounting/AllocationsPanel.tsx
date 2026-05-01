/**
 * AllocationsPanel — Phase 5J.1 Allocation Visibility
 * ───────────────────────────────────────────────────
 * Shows for one contact:
 *   1) Unallocated payments (receipt_vouchers + payment vouchers with remaining balance)
 *   2) Recent allocations (payment_invoice_links rows that touched this contact)
 *
 * Read-only. Cross-links into the canonical voucher / invoice pages.
 *
 * It deliberately does NOT compute balances or call RPCs that mutate state.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Wallet, Link2 } from "lucide-react";

interface Props {
  contactId: string;
  contactName?: string | null;
  /** When true, only show the top 5 of each list (for embedded use such as Customer360). */
  compact?: boolean;
}

interface UnallocatedRow {
  id: string;
  kind: "receipt" | "payment";
  ref: string;
  date: string;
  amount: number;
  allocated: number;
  remaining: number;
}
interface AllocationRow {
  id: string;
  invoice_id: string;
  invoice_number: string | null;
  voucher_kind: "receipt" | "payment" | "other";
  voucher_id: string | null;
  voucher_number: string | null;
  allocated_amount: number;
  invoice_total: number;
  invoice_remaining: number;
  created_at: string;
}

function fmt(n: number) {
  return Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AllocationsPanel({ contactId, contactName, compact = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [unallocated, setUnallocated] = useState<UnallocatedRow[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // 1) Receipts for this contact (or matching by name when contact_id is null).
        const nameFilter = contactName?.trim() || "";
        const [receiptsRes, paymentsRes] = await Promise.all([
          supabase
            .from("receipt_vouchers")
            .select("id, receipt_number, payment_date, amount, allocated_amount, status, contact_id, contact_name")
            .or(
              [
                `contact_id.eq.${contactId}`,
                nameFilter ? `contact_name.eq.${nameFilter}` : "",
              ].filter(Boolean).join(",")
            )
            .neq("status", "cancelled")
            .order("payment_date", { ascending: false })
            .limit(200),
          supabase
            .from("vouchers")
            .select("id, ref_number, date, amount, allocated_amount, status, type, contact_id, description")
            .eq("type", "payment")
            .or(
              [
                `contact_id.eq.${contactId}`,
                nameFilter ? `description.ilike.%${nameFilter}%` : "",
              ].filter(Boolean).join(",")
            )
            .neq("status", "cancelled")
            .order("date", { ascending: false })
            .limit(200),
        ]);

        const rcv: UnallocatedRow[] = (receiptsRes.data || [])
          .map((r: any) => {
            const amount = Number(r.amount || 0);
            const allocated = Number(r.allocated_amount || 0);
            const remaining = +(amount - allocated).toFixed(2);
            return {
              id: r.id,
              kind: "receipt" as const,
              ref: r.receipt_number || "",
              date: r.payment_date || "",
              amount, allocated, remaining,
            };
          })
          .filter((r) => r.remaining > 0.01);

        const pay: UnallocatedRow[] = (paymentsRes.data || [])
          .map((p: any) => {
            const amount = Number(p.amount || 0);
            const allocated = Number(p.allocated_amount || 0);
            const remaining = +(amount - allocated).toFixed(2);
            return {
              id: p.id,
              kind: "payment" as const,
              ref: p.ref_number || "",
              date: p.date || "",
              amount, allocated, remaining,
            };
          })
          .filter((r) => r.remaining > 0.01);

        // 2) Recent allocations: read invoices for this contact then fetch links.
        const { data: invs } = await supabase
          .from("invoices")
          .select("id, invoice_number, total_amount, paid_amount, contact_id, contact_name")
          .or(
            [
              `contact_id.eq.${contactId}`,
              nameFilter ? `contact_name.eq.${nameFilter}` : "",
            ].filter(Boolean).join(",")
          )
          .order("created_at", { ascending: false })
          .limit(200);

        const invIds = (invs || []).map((i: any) => i.id);
        let allocRows: AllocationRow[] = [];
        if (invIds.length) {
          const { data: links } = await supabase
            .from("payment_invoice_links")
            .select("id, payment_id, transaction_id, invoice_id, allocated_amount, created_at")
            .in("invoice_id", invIds)
            .order("created_at", { ascending: false })
            .limit(100);

          const invMap = new Map<string, any>((invs || []).map((i: any) => [i.id, i]));
          // Resolve receipt voucher numbers in one batch.
          const paymentIds = Array.from(new Set((links || []).map((l: any) => l.payment_id).filter(Boolean)));
          const txIds = Array.from(new Set((links || []).map((l: any) => l.transaction_id).filter(Boolean)));
          const [{ data: rcvNums }, { data: txInfo }] = await Promise.all([
            paymentIds.length
              ? supabase.from("receipt_vouchers").select("id, receipt_number").in("id", paymentIds)
              : Promise.resolve({ data: [] as any[] }) as any,
            txIds.length
              ? supabase.from("transactions").select("id, reference, transaction_type").in("id", txIds)
              : Promise.resolve({ data: [] as any[] }) as any,
          ]);
          const rcvMap = new Map<string, string>((rcvNums || []).map((r: any) => [r.id, r.receipt_number || ""]));
          const txMap = new Map<string, any>((txInfo || []).map((t: any) => [t.id, t]));

          allocRows = (links || []).map((l: any) => {
            const inv = invMap.get(l.invoice_id) || {};
            const total = Number(inv.total_amount || 0);
            const paid = Number(inv.paid_amount || 0);
            let voucherKind: AllocationRow["voucher_kind"] = "other";
            let voucherNumber: string | null = null;
            if (l.payment_id) {
              voucherKind = "receipt";
              voucherNumber = rcvMap.get(l.payment_id) || null;
            } else if (l.transaction_id) {
              const tx = txMap.get(l.transaction_id);
              voucherNumber = tx?.reference || null;
              if (tx?.transaction_type?.includes("receipt") || tx?.transaction_type?.includes("قبض")) voucherKind = "receipt";
              else if (tx?.transaction_type?.includes("payment") || tx?.transaction_type?.includes("صرف")) voucherKind = "payment";
            }
            return {
              id: l.id,
              invoice_id: l.invoice_id,
              invoice_number: inv.invoice_number || null,
              voucher_kind: voucherKind,
              voucher_id: l.payment_id || null,
              voucher_number: voucherNumber,
              allocated_amount: Number(l.allocated_amount || 0),
              invoice_total: total,
              invoice_remaining: +(total - paid).toFixed(2),
              created_at: l.created_at,
            };
          });
        }

        if (cancelled) return;
        const merged = [...rcv, ...pay].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setUnallocated(merged);
        setAllocations(allocRows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [contactId, contactName]);

  const unallocatedShown = useMemo(
    () => (compact ? unallocated.slice(0, 5) : unallocated),
    [unallocated, compact]
  );
  const allocationsShown = useMemo(
    () => (compact ? allocations.slice(0, 5) : allocations),
    [allocations, compact]
  );

  const totalUnallocated = unallocated.reduce((s, r) => s + r.remaining, 0);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Unallocated */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-amber-500" />
            الدفعات غير المخصصة
            <Badge variant="outline" className="mr-2">{unallocated.length}</Badge>
          </CardTitle>
          <span className="text-xs text-muted-foreground">المجموع: ₪{fmt(totalUnallocated)}</span>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="px-4 py-6 text-xs text-muted-foreground">جارٍ التحميل…</p>
          ) : unallocatedShown.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted-foreground text-center">لا توجد دفعات غير مخصصة</p>
          ) : (
            <div className="divide-y">
              {unallocatedShown.map((r) => {
                const href = r.kind === "receipt"
                  ? `/finance/receipt/${r.id}/edit`
                  : `/finance/payment/${r.id}/edit`;
                return (
                  <div key={`${r.kind}-${r.id}`} className="flex items-center justify-between gap-2 px-4 py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant={r.kind === "receipt" ? "default" : "secondary"} className="shrink-0">
                        {r.kind === "receipt" ? "قبض" : "صرف"}
                      </Badge>
                      <span className="font-mono truncate">{r.ref || "—"}</span>
                      <span className="text-muted-foreground tabular-nums">{r.date}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="tabular-nums">₪{fmt(r.amount)}</span>
                      <span className="text-amber-600 font-semibold tabular-nums">متبقي ₪{fmt(r.remaining)}</span>
                      <Button asChild variant="outline" size="sm" className="h-7 px-2 text-[11px]">
                        <Link to={href}><ExternalLink className="h-3 w-3 ml-1" />عرض السند</Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent allocations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            آخر التخصيصات
            <Badge variant="outline" className="mr-2">{allocations.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="px-4 py-6 text-xs text-muted-foreground">جارٍ التحميل…</p>
          ) : allocationsShown.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted-foreground text-center">لا توجد تخصيصات بعد</p>
          ) : (
            <div className="divide-y">
              {allocationsShown.map((a) => {
                const voucherHref = a.voucher_kind === "receipt" && a.voucher_id
                  ? `/finance/receipt/${a.voucher_id}/edit`
                  : a.voucher_kind === "payment" && a.voucher_id
                  ? `/finance/payment/${a.voucher_id}/edit`
                  : null;
                return (
                  <div key={a.id} className="flex items-center justify-between gap-2 px-4 py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="shrink-0">
                        {a.voucher_kind === "receipt" ? "📥 قبض" : a.voucher_kind === "payment" ? "📤 صرف" : "سند"}
                      </Badge>
                      <span className="font-mono truncate">{a.voucher_number || "—"}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-mono truncate">📄 {a.invoice_number || "—"}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="tabular-nums text-emerald-600 font-semibold">₪{fmt(a.allocated_amount)}</span>
                      <span className="text-muted-foreground tabular-nums hidden md:inline">
                        من ₪{fmt(a.invoice_total)} (متبقي ₪{fmt(a.invoice_remaining)})
                      </span>
                      <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
                        <Link to={`/invoices?focus=${a.invoice_id}`}>الفاتورة</Link>
                      </Button>
                      {voucherHref && (
                        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
                          <Link to={voucherHref}>السند</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}