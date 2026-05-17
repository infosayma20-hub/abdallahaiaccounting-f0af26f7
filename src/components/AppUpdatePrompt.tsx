import { useState } from "react";
import { useAppUpdateAvailable } from "@/hooks/useAppUpdateAvailable";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw } from "lucide-react";

const AppUpdatePrompt = () => {
  const { updateAvailable, dismiss, refreshNow } = useAppUpdateAvailable();
  const [refreshing, setRefreshing] = useState(false);
  // build-bump: trigger update popup test

  if (!updateAvailable) return null;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshNow();
  };

  return (
    <div
      dir="rtl"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:bottom-6 z-[9998] sm:max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <div className="rounded-2xl border border-border bg-card/95 backdrop-blur shadow-2xl p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-foreground leading-tight">
              يوجد تحديث جديد للنظام
            </h3>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              تم نشر نسخة أحدث من أموالي. اضغط تحديث الآن للحصول على آخر التعديلات.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                تحديث الآن
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={dismiss}
                disabled={refreshing}
              >
                لاحقاً
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppUpdatePrompt;
