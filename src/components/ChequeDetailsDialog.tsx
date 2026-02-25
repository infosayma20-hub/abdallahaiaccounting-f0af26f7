import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ImagePlus, X, FileText, Hash, Calendar, Banknote, Building2 } from "lucide-react";
import { toast } from "sonner";

export interface ChequeLineItem {
  chequeNumber: string;
  bankName: string;
  chequeDate: string;
  amount: string;
  currency: string;
  imageFile?: File | null;
  imagePreview?: string;
}

interface ChequeDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chequeType: "وارد" | "صادر";
  partyName: string;
  partyType: string;
  originalText: string;
  initialData?: {
    amount?: number;
    currency?: string;
    chequeDate?: string;
    chequeNumber?: string;
    bankName?: string;
  };
  onConfirm: (lines: ChequeLineItem[], chequeType: string, partyName: string, partyType: string) => void;
}

const emptyChequeItem = (): ChequeLineItem => ({
  chequeNumber: "",
  bankName: "",
  chequeDate: "",
  amount: "",
  currency: "شيكل",
  imageFile: null,
  imagePreview: "",
});

const ChequeDetailsDialog = ({
  open,
  onOpenChange,
  chequeType,
  partyName,
  partyType,
  originalText,
  initialData,
  onConfirm,
}: ChequeDetailsDialogProps) => {
  const makeInitialLine = (): ChequeLineItem => ({
    chequeNumber: initialData?.chequeNumber || "",
    bankName: initialData?.bankName || "",
    chequeDate: initialData?.chequeDate || "",
    amount: initialData?.amount ? String(initialData.amount) : "",
    currency: initialData?.currency || "شيكل",
    imageFile: null,
    imagePreview: "",
  });

  const [lines, setLines] = useState<ChequeLineItem[]>([makeInitialLine()]);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset lines when dialog opens with new data
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLines([makeInitialLine()]);
  }
  if (open !== lastOpen) setLastOpen(open);

  const updateLine = (index: number, field: keyof ChequeLineItem, value: any) => {
    setLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  const addLine = () => {
    setLines(prev => [...prev, emptyChequeItem()]);
  };

  const removeLine = (index: number) => {
    if (lines.length === 1) return;
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  const handleImageSelect = (index: number, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      updateLine(index, "imageFile", file);
      updateLine(index, "imagePreview", e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (index: number) => {
    updateLine(index, "imageFile", null);
    updateLine(index, "imagePreview", "");
  };

  const validate = (): boolean => {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.amount || parseFloat(l.amount) <= 0) {
        toast.error(`السطر ${i + 1}: المبلغ مطلوب`);
        return false;
      }
      if (!l.chequeDate) {
        toast.error(`السطر ${i + 1}: تاريخ الاستحقاق مطلوب`);
        return false;
      }
      if (!l.chequeNumber) {
        toast.error(`السطر ${i + 1}: رقم الشيك مطلوب`);
        return false;
      }
    }
    return true;
  };

  const handleConfirm = () => {
    if (!validate()) return;
    onConfirm(lines, chequeType, partyName, partyType);
    setLines([emptyChequeItem()]);
    onOpenChange(false);
  };

  const totalAmount = lines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            تفاصيل {chequeType === "وارد" ? "الشيك الوارد" : "الشيك الصادر"}
          </DialogTitle>
        </DialogHeader>

        {/* Party info */}
        <div className="flex items-center justify-between bg-muted/50 rounded-xl p-3">
          <div className="text-sm">
            <span className="text-muted-foreground">{chequeType === "وارد" ? "من" : "إلى"}: </span>
            <span className="font-semibold text-foreground">{partyName}</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {chequeType === "وارد" ? "⬇ وارد" : "⬆ صادر"}
          </Badge>
        </div>

        {/* Cheque lines */}
        <div className="space-y-4">
          {lines.map((line, index) => (
            <div key={index} className="border border-border/50 rounded-xl p-3 space-y-3 relative">
              {lines.length > 1 && (
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-muted-foreground">شيك #{index + 1}</span>
                  <button
                    onClick={() => removeLine(index)}
                    className="p-1 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Row 1: Cheque number + Bank */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    رقم الشيك *
                  </Label>
                  <Input
                    className="h-9 mt-1"
                    value={line.chequeNumber}
                    onChange={(e) => updateLine(index, "chequeNumber", e.target.value)}
                    placeholder="رقم الشيك"
                  />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    البنك
                  </Label>
                  <Input
                    className="h-9 mt-1"
                    value={line.bankName}
                    onChange={(e) => updateLine(index, "bankName", e.target.value)}
                    placeholder="اسم البنك"
                  />
                </div>
              </div>

              {/* Row 2: Amount + Currency */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs flex items-center gap-1">
                    <Banknote className="h-3 w-3" />
                    المبلغ *
                  </Label>
                  <Input
                    className="h-9 mt-1"
                    type="number"
                    value={line.amount}
                    onChange={(e) => updateLine(index, "amount", e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="text-xs">العملة</Label>
                  <Select
                    value={line.currency}
                    onValueChange={(v) => updateLine(index, "currency", v)}
                  >
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="شيكل">شيكل</SelectItem>
                      <SelectItem value="دينار">دينار</SelectItem>
                      <SelectItem value="دولار">دولار</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 3: Date */}
              <div>
                <Label className="text-xs flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  تاريخ الاستحقاق *
                </Label>
                <Input
                  className="h-9 mt-1"
                  type="date"
                  value={line.chequeDate}
                  onChange={(e) => updateLine(index, "chequeDate", e.target.value)}
                />
              </div>

              {/* Image upload */}
              <div>
                {line.imagePreview ? (
                  <div className="relative inline-block">
                    <img
                      src={line.imagePreview}
                      alt="صورة الشيك"
                      className="h-20 rounded-lg border border-border object-cover"
                    />
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute -top-1.5 -right-1.5 p-0.5 bg-destructive text-destructive-foreground rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRefs.current[index]?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    إرفاق صورة الشيك
                  </button>
                )}
                <input
                  ref={(el) => { fileInputRefs.current[index] = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageSelect(index, file);
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Add line button */}
        <button
          onClick={addLine}
          className="flex items-center gap-1.5 w-full justify-center py-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          إضافة شيك آخر
        </button>

        {/* Summary */}
        {lines.length > 0 && (
          <div className="flex items-center justify-between bg-primary/5 rounded-xl p-3">
            <span className="text-xs text-muted-foreground">{lines.length} شيك</span>
            <span className="text-sm font-bold text-foreground">
              إجمالي: {totalAmount.toLocaleString()} {lines[0]?.currency || "شيكل"}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
          <Button
            className="flex-1"
            onClick={handleConfirm}
          >
            تسجيل {lines.length > 1 ? `${lines.length} شيكات` : "الشيك"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChequeDetailsDialog;
