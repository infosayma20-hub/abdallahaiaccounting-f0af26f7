import { useEffect, useState } from "react";
import { Link2, Loader2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Small popover to link a single bulk-voucher line to one open invoice
 * of the given contact. Emits the invoice id + capped allocation.
 *
 * mode="payment" → shows purchase/expense invoices to pay down (AP).
 * mode="receipt" → shows sales invoices to receive against (AR).
 */
export interface LinkedInvoiceInfo {
  invoice_id: string;
  invoice_number: string;
  allocated_amount: number;
  remaining_before: number;
}

interface Props {
  ownerId: string;
  contactId: string;
  mode: "payment" | "receipt";
  lineAmount: number;
  disabled?: boolean;
  value?: LinkedInvoiceInfo | null;
  onChange: (linked: LinkedInvoiceInfo | null) => void;
}

interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  invoice_date: string;
  total_amount: number;
  remaining_amount: number | null;
  invoice_type: string;
}

export default function BulkInvoiceLinkPicker({
  ownerId, contactId, mode, lineAmount, disabled, value, onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);

  useEffect(() => {
    if (!open || !contactId || !ownerId) return;
    (async () => {
      setLoading(true);
      const wantTypes = mode === "payment"
        ? ["purchase", "expense", "purchase_return"]
        : ["sales", "service", "invoice"];
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, total_amount, remaining_amount, invoice_type, payment_status")
        .eq("user_id", ownerId)
        .eq("contact_id", contactId)
        .in("invoice_type", wantTypes as any)
        .neq("payment_status", "paid")
        .eq("is_voided", false)
        .order("invoice_date", { ascending: false })
        .limit(50);
      setInvoices((data || []) as any);
      setLoading(false);
    })();
  }, [open, contactId, ownerId, mode]);

  const isLinked = !!value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={isLinked ? "default" : "outline"}
          className="h-8 text-[11px] gap-1"
          disabled={disabled || !contactId}
          title={!contactId ? "اختر الجهة أولاً" : "ربط بفاتورة"}
        >
          <Link2 className="w-3.5 h-3.5" />
          {isLinked ? (value?.invoice_number || "مرتبط") : "ربط فاتورة"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end" dir="rtl">
        <div className="p-2 border-b bg-muted/40 flex items-center justify-between">
          <span className="text-xs font-semibold">
            {mode === "payment" ? "فواتير مورّد مفتوحة" : "فواتير عميل مفتوحة"}
          </span>
          {isLinked && (
            <Button
              size="sm" variant="ghost"
              className="h-6 px-2 text-[10px] text-destructive"
              onClick={() => { onChange(null); setOpen(false); }}
            >
              <X className="w-3 h-3 ml-1" /> إلغاء الربط
            </Button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              لا توجد فواتير مفتوحة لهذه الجهة
            </div>
          ) : (
            <ul className="divide-y">
              {invoices.map((inv) => {
                const remaining = Number(inv.remaining_amount ?? inv.total_amount);
                const alloc = Math.min(lineAmount || 0, remaining);
                const chosen = value?.invoice_id === inv.id;
                return (
                  <li key={inv.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange({
                          invoice_id: inv.id,
                          invoice_number: inv.invoice_number || inv.id.slice(0, 6),
                          allocated_amount: alloc,
                          remaining_before: remaining,
                        });
                        setOpen(false);
                      }}
                      className={`w-full text-right px-3 py-2 text-xs hover:bg-primary/5 flex items-center justify-between gap-2 ${chosen ? "bg-primary/10" : ""}`}
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-semibold truncate">
                          {inv.invoice_number || inv.id.slice(0, 8)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {inv.invoice_date} • متبقّي {remaining.toLocaleString()}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] tabular-nums">
                        سيُطبَّق {alloc.toLocaleString()}
                      </Badge>
                      {chosen && <Check className="w-3.5 h-3.5 text-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}