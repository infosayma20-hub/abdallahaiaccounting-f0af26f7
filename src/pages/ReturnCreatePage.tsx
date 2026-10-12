import { useState, useEffect, useMemo, useRef } from "react";
import { pickTenantAccountCode } from "@/lib/tenantAccountResolver";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Save, Send, Plus, Trash2, AlertTriangle, Package, Search, ArrowRight, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useCostCenters } from "@/hooks/useCostCenters";
import { FinanceShell } from "@/components/finance/shell";
import type { ActionTab } from "@/components/finance/shell";
import { broadcastChange } from "@/lib/crossTabSync";
import { ensureContactSubAccount } from "@/lib/contactAccountResolver";
import ReturnItemsEditor from "@/components/returns/ReturnItemsEditor";
import { calculateReturnSummary, calculateReturnLine, cancelManagedReturn, isReturnsPilot } from "@/lib/returns";
import { useAccountantPermissions } from "@/hooks/useAccountantPermissions";
import InvoicePrintView from "@/components/InvoicePrintView";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createRoot } from "react-dom/client";
import { Eye, Printer, FileText } from "lucide-react";
import useSavePostShortcut from "@/hooks/useSavePostShortcut";

type TaxCategory = "taxable" | "zero" | "exempt";

interface Item {
  id: string;
  productId?: string | null;
  sourceInvoiceItemId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  discountType?: "amount" | "percent";
  taxCategory: TaxCategory;
  taxRate: number;
  maxReturnableQty?: number | null; // for invoice-linked items
}

interface Contact {
  id: string;
  contact_name: string;
  contact_type: string;
}

interface InvoiceLite {
  id: string;
  invoice_number: string | null;
  contact_name: string | null;
  contact_id: string | null;
  total_amount: number | null;
  invoice_date: string | null;
}

interface ProductLite {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  sell_price: number | null;
  buy_price: number | null;
  unit: string | null;
  product_type: string | null;
  quantity: number | null;
}

interface Props {
  returnType: "sales" | "purchase";
}

const TAX_OPTS: { value: TaxCategory; label: string; rate: number }[] = [
  { value: "taxable", label: "خاضع 16%", rate: 16 },
  { value: "zero", label: "صفري", rate: 0 },
  { value: "exempt", label: "معفى", rate: 0 },
];

const newItem = (): Item => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: 1,
  unitPrice: 0,
  discount: 0,
  taxCategory: "taxable",
  taxRate: 16,
});

const REASONS_SALES = [
  "إرجاع منتج معيب",
  "إرجاع منتج غير مطابق للطلب",
  "إلغاء جزئي للطلب",
  "خطأ في الكمية المسلّمة",
  "اتفاق مع العميل",
  "أخرى",
];

const REASONS_PURCHASE = [
  "بضاعة معيبة من المورد",
  "بضاعة غير مطابقة للمواصفات",
  "إلغاء جزء من الطلبية",
  "خطأ في الكمية المستلمة",
  "اتفاق مع المورد",
  "أخرى",
];

