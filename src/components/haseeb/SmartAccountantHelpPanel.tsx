import { X, Banknote, BarChart3, UserPlus, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
  onFillInput?: (text: string) => void;
}

const Section = ({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4" style={{ color: "#4A9EE8" }} />
      <h3 className="text-sm font-bold" style={{ color: "#0A2342" }}>{title}</h3>
    </div>
    <div className="h-px" style={{ background: "#E2E8F0" }} />
    {children}
  </div>
);

const Cmd = ({ text, onClick }: { text: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="block w-full text-right text-xs py-1.5 px-2 rounded-lg transition-all hover:bg-[#F1F5F9] active:scale-[0.98]"
    style={{ color: "#334155" }}
  >
    <span className="text-[#8B9BB4]">•</span>{" "}
    {text.split(/(\[.*?\])/g).map((part, i) =>
      part.startsWith("[") ? <span key={i} className="font-bold" style={{ color: "#006D8F" }}>{part}</span> : part
    )}
  </button>
);

const SmartAccountantHelpPanel = ({ open, onClose, onFillInput }: Props) => {
  const handleCmd = (text: string) => {
    onFillInput?.(text);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/30"
            onClick={onClose}
          />
          
          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 250 }}
            className="fixed top-0 right-0 bottom-0 z-[201] w-[360px] max-w-[90vw] bg-white shadow-2xl flex flex-col overflow-hidden"
            dir="rtl"
          >
            {/* Header */}
            <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between" style={{ background: "linear-gradient(135deg, #1B3A5C, #0A2342)" }}>
              <div>
                <h2 className="text-base font-bold text-white">📋 دليل الأوامر</h2>
                <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>اضغط على أي أمر لنسخه للمحاسب</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-all">
                <X className="h-4 w-4 text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              
              <Section icon={Banknote} title="أوامر مالية">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold mb-1" style={{ color: "#8B9BB4" }}>القبض والدفع:</p>
                  <Cmd text="قبضت من [اسم] [مبلغ] [نقداً/شيك]" onClick={() => handleCmd("قبضت من [اسم] [مبلغ] نقداً")} />
                  <Cmd text="دفعت [بيان] [مبلغ] [من البنك/من الصندوق]" onClick={() => handleCmd("دفعت [بيان] [مبلغ] من الصندوق")} />
                  <Cmd text="قبضت شيك من [اسم] بتاريخ [DD/MM]" onClick={() => handleCmd("قبضت شيك من [اسم] بتاريخ ")} />

                  <p className="text-[10px] font-bold mb-1 mt-3" style={{ color: "#8B9BB4" }}>المبيعات والمشتريات:</p>
                  <Cmd text="بعت [عميل] [كمية] [صنف] بـ [سعر] [نقداً/حساب]" onClick={() => handleCmd("بعت [عميل] [كمية] [صنف] بـ [سعر] نقداً")} />
                  <Cmd text="اشتريت من [مورد] [كمية] [صنف] بـ [سعر]" onClick={() => handleCmd("اشتريت من [مورد] [كمية] [صنف] بـ [سعر]")} />
                  <Cmd text="سجل فاتورة لـ[عميل] بمبلغ [X] على الحساب" onClick={() => handleCmd("سجل فاتورة لـ[عميل] بمبلغ [X] على الحساب")} />

                  <p className="text-[10px] font-bold mb-1 mt-3" style={{ color: "#8B9BB4" }}>المصاريف:</p>
                  <Cmd text="دفعت [نوع المصروف] [مبلغ]" onClick={() => handleCmd("دفعت [نوع المصروف] [مبلغ]")} />
                  <Cmd text="سجل مصروف [وصف] [مبلغ]" onClick={() => handleCmd("سجل مصروف [وصف] [مبلغ]")} />
                </div>
              </Section>

              <Section icon={BarChart3} title="استعلامات وتقارير">
                <div className="space-y-0.5">
                  <Cmd text="شو وضعي المالي اليوم؟" onClick={() => handleCmd("شو وضعي المالي اليوم؟")} />
                  <Cmd text="كم عليّ لـ[مورد]؟" onClick={() => handleCmd("كم عليّ لـ[مورد]؟")} />
                  <Cmd text="كم لي عند [عميل]؟" onClick={() => handleCmd("كم لي عند [عميل]؟")} />
                  <Cmd text="اعرض الذمم المتأخرة" onClick={() => handleCmd("اعرض الذمم المتأخرة")} />
                  <Cmd text="كشف حساب [اسم] هذا الشهر" onClick={() => handleCmd("كشف حساب [اسم] هذا الشهر")} />
                  <Cmd text="اعرض أرباح وخسائر [الشهر/السنة]" onClick={() => handleCmd("اعرض أرباح وخسائر هذا الشهر")} />
                </div>
              </Section>

              <Section icon={UserPlus} title="إضافة جهات وأصناف">
                <div className="space-y-0.5">
                  <Cmd text="أضف زبون [اسم]" onClick={() => handleCmd("أضف زبون [اسم]")} />
                  <Cmd text="أضف مورد [اسم]" onClick={() => handleCmd("أضف مورد [اسم]")} />
                  <Cmd text="أضف منتج [اسم] شراء [X] بيع [Y]" onClick={() => handleCmd("أضف منتج [اسم] شراء [X] بيع [Y]")} />
                </div>
              </Section>

              <Section icon={AlertTriangle} title="تنبيهات ذكية">
                <div className="space-y-0.5">
                  <Cmd text="نبّهني عن الشيكات المستحقة" onClick={() => handleCmd("نبّهني عن الشيكات المستحقة")} />
                  <Cmd text="من لم يسدد منذ 30 يوم؟" onClick={() => handleCmd("من لم يسدد منذ 30 يوم؟")} />
                  <Cmd text="شو المخزون المنخفض؟" onClick={() => handleCmd("شو المخزون المنخفض؟")} />
                </div>
              </Section>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#E2E8F0]">
              <button
                onClick={onClose}
                className="w-full py-3 rounded-2xl text-sm font-bold transition-all active:scale-[0.98]"
                style={{ background: "#1B3A5C", color: "white" }}
              >
                إغلاق
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SmartAccountantHelpPanel;
