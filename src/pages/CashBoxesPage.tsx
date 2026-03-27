import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Plus, Loader2, Settings, ArrowUpRight, FileText, Wallet, Building2, Monitor, Landmark, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import CashBoxDrawer from "@/components/finance/CashBoxDrawer";
import PettyCashReplenishDialog from "@/components/finance/PettyCashReplenishDialog";
import CurrencyExchangeDialog from "@/components/finance/CurrencyExchangeDialog";
import BankDepositDialog from "@/components/finance/BankDepositDialog";

const CashBoxesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [boxes, setBoxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerType, setDrawerType] = useState<"main" | "branch" | "pos" | "petty" | "petty_cash">("branch");
  const [editBox, setEditBox] = useState<any>(null);
  const [replenishOpen, setReplenishOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);

  const fetchBoxes = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("cash_boxes")
      .select("*")
      .eq("is_active", true)
      .order("type", { ascending: true });
    setBoxes(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchBoxes(); }, [fetchBoxes]);

  // Compute balances from transactions (multi-currency aware)
  const [balances, setBalances] = useState<Record<string, { balance: number; inflow: number; outflow: number; foreignBalances: Record<string, number> }>>({});

  useEffect(() => {
    if (!user || boxes.length === 0) return;
    const codes = boxes.map(b => b.gl_account_code).filter(Boolean);
    if (codes.length === 0) return;

    (async () => {
      const { data: txs } = await supabase
        .from("transactions")
        .select("amount, debit_account_code, credit_account_code, transaction_date, foreign_amount, exchange_rate, currency")
        .eq("is_deleted", false);

      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const result: Record<string, { balance: number; inflow: number; outflow: number; foreignBalances: Record<string, number> }> = {};

      for (const code of codes) {
        let balance = 0, inflow = 0, outflow = 0;
        const foreignBalances: Record<string, number> = {};
        (txs || []).forEach(tx => {
          const amt = Number(tx.amount) || 0;
          const foreignAmt = Number(tx.foreign_amount) || 0;
          const rate = Number(tx.exchange_rate) || 1;
          // Detect currency from foreign_amount presence
          let txCurrency = "ILS";
          if (foreignAmt > 0 && rate > 1) {
            // Determine currency from exchange rate or currency field
            const cur = tx.currency;
            if (cur === "دولار" || cur === "USD") txCurrency = "USD";
            else if (cur === "دينار" || cur === "JOD") txCurrency = "JOD";
            else if (cur === "يورو" || cur === "EUR") txCurrency = "EUR";
          }

          if (tx.debit_account_code === code) {
            balance += amt;
            if (txCurrency !== "ILS" && foreignAmt > 0) {
              foreignBalances[txCurrency] = (foreignBalances[txCurrency] || 0) + foreignAmt;
            }
          }
          if (tx.credit_account_code === code) {
            balance -= amt;
            if (txCurrency !== "ILS" && foreignAmt > 0) {
              foreignBalances[txCurrency] = (foreignBalances[txCurrency] || 0) - foreignAmt;
            }
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
  }, [user, boxes]);

  const mainBoxes = useMemo(() => boxes.filter(b => b.type === "main"), [boxes]);
  const branchBoxes = useMemo(() => boxes.filter(b => b.type === "branch"), [boxes]);
  const posBoxes = useMemo(() => boxes.filter(b => b.type === "pos"), [boxes]);
  const pettyBoxes = useMemo(() => boxes.filter(b => b.type === "petty" || b.type === "petty_cash"), [boxes]);

  const totalBalance = useMemo(() => Object.values(balances).reduce((s, b) => s + b.balance, 0), [balances]);
  const mainBalance = useMemo(() => mainBoxes.reduce((s, b) => s + (balances[b.gl_account_code]?.balance || 0), 0), [mainBoxes, balances]);
  const branchBalance = useMemo(() => branchBoxes.reduce((s, b) => s + (balances[b.gl_account_code]?.balance || 0), 0), [branchBoxes, balances]);
  const posBalance = useMemo(() => posBoxes.reduce((s, b) => s + (balances[b.gl_account_code]?.balance || 0), 0), [posBoxes, balances]);
  const pettyBalance = useMemo(() => pettyBoxes.reduce((s, b) => s + (balances[b.gl_account_code]?.balance || 0), 0), [pettyBoxes, balances]);

  const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const openAdd = (type: "main" | "branch" | "pos" | "petty" | "petty_cash") => {
    setEditBox(null);
    setDrawerType(type);
    setDrawerOpen(true);
  };

  const BoxCard = ({ box }: { box: any }) => {
    const bal = balances[box.gl_account_code] || { balance: 0, inflow: 0, outflow: 0, foreignBalances: {} };
    const foreignBals = bal.foreignBalances || {};
    const hasForeign = Object.keys(foreignBals).some(k => Math.abs(foreignBals[k]) > 0.01);
    const gradients: Record<string, string> = {
      main: "linear-gradient(135deg, #0A2342, #006D8F)",
      branch: "linear-gradient(135deg, #065F46, #059669)",
      pos: "linear-gradient(135deg, #4C1D95, #7C3AED)",
      petty: "linear-gradient(135deg, #92400E, #D97706)",
      petty_cash: "linear-gradient(135deg, #92400E, #D97706)",
    };
    const currencyLabel = box.currency === "ILS" ? "₪" : box.currency === "USD" ? "$" : box.currency === "JOD" ? "JOD" : box.currency || "₪";
    const TypeIcon = box.type === "main" ? Landmark : box.type === "branch" ? Building2 : (box.type === "petty" || box.type === "petty_cash") ? Wallet : Monitor;
    const fxSymbols: Record<string, string> = { USD: "$", JOD: "JOD ", EUR: "€", EGP: "E£" };

    return (
      <Card className="overflow-hidden group/card">
        <div className="px-3 py-2 text-white flex items-center justify-between" style={{ background: gradients[box.type] || gradients.branch }}>
          <div className="flex items-center gap-2 min-w-0">
            <TypeIcon className="h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{box.name}</p>
              <p className="text-[10px] opacity-60">{box.gl_account_code}</p>
            </div>
          </div>
          <Badge variant="outline" className="text-white border-white/40 text-[9px] h-5 px-1.5 shrink-0">
            {box.is_active ? "نشط" : "مغلق"}
          </Badge>
        </div>
        <CardContent className="p-2.5 space-y-1.5">
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-[10px] text-muted-foreground shrink-0">رصيد ₪</span>
            <span className={`text-sm font-bold font-mono whitespace-nowrap ${bal.balance > 0 ? "text-emerald-600" : bal.balance < 0 ? "text-red-600" : "text-muted-foreground"}`}>
              ₪{fmt(bal.balance)}
            </span>
          </div>
          {/* Foreign currency balances */}
          {hasForeign && (
            <div className="space-y-0.5">
              {Object.entries(foreignBals).filter(([, v]) => Math.abs(v) > 0.01).map(([cur, val]) => (
                <div key={cur} className="flex items-baseline justify-between gap-1">
                  <span className="text-[10px] text-muted-foreground shrink-0">رصيد {cur}</span>
                  <span className={`text-xs font-bold font-mono whitespace-nowrap ${val > 0 ? "text-blue-600" : val < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                    {fxSymbols[cur] || cur}{fmt(val)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {box.branch_location && (
            <div className="text-[10px] text-muted-foreground truncate">{box.branch_location}</div>
          )}
          <div className="text-[10px] space-y-0.5 pt-1 border-t border-border/50">
            <div className="flex justify-between gap-1">
              <span className="text-muted-foreground shrink-0">↑ وارد</span>
              <span className="text-emerald-600 font-mono whitespace-nowrap">{currencyLabel}{fmt(bal.inflow)}</span>
            </div>
            <div className="flex justify-between gap-1">
              <span className="text-muted-foreground shrink-0">↓ صادر</span>
              <span className="text-red-600 font-mono whitespace-nowrap">{currencyLabel}{fmt(bal.outflow)}</span>
            </div>
          </div>
        </CardContent>
        <div className="border-t border-border/50 px-2 py-1.5 flex gap-1 justify-end">
          <Button variant="ghost" size="sm" className="text-[10px] gap-0.5 h-6 px-1.5" onClick={() => navigate(`/account-statement?code=${box.gl_account_code}`)}>
            <FileText className="h-3 w-3" /> كشف
          </Button>
          {box.type !== "main" && (
            <Button variant="ghost" size="sm" className="text-[10px] gap-0.5 h-6 px-1.5" onClick={() => navigate(`/finance/cash-boxes/transfer?from=${box.id}`)}>
              <ArrowUpRight className="h-3 w-3" /> ترحيل
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-[10px] h-6 px-1.5" onClick={() => { setEditBox(box); setDrawerType(box.type); setDrawerOpen(true); }}>
            <Settings className="h-3 w-3" />
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
      <PageHeader title="إدارة الصناديق" breadcrumb={["المالية", "الصناديق"]} />
      
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" style={{ borderColor: "#93C5FD", color: "#1D4ED8" }} onClick={() => setExchangeOpen(true)}>
          <ArrowLeftRight className="h-3.5 w-3.5" /> صرف عملة
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" style={{ borderColor: "#86EFAC", color: "#166534" }} onClick={() => setDepositOpen(true)}>
          <ArrowUpFromLine className="h-3.5 w-3.5" /> إيداع بنكي
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" style={{ borderColor: "#C4B5FD", color: "#6D28D9" }} onClick={() => navigate("/finance/cash-boxes/transfer")}>
          <ArrowLeftRight className="h-3.5 w-3.5" /> تحويل بين الصناديق
        </Button>
        {pettyBoxes.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" style={{ borderColor: "#FCD34D", color: "#92400E" }} onClick={() => setReplenishOpen(true)}>
            <ArrowDownToLine className="h-3.5 w-3.5" /> تغذية النثرية
          </Button>
        )}
        <Button size="sm" className="gap-2 q-btn-primary" onClick={() => openAdd("branch")}>
          <Plus className="h-4 w-4" /> صندوق جديد
        </Button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "إجمالي السيولة النقدية", value: `₪${fmt(totalBalance)}`, sub: "مجموع أرصدة كل الصناديق", icon: "💰", color: "#4A9EE8" },
          { label: "الصندوق الرئيسي", value: `₪${fmt(mainBalance)}`, sub: mainBoxes[0]?.name || "غير معرّف", icon: "🏛️", color: "#0A2342" },
          { label: "صناديق الفروع", value: `₪${fmt(branchBalance)}`, sub: `${branchBoxes.length} صندوق فرع نشط`, icon: "🏪", color: "#059669" },
          { label: "صناديق نقاط البيع", value: `₪${fmt(posBalance)}`, sub: `${posBoxes.length} صندوق POS نشط`, icon: "🖥️", color: "#7C3AED" },
          { label: "صناديق النثرية", value: `₪${fmt(pettyBalance)}`, sub: `${pettyBoxes.length} صندوق نثرية نشط`, icon: "🗃️", color: "#D97706" },
        ].map((kpi, i) => (
          <Card key={i} className="p-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl shrink-0">{kpi.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground truncate">{kpi.label}</p>
                <p className="text-sm font-bold font-mono mt-0.5 whitespace-nowrap" style={{ color: kpi.color }}>{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{kpi.sub}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-8">
          {/* Main Box */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🏛️</span>
              <h2 className="text-sm font-bold">الصندوق الرئيسي</h2>
              <Badge variant="secondary" className="text-[10px]">الصندوق الأم — تُرحَّل إليه كل الصناديق</Badge>
            </div>
            {mainBoxes.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {mainBoxes.map(b => <BoxCard key={b.id} box={b} />)}
              </div>
            ) : (
              <Card className="p-8 text-center border-dashed">
                <Landmark className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium mb-1">لم يتم إنشاء الصندوق الرئيسي بعد</p>
                <p className="text-xs text-muted-foreground mb-4">الصندوق الرئيسي هو الصندوق الأم الذي تُرحَّل إليه كل الصناديق</p>
                <Button size="sm" onClick={() => openAdd("main")} style={{ background: "#0A2342" }}>
                  <Plus className="h-4 w-4 ml-1" /> إنشاء الصندوق الرئيسي
                </Button>
              </Card>
            )}
          </section>

          {/* Branch Boxes */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏪</span>
                <h2 className="text-sm font-bold">صناديق الفروع</h2>
                <Badge variant="secondary" className="text-[10px]">{branchBoxes.length}</Badge>
              </div>
              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => openAdd("branch")}>
                <Plus className="h-3 w-3" /> إضافة صندوق فرع
              </Button>
            </div>
            {branchBoxes.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {branchBoxes.map(b => <BoxCard key={b.id} box={b} />)}
              </div>
            ) : (
              <Card className="p-6 text-center border-dashed">
                <p className="text-sm text-muted-foreground">لا توجد صناديق فروع</p>
              </Card>
            )}
          </section>

          {/* POS Boxes */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🖥️</span>
                <h2 className="text-sm font-bold">صناديق نقاط البيع</h2>
                <Badge variant="secondary" className="text-[10px]">{posBoxes.length}</Badge>
              </div>
              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => openAdd("pos")}>
                <Plus className="h-3 w-3" /> إضافة صندوق POS
              </Button>
            </div>
            {posBoxes.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {posBoxes.map(b => <BoxCard key={b.id} box={b} />)}
              </div>
            ) : (
              <Card className="p-6 text-center border-dashed">
                <p className="text-sm text-muted-foreground">لا توجد صناديق نقاط بيع</p>
              </Card>
            )}
          </section>

          {/* Petty Cash Boxes */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🗃️</span>
                <h2 className="text-sm font-bold">صناديق النثرية</h2>
                <Badge variant="secondary" className="text-[10px]">{pettyBoxes.length}</Badge>
              </div>
              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => openAdd("petty_cash")}>
                <Plus className="h-3 w-3" /> إضافة صندوق نثرية
              </Button>
            </div>
            {pettyBoxes.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {pettyBoxes.map(b => <BoxCard key={b.id} box={b} />)}
              </div>
            ) : (
              <Card className="p-6 text-center border-dashed">
                <p className="text-sm text-muted-foreground">لا توجد صناديق نثرية</p>
              </Card>
            )}
          </section>
        </div>
      )}

      <CashBoxDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditBox(null); }}
        defaultType={drawerType}
        editBox={editBox}
        hasMainBox={mainBoxes.length > 0}
        onSaved={() => { setDrawerOpen(false); setEditBox(null); fetchBoxes(); }}
      />

      <PettyCashReplenishDialog
        open={replenishOpen}
        onOpenChange={setReplenishOpen}
        boxes={boxes}
        userId={user?.id || ""}
        onSuccess={fetchBoxes}
      />

      <CurrencyExchangeDialog
        open={exchangeOpen}
        onOpenChange={setExchangeOpen}
        boxes={boxes}
        userId={user?.id || ""}
        onSuccess={fetchBoxes}
      />

      <BankDepositDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        boxes={boxes}
        userId={user?.id || ""}
        onSuccess={fetchBoxes}
      />
    </div>
  );
};

export default CashBoxesPage;
