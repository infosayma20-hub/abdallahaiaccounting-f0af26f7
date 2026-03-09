import { X } from "lucide-react";
import type { ZidniFinancialData } from "@/pages/SmartAccountantPage";

interface Props {
  open: boolean;
  onClose: () => void;
  data: HaseebFinancialData;
}

const fmt = (n: number) => `₪${Math.abs(n).toLocaleString()}`;

const NotificationsSheet = ({ open, onClose, data }: Props) => {
  if (!open) return null;

  const alerts: { title: string; desc: string; color: string }[] = [];
  
  if (data.cash + data.bank < 0) {
    alerts.push({ title: "🔴 سيولة سالبة", desc: "رصيدك النقدي والبنكي سالب — راجع مصروفاتك", color: "#DC2626" });
  }
  if (data.receivables > data.totalSales * 0.5) {
    alerts.push({ title: "⚠️ ذمم مرتفعة", desc: `الذمم المدينة ${fmt(data.receivables)} تتجاوز 50% من المبيعات`, color: "#D97706" });
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[200]" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[201] bg-white rounded-t-[20px] overflow-y-auto"
        style={{ maxHeight: "50vh", paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full" style={{ background: "#E2E8F0" }} />
        </div>

        <div className="flex items-center justify-between px-5 pb-4">
          <h2 className="text-base font-bold" style={{ color: "#0A2342", fontFamily: "Tajawal, sans-serif" }}>
            تنبيهات {alerts.length > 0 && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] text-white mr-1" style={{ background: "#DC2626" }}>{alerts.length}</span>}
          </h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full" style={{ background: "#F1F5F9" }}>
            <X className="h-4 w-4" style={{ color: "#8B9BB4" }} />
          </button>
        </div>

        <div className="px-5 pb-6">
          {alerts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-base font-bold" style={{ color: "#0A2342" }}>✅ كل شيء سليم</p>
              <p className="text-[13px] mt-1" style={{ color: "#8B9BB4" }}>لا توجد تنبيهات حالياً</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className="rounded-xl p-3 bg-white" style={{ borderRight: `4px solid ${a.color}` }}>
                  <p className="text-[13px] font-bold" style={{ color: "#0A2342" }}>{a.title}</p>
                  <p className="text-xs mt-1 leading-[1.7]" style={{ color: "#8B9BB4" }}>{a.desc}</p>
                  <div className="flex gap-2 mt-2 justify-end">
                    <button className="text-[11px] px-3 py-1.5 rounded-lg" style={{ color: "#8B9BB4" }}>تجاهل</button>
                    <button className="text-[11px] px-3 py-1.5 rounded-lg font-bold" style={{ background: "#F1F5F9", color: "#0A2342" }}>راجع</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default NotificationsSheet;
