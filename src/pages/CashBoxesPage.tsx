import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2, Settings, ArrowUpRight, FileText, Wallet, Building2, Monitor, Landmark, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Banknote, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CashBoxDrawer from "@/components/finance/CashBoxDrawer";
import PettyCashReplenishDialog from "@/components/finance/PettyCashReplenishDialog";
import CurrencyExchangeDialog from "@/components/finance/CurrencyExchangeDialog";
import BankDepositDialog from "@/components/finance/BankDepositDialog";
import CashBoxTransferDialog from "@/components/finance/CashBoxTransferDialog";

// ─── Color config per type ───
const TYPE_COLORS: Record<string, { bg: string; gradient: string; border: string; text: string; light: string }> = {
  main:       { bg: "#1B3A5C", gradient: "linear-gradient(135deg, #1B3A5C, #2A5A8C)", border: "#1B3A5C", text: "#1B3A5C", light: "#EBF0F7" },
  branch:     { bg: "#2D7A4F", gradient: "linear-gradient(135deg, #1E5C3A, #2D7A4F)", border: "#2D7A4F", text: "#2D7A4F", light: "#E8F5EE" },
  pos:        { bg: "#6B3FA0", gradient: "linear-gradient(135deg, #4C1D95, #6B3FA0)", border: "#6B3FA0", text: "#6B3FA0", light: "#F0EBF8" },
  petty:      { bg: "#C47A1E", gradient: "linear-gradient(135deg, #92400E, #C47A1E)", border: "#C47A1E", text: "#92400E", light: "#FDF3E3" },
  petty_cash: { bg: "#C47A1E", gradient: "linear-gradient(135deg, #92400E, #C47A1E)", border: "#C47A1E", text: "#92400E", light: "#FDF3E3" },
  bank:       { bg: "#1A5FA8", gradient: "linear-gradient(135deg, #0F4A8A, #1A5FA8)", border: "#1A5FA8", text: "#1A5FA8", light: "#E6F0FA" },
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

  // ─── Status badge ───
  const StatusBadge = ({ box }: { box: any }) => {
    if (!box.is_active) return <Badge className="text-[9px] h-5 px-1.5 shrink-0 whitespace-nowrap bg-red-100 text-red-700 border-red-300">متوقف 🔴</Badge>;
    return <Badge className="text-[9px] h-5 px-1.5 shrink-0 whitespace-nowrap bg-emerald-100 text-emerald-700 border-emerald-300">نشط 🟢</Badge>;
  };

  // ─── Box Card ───
  const BoxCard = ({ box, colorType }: { box: any; colorType: string }) => {
    const colors = TYPE_COLORS[colorType] || TYPE_COLORS.branch;
    const bal = balances[box.gl_account_code] || { balance: 0, inflow: 0, outflow: 0, foreignBalances: {} };
    const foreignBals = bal.foreignBalances || {};
    const hasForeign = Object.keys(foreignBals).some(k => Math.abs(foreignBals[k]) > 0.01);
    const fxSymbols: Record<string, string> = { USD: "$", JOD: "JOD ", EUR: "€" };
    const TypeIcon = colorType === "main" ? Landmark : colorType === "branch" ? Building2 : colorType === "pos" ? Monitor : colorType === "bank" ? Banknote : Wallet;
    const isInactive = !box.is_active;

    return (
      <Card className={`overflow-hidden transition-all hover:shadow-md ${isInactive ? "opacity-60" : ""}`} style={{ borderColor: isInactive ? "#D1D5DB" : colors.border + "40" }}>
        {/* Colored header */}
        <div className="px-3 py-2.5 text-white flex items-center justify-between" style={{ background: colors.gradient }}>
          <div className="flex items-center gap-2 min-w-0">
            <TypeIcon className="h-4 w-4 shrink-0 opacity-80" />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{box.name || box.bank_name}</p>
              <p className="text-[10px] opacity-60 font-mono">{box.gl_account_code || box.account_number}</p>
            </div>
          </div>
          <StatusBadge box={box} />
        </div>

        <CardContent className="p-3 space-y-2">
          {/* Balance */}
          <div className="flex items-baseline justify-between gap-1 min-w-0">
            <span className="text-[10px] text-muted-foreground shrink-0">رصيد ₪</span>
            <span className={`text-base font-bold font-mono min-w-0 break-all leading-tight ${bal.balance > 0 ? "" : bal.balance < 0 ? "text-red-600" : "text-muted-foreground"}`} style={bal.balance > 0 ? { color: colors.text } : {}}>
              ₪{fmt(bal.balance)}
            </span>
          </div>

          {/* Foreign balances */}
          {hasForeign && Object.entries(foreignBals).filter(([, v]) => Math.abs(v) > 0.01).map(([cur, val]) => (
            <div key={cur} className="flex items-baseline justify-between">
              <span className="text-[10px] text-muted-foreground">رصيد {cur}</span>
              <span className={`text-xs font-bold font-mono ${val < 0 ? "text-red-600" : "text-blue-600"}`}>
                {fxSymbols[cur] || cur}{fmt(val)}
              </span>
            </div>
          ))}

          {/* Branch name */}
          {(box.branch_location || box.branch) && (
            <div className="text-[10px] text-muted-foreground truncate">{box.branch_location || box.branch}</div>
          )}

          {/* Inflow / Outflow */}
          <div className="text-[10px] space-y-0.5 pt-1.5 border-t border-border/50">
            <div className="flex justify-between">
              <span className="text-muted-foreground">↑ وارد</span>
              <span className="text-emerald-600 font-mono">₪{fmt(bal.inflow)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">↓ صادر</span>
              <span className="text-red-600 font-mono">₪{fmt(bal.outflow)}</span>
            </div>
          </div>
        </CardContent>

        {/* Actions footer */}
        <div className="border-t border-border/50 px-2 py-1.5 flex gap-1 justify-end">
          <Button variant="ghost" size="sm" className="text-[10px] gap-0.5 h-6 px-1.5" onClick={() => navigate(`/account-statement?code=${box.gl_account_code}`)}>
            <FileText className="h-3 w-3" /> كشف
          </Button>
          {colorType !== "main" && colorType !== "bank" && (
            <Button variant="ghost" size="sm" className="text-[10px] gap-0.5 h-6 px-1.5" onClick={() => navigate(`/finance/cash-boxes/transfer?from=${box.id}`)}>
              <ArrowUpRight className="h-3 w-3" /> ترحيل
            </Button>
          )}
          {colorType !== "bank" && (
            <Button variant="ghost" size="sm" className="text-[10px] h-6 px-1.5" onClick={() => { setEditBox(box); setDrawerType(box.type); setDrawerOpen(true); }}>
              <Settings className="h-3 w-3" />
            </Button>
          )}
        </div>
      </Card>
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

  // ─── Section component ───
  const Section = ({ icon, title, count, color, addLabel, onAdd, children, emptyText, description }: {
    icon: string; title: string; count: number; color: string; addLabel: string; onAdd: () => void; children: React.ReactNode; emptyText: string; description?: string;
  }) => (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h2 className="text-sm font-bold" style={{ color }}>{title}</h2>
          <Badge className="text-[10px]" style={{ background: color + "15", color, border: `1px solid ${color}30` }}>{count}</Badge>
          {description && <span className="text-[10px] text-muted-foreground hidden md:inline">— {description}</span>}
        </div>
        <Button variant="outline" size="sm" className="text-xs gap-1" style={{ borderColor: color + "40", color }} onClick={onAdd}>
          <Plus className="h-3 w-3" /> {addLabel}
        </Button>
      </div>
      {count > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {children}
        </div>
      ) : (
        <Card className="p-6 text-center border-dashed" style={{ borderColor: color + "40" }}>
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        </Card>
      )}
    </section>
  );

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
        <KpiCard label="إجمالي السيولة النقدية" value={totalBalance} sub="مجموع أرصدة كل الصناديق" icon="💰" color="#1B3A5C" />
        <KpiCard label="صناديق POS" value={posBalance} sub={`${posBoxes.length} نشط`} icon="🖥️" color="#6B3FA0" />
        <KpiCard label="صناديق الفروع" value={branchBalance} sub={`${branchBoxes.length} نشط`} icon="🏦" color="#2D7A4F" />
        <KpiCard label="الصندوق الرئيسي" value={mainBalance} sub={mainBoxes[0]?.name || "غير معرّف"} icon="🏛️" color="#1B3A5C" />
        <KpiCard label="إجمالي النثريات" value={pettyBalance} sub={`${pettyBoxes.length} نشط`} icon="🗃️" color="#C47A1E" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-8">
          {/* Main Box */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🏛️</span>
              <h2 className="text-sm font-bold" style={{ color: "#1B3A5C" }}>الصندوق الرئيسي</h2>
              <Badge className="text-[10px]" style={{ background: "#1B3A5C15", color: "#1B3A5C", border: "1px solid #1B3A5C30" }}>الصندوق الأم — تُرحَّل إليه كل الصناديق</Badge>
            </div>
            {mainBoxes.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {mainBoxes.map(b => <BoxCard key={b.id} box={b} colorType="main" />)}
              </div>
            ) : (
              <Card className="p-8 text-center border-dashed" style={{ borderColor: "#1B3A5C40" }}>
                <Landmark className="h-10 w-10 mx-auto mb-3" style={{ color: "#1B3A5C" }} />
                <p className="text-sm font-medium mb-1">لم يتم إنشاء الصندوق الرئيسي بعد</p>
                <p className="text-xs text-muted-foreground mb-4">الصندوق الرئيسي هو الصندوق الأم الذي تُرحَّل إليه كل الصناديق</p>
                <Button size="sm" onClick={() => openAdd("main")} className="text-white" style={{ background: "#1B3A5C" }}>
                  <Plus className="h-4 w-4 ml-1" /> إنشاء الصندوق الرئيسي
                </Button>
              </Card>
            )}
          </section>

          {/* Branch Boxes */}
          <Section
            icon="🏦" title="صناديق الفروع" count={branchBoxes.length} color="#2D7A4F"
            addLabel="إضافة صندوق فرع" onAdd={() => openAdd("branch")}
            emptyText="لا توجد صناديق فروع" description="خزائن الفروع الرئيسية"
          >
            {branchBoxes.map(b => <BoxCard key={b.id} box={b} colorType="branch" />)}
          </Section>

          {/* POS Boxes */}
          <Section
            icon="🖥️" title="صناديق نقاط البيع" count={posBoxes.length} color="#6B3FA0"
            addLabel="إضافة صندوق POS" onAdd={() => openAdd("pos")}
            emptyText="لا توجد صناديق نقاط بيع" description="صناديق الكاش في نقاط البيع"
          >
            {posBoxes.map(b => <BoxCard key={b.id} box={b} colorType="pos" />)}
          </Section>

          {/* Petty Cash */}
          <Section
            icon="🏷️" title="صناديق النثرية" count={pettyBoxes.length} color="#C47A1E"
            addLabel="إضافة صندوق نثرية" onAdd={() => openAdd("petty_cash")}
            emptyText="لا توجد صناديق نثرية" description="مصاريف نثرية يومية"
          >
            {pettyBoxes.map(b => <BoxCard key={b.id} box={b} colorType="petty" />)}
          </Section>

          {/* Bank Accounts */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏛️</span>
                <h2 className="text-sm font-bold" style={{ color: "#1A5FA8" }}>الحسابات البنكية</h2>
                <Badge className="text-[10px]" style={{ background: "#1A5FA815", color: "#1A5FA8", border: "1px solid #1A5FA830" }}>{bankAccounts.length}</Badge>
                <span className="text-[10px] text-muted-foreground hidden md:inline">— حسابات مصرفية مرتبطة</span>
              </div>
              <Button variant="outline" size="sm" className="text-xs gap-1" style={{ borderColor: "#1A5FA840", color: "#1A5FA8" }} onClick={() => navigate("/finance/bank-accounts")}>
                <Plus className="h-3 w-3" /> إدارة الحسابات البنكية
              </Button>
            </div>
            {bankAccounts.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {bankAccounts.map(ba => {
                  const bal = balances[ba.gl_account_code] || { balance: 0, inflow: 0, outflow: 0, foreignBalances: {} };
                  return (
                    <Card key={ba.id} className="overflow-hidden transition-all hover:shadow-md" style={{ borderColor: "#1A5FA840" }}>
                      <div className="px-3 py-2.5 text-white flex items-center justify-between" style={{ background: TYPE_COLORS.bank.gradient }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Banknote className="h-4 w-4 shrink-0 opacity-80" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">{ba.name}</p>
                            <p className="text-[10px] opacity-60 font-mono">{ba.gl_account_code}</p>
                          </div>
                        </div>
                        <Badge className="text-[9px] h-5 px-1.5 shrink-0 whitespace-nowrap bg-emerald-100 text-emerald-700 border-emerald-300">نشط 🟢</Badge>
                      </div>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] text-muted-foreground">رصيد</span>
                          <span className={`text-base font-bold font-mono ${bal.balance < 0 ? "text-red-600" : ""}`} style={bal.balance >= 0 ? { color: "#1A5FA8" } : {}}>
                            ₪{fmt(bal.balance)}
                          </span>
                        </div>
                        {ba.bank_name && <div className="text-[10px] text-muted-foreground truncate">{ba.bank_name}{ba.branch ? ` - ${ba.branch}` : ""}</div>}
                        <div className="text-[10px] space-y-0.5 pt-1.5 border-t border-border/50">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">↑ وارد</span>
                            <span className="text-emerald-600 font-mono">₪{fmt(bal.inflow)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">↓ صادر</span>
                            <span className="text-red-600 font-mono">₪{fmt(bal.outflow)}</span>
                          </div>
                        </div>
                      </CardContent>
                      <div className="border-t border-border/50 px-2 py-1.5 flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" className="text-[10px] gap-0.5 h-6 px-1.5" onClick={() => navigate(`/account-statement?code=${ba.gl_account_code}`)}>
                          <FileText className="h-3 w-3" /> كشف
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="p-6 text-center border-dashed" style={{ borderColor: "#1A5FA840" }}>
                <p className="text-sm text-muted-foreground">لا توجد حسابات بنكية مسجلة</p>
              </Card>
            )}
          </section>
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
