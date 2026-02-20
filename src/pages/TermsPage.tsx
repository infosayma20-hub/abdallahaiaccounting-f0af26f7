import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const TermsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background px-4 pt-6 pb-16" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-xl font-bold text-foreground">الشروط والأحكام</h1>
        </div>

        <div className="prose prose-sm max-w-none text-foreground space-y-5">
          <section>
            <h2 className="text-base font-bold text-foreground">1. القبول بالشروط</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">باستخدامك لهذا التطبيق وإنشاء حساب، فإنك توافق على الالتزام بهذه الشروط والأحكام وجميع القوانين المعمول بها. إذا لم توافق على هذه الشروط، يرجى عدم استخدام التطبيق.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">2. طبيعة الخدمة</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">يوفر التطبيق نظاماً محاسبياً سحابياً يعتمد على تقنيات الذكاء الاصطناعي لتسجيل المعاملات، إدارة العملاء والموردين، إصدار الفواتير، وإعداد التقارير المالية.</p>
            <p className="text-sm text-muted-foreground leading-relaxed">التطبيق أداة مساعدة لإدارة البيانات المالية، ولا يُعد بديلاً عن الاستشارة المحاسبية أو القانونية المتخصصة.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">3. مسؤولية المستخدم</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">يتحمل المستخدم المسؤولية الكاملة عن:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>دقة البيانات المدخلة</li>
              <li>صحة المعاملات المسجلة</li>
              <li>مراجعة القيود والتقارير قبل اعتمادها</li>
              <li>الامتثال للأنظمة الضريبية والقانونية المحلية</li>
            </ul>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">لا يتحمل التطبيق أي مسؤولية عن الأخطاء الناتجة عن إدخال بيانات غير صحيحة أو استخدام غير سليم للنظام.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">4. الاشتراكات والدفع</h2>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>قد يتطلب استخدام بعض الميزات اشتراكاً مدفوعاً.</li>
              <li>يتم احتساب الاشتراكات وفق الباقة المختارة.</li>
              <li>يتم تجديد الاشتراك تلقائياً ما لم يتم إلغاؤه قبل موعد التجديد.</li>
              <li>لا يتم استرداد الرسوم المدفوعة عن الفترات المستخدمة.</li>
              <li>يحتفظ التطبيق بالحق في تعديل الأسعار أو الميزات مع إشعار مسبق.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">5. حماية البيانات والخصوصية</h2>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>نلتزم بحماية بيانات المستخدمين وفق أفضل ممارسات الأمان.</li>
              <li>يتم تخزين البيانات على خوادم آمنة.</li>
              <li>لا يتم بيع بيانات المستخدمين لأي طرف ثالث.</li>
              <li>قد يتم استخدام البيانات بشكل مجهول لأغراض تحسين الخدمة.</li>
              <li>المستخدم مسؤول عن الحفاظ على سرية بيانات الدخول الخاصة به.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">6. الملكية الفكرية</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">جميع الحقوق المتعلقة بالتصميم، البرمجيات، العلامات التجارية والمحتوى مملوكة للتطبيق ولا يجوز نسخها أو إعادة توزيعها دون إذن خطي مسبق.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">7. إيقاف الحساب</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">يحق للتطبيق تعليق أو إلغاء الحساب في حال:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>إساءة استخدام الخدمة</li>
              <li>محاولة اختراق النظام</li>
              <li>مخالفة الشروط</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">8. حدود المسؤولية</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">لا يتحمل التطبيق أي مسؤولية عن:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>خسائر مالية ناتجة عن قرارات مبنية على تقارير النظام</li>
              <li>انقطاع الخدمة لأسباب تقنية خارجة عن الإرادة</li>
              <li>فقدان البيانات الناتج عن قوة قاهرة</li>
            </ul>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">استخدام التطبيق يكون على مسؤولية المستخدم الشخصية.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">9. التعديلات على الشروط</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">يحتفظ التطبيق بالحق في تعديل هذه الشروط في أي وقت، ويعتبر استمرار استخدام الخدمة موافقة ضمنية على التعديلات.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">10. القانون الواجب التطبيق</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">تخضع هذه الشروط للقوانين المعمول بها في دولة فلسطين، وأي نزاع يتم حله وفق الاختصاص القضائي المحلي.</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsPage;
