import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getSyncLogs,
  getPendingSales,
  getQuarantinedSales,
  requeueSale,
  removePendingSale,
  type SyncLogEntry,
  type PendingSale,
} from '@/lib/pos-offline-db';
import { Wifi, WifiOff, CheckCircle, AlertTriangle, Clock, RefreshCw, ShieldAlert, RotateCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface SyncLogSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SyncLogSheet({ open, onOpenChange }: SyncLogSheetProps) {
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [pending, setPending] = useState<PendingSale[]>([]);
  const [quarantined, setQuarantined] = useState<PendingSale[]>([]);

  const reload = () => {
    getSyncLogs().then(setLogs);
    getPendingSales().then((rows) => setPending(rows.filter((r) => r.sync_status !== 'quarantined')));
    getQuarantinedSales().then(setQuarantined);
  };

  useEffect(() => {
    if (open) reload();
  }, [open]);

  const handleRequeue = async (id: string, orderNumber: string) => {
    await requeueSale(id);
    toast.success(`تمت إعادة ${orderNumber} لطابور المزامنة`);
    reload();
    // Notify any open POS tab to trigger a sync
    try {
      const ch = new BroadcastChannel('pos-sync');
      ch.postMessage({ type: 'requeue_sync', id });
      ch.close();
    } catch { /* ignore */ }
  };

  const handleDiscard = async (id: string, orderNumber: string) => {
    if (!confirm(`حذف نهائي للبيعة ${orderNumber}؟ لن تُرحَّل للسيرفر.`)) return;
    await removePendingSale(id);
    toast.warning(`تم حذف ${orderNumber} نهائياً`);
    reload();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[400px] sm:w-[450px]" dir="rtl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            سجل المزامنة
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-100px)] mt-4">
          {/* Quarantined sales — needs admin attention */}
          {quarantined.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5 text-red-600">
                <ShieldAlert className="w-4 h-4" />
                في الحجر — تحتاج تدخل يدوي ({quarantined.length})
              </h3>
              <p className="text-[10px] text-muted-foreground mb-2">
                هذه البيعات تجاوزت 5 محاولات مزامنة فاشلة. راجع سبب الخطأ، ثم أعد المحاولة أو احذفها.
              </p>
              <div className="space-y-2">
                {quarantined.map((sale) => (
                  <div key={sale.id} className="p-2.5 rounded-lg border-2 border-red-300 bg-red-50/50 dark:bg-red-900/10 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold">{sale.order_number}</span>
                      <Badge variant="destructive" className="text-[10px]">
                        محجور — {sale.retry_count} محاولة
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">
                      ₪{sale.total?.toFixed(2)} | {sale.payment_method} | {sale.items?.length || 0} بنود
                    </div>
                    {sale.error && (
                      <div className="text-red-600 text-[10px] bg-red-100/60 dark:bg-red-900/30 p-1.5 rounded border border-red-200">
                        {sale.error}
                      </div>
                    )}
                    <div className="text-muted-foreground text-[10px]">
                      {new Date(sale.created_at).toLocaleString('ar-PS')}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] flex-1"
                        onClick={() => handleRequeue(sale.id, sale.order_number)}
                      >
                        <RotateCw className="w-3 h-3 ml-1" />
                        إعادة المحاولة
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-[10px]"
                        onClick={() => handleDiscard(sale.id, sale.order_number)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending sales */}
          {pending.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5 text-amber-600">
                <Clock className="w-4 h-4" />
                عمليات بانتظار الترحيل ({pending.length})
              </h3>
              <div className="space-y-2">
                {pending.map(sale => (
                  <div key={sale.id} className="p-2.5 rounded-lg border bg-amber-50/50 dark:bg-amber-900/10 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold">{sale.order_number}</span>
                      <Badge variant={sale.sync_status === 'failed' ? 'destructive' : 'outline'} className="text-[10px]">
                        {sale.sync_status === 'failed' ? 'فشل' : 'بانتظار'}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">
                      المبلغ: ₪{sale.total?.toFixed(2)} | {sale.payment_method}
                    </div>
                    {sale.error && (
                      <div className="text-red-500 text-[10px]">خطأ: {sale.error}</div>
                    )}
                    <div className="text-muted-foreground text-[10px]">
                      {new Date(sale.created_at).toLocaleString('ar-PS')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sync history */}
          <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
            <Wifi className="w-4 h-4" />
            سجل الأحداث
          </h3>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">لا يوجد سجلات مزامنة</p>
          ) : (
            <div className="space-y-3">
              {logs.map(log => (
                <div key={log.id} className="p-3 rounded-lg border text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {new Date(log.offline_started_at).toLocaleString('ar-PS')}
                    </span>
                    <Badge variant={log.failed_count > 0 ? 'destructive' : 'default'} className="text-[10px]">
                      {log.failed_count > 0 ? 'يحتاج مراجعة' : 'مكتمل'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <WifiOff className="w-3 h-3 text-red-400" />
                    <span>انقطاع لمدة: {log.offline_duration_minutes} دقيقة</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-emerald-500" />
                      {log.synced_count} نجحت
                    </span>
                    {log.failed_count > 0 && (
                      <span className="flex items-center gap-1 text-red-500">
                        <AlertTriangle className="w-3 h-3" />
                        {log.failed_count} فشلت
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      إجمالي: {log.transactions_count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
