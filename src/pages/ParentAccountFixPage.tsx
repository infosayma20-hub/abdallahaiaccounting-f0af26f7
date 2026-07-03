import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, RefreshCw, Search, ArrowRightLeft, Building2 } from "lucide-react";

interface Row {
  id: string;
  transaction_date: string;
  description: string | null;
  amount: number;
  currency: string | null;
  side: "debit" | "credit";
  parent_account_code: string;
  parent_account_name: string | null;
  other_account_code: string | null;
  other_account_name: string | null;
  contact_id: string | null;
  contact_name: string | null;
  transaction_type: string | null;
  reference: string | null;
}

interface LeafAccount {
  account_code: string;
  account_name: string;
  parent_code: string;
  account_type: string;
}

interface TenantOption {
  owner_id: string;
  company_name: string;
  stuck_count: number;
  missing_contact: number;
}

const TYPE_LABELS: Record<string, string> = {
  receipt: "سند قبض",
  payment: "سند صرف",
  journal: "قيد يومية",
  invoice: "فاتورة",
  return: "مردود",
  pos_sale: "مبيعات نقطة بيع",
  purchase: "فاتورة شراء",
  opening_balance: "رصيد افتتاحي",
  transfer: "تحويل",
  cheque: "شيك",
};

function formatAmount(n: number, currency?: string | null) {
  const v = new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  return `${v} ${currency || ""}`.trim();
}

