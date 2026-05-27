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
 * Dynamics-style workspace surface — KPI summary on top, then voucher
 * shortcuts, grouped finance links, and recent activity. Every tile uses
 * the same unified `FinanceTile` component (large, icon square, full title
 * and description, full-card click). No truncated text.
 * Integrity/drift inspection lives on a separate admin-only page now.
 */

interface Snapshot {
  cash: number;
  bank: number;
  accounts_receivable: number;
  accounts_payable: number;
  customer_prepayments: number;
  supplier_advances: number;
}
/**
 * Drift payload still arrives from the RPC for back-office tooling,
 * but is no longer rendered on this page.
 */
interface CenterPayload {
  snapshot: Snapshot;
  drift: Record<string, number>;
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

/* ── Voucher tile — vertical: icon top center, title, description ── */
function VoucherTile({
  to,
  title,
  description,
  icon: Icon,
  accent,
  shortcut,
}: {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  shortcut?: string;
}) {
  return (
    <Link
      to={to}
      className="group relative flex min-h-[180px] flex-col items-center rounded-xl border border-border/60 bg-card p-5 text-center transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      {shortcut && (
        <span className="absolute left-3 top-3 rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
          {shortcut}
        </span>
      )}
      <div className={`mb-3 flex h-14 w-14 items-center justify-center rounded-xl ${accent}`}>
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
    </Link>
  );
}

/* ── Group card — icon top center, group title, list of sub-links ── */
function GroupCard({
  title,
  icon: Icon,
  accent,
  links,
}: {
  title: string;
  icon: LucideIcon;
  accent: string;
  links: { to?: string; label: string; comingSoon?: boolean }[];
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border/60 bg-card p-5 transition-shadow hover:shadow-md">
      <div className="mb-3 flex flex-col items-center text-center">
        <div className={`mb-3 flex h-14 w-14 items-center justify-center rounded-xl ${accent}`}>
          <Icon className="h-7 w-7" />
        </div>
        <h3 className="text-base font-bold text-foreground">{title}</h3>
      </div>
      <ul className="flex flex-col gap-0.5">
        {links.map((l) =>
          l.comingSoon || !l.to ? (
            <li
              key={l.label}
              className="rounded-md px-3 py-2 text-center text-[13px] text-muted-foreground/70"
            >
              {l.label} <span className="text-[10px]">(قريباً)</span>
            </li>
          ) : (
            <li key={l.label}>
              <Link
                to={l.to}
                className="block rounded-md px-3 py-2 text-center text-[13px] text-foreground transition-colors hover:bg-muted/60 hover:text-primary"
              >
                {l.label}
              </Link>
            </li>
          )
        )}
      </ul>
    </div>
  );
}

/* ── Quick voucher actions (top of page after KPIs) ── */
const voucherTiles: {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  shortcut?: string;
}[] = [
  {
    to: "/finance/receipt/new",
    title: "سند قبض",
    description: "تسجيل المقبوضات من العملاء على الحسابات أو الفواتير.",
    icon: ArrowDownLeft,
    accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    to: "/finance/payment/new",
    title: "سند صرف",
    description: "تسجيل المدفوعات للموردين والمصاريف بكل العملات.",
    icon: ArrowUpRight,
    accent: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  {
    to: "/finance/journal/new",
    title: "سند قيد",
    description: "إدخال قيد يومية يدوي متوازن مع دعم القوالب.",
    icon: FileEdit,
    accent: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    shortcut: "Alt+J",
  },
  {
    to: "/invoices/new",
    title: "فاتورة",
    description: "إنشاء فاتورة مبيعات أو مشتريات وربطها بالمخزون والذمم.",
    icon: FilePlus2,
    accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    to: "/account-statement",
    title: "كشف حساب",
    description: "عرض حركة عميل أو مورد مع إمكانية المشاركة والطباعة.",
    icon: FileCheck2,
    accent: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
];

/* ── Grouped finance links (one card per group, vertical layout) ── */
const linkGroups: {
  title: string;
  icon: LucideIcon;
  accent: string;
  links: { to?: string; label: string; comingSoon?: boolean }[];
}[] = [
  {
    title: "الدفاتر والحسابات",
    icon: BookOpen,
    accent: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    links: [
      { to: "/accounts", label: "شجرة الحسابات" },
      { to: "/transactions", label: "دفتر اليومية" },
      { to: "/general-ledger", label: "دفتر الأستاذ" },
      { to: "/trial-balance", label: "ميزان المراجعة" },
      { to: "/account-statement", label: "كشف حساب" },
    ],
  },
  {
    title: "النقد والبنوك",
    icon: Wallet,
    accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    links: [
      { to: "/finance/cash-boxes", label: "الصناديق" },
      { to: "/finance/bank-accounts", label: "البنوك" },
      { to: "/finance/cheques", label: "الشيكات" },
      { to: "/currency-management", label: "العملات" },
    ],
  },
  {
    title: "الذمم",
    icon: Users,
    accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    links: [
      { to: "/contacts?type=customer", label: "الزبائن" },
      { to: "/contacts?type=supplier", label: "الموردين" },
      { to: "/finance/receipts", label: "سندات القبض" },
      { to: "/finance/payments", label: "سندات الصرف" },
    ],
  },
  {
    title: "التقارير والامتثال",
    icon: BarChart3,
    accent: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    links: [
      { to: "/reports", label: "التقارير" },
      { to: "/tax", label: "الضريبة" },
      { to: "/fixed-assets", label: "الأصول الثابتة" },
      { label: "إغلاق الفترات", comingSoon: true },
    ],
  },
];

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

      {/* ── الملخص المالي (moved to top, immediately after title) ── */}
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

      {/* ── السندات (Quick voucher actions — emphasised tiles) ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">السندات</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {voucherTiles.map((t) => (
            <VoucherTile key={t.to} {...t} />
          ))}
        </div>
      </section>

      {/* ── روابط المالية (one card per group, vertical layout) ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">الروابط المالية</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {linkGroups.map((g) => (
            <GroupCard key={g.title} title={g.title} icon={g.icon} accent={g.accent} links={g.links} />
          ))}
        </div>
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