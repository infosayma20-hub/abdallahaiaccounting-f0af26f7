import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Loader2, Check, Landmark, Building2, Monitor, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

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
  const gradients: Record<string, string> = {
    main: "linear-gradient(135deg, #0A2342, #006D8F)",
    branch: "linear-gradient(135deg, #065F46, #059669)",
    pos: "linear-gradient(135deg, #4C1D95, #7C3AED)",
    petty: "linear-gradient(135deg, #92400E, #D97706)",
  };
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

    // Post opening balance journal entry
    if (!editBox && Number(openingBalance) > 0 && glCode) {
      await supabase.from("transactions").insert({
        user_id: user.id,
        transaction_date: openingDate,
        description: `رصيد افتتاحي — ${name.trim()}`,
        debit_account_code: glCode,
        credit_account_code: "3200",
        amount: Number(openingBalance),
        currency: currency === "ILS" ? "شيكل" : currency === "USD" ? "دولار" : "دينار",
        transaction_type: "opening_balance",
        is_opening_balance: true,
        idempotency_key: `OB-CASHBOX-${Date.now()}`,
      });
    }

    const msgs = [`✅ تم ${editBox ? "تحديث" : "إنشاء"} صندوق ${name.trim()} بنجاح`];
    if (autoCreateAccount && !editBox && glCode) msgs.push(`تم إنشاء الحساب ${glCode} في شجرة الحسابات`);

    toast({ title: msgs[0], description: msgs[1] || undefined });
    setSaving(false);
    onSaved();
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-[4px]" onClick={onClose} />

      {/* Centered Modal */}
      <div
        className="fixed z-50 bg-background shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300"
        style={{ width: "min(560px, 95vw)", maxHeight: "min(88vh, 860px)", top: "50%", left: "50%", transform: "translate(-50%, -50%)", borderRadius: 16 }}
        dir="rtl"
      >
        {/* Header — gradient navy */}
        <div className="px-5 py-4 text-white shrink-0" style={{ background: "linear-gradient(135deg, #0D1B2E, #1B3A5C)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-lg">
                {normalizedType === "main" ? "🏛️" : normalizedType === "branch" ? "🏪" : normalizedType === "petty" ? "💰" : "🖥️"}
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ fontFamily: "Tajawal, sans-serif" }}>{editBox ? `تعديل — ${editBox.name}` : titles[normalizedType]}</h2>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.7)" }}>تعريف صندوق جديد وربطه بشجرة الحسابات</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/20 transition-colors text-white"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Type Selector */}
          {!editBox && (
            <div>
              <label className="text-[13px] font-bold text-muted-foreground mb-2 block">نوع الصندوق</label>
              <div className="grid grid-cols-4 gap-2">
                {([
                  { key: "main" as const, icon: "🏛️", label: "رئيسي", desc: "يستقبل كل التحويلات" },
                  { key: "branch" as const, icon: "🏪", label: "فرع", desc: "صندوق فرع" },
                  { key: "pos" as const, icon: "🖥️", label: "نقطة بيع", desc: "مربوط بـ POS" },
                  { key: "petty" as const, icon: "💰", label: "نثرية", desc: "مصروفات صغيرة" },
                ]).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setBoxType(t.key)}
                    className="relative p-3 text-center transition-all"
                    style={{
                      borderRadius: 10,
                      border: boxType === t.key ? "2px solid #1B3A5C" : "1px solid #E2E8F0",
                      background: boxType === t.key ? "#EEF2FF" : "#fff",
                    }}
                  >
                    {boxType === t.key && (
                      <div className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-[#1B3A5C] flex items-center justify-center">
                        <Check className="h-2.5 w-2.5 text-white" />
                      </div>
                    )}
                    <span className="text-xl block mb-0.5">{t.icon}</span>
                    <p className="text-xs font-bold text-foreground">{t.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>
              {boxType === "main" && hasMainBox && !editBox && (
                <div className="mt-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                  ⚠️ يوجد صندوق رئيسي بالفعل. لا يمكن إنشاء أكثر من صندوق رئيسي.
                </div>
              )}
            </div>
          )}

          {/* Box Info */}
          <div className="space-y-4">
            <div>
              <label className="text-[13px] font-bold text-muted-foreground block mb-1">اسم الصندوق *</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={placeholders[boxType]} className="h-11" style={{ borderRadius: 8, borderColor: "#CBD5E1" }} />
            </div>
            <div>
              <label className="text-[13px] font-bold text-muted-foreground block mb-1">الفرع / الموقع</label>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="مثال: فرع رام الله" className="h-11" style={{ borderRadius: 8, borderColor: "#CBD5E1" }} />
            </div>
            {/* Branch Link for POS/Branch boxes */}
            {(boxType === "pos" || boxType === "branch") && branchesList.length > 0 && (
              <div>
                <label className="text-[13px] font-bold text-muted-foreground flex items-center gap-1 mb-1">
                  ربط بفرع (للكول سنتر) 
                  <span className="text-[10px] text-muted-foreground font-normal">— مهم لتوصيل الفواتير</span>
                </label>
                <Select value={selectedBranchId || "none"} onValueChange={v => setSelectedBranchId(v === "none" ? null : v)}>
                  <SelectTrigger className="h-11" style={{ borderRadius: 8, borderColor: "#CBD5E1" }}>
                    <SelectValue placeholder="اختر الفرع..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون ربط</SelectItem>
                    {branchesList.map(br => (
                      <SelectItem key={br.id} value={br.id}>🏪 {br.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Currency chips */}
            <div>
              <label className="text-[13px] font-bold text-muted-foreground block mb-1">العملة الأساسية</label>
              <div className="flex gap-2">
                {[{ key: "ILS", label: "₪ شيكل" }, { key: "USD", label: "$ دولار" }, { key: "JOD", label: "د.أ دينار" }].map(c => (
                  <button key={c.key} onClick={() => setCurrency(c.key)}
                    className="px-4 py-2 text-xs font-bold transition-all"
                    style={{
                      borderRadius: 8,
                      background: currency === c.key ? "#0D1B2E" : "#F8FAFC",
                      color: currency === c.key ? "#fff" : "#475569",
                      border: currency === c.key ? "1px solid #0D1B2E" : "1px solid #CBD5E1",
                    }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Balance + Date row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] font-bold text-muted-foreground block mb-1">الرصيد الافتتاحي</label>
                <Input type="number" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="0.00" className="h-11 font-mono" style={{ borderRadius: 8, borderColor: "#CBD5E1" }} />
              </div>
              <div>
                <label className="text-[13px] font-bold text-muted-foreground block mb-1">تاريخ الرصيد</label>
                <Input type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)} className="h-11" style={{ borderRadius: 8, borderColor: "#CBD5E1" }} />
              </div>
            </div>

            {/* Alert limits row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] font-bold text-muted-foreground block mb-1">حد التنبيه (الحد الأدنى)</label>
                <Input type="number" value={minAlert} onChange={e => setMinAlert(e.target.value)} placeholder="₪ 0.00" className="h-11 font-mono" style={{ borderRadius: 8, borderColor: "#CBD5E1" }} />
              </div>
              <div>
                <label className="text-[13px] font-bold text-muted-foreground block mb-1">الحد الأقصى المسموح</label>
                <Input type="number" value={maxAlert} onChange={e => setMaxAlert(e.target.value)} placeholder="₪ 0.00" className="h-11 font-mono" style={{ borderRadius: 8, borderColor: "#CBD5E1" }} />
              </div>
            </div>
            {maxAlert && (
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground">عند تجاوز الحد:</label>
                <div className="flex gap-2">
                  {[{ key: "warn", label: "تنبيه فقط" }, { key: "block", label: "منع الإيداع" }].map(a => (
                    <button key={a.key} onClick={() => setMaxAction(a.key)}
                      className="px-3 py-1.5 text-xs font-medium transition-all"
                      style={{
                        borderRadius: 8,
                        background: maxAction === a.key ? "#0D1B2E" : "#F8FAFC",
                        color: maxAction === a.key ? "#fff" : "#475569",
                        border: maxAction === a.key ? "1px solid #0D1B2E" : "1px solid #CBD5E1",
                      }}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Accounting Link */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold" style={{ color: "#4A9EE8" }}>الحساب المحاسبي</h3>
            {!editBox && (
              <div className="flex items-center gap-3">
                <Switch checked={autoCreateAccount} onCheckedChange={setAutoCreateAccount} />
                <label className="text-xs">إنشاء حساب محاسبي جديد تلقائياً</label>
              </div>
            )}
            {autoCreateAccount && !editBox ? (
              <div className="p-3 rounded-lg bg-muted/50 border text-xs space-y-1">
                <p className="font-medium">سيتم إنشاء الحساب التالي تلقائياً:</p>
                <p>الكود: <span className="font-mono">1110-XX</span> (تسلسلي)</p>
                <p>الاسم: <span className="font-medium">{name || "—"}</span></p>
                <p>النوع: نقدية (أصل متداول)</p>
              </div>
            ) : (
              <div>
                <label className="text-xs text-muted-foreground">ربط بحساب موجود</label>
                <Select value={existingAccountCode} onValueChange={setExistingAccountCode}>
                  <SelectTrigger className="mt-1 h-11" style={{ borderRadius: 8, borderColor: "#CBD5E1" }}><SelectValue placeholder="اختر حساب نقدية..." /></SelectTrigger>
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
              <h3 className="text-xs font-bold">ترحيل للرئيسي</h3>
              <div className="flex items-center gap-3">
                <Switch checked={autoTransfer} onCheckedChange={setAutoTransfer} />
                <label className="text-xs">ترحيل تلقائي للصندوق الرئيسي</label>
              </div>
              {autoTransfer && (
                <Select value={autoTransferTrigger} onValueChange={setAutoTransferTrigger}>
                  <SelectTrigger className="h-10" style={{ borderRadius: 8, borderColor: "#CBD5E1" }}><SelectValue /></SelectTrigger>
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
              <h3 className="text-xs font-bold">إعدادات نقطة البيع</h3>
              <div className="flex items-center gap-3">
                <Switch checked={posAutoPost} onCheckedChange={setPosAutoPost} />
                <label className="text-xs">ترحيل مبيعات POS تلقائياً</label>
              </div>
              {posAutoPost && (
                <Select value={posPostTrigger} onValueChange={setPosPostTrigger}>
                  <SelectTrigger className="h-10" style={{ borderRadius: 8, borderColor: "#CBD5E1" }}><SelectValue /></SelectTrigger>
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
            <label className="text-[13px] font-bold text-muted-foreground block mb-1">ملاحظات</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="ملاحظات إضافية..." style={{ borderRadius: 8, borderColor: "#CBD5E1" }} />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t p-4 space-y-2">
          <Button
            className="w-full h-12 text-base font-bold gap-2 text-white hover:opacity-90 transition-opacity"
            style={{ background: "#0D1B2E", borderRadius: 10 }}
            disabled={saving || !name.trim() || (normalizedType === "main" && hasMainBox && !editBox)}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {editBox ? "حفظ التعديلات" : "✓ إنشاء الصندوق"}
          </Button>
          <button onClick={onClose} className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1">
            إلغاء
          </button>
        </div>
      </div>
    </>
  );
};

export default CashBoxDrawer;
