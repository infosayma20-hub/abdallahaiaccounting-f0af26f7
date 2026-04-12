import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const Kbd = ({ children }: { children: string }) => (
  <kbd className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded-md bg-secondary border border-border text-[11px] font-mono font-semibold text-foreground shadow-sm">
    {children}
  </kbd>
);

const ShortcutRow = ({ keys, label }: { keys: string; label: string }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-[12px] text-foreground">{label}</span>
    <div className="flex items-center gap-1">
      {keys.split("+").map((k, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-[10px] text-muted-foreground">+</span>}
          <Kbd>{k.trim()}</Kbd>
        </span>
      ))}
    </div>
  </div>
);

const KeyboardShortcutsModal = ({ open, onClose }: KeyboardShortcutsModalProps) => {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            اختصارات لوحة المفاتيح
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          {/* Create */}
          <div className="bg-secondary/30 rounded-xl p-3 space-y-1">
            <h3 className="text-[11px] font-bold text-primary mb-2 flex items-center gap-1.5">
              📄 إنشاء سريع
            </h3>
            <ShortcutRow keys="F1" label="فاتورة جديدة" />
            <ShortcutRow keys="F2" label="سند قبض" />
            <ShortcutRow keys="F3" label="سند صرف" />
            <ShortcutRow keys="F4" label="سند قيد" />
          </div>

          {/* Tab Management */}
          <div className="bg-secondary/30 rounded-xl p-3 space-y-1">
            <h3 className="text-[11px] font-bold text-primary mb-2 flex items-center gap-1.5">
              🗂️ إدارة التبويبات
            </h3>
            <ShortcutRow keys="Alt + W" label="إغلاق التبويب" />
            <ShortcutRow keys="Alt + →" label="التبويب التالي" />
            <ShortcutRow keys="Alt + ←" label="التبويب السابق" />
            <ShortcutRow keys="Alt + 1-9" label="انتقال للتبويب رقم X" />
          </div>

          {/* Navigation */}
          <div className="bg-secondary/30 rounded-xl p-3 space-y-1">
            <h3 className="text-[11px] font-bold text-primary mb-2 flex items-center gap-1.5">
              🧭 تنقل
            </h3>
            <ShortcutRow keys="Alt + F" label="بحث سريع" />
            <ShortcutRow keys="Alt + K" label="كشف حساب" />
            <ShortcutRow keys="Alt + N" label="إنشاء جديد" />
            <ShortcutRow keys="Ctrl + /" label="هذه النافذة" />
          </div>

          {/* Actions */}
          <div className="bg-secondary/30 rounded-xl p-3 space-y-1">
            <h3 className="text-[11px] font-bold text-primary mb-2 flex items-center gap-1.5">
              ⚡ إجراءات
            </h3>
            <ShortcutRow keys="Ctrl + S" label="حفظ" />
            <ShortcutRow keys="Alt + P" label="طباعة" />
            <ShortcutRow keys="Esc" label="إغلاق النوافذ" />
          </div>

          {/* Contacts & Finance */}
          <div className="bg-secondary/30 rounded-xl p-3 space-y-1">
            <h3 className="text-[11px] font-bold text-primary mb-2 flex items-center gap-1.5">
              👥 جهات وصناديق
            </h3>
            <ShortcutRow keys="Alt + C" label="الزبائن" />
            <ShortcutRow keys="Alt + M" label="الموردين" />
            <ShortcutRow keys="Alt + S" label="الصناديق" />
            <ShortcutRow keys="Alt + Q" label="الشيكات" />
          </div>

          {/* Reports */}
          <div className="bg-secondary/30 rounded-xl p-3 space-y-1">
            <h3 className="text-[11px] font-bold text-primary mb-2 flex items-center gap-1.5">
              📊 تقارير ومخزون
            </h3>
            <ShortcutRow keys="Alt + I" label="المخزون" />
            <ShortcutRow keys="Alt + L" label="دفتر الأستاذ" />
            <ShortcutRow keys="Alt + T" label="ميزان المراجعة" />
          </div>

          {/* Admin */}
          <div className="bg-secondary/30 rounded-xl p-3 space-y-1 sm:col-span-2">
            <h3 className="text-[11px] font-bold text-primary mb-2 flex items-center gap-1.5">
              🛡️ Super Admin
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <ShortcutRow keys="Alt + A" label="لوحة التحكم الإدارية" />
              <span className="text-[11px] text-muted-foreground flex items-center">لوحة تحكم النظام الكاملة</span>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground text-center mt-2 pt-2 border-t border-border/30">
          اضغط <Kbd>Ctrl</Kbd> <span className="mx-0.5">+</span> <Kbd>/</Kbd> في أي وقت لفتح هذه النافذة
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default KeyboardShortcutsModal;
