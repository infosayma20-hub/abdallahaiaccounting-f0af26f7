import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Loader2, Settings, FileText, Wallet, Building2, Monitor, Landmark,
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Banknote, Search,
  ChevronDown, MoreHorizontal, RefreshCw, Printer, FileSpreadsheet,
  Calculator, ChevronsDownUp, ChevronsUpDown,
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
import { setNextExportBranding } from "@/lib/excel-export";

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

interface UnifiedRow {
  id: string;
  raw: any;
  isBank: boolean;
  kind: "main" | "branch" | "pos" | "petty" | "bank";
  type_label: string;
  name: string;
  branch_label: string;
  code: string;
  currency: string;
  balance: number;
  inflow: number;
  outflow: number;
  status: "active" | "inactive";
  status_label: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

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
  const [searchQuery, setSearchQuery] = useState("");
  const [shellFilters, setShellFilters] = useState<FilterCondition[]>([]);
  const SECTIONS_STORAGE_KEY = "malaky:finance:cash-boxes:sections";
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") {
      return { main: true, branch: true, pos: true, petty: false, bank: false };
    }
    try {
      const raw = window.localStorage.getItem(SECTIONS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { main: true, branch: true, pos: true, petty: false, bank: false };
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(openSections));
    } catch {}
  }, [openSections]);

  const expandAllSections = useCallback(() => {
    setOpenSections({ main: true, branch: true, pos: true, petty: true, bank: true });
  }, []);
  const collapseAllSections = useCallback(() => {
    setOpenSections({ main: false, branch: false, pos: false, petty: false, bank: false });
  }, []);

  const [sortBy, setSortBy] = useState<Record<string, { key: SortKey; dir: SortDir }>>({});

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [boxRes, bankRes] = await Promise.all([
      supabase.from("cash_boxes").select("*").order("type", { ascending: true }),
      supabase.from("bank_accounts").select("*").eq("user_id", user.id),
    ]);
    setBoxes(boxRes.data || []);
    setBankAccounts(bankRes.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Compute balances
  const [balances, setBalances] = useState<Record<string, { balance: number; inflow: number; outflow: number; foreignBalances: Record<string, number>; lastDate: string | null }>>({});

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
      const result: Record<string, { balance: number; inflow: number; outflow: number; foreignBalances: Record<string, number>; lastDate: string | null }> = {};

      for (const code of allCodes) {
        let balance = 0, inflow = 0, outflow = 0;
        let lastDate: string | null = null;
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
          const isDebit = tx.debit_account_code === code;
          const isCredit = tx.credit_account_code === code;
          if (!isDebit && !isCredit) return;
          if (isDebit) {
            balance += amt;
            if (txCurrency !== "ILS" && foreignAmt > 0) foreignBalances[txCurrency] = (foreignBalances[txCurrency] || 0) + foreignAmt;
          }
          if (isCredit) {
            balance -= amt;
            if (txCurrency !== "ILS" && foreignAmt > 0) foreignBalances[txCurrency] = (foreignBalances[txCurrency] || 0) - foreignAmt;
          }
          if (tx.transaction_date >= monthStart) {
            if (isDebit) inflow += amt;
            if (isCredit) outflow += amt;
          }
          if (tx.transaction_date && (!lastDate || tx.transaction_date > lastDate)) {
            lastDate = tx.transaction_date;
          }
        });
        result[code] = { balance, inflow, outflow, foreignBalances, lastDate };
      }
      setBalances(result);
    })();
  }, [user, boxes, bankAccounts]);

  const getBalance = (code: string) => balances[code]?.balance || 0;

  // Build unified rows for filtering
  const unifiedRows: UnifiedRow[] = useMemo(() => {
    const kindOf = (t: string): UnifiedRow["kind"] => {
      if (t === "main") return "main";
      if (t === "pos") return "pos";
      if (t === "petty" || t === "petty_cash") return "petty";
      return "branch";
    };
    const cashRows: UnifiedRow[] = (boxes || []).map((b) => {
      const code = b.gl_account_code || "";
      const bal = balances[code] || { balance: 0, inflow: 0, outflow: 0, foreignBalances: {}, lastDate: null };
      const kind = kindOf(b.type);
      return {
        id: b.id,
        raw: b,
        isBank: false,
        kind,
        type_label: TYPE_LABELS[b.type] || "—",
        name: b.name || "—",
        branch_label: b.branch_location || b.branch || "—",
        code,
        currency: b.currency || "ILS",
        balance: bal.balance,
        inflow: bal.inflow,
        outflow: bal.outflow,
        status: b.is_active ? "active" : "inactive",
        status_label: b.is_active ? "نشط" : "موقوف",
      };
    });
    const bankRows: UnifiedRow[] = (bankAccounts || []).map((b) => {
      const code = b.gl_account_code || b.account_number || "";
      const bal = balances[code] || { balance: 0, inflow: 0, outflow: 0, foreignBalances: {}, lastDate: null };
      return {
        id: b.id,
        raw: b,
        isBank: true,
        kind: "bank",
        type_label: TYPE_LABELS.bank,
        name: b.bank_name || b.name || "—",
        branch_label: b.branch || "—",
        code,
        currency: b.currency || "ILS",
        balance: bal.balance,
        inflow: bal.inflow,
        outflow: bal.outflow,
        status: b.is_active === false ? "inactive" : "active",
        status_label: b.is_active === false ? "موقوف" : "نشط",
      };
    });
    return [...cashRows, ...bankRows];
  }, [boxes, bankAccounts, balances]);

  // Column definitions
  const columnDefs: ColumnDef[] = useMemo(() => ([
    { key: "name", label: "الاسم", required: true },
    { key: "branch_label", label: "الفرع / الموقع" },
    { key: "code", label: "الكود" },
    { key: "currency", label: "العملة" },
    { key: "balance", label: "الرصيد الحالي", required: true },
    { key: "inflow", label: "وارد الشهر", defaultVisible: false },
    { key: "outflow", label: "صادر الشهر", defaultVisible: false },
    { key: "status_label", label: "الحالة" },
    { key: "actions", label: "إجراءات", required: true },
  ]), []);
  const colState = useColumnVisibility("finance-cash-boxes-page", columnDefs);
  const show = colState.isVisible;

  // Filter option lists
  const branchOptions = useMemo(() => {
    const s = new Set<string>();
    unifiedRows.forEach((r) => { if (r.branch_label && r.branch_label !== "—") s.add(r.branch_label); });
    return Array.from(s).sort().map((v) => ({ value: v, label: v }));
  }, [unifiedRows]);
  const currencyOptions = useMemo(() => {
    const s = new Set<string>();
    unifiedRows.forEach((r) => r.currency && s.add(r.currency));
    return Array.from(s).sort().map((v) => ({ value: v, label: v }));
  }, [unifiedRows]);

  const filterFields: FilterField[] = useMemo(() => ([
    { key: "type_label", label: "النوع", type: "option", options: [
      { value: TYPE_LABELS.main, label: TYPE_LABELS.main },
      { value: TYPE_LABELS.branch, label: TYPE_LABELS.branch },
      { value: TYPE_LABELS.pos, label: TYPE_LABELS.pos },
      { value: TYPE_LABELS.petty, label: TYPE_LABELS.petty },
      { value: TYPE_LABELS.bank, label: TYPE_LABELS.bank },
    ]},
    { key: "branch_label", label: "الفرع", type: "option", options: branchOptions },
    { key: "currency", label: "العملة", type: "option", options: currencyOptions },
    { key: "status_label", label: "الحالة", type: "option", options: [
      { value: "نشط", label: "نشط" },
      { value: "موقوف", label: "موقوف" },
    ]},
    { key: "balance", label: "الرصيد", type: "number" },
    { key: "name", label: "الاسم", type: "text" },
  ]), [branchOptions, currencyOptions]);

  // Apply filters + quick search
  const filteredRows = useMemo(() => {
    let data = applyFilters(unifiedRows, shellFilters);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      data = data.filter((r) =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.code || "").toLowerCase().includes(q) ||
        (r.branch_label || "").toLowerCase().includes(q),
      );
    }
    return data;
  }, [unifiedRows, shellFilters, searchQuery]);

  // Sub-lists per kind (after global filter)
  const sortRows = (rows: UnifiedRow[], section: string) => {
    const sort = sortBy[section] || { key: "name" as SortKey, dir: "asc" as SortDir };
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === "balance") return sign * (a.balance - b.balance);
      if (sort.key === "branch") return sign * a.branch_label.localeCompare(b.branch_label, "ar");
      return sign * a.name.localeCompare(b.name, "ar");
    });
  };

  const fMain   = useMemo(() => sortRows(filteredRows.filter(r => r.kind === "main"),   "main"),   [filteredRows, sortBy]);
  const fBranch = useMemo(() => sortRows(filteredRows.filter(r => r.kind === "branch"), "branch"), [filteredRows, sortBy]);
  const fPos    = useMemo(() => sortRows(filteredRows.filter(r => r.kind === "pos"),    "pos"),    [filteredRows, sortBy]);
  const fPetty  = useMemo(() => sortRows(filteredRows.filter(r => r.kind === "petty"),  "petty"),  [filteredRows, sortBy]);
  const fBank   = useMemo(() => sortRows(filteredRows.filter(r => r.kind === "bank"),   "bank"),   [filteredRows, sortBy]);

  const sumBal = (rows: UnifiedRow[]) => rows.reduce((s, r) => s + r.balance, 0);
  const totalBalance  = useMemo(() => sumBal(filteredRows), [filteredRows]);
  const mainBalance   = useMemo(() => sumBal(fMain),   [fMain]);
  const branchBalance = useMemo(() => sumBal(fBranch), [fBranch]);
  const posBalance    = useMemo(() => sumBal(fPos),    [fPos]);
  const pettyBalance  = useMemo(() => sumBal(fPetty),  [fPetty]);
  const bankBalance   = useMemo(() => sumBal(fBank),   [fBank]);

  const hasMainBox = useMemo(() => boxes.some(b => b.type === "main"), [boxes]);

  const openAdd = (type: "main" | "branch" | "pos" | "petty" | "petty_cash") => {
    setEditBox(null); setDrawerType(type); setDrawerOpen(true);
  };

  const toggleSort = (section: string, key: SortKey) => {
    setSortBy(prev => {
      const cur = prev[section];
      const dir: SortDir = cur?.key === key && cur.dir === "asc" ? "desc" : "asc";
      return { ...prev, [section]: { key, dir } };
    });
  };

  // ─── Export ───
  const handleExport = () => {
    const data = filteredRows.map((r) => ({
      "الاسم": r.name,
      "النوع": r.type_label,
      "الفرع/الموقع": r.branch_label,
      "الكود": r.code,
      "العملة": r.currency,
      "الرصيد": r.balance,
      "وارد الشهر": r.inflow,
      "صادر الشهر": r.outflow,
      "الحالة": r.status_label,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الصناديق والبنوك");
    setNextExportBranding({
      title: "إدارة الصناديق والبنوك",
      extraInfo: [`عدد السجلات: ${data.length.toLocaleString()}`, `إجمالي الرصيد: ₪${fmt(totalBalance)}`],
    });
    XLSX.writeFile(wb, `الصناديق_والبنوك_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const handlePrint = () => window.print();

  const actionTabs: ActionTab[] = useMemo(() => ([{
    key: "general",
    label: "عام",
    groups: [
      { key: "new", label: "جديد", items: [
        { key: "new-box", label: "صندوق جديد", icon: Plus, variant: "primary", onClick: () => openAdd(hasMainBox ? "branch" : "main") },
      ]},
      { key: "movements", label: "حركات", items: [
        { key: "transfer", label: "تحويل بين الصناديق", icon: ArrowLeftRight, onClick: () => setTransferOpen(true) },
        { key: "deposit", label: "إيداع بنكي", icon: ArrowUpFromLine, onClick: () => setDepositOpen(true) },
        { key: "exchange", label: "صرف عملة", icon: ArrowLeftRight, onClick: () => setExchangeOpen(true) },
        { key: "replenish", label: "تغذية النثرية", icon: ArrowDownToLine, onClick: () => setReplenishOpen(true) },
      ]},
      { key: "actions", label: "إجراءات", items: [
        { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: fetchData },
        { key: "banks", label: "إدارة البنوك", icon: Banknote, onClick: () => navigate("/finance/bank-accounts") },
        { key: "center", label: "مركز المالية", icon: Calculator, onClick: () => navigate("/accounting-center") },
      ]},
      { key: "view", label: "عرض", items: [
        { key: "expand-all", label: "توسيع الكل", icon: ChevronsUpDown, onClick: expandAllSections },
        { key: "collapse-all", label: "ضم الكل", icon: ChevronsDownUp, onClick: collapseAllSections },
        { key: "print", label: "طباعة", icon: Printer, onClick: handlePrint, disabled: filteredRows.length === 0 },
        { key: "excel", label: "Excel", icon: FileSpreadsheet, onClick: handleExport, disabled: filteredRows.length === 0 },
      ]},
    ],
  }]), [fetchData, navigate, hasMainBox, filteredRows.length, expandAllSections, collapseAllSections]);

  // ─── Status badge ───
  const StatusBadge = ({ status }: { status: "active" | "inactive" }) => {
    if (status === "inactive") {
      return <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-muted text-muted-foreground border-border">موقوف</Badge>;
    }
    return <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-emerald-50 text-emerald-700 border-emerald-200">نشط</Badge>;
  };

  // ─── Row actions ───
  const RowActions = ({ row }: { row: UnifiedRow }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => navigate(`/account-statement?code=${row.code}`)}>
          <FileText className="h-3.5 w-3.5 ml-2" /> كشف الحساب
        </DropdownMenuItem>
        {!row.isBank && row.kind !== "main" && (
          <DropdownMenuItem onClick={() => setTransferOpen(true)}>
            <ArrowLeftRight className="h-3.5 w-3.5 ml-2" /> تحويل
          </DropdownMenuItem>
        )}
        {!row.isBank && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setEditBox(row.raw); setDrawerType(row.raw.type); setDrawerOpen(true); }}>
              <Settings className="h-3.5 w-3.5 ml-2" /> تعديل
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // ─── Box Table ───
  const BoxTable = ({ rows, section }: { rows: UnifiedRow[]; section: string }) => {
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
        <div className="text-center py-5 text-xs text-muted-foreground border border-dashed border-border/60 rounded-md bg-muted/10">
          لا توجد سجلات
        </div>
      );
    }

    return (
      <>
        {/* Desktop table */}
        <div className="hidden md:block border border-border/60 rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                {show("name") && <TableHead className="text-right text-xs"><SortHead k="name" label="الاسم" /></TableHead>}
                {show("branch_label") && <TableHead className="text-right text-xs"><SortHead k="branch" label="الفرع / الموقع" /></TableHead>}
                {show("code") && <TableHead className="text-right text-xs font-mono">الكود</TableHead>}
                {show("currency") && <TableHead className="text-right text-xs">العملة</TableHead>}
                {show("balance") && <TableHead className="text-left text-xs"><SortHead k="balance" label="الرصيد" align="left" /></TableHead>}
                {show("inflow") && <TableHead className="text-left text-xs">وارد الشهر</TableHead>}
                {show("outflow") && <TableHead className="text-left text-xs">صادر الشهر</TableHead>}
                {show("status_label") && <TableHead className="text-center text-xs">الحالة</TableHead>}
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/20"
                  onClick={() => {
                    if (r.isBank) { navigate(`/account-statement?code=${r.code}`); return; }
                    setEditBox(r.raw); setDrawerType(r.raw.type); setDrawerOpen(true);
                  }}
                >
                  {show("name") && <TableCell className="text-xs font-medium">{r.name}</TableCell>}
                  {show("branch_label") && <TableCell className="text-xs text-muted-foreground">{r.branch_label}</TableCell>}
                  {show("code") && <TableCell className="text-xs font-mono text-muted-foreground">{r.code || "—"}</TableCell>}
                  {show("currency") && <TableCell className="text-xs">{r.currency}</TableCell>}
                  {show("balance") && (
                    <TableCell className={`text-xs font-mono font-bold text-left ${r.balance < 0 ? "text-red-600" : "text-foreground"}`}>
                      ₪{fmt(r.balance)}
                    </TableCell>
                  )}
                  {show("inflow") && <TableCell className="text-xs font-mono text-left text-emerald-600">₪{fmt(r.inflow)}</TableCell>}
                  {show("outflow") && <TableCell className="text-xs font-mono text-left text-red-600">₪{fmt(r.outflow)}</TableCell>}
                  {show("status_label") && <TableCell className="text-center"><StatusBadge status={r.status} /></TableCell>}
                  <TableCell><RowActions row={r} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile compact list */}
        <div className="md:hidden space-y-1.5">
          {rows.map(r => (
            <button
              key={r.id}
              onClick={() => {
                if (r.isBank) { navigate(`/account-statement?code=${r.code}`); return; }
                setEditBox(r.raw); setDrawerType(r.raw.type); setDrawerOpen(true);
              }}
              className="w-full flex items-center justify-between gap-2 p-2.5 rounded-md border border-border/60 bg-card hover:bg-muted/30 text-right"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium truncate">{r.name}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                  {r.type_label}{r.branch_label !== "—" ? ` · ${r.branch_label}` : ""}
                </div>
              </div>
              <div className={`text-xs font-mono font-bold shrink-0 ${r.balance < 0 ? "text-red-600" : "text-foreground"}`}>
                ₪{fmt(r.balance)}
              </div>
            </button>
          ))}
        </div>
      </>
    );
  };

  // ─── Quiet KPI ───
  const KpiCard = ({ label, value, sub }: { label: string; value: number; sub: string }) => (
    <div className="bg-card rounded-xl p-3 border border-border/40 shadow-sm">
      <p className="text-[11px] text-muted-foreground truncate">{label}</p>
      <p className={`text-base font-bold font-mono mt-0.5 tabular-nums ${value < 0 ? "text-red-600" : "text-foreground"}`}>
        ₪{fmt(value)}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>
    </div>
  );

  // ─── Collapsible section ───
  const TableSection = ({
    sectionKey, title, count, total, addLabel, onAdd, Icon, children,
  }: {
    sectionKey: string; title: string; count: number; total: number;
    addLabel: string; onAdd: () => void; Icon: any; children: React.ReactNode;
  }) => {
    const open = openSections[sectionKey] ?? false;
    return (
      <Collapsible open={open} onOpenChange={(v) => setOpenSections(prev => ({ ...prev, [sectionKey]: v }))}>
        <section className="border border-border/60 rounded-lg overflow-hidden bg-card">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60 bg-muted/20">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 min-w-0 flex-1 text-right">
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${open ? "" : "-rotate-90"}`} />
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <h2 className="text-sm font-semibold text-foreground truncate">{title}</h2>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">{count}</Badge>
                <span className="text-[11px] text-muted-foreground font-mono mr-2 truncate tabular-nums">
                  ₪{fmt(total)}
                </span>
              </button>
            </CollapsibleTrigger>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={onAdd}>
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
    <FinanceShell
      title="إدارة الصناديق والبنوك"
      subtitle="الصناديق النقدية، نقاط البيع، النثرية والحسابات البنكية"
      breadcrumb={[
        { label: "المالية", href: "/accounting-center" },
        { label: "الصناديق" },
      ]}
      actionTabs={actionTabs}
      filterFields={filterFields}
      filters={shellFilters}
      onFiltersChange={setShellFilters}
      storageKey="finance-cash-boxes-page"
      rightSlot={
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث سريع..."
              className="h-8 w-56 pr-8 text-xs"
            />
          </div>
          <ColumnVisibilityMenu state={colState} />
        </div>
      }
    >
      <div className="space-y-4 w-full" dir="rtl">
        {/* Quiet KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="إجمالي السيولة النقدية" value={totalBalance} sub="مجموع كل الأرصدة" />
          <KpiCard label="الصندوق الرئيسي" value={mainBalance} sub={fMain[0]?.name || "غير معرّف"} />
          <KpiCard label="صناديق الفروع" value={branchBalance} sub={`${fBranch.length} سجل`} />
          <KpiCard label="صناديق POS" value={posBalance} sub={`${fPos.length} سجل`} />
          <KpiCard label="الحسابات البنكية" value={bankBalance} sub={`${fBank.length} سجل`} />
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            <TableSection
              sectionKey="main" title="الصندوق الرئيسي" count={fMain.length} total={mainBalance}
              addLabel="إنشاء الصندوق الرئيسي" onAdd={() => openAdd("main")} Icon={Landmark}
            >
              {fMain.length === 0 && !hasMainBox ? (
                <div className="text-center py-6 border border-dashed border-border/60 rounded-md bg-muted/10">
                  <Landmark className="h-7 w-7 mx-auto mb-2 text-muted-foreground/60" />
                  <p className="text-sm text-foreground mb-1">لم يتم إنشاء الصندوق الرئيسي بعد</p>
                  <p className="text-xs text-muted-foreground mb-3">الصندوق الأم الذي تُرحَّل إليه كل الصناديق</p>
                  <Button size="sm" variant="outline" onClick={() => openAdd("main")}>
                    <Plus className="h-3.5 w-3.5 ml-1" /> إنشاء الصندوق الرئيسي
                  </Button>
                </div>
              ) : (
                <BoxTable rows={fMain} section="main" />
              )}
            </TableSection>

            <TableSection
              sectionKey="branch" title="صناديق الفروع" count={fBranch.length} total={branchBalance}
              addLabel="إضافة صندوق فرع" onAdd={() => openAdd("branch")} Icon={Building2}
            >
              <BoxTable rows={fBranch} section="branch" />
            </TableSection>

            <TableSection
              sectionKey="pos" title="صناديق نقاط البيع" count={fPos.length} total={posBalance}
              addLabel="إضافة صندوق POS" onAdd={() => openAdd("pos")} Icon={Monitor}
            >
              <BoxTable rows={fPos} section="pos" />
            </TableSection>

            <TableSection
              sectionKey="petty" title="صناديق النثرية" count={fPetty.length} total={pettyBalance}
              addLabel="إضافة صندوق نثرية" onAdd={() => openAdd("petty_cash")} Icon={Wallet}
            >
              <BoxTable rows={fPetty} section="petty" />
            </TableSection>

            <TableSection
              sectionKey="bank" title="الحسابات البنكية" count={fBank.length} total={bankBalance}
              addLabel="إدارة الحسابات البنكية" onAdd={() => navigate("/finance/bank-accounts")} Icon={Banknote}
            >
              <BoxTable rows={fBank} section="bank" />
            </TableSection>
          </div>
        )}
      </div>

      <CashBoxDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditBox(null); }} defaultType={drawerType} editBox={editBox} hasMainBox={hasMainBox} onSaved={() => { setDrawerOpen(false); setEditBox(null); fetchData(); }} />
      <PettyCashReplenishDialog open={replenishOpen} onOpenChange={setReplenishOpen} boxes={boxes} userId={user?.id || ""} onSuccess={fetchData} />
      <CurrencyExchangeDialog open={exchangeOpen} onOpenChange={setExchangeOpen} boxes={boxes} userId={user?.id || ""} onSuccess={fetchData} />
      <BankDepositDialog open={depositOpen} onOpenChange={setDepositOpen} boxes={boxes} userId={user?.id || ""} onSuccess={fetchData} />
      <CashBoxTransferDialog open={transferOpen} onOpenChange={setTransferOpen} boxes={boxes} balances={balances} userId={user?.id || ""} onSuccess={fetchData} />
    </FinanceShell>
  );
};

export default CashBoxesPage;
