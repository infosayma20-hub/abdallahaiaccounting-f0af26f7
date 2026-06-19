import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Save, Plus, Trash2, RefreshCw } from "lucide-react";
import { ensureTravelAccounts } from "@/services/travelAccountingService";

const DEFAULT_CURRENCIES = [
  { currency_code: "ILS", currency_name_ar: "شيكل إسرائيلي", symbol: "₪", exchange_rate: 1, is_default: true },
  { currency_code: "USD", currency_name_ar: "دولار أمريكي", symbol: "$", exchange_rate: 3.65, is_default: false },
  { currency_code: "SAR", currency_name_ar: "ريال سعودي", symbol: "﷼", exchange_rate: 0.97, is_default: false },
  { currency_code: "JOD", currency_name_ar: "دينار أردني", symbol: "د.أ", exchange_rate: 5.15, is_default: false },
  { currency_code: "EUR", currency_name_ar: "يورو", symbol: "€", exchange_rate: 4.0, is_default: false },
  { currency_code: "TRY", currency_name_ar: "ليرة تركية", symbol: "₺", exchange_rate: 0.11, is_default: false },
  { currency_code: "EGP", currency_name_ar: "جنيه مصري", symbol: "ج.م", exchange_rate: 0.07, is_default: false },
];

const TRAVEL_ACCOUNTS = [
  { code: "4150", name: "إيرادات السياحة والسفر", role: "travel_revenue" },
  { code: "4151", name: "إيرادات الحج والعمرة", role: "travel_hajj_revenue" },
  { code: "4152", name: "إيرادات تذاكر الطيران", role: "travel_flight_revenue" },
  { code: "4153", name: "إيرادات الفنادق", role: "travel_hotel_revenue" },
  { code: "4154", name: "إيرادات التأشيرات", role: "travel_visa_revenue" },
  { code: "5300", name: "تكاليف السياحة والسفر", role: "travel_cost" },
  { code: "5310", name: "تكاليف الحج والعمرة", role: "travel_hajj_cost" },
  { code: "5320", name: "تكاليف تذاكر الطيران", role: "travel_flight_cost" },
  { code: "5330", name: "تكاليف الفنادق", role: "travel_hotel_cost" },
  { code: "5340", name: "تكاليف التأشيرات", role: "travel_visa_cost" },
  { code: "1135", name: "ذمم عملاء السياحة", role: "travel_receivable" },
  { code: "2115", name: "ذمم موردي السياحة", role: "travel_payable" },
];

export default function TravelSettingsPage() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCurrencies, setSavingCurrencies] = useState(false);
  const [initializingAccounts, setInitializingAccounts] = useState(false);

  useEffect(() => { if (dataOwnerId) fetchData(); }, [dataOwnerId]);

  const fetchData = async () => {
    if (!user) return;
    const [curRes, accRes] = await Promise.all([
      supabase.from("travel_currencies").select("*").eq("user_id", dataOwnerId!).order("is_default", { ascending: false }),
      supabase.from("accounts").select("account_code, account_name, system_role")
        .eq("user_id", user.id)
        .in("system_role", TRAVEL_ACCOUNTS.map(a => a.role)),
    ]);
    if (curRes.data && curRes.data.length > 0) {
      setCurrencies(curRes.data);
    }
    if (accRes.data) setAccounts(accRes.data);
    setLoading(false);
  };

  const handleInitCurrencies = async () => {
    if (!user) return;
    setSavingCurrencies(true);
    try {
      const rows = DEFAULT_CURRENCIES.map(c => ({ ...c, user_id: user.id }));
      for (const row of rows) {
        await supabase.from("travel_currencies").upsert(row as any);
      }
      toast({ title: "✅ تم تهيئة العملات" });
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setSavingCurrencies(false);
    }
  };

  const handleInitAccounts = async () => {
    if (!user) return;
    setInitializingAccounts(true);
    try {
      await ensureTravelAccounts(user.id);
      toast({ title: "✅ تم تهيئة الحسابات المحاسبية" });
      fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setInitializingAccounts(false);
    }
  };

  const updateCurrencyRate = async (id: string, newRate: number) => {
    await supabase.from("travel_currencies").update({ exchange_rate: newRate, updated_at: new Date().toISOString() }).eq("id", id);
    setCurrencies(currencies.map(c => c.id === id ? { ...c, exchange_rate: newRate } : c));
  };

  if (loading) return <div className="text-center py-20 text-muted-foreground">جارٍ التحميل...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      <h1 className="text-xl font-bold" style={{ color: "#0D1B2E" }}>⚙️ إعدادات السياحة والسفر</h1>

      {/* Currencies */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">💱 العملات وأسعار الصرف</h2>
          {currencies.length === 0 && (
            <Button size="sm" onClick={handleInitCurrencies} disabled={savingCurrencies} style={{ background: "#C9A84C" }} className="text-white">
              <Plus className="w-4 h-4 ml-1" /> تهيئة العملات الافتراضية
            </Button>
          )}
        </div>

        {currencies.length > 0 ? (
          <div className="space-y-2">
            {currencies.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border">
                <span className="text-lg w-8 text-center">{c.symbol}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{c.currency_name_ar}</p>
                  <p className="text-xs text-muted-foreground">{c.currency_code}</p>
                </div>
                {c.is_default ? (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">العملة الأساسية</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">1 {c.currency_code} =</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={c.exchange_rate}
                      onChange={e => updateCurrencyRate(c.id, parseFloat(e.target.value) || 0)}
                      className="h-8 w-24 text-xs"
                    />
                    <span className="text-xs">₪</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">لم يتم تهيئة العملات بعد. اضغط على الزر أعلاه للبدء.</p>
        )}
      </Card>

      {/* Accounting Accounts */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">🏦 الحسابات المحاسبية المرتبطة</h2>
          <Button size="sm" variant="outline" onClick={handleInitAccounts} disabled={initializingAccounts}>
            <RefreshCw className={`w-4 h-4 ml-1 ${initializingAccounts ? "animate-spin" : ""}`} />
            {accounts.length === 0 ? "تهيئة الحسابات" : "تحديث"}
          </Button>
        </div>

        {accounts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {accounts.map(a => (
              <div key={a.account_code} className="flex items-center gap-2 p-2.5 rounded-lg border text-sm">
                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{a.account_code}</span>
                <span className="flex-1">{a.account_name}</span>
                <span className="text-[10px] text-muted-foreground">{a.system_role}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 space-y-2">
            <p className="text-sm text-muted-foreground">لم يتم تهيئة حسابات السياحة بعد.</p>
            <p className="text-xs text-muted-foreground">سيتم إنشاء حسابات الإيرادات والتكاليف والذمم تلقائياً في شجرة الحسابات.</p>
          </div>
        )}

        {/* Reference table */}
        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground mb-2">مرجع الحسابات المطلوبة:</p>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {TRAVEL_ACCOUNTS.map(a => (
              <div key={a.code} className="flex items-center gap-1">
                <span className="font-mono text-muted-foreground">{a.code}</span>
                <span>{a.name}</span>
                {accounts.find(ac => ac.system_role === a.role) ? (
                  <span className="text-green-500 text-[10px]">✓</span>
                ) : (
                  <span className="text-orange-500 text-[10px]">✗</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
