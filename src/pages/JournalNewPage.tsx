import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DuplicateBanner from "@/components/DuplicateBanner";
import {
  CheckCircle, Printer, Save, Search, Plus, Trash2, Loader2, Eye, Calculator,
  BookOpen, User, Building2, Users, X, UserPlus, Upload, Paperclip, ChevronDown, Clock,
  FileText, Scale, AlertTriangle, ChevronRight, ChevronLeft, ListChecks, RefreshCw,
  Pencil, Copy, Lock
} from "lucide-react";
import { Link2 } from "lucide-react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllAccountsForOwner } from "@/lib/fetchAllAccounts";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useCompany } from "@/hooks/useCompanyContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SmartFormScope from "@/components/forms/SmartFormScope";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { multiWordMatchAny } from "@/lib/utils";
import useFormDraft from "@/hooks/useFormDraft";
import DraftRestoreBanner from "@/components/forms/DraftRestoreBanner";
import { useFastEntryMode } from "@/hooks/useFastEntryMode";
import useJournalKeyboard, { focusNextJournalCell } from "@/hooks/useJournalKeyboard";
import JournalBalanceBar from "@/components/journal/JournalBalanceBar";
import JournalTemplatesPicker from "@/components/journal/JournalTemplatesPicker";
import type { JournalTemplate } from "@/hooks/useJournalTemplates";
import { Bookmark } from "lucide-react";
import { useSaveJournalVoucher } from "@/hooks/useSaveJournalVoucher";
import { FinanceShell, FastTabs, type ActionTab, type FastTabItem } from "@/components/finance/shell";
import CostCenterCombobox from "@/components/cost-centers/CostCenterCombobox";
import EmployeeMovementPopover, { EmployeeMovementCategory } from "@/components/journal/EmployeeMovementPopover";
import SmartSearchableDropdown from "@/components/forms/SmartSearchableDropdown";
import JournalAccountPicker from "@/components/journal/JournalAccountPicker";
import JournalEntityCombobox from "@/components/journal/JournalEntityCombobox";
import { openOfficialVoucherWindow } from "@/lib/print/buildOfficialVoucher";
import { useJournalBooks } from "@/hooks/useJournalBooks";
import { Settings2, BookOpen as BookOpenIcon } from "lucide-react";
import { useTT } from "@/i18n/dict";

const CURRENCIES = [
  { value: "ILS", label: "شيكل", symbol: "₪" },
  { value: "USD", label: "دولار", symbol: "$" },
  { value: "JOD", label: "دينار", symbol: "د.ا" },
  { value: "EUR", label: "يورو", symbol: "€" },
];

interface JournalLine {
  id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  contact_id?: string;
  contact_name?: string;
  line_comment?: string;
  cost_center_id?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  employee_movement_category?: EmployeeMovementCategory | null;
  employee_movement_custom_label?: string | null;
}

interface Contact {
  id: string;
  contact_name: string;
  contact_type: string;
  current_balance: number;
  linked_account_code?: string | null;
}

const subtypeLabels: Record<string, string> = { normal: tt("عادي"), opening: tt("افتتاحي"), adjustment: tt("تسوية"), closing: tt("إقفالي") };

// ─── Lightweight in-memory FX cache (Wave 1 · same pattern as Voucher/Invoice) ───
// 5-minute TTL; invalidated on reload. Prevents re-fetching identical currency rate
// each time user reopens the journal page.
const JOURNAL_FX_TTL_MS = 5 * 60 * 1000;
const journalFxCache = new Map<string, { rate: number; ts: number }>();

