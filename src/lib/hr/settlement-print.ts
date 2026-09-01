// Print helpers for HR: Settlement receipt & Experience certificate.
// Opens a new window with a self-contained printable HTML (Arabic RTL, A4).

type Company = { name?: string | null; address?: string | null; phone?: string | null; tax_number?: string | null; logo_url?: string | null; licensed_dealer_number?: string | null };
type EmployeeLite = {
  full_name: string;
  department?: string | null;
  job_title?: string | null;
  start_date?: string | null;
  national_id?: string | null;
};

function shortId(id: string) {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

const fmtILS = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(
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
    ${company.logo_url ? `<div style="text-align:center;margin:0 0 10px"><img src="${company.logo_url}" alt="logo" style="max-height:110px;max-width:240px;object-fit:contain"/></div>` : ""}
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
  return `<div class="footer">هذه الوثيقة صادرة إلكترونياً من نظام يونيفاي المحاسبي</div>`;
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

/**
 * Shared "professional document" chrome — dark navy top band with centered
 * Arabic + English title, sub-header row with reference number and date,
 * plus an inline document body. Matches the Microsoft Dynamics / D365 look
 * used across FinanceShell pages.
 */
function docChrome(opts: {
  title: string;
  englishTitle: string;
  referenceNumber: string;
  dateLabel?: string;
  company: Company;
  body: string;
  /** إخفاء الشعار (يُستخدم عندما يوضع الشعار في ترويسة مخصصة أعلى الصفحة) */
  hideLogo?: boolean;
  /** إخفاء اسم الشركة من الشريط التعريفي */
  hideCompanyName?: boolean;
}) {
  const today = opts.dateLabel
    || new Date().toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "long", day: "2-digit" });
  return `
  <style>
    .doc-topbar { display:flex; justify-content:space-between; align-items:flex-start;
      padding: 0 4px 10px; margin-bottom: 18px; font-size:11px; color:#475569; }
    .doc-topbar .co { font-weight:800; font-size:14px; color:#0D1B2E; }
    .doc-topbar .meta-title { font-weight:700; color:#0f172a; font-size:12px; }
    .doc-topbar .ref { font-family: 'Courier New', monospace; font-weight:700; color:#0D1B2E; }
    .doc-title { text-align:center; margin: 6px 0 22px; }
    .doc-title .ar { font-size:22px; font-weight:800; letter-spacing:4px; color:#0f172a; }
    .doc-title .en { margin-top:4px; font-size:10px; letter-spacing:2px; color:#94a3b8; text-transform:uppercase; }
    .doc-title .rule { width:64px; height:2px; background:#0D1B2E; margin:10px auto 0; }
    .doc-body { padding: 0 4px; }
  </style>
  ${!opts.hideLogo && opts.company.logo_url ? `<div style="text-align:center;margin:0 0 14px"><img src="${opts.company.logo_url}" alt="logo" style="max-height:100px;max-width:220px;object-fit:contain"/></div>` : ""}
  <div class="doc-topbar">
    <div>
      ${!opts.hideCompanyName ? `<div class="co">${opts.company.name || ""}</div>` : ""}
      <div>${opts.company.address || ""}</div>
    </div>
    <div style="text-align:left">
      <div class="meta-title">${opts.englishTitle}</div>
      <div>الرقم المرجعي: <span class="ref">${opts.referenceNumber}</span></div>
      <div>التاريخ: <b>${today}</b></div>
    </div>
  </div>
  <div class="doc-title">
    <div class="ar">${opts.title}</div>
    <div class="rule"></div>
  </div>
  <div class="doc-body">${opts.body}</div>`;
}

/**
 * كتاب إثبات عمل — Employment Verification Letter.
 * تصميم مصمم على نفس نمط FinanceShell (شريط علوي كحلي + سطر تعريفي).
 */
