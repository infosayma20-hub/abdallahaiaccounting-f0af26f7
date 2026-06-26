import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSpartaContext } from "@/hooks/sparta/useSpartaContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, User, Phone, MapPin, DollarSign, FileText } from "lucide-react";
import { toast } from "sonner";

interface Customer {
  id: string;
  code: string | null;
  name: string;
  clinic_name: string | null;
  doctor_name: string | null;
  phone: string | null;
  city: string | null;
  credit_limit: number;
  balance: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  grand_total: number;
  balance_due: number;
  status: string;
}

export default function SpartaMobileCustomer() {
  const { companyId } = useSpartaContext();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  useEffect(() => {
    async function loadCustomers() {
      if (!companyId) return;
      try {
        setLoading(true);
        const { data, error } = await (supabase
          .from("sparta_customers") as any)
          .select("id, code, name, clinic_name, doctor_name, phone, city, credit_limit, balance")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name");

        if (error) throw error;
        setCustomers(data || []);
      } catch (err: any) {
        toast.error("خطأ في تحميل كشف العملاء: " + err.message);
      } finally {
        setLoading(false);
      }
    }
    loadCustomers();
  }, [companyId]);

  const loadInvoices = async (cust: Customer) => {
    try {
      setLoadingInvoices(true);
      setSelectedCust(cust);
      const { data, error } = await (supabase
        .from("sparta_invoices") as any)
        .select("id, invoice_number, invoice_date, grand_total, balance_due, status")
        .eq("customer_id", cust.id)
        .order("invoice_date", { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (err: any) {
      toast.error("خطأ في تحميل فواتير العميل: " + err.message);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const filtered = customers.filter((c) => {
    const term = q.toLowerCase().trim();
    if (!term) return true;
    return (
      c.name.toLowerCase().includes(term) ||
      (c.clinic_name || "").toLowerCase().includes(term) ||
      (c.doctor_name || "").toLowerCase().includes(term) ||
      (c.phone || "").toLowerCase().includes(term) ||
      (c.city || "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-8 flex flex-col" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {selectedCust ? (
            <button onClick={() => setSelectedCust(null)} className="p-1 hover:bg-muted rounded-full">
              <ArrowRight className="h-5 w-5" />
            </button>
          ) : (
            <Link to="/sparta/m" className="p-1 hover:bg-muted rounded-full">
              <ArrowRight className="h-5 w-5" />
            </Link>
          )}
          <h1 className="text-lg font-bold">
            {selectedCust ? "تفاصيل حساب العميل" : "كشف حساب العملاء"}
          </h1>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {!selectedCust ? (
          <>
            {/* Search Customers */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث بالاسم، العيادة، الجوال، المدينة..."
                className="pr-9"
              />
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-2">
                <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="text-xs text-muted-foreground">جاري تحميل قائمة العيادات...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 bg-card border rounded-2xl p-6">
                <User className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-sm font-semibold">لا يوجد عملاء مطابقين للبحث</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {filtered.map((c) => {
                  const limitExceeded = c.credit_limit > 0 && c.balance > c.credit_limit;
                  return (
                    <div
                      key={c.id}
                      onClick={() => loadInvoices(c)}
                      className="bg-card border rounded-xl p-4 space-y-3 cursor-pointer hover:bg-muted/10 transition-colors"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h3 className="font-bold text-sm text-foreground">{c.name}</h3>
                          {c.clinic_name && (
                            <p className="text-xs text-muted-foreground mt-0.5">{c.clinic_name}</p>
                          )}
                        </div>
                        <Badge variant={limitExceeded ? "destructive" : c.balance > 0 ? "secondary" : "outline"}>
                          ₪ {Number(c.balance).toFixed(2)}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-dashed">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{c.city || "غبر محدد"}</span>
                        </div>
                        {c.phone && (
                          <div className="flex items-center gap-1 font-mono" dir="ltr">
                            <Phone className="h-3 w-3" />
                            <span>{c.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* Customer Detail View */
          <div className="space-y-4">
            <div className="bg-card border rounded-2xl p-5 space-y-4 shadow-xs">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-primary block">العميل</span>
                <h2 className="text-lg font-bold">{selectedCust.name}</h2>
                {(selectedCust.clinic_name || selectedCust.doctor_name) && (
                  <p className="text-xs text-muted-foreground">
                    {[selectedCust.clinic_name, selectedCust.doctor_name].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                <div className="bg-muted/30 rounded-xl p-3 text-center">
                  <span className="text-[10px] text-muted-foreground block">الرصيد الجاري</span>
                  <strong className="text-lg font-bold text-foreground">₪ {Number(selectedCust.balance).toFixed(2)}</strong>
                </div>
                <div className="bg-muted/30 rounded-xl p-3 text-center">
                  <span className="text-[10px] text-muted-foreground block">حد الائتمان</span>
                  <strong className="text-lg font-bold text-muted-foreground">₪ {Number(selectedCust.credit_limit).toFixed(2)}</strong>
                </div>
              </div>

              <div className="flex justify-center pt-2">
                <Link to={`/sparta/m/sale?customer_id=${selectedCust.id}`} className="w-full">
                  <Button className="w-full font-bold">
                    <FileText className="h-4 w-4 ml-1.5" /> إنشاء فاتورة للعميل
                  </Button>
                </Link>
              </div>
            </div>

            {/* Invoices List */}
            <div className="space-y-3">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                <DollarSign className="h-4 w-4" /> سجل الفواتير والمستحقات
              </h3>

              {loadingInvoices ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-2">
                  <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <p className="text-xs text-muted-foreground">جاري تحميل الفواتير...</p>
                </div>
              ) : invoices.length === 0 ? (
                <div className="text-center py-8 bg-card border rounded-xl text-muted-foreground text-xs italic">
                  لا توجد فواتير سابقة لهذا العميل.
                </div>
              ) : (
                <div className="grid gap-2.5">
                  {invoices.map((inv) => (
                    <Link
                      key={inv.id}
                      to={`/sparta/invoices/${inv.id}`}
                      className="bg-card border rounded-xl p-3.5 flex items-center justify-between hover:bg-muted/10 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <strong className="text-xs font-bold font-mono">{inv.invoice_number}</strong>
                          <Badge variant={inv.status === "posted" ? "success" : inv.status === "draft" ? "outline" : "destructive"} className="text-[10px] py-0 px-1.5">
                            {inv.status === "posted" ? "معتمد" : inv.status === "draft" ? "مسودة" : "ملغى"}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground block">{inv.invoice_date}</span>
                      </div>
                      <div className="text-left">
                        <span className="text-xs font-bold block">₪ {Number(inv.grand_total).toFixed(2)}</span>
                        {inv.balance_due > 0 && (
                          <span className="text-[10px] text-red-500 font-semibold block">المتبقي: ₪ {Number(inv.balance_due).toFixed(2)}</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}