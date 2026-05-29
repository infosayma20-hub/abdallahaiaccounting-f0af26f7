import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const AR = `
اتفاقية ترخيص استخدام أموالي

شركة أموالي للحلول البرمجية (Amwali Software Solutions)، أو من ينوب عنها، ويعرف فيما بعد بالفريق الأول.

وبين

مستخدم البرنامج و/أو من ينوب عنه و/أو المعرّف لدى الفريق الأول من خلال نموذج تسجيل حساب جديد على موقع www.amwali.app والذي تمت تعبئته من قبل الفريق الثاني، ويعرف فيما بعد بالفريق الثاني.

حيث أن الفريق الأول شركة تعمل في مجال البرمجيات المحاسبية والمالية والإدارية وتطبيقات برمجية أخرى تعمل على شبكة الإنترنت وعلى أجهزة الكمبيوتر الشخصية وأخرى (ويُشار لجميع ما ذكر بتقديم "خدمات")، حيث تشمل هذه الخدمات تشغيلها على جهاز الكمبيوتر الخاص بالفريق الثاني وتقديمها له ضمن شروط محددة، ومن أهمها الحفاظ على بيانات الفريق الثاني وسريتها.

وحيث أن الفريق الثاني حصل على ترخيص استخدام برنامج أموالي الخاص والمقدّم من قبل الفريق الأول ضمن الشروط المذكورة في هذه الاتفاقية.
وحيث أن الفريق الأول يوافق على منح ترخيص استخدام برنامج أموالي.
وحيث أن الفريق الثاني يوافق بشكل كامل ومطلق ونهائي على أحكام وشروط هذه الاتفاقية؛

لذلك، فقد اتفق الفريقان على الأحكام والشروط التالية:

1. تعتبر مقدمة هذه الاتفاقية جزءاً لا يتجزأ منها وتُقرأ معها نصاً وروحاً.
2. إن انتفاع و/أو استخدام الفريق الثاني لبرنامج أموالي بشكل كامل أو جزئي و/أو خدمات الفريق الأول يعتبر موافقة كاملة ومطلقة ونهائية للأحكام والشروط المدوّنة في هذه الاتفاقية.
3. يعطي الفريق الأول للفريق الثاني من خلال هذه الاتفاقية الحق الكامل في استخدام برنامج أموالي ضمن الشروط المذكورة، والتي تشمل ما يلي:
   • استخدام المنتج من قبل الفريق الثاني.
   • الحفاظ على محتويات البرنامج المتفق عليه دون أي نقص أو حذف لمحتوياته من قبل الفريق الأول.
   • عدم إيقاف عمل البرنامج أو أي جزء من محتوياته من قبل الفريق الأول، ويستثنى من ذلك:
      - عدم تسديد المبالغ المتفق عليها والمستحقة على الفريق الثاني.
      - توقف البرنامج نتيجة لأعطال نظام التشغيل و/أو جهاز الكمبيوتر الخاص بالفريق الثاني.
      - انتهاء المدة المتفق عليها لعمل البرنامج وعدم تجديد الترخيص.
      - مخالفة أي بند من بنود هذه الاتفاقية.
      - فترة أعمال الصيانة و/أو التحديثات التي يجريها الفريق الأول على النظام أو أجهزة الكمبيوتر (السيرفرات والشبكة) للنسخ السحابية، و/أو أي أعطال ناجمة عن مشاكل في شبكة الإنترنت العالمية أو المحلية، و/أو أي أعطال لا سيطرة للفريق الأول عليها.
   • كفالة على البرنامج طيلة الفترة التجريبية والمحددة من قبل الفريق الأول و/أو طيلة الفترة المدفوعة من قبل الفريق الثاني، حيث تشمل هذه الكفالة:
      - تقديم مواد تعليمية إلكترونية لمساعدة الفريق الثاني على استخدام المنتج.
      - عدم وجود أخطاء في عمل البرنامج تؤدي إلى نتائج غير صحيحة.
      - خدمة الدعم الفني عبر نظام الدردشة (Chat) والبريد الإلكتروني، خلال فترة الدوام الرسمي.
      - التحديثات الدورية على البرنامج.
      - التعديلات والملاحظات المطلوبة من قبل الفريق الثاني على البرنامج، على ألا تكون مخالفة لسياسة الفريق الأول ولنظامه الإداري ومحتويات المنتج.

إنهاء الاتفاقية:

يقرّ الفريق الثاني ويؤكد بحق الفريق الأول بإيقاف أو إنهاء جميع الخدمات المقدمة و/أو رفض إمكانية الوصول لاستخدام أو تقديم البيانات لجميع أو بعض الخدمات بدون إشعار مسبق، وذلك في حالة قيام الفريق الثاني بأي تصرف يعتقد بموجبه الفريق الأول وفقاً لقراره الخاص أنه:
(أ) يشكل خرقاً لأي بند من أحكام وشروط هذه الاتفاقية.
(ب) يشكل خرقاً لحقوق الفريق الأول أو أطراف ثالثة.
(ج) أن الاستمرار باستخدام الخدمات أصبح غير مبرر.
(د) أنه تصرف غير قانوني.
بالإضافة إلى ذلك، يحتفظ الفريق الأول بحقه بإنهاء جميع خدماته في حالة وجود حسابات مالية سابقة مستحقة. ويوافق الفريق الثاني أن الفريق الأول لا يكون مسؤولاً أمام الفريق الثاني أو أي طرف ثالث عن إعادة تقديم أي خدمة تم إيقافها.

شروط عامة:

1. يحق للفريق الأول تحديث برنامج أموالي بالإضافة أو التعديل على طريقة عمل المنتج دون حق للاعتراض من قبل الفريق الثاني.
2. الفريق الثاني هو المسؤول الوحيد عن جميع البيانات التي يدخلها على المنتج. الفريق الأول لا يتحكم بهذه البيانات ولا يضمن دقتها أو سلامتها أو كماليتها.
3. لا تنقل هذه الاتفاقية ملكية أي اسم أو نظام أو مستندات أو براءات اختراع أو حقوق طبع أو علامات تجارية أو أسرار تجارية تابعة للفريق الأول.
4. يحتفظ الفريق الأول بحق تعديل أسعار وتفاصيل اتفاقياته وعروضه ومنتجاته وخدماته دون سابق إنذار.
5. سجلات الإدخال التابعة للفريق الأول تعتبر دقيقة ونهائية ويتنازل الفريق الثاني عن أي حق بالاعتراض عليها.
6. للفريق الأول حق وضع شروط عامة وتقييدات تتعلق بالخدمات في أي وقت. الفريق الأول لا يتحمل أي مسؤولية قانونية بخصوص أي حذف أو فشل في تخزين أي معلومات أو محتوى.
7. لا يعتبر الفريق الأول مقصراً إذا كان امتناعه أو تأخيره عن تنفيذ التزاماته سببه قوة قاهرة (حروب، أعطال، نزاعات، إخلال بالنظام، إلخ).
8. يحكم هذه الاتفاقية القوانين المطبقة في الدول والمدن التي تقع فيها مقرات الشركة وفروعها.
9. الفريق الأول غير مسؤول عن أي خلل ناتج عن سوء الاستخدام أو العبث أو الفيروسات أو انقطاع التيار الكهربائي أو أعطال الأجهزة.
10. الفريق الأول غير ملزم بتقديم استشارات برمجية أو محاسبية.
11. مسؤولية إدخال البيانات تقع على الفريق الثاني. الفريق الأول مسؤول فقط عن الإرشاد والتدريب.
12. الحفاظ على البيانات المنتَجة من خلال المنتج هو مسؤولية الفريق الثاني.
13. يلتزم الفريق الأول بالحفاظ على سرية معلومات الفريق الثاني.
14. أي نظام أو خدمة إضافية تضاف للمنتج تخضع لجميع شروط هذه الاتفاقية.
15. مخالفة أي بند تعرّض الطرف المخالف للمساءلة القانونية.
16. هذا المنتج/الخدمة ملك حصري للفريق الأول (Amwali Software Solutions)، ولا يحق للفريق الثاني العبث بالشكل الخارجي للبرنامج أو شعاره.
17. لا يحق للفريق الثاني أو أي طرف آخر المساس بالشيفرة المصدرية (source code) أو نسخها أو بيعها أو تعديلها.
18. لا يحق للفريق الثاني بيع أو منح حق استخدام هذا البرنامج لأي طرف آخر دون موافقة خطية من الفريق الأول.
19. حجم ونوع المرفقات المسموح برفعها للنسخة السحابية محدود، وعند الرغبة بزيادة الحجم يلتزم الفريق الثاني بدفع التكاليف المطلوبة.
20. يتم تفريغ و/أو حذف بيانات أرشيف الحركات للسنة/الدورة المالية التي تم إقفالها قبل الدورة الحالية والتي قبلها، ولا يحق للفريق الثاني الاعتراض.
`.trim();

