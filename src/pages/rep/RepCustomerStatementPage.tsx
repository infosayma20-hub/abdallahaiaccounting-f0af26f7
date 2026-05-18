import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowRight, Share2, Printer, Phone, User } from "lucide-react";

interface Row {
  transaction_id: string;
  transaction_date: string;
  description: string | null;
  reference: string | null;
  debit: number | null;
  credit: number | null;
  balance_running: number;
}

interface ContactRow {
  id: string;
  contact_name: string;
  phone: string | null;
  linked_account_code: string | null;
  user_id: string;
}

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("ar-EG-u-ca-gregory", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  } catch { return d; }
}

function fmt(n: number | null | undefined) {
  const v = Number(n || 0);
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RepCustomerStatementPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const contactId = params.get("contact_id");

  const today = new Date().toISOString().split("T")[0];
  const ninetyAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState<ContactRow | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [fromDate, setFromDate] = useState<string>(ninetyAgo);
  const [toDate, setToDate] = useState<string>(today);

  useEffect(() => {
    if (!user || !contactId) return;
    (async () => {
      setLoading(true);
      const { data: c } = await (supabase as any)
        .from("contacts")
        .select("id, contact_name, phone, linked_account_code, user_id")
        .eq("id", contactId)
        .maybeSingle();
      setContact(c as ContactRow | null);

      if (c) {
        const { data: tx } = await (supabase as any).rpc("get_contact_statement", {
          p_user_id: (c as any).user_id,
          p_contact_id: contactId,
          p_from_date: fromDate,
          p_to_date: toDate,
        });
        setRows((tx as Row[]) || []);
      }
      setLoading(false);
    })();
  }, [user?.id, contactId, fromDate, toDate]);

  const totals = useMemo(() => {
    const debit = rows.reduce((s, r) => s + Number(r.debit || 0), 0);
    const credit = rows.reduce((s, r) => s + Number(r.credit || 0), 0);
    const balance = rows.length ? Number(rows[rows.length - 1].balance_running || 0) : 0;
    return { debit, credit, balance };
  }, [rows]);

  const shareWhatsApp = () => {
    if (!contact) return;
    const lines: string[] = [];
    lines.push(`*كشف حساب — ${contact.contact_name}*`);
    lines.push(`الفترة: ${fmtDate(fromDate)} → ${fmtDate(toDate)}`);
    lines.push("");
    lines.push(`إجمالي مدين: ${fmt(totals.debit)} ₪`);
    lines.push(`إجمالي دائن: ${fmt(totals.credit)} ₪`);
    lines.push(`*الرصيد: ${fmt(totals.balance)} ₪*`);
    const text = encodeURIComponent(lines.join("\n"));
    const phone = (contact.phone || "").replace(/[^0-9]/g, "");
    const url = phone
      ? `https://wa.me/${phone.startsWith("972") ? phone : "972" + phone.replace(/^0/, "")}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank");
  };

  if (!contactId) {
    return <div className="p-4"><Card className="p-6 text-center text-muted-foreground">لم يُحدَّد العميل</Card></div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  if (!contact) {
    return <div className="p-4"><Card className="p-6 text-center text-muted-foreground">لم يتم العثور على العميل</Card></div>;
  }

  const balColor =
    totals.balance > 0 ? "text-emerald-600"
    : totals.balance < 0 ? "text-destructive"
    : "text-muted-foreground";

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <Card className="p-4 space-y-3 bg-primary text-primary-foreground">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5" />
          <h1 className="font-bold text-lg">{contact.contact_name}</h1>
        </div>
        {contact.phone && (
          <div className="text-xs opacity-90 flex items-center gap-1">
            <Phone className="w-3 h-3" /> {contact.phone}
          </div>
        )}
        <div className="pt-2 border-t border-primary-foreground/20">
          <div className="text-xs opacity-80">الرصيد الحالي</div>
          <div className="text-2xl font-bold">{fmt(totals.balance)} ₪</div>
          {contact.linked_account_code && (
            <div className="text-[10px] opacity-70 font-mono mt-1">الحساب: {contact.linked_account_code}</div>
          )}
        </div>
      </Card>

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={shareWhatsApp} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
          <Share2 className="w-4 h-4 ml-1" /> واتساب
        </Button>
        <Button onClick={() => window.print()} variant="outline" className="flex-1">
          <Printer className="w-4 h-4 ml-1" /> طباعة
        </Button>
      </div>

      {/* Date range */}
      <Card className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">من</span>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9" />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">إلى</span>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9" />
          </label>
        </div>
      </Card>

      {/* Transactions */}
      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-12 gap-1 px-2 py-2 bg-muted/60 text-[11px] font-semibold text-muted-foreground">
          <div className="col-span-3">التاريخ</div>
          <div className="col-span-4">البيان</div>
          <div className="col-span-2 text-left">مدين</div>
          <div className="col-span-2 text-left">دائن</div>
          <div className="col-span-1 text-left">رصيد</div>
        </div>
        {rows.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">لا توجد حركات خلال الفترة المختارة</div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.transaction_id} className="grid grid-cols-12 gap-1 px-2 py-2 text-[11px]">
                <div className="col-span-3 text-foreground">{fmtDate(r.transaction_date)}</div>
                <div className="col-span-4 text-foreground truncate" title={r.description || ""}>{r.description || "—"}</div>
                <div className="col-span-2 text-left text-emerald-600 font-mono">{r.debit ? fmt(r.debit) : "—"}</div>
                <div className="col-span-2 text-left text-destructive font-mono">{r.credit ? fmt(r.credit) : "—"}</div>
                <div className="col-span-1 text-left font-mono font-bold">{fmt(r.balance_running)}</div>
              </div>
            ))}
          </div>
        )}
        {rows.length > 0 && (
          <div className="grid grid-cols-12 gap-1 px-2 py-2 bg-muted/60 text-[11px] font-bold border-t border-border">
            <div className="col-span-7 text-muted-foreground">الإجمالي</div>
            <div className="col-span-2 text-left text-emerald-700 font-mono">{fmt(totals.debit)}</div>
            <div className="col-span-2 text-left text-destructive font-mono">{fmt(totals.credit)}</div>
            <div className={`col-span-1 text-left font-mono ${balColor}`}>{fmt(totals.balance)}</div>
          </div>
        )}
      </Card>

      <Button variant="ghost" className="w-full" onClick={() => navigate("/rep/customers")}>
        <ArrowRight className="w-4 h-4 ml-1" /> العودة لقائمة العملاء
      </Button>
    </div>
  );
}