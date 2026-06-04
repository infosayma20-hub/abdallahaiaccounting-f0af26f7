/**
 * /pos/diagnostics — Read-only POS diagnostics page (Phase 1).
 *
 * Reads bridge /health, queries pos_printers (subject to RLS), and
 * classifies the result. Does NOT mutate device.json, does NOT change
 * RLS, does NOT touch the sales flow. Safe to expose to all users.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getBridgeUrl, getDeviceBranchId, getDeviceTerminalId } from "@/lib/device-config";
import { withLocalNetworkAccess } from "@/lib/local-network-fetch";
import {
  classifyDiagnostics,
  logPosDiagnostic,
  type DiagnosticResult,
} from "@/lib/pos-diagnostics-classifier";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCcw, Download, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BridgeHealth {
  status?: string;
  version?: string;
  online?: boolean;
  configured?: boolean;
  printersSource?: string;
  printersCount?: number;
  branchId?: string | null;
  terminalId?: string | null;
  raw?: unknown;
}

interface Snapshot {
  takenAt: string;
  bridgeUrl: string;
  localBranchId: string;
  localTerminalId: string;
  bridgeReachable: boolean;
  bridgeHealth: BridgeHealth | null;
  cloudPrintersCount: number | null;
  cloudQueryError: string | null;
  classification: DiagnosticResult;
  context: {
    isEmbeddedPreview: boolean;
    isSecureContext: boolean;
    userAgent: string;
  };
}

function isEmbeddedPreview() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

async function probeBridge(url: string): Promise<{ reachable: boolean; health: BridgeHealth | null }> {
  if (!url) return { reachable: false, health: null };
  try {
    const res = await fetch(`${url}/health`, withLocalNetworkAccess({ method: "GET" }));
    if (!res.ok) return { reachable: false, health: null };
    const json = (await res.json()) as Record<string, unknown>;
    // The bridge schema varies between versions; we read defensively.
    const printers = Array.isArray((json as any).printers) ? (json as any).printers : null;
    const printersSource =
      (json as any).printersSource ??
      (json as any).printers_source ??
      (printers && printers.length === 0 ? "empty" : undefined);
    const branchId = (json as any).branchId ?? (json as any).device?.branchId ?? null;
    const terminalId = (json as any).terminalId ?? (json as any).device?.terminalId ?? null;
    return {
      reachable: true,
      health: {
        status: (json as any).status,
        version: (json as any).version,
        online: (json as any).online,
        configured: Boolean(branchId && terminalId),
        printersSource,
        printersCount: printers ? printers.length : (json as any).printersCount,
        branchId,
        terminalId,
        raw: json,
      },
    };
  } catch {
    return { reachable: false, health: null };
  }
}

async function queryCloudPrinters(): Promise<{ count: number | null; error: string | null }> {
  try {
    const { count, error } = await supabase
      .from("pos_printers")
      .select("id", { count: "exact", head: true });
    if (error) return { count: null, error: error.message };
    return { count: count ?? 0, error: null };
  } catch (e) {
    return { count: null, error: e instanceof Error ? e.message : String(e) };
  }
}

const STATE_COLORS: Record<string, string> = {
  ok: "bg-emerald-500/15 text-emerald-700 border-emerald-300",
  bridge_offline: "bg-red-500/15 text-red-700 border-red-300",
  bridge_online_unconfigured: "bg-amber-500/15 text-amber-700 border-amber-300",
  printers_blocked_by_rls: "bg-red-500/15 text-red-700 border-red-300",
  printers_fallback: "bg-amber-500/15 text-amber-700 border-amber-300",
  chrome_local_access_blocked: "bg-red-500/15 text-red-700 border-red-300",
  unknown: "bg-muted text-muted-foreground border-border",
};

export default function POSDiagnosticsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const runChecks = useCallback(async () => {
    setLoading(true);
    const bridgeUrl = getBridgeUrl() || "http://127.0.0.1:3001";
    const localBranchId = getDeviceBranchId() ?? "";
    const localTerminalId = getDeviceTerminalId() ?? "";
    const [{ reachable, health }, { count, error }] = await Promise.all([
      probeBridge(bridgeUrl),
      queryCloudPrinters(),
    ]);

    const classification = classifyDiagnostics({
      bridgeReachable: reachable,
      bridgeHealth: health,
      cloudPrintersCount: count,
      cloudQueryError: error,
      isEmbeddedPreview: isEmbeddedPreview(),
      isSecureContext: window.isSecureContext,
    });
    logPosDiagnostic(classification, { bridgeUrl, count, error });

    setSnapshot({
      takenAt: new Date().toISOString(),
      bridgeUrl,
      localBranchId,
      localTerminalId,
      bridgeReachable: reachable,
      bridgeHealth: health,
      cloudPrintersCount: count,
      cloudQueryError: error,
      classification,
      context: {
        isEmbeddedPreview: isEmbeddedPreview(),
        isSecureContext: window.isSecureContext,
        userAgent: navigator.userAgent,
      },
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const rows = useMemo(() => {
    if (!snapshot) return [];
    const h = snapshot.bridgeHealth;
    return [
      { k: "Bridge URL", v: snapshot.bridgeUrl || "—" },
      { k: "Bridge online", v: snapshot.bridgeReachable ? `✅ ${h?.version ?? ""}` : "❌" },
      { k: "device.json — branchId", v: h?.branchId ? `✅ ${h.branchId}` : "—" },
      { k: "device.json — terminalId", v: h?.terminalId ? `✅ ${h.terminalId}` : "—" },
      { k: "Printers source (bridge)", v: h?.printersSource ?? "—" },
      { k: "Printers count (bridge)", v: String(h?.printersCount ?? "—") },
      { k: "Local branch (localStorage)", v: snapshot.localBranchId || "—" },
      { k: "Local terminal (localStorage)", v: snapshot.localTerminalId || "—" },
      {
        k: "Cloud printers (pos_printers, RLS-aware)",
        v: snapshot.cloudPrintersCount === null
          ? `❌ ${snapshot.cloudQueryError ?? "blocked"}`
          : `✅ ${snapshot.cloudPrintersCount}`,
      },
      { k: "Embedded preview", v: snapshot.context.isEmbeddedPreview ? "نعم (قد يمنع Chrome الوصول للشبكة المحلية)" : "لا" },
      { k: "Secure context", v: snapshot.context.isSecureContext ? "نعم" : "لا" },
    ];
  }, [snapshot]);

  const exportJson = useCallback(() => {
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pos-diagnostics-${snapshot.takenAt.replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [snapshot]);

  return (
    <div className="container mx-auto py-6 max-w-3xl space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="ms-1 h-4 w-4" /> رجوع
          </Button>
          <h1 className="text-xl font-bold">تشخيص نقطة البيع</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runChecks} disabled={loading}>
            {loading ? <Loader2 className="ms-1 h-4 w-4 animate-spin" /> : <RefreshCcw className="ms-1 h-4 w-4" />}
            إعادة الفحص
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson} disabled={!snapshot}>
            <Download className="ms-1 h-4 w-4" /> تصدير JSON
          </Button>
        </div>
      </div>

      {snapshot && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">الحالة العامة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <Badge
                variant="outline"
                className={STATE_COLORS[snapshot.classification.state] ?? STATE_COLORS.unknown}
              >
                {snapshot.classification.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(snapshot.takenAt).toLocaleString()}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{snapshot.classification.hint}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">التفاصيل (قراءة فقط)</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.k} className="border-b last:border-0">
                  <td className="py-2 text-muted-foreground whitespace-nowrap">{r.k}</td>
                  <td className="py-2 ps-3 break-all">{r.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            هذه الصفحة للقراءة فقط ولا تعدّل أي إعداد. لا تؤثر على flow البيع أو الطباعة الحالي.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}