export function openEmploymentVerificationLetter(args: {
  company: Company;
  employee: EmployeeLite & { base_salary?: number | null; is_active?: boolean };
  addressee?: string;
  purpose?: string;
}) {
  const { company, employee } = args;
  const addressee = args.addressee || "إلى من يهمه الأمر";
  const ref = "EMP-" + new Date().getFullYear() + "-" + shortId(String(employee.national_id || employee.full_name));
  const salaryLine = employee.base_salary
    ? `<div><span class="muted">الراتب الأساسي:</span> <b>${money(Number(employee.base_salary))}</b></div>`
    : "";
  const infoRows = `
    <div class="info">
      <div class="row"><span class="k">الاسم</span><span class="v"><b>${employee.full_name}</b></span></div>
      <div class="row"><span class="k">رقم الهوية</span><span class="v">${employee.national_id || "—"}</span></div>
      <div class="row"><span class="k">المسمى الوظيفي</span><span class="v">${employee.job_title || "—"}</span></div>
      <div class="row"><span class="k">القسم</span><span class="v">${employee.department || "—"}</span></div>
      <div class="row"><span class="k">تاريخ الالتحاق بالعمل</span><span class="v">${employee.start_date || "—"}</span></div>
      ${employee.base_salary ? `<div class="row"><span class="k">الراتب الأساسي</span><span class="v"><b>${money(Number(employee.base_salary))}</b></span></div>` : ""}
      <div class="row"><span class="k">حالة العمل</span><span class="v"><b style="color:#065f46">على رأس العمل</b></span></div>
    </div>
    <style>
      .info { border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; margin: 10px 0 16px; }
      .info .row { display:grid; grid-template-columns: 160px 1fr; padding:9px 14px; border-top:1px solid #f1f5f9; background:#fff; }
      .info .row:first-child { border-top:none; }
      .info .row:nth-child(even) { background:#f8fafc; }
      .info .k { color:#64748b; font-size:12px; }
      .info .v { font-size:12.5px; color:#0f172a; }
    </style>`;

  const letterheadTop = `
    <style>
      .mlk-head { text-align:center; margin: 0 0 6px; }
      .mlk-head .co-ar { font-size:22px; font-weight:800; color:#2E75B6; margin-top:6px; }
      .mlk-head .rule { height:3px; background:#2E75B6; margin:8px 0 0; border-radius:2px; }
      .mlk-foot { margin-top:26px; }
      .mlk-foot .rule { height:4px; background:linear-gradient(90deg,#2E75B6,#9DC3E6); border-radius:2px; }
      .mlk-foot .contacts { display:flex; flex-wrap:wrap; justify-content:center; gap:14px;
        margin-top:8px; font-size:11px; color:#2E75B6; font-weight:700; }
      .mlk-foot .contacts span::before { content:"📍 "; }
      .mlk-foot .contacts span.tel::before { content:"📞 "; }
    </style>
    <div class="mlk-head">
      ${company.logo_url ? `<div style="margin:0 0 4px"><img src="${company.logo_url}" alt="شعار الشركة" style="max-height:100px;max-width:220px;object-fit:contain"/></div>` : ""}
      <div class="co-ar">شركة مطاعم الدجاج الملكي</div>
      ${company.licensed_dealer_number ? `<div style="font-size:11.5px; color:#334155; font-weight:700; margin-top:2px;">رقم المشتغل المرخص: ${company.licensed_dealer_number}</div>` : ""}
      <div class="rule"></div>
    </div>`;

  const letterheadBottom = `
    <div class="mlk-foot">
      <div class="rule"></div>
      <div class="contacts">
        <span>نابلس شارع سفيان</span>
        <span>نابلس شارع فيصل</span>
        <span>رام الله الطيرة</span>
        <span>البيرة بلازا مول</span>
        <span class="tel">1700250250</span>
      </div>
    </div>`;

  const body = letterheadTop + docChrome({
    company,
    title: "كتاب إثبات عمل",
    englishTitle: "Employment Verification Letter",
    referenceNumber: ref,
    body: `
      <p style="text-align:center; font-weight:700; font-size:14px; margin: 4px 0 14px; text-decoration: underline;">${addressee}</p>
      <p>السلام عليكم ورحمة الله وبركاته،</p>
      <p>نشهد نحن إدارة الموارد البشرية في <b>${company.name || ""}</b> بأن الموظف/ة المذكور بياناته أدناه يعمل لدينا،
         وقد صدر هذا الكتاب بناءً على طلبه دون أدنى مسؤولية على الشركة.</p>
      ${infoRows}
      <p>${args.purpose || "وقد أُعطي هذا الكتاب بناءً على طلبه لاستخدامه في الأغراض الرسمية التي يحتاجها، دون أن يترتب على ذلك أي التزامات مالية أو قانونية على الشركة."}</p>
      <p>وتفضلوا بقبول فائق الاحترام والتقدير،،،</p>
      ${letterheadBottom}
      ${footer()}
    `,
  });


  const w = window.open("", "_blank", "width=980,height=1000");
  if (!w) return;
  w.document.open();
  w.document.write(baseHtml("كتاب إثبات عمل - " + employee.full_name, body));
  w.document.close();
}

