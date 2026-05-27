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

/* ── Unified finance tile — used for vouchers and grouped links alike ── */
function FinanceTile({
  to,
  title,
  description,
  icon: Icon,
  accent,
  shortcut,
  emphasis,
  comingSoon,
}: {
  to?: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string; // tailwind classes for icon square
  shortcut?: string;
  emphasis?: boolean; // voucher-style highlight
  comingSoon?: boolean;
}) {
  const base =
    "group relative flex min-h-[104px] items-start gap-3 rounded-xl border bg-card p-4 transition-all focus:outline-none focus:ring-2 focus:ring-primary/40";
  const interactive =
    "border-border/60 hover:border-primary/50 hover:shadow-md hover:bg-muted/20";
  const emphasised =
    "border-primary/30 bg-gradient-to-bl from-primary/[0.04] to-card hover:border-primary/60";
  const disabled =
    "border-dashed border-border/60 bg-muted/20 opacity-70 cursor-not-allowed";

  const body = (
    <>
      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-snug text-foreground">{title}</h3>
          {shortcut && (
            <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
              {shortcut}
            </span>
          )}
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          {description}
        </p>
        {comingSoon && (
          <p className="mt-1 text-[10px] font-medium text-muted-foreground/80">قريباً</p>
        )}
      </div>
    </>
  );

  if (comingSoon || !to) {
    return <div className={`${base} ${disabled}`}>{body}</div>;
  }
  return (
    <Link to={to} className={`${base} ${emphasis ? emphasised : interactive}`}>
      {body}
    </Link>
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

/* ── Grouped finance links ── */
const linkSections: {
  title: string;
  accent: string;
  tiles: { to?: string; title: string; description: string; icon: LucideIcon; comingSoon?: boolean }[];
}[] = [
  {
    title: "الدفاتر والحسابات",
    accent: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    tiles: [
      { to: "/accounts", title: "شجرة الحسابات", description: "إدارة دليل الحسابات الهرمي وضبط الحسابات الفرعية.", icon: Network },
      { to: "/transactions", title: "دفتر اليومية", description: "جميع القيود المحاسبية الموحّدة بفلاتر وعرض كثيف.", icon: BookOpen },
      { to: "/general-ledger", title: "دفتر الأستاذ", description: "حركات كل حساب على حدة مع الأرصدة التراكمية.", icon: BookText },
      { to: "/trial-balance", title: "ميزان المراجعة", description: "ميزان مراجعة فوري للتحقق من توازن الحسابات.", icon: Scale },
    ],
  },
  {
    title: "النقد والبنوك",
    accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    tiles: [
      { to: "/finance/cash-boxes", title: "الصناديق", description: "إدارة الصناديق النقدية وأرصدتها وتحويلاتها.", icon: Wallet },
      { to: "/finance/bank-accounts", title: "البنوك", description: "الحسابات البنكية وكشوفاتها وتسوياتها.", icon: Landmark },
      { to: "/finance/cheques", title: "الشيكات", description: "متابعة الشيكات الواردة والصادرة ودورة تحصيلها.", icon: FileCheck2 },
      { to: "/currency-management", title: "العملات", description: "أسعار الصرف وإدارة العملات الأجنبية.", icon: Coins },
    ],
  },
  {
    title: "الذمم",
    accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    tiles: [
      { to: "/contacts?type=customer", title: "الزبائن", description: "ملفات الزبائن وأرصدتهم وتاريخ تعاملاتهم.", icon: Users },
      { to: "/contacts?type=supplier", title: "الموردين", description: "ملفات الموردين والمستحقات والمدفوعات.", icon: Truck },
      { to: "/finance/receipts", title: "سندات القبض", description: "جميع سندات القبض المسجلة مع إمكانية البحث والتصدير.", icon: ArrowDownLeft },
      { to: "/finance/payments", title: "سندات الصرف", description: "جميع سندات الصرف المسجلة مع إمكانية البحث والتصدير.", icon: ArrowUpRight },
    ],
  },
  {
    title: "التقارير والامتثال",
    accent: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    tiles: [
      { to: "/reports", title: "التقارير", description: "تقارير مالية مالية مفصّلة وقابلة للتصدير والطباعة.", icon: BarChart3 },
      { to: "/tax", title: "الضريبة", description: "ضريبة القيمة المضافة والتقارير الضريبية الفلسطينية.", icon: Receipt },
      { to: "/fixed-assets", title: "الأصول الثابتة", description: "إدارة الأصول الثابتة والاستهلاك ودورة حياتها.", icon: Landmark },
      { title: "إغلاق الفترات", description: "إغلاق الفترات المالية ومنع التعديل عليها.", icon: ScrollText, comingSoon: true },
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {voucherTiles.map((t) => (
            <FinanceTile key={t.to} {...t} emphasis />
          ))}
        </div>
      </section>

      {/* ── روابط المالية (grouped tiles, same component) ── */}
      <section className="space-y-5">
        {linkSections.map((section) => (
          <div key={section.title}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {section.tiles.map((tile) => (
                <FinanceTile
                  key={tile.title}
                  to={tile.to}
                  title={tile.title}
                  description={tile.description}
                  icon={tile.icon}
                  accent={section.accent}
                  comingSoon={tile.comingSoon}
                />
              ))}
            </div>
          </div>
        ))}
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