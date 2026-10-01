/** الاتصال بالموازين الإلكترونية عبر جسر الطباعة المحلي (scale-addon). */
import { getPrintBridgeUrl } from "@/lib/print-bridge-client";
import { withLocalNetworkAccess } from "@/lib/local-network-fetch";

async function call<T>(path: string, body: unknown, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${getPrintBridgeUrl()}${path}`, withLocalNetworkAccess({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    }));
    if (res.status === 404) throw new Error("نسخة جسر الطباعة على هذا الكمبيوتر لا تدعم الموازين بعد — حدّث الجسر.");
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) throw new Error(data?.error || "فشل الاتصال بالميزان");
    return data as T;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("انتهت مهلة الاتصال بالميزان");
    if (e instanceof TypeError) throw new Error("تعذّر الوصول لجسر الطباعة على هذا الكمبيوتر");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export interface DiscoveredScale { ip: string; port: number; }

export const scalePing = (ip: string, port: number) =>
  call<{ ok: boolean; elapsedMs: number }>("/scale/ping", { ip, port }, 6000);

export const scaleDiscover = (port: number) =>
  call<{ ok: boolean; found: DiscoveredScale[] }>("/scale/discover", { port }, 60000);

export interface ScaleExportItem { plu: number; key_no: number | null; name: string; price: number; unit: string; shelf_life_days: number; barcode: string | null; }

export const scaleExport = (ip: string, port: number, model: string, items: ScaleExportItem[]) =>
  call<{ ok: boolean; sent: number; file?: string; message?: string }>("/scale/export", { ip, port, model, items }, 120000);
