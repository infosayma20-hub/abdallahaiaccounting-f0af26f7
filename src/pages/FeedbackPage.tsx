import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, PhoneOff, ChevronLeft, UserPlus, Save, PhoneCall, Ban, MapPin, Calendar, Receipt } from "lucide-react";
import { toast } from "sonner";
import { usePermission } from "@/hooks/usePermission";

interface CustomerRow {
  id: string;
  display_phone: string;
  normalized_phone: string;
  full_name: string | null;
  last_known_branch_id: string | null;
  total_orders_cached?: number | null;
  last_order_at_cached?: string | null;
  do_not_call: boolean;
  do_not_call_reason?: string | null;
  do_not_call_at?: string | null;
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

interface BranchOption { id: string; name: string }

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "يجب تسجيل الدخول",
  PERMISSION_DENIED: "ليس لديك صلاحية لهذا الإجراء",
  INVALID_PHONE: "رقم الهاتف غير صالح",
  BRANCH_NOT_FOUND: "الفرع المختار غير صالح",
  CUSTOMER_NOT_FOUND: "الزبون غير موجود",
  DO_NOT_CALL_ACTIVE: "هذا الزبون طلب عدم الاتصال",
  INVALID_OUTCOME: "نتيجة المكالمة غير صالحة",
  INVALID_SENTIMENT: "تقييم المشاعر غير صالح",
  INVALID_RATING: "التقييم يجب أن يكون بين 1 و 5",
  FOLLOWUP_DUE_REQUIRED: "يجب تحديد موعد المتابعة",
  ORDER_NOT_FOUND: "الطلبية المرتبطة غير موجودة",
  ORDER_CUSTOMER_MISMATCH: "هذه الطلبية ليست لنفس الزبون",
  RATE_LIMITED: "لا يمكن تسجيل أكثر من مكالمة واحدة لنفس الزبون خلال 60 ثانية",
  REASON_REQUIRED: "السبب مطلوب (3 أحرف على الأقل)",
};

function rpcErr(error: any) {
  const msg = String(error?.message ?? "");
  for (const key of Object.keys(ERROR_MESSAGES)) {
    if (msg.includes(key)) return ERROR_MESSAGES[key];
  }
  return msg || "حدث خطأ غير متوقع";
}

const OUTCOMES: { value: string; label: string }[] = [
  { value: "answered", label: "تم الرد" },
  { value: "no_answer", label: "لم يرد" },
  { value: "busy", label: "مشغول" },
  { value: "wrong_number", label: "رقم خاطئ" },
  { value: "callback_requested", label: "طلب معاودة الاتصال" },
  { value: "refused", label: "رفض المكالمة" },
];

const SENTIMENTS: { value: string; label: string }[] = [
  { value: "satisfied", label: "راضٍ" },
  { value: "neutral", label: "محايد" },
  { value: "unsatisfied", label: "غير راضٍ" },
  { value: "complaint", label: "شكوى" },
  { value: "suggestion", label: "اقتراح" },
];

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
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const { can } = usePermission("call_center_feedback");
  const canCreate = can("customers", "create");
  const canEdit = can("customers", "edit");
  const canCallCreate = can("calls", "create");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name")
        .order("name", { ascending: true });
      setBranches(((data as any[]) || []).map((b) => ({ id: b.id, name: b.name })));
    })();
  }, []);

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

  const handleSaveAsCustomer = async () => {
    const phone = query.trim();
    if (!phone) return;
    const { data, error } = await supabase.rpc("feedback_upsert_customer" as any, {
      p_phone: phone,
      p_full_name: null,
      p_branch_id: null,
    });
    if (error) { toast.error(rpcErr(error)); return; }
    const row = ((data as any[]) || [])[0];
    if (!row) { toast.error("تعذّر إنشاء الزبون"); return; }
    toast.success("تم حفظ الزبون");
    await openCustomer(row as CustomerRow);
  };

  const refreshSelected = async () => {
    if (!selected) return;
    const { data } = await supabase.rpc("feedback_search_customers" as any, {
      p_query: selected.normalized_phone, p_limit: 1,
    });
    const row = ((data as any[]) || [])[0];
    if (row) setSelected(row as CustomerRow);
  };

  return (
    <div className="space-y-3" dir="rtl">
      {!selected && (
        <SearchBar
          query={query}
          onChange={setQuery}
          onSubmit={runSearch}
          searching={searching}
        />
      )}

      {selected ? (
        <CustomerDetail
          customer={selected}
          orders={orders}
          loading={ordersLoading}
          onBack={() => { setSelected(null); setOrders([]); }}
          branches={branches}
          canEdit={canEdit}
          canCallCreate={canCallCreate}
          onRefresh={refreshSelected}
        />
      ) : (
        <ResultsList
          results={results}
          searched={searched}
          searching={searching}
          onSelect={openCustomer}
          canCreate={canCreate}
          query={query}
          onSaveAsCustomer={handleSaveAsCustomer}
          branches={branches}
        />
      )}
    </div>
  );
}

