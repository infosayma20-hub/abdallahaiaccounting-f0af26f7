import { useState } from "react";
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
  Plus, TrendingUp, TrendingDown, ArrowLeftRight, Calendar,
  DollarSign, History, Settings, Trash2, Edit, Star
} from "lucide-react";
import { format } from "date-fns";

const DEFAULT_CURRENCIES = [
  { code: "ILS", name_ar: "شيكل إسرائيلي", name_en: "Israeli Shekel", symbol: "₪", is_base: true },
  { code: "USD", name_ar: "دولار أمريكي", name_en: "US Dollar", symbol: "$", is_base: false },
  { code: "JOD", name_ar: "دينار أردني", name_en: "Jordanian Dinar", symbol: "د.أ", is_base: false },
  { code: "EUR", name_ar: "يورو", name_en: "Euro", symbol: "€", is_base: false },
  { code: "EGP", name_ar: "جنيه مصري", name_en: "Egyptian Pound", symbol: "ج.م", is_base: false },
];

const CurrencyManagementPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAddCurrency, setShowAddCurrency] = useState(false);
  const [showAddRate, setShowAddRate] = useState(false);
  const [newCurrency, setNewCurrency] = useState({ code: "", name_ar: "", name_en: "", symbol: "" });
  const [newRate, setNewRate] = useState({ currency_id: "", rate_date: format(new Date(), "yyyy-MM-dd"), buy_rate: "", sell_rate: "", notes: "" });

  // Fetch currencies
  const { data: currencies = [], isLoading: loadingCurrencies } = useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("currencies")
        .select("*")
        .order("is_base", { ascending: false })
        .order("code");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch exchange rates
  const { data: rates = [], isLoading: loadingRates } = useQuery({
    queryKey: ["exchange_rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exchange_rates")
        .select("*, currencies(code, name_ar, symbol)")
        .order("rate_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Get latest rate per currency
  const latestRates = currencies.filter(c => !c.is_base).map(currency => {
    const rate = rates.find((r: any) => r.currency_id === currency.id);
    return { ...currency, latestRate: rate };
  });

  // Initialize default currencies
  const initMutation = useMutation({
    mutationFn: async () => {
      const inserts = DEFAULT_CURRENCIES.map(c => ({
        ...c,
        user_id: user!.id,
      }));
      const { error } = await supabase.from("currencies").upsert(inserts, { onConflict: "user_id,code" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currencies"] });
      toast.success("تم تهيئة العملات بنجاح");
    },
  });

  // Add currency
  const addCurrencyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("currencies").insert({
        ...newCurrency,
        user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["currencies"] });
      setShowAddCurrency(false);
      setNewCurrency({ code: "", name_ar: "", name_en: "", symbol: "" });
      toast.success("تمت إضافة العملة");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Add exchange rate
  const addRateMutation = useMutation({
    mutationFn: async () => {
      const buy = parseFloat(newRate.buy_rate);
      const sell = parseFloat(newRate.sell_rate);
      const { error } = await supabase.from("exchange_rates").upsert({
        currency_id: newRate.currency_id,
        rate_date: newRate.rate_date,
        buy_rate: buy,
        sell_rate: sell,
        mid_rate: (buy + sell) / 2,
        notes: newRate.notes || null,
        user_id: user!.id,
      }, { onConflict: "user_id,currency_id,rate_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exchange_rates"] });
      setShowAddRate(false);
      setNewRate({ currency_id: "", rate_date: format(new Date(), "yyyy-MM-dd"), buy_rate: "", sell_rate: "", notes: "" });
      toast.success("تم حفظ سعر الصرف");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Toggle currency active
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

  const foreignCurrencies = currencies.filter(c => !c.is_base);

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-primary" />
            إدارة العملات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">العملة الأساسية: شيكل إسرائيلي (₪ ILS)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {currencies.length === 0 && (
            <Button onClick={() => initMutation.mutate()} disabled={initMutation.isPending}>
              <Settings className="h-4 w-4 ml-2" />
              تهيئة العملات الافتراضية
            </Button>
          )}
          <Dialog open={showAddRate} onOpenChange={setShowAddRate}>
            <DialogTrigger asChild>
              <Button variant="default" disabled={foreignCurrencies.length === 0}>
                <TrendingUp className="h-4 w-4 ml-2" />
                إضافة سعر صرف
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>إضافة سعر صرف جديد</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label>العملة</Label>
                  <Select value={newRate.currency_id} onValueChange={(v) => setNewRate(p => ({ ...p, currency_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="اختر العملة" /></SelectTrigger>
                    <SelectContent>
                      {foreignCurrencies.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.symbol} {c.name_ar} ({c.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>التاريخ</Label>
                  <Input type="date" value={newRate.rate_date} onChange={e => setNewRate(p => ({ ...p, rate_date: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>سعر الشراء (₪)</Label>
                    <Input type="number" step="0.0001" placeholder="مثال: 3.65" value={newRate.buy_rate} onChange={e => setNewRate(p => ({ ...p, buy_rate: e.target.value }))} />
                  </div>
                  <div>
                    <Label>سعر البيع (₪)</Label>
                    <Input type="number" step="0.0001" placeholder="مثال: 3.70" value={newRate.sell_rate} onChange={e => setNewRate(p => ({ ...p, sell_rate: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>ملاحظات</Label>
                  <Input value={newRate.notes} onChange={e => setNewRate(p => ({ ...p, notes: e.target.value }))} placeholder="اختياري" />
                </div>
                <Button
                  onClick={() => addRateMutation.mutate()}
                  disabled={!newRate.currency_id || !newRate.buy_rate || !newRate.sell_rate || addRateMutation.isPending}
                  className="w-full"
                >
                  حفظ سعر الصرف
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showAddCurrency} onOpenChange={setShowAddCurrency}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 ml-2" />
                عملة جديدة
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>إضافة عملة جديدة</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>الرمز (مثل USD)</Label>
                    <Input value={newCurrency.code} onChange={e => setNewCurrency(p => ({ ...p, code: e.target.value.toUpperCase() }))} maxLength={5} />
                  </div>
                  <div>
                    <Label>الرمز المالي ($)</Label>
                    <Input value={newCurrency.symbol} onChange={e => setNewCurrency(p => ({ ...p, symbol: e.target.value }))} maxLength={5} />
                  </div>
                </div>
                <div>
                  <Label>الاسم بالعربية</Label>
                  <Input value={newCurrency.name_ar} onChange={e => setNewCurrency(p => ({ ...p, name_ar: e.target.value }))} />
                </div>
                <div>
                  <Label>الاسم بالإنجليزية</Label>
                  <Input value={newCurrency.name_en} onChange={e => setNewCurrency(p => ({ ...p, name_en: e.target.value }))} />
                </div>
                <Button
                  onClick={() => addCurrencyMutation.mutate()}
                  disabled={!newCurrency.code || !newCurrency.name_ar || !newCurrency.symbol || addCurrencyMutation.isPending}
                  className="w-full"
                >
                  إضافة
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Rate Cards */}
      {latestRates.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {latestRates.map(c => (
            <Card key={c.id} className={`${c.is_active ? '' : 'opacity-50'}`}>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold mb-1">{c.symbol}</div>
                <div className="text-sm font-medium text-foreground">{c.code}</div>
                <div className="text-xs text-muted-foreground mb-2">{c.name_ar}</div>
                {c.latestRate ? (
                  <>
                    <div className="text-lg font-bold text-primary">
                      ₪{Number(c.latestRate.mid_rate).toFixed(4)}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>شراء: {Number(c.latestRate.buy_rate).toFixed(4)}</span>
                      <span>بيع: {Number(c.latestRate.sell_rate).toFixed(4)}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {c.latestRate.rate_date}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-destructive mt-2">لا يوجد سعر صرف</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="currencies" dir="rtl">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="currencies">
            <DollarSign className="h-4 w-4 ml-1" />
            العملات
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 ml-1" />
            سجل الأسعار
          </TabsTrigger>
        </TabsList>

        <TabsContent value="currencies" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">العملات المسجلة</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCurrencies ? (
                <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
              ) : currencies.length === 0 ? (
                <div className="text-center py-12">
                  <ArrowLeftRight className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground mb-4">لم يتم تهيئة العملات بعد</p>
                  <Button onClick={() => initMutation.mutate()} disabled={initMutation.isPending}>
                    تهيئة العملات الافتراضية (ILS, USD, JOD, EUR, EGP)
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
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
                        <TableCell className="font-mono font-bold">{c.code}</TableCell>
                        <TableCell>{c.name_ar}</TableCell>
                        <TableCell className="text-lg">{c.symbol}</TableCell>
                        <TableCell>
                          {c.is_base ? (
                            <Badge className="bg-primary/10 text-primary border-0">
                              <Star className="h-3 w-3 ml-1" />
                              أساسية
                            </Badge>
                          ) : (
                            <Badge variant="secondary">أجنبية</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {c.is_base ? (
                            <Badge variant="default">ثابتة</Badge>
                          ) : (
                            <Switch
                              checked={c.is_active}
                              onCheckedChange={(checked) => toggleCurrency.mutate({ id: c.id, is_active: checked })}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">سجل أسعار الصرف</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRates ? (
                <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
              ) : rates.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">لا توجد أسعار صرف مسجلة</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">العملة</TableHead>
                      <TableHead className="text-right">سعر الشراء</TableHead>
                      <TableHead className="text-right">سعر البيع</TableHead>
                      <TableHead className="text-right">المتوسط</TableHead>
                      <TableHead className="text-right">المصدر</TableHead>
                      <TableHead className="text-center">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rates.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-sm">{r.rate_date}</TableCell>
                        <TableCell>
                          <span className="font-bold">{(r.currencies as any)?.symbol}</span>{" "}
                          {(r.currencies as any)?.code}
                        </TableCell>
                        <TableCell>₪{Number(r.buy_rate).toFixed(4)}</TableCell>
                        <TableCell>₪{Number(r.sell_rate).toFixed(4)}</TableCell>
                        <TableCell className="font-bold">₪{Number(r.mid_rate).toFixed(4)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{r.source === "manual" ? "يدوي" : r.source}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteRate.mutate(r.id)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CurrencyManagementPage;
