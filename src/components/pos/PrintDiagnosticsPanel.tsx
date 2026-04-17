import { useEffect, useState } from "react";
import { subscribeDiagnostics, clearDiagnostics, type PrintLogEntry, type PrintStatus } from "@/lib/print-diagnostics";
import { Button } from "@/components/ui/button";
import { Trash2, ChevronDown, ChevronUp } from "lucide-react";

const STATUS_STYLE: Record<PrintStatus, { label: string; cls: string }> = {
  pending:             { label: '⏳ pending',       cls: 'bg-muted text-muted-foreground' },
  sent:                { label: '✅ sent',          cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  failed:              { label: '❌ failed',        cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
  bridge_unreachable:  { label: '🔌 bridge down',   cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function PrintDiagnosticsPanel() {
  const [entries, setEntries] = useState<PrintLogEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => subscribeDiagnostics(setEntries), []);

  return (
    <div className="border rounded-lg bg-card text-card-foreground" dir="rtl">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="font-semibold">🔬 Print Diagnostics — آخر {entries.length} عملية</div>
        <Button variant="ghost" size="sm" onClick={clearDiagnostics} className="gap-1">
          <Trash2 className="h-4 w-4" /> مسح
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">لا توجد عمليات طباعة بعد.</div>
      ) : (
        <div className="max-h-80 overflow-y-auto divide-y text-sm">
          {entries.map((e) => {
            const s = STATUS_STYLE[e.status];
            const isOpen = expandedId === e.id;
            return (
              <div key={e.id} className="px-3 py-2">
                <button
                  className="w-full flex items-center gap-2 text-right hover:bg-muted/50 -mx-3 px-3 py-1 rounded"
                  onClick={() => setExpandedId(isOpen ? null : e.id)}
                >
                  <span className={`px-2 py-0.5 rounded text-xs font-mono ${s.cls}`}>{s.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{e.endpoint}</span>
                  <span className="text-xs">{e.receiptType}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-secondary">{e.printMode}</span>
                  {e.itemsCount != null && <span className="text-xs text-muted-foreground">{e.itemsCount} صنف</span>}
                  <span className="text-xs text-muted-foreground">{fmtBytes(e.payloadBytes)}</span>
                  {e.durationMs != null && <span className="text-xs text-muted-foreground">{e.durationMs}ms</span>}
                  <span className="text-xs text-muted-foreground mr-auto">{new Date(e.timestamp).toLocaleTimeString('ar-EG')}</span>
                  {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {isOpen && (
                  <div className="mt-2 mr-2 ps-2 border-r-2 border-muted text-xs space-y-1">
                    {e.estimatedHeight != null && <div>📏 الارتفاع المُقدَّر: <span className="font-mono">{e.estimatedHeight}px</span></div>}
                    {e.errorMessage && <div className="text-destructive">⚠️ {e.errorMessage}</div>}
                    {e.responsePayload && (
                      <pre className="bg-muted p-2 rounded overflow-x-auto text-[10px] leading-tight">
                        {JSON.stringify(e.responsePayload, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
