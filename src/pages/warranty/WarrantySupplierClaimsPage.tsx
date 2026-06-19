import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Building2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";
import { format } from "date-fns";

interface SupClaim {
  id: string;
  claim_number: string;
  supplier_id: string;
  claim_date: string;
  total_cost: number;
  supplier_coverage_amount: number;
  our_cost: number;
  status: string;
  resolution_date: string | null;
  notes: string | null;
  supplier?: { contact_name: string };
}

const STATUS_BADGE: Record<string, { label: string; variant: any }> = {
  pending: { label: "بانتظار الرد", variant: "default" },
  approved: { label: "موافقة كاملة", variant: "outline" },
  partial: { label: "موافقة جزئية", variant: "secondary" },
  rejected: { label: "مرفوضة", variant: "destructive" },
};

export default function WarrantySupplierClaimsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [claims, setClaims] = useState<SupClaim[]>([]);
  const [search, setSearch] = useState("");
  const [resolveOpen, setResolveOpen] = useState<SupClaim | null>(null);
  const [resolveForm, setResolveForm] = useState({
    status: "approved",
    actual_coverage: 0,
    notes: "",
  });

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("warranty_supplier_claims")
      .select("*, supplier:contacts(contact_name)")
      .eq("user_id", dataOwnerId!)
      .order("created_at", { ascending: false });
    setClaims((data as any) || []);
  };

  useEffect(() => { load(); }, [user]);

  const resolve = async () => {
    if (!user || !resolveOpen) return;
    const c = resolveOpen;
    const coverage = resolveForm.status === "rejected" ? 0 : resolveForm.actual_coverage;
    const ourCost = c.total_cost - coverage;

    // Update supplier claim
    const { error: updErr } = await supabase
      .from("warranty_supplier_claims")
      .update({
        status: resolveForm.status,
        supplier_coverage_amount: coverage,
        our_cost: ourCost,
        resolution_date: new Date().toISOString().slice(0, 10),
        notes: resolveForm.notes || c.notes,
      })
      .eq("id", c.id);
    if (updErr) { toast.error(updErr.message); return; }

    // Create accounting entry if approved
    if (coverage > 0) {
      // Find supplier's linked account
      const { data: contact } = await supabase
        .from("contacts")
        .select("linked_account_code")
        .eq("id", c.supplier_id)
        .single();

      if (contact?.linked_account_code) {
        // مدين: ذمم موردين | دائن: إيراد تعويضات ضمان (نستخدم 4900 أو ما هو متاح)
        const { data: tx } = await supabase
          .from("transactions")
          .insert({
            user_id: dataOwnerId!,
            description: `تعويض ضمان من المورد - ${c.claim_number}`,
            amount: coverage,
            currency: "شيكل",
            transaction_type: "تعويض ضمان",
            debit_account_code: contact.linked_account_code,
            credit_account_code: "4900",
            transaction_date: new Date().toISOString().slice(0, 10),
            contact_id: c.supplier_id,
            reference: c.claim_number,
          })
          .select("id")
          .single();
        if (tx) {
          await supabase.from("warranty_supplier_claims").update({ transaction_id: tx.id }).eq("id", c.id);
        }
      }
    }

    toast.success("تم حفظ القرار");
    setResolveOpen(null);
    setResolveForm({ status: "approved", actual_coverage: 0, notes: "" });
    load();
  };

  const filtered = claims.filter((c) =>
    !search || c.claim_number.toLowerCase().includes(search.toLowerCase())
    || c.supplier?.contact_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" dir="rtl">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/warranty")}>
          <ArrowRight className="h-5 w-5" />
        </Button>
        <Building2 className="h-6 w-6 text-violet-600" />
        <div>
          <h1 className="text-2xl font-bold">مطالبات الشركة الأم</h1>
          <p className="text-sm text-muted-foreground">تعويضات الموردين عن أعطال الكفالة</p>
        </div>
      </div>

      <Card className="p-4 mb-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-10" placeholder="رقم المطالبة أو اسم المورد..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>رقم المطالبة</TableHead>
              <TableHead>التاريخ</TableHead>
              <TableHead>المورد</TableHead>
              <TableHead>التكلفة الإجمالية</TableHead>
              <TableHead>تعويض المورد</TableHead>
              <TableHead>تكلفتنا</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-left">إجراء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">لا توجد مطالبات</TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-sm">{c.claim_number}</TableCell>
                  <TableCell>{format(new Date(c.claim_date), "yyyy-MM-dd")}</TableCell>
                  <TableCell>{c.supplier?.contact_name || "—"}</TableCell>
                  <TableCell>{c.total_cost.toFixed(2)}</TableCell>
                  <TableCell className="text-emerald-600">{c.supplier_coverage_amount.toFixed(2)}</TableCell>
                  <TableCell className="text-orange-600">{c.our_cost.toFixed(2)}</TableCell>
                  <TableCell><Badge variant={STATUS_BADGE[c.status]?.variant}>{STATUS_BADGE[c.status]?.label}</Badge></TableCell>
                  <TableCell>
                    {c.status === "pending" ? (
                      <Button size="sm" onClick={() => { setResolveForm({ status: "approved", actual_coverage: c.supplier_coverage_amount, notes: "" }); setResolveOpen(c); }}>
                        تسجيل الرد
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!resolveOpen} onOpenChange={(v) => !v && setResolveOpen(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تسجيل رد المورد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>قرار المورد</Label>
              <Select value={resolveForm.status} onValueChange={(v) => setResolveForm({ ...resolveForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">موافقة كاملة</SelectItem>
                  <SelectItem value="partial">موافقة جزئية</SelectItem>
                  <SelectItem value="rejected">رفض</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {resolveForm.status !== "rejected" && (
              <div>
                <Label>المبلغ المعتمد من المورد</Label>
                <Input type="number" min={0} max={resolveOpen?.total_cost} value={resolveForm.actual_coverage} onChange={(e) => setResolveForm({ ...resolveForm, actual_coverage: Number(e.target.value) })} />
                <p className="text-xs text-muted-foreground mt-1">سيُنشأ قيد محاسبي تلقائياً (مدين: ذمم المورد، دائن: إيراد تعويضات)</p>
              </div>
            )}
            <div>
              <Label>ملاحظات</Label>
              <Input value={resolveForm.notes} onChange={(e) => setResolveForm({ ...resolveForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(null)}>إلغاء</Button>
            <Button onClick={resolve}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
