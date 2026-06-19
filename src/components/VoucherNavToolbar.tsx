import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft,
  Search, Plus, Copy, Printer, X, Trash2, Save, CheckCircle2, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { multiWordMatchAny } from "@/lib/utils";

interface VoucherNavToolbarProps {
  /** "receipt" | "payment" | "journal" | "invoice" */
  voucherType: "receipt" | "payment" | "journal" | "invoice";
  /** Current voucher ref number (for display) */
  currentRef?: string;
  /** Called when user clicks "جديد" */
  onNew?: () => void;
  /** Called when user clicks "جديد مشابه" - clones current entry */
  onNewSimilar?: () => void;
  /** Called when user clicks print */
  onPrint?: () => void;
  /** Called when user clicks preview (opens preview dialog without printing). */
  onPreview?: () => void;
  /** Called when user clicks delete */
  onDelete?: () => void;
  /** Whether toolbar should show (hide on create-new mode with no saved entry) */
  showNavigation?: boolean;
  /**
   * Quick "حفظ كمسودة" — wires to the SAME handler as the bottom draft button.
   * Omit to hide the top draft action.
   */
  onSaveDraft?: () => void;
  /**
   * Quick "حفظ وترحيل" / "ترحيل" — wires to the SAME handler as the bottom post button.
   * Omit to hide the top post action.
   */
  onSavePost?: () => void;
  /** Custom label for the top post button (default: "حفظ وترحيل"). */
  savePostLabel?: string;
  /** Disabled flag for the draft action — must mirror the bottom button. */
  saveDraftDisabled?: boolean;
  /** Disabled flag for the post action — must mirror the bottom button. */
  savePostDisabled?: boolean;
  /** Tooltip shown when post is disabled (e.g. "القيد غير متوازن"). */
  savePostDisabledReason?: string;
  /** Show a "جارٍ الحفظ..." state on the post button. */
  saving?: boolean;
}

interface VoucherItem {
  id: string;
  ref: string;
  date: string;
  description: string;
  amount: number;
  status: string;
}

