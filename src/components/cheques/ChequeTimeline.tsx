import { Clock, User, Building2, Hash, StickyNote, Calendar, FileText } from "lucide-react";

interface StatusHistoryEntry {
  id: string;
  from_status: string | null;
  to_status: string;
  created_at: string;
  reason: string | null;
  action_type?: string | null;
  linked_transaction_id?: string | null;
  details?: Record<string, any> | null;
}

interface ChequeTimelineProps {
  cheque: {
    party_name: string;
    cheque_date: string;
    linked_account: string | null;
    notes: string | null;
    created_at: string;
  };
  history: StatusHistoryEntry[];
}

const statusEmoji: Record<string, string> = {
  'مسجل': '📝',
  'آجل': '⏳',
  'مستحق': '⚠️',
  'مودع': '🏦',
  'محصل': '✅',
  'مرتجع': '⛔',
  'ملغي': '🚫',
  'مظهر': '📤',
};

const statusColor: Record<string, string> = {
  'مسجل': 'bg-muted',
  'آجل': 'bg-amber-500',
  'مستحق': 'bg-red-500',
  'مودع': 'bg-blue-500',
  'محصل': 'bg-emerald-500',
  'مرتجع': 'bg-rose-500',
  'ملغي': 'bg-muted-foreground',
  'مظهر': 'bg-purple-500',
};

const fmtDateTime = (d: string) => {
  try {
    const date = new Date(d);
    return date.toLocaleDateString('ar-PS', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' +
      date.toLocaleTimeString('ar-PS', { hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
};

const ChequeTimeline = ({ cheque, history }: ChequeTimelineProps) => {
  // Sort ascending (oldest first) for timeline
  const sorted = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Cheque info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <User className="h-3 w-3" />
          <span>الجهة: <strong className="text-foreground">{cheque.party_name}</strong></span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>الاستحقاق: <strong className="text-foreground">{new Date(cheque.cheque_date).toLocaleDateString('ar-PS', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></span>
        </div>
        {cheque.linked_account && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Hash className="h-3 w-3" />
            <span>الحساب: <strong className="text-foreground">{cheque.linked_account}</strong></span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>التسجيل: <strong className="text-foreground">{new Date(cheque.created_at).toLocaleDateString('ar-PS', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></span>
        </div>
      </div>

      {cheque.notes && (
        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground bg-muted/30 rounded-xl p-2.5">
          <StickyNote className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>{cheque.notes}</span>
        </div>
      )}

      {/* Timeline */}
      {sorted.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-foreground flex items-center gap-1 mb-3">
            <FileText className="h-3.5 w-3.5 text-primary" />
            سجل الحالات
          </p>
          <div className="space-y-0 mr-3 border-r-2 border-primary/20 pr-4">
            {sorted.map((h, i) => {
              const emoji = statusEmoji[h.to_status] || '●';
              const color = statusColor[h.to_status] || 'bg-muted';
              const details = h.details as Record<string, any> | null;
              return (
                <div key={h.id} className="relative pb-4 last:pb-0">
                  {/* Dot */}
                  <div className={`absolute w-3 h-3 rounded-full ${color} -right-[23px] top-0.5 ring-2 ring-background`} />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground tabular-nums">{fmtDateTime(h.created_at)}</span>
                      <span className="text-xs font-semibold text-foreground">
                        {emoji} {h.to_status}
                      </span>
                    </div>
                    {h.reason && (
                      <p className="text-[10px] text-muted-foreground mr-2">└ {h.reason}</p>
                    )}
                    {details?.bank_name && (
                      <p className="text-[10px] text-muted-foreground mr-2">└ في: {details.bank_name}</p>
                    )}
                    {details?.endorsed_to && (
                      <p className="text-[10px] text-muted-foreground mr-2">└ مظهر لـ: {details.endorsed_to}</p>
                    )}
                    {h.linked_transaction_id && (
                      <p className="text-[10px] text-primary mr-2">└ قيد: {h.linked_transaction_id.slice(0, 8)}...</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChequeTimeline;
