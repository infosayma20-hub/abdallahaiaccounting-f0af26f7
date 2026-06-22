import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, CheckCircle2, XCircle, Loader2, Wifi } from 'lucide-react';

interface NetworkTestDialogProps {
  runNetworkTest: () => Promise<{
    overall: boolean;
    results: Array<{ name: string; ok: boolean; latencyMs: number }>;
    connection: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
  }>;
  trigger?: React.ReactNode;
}

export default function NetworkTestDialog({ runNetworkTest, trigger }: NetworkTestDialogProps) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<NetworkTestDialogProps['runNetworkTest']>> | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const r = await runNetworkTest();
      setResult(r);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) run(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1">
            <Activity className="w-4 h-4" /> اختبار الشبكة
          </Button>
        )}
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wifi className="w-5 h-5" /> تشخيص الشبكة
          </DialogTitle>
        </DialogHeader>

        {running && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>جاري الفحص...</span>
          </div>
        )}

        {result && !running && (
          <div className="space-y-3">
            <div className={`p-3 rounded-lg border ${result.overall ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              <div className="flex items-center gap-2 font-semibold">
                {result.overall ? (
                  <><CheckCircle2 className="w-5 h-5 text-emerald-600" /><span>الإنترنت يعمل ✅</span></>
                ) : (
                  <><XCircle className="w-5 h-5 text-red-600" /><span>الإنترنت مقطوع ❌</span></>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {result.results.map((r) => (
                <div key={r.name} className="flex items-center justify-between p-2 rounded border bg-card">
                  <span className="text-sm font-medium">{r.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={r.ok ? 'outline' : 'destructive'} className="text-xs">
                      {r.latencyMs} ms
                    </Badge>
                    {r.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {result.connection.effectiveType && (
              <div className="text-xs text-muted-foreground p-2 rounded bg-muted/50 space-y-1">
                <div>نوع الشبكة: <strong>{result.connection.effectiveType}</strong></div>
                {result.connection.downlink !== undefined && (
                  <div>السرعة التقديرية: <strong>{result.connection.downlink} Mbps</strong></div>
                )}
                {result.connection.rtt !== undefined && (
                  <div>زمن الاستجابة: <strong>{result.connection.rtt} ms</strong></div>
                )}
              </div>
            )}

            <div className="text-xs text-muted-foreground border-t pt-2">
              {!result.results.find((r) => r.name === 'Supabase')?.ok && result.overall ? (
                <>⚠️ الإنترنت العام شغّال لكن خادم النظام لا يستجيب — قد تكون مشكلة مؤقتة في الخادم.</>
              ) : !result.overall ? (
                <>راجع كابل الشبكة أو الراوتر، وإذا الشبكات الأخرى شغالة فالمشكلة بمزود الخدمة.</>
              ) : (
                <>كل المصادر شغالة بشكل ممتاز. إذا في مشكلة، أعد فحصها بعد دقيقة.</>
              )}
            </div>

            <Button onClick={run} variant="outline" className="w-full gap-2">
              <Activity className="w-4 h-4" /> أعد الفحص
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}