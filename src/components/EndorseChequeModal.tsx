import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, CheckCircle, Receipt, Calendar, Building2, Banknote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface EndorsedCheque {
  id: string;
  cheque_number: string | null;
  bank_name: string | null;
  party_name: string;
  amount: number;
  cheque_date: string;
  currency: string;
  status: string;
  isEndorsed: true;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (cheque: EndorsedCheque) => void;
  excludeIds?: string[];
}

export default function EndorseChequeModal({ open, onClose, onSelect, excludeIds = [] }: Props) {
  const { user } = useAuth();
  const [cheques, setCheques] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    supabase
      .from("cheques")
      .select("id, cheque_number, bank_name, party_name, amount, cheque_date, currency, status, endorsed_to_contact_id")
      .eq("user_id", user.id)
      .eq("cheque_type", "وارد")
      .in("status", ["مسجل", "آجل", "مستحق"])
      .is("endorsed_to_contact_id", null)
      .order("cheque_date", { ascending: true })
      .then(({ data }) => {
        setCheques(data || []);
        setLoading(false);
      });
  }, [open, user]);

  const banks = useMemo(() => {
    const set = new Set(cheques.map(c => c.bank_name).filter(Boolean));
    return Array.from(set).sort();
  }, [cheques]);

  const filtered = useMemo(() => {
    return cheques.filter(c => {
      if (excludeIds.includes(c.id)) return false;
      if (search) {
        const q = search.toLowerCase();
        const match = (c.cheque_number || "").toLowerCase().includes(q)
          || (c.party_name || "").toLowerCase().includes(q)
          || (c.bank_name || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (bankFilter && c.bank_name !== bankFilter) return false;
      if (dateFrom && c.cheque_date < dateFrom) return false;
      if (dateTo && c.cheque_date > dateTo) return false;
      return true;
    });
  }, [cheques, search, bankFilter, dateFrom, dateTo, excludeIds]);

  const statusLabel = (s: string) => {
    if (s === "مسجل") return "مسجل";
    if (s === "آجل") return "آجل";
    if (s === "مستحق") return "مستحق";
    return s;
  };

  const statusColor = (s: string) => {
    if (s === "مستحق") return "bg-amber-100 text-amber-700";
    if (s === "آجل") return "bg-blue-100 text-blue-700";
    return "bg-emerald-100 text-emerald-700";
  };

  const handleSelect = (cheque: any) => {
    onSelect({
      id: cheque.id,
      cheque_number: cheque.cheque_number,
      bank_name: cheque.bank_name,
      party_name: cheque.party_name,
      amount: cheque.amount,
      cheque_date: cheque.cheque_date,
      currency: cheque.currency,
      status: cheque.status,
      isEndorsed: true,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Receipt className="h-5 w-5 text-primary" />
            اختر شيكاً للتجيير
          </DialogTitle>
          <p className="text-xs text-muted-foreground">اختر شيكاً مستلماً لتجييره إلى المورد كدفعة</p>
        </DialogHeader>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2">
          <div className="sm:col-span-2 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث برقم الشيك أو اسم الساحب..."
              className="pr-9 h-9 text-xs"
            />
          </div>
          <div>
            <select
              value={bankFilter}
              onChange={e => setBankFilter(e.target.value)}
              className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs"
            >
              <option value="">كل البنوك</option>
              {banks.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="flex gap-1">
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-[10px]" placeholder="من" />
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-[10px]" placeholder="إلى" />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto mt-3 rounded-xl border border-border">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              لا توجد شيكات متاحة للتجيير
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-right" style={{ background: "#0D1B2A" }}>
                  <th className="p-2.5 text-white font-medium">رقم الشيك</th>
                  <th className="p-2.5 text-white font-medium">البنك</th>
                  <th className="p-2.5 text-white font-medium">الساحب</th>
                  <th className="p-2.5 text-white font-medium text-left">المبلغ</th>
                  <th className="p-2.5 text-white font-medium">الاستحقاق</th>
                  <th className="p-2.5 text-white font-medium">الحالة</th>
                  <th className="p-2.5 text-white font-medium w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, idx) => (
                  <tr
                    key={c.id}
                    className={`border-t border-border/30 hover:bg-primary/5 cursor-pointer transition-colors ${idx % 2 === 0 ? "bg-background" : "bg-secondary/20"}`}
                    onClick={() => handleSelect(c)}
                  >
                    <td className="p-2.5 font-mono font-medium">{c.cheque_number || "-"}</td>
                    <td className="p-2.5 text-muted-foreground">{c.bank_name || "-"}</td>
                    <td className="p-2.5 font-medium">{c.party_name}</td>
                    <td className="p-2.5 text-left font-mono font-bold">
                      {c.currency === "دولار" ? "$" : c.currency === "دينار" ? "د.ا" : "₪"}
                      {c.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2.5 text-muted-foreground">{c.cheque_date}</td>
                    <td className="p-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor(c.status)}`}>
                        {statusLabel(c.status)}
                      </span>
                    </td>
                    <td className="p-2.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] gap-1 text-primary hover:text-primary"
                        onClick={(e) => { e.stopPropagation(); handleSelect(c); }}
                      >
                        <CheckCircle className="h-3 w-3" /> اختيار
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="text-[10px] text-muted-foreground pt-2">
          {filtered.length} شيك متاح للتجيير
        </div>
      </DialogContent>
    </Dialog>
  );
}