const EN = `
Amwali Software License Agreement

This Agreement is entered into between Amwali Software Solutions, or its authorized representative (the "First Party"),
and the user of the software, or whomever represents them, or whomever is identified to the First Party through a new account registration form on www.amwali.app completed by the user (the "Second Party").

Whereas the First Party is a company that develops accounting, financial, administrative, and other software applications running on the internet and on personal computers and other devices (collectively referred to as "Services"); these Services include operating the software on the Second Party's computer and providing it under specific terms, the most important of which is preserving the confidentiality of the Second Party's data.

Whereas the Second Party has obtained a license to use the Amwali software provided by the First Party under the terms set out in this Agreement.
And whereas the First Party agrees to grant a license to use Amwali.
And whereas the Second Party fully, absolutely, and finally agrees to the terms and conditions of this Agreement.

The two parties have therefore agreed to the following terms and conditions:

1. The preamble of this Agreement is an integral part of it and shall be read together with it in letter and spirit.
2. The Second Party's use of the Amwali software, in whole or in part, or of the First Party's services, constitutes full, absolute, and final acceptance of the terms and conditions of this Agreement.
3. The First Party grants the Second Party the full right to use Amwali under the terms set out herein, including:
   • Use of the product by the Second Party.
   • Preservation of the agreed-upon program contents without reduction or deletion by the First Party.
   • The First Party shall not stop the program or any of its contents, except in the following cases:
      - Non-payment of agreed amounts owed by the Second Party.
      - Suspension caused by failures of the Second Party's operating system or computer.
      - Expiry of the agreed term and non-renewal of the license.
      - Violation of any clause of this Agreement.
      - Maintenance or update windows performed by the First Party on systems, servers, or networks for cloud copies, or any failure caused by global or local internet problems, or any failure outside the First Party's control.
   • Warranty during the trial period and during the paid period, covering:
      - Provision of electronic learning materials.
      - Absence of errors leading to incorrect results.
      - Technical support via chat and email during official working hours.
      - Periodic updates to the program.
      - Modifications requested by the Second Party, provided they do not conflict with the First Party's policy or the product's content.

Termination:

The Second Party acknowledges the First Party's right to suspend or terminate all services and/or refuse access to use or provide data, without prior notice, if the Second Party acts in a way the First Party considers, at its sole discretion:
(a) a breach of any term of this Agreement;
(b) a breach of the First Party's rights or third-party rights;
(c) makes continued use of the services unjustifiable; or
(d) is unlawful.
The First Party also reserves the right to terminate all services if there are outstanding financial obligations. The First Party is not liable to the Second Party or any third party for re-providing any suspended service.

General Terms:

1. The First Party may update the Amwali software, add features, or modify the way the product works without any right of objection by the Second Party.
2. The Second Party is solely responsible for all data entered into the product. The First Party does not control or guarantee its accuracy, integrity, or completeness.
3. This Agreement does not transfer ownership of any name, system, documents, patents, copyrights, trademarks, or trade secrets belonging to the First Party.
4. The First Party may modify the prices, details, offers, products, and services of its agreements at any time without prior notice.
5. The First Party's entry logs are considered accurate and final, and the Second Party waives any right to object to them.
6. The First Party may set general terms and restrictions on the Services at any time. The First Party bears no legal liability for any deletion or failure to store information or content.
7. The First Party is not in default if its delay is caused by force majeure (war, governmental action, riots, system disruptions, etc.).
8. This Agreement is governed by the laws of the countries and cities in which the company's offices, branches, and agents are located.
9. The First Party is not liable for any malfunction caused by misuse, tampering, viruses, power outages, or hardware failures.
10. The First Party is not obliged to provide software or accounting consulting.
11. Data entry is the Second Party's responsibility. The First Party is only responsible for guidance and training.
12. Preserving data produced through the product is the Second Party's responsibility.
13. The First Party is committed to maintaining the confidentiality of the Second Party's information.
14. Any additional system or service added to the product is subject to all terms of this Agreement.
15. Violation of any clause exposes the violating party to legal liability.
16. This product/service is the exclusive property of the First Party (Amwali Software Solutions); the Second Party may not tamper with the program's external appearance or logo.
17. The Second Party or any third party may not access, copy, sell, or modify the source code.
18. The Second Party may not sell or grant the right to use this program to any other party without the First Party's written approval.
19. The size and types of attachments allowed in the cloud copy are limited; for additional capacity, the Second Party shall pay any costs requested by the First Party.
20. Archive transaction data for fiscal years/periods closed prior to the current and previous period may be cleared or deleted, and the Second Party has no right to object.
`.trim();

export function LicenseAgreementDialog({ open, onOpenChange }: Props) {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {lang === "ar" ? "اتفاقية ترخيص استخدام أموالي" : "Amwali Software License Agreement"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={lang} onValueChange={(v) => setLang(v as "ar" | "en")} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="self-start">
            <TabsTrigger value="ar">العربية</TabsTrigger>
            <TabsTrigger value="en">English</TabsTrigger>
          </TabsList>

          <TabsContent value="ar" className="flex-1 overflow-y-auto mt-3" dir="rtl">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-foreground/90 px-1">
              {AR}
            </pre>
          </TabsContent>
          <TabsContent value="en" className="flex-1 overflow-y-auto mt-3" dir="ltr">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-foreground/90 px-1">
              {EN}
            </pre>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default LicenseAgreementDialog;