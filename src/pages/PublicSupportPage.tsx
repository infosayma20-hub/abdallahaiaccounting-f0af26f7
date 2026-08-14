import { Helmet } from "react-helmet-async";
import unifyLogo from "@/assets/unify-logo-official.png";

export default function PublicSupportPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <Helmet>
        <title>الدعم الفني | Unify ERP</title>
        <meta name="description" content="صفحة الدعم الفني لعملاء Unify ERP: البريد الإلكتروني، الهاتف، وساعات العمل." />
        <link rel="canonical" href="https://unifyerp.app/support" />
      </Helmet>
      <main className="w-full max-w-lg rounded-2xl border bg-card p-8 shadow-sm text-center">
        <img src={unifyLogo} alt="شعار Unify ERP" className="h-10 mx-auto mb-6" loading="lazy" />
        <h1 className="text-2xl font-bold mb-2">الدعم الفني</h1>
        <p className="text-sm text-muted-foreground mb-6">
          فريق Unify ERP جاهز لمساعدتك في أي استفسار حول الحساب أو بطاقات الولاء.
        </p>
        <div className="space-y-3 text-right text-sm">
          <div className="rounded-xl border p-4">
            <div className="text-muted-foreground mb-1">البريد الإلكتروني</div>
            <a className="font-semibold underline" href="mailto:support@unifyerp.app">support@unifyerp.app</a>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-muted-foreground mb-1">الهاتف / واتساب</div>
            <a className="font-semibold underline" href="tel:+970599000000">+970 59 900 0000</a>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-muted-foreground mb-1">ساعات العمل</div>
            <div className="font-semibold">الأحد - الخميس، 9:00 - 17:00 (توقيت فلسطين)</div>
          </div>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">Powered by Unify ERP</p>
      </main>
    </div>
  );
}
