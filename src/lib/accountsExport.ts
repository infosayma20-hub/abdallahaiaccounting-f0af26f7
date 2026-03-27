import * as XLSX from "xlsx";

interface Account {
  account_code: string;
  account_name: string;
  account_type: string;
  parent_code: string | null;
  description_ar?: string | null;
  sub_group_label?: string | null;
  is_system_protected?: boolean | null;
}

export const exportAccountsToExcel = (accounts: Account[], tenantName?: string) => {
  const rows = accounts
    .sort((a, b) => a.account_code.localeCompare(b.account_code))
    .map(acc => ({
      "رمز الحساب": acc.account_code,
      "اسم الحساب": acc.account_name,
      "نوع الحساب": acc.account_type,
      "حساب الأب": acc.parent_code ?? "",
      "الوصف": acc.description_ar ?? "",
      "المجموعة الفرعية": acc.sub_group_label ?? "",
      "محمي": acc.is_system_protected ? "نعم" : "لا",
    }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 14 }, { wch: 35 }, { wch: 16 }, { wch: 14 }, { wch: 45 }, { wch: 20 }, { wch: 10 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "شجرة الحسابات");

  const instructions = [
    ["تعليمات الاستيراد"],
    [""],
    ["1. لا تغير رمز أي حساب محمي (العمود الأخير = نعم)"],
    ["2. رمز حساب الأب: يجب أن يكون موجوداً في النظام"],
    ["3. لإضافة حسابات جديدة: استخدم أكواداً غير موجودة"],
    ["4. لا تحذف صفوف الحسابات المحمية"],
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  wsInstructions["!cols"] = [{ wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, "تعليمات");

  const fileName = `شجرة-الحسابات-${tenantName || "AMWALI"}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
};
