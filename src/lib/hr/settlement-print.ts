// Print helpers for HR: Settlement receipt & Experience certificate.
// Opens a new window with a self-contained printable HTML (Arabic RTL, A4).

type Company = { name?: string | null; address?: string | null; phone?: string | null; tax_number?: string | null };
type EmployeeLite = {
  full_name: string;
  department?: string | null;
  job_title?: string | null;
  start_date?: string | null;
  national_id?: string | null;
};

const fmtILS = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );

const money = (n: number) => fmtILS(Number(n || 0));

function baseHtml(title: string, body: string) {
  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: 'Cairo', 'Tajawal', Arial, sans-serif; color: #0f172a; }
  body { background: #fff; font-size: 12.5px; line-height: 1.65; }
  .page { max-width: 210mm; margin: 0 auto; padding: 12mm 10mm; }
  h1 { text-align:center; font-size:22px; margin: 6px 0 14px; letter-spacing:.5px; }
  h2 { font-size: 14px; margin: 14px 0 6px; border-bottom: 2px solid #0D1B2E; padding-bottom: 4px; color:#0D1B2E; }
  .muted { color: #64748b; }
  .hdr { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #0D1B2E; padding-bottom:8px; margin-bottom:12px; }
  .hdr .co { font-weight:800; font-size:16px; color:#0D1B2E; }
  .hdr .meta { text-align:left; font-size:11px; color:#475569; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:6px 18px; }
  .grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px 18px; }
  .box { border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#f8fafc; }
  table { width:100%; border-collapse:collapse; margin-top:6px; }
  th, td { border:1px solid #cbd5e1; padding:6px 8px; text-align:right; font-size:12px; }
  th { background:#0D1B2E; color:#fff; font-weight:600; }
  tr.total td { background:#f1f5f9; font-weight:700; }
  tr.grand td { background:#0D1B2E; color:#fff; font-weight:800; font-size:14px; }
  .sig { margin-top: 34px; display:grid; grid-template-columns:1fr 1fr; gap:40px; }
  .sig .line { border-top:1px solid #0f172a; padding-top:6px; text-align:center; font-size:12px; }
  .stamp { border:2px dashed #94a3b8; border-radius:8px; padding:16px; text-align:center; color:#64748b; margin-top:10px; }
  .footer { margin-top:22px; text-align:center; font-size:10.5px; color:#64748b; border-top:1px solid #e2e8f0; padding-top:8px; }
  p { text-align:justify; margin: 8px 0; }
  @media print { .noprint { display:none !important; } }
  .bar { position: fixed; top:10px; left:10px; z-index:9999; }
  .btn { background:#0D1B2E; color:#fff; border:none; padding:8px 14px; border-radius:6px; cursor:pointer; font-family:inherit; }
</style>
</head>
<body>
  <div class="bar noprint">
    <button class="btn" onclick="window.print()">طباعة / حفظ PDF</button>
  </div>
  <div class="page">${body}</div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 400));</script>
</body>
</html>`;
}

function header(company: Company, docTitle: string, docNumber?: string) {
  const today = new Date().toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" });
  return `
    <div class="hdr">
      <div>
        <div class="co">${company.name || "—"}</div>
        <div class="muted" style="font-size:11px">${company.address || ""}</div>
        <div class="muted" style="font-size:11px">${company.phone ? "هاتف: " + company.phone : ""} ${company.tax_number ? " · رقم مشتغل: " + company.tax_number : ""}</div>
      </div>
      <div class="meta">
        <div>${docTitle}</div>
        ${docNumber ? `<div><b>رقم: ${docNumber}</b></div>` : ""}
        <div>التاريخ: ${today}</div>
      </div>
    </div>`;
}

function footer() {
  return `<div class="footer">هذه الوثيقة صادرة إلكترونياً من نظام أموالي المحاسبي</div>`;
}

export function openSettlementPrint(args: {
  company: Company;
  employee: EmployeeLite;
  data: {
    id: string;
    termination_date: string;
    termination_reason_label: string;
    years_worked: number;
    severance_pay: number;
    unused_leave_pay: number;
    current_month_salary: number;
    advance_balance: number;
    other_deductions: number;
    total_dues: number;
    is_paid: boolean;
    paid_date: string | null;
    notes: string | null;
  };
}) {
  const { company, employee, data } = args;
  const gross =
    Number(data.severance_pay) + Number(data.unused_leave_pay) + Number(data.current_month_salary);
  const deductions = Number(data.advance_balance) + Number(data.other_deductions);

  const body = `
    ${header(company, "مخالصة نهاية خدمة", data.id.slice(0, 8).toUpperCase())}
    <h1>مخالصــة نهايــة خدمــة</h1>

    <div class="box">
      <div class="grid3">
        <div><b>اسم الموظف:</b> ${employee.full_name}</div>
        <div><b>المسمى الوظيفي:</b> ${employee.job_title || employee.department || "—"}</div>
        <div><b>رقم الهوية:</b> ${employee.national_id || "—"}</div>
        <div><b>تاريخ التعيين:</b> ${employee.start_date || "—"}</div>
        <div><b>تاريخ انتهاء الخدمة:</b> ${data.termination_date}</div>
        <div><b>مدة الخدمة:</b> ${Number(data.years_worked).toFixed(2)} سنة</div>
        <div><b>سبب انتهاء الخدمة:</b> ${data.termination_reason_label}</div>
        <div><b>الحالة:</b> ${data.is_paid ? "مدفوعة بتاريخ " + (data.paid_date || "") : "قيد الدفع"}</div>
      </div>
    </div>

    <h2>تفصيل المستحقات والخصومات</h2>
    <table>
      <thead>
        <tr><th style="width:60%">البيان</th><th style="width:20%">مدين (مستحق)</th><th style="width:20%">دائن (خصم)</th></tr>
      </thead>
      <tbody>
        <tr><td>راتب الشهر الأخير</td><td>${money(data.current_month_salary)}</td><td>—</td></tr>
        <tr><td>مكافأة نهاية الخدمة</td><td>${money(data.severance_pay)}</td><td>—</td></tr>
        <tr><td>بدل الإجازات غير المستنفدة</td><td>${money(data.unused_leave_pay)}</td><td>—</td></tr>
        <tr><td>سلف وقروض قائمة</td><td>—</td><td>${money(data.advance_balance)}</td></tr>
        <tr><td>خصومات أخرى</td><td>—</td><td>${money(data.other_deductions)}</td></tr>
        <tr class="total"><td>الإجمالي</td><td>${money(gross)}</td><td>${money(deductions)}</td></tr>
        <tr class="grand"><td>صافي المخالصة المستحقة للموظف</td><td colspan="2" style="text-align:center">${money(data.total_dues)}</td></tr>
      </tbody>
    </table>

    ${data.notes ? `<h2>ملاحظات</h2><p>${data.notes}</p>` : ""}

    <h2>إقرار وتوقيع</h2>
    <p>
      أُقرّ أنا الموقّع أدناه، <b>${employee.full_name}</b>، بأنني استلمت مبلغ
      <b>${money(data.total_dues)}</b> من شركة <b>${company.name || ""}</b>
      قيمة كامل مستحقاتي القانونية والمالية عن فترة عملي لديها المنتهية بتاريخ
      <b>${data.termination_date}</b>، ولا يحق لي مطالبة الشركة بأي مبالغ أخرى مهما كان نوعها،
      وذلك بموجب أحكام قانون العمل الفلسطيني رقم (7) لسنة 2000.
    </p>

    <div class="sig">
      <div class="line">توقيع الموظف<br/><span class="muted">${employee.full_name}</span></div>
      <div class="line">توقيع وختم الإدارة<br/><span class="muted">${company.name || ""}</span></div>
    </div>

    ${footer()}
  `;

  const w = window.open("", "_blank", "width=980,height=1000");
  if (!w) return;
  w.document.open();
  w.document.write(baseHtml("مخالصة نهاية خدمة - " + employee.full_name, body));
  w.document.close();
}

export function openExperienceCertificate(args: {
  company: Company;
  employee: EmployeeLite;
  endDate: string;
  gender?: "male" | "female";
  customText?: string;
}) {
  const { company, employee, endDate, gender = "male", customText } = args;
  const start = employee.start_date || "—";
  const title = employee.job_title || employee.department || "موظف";
  const worked = gender === "female" ? "عملت" : "عمل";
  const heShe = gender === "female" ? "لها" : "له";
  const during = gender === "female" ? "التزامها" : "التزامه";
  const perf = gender === "female" ? "أدائها" : "أدائه";
  const rel = gender === "female" ? "علاقتها" : "علاقته";

  const body = `
    ${header(company, "شهادة خبرة")}
    <h1>شهــادة خبــرة</h1>

    <p>
      تشهــد <b>${company.name || ""}</b> بأن <b>${employee.full_name}</b>
      قد <b>${worked}</b> لدينا بوظيفة <b>${title}</b> خلال الفترة الممتدة من
      <b>${start}</b> وحتى <b>${endDate}</b>.
    </p>

    ${
      customText
        ? `<p>${customText}</p>`
        : `<p>
            وقد أظهر/ت خلال فترة عمله/ا معنا كفاءةً عالية في ${perf}، وحُسنَ ${during} بمواعيد الدوام،
            وسلوكاً مهنياً راقياً في ${rel} مع الزملاء والإدارة.
          </p>
          <p>
            وقد أُصدرت ${heShe} هذه الشهادة بناءً على طلبه/ا لتقديمها للجهة المختصة،
            متمنّين ${heShe} دوام التوفيق والنجاح في مسيرته/ا المهنية.
          </p>`
    }

    <div class="sig">
      <div class="line">المدير المسؤول<br/><span class="muted">${company.name || ""}</span></div>
      <div class="stamp">مكان الختم الرسمي</div>
    </div>

    ${footer()}
  `;

  const w = window.open("", "_blank", "width=980,height=1000");
  if (!w) return;
  w.document.open();
  w.document.write(baseHtml("شهادة خبرة - " + employee.full_name, body));
  w.document.close();
}