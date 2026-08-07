import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DynamicsDialog, DynamicsSection } from "@/components/ui/dynamics-dialog";
import { RtlDataTable, type RtlColumn } from "@/components/ui/RtlDataTable";

export interface KpiDrill {
  title: string;
  prefix: string;
  natural: "debit" | "credit";
  hint?: string;
}

interface AccountRow {
  code: string;
  name: string;
  total_debit: number;
  total_credit: number;
  balance: number;
  entries: number;
}
interface RecentRow {
  id: string;
  transaction_date: string;
  transaction_type: string | null;
  debit_account_code: string | null;
  credit_account_code: string | null;
  amount: number;
  reference: string | null;
  description: string | null;
  side: "debit" | "credit";
}

function fmt(n: number) {
  return new Intl.NumberFormat("ar", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
}

export function KpiBreakdownDialog({ drill, onClose }: { drill: KpiDrill | null; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!drill) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      const { data, error } = await (supabase as any).rpc("get_accounting_center_kpi_breakdown", {
        _prefix: drill.prefix,
        _natural: drill.natural,
      });
      if (cancelled) return;
      if (error) setErr(error.message);
      else {
        setAccounts((data?.accounts ?? []) as AccountRow[]);
        setRecent((data?.recent ?? []) as RecentRow[]);
        setTotal(Number(data?.total ?? 0));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [drill]);

  const totalDebit = accounts.reduce((s, a) => s + Number(a.total_debit || 0), 0);
  const totalCredit = accounts.reduce((s, a) => s + Number(a.total_credit || 0), 0);

  const accountCols: RtlColumn<AccountRow>[] = [
    {
      key: "account",
      header: "الحساب",
      render: (a) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">{a.code}</span>
          <span>{a.name}</span>
        </div>
      ),
    },
    { key: "dr", header: "مدين", align: "center", cellClassName: "tabular-nums", render: (a) => fmt(a.total_debit) },
    { key: "cr", header: "دائن", align: "center", cellClassName: "tabular-nums", render: (a) => fmt(a.total_credit) },
    {
      key: "bal",
      header: "الرصيد",
      align: "center",
      cellClassName: (a) => `tabular-nums font-semibold ${Number(a.balance) < 0 ? "text-destructive" : ""}`,
      render: (a) => fmt(a.balance),
    },
    { key: "n", header: "حركات", align: "center", cellClassName: "tabular-nums text-muted-foreground", render: (a) => a.entries },
  ];

  const recentCols: RtlColumn<RecentRow>[] = [
    { key: "date", header: "التاريخ", align: "center", cellClassName: "whitespace-nowrap tabular-nums", render: (t) => t.transaction_date },
    { key: "desc", header: "البيان", render: (t) => t.description || t.transaction_type || "—" },
    { key: "ref", header: "المرجع", cellClassName: "text-muted-foreground font-mono text-[11px]", render: (t) => t.reference || "—" },
    {
      key: "side",
      header: "الجهة",
      align: "center",
      render: (t) => (
        <span
          className={`inline-block rounded-sm px-2 py-0.5 text-[11px] font-medium ${
            t.side === "debit" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {t.side === "debit" ? "مدين" : "دائن"}
        </span>
      ),
    },
    { key: "amt", header: "المبلغ", align: "center", cellClassName: "tabular-nums font-semibold", render: (t) => fmt(t.amount) },
  ];

  return (
    <DynamicsDialog
      open={!!drill}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={`تفاصيل ${drill?.title ?? ""}`}
      description={`توزيع الرصيد على الحسابات الفرعية (حسابات ${drill?.prefix.replace("%", "") ?? ""}) وآخر الحركات المؤثرة عليه.`}
      facts={[
        { label: "الرصيد", value: fmt(total), tone: total < 0 ? "negative" : "default" },
        { label: "إجمالي مدين", value: fmt(totalDebit) },
        { label: "إجمالي دائن", value: fmt(totalCredit) },
      ]}
    >
      {err && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</p>}

      <DynamicsSection title="الحسابات الفرعية">
        <RtlDataTable
          columns={accountCols}
          rows={accounts}
          rowKey={(a) => a.code}
          loading={loading}
          emptyMessage="لا توجد حركات على هذه الحسابات"
        />
      </DynamicsSection>

      <DynamicsSection title="آخر الحركات (50)">
        <RtlDataTable
          columns={recentCols}
          rows={recent}
          rowKey={(t) => t.id}
          loading={loading}
          emptyMessage="لا توجد حركات"
        />
      </DynamicsSection>
    </DynamicsDialog>
  );
}
