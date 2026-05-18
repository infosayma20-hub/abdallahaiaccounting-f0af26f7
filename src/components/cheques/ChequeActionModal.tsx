import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Building2, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";

export type ActionType = 'deposit' | 'collected' | 'bounced' | 'endorse' | 'return_to_customer' | 'cancel' | 'cashed' | 'outgoing_bounced' | 'recover';

interface ActionConfig {
  id: ActionType;
  label: string;
  emoji: string;
  color: string;
  nextStatus: string;
  description?: string;
}

export const ACTION_CONFIGS: Record<ActionType, ActionConfig> = {
  // Incoming cheque actions
  deposit: { id: 'deposit', label: 'إيداع في البنك', emoji: '🏦', color: 'text-blue-600', nextStatus: 'مودع' },
  collected: { id: 'collected', label: 'تم التحصيل', emoji: '✅', color: 'text-emerald-600', nextStatus: 'محصل', description: 'يُنشئ قيد محاسبي تلقائي' },
  bounced: { id: 'bounced', label: 'شيك مرتجع (بدون رصيد)', emoji: '⛔', color: 'text-red-600', nextStatus: 'مرتجع', description: 'يُعيد الذمة للزبون تلقائياً' },
  endorse: { id: 'endorse', label: 'تظهير لمورد', emoji: '📤', color: 'text-purple-600', nextStatus: 'مظهر' },
  return_to_customer: { id: 'return_to_customer', label: 'إرجاع للزبون', emoji: '↩️', color: 'text-amber-600', nextStatus: 'ملغي', description: 'يُعيد الذمة للزبون تلقائياً' },
  cancel: { id: 'cancel', label: 'إلغاء الشيك', emoji: '🚫', color: 'text-red-600', nextStatus: 'ملغي' },
  // Outgoing cheque actions
  cashed: { id: 'cashed', label: 'صُرف في البنك', emoji: '💸', color: 'text-emerald-600', nextStatus: 'مصروف', description: 'خصم من حساب البنك المصدر' },
  outgoing_bounced: { id: 'outgoing_bounced', label: 'مرتجع من البنك', emoji: '⛔', color: 'text-red-600', nextStatus: 'مرتجع', description: 'يُعيد الالتزام للمورد' },
  recover: { id: 'recover', label: 'استرداد الشيك', emoji: '🔄', color: 'text-amber-600', nextStatus: 'ملغي', description: 'استرداد الشيك قبل صرفه' },
};

interface BankAccount {
  id: string;
  name: string;
  bank_name: string;
  gl_account_code: string | null;
}

interface Contact {
  id: string;
  contact_name: string;
  contact_type: string;
}

interface ChequeActionModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  action: ActionType | null;
  chequeNumber: string | null;
  chequeAmount: number;
  chequeCurrency: string;
  chequeType: 'وارد' | 'صادر';
  partyName: string;
  bankAccounts: BankAccount[];
  contacts: Contact[];
  sourceBankAccount?: BankAccount | null;
  onConfirm: (data: ActionFormData) => void;
  submitting?: boolean;
}

export interface ActionFormData {
  action: ActionType;
  bankAccountId?: string;
  depositDate?: string;
  collectionDate?: string;
  bounceDate?: string;
  bounceReason?: string;
  bankFees?: number;
  endorsedToName?: string;
  endorsedToContactId?: string;
  returnReason?: string;
  cancelReason?: string;
  cashedDate?: string;
  recoverReason?: string;
  notes?: string;
}

const BOUNCE_REASONS = [
  'رصيد غير كافٍ',
  'توقيع مغاير',
  'الحساب مغلق',
  'أخرى',
];

