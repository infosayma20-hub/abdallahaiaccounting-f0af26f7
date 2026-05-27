import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermission } from "@/hooks/usePermission";
import {
  Banknote,
  Building2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Receipt,
  FileText,
  RefreshCw,
  Wallet,
  BookOpen,
  BookText,
  Network,
  Scale,
  Users,
  Truck,
  Landmark,
  FileCheck2,
  Coins,
  BarChart3,
  ScrollText,
  ArrowDownLeft,
  ArrowUpRight,
  FileEdit,
  FilePlus2,
  type LucideIcon,
} from "lucide-react";

/**
 * مركز المالية (Finance Workspace).
 * Dynamics-style workspace surface — voucher tiles, grouped finance links,
 * essential KPIs, recent activity. Integrity drift is gated to back-office
 * roles so it never reaches the end customer.
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
  icon: LucideIcon;
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
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-[12px] font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-xl font-bold tabular-nums ${toneClass}`}>{fmt(value)}</div>
        {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/* ── Voucher tile (large, Dynamics-style) ── */
function VoucherTile({
  to, title, description, icon: Icon, accent, shortcut,
}: {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string; // tailwind classes for icon square
  shortcut?: string;
}) {
  return (
    <Link
      to={to}
      className="group relative flex items-start gap-3 rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          {shortcut && (
            <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {shortcut}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </Link>
  );
}

/* ── Compact finance link tile (grouped sections) ── */
function LinkTile({
  to, label, icon: Icon, accent, comingSoon,
}: {
  to?: string;
  label: string;
  icon: LucideIcon;
  accent: string;
  comingSoon?: boolean;
}) {
  const inner = (
    <>
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">{label}</p>
        {comingSoon && (
          <p className="text-[10px] text-muted-foreground">قريباً</p>
        )}
      </div>
    </>
  );
  if (comingSoon || !to) {
    return (
      <div className="flex cursor-not-allowed items-center gap-2.5 rounded-lg border border-dashed border-border/60 bg-muted/20 p-2.5 opacity-70">
        {inner}
      </div>
    );
  }
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card p-2.5 transition-all hover:border-primary/40 hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      {inner}
    </Link>
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

/* ── Finance link sections (grouped tiles) ── */
const linkSections: {
  title: string;
  accent: string;
  tiles: { to?: string; label: string; icon: LucideIcon; comingSoon?: boolean }[];
}[] = [
  {
    title: "الدفاتر والحسابات",
    accent: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    tiles: [
      { to: "/accounts", label: "شجرة الحسابات", icon: Network },
      { to: "/transactions", label: "دفتر اليومية", icon: BookOpen },
      { to: "/general-ledger", label: "دفتر الأستاذ", icon: BookText },
      { to: "/trial-balance", label: "ميزان المراجعة", icon: Scale },
    ],
  },
  {
    title: "النقد والبنوك",
    accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    tiles: [
      { to: "/finance/cash-boxes", label: "الصناديق", icon: Wallet },
      { to: "/finance/bank-accounts", label: "البنوك", icon: Landmark },
      { to: "/finance/cheques", label: "الشيكات", icon: FileCheck2 },
      { to: "/currency-management", label: "العملات", icon: Coins },
    ],
  },
  {
    title: "الذمم",
    accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    tiles: [
      { to: "/contacts?type=customer", label: "الزبائن", icon: Users },
      { to: "/contacts?type=supplier", label: "الموردين", icon: Truck },
      { to: "/finance/receipts", label: "سندات القبض", icon: ArrowDownLeft },
      { to: "/finance/payments", label: "سندات الصرف", icon: ArrowUpRight },
    ],
  },
  {
    title: "التقارير والامتثال",
    accent: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    tiles: [
      { to: "/reports", label: "التقارير", icon: BarChart3 },
      { to: "/tax", label: "الضريبة", icon: Receipt },
      { to: "/fixed-assets", label: "الأصول الثابتة", icon: Landmark },
      { label: "إغلاق الفترات", icon: ScrollText, comingSoon: true },
    ],
  },
];

export default function AccountingCenterPage() {
  const [data, setData] = useState<CenterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Drift / integrity panel is back-office only — never shown to end customers.
  const perms = usePermission("finance");
  const canSeeIntegrity = perms.isSuperAdmin || perms.can("journal", "delete");

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
          <h1 className="text-2xl font-bold">مركز المالية</h1>
          <p className="text-sm text-muted-foreground">
            مساحة عمل موحّدة — السندات، الدفاتر، الذمم، والتقارير في مكان واحد.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      {err && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">خطأ في تحميل اللوحة: {err}</CardContent>
        </Card>
      )}

      {/* ── السندات (Voucher tiles — Microsoft-style) ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">السندات</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <VoucherTile
            to="/finance/receipt/new"
            title="سند قبض"
            description="تسجيل المقبوضات من العملاء"
            icon={ArrowDownLeft}
            accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          />
          <VoucherTile
            to="/finance/payment/new"
            title="سند صرف"
            description="تسجيل المدفوعات للموردين والمصاريف"
            icon={ArrowUpRight}
            accent="bg-rose-500/10 text-rose-600 dark:text-rose-400"
          />
          <VoucherTile
            to="/finance/journal/new"
            title="سند قيد"
            description="قيد يومية يدوي متوازن"
            icon={FileEdit}
            accent="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
            shortcut="Alt+J"
          />
          <VoucherTile
            to="/invoices/new"
            title="فاتورة"
            description="إنشاء فاتورة مبيعات أو مشتريات"
            icon={FilePlus2}
            accent="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          />
          <VoucherTile
            to="/account-statement"
            title="كشف حساب"
            description="عرض حركة حساب عميل أو مورد"
            icon={FileCheck2}
            accent="bg-sky-500/10 text-sky-600 dark:text-sky-400"
          />
        </div>
      </section>

      {/* ── روابط المالية (grouped tiles) ── */}
      <section className="space-y-4">
        {linkSections.map((section) => (
          <div key={section.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {section.tiles.map((tile) => (
                <LinkTile
                  key={tile.label}
                  to={tile.to}
                  label={tile.label}
                  icon={tile.icon}
                  accent={section.accent}
                  comingSoon={tile.comingSoon}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ── الملخص المالي (essentials only) ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">الملخص المالي</h2>
        {loading || !data ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard title="النقد" value={data.snapshot.cash} icon={Banknote} tone="asset" hint="رصيد الصناديق" />
            <KpiCard title="البنوك" value={data.snapshot.bank} icon={Building2} tone="asset" hint="رصيد الحسابات البنكية" />
            <KpiCard title="ذمم العملاء" value={data.snapshot.accounts_receivable} icon={TrendingUp} tone="asset" hint="المستحق على العملاء" />
            <KpiCard title="ذمم الموردين" value={data.snapshot.accounts_payable} icon={TrendingDown} tone="liability" hint="المستحق للموردين" />
          </div>
        )}
      </section>

      {/* ── فحص النظام المحاسبي (back-office only) ── */}
      {canSeeIntegrity && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> فحص النظام المحاسبي
            <Badge variant="outline" className="text-[10px]">داخلي</Badge>
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
      )}

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