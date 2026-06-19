import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, Pencil, Phone, Mail, MapPin, Globe, Building2, FileText, CreditCard, BarChart3, History, AlertTriangle, CheckCircle, Clock, PieChart, Link2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import ReceivablesAnalysisTab from "@/components/contacts/ReceivablesAnalysisTab";
import { fetchContactBalance } from "@/lib/contact-balance";
import AllocationsPanel from "@/components/accounting/AllocationsPanel";

const classConfig: Record<string, { color: string; bg: string; label: string }> = {
  A: { color: "text-emerald-700", bg: "bg-emerald-100 dark:bg-emerald-900/40", label: "زبون مميز" },
  B: { color: "text-blue-700", bg: "bg-blue-100 dark:bg-blue-900/40", label: "زبون جيد" },
  C: { color: "text-amber-700", bg: "bg-amber-100 dark:bg-amber-900/40", label: "زبون عادي" },
  D: { color: "text-red-700", bg: "bg-red-100 dark:bg-red-900/40", label: "مخاطرة" },
};

const ContactDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contact, setContact] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [cheques, setCheques] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("invoices");
  // Phase 5G — Single Source of Truth: live balance from get_contact_balance.
  // Replaces all reads of `contact.current_balance` for display.
  const [liveBalance, setLiveBalance] = useState<number>(0);

  useEffect(() => {
    if (!user || !id) return;
    const fetchData = async () => {
      setLoading(true);
      // First get the contact to know the name
      const { data: contactData } = await supabase.from('contacts').select('*').eq('id', id).single();
      setContact(contactData);
      const contactName = (contactData as any)?.contact_name?.trim() || "";
      
      // Find all contact IDs with the same name (handle duplicates)
      const { data: sameNameContacts } = await supabase
        .from('contacts')
        .select('id')
        .eq("user_id", dataOwnerId!)
        .eq('contact_name', contactName);
      const allIds = (sameNameContacts || []).map((c: any) => c.id);
      if (!allIds.includes(id)) allIds.push(id);

      // Fetch transactions matching any of these IDs OR by name fallback
      const { data: txByIds } = await supabase
        .from('transactions')
        .select('*')
        .eq('is_deleted', false)
        .in('contact_id', allIds)
        .order('transaction_date', { ascending: false })
        .limit(500);
      
      // Also fetch transactions with no contact_id but matching name in description
      const { data: txByName } = await supabase
        .from('transactions')
        .select('*')
        .eq("user_id", dataOwnerId!)
        .eq('is_deleted', false)
        .is('contact_id', null)
        .ilike('description', `%${contactName}%`)
        .order('transaction_date', { ascending: false })
        .limit(200);
      
      const idSet = new Set((txByIds || []).map((t: any) => t.id));
      const merged = [...(txByIds || []), ...(txByName || []).filter((t: any) => !idSet.has(t.id))];
      setTransactions(merged);

      const { data: chequeData } = await supabase
        .from('cheques')
        .select('*')
        .eq("user_id", dataOwnerId!)
        .order('cheque_date', { ascending: false });
      setCheques((chequeData as any[]) || []);

      // Fetch authoritative balance from the ledger (same source as
      // AccountStatement). This must always match what the user sees there.
      if (id) {
        const bal = await fetchContactBalance(id);
        setLiveBalance(bal);
      }

      setLoading(false);
    };
    fetchData();
  }, [user, id]);

  const stats = useMemo(() => {
    if (!transactions.length) return { totalSales: 0, totalPaid: 0, balance: 0, invoiceCount: 0 };
    let totalSales = 0, totalPaid = 0, invoiceCount = 0;
    transactions.forEach(tx => {
      if (tx.transaction_type?.includes('sale') || tx.transaction_type?.includes('فاتورة')) {
        totalSales += tx.amount || 0;
        invoiceCount++;
      }
      if (tx.transaction_type?.includes('receipt') || tx.transaction_type?.includes('قبض')) {
        totalPaid += tx.amount || 0;
      }
    });
    return { totalSales, totalPaid, balance: totalSales - totalPaid, invoiceCount };
  }, [transactions]);

  const invoices = transactions.filter(tx => tx.transaction_type?.includes('sale') || tx.transaction_type?.includes('فاتورة') || tx.transaction_type?.includes('purchase'));
  const payments = transactions.filter(tx => tx.transaction_type?.includes('receipt') || tx.transaction_type?.includes('payment') || tx.transaction_type?.includes('قبض') || tx.transaction_type?.includes('صرف'));

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!contact) return <div className="text-center py-16 text-muted-foreground">جهة الاتصال غير موجودة</div>;

  const cls = classConfig[contact.contact_class || "C"] || classConfig.C;
  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    return parts.length >= 2 ? parts[0][0] + parts[1][0] : name[0] || "?";
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/contacts")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold">{contact.contact_name}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/account-statement?contact_id=${contact.id}&contact_name=${encodeURIComponent(contact.contact_name)}&contact_type=${encodeURIComponent(contact.contact_type)}`)}>
            <FileText className="h-4 w-4 ml-1" /> كشف حساب
          </Button>
        </div>
      </div>

      {/* Profile Card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold ${cls.bg} ${cls.color}`}>
              {getInitials(contact.contact_name)}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold">{contact.contact_name}</h2>
                <Badge className={`${cls.bg} ${cls.color} text-xs`}>[{contact.contact_class || "C"}] {cls.label}</Badge>
                <Badge variant="secondary" className="text-xs">
                  {contact.contact_type === "عميل" ? "زبون" : contact.contact_type}
                </Badge>
                {contact.is_active !== false && (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 text-xs">
                    <CheckCircle className="h-3 w-3 ml-1" /> نشط
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                {contact.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{contact.phone}</span>}
                {contact.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{contact.email}</span>}
                {contact.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{contact.address}</span>}
                {contact.website && <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{contact.website}</span>}
                {contact.industry && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{contact.industry}</span>}
              </div>
              {contact.tax_number && (
                <p className="text-xs text-muted-foreground">رقم ضريبي: {contact.tax_number}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">إجمالي المبيعات</p>
            <p className="text-base font-bold tabular-nums">₪{stats.totalSales.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">مدفوع</p>
            <p className="text-base font-bold tabular-nums text-emerald-600">₪{stats.totalPaid.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">متبقي الدين</p>
            <p className={`text-base font-bold tabular-nums ${stats.balance > 0 ? 'text-red-600' : 'text-foreground'}`}>₪{stats.balance.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">سقف الائتمان</p>
            <p className="text-base font-bold tabular-nums">₪{(contact.credit_limit || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">المتأخر</p>
            <p className={`text-base font-bold tabular-nums ${(contact.overdue_amount || 0) > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
              ₪{(contact.overdue_amount || 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-muted-foreground mb-0.5">مدة السداد</p>
          <p className="font-semibold">{contact.payment_terms_days || 30} يوم</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-muted-foreground mb-0.5">متوسط أيام الدفع</p>
          <p className="font-semibold">{contact.avg_payment_days || 0} يوم</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-muted-foreground mb-0.5">خصم الدفع المبكر</p>
          <p className="font-semibold">{contact.early_pay_discount || 0}%</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-muted-foreground mb-0.5">عدد الفواتير</p>
          <p className="font-semibold">{stats.invoiceCount}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-6">
          <TabsTrigger value="invoices" className="gap-1 text-xs"><FileText className="h-3.5 w-3.5" /> الفواتير</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1 text-xs"><CreditCard className="h-3.5 w-3.5" /> المدفوعات</TabsTrigger>
          <TabsTrigger value="allocations" className="gap-1 text-xs"><Link2 className="h-3.5 w-3.5" /> التخصيصات</TabsTrigger>
          <TabsTrigger value="receivables" className="gap-1 text-xs"><PieChart className="h-3.5 w-3.5" /> تحليل الذمم</TabsTrigger>
          <TabsTrigger value="analysis" className="gap-1 text-xs"><BarChart3 className="h-3.5 w-3.5" /> التحليل</TabsTrigger>
          <TabsTrigger value="history" className="gap-1 text-xs"><History className="h-3.5 w-3.5" /> السجل</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="p-3 text-right font-semibold">المرجع</th>
                      <th className="p-3 text-right font-semibold">التاريخ</th>
                      <th className="p-3 text-right font-semibold">الوصف</th>
                      <th className="p-3 text-right font-semibold">المبلغ</th>
                      <th className="p-3 text-right font-semibold">العملة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد فواتير</td></tr>
                    ) : invoices.map(tx => (
                      <tr key={tx.id} className="border-b hover:bg-muted/20">
                        <td className="p-3 text-xs font-mono">{tx.reference || "—"}</td>
                        <td className="p-3 text-xs tabular-nums">{new Date(tx.transaction_date).toLocaleDateString('en-GB')}</td>
                        <td className="p-3 text-xs">{tx.description}</td>
                        <td className="p-3 text-xs font-semibold tabular-nums">₪{(tx.amount || 0).toLocaleString()}</td>
                        <td className="p-3 text-xs">{tx.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="p-3 text-right font-semibold">المرجع</th>
                      <th className="p-3 text-right font-semibold">التاريخ</th>
                      <th className="p-3 text-right font-semibold">الوصف</th>
                      <th className="p-3 text-right font-semibold">المبلغ</th>
                      <th className="p-3 text-right font-semibold">الطريقة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد مدفوعات</td></tr>
                    ) : payments.map(tx => (
                      <tr key={tx.id} className="border-b hover:bg-muted/20">
                        <td className="p-3 text-xs font-mono">{tx.reference || "—"}</td>
                        <td className="p-3 text-xs tabular-nums">{new Date(tx.transaction_date).toLocaleDateString('en-GB')}</td>
                        <td className="p-3 text-xs">{tx.description}</td>
                        <td className="p-3 text-xs font-semibold tabular-nums text-emerald-600">₪{(tx.amount || 0).toLocaleString()}</td>
                        <td className="p-3 text-xs">{tx.payment_method || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receivables">
          <ReceivablesAnalysisTab contact={contact} transactions={transactions} cheques={cheques} />
        </TabsContent>

        <TabsContent value="allocations">
          <AllocationsPanel contactId={contact.id} contactName={contact.contact_name} />
        </TabsContent>

        <TabsContent value="analysis">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">ملخص مالي</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">إجمالي المبيعات</span><span className="font-semibold tabular-nums">₪{stats.totalSales.toLocaleString()}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">إجمالي المدفوع</span><span className="font-semibold tabular-nums text-emerald-600">₪{stats.totalPaid.toLocaleString()}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">الرصيد المتبقي</span><span className={`font-semibold tabular-nums ${stats.balance > 0 ? 'text-red-600' : ''}`}>₪{stats.balance.toLocaleString()}</span></div>
                <div className="h-px bg-border" />
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">نسبة التحصيل</span><span className="font-semibold">{stats.totalSales > 0 ? Math.round((stats.totalPaid / stats.totalSales) * 100) : 0}%</span></div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stats.totalSales > 0 ? Math.min((stats.totalPaid / stats.totalSales) * 100, 100) : 0}%` }} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">معلومات الائتمان</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">سقف الائتمان</span><span className="font-semibold tabular-nums">₪{(contact.credit_limit || 0).toLocaleString()}</span></div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">الرصيد الحالي <span className="text-[9px] opacity-60">(حسب كشف الحساب)</span></span>
                  <span className="font-semibold tabular-nums">₪{liveBalance.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">المتاح</span><span className="font-semibold tabular-nums text-emerald-600">₪{Math.max(0, (contact.credit_limit || 0) - liveBalance).toLocaleString()}</span></div>
                {contact.credit_limit > 0 && (
                  <>
                    <div className="h-px bg-border" />
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${(liveBalance / contact.credit_limit) > 1 ? 'bg-red-500' : (liveBalance / contact.credit_limit) > 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min((liveBalance / contact.credit_limit) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center">
                      {Math.round((liveBalance / contact.credit_limit) * 100)}% مستخدم
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="p-3 text-right font-semibold">التاريخ</th>
                      <th className="p-3 text-right font-semibold">النوع</th>
                      <th className="p-3 text-right font-semibold">الوصف</th>
                      <th className="p-3 text-right font-semibold">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">لا توجد حركات</td></tr>
                    ) : transactions.slice(0, 50).map(tx => (
                      <tr key={tx.id} className="border-b hover:bg-muted/20">
                        <td className="p-3 text-xs tabular-nums">{new Date(tx.transaction_date).toLocaleDateString('en-GB')}</td>
                        <td className="p-3"><Badge variant="secondary" className="text-[10px]">{tx.transaction_type}</Badge></td>
                        <td className="p-3 text-xs">{tx.description}</td>
                        <td className="p-3 text-xs font-semibold tabular-nums">₪{(tx.amount || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ContactDetailPage;
