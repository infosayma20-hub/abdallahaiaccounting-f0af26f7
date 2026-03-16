import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Download, Filter, ExternalLink, Trash2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/hr-utils";
import BackButton from "@/components/BackButton";
import * as XLSX from "xlsx";

const DEDUCTION_SOURCES = ["الكل", "سند صرف", "نقطة البيع", "خصم يدوي", "سلفة", "قرض حسن"] as const;

export default function HRDeductionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("الكل");
  const [typeFilter, setTypeFilter] = useState("الكل");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Fetch employees
  const { data: employees = [] } = useQuery({
    queryKey: ["hr-employees", user?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("employees")
        .select("id, full_name, department, branch")
        .eq("user_id", user!.id)
        .eq("status", "active");
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  // Fetch manual deductions
  const { data: manualDeductions = [], refetch: refetchDeductions } = useQuery({
    queryKey: ["hr-all-deductions", user?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("employee_deductions")
        .select("*, employees(full_name, department, branch)")
        .eq("user_id", user!.id)
        .order("deduction_date", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  // Fetch payment vouchers linked to employees (employee_id not null)
  const { data: paymentVouchers = [] } = useQuery({
    queryKey: ["hr-payment-vouchers", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("receipt_vouchers")
        .select("*")
        .eq("user_id", user!.id)
        .eq("voucher_type", "payment")
        .not("employee_id", "is", null)
        .neq("status", "cancelled")
        .order("voucher_date", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  // Fetch advances
  const { data: advances = [] } = useQuery({
    queryKey: ["hr-advances-deductions", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_advances")
        .select("*, employees(full_name, department, branch)")
        .eq("user_id", user!.id)
        .in("status", ["approved", "partially_paid"])
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  // Fetch POS employee-account transactions
  const { data: posTransactions = [] } = useQuery({
    queryKey: ["hr-pos-employee-txns", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("pos_invoices")
        .select("*")
        .eq("user_id", user!.id)
        .eq("payment_method", "حساب موظف")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  // Build employee name map
  const empMap = useMemo(() => {
    const m: Record<string, { name: string; dept: string; branch: string }> = {};
    employees.forEach(e => { m[e.id] = { name: e.full_name, dept: e.department || "", branch: e.branch || "" }; });
    return m;
  }, [employees]);

  // Unify all deduction rows
  const allRows = useMemo(() => {
    const rows: {
      id: string;
      employeeName: string;
      employeeDept: string;
      employeeBranch: string;
      type: string;
      description: string;
      amount: number;
      date: string;
      source: string;
      sourceId: string | null;
      status: string;
    }[] = [];

    // Manual deductions
    manualDeductions.forEach(d => {
      rows.push({
        id: d.id,
        employeeName: d.employees?.full_name || "—",
        employeeDept: d.employees?.department || "",
        employeeBranch: d.employees?.branch || "",
        type: d.deduction_type || "أخرى",
        description: d.description || "",
        amount: Number(d.amount),
        date: d.deduction_date || d.created_at?.split("T")[0] || "",
        source: "خصم يدوي",
        sourceId: null,
        status: d.status || "معتمد للخصم",
      });
    });

    // Payment vouchers
    paymentVouchers.forEach(v => {
      const emp = empMap[v.employee_id] || { name: v.contact_name || "—", dept: "", branch: "" };
      rows.push({
        id: `pv-${v.id}`,
        employeeName: emp.name,
        employeeDept: emp.dept,
        employeeBranch: emp.branch,
        type: v.employee_deduction_type || "سند صرف",
        description: v.description || v.notes || "",
        amount: Number(v.amount),
        date: v.voucher_date || v.created_at?.split("T")[0] || "",
        source: "سند صرف",
        sourceId: v.id,
        status: v.status === "posted" ? "مرحّل" : "مسودة",
      });
    });

    // POS employee-account
    posTransactions.forEach(p => {
      const empName = p.employee_name || p.customer_name || "—";
      rows.push({
        id: `pos-${p.id}`,
        employeeName: empName,
        employeeDept: "",
        employeeBranch: "",
        type: "أكل / POS",
        description: `فاتورة POS #${p.invoice_number || ""}`,
        amount: Number(p.total || p.grand_total || 0),
        date: p.created_at?.split("T")[0] || "",
        source: "نقطة البيع",
        sourceId: p.id,
        status: "مرحّل",
      });
    });

    // Advances
    advances.forEach(a => {
      const emp = a.employees || {};
      rows.push({
        id: `adv-${a.id}`,
        employeeName: emp.full_name || "—",
        employeeDept: emp.department || "",
        employeeBranch: emp.branch || "",
        type: a.advance_type === "قرض_حسن" ? "قرض حسن" : "سلفة",
        description: a.reason || "",
        amount: Number(a.amount),
        date: a.created_at?.split("T")[0] || "",
        source: a.advance_type === "قرض_حسن" ? "قرض حسن" : "سلفة",
        sourceId: a.id,
        status: a.status === "approved" ? "نشط" : a.status,
      });
    });

    return rows;
  }, [manualDeductions, paymentVouchers, posTransactions, advances, empMap]);

  // Unique types for filter
  const uniqueTypes = useMemo(() => {
    const s = new Set(allRows.map(r => r.type));
    return ["الكل", ...Array.from(s)];
  }, [allRows]);

  // Filter
  const filtered = useMemo(() => {
    return allRows.filter(r => {
      if (search && !r.employeeName.includes(search) && !r.description.includes(search) && !r.type.includes(search)) return false;
      if (sourceFilter !== "الكل" && r.source !== sourceFilter) return false;
      if (typeFilter !== "الكل" && r.type !== typeFilter) return false;
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      return true;
    });
  }, [allRows, search, sourceFilter, typeFilter, dateFrom, dateTo]);

  const totalAmount = filtered.reduce((s, r) => s + r.amount, 0);

  const handleNavigateToSource = (row: typeof allRows[0]) => {
    if (row.source === "سند صرف" && row.sourceId) {
      navigate(`/finance/payments?edit=${row.sourceId}`);
    } else if (row.source === "نقطة البيع") {
      navigate(`/pos-reports`);
    } else if (row.source === "سلفة" || row.source === "قرض حسن") {
      navigate(`/loans`);
    }
  };

  const handleDelete = async (row: typeof allRows[0]) => {
    if (row.source !== "خصم يدوي") {
      toast.error("لا يمكن حذف سجل من مصدر خارجي. يرجى الذهاب للمصدر الأصلي.");
      return;
    }
    const { error } = await supabase.from("employee_deductions").delete().eq("id", row.id);
    if (error) toast.error("خطأ في الحذف");
    else { toast.success("تم الحذف"); refetchDeductions(); }
  };

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
      "الموظف": r.employeeName,
      "الفرع": r.employeeBranch,
      "النوع": r.type,
      "المصدر": r.source,
      "الوصف": r.description,
      "المبلغ": r.amount,
      "التاريخ": r.date,
      "الحالة": r.status,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الخصومات");
    XLSX.writeFile(wb, "hr-deductions.xlsx");
  };

  const statusBadge = (status: string) => {
    if (status === "مرحّل" || status === "تم الاستقطاع") return <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{status}</Badge>;
    if (status === "معتمد للخصم" || status === "نشط") return <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{status}</Badge>;
    if (status === "ملغى") return <Badge variant="destructive" className="text-[10px]">{status}</Badge>;
    return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-foreground">الخصومات والمسحوبات</h1>
            <p className="text-sm text-muted-foreground">جميع خصومات الموظفين من سندات الصرف، نقطة البيع، السلف، والخصومات اليدوية</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={handleExport} className="gap-1">
          <Download className="h-3.5 w-3.5" /> تصدير Excel
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">إجمالي الخصومات</p>
          <p className="text-lg font-bold text-destructive">{formatCurrency(totalAmount)}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">عدد السجلات</p>
          <p className="text-lg font-bold text-foreground">{filtered.length}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">سندات الصرف</p>
          <p className="text-lg font-bold text-foreground">{allRows.filter(r => r.source === "سند صرف").length}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">نقطة البيع</p>
          <p className="text-lg font-bold text-foreground">{allRows.filter(r => r.source === "نقطة البيع").length}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث بالاسم أو الوصف..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[140px]"><Filter className="h-3 w-3 ml-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            {DEDUCTION_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="النوع" /></SelectTrigger>
          <SelectContent>
            {uniqueTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-[130px] text-xs" />
          <span className="text-xs text-muted-foreground">إلى</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-[130px] text-xs" />
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">الموظف</TableHead>
            <TableHead className="text-right">الفرع</TableHead>
            <TableHead className="text-right">النوع</TableHead>
            <TableHead className="text-right">المصدر</TableHead>
            <TableHead className="text-right">الوصف</TableHead>
            <TableHead className="text-right">المبلغ</TableHead>
            <TableHead className="text-right">التاريخ</TableHead>
            <TableHead className="text-right">الحالة</TableHead>
            <TableHead className="text-right w-[80px]">إجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground py-8">لا توجد خصومات مسجلة</TableCell>
            </TableRow>
          ) : (
            filtered.map(row => (
              <TableRow key={row.id}>
                <TableCell className="font-medium text-sm">{row.employeeName}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.employeeBranch || "—"}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{row.type}</Badge></TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px]">
                    {row.source === "سند صرف" && "📄"}
                    {row.source === "نقطة البيع" && "🖥️"}
                    {row.source === "خصم يدوي" && "✏️"}
                    {row.source === "سلفة" && "💵"}
                    {row.source === "قرض حسن" && "🤝"}
                    {" "}{row.source}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs truncate max-w-[180px]">{row.description || "—"}</TableCell>
                <TableCell className="font-semibold text-sm text-destructive">{formatCurrency(row.amount)}</TableCell>
                <TableCell className="text-xs">{row.date}</TableCell>
                <TableCell>{statusBadge(row.status)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {row.sourceId && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleNavigateToSource(row)} title="الذهاب للمصدر">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {row.source === "خصم يدوي" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(row)} title="حذف">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {filtered.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5} className="font-bold text-sm">الإجمالي</TableCell>
              <TableCell className="font-bold text-sm text-destructive">{formatCurrency(totalAmount)}</TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