function SearchBar({
  query, onChange, onSubmit, searching,
}: {
  query: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  searching: boolean;
}) {
  const isNumeric = /^[+\d\s-]+$/.test(query.trim()) && /\d/.test(query);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
    >
      <div className="relative">
        <Search className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="رقم الجوال أو اسم الزبون"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 text-base pr-10 pl-3"
          inputMode={isNumeric ? "tel" : "text"}
          enterKeyHint="search"
          autoFocus
          autoComplete="off"
        />
      </div>
      <Button
        type="submit"
        disabled={searching || !query.trim()}
        className="w-full h-11"
      >
        {searching ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Search className="h-4 w-4 ml-2" />}
        بحث
      </Button>
    </form>
  );
}

function ResultsList({
  results, searched, searching, onSelect, canCreate, query, onSaveAsCustomer,
}: {
  results: CustomerRow[];
  searched: boolean;
  searching: boolean;
  onSelect: (c: CustomerRow) => void;
  canCreate: boolean;
  query: string;
  onSaveAsCustomer: () => void;
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
      <Card><CardContent className="p-8 text-center space-y-3">
        <div className="text-muted-foreground">لا يوجد زبون بهذا الرقم أو الاسم بعد</div>
        {canCreate && /^\+?\d[\d\s-]{5,}$/.test(query.trim()) && (
          <Button onClick={onSaveAsCustomer} size="sm">
            <UserPlus className="h-4 w-4 ml-1" /> حفظ "{query.trim()}" كزبون جديد
          </Button>
        )}
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
  customer, orders, loading, onBack, branches, canEdit, canCallCreate, onRefresh,
}: {
  customer: CustomerRow;
  orders: OrderRow[];
  loading: boolean;
  onBack: () => void;
  branches: BranchOption[];
  canEdit: boolean;
  canCallCreate: boolean;
  onRefresh: () => Promise<void> | void;
}) {
  const branchName = (id: string | null) =>
    id ? (branches.find((b) => b.id === id)?.name || id) : "—";
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>← العودة لنتائج البحث</Button>
        {canEdit && !customer.do_not_call && (
          <EnableDoNotCallDialog customerId={customer.id} onDone={onRefresh} />
        )}
      </div>

      {customer.do_not_call && (
        <Alert variant="destructive">
          <PhoneOff className="h-4 w-4" />
          <AlertTitle>الزبون طلب عدم الاتصال</AlertTitle>
          <AlertDescription>
            {customer.do_not_call_reason ? <>السبب: {customer.do_not_call_reason}<br /></> : null}
            {customer.do_not_call_at ? <>بتاريخ {fmtDate(customer.do_not_call_at)}</> : null}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader><CardTitle>ملف الزبون</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Info label="الاسم" value={customer.full_name || "—"} />
          <Info label="الهاتف" value={<span dir="ltr">{customer.display_phone}</span>} />
          <Info label="آخر فرع" value={branchName(customer.last_known_branch_id)} />
          <Info label="عدد الطلبات" value={String(customer.total_orders_cached ?? 0)} />
          <Info label="آخر طلب" value={fmtDate(customer.last_order_at_cached)} />
        </CardContent>
      </Card>

      {canEdit && (
        <EditCustomerCard customer={customer} branches={branches} onDone={onRefresh} />
      )}

      {canCallCreate && !customer.do_not_call && (
        <NewCallCard customer={customer} orders={orders} onDone={onRefresh} />
      )}

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
                    <TableCell>{branchName(o.branch_id)}</TableCell>
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

function EditCustomerCard({
  customer, branches, onDone,
}: { customer: CustomerRow; branches: BranchOption[]; onDone: () => Promise<void> | void }) {
  const [name, setName] = useState(customer.full_name || "");
  const [branchId, setBranchId] = useState<string>(customer.last_known_branch_id || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(customer.full_name || "");
    setBranchId(customer.last_known_branch_id || "");
  }, [customer.id, customer.full_name, customer.last_known_branch_id]);

  const changed =
    (name.trim() !== (customer.full_name || "").trim()) ||
    (branchId !== (customer.last_known_branch_id || ""));

  const save = async () => {
    if (!changed) return;
    setSaving(true);
    const { error } = await supabase.rpc("feedback_upsert_customer" as any, {
      p_phone: customer.display_phone,
      p_full_name: name.trim() || null,
      p_branch_id: branchId || null,
    });
    setSaving(false);
    if (error) { toast.error(rpcErr(error)); return; }
    toast.success("تم حفظ التعديلات");
    await onDone();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">تعديل بيانات الزبون</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div className="space-y-1">
          <Label>الاسم</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الزبون" />
        </div>
        <div className="space-y-1">
          <Label>الفرع</Label>
          <Select value={branchId || "__none"} onValueChange={(v) => setBranchId(v === "__none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— بدون فرع —</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={save} disabled={!changed || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="mr-2">حفظ</span>
        </Button>
      </CardContent>
    </Card>
  );
}

function NewCallCard({
  customer, orders, onDone,
}: { customer: CustomerRow; orders: OrderRow[]; onDone: () => Promise<void> | void }) {
  const [outcome, setOutcome] = useState<string>("answered");
  const [sentiment, setSentiment] = useState<string>("");
  const [rating, setRating] = useState<string>("");
  const [note, setNote] = useState("");
  const [complaint, setComplaint] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [needsFollowup, setNeedsFollowup] = useState(false);
  const [followupDue, setFollowupDue] = useState<string>("");
  const [relatedOrderId, setRelatedOrderId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const ccOrders = orders.filter((o) => o.source === "call_center_orders");

  const submit = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("feedback_log_call" as any, {
      p_customer_id: customer.id,
      p_outcome: outcome,
      p_sentiment: sentiment || null,
      p_rating: rating ? Number(rating) : null,
      p_complaint_text: complaint || null,
      p_suggestion_text: suggestion || null,
      p_note: note || null,
      p_needs_followup: needsFollowup,
      p_followup_due_at: needsFollowup && followupDue ? new Date(followupDue).toISOString() : null,
      p_related_order_id: relatedOrderId || null,
    });
    setSaving(false);
    if (error) { toast.error(rpcErr(error)); return; }
    toast.success("تم تسجيل المكالمة");
    setOutcome("answered"); setSentiment(""); setRating("");
    setNote(""); setComplaint(""); setSuggestion("");
    setNeedsFollowup(false); setFollowupDue(""); setRelatedOrderId("");
    await onDone();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PhoneCall className="h-4 w-4" /> تسجيل مكالمة جديدة
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>نتيجة المكالمة *</Label>
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>التقييم العام</Label>
          <Select value={sentiment || "__none"} onValueChange={(v) => setSentiment(v === "__none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="اختياري" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— بدون —</SelectItem>
              {SENTIMENTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>التقييم (1-5)</Label>
          <Input type="number" min={1} max={5} value={rating} onChange={(e) => setRating(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>ربط بطلبية (اختياري)</Label>
          <Select value={relatedOrderId || "__none"} onValueChange={(v) => setRelatedOrderId(v === "__none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="بدون" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— بدون —</SelectItem>
              {ccOrders.map((o) => (
                <SelectItem key={o.order_id} value={o.order_id}>
                  {fmtDate(o.created_at)} — {o.total ?? 0}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>ملاحظة</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>
        <div className="space-y-1">
          <Label>شكوى</Label>
          <Textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={2} />
        </div>
        <div className="space-y-1">
          <Label>اقتراح</Label>
          <Textarea value={suggestion} onChange={(e) => setSuggestion(e.target.value)} rows={2} />
        </div>
        <div className="md:col-span-2 flex items-center gap-2">
          <Checkbox id="needs-fu" checked={needsFollowup} onCheckedChange={(v) => setNeedsFollowup(!!v)} />
          <Label htmlFor="needs-fu" className="cursor-pointer">يحتاج متابعة</Label>
          {needsFollowup && (
            <Input
              type="datetime-local"
              value={followupDue}
              onChange={(e) => setFollowupDue(e.target.value)}
              className="max-w-xs"
            />
          )}
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button onClick={submit} disabled={saving || (needsFollowup && !followupDue)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
            <span className="mr-2">تسجيل المكالمة</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EnableDoNotCallDialog({
  customerId, onDone,
}: { customerId: string; onDone: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 3) {
      toast.error("السبب مطلوب (3 أحرف على الأقل)");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("feedback_enable_do_not_call" as any, {
      p_customer_id: customerId,
      p_reason: reason.trim(),
    });
    setSaving(false);
    if (error) { toast.error(rpcErr(error)); return; }
    toast.success("تم تفعيل عدم الاتصال");
    setOpen(false); setReason("");
    await onDone();
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Ban className="h-4 w-4 ml-1" /> تفعيل عدم الاتصال
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تفعيل "لا يرغب بالاتصال"</DialogTitle>
            <DialogDescription>
              لا يمكن التراجع عن هذا الإجراء من الواجهة. الرجاء كتابة سبب واضح.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>السبب *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              تأكيد التفعيل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}