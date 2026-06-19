import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, AlertCircle, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";
import { format } from "date-fns";

interface Claim {
  id: string;
  claim_number: string;
  warranty_card_id: string;
  claim_date: string;
  issue_description: string;
  claim_type: string;
  resolution: string | null;
  cost: number;
  status: string;
  card?: { card_number: string; serial_number: string | null; product?: { name_ar: string }; contact_name: string | null };
}

const STATUS_BADGE: Record<string, { label: string; variant: any }> = {
  open: { label: "مفتوحة", variant: "default" },
  in_progress: { label: "قيد المعالجة", variant: "secondary" },
  resolved: { label: "مغلقة", variant: "outline" },
  rejected: { label: "مرفوضة", variant: "destructive" },
};

const TYPE_LABELS: Record<string, string> = {
  replacement: "استبدال",
  repair: "إصلاح",
  refund: "رد المبلغ",
  rejected: "رفض",
};

export default function WarrantyClaimsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cardIdFromUrl = searchParams.get("card");

  const [claims, setClaims] = useState<Claim[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState<Claim | null>(null);
  const [card, setCard] = useState<any>(null);
  const [form, setForm] = useState({
    issue_description: "",
    claim_type: "repair",
  });
  const [resolveForm, setResolveForm] = useState({
    resolution: "repair",
    cost: 0,
    notes: "",
    create_supplier_claim: false,
  });

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("warranty_claims")
      .select("*, card:warranty_cards(card_number, serial_number, contact_name, product:products(name_ar))")
      .eq("user_id", dataOwnerId!)
      .order("created_at", { ascending: false });
    setClaims((data as any) || []);
  };

  useEffect(() => { load(); }, [user]);

  // If ?card=ID, open new claim dialog
  useEffect(() => {
    if (!cardIdFromUrl || !user) return;
    supabase.from("warranty_cards")
      .select("*, product:products(name_ar), policy:warranty_policies(*)")
      .eq("id", cardIdFromUrl)
      .single()
      .then(({ data }) => {
        if (data) {
          setCard(data);
          setOpen(true);
        }
      });
  }, [cardIdFromUrl, user]);

  const create = async () => {
    if (!user || !card) return;
    if (!form.issue_description.trim()) {
      toast.error("اكتب وصف الخراب");
      return;
    }
    const { error } = await supabase.from("warranty_claims").insert({
      user_id: dataOwnerId!,
      warranty_card_id: card.id,
      issue_description: form.issue_description,
      claim_type: form.claim_type,
      status: "open",
      claim_number: "",
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("تم تسجيل المطالبة");
    setOpen(false);
    setForm({ issue_description: "", claim_type: "repair" });
    setCard(null);
    navigate("/warranty/claims", { replace: true });
    load();
  };

  const resolve = async () => {
    if (!user || !resolveOpen) return;
    const claim = resolveOpen;
    let supplierClaimId: string | null = null;

    // Optional: create supplier claim
    if (resolveForm.create_supplier_claim && claim.card) {
      const { data: cardFull } = await supabase
        .from("warranty_cards")
        .select("policy:warranty_policies(supplier_id, supplier_covers)")
        .eq("id", claim.warranty_card_id)
        .single();
      const policy = (cardFull as any)?.policy;
      if (policy?.supplier_id && policy.supplier_covers > 0) {
        const coverage = (resolveForm.cost * policy.supplier_covers) / 100;
        const { data: sup, error: supErr } = await supabase
          .from("warranty_supplier_claims")
          .insert({
            user_id: dataOwnerId!,
            supplier_id: policy.supplier_id,
            total_cost: resolveForm.cost,
            supplier_coverage_amount: coverage,
            our_cost: resolveForm.cost - coverage,
            status: "pending",
            notes: `من المطالبة ${claim.claim_number}`,
            claim_number: "",
          } as any)
          .select("id")
          .single();
        if (!supErr && sup) supplierClaimId = sup.id;
      } else {
        toast.warning("الصنف لا يحوي شركة أم أو نسبة تغطية");
      }
    }

    const status = resolveForm.resolution === "rejected" ? "rejected" : "resolved";
    const { error } = await supabase
      .from("warranty_claims")
      .update({
        resolution: resolveForm.resolution,
        resolution_date: new Date().toISOString().slice(0, 10),
        resolution_notes: resolveForm.notes || null,
        cost: resolveForm.cost,
        supplier_claim_id: supplierClaimId,
        status,
      })
      .eq("id", claim.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم تحديث المطالبة");
    setResolveOpen(null);
    setResolveForm({ resolution: "repair", cost: 0, notes: "", create_supplier_claim: false });
    load();
  };

  const filtered = claims.filter((c) =>
    !search || c.claim_number.toLowerCase().includes(search.toLowerCase())
    || c.card?.card_number?.toLowerCase().includes(search.toLowerCase())
    || c.card?.contact_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" dir="rtl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/warranty")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <AlertCircle className="h-6 w-6 text-amber-600" />
          <div>
            <h1 className="text-2xl font-bold">مطالبات الكفالة</h1>
            <p className="text-sm text-muted-foreground">تسجيل ومتابعة الأعطال</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate("/warranty/cards")}>
          <Plus className="h-4 w-4 ml-2" /> من بطاقة
        </Button>
      </div>

      <Card className="p-4 mb-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-10" placeholder="رقم المطالبة، البطاقة، أو العميل..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>رقم المطالبة</TableHead>
              <TableHead>التاريخ</TableHead>
              <TableHead>البطاقة / الصنف</TableHead>
              <TableHead>العميل</TableHead>
              <TableHead>المشكلة</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>التكلفة</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-left">إجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">لا توجد مطالبات</TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-sm">{c.claim_number}</TableCell>
                  <TableCell>{format(new Date(c.claim_date), "yyyy-MM-dd")}</TableCell>
                  <TableCell>
                    <div className="text-sm">{c.card?.card_number}</div>
                    <div className="text-xs text-muted-foreground">{c.card?.product?.name_ar}</div>
                  </TableCell>
                  <TableCell>{c.card?.contact_name || "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{c.issue_description}</TableCell>
                  <TableCell><Badge variant="secondary">{TYPE_LABELS[c.claim_type] || c.claim_type}</Badge></TableCell>
                  <TableCell>{c.cost > 0 ? c.cost.toFixed(2) : "—"}</TableCell>
                  <TableCell><Badge variant={STATUS_BADGE[c.status]?.variant}>{STATUS_BADGE[c.status]?.label}</Badge></TableCell>
                  <TableCell>
                    {["open", "in_progress"].includes(c.status) ? (
                      <Button size="sm" onClick={() => { setResolveForm({ resolution: c.claim_type, cost: 0, notes: "", create_supplier_claim: false }); setResolveOpen(c); }}>
                        إغلاق المطالبة
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* New Claim Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCard(null); navigate("/warranty/claims", { replace: true }); } }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>مطالبة كفالة جديدة</DialogTitle>
          </DialogHeader>
          {card && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 bg-muted/30 text-sm space-y-1">
                <div><span className="text-muted-foreground">البطاقة:</span> <span className="font-mono">{card.card_number}</span></div>
                <div><span className="text-muted-foreground">الصنف:</span> {card.product?.name_ar}</div>
                {card.serial_number && <div><span className="text-muted-foreground">السيريال:</span> <span className="font-mono">{card.serial_number}</span></div>}
                <div><span className="text-muted-foreground">العميل:</span> {card.contact_name}</div>
              </div>
              <div>
                <Label>وصف الخراب *</Label>
                <Textarea rows={3} value={form.issue_description} onChange={(e) => setForm({ ...form, issue_description: e.target.value })} placeholder="مثال: الشاشة لا تعمل..." />
              </div>
              <div>
                <Label>نوع المطالبة</Label>
                <Select value={form.claim_type} onValueChange={(v) => setForm({ ...form, claim_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="repair">إصلاح</SelectItem>
                    <SelectItem value="replacement">استبدال</SelectItem>
                    <SelectItem value="refund">رد المبلغ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={create}>تسجيل المطالبة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={!!resolveOpen} onOpenChange={(v) => !v && setResolveOpen(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إغلاق المطالبة {resolveOpen?.claim_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>القرار</Label>
              <Select value={resolveForm.resolution} onValueChange={(v) => setResolveForm({ ...resolveForm, resolution: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="repair">تم الإصلاح</SelectItem>
                  <SelectItem value="replacement">تم الاستبدال</SelectItem>
                  <SelectItem value="refund">رد المبلغ</SelectItem>
                  <SelectItem value="rejected">رفض المطالبة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {resolveForm.resolution !== "rejected" && (
              <div>
                <Label>التكلفة (شيكل)</Label>
                <Input type="number" min={0} value={resolveForm.cost} onChange={(e) => setResolveForm({ ...resolveForm, cost: Number(e.target.value) })} />
              </div>
            )}
            <div>
              <Label>ملاحظات</Label>
              <Textarea rows={2} value={resolveForm.notes} onChange={(e) => setResolveForm({ ...resolveForm, notes: e.target.value })} />
            </div>
            {resolveForm.resolution !== "rejected" && resolveForm.cost > 0 && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={resolveForm.create_supplier_claim} onChange={(e) => setResolveForm({ ...resolveForm, create_supplier_claim: e.target.checked })} />
                إنشاء مطالبة مع الشركة الأم تلقائياً
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(null)}>إلغاء</Button>
            <Button onClick={resolve}>حفظ القرار</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
