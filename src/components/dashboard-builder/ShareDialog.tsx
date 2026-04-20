/**
 * ShareDialog — مشاركة لوحة كرابط عام + تصدير PDF/PNG.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Copy, Check, FileDown, ImageDown, Link2, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboard: { id: string; name: string; is_shared: boolean; share_token?: string | null };
  onUpdated: () => void;
  onExportPNG: () => Promise<void>;
  onExportPDF: () => Promise<void>;
}

export default function ShareDialog({ open, onOpenChange, dashboard, onUpdated, onExportPNG, onExportPDF }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "png" | null>(null);

  const shareUrl = dashboard.share_token
    ? `${window.location.origin}/share/dashboard/${dashboard.share_token}`
    : "";

  const toggleShare = async (next: boolean) => {
    setBusy(true);
    const { error } = await supabase
      .from("custom_dashboards")
      .update({ is_shared: next })
      .eq("id", dashboard.id);
    setBusy(false);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    toast({ title: next ? "تم تفعيل المشاركة" : "تم إيقاف المشاركة" });
    onUpdated();
  };

  const regenerate = async () => {
    setBusy(true);
    await supabase.from("custom_dashboards").update({ is_shared: false }).eq("id", dashboard.id);
    const { error } = await supabase.from("custom_dashboards").update({ is_shared: true }).eq("id", dashboard.id);
    setBusy(false);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    toast({ title: "تم تجديد الرابط" });
    onUpdated();
  };

  const copy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleExport = async (kind: "pdf" | "png") => {
    setExporting(kind);
    try {
      if (kind === "pdf") await onExportPDF();
      else await onExportPNG();
      toast({ title: "تم التصدير بنجاح" });
    } catch (e: any) {
      toast({ title: "فشل التصدير", description: e.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> مشاركة وتصدير
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">رابط عام</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">يمكن لأي شخص لديه الرابط عرض اللوحة (للقراءة فقط)</p>
              </div>
              <Switch checked={dashboard.is_shared} onCheckedChange={toggleShare} disabled={busy} />
            </div>

            {dashboard.is_shared && shareUrl && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <Input value={shareUrl} readOnly className="text-xs" />
                  <Button size="icon" variant="outline" onClick={copy} title="نسخ">
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <Button size="sm" variant="ghost" onClick={regenerate} disabled={busy} className="gap-1.5 text-[11px] h-7">
                  <RefreshCw className="h-3 w-3" /> تجديد الرابط
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border p-3">
            <div className="text-sm font-semibold text-foreground mb-2">تصدير</div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => handleExport("pdf")} disabled={exporting !== null} className="gap-2 h-10">
                {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                PDF
              </Button>
              <Button variant="outline" onClick={() => handleExport("png")} disabled={exporting !== null} className="gap-2 h-10">
                {exporting === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
                PNG
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
