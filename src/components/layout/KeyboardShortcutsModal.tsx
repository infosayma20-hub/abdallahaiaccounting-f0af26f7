import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

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
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="pb-1">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Keyboard className="h-4 w-4 text-primary" />
            اختصارات لوحة المفاتيح
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-secondary/30 rounded-lg p-2.5 space-y-0.5">
            <h3 className="text-[10px] font-bold text-primary mb-1">📄 إنشاء سريع</h3>
            <ShortcutRow keys="F1" label="فاتورة جديدة" />
            <ShortcutRow keys="F2" label="سند قبض" />
            <ShortcutRow keys="F3" label="سند صرف" />
            <ShortcutRow keys="F4" label="سند قيد" />
          </div>

          <div className="bg-secondary/30 rounded-lg p-2.5 space-y-0.5">
            <h3 className="text-[10px] font-bold text-primary mb-1">🗂️ التبويبات</h3>
            <ShortcutRow keys="Alt + W" label="إغلاق التبويب" />
            <ShortcutRow keys="Alt + →" label="التالي" />
            <ShortcutRow keys="Alt + ←" label="السابق" />
            <ShortcutRow keys="Alt + 1-9" label="تبويب رقم X" />
          </div>

          <div className="bg-secondary/30 rounded-lg p-2.5 space-y-0.5">
            <h3 className="text-[10px] font-bold text-primary mb-1">🧭 تنقل</h3>
            <ShortcutRow keys="Alt + F" label="بحث سريع" />
            <ShortcutRow keys="Alt + K" label="كشف حساب" />
            <ShortcutRow keys="Alt + N" label="إنشاء جديد" />
            <ShortcutRow keys="Ctrl + /" label="هذه النافذة" />
          </div>

          <div className="bg-secondary/30 rounded-lg p-2.5 space-y-0.5">
            <h3 className="text-[10px] font-bold text-primary mb-1">⚡ إجراءات</h3>
            <ShortcutRow keys="Ctrl + S" label="حفظ" />
            <ShortcutRow keys="Alt + P" label="طباعة" />
            <ShortcutRow keys="Esc" label="إغلاق النوافذ" />
          </div>

          <div className="bg-secondary/30 rounded-lg p-2.5 space-y-0.5">
            <h3 className="text-[10px] font-bold text-primary mb-1">👥 جهات وصناديق</h3>
            <ShortcutRow keys="Alt + C" label="الزبائن" />
            <ShortcutRow keys="Alt + M" label="الموردين" />
            <ShortcutRow keys="Alt + S" label="الصناديق" />
            <ShortcutRow keys="Alt + Q" label="الشيكات" />
          </div>

          <div className="bg-secondary/30 rounded-lg p-2.5 space-y-0.5">
            <h3 className="text-[10px] font-bold text-primary mb-1">📊 تقارير ومخزون</h3>
            <ShortcutRow keys="Alt + I" label="المخزون" />
            <ShortcutRow keys="Alt + L" label="دفتر الأستاذ" />
            <ShortcutRow keys="Alt + T" label="ميزان المراجعة" />
            
          </div>
        </div>

        <p className="text-[9px] text-muted-foreground text-center pt-1 border-t border-border/30">
          <Kbd>Ctrl</Kbd> <span className="mx-0.5">+</span> <Kbd>/</Kbd> لفتح هذه النافذة
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default KeyboardShortcutsModal;
