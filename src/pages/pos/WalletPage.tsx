/**
 * WalletPage — إدارة محافظ العملاء (Microsoft Dynamics Finance shell).
 * Command Bar + Fact box + جدول RTL موحّد + نوافذ الحركات وكشف المحفظة.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";
import {
  ArrowRight, Wallet, Plus, Minus, RefreshCcw, FileText, Download,
  Lock, Unlock, Search, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RtlDataTable, type RtlColumn } from "@/components/ui/RtlDataTable";
import WalletTxnDialog, { type WalletTxnType } from "@/components/pos-wallet/WalletTxnDialog";
import WalletStatementDialog from "@/components/pos-wallet/WalletStatementDialog";

interface WalletRow {
  id: string;
  contact_id: string;
  balance: number;
  currency: string;
  is_frozen: boolean;
  updated_at: string;
  contact_name: string;
  phone: string | null;
}

const fmt = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WalletPage() {
  const navigate = useNavigate();
  const { dataOwnerId } = useDataOwnerId();

  const [rows, setRows] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyPositive, setOnlyPositive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  // اختيار زبون جديد لفتح محفظة له
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<{ id: string; contact_name: string }[]>([]);

  const [txnOpen, setTxnOpen] = useState(false);
  const [txnType, setTxnType] = useState<WalletTxnType>("topup");
  const [txnContactId, setTxnContactId] = useState<string | null>(null);
  const [statementOpen, setStatementOpen] = useState(false);

  const load = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("customer_wallets")
      .select("id, contact_id, balance, currency, is_frozen, updated_at, contacts(contact_name, phone)")
      .eq("user_id", dataOwnerId)
      .order("balance", { ascending: false })
      .limit(1000);
    if (error) { toast.error(error.message); setLoading(false); return; }
    setRows(((data as any[]) || []).map((w) => ({
      id: w.id, contact_id: w.contact_id, balance: Number(w.balance || 0),
      currency: w.currency, is_frozen: !!w.is_frozen, updated_at: w.updated_at,
      contact_name: w.contacts?.contact_name || "—", phone: w.contacts?.phone || null,
    })));
    setLoading(false);
  }, [dataOwnerId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!dataOwnerId) return;
    (supabase as any).from("branches").select("id, name").eq("user_id", dataOwnerId).eq("is_active", true).order("name")
      .then(({ data }: any) => setBranches((data as any[]) || []));
  }, [dataOwnerId]);

  useEffect(() => {
    const q = contactSearch.trim();
    if (!dataOwnerId || q.length < 2) { setContactResults([]); return; }
    const t = setTimeout(() => {
      (supabase as any).from("contacts")
        .select("id, contact_name")
        .eq("user_id", dataOwnerId)
        .ilike("contact_name", `%${q}%`)
        .limit(8)
        .then(({ data }: any) => setContactResults((data as any[]) || []));
    }, 250);
    return () => clearTimeout(t);
  }, [contactSearch, dataOwnerId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (!onlyPositive || r.balance > 0) &&
      (!q || r.contact_name.toLowerCase().includes(q) || (r.phone || "").includes(q))
    );
  }, [rows, search, onlyPositive]);

  const selected = rows.find((r) => r.id === selectedId) || null;
  const totalLiability = rows.reduce((s, r) => s + r.balance, 0);
  const activeCount = rows.filter((r) => r.balance > 0).length;

  const openTxn = (type: WalletTxnType, contactId: string | null) => {
    if (!contactId) { toast.error("اختر محفظة أو زبوناً أولاً"); return; }
    setTxnType(type); setTxnContactId(contactId); setTxnOpen(true);
  };

  const toggleFreeze = async () => {
    if (!selected) { toast.error("اختر محفظة أولاً"); return; }
    const { error } = await (supabase as any)
      .from("customer_wallets").update({ is_frozen: !selected.is_frozen }).eq("id", selected.id);
    if (error) { toast.error(error.message); return; }
    toast.success(selected.is_frozen ? "تم فك تجميد المحفظة" : "تم تجميد المحفظة");
    load();
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map((r) => ({
      "الزبون": r.contact_name, "الهاتف": r.phone || "", "الرصيد": r.balance,
      "العملة": r.currency, "الحالة": r.is_frozen ? "مجمّدة" : "نشطة",
      "آخر تحديث": new Date(r.updated_at).toLocaleString("en-GB"),
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "محافظ العملاء");
    XLSX.writeFile(wb, `customer-wallets-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const columns: RtlColumn<WalletRow>[] = [
    { key: "name", header: "الزبون", render: (r) => <span className="font-medium">{r.contact_name}</span> },
    { key: "phone", header: "الهاتف", render: (r) => <span className="tabular-nums">{r.phone || "—"}</span> },
    { key: "balance", header: "الرصيد", align: "center", render: (r) => (
      <span className={`tabular-nums font-semibold ${r.balance > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>{fmt(r.balance)}</span>
    ) },
    { key: "currency", header: "العملة", align: "center", render: (r) => r.currency },
    { key: "status", header: "الحالة", align: "center", render: (r) => (
      <Badge variant={r.is_frozen ? "destructive" : "secondary"} className="text-[10px]">{r.is_frozen ? "مجمّدة" : "نشطة"}</Badge>
    ) },
    { key: "updated", header: "آخر حركة", align: "center", render: (r) => new Date(r.updated_at).toLocaleDateString("en-GB") },
    { key: "actions", header: "إجراءات", align: "center", render: (r) => (
      <div className="flex justify-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); openTxn("topup", r.contact_id); }}>شحن</Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); setSelectedId(r.id); setStatementOpen(true); }}>كشف</Button>
      </div>
    ) },
  ];

  return (
    <div className="min-h-screen bg-muted/20 pb-8" dir="rtl">
      {/* ===== Command Bar ===== */}
      <div className="sticky top-0 z-20 border-b border-border bg-[#0D1B2E] text-white">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <Button variant="ghost" size="icon" aria-label="رجوع" className="text-white hover:bg-white/10"
            onClick={() => (window.history.length > 2 ? navigate(-1) : navigate("/pos"))}>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 pl-3">
            <Wallet className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-semibold">محافظ العملاء</span>
          </div>
          <div className="mx-1 h-5 w-px bg-white/20" />
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-white hover:bg-white/10"
            onClick={() => openTxn("topup", selected?.contact_id ?? null)}>
            <Plus className="h-3.5 w-3.5" /> شحن رصيد
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-white hover:bg-white/10"
            onClick={() => openTxn("spend", selected?.contact_id ?? null)}>
            <Minus className="h-3.5 w-3.5" /> صرف
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-white hover:bg-white/10"
            onClick={() => openTxn("adjustment", selected?.contact_id ?? null)}>
            <RefreshCcw className="h-3.5 w-3.5" /> تسوية
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-white hover:bg-white/10"
            onClick={() => { if (!selected) { toast.error("اختر محفظة أولاً"); return; } setStatementOpen(true); }}>
            <FileText className="h-3.5 w-3.5" /> كشف المحفظة
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-white hover:bg-white/10" onClick={toggleFreeze}>
            {selected?.is_frozen ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {selected?.is_frozen ? "فك التجميد" : "تجميد"}
          </Button>
          <div className="mx-1 h-5 w-px bg-white/20" />
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-white hover:bg-white/10" onClick={exportExcel}>
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-white hover:bg-white/10" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" /> طباعة
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-white hover:bg-white/10" onClick={load}>
            <RefreshCcw className="h-3.5 w-3.5" /> تحديث
          </Button>
        </div>
      </div>

      {/* ===== Fact box ===== */}
      <div className="grid grid-cols-2 divide-x divide-x-reverse divide-border border-b border-border bg-background sm:grid-cols-4">
        {[
          { label: "إجمالي التزام المحافظ", value: fmt(totalLiability), tone: "text-foreground" },
          { label: "عدد المحافظ", value: String(rows.length), tone: "text-foreground" },
          { label: "محافظ برصيد", value: String(activeCount), tone: "text-emerald-600" },
          { label: "محافظ مجمّدة", value: String(rows.filter(r => r.is_frozen).length), tone: "text-destructive" },
        ].map((f) => (
          <div key={f.label} className="px-4 py-2.5">
            <div className="text-[10px] text-muted-foreground">{f.label}</div>
            <div className={`text-base font-semibold tabular-nums ${f.tone}`}>{f.value}</div>
          </div>
        ))}
      </div>

      {/* ===== Filters ===== */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2">
        <div className="relative">
          <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الهاتف"
            className="h-8 w-56 pr-7 text-xs" />
        </div>
        <Button size="sm" variant={onlyPositive ? "default" : "outline"} className="h-8 text-[11px]"
          onClick={() => setOnlyPositive((v) => !v)}>
          أصحاب الأرصدة فقط
        </Button>

        <div className="relative ms-auto">
          <Input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)}
            placeholder="فتح محفظة لزبون… اكتب الاسم" className="h-8 w-64 text-xs" />
          {contactResults.length > 0 && (
            <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
              {contactResults.map((c) => (
                <button key={c.id} type="button"
                  className="block w-full px-3 py-2 text-right text-xs hover:bg-muted"
                  onClick={() => { setContactSearch(""); setContactResults([]); openTxn("topup", c.id); }}>
                  {c.contact_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== Grid ===== */}
      <div className="bg-background">
        <RtlDataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          loading={loading}
          emptyMessage="لا توجد محافظ بعد — ابدأ بفتح محفظة لزبون من مربع البحث أعلاه"
          rowClassName={(r) => `cursor-pointer ${r.id === selectedId ? "bg-primary/10" : ""}`}
        />
      </div>

      <WalletTxnDialog
        open={txnOpen}
        onOpenChange={setTxnOpen}
        contactId={txnContactId}
        contactName={rows.find((r) => r.contact_id === txnContactId)?.contact_name}
        currentBalance={rows.find((r) => r.contact_id === txnContactId)?.balance || 0}
        defaultType={txnType}
        branches={branches}
        onDone={load}
      />

      <WalletStatementDialog
        open={statementOpen}
        onOpenChange={setStatementOpen}
        walletId={selected?.id ?? null}
        contactName={selected?.contact_name}
        balance={selected?.balance || 0}
      />
    </div>
  );
}
