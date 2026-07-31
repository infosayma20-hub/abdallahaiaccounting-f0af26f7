import { ArrowRight, Shield, Lock, Server, FileCheck, Mail, Globe } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * /security (alias /trust) — صفحة عامة للتعريف بالشركة والخدمة وممارسات الأمان.
 * مخصّصة أيضاً لمراجعي تصنيف المواقع (Fortinet / Palo Alto / Sophos ...) لذلك
 * تحتوي قسماً إنجليزياً واضحاً يوضّح طبيعة الموقع كمنصة أعمال SaaS.
 */
const SecurityPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background px-4 pt-6 pb-16" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
            aria-label="رجوع"
          >
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-xl font-bold text-foreground">الأمان والثقة — Unify ERP</h1>
        </div>

        <p className="text-xs text-muted-foreground">آخر تحديث: 31 يوليو 2026</p>

        <div className="space-y-5">
          <section className="rounded-xl border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <h2 className="text-base font-bold text-foreground">عن المنصّة</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              يونيفاي (Unify ERP) منصّة سحابية لتخطيط موارد المؤسسات موجّهة للشركات المسجّلة في
              فلسطين والأردن. تشمل المحاسبة، الفوترة، نقاط البيع، المخزون، الرواتب والموارد
              البشرية. الوصول إلى النظام محصور بالمستخدمين المصرّح لهم عبر حسابات موثّقة.
            </p>
          </section>

          <section className="rounded-xl border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <h2 className="text-base font-bold text-foreground">حماية البيانات</h2>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5 leading-relaxed">
              <li>تشفير كامل للاتصال عبر HTTPS/TLS بشهادة SSL سارية.</li>
              <li>عزل تام لبيانات كل شركة (Multi-tenant Isolation) على مستوى قاعدة البيانات.</li>
              <li>صلاحيات دقيقة حسب الدور: لا يرى المستخدم إلا ما يخصّ عمله.</li>
              <li>سجلّ تدقيق للعمليات المالية الحسّاسة دون حذف نهائي للقيود.</li>
              <li>نسخ احتياطية دورية مُدارة على بنية سحابية.</li>
            </ul>
          </section>

          <section className="rounded-xl border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              <h2 className="text-base font-bold text-foreground">محتوى الموقع</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              الموقع تطبيق أعمال بحت. لا يحتوي على أي محتوى للبالغين أو مقامرة أو برمجيات خبيثة أو
              تصيّد إلكتروني، ولا يقوم بتنزيل ملفات تنفيذية على أجهزة الزوّار.
            </p>
          </section>

          <section className="rounded-xl border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-primary" />
              <h2 className="text-base font-bold text-foreground">الخصوصية والشروط</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              راجع{" "}
              <button onClick={() => navigate("/privacy")} className="text-primary hover:underline">
                سياسة الخصوصية
              </button>{" "}
              و{" "}
              <button onClick={() => navigate("/terms")} className="text-primary hover:underline">
                شروط الاستخدام
              </button>
              .
            </p>
          </section>

          <section className="rounded-xl border bg-card p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <h2 className="text-base font-bold text-foreground">التواصل والإبلاغ الأمني</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              للإبلاغ عن ثغرة أمنية أو أي استفسار يخص الأمان، تواصل معنا عبر البريد:{" "}
              <a href="mailto:security@unifyerp.app" className="text-primary hover:underline" dir="ltr">
                security@unifyerp.app
              </a>
            </p>
          </section>

          {/* ── English section for web-filter classification reviewers ── */}
          <section className="rounded-xl border bg-card p-5 space-y-3" dir="ltr">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <h2 className="text-base font-bold text-foreground">For Web Filter / Security Reviewers</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              <strong>unifyerp.app</strong> is a legitimate cloud-based ERP (Enterprise Resource
              Planning) SaaS platform for registered businesses in Palestine and Jordan. It provides
              accounting, invoicing, point-of-sale, inventory, payroll and HR management.
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5 leading-relaxed">
              <li>Suggested category: <strong>Information Technology / Business (SaaS)</strong></li>
              <li>Served exclusively over HTTPS with a valid SSL certificate</li>
              <li>No adult, gambling, malware, phishing or illegal content</li>
              <li>Application access requires authenticated business user accounts</li>
              <li>Related domains: unifyerp.app, amwali.app and their subdomains</li>
              <li>
                Security contact:{" "}
                <a href="mailto:security@unifyerp.app" className="text-primary hover:underline">
                  security@unifyerp.app
                </a>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SecurityPage;
