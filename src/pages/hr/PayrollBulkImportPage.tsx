import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { ArrowRight, Download, Upload, Save, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { fetchAllAccountsForOwner } from "@/lib/fetchAllAccounts";
import { useToast } from "@/hooks/use-toast";

type Emp = {
  id: string;
  full_name: string;
  employee_number: string | null;
  base_salary: number | null;
  department: string | null;
  is_active: boolean | null;
};

type Account = {
  account_code: string;
  account_name: string;
  account_type: string;
  parent_code: string | null;
  is_active?: boolean | null;
};

type Row = {
  employee_id: string;
  employee_number: string | null;
  full_name: string;
  amount: number;
};

const EMPLOYEE_LIABILITY_PARENT = "2130"; // الرواتب المستحقة

export default function PayrollBulkImportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const { toast } = useToast();

  const [employees, setEmployees] = useState<Emp[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const [debitAccount, setDebitAccount] = useState<string>("");
  const [txDate, setTxDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState<string>(
    `رواتب شهر ${new Date().toLocaleDateString("ar-EG", { month: "long", year: "numeric" })}`
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [posting, setPosting] = useState(false);
  const [postedRef, setPostedRef] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dataOwnerId) return;
    (async () => {
      setLoading(true);
      try {
        const [empRes, accs] = await Promise.all([
          supabase
            .from("employees")
            .select("id, full_name, employee_number, base_salary, department, is_active")
            .eq("user_id", dataOwnerId)
            .eq("is_active", true)
            .eq("is_terminated", false)
            .order("full_name", { ascending: true }),
          fetchAllAccountsForOwner<Account>(
            dataOwnerId,
            "account_code, account_name, account_type, parent_code, is_active",
            { activeOnly: true }
          ),
        ]);
        if (empRes.error) throw empRes.error;
        setEmployees((empRes.data as any) || []);
        setAccounts(accs || []);
      } catch (e: any) {
        toast({ title: "خطأ في التحميل", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [dataOwnerId, toast]);

  // Leaf expense accounts (no children) — for the debit picker
  const debitOptions = useMemo(() => {
    const codes = new Set(accounts.map((a) => a.account_code));
    const hasChildren = new Set(accounts.map((a) => a.parent_code).filter(Boolean) as string[]);
    return accounts
      .filter((a) => a.account_code.startsWith("5"))
      .filter((a) => !hasChildren.has(a.account_code))
      .filter((a) => codes.has(a.account_code))
      .sort((a, b) => a.account_code.localeCompare(b.account_code));
  }, [accounts]);

  const totalAmount = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const validRows = rows.filter((r) => r.amount > 0);

  const downloadTemplate = () => {
    const data = employees.map((e) => ({
      "رقم الموظف": e.employee_number || "",
      "اسم الموظف": e.full_name,
      "القسم": e.department || "",
      "الراتب الأساسي (مرجعي)": Number(e.base_salary || 0),
      "الراتب المثبت": "", // to be filled by accountant
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 14 }, { wch: 32 }, { wch: 18 }, { wch: 20 }, { wch: 18 }];

    const notes = [
      ["تعليمات:"],
      ["1. لا تغيّر ترتيب أو أسماء الأعمدة."],
      ["2. عبّي عمود «الراتب المثبت» فقط للموظفين المراد تثبيت رواتبهم."],
      ["3. الموظفون بدون قيمة في «الراتب المثبت» أو بقيمة صفر لن يُثبَّت لهم قيد."],
      ["4. لا تحذف عمود «اسم الموظف» أو «رقم الموظف» — يُستخدمان للربط."],
      ["5. يمكنك حذف صفوف الموظفين اللي مش رح تثبتلهم رواتب."],
    ];
    const wsN = XLSX.utils.aoa_to_sheet(notes);
    wsN["!cols"] = [{ wch: 80 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الرواتب");
    XLSX.utils.book_append_sheet(wb, wsN, "تعليمات");
    XLSX.writeFile(wb, `قالب-رواتب-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const byNumber = new Map(employees.filter((e) => e.employee_number).map((e) => [String(e.employee_number).trim(), e]));
      const byName = new Map(employees.map((e) => [e.full_name.trim(), e]));

      const parsed: Row[] = [];
      const unmatched: string[] = [];
      for (const r of json) {
        const num = String(r["رقم الموظف"] ?? "").trim();
        const name = String(r["اسم الموظف"] ?? "").trim();
        const amtRaw = r["الراتب المثبت"];
        const amt = Number(amtRaw);
        if (!name && !num) continue;
        if (!amtRaw || isNaN(amt) || amt <= 0) continue;
        const emp = (num && byNumber.get(num)) || byName.get(name);
        if (!emp) {
          unmatched.push(name || num);
          continue;
        }
        parsed.push({
          employee_id: emp.id,
          employee_number: emp.employee_number,
          full_name: emp.full_name,
          amount: amt,
        });
      }
      setRows(parsed);
      if (unmatched.length) {
        toast({
          title: "بعض الموظفين غير مطابقين",
          description: `تم تجاهل: ${unmatched.slice(0, 5).join("، ")}${unmatched.length > 5 ? "..." : ""}`,
          variant: "destructive",
        });
      } else {
        toast({ title: "تم قراءة الملف", description: `${parsed.length} موظف جاهز للتثبيت` });
      }
    } catch (e: any) {
      toast({ title: "خطأ في قراءة الملف", description: e.message, variant: "destructive" });
    }
  };

  const ensureEmployeeAccount = async (emp: Row): Promise<string> => {
    // Look for existing sub-account under 2130 for this employee
    const suffix = (emp.employee_number || emp.employee_id.slice(0, 8)).toString().trim();
    const desiredCode = `${EMPLOYEE_LIABILITY_PARENT}-${suffix}`;

    // 1) Try desired code
    const { data: exists } = await supabase
      .from("accounts")
      .select("account_code, account_name, parent_code")
      .eq("user_id", dataOwnerId!)
      .eq("account_code", desiredCode)
      .maybeSingle();
    if (exists) return exists.account_code;

    // 2) Try match by name under 2130
    const { data: byName } = await supabase
      .from("accounts")
      .select("account_code")
      .eq("user_id", dataOwnerId!)
      .eq("parent_code", EMPLOYEE_LIABILITY_PARENT)
      .ilike("account_name", `%${emp.full_name}%`)
      .maybeSingle();
    if (byName?.account_code) return byName.account_code;

    // 3) Create new sub-account
    const { error: insErr } = await supabase.from("accounts").insert({
      user_id: dataOwnerId!,
      account_code: desiredCode,
      account_name: `راتب مستحق - ${emp.full_name}`,
      account_type: "الخصوم",
      parent_code: EMPLOYEE_LIABILITY_PARENT,
      is_active: true,
      nature: "credit",
    } as any);
    if (insErr) throw new Error(`تعذر إنشاء حساب الموظف ${emp.full_name}: ${insErr.message}`);
    return desiredCode;
  };

  const postJournal = async () => {
    if (!user?.id || !dataOwnerId) return;
    if (!debitAccount) {
      toast({ title: "اختر حساب مصروف الرواتب", variant: "destructive" });
      return;
    }
    if (validRows.length === 0) {
      toast({ title: "لا توجد أسطر صالحة للتثبيت", variant: "destructive" });
      return;
    }
    setPosting(true);
    try {
      const ref = `PAYROLL-${txDate.replace(/-/g, "")}-${Date.now().toString().slice(-6)}`;
      const inserts: any[] = [];
      for (const r of validRows) {
        const credCode = await ensureEmployeeAccount(r);
        inserts.push({
          user_id: dataOwnerId,
          transaction_date: txDate,
          description: `${description} - ${r.full_name}`,
          debit_account_code: debitAccount,
          credit_account_code: credCode,
          amount: r.amount,
          currency: "ILS",
          transaction_type: "قيد يومية",
          reference: ref,
          is_opening_balance: false,
          is_deleted: false,
        });
      }
      // Insert in chunks
      for (let i = 0; i < inserts.length; i += 100) {
        const { error } = await supabase.from("transactions").insert(inserts.slice(i, i + 100));
        if (error) throw error;
      }
      setPostedRef(ref);
      toast({ title: "تم تثبيت قيد الرواتب", description: `مرجع: ${ref} — ${validRows.length} موظف` });
    } catch (e: any) {
      toast({ title: "فشل التثبيت", description: e.message, variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  const fmt = (n: number) => `₪ ${n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="max-w-[1200px] mx-auto p-4 space-y-4" dir="rtl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => (window.history.length > 2 ? navigate(-1) : navigate("/payroll"))}
          className="p-2 rounded-xl hover:bg-muted"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold">تثبيت الرواتب دفعة واحدة (Excel)</h1>
          <p className="text-xs text-muted-foreground">
            حمّل قالب الرواتب، عبّي المبالغ، ارفعه، وثبّت قيد واحد مركّب لكل الموظفين.
          </p>
        </div>
      </div>

      {postedRef && (
        <Card className="p-4 border-emerald-500/40 bg-emerald-50 dark:bg-emerald-900/20 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div className="flex-1">
            <p className="font-bold text-emerald-800 dark:text-emerald-300">تم تثبيت القيد بنجاح</p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              المرجع: <span className="font-mono">{postedRef}</span> — {validRows.length} موظف — الإجمالي:{" "}
              {fmt(totalAmount)}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRows([]);
              setPostedRef(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            تثبيت شهر جديد
          </Button>
        </Card>
      )}

      {/* Step 1: Settings */}
      <Card className="p-4 space-y-3">
        <h2 className="font-bold text-sm">1. إعدادات القيد</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>حساب مصروف الرواتب (مدين)</Label>
            <Select value={debitAccount} onValueChange={setDebitAccount} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="اختر حساب المصروف" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {debitOptions.map((a) => (
                  <SelectItem key={a.account_code} value={a.account_code}>
                    {a.account_code} — {a.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              الطرف الدائن: حساب فرعي تحت 2130 لكل موظف (يُنشأ تلقائياً)
            </p>
          </div>
          <div>
            <Label>تاريخ القيد</Label>
            <Input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
          </div>
          <div>
            <Label>وصف القيد</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={1}
              className="min-h-[40px]"
            />
          </div>
        </div>
      </Card>

      {/* Step 2: Template + Upload */}
      <Card className="p-4 space-y-3">
        <h2 className="font-bold text-sm">2. القالب والرفع</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadTemplate} disabled={loading || employees.length === 0}>
            <Download className="h-4 w-4 ml-1" />
            تحميل قالب Excel ({employees.length} موظف)
          </Button>
          <Button onClick={() => fileRef.current?.click()} disabled={loading}>
            <Upload className="h-4 w-4 ml-1" />
            رفع الملف المعبأ
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
      </Card>

      {/* Step 3: Preview */}
      {rows.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm">3. معاينة القيد ({validRows.length} موظف)</h2>
            <div className="text-sm">
              الإجمالي: <span className="font-bold">{fmt(totalAmount)}</span>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto border rounded">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 text-right">رقم الموظف</th>
                  <th className="p-2 text-right">الموظف</th>
                  <th className="p-2 text-right">حساب دائن (يُنشأ إن لم يوجد)</th>
                  <th className="p-2 text-left">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {validRows.map((r) => (
                  <tr key={r.employee_id} className="border-t">
                    <td className="p-2">{r.employee_number || "—"}</td>
                    <td className="p-2">{r.full_name}</td>
                    <td className="p-2 font-mono text-[10px] text-muted-foreground">
                      {EMPLOYEE_LIABILITY_PARENT}-{(r.employee_number || r.employee_id.slice(0, 8)).toString().trim()}
                    </td>
                    <td className="p-2 text-left font-bold">{fmt(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted sticky bottom-0">
                <tr>
                  <td className="p-2 font-bold" colSpan={3}>
                    مدين: {debitAccount || "—"} (إجمالي)
                  </td>
                  <td className="p-2 text-left font-bold">{fmt(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex justify-end">
            <Button onClick={postJournal} disabled={posting || !debitAccount || !!postedRef} size="lg">
              {posting ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Save className="h-4 w-4 ml-1" />}
              تثبيت القيد ({validRows.length} سطر)
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
