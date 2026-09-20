import type { CSSProperties, ReactNode } from "react";

export type PrintableJobApplication = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  national_id: string | null;
  gender: string | null;
  birth_date: string | null;
  birth_place: string | null;
  marital_status: string | null;
  children_count: number | null;
  address: string | null;
  desired_position: string | null;
  education: unknown;
  courses: unknown;
  languages: unknown;
  experience: unknown;
  referees: unknown;
  shift_preference: string | null;
  job_type: string | null;
  work_location: string | null;
  preferred_city: string | null;
  smoker: boolean | null;
  works_friday: boolean | null;
  works_holidays: boolean | null;
  has_driving_license: boolean | null;
  driving_license_type: string | null;
  notes: string | null;
  attachment_path: string | null;
  custom_answers: unknown;
  status: string;
  review_notes: string | null;
  created_at: string;
};

type CustomAnswer = { id?: string; label?: string; value?: string };

const NAVY = "#163B63";
const GOLD = "#B58A2A";
const INK = "#172033";
const MUTED = "#697386";
const LINE = "#D9E0E8";
const SOFT = "#F4F7FA";

const styles: Record<string, CSSProperties> = {
  page: { direction: "rtl", color: INK, fontFamily: "Cairo, system-ui, sans-serif", fontSize: 11, lineHeight: 1.55 },
  topRule: { height: 5, background: NAVY, marginBottom: 14 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, borderBottom: `1px solid ${LINE}`, paddingBottom: 13 },
  identity: { display: "flex", alignItems: "center", gap: 13 },
  logo: { width: 76, height: 76, objectFit: "contain" },
  title: { fontSize: 22, lineHeight: 1.25, fontWeight: 800, color: NAVY, margin: 0 },
  subtitle: { color: MUTED, fontSize: 10.5, marginTop: 4 },
  photo: { width: 92, height: 108, objectFit: "cover", borderRadius: 5, border: `1px solid ${LINE}` },
  photoEmpty: { width: 92, height: 108, borderRadius: 5, border: `1px dashed ${LINE}`, background: SOFT, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 9 },
  meta: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: `1px solid ${LINE}`, borderRadius: 5, overflow: "hidden", marginTop: 12 },
  metaItem: { padding: "7px 10px", borderLeft: `1px solid ${LINE}`, background: SOFT },
  label: { color: MUTED, fontSize: 9, marginBottom: 1 },
  value: { fontWeight: 700, overflowWrap: "anywhere" },
  section: { marginTop: 13, breakInside: "avoid", pageBreakInside: "avoid" },
  sectionTitle: { color: NAVY, fontSize: 12, fontWeight: 800, borderRight: `4px solid ${GOLD}`, paddingRight: 7, marginBottom: 6 },
  grid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", border: `1px solid ${LINE}`, borderRadius: 5, overflow: "hidden" },
  field: { minHeight: 41, padding: "6px 9px", borderBottom: `1px solid ${LINE}` },
  note: { padding: "8px 10px", border: `1px solid ${LINE}`, borderRadius: 5, background: SOFT, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  footer: { display: "flex", justifyContent: "space-between", gap: 12, color: MUTED, fontSize: 8.5, borderTop: `1px solid ${LINE}`, paddingTop: 6, marginTop: 16 },
};

const text = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
};

const yesNo = (value: boolean | null): string => value === null ? "—" : value ? "نعم" : "لا";

function Field({ label, value }: { label: string; value: unknown }) {
  return <div style={styles.field}><div style={styles.label}>{label}</div><div style={styles.value}>{text(value)}</div></div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section style={styles.section}><div style={styles.sectionTitle}>{title}</div>{children}</section>;
}

