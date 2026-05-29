declare const __APP_BUILD_TIME__: string;

function buildDate(value: string): Date | null {
  const source = String(value || "");
  const isoDate = source.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?/)?.[0];
  const d = new Date(isoDate || source);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** صيغة العرض الموحّدة للإصدار: vYYYY.MM.DD.N (N = ربع الساعة من اليوم) */
export function getAppVersionLabel(): string {
  try {
    const d = buildDate(__APP_BUILD_TIME__);
    if (!d) return "v—";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const slot = Math.floor((d.getHours() * 60 + d.getMinutes()) / 15) + 1;
    return `v${yyyy}.${mm}.${dd}.${slot}`;
  } catch {
    return "v—";
  }
}