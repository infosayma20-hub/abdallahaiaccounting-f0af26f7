import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/hr-utils";
import BackButton from "@/components/BackButton";
import * as XLSX from "xlsx";

import { setNextExportBranding } from "@/lib/excel-export";
export default function AdvancesPage() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [typeFilter, setTypeFilter] = useState("الكل");

  const { data: advances = [], isLoading } = useQuery({
    queryKey: ["all-advances", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("employee_advances")
        .select("*, employees(full_name, department)")
        .eq("user_id", dataOwnerId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: allInstallments = [] } = useQuery({
    queryKey: ["all-installments", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const { data } = await supabase
        .from("employee_advance_installments")
        .select("*")
        .eq("user_id", dataOwnerId!)
        .eq("due_month", currentMonth)
        .eq("status", "pending");
      return data || [];
    },
    enabled: !!user,
  });

  const filtered = advances.filter((a: any) => {
    if (statusFilter !== "الكل") {
      if (statusFilter === "نشط" && a.status !== "approved") return false;
      if (statusFilter === "مكتمل" && a.status !== "fully_paid") return false;
      if (statusFilter === "معلق" && a.status !== "pending") return false;
    }
    if (typeFilter !== "الكل" && a.advance_type !== typeFilter) return false;
    return true;
  });

  const totalActive = advances.filter((a: any) => a.status === "approved").reduce((s: number, a: any) => s + Number(a.amount), 0);
  const thisMonthInstallments = allInstallments.reduce((s: number, i: any) => s + Number(i.amount), 0);

  const exportExcel = () => {
    const rows = filtered.map((a: any) => ({
      "الموظف": a.employees?.full_name || "-",
      "القسم": a.employees?.department || "-",
      "النوع": a.advance_type,
      "المبلغ": Number(a.amount),
      "القسط/شهر": Number(a.installment_amount),
      "الحالة": a.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "السلف");
    setNextExportBranding({ title: "السلف" });
    XLSX.writeFile(wb, "سلف_وقروض.xlsx");
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1200px] mx-auto" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-bold text-foreground">السلف والقروض</h1>
            <p className="text-xs text-muted-foreground">إدارة جميع السلف والقروض للموظفين</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={!filtered.length}>
          <Download className="h-4 w-4 ml-1" /> Excel
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground">إجمالي القروض النشطة</p>
          <p className="text-lg font-bold text-foreground">{formatCurrency(totalActive)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground">إجمالي المستقطع هذا الشهر</p>
          <p className="text-lg font-bold text-primary">{formatCurrency(thisMonthInstallments)}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="الكل">الكل</SelectItem>
            <SelectItem value="نشط">نشط</SelectItem>
            <SelectItem value="معلق">معلق</SelectItem>
            <SelectItem value="مكتمل">مكتمل</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="الكل">كل الأنواع</SelectItem>
            <SelectItem value="سلفة_راتب">سلفة راتب</SelectItem>
            <SelectItem value="قرض_حسن">قرض حسن</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">الموظف</TableHead>
            <TableHead className="text-right">النوع</TableHead>
            <TableHead className="text-right">المبلغ</TableHead>
            <TableHead className="text-right">القسط/شهر</TableHead>
            <TableHead className="text-right">عدد الأقساط</TableHead>
            <TableHead className="text-right">الحالة</TableHead>
            <TableHead className="text-right">التاريخ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">جاري التحميل...</TableCell></TableRow>
          ) : filtered.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">لا توجد سلف أو قروض</TableCell></TableRow>
          ) : (
            filtered.map((a: any) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium text-sm">{a.employees?.full_name || "-"}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{a.advance_type === "قرض_حسن" ? "🤝 قرض" : "💵 سلفة"}</Badge></TableCell>
                <TableCell className="text-sm">{formatCurrency(Number(a.amount))}</TableCell>
                <TableCell className="text-sm">{formatCurrency(Number(a.installment_amount))}</TableCell>
                <TableCell className="text-sm">{a.installments_count}</TableCell>
                <TableCell>
                  <Badge variant={a.status === "approved" ? "default" : a.status === "fully_paid" ? "secondary" : "outline"} className="text-[10px]">
                    {a.status === "approved" ? "نشط" : a.status === "fully_paid" ? "مكتمل" : a.status === "pending" ? "معلق" : a.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{a.request_date}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
