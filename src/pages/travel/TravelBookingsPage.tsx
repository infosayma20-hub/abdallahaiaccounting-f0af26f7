import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Eye, Edit, Trash2, Printer, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const SERVICE_LABELS: Record<string, string> = {
  hajj: "🕋 حج", umrah: "🕌 عمرة", flight: "✈️ طيران", hotel: "🏨 فنادق",
  visa: "📋 تأشيرة", tourism_package: "🌍 باقة", honeymoon: "💍 شهر عسل",
  transport: "🚌 نقل", insurance: "🛡️ تأمين", package: "📦 باقة", transfer: "🚐 ترانسفير",
};

const STATUS_MAP: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" | "outline" }> = {
  draft: { label: "مسودة", variant: "outline" }, confirmed: { label: "مؤكد", variant: "default" },
  in_progress: { label: "قيد التنفيذ", variant: "warning" }, completed: { label: "مكتمل", variant: "success" },
  cancelled: { label: "ملغى", variant: "destructive" }, issued: { label: "صدرت", variant: "success" },
};

const PAY_MAP: Record<string, { label: string; variant: "success" | "warning" | "outline" | "destructive" }> = {
  paid: { label: "مدفوع", variant: "success" }, partial: { label: "جزئي", variant: "warning" },
  unpaid: { label: "غير مدفوع", variant: "outline" }, refunded: { label: "مسترد", variant: "destructive" },
};

const PAGE_SIZE = 20;

export default function TravelBookingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [payFilter, setPayFilter] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => { if (user) fetchBookings(); }, [user]);

  const fetchBookings = async () => {
    const { data } = await supabase.from("travel_bookings").select("*").order("created_at", { ascending: false });
    if (data) setBookings(data);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل تريد حذف هذا الحجز؟")) return;
    await supabase.from("travel_bookings").delete().eq("id", id);
    toast({ title: "تم حذف الحجز" });
    fetchBookings();
  };

  const filtered = bookings.filter(b => {
    if (search && !b.booking_number?.toLowerCase().includes(search.toLowerCase()) && !b.customer_name?.toLowerCase().includes(search.toLowerCase()) && !b.destination?.toLowerCase().includes(search.toLowerCase())) return false;
    if (serviceFilter !== "all" && b.service_type !== serviceFilter) return false;
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (payFilter !== "all" && b.payment_status !== payFilter) return false;
    return true;
  });

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, serviceFilter, statusFilter, payFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Summary stats
  const totalSales = filtered.reduce((s, b) => s + (b.selling_price || 0), 0);
  const totalCosts = filtered.reduce((s, b) => s + (b.cost_price_ils || 0), 0);
  const totalProfit = totalSales - totalCosts;
  const totalPaid = filtered.reduce((s, b) => s + (b.amount_paid || 0), 0);
  const totalPending = totalSales - totalPaid;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold" style={{ color: "#0D1B2E" }}>✈️ الحجوزات</h1>
        <Button onClick={() => navigate("/travel/bookings/new")} className="text-white" style={{ background: "#C9A84C" }}>
          <Plus className="w-4 h-4 ml-1" /> حجز جديد
        </Button>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3 text-center"><p className="text-xs text-muted-foreground">عدد الحجوزات</p><p className="text-xl font-bold">{filtered.length}</p></Card>
        <Card className="p-3 text-center"><p className="text-xs text-muted-foreground">إجمالي المبيعات</p><p className="text-xl font-bold">₪{totalSales.toLocaleString()}</p></Card>
        <Card className="p-3 text-center"><p className="text-xs text-muted-foreground">إجمالي التكاليف</p><p className="text-xl font-bold">₪{totalCosts.toLocaleString()}</p></Card>
        <Card className="p-3 text-center"><p className="text-xs text-muted-foreground">إجمالي الأرباح</p><p className="text-xl font-bold" style={{ color: "#16A34A" }}>₪{totalProfit.toLocaleString()}</p></Card>
        <Card className="p-3 text-center"><p className="text-xs text-muted-foreground">مبالغ معلقة</p><p className="text-xl font-bold" style={{ color: totalPending > 0 ? "#DC2626" : "#16A34A" }}>₪{totalPending.toLocaleString()}</p></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث بالرقم، العميل، الوجهة..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="الخدمة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الخدمات</SelectItem>
            {Object.entries(SERVICE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={payFilter} onValueChange={setPayFilter}>
          <SelectTrigger className="w-32"><SelectValue placeholder="الدفع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {Object.entries(PAY_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground text-xs">
              <th className="text-right py-3 px-3">رقم الحجز</th>
              <th className="text-right py-3 px-2">العميل</th>
              <th className="text-right py-3 px-2">الخدمة</th>
              <th className="text-right py-3 px-2">الوجهة</th>
              <th className="text-right py-3 px-2">تاريخ السفر</th>
              <th className="text-right py-3 px-2">سعر البيع</th>
              <th className="text-right py-3 px-2">المدفوع</th>
              <th className="text-right py-3 px-2">المتبقي</th>
              <th className="text-right py-3 px-2">الربح</th>
              <th className="text-right py-3 px-2">الحالة</th>
              <th className="text-right py-3 px-2">الدفع</th>
              <th className="py-3 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {paged.map(b => {
              const profit = (b.selling_price || 0) - (b.cost_price_ils || 0);
              const balance = (b.selling_price || 0) - (b.amount_paid || 0);
              const st = STATUS_MAP[b.status] || STATUS_MAP.confirmed;
              const pay = PAY_MAP[b.payment_status] || PAY_MAP.unpaid;
              return (
                <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2.5 px-3 font-mono text-xs">{b.booking_number}</td>
                  <td className="py-2.5 px-2">{b.customer_name || "—"}</td>
                  <td className="py-2.5 px-2 text-xs">{SERVICE_LABELS[b.service_type] || b.service_type}</td>
                  <td className="py-2.5 px-2">{b.destination || "—"}</td>
                  <td className="py-2.5 px-2 text-xs">{b.travel_date || "—"}</td>
                  <td className="py-2.5 px-2 font-medium">₪{(b.selling_price || 0).toLocaleString()}</td>
                  <td className="py-2.5 px-2">₪{(b.amount_paid || 0).toLocaleString()}</td>
                  <td className="py-2.5 px-2" style={{ color: balance > 0 ? "#DC2626" : "#16A34A" }}>₪{balance.toLocaleString()}</td>
                  <td className="py-2.5 px-2" style={{ color: profit >= 0 ? "#16A34A" : "#DC2626" }}>₪{profit.toLocaleString()}</td>
                  <td className="py-2.5 px-2"><Badge variant={st.variant as any} className="text-[10px]">{st.label}</Badge></td>
                  <td className="py-2.5 px-2"><Badge variant={pay.variant as any} className="text-[10px]">{pay.label}</Badge></td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/travel/bookings/${b.id}`)}><Eye className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/travel/bookings/${b.id}/edit`)}><Edit className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/travel/bookings/${b.id}/print`)}><Printer className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(b.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">لا توجد حجوزات</p>}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? "default" : "outline"}
                  size="sm"
                  className="w-8 h-8 p-0"
                  style={page === pageNum ? { background: "#0D1B2E" } : {}}
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground mr-2">
            صفحة {page} من {totalPages} ({filtered.length} حجز)
          </span>
        </div>
      )}
    </div>
  );
}
