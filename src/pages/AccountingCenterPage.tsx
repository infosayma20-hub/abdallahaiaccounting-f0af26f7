import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Banknote,
  Building2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Receipt,
  FileText,
  PlusCircle,
  Wallet,
  ArrowRightLeft,
  BookOpen,
  Network,
  Scale,
  Users,
  Truck,
  Landmark,
  FileCheck2,
  Coins,
  BarChart3,
} from "lucide-react";

/**
 * Phase 5I — Accounting Center.
 * Single dashboard that turns the financial brain into a usable surface:
 *  - Live snapshot from `transactions` ledger only (no caches).
 *  - Drift / integrity panel with deep links.
 *  - Recent journal / vouchers / invoices.
 *  - Quick actions to canonical create flows (RPC-backed).
 *
 * NEVER bypass `get_accounting_center_snapshot`; never read column caches.
 */

interface Snapshot {
  cash: number;
  bank: number;
  accounts_receivable: number;
  accounts_payable: number;
  customer_prepayments: number;
  supplier_advances: number;
}
interface DriftCounts {
  tx_no_idempotency: number;
  tx_no_reference: number;
  tx_zero_amount: number;
  tx_same_account: number;
  invoice_no_link: number;
  cheque_no_voucher: number;
}
interface CenterPayload {
  snapshot: Snapshot;
  drift: DriftCounts;
  recent_journal: any[];
  recent_vouchers: any[];
  recent_invoices: any[];
  generated_at: string;
}