const JournalNewPage = () => {
  const tt = useTT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id;
  const { company } = useCompany();
  // ميزة "حركة الموظف" على سطر القيد مخصّصة حالياً لحساب/شركة الملكي فقط.
  const isMalakyTenant =
    user?.email === "malakybroast@gmail.com" ||
    /ملكي|malaky|malaki|al[-\s]?malaki/i.test(company?.name || "");
  const { settings } = useCompanySettings();
  const { save: saveJournalVoucher, update: updateJournalVoucher, remove: removeJournalVoucher } = useSaveJournalVoucher();

  const fromDuplicate = searchParams.get("from_duplicate") === "true";
  const [duplicateSourceRef, setDuplicateSourceRef] = useState<string | null>(null);
  const editIdFromUrl = searchParams.get("edit") || null;
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(editIdFromUrl);
  const [editingCreatedAt, setEditingCreatedAt] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState<boolean>(!!editIdFromUrl);
  const [loadingVoucher, setLoadingVoucher] = useState<boolean>(false);

  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formRefNumber, setFormRefNumber] = useState("");
  const [formSubtype, setFormSubtype] = useState("normal");
  const [formDescription, setFormDescription] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formBookId, setFormBookId] = useState<string | null>(null);
  const { books: journalBooks, defaultBook } = useJournalBooks();
  // اضبط الدفتر الافتراضي تلقائياً عند التحميل الأول
  useEffect(() => {
    if (!formBookId && defaultBook) setFormBookId(defaultBook.id);
  }, [defaultBook, formBookId]);
  const currentBook = journalBooks.find((b) => b.id === formBookId) || defaultBook || null;
  const [formContactId, setFormContactId] = useState("");
  const [formCostCenterId, setFormCostCenterId] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [formCurrency, setFormCurrency] = useState("ILS");
  const [formExchangeRate, setFormExchangeRate] = useState<number>(1);
  const [fetchingRate, setFetchingRate] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedRefNumber, setSavedRefNumber] = useState("");
  const [fastEntryEnabled] = useFastEntryMode();
  const [lineSortOrder, setLineSortOrder] = useState<"debit_first" | "original">("original");
  const [draftReady, setDraftReady] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<{ name: string; url: string; size: number; type: string; uploaded_at: string }[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  // When hydrating an existing voucher we must NOT let the "auto-fetch exchange
  // rate on currency change" effect overwrite the stored voucher rate with
  // today's market rate. This ref is set to true right before we push the
  // voucher's currency/rate into state, and consumed (reset to false) by the
  // auto-fetch effect on its next run.
  const skipNextRateFetchRef = useRef<boolean>(false);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accountSearches, setAccountSearches] = useState<Record<string, string>>({});
  const [lineContactSearches, setLineContactSearches] = useState<Record<string, string>>({});
  // Independent search state for the FIRST column (account-code picker)
  const [codeSearches, setCodeSearches] = useState<Record<string, string | undefined>>({});

  // Invalid line IDs (highlighted on failed save attempt)
  const [invalidLineIds, setInvalidLineIds] = useState<Set<string>>(new Set());

  // Raw text buffers for debit/credit inputs so users can type partial values
  // like "13." or "0." without them being reformatted mid-typing.
  const [amountDrafts, setAmountDrafts] = useState<Record<string, { debit?: string; credit?: string }>>({});

  // Postable accounts only — exclude accounts that are referenced as a parent_code by any other account.
  // NOTE: Do NOT use string-prefix matching here — codes like 11101 and 111010 are siblings
  // (both children of 1110), not parent/child. Prefix matching would wrongly hide 11101.
  const postableAccounts = useMemo(() => {
    const parentCodes = new Set(
      accounts.map((a: any) => String(a.parent_code || "").trim()).filter(Boolean)
    );
    return accounts.filter((a: any) => !parentCodes.has(String(a.account_code || "").trim()));
  }, [accounts]);

  // Quick-add contact state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddForLineId, setQuickAddForLineId] = useState<string | null>(null);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddType, setQuickAddType] = useState<"customer" | "supplier">("customer");
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState<boolean>(() => {
    try { return localStorage.getItem("journal:summaryOpen") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("journal:summaryOpen", summaryOpen ? "1" : "0"); } catch {}
  }, [summaryOpen]);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(() => {
    try { return localStorage.getItem("journal:detailsOpen") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("journal:detailsOpen", detailsOpen ? "1" : "0"); } catch {}
  }, [detailsOpen]);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [lines, setLines] = useState<JournalLine[]>([
    { id: "1", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
    { id: "2", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
  ]);

  // ─── Link to Order (سطر يربط بطلبية زبون) ───
  const [orderLinkFor, setOrderLinkFor] = useState<string | null>(null);
  const [orderLinkOptions, setOrderLinkOptions] = useState<Array<{ id: string; order_number: string; customer_name: string; total: number; order_date: string }>>([]);
  const [orderLinkQuery, setOrderLinkQuery] = useState("");
  const [orderLinkLoading, setOrderLinkLoading] = useState(false);

  const openOrderLink = useCallback(async (lineId: string) => {
    setOrderLinkFor(lineId);
    setOrderLinkQuery("");
    setOrderLinkLoading(true);
    try {
      const line = lines.find(l => l.id === lineId);
      if (line?.contact_id) {
        const scoped = await supabase
          .from("orders")
          .select("id, order_number, customer_name, total, order_date, contact_id, status")
          .neq("status", "ملغي")
          .eq("contact_id", line.contact_id)
          .order("order_date", { ascending: false })
          .limit(200);
        if ((scoped.data?.length || 0) > 0) {
          setOrderLinkOptions((scoped.data as any) || []);
          return;
        }
      }
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, total, order_date, contact_id, status")
        .neq("status", "ملغي")
        .order("order_date", { ascending: false })
        .limit(200);
      setOrderLinkOptions((data as any) || []);
    } finally {
      setOrderLinkLoading(false);
    }
  }, [lines]);

  // Live search across all orders (name or number) when the user types
  useEffect(() => {
    if (orderLinkFor === null) return;
    const term = orderLinkQuery.trim();
    if (term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setOrderLinkLoading(true);
      try {
        const like = `%${term}%`;
        const { data } = await supabase
          .from("orders")
          .select("id, order_number, customer_name, total, order_date, contact_id, status")
          .neq("status", "ملغي")
          .or(`order_number.ilike.${like},customer_name.ilike.${like}`)
          .order("order_date", { ascending: false })
          .limit(200);
        if (!cancelled) setOrderLinkOptions((data as any) || []);
      } finally {
        if (!cancelled) setOrderLinkLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [orderLinkQuery, orderLinkFor]);

  const applyOrderLink = useCallback((order: { order_number: string; customer_name: string }) => {
    if (!orderLinkFor) return;
    const tag = `[طلبية ${order.order_number}]`;
    setLines(prev => prev.map(l => {
      if (l.id !== orderLinkFor) return l;
      const current = (l.line_comment || "").trim();
      if (current.includes(order.order_number)) return l;
      return { ...l, line_comment: current ? `${current} ${tag}` : tag };
    }));
    setFormNotes(prev => {
      const cur = prev || "";
      if (cur.includes(order.order_number)) return cur;
      return cur ? `${cur}\n${tag} — ${order.customer_name}` : `${tag} — ${order.customer_name}`;
    });
    setOrderLinkFor(null);
    toast.success(`تم ربط السطر بالطلبية ${order.order_number}`);
  }, [orderLinkFor]);

  // Clear invalid highlight whenever the user edits lines
  useEffect(() => {
    setInvalidLineIds(prev => (prev.size > 0 ? new Set() : prev));
  }, [lines]);

  // ─── Auto-Draft (سند القيد) ───
  const journalDraftSnapshot = useMemo(() => ({
    formDate, formRefNumber, formSubtype, formDescription, formNotes,
    formContactId, lines, attachments, lineSortOrder, formCurrency, formExchangeRate,
  }), [formDate, formRefNumber, formSubtype, formDescription, formNotes, formContactId, lines, attachments, lineSortOrder, formCurrency, formExchangeRate]);

  const applyJournalDraft = useCallback((d: any) => {
    if (d.formDate) setFormDate(d.formDate);
    if (d.formRefNumber) setFormRefNumber(d.formRefNumber);
    if (d.formSubtype) setFormSubtype(d.formSubtype);
    if (d.formDescription !== undefined) setFormDescription(d.formDescription);
    if (d.formNotes !== undefined) setFormNotes(d.formNotes);
    if (d.formContactId !== undefined) setFormContactId(d.formContactId);
    if (Array.isArray(d.lines) && d.lines.length >= 2) setLines(d.lines);
    if (Array.isArray(d.attachments)) setAttachments(d.attachments);
    if (d.lineSortOrder) setLineSortOrder(d.lineSortOrder);
    if (d.formCurrency) setFormCurrency(d.formCurrency);
    if (d.formExchangeRate) setFormExchangeRate(Number(d.formExchangeRate));
    toast.success(tt("تم استعادة المسودة")));
  }, []);

  const isJournalDraftEmpty = useCallback((d: any) => {
    const hasContent = d.formDescription || d.formNotes || d.formContactId ||
      (d.lines || []).some((l: any) => l.account_code || Number(l.debit) > 0 || Number(l.credit) > 0);
    return !hasContent;
  }, []);

  const { hasDraft, restoreDraft, clearDraft, draftSavedAt } = useFormDraft(
    "journal_new",
    journalDraftSnapshot,
    applyJournalDraft,
    {
      enabled: !fromDuplicate && !editingVoucherId,
      version: 1,
      isEmpty: isJournalDraftEmpty,
      routePath: "/finance/journal/new",
      scope: [user?.id || "anon", company?.id || "no-company", "/finance/journal/new", "new"].join(":"),
      ready: draftReady,
    }
  );

  // ─── Load Duplicate Data ───
  useEffect(() => {
    if (!fromDuplicate) return;
    const draftKey = "draft_journal_new";
    const draft = localStorage.getItem(draftKey);
    if (!draft) return;
    try {
      const data = JSON.parse(draft);
      localStorage.removeItem(draftKey);
      setDuplicateSourceRef(data._sourceRef || null);
      if (data.description) setFormDescription(data.description);
      if (data.notes) setFormNotes(data.notes);
      if (data.subtype) setFormSubtype(data.subtype);
      if (data.contactId) setFormContactId(data.contactId);
      if (data.lines?.length) {
        setLines(data.lines.map((l: any, i: number) => ({
          id: String(Date.now() + i),
          account_code: l.account_code || "",
          account_name: l.account_name || "",
          debit: l.debit || 0,
          credit: l.credit || 0,
          contact_id: l.contact_id || "",
          contact_name: l.contact_name || "",
        })));
      }
      // Date is today (default), ref number auto-generated
    } catch (e) { /* ignore */ }
  }, [fromDuplicate]);

  // Load data
  useEffect(() => {
    if (!user || !dataOwnerId) return;
    let cancelled = false;

    const fetchAllContacts = async () => {
      const pageSize = 1000;
      const all: Contact[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("contacts")
          .select("id, contact_name, contact_type, current_balance, linked_account_code")
          .eq("user_id", dataOwnerId)
          .or("is_archived.is.null,is_archived.eq.false")
          .order("contact_name", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        all.push(...((data || []) as Contact[]));
        if (!data || data.length < pageSize) break;
      }
      return all;
    };

    Promise.all([
      fetchAllAccountsForOwner<any>(dataOwnerId, "account_code, account_name, account_type, parent_code", { activeOnly: true }),
      fetchAllContacts(),
    ]).then(([allAccounts, allContacts]) => {
      if (cancelled) return;
      setAccounts(allAccounts || []);
      setContacts(allContacts || []);
    }).catch((err: any) => {
      if (!cancelled) toast.error(err.message || tt("تعذر تحميل بيانات سند القيد")));
    }).finally(() => {
      if (!cancelled) setDraftReady(true);
    });
    return () => { cancelled = true; };
  }, [user, dataOwnerId]);

  // Auto-generate ref number
  useEffect(() => {
    if (!user || !dataOwnerId) return;
    const year = new Date().getFullYear();
    const prefix = `QV-${year}-`;
    supabase.from("vouchers").select("ref_number").eq("user_id", dataOwnerId).eq("type", "journal").like("ref_number", `${prefix}%`)
      .then(({ data }) => {
        let maxNum = 0;
        let width = 4;
        for (const row of (data || []) as any[]) {
          const m = row.ref_number?.match(/(\d+)$/);
          if (m) {
            const n = parseInt(m[1], 10);
            if (n > maxNum) maxNum = n;
            if (m[1].length > width) width = m[1].length;
          }
        }
        setFormRefNumber(`${prefix}${String(maxNum + 1).padStart(width, "0")}`);
      });
  }, [user, dataOwnerId]);

  // Auto-fetch exchange rate when currency changes (mirrors VoucherFormPage logic)
  useEffect(() => {
    if (!user) return;
    // When we just hydrated an existing voucher, keep its stored rate as-is —
    // do NOT overwrite it with today's market rate. Consume the flag once and
    // let subsequent user-driven currency changes fetch normally.
    if (skipNextRateFetchRef.current) {
      skipNextRateFetchRef.current = false;
      return;
    }
    if (formCurrency === "ILS") {
      setFormExchangeRate(1);
      return;
    }
    // Cache hit → skip network entirely
    const fxKey = `${formCurrency}|${formDate}`;
    const cached = journalFxCache.get(fxKey);
    if (cached && Date.now() - cached.ts < JOURNAL_FX_TTL_MS && cached.rate > 0) {
      setFormExchangeRate(cached.rate);
      return;
    }
    let cancelled = false;
    (async () => {
      setFetchingRate(true);
      try {
        const { data: currData } = await supabase
          .from("currencies")
          .select("id")
          .eq("code", formCurrency)
          .maybeSingle();
        if (currData?.id) {
          const { data: rateRows } = await supabase
            .from("exchange_rates")
            .select("mid_rate")
            .eq("currency_id", currData.id)
            .order("rate_date", { ascending: false })
            .limit(1);
          const rate = rateRows?.[0]?.mid_rate;
          if (!cancelled && rate) {
            setFormExchangeRate(Number(rate));
            journalFxCache.set(fxKey, { rate: Number(rate), ts: Date.now() });
            return;
          }
        }
        const { data: dbRate } = await supabase.rpc("get_exchange_rate", {
          p_currency_code: formCurrency,
          p_date: formDate,
        });
        if (!cancelled && dbRate) {
          setFormExchangeRate(Number(dbRate));
          journalFxCache.set(fxKey, { rate: Number(dbRate), ts: Date.now() });
        }
      } catch { /* ignore — keep manual rate */ }
      finally { if (!cancelled) setFetchingRate(false); }
    })();
    return () => { cancelled = true; };
  }, [formCurrency, formDate, user]);

  // ─── Sync editingVoucherId with URL (?edit=...) ───
  useEffect(() => {
    const urlId = searchParams.get("edit") || null;
    setEditingVoucherId(urlId);
    setIsReadOnly(!!urlId);
  }, [searchParams]);

  // ─── Load existing voucher into the page when editingVoucherId changes ───
  useEffect(() => {
    if (!user || !dataOwnerId || !editingVoucherId) {
      setEditingCreatedAt(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingVoucher(true);
      try {
        const { data: v, error: vErr } = await supabase
          .from("vouchers")
          .select("id, ref_number, date, subtype, contact_id, cost_center_id, description, notes, attachments, line_sort_order, created_at, type, currency, exchange_rate, book_id")
          .eq("id", editingVoucherId)
          .eq("user_id", dataOwnerId)
          .maybeSingle();
        if (vErr || !v) {
          toast.error(tt("السند غير موجود أو ليس لديك صلاحية")));
          if (!cancelled) navigate("/finance/journal/new", { replace: true });
          return;
        }
        if (v.type !== "journal") {
          toast.error(tt("هذا السند ليس قيد يومية")));
          if (!cancelled) navigate("/finance/journal/new", { replace: true });
          return;
        }

        const { data: lns } = await supabase
          .from("voucher_lines")
          .select("account_code, account_name, debit, credit, contact_id, contact_name, line_comment, cost_center_id, line_order")
          .eq("voucher_id", editingVoucherId)
          .order("line_order", { ascending: true });

        if (cancelled) return;

        setEditingCreatedAt(v.created_at);
        setFormDate(v.date);
        setFormRefNumber(v.ref_number);
        setFormSubtype((v.subtype as any) || "normal");
        setFormContactId(v.contact_id || "");
        setFormCostCenterId(v.cost_center_id || null);
        setFormDescription(v.description || "");
        setFormNotes(v.notes || "");
        if ((v as any).book_id) setFormBookId((v as any).book_id);
        setAttachments(Array.isArray(v.attachments) ? (v.attachments as any) : []);
        setLineSortOrder((v.line_sort_order as any) || "original");

        // Restore the ORIGINAL currency + exchange rate exactly as stored on
        // the voucher. Without this, foreign-currency vouchers used to open
        // as "شيكل × 1" — and any subsequent save would silently corrupt the
        // voucher (converting a JOD entry to ILS at the wrong amount).
        // The `skipNextRateFetchRef` guard prevents the auto-fetch effect
        // from clobbering the stored rate with today's market rate.
        {
          const storedCurrency = ((v as any).currency as string) || "ILS";
          const storedRate = Number((v as any).exchange_rate);
          skipNextRateFetchRef.current = storedCurrency !== "ILS";
          setFormCurrency(storedCurrency);
          setFormExchangeRate(storedRate > 0 ? storedRate : 1);
        }

        const loaded: JournalLine[] = (lns || []).map((l: any, i: number) => {
          const d = Number(l.debit) || 0;
          const c = Number(l.credit) || 0;
          return {
            id: `${editingVoucherId}-${i}-${Date.now()}`,
            account_code: l.account_code || "",
            account_name: l.account_name || "",
            // Defensive: legacy data must never present both sides at once in the form.
            debit: d >= c ? d : 0,
            credit: c > d ? c : 0,
            contact_id: l.contact_id || "",
            contact_name: l.contact_name || "",
            line_comment: l.line_comment || "",
            cost_center_id: l.cost_center_id || null,
          };
        });
        while (loaded.length < 2) {
          loaded.push({
            id: `pad-${loaded.length}-${Date.now()}`,
            account_code: "", account_name: "", debit: 0, credit: 0,
            contact_id: "", contact_name: "", line_comment: "",
          });
        }
        setLines(loaded);
        setIsReadOnly(true);
      } catch (err: any) {
        toast.error(err.message || tt("تعذر تحميل السند")));
      } finally {
        if (!cancelled) setLoadingVoucher(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editingVoucherId, user, dataOwnerId, navigate]);

  const isCustomer = (c: any) => ["customer", "عميل", "زبون"].includes(c.contact_type);
  const isSupplier = (c: any) => ["supplier", "مورد"].includes(c.contact_type);
  const isEmployee = (c: any) => ["employee", "موظف"].includes(c.contact_type);

  const resolveContactAccountCode = useCallback((contact: Partial<Contact> | null | undefined) => {
    if (!contact) return "";
    const linked = contact.linked_account_code?.trim();
    if (linked && postableAccounts.some((a: any) => a.account_code === linked)) return linked;

    const prefixes = isSupplier(contact)
      ? ["2110", "211"]
      : isCustomer(contact)
        ? ["1130", "113"]
        : isEmployee(contact)
          ? ["2180", "218"]
          : [];

    for (const prefix of prefixes) {
      const match = postableAccounts.find((a: any) =>
        a.parent_code === prefix || String(a.account_code || "").startsWith(prefix)
      );
      if (match) return match.account_code;
    }
    return "";
  }, [postableAccounts]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch) return contacts;
    return contacts.filter(c => multiWordMatchAny(contactSearch, c.contact_name));
  }, [contacts, contactSearch]);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
  const diff = Math.abs(totalDebit - totalCredit);

  const addLine = () => {
    setLines(prev => [...prev, { id: String(Date.now()), account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" }]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter(l => l.id !== id));
  };

  // Duplicate a row in place (Ctrl+D shortcut)
  const duplicateLine = (id: string) => {
    setLines(prev => {
      const idx = prev.findIndex(l => l.id === id);
      if (idx < 0) return prev;
      const src = prev[idx];
      const copy: JournalLine = {
        ...src,
        id: String(Date.now()),
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  // Add a row and immediately focus its debit cell — used by Alt+N and Enter overflow
  const addLineAndFocus = () => {
    const newId = String(Date.now());
    setLines(prev => [
      ...prev,
      { id: newId, account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
    ]);
    setTimeout(() => {
      // Focus the new row's account-code picker trigger.
      // The picker is configured to auto-open on focus for empty rows,
      // so the user lands directly in the search box.
      const trigger = document.querySelector<HTMLButtonElement>(`[data-journal-code="${newId}"]`);
      trigger?.focus();
      if (!trigger) {
        // Fallback to debit cell if picker not mounted yet
        document.querySelector<HTMLInputElement>(`[data-journal-debit="${newId}"]`)?.focus();
      }
    }, 50);
  };

  const updateLine = (id: string, field: keyof JournalLine, value: any) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      if (field === "account_code") {
        const acct = accounts.find(a => a.account_code === value);
        return { ...l, account_code: value, account_name: acct?.account_name || "" };
      }
      if (field === "contact_id") {
        const cleanVal = value === "__none__" ? "" : value;
        const c = contacts.find(c => c.id === cleanVal);
        return { ...l, contact_id: cleanVal, contact_name: c?.contact_name || "" };
      }
      // Mutual exclusivity: a single line may only carry debit OR credit, never both.
      if (field === "debit") {
        const n = Number(value) || 0;
        return { ...l, debit: n, credit: n > 0 ? 0 : l.credit };
      }
      if (field === "credit") {
        const n = Number(value) || 0;
        return { ...l, credit: n, debit: n > 0 ? 0 : l.debit };
      }
      return { ...l, [field]: value };
    }));
  };

  const formatAmount = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  // Apply a saved template into the form (overwrites lines, prefills metadata)
  const applyTemplate = useCallback((tpl: JournalTemplate) => {
    if (tpl.default_subtype) setFormSubtype(tpl.default_subtype);
    if (tpl.default_contact_id) setFormContactId(tpl.default_contact_id);
    if (!formDescription && tpl.description) setFormDescription(tpl.description);

    const newLines: JournalLine[] = tpl.lines.map((l, i) => {
      const acct = accounts.find(a => a.account_code === l.account_code);
      const d = Number(l.debit) || 0;
      const c = Number(l.credit) || 0;
      // Enforce single-sided amount per line — keep the larger side if a template
      // accidentally carries both.
      const debit = d >= c ? d : 0;
      const credit = c > d ? c : 0;
      return {
        id: String(Date.now() + i),
        account_code: l.account_code || "",
        account_name: acct?.account_name || l.account_name || "",
        debit,
        credit,
        contact_id: l.contact_id || "",
        contact_name: l.contact_name || "",
        line_comment: l.memo || "",
      };
    });
    if (newLines.length < 2) {
      while (newLines.length < 2) {
        newLines.push({
          id: String(Date.now() + newLines.length + 99),
          account_code: "", account_name: "", debit: 0, credit: 0,
          contact_id: "", contact_name: "", line_comment: "",
        });
      }
    }
    setLines(newLines);
    toast.success(`تم تطبيق القالب: ${tpl.name}`);
    // Focus first empty amount cell
    setTimeout(() => {
      const firstEmpty = newLines.find(l => !l.debit && !l.credit);
      if (firstEmpty) {
        document.querySelector<HTMLInputElement>(`[data-journal-debit="${firstEmpty.id}"]`)?.focus();
      }
    }, 100);
  }, [accounts, formDescription]);

  // Power-user keyboard shortcuts
  useJournalKeyboard({
    enabled: !showQuickAdd && !saved,
    onSave: () => {
      if (!isBalanced || saving) return;
      // In edit mode, save must UPDATE the existing voucher, never create a new one
      if (editingVoucherId && !isReadOnly) {
        handleUpdateRef.current?.();
      } else if (!editingVoucherId) {
        handleSave("posted");
      }
    },
    onAddRow: addLineAndFocus,
    onDuplicateRow: duplicateLine,
    onDeleteRow: (id) => removeLine(id),
  });

  const handleQuickAddContact = async () => {
    if (!user || !quickAddName.trim()) return;
    setQuickAddSaving(true);
    try {
      const contactType = quickAddType === "customer" ? "عميل" : "مورد";
      const { data, error } = await supabase.from("contacts").insert({
        user_id: ownerId,
        contact_name: quickAddName.trim(),
        contact_type: contactType,
        current_balance: 0,
        linked_account_code: null,
      }).select("id, contact_name, contact_type, current_balance, linked_account_code").single();
      if (error) throw error;
      // Provision a dedicated sub-account (e.g. 21100034) so vouchers do not
      // fall back to the shared parent leaf (21100001) and merge suppliers.
      const { ensureContactSubAccount } = await import("@/lib/contactAccountResolver");
      const defaultAccountCode = await ensureContactSubAccount({
        ownerId: ownerId!,
        contactId: (data as any).id,
        contactType,
        contactName: quickAddName.trim(),
      });
      (data as any).linked_account_code = defaultAccountCode;
      setContacts(prev => [...prev, data]);
      if (quickAddForLineId) {
        const acct = accounts.find(a => a.account_code === defaultAccountCode);
        setLines(prev => prev.map(l => l.id !== quickAddForLineId ? l : {
          ...l,
          contact_id: data.id,
          contact_name: data.contact_name,
          account_code: defaultAccountCode,
          account_name: acct?.account_name || "",
        }));
      }
      toast.success(`تم إضافة ${contactType}: ${data.contact_name}`);
      setShowQuickAdd(false);
      setQuickAddName("");
      setQuickAddForLineId(null);
    } catch (err: any) {
      toast.error(err.message || tt("خطأ في الإضافة")));
    } finally {
      setQuickAddSaving(false);
    }
  };


  const handleSave = async (mode: "draft" | "posted" | "deferred" = "posted") => {
    if (!user) return;
    // Safety net: never create a new voucher while in edit mode — route to update instead
    if (editingVoucherId && !isReadOnly) {
      handleUpdateRef.current?.();
      return;
    }
    if (mode === "posted" && !isBalanced) { toast.error("القيد غير متوازن"); return; }

    // Auto-assign account codes for contact-only lines before validation
    const preparedLines = lines.map(l => {
      if (!l.account_code && l.contact_id && l.contact_id !== "__none__") {
        const c = contacts.find(ct => ct.id === l.contact_id);
        const autoCode = resolveContactAccountCode(c);
        const acct = accounts.find(a => a.account_code === autoCode);
        return { ...l, account_code: autoCode, account_name: acct?.account_name || "" };
      }
      return l;
    });

    // Strict accounting validation: a line is "active" if it has any value or any account/contact selected.
    // - Fully empty rows are silently dropped.
    // - Active rows MUST have a postable account_code AND at least one of debit/credit > 0.
    const postableSet = new Set(postableAccounts.map((a: any) => a.account_code));
    const invalids: string[] = [];
    // Hard rule: a line cannot carry both debit AND credit. Block save outright.
    const dualSided = preparedLines.filter(
      l => Number(l.debit) > 0 && Number(l.credit) > 0
    );
    if (dualSided.length > 0) {
      setInvalidLineIds(new Set(dualSided.map(l => l.id)));
      const rowNums = dualSided
        .map(l => preparedLines.findIndex(x => x.id === l.id) + 1)
        .join("، ");
      toast.error(`لا يمكن إدخال مدين ودائن في نفس السطر (السطر ${rowNums})`);
      return;
    }
    const cleanLines = preparedLines.filter(l => {
      const hasAmount = Number(l.debit) > 0 || Number(l.credit) > 0;
      const hasAccount = !!l.account_code;
      const hasContact = !!l.contact_id && l.contact_id !== "__none__";
      const isEmpty = !hasAmount && !hasAccount && !hasContact && !l.line_comment;
      if (isEmpty) return false; // auto-drop fully empty rows

      // Active row — must have an account
      if (!hasAccount) { invalids.push(l.id); return true; }
      // Account must be postable (not a parent)
      if (!postableSet.has(l.account_code)) { invalids.push(l.id); return true; }
      // Must have an amount
      if (!hasAmount) { invalids.push(l.id); return true; }
      return true;
    });

    if (invalids.length > 0) {
      setInvalidLineIds(new Set(invalids));
      toast.error(tt("يرجى تحديد حساب قابل للترحيل ومبلغ لكل سطر قبل الحفظ")));
      return;
    }
    setInvalidLineIds(new Set());

    const validLines = cleanLines.filter(l => l.account_code && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (validLines.length < 2) { toast.error(tt("أدخل سطرين على الأقل"))); return; }

    setSaving(true);
    try {
      // ✅ Source of Truth الموحّد — نفس المنطق المستخدم في JournalEntryPopup
      const result = await saveJournalVoucher({
        ref_number: undefined,
        date: formDate,
        subtype: formSubtype as any,
        description: formDescription,
        notes: formNotes || null,
        book_id: formBookId,
        contact_id: formContactId || null,
        cost_center_id: formCostCenterId || null,
        currency_code: formCurrency,
        currency_label: CURRENCIES.find(c => c.value === formCurrency)?.label || "شيكل",
        exchange_rate: formExchangeRate,
        lines: validLines.map((l) => ({
          account_code: l.account_code,
          account_name: l.account_name,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          contact_id: l.contact_id && l.contact_id !== "__none__" ? l.contact_id : null,
          contact_name: l.contact_name || null,
          line_comment: l.line_comment || null,
          cost_center_id: l.cost_center_id || null,
        })),
        mode,
        attachments,
        line_sort_order: lineSortOrder,
      });

      if (!result.success) {
        throw new Error(result.error || tt("فشل حفظ السند")));
      }

      const savedRef = result.ref_number || formRefNumber;

      // ═══ ربط حركات الموظفين بمحفظتي ومدخلات الراتب ═══
      // لكل سطر تم فيه اختيار موظف + نوع حركة (أكل/سلفة/خصم)،
      // ننشئ صف في employee_financial_movements ونحدّث monthly_payroll_inputs
      // ليظهر بشكل موحّد بالمحفظة وبالراتب الشهري.
      try {
        const catLines = validLines.filter(
          (l: any) => l.employee_movement_category && l.account_name
        );
        // Resolve employee_id per line from the account name (pattern: "ذمم موظف - <name>")
        let empLines: any[] = [];
        if (catLines.length && ownerId) {
          const { data: empRows } = await supabase
            .from("employees")
            .select("id, full_name")
            .eq("user_id", ownerId)
            .eq("is_active", true);
          const norm = (s: string) =>
            (s || "")
              .replace(/^\s*ذمم\s*موظف\s*[-–—]\s*/i, "")
              .replace(/\s+/g, " ")
              .trim()
              .toLowerCase();
          const skipped: string[] = [];
          for (const l of catLines as any[]) {
            const target = norm(l.account_name);
            const match =
              (empRows || []).find((e) => norm(e.full_name) === target) ||
              (empRows || []).find(
                (e) =>
                  target &&
                  (norm(e.full_name).includes(target) || target.includes(norm(e.full_name)))
              );
            if (match) {
              empLines.push({ ...l, employee_id: match.id, employee_name: match.full_name });
            } else {
              skipped.push(l.account_name);
            }
          }
          if (skipped.length) {
            toast.warning(
              `تعذّر ربط ${skipped.length} سطر بحساب موظف (الاسم غير مطابق): ${skipped
                .slice(0, 2)
                .join("، ")}`
            );
          }
        }
        if (empLines.length && result.voucher_id && ownerId) {
          const d = new Date(formDate);
          const y = d.getFullYear();
          const m = d.getMonth() + 1;
          const movementsPayload: any[] = [];
          const inputsDelta: Record<string, any> = {};
          const noteLines: Record<string, string[]> = {};

          for (const l of empLines as any[]) {
            const raw = Number(l.debit) > 0 ? Number(l.debit) : Number(l.credit);
            if (!(raw > 0)) continue;
            const cat = l.employee_movement_category as EmployeeMovementCategory;
            const isDebit = Number(l.debit) > 0;
            const movement_type = isDebit ? "debit" : "credit";

            let category: string = "other";
            let source_type: string = "finance_manual";
            let meal_discount_type: string | null = null;
            let meal_discount_pct: number | null = null;
            let netAmount = raw;
            let description = l.line_comment || "";

            if (cat === "food_individual") {
              category = "food";
              source_type = "pos_meal";
              meal_discount_type = "individual";
              meal_discount_pct = 50;
              netAmount = raw; // full amount stored; discount pct in field
              description = description || "أكل فردي";
            } else if (cat === "food_family") {
              category = "food";
              source_type = "pos_meal";
              meal_discount_type = "family";
              meal_discount_pct = 90;
              netAmount = raw;
              description = description || "أكل عائلي";
            } else if (cat === "advance") {
              category = "advance";
              source_type = "finance_manual";
              description = description || "سلفة";
            } else if (cat === "penalty") {
              category = "penalty";
              source_type = "salary_deduction";
              description = description || "مخالفات / جزاء";
            } else if (cat === "purchase") {
              category = "purchase";
              source_type = "finance_manual";
              description = description || "مشتريات على حساب الموظف";
            } else if (cat === "delivery") {
              category = "delivery";
              source_type = "finance_manual";
              description = description || "خصم توصيل";
            } else if (cat === "other") {
              category = "other";
              source_type = "finance_manual";
              description = description || "خصم أخرى";
            } else if (cat && String(cat).startsWith("custom_")) {
              category = "other";
              source_type = "finance_manual";
              description = description || (l.employee_movement_custom_label || tt("حركة مخصّصة")));
            }

            movementsPayload.push({
              user_id: ownerId,
              employee_id: l.employee_id,
              source_type,
              source_id: result.voucher_id,
              source_reference: savedRef || null,
              description,
              amount: netAmount,
              movement_type,
              status: mode === "posted" ? "approved" : "pending",
              movement_date: formDate,
              salary_month: m,
              salary_year: y,
              journal_entry_id: result.voucher_id,
              category,
              meal_discount_type,
              meal_discount_pct,
              original_full_amount: raw,
              notes: description,
              created_by: user?.id || null,
            });

            // Aggregate for monthly_payroll_inputs
            const key = l.employee_id;
            if (!inputsDelta[key]) {
              inputsDelta[key] = {
                employee_id: l.employee_id,
                year: y,
                month: m,
                food_total: 0,
                food_individual: 0,
                new_advance: 0,
                other_deduction: 0,
              };
              noteLines[key] = [];
            }
            if (cat === "food_individual") {
              inputsDelta[key].food_individual += raw;
              noteLines[key].push(`أكل فردي ${raw}`);
            } else if (cat === "food_family") {
              inputsDelta[key].food_total += raw * 0.9;
              noteLines[key].push(`أكل عائلي ${raw} (خصم 90%)`);
            } else if (cat === "advance") {
              inputsDelta[key].new_advance += raw;
              noteLines[key].push(`سلفة ${raw}`);
            } else if (cat === "penalty") {
              inputsDelta[key].other_deduction += raw;
              noteLines[key].push(`خصم ${raw}`);
            } else if (cat === "purchase") {
              inputsDelta[key].other_deduction += raw;
              noteLines[key].push(`مشتريات ${raw}`);
            } else if (cat === "delivery") {
              inputsDelta[key].other_deduction += raw;
              noteLines[key].push(`توصيل ${raw}`);
            } else if (cat === "other") {
              inputsDelta[key].other_deduction += raw;
              noteLines[key].push(`أخرى ${raw}`);
            } else if (cat && String(cat).startsWith("custom_")) {
              inputsDelta[key].other_deduction += raw;
              const lbl = (l as any).employee_movement_custom_label || tt("مخصّص"));
              noteLines[key].push(`${lbl} ${raw}`);
            }
          }

          if (movementsPayload.length) {
            /*
             * transactions تُنشئ حركة الموظف تلقائياً عبر
             * sync_manual_journal_employee_movement. كان الإدراج المباشر هنا
             * ينشئ نسخة ثانية لنفس القيد: واحدة مصدرها transaction وأخرى
             * مصدرها voucher. نُثري الحركة التلقائية ببيانات التصنيف، ولا
             * ننشئ صفاً جديداً إلا إذا لم يعمل الكاتب التلقائي فعلاً.
             */
            const employeeIds = Array.from(new Set(movementsPayload.map((m) => m.employee_id)));
            const { data: autoRows, error: autoRowsError } = await supabase
              .from("employee_financial_movements")
              .select("id, employee_id, amount, movement_type, source_id, source_reference, movement_date, created_at")
              .eq("user_id", ownerId)
              .eq("source_reference", savedRef)
              .eq("movement_date", formDate)
              .in("employee_id", employeeIds)
              .order("created_at", { ascending: true });
            if (autoRowsError) throw autoRowsError;

            const consumed = new Set<string>();
            const missing: any[] = [];
            for (const movement of movementsPayload) {
              const existing = (autoRows || []).find((row: any) =>
                !consumed.has(row.id)
                && row.source_id !== result.voucher_id
                && row.employee_id === movement.employee_id
                && row.movement_type === movement.movement_type
                && Math.abs(Number(row.amount) - Number(movement.amount)) < 0.005
              );

              if (!existing) {
                missing.push(movement);
                continue;
              }

              consumed.add(existing.id);
              const { error: enrichError } = await supabase
                .from("employee_financial_movements")
                .update({
                  category: movement.category,
                  description: movement.description,
                  notes: movement.notes,
                  meal_discount_type: movement.meal_discount_type,
                  meal_discount_pct: movement.meal_discount_pct,
                  original_full_amount: movement.original_full_amount,
                  salary_month: movement.salary_month,
                  salary_year: movement.salary_year,
                })
                .eq("id", existing.id);
              if (enrichError) throw enrichError;
            }

            // Legacy/non-manual transaction writers may not fire the canonical
            // trigger. Preserve support for them without duplicating rows.
            if (missing.length) {
              const { error: missingError } = await supabase
                .from("employee_financial_movements")
                .insert(missing);
              if (missingError) throw missingError;
            }
          }

          // Upsert monthly inputs: read existing then add deltas (unique constraint on employee/year/month)
          for (const key of Object.keys(inputsDelta)) {
            const d1 = inputsDelta[key];
            const { data: existing } = await supabase
              .from("monthly_payroll_inputs")
              .select("id, food_total, food_individual, new_advance, other_deduction, deduction_notes, company_id")
              .eq("employee_id", d1.employee_id)
              .eq("year", y)
              .eq("month", m)
              .maybeSingle();

            const noteAppend = `[سند ${savedRef || ""}] ${noteLines[key].join("، ")}`;
            if (existing) {
              await supabase
                .from("monthly_payroll_inputs")
                .update({
                  food_total: Number(existing.food_total || 0) + d1.food_total,
                  food_individual: Number(existing.food_individual || 0) + d1.food_individual,
                  new_advance: Number(existing.new_advance || 0) + d1.new_advance,
                  other_deduction: Number(existing.other_deduction || 0) + d1.other_deduction,
                  deduction_notes: existing.deduction_notes
                    ? `${existing.deduction_notes}\n${noteAppend}`
                    : noteAppend,
                })
                .eq("id", existing.id);
            } else {
              await supabase.from("monthly_payroll_inputs").insert({
                employee_id: d1.employee_id,
                year: y,
                month: m,
                food_total: d1.food_total,
                food_individual: d1.food_individual,
                new_advance: d1.new_advance,
                other_deduction: d1.other_deduction,
                deduction_notes: noteAppend,
                created_by: user?.id || null,
                company_id: company?.id || null,
              });
            }
          }
        }
      } catch (empErr) {
        console.error("[JournalNewPage] employee movement link failed:", empErr);
        toast.warning(tt("تم حفظ السند لكن تعذّر ربط حركة الموظف. راجع محفظة الموظف يدوياً.")));
      }

      const modeLabel =
        mode === "posted" ? `تم ترحيل سند القيد ${savedRef}` :
        mode === "deferred" ? `تم حفظ سند القيد كمؤجل ${savedRef}` :
        tt("تم حفظ المسودة"));
      setSavedRefNumber(savedRef || "");
      clearDraft();
      if (fastEntryEnabled && mode === "posted") {
        toast.success(modeLabel, { duration: 2500 });
        // Auto-reset for fast entry — keep date + subtype as last-used context.
        setFormDescription("");
        setFormNotes("");
        setFormContactId("");
        setContactSearch("");
        setAttachments([]);
        setLines([
          { id: "1", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
          { id: "2", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
        ]);
        setAccountSearches({});
        setLineContactSearches({});
        requestAnimationFrame(() => {
          document.querySelector<HTMLElement>("[data-smart-first]")?.focus();
        });
      } else {
        // ERP-style: non-blocking toast with quick actions, stay on the same screen.
        toast.success(modeLabel, {
          duration: 4000,
          action: {
            label: tt("العودة للسندات")),
            onClick: () => navigate("/finance/journals"),
          },
        });
        // Reset form for a new entry while keeping the user in place.
        setFormDescription("");
        setFormNotes("");
        setFormContactId("");
        setContactSearch("");
        setAttachments([]);
        setLines([
          { id: "1", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
          { id: "2", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
        ]);
        setAccountSearches({});
        setLineContactSearches({});
        requestAnimationFrame(() => {
          document.querySelector<HTMLElement>("[data-smart-first]")?.focus();
        });
      }
    } catch (err: any) {
      toast.error(err.message || tt("حدث خطأ")));
    } finally {
      setSaving(false);
    }
  };

  // File upload handler
  const handleFileUpload = async (file: File) => {
    if (!user) return;
    if (attachments.length >= 5) { toast.error(tt("الحد الأقصى 5 ملفات"))); return; }
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    if (!allowedTypes.includes(file.type)) { toast.error("نوع الملف غير مدعوم. يُقبل: PDF, JPG, PNG, XLSX"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(tt("حجم الملف يتجاوز 10MB"))); return; }

    setUploadingFile(true);
    try {
      const filePath = `${user.id}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("journal-attachments").upload(filePath, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("journal-attachments").getPublicUrl(filePath);
      setAttachments(prev => [...prev, {
        name: file.name, url: urlData.publicUrl, size: file.size, type: file.type, uploaded_at: new Date().toISOString(),
      }]);
      toast.success(`تم رفع ${file.name}`);
    } catch (err: any) {
      toast.error(err.message || tt("خطأ في الرفع")));
    } finally {
      setUploadingFile(false);
    }
  };

  const handlePrint = () => {
    const dateFormatted = new Date(formDate).toLocaleDateString("ar-EG", {
      year: "numeric", month: "2-digit", day: "2-digit"
    });
    const fmt = (n: number) =>
      Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const subtypeAr = subtypeLabels[formSubtype] || formSubtype;

    const sortedLines = lineSortOrder === "debit_first"
      ? [...lines].sort((a, b) => (Number(b.debit) > 0 ? 0 : 1) - (Number(a.debit) > 0 ? 0 : 1))
      : lines;

    const usableLines = sortedLines.filter(
      (l) => l.account_code && (Number(l.debit) > 0 || Number(l.credit) > 0),
    );

    const rows = usableLines.map((l, i) => [
      String(i + 1),
      `${l.account_code}  ${l.account_name || ""}`.trim(),
      l.contact_name || "—",
      Number(l.debit) > 0 ? `₪${fmt(Number(l.debit))}` : "",
      Number(l.credit) > 0 ? `₪${fmt(Number(l.credit))}` : "",
      l.line_comment || "",
    ]);

    openOfficialVoucherWindow({
      docTypeLabel: tt("سند قيد")),
      docTypeLabelEn: "Journal Voucher",
      refNumber: formRefNumber || "",
      date: dateFormatted,
      company: {
        name: settings.company_name || "AMWALI",
        logoUrl: settings.logo_url || undefined,
        address: settings.address || undefined,
        phone: settings.phone || undefined,
        email: settings.email || undefined,
        taxNumber: settings.tax_number || undefined,
      },
      info: [
        { label: tt("نوع السند")), value: subtypeAr },
        { label: tt("عدد الأسطر")), value: String(usableLines.length) },
        { label: tt("الحالة")), value: isBalanced ? tt("متوازن")) : tt("غير متوازن")), warn: !isBalanced },
      ],
      description: formDescription || undefined,
      tables: [
        {
          columns: [
            { label: "#", align: "center", width: "32px" },
            { label: tt("الحساب")), align: "right" },
            { label: tt("الجهة")), align: "right" },
            { label: tt("مدين")), align: "left", width: "110px" },
            { label: tt("دائن")), align: "left", width: "110px" },
            { label: tt("ملاحظات")), align: "right" },
          ],
          rows,
          footer: ["", tt("الإجمالي")), "", `₪${fmt(totalDebit)}`, `₪${fmt(totalCredit)}`, ""],
        },
      ],
      totals: [
        { label: tt("إجمالي مدين")), value: `₪${fmt(totalDebit)}` },
        { label: tt("إجمالي دائن")), value: `₪${fmt(totalCredit)}` },
        {
          label: tt("الفرق")),
          value: `₪${fmt(diff)}`,
          warn: !isBalanced,
        },
      ],
      warningNote: isBalanced ? undefined : `القيد غير متوازن — الفرق: ₪${fmt(diff)}`,
      notes: formNotes || undefined,
      signatures: [
        { label: tt("المحاسب")) },
        { label: tt("المراجع")) },
        { label: tt("المدير المالي")) },
      ],
    });
  };

  // Reset form to a blank entry (used by "قيد جديد" action)
  const resetForm = useCallback(() => {
    setSaved(false);
    setEditingVoucherId(null);
    setEditingCreatedAt(null);
    setIsReadOnly(false);
    setFormRefNumber("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormSubtype("normal");
    setFormCurrency("ILS");
    setFormExchangeRate(1);
    setFormDescription("");
    setFormNotes("");
    setFormContactId("");
    setFormCostCenterId(null);
    setAttachments([]);
    setLines([
      { id: "1", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
      { id: "2", account_code: "", account_name: "", debit: 0, credit: 0, contact_id: "", contact_name: "", line_comment: "" },
    ]);
    setAccountSearches({});
    setLineContactSearches({});
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-smart-first]")?.focus();
    });
  }, []);

  const doPreview = () => {
    document.querySelector<HTMLElement>("[data-journal-summary]")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const openCenter = () => navigate("/accounting-center");
  const openJournalList = () => navigate("/finance/journals");

  // Prev/Next navigation between existing journal vouchers
  const goToAdjacentVoucher = async (direction: "prev" | "next") => {
    if (!user || !dataOwnerId) return;
    try {
      // Fetch the current voucher's created_at fresh from DB to avoid stale
      // state races when clicking prev/next repeatedly.
      let cursor: string | null = editingCreatedAt;
      if (editingVoucherId) {
        const { data: cur } = await supabase
          .from("vouchers")
          .select("created_at")
          .eq("id", editingVoucherId)
          .maybeSingle();
        cursor = (cur as any)?.created_at ?? cursor;
      }
      let q = supabase
        .from("vouchers")
        .select("id, ref_number, created_at")
        .eq("user_id", dataOwnerId)
        .eq("type", "journal");
      if (cursor) {
        if (direction === "prev") {
          q = q.lt("created_at", cursor).order("created_at", { ascending: false });
        } else {
          q = q.gt("created_at", cursor).order("created_at", { ascending: true });
        }
      } else {
        // No voucher loaded yet — prev = most recent, next = oldest
        q = q.order("created_at", { ascending: direction !== "prev" });
      }
      const { data, error } = await q.limit(1);
      if (error) throw error;
      const target = (data || [])[0];
      if (!target) {
        toast.info(direction === "prev" ? "لا يوجد سند سابق" : "لا يوجد سند تالٍ");
        return;
      }
      navigate(`/finance/journal/new?edit=${target.id}`);
    } catch (err: any) {
      toast.error(err.message || tt("تعذر التنقل بين السندات")));
    }
  };

  // Build a JournalSaveInput payload from current form state (shared by save+update).
  const buildPayload = (mode: "draft" | "posted" | "deferred") => {
    const validLines = lines
      .filter(l => l.account_code && (Number(l.debit) > 0 || Number(l.credit) > 0))
      .map((l) => ({
        account_code: l.account_code,
        account_name: l.account_name,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        contact_id: l.contact_id && l.contact_id !== "__none__" ? l.contact_id : null,
        contact_name: l.contact_name || null,
        line_comment: l.line_comment || null,
        cost_center_id: l.cost_center_id || null,
      }));
    return {
      ref_number: editingVoucherId ? formRefNumber : undefined,
      date: formDate,
      subtype: formSubtype as any,
      description: formDescription,
      notes: formNotes || null,
      book_id: formBookId,
      contact_id: formContactId || null,
      cost_center_id: formCostCenterId || null,
      currency_code: formCurrency,
      currency_label: CURRENCIES.find(c => c.value === formCurrency)?.label || "شيكل",
      exchange_rate: formExchangeRate,
      lines: validLines,
      mode,
      attachments,
      line_sort_order: lineSortOrder,
    };
  };

  // Update an existing loaded voucher
  const handleUpdate = async () => {
    if (!editingVoucherId) return;
    if (!isBalanced) { toast.error(tt("القيد غير متوازن"))); return; }
    setSaving(true);
    try {
      const result = await updateJournalVoucher(editingVoucherId, buildPayload("posted") as any);
      if (!result.success) throw new Error(result.error || tt("فشل تعديل السند")));
      toast.success(`تم تحديث السند ${result.ref_number || formRefNumber}`);
      setIsReadOnly(true);
    } catch (err: any) {
      toast.error(err.message || tt("حدث خطأ")));
    } finally {
      setSaving(false);
    }
  };

  // Delete loaded voucher
  const handleDelete = async () => {
    if (!editingVoucherId) return;
    if (!window.confirm(`هل تريد حذف السند ${formRefNumber}؟ لا يمكن التراجع.`)) return;
    setSaving(true);
    try {
      const result = await removeJournalVoucher(editingVoucherId);
      if (!result.success) throw new Error(result.error || tt("فشل الحذف")));
      toast.success(`تم حذف السند ${formRefNumber}`);
      navigate("/finance/journal/new", { replace: true });
    } catch (err: any) {
      toast.error(err.message || tt("تعذر الحذف")));
    } finally {
      setSaving(false);
    }
  };

  // Always-fresh refs for ActionPane (memoized tabs would otherwise capture
  // stale handlers and miss the latest form state — same fix as VoucherFormPage).
  const handleSaveRef = useRef<((mode?: "draft" | "posted" | "deferred") => void) | null>(null);
  const handleUpdateRef = useRef<(() => void) | null>(null);
  const handleDeleteRef = useRef<(() => void) | null>(null);
  const handlePrintRef = useRef<(() => void) | null>(null);
  handleSaveRef.current = handleSave;
  handleUpdateRef.current = handleUpdate;
  handleDeleteRef.current = handleDelete;
  handlePrintRef.current = handlePrint;

  // Duplicate loaded voucher into a fresh new entry (keeps all data, generates new ref)
  const handleDuplicate = async () => {
    if (!user || !dataOwnerId) return;
    // Generate a new ref number — use MAX numeric suffix (not newest by time) to avoid gaps/collisions
    const year = new Date().getFullYear();
    const prefix = `QV-${year}-`;
    const { data } = await supabase
      .from("vouchers").select("ref_number").eq("user_id", dataOwnerId).eq("type", "journal")
      .like("ref_number", `${prefix}%`);
    let maxNum = 0;
    let width = 4;
    for (const row of (data || []) as any[]) {
      const m = row.ref_number?.match(/(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
        if (m[1].length > width) width = m[1].length;
      }
    }
    const newRef = `${prefix}${String(maxNum + 1).padStart(width, "0")}`;

    setEditingVoucherId(null);
    setEditingCreatedAt(null);
    setIsReadOnly(false);
    setFormRefNumber(newRef);
    setFormDate(new Date().toISOString().split("T")[0]);
    // Reset URL (remove ?edit=)
    navigate("/finance/journal/new", { replace: true });
    toast.success(tt("تم تجهيز سند مشابه — عدّل ما يلزم ثم احفظ")));
  };

  const actionTabs: ActionTab[] = useMemo(() => {
    const inEdit = !!editingVoucherId;
    const newGroup = {
      key: "new", label: tt("جديد")), items: [
        { key: "new", label: tt("قيد جديد")), icon: Plus, variant: "primary" as const,
          onClick: () => { navigate("/finance/journal/new"); resetForm(); } },
        ...(inEdit ? [{ key: "duplicate", label: tt("إنشاء مشابه")), icon: Copy, onClick: handleDuplicate }] : []),
      ],
    };
    const saveGroup = inEdit
      ? { key: "save", label: tt("حفظ")), items: [
          { key: "edit", label: isReadOnly ? tt("تعديل")) : tt("إلغاء التعديل")), icon: isReadOnly ? Pencil : Lock,
            variant: isReadOnly ? ("primary" as const) : undefined,
            onClick: () => setIsReadOnly(prev => !prev) },
          { key: "update", label: tt("حفظ التعديلات")), icon: Save, variant: "primary" as const,
            onClick: () => handleUpdateRef.current?.(), disabled: isReadOnly || saving || !isBalanced,
            tooltip: isReadOnly ? tt("اضغط تعديل أولاً")) : (!isBalanced ? tt("القيد غير متوازن")) : undefined) },
          { key: "delete", label: tt("حذف")), icon: Trash2,
            onClick: () => handleDeleteRef.current?.(), disabled: saving },
        ]}
      : { key: "save", label: tt("حفظ")), items: [
          { key: "draft", label: tt("حفظ")), icon: Save, onClick: () => handleSaveRef.current?.("draft"), disabled: saving },
          { key: "post", label: tt("حفظ وترحيل")), icon: CheckCircle, variant: "primary" as const,
            onClick: () => handleSaveRef.current?.("posted"), disabled: saving || !isBalanced,
            tooltip: !isBalanced ? tt("القيد غير متوازن")) : undefined },
        ]};
    const viewGroup = { key: "view", label: tt("عرض")), items: [
      { key: "preview", label: tt("معاينة")), icon: Eye, onClick: doPreview },
      { key: "print", label: tt("طباعة")), icon: Printer, onClick: () => handlePrintRef.current?.() },
    ]};
    const navGroup = { key: "nav", label: tt("تنقل")), items: [
      { key: "prev", label: tt("السابق")), icon: ChevronRight, onClick: () => goToAdjacentVoucher("prev") },
      { key: "next", label: tt("التالي")), icon: ChevronLeft, onClick: () => goToAdjacentVoucher("next") },
      { key: "query", label: tt("استعلام")), icon: ListChecks, onClick: openJournalList },
      { key: "center", label: tt("فتح مركز المالية")), icon: Calculator, onClick: openCenter },
    ]};
    return [{ key: "general", label: tt("عام")), groups: [newGroup, saveGroup, viewGroup, navGroup] }];
  }, [saving, isBalanced, resetForm, handlePrint, editingVoucherId, isReadOnly, editingCreatedAt]);

  // ── FastTabs sections (collapsible body) ──
  const headerSummary = `${tt(subtypeLabels[formSubtype])} • ${formDate}${formRefNumber ? ` • ${formRefNumber}` : ""}`;
  const linesSummary = `${lines.length} سطر • مدين ₪${formatAmount(totalDebit)} • دائن ₪${formatAmount(totalCredit)}`;
  const summarySummary = isBalanced && totalDebit > 0
    ? tt("متوازن ✓"))
    : totalDebit > 0
      ? `فرق ₪${formatAmount(diff)}`
      : tt("لم تُدخل مبالغ بعد"));
  const notesSummary = `${attachments.length} مرفق${formNotes ? " • ملاحظات" : ""}`;

  // Note: Removed full-screen success page — replaced with non-blocking toast + inline reset.

  return (
    <FinanceShell
      title={tt("سند القيد")))}
      subtitle=tt("إنشاء وتعديل القيود المحاسبية اليدوية"))
      breadcrumb={[
        { label: tt("المالية")), href: "/accounting-center" },
        { label: tt("القيود اليومية")), href: "/finance/journals" },
        { label: tt("قيد يومي جديد")) },
      ]}
      actionTabs={actionTabs}
    >
    <SmartFormScope
      className="max-w-[1600px] w-full mx-auto pb-32 space-y-5"
      firstFieldSelector="[data-smart-first]"
    >
    <div dir="rtl" className="contents">
      {/* Duplicate Banner */}
      {duplicateSourceRef && <DuplicateBanner sourceRef={duplicateSourceRef} />}

      {/* Auto-Draft Restore Banner */}
      {hasDraft && (
        <DraftRestoreBanner
          onRestore={restoreDraft}
          onDismiss={clearDraft}
          savedAt={draftSavedAt}
          label={tt("يوجد مسودة محفوظة لسند القيد")))}
        />
      )}

      {/* Print-only header (hidden on screen) */}
      <div className="hidden print:block mb-4 pb-3 border-b border-border">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold">{tt("سند قيد محاسبي"))}</h1>
            {settings.company_name && <p className="text-xs text-muted-foreground mt-0.5">{settings.company_name}</p>}
          </div>
          <div className="text-[10px] text-muted-foreground text-left space-y-0.5">
            <p>{tt("رقم السند:")}<span className="font-mono">{formRefNumber}</span></p>
            <p>{tt("التاريخ:"))}<span className="font-mono">{formDate}</span></p>
            <p>النوع: {tt(subtypeLabels[formSubtype])}</p>
          </div>
        </div>
      </div>

      <div data-print-area>
      {/* View-mode banner when an existing voucher is loaded */}
      {editingVoucherId && (
        <div className={`mb-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border ${isReadOnly ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"}`}>
          <div className="flex items-center gap-2 text-xs font-semibold">
            {isReadOnly ? <Lock className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            <span>
              {isReadOnly
                ? `وضع العرض — السند ${formRefNumber}. اضغط tt("تعديل")) للتعديل أو tt("إنشاء مشابه")) لنسخه.`
                : `وضع التعديل — السند ${formRefNumber}. اضغط tt("حفظ التعديلات")) لحفظ التغييرات.`}
            </span>
          </div>
          {loadingVoucher && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
      )}
      <fieldset disabled={!!editingVoucherId && isReadOnly} className="contents min-w-0">
      {/* ═══════════════════════════════════════════════════════════════
          MASTER LAYOUT — Odoo / QuickBooks Journal style
          Left  (flex-1): Header → Lines → Description → Notes/Attachments
          Right (320px) : TRULY sticky balance summary (Debit/Credit/Diff)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">

      {/* ═══ LEFT COLUMN — Main content (grows to fill) ═══ */}
      <div className="flex-1 min-w-0 space-y-5 w-full order-2 lg:order-1">

      {/* ═══ Header Card — single compact row: date, ref, currency, rate, brief description ═══ */}
      <Card className="border-2 border-border shadow-sm rounded-2xl overflow-hidden bg-card/80">
        <CardContent className="p-3 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
            <div className="md:col-span-2">
              <Label className="text-xs mb-1.5 block">{tt("التاريخ"))}<span className="text-destructive">*</span></Label>
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} data-smart-first className="h-9" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs mb-1.5 block">{tt("رقم السند"))}<span className="text-destructive">*</span></Label>
              <Input value={formRefNumber} readOnly className="font-mono bg-muted/50 cursor-default h-9" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs mb-1.5 block">{tt("العملة"))}</Label>
              <Select value={formCurrency} onValueChange={setFormCurrency}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.symbol} {tt(c.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs mb-1.5 block flex items-center gap-1">
                سعر الصرف
                {fetchingRate && <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" />}
              </Label>
              <Input
                type="number"
                value={formExchangeRate}
                onChange={e => setFormExchangeRate(parseFloat(e.target.value) || 0)}
                step="0.001"
                min="0"
                disabled={formCurrency === "ILS"}
                className={`h-9 font-mono text-left ${formCurrency === "ILS" ? "bg-muted/50" : ""}`}
              />
            </div>
            <div className="md:col-span-4">
              <Label className="text-xs mb-1.5 block flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <BookOpenIcon className="h-3 w-3 text-muted-foreground" />
                  دفتر السندات
                </span>
                <button
                  type="button"
                  onClick={() => navigate("/finance/settings/journal-books")}
                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                  title={tt("إدارة الدفاتر")))}
                >
                  <Settings2 className="h-2.5 w-2.5" /> إدارة
                </button>
              </Label>
              <div className="flex items-stretch gap-1">
                <Select value={formBookId || ""} onValueChange={(v) => setFormBookId(v)} disabled={isReadOnly}>
                  <SelectTrigger className="h-9 flex-1">
                    <SelectValue placeholder={tt("اختر دفتراً...")))}>
                      {currentBook && (
                        <span className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-sm shrink-0"
                            style={{ backgroundColor: currentBook.color }}
                          />
                          <span className="font-medium">{currentBook.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">({currentBook.code})</span>
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {journalBooks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        <span className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: b.color }} />
                          <span>{b.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{b.code}</span>
                          {b.is_default && <span className="text-[9px] text-amber-600">★</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailsOpen(v => !v)}
                  title={tt("تفاصيل السند (نوع، جهة، مركز تكلفة)")))}
                  className="h-9 px-2 shrink-0"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <ChevronDown className={`h-3 w-3 mr-1 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
                </Button>
              </div>
            </div>
          </div>

          {detailsOpen && (
          <div className="space-y-4 pt-3 border-t border-border">
          {/* Subtype Tabs — chip strip, single row */}
          <div className="flex flex-wrap gap-2">
            {(["normal", "opening", "adjustment", "closing"] as const).map(st => (
              <button key={st} onClick={() => setFormSubtype(st)} className={`px-4 py-2 rounded-full text-xs font-medium transition-all ${formSubtype === st ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {tt(subtypeLabels[st])}
              </button>
            ))}
            </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-6">
              <Label className="text-xs mb-1.5 block">{tt("جهة الاتصال (اختياري)"))}</Label>
              <Select value={formContactId} onValueChange={setFormContactId}>
                <SelectTrigger><SelectValue placeholder={tt("اختر جهة الاتصال...")))} /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <div className="px-2 py-1.5 sticky top-0 bg-background z-10">
                    <div className="relative">
                      <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        className="w-full h-8 pr-8 pl-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder={tt("بحث...")))}
                        value={contactSearch}
                        onChange={e => setContactSearch(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  {filteredContacts.filter(isCustomer).length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-1.5 text-xs"><User className="h-3 w-3" />{tt("الزبائن"))}</SelectLabel>
                      {filteredContacts.filter(isCustomer).map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            <span>{c.contact_name}</span>
                            <span className={`text-[10px] font-mono ${c.current_balance > 0 ? "text-emerald-600" : c.current_balance < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                              ₪{formatAmount(Math.abs(c.current_balance || 0))}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {filteredContacts.filter(isSupplier).length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-1.5 text-xs"><Building2 className="h-3 w-3" />{tt("الموردين"))}</SelectLabel>
                      {filteredContacts.filter(isSupplier).map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            <span>{c.contact_name}</span>
                            <span className={`text-[10px] font-mono ${c.current_balance > 0 ? "text-emerald-600" : c.current_balance < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                              ₪{formatAmount(Math.abs(c.current_balance || 0))}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {filteredContacts.filter(isEmployee).length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-1.5 text-xs"><Users className="h-3 w-3" />{tt("موظفون"))}</SelectLabel>
                      {filteredContacts.filter(isEmployee).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.contact_name}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-6">
              <Label className="text-xs mb-1.5 block">{tt("مركز التكلفة (عام للسند — اختياري)"))}</Label>
              <CostCenterCombobox value={formCostCenterId} onChange={setFormCostCenterId} />
              <p className="text-[10px] text-muted-foreground mt-1">
                يُطبَّق على جميع السطور التي لا تحدد مركزاً خاصاً.
              </p>
            </div>
          </div>
          </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ JOURNAL LINES — compact ═══ */}
      <Card className="border-2 border-border shadow-sm rounded-2xl overflow-hidden bg-card/80">
        <CardContent className="p-3 lg:p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              أسطر القيد
            </h3>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={addLineAndFocus} className="gap-1 text-xs h-8 border-2 border-border bg-muted/40 hover:bg-muted">
                <Plus className="h-3 w-3" /> سطر
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowTemplates(true)} className="gap-1 text-xs h-8 border-2 border-border bg-muted/40 hover:bg-muted">
                <Bookmark className="h-3 w-3" /> قوالب
              </Button>
            </div>
          </div>

          <div className="rounded-xl border-2 border-border overflow-hidden shadow-sm">
            <table className="w-full text-sm" data-no-enter-nav>
              <thead>
                <tr className="text-right border-b-2 border-border" style={{ background: "#0D1B2A" }}>
                  <th className="p-3.5 text-white font-semibold text-[13px] w-12 border-l border-white/10">#</th>
                  <th className="p-3.5 text-white font-semibold text-[13px] border-l border-white/10" style={{ width: "9%" }}>{tt("رقم الحساب"))}</th>
                  <th className="p-3.5 text-white font-semibold text-[13px] border-l border-white/10" style={{ width: "24%" }}>{tt("الحساب أو الجهة"))}</th>
                  <th className="p-3.5 text-white font-semibold text-[13px] border-l border-white/10" style={{ width: "16%" }}>{tt("مدين ₪"))}</th>
                  <th className="p-3.5 text-white font-semibold text-[13px] border-l border-white/10" style={{ width: "16%" }}>{tt("دائن ₪"))}</th>
                  <th className="p-3.5 text-white font-semibold text-[13px] border-l border-white/10" style={{ width: "27%" }}>{tt("تعليق"))}</th>
                  <th className="p-3.5 text-white font-semibold text-[13px] border-l border-white/10 text-center" style={{ width: "60px" }} title={tt("مركز التكلفة")))}>{tt("م.ت"))}</th>
                  <th className="p-3.5 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const displayLines = lineSortOrder === "debit_first"
                    ? [...lines].sort((a, b) => {
                        const aIsDebit = Number(a.debit) > 0 ? 0 : 1;
                        const bIsDebit = Number(b.debit) > 0 ? 0 : 1;
                        return aIsDebit - bIsDebit;
                      })
                    : lines;
                  return displayLines.map((line, i) => {
                  return (
                  <tr key={line.id} className={`border-b border-border/60 ${i % 2 === 0 ? "bg-background" : "bg-muted/40"} ${invalidLineIds.has(line.id) ? "!bg-destructive/10 ring-1 ring-destructive/40" : ""}`}>
                    <td data-journal-line-id={line.id} className="p-3 text-muted-foreground text-sm font-semibold">{i + 1}</td>
                    <td className="p-3">
                      <Input
                        type="text"
                        value={line.account_code || ""}
                        onChange={e => {
                          const raw = e.target.value.trim();
                          setLines(prev => prev.map(l => {
                            if (l.id !== line.id) return l;
                            const acct = postableAccounts.find((a: any) => a.account_code === raw);
                            return acct
                              ? { ...l, account_code: acct.account_code, account_name: acct.account_name, contact_id: "", contact_name: "" }
                              : { ...l, account_code: raw };
                          }));
                        }}
                        onBlur={e => {
                          const raw = e.target.value.trim();
                          if (!raw) return;
                          const acct = postableAccounts.find((a: any) => a.account_code === raw);
                          if (!acct) {
                            toast.error(`رقم الحساب ${raw} غير موجود أو غير قابل للترحيل`);
                            setLines(prev => prev.map(l => l.id !== line.id ? l : { ...l, account_code: "", account_name: "" }));
                          }
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            const raw = (e.target as HTMLInputElement).value.trim();
                            const acct = postableAccounts.find((a: any) => a.account_code === raw);
                            if (raw && acct) {
                              setLines(prev => prev.map(l => l.id !== line.id ? l : {
                                ...l, account_code: acct.account_code, account_name: acct.account_name, contact_id: "", contact_name: "",
                              }));
                              // Skip to debit
                              setTimeout(() => {
                                const el = document.querySelector<HTMLInputElement>(`[data-journal-debit="${line.id}"]`);
                                el?.focus();
                                el?.select();
                              }, 0);
                            }
                          }
                        }}
                        className="h-11 font-mono text-sm text-center"
                        placeholder="1110"
                        title={tt("اكتب رقم الحساب مباشرة (مثال 1110) ثم Enter")))}
                      />
                    </td>
                    <td className="p-3">
                      <JournalEntityCombobox
                        lineId={line.id}
                        selectedAccountCode={line.account_code}
                        selectedAccountName={line.account_name}
                        selectedContactId={line.contact_id && line.contact_id !== "__none__" ? line.contact_id : ""}
                        selectedContactName={line.contact_name}
                        accounts={postableAccounts}
                        contacts={contacts}
                        invalid={invalidLineIds.has(line.id)}
                        onSelect={(sel) => {
                          if (sel.kind === "account") {
                            setLines(prev => prev.map(l => l.id !== line.id ? l : {
                              ...l, account_code: sel.account_code, account_name: sel.account_name,
                              contact_id: "", contact_name: "",
                            }));
                          } else {
                            const accountCode = resolveContactAccountCode(sel.contact) || sel.autoAccountCode;
                            const acct = accounts.find(a => a.account_code === accountCode);
                            setLines(prev => prev.map(l => l.id !== line.id ? l : {
                              ...l, contact_id: sel.contact.id, contact_name: sel.contact.contact_name,
                              account_code: accountCode, account_name: acct?.account_name || "",
                            }));
                          }
                        }}
                        onClear={() => {
                          setLines(prev => prev.map(l => l.id !== line.id ? l : { ...l, account_code: "", account_name: "", contact_id: "", contact_name: "" }));
                        }}
                        onQuickAdd={(typedName) => {
                          setQuickAddForLineId(line.id);
                          setQuickAddName(typedName || "");
                          setShowQuickAdd(true);
                        }}
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        type="text" inputMode="decimal"
                        value={amountDrafts[line.id]?.debit ?? (line.debit ? String(line.debit) : "")}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === "=" || val === "=") {
                            // Auto-balance: remaining = totalCredit(others) - totalDebit(others)
                            const otherDebit = lines.filter(l => l.id !== line.id).reduce((s, l) => s + (Number(l.debit) || 0), 0);
                            const currentTotalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
                            const remaining = Math.max(0, currentTotalCredit - otherDebit);
                            updateLine(line.id, "debit", remaining);
                            setAmountDrafts(p => ({ ...p, [line.id]: { ...p[line.id], debit: undefined } }));
                          } else {
                            // Accept only digits and a single dot; preserve raw text so
                            // users can type "13." then "13.5" without disruption.
                            const cleaned = val.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
                            setAmountDrafts(p => ({ ...p, [line.id]: { ...p[line.id], debit: cleaned } }));
                            updateLine(line.id, "debit", cleaned === "" || cleaned === "." ? 0 : Number(cleaned) || 0);
                          }
                        }}
                        onBlur={() => setAmountDrafts(p => ({ ...p, [line.id]: { ...p[line.id], debit: undefined } }))}
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            focusNextJournalCell("debit", line.id, lines.map(l => l.id), addLineAndFocus);
                          }
                        }}
                        data-journal-debit={line.id}
                        className="h-12 font-mono text-base font-semibold tracking-tight text-right" placeholder="0.00"
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        type="text" inputMode="decimal"
                        value={amountDrafts[line.id]?.credit ?? (line.credit ? String(line.credit) : "")}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === "=" || val === "=") {
                            const otherCredit = lines.filter(l => l.id !== line.id).reduce((s, l) => s + (Number(l.credit) || 0), 0);
                            const currentTotalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
                            const remaining = Math.max(0, currentTotalDebit - otherCredit);
                            updateLine(line.id, "credit", remaining);
                            setAmountDrafts(p => ({ ...p, [line.id]: { ...p[line.id], credit: undefined } }));
                          } else {
                            const cleaned = val.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
                            setAmountDrafts(p => ({ ...p, [line.id]: { ...p[line.id], credit: cleaned } }));
                            updateLine(line.id, "credit", cleaned === "" || cleaned === "." ? 0 : Number(cleaned) || 0);
                          }
                        }}
                        onBlur={() => setAmountDrafts(p => ({ ...p, [line.id]: { ...p[line.id], credit: undefined } }))}
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            focusNextJournalCell("credit", line.id, lines.map(l => l.id), addLineAndFocus);
                          }
                        }}
                        data-journal-credit={line.id}
                        className="h-12 font-mono text-base font-semibold tracking-tight text-right" placeholder="0.00"
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        value={line.line_comment || ""}
                        onChange={e => updateLine(line.id, "line_comment" as any, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            focusNextJournalCell("memo", line.id, lines.map(l => l.id), addLineAndFocus);
                          }
                        }}
                        data-journal-memo={line.id}
                        className="h-11 text-sm"
                        placeholder={tt("تعليق على هذا السطر...")))}
                      />
                    </td>
                    <td
                      className="p-2 text-center"
                      onKeyDown={(e) => {
                        // Enter on the last row's cost-center cell creates a new row
                        if (e.key === "Enter" && !e.shiftKey) {
                          const ids = lines.map(l => l.id);
                          if (ids[ids.length - 1] === line.id) {
                            e.preventDefault();
                            e.stopPropagation();
                            addLineAndFocus();
                          }
                        }
                      }}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <CostCenterCombobox
                          value={line.cost_center_id || null}
                          onChange={(id) => updateLine(line.id, "cost_center_id" as any, id)}
                          placeholder={formCostCenterId ? tt("موروث من الرأس")) : tt("إضافة مركز تكلفة"))}
                          iconOnly
                        />
                        {isMalakyTenant && (
                        <EmployeeMovementPopover
                        value={{
                          category: line.employee_movement_category || null,
                          custom_label: line.employee_movement_custom_label || null,
                        }}
                        accountName={line.account_name || null}
                        onChange={(v) => {
                          updateLine(line.id, "employee_movement_category" as any, v.category);
                          updateLine(line.id, "employee_movement_custom_label" as any, v.custom_label || null);
                        }}
                        />
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        {(() => {
                          const linked = (line.line_comment || "").includes("طلبية ORD-");
                          const match = linked ? (line.line_comment || "").match(/طلبية\s+(ORD-[A-Z0-9]+)/) : null;
                          return (
                            <button
                              type="button"
                              onClick={() => openOrderLink(line.id)}
                              className={`p-1 rounded transition-colors ${linked ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 ring-1 ring-emerald-500/30" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
                              title={linked ? `مربوط بطلبية ${match?.[1] || ""} — اضغط للتغيير` : "ربط السطر بطلبية زبون"}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </button>
                          );
                        })()}
                        <button onClick={() => removeLine(line.id)} className="p-1 hover:text-destructive text-muted-foreground" disabled={lines.length <= 2}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                });
                })()}
              </tbody>
              <tfoot>
                <tr className="border-t font-bold bg-primary/5">
                  <td colSpan={2} className="p-3 text-sm font-bold">{tt("الإجمالي"))}</td>
                  <td className="p-3 font-mono text-sm">₪{formatAmount(totalDebit)}</td>
                  <td className="p-3 font-mono text-xs text-destructive">₪{formatAmount(totalCredit)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="text-muted-foreground">{tt("كل سطر مدين أو دائن فقط."))}</span>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">{tt("الترتيب:"))}</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="radio" name="sortOrder" checked={lineSortOrder === "original"} onChange={() => setLineSortOrder("original")} className="accent-primary" />
                <span className={lineSortOrder === "original" ? "font-semibold text-foreground" : "text-muted-foreground"}>الأصلي</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="radio" name="sortOrder" checked={lineSortOrder === "debit_first"} onChange={() => setLineSortOrder("debit_first")} className="accent-primary" />
                <span className={lineSortOrder === "debit_first" ? "font-semibold text-foreground" : "text-muted-foreground"}>مدين ثم دائن</span>
              </label>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* ═══ Notes (right, wider) + Attachments (left, compact) — inline row under the entries table ═══ */}
      <Card className="border-2 border-border shadow-sm rounded-2xl bg-card/80">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
            {/* Notes — right side in RTL (first in DOM) */}
            <div className="lg:col-span-8 flex items-start gap-3">
              <Label className="text-xs font-bold text-foreground whitespace-nowrap shrink-0 mt-2">{tt("الملاحظات"))}</Label>
              <Textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder={tt("ملاحظات إضافية على السند... (اضغط Enter لسطر جديد)")))}
                rows={2}
                className="flex-1 min-h-[44px] border-2 border-border bg-background resize-y text-sm leading-relaxed"
              />
            </div>
            {/* Attachments — left side, compact */}
            <div className="lg:col-span-4 flex items-center gap-2 border-2 border-border rounded-xl bg-background px-3 py-1.5">
              <Label className="text-xs font-bold text-foreground whitespace-nowrap shrink-0">{tt("المرفقات"))}</Label>
              <div className="flex-1 min-w-0 text-[11px] text-muted-foreground truncate">
                {attachments.length === 0
                  ? tt("لا توجد مرفقات"))
                  : attachments.map(a => a.name).join("، ")}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:bg-primary/10 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
              >
                <Paperclip className="h-3.5 w-3.5" />
                إرفاق ملف
              </button>
              <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xlsx"
                onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = ""; }} />
            </div>
          </div>
          {/* Attachments list (only when files exist) */}
          {attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-2 bg-muted/40 border border-border/60 rounded-lg px-2.5 py-1">
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline">{att.name}</a>
                  <span className="text-[10px] text-muted-foreground">({(att.size / 1024).toFixed(0)} KB)</span>
                  <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {uploadingFile && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ الرفع...
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ END LEFT COLUMN ═══ */}
      </div>

      {/* ═══ RIGHT COLUMN — Truly Sticky Balance Summary (responsive width) ═══ */}
      {summaryOpen && (
      <aside className="w-full lg:w-[clamp(240px,18vw,300px)] lg:shrink-0 lg:sticky lg:top-4 self-start order-1 lg:order-2">
        <Card className="border-2 border-border shadow-md rounded-2xl overflow-hidden bg-card/80">
          <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            <h3 className="text-[13px] font-bold text-foreground">{tt("ملخص القيد"))}</h3>
          </div>
          <CardContent className="p-4 space-y-3">
            {(() => {
              const isZero = totalDebit === 0 && totalCredit === 0;
              if (isZero) {
                return (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 text-muted-foreground text-xs">
                    <FileText className="h-3.5 w-3.5" />
                    <span>{tt("أدخل المبالغ للتحقق من التوازن"))}</span>
                  </div>
                );
              }
              if (isBalanced) {
                return (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20">
                    <CheckCircle className="h-4 w-4" />
                    <span>{tt("القيد متوازن — جاهز للترحيل"))}</span>
                  </div>
                );
              }
              return (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-xs font-bold border border-destructive/20">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{tt("القيد غير متوازن"))}</span>
                </div>
              );
            })()}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                <span className="text-[11px] text-muted-foreground font-medium">{tt("إجمالي مدين"))}</span>
                <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400 text-sm">₪{formatAmount(totalDebit)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-destructive/5 border border-destructive/15">
                <span className="text-[11px] text-muted-foreground font-medium">{tt("إجمالي دائن"))}</span>
                <span className="font-bold tabular-nums text-destructive text-sm">₪{formatAmount(totalCredit)}</span>
              </div>
              <div className="h-px bg-border/60 my-1" />
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted/40">
                <span className="text-[12px] font-semibold">{tt("الفرق"))}</span>
                <span className={`font-extrabold tabular-nums text-base ${isBalanced ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
                  ₪{formatAmount(Math.abs(totalDebit - totalCredit))}
                </span>
              </div>
            </div>
            <div className="pt-2 mt-1 border-t border-border space-y-1.5 text-[11px] text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>{tt("عدد الأسطر"))}</span>
                <span className="font-semibold text-foreground tabular-nums">{lines.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{tt("نوع السند"))}</span>
                <span className="font-semibold text-foreground">{tt(subtypeLabels[formSubtype])}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{tt("التاريخ"))}</span>
                <span className="font-semibold text-foreground tabular-nums">{formDate}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </aside>
      )}

      {/* ═══ END MASTER FLEX ═══ */}
      </div>
      </fieldset>
      </div>
      {/* ═══ END data-print-area ═══ */}

      {/* ═══ Bottom Action Bar (inline, in-flow) ═══ */}
      {!editingVoucherId && (
      <div className="mt-4 rounded-2xl border-2 border-border bg-card/80 px-3 sm:px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mini status pill */}
          <div className={`hidden md:flex items-center gap-2 px-3 h-11 rounded-xl text-[11px] font-semibold tabular-nums ${isBalanced && totalDebit > 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : totalDebit > 0 ? "bg-destructive/10 text-destructive" : "bg-muted/40 text-muted-foreground"}`}>
            <span>مدين ₪{formatAmount(totalDebit)}</span>
            <span className="opacity-40">·</span>
            <span>دائن ₪{formatAmount(totalCredit)}</span>
            <span className="opacity-40">·</span>
            {totalDebit === 0 && totalCredit === 0 ? (
              <span>—</span>
            ) : isBalanced ? (
              <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3" />{tt("متوازن"))}</span>
            ) : (
              <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> فرق ₪{formatAmount(Math.abs(totalDebit - totalCredit))}</span>
            )}
          </div>

          {/* Ghost: Print */}
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 h-11 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all border-2 border-border bg-muted/30">
            <Printer className="h-4 w-4" /> طباعة
          </button>

          {/* Secondary: Draft */}
          <button onClick={() => handleSave("draft")} disabled={saving}
            className="px-4 h-11 rounded-xl border-2 border-border text-foreground text-sm hover:bg-muted transition-all disabled:opacity-50 bg-muted/30 font-medium">
            حفظ كمسودة
          </button>

          {/* Secondary warning: Deferred */}
          <button onClick={() => handleSave("deferred")} disabled={saving || !isBalanced}
            className="flex items-center gap-1.5 px-4 h-11 rounded-xl border-2 border-yellow-500/70 text-yellow-700 dark:text-yellow-400 text-sm font-semibold hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-all disabled:opacity-50">
            <Clock className="h-4 w-4" />
            حفظ مع التأجيل
          </button>

          {/* PRIMARY — dominant */}
          <button onClick={() => handleSave("posted")} disabled={saving || !isBalanced}
            className="flex-1 min-w-[200px] flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-primary/25">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? tt("جارٍ الحفظ...")) : tt("حفظ وترحيل"))}
          </button>
        </div>
      </div>
      )}

      {/* Quick Add Contact Dialog */}
      <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-5 w-5 text-primary" />
              إضافة جهة جديدة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs mb-1.5 block">{tt("نوع الجهة"))}</Label>
              <div className="flex gap-2">
                <button
                  onClick={() => setQuickAddType("customer")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${quickAddType === "customer" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  <User className="h-3.5 w-3.5" /> زبون
                </button>
                <button
                  onClick={() => setQuickAddType("supplier")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${quickAddType === "supplier" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  <Building2 className="h-3.5 w-3.5" /> مورد
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">{tt("اسم الجهة *"))}</Label>
              <Input
                value={quickAddName}
                onChange={e => setQuickAddName(e.target.value)}
                placeholder={quickAddType === "customer" ? "مثال: أحمد محمد" : "مثال: شركة التوريدات"}
                autoFocus
                onKeyDown={e => { if (e.key === "Enter" && quickAddName.trim()) handleQuickAddContact(); }}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowQuickAdd(false)}>{tt("إلغاء"))}</Button>
              <Button size="sm" onClick={handleQuickAddContact} disabled={!quickAddName.trim() || quickAddSaving} className="gap-1">
                {quickAddSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                حفظ وربط
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Templates Picker */}
      <JournalTemplatesPicker
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        onApply={applyTemplate}
        currentSnapshot={{
          name: formDescription || tt("قالب جديد")),
          description: formDescription,
          default_subtype: formSubtype,
          default_contact_id: formContactId || null,
          lines: lines.map(l => ({
            account_code: l.account_code,
            account_name: l.account_name,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            memo: l.line_comment || "",
            contact_id: l.contact_id || null,
            contact_name: l.contact_name || null,
          })),
        }}
      />
    </div>
    <Dialog open={orderLinkFor !== null} onOpenChange={(o) => !o && setOrderLinkFor(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tt("ربط السطر بطلبية زبون"))}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder={tt("بحث برقم الطلبية أو اسم الزبون...")))}
            value={orderLinkQuery}
            onChange={e => setOrderLinkQuery(e.target.value)}
          />
          <div className="max-h-80 overflow-y-auto border rounded-md divide-y">
            {orderLinkLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> جارٍ التحميل...
              </div>
            ) : (() => {
              const q = orderLinkQuery.trim().toLowerCase();
              const filtered = q
                ? orderLinkOptions.filter(o =>
                    (o.order_number || "").toLowerCase().includes(q) ||
                    (o.customer_name || "").toLowerCase().includes(q))
                : orderLinkOptions;
              if (filtered.length === 0) {
                return <div className="p-6 text-center text-sm text-muted-foreground">{tt("لا توجد طلبيات مطابقة"))}</div>;
              }
              return filtered.slice(0, 100).map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => applyOrderLink(o)}
                  className="w-full text-right p-3 hover:bg-primary/5 flex items-center justify-between gap-3"
                >
                  <div className="text-xs text-muted-foreground font-mono">₪{Number(o.total || 0).toLocaleString()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{o.customer_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{o.order_number} · {o.order_date}</div>
                  </div>
                </button>
              ));
            })()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </SmartFormScope>
    </FinanceShell>
  );
};

export default JournalNewPage;