function LeafAccountPicker({ onSelect, disabled, ownerId }: { onSelect: (acc: LeafAccount) => void; disabled?: boolean; ownerId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LeafAccount[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_leaf_accounts", {
        p_query: query || null,
        p_parent_code: null,
        p_limit: 80,
        p_owner_id: ownerId ?? null,
      });
      if (!active) return;
      if (error) toast.error("تعذّر تحميل الحسابات: " + error.message);
      setItems((data as LeafAccount[]) || []);
      setLoading(false);
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, open, ownerId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="gap-2 border-2">
          <Search className="h-4 w-4" />
          اختر الحساب الفرعي
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0" dir="rtl">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="ابحث بالكود أو الاسم..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading && <div className="p-3 text-sm text-muted-foreground">جاري البحث...</div>}
            {!loading && items.length === 0 && <CommandEmpty>لا توجد نتائج</CommandEmpty>}
            <CommandGroup>
              {items.map((it) => (
                <CommandItem
                  key={it.account_code}
                  value={it.account_code}
                  onSelect={() => {
                    onSelect(it);
                    setOpen(false);
                  }}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="font-medium">{it.account_name}</span>
                    <Badge variant="outline" className="font-mono">{it.account_code}</Badge>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function ParentAccountFixPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"missing" | "has">("missing");
  const [filter, setFilter] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) return;
      const { data: sa } = await supabase.rpc("is_super_admin", { _user_id: uid });
      if (!sa) return;
      setIsSuperAdmin(true);
      const { data: list, error } = await supabase.rpc("list_tenants_with_parent_stuck");
      if (error) {
        toast.error("تعذّر تحميل قائمة الشركات: " + error.message);
        return;
      }
      setTenants((list as TenantOption[]) || []);
    })();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_parent_account_transactions", {
      p_only_missing_contact: null,
      p_owner_id: selectedOwner ?? null,
    });
    if (error) toast.error("فشل التحميل: " + error.message);
    setRows((data as Row[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [selectedOwner]);

  const filtered = useMemo(() => {
    const base = rows.filter((r) => (tab === "missing" ? !r.contact_id : !!r.contact_id));
    if (!filter.trim()) return base;
    const q = filter.trim().toLowerCase();
    return base.filter(
      (r) =>
        (r.description || "").toLowerCase().includes(q) ||
        (r.contact_name || "").toLowerCase().includes(q) ||
        (r.parent_account_code || "").includes(q) ||
        (r.other_account_name || "").toLowerCase().includes(q) ||
        (r.reference || "").toLowerCase().includes(q),
    );
  }, [rows, tab, filter]);

  const counts = useMemo(() => ({
    missing: rows.filter((r) => !r.contact_id).length,
    has: rows.filter((r) => !!r.contact_id).length,
  }), [rows]);

  async function handleReroute(row: Row, acc: LeafAccount) {
    setSavingId(row.id);
    const { error } = await supabase.rpc("reroute_parent_transaction", {
      p_transaction_id: row.id,
      p_new_account_code: acc.account_code,
      p_new_contact_id: null,
      p_owner_id: selectedOwner ?? null,
    });
    setSavingId(null);
    if (error) {
      toast.error("فشل التصحيح: " + error.message);
      return;
    }
    toast.success(`تم التصحيح إلى ${acc.account_name}`);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    // Refresh tenant counts silently
    if (isSuperAdmin) {
      supabase.rpc("list_tenants_with_parent_stuck").then(({ data }) => {
        if (data) setTenants(data as TenantOption[]);
      });
    }
  }

  return (
    <div dir="rtl" className="mx-auto max-w-[1400px] p-4 space-y-4">
      <Card className="border-2 shadow-md">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b-2 bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-xl">تصحيح الحركات المُرحّلة على حسابات الأب</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                هذه الحركات مسجّلة مباشرة على حسابات الترحيل الرئيسية (ذمم عملاء عام / ذمم موردين عام). اختر الحساب الفرعي الصحيح لكل حركة ليتم تحويلها. كل تغيير يُسجَّل في سجل التدقيق ويمكن مراجعته لاحقاً.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} className="gap-2 border-2">
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
        </CardHeader>

        <CardContent className="p-4">
          {isSuperAdmin && (
            <div className="mb-4 rounded-lg border-2 border-blue-200 bg-blue-50/60 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-900">
                <Building2 className="h-4 w-4" />
                وضع السوبر أدمن — اختر الشركة المستهدفة
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={selectedOwner === null ? "default" : "outline"}
                  className="border-2"
                  onClick={() => setSelectedOwner(null)}
                >
                  شركتي الحالية
                </Button>
                {tenants.map((t) => (
                  <Button
                    key={t.owner_id}
                    size="sm"
                    variant={selectedOwner === t.owner_id ? "default" : "outline"}
                    className="gap-2 border-2"
                    onClick={() => setSelectedOwner(t.owner_id)}
                  >
                    {t.company_name}
                    <Badge variant="secondary" className="tabular-nums">{t.stuck_count}</Badge>
                  </Button>
                ))}
                {tenants.length === 0 && (
                  <span className="text-xs text-muted-foreground">لا توجد شركات فيها حركات عالقة 🎉</span>
                )}
              </div>
            </div>
          )}

          <Tabs value={tab} onValueChange={(v) => setTab(v as "missing" | "has")}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <TabsList className="border-2">
                <TabsTrigger value="missing" className="gap-2">
                  بدون جهة
                  <Badge variant="secondary">{counts.missing}</Badge>
                </TabsTrigger>
                <TabsTrigger value="has" className="gap-2">
                  بها جهة (شجرة مختلفة)
                  <Badge variant="secondary">{counts.has}</Badge>
                </TabsTrigger>
              </TabsList>
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="بحث في البيان أو الجهة أو المرجع..."
                  className="border-2 pr-8"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
            </div>

            <TabsContent value={tab} className="mt-0">
              <div className="rounded-lg border-2 bg-background">
                <Table>
                  <TableHeader className="bg-muted/60">
                    <TableRow className="border-b-2">
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">النوع</TableHead>
                      <TableHead className="text-right">البيان</TableHead>
                      <TableHead className="text-right">الجهة</TableHead>
                      <TableHead className="text-right">الحساب الحالي (أب)</TableHead>
                      <TableHead className="text-right">الطرف الآخر</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                      <TableHead className="text-center">إجراء التصحيح</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading &&
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={8}>
                            <Skeleton className="h-6 w-full" />
                          </TableCell>
                        </TableRow>
                      ))}
                    {!loading && filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                            لا توجد حركات بحاجة للتصحيح ضمن هذا التبويب.
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading &&
                      filtered.map((r, idx) => (
                        <TableRow key={r.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{r.transaction_date}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="border-2">
                              {TYPE_LABELS[r.transaction_type || ""] || r.transaction_type || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[260px] truncate" title={r.description || ""}>
                            {r.description || "—"}
                            {r.reference && (
                              <div className="text-[11px] text-muted-foreground">مرجع: {r.reference}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {r.contact_name ? (
                              <span className="font-medium">{r.contact_name}</span>
                            ) : (
                              <Badge variant="destructive" className="border-2">بدون جهة</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant="destructive" className="font-mono">{r.parent_account_code}</Badge>
                              <span className="text-xs">{r.parent_account_name}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {r.side === "debit" ? "مدين" : "دائن"}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.other_account_name || "—"}
                            {r.other_account_code && (
                              <div className="font-mono text-muted-foreground">{r.other_account_code}</div>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-semibold">
                            {formatAmount(Number(r.amount), r.currency)}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                              <LeafAccountPicker
                                disabled={savingId === r.id}
                                onSelect={(acc) => handleReroute(r, acc)}
                                ownerId={selectedOwner}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-4 rounded-lg border-2 border-dashed bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">ملاحظة هامة:</strong> عملية التصحيح آمنة تماماً — لا يتم حذف أي حركة، فقط يتم إعادة توجيهها من الحساب الأب إلى الحساب الفرعي الذي تختاره. جميع الأرصدة تبقى متوازنة، وكل عملية مُسجَّلة في سجل تدقيق المالية باسم المستخدم الذي نفّذها.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}