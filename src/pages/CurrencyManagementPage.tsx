import { useState, useMemo, useEffect, useRef } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus, TrendingUp, TrendingDown, ArrowLeftRight, RefreshCw,
  DollarSign, History, Trash2, Star, Download, ArrowRight,
  AlertTriangle, Globe, BarChart3
} from "lucide-react";
import BackButton from "@/components/BackButton";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const DEFAULT_CURRENCIES = [
  { code: "ILS", name_ar: "شيكل إسرائيلي", name_en: "Israeli Shekel", symbol: "₪", is_base: true, country_flag: "🇮🇱", display_order: 1 },
  { code: "USD", name_ar: "دولار أمريكي", name_en: "US Dollar", symbol: "$", is_base: false, country_flag: "🇺🇸", display_order: 2 },
  { code: "JOD", name_ar: "دينار أردني", name_en: "Jordanian Dinar", symbol: "د.أ", is_base: false, country_flag: "🇯🇴", display_order: 3 },
  { code: "EUR", name_ar: "يورو", name_en: "Euro", symbol: "€", is_base: false, country_flag: "🇪🇺", display_order: 4 },
  { code: "EGP", name_ar: "جنيه مصري", name_en: "Egyptian Pound", symbol: "ج.م", is_base: false, country_flag: "🇪🇬", display_order: 5 },
  { code: "GBP", name_ar: "جنيه إسترليني", name_en: "British Pound", symbol: "£", is_base: false, country_flag: "🇬🇧", display_order: 6 },
  { code: "TRY", name_ar: "ليرة تركية", name_en: "Turkish Lira", symbol: "₺", is_base: false, country_flag: "🇹🇷", display_order: 7 },
];

const CurrencyManagementPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("rates");
  const [showAddCurrency, setShowAddCurrency] = useState(false);
  const [showConversion, setShowConversion] = useState(false);
  const [newCurrency, setNewCurrency] = useState({ code: "", name_ar: "", name_en: "", symbol: "", country_flag: "" });
  const [chartCurrency, setChartCurrency] = useState<string>("");
  const [chartRange, setChartRange] = useState("month");
  const [quickRateDate, setQuickRateDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [quickRates, setQuickRates] = useState<Record<string, { buy: string; sell: string }>>({});
  const [convForm, setConvForm] = useState({ from_currency_id: "", to_currency_id: "", from_amount: "", rate: "", commission: "0", from_account: "", to_account: "", notes: "" });

  // Fetch currencies
  const { data: currencies = [], isLoading: loadingCurrencies } = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("currencies")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch exchange rates (latest 200)
  const { data: rates = [] } = useQuery({
    queryKey: ["exchange_rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exchange_rates")
        .select("*, currencies(code, name_ar, symbol, country_flag)")
        .order("rate_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch conversions
  const { data: conversions = [] } = useQuery({
    queryKey: ["currency_conversions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("currency_conversions")
        .select("*, from_currency:from_currency_id(code, symbol, country_flag), to_currency:to_currency_id(code, symbol, country_flag)")
        .order("conversion_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const foreignCurrencies = currencies.filter((c: any) => !c.is_base);

  // Get today's and yesterday's rates per currency
  const todayRates = useMemo(() => {
    const map: Record<string, any> = {};
    for (const c of foreignCurrencies) {
      const todayRate = rates.find((r: any) => r.currency_id === c.id && r.rate_date === today);
      const yesterdayRates = rates.filter((r: any) => r.currency_id === c.id && r.rate_date < today);
      const yesterdayRate = yesterdayRates.length > 0 ? yesterdayRates[0] : null;
      map[c.id] = { today: todayRate, yesterday: yesterdayRate, currency: c };
    }
    return map;
  }, [foreignCurrencies, rates, today]);

  const missingTodayRates = foreignCurrencies.filter((c: any) => !todayRates[c.id]?.today && c.is_active);

  // Auto-fetch rates when page loads and today's rates are missing
  const autoFetchedRef = useRef(false);
  useEffect(() => {
    if (autoFetchedRef.current || fetchRatesMutation.isPending) return;
    if (foreignCurrencies.length > 0 && missingTodayRates.length > 0 && rates.length >= 0) {
      autoFetchedRef.current = true;
      fetchRatesMutation.mutate();
    }
  }, [foreignCurrencies, missingTodayRates, rates]);

  // Chart data
  const chartData = useMemo(() => {
    if (!chartCurrency) return [];
    const filtered = rates
      .filter((r: any) => r.currency_id === chartCurrency)
      .sort((a: any, b: any) => a.rate_date.localeCompare(b.rate_date));
    
    const now = new Date();
    const rangeMs = chartRange === "week" ? 7 * 86400000 : chartRange === "month" ? 30 * 86400000 : chartRange === "3months" ? 90 * 86400000 : 365 * 86400000;
    const cutoff = new Date(now.getTime() - rangeMs).toISOString().split("T")[0];
    
    return filtered.filter((r: any) => r.rate_date >= cutoff).map((r: any) => ({
      date: r.rate_date,
      شراء: Number(r.buy_rate),
      بيع: Number(r.sell_rate),
      وسيط: Number(r.mid_rate),
    }));
  }, [chartCurrency, rates, chartRange]);

  // Initialize currencies
  const initMutation = useMutation({
    mutationFn: async () => {
      const inserts = DEFAULT_CURRENCIES.map(c => ({ ...c, user_id: user!.id }));
      const { error } = await supabase.from("currencies").upsert(inserts, { onConflict: "user_id,code" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currencies"] });
      toast.success("تم تهيئة العملات بنجاح");
    },
  });

  // Fetch rates from API
  const fetchRatesMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-exchange-rates");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["exchange_rates"] });
      toast.success(`تم جلب أسعار ${data.rates?.length || 0} عملات بنجاح`);
    },
    onError: (err: any) => toast.error("فشل جلب الأسعار: " + err.message),
  });

  // Save quick rates
  const saveQuickRates = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(quickRates).filter(([_, v]) => v.buy && v.sell);
      if (entries.length === 0) throw new Error("أدخل سعراً واحداً على الأقل");
      for (const [currId, vals] of entries) {
        const buy = parseFloat(vals.buy);
        const sell = parseFloat(vals.sell);
        if (sell < buy) throw new Error("سعر البيع يجب أن يكون أكبر من سعر الشراء");
        if (buy <= 0 || sell <= 0) throw new Error("الأسعار يجب أن تكون أكبر من صفر");
        const { error } = await supabase.from("exchange_rates").upsert({
          currency_id: currId, rate_date: quickRateDate,
          buy_rate: buy, sell_rate: sell, mid_rate: (buy + sell) / 2,
          source: "manual", user_id: user!.id,
        }, { onConflict: "user_id,currency_id,rate_date" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exchange_rates"] });
      setQuickRates({});
      toast.success("تم حفظ الأسعار بنجاح");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Add currency
  const addCurrencyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("currencies").insert({ ...newCurrency, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currencies"] });
      setShowAddCurrency(false);
      setNewCurrency({ code: "", name_ar: "", name_en: "", symbol: "", country_flag: "" });
      toast.success("تمت إضافة العملة");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Post conversion
  const postConversion = useMutation({
    mutationFn: async () => {
      const rate = parseFloat(convForm.rate);
      const fromAmt = parseFloat(convForm.from_amount);
      const commission = parseFloat(convForm.commission || "0");
      const toAmt = fromAmt * rate - commission;
      const { error } = await supabase.from("currency_conversions").insert({
        user_id: user!.id,
        from_currency_id: convForm.from_currency_id,
        to_currency_id: convForm.to_currency_id,
        from_amount: fromAmt,
        to_amount: toAmt,
        exchange_rate_used: rate,
        commission_amount: commission,
        from_account: convForm.from_account || null,
        to_account: convForm.to_account || null,
        notes: convForm.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currency_conversions"] });
      setShowConversion(false);
      setConvForm({ from_currency_id: "", to_currency_id: "", from_amount: "", rate: "", commission: "0", from_account: "", to_account: "", notes: "" });
      toast.success("تم تسجيل التحويل بنجاح");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Toggle currency
  const toggleCurrency = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("currencies").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["currencies"] }),
  });

  // Delete rate
  const deleteRate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exchange_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exchange_rates"] });
      toast.success("تم الحذف");
    },
  });

  // Computed conversion values
  const convRate = parseFloat(convForm.rate) || 0;
  const convFromAmt = parseFloat(convForm.from_amount) || 0;
  const convCommission = parseFloat(convForm.commission) || 0;
  const convToAmt = convFromAmt * convRate - convCommission;
  const fromCurr = currencies.find((c: any) => c.id === convForm.from_currency_id) as any;
  const toCurr = currencies.find((c: any) => c.id === convForm.to_currency_id) as any;

  // Auto-fill rate when currencies are selected in conversion
  const handleConvCurrencyChange = (field: string, value: string) => {
    setConvForm(p => {
      const next = { ...p, [field]: value };
      // Auto-fill rate if both currencies selected
      if (next.from_currency_id && next.to_currency_id) {
        const fromC = currencies.find((c: any) => c.id === next.from_currency_id) as any;
        const toC = currencies.find((c: any) => c.id === next.to_currency_id) as any;
        if (fromC && toC) {
          // Find rate: we need from→to rate
          const foreignCode = fromC.is_base ? toC.code : fromC.code;
          const latestRate = rates.find((r: any) => {
            const rc = (r.currencies as any);
            return rc?.code === foreignCode;
          });
          if (latestRate) {
            if (fromC.is_base) {
              next.rate = (1 / Number(latestRate.mid_rate)).toFixed(6);
            } else {
              next.rate = Number(latestRate.mid_rate).toFixed(6);
            }
          }
        }
      }
      return next;
    });
  };

  if (loadingCurrencies) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground" dir="rtl">جاري التحميل...</div>;
  }

  if (currencies.length === 0) {
    return (
      <div className="p-6 text-center space-y-6" dir="rtl">
        <div className="text-6xl">💱</div>
        <h1 className="text-2xl font-bold text-foreground">نظام إدارة العملات</h1>
        <p className="text-muted-foreground max-w-md mx-auto">لم يتم تهيئة العملات بعد. اضغط الزر أدناه لإضافة العملات الافتراضية (ILS, USD, JOD, EUR, EGP, GBP, TRY)</p>
        <Button size="lg" onClick={() => initMutation.mutate()} disabled={initMutation.isPending}>
          <Globe className="h-5 w-5 ml-2" />
          تهيئة العملات
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <PageHeader title="إدارة العملات وأسعار الصرف" breadcrumb={["المالية", "إدارة العملات"]} />
      
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">
          العملة الأساسية: <Badge variant="default" className="mr-1">🇮🇱 ₪ ILS</Badge>
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => fetchRatesMutation.mutate()} disabled={fetchRatesMutation.isPending} variant="outline">
            <RefreshCw className={`h-4 w-4 ml-2 ${fetchRatesMutation.isPending ? 'animate-spin' : ''}`} />
            جلب تلقائي
          </Button>
          <Dialog open={showConversion} onOpenChange={setShowConversion}>
            <DialogTrigger asChild>
              <Button variant="default">
                <ArrowLeftRight className="h-4 w-4 ml-2" />
                تحويل عملة
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg" dir="rtl">
              <DialogHeader><DialogTitle>تحويل عملات</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>من عملة</Label>
                    <Select value={convForm.from_currency_id} onValueChange={v => handleConvCurrencyChange("from_currency_id", v)}>
                      <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                      <SelectContent>
                        {currencies.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.country_flag} {c.symbol} {c.name_ar}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>إلى عملة</Label>
                    <Select value={convForm.to_currency_id} onValueChange={v => handleConvCurrencyChange("to_currency_id", v)}>
                      <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                      <SelectContent>
                        {currencies.filter((c: any) => c.id !== convForm.from_currency_id).map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.country_flag} {c.symbol} {c.name_ar}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>المبلغ</Label>
                    <Input type="number" step="0.01" value={convForm.from_amount} onChange={e => setConvForm(p => ({ ...p, from_amount: e.target.value }))} placeholder="0.00" />
                  </div>
                  <div>
                    <Label>سعر الصرف</Label>
                    <Input type="number" step="0.000001" value={convForm.rate} onChange={e => setConvForm(p => ({ ...p, rate: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>عمولة البنك</Label>
                  <Input type="number" step="0.01" value={convForm.commission} onChange={e => setConvForm(p => ({ ...p, commission: e.target.value }))} />
                </div>
                {/* Live preview */}
                {convFromAmt > 0 && convRate > 0 && fromCurr && toCurr && (
                  <Card className="bg-muted/50">
                    <CardContent className="p-4 text-center space-y-2">
                      <div className="text-lg font-bold">
                        {fromCurr.country_flag} {fromCurr.symbol}{convFromAmt.toLocaleString()} × {convRate}
                      </div>
                      <ArrowRight className="h-5 w-5 mx-auto text-primary" />
                      <div className="text-xl font-bold text-primary">
                        {toCurr.country_flag} {toCurr.symbol}{convToAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {convCommission > 0 && (
                        <div className="text-xs text-muted-foreground">عمولة: ₪{convCommission.toFixed(2)}</div>
                      )}
                    </CardContent>
                  </Card>
                )}
                <div>
                  <Label>ملاحظات</Label>
                  <Input value={convForm.notes} onChange={e => setConvForm(p => ({ ...p, notes: e.target.value }))} placeholder="اختياري" />
                </div>
                <Button
                  onClick={() => postConversion.mutate()}
                  disabled={!convForm.from_currency_id || !convForm.to_currency_id || !convForm.from_amount || !convForm.rate || postConversion.isPending}
                  className="w-full"
                >
                  تسجيل التحويل
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showAddCurrency} onOpenChange={setShowAddCurrency}>
            <DialogTrigger asChild>
              <Button variant="outline"><Plus className="h-4 w-4 ml-2" />عملة جديدة</Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader><DialogTitle>إضافة عملة جديدة</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <div className="grid grid-cols-3 gap-2">
                  <div><Label>الرمز</Label><Input value={newCurrency.code} onChange={e => setNewCurrency(p => ({ ...p, code: e.target.value.toUpperCase() }))} maxLength={5} placeholder="USD" /></div>
                  <div><Label>الرمز المالي</Label><Input value={newCurrency.symbol} onChange={e => setNewCurrency(p => ({ ...p, symbol: e.target.value }))} maxLength={5} placeholder="$" /></div>
                  <div><Label>العلم</Label><Input value={newCurrency.country_flag} onChange={e => setNewCurrency(p => ({ ...p, country_flag: e.target.value }))} maxLength={4} placeholder="🇺🇸" /></div>
                </div>
                <div><Label>الاسم بالعربية</Label><Input value={newCurrency.name_ar} onChange={e => setNewCurrency(p => ({ ...p, name_ar: e.target.value }))} /></div>
                <div><Label>الاسم بالإنجليزية</Label><Input value={newCurrency.name_en} onChange={e => setNewCurrency(p => ({ ...p, name_en: e.target.value }))} /></div>
                <Button onClick={() => addCurrencyMutation.mutate()} disabled={!newCurrency.code || !newCurrency.name_ar || !newCurrency.symbol || addCurrencyMutation.isPending} className="w-full">إضافة</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Warning banner for missing rates */}
      {missingTodayRates.length > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="p-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
            <p className="text-sm text-foreground">
              ⚠️ لم يتم تحديث أسعار اليوم لـ: {missingTodayRates.map((c: any) => `${c.country_flag} ${c.code}`).join("، ")}
            </p>
            <Button size="sm" variant="outline" className="mr-auto shrink-0" onClick={() => fetchRatesMutation.mutate()} disabled={fetchRatesMutation.isPending}>
              تحديث
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Rate Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {foreignCurrencies.filter((c: any) => c.is_active).map((c: any) => {
          const info = todayRates[c.id];
          const rate = info?.today || info?.yesterday;
          const prevRate = info?.today ? info?.yesterday : null;
          const change = rate && prevRate ? Number(rate.mid_rate) - Number(prevRate.mid_rate) : null;
          const isStale = !info?.today && !!info?.yesterday;

          return (
            <Card key={c.id} className={`relative overflow-hidden ${isStale ? 'border-yellow-500/50' : ''}`}>
              <CardContent className="p-4 text-center space-y-1">
                <div className="text-3xl">{c.country_flag}</div>
                <div className="font-mono font-bold text-sm">{c.code}</div>
                <div className="text-xs text-muted-foreground">{c.name_ar}</div>
                {rate ? (
                  <>
                    <div className="text-lg font-bold text-foreground">₪{Number(rate.mid_rate).toFixed(4)}</div>
                    <div className="flex justify-between text-[10px] px-1">
                      <span className="text-emerald-500">شراء {Number(rate.buy_rate).toFixed(4)}</span>
                      <span className="text-destructive">بيع {Number(rate.sell_rate).toFixed(4)}</span>
                    </div>
                    {change !== null && (
                      <div className={`flex items-center justify-center gap-1 text-xs font-medium ${change >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                        {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {change >= 0 ? '+' : ''}{change.toFixed(4)}
                      </div>
                    )}
                    {isStale && <div className="text-[10px] text-yellow-500">⚠️ سعر أمس</div>}
                    <div className="text-[10px] text-muted-foreground">{rate.rate_date}</div>
                  </>
                ) : (
                  <div className="text-xs text-destructive mt-2">لا يوجد سعر</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="rates"><TrendingUp className="h-4 w-4 ml-1" />إدخال سريع</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 ml-1" />السجل</TabsTrigger>
          <TabsTrigger value="chart"><BarChart3 className="h-4 w-4 ml-1" />الرسم البياني</TabsTrigger>
          <TabsTrigger value="conversions"><ArrowLeftRight className="h-4 w-4 ml-1" />التحويلات</TabsTrigger>
          <TabsTrigger value="currencies"><DollarSign className="h-4 w-4 ml-1" />العملات</TabsTrigger>
        </TabsList>

        {/* Quick Rate Entry */}
        <TabsContent value="rates" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>إدخال سريع لأسعار الصرف</span>
                <Input type="date" value={quickRateDate} onChange={e => setQuickRateDate(e.target.value)} className="w-44" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">العملة</TableHead>
                    <TableHead className="text-right">سعر الشراء (₪)</TableHead>
                    <TableHead className="text-right">سعر البيع (₪)</TableHead>
                    <TableHead className="text-right">السعر الوسيط</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {foreignCurrencies.filter((c: any) => c.is_active).map((c: any) => {
                    const qr = quickRates[c.id] || { buy: "", sell: "" };
                    const mid = qr.buy && qr.sell ? ((parseFloat(qr.buy) + parseFloat(qr.sell)) / 2).toFixed(4) : "—";
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.country_flag} {c.code} — {c.name_ar}</TableCell>
                        <TableCell>
                          <Input
                            type="number" step="0.0001" placeholder="0.0000"
                            value={qr.buy}
                            onChange={e => setQuickRates(p => ({ ...p, [c.id]: { ...p[c.id], buy: e.target.value, sell: p[c.id]?.sell || "" } }))}
                            className="w-28"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number" step="0.0001" placeholder="0.0000"
                            value={qr.sell}
                            onChange={e => setQuickRates(p => ({ ...p, [c.id]: { buy: p[c.id]?.buy || "", sell: e.target.value } }))}
                            className="w-28"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">{mid}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex justify-end mt-4">
                <Button onClick={() => saveQuickRates.mutate()} disabled={saveQuickRates.isPending}>
                  حفظ الأسعار
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Historical Rates */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">سجل أسعار الصرف</CardTitle>
            </CardHeader>
            <CardContent>
              {rates.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">لا توجد أسعار مسجلة</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">العملة</TableHead>
                        <TableHead className="text-right">سعر الشراء</TableHead>
                        <TableHead className="text-right">سعر البيع</TableHead>
                        <TableHead className="text-right">الوسيط</TableHead>
                        <TableHead className="text-right">المصدر</TableHead>
                        <TableHead className="text-center">حذف</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rates.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-sm">{r.rate_date}</TableCell>
                          <TableCell>{(r.currencies as any)?.country_flag} {(r.currencies as any)?.code}</TableCell>
                          <TableCell className="text-emerald-600">₪{Number(r.buy_rate).toFixed(4)}</TableCell>
                          <TableCell className="text-destructive">₪{Number(r.sell_rate).toFixed(4)}</TableCell>
                          <TableCell className="font-bold">₪{Number(r.mid_rate).toFixed(4)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{r.source === "manual" ? "يدوي" : r.source === "auto_api" ? "تلقائي" : r.source}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button variant="ghost" size="icon" onClick={() => deleteRate.mutate(r.id)} className="h-7 w-7 text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chart */}
        <TabsContent value="chart" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between flex-wrap gap-3">
                <span>رسم بياني لأسعار الصرف</span>
                <div className="flex gap-2">
                  <Select value={chartCurrency} onValueChange={setChartCurrency}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="اختر العملة" /></SelectTrigger>
                    <SelectContent>
                      {foreignCurrencies.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.country_flag} {c.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={chartRange} onValueChange={setChartRange}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">أسبوع</SelectItem>
                      <SelectItem value="month">شهر</SelectItem>
                      <SelectItem value="3months">3 أشهر</SelectItem>
                      <SelectItem value="year">سنة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!chartCurrency ? (
                <div className="text-center py-16 text-muted-foreground">اختر عملة لعرض الرسم البياني</div>
              ) : chartData.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">لا توجد بيانات كافية</div>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="شراء" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="بيع" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="وسيط" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conversions */}
        <TabsContent value="conversions" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">سجل تحويلات العملات</CardTitle>
            </CardHeader>
            <CardContent>
              {conversions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">لا توجد تحويلات مسجلة</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">من</TableHead>
                      <TableHead className="text-right">إلى</TableHead>
                      <TableHead className="text-right">السعر</TableHead>
                      <TableHead className="text-right">عمولة</TableHead>
                      <TableHead className="text-right">ملاحظات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conversions.map((cv: any) => (
                      <TableRow key={cv.id}>
                        <TableCell className="font-mono text-sm">{cv.conversion_date}</TableCell>
                        <TableCell>
                          {(cv.from_currency as any)?.country_flag} {(cv.from_currency as any)?.symbol}{Number(cv.from_amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-bold text-primary">
                          {(cv.to_currency as any)?.country_flag} {(cv.to_currency as any)?.symbol}{Number(cv.to_amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono">{Number(cv.exchange_rate_used).toFixed(4)}</TableCell>
                        <TableCell>{Number(cv.commission_amount) > 0 ? `₪${Number(cv.commission_amount).toFixed(2)}` : '—'}</TableCell>
                        <TableCell className="text-muted-foreground text-xs max-w-32 truncate">{cv.notes || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Currencies List */}
        <TabsContent value="currencies" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">العملات المسجلة</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">العلم</TableHead>
                    <TableHead className="text-right">الرمز</TableHead>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">الرمز المالي</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currencies.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-2xl">{c.country_flag || '🏳️'}</TableCell>
                      <TableCell className="font-mono font-bold">{c.code}</TableCell>
                      <TableCell>{c.name_ar}</TableCell>
                      <TableCell className="text-lg">{c.symbol}</TableCell>
                      <TableCell>
                        {c.is_base ? (
                          <Badge className="bg-primary/10 text-primary border-0"><Star className="h-3 w-3 ml-1" />أساسية</Badge>
                        ) : (
                          <Badge variant="secondary">أجنبية</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {c.is_base ? (
                          <Badge variant="default">ثابتة</Badge>
                        ) : (
                          <Switch checked={c.is_active} onCheckedChange={checked => toggleCurrency.mutate({ id: c.id, is_active: checked })} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CurrencyManagementPage;
