import { useEffect, useState } from "react";
import { FileSignature } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { openEmploymentVerificationLetter, type EmploymentLetterLanguage } from "@/lib/hr/settlement-print";

export type EmploymentLetterTarget = {
  id?: string;
  full_name: string;
  department?: string | null;
  job_title?: string | null;
  start_date?: string | null;
  national_id?: string | null;
  base_salary?: number | null;
  is_active?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Record<string, any>;
  employee: EmploymentLetterTarget | null;
  /** يُستدعى بعد فتح الكتاب للطباعة (لتسجيل التوثيق) */
  onPrinted?: () => void;
};

/**
 * خيارات كتاب إثبات العمل قبل الطباعة:
 * لغة الكتاب (عربي/إنجليزي/الاثنين)، الجهة الموجّه إليها، وقيمة الراتب الأساسي المعروضة.
 * كل التعديلات هنا تخص الطباعة فقط — لا تُحفظ على بيانات الموظف.
 */
export default function EmploymentLetterDialog({ open, onOpenChange, company, employee, onPrinted }: Props) {
  const [language, setLanguage] = useState<EmploymentLetterLanguage>("ar");
  const [addressee, setAddressee] = useState("إلى من يهمه الأمر");
  const [addresseeEn, setAddresseeEn] = useState("To Whom It May Concern");
  const [nameEn, setNameEn] = useState("");
  const [showSalary, setShowSalary] = useState(true);
  const [salary, setSalary] = useState("");
  const [purpose, setPurpose] = useState("");

  useEffect(() => {
    if (!open || !employee) return;
    setLanguage("ar");
    setAddressee("إلى من يهمه الأمر");
    setAddresseeEn("To Whom It May Concern");
    setNameEn("");
    const base = employee.base_salary != null ? Number(employee.base_salary) : 0;
    setShowSalary(base > 0);
    setSalary(base > 0 ? String(base) : "");
    setPurpose("");
  }, [open, employee]);

  const print = () => {
    if (!employee) return;
    const parsed = Number(String(salary).replace(/,/g, ""));
    openEmploymentVerificationLetter({
      company: company || {},
      employee: {
        full_name: employee.full_name,
        department: employee.department ?? null,
        job_title: employee.job_title ?? null,
        start_date: employee.start_date ?? null,
        national_id: employee.national_id ?? null,
        base_salary: employee.base_salary ?? null,
        is_active: employee.is_active,
      },
      language,
      addressee,
      addresseeEn,
      fullNameEn: nameEn,
      showSalary,
      baseSalaryOverride: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
      purpose: purpose.trim() || undefined,
      purposeEn: language !== "ar" && purpose.trim() ? purpose.trim() : undefined,
    });
    onOpenChange(false);
    onPrinted?.();
  };

  const showEnglishFields = language !== "ar";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-indigo-600" /> كتاب إثبات عمل
          </DialogTitle>
          <DialogDescription className="text-xs">
            {employee?.full_name} — هذه الخيارات تخص الطباعة فقط ولا تُعدّل بيانات الموظف.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">لغة الكتاب</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as EmploymentLetterLanguage)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ar">عربي</SelectItem>
                <SelectItem value="en">إنجليزي</SelectItem>
                <SelectItem value="both">عربي + إنجليزي (صفحتان)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {language !== "en" && (
            <div>
              <Label className="text-xs">الجهة الموجّه إليها</Label>
              <Input value={addressee} onChange={(e) => setAddressee(e.target.value)} placeholder="مثال: بنك فلسطين — فرع نابلس" className="mt-1" />
            </div>
          )}

          {showEnglishFields && (
            <>
              <div>
                <Label className="text-xs">الجهة بالإنجليزي</Label>
                <Input dir="ltr" value={addresseeEn} onChange={(e) => setAddresseeEn(e.target.value)} placeholder="Bank of Palestine — Nablus Branch" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">اسم الموظف بالإنجليزي (اختياري)</Label>
                <Input dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Employee full name in English" className="mt-1" />
              </div>
            </>
          )}

          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <Label className="text-xs">إظهار الراتب الأساسي في الكتاب</Label>
            <Switch checked={showSalary} onCheckedChange={setShowSalary} />
          </div>

          {showSalary && (
            <div>
              <Label className="text-xs">قيمة الراتب الأساسي المعروضة (₪)</Label>
              <Input type="number" inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="0" className="mt-1" />
            </div>
          )}

          <div>
            <Label className="text-xs">الغرض من الكتاب (اختياري)</Label>
            <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="يترك فارغاً للنص الافتراضي" className="mt-1 min-h-[64px]" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={print} className="gap-1.5">
            <FileSignature className="h-3.5 w-3.5" /> طباعة الكتاب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
