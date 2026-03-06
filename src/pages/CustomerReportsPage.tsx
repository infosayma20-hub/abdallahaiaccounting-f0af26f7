import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, Users, Star, BarChart3, TrendingUp, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

const CustomerReportsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase.rpc("get_team_owner_id", { _user_id: user.id }).then(({ data }) => {
      setDataOwnerId(data || user.id);
    });
  }, [user?.id]);

  useEffect(() => {
    if (!dataOwnerId) return;
    loadData();
  }, [dataOwnerId]);

  const loadData = async () => {
    setLoading(true);
    const [custRes, surveyRes] = await Promise.all([
      supabase.from("pos_customers").select("*").eq("user_id", dataOwnerId!).order("created_at", { ascending: false }),
      supabase.from("customer_surveys").select("*").eq("user_id", dataOwnerId!).eq("status", "completed"),
    ]);
    setCustomers(custRes.data || []);
    setSurveys(surveyRes.data || []);
    setLoading(false);
  };

  // Cashier ratings
  const cashierRatings = useMemo(() => {
    const map: Record<string, { name: string; ratings: number[]; service: number[]; recommends: number; total: number }> = {};
    surveys.forEach((s: any) => {
      const id = s.cashier_user_id || "unknown";
      if (!map[id]) map[id] = { name: id, ratings: [], service: [], recommends: 0, total: 0 };
      if (s.overall_rating) map[id].ratings.push(s.overall_rating);
      if (s.service_rating) map[id].service.push(s.service_rating);
      if (s.recommend) map[id].recommends++;
      map[id].total++;
    });
    return Object.values(map).map(c => ({
      name: c.name,
      avgRating: c.ratings.length ? (c.ratings.reduce((a, b) => a + b, 0) / c.ratings.length).toFixed(1) : "—",
      avgService: c.service.length ? (c.service.reduce((a, b) => a + b, 0) / c.service.length).toFixed(1) : "—",
      nps: c.total ? Math.round((c.recommends / c.total) * 100) : 0,
      count: c.total,
    }));
  }, [surveys]);

  // Demographics
  const genderData = useMemo(() => {
    const map: Record<string, number> = {};
    surveys.forEach((s: any) => { if (s.survey_gender) map[s.survey_gender] = (map[s.survey_gender] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [surveys]);

  const ageData = useMemo(() => {
    const map: Record<string, number> = {};
    surveys.forEach((s: any) => { if (s.survey_age_group) map[s.survey_age_group] = (map[s.survey_age_group] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [surveys]);

  const avgOverall = useMemo(() => {
    const ratings = surveys.filter((s: any) => s.overall_rating).map((s: any) => s.overall_rating);
    return ratings.length ? (ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length).toFixed(1) : "—";
  }, [surveys]);

  if (loading) return (
    <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  );

  return (
    <div className="space-y-4 pb-8" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-muted"><ArrowRight className="h-5 w-5" /></button>
          <div>
            <h1 className="text-lg font-bold">تقارير العملاء والاستبيانات</h1>
            <p className="text-xs text-muted-foreground">{customers.length} عميل | {surveys.length} استبيان</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={loadData}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <Users className="h-5 w-5 mx-auto text-blue-500 mb-1" />
          <p className="text-2xl font-bold">{customers.length}</p>
          <p className="text-xs text-muted-foreground">عميل مسجّل</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <BarChart3 className="h-5 w-5 mx-auto text-green-500 mb-1" />
          <p className="text-2xl font-bold">{surveys.length}</p>
          <p className="text-xs text-muted-foreground">استبيان مكتمل</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Star className="h-5 w-5 mx-auto text-yellow-500 mb-1" />
          <p className="text-2xl font-bold">{avgOverall}</p>
          <p className="text-xs text-muted-foreground">متوسط التقييم</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <TrendingUp className="h-5 w-5 mx-auto text-purple-500 mb-1" />
          <p className="text-2xl font-bold">
            {surveys.length ? Math.round(surveys.filter((s: any) => s.recommend).length / surveys.length * 100) : 0}%
          </p>
          <p className="text-xs text-muted-foreground">نسبة التوصية</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="demographics" dir="rtl">
        <TabsList className="w-full">
          <TabsTrigger value="demographics" className="flex-1 text-xs">الديموغرافيا</TabsTrigger>
          <TabsTrigger value="cashiers" className="flex-1 text-xs">تقييم الموظفين</TabsTrigger>
          <TabsTrigger value="customers" className="flex-1 text-xs">العملاء</TabsTrigger>
        </TabsList>

        <TabsContent value="demographics" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Gender chart */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">توزيع الجنس</CardTitle></CardHeader>
              <CardContent>
                {genderData.length > 0 ? (
                  <div className="h-[200px]" dir="ltr">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={genderData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {genderData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="text-center text-sm text-muted-foreground py-8">لا توجد بيانات</p>}
              </CardContent>
            </Card>

            {/* Age chart */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">الفئات العمرية</CardTitle></CardHeader>
              <CardContent>
                {ageData.length > 0 ? (
                  <div className="h-[200px]" dir="ltr">
                    <ResponsiveContainer>
                      <BarChart data={ageData}>
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="text-center text-sm text-muted-foreground py-8">لا توجد بيانات</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="cashiers" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {cashierRatings.length > 0 ? (
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/30">
                    <th className="text-right p-3 text-xs font-semibold text-muted-foreground">الموظف</th>
                    <th className="text-center p-3 text-xs font-semibold text-muted-foreground">التقييم</th>
                    <th className="text-center p-3 text-xs font-semibold text-muted-foreground">الخدمة</th>
                    <th className="text-center p-3 text-xs font-semibold text-muted-foreground">NPS</th>
                    <th className="text-center p-3 text-xs font-semibold text-muted-foreground">عدد</th>
                  </tr></thead>
                  <tbody>
                    {cashierRatings.map((c, i) => (
                      <tr key={i} className="border-b hover:bg-muted/20">
                        <td className="p-3 font-medium">{c.name.slice(0, 8)}...</td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center gap-1">
                            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" /> {c.avgRating}
                          </span>
                        </td>
                        <td className="p-3 text-center">{c.avgService}</td>
                        <td className="p-3 text-center">
                          <span className={`text-xs font-bold ${c.nps >= 70 ? "text-green-600" : c.nps >= 40 ? "text-yellow-600" : "text-red-600"}`}>
                            {c.nps}%
                          </span>
                        </td>
                        <td className="p-3 text-center text-muted-foreground">{c.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-center text-sm text-muted-foreground py-8">لا توجد بيانات استبيانات بعد</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {customers.length > 0 ? (
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card"><tr className="border-b bg-muted/30">
                      <th className="text-right p-3 text-xs font-semibold text-muted-foreground">العميل</th>
                      <th className="text-center p-3 text-xs font-semibold text-muted-foreground">الزيارات</th>
                      <th className="text-left p-3 text-xs font-semibold text-muted-foreground">الإنفاق</th>
                      <th className="text-left p-3 text-xs font-semibold text-muted-foreground">آخر زيارة</th>
                    </tr></thead>
                    <tbody>
                      {customers.map((c: any) => (
                        <tr key={c.id} className="border-b hover:bg-muted/20">
                          <td className="p-3">
                            <p className="font-medium">{c.name || "بدون اسم"}</p>
                            <p className="text-[11px] text-muted-foreground" dir="ltr">{c.whatsapp || c.email}</p>
                          </td>
                          <td className="p-3 text-center font-mono">{c.total_visits}</td>
                          <td className="p-3 text-left font-mono font-bold">₪{c.total_spent?.toFixed(0)}</td>
                          <td className="p-3 text-left text-xs text-muted-foreground">
                            {c.last_visit ? new Date(c.last_visit).toLocaleDateString("ar-PS") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-center text-sm text-muted-foreground py-8">لا يوجد عملاء مسجّلين بعد</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CustomerReportsPage;
