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

/** استخراج رابط الملف الفاشل من نص الخطأ (متاح في Chrome/Edge/Firefox). */
function extractAssetUrl(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err || "");
  const m = msg.match(/https?:\/\/[^\s"')]+\.(?:js|mjs|css)/);
  return m ? m[0] : null;
}

/**
 * هل الملف فعلاً غير موجود على الخادم (404) أم مجرد فشل شبكة؟
 * 404 ⇒ النسخة المخزّنة في المتصفح قديمة وتشير لملفات محذوفة بعد نشر جديد.
 */
async function assetIsGone(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}__probe=${Date.now()}`, {
      method: "GET",
      cache: "reload",
    });
    return res.status === 404 || res.status === 403;
  } catch {
    return false; // فشل شبكة — ليس حذفاً
  }
}

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
        // المتصفح يخزّن نتيجة الاستيراد الفاشلة، لذا نعيد المحاولة برابط
        // يحمل بصمة زمنية لتجاوز الكاش قبل الانتقال للمحاولة التالية.
        const url = extractAssetUrl(err);
        if (url) {
          if (await assetIsGone(url)) break; // 404 مؤكد ⇒ لا فائدة من التكرار
          try {
            return await (import(/* @vite-ignore */ `${url}?retry=${Date.now()}`) as Promise<{ default: T }>);
          } catch {
            /* تابع دورة الانتظار */
          }
        }
        await sleep(delays[attempt]);
      }
    }
    if (isChunkError(lastError)) {
      // فشل مستمر ⇒ الأرجح أن النسخة المخزّنة تشير لملفات لم تعد موجودة.
      void hardRefreshToLatest(APP_BUILD, "chunk");
    }
    throw lastError;
  });
}
