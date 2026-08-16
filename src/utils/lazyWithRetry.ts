import { lazy as reactLazy, type ComponentType } from "react";
import { hardRefreshToLatest } from "@/utils/versionUtils";
import { APP_BUILD } from "@/config/appVersion";

type Factory<T extends ComponentType<any>> = () => Promise<{ default: T }>;

const CHUNK_PATTERNS = [
  "Importing a module script failed",
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Unable to preload CSS",
  "ChunkLoadError",
  "Load failed",
];

function isChunkError(err: unknown) {
  const msg = err instanceof Error ? `${err.message} ${err.name}` : String(err || "");
  return CHUNK_PATTERNS.some((p) => msg.includes(p)) || /\/assets\/.*\.(js|css)/.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * React.lazy مع إعادة محاولة.
 *
 * السبب: على شبكات الجوال البطيئة (3G) يفشل تحميل ملف الشاشة (chunk) لمرة واحدة
 * فيرمي المتصفح "Importing a module script failed" وتظهر شاشة الخطأ رغم أن
 * الملف موجود على الخادم. نعيد المحاولة ثلاث مرات قبل أي إجراء أقسى، وفقط إذا
 * بقي الفشل نعتبر النسخة قديمة (ملفات محذوفة بعد نشر جديد) فننظّف ونحدّث.
 */
export function lazyRetry<T extends ComponentType<any>>(factory: Factory<T>) {
  return reactLazy(async () => {
    const delays = [400, 1200, 2500];
    let lastError: unknown;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        return await factory();
      } catch (err) {
        lastError = err;
        if (!isChunkError(err) || attempt === delays.length) break;
        await sleep(delays[attempt]);
      }
    }
    if (isChunkError(lastError)) {
      // فشل مستمر ⇒ الأرجح أن النسخة المخزّنة تشير لملفات لم تعد موجودة.
      void hardRefreshToLatest(APP_BUILD);
    }
    throw lastError;
  });
}