function DataTable({ rows, columns }: { rows: unknown; columns: Array<[string, string]> }) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return <div style={styles.note}>لا توجد بيانات مسجلة</div>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${LINE}`, fontSize: 9.5 }}>
      <thead>
        <tr style={{ background: NAVY, color: "#FFFFFF" }}>
          {columns.map(([key, label]) => <th key={key} style={{ padding: "6px 7px", textAlign: "right", fontWeight: 700 }}>{label}</th>)}
        </tr>
      </thead>
      <tbody>
        {list.map((row: Record<string, unknown>, index: number) => (
          <tr key={index} style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
            {columns.map(([key]) => <td key={key} style={{ padding: "6px 7px", borderBottom: `1px solid ${LINE}`, verticalAlign: "top" }}>{text(row?.[key])}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function JobApplicationPrintDocument({
  application,
  photoUrl,
  logoUrl,
  statusLabel,
  formattedCreatedAt,
}: {
  application: PrintableJobApplication;
  photoUrl?: string;
  logoUrl: string;
  statusLabel: string;
  formattedCreatedAt: string;
}) {
  const customAnswers = Array.isArray(application.custom_answers)
    ? (application.custom_answers as CustomAnswer[]).filter((answer) => answer?.label && answer?.value)
    : [];

  return (
    <article style={styles.page}>
      <div style={styles.topRule} />
      <header style={styles.header}>
        <div style={styles.identity}>
          <img src={logoUrl} alt="شعار الشركة" style={styles.logo} />
          <div>
            <h1 style={styles.title}>طلب توظيف</h1>
            <div style={styles.subtitle}>نموذج بيانات المتقدم للوظيفة</div>
            <div style={{ ...styles.subtitle, color: GOLD, fontWeight: 700 }}>إدارة الموارد البشرية</div>
          </div>
        </div>
        {photoUrl
          ? <img src={photoUrl} alt={`صورة المتقدم ${application.full_name}`} style={styles.photo} />
          : <div style={styles.photoEmpty}>لا توجد<br />صورة شخصية</div>}
      </header>

      <div style={styles.meta}>
        <div style={styles.metaItem}><div style={styles.label}>اسم المتقدم</div><div style={styles.value}>{application.full_name}</div></div>
        <div style={styles.metaItem}><div style={styles.label}>حالة الطلب</div><div style={{ ...styles.value, color: NAVY }}>{statusLabel}</div></div>
        <div style={{ ...styles.metaItem, borderLeft: 0 }}><div style={styles.label}>تاريخ التقديم</div><div style={styles.value}>{formattedCreatedAt}</div></div>
      </div>

      <Section title="البيانات الشخصية وبيانات التواصل">
        <div style={styles.grid}>
          <Field label="الوظيفة المطلوبة" value={application.desired_position} />
          <Field label="رقم الهوية" value={application.national_id} />
          <Field label="رقم الهاتف" value={application.phone} />
          <Field label="البريد الإلكتروني" value={application.email} />
          <Field label="الجنس" value={application.gender} />
          <Field label="تاريخ الميلاد" value={application.birth_date} />
          <Field label="مكان الولادة / السكن" value={application.birth_place} />
          <Field label="العنوان" value={application.address} />
          <Field label="الحالة الاجتماعية" value={application.marital_status} />
          <Field label="عدد الأولاد" value={application.children_count} />
        </div>
      </Section>

      <Section title="تفضيلات وظروف العمل">
        <div style={styles.grid}>
          <Field label="فترة الدوام" value={application.shift_preference} />
          <Field label="طبيعة التعاقد" value={application.job_type} />
          <Field label="موقع العمل" value={application.work_location} />
          <Field label="المدينة المفضلة للعمل" value={application.preferred_city} />
          <Field label="التدخين" value={application.smoker === null ? null : application.smoker ? "مدخن" : "غير مدخن"} />
          <Field label="العمل يوم الجمعة" value={yesNo(application.works_friday)} />
          <Field label="العمل في الأعياد والمناسبات" value={yesNo(application.works_holidays)} />
          <Field label="رخصة القيادة" value={application.has_driving_license ? `نعم${application.driving_license_type ? ` — ${application.driving_license_type}` : ""}` : yesNo(application.has_driving_license)} />
        </div>
      </Section>

      <Section title="المؤهلات العلمية"><DataTable rows={application.education} columns={[["degree", "الدرجة"], ["major", "التخصص"], ["place", "المكان"], ["from", "من"], ["to", "إلى"]]} /></Section>
      <Section title="البرامج التدريبية"><DataTable rows={application.courses} columns={[["name", "الدورة"], ["org", "المؤسسة"], ["hours", "الساعات"], ["year", "السنة"], ["from", "من"], ["to", "إلى"]]} /></Section>
      <Section title="اللغات"><DataTable rows={application.languages} columns={[["language", "اللغة"], ["speaking", "محادثة"], ["reading", "قراءة"], ["writing", "كتابة"]]} /></Section>
      <Section title="الخبرات السابقة"><DataTable rows={application.experience} columns={[["workplace", "مكان العمل"], ["position", "الوظيفة"], ["from", "من"], ["to", "إلى"]]} /></Section>
      <Section title="المعرّفون"><DataTable rows={application.referees} columns={[["name", "الاسم"], ["phone", "الهاتف"], ["mobile", "المحمول"], ["email", "البريد"]]} /></Section>

      {customAnswers.length > 0 && (
        <Section title="أسئلة إضافية">
          <div style={styles.grid}>{customAnswers.map((answer, index) => <Field key={`${answer.id || "answer"}-${index}`} label={text(answer.label)} value={answer.value} />)}</div>
        </Section>
      )}
      {application.notes && <Section title="ملاحظات المتقدم"><div style={styles.note}>{application.notes}</div></Section>}
      {application.review_notes && <Section title="ملاحظات الموارد البشرية"><div style={styles.note}>{application.review_notes}</div></Section>}

      <footer style={styles.footer}>
        <span>رقم الطلب: {application.id}</span>
        <span>{application.attachment_path ? "يوجد مرفق محفوظ مع الطلب" : "لا يوجد مرفق"}</span>
        <span>طُبع بواسطة نظام UNIFY ERP</span>
      </footer>
    </article>
  );
}