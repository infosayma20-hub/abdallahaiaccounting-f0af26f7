import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Plus, Trash2, Save, CheckCircle, ArrowRight, AlertTriangle,
  User, BookOpen, Building2, Printer, XCircle, FileText, RefreshCw,
  Calculator, Eraser, Layers, ArrowLeftRight, Tag, ChevronRight, ChevronLeft, Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { fetchAllAccountsForOwner } from "@/lib/fetchAllAccounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import JournalAccountPicker, { type PickerAccount } from "@/components/journal/JournalAccountPicker";
import { broadcastChange } from "@/lib/crossTabSync";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";
import { printBulkVoucher } from "@/components/print/buildBulkVoucherPrint";
import BulkInvoiceLinkPicker, { type LinkedInvoiceInfo } from "@/components/finance/BulkInvoiceLinkPicker";
import CostCenterCombobox from "@/components/cost-centers/CostCenterCombobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCostCenters } from "@/hooks/useCostCenters";
import DeductionMonthPicker, { toSalaryPeriod } from "@/components/finance/DeductionMonthPicker";

/* ────────────────────────────────────────────────────────────────
   Bulk Voucher (سند صرف/قبض جماعي) — Microsoft Dynamics style
   ---------------------------------------------------------------
   - mode="payment": lines DEBIT, source (cash/bank) CREDIT. Prefix BPV
   - mode="receipt": lines CREDIT, source (cash/bank) DEBIT.  Prefix BRV
   - All actions live in the FinanceShell ribbon (no sticky footer).
   - Same tables: vouchers (subtype='bulk') + voucher_lines + transactions.
   - Edit = delete + recreate (accounting integrity policy).
   ──────────────────────────────────────────────────────────────── */

const MAX_LINES = 105;
type Mode = "payment" | "receipt";
type LineKind = "account" | "employee" | "contact";

interface Props { mode: Mode }

interface LineRow {
  id: string;
  kind: LineKind;
  account_code: string;
  account_name: string;
  employee_id?: string;
  employee_name?: string;
  contact_id?: string;
  contact_name?: string;
  description: string;
  amount: number;
  cost_center_id?: string | null;
  linked_invoice?: LinkedInvoiceInfo | null;
  /** شهر خصم السلفة من الراتب ("YYYY-MM")، فاضي = شهر السند. لأسطر الموظفين فقط */
  deduction_month?: string;
}

interface AccountRow { id: string; account_code: string; account_name: string; account_type: string; parent_code: string | null }
interface EmployeeRow { id: string; full_name: string }
interface ContactRow { id: string; contact_name: string; linked_account_code: string | null; contact_type: string | null }
interface CashBoxRow { id: string; name: string; gl_account_code: string }
interface BankAccountRow { id: string; name: string; bank_name: string; gl_account_code: string }

const newLine = (): LineRow => ({
  id: crypto.randomUUID(),
  kind: "account",
  account_code: "",
  account_name: "",
  description: "",
  amount: 0,
  cost_center_id: null,
  linked_invoice: null,
});

const kindIcon = (k: LineKind) => k === "employee" ? User : k === "contact" ? Building2 : BookOpen;

