// Floating quick-actions launcher visible across all CRM pages.
// Triggers existing creation flows via search params (no duplicated logic).

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X, UserPlus, Target, ListChecks, FileText, DollarSign } from "lucide-react";

interface Action {
  label: string;
  icon: any;
  color: string;
  bg: string;
  onClick: () => void;
}

export default function CrmQuickActionsFab() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const actions: Action[] = [
    {
      label: "عميل محتمل جديد",
      icon: UserPlus,
      color: "#0369A1",
      bg: "#E0F2FE",
      onClick: () => navigate("/crm/leads?new=1"),
    },
    {
      label: "فرصة بيع جديدة",
      icon: Target,
      color: "#7C3AED",
      bg: "#EDE9FE",
      onClick: () => navigate("/crm/pipeline?new=1"),
    },
    {
      label: "متابعة / مهمة",
      icon: ListChecks,
      color: "#C2410C",
      bg: "#FFEDD5",
      onClick: () => navigate("/crm/activities?new=1"),
    },
    {
      label: "فاتورة جديدة",
      icon: FileText,
      color: "#15803D",
      bg: "#DCFCE7",
      onClick: () => navigate("/invoices/new"),
    },
    {
      label: "سند قبض",
      icon: DollarSign,
      color: "#A16207",
      bg: "#FEF3C7",
      onClick: () => navigate("/vouchers/receipts/new"),
    },
  ];

  return (
    <div className="fixed bottom-6 left-6 z-40" dir="rtl">
      {/* Action buttons (popover) */}
      {open && (
        <div className="absolute bottom-16 left-0 flex flex-col gap-2 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                onClick={() => { a.onClick(); setOpen(false); }}
                className="flex items-center gap-2.5 bg-white rounded-full pr-3 pl-4 h-11 shadow-lg border border-slate-200 hover:border-slate-300 hover:shadow-xl transition-all whitespace-nowrap group"
              >
                <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: a.bg }}>
                  <Icon className="h-4 w-4" style={{ color: a.color }} />
                </span>
                <span className="text-[12px] font-semibold text-slate-700 group-hover:text-slate-900">{a.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Backdrop click-out */}
      {open && (
        <div className="fixed inset-0 -z-10" onClick={() => setOpen(false)} />
      )}

      {/* Main FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="إجراءات سريعة"
        className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl hover:shadow-2xl transition-all hover:scale-105"
        style={{ background: open ? "#475569" : "linear-gradient(135deg, #1B3A5C, #2C5985)" }}
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>
    </div>
  );
}
