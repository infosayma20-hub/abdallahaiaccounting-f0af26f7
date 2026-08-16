import React from "react";
import { Button } from "@/components/ui/button";
import { hardRefreshToLatest } from "@/utils/versionUtils";
import { APP_BUILD } from "@/config/appVersion";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; message: string; recovering: boolean };

const CHUNK_PATTERNS = [
  "Importing a module script failed",
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Unable to preload CSS",
  "ChunkLoadError",
];

function isChunkError(message: string) {
  return CHUNK_PATTERNS.some((p) => message.includes(p)) || /\/assets\/.*\.(js|css)/.test(message);
}

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: "", recovering: false };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error || "تعذّر تشغيل الصفحة");
    return { hasError: true, message, recovering: isChunkError(message) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info);
    const message = error instanceof Error ? error.message : String(error || "");
    if (!isChunkError(message)) return;
    // النسخة المخزّنة قديمة والملف المطلوب لم يعد موجوداً — نظّف وحدّث تلقائياً
    void hardRefreshToLatest(APP_BUILD, "chunk").then((ok) => {
      if (!ok) this.setState({ recovering: false });
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.state.recovering) {
      return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-[#0D1B2E] p-6 font-[Cairo] text-white" dir="rtl">
          <div className="w-full max-w-md text-center space-y-4">
            <img src="/logos/unify-mark-navy.png" alt="Unify ERP" className="mx-auto h-16 w-16 object-contain" />
            <h1 className="text-xl font-bold">جارٍ تحميل أحدث نسخة…</h1>
            <p className="text-sm text-white/70">بدون فقدان تسجيل الدخول</p>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-[#0D1B2E] p-6 font-[Cairo] text-white" dir="rtl">
        <div className="w-full max-w-md text-center space-y-5">
          <img src="/logos/unify-mark-navy.png" alt="Unify ERP" className="mx-auto h-16 w-16 object-contain" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">تعذّر فتح الشاشة</h1>
            <p className="text-sm leading-7 text-white/80">
              حدث خطأ أثناء تشغيل هذه الصفحة. اضغط إعادة التشغيل ليتم تحميل أحدث نسخة بدون فقدان تسجيل الدخول.
            </p>
          </div>
          {this.state.message && (
            <div className="rounded-lg bg-white/10 px-3 py-2 text-xs text-white/70" dir="ltr">
              {this.state.message.slice(0, 180)}
            </div>
          )}
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => void hardRefreshToLatest(APP_BUILD, `manual-${Date.now()}`)}
          >
            تنظيف وإعادة التشغيل
          </Button>
        </div>
      </div>
    );
  }
}