const ReturnCreatePage = ({ returnType }: Props) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id;
  const pilot = isReturnsPilot(ownerId);
  const { can, loading: permissionsLoading } = useAccountantPermissions();
  const canProcess = !permissionsLoading && can("can_process_returns");
  const commandKeyRef = useRef(crypto.randomUUID());
  const [revision, setRevision] = useState(0);
  const [postingVersion, setPostingVersion] = useState(0);
  const [returnNumber, setReturnNumber] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [warehouses, setWarehouses] = useState<{id: string; name: string}[]>([]);
  const [accounts, setAccounts] = useState<{account_code: string; account_name: string; parent_code: string | null; system_role: string | null; currency: string | null}[]>([]);
  const { toast } = useToast();
  const { settings } = useCompanySettings();
  const { data: costCenters = [] } = useCostCenters();
  const taxEnabled = settings?.vat_enabled ?? true;

  const editId = params.get("edit");
  const viewId = params.get("view");
  const isView = !!viewId;
  const recordId = editId || viewId;

  const isSales = returnType === "sales";
  const titleAr = isSales ? "مردود مبيعات" : "مردود مشتريات";
  const partyLabel = isSales ? "العميل" : "المورد";
  const partyType = isSales ? "عميل" : "مورد";
  const linkedInvoiceType = isSales ? "sale" : "purchase";
  const reasons = isSales ? REASONS_SALES : REASONS_PURCHASE;
  const listPath = isSales ? "/sales/returns" : "/purchases/returns";

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [linkedInvoices, setLinkedInvoices] = useState<InvoiceLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [productPopoverFor, setProductPopoverFor] = useState<string | null>(null);
  const [contactPopover, setContactPopover] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [invoicePopover, setInvoicePopover] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [form, setForm] = useState({
    contactId: null as string | null,
    contactName: "",
    date: new Date().toISOString().split("T")[0],
    linkedInvoiceId: null as string | null,
    linkedInvoiceNumber: "",
    reason: "",
    reasonOther: "",
    notes: "",
    warehouseId: null as string | null,
    refundAccountCode: "",
    taxInclusive: false,
    refundMethod: "credit" as "credit" | "cash" | "bank",
    costCenterId: null as string | null,
    items: [newItem()] as Item[],
    status: "draft" as "draft" | "confirmed" | "cancelled",
  });

  useEffect(() => {
    if (!ownerId || !pilot) return;
    let active = true;
    Promise.all([
      supabase.from("warehouses").select("id,name").eq("user_id", ownerId).order("name"),
      supabase.from("accounts").select("account_code,account_name,parent_code,system_role,currency").eq("user_id", ownerId).eq("is_active", true),
    ]).then(([wh, acc]) => { if (active) { setWarehouses(wh.data || []); setAccounts(acc.data || []); } });
    return () => { active = false; };
  }, [ownerId, pilot]);

  useEffect(() => { commandKeyRef.current = crypto.randomUUID(); }, [recordId, returnType]);

  // Load contacts
  useEffect(() => {
    if (!user || !ownerId) return;
    (async () => {
      const { data: cts } = await supabase
        .from("contacts")
        .select("id, contact_name, contact_type")
        .eq("user_id", ownerId)
        .in("contact_type", [partyType, "عميل ومورد"])
        .order("contact_name");
      setContacts((cts as Contact[]) || []);
      setLoading(false);
    })();
  }, [user, ownerId, partyType]);

  // Load products (for line-item selection)
  useEffect(() => {
    if (!user || !ownerId) return;
    (async () => {
      const data = await fetchAllRows<ProductLite>((from, to) =>
        supabase
          .from("products")
          .select("id, name, sku, barcode, category, sell_price, buy_price, unit, product_type, quantity")
          .eq("user_id", ownerId)
          .order("name")
          .range(from, to)
      );
      setProducts(data || []);
    })();
  }, [user, ownerId]);

  // Load linked invoices when contact changes
  useEffect(() => {
    if (!user || !ownerId || !form.contactId) { setLinkedInvoices([]); return; }
    (async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, contact_name, contact_id, total_amount, invoice_date")
        .eq("user_id", ownerId)
        .eq("contact_id", form.contactId)
        .eq("invoice_type", linkedInvoiceType)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(50);
      setLinkedInvoices((data as InvoiceLite[]) || []);
    })();
  }, [user, ownerId, form.contactId, linkedInvoiceType]);

  // Load existing record (edit/view)
  useEffect(() => {
    if (!user || !ownerId || !recordId) return;
    (async () => {
      const { data: ret } = await supabase
        .from("returns" as any)
        .select("*")
        .eq("id", recordId)
        .eq("user_id", ownerId)
        .single();
      if (!ret) return;
      const r = ret as any;
      setRevision(r.revision || 0);
      setPostingVersion(r.posting_version || 0);
      setReturnNumber(r.return_number || "");
      const { data: items } = await supabase
        .from("return_items" as any)
        .select("*")
        .eq("return_id", recordId);
      const mapped: Item[] = ((items as any[]) || []).map((it: any) => ({
        id: it.id,
        productId: it.product_id || null,
        sourceInvoiceItemId: it.source_invoice_item_id || null,
        description: it.description || "",
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unit_price) || 0,
        discount: Number(it.discount) || 0,
        taxCategory: (it.tax_category || (Number(it.tax_rate) > 0 ? "taxable" : "zero")) as TaxCategory,
        taxRate: Number(it.tax_rate) || 0,
      }));
      setForm({
        contactId: r.contact_id || null,
        contactName: r.contact_name || "",
        date: r.return_date || new Date().toISOString().split("T")[0],
        linkedInvoiceId: r.related_invoice_id || null,
        linkedInvoiceNumber: "",
        reason: r.reason || "",
        reasonOther: "",
        notes: r.notes || "",
        warehouseId: r.warehouse_id || null,
        refundAccountCode: r.refund_account_code || "",
        taxInclusive: r.tax_inclusive || false,
        refundMethod: (r.refund_method as any) || "credit",
        costCenterId: r.cost_center_id || null,
        items: mapped.length > 0 ? mapped : [newItem()],
        status: r.status || "draft",
      });
      if (r.related_invoice_id) {
        const { data: linked } = await supabase
          .from("invoices")
          .select("invoice_number")
          .eq("id", r.related_invoice_id)
          .single();
        if (linked) setForm(p => ({ ...p, linkedInvoiceNumber: (linked as any).invoice_number || "" }));
      }
    })();
  }, [user, ownerId, recordId]);

  // Pull items from linked invoice (with returnable quantities)
  const pullItemsFromInvoice = async (invId: string) => {
    const { data } = await supabase
      .from("invoice_items_returnable" as any)
      .select("*")
      .eq("invoice_id", invId);
    const { data: original } = await supabase.from("invoice_items").select("id,description,discount,discount_type,quantity,unit_price,tax_rate").eq("invoice_id", invId);
    const originalMap = new Map((original || []).map(x => [x.id, x]));
    if (pilot) {
      const { data: invoice } = await supabase.from("invoices").select("warehouse_id,tax_inclusive").eq("id", invId).eq("user_id", ownerId || "").maybeSingle();
      setForm(p => ({ ...p, warehouseId: invoice?.warehouse_id || null, taxInclusive: invoice?.tax_inclusive || false }));
    }
    const items: Item[] = ((data as any[]) || [])
      .filter((it: any) => Number(it.remaining_returnable_quantity) > 0)
      .map((it: any) => ({
        id: crypto.randomUUID(),
        productId: it.product_id || null,
        sourceInvoiceItemId: it.invoice_item_id,
        description: originalMap.get(it.invoice_item_id)?.description || it.description || "",
        quantity: Number(it.remaining_returnable_quantity) || 0,
        unitPrice: Number(it.unit_price) || 0,
        discount: pilot ? (() => { const src = originalMap.get(it.invoice_item_id); return src?.discount_type === "percent" ? Number(src.discount || 0) * Number(it.unit_price || 0) * Number(it.remaining_returnable_quantity || 0) / 100 : Number(src?.discount || 0) * Number(it.remaining_returnable_quantity || 0) / Math.max(Number(src?.quantity || 0), 1); })() : 0,
        taxCategory: (Number(it.tax_rate) > 0 ? "taxable" : "zero") as TaxCategory,
        taxRate: Number(it.tax_rate) || 0,
        maxReturnableQty: Number(it.remaining_returnable_quantity) || 0,
      }));
    if (items.length > 0) {
      setForm(p => ({ ...p, items }));
      toast({ title: `تم نسخ ${items.length} بند قابل للإرجاع ✅` });
    } else {
      toast({ title: "لا توجد بنود قابلة للإرجاع في هذه الفاتورة", variant: "destructive" });
    }
  };

  // Calculations
  // Client-side filtered party list (tenants can have 9k+ contacts — rendering
  // them all in the Command list freezes the popover).
  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const base = q ? contacts.filter(c => (c.contact_name || "").toLowerCase().includes(q)) : contacts;
    return base.slice(0, 60);
  }, [contacts, contactSearch]);

  const summary = useMemo(() => {
    if (pilot) return calculateReturnSummary(form.items, taxEnabled, form.taxInclusive);
    let net = 0, discount = 0, tax = 0;
    form.items.forEach(it => {
      const gross = it.quantity * it.unitPrice;
      const afterDisc = gross - it.discount;
      discount += it.discount;
      net += afterDisc;
      if (taxEnabled && it.taxCategory === "taxable") {
        tax += afterDisc * 0.16;
      }
    });
    return { subtotal: net + discount, discount, net, tax, total: net + tax };
  }, [form.items, taxEnabled, pilot, form.taxInclusive]);

  const updateItem = (id: string, patch: Partial<Item>) => {
    setForm(p => ({
      ...p,
      items: p.items.map(it => {
        if (it.id !== id) return it;
        const upd = { ...it, ...patch };
        if (patch.taxCategory) {
          const opt = TAX_OPTS.find(o => o.value === patch.taxCategory);
          upd.taxRate = opt?.rate || 0;
        }
        // Enforce max returnable quantity if linked
        if (patch.quantity !== undefined && it.maxReturnableQty != null && patch.quantity > it.maxReturnableQty) {
          toast({ title: "تجاوز الكمية المتبقية", description: `الحد الأقصى: ${it.maxReturnableQty}`, variant: "destructive" });
          upd.quantity = it.maxReturnableQty;
        }
        return upd;
      }),
    }));
  };

  const addItem = () => setForm(p => ({ ...p, items: [...p.items, newItem()] }));
  const removeItem = (id: string) => setForm(p => ({
    ...p,
    items: p.items.length > 1 ? p.items.filter(it => it.id !== id) : p.items,
  }));

  const validate = (asDraft: boolean): boolean => {
    if (!form.contactName.trim()) { toast({ title: `يرجى اختيار ${partyLabel}`, variant: "destructive" }); return false; }
    const finalReason = form.reason === "أخرى" ? form.reasonOther.trim() : form.reason;
    if (!asDraft && !finalReason) { toast({ title: "يرجى تحديد سبب المردود", variant: "destructive" }); return false; }
    if (!asDraft && form.items.some(it => (!it.productId && !it.description.trim()) || it.quantity <= 0 || it.unitPrice <= 0)) {
      toast({ title: "تأكد من اختيار الصنف وتعبئة الكمية والسعر لكل بند", variant: "destructive" });
      return false;
    }
    if (!asDraft && summary.total <= 0) {
      toast({ title: "إجمالي المردود يجب أن يكون أكبر من صفر", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleSave = async (asDraft: boolean) => {
    if (!user || !ownerId || saving || readonly || !canProcess) return;
    if (!validate(asDraft)) return;
    setSaving(true);
    try {
      const finalReason = form.reason === "أخرى" ? form.reasonOther.trim() : form.reason;
      if (pilot) {
        const { data, error } = await supabase.rpc("save_return_command_v1", {
          p_owner: ownerId, p_command_key: commandKeyRef.current,
          p_document: { return_type: returnType, contact_id: form.contactId, return_date: form.date, related_invoice_id: form.linkedInvoiceId, reason: finalReason, notes: form.notes, refund_method: form.refundMethod, refund_account_code: form.refundAccountCode || null, cost_center_id: form.costCenterId, warehouse_id: form.warehouseId, tax_inclusive: form.taxInclusive },
          p_items: form.items.filter(it => it.description.trim()).map(it => ({ product_id: it.productId || null, source_invoice_item_id: it.sourceInvoiceItemId || null, description: it.description, quantity: it.quantity, unit_price: it.unitPrice, discount: calculateReturnLine(it, taxEnabled, form.taxInclusive).storedDiscount, tax_rate: it.taxRate, tax_category: it.taxCategory })),
          p_return_id: editId || undefined, p_expected_revision: editId ? revision : undefined, p_confirm: !asDraft,
        });
        if (error) throw error;
        const result = data as { id?: string; return_number?: string } | null;
        toast({ title: asDraft ? "تم حفظ المسودة" : `تم حفظ وترحيل ${titleAr} ${result?.return_number || ""}` });
        broadcastChange("transaction", "updated", result?.id);
        navigate(listPath);
        return;
      }
      const targetStatus: "draft" | "confirmed" = asDraft ? "draft" : "confirmed";

      const payload: any = {
        user_id: ownerId,
        return_type: returnType,
        contact_id: form.contactId,
        contact_name: form.contactName,
        return_date: form.date,
        related_invoice_id: form.linkedInvoiceId,
        reason: finalReason,
        notes: form.notes || null,
        refund_method: form.refundMethod,
        cost_center_id: form.costCenterId,
        subtotal: summary.subtotal,
        discount_amount: summary.discount,
        tax_amount: summary.tax,
        total_amount: summary.total,
        // status set after save (so stock trigger fires on UPDATE only)
      };

      let returnId = editId;
      let returnNumber = "";

      if (editId) {
        // Update existing: unpost first (status→draft triggers stock reversal),
        // then wipe prior journal + tax ledger so re-confirm can post cleanly.
        // This follows the "Delete & Recreate" integrity policy — no in-place mutation of posted lines.
        const { data: prevRow } = await supabase
          .from("returns" as any)
          .select("status, journal_entry_id")
          .eq("id", editId)
          .single();
        const wasConfirmed = (prevRow as any)?.status === "confirmed";
        if (wasConfirmed) {
          // Reverse stock via status flip
          await supabase.from("returns" as any).update({ status: "draft" } as any).eq("id", editId);
          // Soft-delete previous accounting transaction (audit trail preserved).
          // idempotency_key is released so the rebuilt entry can reuse it.
          await supabase.from("transactions").update({ is_deleted: true, idempotency_key: null } as any).eq("idempotency_key", `RETURN-${editId}`);
          await supabase.from("transactions").update({ is_deleted: true, idempotency_key: null } as any).eq("return_id", editId).eq("is_deleted", false);
          // Remove previous tax ledger reversal entry
          await supabase
            .from("tax_ledger")
            .delete()
            .eq("reference_id", editId)
            .in("reference_type", ["sales_return", "purchase_return"]);
          // Clear stale journal link
          await supabase.from("returns" as any).update({ journal_entry_id: null } as any).eq("id", editId);
        }
        const { error } = await supabase.from("returns" as any).update({ ...payload, status: "draft" } as any).eq("id", editId).eq("user_id", ownerId);
        if (error) throw error;
        await supabase.from("return_items" as any).delete().eq("return_id", editId);
        const { data: row } = await supabase.from("returns" as any).select("return_number").eq("id", editId).single();
        returnNumber = (row as any)?.return_number || "";
      } else {
        const { data: ins, error } = await supabase
          .from("returns" as any)
          .insert({ ...payload, status: "draft" } as any)
          .select("id, return_number")
          .single();
        if (error) throw error;
        returnId = (ins as any).id;
        returnNumber = (ins as any).return_number || "";
      }

      const itemsPayload = form.items
        .filter(it => it.description.trim())
        .map(it => ({
          return_id: returnId,
          user_id: ownerId,
          product_id: it.productId || null,
          source_invoice_item_id: it.sourceInvoiceItemId || null,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unitPrice,
          discount: it.discount,
          tax_rate: it.taxRate,
          tax_amount: (it.quantity * it.unitPrice - it.discount) * (it.taxCategory === "taxable" && taxEnabled ? 0.16 : 0),
          line_total: (it.quantity * it.unitPrice - it.discount) * (1 + (it.taxCategory === "taxable" && taxEnabled ? 0.16 : 0)),
        }));
      if (itemsPayload.length > 0) {
        await supabase.from("return_items" as any).insert(itemsPayload as any);
      }

      // Confirm AFTER items are written so stock trigger sees them
      if (targetStatus === "confirmed" && summary.total > 0) {
        const { error: confirmErr } = await supabase
          .from("returns" as any)
          .update({ status: "confirmed" } as any)
          .eq("id", returnId);
        if (confirmErr) throw confirmErr;

        // Accounting entry
        // Sales Return:    Dr 4150 Sales Returns       Cr 1130 AR (or 1110 cash / 1120 bank)
        // Purchase Return: Dr 2110 AP (or cash/bank)   Cr 5150 Purchase Returns
        const cashCode = "1110";
        // Resolve a leaf bank code (never the parent 1120).
        const bankCode = await (
          await import("@/lib/resolveBankCode")
        ).resolveBankAccountCode(ownerId);
        const arCode = "1130";
        const apCode = "2110";

        // On-account refunds MUST hit the party's own sub-ledger account
        // (e.g. 21100034), never the shared parent 1130 / 2110 — otherwise the
        // movement never shows on that party's statement and merges balances.
        let partyCode = isSales ? arCode : apCode;
        if (form.refundMethod === "credit" && form.contactId) {
          const ct = contacts.find(c => c.id === form.contactId)?.contact_type || partyType;
          partyCode = await ensureContactSubAccount({
            ownerId,
            contactId: form.contactId,
            contactType: ct,
            contactName: form.contactName,
          });
        }

        let debitCode: string, creditCode: string;
        if (isSales) {
          debitCode = await pickTenantAccountCode(ownerId, ["4150", "4400"], "sales_returns");
          creditCode = form.refundMethod === "cash" ? cashCode : form.refundMethod === "bank" ? bankCode : partyCode;
        } else {
          debitCode = form.refundMethod === "cash" ? cashCode : form.refundMethod === "bank" ? bankCode : partyCode;
          creditCode = await pickTenantAccountCode(ownerId, ["5160", "5120"], "purchase_returns");
        }

        const txDescription = `${titleAr} ${returnNumber} - ${form.contactName}`;
        const { data: txInsert } = await supabase.from("transactions").insert({
          user_id: ownerId,
          transaction_date: form.date,
          description: txDescription,
          debit_account_code: debitCode,
          credit_account_code: creditCode,
          amount: summary.total,
          currency: "شيكل",
          transaction_type: isSales ? "sales_return" : "purchase_return",
          contact_id: form.contactId,
          reference: returnNumber,
          payment_method: form.refundMethod === "cash" ? "نقدي" : form.refundMethod === "bank" ? "بنك" : "آجل",
          cost_center_id: form.costCenterId,
          return_id: returnId,
          idempotency_key: `RETURN-${returnId}`,
        } as any).select("id").single();

        if (txInsert) {
          await supabase.from("returns" as any).update({ journal_entry_id: (txInsert as any).id } as any).eq("id", returnId);
        }

        // Tax ledger reversal
        if (summary.tax > 0) {
          const d = new Date(form.date);
          await supabase.from("tax_ledger").insert({
            user_id: ownerId,
            tax_type: isSales ? "output" : "input",
            net_amount: -summary.net,
            tax_rate: 16,
            tax_amount: -summary.tax,
            reference_type: isSales ? "sales_return" : "purchase_return",
            reference_id: returnId,
            invoice_number: returnNumber,
            party_name: form.contactName,
            notes: txDescription,
            transaction_date: form.date,
            period_year: d.getFullYear(),
            period_month: d.getMonth() + 1,
          } as any);
        }
      }

      toast({ title: asDraft ? "تم حفظ المسودة ✅" : `تم تأكيد ${titleAr} ${returnNumber} ✅` });
      // Notify other tabs (e.g. Account Statement, Returns list) to refresh silently.
      broadcastChange("transaction", "updated", returnId || undefined);
      navigate(listPath);
    } catch (err: any) {
      console.error(err);
      toast({ title: "خطأ في الحفظ", description: err?.message || "حدث خطأ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ─── CANCEL POSTED RETURN ───
  // Fully reverses a confirmed return without deleting it (audit-safe, matches
  // invoice cancel policy). Steps:
  //   1) Flip status → 'cancelled' (DB trigger reverses stock automatically).
  //   2) Purge the linked accounting transaction so it disappears from the
  //      account statement (matched by return_id + idempotency key fallback).
  //   3) Purge the tax-ledger reversal entry.
  //   4) Clear the stale journal_entry_id link.
  const handleCancel = async () => {
    if (!user || !ownerId || !recordId || !canProcess || cancelling || saving) return;
    if (form.status !== "confirmed") {
      toast({ title: "لا يمكن الإلغاء", description: "المردود ليس مرحّلاً", variant: "destructive" });
      return;
    }
    if (!confirm(`إلغاء المردود؟\nسيتم عكس القيد المحاسبي وحركة المخزون تلقائياً.\nهذا الإجراء لا يحذف السجل — يبقى للمراجعة كـ"ملغى".`)) return;
    setCancelling(true);
    try {
      if (pilot) {
        await cancelManagedReturn(ownerId, { id: recordId, revision });
        broadcastChange("transaction", "deleted", recordId);
        toast({ title: "تم إلغاء المردود وعكس آثاره" });
        navigate(listPath);
        return;
      }
      // 1) Reverse stock via status flip (trigger handles it)
      const { error: statusErr } = await supabase
        .from("returns" as any)
        .update({ status: "cancelled" } as any)
        .eq("id", recordId)
        .eq("user_id", ownerId);
      if (statusErr) throw statusErr;

      // 2) Soft-delete accounting transaction (audit trail preserved)
      await supabase.from("transactions").update({ is_deleted: true, idempotency_key: null } as any).eq("idempotency_key", `RETURN-${recordId}`);
      await supabase.from("transactions").update({ is_deleted: true, idempotency_key: null } as any).eq("return_id", recordId).eq("is_deleted", false);

      // 3) Purge tax-ledger reversal row
      await supabase
        .from("tax_ledger")
        .delete()
        .eq("reference_id", recordId)
        .in("reference_type", ["sales_return", "purchase_return"]);

      // 4) Clear stale journal link
      await supabase.from("returns" as any).update({ journal_entry_id: null } as any).eq("id", recordId);

      broadcastChange("transaction", "deleted", recordId);
      toast({ title: `تم إلغاء ${titleAr} ✅`, description: "تم عكس القيد وحركة المخزون" });
      navigate(listPath);
    } catch (err: any) {
      console.error(err);
      toast({ title: "خطأ في الإلغاء", description: err?.message || "حدث خطأ", variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  const wasPosted = form.status === "confirmed" && !!recordId;
  const isCancelled = form.status === "cancelled";
  const readonly = isView || isCancelled || !canProcess || (pilot && !!recordId && postingVersion !== 1);

  const refundAccounts = accounts.filter(a => {
    if (accounts.some(child => child.parent_code === a.account_code) || !["شيكل", "ILS", "₪"].includes(a.currency || "شيكل")) return false;
    let current: typeof a | undefined = a;
    const seen = new Set<string>();
    while (current && !seen.has(current.account_code)) {
      seen.add(current.account_code);
      if (form.refundMethod === "cash" ? current.account_code === "1110" || current.system_role === "cash" : current.account_code === "1120" || current.system_role === "bank") return true;
      const parent: string | null = current.parent_code;
      current = accounts.find(x => x.account_code === parent);
    }
    return false;
  });
  const printPayload = { type: returnType === "sales" ? "sales" as const : "purchase" as const, invoiceNumber: returnNumber || "مسودة", date: form.date, contactName: form.contactName, items: form.items.map(it => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice, discount: calculateReturnLine(it, taxEnabled, pilot && form.taxInclusive).storedDiscount, discountType: "amount" as const, taxRate: it.taxRate, taxCategory: it.taxCategory, subtotal: calculateReturnLine(it, taxEnabled, pilot && form.taxInclusive).total, unitOfMeasure: products.find(p => p.id === it.productId)?.unit || undefined })), notes: [form.reason === "أخرى" ? form.reasonOther : form.reason, form.notes].filter(Boolean).join(" — "), status: form.status, paymentMethod: form.refundMethod === "bank" ? "transfer" : form.refundMethod, subtotal: summary.subtotal, totalDiscount: summary.discount, totalTax: summary.tax, total: summary.total, paidAmount: form.refundMethod === "credit" ? 0 : summary.total, remainingAmount: form.refundMethod === "credit" ? summary.total : 0, currency: "شيكل", taxInclusive: pilot && form.taxInclusive };
  const printForm = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write("<html dir=\"rtl\"><head><title>مردود</title></head><body><div id=\"return-print\"></div></body></html>");
    win.document.close();
    const node = win.document.getElementById("return-print");
    if (!node) return;
    createRoot(node).render(<InvoicePrintView invoice={printPayload} settings={settings} printMode="return" />);
    setTimeout(() => win.print(), 700);
  };

  useSavePostShortcut(() => handleSave(false), !saving && !readonly);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <FinanceShell
      title={isView ? `معاينة ${titleAr}` : recordId ? `تعديل ${titleAr}` : `إنشاء ${titleAr}`}
      compact
      breadcrumb={[
        { label: "الرئيسية", href: "/" },
        { label: isSales ? "المبيعات" : "المشتريات" },
        { label: titleAr, href: listPath },
      ]}
      actionTabs={([
        {
          key: "main",
          label: "عام",
          groups: [
            { key: "view", label: "عرض", items: [{key: "preview", label: "معاينة", icon: Eye, onClick: () => setShowPreview(true)}, {key: "print", label: "طباعة", icon: Printer, onClick: printForm}] },
            ...(!readonly ? [{
              key: "save",
              label: "حفظ",
              items: [
                { key: "draft", label: "حفظ كمسودة", icon: Save, onClick: () => handleSave(true), disabled: saving || readonly },
                { key: "confirm", label: wasPosted ? "إعادة الترحيل" : "تأكيد وترحيل", icon: Send, variant: "primary", onClick: () => handleSave(false), disabled: saving || readonly },
              ],
            }] : []),
            ...(wasPosted && !readonly ? [{
              key: "cancel",
              label: "إلغاء",
              items: [
                { key: "cancel-return", label: "إلغاء المردود", icon: XCircle, variant: "danger" as const, onClick: handleCancel, disabled: cancelling || saving },
              ],
            }] : []),
            {
              key: "nav",
              label: "تنقّل",
              items: [
                { key: "back", label: "رجوع للقائمة", icon: ArrowRight, onClick: () => navigate(listPath) },
              ],
            },
          ],
        },
      ] satisfies ActionTab[])}
    >
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pb-10" dir="rtl">
      {isCancelled && (
        <div className="lg:col-span-12 flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <XCircle className="h-4 w-4" />
          هذا المردود ملغى. تم عكس القيد المحاسبي وحركة المخزون. للعرض فقط.
        </div>
      )}
      {wasPosted && !isView && (
        <div className="lg:col-span-12 flex items-center gap-2 p-3 rounded-md bg-muted border border-border text-foreground text-sm">
          <AlertTriangle className="h-4 w-4" />
          هذا المردود مرحَّل محاسبياً ومخزنياً. عند حفظ التعديل سيتم عكس القيد والمخزون القديم تلقائياً ثم إعادة الترحيل بالبيانات الجديدة (سياسة "احذف وأنشئ").
        </div>
      )}

      {/* Header data */}
      <section className="lg:col-span-8 border border-border rounded-lg bg-background">
        <CardHeader className="border-b border-border py-3"><CardTitle className="text-sm">بيانات المردود</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
          <div className="space-y-1">
            <Label>{partyLabel} <span className="text-destructive">*</span></Label>
            <Popover open={contactPopover} onOpenChange={setContactPopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" disabled={readonly} className="w-full justify-between">
                  {form.contactName || `اختر ${partyLabel}...`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[320px] max-w-[calc(100vw-2rem)]" dir="rtl">
                <Command shouldFilter={false}>
                  <CommandInput placeholder={`بحث عن ${partyLabel}...`} value={contactSearch} onValueChange={setContactSearch} />
                  <CommandList>
                    <CommandEmpty>لا يوجد</CommandEmpty>
                    <CommandGroup>
                      {filteredContacts.map(c => (
                        <CommandItem
                          key={c.id}
                          value={c.id}
                          onSelect={() => {
                            setForm(p => ({ ...p, contactId: c.id, contactName: c.contact_name, linkedInvoiceId: null, linkedInvoiceNumber: "" }));
                            setContactPopover(false);
                          }}
                        >
                          <span className="flex-1">{c.contact_name}</span>
                          {c.contact_type === "عميل ومورد" && (
                            <span className="text-[10px] text-muted-foreground">عميل ومورد</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label>التاريخ</Label>
            <Input type="date" value={form.date} disabled={readonly} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
          </div>

          <div className="space-y-1">
            <Label>الفاتورة الأصلية (اختياري)</Label>
            <Popover open={invoicePopover} onOpenChange={setInvoicePopover}>
              <PopoverTrigger asChild>
                <Button variant="outline" disabled={readonly || !form.contactId} className="w-full justify-between">
                  {form.linkedInvoiceNumber || (form.contactId ? "اختر الفاتورة الأصلية..." : `اختر ${partyLabel} أولاً`)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[360px] max-w-[calc(100vw-2rem)]" dir="rtl">
                <Command>
                  <CommandInput placeholder="بحث برقم الفاتورة..." />
                  <CommandList>
                    <CommandEmpty>لا توجد فواتير</CommandEmpty>
                    <CommandGroup>
                      <CommandItem onSelect={() => {
                        setForm(p => ({ ...p, linkedInvoiceId: null, linkedInvoiceNumber: "" }));
                        setInvoicePopover(false);
                      }}>
                        — بدون ربط —
                      </CommandItem>
                      {linkedInvoices.map(inv => (
                        <CommandItem
                          key={inv.id}
                          onSelect={async () => {
                            setForm(p => ({ ...p, linkedInvoiceId: inv.id, linkedInvoiceNumber: inv.invoice_number || "" }));
                            setInvoicePopover(false);
                            await pullItemsFromInvoice(inv.id);
                          }}
                        >
                          {inv.invoice_number} — ₪{Number(inv.total_amount || 0).toLocaleString()} — {inv.invoice_date}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label>طريقة الاسترداد</Label>
            <Select dir="rtl" value={form.refundMethod} disabled={readonly} onValueChange={v => setForm(p => ({ ...p, refundMethod: v as any, refundAccountCode: "" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">{isSales ? "على ذمة العميل (آجل)" : "على ذمة المورد (آجل)"}</SelectItem>
                <SelectItem value="cash">نقدي</SelectItem>
                <SelectItem value="bank">بنك</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>مركز التكلفة</Label>
            <Select dir="rtl"
              value={form.costCenterId || "none"}
              disabled={readonly}
              onValueChange={v => setForm(p => ({ ...p, costCenterId: v === "none" ? null : v }))}
            >
              <SelectTrigger><SelectValue placeholder="اختر مركز تكلفة..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— بدون —</SelectItem>
                {costCenters.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="font-mono text-xs">{c.code}</span> — {c.name_ar || c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>السبب</Label>
            <Select dir="rtl" value={form.reason} disabled={readonly} onValueChange={v => setForm(p => ({ ...p, reason: v }))}>
              <SelectTrigger><SelectValue placeholder="اختر السبب..." /></SelectTrigger>
              <SelectContent>
                {reasons.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            {form.reason === "أخرى" && (
              <Input
                placeholder="حدّد السبب..."
                value={form.reasonOther}
                disabled={readonly}
                onChange={e => setForm(p => ({ ...p, reasonOther: e.target.value }))}
              />
            )}
          </div>

          {pilot && form.refundMethod !== "credit" && <div className="space-y-1"><Label>حساب {form.refundMethod === "cash" ? "الصندوق" : "البنك"}</Label><Select dir="rtl" value={form.refundAccountCode} disabled={readonly} onValueChange={v => setForm(p => ({ ...p, refundAccountCode: v }))}><SelectTrigger><SelectValue placeholder="اختر الحساب الفرعي..." /></SelectTrigger><SelectContent>{refundAccounts.map(a => <SelectItem key={a.account_code} value={a.account_code}>{a.account_code} — {a.account_name}</SelectItem>)}</SelectContent></Select></div>}
          {pilot && warehouses.length > 0 && <div className="space-y-1"><Label>المستودع</Label><Select dir="rtl" value={form.warehouseId || "default"} disabled={readonly || !!form.linkedInvoiceId} onValueChange={v => setForm(p => ({ ...p, warehouseId: v === "default" ? null : v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">المستودع الافتراضي</SelectItem>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select></div>}
          <div className="space-y-1 sm:col-span-2">
            <Label>ملاحظات</Label>
            <Textarea rows={2} value={form.notes} disabled={readonly} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </CardContent>
      </section>

      <div className="lg:col-span-12 lg:order-3 min-w-0">
        <ReturnItemsEditor items={form.items} products={products} isSales={isSales} readonly={readonly} linked={!!form.linkedInvoiceId} taxEnabled={taxEnabled} inclusive={pilot && form.taxInclusive} allowPercent={pilot} onUpdate={updateItem} onAdd={addItem} onRemove={removeItem} />
      </div>

      {/* Summary */}
      <aside className="lg:col-span-4 lg:order-2 self-start lg:sticky lg:top-20 border border-border rounded-lg bg-background">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">الصافي قبل الضريبة</div>
              <div className="text-lg font-semibold">₪{summary.net.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">إجمالي الخصم</div>
              <div className="text-lg font-semibold">₪{summary.discount.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">الضريبة</div>
              <div className="text-lg font-semibold">₪{summary.tax.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">الإجمالي</div>
              <div className="text-2xl font-bold text-primary tabular-nums">
                ₪{summary.total.toLocaleString()}
              </div>
            </div>
          </div>
        </CardContent>
      <div className="px-4 pb-4 space-y-2 text-xs text-muted-foreground"><p className="flex items-center gap-2"><FileText className="h-4 w-4" />{returnNumber || titleAr}</p><p>{form.contactName || partyLabel}</p><p>{form.items.filter(it => it.description.trim()).length} بند</p>{pilot && <label className="flex items-center gap-2"><input type="checkbox" checked={form.taxInclusive} disabled={readonly || !!form.linkedInvoiceId} onChange={e => setForm(p => ({ ...p, taxInclusive: e.target.checked }))} />الأسعار شاملة الضريبة</label>}</div>
      </aside>

    </div>
    <Dialog open={showPreview} onOpenChange={setShowPreview}><DialogContent dir="rtl" className="max-w-5xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>معاينة {titleAr}</DialogTitle></DialogHeader><InvoicePrintView invoice={printPayload} settings={settings} printMode="return" /></DialogContent></Dialog>
    </FinanceShell>
  );
};

export default ReturnCreatePage;