const VoucherNavToolbar = ({
  voucherType,
  currentRef,
  onNew,
  onNewSimilar,
  onPrint,
  onPreview,
  onDelete,
  showNavigation = true,
  onSaveDraft,
  onSavePost,
  savePostLabel = "حفظ وترحيل",
  saveDraftDisabled = false,
  savePostDisabled = false,
  savePostDisabledReason,
  saving = false,
}: VoucherNavToolbarProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [allIds, setAllIds] = useState<string[]>([]);
  const [allRefs, setAllRefs] = useState<VoucherItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const isReceipt = voucherType === "receipt";
  const isJournal = voucherType === "journal";
  const isInvoice = voucherType === "invoice";

  // Load all voucher IDs for navigation
  const loadVoucherList = useCallback(async () => {
    if (!user) return;
    if (isReceipt) {
      const { data } = await supabase
        .from("receipt_vouchers")
        .select("id, receipt_number, payment_date, contact_name, amount, status")
        .eq("user_id", dataOwnerId!)
        .order("created_at", { ascending: true });
      if (data) {
        setAllIds(data.map(d => d.id));
        setAllRefs(data.map(d => ({
          id: d.id,
          ref: d.receipt_number || "",
          date: d.payment_date || "",
          description: d.contact_name || "",
          amount: d.amount || 0,
          status: d.status || "",
        })));
      }
    } else if (isInvoice) {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, contact_name, total_amount, status")
        .eq("user_id", dataOwnerId!)
        .order("created_at", { ascending: true });
      if (data) {
        setAllIds(data.map(d => d.id));
        setAllRefs(data.map(d => ({
          id: d.id,
          ref: d.invoice_number || "",
          date: d.invoice_date || "",
          description: d.contact_name || "",
          amount: d.total_amount || 0,
          status: d.status || "",
        })));
      }
    } else if (isJournal) {
      const { data } = await supabase
        .from("vouchers")
        .select("id, ref_number, date, description, amount, status")
        .eq("user_id", dataOwnerId!)
        .eq("type", "journal")
        .order("created_at", { ascending: true });
      if (data) {
        setAllIds(data.map(d => d.id));
        setAllRefs(data.map(d => ({
          id: d.id,
          ref: d.ref_number || "",
          date: d.date || "",
          description: d.description || "",
          amount: d.amount || 0,
          status: d.status || "",
        })));
      }
    } else {
      // payment
      const { data } = await supabase
        .from("vouchers")
        .select("id, ref_number, date, description, amount, status")
        .eq("user_id", dataOwnerId!)
        .eq("type", "payment")
        .order("created_at", { ascending: true });
      if (data) {
        setAllIds(data.map(d => d.id));
        setAllRefs(data.map(d => ({
          id: d.id,
          ref: d.ref_number || "",
          date: d.date || "",
          description: d.description || "",
          amount: d.amount || 0,
          status: d.status || "",
        })));
      }
    }
  }, [user, isReceipt, isJournal, isInvoice]);

  useEffect(() => { loadVoucherList(); }, [loadVoucherList]);

  // Find current index when currentRef changes
  useEffect(() => {
    if (!currentRef || allRefs.length === 0) { setCurrentIndex(-1); return; }
    const idx = allRefs.findIndex(v => v.ref === currentRef);
    setCurrentIndex(idx);
  }, [currentRef, allRefs]);

  const navigateToVoucher = (id: string) => {
    if (isInvoice) navigate(`/invoices/new?edit=${id}`);
    else if (isReceipt) navigate(`/finance/receipt/${id}/edit`);
    else if (isJournal) navigate(`/finance/journals?edit=${id}`);
    else navigate(`/finance/payment/${id}/edit`);
  };

  const goFirst = () => { if (allIds.length > 0) navigateToVoucher(allIds[0]); };
  const goLast = () => { if (allIds.length > 0) navigateToVoucher(allIds[allIds.length - 1]); };
  const goPrev = () => {
    if (currentIndex > 0) navigateToVoucher(allIds[currentIndex - 1]);
  };
  const goNext = () => {
    if (currentIndex < allIds.length - 1) navigateToVoucher(allIds[currentIndex + 1]);
  };

  const filteredSearch = searchQuery
    ? allRefs.filter(v => multiWordMatchAny(searchQuery, v.ref, v.description, v.date))
    : allRefs.slice(-20).reverse();

  const handleNewPath = () => {
    if (onNew) { onNew(); return; }
    if (isInvoice) navigate("/invoices/new");
    else if (isReceipt) navigate("/finance/receipt/new");
    else if (isJournal) navigate("/finance/journal/new");
    else navigate("/finance/payment/new");
  };

  const formatAmount = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const hasNav = showNavigation && allIds.length > 0;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allIds.length - 1;

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap bg-card border border-border rounded-xl px-3 py-2 shadow-sm">
        {/* Ref Number Display */}
        {currentRef && (
          <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md border border-primary/20">
            {currentRef}
          </span>
        )}

        {/* Navigation buttons */}
        {hasNav && (
          <div className="flex items-center gap-0.5 border-l border-border pl-2 ml-1">
            <Button variant="ghost" size="sm" onClick={goFirst} disabled={!hasPrev}
              className="h-8 w-8 p-0" title="الأول" data-testid="voucher-nav-first">
              <ChevronsRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goPrev} disabled={!hasPrev}
              className="h-8 w-8 p-0" title="السابق" data-testid="voucher-nav-prev">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {currentIndex >= 0 && (
              <span className="text-[10px] text-muted-foreground px-1.5 font-mono" data-testid="voucher-nav-counter">
                {currentIndex + 1}/{allIds.length}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={goNext} disabled={!hasNext}
              className="h-8 w-8 p-0" title="التالي" data-testid="voucher-nav-next">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goLast} disabled={!hasNext}
              className="h-8 w-8 p-0" title="الأخير" data-testid="voucher-nav-last">
              <ChevronsLeft className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Search */}
        <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)}
          className="h-8 gap-1.5 text-xs" data-testid="voucher-nav-search">
          <Search className="h-3.5 w-3.5" /> استعلام
        </Button>

        {/* Print */}
        {onPrint && (
          <Button variant="outline" size="sm" onClick={onPrint}
            className="h-8 gap-1.5 text-xs" data-testid="voucher-nav-print">
            <Printer className="h-3.5 w-3.5" /> طباعة
          </Button>
        )}

        {/* Preview */}
        {onPreview && (
          <Button variant="outline" size="sm" onClick={onPreview}
            className="h-8 gap-1.5 text-xs" data-testid="voucher-nav-preview">
            <Eye className="h-3.5 w-3.5" /> معاينة
          </Button>
        )}

        <div className="flex-1" />

        {/* Top Save (draft) — wired to same bottom handler */}
        {onSaveDraft && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSaveDraft}
            disabled={saveDraftDisabled || saving}
            className="h-8 gap-1.5 text-xs"
            title="حفظ كمسودة"
            data-testid="voucher-nav-save-draft"
          >
            <Save className="h-3.5 w-3.5" /> حفظ
          </Button>
        )}

        {/* Top Save & Post — wired to same bottom handler */}
        {onSavePost && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span wrapper so tooltip works while button is disabled */}
                <span className="inline-flex">
                  <Button
                    size="sm"
                    onClick={onSavePost}
                    disabled={savePostDisabled || saving}
                    className="h-8 gap-1.5 text-xs font-bold"
                    data-testid="voucher-nav-save-post"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {saving ? "جارٍ..." : savePostLabel}
                  </Button>
                </span>
              </TooltipTrigger>
              {savePostDisabled && savePostDisabledReason && (
                <TooltipContent side="bottom">
                  <p className="text-xs">{savePostDisabledReason}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Delete */}
        {onDelete && currentRef && (
          <Button variant="outline" size="sm" onClick={onDelete}
            className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30" data-testid="voucher-nav-delete">
            <Trash2 className="h-3.5 w-3.5" /> حذف
          </Button>
        )}

        {/* New Similar */}
        {onNewSimilar && currentRef && (
          <Button variant="outline" size="sm" onClick={onNewSimilar}
            className="h-8 gap-1.5 text-xs" data-testid="voucher-nav-duplicate">
            <Copy className="h-3.5 w-3.5" /> جديد مشابه
          </Button>
        )}

        {/* New */}
        <Button size="sm" onClick={handleNewPath}
          className="h-8 gap-1.5 text-xs" data-testid="voucher-nav-new">
          <Plus className="h-3.5 w-3.5" /> جديد
        </Button>
      </div>

      {/* Search Dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              استعلام عن سند
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث برقم السند أو الاسم أو التاريخ..."
                className="pr-9"
                autoFocus
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
              {filteredSearch.length === 0 ? (
                <p className="text-center py-6 text-xs text-muted-foreground">لا توجد نتائج</p>
              ) : (
                filteredSearch.map(v => (
                  <button
                    key={v.id}
                    onClick={() => { navigateToVoucher(v.id); setSearchOpen(false); setSearchQuery(""); }}
                    className={`w-full text-right px-4 py-2.5 hover:bg-secondary transition-colors flex items-center justify-between border-b border-border/30 last:border-0 ${v.ref === currentRef ? "bg-primary/5" : ""}`}
                  >
                    <div>
                      <span className="text-sm font-mono font-medium text-foreground">{v.ref}</span>
                      <span className="text-xs text-muted-foreground mr-3">{v.description}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{v.date ? new Date(v.date).toLocaleDateString("en-GB") : ""}</span>
                      <span className="text-xs font-mono font-bold">₪{formatAmount(v.amount)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default VoucherNavToolbar;
