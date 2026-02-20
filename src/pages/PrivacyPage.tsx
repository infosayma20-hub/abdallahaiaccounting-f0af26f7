import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PrivacyPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background px-4 pt-6 pb-16" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-xl font-bold text-foreground">سياسة الخصوصية</h1>
        </div>

        <div className="prose prose-sm max-w-none text-foreground space-y-5">
          <section>
            <h2 className="text-base font-bold text-foreground">1. المقدمة</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">نحن نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية. توضح هذه السياسة كيفية جمع واستخدام وحماية معلوماتك عند استخدام تطبيقنا المحاسبي.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">2. البيانات التي نجمعها</h2>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>معلومات الحساب: الاسم، البريد الإلكتروني، رقم الهاتف، اسم الشركة، العنوان</li>
              <li>البيانات المالية: المعاملات، الفواتير، الحسابات، التقارير</li>
              <li>بيانات الاستخدام: سجل النشاط داخل التطبيق</li>
              <li>بيانات الجهاز: نوع المتصفح، نظام التشغيل (لأغراض تقنية)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">3. كيف نستخدم بياناتك</h2>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>تقديم وتحسين خدمات التطبيق المحاسبية</li>
              <li>معالجة المعاملات وإعداد التقارير المالية</li>
              <li>إرسال إشعارات مهمة متعلقة بحسابك</li>
              <li>تحسين تجربة المستخدم وأداء التطبيق</li>
              <li>الامتثال للمتطلبات القانونية</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">4. حماية البيانات</h2>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>نستخدم تشفير SSL/TLS لحماية البيانات أثناء النقل</li>
              <li>يتم تخزين البيانات على خوادم آمنة ومشفرة</li>
              <li>نطبق سياسات صارمة للتحكم في الوصول</li>
              <li>نجري مراجعات أمنية دورية</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">5. مشاركة البيانات</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">لا نبيع أو نشارك بياناتك الشخصية مع أطراف ثالثة إلا في الحالات التالية:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>بموافقتك الصريحة</li>
              <li>للامتثال لأمر قضائي أو متطلب قانوني</li>
              <li>مع مزودي الخدمات التقنية الضروريين لتشغيل التطبيق (مع ضمان حماية البيانات)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">6. حقوق المستخدم</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">يحق لك:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pr-5">
              <li>الوصول إلى بياناتك الشخصية</li>
              <li>تصحيح أو تحديث معلوماتك</li>
              <li>طلب حذف حسابك وبياناتك</li>
              <li>تصدير بياناتك المالية</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">7. ملفات تعريف الارتباط</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">نستخدم ملفات تعريف الارتباط الضرورية لتشغيل التطبيق وتذكر تفضيلاتك. لا نستخدم ملفات تعريف ارتباط إعلانية أو تتبعية.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">8. التحديثات على السياسة</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">قد نقوم بتحديث هذه السياسة من وقت لآخر. سيتم إشعارك بأي تغييرات جوهرية عبر البريد الإلكتروني أو إشعار داخل التطبيق.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">9. التواصل</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">لأي استفسارات حول سياسة الخصوصية، يمكنك التواصل معنا عبر البريد الإلكتروني أو من خلال نموذج الاتصال داخل التطبيق.</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPage;
