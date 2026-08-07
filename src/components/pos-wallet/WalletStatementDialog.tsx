/** WalletStatementDialog — كشف حركات محفظة زبون بأسلوب Dynamics. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DynamicsDialog, DynamicsSection } from "@/components/ui/dynamics-dialog";
import { RtlDataTable, type RtlColumn } from "@/components/ui/RtlDataTable";
import { Badge } from "@/components/ui/badge";

export interface WalletTxnRow {
  id: string;
  created_at: string;
  txn_type: string;
  amount: number;
  direction: number;
  balance_after: number;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  topup: "شحن", spend: "صرف", refund: "إرجاع", adjustment: "تسوية",
};

const fmt = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  walletId: string | null;
  contactName?: string;
  balance?: number;
}

export default function WalletStatementDialog({ open, onOpenChange, walletId, contactName, balance = 0 }: Props) {
  const [rows, setRows] = useState<WalletTxnRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !walletId) return;
    setLoading(true);
    (supabase as any)
      .from("wallet_transactions")
      .select("id, created_at, txn_type, amount, direction, balance_after, payment_method, reference, notes")
      .eq("wallet_id", walletId)
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data }: any) => { setRows((data || []) as WalletTxnRow[]); setLoading(false); });
  }, [open, walletId]);

  const totalIn = rows.filter(r => r.direction > 0).reduce((s, r) => s + Number(r.amount), 0);
  const totalOut = rows.filter(r => r.direction < 0).reduce((s, r) => s + Number(r.amount), 0);

  const columns: RtlColumn<WalletTxnRow>[] = [
    { key: "date", header: "التاريخ", render: (r) => new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) },
    { key: "type", header: "النوع", render: (r) => <Badge variant="secondary" className="text-[10px]">{TYPE_LABEL[r.txn_type] || r.txn_type}</Badge> },
    { key: "in", header: "شحن", align: "center", render: (r) => (r.direction > 0 ? <span className="tabular-nums text-emerald-600">{fmt(r.amount)}</span> : "—") },
    { key: "out", header: "صرف", align: "center", render: (r) => (r.direction < 0 ? <span className="tabular-nums text-destructive">{fmt(r.amount)}</span> : "—") },
    { key: "bal", header: "الرصيد", align: "center", render: (r) => <span className="tabular-nums font-medium">{fmt(r.balance_after)}</span> },
    { key: "ref", header: "المرجع", render: (r) => r.reference || "—" },
    { key: "notes", header: "ملاحظات", render: (r) => r.notes || "—" },
  ];

  return (
    <DynamicsDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`كشف محفظة — ${contactName || ""}`}
      description="جميع الحركات مسجّلة بشكل نهائي ولا يمكن تعديلها أو حذفها."
      facts={[
        { label: "الرصيد الحالي", value: fmt(balance), tone: balance > 0 ? "positive" : "default" },
        { label: "إجمالي الشحن", value: fmt(totalIn) },
        { label: "إجمالي الصرف", value: fmt(totalOut), tone: "negative" },
      ]}
    >
      <DynamicsSection title={`الحركات (${rows.length})`}>
        <RtlDataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={loading} emptyMessage="لا توجد حركات على هذه المحفظة" />
      </DynamicsSection>
    </DynamicsDialog>
  );
}
