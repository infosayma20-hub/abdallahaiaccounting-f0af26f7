import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, ArrowLeft } from "lucide-react";
import { SECTORS, SECTOR_TEMPLATES, type Sector, type SectorPreset } from "./sectorTemplates";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called when user picks a preset — returns templateType + data to prefill. */
  onPick: (preset: SectorPreset) => void;
}

const TYPE_LABELS: Record<string, string> = {
  QUO: "عرض سعر", CON: "عقد", DEM: "مطالبة", DN: "إشعار مدين",
  CN: "إشعار دائن", RCP: "وصل", SUP: "عقد توريد", OD: "تأخر سداد",
  POA: "تفويض", CLR: "إخلاء طرف",
};

const SectorTemplateLibrary = ({ open, onOpenChange, onPick }: Props) => {
  const [selectedSector, setSelectedSector] = useState<Sector | null>(null);

  const handleClose = () => {
    setSelectedSector(null);
    onOpenChange(false);
  };

  const handlePick = (preset: SectorPreset) => {
    onPick(preset);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="w-5 h-5 text-primary" />
            مكتبة القوالب الجاهزة
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            اختر قالباً جاهزاً حسب طبيعة عملك — يتم تعبئة الحقول تلقائياً مع إمكانية التعديل لاحقاً.
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {!selectedSector ? (
            // Sector selection
            <div className="grid grid-cols-2 gap-3 py-2">
              {SECTORS.map((sector) => {
                const count = SECTOR_TEMPLATES[sector.id].length;
                return (
                  <button
                    key={sector.id}
                    onClick={() => setSelectedSector(sector.id)}
                    className="group flex flex-col items-start gap-2 p-4 rounded-lg border border-border bg-card hover:border-primary hover:shadow-md transition-all text-right"
                  >
                    <div className="text-3xl">{sector.emoji}</div>
                    <div className="font-semibold text-base">{sector.label}</div>
                    <p className="text-xs text-muted-foreground">{sector.description}</p>
                    <div className="text-[11px] text-primary font-medium mt-1">
                      {count} قالب جاهز ←
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            // Preset list
            <div className="space-y-3 py-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSector(null)}
                className="gap-1"
              >
                <ArrowLeft className="w-4 h-4" />
                رجوع للقطاعات
              </Button>

              <div className="grid gap-2">
                {SECTOR_TEMPLATES[selectedSector].map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePick(preset)}
                    className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-right"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold">{preset.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                          {TYPE_LABELS[preset.templateType] || preset.templateType}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{preset.description}</p>
                    </div>
                    <Sparkles className="w-4 h-4 text-primary shrink-0 mt-1" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default SectorTemplateLibrary;