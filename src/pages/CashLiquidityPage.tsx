import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Loader2, Wallet, Building2, AlertTriangle, ArrowUpRight, ArrowDownRight, FileText } from "lucide-react";

interface CashAccount {
  account_code: string;
  account_name: string;
  type: "cash" | "bank";
  balance: number;
  total_dr: number;
  total_cr: number;
  last_movement_date: string | null;
  last_movement_desc: string | null;
  movement_count: number;
}

const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CashLiquidityPage() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);

  useEffect(() => {
    if (!user || !dataOwnerId) return;
    (async () => {
      setLoading(true);
      const [acctRes, txRes] = await Promise.all([
        supabase
          .from("accounts")
          .select("account_code, account_name")
          .eq("user_id", dataOwnerId)
          .or("account_code.like.111%,account_code.like.112%"),
        supabase
          .from("transactions")
          .select("debit_account_code, credit_account_code, amount, transaction_date, description")
          .eq("user_id", dataOwnerId)
          .eq("is_deleted", false)
          .or("debit_account_code.like.111%,debit_account_code.like.112%,credit_account_code.like.111%,credit_account_code.like.112%")
          .order("transaction_date", { ascending: false })
          .limit(5000),
      ]);

      const txs = txRes.data || [];
      const acctList = acctRes.data || [];

      const computed: CashAccount[] = acctList
        .map((a) => {
          const dr = txs
            .filter((t) => t.debit_account_code === a.account_code)
            .reduce((s, t) => s + (t.amount || 0), 0);
          const cr = txs
            .filter((t) => t.credit_account_code === a.account_code)
            .reduce((s, t) => s + (t.amount || 0), 0);
          const movements = txs.filter(
            (t) => t.debit_account_code === a.account_code || t.credit_account_code === a.account_code
          );
          const last = movements[0]; // already sorted desc
          return {
            account_code: a.account_code,
            account_name: a.account_name,
            type: a.account_code.startsWith("112") ? ("bank" as const) : ("cash" as const),
            balance: dr - cr,
            total_dr: dr,
            total_cr: cr,
            last_movement_date: last?.transaction_date || null,
            last_movement_desc: last?.description || null,
            movement_count: movements.length,
          };
        })
        .filter((a) => a.movement_count > 0 || a.balance !== 0)
        .sort((a, b) => b.balance - a.balance);

      setAccounts(computed);
      setLoading(false);
    })();
  }, [user, dataOwnerId]);

  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts]);
  const negativeAccounts = useMemo(() => accounts.filter((a) => a.balance < 0), [accounts]);
  const cashTotal = useMemo(
    () => accounts.filter((a) => a.type === "cash").reduce((s, a) => s + a.balance, 0),
    [accounts]
  );
  const bankTotal = useMemo(
    () => accounts.filter((a) => a.type === "bank").reduce((s, a) => s + a.balance, 0),
    [accounts]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-4" dir="rtl">
      <PageHeader title="تفاصيل السيولة النقدية" />
      <p className="text-sm text-muted-foreground -mt-2">
        الصناديق والبنوك فقط — لا يشمل الذمم أو المخزون
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">إجمالي السيولة</span>
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div className={`text-2xl font-bold tabular-nums ${totalBalance < 0 ? "text-red-500" : "text-emerald-600"}`}>
              ₪ {fmt(totalBalance)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">الصناديق</span>
              <Wallet className="h-5 w-5 text-amber-600" />
            </div>
            <div className={`text-2xl font-bold tabular-nums ${cashTotal < 0 ? "text-red-500" : "text-foreground"}`}>
              ₪ {fmt(cashTotal)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">البنوك</span>
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <div className={`text-2xl font-bold tabular-nums ${bankTotal < 0 ? "text-red-500" : "text-foreground"}`}>
              ₪ {fmt(bankTotal)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Negative balance alert */}
      {negativeAccounts.length > 0 && (
        <Card className="border-red-300 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-bold text-red-700 dark:text-red-400 mb-1">
                  يوجد {negativeAccounts.length} حساب نقدي برصيد دائن (سالب)
                </h3>
                <p className="text-sm text-red-600/90 mb-3">
                  الحسابات النقدية يجب أن تكون مدينة. الرصيد السالب يدل على سحب زائد أو قيد عكس بقيمة خاطئة. راجع كشف الحساب.
                </p>
                <div className="space-y-1">
                  {negativeAccounts.map((a) => (
                    <button
                      key={a.account_code}
                      onClick={() => navigate(`/account-statement?account=${a.account_code}`)}
                      className="flex items-center justify-between w-full text-sm bg-white dark:bg-card rounded-md p-2 hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors"
                    >
                      <span className="font-medium">
                        {a.account_code} — {a.account_name}
                      </span>
                      <span className="font-mono font-bold text-red-600">₪ {fmt(a.balance)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accounts list */}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {accounts.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                لا توجد حسابات نقدية أو بنكية بحركات
              </div>
            )}
            {accounts.map((a) => (
              <button
                key={a.account_code}
                onClick={() => navigate(`/account-statement?account=${a.account_code}`)}
                className="w-full p-4 text-right hover:bg-muted/30 transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {a.type === "bank" ? (
                    <Building2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  ) : (
                    <Wallet className="h-5 w-5 text-amber-600 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-foreground truncate">{a.account_name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {a.type === "bank" ? "بنك" : "صندوق"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3">
                      <span>كود: {a.account_code}</span>
                      <span>•</span>
                      <span>{a.movement_count} حركة</span>
                      {a.last_movement_date && (
                        <>
                          <span>•</span>
                          <span>آخر حركة: {a.last_movement_date}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-left flex-shrink-0">
                  <div className={`text-lg font-bold tabular-nums ${a.balance < 0 ? "text-red-500" : "text-emerald-600"}`}>
                    ₪ {fmt(a.balance)}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground justify-end mt-0.5">
                    <span className="flex items-center gap-0.5">
                      <ArrowDownRight className="h-3 w-3 text-emerald-600" />
                      {fmt(a.total_dr)}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <ArrowUpRight className="h-3 w-3 text-red-500" />
                      {fmt(a.total_cr)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => navigate("/finance/cash-boxes")}>
          <FileText className="h-4 w-4 ml-1" />
          إدارة الصناديق والبنوك
        </Button>
      </div>
    </div>
  );
}