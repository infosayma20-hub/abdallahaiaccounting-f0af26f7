import { useState } from "react";
import { Plus, X, Receipt, FileText, Users, TrendingDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { smartNavigate } from "@/lib/smartNavigate";

const actions = [
  { icon: Receipt, label: "قيد جديد", path: "/finance/journal/new", color: "bg-primary text-primary-foreground" },
  { icon: FileText, label: "فاتورة", path: "/invoices", color: "bg-warning text-warning-foreground" },
  { icon: Users, label: "زبون", path: "/contacts", color: "bg-accent text-accent-foreground" },
  { icon: TrendingDown, label: "مصروف", path: "/transactions", color: "bg-destructive text-destructive-foreground" },
];

const FloatingActionButton = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50">
      {/* Radial actions */}
      <div className={`absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 transition-all duration-300 ${open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"}`}>
        {actions.map((action, i) => (
          <button
            key={action.label}
            onClick={(e) => { smartNavigate(e, action.path, navigate); setOpen(false); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg ${action.color} text-xs font-semibold transition-all duration-300 hover:scale-105 active:scale-95`}
            style={{ transitionDelay: open ? `${i * 50}ms` : "0ms" }}
          >
            <action.icon className="h-4 w-4" />
            {action.label}
          </button>
        ))}
      </div>

      {/* Main FAB */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setOpen(!open)}
            className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 ${
              open
                ? "bg-foreground text-background rotate-45 scale-90"
                : "bg-primary text-primary-foreground scale-100 hover:scale-105"
            }`}
            style={{ boxShadow: open ? undefined : "0 4px 20px hsl(152 45% 42% / 0.35)" }}
          >
            {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top"><p>{open ? "إغلاق" : "إضافة سريعة"}</p></TooltipContent>
      </Tooltip>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-background/60 backdrop-blur-sm -z-10"
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
};

export default FloatingActionButton;
