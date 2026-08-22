import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import { useTT } from "@/i18n/dict";

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const Kbd = ({ children }: { children: string }) => (
  <kbd className="inline-flex items-center justify-center min-w-[24px] h-5 px-1 rounded bg-secondary border border-border text-[10px] font-mono font-semibold text-foreground shadow-sm">
    {children}
  </kbd>
);

const ShortcutRow = ({ keys, label }: { keys: string; label: string }) => (
  <div className="flex items-center justify-between py-0.5">
    <span className="text-[11px] text-foreground">{label}</span>
    <div className="flex items-center gap-0.5">
      {keys.split("+").map((k, i) => (
        <span key={i} className="flex items-center gap-0.5">
          {i > 0 && <span className="text-[9px] text-muted-foreground">+</span>}
          <Kbd>{k.trim()}</Kbd>
        </span>
      ))}
    </div>
  </div>
);

const KeyboardShortcutsModal = ({ open, onClose }: KeyboardShortcutsModalProps) => {
  const tt = useTT();
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pb-1">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Keyboard className="h-4 w-4 text-primary" />
            {tt("اختصارات لوحة المفاتيح")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-secondary/30 rounded-lg p-2.5 space-y-0.5">
            <h3 className="text-[10px] font-bold text-primary mb-1">📄 {tt("إنشاء سريع")}</h3>
            <ShortcutRow keys="Alt + I" label={tt("فاتورة جديدة")} />
            <ShortcutRow keys="Alt + R" label={tt("سند قبض")} />
            <ShortcutRow keys="Alt + E" label={tt("سند صرف")} />
            <ShortcutRow keys="Alt + J" label={tt("سند قيد")} />
          </div>

          <div className="bg-secondary/30 rounded-lg p-2.5 space-y-0.5">
            <h3 className="text-[10px] font-bold text-primary mb-1">🗂️ {tt("التبويبات")}</h3>
            <ShortcutRow keys="Alt + W" label={tt("إغلاق التبويب")} />
            <ShortcutRow keys="Alt + →" label={tt("التالي")} />
            <ShortcutRow keys="Alt + ←" label={tt("السابق")} />
            <ShortcutRow keys="Alt + 1-9" label={tt("تبويب رقم X")} />
          </div>

          <div className="bg-secondary/30 rounded-lg p-2.5 space-y-0.5">
            <h3 className="text-[10px] font-bold text-primary mb-1">🧭 {tt("تنقل")}</h3>
            <ShortcutRow keys="Alt + F" label={tt("بحث سريع")} />
            <ShortcutRow keys="Alt + K" label={tt("كشف حساب")} />
            <ShortcutRow keys="Alt + N" label={tt("إنشاء جديد")} />
            <ShortcutRow keys="Ctrl + /" label={tt("هذه النافذة")} />
          </div>

          <div className="bg-secondary/30 rounded-lg p-2.5 space-y-0.5">
            <h3 className="text-[10px] font-bold text-primary mb-1">⚡ {tt("إجراءات")}</h3>
            <ShortcutRow keys="Ctrl + S" label={tt("حفظ")} />
            <ShortcutRow keys="Alt + P" label={tt("طباعة")} />
            <ShortcutRow keys="Esc" label={tt("إغلاق النوافذ")} />
          </div>

          <div className="bg-secondary/30 rounded-lg p-2.5 space-y-0.5">
            <h3 className="text-[10px] font-bold text-primary mb-1">👥 {tt("جهات وصناديق")}</h3>
            <ShortcutRow keys="Alt + C" label={tt("الزبائن")} />
            <ShortcutRow keys="Alt + M" label={tt("الموردين")} />
            <ShortcutRow keys="Alt + S" label={tt("الصناديق")} />
            <ShortcutRow keys="Alt + Q" label={tt("الشيكات")} />
          </div>

          <div className="bg-secondary/30 rounded-lg p-2.5 space-y-0.5">
            <h3 className="text-[10px] font-bold text-primary mb-1">📊 {tt("تقارير ومخزون")}</h3>
            <ShortcutRow keys="Alt + X" label={tt("المخزون")} />
            <ShortcutRow keys="Alt + L" label={tt("دفتر الأستاذ")} />
            <ShortcutRow keys="Alt + T" label={tt("ميزان المراجعة")} />
          </div>
        </div>

        <p className="text-[9px] text-muted-foreground text-center pt-1 border-t border-border/30">
          <Kbd>Ctrl</Kbd> <span className="mx-0.5">+</span> <Kbd>/</Kbd> {tt("لفتح هذه النافذة")}
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default KeyboardShortcutsModal;
