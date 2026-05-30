import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Loader2, Settings, FileText, Wallet, Building2, Monitor, Landmark,
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Banknote, Search,
  ChevronDown, MoreHorizontal, RefreshCw, Printer, FileSpreadsheet,
  Calculator,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CashBoxDrawer from "@/components/finance/CashBoxDrawer";
import PettyCashReplenishDialog from "@/components/finance/PettyCashReplenishDialog";
import CurrencyExchangeDialog from "@/components/finance/CurrencyExchangeDialog";
import BankDepositDialog from "@/components/finance/BankDepositDialog";
import CashBoxTransferDialog from "@/components/finance/CashBoxTransferDialog";
import {
  FinanceShell, applyFilters,
  type ActionTab, type FilterCondition, type FilterField,
} from "@/components/finance/shell";
import { ColumnVisibilityMenu } from "@/components/finance/shell/ColumnVisibilityMenu";
import { useColumnVisibility, type ColumnDef } from "@/components/finance/shell/useColumnVisibility";

type SortKey = "name" | "balance" | "branch";
type SortDir = "asc" | "desc";

const TYPE_LABELS: Record<string, string> = {
  main: "الصندوق الرئيسي",
  branch: "صندوق فرع",
  pos: "صندوق POS",
  petty: "صندوق نثرية",
  petty_cash: "صندوق نثرية",
  bank: "حساب بنكي",
};

const CashBoxesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [boxes, setBoxes] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerType, setDrawerType] = useState<"main" | "branch" | "pos" | "petty" | "petty_cash">("branch");
  const [editBox, setEditBox] = useState<any>(null);
  const [replenishOpen, setReplenishOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    main: true, branch: true, pos: true, petty: false, bank: false,
  });
  const [sortBy, setSortBy] = useState<Record<string, { key: SortKey; dir: SortDir }>>({});

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [boxRes, bankRes] = await Promise.all([
      supabase.from("cash_boxes").select("*").eq("is_active", true).order("type", { ascending: true }),
      supabase.from("bank_accounts").select("*").eq("user_id", user.id).eq("is_active", true),
    ]);
    setBoxes(boxRes.data || []);
    setBankAccounts(bankRes.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Compute balances
  const [balances, setBalances] = useState<Record<string, { balance: number; inflow: number; outflow: number; foreignBalances: Record<string, number> }>>({});

  useEffect(() => {
    if (!user || (boxes.length === 0 && bankAccounts.length === 0)) return;
    const boxCodes = boxes.map(b => b.gl_account_code).filter(Boolean);
    const bankCodes = bankAccounts.map(b => b.gl_account_code).filter(Boolean);
    const allCodes = [...new Set([...boxCodes, ...bankCodes])];
    if (allCodes.length === 0) return;

    (async () => {
      const { data: txs } = await supabase
        .from("transactions")
        .select("amount, debit_account_code, credit_account_code, transaction_date, foreign_amount, exchange_rate, currency")
        .eq("is_deleted", false);

      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const result: Record<string, { balance: number; inflow: number; outflow: number; foreignBalances: Record<string, number> }> = {};

      for (const code of allCodes) {
        let balance = 0, inflow = 0, outflow = 0;
        const foreignBalances: Record<string, number> = {};
        (txs || []).forEach(tx => {
          const amt = Number(tx.amount) || 0;
          const foreignAmt = Number(tx.foreign_amount) || 0;
          const rate = Number(tx.exchange_rate) || 1;
          let txCurrency = "ILS";
          if (foreignAmt > 0 && rate > 1) {
            const cur = tx.currency;
            if (cur === "دولار" || cur === "USD") txCurrency = "USD";
            else if (cur === "دينار" || cur === "JOD") txCurrency = "JOD";
            else if (cur === "يورو" || cur === "EUR") txCurrency = "EUR";
          }
          if (tx.debit_account_code === code) {
            balance += amt;
            if (txCurrency !== "ILS" && foreignAmt > 0) foreignBalances[txCurrency] = (foreignBalances[txCurrency] || 0) + foreignAmt;
          }
          if (tx.credit_account_code === code) {
            balance -= amt;
            if (txCurrency !== "ILS" && foreignAmt > 0) foreignBalances[txCurrency] = (foreignBalances[txCurrency] || 0) - foreignAmt;
          }
          if (tx.transaction_date >= monthStart) {
            if (tx.debit_account_code === code) inflow += amt;
            if (tx.credit_account_code === code) outflow += amt;
          }
        });
        result[code] = { balance, inflow, outflow, foreignBalances };
      }
      setBalances(result);
    })();
  }, [user, boxes, bankAccounts]);

  const mainBoxes = useMemo(() => boxes.filter(b => b.type === "main"), [boxes]);
  const branchBoxes = useMemo(() => boxes.filter(b => b.type === "branch"), [boxes]);
  const posBoxes = useMemo(() => boxes.filter(b => b.type === "pos"), [boxes]);
  const pettyBoxes = useMemo(() => boxes.filter(b => b.type === "petty" || b.type === "petty_cash"), [boxes]);

  const getBalance = (code: string) => balances[code]?.balance || 0;
  const totalBalance = useMemo(() => boxes.reduce((s, b) => s + getBalance(b.gl_account_code), 0), [boxes, balances]);
  const mainBalance = useMemo(() => mainBoxes.reduce((s, b) => s + getBalance(b.gl_account_code), 0), [mainBoxes, balances]);
  const branchBalance = useMemo(() => branchBoxes.reduce((s, b) => s + getBalance(b.gl_account_code), 0), [branchBoxes, balances]);
  const posBalance = useMemo(() => posBoxes.reduce((s, b) => s + getBalance(b.gl_account_code), 0), [posBoxes, balances]);
  const pettyBalance = useMemo(() => pettyBoxes.reduce((s, b) => s + getBalance(b.gl_account_code), 0), [pettyBoxes, balances]);

  const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const openAdd = (type: "main" | "branch" | "pos" | "petty" | "petty_cash") => {
    setEditBox(null); setDrawerType(type); setDrawerOpen(true);
  };

  // ─── Search + sort helpers ───
  const matchesSearch = (b: any) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (b.name || b.bank_name || "").toLowerCase().includes(q) ||
      (b.gl_account_code || b.account_number || "").toLowerCase().includes(q) ||
      (b.branch_location || b.branch || "").toLowerCase().includes(q)
    );
  };

  const sortRows = (rows: any[], section: string) => {
    const sort = sortBy[section] || { key: "name" as SortKey, dir: "asc" as SortDir };
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === "balance") {
        return sign * (getBalance(a.gl_account_code) - getBalance(b.gl_account_code));
      }
      if (sort.key === "branch") {
        return sign * ((a.branch_location || a.branch || "").localeCompare(b.branch_location || b.branch || "", "ar"));
      }
      return sign * ((a.name || a.bank_name || "").localeCompare(b.name || b.bank_name || "", "ar"));
    });
  };

  const toggleSort = (section: string, key: SortKey) => {
    setSortBy(prev => {
      const cur = prev[section];
      const dir: SortDir = cur?.key === key && cur.dir === "asc" ? "desc" : "asc";
      return { ...prev, [section]: { key, dir } };
    });
  };

  // ─── Filtered + sorted ───
  const fMain   = useMemo(() => sortRows(mainBoxes.filter(matchesSearch),   "main"),   [mainBoxes,   balances, search, sortBy]);
  const fBranch = useMemo(() => sortRows(branchBoxes.filter(matchesSearch), "branch"), [branchBoxes, balances, search, sortBy]);
  const fPos    = useMemo(() => sortRows(posBoxes.filter(matchesSearch),    "pos"),    [posBoxes,    balances, search, sortBy]);
  const fPetty  = useMemo(() => sortRows(pettyBoxes.filter(matchesSearch),  "petty"),  [pettyBoxes,  balances, search, sortBy]);
  const fBank   = useMemo(() => sortRows(bankAccounts.filter(matchesSearch),"bank"),   [bankAccounts,balances, search, sortBy]);

  // ─── Status badge ───
  const StatusBadge = ({ box }: { box: any }) => {
    if (!box.is_active) return <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-red-50 text-red-700 border-red-200">متوقف</Badge>;
    return <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-emerald-50 text-emerald-700 border-emerald-200">نشط</Badge>;
  };

  // ─── Row actions menu ───
  const RowActions = ({ box, colorType }: { box: any; colorType: string }) => {
    const code = box.gl_account_code || box.account_number;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => navigate(`/account-statement?code=${code}`)}>
            <FileText className="h-3.5 w-3.5 ml-2" /> كشف الحساب
          </DropdownMenuItem>
          {colorType !== "main" && colorType !== "bank" && (
            <DropdownMenuItem onClick={() => navigate(`/finance/cash-boxes/transfer?from=${box.id}`)}>
              <ArrowUpRight className="h-3.5 w-3.5 ml-2" /> ترحيل
            </DropdownMenuItem>
          )}
          {colorType !== "bank" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setEditBox(box); setDrawerType(box.type); setDrawerOpen(true); }}>
                <Settings className="h-3.5 w-3.5 ml-2" /> تعديل
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // ─── Box Table ───
  const BoxTable = ({ rows, colorType, section, isBank = false }: { rows: any[]; colorType: string; section: string; isBank?: boolean }) => {
    const accent = TYPE_ACCENT[colorType] || "#475569";
    const sort = sortBy[section] || { key: "name" as SortKey, dir: "asc" as SortDir };
    const SortHead = ({ k, label, align = "right" }: { k: SortKey; label: string; align?: "right" | "left" }) => (
      <button
        onClick={() => toggleSort(section, k)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${align === "left" ? "flex-row-reverse" : ""}`}
      >
        <span>{label}</span>
        {sort.key === k && <ChevronDown className={`h-3 w-3 transition-transform ${sort.dir === "desc" ? "" : "rotate-180"}`} />}
      </button>
    );

    if (rows.length === 0) {
      return (
        <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-md">
          لا توجد سجلات
        </div>
      );
    }

    return (
      <>
        {/* Desktop table */}
        <div className="hidden md:block border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-right text-xs"><SortHead k="name" label="الاسم" /></TableHead>
                <TableHead className="text-right text-xs"><SortHead k="branch" label="الفرع / الموقع" /></TableHead>
                <TableHead className="text-right text-xs font-mono">الكود</TableHead>
                <TableHead className="text-right text-xs">العملة</TableHead>
                <TableHead className="text-left text-xs"><SortHead k="balance" label="الرصيد" align="left" /></TableHead>
                <TableHead className="text-left text-xs">وارد الشهر</TableHead>
                <TableHead className="text-left text-xs">صادر الشهر</TableHead>
                <TableHead className="text-center text-xs">الحالة</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => {
                const code = r.gl_account_code || r.account_number;
                const bal = balances[code] || { balance: 0, inflow: 0, outflow: 0, foreignBalances: {} };
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => {
                      if (isBank) { navigate(`/account-statement?code=${code}`); return; }
                      setEditBox(r); setDrawerType(r.type); setDrawerOpen(true);
                    }}
                    style={{ borderRight: `3px solid ${accent}` }}
                  >
                    <TableCell className="text-xs font-medium">{r.name || r.bank_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.branch_location || r.branch || "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{code || "—"}</TableCell>
                    <TableCell className="text-xs">{r.currency || "ILS"}</TableCell>
                    <TableCell className={`text-xs font-mono font-bold text-left ${bal.balance < 0 ? "text-red-600" : ""}`} style={bal.balance >= 0 ? { color: accent } : {}}>
                      ₪{fmt(bal.balance)}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-left text-emerald-600">₪{fmt(bal.inflow)}</TableCell>
                    <TableCell className="text-xs font-mono text-left text-red-600">₪{fmt(bal.outflow)}</TableCell>
                    <TableCell className="text-center"><StatusBadge box={isBank ? { is_active: true } : r} /></TableCell>
                    <TableCell><RowActions box={r} colorType={isBank ? "bank" : colorType} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile compact list */}
        <div className="md:hidden space-y-1.5">
          {rows.map(r => {
            const code = r.gl_account_code || r.account_number;
            const bal = balances[code] || { balance: 0, inflow: 0, outflow: 0, foreignBalances: {} };
            return (
              <button
                key={r.id}
                onClick={() => {
                  if (isBank) { navigate(`/account-statement?code=${code}`); return; }
                  setEditBox(r); setDrawerType(r.type); setDrawerOpen(true);
                }}
                className="w-full flex items-center justify-between gap-2 p-2.5 rounded-md border bg-card hover:bg-muted/30 text-right"
                style={{ borderRight: `3px solid ${accent}` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium truncate">{r.name || r.bank_name}</span>
                    <StatusBadge box={isBank ? { is_active: true } : r} />
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {r.branch_location || r.branch || code}
                  </div>
                </div>
                <div className={`text-xs font-mono font-bold shrink-0 ${bal.balance < 0 ? "text-red-600" : ""}`} style={bal.balance >= 0 ? { color: accent } : {}}>
                  ₪{fmt(bal.balance)}
                </div>
              </button>
            );
          })}
        </div>
      </>
    );
  };

  // ─── KPI card ───
  const KpiCard = ({ label, value, sub, icon, color }: { label: string; value: number; sub: string; icon: string; color: string }) => (
    <Card className="p-3 border" style={{ borderColor: color + "30" }}>
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg" style={{ background: color + "15" }}>{icon}</div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className="text-[11px] text-muted-foreground truncate">{label}</p>
          <p className={`text-sm font-bold font-mono mt-0.5 min-w-0 break-all leading-tight ${value < 0 ? "text-red-600" : ""}`} style={value >= 0 ? { color } : {}}>
            ₪{fmt(value)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>
        </div>
      </div>
    </Card>
  );

  // ─── Collapsible section wrapper ───
  const TableSection = ({
    sectionKey, title, count, total, color, addLabel, onAdd, Icon, children,
  }: {
    sectionKey: string; title: string; count: number; total: number; color: string;
    addLabel: string; onAdd: () => void; Icon: any; children: React.ReactNode;
  }) => {
    const open = openSections[sectionKey] ?? false;
    return (
      <Collapsible open={open} onOpenChange={(v) => setOpenSections(prev => ({ ...prev, [sectionKey]: v }))}>
        <section className="border rounded-lg overflow-hidden bg-card">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b bg-muted/20">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 min-w-0 flex-1 text-right">
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${open ? "" : "-rotate-90"}`} />
                <Icon className="h-4 w-4 shrink-0" style={{ color }} />
                <h2 className="text-sm font-bold truncate" style={{ color }}>{title}</h2>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">{count}</Badge>
                <span className="text-[11px] text-muted-foreground font-mono mr-2 truncate">
                  ₪{fmt(total)}
                </span>
              </button>
            </CollapsibleTrigger>
            <Button variant="outline" size="sm" className="text-xs gap-1 shrink-0 h-7" style={{ borderColor: color + "40", color }} onClick={onAdd}>
              <Plus className="h-3 w-3" /> <span className="hidden sm:inline">{addLabel}</span>
            </Button>
          </div>
          <CollapsibleContent>
            <div className="p-3">{children}</div>
          </CollapsibleContent>
        </section>
      </Collapsible>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
      <PageHeader title="إدارة الصناديق والبنوك" breadcrumb={["المالية", "الصناديق"]} />

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" className="gap-2 text-xs text-white" style={{ background: "#1B3A5C" }} onClick={() => openAdd("branch")}>
          <Plus className="h-4 w-4" /> صندوق جديد
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" style={{ borderColor: "#C47A1E40", color: "#92400E" }} onClick={() => setReplenishOpen(true)}>
          <ArrowDownToLine className="h-3.5 w-3.5" /> تغذية النثرية
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" style={{ borderColor: "#6B3FA040", color: "#6B3FA0" }} onClick={() => setTransferOpen(true)}>
          <ArrowLeftRight className="h-3.5 w-3.5" /> تحويل بين الصناديق
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" style={{ borderColor: "#1A5FA840", color: "#1A5FA8" }} onClick={() => setDepositOpen(true)}>
          <ArrowUpFromLine className="h-3.5 w-3.5" /> إيداع بنكي
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" style={{ borderColor: "#1A5FA840", color: "#1A5FA8" }} onClick={() => setExchangeOpen(true)}>
          <ArrowLeftRight className="h-3.5 w-3.5" /> صرف عملة
        </Button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="إجمالي السيولة النقدية" value={totalBalance} sub="مجموع أرصدة كل الصناديق" icon="" color="#1B3A5C" />
        <KpiCard label="صناديق POS" value={posBalance} sub={`${posBoxes.length} نشط`} icon="" color="#6B3FA0" />
        <KpiCard label="صناديق الفروع" value={branchBalance} sub={`${branchBoxes.length} نشط`} icon="" color="#2D7A4F" />
        <KpiCard label="الصندوق الرئيسي" value={mainBalance} sub={mainBoxes[0]?.name || "غير معرّف"} icon="" color="#1B3A5C" />
        <KpiCard label="إجمالي النثريات" value={pettyBalance} sub={`${pettyBoxes.length} نشط`} icon="" color="#C47A1E" />
      </div>

      {/* Global search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="بحث في كل الصناديق والبنوك..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-9 h-9 text-xs"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-4">
          <TableSection
            sectionKey="main" title="الصندوق الرئيسي" count={fMain.length} total={mainBalance}
            color="#1B3A5C" addLabel="إنشاء الصندوق الرئيسي" onAdd={() => openAdd("main")} Icon={Landmark}
          >
            {mainBoxes.length === 0 ? (
              <div className="text-center py-6 border border-dashed rounded-md">
                <Landmark className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium mb-1">لم يتم إنشاء الصندوق الرئيسي بعد</p>
                <p className="text-xs text-muted-foreground mb-3">الصندوق الأم الذي تُرحَّل إليه كل الصناديق</p>
                <Button size="sm" onClick={() => openAdd("main")} className="text-white" style={{ background: "#1B3A5C" }}>
                  <Plus className="h-4 w-4 ml-1" /> إنشاء الصندوق الرئيسي
                </Button>
              </div>
            ) : (
              <BoxTable rows={fMain} colorType="main" section="main" />
            )}
          </TableSection>

          <TableSection
            sectionKey="branch" title="صناديق الفروع" count={fBranch.length} total={branchBalance}
            color="#2D7A4F" addLabel="إضافة صندوق فرع" onAdd={() => openAdd("branch")} Icon={Building2}
          >
            <BoxTable rows={fBranch} colorType="branch" section="branch" />
          </TableSection>

          <TableSection
            sectionKey="pos" title="صناديق نقاط البيع" count={fPos.length} total={posBalance}
            color="#6B3FA0" addLabel="إضافة صندوق POS" onAdd={() => openAdd("pos")} Icon={Monitor}
          >
            <BoxTable rows={fPos} colorType="pos" section="pos" />
          </TableSection>

          <TableSection
            sectionKey="petty" title="صناديق النثرية" count={fPetty.length} total={pettyBalance}
            color="#C47A1E" addLabel="إضافة صندوق نثرية" onAdd={() => openAdd("petty_cash")} Icon={Wallet}
          >
            <BoxTable rows={fPetty} colorType="petty" section="petty" />
          </TableSection>

          <TableSection
            sectionKey="bank" title="الحسابات البنكية" count={fBank.length}
            total={bankAccounts.reduce((s, b) => s + getBalance(b.gl_account_code), 0)}
            color="#1A5FA8" addLabel="إدارة الحسابات البنكية" onAdd={() => navigate("/finance/bank-accounts")} Icon={Banknote}
          >
            <BoxTable rows={fBank} colorType="bank" section="bank" isBank />
          </TableSection>
        </div>
      )}

      <CashBoxDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditBox(null); }} defaultType={drawerType} editBox={editBox} hasMainBox={mainBoxes.length > 0} onSaved={() => { setDrawerOpen(false); setEditBox(null); fetchData(); }} />
      <PettyCashReplenishDialog open={replenishOpen} onOpenChange={setReplenishOpen} boxes={boxes} userId={user?.id || ""} onSuccess={fetchData} />
      <CurrencyExchangeDialog open={exchangeOpen} onOpenChange={setExchangeOpen} boxes={boxes} userId={user?.id || ""} onSuccess={fetchData} />
      <BankDepositDialog open={depositOpen} onOpenChange={setDepositOpen} boxes={boxes} userId={user?.id || ""} onSuccess={fetchData} />
      <CashBoxTransferDialog open={transferOpen} onOpenChange={setTransferOpen} boxes={boxes} balances={balances} userId={user?.id || ""} onSuccess={fetchData} />
    </div>
  );
};

export default CashBoxesPage;
