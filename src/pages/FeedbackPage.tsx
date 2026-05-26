import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, PhoneOff, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface CustomerRow {
  id: string;
  display_phone: string;
  normalized_phone: string;
  full_name: string | null;
  last_known_branch_id: string | null;
  total_orders_cached: number | null;
  last_order_at_cached: string | null;
  do_not_call: boolean;
}

interface OrderRow {
  source: string;
  order_id: string;
  created_at: string;
  branch_id: string | null;
  total: number | null;
  status: string | null;
  items_summary: string | null;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("ar-EG", {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return s; }
}

export default function FeedbackPage() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearched(true);
    setSelected(null);
    setOrders([]);
    const { data, error } = await supabase.rpc("feedback_search_customers" as any, {
      p_query: q,
      p_limit: 30,
    });
    setSearching(false);
    if (error) {
      toast.error("تعذّر تنفيذ البحث: " + error.message);
      setResults([]);
      return;
    }
    setResults((data as any[]) || []);
  };

  const openCustomer = async (c: CustomerRow) => {
    setSelected(c);
    setOrders([]);
    setOrdersLoading(true);
    const { data, error } = await supabase.rpc("feedback_get_customer_orders" as any, {
      p_customer_id: c.id,
      p_limit: 50,
    });
    setOrdersLoading(false);
    if (error) {
      toast.error("تعذّر جلب طلبات الزبون: " + error.message);
      return;
    }
    setOrders((data as any[]) || []);
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">متابعة الزبائن</h1>
        <Badge variant="secondary">عرض فقط</Badge>
      </div>

      <Card>
        <CardContent className="p-4">
          <form
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => { e.preventDefault(); runSearch(); }}
          >
            <Input
              placeholder="رقم الجوال أو اسم الزبون"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
              autoFocus
            />
            <Button type="submit" disabled={searching || !query.trim()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="mr-2">بحث</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {selected ? (
        <CustomerDetail
          customer={selected}
          orders={orders}
          loading={ordersLoading}
          onBack={() => { setSelected(null); setOrders([]); }}
        />
      ) : (
        <ResultsList
          results={results}
          searched={searched}
          searching={searching}
          onSelect={openCustomer}
        />
      )}
    </div>
  );
}

function ResultsList({
  results, searched, searching, onSelect,
}: {
  results: CustomerRow[];
  searched: boolean;
  searching: boolean;
  onSelect: (c: CustomerRow) => void;
}) {
  if (searching) {
    return (
      <Card><CardContent className="p-8 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin ml-2" /> جارٍ البحث...
      </CardContent></Card>
    );
  }
  if (!searched) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        ابدأ بكتابة رقم جوال أو اسم زبون للبحث
      </CardContent></Card>
    );
  }
  if (results.length === 0) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        لا يوجد زبون بهذا الرقم أو الاسم بعد
      </CardContent></Card>
    );
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">نتائج البحث ({results.length})</CardTitle></CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم</TableHead>
              <TableHead>الهاتف</TableHead>
              <TableHead>عدد الطلبات</TableHead>
              <TableHead>آخر طلب</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((c) => (
              <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelect(c)}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {c.full_name || <span className="text-muted-foreground">بدون اسم</span>}
                    {c.do_not_call && (
                      <Badge variant="destructive" className="gap-1">
                        <PhoneOff className="h-3 w-3" /> لا يرغب بالاتصال
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell dir="ltr" className="text-right">{c.display_phone}</TableCell>
                <TableCell>{c.total_orders_cached ?? 0}</TableCell>
                <TableCell>{fmtDate(c.last_order_at_cached)}</TableCell>
                <TableCell><ArrowRight className="h-4 w-4 text-muted-foreground" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CustomerDetail({
  customer, orders, loading, onBack,
}: {
  customer: CustomerRow;
  orders: OrderRow[];
  loading: boolean;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>← العودة لنتائج البحث</Button>

      {customer.do_not_call && (
        <Alert variant="destructive">
          <PhoneOff className="h-4 w-4" />
          <AlertTitle>الزبون طلب عدم الاتصال</AlertTitle>
          <AlertDescription>الرجاء عدم الاتصال بهذا الزبون.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader><CardTitle>ملف الزبون</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Info label="الاسم" value={customer.full_name || "—"} />
          <Info label="الهاتف" value={<span dir="ltr">{customer.display_phone}</span>} />
          <Info label="آخر فرع" value={customer.last_known_branch_id || "—"} />
          <Info label="عدد الطلبات" value={String(customer.total_orders_cached ?? 0)} />
          <Info label="آخر طلب" value={fmtDate(customer.last_order_at_cached)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">طلبات الزبون</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-6 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin ml-2" /> جارٍ التحميل...
            </div>
          ) : orders.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">لا توجد طلبات مسجلة</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الفرع</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>البنود</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={`${o.source}-${o.order_id}`}>
                    <TableCell>{fmtDate(o.created_at)}</TableCell>
                    <TableCell>{o.branch_id || "—"}</TableCell>
                    <TableCell>{o.total ?? 0}</TableCell>
                    <TableCell><Badge variant="outline">{o.status || "—"}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate" title={o.items_summary || ""}>
                      {o.items_summary || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}