import { useState, useRef, ReactNode } from "react";
import { Maximize2, Minimize2, Download } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import html2canvas from "html2canvas";
import { useToast } from "@/hooks/use-toast";

interface Props {
  title: string;
  children: ReactNode;
}

/**
 * Wraps a chart with a toolbar that supports:
 * - Download as PNG
 * - Fullscreen view
 */
export default function ChartToolbar({ title, children }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const inlineRef = useRef<HTMLDivElement | null>(null);
  const fsRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  const downloadPng = async () => {
    const target = (fullscreen ? fsRef.current : inlineRef.current);
    if (!target) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(target, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "chart"}_${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({ title: "تم تنزيل الرسم ✅" });
    } catch (e: any) {
      toast({ title: "خطأ في التنزيل", description: e.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="relative" ref={inlineRef}>
        <div className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 bg-background/85 backdrop-blur border border-border rounded-lg p-0.5 shadow-sm">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={downloadPng}
            disabled={downloading}
            title="تنزيل كصورة PNG"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setFullscreen(true)}
            title="ملء الشاشة"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        {children}
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent
          dir="rtl"
          className="max-w-[95vw] w-[95vw] h-[92vh] p-0 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
            <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "Cairo, sans-serif" }}>
              {title}
            </h3>
            <div className="inline-flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={downloadPng}
                disabled={downloading}
                className="gap-1.5 h-8 text-xs"
              >
                <Download className="h-3.5 w-3.5" /> تنزيل PNG
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setFullscreen(false)}
                title="خروج"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div ref={fsRef} className="flex-1 p-6 bg-background overflow-auto" style={{ height: "calc(92vh - 56px)" }}>
            <div style={{ height: "100%", minHeight: "500px" }}>{children}</div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
