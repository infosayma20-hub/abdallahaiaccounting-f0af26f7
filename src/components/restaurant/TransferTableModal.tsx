import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowRightLeft, CheckCircle, XCircle, Armchair } from "lucide-react";

interface Table {
  id: string;
  name: string;
  seats: number;
  status: string;
  current_order_id: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  sourceTable: Table | null;
  allTables: Table[];
  userId: string;
  onDone: () => void;
}

export default function TransferTableModal({ open, onClose, sourceTable, allTables, userId, onDone }: Props) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  if (!sourceTable) return null;

  const availableTables = allTables.filter(t => t.id !== sourceTable.id && t.status === "available");
  const occupiedTables = allTables.filter(t => t.id !== sourceTable.id && t.status === "occupied");

  const handleTransfer = async () => {
    if (!selectedTarget || !sourceTable.current_order_id) return;
    setTransferring(true);

    try {
      // Move order to new table
      await supabase
        .from("pos_orders")
        .update({ table_id: selectedTarget } as any)
        .eq("id", sourceTable.current_order_id);

      // Free source table
      await supabase.from("restaurant_tables").update({
        status: "available",
        current_order_id: null,
        current_guests: 0,
        occupied_at: null,
      }).eq("id", sourceTable.id);

      // Occupy target table
      await supabase.from("restaurant_tables").update({
        status: "occupied",
        current_order_id: sourceTable.current_order_id,
        current_guests: sourceTable.seats,
        occupied_at: new Date().toISOString(),
      }).eq("id", selectedTarget);

      toast.success("تم نقل الطلب بنجاح");
      onDone();
    } catch (err) {
      toast.error("خطأ في نقل الطلب");
    } finally {
      setTransferring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            نقل طلب {sourceTable.name} إلى:
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {availableTables.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">طاولات فارغة</p>
              {availableTables.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTarget(t.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                    selectedTarget === t.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle className={`w-4 h-4 ${selectedTarget === t.id ? "text-primary" : "text-emerald-500"}`} />
                    <span className="font-medium text-foreground">{t.name}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Armchair className="w-3 h-3" />
                    {t.seats} كراسي
                  </div>
                </button>
              ))}
            </div>
          )}

          {occupiedTables.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">طاولات مشغولة (دمج)</p>
              {occupiedTables.map(t => (
                <button
                  key={t.id}
                  disabled
                  className="w-full flex items-center justify-between p-3 rounded-xl border-2 border-border opacity-50 cursor-not-allowed"
                >
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-foreground">{t.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">مشغولة</span>
                </button>
              ))}
            </div>
          )}

          {availableTables.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">لا توجد طاولات فارغة للنقل</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button disabled={!selectedTarget || transferring} onClick={handleTransfer}>
            {transferring ? "جاري النقل..." : "تأكيد النقل"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