/**
 * قسيمة راتب — Salary Slip.
 * ملاحظة: نستخدم بيانات المخالصة كمصدر للمبالغ عند الطباعة من قائمة المخالصات
 * (راتب أساسي/بدلات/خصومات/صافي).
 */
export function openSalarySlip(args: {
  company: Company;
  employee: EmployeeLite;
  period: string;                  // "يوليو 2026"
  issueDate?: string;              // ISO date
  paidDate?: string | null;
  isPaid?: boolean;
  basicSalary: number;
  allowances?: number;
  deductions?: number;
  net: number;
}) {
  const { company, employee } = args;
  const allowances = Number(args.allowances || 0);
  const deductions = Number(args.deductions || 0);
  const issue = args.issueDate
    ? new Date(args.issueDate).toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" })
    : new Date().toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" });
  const paid = args.paidDate
    ? new Date(args.paidDate).toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" })
    : "—";
  const ref = "PAY-" + new Date().getFullYear() + "-" + shortId(String(employee.full_name + args.period));

  const body = docChrome({
    company,
    title: "قسيمة راتب",
    englishTitle: "Salary Slip · " + args.period,
    referenceNumber: ref,
    body: `
      <style>
        .slip-status { display:inline-block; padding:4px 12px; border-radius:999px; font-size:11px; font-weight:700; }
        .slip-status.paid { background:#dcfce7; color:#166534; }
        .slip-status.pending { background:#fef3c7; color:#92400e; }
        .slip-header { display:grid; grid-template-columns: 1fr 1fr; gap:0; border:1px solid #e2e8f0; border-radius:6px; overflow:hidden; margin-bottom:14px; }
        .slip-header > div { padding:10px 14px; background:#fff; }
        .slip-header > div + div { border-right:1px solid #e2e8f0; }
        .slip-header .lbl { color:#64748b; font-size:11px; margin-bottom:3px; }
        .slip-header .val { font-size:13px; font-weight:700; color:#0f172a; }
        .slip-table { width:100%; border-collapse:collapse; border:1px solid #e2e8f0; border-radius:6px; overflow:hidden; }
        .slip-table th { background:#f1f5f9; color:#0D1B2E; text-align:right; padding:10px 14px; font-size:12px; font-weight:700; }
        .slip-table td { padding:12px 14px; border-top:1px solid #f1f5f9; font-size:13px; }
        .slip-table td.amount { text-align:center; font-family:'Courier New', monospace; font-weight:700; }
        .slip-table tr.net td { background:#eff6ff; font-size:14px; color:#0D1B2E; font-weight:800; border-top:2px solid #0D1B2E; }
        .slip-table tr.net td.amount { color:#0D1B2E; font-size:15px; }
        .neg { color:#b91c1c; }
      </style>
      <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
        <span class="slip-status ${args.isPaid ? "paid" : "pending"}">${args.isPaid ? "مدفوع" : "قيد الدفع"}</span>
      </div>
      <div class="slip-header">
        <div>
          <div class="lbl">الموظف</div>
          <div class="val">${employee.full_name}</div>
        </div>
        <div>
          <div class="lbl">الفترة</div>
          <div class="val">${args.period}</div>
        </div>
        <div>
          <div class="lbl">تاريخ الإصدار</div>
          <div class="val">${issue}</div>
        </div>
        <div>
          <div class="lbl">تاريخ الدفع</div>
          <div class="val">${paid}</div>
        </div>
      </div>
      <table class="slip-table">
        <thead><tr><th>البند</th><th style="text-align:center; width:35%">المبلغ (₪)</th></tr></thead>
        <tbody>
          <tr><td>الراتب الأساسي</td><td class="amount">${money(Number(args.basicSalary))}</td></tr>
          <tr><td>البدلات</td><td class="amount">${money(allowances)}</td></tr>
          <tr><td>الخصومات</td><td class="amount neg">− ${money(deductions)}</td></tr>
          <tr class="net"><td>صافي الراتب</td><td class="amount">${money(Number(args.net))}</td></tr>
        </tbody>
      </table>
      <div class="sig">
        <div class="line">توقيع الموظف<br/><span class="muted">${employee.full_name}</span></div>
        <div class="line">توقيع الموارد البشرية<br/><span class="muted">${company.name || ""}</span></div>
      </div>
      ${footer()}
    `,
  });

  const w = window.open("", "_blank", "width=980,height=1000");
  if (!w) return;
  w.document.open();
  w.document.write(baseHtml("قسيمة راتب - " + employee.full_name + " · " + args.period, body));
  w.document.close();
}