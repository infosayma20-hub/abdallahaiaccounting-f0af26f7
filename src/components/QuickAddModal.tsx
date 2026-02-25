import { useState } from "react";
import { Package, Users, Truck, X } from "lucide-react";

type QuickAddType = "product" | "customer" | "supplier";

interface QuickAddModalProps {
  open: boolean;
  defaultName?: string;
  /** Which category triggered the modal */
  initialType?: "contact" | "product";
  onConfirm: (data: { name: string; type: QuickAddType; isService?: boolean }) => void;
  onCancel: () => void;
}

const typeConfig: Record<QuickAddType, { label: string; icon: typeof Package; color: string }> = {
  product: { label: "منتج / صنف", icon: Package, color: "text-primary" },
  customer: { label: "زبون", icon: Users, color: "text-emerald-500" },
  supplier: { label: "مورد", icon: Truck, color: "text-blue-500" },
};

const QuickAddModal = ({ open, defaultName = "", initialType, onConfirm, onCancel }: QuickAddModalProps) => {
  const [name, setName] = useState(defaultName);
  const [selectedType, setSelectedType] = useState<QuickAddType>(
    initialType === "contact" ? "customer" : "product"
  );
  const [isService, setIsService] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset state when modal opens
  if (!open) return null;

  const handleConfirm = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onConfirm({ name: name.trim(), type: selectedType, isService });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      
      {/* Modal */}
      <div className="relative w-full max-w-sm mx-4 mb-4 sm:mb-0 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-base font-bold text-foreground">إضافة سريعة ⚡</h3>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Type selector pills */}
          <div className="flex gap-2">
            {(Object.entries(typeConfig) as [QuickAddType, typeof typeConfig.product][]).map(([key, cfg]) => {
              const Icon = cfg.icon;
              const active = selectedType === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    setSelectedType(key);
                    if (key !== "product") setIsService(false);
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                    active
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Name input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {selectedType === "product" ? "اسم المنتج" : selectedType === "customer" ? "اسم الزبون" : "اسم المورد"}
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
              placeholder={selectedType === "product" ? "مثال: كابل كهربائي" : "مثال: أحمد محمود"}
              className="w-full h-11 bg-secondary/60 rounded-xl px-4 text-sm text-foreground placeholder:text-muted-foreground border border-border/50 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              dir="rtl"
            />
          </div>

          {/* Product sub-options */}
          {selectedType === "product" && (
            <div className="flex gap-3">
              <button
                onClick={() => setIsService(false)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium border transition-all ${
                  !isService
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <Package className="h-3.5 w-3.5" />
                منتج مخزني
              </button>
              <button
                onClick={() => setIsService(true)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium border transition-all ${
                  isService
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                خدمة
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 h-11 rounded-xl bg-muted/60 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors active:scale-95"
            >
              إلغاء
            </button>
            <button
              onClick={handleConfirm}
              disabled={!name.trim() || saving}
              className="flex-1 h-11 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 transition-all active:scale-95 disabled:opacity-40 shadow-md"
            >
              {saving ? "جارِ الإضافة..." : "إنشاء وإكمال ✓"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickAddModal;