export default function BulkVoucherPage({ mode }: Props) {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id?: string }>();
  const { user } = useAuth();
  const { dataOwnerId: ownerId } = useDataOwnerId();
  const { settings } = useCompanySettings();

  const isEdit = !!editId;
  const isPayment = mode === "payment";
  const title = isPayment ? "سند صرف جماعي" : "سند قبض جماعي";
  const refPrefix = isPayment ? "BPV" : "BRV";
  const voucherType = isPayment ? "payment" : "receipt";
  const listPath = isPayment ? "/finance/payments" : "/finance/receipts";

  // Header
  const [refNumber, setRefNumber] = useState("");
  const [voucherDate, setVoucherDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"draft" | "posted" | "cancelled">("draft");

  // Source
  const [source, setSource] = useState<"cash" | "bank">("cash");
  const [cashBoxId, setCashBoxId] = useState<string>("");
  const [bankAccountId, setBankAccountId] = useState<string>("");

  // Loaded data
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [cashBoxes, setCashBoxes] = useState<CashBoxRow[]>([]);
  const [bankAccountsList, setBankAccountsList] = useState<BankAccountRow[]>([]);

  // Lines
  const [lines, setLines] = useState<LineRow[]>([newLine(), newLine()]);
  const [saving, setSaving] = useState(false);
  // Synchronous re-entry guard against rapid double-clicks.
  const savingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  // Guard: hydrate the voucher-being-edited exactly once. Without this any
  // re-run of the load effect (parent re-render → new `user` object) would
  // overwrite fields the user just changed (e.g. cashBoxId) with the DB value,
  // making edits appear to "not stick".
  const hydratedVoucherIdRef = useRef<string | null>(null);

  const postableAccounts = useMemo<PickerAccount[]>(() => {
    const parents = new Set(accounts.map(a => String(a.parent_code || "").trim()).filter(Boolean));
    return accounts
      .filter(a => !parents.has(String(a.account_code || "").trim()))
      .map(a => ({ account_code: a.account_code, account_name: a.account_name, account_type: a.account_type }));
  }, [accounts]);

  const regenerateRef = useCallback(async () => {
    if (!ownerId) return;
    const { data } = await supabase
      .from("vouchers")
      .select("ref_number")
      .eq("user_id", ownerId)
      .eq("type", voucherType)
      .like("ref_number", `${refPrefix}-%`)
      .order("created_at", { ascending: false })
      .limit(1);
    const lastRef = (data || [])[0]?.ref_number || "";
    const m = lastRef.match(/(\d+)$/);
    const next = m ? String(parseInt(m[1]) + 1).padStart(Math.max(m[1].length, 4), "0") : "0001";
    setRefNumber(`${refPrefix}-${new Date().getFullYear()}-${next}`);
  }, [ownerId, refPrefix, voucherType]);

  /* Load master data + (optionally) edited voucher */
  useEffect(() => {
    if (!user || !ownerId) return;
    (async () => {
      setLoading(true);
      const [emp, con, cb, ba] = await Promise.all([
        supabase.from("employees").select("id, full_name").eq("user_id", ownerId).eq("is_active", true).order("full_name"),
        supabase.from("contacts").select("id, contact_name, linked_account_code, contact_type").eq("user_id", ownerId).order("contact_name"),
        supabase.from("cash_boxes").select("id, name, gl_account_code").eq("user_id", ownerId).eq("is_active", true),
        supabase.from("bank_accounts").select("id, name, bank_name, gl_account_code").eq("user_id", ownerId).eq("is_active", true),
      ]);
      setEmployees((emp.data || []) as EmployeeRow[]);
      setContacts((con.data || []) as ContactRow[]);
      setCashBoxes((cb.data || []) as CashBoxRow[]);
      setBankAccountsList((ba.data || []) as BankAccountRow[]);

      const acc = await fetchAllAccountsForOwner<AccountRow>(
        ownerId,
        "id, account_code, account_name, account_type, parent_code",
        { activeOnly: true }
      );
      setAccounts(acc);

      if (isEdit && editId) {
        if (hydratedVoucherIdRef.current === editId) {
          setLoading(false);
          return;
        }
        // Load existing voucher
        const { data: v } = await supabase
          .from("vouchers").select("*").eq("id", editId).eq("user_id", ownerId).maybeSingle();
        if (v) {
          hydratedVoucherIdRef.current = editId;
          setRefNumber((v as any).ref_number || "");
          setVoucherDate(((v as any).date || "").slice(0, 10) || voucherDate);
          setDescription((v as any).description || "");
          setNotes((v as any).notes || "");
          setStatus(((v as any).status || "draft") as any);
          if ((v as any).bank_account_id) {
            setSource("bank");
            setBankAccountId((v as any).bank_account_id);
          } else if ((v as any).cash_box_id) {
            setSource("cash");
            setCashBoxId((v as any).cash_box_id);
          } else {
            setSource("cash");
            // find cash box via cash lines
          }
          const { data: vlines } = await supabase
            .from("voucher_lines").select("*").eq("voucher_id", editId).order("line_order");
          const all = (vlines || []) as any[];
          // Credit line for payment (or debit line for receipt) = the source line
          const sourceLine = isPayment
            ? all.find(l => Number(l.credit) > 0)
            : all.find(l => Number(l.debit) > 0);
          if (sourceLine && !((v as any).bank_account_id) && !((v as any).cash_box_id)) {
            const foundCb = (cb.data || []).find((c: any) => c.gl_account_code === sourceLine.account_code);
            if (foundCb) setCashBoxId(foundCb.id);
          }
          const partyLines = isPayment
            ? all.filter(l => Number(l.debit) > 0)
            : all.filter(l => Number(l.credit) > 0);
          if (partyLines.length) {
            // شهور الخصم المحفوظة على حركات الموظفين لهذا السند
            const { data: movs } = await supabase
              .from("employee_financial_movements")
              .select("employee_id, salary_month, salary_year")
              .eq("source_id", editId)
              .eq("source_type", "finance_manual");
            const monthByEmp = new Map<string, string>();
            for (const m of (movs || []) as any[]) {
              if (m.employee_id && m.salary_month && m.salary_year) {
                monthByEmp.set(m.employee_id, `${m.salary_year}-${String(m.salary_month).padStart(2, "0")}`);
              }
            }
            const empList = (emp.data || []) as EmployeeRow[];
            setLines(partyLines.map((l): LineRow => {
              // أسطر الموظفين محفوظة تحت حساب "ذمم موظف - الاسم" بدون contact_id
              const empRow = !l.contact_id
                ? empList.find(e => (l.account_name || "").trim() === `ذمم موظف - ${e.full_name}`
                    || (l.contact_name || "").trim() === e.full_name)
                : undefined;
              return {
                id: crypto.randomUUID(),
                kind: l.contact_id ? "contact" : empRow ? "employee" : "account",
                account_code: l.account_code,
                account_name: l.account_name || "",
                contact_id: l.contact_id || undefined,
                contact_name: l.contact_name || undefined,
                employee_id: empRow?.id,
                employee_name: empRow?.full_name,
                description: l.description || l.line_comment || "",
                amount: Number(isPayment ? l.debit : l.credit) || 0,
                cost_center_id: l.cost_center_id || null,
                linked_invoice: null,
                deduction_month: empRow ? monthByEmp.get(empRow.id) : undefined,
              };
            }));
          }
        }
      } else {
        if ((cb.data || []).length) setCashBoxId(cb.data![0].id);
        if ((ba.data || []).length) setBankAccountId(ba.data![0].id);
        await regenerateRef();
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ownerId, editId, isEdit]);

  /* Line handlers */
  const addLine = () => {
    if (lines.length >= MAX_LINES) { toast.warning(`الحد الأقصى ${MAX_LINES} سطر`); return; }
    setLines(prev => [...prev, newLine()]);
  };
  const addTenLines = () => {
    const room = MAX_LINES - lines.length;
    if (room <= 0) { toast.warning(`الحد الأقصى ${MAX_LINES} سطر`); return; }
    setLines(prev => [...prev, ...Array.from({ length: Math.min(10, room) }, () => newLine())]);
  };
  const clearLines = () => setLines([newLine(), newLine()]);
  const removeLine = (id: string) => setLines(prev => prev.length <= 1 ? prev : prev.filter(l => l.id !== id));
  const updateLine = (id: string, patch: Partial<LineRow>) =>
    setLines(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
  const changeKind = (id: string, kind: LineKind) => {
    updateLine(id, {
      kind, account_code: "", account_name: "",
      employee_id: undefined, employee_name: undefined,
      contact_id: undefined, contact_name: undefined,
      linked_invoice: null,
      deduction_month: undefined,
    });
  };

  const totalAmount = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [lines],
  );

  /* موظف السطر — سواء اختير كـ"موظف" أو عبر حساب ذمم موظف مباشرة */
  const employeeOfLine = useCallback((l: LineRow): { id: string; name: string } | null => {
    if (l.kind === "employee" && l.employee_id) {
      return { id: l.employee_id, name: l.employee_name || "" };
    }
    const m = /ذمم\s*موظف\s*[-–]\s*(.+)$/.exec((l.account_name || "").trim());
    if (!m) return null;
    const nm = m[1].trim();
    const emp = employees.find(e => (e.full_name || "").trim() === nm);
    return emp ? { id: emp.id, name: emp.full_name } : null;
  }, [employees]);

  const sourceAccountCode = useMemo(() => {
    if (source === "cash") return cashBoxes.find(c => c.id === cashBoxId)?.gl_account_code || "";
    return bankAccountsList.find(b => b.id === bankAccountId)?.gl_account_code || "";
  }, [source, cashBoxId, bankAccountId, cashBoxes, bankAccountsList]);

  const sourceLabel = useMemo(() => {
    if (source === "cash") return cashBoxes.find(c => c.id === cashBoxId)?.name || "";
    const b = bankAccountsList.find(b => b.id === bankAccountId);
    return b ? `${b.bank_name} - ${b.name}` : "";
  }, [source, cashBoxId, bankAccountId, cashBoxes, bankAccountsList]);

  const validationError = useMemo(() => {
    if (!description.trim()) return "أدخل بيان السند";
    if (!sourceAccountCode) return source === "cash" ? "اختر الصندوق" : "اختر البنك";
    if (lines.length === 0) return "أضف سطر واحد على الأقل";
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!(Number(l.amount) > 0)) return `السطر ${i + 1}: المبلغ يجب أن يكون أكبر من صفر`;
      if (l.kind === "account" && !l.account_code) return `السطر ${i + 1}: اختر الحساب`;
      if (l.kind === "employee" && !l.employee_id) return `السطر ${i + 1}: اختر الموظف`;
      if (l.kind === "contact" && !l.contact_id) return `السطر ${i + 1}: اختر الجهة`;
    }
    if (!(totalAmount > 0)) return "الإجمالي يجب أن يكون أكبر من صفر";
    return null;
  }, [description, lines, sourceAccountCode, source, totalAmount]);

  /* Resolve employee sub-account under 2180 */
  const resolveEmployeeAccount = async (empName: string): Promise<string> => {
    const { data: existing } = await supabase.from("accounts")
      .select("account_code").eq("user_id", ownerId!).eq("parent_code", "2180")
      .like("account_name", `%${empName}%`).limit(1).maybeSingle();
    if (existing) return (existing as any).account_code;
    const { data: maxRow } = await supabase.from("accounts")
      .select("account_code").eq("user_id", ownerId!).eq("parent_code", "2180")
      .order("account_code", { ascending: false }).limit(1).maybeSingle();
    const nextCode = maxRow ? String(parseInt((maxRow as any).account_code) + 1) : "21801";
    const { error } = await supabase.from("accounts").insert({
      user_id: ownerId!, account_code: nextCode,
      account_name: `ذمم موظف - ${empName}`, account_type: "التزامات",
      parent_code: "2180", is_system: false,
    } as any);
    if (error) throw error;
    return nextCode;
  };

  const resolveContactAccount = async (contactId: string): Promise<string> => {
    const c = contacts.find(x => x.id === contactId);
    const parent = isPayment ? "2110" : "1130";
    const linked = c?.linked_account_code?.trim();
    // Reject parent codes (2110/1130/2180) — they must never be posted to.
    // Force a real sub-account via the RPC (creates one if missing and
    // updates contacts.linked_account_code).
    const isParent = !!linked && (linked === "2110" || linked === "1130" || linked === "2180");
    if (linked && !isParent) return linked;
    const { data, error } = await supabase.rpc("resolve_postable_account", {
      p_user_id: ownerId!,
      p_parent_code: parent,
      p_contact_id: contactId,
      p_contact_name: c?.contact_name || null,
      p_contact_type: c?.contact_type || null,
    });
    if (error || !data) throw new Error(error?.message || "تعذر تحديد الحساب الفرعي للجهة");
    const code = data as unknown as string;
    // Cache locally so the UI reflects the new mapping immediately.
    if (c) c.linked_account_code = code;
    return code;
  };

  /* Save */
  const handleSave = async (asDraft: boolean) => {
    if (savingRef.current) return;
    if (!user || !ownerId) return;
    if (validationError) { toast.error(validationError); return; }
    savingRef.current = true;
    setSaving(true);

    let voucherId: string | null = editId || null;
    const insertedTxIds: string[] = [];
    try {
      // Resolve each line's account_code
      const resolved: Array<LineRow & { resolvedCode: string; resolvedName: string; contactIdForTx: string | null }> = [];
      for (const l of lines) {
        let code = l.account_code, name = l.account_name;
        let cid: string | null = null;
        if (l.kind === "employee") {
          code = await resolveEmployeeAccount(l.employee_name!);
          name = `ذمم موظف - ${l.employee_name}`;
        } else if (l.kind === "contact") {
          code = await resolveContactAccount(l.contact_id!);
          name = contacts.find(x => x.id === l.contact_id)?.contact_name || "";
          cid = l.contact_id!;
        }
        if (!code) throw new Error("تعذر تحديد الحساب المحاسبي للسطر");
        resolved.push({ ...l, resolvedCode: code, resolvedName: name, contactIdForTx: cid });
      }

      let finalRef = refNumber;
      if (!finalRef) { await regenerateRef(); finalRef = refNumber; }

      const payMethod = source === "cash" ? "cash" : "transfer";
      const voucherPayload = {
        user_id: ownerId,
        type: voucherType,
        subtype: "bulk",
        ref_number: finalRef,
        date: voucherDate,
        payment_method: payMethod,
        amount: totalAmount,
        amount_ils: totalAmount,
        currency: "ILS",
        exchange_rate: 1,
        description: description.trim(),
        notes: notes || null,
        status: asDraft ? "draft" : "posted",
        bank_account_id: source === "bank" ? bankAccountId : null,
        cash_box_id: source === "cash" ? (cashBoxId || null) : null,
        posted_by: !asDraft ? user.id : null,
        posted_at: !asDraft ? new Date().toISOString() : null,
      };

      /* --- EDIT: delete existing lines + soft-delete existing transactions --- */
      if (isEdit && voucherId) {
        // Soft-delete old transactions by reference
        await supabase.from("transactions").update({ is_deleted: true, idempotency_key: null } as any)
          .eq("user_id", ownerId)
          .or(`reference.eq.${finalRef},idempotency_key.like.BULK-${finalRef}-%`);
        await supabase.from("voucher_lines").delete().eq("voucher_id", voucherId);
        // حركات الموظفين مرآة للسند — تُحذف وتُعاد (سياسة delete & recreate)
        await supabase.from("employee_financial_movements")
          .delete().eq("source_id", voucherId).eq("source_type", "finance_manual");
        const { error: uErr } = await supabase.from("vouchers").update(voucherPayload as any)
          .eq("id", voucherId).eq("user_id", ownerId);
        if (uErr) throw uErr;
      } else {
        const { data: voucher, error: vErr } = await supabase.from("vouchers")
          .insert(voucherPayload as any).select("id, ref_number").single();
        if (vErr) throw vErr;
        voucherId = voucher!.id;
      }

      // voucher_lines: N party lines + 1 source line
      const partyLines = resolved.map((r, idx) => ({
        voucher_id: voucherId!,
        account_code: r.resolvedCode,
        account_name: r.resolvedName || null,
        debit: isPayment ? r.amount : 0,
        credit: isPayment ? 0 : r.amount,
        description: r.description || description.trim(),
        line_order: idx + 1,
        contact_id: r.contactIdForTx,
        contact_name: r.kind === "contact" ? r.resolvedName : (r.kind === "employee" ? r.employee_name : null),
        cost_center_id: r.cost_center_id || null,
      }));
      const sourceLine = {
        voucher_id: voucherId!,
        account_code: sourceAccountCode,
        account_name: sourceLabel || null,
        debit: isPayment ? 0 : totalAmount,
        credit: isPayment ? totalAmount : 0,
        description: description.trim(),
        line_order: partyLines.length + 1,
      };
      const { error: linesErr } = await supabase.from("voucher_lines").insert([...partyLines, sourceLine] as any);
      if (linesErr) throw linesErr;

      // Transactions (only if posted)
      if (!asDraft) {
        const payMethodAr = source === "cash" ? "نقدي" : "بنك";
        for (let i = 0; i < resolved.length; i++) {
          const r = resolved[i];
          const desc = r.description?.trim() || `${description.trim()} - ${r.resolvedName || ""}`.trim();
          const { data: tx, error: txErr } = await supabase.from("transactions").insert({
            user_id: ownerId,
            transaction_date: voucherDate,
            description: desc,
            debit_account_code: isPayment ? r.resolvedCode : sourceAccountCode,
            credit_account_code: isPayment ? sourceAccountCode : r.resolvedCode,
            amount: r.amount,
            currency: "شيكل",
            transaction_type: r.kind === "employee" ? (isPayment ? "employee_payment" : "employee_receipt") : (r.kind === "account" ? "journal" : voucherType),
            contact_id: r.contactIdForTx,
            payment_method: payMethodAr,
            idempotency_key: `BULK-${finalRef}-${i + 1}`,
            reference: finalRef,
            cost_center_id: r.cost_center_id || null,
          } as any).select("id").single();
          if (txErr) throw txErr;
          if (tx?.id) insertedTxIds.push(tx.id);

          // مرآة سلفة الموظف في السجل المساعد → تظهر كخصم على شهر محدد
          const lineEmp = employeeOfLine(r);
          if (lineEmp && isPayment) {
            const period = toSalaryPeriod(r.deduction_month || "", voucherDate);
            const { error: mvErr } = await supabase.from("employee_financial_movements").insert({
              user_id: ownerId,
              employee_id: lineEmp.id,
              source_type: "finance_manual",
              source_id: voucherId,
              source_reference: finalRef,
              reference_number: finalRef,
              category: "advance",
              description: desc || `سند صرف جماعي - سلفة ${lineEmp.name}`,
              amount: r.amount,
              movement_type: "debit",
              status: "approved",
              movement_date: voucherDate,
              salary_month: period.salary_month,
              salary_year: period.salary_year,
              salary_month_locked: !!deductionMonth,
              created_by: user.id,
              notes: notes || null,
            } as any);
            if (mvErr) console.warn("[BulkVoucher] employee movement mirror failed:", mvErr.message);
          }

          // Link invoice if requested for this line
          if (r.linked_invoice && tx?.id) {
            await supabase.from("payment_invoice_links" as any).insert({
              user_id: ownerId,
              invoice_id: r.linked_invoice.invoice_id,
              transaction_id: tx.id,
              allocated_amount: r.linked_invoice.allocated_amount,
              source: `bulk_${voucherType}`,
            } as any);
            // update invoice paid_amount
            const { data: inv } = await supabase.from("invoices")
              .select("paid_amount, total_amount").eq("id", r.linked_invoice.invoice_id).maybeSingle();
            if (inv) {
              const newPaid = Math.min((inv.paid_amount || 0) + r.linked_invoice.allocated_amount, inv.total_amount);
              await supabase.from("invoices").update({
                paid_amount: newPaid,
                remaining_amount: inv.total_amount - newPaid,
                payment_status: newPaid >= inv.total_amount ? "paid" : (newPaid > 0 ? "partial" : "unpaid"),
              }).eq("id", r.linked_invoice.invoice_id);
            }
          }
        }
      }

      broadcastChange(voucherType === "payment" ? "payment_voucher" : "receipt_voucher", isEdit ? "updated" : "created", voucherId!);
      toast.success(asDraft ? "تم حفظ المسودة" : `تم ${isEdit ? "تحديث" : "ترحيل"} السند ${finalRef}`);
      setTimeout(() => navigate(listPath), 700);
    } catch (err: any) {
      console.error("[BulkVoucher] save failed", err);
      try {
        if (insertedTxIds.length) {
          await supabase.from("transactions").update({ is_deleted: true, idempotency_key: null } as any).in("id", insertedTxIds);
        }
        if (!isEdit && voucherId) {
          await supabase.from("vouchers").delete().eq("id", voucherId).eq("user_id", ownerId);
        }
      } catch (cleanupErr) {
        console.error("[BulkVoucher] cleanup failed", cleanupErr);
      }
      toast.error(err?.message || "فشل حفظ السند الجماعي");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleCancelVoucher = async () => {
    if (!isEdit || !editId) return;
    if (!window.confirm(`هل أنت متأكد من إلغاء السند ${refNumber}؟ سيتم عكس كل الحركات المرتبطة به.`)) return;
    try {
      const { error } = await (supabase as any).rpc("cancel_bulk_voucher", {
        p_voucher_id: editId, p_reason: "إلغاء يدوي من صفحة السند",
      });
      if (error) throw error;
      // إزالة مرآة حركات الموظفين حتى لا تظهر خصومات لسند ملغي
      await supabase.from("employee_financial_movements")
        .delete().eq("source_id", editId).eq("source_type", "finance_manual");
      broadcastChange(voucherType === "payment" ? "payment_voucher" : "receipt_voucher", "updated", editId);
      toast.success("تم إلغاء السند بنجاح");
      setTimeout(() => navigate(listPath), 500);
    } catch (e: any) {
      toast.error(e?.message || "فشل إلغاء السند");
    }
  };

  /* Prev / Next / Query — navigate across bulk vouchers of the same type */
  const navigateSibling = async (dir: "prev" | "next") => {
    if (!ownerId) return;
    const q = supabase
      .from("vouchers")
      .select("id, ref_number")
      .eq("user_id", ownerId)
      .eq("type", voucherType)
      .eq("subtype", "bulk")
      .like("ref_number", `${refPrefix}-%`);
    const ordered = dir === "prev"
      ? q.lt("ref_number", refNumber || "\uffff").order("ref_number", { ascending: false }).limit(1)
      : q.gt("ref_number", refNumber || "").order("ref_number", { ascending: true }).limit(1);
    const { data } = await ordered;
    const row = (data || [])[0] as any;
    if (!row) { toast.info(dir === "prev" ? "لا يوجد سند سابق" : "لا يوجد سند تالي"); return; }
    navigate(isPayment ? `/finance/payment/bulk/${row.id}/edit` : `/finance/receipt/bulk/${row.id}/edit`);
  };

  const handlePrint = () => {
    printBulkVoucher({
      mode,
      refNumber,
      date: voucherDate,
      paymentMethodLabel: source === "cash" ? "نقدي (صندوق)" : "تحويل بنكي",
      sourceLabel,
      description: description || undefined,
      notes: notes || undefined,
      companyName: settings.company_name || undefined,
      status: status === "posted" ? "مُرحّل" : status === "cancelled" ? "ملغي" : "مسودة",
      lines: lines.map((l, idx) => ({
        index: idx + 1,
        party: l.kind === "employee" ? (l.employee_name || "")
             : l.kind === "contact"  ? (l.contact_name || "")
             : `${l.account_code || ""} - ${l.account_name || ""}`,
        description: l.description,
        amount: Number(l.amount) || 0,
      })),
      total: totalAmount,
    });
  };

  const readonly = status === "cancelled" || saving;

  /* Dynamics-style ribbon */
  const actionTabs: ActionTab[] = [
    {
      key: "home",
      label: "الصفحة الرئيسية",
      groups: [
        {
          key: "save", label: "حفظ", items: [
            { key: "post", label: saving ? "جارٍ الترحيل..." : (isEdit ? "حفظ وتحديث" : "حفظ وترحيل"),
              icon: CheckCircle, variant: "primary",
              onClick: () => handleSave(false),
              disabled: readonly || saving || !!validationError },
            { key: "draft", label: "حفظ مسودة", icon: Save,
              onClick: () => handleSave(true),
              disabled: readonly || saving || !!validationError },
            { key: "refresh", label: "إعادة تحميل", icon: RefreshCw,
              onClick: () => {
                if (confirm("سيتم تجاهل أي تغييرات غير محفوظة وإعادة تحميل السند. متابعة؟")) {
                  window.location.reload();
                }
              }, disabled: saving },
          ],
        },
        {
          key: "lines", label: "السطور", items: [
            { key: "add", label: "إضافة سطر", icon: Plus,
              onClick: addLine, disabled: readonly || lines.length >= MAX_LINES,
              shortcut: "Alt+I" },
            { key: "add10", label: "إدراج 10 سطور", icon: Layers,
              onClick: addTenLines, disabled: readonly || lines.length >= MAX_LINES },
            { key: "clear", label: "مسح السطور", icon: Eraser,
              onClick: clearLines, disabled: readonly, variant: "ghost" },
          ],
        },
        {
          key: "print", label: "طباعة", items: [
            { key: "print", label: "طباعة السند", icon: Printer,
              onClick: handlePrint, disabled: lines.length === 0 },
          ],
        },
        {
          key: "actions", label: "إجراءات", items: [
            ...(isEdit && status !== "cancelled" ? [{
              key: "cancel", label: "إلغاء السند", icon: XCircle,
              variant: "danger" as const, onClick: handleCancelVoucher,
            }] : []),
            { key: "center", label: "مركز المالية", icon: Calculator,
              onClick: () => navigate("/accounting-center") },
            { key: "switch", label: isPayment ? "تحويل لسند قبض" : "تحويل لسند صرف",
              icon: ArrowLeftRight,
              onClick: () => navigate(isPayment ? "/finance/receipt/bulk/new" : "/finance/payment/bulk/new") },
          ],
        },
        {
          key: "nav", label: "تنقّل", items: [
            { key: "prev", label: "السابق", icon: ChevronRight,
              onClick: () => navigateSibling("prev"), disabled: !refNumber },
            { key: "next", label: "التالي", icon: ChevronLeft,
              onClick: () => navigateSibling("next"), disabled: !refNumber },
            { key: "query", label: "استعلام", icon: Search,
              onClick: () => navigate(`${listPath}?subtype=bulk`) },
            { key: "list", label: "قائمة السندات", icon: FileText,
              onClick: () => navigate(listPath) },
            { key: "back", label: "رجوع", icon: ArrowRight, variant: "ghost",
              onClick: () => navigate(-1) },
          ],
        },
      ],
    },
  ];

  const statusBadge = status === "posted"
    ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">مُرحّل</Badge>
    : status === "cancelled"
      ? <Badge className="bg-red-100 text-red-700 hover:bg-red-100">ملغي</Badge>
      : <Badge variant="outline">مسودة</Badge>;

  return (
    <FinanceShell
      title={title}
      subtitle={isEdit ? `تعديل السند ${refNumber}` : "إنشاء سند جماعي جديد بعدة سطور دفعة واحدة"}
      breadcrumb={[
        { label: "المالية", href: "/accounting-center" },
        { label: isPayment ? "سندات الصرف" : "سندات القبض", href: listPath },
        { label: isEdit ? refNumber || "تعديل" : "جماعي جديد" },
      ]}
      actionTabs={actionTabs}
      rightSlot={
        <div className="flex items-center gap-2 text-[12px]">
          {statusBadge}
          <Badge variant="secondary" className="tabular-nums">
            {lines.length} سطر
          </Badge>
          <Badge className="tabular-nums bg-primary/10 text-primary hover:bg-primary/10">
            الإجمالي ₪{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Badge>
        </div>
      }
    >
      <div dir="rtl" className="space-y-4 max-w-6xl mx-auto">
        {loading && (
          <div className="text-sm text-muted-foreground">جارٍ التحميل...</div>
        )}

        {/* Header (Top): رقم السند + التاريخ فقط */}
        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>رقم السند</Label>
              <Input value={refNumber} onChange={e => setRefNumber(e.target.value)} disabled={readonly || isEdit} dir="ltr" />
            </div>
            <div>
              <Label>التاريخ</Label>
              <Input type="date" value={voucherDate} onChange={e => setVoucherDate(e.target.value)} disabled={readonly} />
            </div>
          </CardContent>
        </Card>

        {/* Lines table */}
        <Card>
          <CardContent className="p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm text-muted-foreground">
                السطور ({lines.length}/{MAX_LINES})
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b bg-muted/30">
                    <th className="text-right p-2 w-10">#</th>
                    <th className="text-right p-2 w-32">النوع</th>
                    <th className="text-right p-2 min-w-[240px]">{isPayment ? "المستفيد / الحساب" : "العميل / الحساب"}</th>
                    <th className="text-right p-2 min-w-[180px]">البيان</th>
                    <th className="text-right p-2 w-32">ربط فاتورة</th>
                    <th className="text-right p-2 w-56">المبلغ</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => {
                    const Icon = kindIcon(l.kind);
                    return (
                      <tr key={l.id} className="border-b last:border-0 align-top hover:bg-muted/20">
                        <td className="p-2 text-muted-foreground">{idx + 1}</td>
                        <td className="p-2">
                          <Select value={l.kind} onValueChange={(v: any) => changeKind(l.id, v)} disabled={readonly}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="account"><span className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5" /> حساب</span></SelectItem>
                              <SelectItem value="employee"><span className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> موظف</span></SelectItem>
                              <SelectItem value="contact"><span className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> {isPayment ? "مورد / جهة" : "عميل / جهة"}</span></SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          {l.kind === "account" && (
                            <JournalAccountPicker
                              lineId={l.id}
                              value={l.account_code}
                              accountName={l.account_name}
                              accounts={postableAccounts}
                              onSelect={(a) => updateLine(l.id, { account_code: a.account_code, account_name: a.account_name })}
                              onClear={() => updateLine(l.id, { account_code: "", account_name: "" })}
                            />
                          )}
                          {l.kind === "employee" && (
                            <Select value={l.employee_id || ""} onValueChange={(v) => {
                              const e = employees.find(x => x.id === v);
                              updateLine(l.id, { employee_id: v, employee_name: e?.full_name || "" });
                            }} disabled={readonly}>
                              <SelectTrigger className="h-9"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                              <SelectContent className="max-h-80">
                                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                          {l.kind === "contact" && (
                            <Select value={l.contact_id || ""} onValueChange={(v) => {
                              const c = contacts.find(x => x.id === v);
                              updateLine(l.id, { contact_id: v, contact_name: c?.contact_name || "", linked_invoice: null });
                            }} disabled={readonly}>
                              <SelectTrigger className="h-9"><SelectValue placeholder={isPayment ? "اختر الجهة" : "اختر العميل"} /></SelectTrigger>
                              <SelectContent className="max-h-80">
                                {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td className="p-2">
                          <Input value={l.description}
                            onChange={e => updateLine(l.id, { description: e.target.value })}
                            placeholder="بيان السطر (اختياري)" disabled={readonly} />
                        </td>
                        <td className="p-2">
                          {l.kind === "contact" && ownerId ? (
                            <BulkInvoiceLinkPicker
                              ownerId={ownerId}
                              contactId={l.contact_id || ""}
                              mode={mode}
                              lineAmount={Number(l.amount) || 0}
                              disabled={readonly}
                              value={l.linked_invoice || null}
                              onChange={(v) => updateLine(l.id, { linked_invoice: v })}
                            />
                          ) : (
                            <span className="text-[11px] text-muted-foreground/70">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            <Input type="number" inputMode="decimal" step="0.01" min="0"
                              value={l.amount || ""}
                              onChange={e => updateLine(l.id, { amount: parseFloat(e.target.value) || 0 })}
                              className="text-right font-mono text-base h-10 flex-1 min-w-[140px]"
                              placeholder="0.00"
                              disabled={readonly} />
                            <CostCenterIconPicker
                              value={l.cost_center_id || null}
                              onChange={(v) => updateLine(l.id, { cost_center_id: v })}
                              disabled={readonly}
                            />
                            {isPayment && !!employeeOfLine(l) && (
                              <DeductionMonthPicker
                                value={l.deduction_month || ""}
                                onChange={(v) => updateLine(l.id, { deduction_month: v })}
                                baseDate={voucherDate}
                                disabled={readonly}
                              />
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          <Button size="icon" variant="ghost"
                            onClick={() => removeLine(l.id)}
                            disabled={readonly || lines.length <= 1}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold bg-primary/5">
                    <td colSpan={5} className="p-2 text-right">الإجمالي</td>
                    <td className="p-2 text-right font-mono text-primary">
                      {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Footer: طريقة الدفع (نقدي فقط) + الصندوق + البيان + الملاحظات */}
        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>طريقة الدفع</Label>
              <Input value="نقدي (صندوق)" disabled dir="rtl" />
            </div>
            <div className="md:col-span-2">
              <Label>{isPayment ? "الصندوق المصروف منه" : "الصندوق المُودَع فيه"}</Label>
              <Select value={cashBoxId} onValueChange={setCashBoxId} disabled={readonly}>
                <SelectTrigger><SelectValue placeholder="اختر الصندوق" /></SelectTrigger>
                <SelectContent>
                  {cashBoxes.map(cb => <SelectItem key={cb.id} value={cb.id}>{cb.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Label>البيان (يُطبَّق على السند كله)</Label>
              <Input
                value={description} onChange={e => setDescription(e.target.value)}
                placeholder={isPayment ? "مثلاً: سلف موظفين شهر تموز 2026" : "مثلاً: دفعات من عملاء شهر تموز 2026"}
                disabled={readonly}
              />
            </div>
            <div className="md:col-span-3">
              <Label>ملاحظات (اختياري — Enter لسطر جديد)</Label>
              <Textarea
                rows={4}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                disabled={readonly}
                className="resize-y whitespace-pre-wrap"
                placeholder="اكتب ملاحظاتك هنا... اضغط Enter لسطر جديد"
              />
            </div>
          </CardContent>
        </Card>

        {validationError && (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4" /> {validationError}
          </div>
        )}
      </div>
    </FinanceShell>
  );
}

/* ─── Icon-sized cost center picker used inside the amount cell ─── */
function CostCenterIconPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: list = [] } = useCostCenters();
  const selected = list.find((c) => c.id === value) || null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={selected ? "default" : "ghost"}
          disabled={disabled}
          className="h-9 w-9 shrink-0"
          title={selected ? `مركز التكلفة: ${selected.code} - ${selected.name_ar || selected.name}` : "إضافة مركز تكلفة"}
        >
          <Tag className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-2 z-[100]" align="end" dir="rtl">
        <div className="text-[11px] font-semibold text-muted-foreground mb-2">مركز التكلفة</div>
        <CostCenterCombobox
          value={value}
          onChange={(v) => { onChange(v); setOpen(false); }}
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  );
}