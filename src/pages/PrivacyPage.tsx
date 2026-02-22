import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PrivacyPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background px-4 pt-6 pb-16" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => window.history.length > 1 ? navigate(-1) : navigate("/auth")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-xl font-bold text-foreground">سياسة الخصوصية</h1>
        </div>

        <p className="text-xs text-muted-foreground">آخر تحديث: 20 فبراير 2026</p>

        <div className="prose prose-sm max-w-none text-foreground space-y-5">
          <section>
            <h2 className="text-base font-bold text-foreground">1. مقدمة</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">نحن في التطبيق نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية وبياناتك المالية. توضح هذه السياسة كيفية جمع المعلومات واستخدامها وحمايتها عند استخدامك للتطبيق.</p>
            <p className="text-sm text-muted-foreground leading-relaxed">باستخدامك للتطبيق، فإنك توافق على سياسة الخصوصية هذه.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">2. المعلومات التي نقوم بجمعها</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">قد نقوم بجمع الأنواع التالية من المعلومات:</p>
            
            <h3 className="text-sm font-semibold text-foreground mt-3">أ) معلومات الحساب</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>الاسم الكامل</li>
              <li>البريد الإلكتروني</li>
              <li>رقم الهاتف</li>
              <li>اسم الشركة</li>
              <li>الدولة والمدينة</li>
            </ul>

            <h3 className="text-sm font-semibold text-foreground mt-3">ب) المعلومات المالية والتشغيلية</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>المعاملات المحاسبية</li>
              <li>بيانات العملاء والموردين</li>
              <li>الفواتير والطلبيات</li>
              <li>التقارير المالية</li>
            </ul>

            <h3 className="text-sm font-semibold text-foreground mt-3">ج) معلومات تقنية</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>عنوان IP</li>
              <li>نوع الجهاز ونظام التشغيل</li>
              <li>بيانات الاستخدام داخل التطبيق</li>
              <li>سجلات الأخطاء</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">3. كيفية استخدام المعلومات</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">نستخدم البيانات من أجل:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>تشغيل وتقديم خدمات التطبيق</li>
              <li>إنشاء التقارير المالية</li>
              <li>تحسين تجربة المستخدم</li>
              <li>تطوير ميزات جديدة</li>
              <li>دعم المستخدم والرد على الاستفسارات</li>
              <li>حماية النظام من الاحتيال أو الاستخدام غير المشروع</li>
            </ul>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">لن نستخدم بياناتك لأغراض تسويقية دون موافقتك.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">4. مشاركة المعلومات</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">نحن لا نقوم ببيع بيانات المستخدمين.</p>
            <p className="text-sm text-muted-foreground leading-relaxed">قد تتم مشاركة البيانات فقط في الحالات التالية:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>مع مزودي خدمات الاستضافة أو المعالجة التقنية (بموجب اتفاقيات سرية)</li>
              <li>إذا كان ذلك مطلوباً بموجب القانون</li>
              <li>لحماية حقوقنا القانونية</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">5. حماية البيانات</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">نلتزم باتخاذ إجراءات أمنية معقولة لحماية بياناتك، بما في ذلك:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>تشفير البيانات أثناء النقل (SSL)</li>
              <li>تخزين البيانات في خوادم آمنة</li>
              <li>تقييد الوصول الداخلي للبيانات</li>
            </ul>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">ومع ذلك، لا يمكن ضمان أمان مطلق لأي نظام إلكتروني.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">6. الاحتفاظ بالبيانات</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">نحتفظ ببياناتك طالما أن حسابك نشط أو حسب الحاجة لتقديم الخدمات.</p>
            <p className="text-sm text-muted-foreground leading-relaxed">يمكنك طلب حذف حسابك في أي وقت، وسيتم حذف بياناتك خلال فترة معقولة ما لم يكن هناك التزام قانوني بالاحتفاظ بها.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">7. حقوق المستخدم</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">يحق لك:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>طلب الاطلاع على بياناتك</li>
              <li>طلب تعديل بيانات غير صحيحة</li>
              <li>طلب حذف حسابك</li>
              <li>سحب الموافقة على بعض الاستخدامات</li>
            </ul>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">يمكن تقديم الطلبات عبر بريد الدعم: info@abdallahsayma.com</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">8. الذكاء الاصطناعي وتحليل البيانات</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">قد يستخدم التطبيق تقنيات الذكاء الاصطناعي لتحليل النصوص وتحويلها إلى قيود محاسبية.</p>
            <p className="text-sm text-muted-foreground leading-relaxed">يتم استخدام البيانات فقط لغرض تقديم الخدمة وتحسين دقتها، ولا يتم استخدامها لتدريب نماذج خارج نطاق الخدمة دون إزالة الهوية.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">9. ملفات تعريف الارتباط</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">قد نستخدم ملفات تعريف الارتباط لتحسين الأداء وتحليل الاستخدام. يمكنك تعطيلها من إعدادات المتصفح.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">10. التعديلات على السياسة</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">قد نقوم بتحديث سياسة الخصوصية من وقت لآخر. سيتم نشر أي تحديث داخل التطبيق، ويعتبر استمرار استخدام الخدمة موافقة على التعديلات.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">11. التواصل معنا</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">إذا كان لديك أي استفسار حول سياسة الخصوصية، يمكنك التواصل معنا عبر:</p>
            <p className="text-sm text-muted-foreground leading-relaxed">📧 info@abdallahsayma.com</p>
            <p className="text-sm text-muted-foreground leading-relaxed">📍 Sayma Co. for Accounting and Auditing - Nablus, Palestine</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPage;
