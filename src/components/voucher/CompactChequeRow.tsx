/**
 * CompactChequeRow — single-row layout for one cheque entry inside a voucher.
 * Memoized to avoid re-rendering all rows when one cheque updates.
 *
 * Columns (RTL):
 *   رقم الشيك | البنك | تاريخ الاستحقاق | المبلغ | رقم الحساب | 📝 | ❌
 */
import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StickyNote, X } from "lucide-react";
import DateInputDMY from "@/components/forms/DateInputDMY";
import ChequeAllBankSelect from "@/components/ChequeAllBankSelect";
import { cn } from "@/lib/utils";

export interface ChequeRowData {
  number: string;
  bank: string;
  date: string;
  amount: string | number;
  accountNumber: string;
  notes: string;
}

export interface CompactChequeRowProps {
  index: number;
  cheque: ChequeRowData;
  isReceipt: boolean;
  bankAccounts: Array<{ id: string; bank_name: string }>;
  onUpdate: (index: number, field: keyof ChequeRowData, value: string) => void;
  onRemove: (index: number) => void;
  /** Pressing Enter in any field triggers this (used to add a new row). */
  onEnterAdd?: () => void;
  /** Marks the very first input of the very first row for autofocus. */
  autoFocusFirst?: boolean;
}

const CompactChequeRow = React.memo(function CompactChequeRow({
  index,
  cheque,
  isReceipt,
  bankAccounts,
  onUpdate,
  onRemove,
  onEnterAdd,
  autoFocusFirst,
}: CompactChequeRowProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onEnterAdd?.();
    }
  };

  return (
    <div
      className={cn(
        "grid items-center gap-2 rounded-lg border border-border/60 bg-card hover:bg-secondary/20 transition-colors px-2 py-1.5",
        // Columns: # | number | bank | date | amount | account | notes | delete
        "grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_36px_32px]",
      )}
      style={{ minHeight: 48 }}
    >
      {/* Index */}
      <div className="text-[10px] font-bold text-muted-foreground text-center tabular-nums">
        {index + 1}
      </div>

      {/* رقم الشيك */}
      <Input
        value={cheque.number}
        onChange={(e) => onUpdate(index, "number", e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="رقم الشيك"
        autoFocus={autoFocusFirst}
        className="h-9 text-xs font-mono"
      />

      {/* البنك */}
      <div>
        {isReceipt ? (
          <ChequeAllBankSelect
            value={cheque.bank}
            onChange={(v) => onUpdate(index, "bank", v)}
            userBanks={bankAccounts}
          />
        ) : (
          <Select value={cheque.bank} onValueChange={(v) => onUpdate(index, "bank", v)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="اختر البنك" />
            </SelectTrigger>
            <SelectContent>
              {[...new Set(bankAccounts.map((ba: any) => ba.bank_name).filter(Boolean))].map(
                (name: string) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* تاريخ الاستحقاق (dd/mm/yyyy) */}
      <DateInputDMY
        value={cheque.date}
        onChange={(iso) => onUpdate(index, "date", iso)}
        onKeyDown={handleKeyDown}
        className="[&_input]:h-9 [&_input]:text-xs"
      />

      {/* المبلغ */}
      <Input
        type="number"
        value={cheque.amount as any}
        onChange={(e) => onUpdate(index, "amount", e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="0.00"
        className="h-9 text-xs font-mono"
      />

      {/* رقم حساب صاحب الشيك */}
      <Input
        value={cheque.accountNumber}
        onChange={(e) => onUpdate(index, "accountNumber", e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="رقم الحساب (اختياري)"
        className="h-9 text-xs font-mono"
      />

      {/* ملاحظات (popover) */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={cheque.notes || "إضافة ملاحظات"}
            className={cn(
              "h-9 w-9 rounded-md border border-border/60 flex items-center justify-center transition-colors",
              cheque.notes
                ? "bg-primary/10 text-primary border-primary/30"
                : "text-muted-foreground hover:bg-secondary/50",
            )}
          >
            <StickyNote className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="end">
          <Label className="text-xs font-semibold mb-1.5 block">ملاحظات الشيك</Label>
          <Input
            value={cheque.notes}
            onChange={(e) => onUpdate(index, "notes", e.target.value)}
            placeholder="ملاحظات اختيارية..."
            className="h-9 text-xs"
            autoFocus
          />
          <p className="text-[10px] text-muted-foreground mt-1.5">
            ستظهر هذه الملاحظة في سجل الشيك.
          </p>
        </PopoverContent>
      </Popover>

      {/* Delete */}
      <button
        type="button"
        onClick={() => onRemove(index)}
        title="حذف الشيك"
        className="h-8 w-8 rounded-md flex items-center justify-center text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
});

export default CompactChequeRow;