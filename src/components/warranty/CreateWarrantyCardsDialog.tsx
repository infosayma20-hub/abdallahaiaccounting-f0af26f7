import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, Plus, Trash2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

interface InvoiceItemLite {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
}

interface Policy {
  id: string;
  product_id: string;
  duration_months: number;
  has_serial: boolean;
  warranty_type: string;
}

interface ItemRow {
  invoice_item_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  policy: Policy | null;
  serials: string[]; // length = quantity
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoiceId: string;
  contactId?: string | null;
  contactName?: string | null;
  invoiceDate: string; // ISO date
}

export default function CreateWarrantyCardsDialog({
  open, onOpenChange, invoiceId, contactId, contactName, invoiceDate,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ItemRow[]>([]);

  useEffect(() => {
    if (!open || !user || !invoiceId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Fetch invoice items
        const { data: items } = await supabase
          .from("invoice_items")
          .select("id, product_id, product_name, quantity")
          .eq("invoice_id", invoiceId);

        const itemsList = (items || []) as InvoiceItemLite[];
        const productIds = itemsList.map(i => i.product_id).filter(Boolean) as string[];

        // Fetch policies for those products
        let policies: Policy[] = [];
        if (productIds.length) {
          const { data: pols } = await supabase
            .from("warranty_policies" as any)
            .select("id, product_id, duration_months, has_serial, warranty_type")
            .eq("user_id", dataOwnerId!)
            .in("product_id", productIds);
          policies = (pols || []) as any;
        }

        // Fetch existing cards for this invoice to skip duplicates
        const { data: existing } = await supabase
          .from("warranty_cards" as any)
          .select("invoice_item_id")
          .eq("invoice_id", invoiceId);
        const existingItemIds = new Set((existing || []).map((c: any) => c.invoice_item_id));

        const built: ItemRow[] = itemsList
          .filter(it => it.product_id && !existingItemIds.has(it.id))
          .map(it => {
            const policy = policies.find(p => p.product_id === it.product_id) || null;
            const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
            return {
              invoice_item_id: it.id,
              product_id: it.product_id!,
              product_name: it.product_name,
              quantity: qty,
              policy,
              serials: Array(qty).fill(""),
            };
          })
          .filter(r => r.policy); // only items with a policy

        if (!cancelled) setRows(built);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, user, invoiceId]);

  const updateSerial = (rowIdx: number, serialIdx: number, val: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      const serials = [...r.serials];
      serials[serialIdx] = val;
      return { ...r, serials };
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const inserts: any[] = [];
      for (const row of rows) {
        if (!row.policy) continue;
        const needsSerial = row.policy.has_serial;
        // One card per unit (per serial) — most accurate
        for (let i = 0; i < row.quantity; i++) {
          const serial = row.serials[i]?.trim() || null;
          if (needsSerial && !serial) {
            toast({
              title: "السيريال مطلوب",
              description: `الصنف "${row.product_name}" يتطلب رقم سيريال للوحدة #${i + 1}`,
              variant: "destructive",
            });
            setSaving(false);
            return;
          }
          inserts.push({
            user_id: user.id,
            invoice_id: invoiceId,
            invoice_item_id: row.invoice_item_id,
            product_id: row.product_id,
            contact_id: contactId || null,
            contact_name: contactName || null,
            serial_number: serial,
            quantity: 1,
            start_date: invoiceDate,
            status: "active",
          });
        }
      }

      if (!inserts.length) {
        toast({ title: "لا توجد بطاقات للإنشاء", variant: "destructive" });
        setSaving(false);
        return;
      }

      const { error } = await supabase.from("warranty_cards" as any).insert(inserts);
      if (error) throw error;

      toast({
        title: "تم إنشاء البطاقات",
        description: `${inserts.length} بطاقة كفالة جديدة`,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-600" />
            إنشاء بطاقات الكفالة
          </DialogTitle>
          <DialogDescription>
            بطاقة لكل وحدة من بنود الفاتورة التي تملك سياسة كفالة. أدخل السيريال للأصناف التي تتطلبه.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-orange-500" />
            <p className="font-medium">لا توجد أصناف قابلة لإنشاء بطاقة كفالة</p>
            <p className="text-xs mt-1">
              إما لا توجد سياسات كفالة معرّفة لأصناف هذه الفاتورة، أو تم إنشاء بطاقات لها مسبقاً.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((row, rowIdx) => (
              <Card key={row.invoice_item_id} className="p-4">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div>
                    <div className="font-semibold">{row.product_name}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary">الكمية: {row.quantity}</Badge>
                      {row.policy && (
                        <Badge variant="outline">
                          مدة الكفالة: {row.policy.duration_months} شهر
                        </Badge>
                      )}
                      {row.policy?.has_serial && (
                        <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20">
                          سيريال إجباري
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {row.serials.map((serial, sIdx) => (
                    <div key={sIdx}>
                      <Label className="text-xs text-muted-foreground">
                        سيريال الوحدة #{sIdx + 1}
                        {row.policy?.has_serial && <span className="text-destructive mr-1">*</span>}
                      </Label>
                      <Input
                        value={serial}
                        onChange={(e) => updateSerial(rowIdx, sIdx, e.target.value)}
                        placeholder={row.policy?.has_serial ? "أدخل السيريال" : "اختياري"}
                        className="font-mono text-sm"
                      />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || rows.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Plus className="h-4 w-4 ml-2" />}
            إنشاء البطاقات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