function fmt(n: number) {
  return new Intl.NumberFormat("ar", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function KpiCard({
  title, value, icon: Icon, tone = "default", hint,
}: {
  title: string;
  value: number;
  icon: any;
  tone?: "default" | "asset" | "liability";
  hint?: string;
}) {
  const toneClass =
    tone === "asset"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "liability"
      ? "text-rose-600 dark:text-rose-400"
      : "text-foreground";
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${toneClass}`}>{fmt(value)}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const driftMeta: Record<keyof DriftCounts, { label: string; href?: string }> = {
  tx_no_idempotency: { label: "قيود بدون مفتاح فريد", href: "/transactions" },
  tx_no_reference: { label: "قيود بدون مرجع", href: "/transactions" },
  tx_zero_amount: { label: "قيود بمبلغ صفر", href: "/transactions" },
  tx_same_account: { label: "قيود نفس الحساب طرفين", href: "/transactions" },
  invoice_no_link: { label: "فواتير بدون قيد محاسبي", href: "/invoices" },
  cheque_no_voucher: { label: "شيكات بدون سند", href: "/finance/cheques" },
};

export default function AccountingCenterPage() {
  const [data, setData] = useState<CenterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    const { data: payload, error } = await supabase.rpc("get_accounting_center_snapshot");
    if (error) setErr(error.message);
    else setData(payload as unknown as CenterPayload);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">مركز المحاسبة</h1>
          <p className="text-sm text-muted-foreground">
            مصدر الحقيقة الموحّد — كل الأرصدة تأتي من قيود اليومية مباشرة.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          تحديث
        </Button>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Button asChild variant="outline" className="justify-start gap-2">
          <Link to="/finance/receipt/new"><PlusCircle className="h-4 w-4" /> سند قبض</Link>
        </Button>
        <Button asChild variant="outline" className="justify-start gap-2">
          <Link to="/finance/payment/new"><PlusCircle className="h-4 w-4" /> سند صرف</Link>
        </Button>
        <Button asChild variant="outline" className="justify-start gap-2">
          <Link to="/finance/journal/new"><PlusCircle className="h-4 w-4" /> قيد يومية</Link>
        </Button>
        <Button asChild variant="outline" className="justify-start gap-2">
          <Link to="/invoices/new"><PlusCircle className="h-4 w-4" /> فاتورة</Link>
        </Button>
        <Button asChild variant="outline" className="justify-start gap-2">
          <Link to="/contacts"><Wallet className="h-4 w-4" /> كشف حساب</Link>
        </Button>
      </div>

      {/* روابط المالية الكاملة — وحدة الوصول الموحّدة بدل المنسدلة الطويلة في التطبيقات */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">روابط المالية</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {[
            { to: "/finance/receipts",   label: "سندات القبض",    icon: Receipt },
            { to: "/finance/payments",   label: "سندات الصرف",    icon: FileText },
            { to: "/finance/journals",   label: "سندات القيد",    icon: BookOpen },
            { to: "/accounts",           label: "شجرة الحسابات",  icon: Network },
            { to: "/transactions",       label: "دفتر اليومية",   icon: BookOpen },
            { to: "/general-ledger",     label: "دفتر الأستاذ",   icon: BookOpen },
            { to: "/account-statement",  label: "كشف الحساب",     icon: FileCheck2 },
            { to: "/trial-balance",      label: "ميزان المراجعة", icon: Scale },
            { to: "/contacts?type=customer", label: "الزبائن",    icon: Users },
            { to: "/contacts?type=supplier", label: "الموردين",   icon: Truck },
            { to: "/finance/cash-boxes", label: "الصناديق",       icon: Wallet },
            { to: "/finance/bank-accounts", label: "البنوك",      icon: Landmark },
            { to: "/finance/cheques",    label: "الشيكات",        icon: FileCheck2 },
            { to: "/currency-management", label: "العملات",       icon: Coins },
            { to: "/reports",            label: "التقارير",        icon: BarChart3 },
          ].map(({ to, label, icon: Icon }) => (
            <Button
              key={to}
              asChild
              variant="outline"
              className="justify-start gap-2 h-9"
            >
              <Link to={to}>
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-[13px]">{label}</span>
              </Link>
            </Button>
          ))}
        </div>
      </section>

      {err && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">خطأ في تحميل اللوحة: {err}</CardContent>
        </Card>
      )}

      {/* Snapshot */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">الملخص المالي</h2>
        {loading || !data ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard title="النقد (111*)" value={data.snapshot.cash} icon={Banknote} tone="asset" />
            <KpiCard title="البنوك (112*)" value={data.snapshot.bank} icon={Building2} tone="asset" />
            <KpiCard title="ذمم العملاء (113*)" value={data.snapshot.accounts_receivable} icon={TrendingUp} tone="asset" />
            <KpiCard title="ذمم الموردين (211*)" value={data.snapshot.accounts_payable} icon={TrendingDown} tone="liability" />
            <KpiCard title="دفعات مقدمة من العملاء (2115)" value={data.snapshot.customer_prepayments} icon={ArrowRightLeft} tone="liability" />
            <KpiCard title="سلف للموردين (1146)" value={data.snapshot.supplier_advances} icon={ArrowRightLeft} tone="asset" />
          </div>
        )}
      </section>

      {/* Alerts / Drift */}
      <section>
        <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" /> تنبيهات السلامة المحاسبية
        </h2>
        {loading || !data ? (
          <Skeleton className="h-32" />
        ) : (
          <Card>
            <CardContent className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 lg:grid-cols-6">
              {(Object.keys(driftMeta) as (keyof DriftCounts)[]).map((k) => {
                const cnt = Number((data.drift as any)?.[k] ?? 0);
                const meta = driftMeta[k];
                const danger = cnt > 0;
                const inner = (
                  <div className={`rounded-md border p-3 text-center transition ${danger ? "border-amber-400/60 bg-amber-50 dark:bg-amber-950/30" : "border-border"}`}>
                    <div className={`text-2xl font-bold ${danger ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{cnt}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{meta.label}</div>
                  </div>
                );
                return meta.href ? (
                  <Link key={k} to={meta.href} className="block">{inner}</Link>
                ) : (
                  <div key={k}>{inner}</div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Recent activity */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" /> آخر القيود
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {(data?.recent_journal ?? []).slice(0, 8).map((t: any) => (
              <Link key={t.id} to="/transactions" className="flex items-center justify-between rounded px-2 py-1 hover:bg-muted/50">
                <span className="truncate">{t.reference || t.description || t.transaction_type}</span>
                <span className="font-mono">{fmt(t.amount)}</span>
              </Link>
            ))}
            {!loading && (data?.recent_journal?.length ?? 0) === 0 && <p className="text-muted-foreground">لا يوجد بعد</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" /> آخر السندات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {(data?.recent_vouchers ?? []).slice(0, 8).map((v: any) => (
              <Link
                key={`${v.voucher_type}-${v.id}`}
                to={v.voucher_type === "receipt" ? `/finance/receipt/${v.id}/edit` : `/finance/payment/${v.id}/edit`}
                className="flex items-center justify-between rounded px-2 py-1 hover:bg-muted/50"
              >
                <span className="truncate">
                  <Badge variant="outline" className="ml-1">
                    {v.voucher_type === "receipt" ? "قبض" : "صرف"}
                  </Badge>
                  {v.voucher_number} — {v.contact_name || ""}
                </span>
                <span className="font-mono">{fmt(v.amount)}</span>
              </Link>
            ))}
            {!loading && (data?.recent_vouchers?.length ?? 0) === 0 && <p className="text-muted-foreground">لا يوجد بعد</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> آخر الفواتير
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {(data?.recent_invoices ?? []).slice(0, 8).map((inv: any) => (
              <Link key={inv.id} to={`/invoices`} className="flex items-center justify-between rounded px-2 py-1 hover:bg-muted/50">
                <span className="truncate">
                  {inv.invoice_number}
                  <Badge variant={inv.payment_status === "paid" ? "default" : inv.payment_status === "partial" ? "secondary" : "outline"} className="mr-2">
                    {inv.payment_status || inv.status}
                  </Badge>
                </span>
                <span className="font-mono">{fmt(inv.total_amount)}</span>
              </Link>
            ))}
            {!loading && (data?.recent_invoices?.length ?? 0) === 0 && <p className="text-muted-foreground">لا يوجد بعد</p>}
          </CardContent>
        </Card>
      </section>

      {data?.generated_at && (
        <p className="text-center text-xs text-muted-foreground">
          آخر تحديث: {new Date(data.generated_at).toLocaleString("ar")}
        </p>
      )}
    </div>
  );
}