const ChequeActionModal = ({
  open, onOpenChange, action, chequeNumber, chequeAmount, chequeCurrency,
  chequeType, partyName, bankAccounts, contacts, sourceBankAccount, onConfirm, submitting
}: ChequeActionModalProps) => {
  const [bankAccountId, setBankAccountId] = useState("");
  const [depositDate, setDepositDate] = useState(new Date().toISOString().split('T')[0]);
  const [collectionDate, setCollectionDate] = useState(new Date().toISOString().split('T')[0]);
  const [bounceDate, setBounceDate] = useState(new Date().toISOString().split('T')[0]);
  const [bounceReason, setBounceReason] = useState("رصيد غير كافٍ");
  const [customBounceReason, setCustomBounceReason] = useState("");
  const [bankFees, setBankFees] = useState("");
  const [endorsedToName, setEndorsedToName] = useState("");
  const [endorsedToContactId, setEndorsedToContactId] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cashedDate, setCashedDate] = useState(new Date().toISOString().split('T')[0]);
  const [recoverReason, setRecoverReason] = useState("");
  const [notes, setNotes] = useState("");

  if (!action) return null;
  const config = ACTION_CONFIGS[action];

  const handleSubmit = () => {
    onConfirm({
      action,
      bankAccountId: bankAccountId || undefined,
      depositDate,
      collectionDate,
      bounceDate,
      bounceReason: bounceReason === 'أخرى' ? customBounceReason : bounceReason,
      bankFees: bankFees ? parseFloat(bankFees) : 0,
      endorsedToName,
      endorsedToContactId: endorsedToContactId || undefined,
      returnReason,
      cancelReason,
      cashedDate,
      recoverReason,
      notes,
    });
  };

  const getJournalPreview = () => {
    const amt = `${chequeAmount.toLocaleString()} ${chequeCurrency}`;
    const bankName = sourceBankAccount?.name || 'البنك';
    switch (action) {
      // Incoming cheque actions
      case 'deposit':
        return { debit: `ح/شيكات قيد التحصيل ${amt}`, credit: `ح/شيكات واردة ${amt}` };
      case 'collected': {
        const bank = bankAccounts.find(b => b.id === bankAccountId);
        return { debit: `ح/${bank?.name || 'البنك الجاري'} ${amt}`, credit: `ح/شيكات قيد التحصيل ${amt}` };
      }
      case 'bounced':
        return { debit: `ح/ذمم ${partyName} ${amt}`, credit: `ح/شيكات قيد التحصيل ${amt}` };
      case 'endorse':
        return { debit: `ح/ذمم ${endorsedToName || 'المورد'} ${amt}`, credit: `ح/شيكات واردة ${amt}` };
      case 'return_to_customer':
        return { debit: `ح/ذمم ${partyName} ${amt}`, credit: `ح/شيكات واردة ${amt}` };
      // Outgoing cheque actions
      case 'cashed':
        return { debit: `ح/شيكات صادرة (1160) ${amt}`, credit: `ح/${bankName} ${amt}` };
      case 'outgoing_bounced':
        return { debit: `ح/شيكات صادرة (1160) ${amt}`, credit: `ح/ذمم موردين (2100) ${amt}` };
      case 'recover':
        return { debit: `ح/شيكات صادرة (1160) ${amt}`, credit: `ح/ذمم موردين (2100) ${amt}` };
      case 'cancel':
        if (chequeType === 'صادر') {
          return { debit: `ح/شيكات صادرة (1160) ${amt}`, credit: `ح/ذمم موردين (2100) ${amt}` };
        }
        return { debit: `ح/ذمم ${partyName} ${amt}`, credit: `ح/شيكات واردة ${amt}` };
      default:
        return null;
    }
  };

  const journal = getJournalPreview();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span>{config.emoji}</span>
            {config.label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cheque info summary */}
          <div className="bg-muted/30 rounded-xl p-3 text-sm space-y-1">
            <p className="text-muted-foreground">الشيك: <strong className="text-foreground font-mono">#{chequeNumber || '—'}</strong> — <strong className="text-primary">₪{chequeAmount.toLocaleString()}</strong></p>
            <p className="text-muted-foreground">من: <strong className="text-foreground">{partyName}</strong></p>
          </div>

          {/* DEPOSIT fields */}
          {action === 'deposit' && (
            <>
              <div>
                <Label className="text-xs font-semibold">إيداع في الحساب البنكي *</Label>
                {bankAccounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-2">لا توجد حسابات بنكية</p>
                ) : (
                  <div className="space-y-1.5 mt-2 max-h-40 overflow-y-auto">
                    {bankAccounts.map(bank => (
                      <button key={bank.id} onClick={() => setBankAccountId(bank.id)}
                        className={`w-full text-right px-3 py-2.5 rounded-xl border transition-all flex items-center justify-between ${
                          bankAccountId === bank.id ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30'
                        }`}>
                        <div className="flex items-center gap-2">
                          <Building2 className={`h-4 w-4 ${bankAccountId === bank.id ? 'text-primary' : 'text-muted-foreground'}`} />
                          <div>
                            <p className="text-sm font-medium">{bank.name}</p>
                            <p className="text-[10px] text-muted-foreground">{bank.bank_name}</p>
                          </div>
                        </div>
                        {bank.gl_account_code && <span className="text-[10px] text-muted-foreground font-mono">{bank.gl_account_code}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs">تاريخ الإيداع</Label>
                <Input type="date" value={depositDate} onChange={e => setDepositDate(e.target.value)} className="h-9 mt-1 rounded-xl" />
              </div>
            </>
          )}

          {/* COLLECTED fields */}
          {action === 'collected' && (
            <div>
              <Label className="text-xs">تاريخ التحصيل</Label>
              <Input type="date" value={collectionDate} onChange={e => setCollectionDate(e.target.value)} className="h-9 mt-1 rounded-xl" />
            </div>
          )}

          {/* BOUNCED fields */}
          {action === 'bounced' && (
            <>
              <div>
                <Label className="text-xs font-semibold">سبب الإرجاع *</Label>
                <RadioGroup value={bounceReason} onValueChange={setBounceReason} className="mt-2 space-y-1.5">
                  {BOUNCE_REASONS.map(r => (
                    <div key={r} className="flex items-center gap-2">
                      <RadioGroupItem value={r} id={r} />
                      <Label htmlFor={r} className="text-sm cursor-pointer">{r}</Label>
                    </div>
                  ))}
                </RadioGroup>
                {bounceReason === 'أخرى' && (
                  <Input value={customBounceReason} onChange={e => setCustomBounceReason(e.target.value)} placeholder="سبب آخر..." className="h-9 mt-2 rounded-xl" />
                )}
              </div>
              <div>
                <Label className="text-xs">تاريخ الارتجاع</Label>
                <Input type="date" value={bounceDate} onChange={e => setBounceDate(e.target.value)} className="h-9 mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs">رسوم البنك (إن وجدت)</Label>
                <Input type="number" value={bankFees} onChange={e => setBankFees(e.target.value)} placeholder="0" className="h-9 mt-1 rounded-xl" />
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs space-y-1">
                <p className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> سيتم تلقائياً:</p>
                <p className="text-amber-600 dark:text-amber-300">• إعادة ₪{chequeAmount.toLocaleString()} لذمم {partyName}</p>
                <p className="text-amber-600 dark:text-amber-300">• قيد محاسبي عكسي</p>
              </div>
            </>
          )}

          {/* ENDORSE fields */}
          {action === 'endorse' && (
            <>
              <div>
                <Label className="text-xs font-semibold">تظهير لـ (المورد) *</Label>
                <Select value={endorsedToContactId} onValueChange={(v) => {
                  setEndorsedToContactId(v);
                  const c = contacts.find(c => c.id === v);
                  if (c) setEndorsedToName(c.contact_name);
                }}>
                  <SelectTrigger className="h-9 mt-1 rounded-xl"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                  <SelectContent>
                    {contacts.filter(c => c.contact_type === 'مورد' || c.contact_type === 'عميل ومورد').map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={endorsedToName} onChange={e => setEndorsedToName(e.target.value)} placeholder="أو أدخل اسم المورد يدوياً" className="h-9 mt-2 rounded-xl" />
              </div>
            </>
          )}

          {/* RETURN fields */}
          {action === 'return_to_customer' && (
            <div>
              <Label className="text-xs">سبب الإرجاع</Label>
              <Input value={returnReason} onChange={e => setReturnReason(e.target.value)} placeholder="سبب الإرجاع..." className="h-9 mt-1 rounded-xl" />
            </div>
          )}

          {/* CANCEL fields */}
          {action === 'cancel' && (
            <div>
              <Label className="text-xs">سبب الإلغاء</Label>
              <Input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="سبب الإلغاء..." className="h-9 mt-1 rounded-xl" />
            </div>
          )}

          {/* CASHED (outgoing) fields */}
          {action === 'cashed' && (
            <>
              <div>
                <Label className="text-xs">تاريخ الصرف</Label>
                <Input type="date" value={cashedDate} onChange={e => setCashedDate(e.target.value)} className="h-9 mt-1 rounded-xl" />
              </div>
              {sourceBankAccount && (
                <div className="bg-muted/30 rounded-xl p-3 text-xs">
                  <p className="text-muted-foreground">سيتم الخصم من: <strong className="text-foreground">{sourceBankAccount.name}</strong> ({sourceBankAccount.bank_name})</p>
                </div>
              )}
            </>
          )}

          {/* OUTGOING BOUNCED fields */}
          {action === 'outgoing_bounced' && (
            <>
              <div>
                <Label className="text-xs font-semibold">سبب الإرجاع *</Label>
                <RadioGroup value={bounceReason} onValueChange={setBounceReason} className="mt-2 space-y-1.5">
                  {BOUNCE_REASONS.map(r => (
                    <div key={r} className="flex items-center gap-2">
                      <RadioGroupItem value={r} id={`out-${r}`} />
                      <Label htmlFor={`out-${r}`} className="text-sm cursor-pointer">{r}</Label>
                    </div>
                  ))}
                </RadioGroup>
                {bounceReason === 'أخرى' && (
                  <Input value={customBounceReason} onChange={e => setCustomBounceReason(e.target.value)} placeholder="سبب آخر..." className="h-9 mt-2 rounded-xl" />
                )}
              </div>
              <div>
                <Label className="text-xs">تاريخ الارتجاع</Label>
                <Input type="date" value={bounceDate} onChange={e => setBounceDate(e.target.value)} className="h-9 mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs">رسوم البنك (إن وجدت)</Label>
                <Input type="number" value={bankFees} onChange={e => setBankFees(e.target.value)} placeholder="0" className="h-9 mt-1 rounded-xl" />
              </div>
            </>
          )}

          {/* RECOVER fields */}
          {action === 'recover' && (
            <div>
              <Label className="text-xs">سبب الاسترداد</Label>
              <Input value={recoverReason} onChange={e => setRecoverReason(e.target.value)} placeholder="سبب استرداد الشيك..." className="h-9 mt-1 rounded-xl" />
            </div>
          )}

          {/* Notes (all actions) */}
          <div>
            <Label className="text-xs">ملاحظة (اختياري)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظة إضافية..." className="h-9 mt-1 rounded-xl" />
          </div>

          {/* Journal preview */}
          {journal && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground">القيد المحاسبي الذي سيُنشأ تلقائياً:</p>
              <div className="bg-background rounded-lg p-2 text-xs space-y-1 font-mono">
                <p className="text-foreground">مدين: {journal.debit}</p>
                <p className="text-foreground">دائن: {journal.credit}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button className="flex-1 rounded-xl gap-2" onClick={handleSubmit} disabled={submitting ||
              (action === 'deposit' && !bankAccountId) ||
              (action === 'endorse' && !endorsedToName) ||
              (action === 'bounced' && !bounceReason)
            }>
              <CheckCircle2 className="h-4 w-4" />
              {submitting ? 'جارٍ...' : 'تأكيد'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChequeActionModal;
