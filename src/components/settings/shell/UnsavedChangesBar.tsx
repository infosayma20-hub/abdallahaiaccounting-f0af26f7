import { useEffect, useState } from "react";
import { Save, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  visible: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard?: () => void;
}

/**
 * Sticky footer that appears whenever there are unsaved changes.
 * Also wires a `beforeunload` warning so users don't lose changes by accident.
 */
export function UnsavedChangesBar({ visible, saving, onSave, onDiscard }: Props) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [visible]);

  if (!visible) return null;

  return (
    <>
    <div
      className="sticky bottom-0 left-0 right-0 z-20 border-t border-border bg-card/95 backdrop-blur px-5 py-2.5 flex items-center justify-between gap-3 shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.15)]"
      dir="rtl"
      role="status"
    >
      <div className="flex items-center gap-2 text-[12.5px] text-foreground">
        <span className="inline-block w-2 h-2 rounded-full bg-amber-500" aria-hidden />
        لديك تغييرات غير محفوظة
      </div>
      <div className="flex items-center gap-2">
        {onDiscard && (
          <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(true)} disabled={saving} className="h-8 gap-1.5 text-[12.5px]">
            <X className="h-3.5 w-3.5" />
            إهمال
          </Button>
        )}
        <Button size="sm" onClick={onSave} disabled={saving} className="h-8 gap-1.5 text-[12.5px] min-w-24">
          {saving ? (
            <>
              <RotateCcw className="h-3.5 w-3.5 animate-spin" />
              جارٍ الحفظ
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" />
              حفظ التغييرات
            </>
          )}
        </Button>
      </div>
    </div>
    <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>إهمال التغييرات؟</AlertDialogTitle>
          <AlertDialogDescription>
            سيتم إرجاع القيم إلى آخر نسخة محفوظة وفقدان أي تعديلات لم تُحفظ.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>تراجع</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onDiscard?.();
              setConfirmDiscard(false);
            }}
          >
            إهمال التغييرات
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
