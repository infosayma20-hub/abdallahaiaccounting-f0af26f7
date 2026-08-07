import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

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

  return (
    <Dialog open={!!drill} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2">
            تفاصيل {drill?.title}
            <Badge variant="outline" className="tabular-nums">{fmt(total)}</Badge>
          </DialogTitle>
          <DialogDescription>
            توزيع الرصيد على الحسابات الفرعية (حسابات {drill?.prefix.replace("%", "")}) وآخر الحركات المؤثرة عليه.
          </DialogDescription>
        </DialogHeader>

        {err && <p className="text-sm text-destructive">{err}</p>}

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : (
          <ScrollArea className="max-h-[65vh] pl-2">
            <div className="space-y-5">
              <div>
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground">الحسابات</h3>
                {accounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">لا توجد حركات على هذه الحسابات.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border/60">
                    <table className="w-full text-[12px]">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="p-2 text-right font-medium">الحساب</th>
                          <th className="p-2 text-right font-medium">مدين</th>
                          <th className="p-2 text-right font-medium">دائن</th>
                          <th className="p-2 text-right font-medium">الرصيد</th>
                          <th className="p-2 text-right font-medium">حركات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accounts.map((a) => (
                          <tr key={a.code} className="border-t border-border/50">
                            <td className="p-2">
                              <span className="font-mono text-[11px] text-muted-foreground">{a.code}</span> {a.name}
                            </td>
                            <td className="p-2 tabular-nums">{fmt(a.total_debit)}</td>
                            <td className="p-2 tabular-nums">{fmt(a.total_credit)}</td>
                            <td className={`p-2 font-semibold tabular-nums ${Number(a.balance) < 0 ? "text-destructive" : ""}`}>
                              {fmt(a.balance)}
                            </td>
                            <td className="p-2 tabular-nums text-muted-foreground">{a.entries}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground">آخر الحركات (50)</h3>
                {recent.length === 0 ? (
                  <p className="text-xs text-muted-foreground">لا توجد حركات.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border/60">
                    <table className="w-full text-[12px]">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="p-2 text-right font-medium">التاريخ</th>
                          <th className="p-2 text-right font-medium">البيان</th>
                          <th className="p-2 text-right font-medium">المرجع</th>
                          <th className="p-2 text-right font-medium">الجهة</th>
                          <th className="p-2 text-right font-medium">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.map((t) => (
                          <tr key={t.id} className="border-t border-border/50">
                            <td className="p-2 whitespace-nowrap">{t.transaction_date}</td>
                            <td className="p-2">{t.description || t.transaction_type || "—"}</td>
                            <td className="p-2 text-muted-foreground">{t.reference || "—"}</td>
                            <td className="p-2">
                              <Badge variant={t.side === "debit" ? "secondary" : "outline"}>
                                {t.side === "debit" ? "مدين" : "دائن"}
                              </Badge>
                            </td>
                            <td className="p-2 font-semibold tabular-nums">{fmt(t.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
