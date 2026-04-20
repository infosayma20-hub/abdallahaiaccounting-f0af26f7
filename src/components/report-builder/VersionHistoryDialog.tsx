import { useEffect, useState } from "react";
import { History, RotateCcw, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface Version {
  id: string;
  version_number: number;
  snapshot: any;
  change_note: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  reportId: string | null;
  onClose: () => void;
  onRestored?: () => void;
}

export default function VersionHistoryDialog({ open, reportId, onClose, onRestored }: Props) {
  const { toast } = useToast();
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !reportId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("custom_report_versions")
        .select("id, version_number, snapshot, change_note, created_at")
        .eq("report_id", reportId)
        .order("version_number", { ascending: false });
      setVersions((data as any) || []);
      setLoading(false);
    })();
  }, [open, reportId]);

  const handleRestore = async (v: Version) => {
    if (!reportId) return;
    setRestoring(v.id);
    const snap = v.snapshot || {};
    const { error } = await supabase
      .from("custom_reports")
      .update({
        name: snap.name,
        description: snap.description,
        data_source: snap.data_source,
        columns: snap.columns,
        filters: snap.filters,
        group_by: snap.group_by,
        sort_by: snap.sort_by,
        chart_type: snap.chart_type,
      })
      .eq("id", reportId);
    setRestoring(null);
    if (error) {
      toast({ title: "تعذّر الاستعادة", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `تمت استعادة النسخة #${v.version_number}` });
    onRestored?.();
    onClose();
  };

  const summarize = (snap: any) => {
    const cols = Array.isArray(snap?.columns) ? snap.columns.length : 0;
    const grp = snap?.group_by && snap.group_by !== "none" ? snap.group_by : null;
    const chart = snap?.chart_type && snap.chart_type !== "none" ? snap.chart_type : null;
    const parts = [`${cols} عمود`];
    if (grp) parts.push(`تجميع: ${grp}`);
    if (chart) parts.push(`مخطط: ${chart}`);
    return parts.join(" • ");
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> سجل النسخ
          </DialogTitle>
          <DialogDescription className="text-xs">
            كل تعديل يُحفظ تلقائياً. يمكنك استعادة أي نسخة سابقة.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <Clock className="h-10 w-10 mx-auto mb-2 opacity-30" />
              لا توجد نسخ سابقة بعد. أي تعديل لاحق سيُحفظ هنا.
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map(v => (
                <div
                  key={v.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/60 hover:border-primary/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">نسخة #{v.version_number}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(v.created_at), "yyyy-MM-dd HH:mm", { locale: ar })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {v.snapshot?.name && (
                        <span className="font-medium text-foreground">{v.snapshot.name} • </span>
                      )}
                      {summarize(v.snapshot)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs shrink-0"
                    onClick={() => handleRestore(v)}
                    disabled={!!restoring}
                  >
                    {restoring === v.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    استعادة
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
