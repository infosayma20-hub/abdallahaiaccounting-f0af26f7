import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Loader2, ArrowLeftRight, Check, MoveLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { fmtDateDisplay } from "@/lib/utils";
import AccountingShell from "@/components/layout/AccountingShell";

const CashTransferPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();

  const [boxes, setBoxes] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [foreignBalances, setForeignBalances] = useState<Record<string, Record<string, number>>>({});
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [fromBoxId, setFromBoxId] = useState("");
  const [toBoxId, setToBoxId] = useState("");
  const [amount, setAmount] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [transferCurrency, setTransferCurrency] = useState("ILS");

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [bRes, tRes, txRes] = await Promise.all([
      supabase.from("cash_boxes").select("*").eq("user_id", dataOwnerId!).eq("is_active", true),
      supabase.from("cash_transfers").select("*").eq("user_id", dataOwnerId!).order("created_at", { ascending: false }).limit(50),
      supabase.from("transactions").select("amount, debit_account_code, credit_account_code, foreign_amount, exchange_rate, currency").eq("user_id", dataOwnerId!).eq("is_deleted", false),
    ]);
    const boxesData = bRes.data || [];
    setBoxes(boxesData);
    setTransfers(tRes.data || []);

    // Compute balances (ILS and foreign)
    const codes = boxesData.map((b: any) => b.gl_account_code).filter(Boolean);
    const bals: Record<string, number> = {};
    const fxBals: Record<string, Record<string, number>> = {};
    for (const code of codes) {
      let bal = 0;
      const fxMap: Record<string, number> = {};
      (txRes.data || []).forEach((tx: any) => {
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
          bal += amt;
          if (txCurrency !== "ILS" && foreignAmt > 0) {
            fxMap[txCurrency] = (fxMap[txCurrency] || 0) + foreignAmt;
          }
        }
        if (tx.credit_account_code === code) {
          bal -= amt;
          if (txCurrency !== "ILS" && foreignAmt > 0) {
            fxMap[txCurrency] = (fxMap[txCurrency] || 0) - foreignAmt;
          }
        }
      });
      bals[code] = bal;
      fxBals[code] = fxMap;
    }
    setBalances(bals);
    setForeignBalances(fxBals);

    // Auto-select from query param
    const fromParam = searchParams.get("from");
    if (fromParam) setFromBoxId(fromParam);

    // Auto-select main box as destination
    const mainBox = boxesData.find((b: any) => b.type === "main");
    if (mainBox) setToBoxId(mainBox.id);

    setLoading(false);
  }, [user, searchParams]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fromBox = boxes.find(b => b.id === fromBoxId);
  const toBox = boxes.find(b => b.id === toBoxId);
  const fromGl = fromBox?.gl_account_code || "";
  const fromBalance = fromBox ? (balances[fromGl] || 0) : 0;
  const toBalance = toBox ? (balances[toBox.gl_account_code] || 0) : 0;
  const amountNum = Number(amount) || 0;

  // Available foreign currencies in source box
  const fromFxBals = fromGl ? (foreignBalances[fromGl] || {}) : {};
  const availableFxCurrencies = Object.entries(fromFxBals).filter(([, v]) => Math.abs(v) > 0.01);

  // For foreign currency transfers, check against foreign balance
  const isForeignTransfer = transferCurrency !== "ILS";
  const fromFxBalance = isForeignTransfer ? (fromFxBals[transferCurrency] || 0) : fromBalance;
  const exceeds = amountNum > fromFxBalance && fromFxBalance > 0;

  // Map currency to target main account
  const fxMainAccounts: Record<string, string> = { USD: "1111", JOD: "1112", EUR: "1113", EGP: "1114" };
  const currencySymbols: Record<string, string> = { ILS: "₪", USD: "$", JOD: "JOD ", EUR: "€", EGP: "E£" };
  const currencySymbol = currencySymbols[transferCurrency] || "₪";

  const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  // Auto-suggest description
  useEffect(() => {
    if (fromBox && toBox) {
      const curLabel = isForeignTransfer ? ` (${transferCurrency})` : "";
      setDescription(`تحويل نقدي${curLabel}: ${fromBox.name} → ${toBox.name} — ${transferDate}`);
    }
  }, [fromBox, toBox, transferDate, transferCurrency]);

  // Reset currency when source changes
  useEffect(() => {
    setTransferCurrency("ILS");
  }, [fromBoxId]);

  const typeIcons: Record<string, string> = { main: "🏛️", branch: "🏪", pos: "🖥️" };

  const handleTransfer = async () => {
    if (!user || !fromBox || !toBox || amountNum <= 0) return;
    if (fromBoxId === toBoxId) { toast({ title: "خطأ", description: "لا يمكن التحويل لنفس الصندوق", variant: "destructive" }); return; }
    if (exceeds) { toast({ title: "خطأ", description: "المبلغ يتجاوز رصيد الصندوق", variant: "destructive" }); return; }
    if (!fromBox.gl_account_code) { toast({ title: "خطأ", description: "الصندوق المصدر غير مرتبط بحساب محاسبي", variant: "destructive" }); return; }

    setSaving(true);

    if (isForeignTransfer) {
      // Foreign currency transfer: move from box GL to the main FX account (1111/1112/etc.)
      const targetAccount = fxMainAccounts[transferCurrency] || toBox.gl_account_code;
      
      // We need to figure out the ILS equivalent for the journal entry
      // Get exchange rate from exchange_rates table via RPC
      const { data: rateVal } = await supabase.rpc("get_exchange_rate", {
        p_currency_code: transferCurrency,
        p_rate_type: "sell",
      });
      const rate = Number(rateVal) || (transferCurrency === "USD" ? 3.6 : transferCurrency === "JOD" ? 5.0 : 1);
      const ilsEquivalent = amountNum * rate;

      // Atomic RPC: cash transfer (FX leg uses currency_exchange RPC for proper bookkeeping)
      const { data: rpcRes, error: txErr } = await supabase.rpc("create_cash_transfer_atomic", {
        p_user_id: user.id,
        p_from_account_code: fromBox.gl_account_code,
        p_to_account_code: targetAccount,
        p_amount: ilsEquivalent,
        p_currency: transferCurrency === "USD" ? "دولار" : transferCurrency === "JOD" ? "دينار" : transferCurrency,
        p_transfer_date: transferDate,
        p_description: description || `تحويل ${transferCurrency}: ${fromBox.name} → ${toBox.name}`,
        p_idempotency_key: `CASH-TRANSFER-FX-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        p_source: "manual",
      });
      const fxResult = rpcRes as any;
      if (txErr || !fxResult?.success) {
        toast({ title: "خطأ", description: txErr?.message || fxResult?.error || "فشل التحويل", variant: "destructive" });
        setSaving(false);
        return;
      }

      // Create transfer record
      await supabase.from("cash_transfers").insert({
        user_id: dataOwnerId!,
        from_box_id: fromBoxId,
        to_box_id: toBoxId,
        amount: amountNum,
        currency: transferCurrency,
        amount_ils: ilsEquivalent,
        exchange_rate: rate,
        transfer_date: transferDate,
        description: description,
        transfer_type: "manual",
      });

      toast({ title: `✅ تم تحويل ${currencySymbol}${fmt(amountNum)} من ${fromBox.name}` });
    } else {
      // Atomic RPC for ILS transfer
      const { data: rpcRes, error: txErr } = await supabase.rpc("create_cash_transfer_atomic", {
        p_user_id: user.id,
        p_from_account_code: fromBox.gl_account_code,
        p_to_account_code: toBox.gl_account_code,
        p_amount: amountNum,
        p_currency: "شيكل",
        p_transfer_date: transferDate,
        p_description: description || `تحويل نقدي: ${fromBox.name} → ${toBox.name}`,
        p_idempotency_key: `CASH-TRANSFER-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        p_source: "manual",
      });
      const ilsResult = rpcRes as any;
      if (txErr || !ilsResult?.success) {
        toast({ title: "خطأ", description: txErr?.message || ilsResult?.error || "فشل التحويل", variant: "destructive" });
        setSaving(false);
        return;
      }

      await supabase.from("cash_transfers").insert({
        user_id: dataOwnerId!,
        from_box_id: fromBoxId,
        to_box_id: toBoxId,
        amount: amountNum,
        currency: "ILS",
        amount_ils: amountNum,
        transfer_date: transferDate,
        description: description,
        transfer_type: "manual",
      });

      toast({ title: `✅ تم تحويل ₪${fmt(amountNum)} من ${fromBox.name} إلى ${toBox.name}` });
    }

    setSuccess(true);
    setSaving(false);

    setTimeout(() => {
      setSuccess(false);
      setAmount("");
      setNotes("");
      setTransferCurrency("ILS");
      fetchData();
    }, 2000);
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <AccountingShell>
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto" dir="rtl">
      <PageHeader title="تحويل بين الصناديق" breadcrumb={["المالية", "الصناديق", "تحويل بين الصناديق"]} />

      {/* Transfer Form Card */}
      <Card className="overflow-hidden" style={{ borderTop: "4px solid #4A9EE8" }}>
        <CardContent className="p-6 md:p-8 space-y-6">
          {/* Visual Diagram */}
          <div className="flex items-center justify-center gap-4 py-4">
            <div className={`flex-1 max-w-[200px] p-4 rounded-xl border-2 text-center transition-all ${fromBox ? "border-red-200 bg-red-50/50" : "border-dashed border-muted"}`}>
              <p className="text-xs text-muted-foreground mb-1">من صندوق</p>
              <p className="text-sm font-bold truncate">{fromBox ? `${typeIcons[fromBox.type]} ${fromBox.name}` : "—"}</p>
              {fromBox && (
                <>
                  <p className="text-lg font-mono font-bold mt-1 text-red-600">
                    {isForeignTransfer ? `${currencySymbol}${fmt(fromFxBalance - amountNum)}` : `₪${fmt(fromBalance - (isForeignTransfer ? 0 : amountNum))}`}
                  </p>
                  {amountNum > 0 && <p className="text-[10px] text-muted-foreground">كان: {isForeignTransfer ? `${currencySymbol}${fmt(fromFxBalance)}` : `₪${fmt(fromBalance)}`}</p>}
                  {/* Show foreign balances available */}
                  {availableFxCurrencies.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {availableFxCurrencies.map(([cur, val]) => (
                        <p key={cur} className="text-[10px] text-blue-600 font-mono">{currencySymbols[cur] || cur}{fmt(val)}</p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center">
                <MoveLeft className="h-6 w-6 text-primary animate-pulse" />
              </div>
              {amountNum > 0 && <Badge className="text-xs font-mono" style={{ background: "#4A9EE8" }}>{currencySymbol}{fmt(amountNum)}</Badge>}
            </div>

            <div className={`flex-1 max-w-[200px] p-4 rounded-xl border-2 text-center transition-all ${toBox ? "border-emerald-200 bg-emerald-50/50" : "border-dashed border-muted"}`}>
              <p className="text-xs text-muted-foreground mb-1">إلى {isForeignTransfer ? `حساب ${transferCurrency}` : "صندوق"}</p>
              <p className="text-sm font-bold truncate">{toBox ? (isForeignTransfer ? `${fxMainAccounts[transferCurrency] || ""}` : `${typeIcons[toBox.type]} ${toBox.name}`) : "—"}</p>
              <p className="text-lg font-mono font-bold mt-1 text-emerald-600">
                {toBox ? (isForeignTransfer ? `${currencySymbol}${fmt(amountNum)}` : `₪${fmt(toBalance + amountNum)}`) : "—"}
              </p>
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-xs font-bold">من الصندوق *</Label>
              <Select value={fromBoxId} onValueChange={setFromBoxId}>
                <SelectTrigger className="mt-1 h-11"><SelectValue placeholder="اختر الصندوق المصدر..." /></SelectTrigger>
                <SelectContent>
                  {boxes.filter(b => b.id !== toBoxId).map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      <span className="flex items-center gap-2">
                        <span>{typeIcons[b.type]}</span>
                        <span>{b.name}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">₪{fmt(balances[b.gl_account_code] || 0)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fromBox && <p className="text-xs text-emerald-600 mt-1">الرصيد المتاح: ₪{fmt(fromBalance)}</p>}
            </div>

            <div>
              <Label className="text-xs font-bold">إلى الصندوق *</Label>
              <Select value={toBoxId} onValueChange={setToBoxId}>
                <SelectTrigger className="mt-1 h-11"><SelectValue placeholder="اختر الصندوق الوجهة..." /></SelectTrigger>
                <SelectContent>
                  {boxes.filter(b => b.id !== fromBoxId).map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      <span className="flex items-center gap-2">
                        <span>{typeIcons[b.type]}</span>
                        <span>{b.name}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">₪{fmt(balances[b.gl_account_code] || 0)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Currency selector */}
          <div>
            <Label className="text-xs font-bold">عملة التحويل</Label>
            <div className="flex gap-2 mt-1.5">
              <button
                onClick={() => setTransferCurrency("ILS")}
                className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${transferCurrency === "ILS" ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 hover:bg-muted border-border"}`}
              >
                ₪ شيكل
              </button>
              {availableFxCurrencies.map(([cur, val]) => (
                <button
                  key={cur}
                  onClick={() => setTransferCurrency(cur)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${transferCurrency === cur ? "bg-blue-600 text-white border-blue-600" : "bg-muted/50 hover:bg-muted border-border"}`}
                >
                  {currencySymbols[cur] || cur} {cur} <span className="text-[10px] font-mono opacity-70">({fmt(val)})</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold">المبلغ * ({currencySymbol})</Label>
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className={`mt-1 h-12 text-lg font-mono font-bold ${exceeds ? "border-red-500 focus-visible:ring-red-500" : ""}`}
            />
            {exceeds && <p className="text-xs text-red-600 mt-1">⚠️ المبلغ يتجاوز رصيد الصندوق {currencySymbol}{fmt(fromFxBalance)}</p>}
            {fromBox && (
              <div className="flex gap-2 mt-2">
                {!isForeignTransfer && [500, 1000, 2000].map(q => (
                  <button key={q} onClick={() => setAmount(String(q))}
                    className="px-3 py-1 rounded-lg text-xs font-medium border hover:bg-muted transition-colors">
                    ₪{q.toLocaleString()}
                  </button>
                ))}
                <button onClick={() => setAmount(String(isForeignTransfer ? fromFxBalance : fromBalance))}
                  className="px-3 py-1 rounded-lg text-xs font-medium border border-primary/30 text-primary hover:bg-primary/5 transition-colors">
                  الكل {currencySymbol}{fmt(isForeignTransfer ? fromFxBalance : fromBalance)}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-xs font-bold">التاريخ</Label>
              <Input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} className="mt-1 h-11" />
            </div>
            <div>
              <Label className="text-xs font-bold">البيان</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} className="mt-1 h-11" />
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold">ملاحظات (اختياري)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="mt-1" />
          </div>

          {/* Journal Entry Preview */}
          {fromBox && toBox && amountNum > 0 && (
            <div className="rounded-xl border overflow-hidden">
              <div className="p-3 bg-muted/30 text-xs font-bold flex items-center gap-2">
                <ArrowLeftRight className="h-3.5 w-3.5" /> القيد المحاسبي
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-muted-foreground border-t">
                    <th className="text-right p-2.5">الحساب</th>
                    <th className="text-right p-2.5 w-28">مدين</th>
                    <th className="text-right p-2.5 w-28">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="p-2.5 text-xs">
                      <span className="text-emerald-600">🟢</span> {isForeignTransfer ? fxMainAccounts[transferCurrency] : toBox.gl_account_code} — {isForeignTransfer ? `صندوق ${transferCurrency} الرئيسي` : toBox.name}
                    </td>
                    <td className="p-2.5 font-mono text-xs font-bold">{currencySymbol}{fmt(amountNum)}</td>
                    <td className="p-2.5"></td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2.5 text-xs">
                      <span className="text-red-600">🔴</span> {fromBox.gl_account_code} — {fromBox.name}
                    </td>
                    <td className="p-2.5"></td>
                    <td className="p-2.5 font-mono text-xs font-bold text-red-600">{currencySymbol}{fmt(amountNum)}</td>
                  </tr>
                  <tr className="border-t bg-muted/30 font-bold text-xs">
                    <td className="p-2.5">الإجمالي</td>
                    <td className="p-2.5 font-mono">{currencySymbol}{fmt(amountNum)}</td>
                    <td className="p-2.5 font-mono text-red-600">{currencySymbol}{fmt(amountNum)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="p-2 text-center text-xs text-emerald-600 bg-emerald-50/50 border-t">✓ متوازن</div>
            </div>
          )}

          {/* Submit */}
          <Button
            className="w-full h-12 text-base gap-2"
            style={{ background: "linear-gradient(135deg, #4A9EE8, #3A8BD6)" }}
            disabled={saving || !fromBoxId || !toBoxId || amountNum <= 0 || exceeds || fromBoxId === toBoxId}
            onClick={handleTransfer}
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : success ? <Check className="h-5 w-5" /> : <ArrowLeftRight className="h-5 w-5" />}
            {success ? "✅ تم التحويل بنجاح" : "✓ تنفيذ التحويل"}
          </Button>
        </CardContent>
      </Card>

      {/* Transfer History */}
      {transfers.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b">
              <h3 className="text-sm font-bold">سجل التحويلات</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground text-xs">
                    <th className="text-right py-2.5 px-3">التاريخ</th>
                    <th className="text-right py-2.5 px-3">من</th>
                    <th className="text-right py-2.5 px-3">إلى</th>
                    <th className="text-right py-2.5 px-3">المبلغ</th>
                    <th className="text-right py-2.5 px-3">العملة</th>
                    <th className="text-right py-2.5 px-3">البيان</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map(t => {
                    const fb = boxes.find(b => b.id === t.from_box_id);
                    const tb = boxes.find(b => b.id === t.to_box_id);
                    const tCur = t.currency || "ILS";
                    const sym = currencySymbols[tCur] || "₪";
                    return (
                      <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2.5 px-3 text-xs">{fmtDateDisplay(t.transfer_date)}</td>
                        <td className="py-2.5 px-3 text-xs">{fb ? `${typeIcons[fb.type]} ${fb.name}` : "—"}</td>
                        <td className="py-2.5 px-3 text-xs">{tb ? `${typeIcons[tb.type]} ${tb.name}` : "—"}</td>
                        <td className="py-2.5 px-3 font-mono text-xs font-bold">{sym}{fmt(Number(t.amount))}</td>
                        <td className="py-2.5 px-3 text-xs">
                          {tCur !== "ILS" && <Badge variant="outline" className="text-[10px] h-5">{tCur}</Badge>}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-muted-foreground truncate max-w-[200px]">{t.description}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </AccountingShell>
  );
};

export default CashTransferPage;
