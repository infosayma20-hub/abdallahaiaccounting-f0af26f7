import { useEffect, useState } from "react";

declare const __APP_BUILD_TIME__: string;

/**
 * VersionBadge — مؤشر إصدار صغير غير مزعج في زاوية الشاشة.
 * يساعد المستخدم/الدعم لمعرفة إن كان يرى أحدث نسخة منشورة (vs cache قديم).
 * صيغة العرض: vYYYY.MM.DD.N (N = ربع الساعة من اليوم) مأخوذة من __APP_BUILD_TIME__.
 * نقرة واحدة تنسخ الإصدار للحافظة لتسهيل التبليغ عن المشاكل.
 */
export default function VersionBadge() {
  const [copied, setCopied] = useState(false);

  let label = "v—";
  try {
    const d = new Date(__APP_BUILD_TIME__);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    // فهرس الإصدار خلال اليوم (كل 15 دقيقة → رقم 1-96)، يساعد على التمييز عند نشر متعدد بنفس اليوم.
    const slot = Math.floor((d.getHours() * 60 + d.getMinutes()) / 15) + 1;
    label = `v${yyyy}.${mm}.${dd}.${slot}`;
  } catch {
    /* keep default */
  }

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(label);
      setCopied(true);
    } catch {
      /* noop */
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={`إصدار النظام — اضغط للنسخ\n${label}\nإذا لم تظهر آخر التحديثات: Ctrl + Shift + R`}
      aria-label={`إصدار النظام ${label}`}
      className="fixed bottom-1 left-1 z-[60] px-1.5 py-0.5 rounded text-[9px] leading-none font-mono tabular-nums text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 bg-background/40 backdrop-blur-sm border border-border/40 select-none print:hidden pointer-events-auto"
      dir="ltr"
    >
      {copied ? "✓ تم النسخ" : label}
    </button>
  );
}