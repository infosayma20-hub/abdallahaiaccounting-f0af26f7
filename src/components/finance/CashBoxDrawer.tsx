import { useState, useEffect, useMemo } from "react";
import { Landmark, Building2, Monitor, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { FinanceModal, SegmentedTypeSelect } from "@/components/finance/shell";
import { cn } from "@/lib/utils";

interface CashBoxDrawerProps {
  open: boolean;
  onClose: () => void;
  defaultType: "main" | "branch" | "pos" | "petty" | "petty_cash";
  editBox?: any;
  hasMainBox: boolean;
  onSaved: () => void;
}

const CashBoxDrawer = ({ open, onClose, defaultType, editBox, hasMainBox, onSaved }: CashBoxDrawerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [boxType, setBoxType] = useState<"main" | "branch" | "pos" | "petty" | "petty_cash">(defaultType);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().split("T")[0]);
  const [minAlert, setMinAlert] = useState("");
  const [maxAlert, setMaxAlert] = useState("");
  const [maxAction, setMaxAction] = useState("warn");
  const [notes, setNotes] = useState("");
  const [autoCreateAccount, setAutoCreateAccount] = useState(true);
  const [existingAccountCode, setExistingAccountCode] = useState("");
  const [autoTransfer, setAutoTransfer] = useState(false);
  const [autoTransferTrigger, setAutoTransferTrigger] = useState("end_of_day");
  const [posAutoPost, setPosAutoPost] = useState(true);
  const [posPostTrigger, setPosPostTrigger] = useState("shift_close");
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [branchesList, setBranchesList] = useState<{ id: string; name: string }[]>([]);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBoxType(editBox?.type || defaultType);
    setName(editBox?.name || "");
    setLocation(editBox?.branch_location || "");
    setCurrency(editBox?.currency || "ILS");
    setOpeningBalance(editBox ? String(editBox.opening_balance || "") : "");
    setOpeningDate(editBox?.opening_balance_date || new Date().toISOString().split("T")[0]);
    setMinAlert(editBox?.min_balance_alert ? String(editBox.min_balance_alert) : "");
    setMaxAlert(editBox?.max_balance_alert ? String(editBox.max_balance_alert) : "");
    setMaxAction(editBox?.max_balance_action || "warn");
    setNotes(editBox?.notes || "");
    setAutoCreateAccount(!editBox);
    setExistingAccountCode(editBox?.gl_account_code || "");
    setAutoTransfer(editBox?.auto_transfer_to_main || false);
    setAutoTransferTrigger(editBox?.auto_transfer_trigger || "end_of_day");
    setPosAutoPost(editBox?.pos_auto_post !== false);
    setPosPostTrigger(editBox?.pos_post_trigger || "shift_close");
    setSelectedBranchId(editBox?.branch_id || null);

    if (user) {
      supabase.from("accounts").select("account_code, account_name").eq("user_id", user.id).eq("is_active", true).order("account_code")
        .then(({ data }) => setAccounts(data || []));
      
      // Load branches for linking
      supabase.from("branches").select("id, name").eq("user_id", user.id).eq("is_active", true)
        .then(({ data }) => setBranchesList(data || []));
    }
  }, [open, editBox, defaultType, user]);

  const cashAccounts = useMemo(() => accounts.filter(a => a.account_code?.startsWith("111")), [accounts]);

  const normalizedType = boxType === "petty_cash" ? "petty" : boxType;
  const titles: Record<string, string> = {
    main: "إنشاء الصندوق الرئيسي",
    branch: "إضافة صندوق فرع",
    pos: "إضافة صندوق نقطة بيع",
    petty: "إضافة صندوق نثرية",
  };
  const placeholders: Record<string, string> = {
    main: "مثال: الصندوق الرئيسي",
    branch: "مثال: صندوق فرع رام الله",
    pos: "مثال: كاشير 1 — المعرض",
    petty: "مثال: نثرية المكتب الرئيسي",
  };

  const handleSave = async () => {
    if (!user || !name.trim()) {
      toast({ title: "خطأ", description: "اسم الصندوق مطلوب", variant: "destructive" });
      return;
    }
    if (boxType === "main" && hasMainBox && !editBox) {
      toast({ title: "خطأ", description: "يوجد صندوق رئيسي بالفعل", variant: "destructive" });
      return;
    }

    setSaving(true);
    let glCode = existingAccountCode;

    // Auto-create account if needed
    if (autoCreateAccount && !editBox) {
      // Fetch ALL existing 1110x codes (5-digit pattern under parent 1110)
      const { data: existing } = await supabase.from("accounts")
        .select("account_code").eq("user_id", user.id)
        .like("account_code", "1110%").order("account_code", { ascending: true });
      
      const usedCodes = new Set((existing || []).map(a => a.account_code));
      let nextNum = 1;
      while (usedCodes.has(`1110${nextNum}`)) {
        nextNum++;
      }
      glCode = `1110${nextNum}`;

      const { error: accErr } = await supabase.from("accounts").insert({
        user_id: user.id,
        account_code: glCode,
        account_name: name.trim(),
        account_type: "Asset",
        parent_code: "1110",
        nature: "debit",
        is_system: false,
      });
      if (accErr) {
        toast({ title: "خطأ في إنشاء الحساب", description: accErr.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    const boxData: any = {
      user_id: user.id,
      name: name.trim(),
      type: normalizedType === "petty" ? "petty_cash" : boxType,
      branch_location: location || null,
      currency,
      gl_account_code: glCode || null,
      opening_balance: Number(openingBalance) || 0,
      opening_balance_date: openingDate,
      min_balance_alert: Number(minAlert) || null,
      max_balance_alert: Number(maxAlert) || null,
      max_balance_action: maxAction,
      auto_transfer_to_main: autoTransfer,
      auto_transfer_trigger: autoTransfer ? autoTransferTrigger : null,
      pos_auto_post: boxType === "pos" ? posAutoPost : null,
      pos_post_trigger: boxType === "pos" ? posPostTrigger : null,
      branch_id: (boxType === "pos" || boxType === "branch") ? selectedBranchId : null,
      notes: notes || null,
    };

    let error;
    if (editBox) {
      ({ error } = await supabase.from("cash_boxes").update(boxData).eq("id", editBox.id));
    } else {
      ({ error } = await supabase.from("cash_boxes").insert(boxData));
    }

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Post opening balance journal entry (create or update)
    const obAmount = Number(openingBalance) || 0;
    const finalGlCode = glCode || boxData.gl_account_code;
    if (finalGlCode && obAmount > 0) {
      const obCurrency = currency === "ILS" ? "شيكل" : currency === "USD" ? "دولار" : "دينار";
      if (editBox) {
        // Delete old opening balance transaction for this box, then insert new one
        const { data: oldTxs } = await supabase.from("transactions")
          .select("id")
          .eq("user_id", user.id)
          .eq("debit_account_code", finalGlCode)
          .eq("transaction_type", "opening_balance")
          .eq("is_opening_balance", true)
          .eq("is_deleted", false);
        if (oldTxs && oldTxs.length > 0) {
          await supabase.from("transactions")
            .update({ is_deleted: true })
            .in("id", oldTxs.map(t => t.id));
        }
      }
      await supabase.rpc("create_opening_balance_entry", {
        p_user_id: user.id,
        p_debit_account_code: finalGlCode,
        p_credit_account_code: "3200",
        p_amount: obAmount,
        p_balance_date: openingDate,
        p_description: `رصيد افتتاحي — ${name.trim()}`,
        p_currency: obCurrency,
        p_contact_id: null,
        p_reference: `OB-CASHBOX-${finalGlCode}`,
        p_replace_existing: false,
        p_idempotency_key: `OB-CASHBOX-${finalGlCode}-${Date.now()}`,
      });
    } else if (editBox && finalGlCode && obAmount === 0) {
      // If opening balance removed during edit, soft-delete old transaction
      await supabase.from("transactions")
        .update({ is_deleted: true })
        .eq("user_id", user.id)
        .eq("debit_account_code", finalGlCode)
        .eq("transaction_type", "opening_balance")
        .eq("is_opening_balance", true)
        .eq("is_deleted", false);
    }

    const msgs = [`تم ${editBox ? "تحديث" : "إنشاء"} صندوق ${name.trim()} بنجاح`];
    if (autoCreateAccount && !editBox && glCode) msgs.push(`تم إنشاء الحساب ${glCode} في شجرة الحسابات`);

    toast({ title: msgs[0], description: msgs[1] || undefined });
    setSaving(false);
    onSaved();
  };

  return (
    <FinanceModal
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      icon={
        normalizedType === "main" ? Landmark :
        normalizedType === "branch" ? Building2 :
        normalizedType === "pos" ? Monitor : Wallet
      }
      title={editBox ? `تعديل — ${editBox.name}` : titles[normalizedType]}
      description="تعريف صندوق جديد وربطه بشجرة الحسابات"
      size="md"
      primaryLabel={editBox ? "حفظ التعديلات" : "إنشاء الصندوق"}
      primaryDisabled={!name.trim() || (normalizedType === "main" && hasMainBox && !editBox)}
      primaryLoading={saving}
      onPrimary={handleSave}
    >
          {/* Type Selector */}
          {!editBox && (
            <>
              <SegmentedTypeSelect
                label="نوع الصندوق"
                value={boxType === "petty_cash" ? "petty" : boxType}
                onChange={(v) => setBoxType(v)}
                options={[
                  { key: "main", label: "رئيسي", description: "يستقبل كل التحويلات", icon: Landmark, disabled: hasMainBox && !editBox },
                  { key: "branch", label: "فرع", description: "صندوق فرع", icon: Building2 },
                  { key: "pos", label: "نقطة بيع", description: "مربوط بـ POS", icon: Monitor },
                  { key: "petty", label: "نثرية", description: "مصروفات صغيرة", icon: Wallet },
                ]}
              />
              {boxType === "main" && hasMainBox && !editBox && (
                <div className="mt-2 p-3 rounded-md border border-border bg-muted/40 text-foreground text-xs">
                  يوجد صندوق رئيسي بالفعل. لا يمكن إنشاء أكثر من صندوق رئيسي.
                </div>
              )}
            </>
          )}

          {/* Box Info */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">اسم الصندوق *</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={placeholders[normalizedType]} className="h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">الفرع / الموقع</label>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="مثال: فرع رام الله" className="h-9" />
            </div>
            {/* Branch Link for POS/Branch boxes */}
            {(boxType === "pos" || boxType === "branch") && branchesList.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                  ربط بفرع (للكول سنتر) 
                  <span className="text-[10px] text-muted-foreground font-normal">— مهم لتوصيل الفواتير</span>
                </label>
                <Select value={selectedBranchId || "none"} onValueChange={v => setSelectedBranchId(v === "none" ? null : v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="اختر الفرع..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون ربط</SelectItem>
                    {branchesList.map(br => (
                      <SelectItem key={br.id} value={br.id}>{br.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Currency chips */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">العملة الأساسية</label>
              <div className="flex gap-2">
                {[{ key: "ILS", label: "₪ شيكل" }, { key: "USD", label: "$ دولار" }, { key: "JOD", label: "د.أ دينار" }].map(c => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCurrency(c.key)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md border transition-colors",
                      currency === c.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border hover:bg-muted/40",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Balance + Date row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">الرصيد الافتتاحي</label>
                <Input type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="0.00" className="h-9 font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">تاريخ الرصيد</label>
                <Input type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)} className="h-9" />
              </div>
            </div>

            {/* Alert limits row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">حد التنبيه (الحد الأدنى)</label>
                <Input type="number" value={minAlert} onChange={e => setMinAlert(e.target.value)} placeholder="₪ 0.00" className="h-9 font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">الحد الأقصى المسموح</label>
                <Input type="number" value={maxAlert} onChange={e => setMaxAlert(e.target.value)} placeholder="₪ 0.00" className="h-9 font-mono" />
              </div>
            </div>
            {maxAlert && (
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground">عند تجاوز الحد:</label>
                <div className="flex gap-2">
                  {[{ key: "warn", label: "تنبيه فقط" }, { key: "block", label: "منع الإيداع" }].map(a => (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => setMaxAction(a.key)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md border transition-colors",
                        maxAction === a.key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-foreground border-border hover:bg-muted/40",
                      )}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Accounting Link */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-foreground border-b border-border pb-1">الحساب المحاسبي</h3>
            {!editBox && (
              <div className="flex items-center gap-3">
                <Switch checked={autoCreateAccount} onCheckedChange={setAutoCreateAccount} />
                <label className="text-xs">إنشاء حساب محاسبي جديد تلقائياً</label>
              </div>
            )}
            {autoCreateAccount && !editBox ? (
              <div className="p-3 rounded-md bg-muted/40 border border-border text-xs space-y-1">
                <p className="font-medium">سيتم إنشاء الحساب التالي تلقائياً:</p>
                <p>الكود: <span className="font-mono">1110-XX</span> (تسلسلي)</p>
                <p>الاسم: <span className="font-medium">{name || "—"}</span></p>
                <p>النوع: نقدية (أصل متداول)</p>
              </div>
            ) : (
              <div>
                <label className="text-xs text-muted-foreground">ربط بحساب موجود</label>
                <Select value={existingAccountCode} onValueChange={setExistingAccountCode}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="اختر حساب نقدية..." /></SelectTrigger>
                  <SelectContent>
                    {cashAccounts.map(a => (
                      <SelectItem key={a.account_code} value={a.account_code}>
                        <span className="font-mono text-muted-foreground ml-2">{a.account_code}</span>
                        {a.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Branch transfer settings */}
          {(normalizedType === "branch" || normalizedType === "petty") && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-foreground border-b border-border pb-1">ترحيل للرئيسي</h3>
              <div className="flex items-center gap-3">
                <Switch checked={autoTransfer} onCheckedChange={setAutoTransfer} />
                <label className="text-xs">ترحيل تلقائي للصندوق الرئيسي</label>
              </div>
              {autoTransfer && (
                <Select value={autoTransferTrigger} onValueChange={setAutoTransferTrigger}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="end_of_day">نهاية كل يوم</SelectItem>
                    <SelectItem value="threshold">عند تجاوز مبلغ محدد</SelectItem>
                    <SelectItem value="manual">يدوي فقط</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* POS settings */}
          {boxType === "pos" && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-foreground border-b border-border pb-1">إعدادات نقطة البيع</h3>
              <div className="flex items-center gap-3">
                <Switch checked={posAutoPost} onCheckedChange={setPosAutoPost} />
                <label className="text-xs">ترحيل مبيعات POS تلقائياً</label>
              </div>
              {posAutoPost && (
                <Select value={posPostTrigger} onValueChange={setPosPostTrigger}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shift_close">عند إغلاق الوردية</SelectItem>
                    <SelectItem value="end_of_day">نهاية اليوم</SelectItem>
                    <SelectItem value="manual">يدوي — بموافقة المدير</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center gap-3">
                <Switch checked={autoTransfer} onCheckedChange={setAutoTransfer} />
                <label className="text-xs">ترحيل تلقائي للصندوق الرئيسي</label>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">ملاحظات</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="ملاحظات إضافية..." className="resize-none" />
          </div>
    </FinanceModal>
  );
};

export default CashBoxDrawer;
