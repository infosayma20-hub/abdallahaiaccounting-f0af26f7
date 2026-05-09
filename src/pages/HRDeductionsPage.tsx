import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Download, Filter, ExternalLink, Trash2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/hr-utils";
import BackButton from "@/components/BackButton";
import * as XLSX from "xlsx";
import { multiWordMatchAny } from "@/lib/utils";

import { setNextExportBranding } from "@/lib/excel-export";
const DEDUCTION_SOURCES = ["الكل", "سند صرف", "نقطة البيع", "خصم يدوي", "سلفة", "قرض حسن"] as const;

const normalizeArabicName = (value: string = "") => value.replace(/عبدالله/g, "عبد الله").replace(/\s+/g, " ").trim();

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
      const { data, error } = await (supabase as any)
        .from("employees")
        .select("id, full_name, department, branch_id")
        .eq("user_id", dataOwnerId!)
        .neq("is_active", false)
        .order("full_name");

      if (error) {
        console.error("Failed to load employees", error);
        return [];
      }

      return (data || []) as any[];
    },
    enabled: !!user,
  });

  // Fetch branches for branch names
  const { data: branches = [] } = useQuery({
    queryKey: ["hr-branches", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("branches")
        .select("id, name")
        .eq("user_id", dataOwnerId!);

      if (error) {
        console.error("Failed to load branches", error);
        return [];
      }

      return (data || []) as any[];
    },
    enabled: !!user,
  });

  // Fetch employee receivable accounts to mirror employee account statement matching
  const { data: employeeAccounts = [] } = useQuery({
    queryKey: ["hr-employee-accounts", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("accounts")
        .select("account_code, account_name")
        .eq("user_id", dataOwnerId!)
        .eq("parent_code", "2180")
        .neq("is_active", false)
        .order("account_code");

      if (error) {
        console.error("Failed to load employee accounts", error);
        return [];
      }

      return (data || []) as any[];
    },
    enabled: !!user,
  });

  // Fetch manual deductions
  const { data: manualDeductions = [], refetch: refetchDeductions } = useQuery({
    queryKey: ["hr-all-deductions", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("employee_deductions")
        .select("*, employees(full_name, department, branch_id)")
        .eq("user_id", dataOwnerId!)
        .order("deduction_date", { ascending: false });

      if (error) {
        console.error("Failed to load manual deductions", error);
        return [];
      }

      return (data || []) as any[];
    },
    enabled: !!user,
  });

  // Fetch payment vouchers from the vouchers table
  const { data: paymentVouchers = [] } = useQuery({
    queryKey: ["hr-payment-vouchers", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vouchers")
        .select("id, ref_number, description, notes, amount, date, status, linked_transaction_id, created_at")
        .eq("user_id", dataOwnerId!)
        .eq("type", "payment")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load payment vouchers", error);
        return [];
      }

      return (data || []) as any[];
    },
    enabled: !!user,
  });

  // Fetch employee-related transactions to match account statement and dedupe duplicate vouchers
  const { data: employeeTransactions = [] } = useQuery({
    queryKey: ["hr-employee-payment-transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("transactions")
        .select("id, description, amount, transaction_date, transaction_type, payment_method, debit_account_code, credit_account_code, is_deleted, created_at")
        .eq("user_id", dataOwnerId!)
        .eq("is_deleted", false)
        .in("transaction_type", ["employee_payment", "payment"])
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load employee payment transactions", error);
        return [];
      }

      return (data || []) as any[];
    },
    enabled: !!user,
  });

  // Fetch advances
  const { data: advances = [] } = useQuery({
    queryKey: ["hr-advances-deductions", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("employee_advances")
        .select("*, employees(full_name, department, branch_id)")
        .eq("user_id", dataOwnerId!)
        .in("status", ["approved", "partially_paid"])
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load advances", error);
        return [];
      }

      return (data || []) as any[];
    },
    enabled: !!user,
  });

  // Fetch POS employee-account transactions via employee_financial_movements (pos_meal)
  const { data: posTransactions = [] } = useQuery({
    queryKey: ["hr-pos-employee-txns", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("employee_financial_movements")
        .select("*, employees(full_name, department, branch_id)")
        .eq("user_id", dataOwnerId!)
        .eq("source_type", "pos_meal")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load POS employee transactions", error);
        return [];
      }

      return (data || []) as any[];
    },
    enabled: !!user,
  });

  const branchMap = useMemo(() => {
    return branches.reduce((acc: Record<string, string>, branch: any) => {
      acc[branch.id] = branch.name || "";
      return acc;
    }, {});
  }, [branches]);

  const employeeDirectory = useMemo(() => {
    const byId: Record<string, { id: string; name: string; dept: string; branchId: string; branch: string }> = {};
    const byNormalizedName = new Map<string, { id: string; name: string; dept: string; branchId: string; branch: string }>();
    const byAccountCode = new Map<string, { id: string; name: string; dept: string; branchId: string; branch: string }[]>();

    const employeeList = employees.map((employee: any) => {
      const info = {
        id: employee.id,
        name: employee.full_name || "—",
        dept: employee.department || "",
        branchId: employee.branch_id || "",
        branch: branchMap[employee.branch_id] || "",
      };

      byId[info.id] = info;
      byNormalizedName.set(normalizeArabicName(info.name), info);
      return info;
    });

    employeeAccounts.forEach((account: any) => {
      const normalizedAccountEmployeeName = normalizeArabicName(
        String(account.account_name || "").replace(/^ذمم موظف\s*-\s*/, "")
      );

      const matchedEmployees = employeeList.filter(
        (employee) => normalizeArabicName(employee.name) === normalizedAccountEmployeeName
      );

      if (matchedEmployees.length > 0) {
        byAccountCode.set(account.account_code, matchedEmployees);
      }
    });

    return { byId, byNormalizedName, byAccountCode };
  }, [employees, employeeAccounts, branchMap]);

  const resolveEmployeeByDescription = (description: string) => {
    const normalizedDescription = normalizeArabicName(description || "");

    for (const [normalizedName, employee] of employeeDirectory.byNormalizedName.entries()) {
      if (normalizedName && normalizedDescription.includes(normalizedName)) {
        return employee;
      }
    }

    return null;
  };

  const resolveEmployeeByTransaction = (transaction: any) => {
    const accountMatches = employeeDirectory.byAccountCode.get(transaction.debit_account_code) || [];

    if (accountMatches.length === 1) return accountMatches[0];
    if (accountMatches.length > 1) {
      return resolveEmployeeByDescription(transaction.description || "") || accountMatches[0];
    }

    return resolveEmployeeByDescription(transaction.description || "");
  };

  const latestVoucherByTransactionId = useMemo(() => {
    const map = new Map<string, any>();

    paymentVouchers.forEach((voucher: any) => {
      if (voucher.linked_transaction_id && !map.has(voucher.linked_transaction_id)) {
        map.set(voucher.linked_transaction_id, voucher);
      }
    });

    return map;
  }, [paymentVouchers]);

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
    manualDeductions.forEach((deduction: any) => {
      const employee = employeeDirectory.byId[deduction.employee_id] || resolveEmployeeByDescription(deduction.description || "");
      rows.push({
        id: deduction.id,
        employeeName: deduction.employees?.full_name || employee?.name || "—",
        employeeDept: deduction.employees?.department || employee?.dept || "",
        employeeBranch: branchMap[deduction.employees?.branch_id] || employee?.branch || "",
        type: deduction.deduction_type || "أخرى",
        description: deduction.description || deduction.notes || "",
        amount: Number(deduction.amount || 0),
        date: deduction.deduction_date || deduction.created_at?.split("T")[0] || "",
        source: "خصم يدوي",
        sourceId: null,
        status: deduction.status || "معتمد للخصم",
      });
    });

    // Employee payment transactions + linked vouchers
    employeeTransactions.forEach((transaction: any) => {
      const employee = resolveEmployeeByTransaction(transaction);
      if (!employee) return;

      const linkedVoucher = latestVoucherByTransactionId.get(transaction.id);
      const description = linkedVoucher?.description || transaction.description || linkedVoucher?.notes || "";
      const deductionType = description.split(" - ")[0]?.split("|")[0]?.trim() || "سند صرف";

      rows.push({
        id: `tx-${transaction.id}`,
        employeeName: employee.name,
        employeeDept: employee.dept,
        employeeBranch: employee.branch,
        type: deductionType,
        description,
        amount: Number(linkedVoucher?.amount ?? transaction.amount ?? 0),
        date: linkedVoucher?.date || transaction.transaction_date || linkedVoucher?.created_at?.split("T")[0] || "",
        source: "سند صرف",
        sourceId: linkedVoucher?.id || null,
        status: linkedVoucher?.status === "draft" ? "مسودة" : "مرحّل",
      });
    });

    // Legacy employee vouchers without linked_transaction_id
    paymentVouchers.forEach((voucher: any) => {
      if (voucher.linked_transaction_id) return;

      const employee = resolveEmployeeByDescription(voucher.description || voucher.notes || "");
      if (!employee) return;

      const deductionType = (voucher.description || voucher.notes || "").split(" - ")[0]?.split("|")[0]?.trim() || "سند صرف";

      rows.push({
        id: `pv-${voucher.id}`,
        employeeName: employee.name,
        employeeDept: employee.dept,
        employeeBranch: employee.branch,
        type: deductionType,
        description: voucher.description || voucher.notes || "",
        amount: Number(voucher.amount || 0),
        date: voucher.date || voucher.created_at?.split("T")[0] || "",
        source: "سند صرف",
        sourceId: voucher.id,
        status: voucher.status === "draft" ? "مسودة" : "مرحّل",
      });
    });

    // POS employee-account (from employee_financial_movements)
    posTransactions.forEach((mov: any) => {
      const employee = employeeDirectory.byId[mov.employee_id] || resolveEmployeeByDescription(mov.description || "");
      const employeeName = mov.employees?.full_name || employee?.name || "—";

      rows.push({
        id: `pos-${mov.id}`,
        employeeName,
        employeeDept: mov.employees?.department || employee?.dept || "",
        employeeBranch: branchMap[mov.employees?.branch_id] || employee?.branch || "",
        type: "أكل / POS",
        description: mov.description || `فاتورة POS #${mov.source_reference || ""}`,
        amount: Number(mov.amount || 0),
        date: mov.movement_date || mov.created_at?.split("T")[0] || "",
        source: "نقطة البيع",
        sourceId: mov.source_id || mov.id,
        status: mov.status === "approved" ? "نشط" : (mov.status || "مرحّل"),
      });
    });

    // Advances
    advances.forEach((advance: any) => {
      const employee = employeeDirectory.byId[advance.employee_id] || resolveEmployeeByDescription(advance.notes || "");
      rows.push({
        id: `adv-${advance.id}`,
        employeeName: advance.employees?.full_name || employee?.name || "—",
        employeeDept: advance.employees?.department || employee?.dept || "",
        employeeBranch: branchMap[advance.employees?.branch_id] || employee?.branch || "",
        type: advance.advance_type === "قرض_حسن" ? "قرض حسن" : "سلفة",
        description: advance.notes || "",
        amount: Number(advance.amount || 0),
        date: advance.payment_date || advance.approved_date || advance.created_at?.split("T")[0] || "",
        source: advance.advance_type === "قرض_حسن" ? "قرض حسن" : "سلفة",
        sourceId: advance.id,
        status: advance.status === "approved" ? "نشط" : advance.status,
      });
    });

    return rows.sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id.localeCompare(a.id));
  }, [manualDeductions, employeeTransactions, latestVoucherByTransactionId, paymentVouchers, posTransactions, advances, employeeDirectory, branchMap]);

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
    setNextExportBranding({ title: "الخصومات" });
    XLSX.writeFile(wb, "hr-deductions.xlsx");
  };

  const statusBadge = (status: string) => {
    if (status === "مرحّل" || status === "تم الاستقطاع") return <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{status}</Badge>;
    if (status === "معتمد للخصم" || status === "نشط") return <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{status}</Badge>;
    if (status === "ملغى") return <Badge variant="destructive" className="text-[10px]">{status}</Badge>;
    return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto hr-themed" dir="rtl">
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
