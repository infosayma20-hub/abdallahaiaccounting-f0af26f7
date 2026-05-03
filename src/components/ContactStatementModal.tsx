import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, UserCheck, Users, Building, Briefcase, Loader2, FileSpreadsheet, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { multiWordMatchAny } from "@/lib/utils";

import { setNextExportBranding } from "@/lib/excel-export";
interface Contact {
  id: string;
  contact_name: string;
  contact_type: string;
  phone?: string;
  email?: string;
  linked_account_code?: string;
}

interface Employee {
  id: string;
  full_name: string;
  department?: string | null;
  position?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

type TabType = "client" | "supplier" | "employee";

const PERIOD_OPTIONS = [
  { label: "هذا الشهر", value: "this_month" },
  { label: "الشهر الماضي", value: "last_month" },
  { label: "هذا الربع", value: "this_quarter" },
  { label: "هذه السنة", value: "this_year" },
  { label: "مخصص", value: "custom" },
];

function getDateRange(period: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (period) {
    case "last_month": return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
    case "this_quarter": { const qm = Math.floor(m / 3) * 3; return { from: fmt(new Date(y, qm, 1)), to: fmt(new Date(y, qm + 3, 0)) }; }
    case "this_year": return { from: `${y}-01-01`, to: `${y}-12-31` };
    default: return { from: fmt(new Date(y, m, 1)), to: fmt(new Date(y, m + 1, 0)) };
  }
}
function fmt(d: Date) { return d.toISOString().split("T")[0]; }

const ContactStatementModal = ({ open, onClose }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabType>("client");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedName, setSelectedName] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [period, setPeriod] = useState("this_month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [showStatement, setShowStatement] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setShowStatement(false);
    setSearch("");
    setSelectedId("");

    // Load contacts and employees
    Promise.all([
      supabase.from("contacts").select("id, contact_name, contact_type, phone, email, linked_account_code").eq("user_id", user.id).neq("is_archived", true).order("contact_name"),
      supabase.from("employees").select("id, full_name, department, position").eq("user_id", user.id).order("full_name"),
    ]).then(([c, e]) => {
      setContacts(c.data || []);
      setEmployees(e.data || []);
    });
  }, [open, user]);

  const filteredItems = useMemo(() => {
    if (tab === "employee") {
      return employees.filter(e => !search.trim() || multiWordMatchAny(search, e.full_name)).slice(0, 15);
    }
    const typeFilter = tab === "client" ? ["عميل", "customer", "زبون"] : ["مورد", "supplier", "vendor"];
    return contacts.filter(c => {
      const matchType = typeFilter.some(t => (c.contact_type || "").toLowerCase().includes(t));
      const matchSearch = !search.trim() || multiWordMatchAny(search, c.contact_name, c.phone);
      return matchType && matchSearch;
    }).slice(0, 15);
  }, [tab, search, contacts, employees]);

  const fetchStatement = async () => {
    if (!selectedId || !user) return;
    setLoading(true);
    try {
      const range = period === "custom" ? { from: dateFrom, to: dateTo } : getDateRange(period);

      if (tab === "employee") {
        // Fetch from employee_financial_movements
        const { data, error } = await supabase
          .from("employee_financial_movements")
          .select("*")
          .eq("employee_id", selectedId)
          .eq("user_id", user.id)
          .gte("movement_date", range.from)
          .lte("movement_date", range.to)
          .order("movement_date", { ascending: true });
        if (error) throw error;

        let balance = 0;
        const mapped = (data || []).map(m => {
          const debit = m.movement_type === "debit" ? Number(m.amount) : 0;
          const credit = m.movement_type === "credit" ? Number(m.amount) : 0;
          balance += debit - credit;
          return {
            id: m.id,
            date: m.movement_date,
            description: m.description,
            source: m.source_type,
            debit,
            credit,
            balance,
            status: m.status,
          };
        });
        setRows(mapped);
      } else {
        // Fetch from transactions with contact_id
        const contact = contacts.find(c => c.id === selectedId);
        const accountCode = contact?.linked_account_code;

        if (accountCode) {
          const { data, error } = await supabase
            .from("transactions")
            .select("id, transaction_date, description, transaction_type, amount, currency, debit_account_code, credit_account_code")
            .eq("user_id", user.id)
            .eq("is_deleted", false)
            .gte("transaction_date", range.from)
            .lte("transaction_date", range.to)
            .or(`debit_account_code.eq.${accountCode},credit_account_code.eq.${accountCode}`)
            .order("transaction_date", { ascending: true });
          if (error) throw error;

          const isSupplier = tab === "supplier";
          let balance = 0;
          const mapped = (data || []).map(tx => {
            const isDebit = tx.debit_account_code === accountCode;
            const debit = isDebit ? tx.amount : 0;
            const credit = !isDebit ? tx.amount : 0;
            balance += debit - credit;
            return { id: tx.id, date: tx.transaction_date, description: tx.description, debit, credit, balance, source: tx.transaction_type };
          });
          setRows(mapped);
        } else {
          // Fallback: search by contact_id
          const { data, error } = await supabase
            .from("transactions")
            .select("id, transaction_date, description, transaction_type, amount, currency, debit_account_code, credit_account_code")
            .eq("user_id", user.id)
            .eq("contact_id", selectedId)
            .eq("is_deleted", false)
            .gte("transaction_date", range.from)
            .lte("transaction_date", range.to)
            .order("transaction_date", { ascending: true });
          if (error) throw error;

          // Determine debit/credit by matching the contact's AR/AP account families
          // (handles AR accounts like 1130/1131/1135 and AP accounts like 2110/2111/2115).
          const roots = ["113", "211", "2180", "1146"];
          const matches = (code: string | null | undefined) =>
            !!code && roots.some(r => code === r || code.startsWith(r));
          let balance = 0;
          const mapped = (data || []).map(tx => {
            const isDebit = matches(tx.debit_account_code);
            const isCredit = matches(tx.credit_account_code);
            const debit = isDebit ? Number(tx.amount) : 0;
            const credit = isCredit ? Number(tx.amount) : 0;
            balance += debit - credit;
            return { id: tx.id, date: tx.transaction_date, description: tx.description, debit, credit, balance, source: tx.transaction_type };
          });
          setRows(mapped);
        }
      }
      setShowStatement(true);
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const finalBalance = totalDebit - totalCredit;

  const exportExcel = () => {
    const data = rows.map((r, i) => ({
      "#": i + 1,
      "التاريخ": r.date,
      "البيان": r.description,
      ...(tab === "employee" ? { "المصدر": r.source, "الحالة": r.status } : {}),
      "مدين": r.debit || "",
      "دائن": r.credit || "",
      "الرصيد": r.balance,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كشف حساب");
    setNextExportBranding({ title: "كشف حساب" });
    XLSX.writeFile(wb, `كشف_${selectedName}.xlsx`);
    toast({ title: "تم التصدير ✅" });
  };

  const sourceLabel = (s: string) => {
    const map: Record<string, string> = {
      hr_advance: "💰 HR", pos_meal: "🍽️ POS", pos_shortage: "⚠️ صندوق",
      pos_sale_credit: "📦 POS", finance_manual: "📋 يدوي", salary_deduction: "📊 خصم",
    };
    return map[s] || s;
  };

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      approved: "bg-primary/10 text-primary", pending: "bg-yellow-500/10 text-yellow-600",
      deducted: "bg-secondary text-muted-foreground", rejected: "bg-destructive/10 text-destructive",
    };
    const labels: Record<string, string> = { approved: "معتمد", pending: "انتظار", deducted: "تم خصمه", rejected: "مرفوض" };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${colors[s] || ""}`}>{labels[s] || s}</span>;
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        {!showStatement ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-primary" />
                كشف حساب شخصي
              </DialogTitle>
            </DialogHeader>

            {/* Tabs */}
            <div className="flex gap-2">
              {([
                { id: "client" as TabType, label: "عميل", icon: Users },
                { id: "supplier" as TabType, label: "مورد", icon: Building },
                { id: "employee" as TabType, label: "موظف", icon: Briefcase },
              ]).map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); setSelectedId(""); setSearch(""); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-foreground hover:bg-secondary"
                  }`}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو الرقم..."
                className="pr-10 text-right"
                autoFocus
              />
            </div>

            {/* Items list */}
            <div className="border border-border/30 rounded-xl max-h-[200px] overflow-y-auto">
              {(filteredItems as any[]).map((item: any) => {
                const id = item.id;
                const name = item.contact_name || item.full_name;
                const isSelected = selectedId === id;
                return (
                  <button
                    key={id}
                    onClick={() => { setSelectedId(id); setSelectedName(name); setSelectedType(item.contact_type || "موظف"); }}
                    className={`w-full flex items-center justify-between px-4 py-3 text-right hover:bg-secondary/50 transition-colors ${
                      isSelected ? "bg-primary/5 border-r-2 border-primary" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{name}</span>
                      {item.department && <span className="text-[11px] text-muted-foreground">({item.department})</span>}
                    </div>
                    {item.phone && <span className="text-[11px] text-muted-foreground">{item.phone}</span>}
                  </button>
                );
              })}
              {filteredItems.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">لا توجد نتائج</p>
              )}
            </div>

            {/* Period */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">الفترة</label>
              <div className="flex gap-2 flex-wrap">
                {PERIOD_OPTIONS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setPeriod(p.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      period === p.value ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-foreground hover:bg-secondary"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {period === "custom" && (
                <div className="flex gap-2">
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm" />
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-sm" />
                </div>
              )}
            </div>

            <Button onClick={fetchStatement} disabled={!selectedId || loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <UserCheck className="h-4 w-4 ml-2" />}
              عرض الكشف
            </Button>
          </>
        ) : (
          <>
            {/* Statement View */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button onClick={() => setShowStatement(false)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                  رجوع
                </button>
                <Button variant="outline" size="sm" onClick={exportExcel}>
                  <FileSpreadsheet className="h-3.5 w-3.5 ml-1" /> Excel
                </Button>
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-lg font-bold text-foreground">{selectedName}</h3>
                <Badge variant="secondary">
                  {tab === "client" ? "عميل" : tab === "supplier" ? "مورد" : "موظف"}
                </Badge>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-secondary/30 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">{tab === "employee" ? "مسحوبات" : "مدين"}</p>
                  <p className="text-sm font-bold text-primary">{totalDebit.toLocaleString()}</p>
                </div>
                <div className="bg-secondary/30 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">دائن</p>
                  <p className="text-sm font-bold text-destructive">{totalCredit.toLocaleString()}</p>
                </div>
                <div className={`rounded-xl p-3 text-center ${finalBalance >= 0 ? "bg-primary/5" : "bg-destructive/5"}`}>
                  <p className="text-[10px] text-muted-foreground">الصافي</p>
                  <p className={`text-sm font-bold ${finalBalance >= 0 ? "text-primary" : "text-destructive"}`}>
                    {Math.abs(finalBalance).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Table */}
              <div className="border border-border/30 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-secondary/50">
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">التاريخ</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">البيان</th>
                      {tab === "employee" && <th className="px-3 py-2 text-center font-semibold text-muted-foreground">المصدر</th>}
                      <th className="px-3 py-2 text-center font-semibold text-muted-foreground">{tab === "employee" ? "مسحوب" : "مدين"}</th>
                      <th className="px-3 py-2 text-center font-semibold text-muted-foreground">دائن</th>
                      <th className="px-3 py-2 text-center font-semibold text-muted-foreground">الرصيد</th>
                      {tab === "employee" && <th className="px-3 py-2 text-center font-semibold text-muted-foreground">الحالة</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={tab === "employee" ? 7 : 5} className="text-center py-8 text-muted-foreground">لا توجد حركات</td></tr>
                    ) : rows.map((r, i) => (
                      <tr key={r.id} className={i % 2 === 1 ? "bg-secondary/20" : ""}>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{r.date}</td>
                        <td className="px-3 py-2 text-foreground">{r.description}</td>
                        {tab === "employee" && <td className="px-3 py-2 text-center text-[11px]">{sourceLabel(r.source)}</td>}
                        <td className="px-3 py-2 text-center text-primary font-semibold">{r.debit ? r.debit.toLocaleString() : "-"}</td>
                        <td className="px-3 py-2 text-center text-destructive font-semibold">{r.credit ? r.credit.toLocaleString() : "-"}</td>
                        <td className={`px-3 py-2 text-center font-bold ${r.balance >= 0 ? "text-primary" : "text-destructive"}`}>
                          {Math.abs(r.balance).toLocaleString()}
                        </td>
                        {tab === "employee" && <td className="px-3 py-2 text-center">{statusBadge(r.status)}</td>}
                      </tr>
                    ))}
                    {rows.length > 0 && (
                      <tr className="bg-secondary/40 border-t-2 border-primary/20 font-bold">
                        <td className="px-3 py-2" colSpan={tab === "employee" ? 3 : 2}>الإجمالي</td>
                        <td className="px-3 py-2 text-center text-primary">{totalDebit.toLocaleString()}</td>
                        <td className="px-3 py-2 text-center text-destructive">{totalCredit.toLocaleString()}</td>
                        <td className={`px-3 py-2 text-center ${finalBalance >= 0 ? "text-primary" : "text-destructive"}`}>
                          {Math.abs(finalBalance).toLocaleString()}
                        </td>
                        {tab === "employee" && <td></td>}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Balance note */}
              {rows.length > 0 && (
                <div className={`p-3 rounded-xl text-center text-sm font-bold ${
                  finalBalance > 0 ? "bg-primary/5 text-primary" : finalBalance < 0 ? "bg-destructive/5 text-destructive" : "bg-secondary/30 text-muted-foreground"
                }`}>
                  {tab === "employee" ? (
                    finalBalance > 0 ? `⚠️ مسحوبات بقيمة ${finalBalance.toLocaleString()} ₪` : `✅ صافي مستحق للموظف: ${Math.abs(finalBalance).toLocaleString()} ₪`
                  ) : (
                    finalBalance > 0 ? `الرصيد: ${finalBalance.toLocaleString()} ₪ مدين` : finalBalance < 0 ? `الرصيد: ${Math.abs(finalBalance).toLocaleString()} ₪ دائن` : "✅ الحساب مسدد"
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ContactStatementModal;
