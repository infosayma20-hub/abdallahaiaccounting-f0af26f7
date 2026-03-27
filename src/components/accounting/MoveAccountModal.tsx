import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, AlertTriangle, CheckCircle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  parent_code: string | null;
  is_system_protected?: boolean | null;
}

interface MoveAccountModalProps {
  account: Account | null;
  allAccounts: Account[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
}

function isDescendantOf(accountCode: string, ancestorCode: string, allAccounts: Account[]): boolean {
  const acc = allAccounts.find(a => a.account_code === accountCode);
  if (!acc || !acc.parent_code || acc.parent_code === acc.account_code) return false;
  if (acc.parent_code === ancestorCode) return true;
  return isDescendantOf(acc.parent_code, ancestorCode, allAccounts);
}

const arabicTypeMap: Record<string, string> = {
  "إيرادات": "Revenue", "مصاريف": "Expenses", "مصروفات": "Expenses",
  "أصول": "Asset", "asset": "Asset", "Asset": "Asset",
  "التزامات": "Liability", "خصوم": "Liability",
  "حقوق ملكية": "Owner's Equity", "مشتريات": "Purchases",
};
function normalizeType(t: string) { return arabicTypeMap[t] || t; }

export const MoveAccountModal = ({ account, allAccounts, isOpen, onClose, onSuccess, userId }: MoveAccountModalProps) => {
  const [selectedParentCode, setSelectedParentCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (account) {
      setSelectedParentCode(account.parent_code);
      setSearchTerm("");
    }
  }, [account]);

  const eligibleParents = useMemo(() => {
    if (!account) return [];
    const accType = normalizeType(account.account_type);
    return allAccounts.filter(a =>
      a.account_code !== account.account_code &&
      normalizeType(a.account_type) === accType &&
      !isDescendantOf(a.account_code, account.account_code, allAccounts)
    );
  }, [account, allAccounts]);

  const filteredParents = useMemo(() => {
    if (!searchTerm.trim()) return eligibleParents;
    const q = searchTerm.toLowerCase();
    return eligibleParents.filter(a =>
      a.account_name.includes(q) || a.account_code.includes(q)
    );
  }, [eligibleParents, searchTerm]);

  if (!account) return null;

  const currentParent = account.parent_code
    ? allAccounts.find(a => a.account_code === account.parent_code)
    : null;

  const hasChanged = selectedParentCode !== account.parent_code;

  const handleMove = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('move_account', {
        p_account_id: account.id,
        p_new_parent_code: selectedParentCode,
        p_user_id: userId,
      });

      if (error) throw error;
      const result = data as any;
      if (!result?.success) {
        toast({ title: "خطأ في النقل", description: result?.error || "خطأ غير معروف", variant: "destructive" });
        return;
      }

      toast({ title: "✅ تم نقل الحساب", description: `تم نقل "${account.account_name}" بنجاح` });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[500px] p-0 gap-0 overflow-hidden" dir="rtl">
        <DialogHeader className="px-6 py-4 border-b border-[hsl(210,14%,89%)]">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <ArrowUpDown className="w-4 h-4 text-primary" />
            نقل الحساب: {account.account_code} — {account.account_name}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Warning */}
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
              سيتم تحديث موضع هذا الحساب في الشجرة فقط. لن تتأثر القيود المحاسبية أو الأرصدة.
            </p>
          </div>

          {/* Current position */}
          <div className="bg-[hsl(210,20%,97%)] dark:bg-muted/30 rounded-lg px-3 py-2.5">
            <p className="text-[10px] font-bold text-[hsl(210,10%,50%)] uppercase tracking-wide mb-1">الموقع الحالي</p>
            <p className="text-sm font-medium">
              {currentParent ? `${currentParent.account_code} — ${currentParent.account_name}` : "حساب رئيسي (بدون أب)"}
            </p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث عن حساب الأب الجديد..."
              className="pr-9 h-9 text-sm"
              dir="rtl"
            />
          </div>

          {/* Parent list */}
          <div className="border rounded-lg max-h-[280px] overflow-y-auto divide-y divide-[hsl(210,14%,93%)]">
            {/* No parent option */}
            <button
              onClick={() => setSelectedParentCode(null)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50 transition-colors text-right",
                selectedParentCode === null && "bg-primary/5 border-r-2 border-r-primary"
              )}
            >
              {selectedParentCode === null && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
              <div>
                <p className="font-semibold text-xs">بدون أب — حساب رئيسي</p>
                <p className="text-[10px] text-muted-foreground">سيظهر في المستوى الأول</p>
              </div>
            </button>

            {filteredParents.map(parent => (
              <button
                key={parent.id}
                onClick={() => setSelectedParentCode(parent.account_code)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors text-right",
                  selectedParentCode === parent.account_code && "bg-primary/5 border-r-2 border-r-primary"
                )}
              >
                {selectedParentCode === parent.account_code && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[11px] text-muted-foreground shrink-0">{parent.account_code}</span>
                  <span className="truncate text-xs">{parent.account_name}</span>
                </div>
              </button>
            ))}

            {filteredParents.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                لا توجد نتائج مطابقة
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 py-3 border-t border-[hsl(210,14%,89%)] bg-[hsl(210,20%,97%)]">
          <Button onClick={handleMove} disabled={isLoading || !hasChanged} className="flex-1 gap-1.5 bg-[#1B3A5C] hover:bg-[#1B3A5C]/90">
            {isLoading ? "جاري النقل..." : "تأكيد النقل"}
          </Button>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
