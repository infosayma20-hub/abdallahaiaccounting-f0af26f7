import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ExternalLink, Pencil, Printer, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface StatementRow {
  date: string;
  description: string;
  transaction_type: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  transaction_id: string;
  currency: string;
  payment_method: string | null;
}

interface JournalLine {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  row: StatementRow | null;
  userId: string;
}

const fmtAmount = (n: number, currency?: string) => {
  if (n === 0) return "—";
  const sym = currency === "دولار" ? "$" : currency === "دينار" ? "د.أ" : "₪";
  return `${sym}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtDate = (d: string) => { if (!d) return "—"; const p = d.split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; };

const getTypeBadge = (txType: string): { label: string; color: string; bg: string } => {
  if (txType.includes("pos")) return { label: "مبيعات POS", color: "#7C3AED", bg: "#EDE9FE" };
  if (txType.includes("sale") || txType.includes("فاتورة")) return { label: "فاتورة مبيعات", color: "#059669", bg: "#ECFDF5" };
  if (txType.includes("receipt") || txType.includes("قبض")) return { label: "سند قبض", color: "#2563EB", bg: "#EFF6FF" };
  if (txType.includes("payment") || txType.includes("صرف")) return { label: "سند صرف", color: "#DC2626", bg: "#FEF2F2" };
  if (txType.includes("purchase") || txType.includes("مشتريات")) return { label: "فاتورة مشتريات", color: "#D97706", bg: "#FFFBEB" };
  if (txType.includes("journal") || txType.includes("قيد") || txType.includes("salary")) return { label: "قيد محاسبي", color: "#4B5563", bg: "#F3F4F6" };
  if (txType.includes("cheque")) return { label: "شيك", color: "#0891B2", bg: "#ECFEFF" };
  if (txType.includes("opening_balance")) return { label: "رصيد افتتاحي", color: "#6B7280", bg: "#F9FAFB" };
  return { label: "حركة", color: "#6B7280", bg: "#F9FAFB" };
};

// Resolve source URL from transaction_type and reference
function resolveSourceUrl(txType: string, reference: string, txId: string): { viewUrl: string | null; editUrl: string | null } {
  // Voucher-based (receipt/payment)
  if (txType.includes("receipt") || txType.includes("قبض")) {
    return { viewUrl: `/finance/receipts`, editUrl: null };
  }
  if (txType.includes("payment") || txType.includes("صرف") || txType.includes("employee_salary") || txType.includes("employee_payment")) {
    return { viewUrl: `/finance/payments`, editUrl: null };
  }
  // Invoice
  if (reference?.startsWith("INV-") || txType.includes("sale")) {
    return { viewUrl: `/invoices`, editUrl: null };
  }
  if (txType.includes("purchase") || reference?.startsWith("PO-")) {
    return { viewUrl: `/invoices`, editUrl: null };
  }
  // Journal
  if (txType.includes("journal") || txType.includes("قيد")) {
    return { viewUrl: `/finance/journals`, editUrl: null };
  }
  // POS
  if (txType.includes("pos")) {
    return { viewUrl: null, editUrl: null };
  }
  // Cheque
  if (txType.includes("cheque")) {
    return { viewUrl: `/finance/cheques`, editUrl: null };
  }
  return { viewUrl: null, editUrl: null };
}

export default function TransactionDetailDrawer({ open, onClose, row, userId }: Props) {
  const navigate = useNavigate();
  const [journalLines, setJournalLines] = useState<JournalLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [voucherId, setVoucherId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !row) { setJournalLines([]); setVoucherId(null); return; }
    fetchDetails();
  }, [open, row]);

  const fetchDetails = async () => {
    if (!row) return;
    setLoading(true);
    try {
      // Get all transaction lines with the same reference (multi-line entry)
      const ref = row.reference;
      let lines: JournalLine[] = [];

      if (ref && ref !== "—") {
        const { data: txs } = await supabase
          .from("transactions")
          .select("debit_account_code, credit_account_code, amount, description")
          .eq("user_id", userId)
          .eq("reference", ref)
          .eq("is_deleted", false)
          .order("created_at");

        if (txs && txs.length > 0) {
          // Get all unique account codes
          const codes = new Set<string>();
          txs.forEach(tx => { codes.add(tx.debit_account_code); codes.add(tx.credit_account_code); });
          const { data: accs } = await supabase
            .from("accounts")
            .select("account_code, account_name")
            .eq("user_id", userId)
            .in("account_code", Array.from(codes));
          const accMap: Record<string, string> = {};
          (accs || []).forEach(a => { accMap[a.account_code] = a.account_name; });

          // Build debit/credit lines
          const lineMap: Record<string, { debit: number; credit: number; desc: string }> = {};
          txs.forEach(tx => {
            const dc = tx.debit_account_code;
            const cc = tx.credit_account_code;
            const amt = tx.amount || 0;
            if (!lineMap[dc]) lineMap[dc] = { debit: 0, credit: 0, desc: tx.description || "" };
            lineMap[dc].debit += amt;
            if (!lineMap[cc]) lineMap[cc] = { debit: 0, credit: 0, desc: tx.description || "" };
            lineMap[cc].credit += amt;
          });

          lines = Object.entries(lineMap)
            .filter(([_, v]) => v.debit > 0 || v.credit > 0)
            .map(([code, v]) => ({
              account_code: code,
              account_name: accMap[code] || code,
              debit: v.debit,
              credit: v.credit,
              description: v.desc,
            }))
            .sort((a, b) => b.debit - a.debit); // Debits first
        }
      }

      // If only one tx (no multi-line), show the single tx
      if (lines.length === 0) {
        const { data: accs } = await supabase
          .from("accounts")
          .select("account_code, account_name")
          .eq("user_id", userId);
        const accMap: Record<string, string> = {};
        (accs || []).forEach(a => { accMap[a.account_code] = a.account_name; });

        const { data: tx } = await supabase
          .from("transactions")
          .select("debit_account_code, credit_account_code, amount")
          .eq("id", row.transaction_id)
          .single();
        if (tx) {
          lines = [
            { account_code: tx.debit_account_code, account_name: accMap[tx.debit_account_code] || tx.debit_account_code, debit: tx.amount, credit: 0, description: "" },
            { account_code: tx.credit_account_code, account_name: accMap[tx.credit_account_code] || tx.credit_account_code, debit: 0, credit: tx.amount, description: "" },
          ];
        }
      }

      setJournalLines(lines);

      let resolvedVoucherId: string | null = null;
      const isJournalDocument = row.transaction_type.includes("journal") || row.transaction_type.includes("قيد");

      if (isJournalDocument && row.reference) {
        const { data: journalVoucher } = await supabase
          .from("vouchers")
          .select("id")
          .eq("user_id", userId)
          .eq("type", "journal")
          .eq("ref_number", row.reference)
          .neq("status", "cancelled")
          .maybeSingle();
        resolvedVoucherId = journalVoucher?.id || null;
      }

      if (!resolvedVoucherId) {
        const { data: voucher } = await supabase
          .from("vouchers")
          .select("id")
          .eq("user_id", userId)
          .eq("linked_transaction_id", row.transaction_id)
          .maybeSingle();
        resolvedVoucherId = voucher?.id || null;
      }

      setVoucherId(resolvedVoucherId);
    } catch (err) {
      console.error("Error fetching transaction details:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!row) return null;

  const badge = getTypeBadge(row.transaction_type);
  const { viewUrl } = resolveSourceUrl(row.transaction_type, row.reference, row.transaction_id);
  const isJournalDocument = row.transaction_type.includes("journal") || row.transaction_type.includes("قيد");

  const handleOpenDocument = () => {
    if (voucherId && isJournalDocument) {
      navigate(`/finance/journal/new?edit=${voucherId}`);
      onClose();
      return;
    }
    if (voucherId) {
      const type = row.transaction_type.includes("receipt") || row.transaction_type.includes("قبض") ? "receipt" : "payment";
      navigate(`/finance/${type}/${voucherId}/edit`);
      onClose();
      return;
    }
    if (viewUrl) {
      navigate(viewUrl);
      onClose();
    }
  };

  const handleEdit = () => {
    if (voucherId && isJournalDocument) {
      navigate(`/finance/journal/new?edit=${voucherId}`);
      onClose();
      return;
    }
    if (voucherId) {
      const type = row.transaction_type.includes("receipt") || row.transaction_type.includes("قبض") ? "receipt" : "payment";
      navigate(`/finance/${type}/${voucherId}/edit`);
      onClose();
      return;
    }
    if (row.reference?.startsWith("INV-") || row.transaction_type.includes("sale")) {
      navigate(`/invoices/new?edit=${row.transaction_id}`);
      onClose();
      return;
    }
  };

  const isOpeningBalance = row.transaction_type.includes("opening_balance");
  const totalDebit = journalLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = journalLines.reduce((s, l) => s + l.credit, 0);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:w-[480px] overflow-y-auto p-0" dir="rtl">
        <SheetHeader className="px-5 pt-5 pb-3 border-b" style={{ borderColor: "hsl(var(--border))" }}>
          <SheetTitle className="text-right text-base font-bold" style={{ color: "hsl(var(--foreground))" }}>
            تفاصيل الحركة
          </SheetTitle>
        </SheetHeader>

        <div className="px-5 py-4 space-y-5">
          {/* ── Transaction Info ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>رقم المرجع</span>
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))", fontFamily: "monospace" }}>{row.reference || "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>التاريخ</span>
              <span className="text-sm" style={{ color: "hsl(var(--foreground))" }}>{fmtDate(row.date)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>النوع</span>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full font-medium" style={{ color: badge.color, background: badge.bg }}>{badge.label}</span>
            </div>
            <div>
              <span className="text-xs block mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>البيان</span>
              <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--foreground))" }}>{row.description}</p>
            </div>

            {/* Amounts */}
            <div className="grid grid-cols-3 gap-3 rounded-lg p-3" style={{ background: "hsl(var(--muted))" }}>
              <div className="text-center">
                <div className="text-[10px] mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>مدين</div>
                <div className="text-sm font-bold" style={{ color: "#1E40AF", fontFamily: "tabular-nums" }}>{row.debit > 0 ? fmtAmount(row.debit, row.currency) : "—"}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>دائن</div>
                <div className="text-sm font-bold" style={{ color: "#065F46", fontFamily: "tabular-nums" }}>{row.credit > 0 ? fmtAmount(row.credit, row.currency) : "—"}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>الرصيد بعد</div>
                <div className="text-sm font-bold" style={{ color: row.balance >= 0 ? "#059669" : "#DC2626", fontFamily: "tabular-nums" }}>{fmtAmount(row.balance, row.currency)}</div>
              </div>
            </div>
          </div>

          {/* ── Journal Lines ── */}
          <div>
            <h3 className="text-xs font-semibold mb-2" style={{ color: "hsl(var(--foreground))" }}>📋 الأسطر المحاسبية</h3>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
              </div>
            ) : journalLines.length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: "hsl(var(--muted-foreground))" }}>لا توجد أسطر</p>
            ) : (
              <div className="rounded-lg overflow-hidden" style={{ border: "1px solid hsl(var(--border))" }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ background: "hsl(var(--muted))" }}>
                      <th className="text-right text-[10px] font-semibold px-3 py-2" style={{ color: "hsl(var(--muted-foreground))" }}>الحساب</th>
                      <th className="text-left text-[10px] font-semibold px-3 py-2" style={{ color: "hsl(var(--muted-foreground))" }}>مدين</th>
                      <th className="text-left text-[10px] font-semibold px-3 py-2" style={{ color: "hsl(var(--muted-foreground))" }}>دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journalLines.map((line, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                        <td className="px-3 py-2">
                          <div className="text-[11px] font-medium" style={{ color: "hsl(var(--foreground))" }}>{line.account_name}</div>
                          <div className="text-[9px]" style={{ color: "hsl(var(--muted-foreground))" }}>{line.account_code}</div>
                        </td>
                        <td className="px-3 py-2 text-left text-[11px] font-semibold" style={{ color: "#1E40AF", fontFamily: "tabular-nums", direction: "ltr" }}>
                          {line.debit > 0 ? fmtAmount(line.debit, row.currency) : "—"}
                        </td>
                        <td className="px-3 py-2 text-left text-[11px] font-semibold" style={{ color: "#065F46", fontFamily: "tabular-nums", direction: "ltr" }}>
                          {line.credit > 0 ? fmtAmount(line.credit, row.currency) : "—"}
                        </td>
                      </tr>
                    ))}
                    {/* Total row */}
                    <tr style={{ background: "hsl(var(--muted))" }}>
                      <td className="px-3 py-2 text-[10px] font-bold" style={{ color: "hsl(var(--foreground))" }}>الإجمالي</td>
                      <td className="px-3 py-2 text-left text-[11px] font-bold" style={{ color: "#1E40AF", fontFamily: "tabular-nums", direction: "ltr" }}>{fmtAmount(totalDebit, row.currency)}</td>
                      <td className="px-3 py-2 text-left text-[11px] font-bold" style={{ color: "#065F46", fontFamily: "tabular-nums", direction: "ltr" }}>{fmtAmount(totalCredit, row.currency)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Action Buttons ── */}
          {!isOpeningBalance && (
            <div className="flex gap-2 pt-2">
              {(viewUrl || voucherId) && (
                <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={handleOpenDocument}>
                  <ExternalLink className="w-3.5 h-3.5" /> فتح المستند
                </Button>
              )}
              {(voucherId || row.transaction_type.includes("journal") || row.transaction_type.includes("قيد") || row.reference?.startsWith("INV-")) && (
                <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={handleEdit}>
                  <Pencil className="w-3.5 h-3.5" /> تعديل
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5" /> طباعة
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
