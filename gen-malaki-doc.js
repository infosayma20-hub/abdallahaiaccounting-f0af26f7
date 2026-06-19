const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, BorderStyle, WidthType, ShadingType } = require('docx');
const fs = require('fs');

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: '999999' };
const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function createHeaderCell(text) {
  return new TableCell({
    borders: cellBorders,
    width: { size: 4680, type: WidthType.DXA },
    shading: { fill: '0D1B2E', type: ShadingType.CLEAR },
    margins: { top: 100, bottom: 100, left: 150, right: 150 },
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 22, font: 'Arial' })]
    })]
  });
}

function createCell(text, bold=false) {
  return new TableCell({
    borders: cellBorders,
    width: { size: 4680, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 150, right: 150 },
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text, bold, size: 20, font: 'Arial' })]
    })]
  });
}

const children = [];

// Title
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({ text: 'قائمة الميزات والإنجازات – نظام أموالي', bold: true, size: 40, color: '0D1B2E', font: 'Arial' })]
}));

children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 400 },
  children: [new TextRun({ text: 'مطعم الدجاج الملكي (Royal Chicken)', size: 28, color: '555555', font: 'Arial' })]
}));

children.push(new Paragraph({
  alignment: AlignmentType.RIGHT,
  spacing: { after: 300 },
  children: [new TextRun({ text: 'تم إعداد هذه القائمة بناءً على البيانات الفعلية للنظام واستخدام الملكي اليومي.', size: 20, color: '777777', font: 'Arial' })]
}));

// Overview Table
children.push(new Paragraph({
  alignment: AlignmentType.RIGHT,
  spacing: { before: 200, after: 200 },
  children: [new TextRun({ text: 'ملخص استخدام النظام', bold: true, size: 28, color: '0D1B2E', font: 'Arial' })]
}));

const overviewRows = [
  new TableRow({ children: [createHeaderCell('البيان'), createHeaderCell('القيمة')] }),
  new TableRow({ children: [createCell('عدد الفروع'), createCell('6 فروع')] }),
  new TableRow({ children: [createCell('عدد الموظفين'), createCell('162 موظف')] }),
  new TableRow({ children: [createCell('نقاط البيع (POS)'), createCell('17 جهاز')] }),
  new TableRow({ children: [createCell('مستخدمي POS'), createCell('47 مستخدم')] }),
  new TableRow({ children: [createCell('المنتجات'), createCell('335 منتج')] }),
  new TableRow({ children: [createCell('أيام الحضور المسجلة'), createCell('617 يوم')] }),
  new TableRow({ children: [createCell('السندات والقيود'), createCell('146 سند')] }),
  new TableRow({ children: [createCell('حسابات دفتر الأستاذ'), createCell('294 حساب')] }),
  new TableRow({ children: [createCell('طلبات مركز الاتصال'), createCell('67 طلب')] }),
  new TableRow({ children: [createCell('سلف الموظفين'), createCell('12 سلفة')] }),
];

children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [4680, 4680],
  rows: overviewRows,
  alignment: AlignmentType.RIGHT,
}));

function sectionTitle(text) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text, bold: true, size: 28, color: '0D1B2E', font: 'Arial' })]
  });
}

function subTitle(text) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 250, after: 100 },
    children: [new TextRun({ text, bold: true, size: 24, color: '1E3A5F', font: 'Arial' })]
  });
}

function bullet(text) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 60, after: 60 },
    indent: { right: 360 },
    children: [new TextRun({ text: '• ' + text, size: 20, font: 'Arial' })]
  });
}

function normal(text) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, size: 20, font: 'Arial' })]
  });
}

// ====== 1. POS & المبيعات ======
children.push(sectionTitle('١. نظام نقاط البيع (POS) – المتقدم والمتكامل'));
children.push(normal('نظام نقاط بيع كامل مُخصص لمطاعم الوجبات السريعة، يعمل أونلاين وأوفلاين مع مزامنة تلقائية.'));

children.push(subTitle('أ. إدارة الطلبات والمنتجات'));
children.push(bullet('335 منتج مُدخل في النظام مع فئات متعددة (وجبات، مقبلات، مشروبات، حلويات)'));
children.push(bullet('دعم تعديلات الطلب (إضافة/حذف مكونات، تعليمات خاصة للمطبخ)'));
children.push(bullet('نظام Pizza Topping مخصص للبيتزا – اختيار حجم + نوع العجين + إضافات'));
children.push(bullet('تعديل السعر والكمية للمنتجات فوراً من شاشة الصندوق'));
children.push(bullet('تجميع منتجات مشابهة تحت أزرار سريعة للكاشير (Quick Select)'));

children.push(subTitle('ب. إدارة الفواتير والدفع'));
children.push(bullet('فاتورة ضريبية معتمدة (Tax Invoice) وفاتورة مبسطة (Simplified)'));
children.push(bullet('دعم ضريبة القيمة المضافة الفلسطينية 16% (حساب شاملة ومنفصلة)'));
children.push(bullet('دعم دفع متعدد: كاش، فيزا، شيك، محفظة إلكترونية، آجل'));
children.push(bullet('نظام المرتجعات (Returns) مع استرداد كامل أو جزئي ومطابقته للوردية'));
children.push(bullet('تقارير مرتجعات يومية وفترية مع تفاصيل المنتج والسبب'));

children.push(subTitle('ج. إدارة الورديات (Shifts)'));
children.push(bullet('فتح وإغلاق وردية لكل كاشير بشكل مستقل'));
children.push(bullet('مطابقة نقدية: النظامي vs الفعلي مع تقرير الفروقات'));
children.push(bullet('إغلاق الوردية يتطلب كلمة مرور المشرف (Supervisor Override)'));
children.push(bullet('تقرير إغلاق وردية شامل: إجمالي مبيعات + مرتجعات + طرق الدفع + فروقات النقدية'));

children.push(subTitle('د. إدارة المطبخ والطابعات'));
children.push(bullet('ربط مع Print Bridge v6.3.7 لطباعة الأوامر مباشرة على طابعات حرارية'));
children.push(bullet('قواعد طباعة حسب الفئة: بيتزا → طابعة بيتزا، مشاوي → طابعة مشاوي، مشروبات → بار'));
children.push(bullet('إعدادات طابعة مخصصة لفرع رام الله بلازا مول (٢ طابعة: استلام 10.10.211.7، مطبخ موحد 10.10.211.8)'));
children.push(bullet('طابعة استلام (Receipt Printer) بطابعة حرارية سريعة'));
children.push(bullet('طابعة المطبخ الموحدة تدمج أوامر البيتزا والمشاوي في طباعة واحدة'));

children.push(subTitle('هـ. التوصيل وإدارة الكباتن'));
children.push(bullet('ربط مباشر مع نظام Wheels للتوصيل عبر API'));
children.push(bullet('إرسال طلبات التوصيل تلقائياً لـ Wheels مع تتبع حالة الطلب'));
children.push(bullet('احتساب تكلفة التوصيل ديناميكياً حسب المنطقة والمسافة'));
children.push(bullet('إمكانية إلغاء طلب التوصيل واسترداد المبلغ للعميل'));

children.push(subTitle('و. متعدد العملات'));
children.push(bullet('دعم الشيكل (ILS) كعملة افتراضية مع تحويل دينار/دولار عند الحاجة'));
children.push(bullet('نظام مرتجعات متعدد العملات (process_pos_return RPC)'));

children.push(subTitle('ز. الإعدادات المتقدمة'));
children.push(bullet('وضع Offline Mode: العمل مستمر حتى بدون إنترنت مع IndexedDB'));
children.push(bullet('تسجيل طلبات الطوارئ (Emergency Orders) عند انقطاع السيرفر'));
children.push(bullet('6 فروع مفصولة بالكامل، كل فرع له منتجاته وأسعاره وطابعاته'));
children.push(bullet('47 مستخدم POS بصلاحيات مختلفة (كاشير، مشرف، مدير فرع)'));

// ====== 2. HR ======
children.push(sectionTitle('٢. نظام الموارد البشرية (HR) – الشامل'));
children.push(normal('نظام إدارة موظفين كامل لـ 162 موظف بمختلف الفروع.'));

children.push(subTitle('أ. إدارة الموظفين والبيانات'));
children.push(bullet('162 ملف موظف شامل: بيانات شخصية، وثائق، رواتب، بنك، تأمين'));
children.push(bullet('نظام صلاحيات متدرج: موظف، مشرف، HR Manager، Admin'));
children.push(bullet('ربط الموظف بحسابه المحاسبي (Opening Balance 3110)'));

children.push(subTitle('ب. الحضور والانصراف (Attendance)'));
children.push(bullet('ربط مباشر مع جهاز ZKTeco K40 لبصمة الوجه/البطاقة'));
children.push(bullet('Bridge مخصص لقراءة البيانات من الجهاز ورفعها للسحابة'));
children.push(bullet('تسجيل حضور يدوي للموظفين عند تعطل الجهاز'));
children.push(bullet('نظام الورديات (Work Shifts): صباحي/مسائي/ليلي مع حساب التأخير والخروج المبكر'));
children.push(bullet(' grace tolerance: سماحية دقيقتين للتأخير بدون خصم'));
children.push(bullet('حساب الوقت الإضافي (Overtime) تلقائياً حسب الوردية والدوام'));
children.push(bullet('617 يوم حضور مسجل في النظام'));

children.push(subTitle('ج. أنواع الأيام ونظام الدوام (B2.1)'));
children.push(bullet('تصنيف الأيام: عمل عادي، نصف دوام، عطلة رسمية، إجازة مرضية'));
children.push(bullet('جدولة أيام العمل الأسبوعية (hr_work_week_config)'));
children.push(bullet('عطلات رسمية مسجلة مسبقاً (official_holidays)'));

children.push(subTitle('د. الإجازات والطلبات'));
children.push(bullet('نظام إجازات إلكتروني: إجازة سنوية، مرضية، طارئة، غياب'));
children.push(bullet('12 سلفة موظفين مسجلة مع ربطها بالرواتب'));
children.push(bullet('طلبات سلف (Advances) مع موافقة المشرف والمحاسب'));

children.push(subTitle('هـ. كشوف الرواتب (Payroll Engine)'));
children.push(bullet('محرك رواتب متكامل (Payroll Engine) بـ 5 مصادر حساب'));
children.push(bullet('حساب الراتب الأساسي + بدلات + ساعات إضافية – استقطاعات'));
children.push(bullet('الأيام الافتراضية: 26 يوم/شهر، 10 ساعات/يوم'));
children.push(bullet('استقطاع التأمين والضريبة تلقائياً'));
children.push(bullet('تقرير كشف راتب مفصل لكل موظف (Payslip)'));

children.push(subTitle('و. قفل الحضور اليومي (B2.2.1)'));
children.push(bullet('قفل يومي على مستوى قاعدة البيانات: يمنع تعديل حضور يوم سابق بدون فك القفل'));
children.push(bullet('فك القفل يتطلب صلاحية Admin/HR Manager + سبب إلزامي'));
children.push(bullet('يمنع الغش والتلاعب ببيانات الحضور والانصراف'));

children.push(subTitle('ز. بوابة الموظف (Employee Portal)'));
children.push(bullet('تطبيق ويب للموظفين (Mobile-first PWA)'));
children.push(bullet('عرض راتب الشهر الحالي والسابق'));
children.push(bullet('تقديم طلب إجازة/سلفة/تصحيح حضور من الجوال'));
children.push(bullet('تتبع حالة الطلب: قيد المراجعة، موافق، مرفوض'));

// ====== 3. Accounting ======
children.push(sectionTitle('٣. النظام المحاسبي (Accounting) – متوافق مع المعايير الدولية'));
children.push(normal('نظام محاسبي متكامل بـ 294 حساب و146 قيد محاسبي.'));

children.push(subTitle('أ. دليل الحسابات (Chart of Accounts)'));
children.push(bullet('294 حساب محاسبي منظمة حسب المعايير الدولية'));
children.push(bullet('22 حساب محمي (Protected Accounts) غير قابل للحذف أو التعديل'));
children.push(bullet('شجرة حسابات متدرجة: رئيسي → فرعي → حرج'));
children.push(bullet('منع القيد المباشر على الحسابات الرئيسية (Posting Constraints)'));
children.push(bullet('تخصيص طبيعة الحساب (مدين/دائن) ديناميكياً'));

children.push(subTitle('ب. القيود والسندات'));
children.push(bullet('146 سند مسجل: سند قبض، سند دفع، قيد يومية'));
children.push(bullet('ربط السند بالطرف (عميل/مورد/موظف) تلقائياً'));
children.push(bullet('نظام قلب القيد (Reverse Entry) متوافق مع IFRS'));
children.push(bullet('حماية قيود اليومية: منع حذف/تعديل القيود المرتبطة بمستندات'));

children.push(subTitle('ج. الفواتير والمشتريات'));
children.push(bullet('فواتير مبيعات مع رقم تسلسلي تلقائي + إمكانية تعيين رقم بداية مخصص'));
children.push(bullet('فواتير مشتريات مرتبطة بموردين ومستودعات'));
children.push(bullet('ملاحظات استلام (Delivery Notes) مع خصم مخزون فوري'));
children.push(bullet('تحويل ملاحظة الاستلام لفاتورة مبيعات بضغطة واحدة'));

children.push(subTitle('د. إدارة الضريبة (VAT)'));
children.push(bullet('ضريبة القيمة المضافة الفلسطينية 16%'));
children.push(bullet('حساب شامل (Inclusive) ومنفصل (Exclusive)'));
children.push(bullet('دفتر ضريبي منفصل: Output VAT (ضريبة مخرجات) و Input VAT (ضريبة مدخلات)'));
children.push(bullet('تقرير ضريبي دوري قابل للتصدير'));

children.push(subTitle('هـ. إدارة الشيكات'));
children.push(bullet('شيكات صادرة (Outbound) مرتبطة بالموردين – حساب 1160'));
children.push(bullet('شيكات واردة (Inbound) مرتبطة بالعملاء – حساب 1150'));
children.push(bullet('نظام تحصيل الشيكات: تحويل من بنك 1120 إلى شيكات تحت التحصيل 1125'));
children.push(bullet('نظام سَنْد الشيكات (Endorsement): تحويل شيك من عميل لمورد كدفع'));
children.push(bullet('تتبع حالة الشيك: جديد، تحت التحصيل، محصل، مرتجع، ملغى'));

children.push(subTitle('و. الأصول الثابتة'));
children.push(bullet('دليل أصول ثابتة في نطاق 12XX'));
children.push(bullet('حساب 1290 للأصول الثابتة الفرعية'));
children.push(bullet('تسجيل شراء أصل ثابت وإهلاكه الشهري/السنوي'));

children.push(subTitle('ز. العملات المتعددة'));
children.push(bullet('تسجيل المعاملات بأكثر من عملة (شيكل، دينار، دولار)'));
children.push(bullet('حقل amount (شيكل) + foreign_amount + exchange_rate لكل معاملة'));
children.push(bullet('تحديث أسعار الصرف من مصادر متعددة'));

children.push(subTitle('ح. الفترات المالية (Fiscal Periods)'));
children.push(bullet('إغلاق الفترات المالية تلقائياً (Fiscal Lock)'));
children.push(bullet('منع التعديل على الفترات المغلقة على مستوى قاعدة البيانات'));
children.push(bullet('فتح فترة سابقة يتطلب إذن Admin'));

// ====== 4. CRM & Call Center ======
children.push(sectionTitle('٤. مركز الاتصال (Call Center) – متكامل مع CRM'));

children.push(subTitle('أ. إدارة الطلبات الهاتفية'));
children.push(bullet('67 طلب مسجل عبر مركز الاتصال'));
children.push(bullet('ربط مباشر مع جهاز Yeastar P550 (PBX)'));
children.push(bullet('تسجيل رقم المتصل تلقائياً عند ورود المكالمة'));
children.push(bullet('توحيد تنسيق أرقام الهواتف (Palestine 972+)'));

children.push(subTitle('ب. إدارة العملاء (CRM)'));
children.push(bullet('بطاقة عميل شاملة: بيانات، طلبات سابقة، رصيد، سجل مكالمات'));
children.push(bullet('تصنيف العملاء: عميل، مورد، عميل ومورد، مندوب'));
children.push(bullet('تقرير كشف حساب عميل (Account Statement) مع تحليل التقادم'));
children.push(bullet('إمكانية مشاركة كشف الحساب عبر واتساب برابط مؤقت (30 يوم)'));
children.push(bullet('صفحة كشف حساب عامة (Public Statement) متوافقة مع الجوال'));

children.push(subTitle('ج. سجل المكالمات'));
children.push(bullet('سجل مكالمات مرتبط بكل طلب وعميل'));
children.push(bullet('تسجيل مدة المكالمة والموظف الذي أجاب'));

// ====== 5. Delivery & Wheels ======
children.push(sectionTitle('٥. نظام التوصيل والمندوبين – Wheels Integration'));
children.push(bullet('ربط API كامل مع نظام Wheels للتوصيل'));
children.push(bullet('إرسال طلبات التوصيل تلقائياً مع بيانات العميل والعنوان'));
children.push(bullet('تتبع حالة الطلب لحظياً: في الانتظار، في الطريق، تم التوصيل'));
children.push(bullet('بطاقة كابتن (Captain Card) لعرض بيانات المندوب والمبلغ المستحق'));
children.push(bullet('احتساب ربح التوصيل Net: shipping_final – driver_cost'));
children.push(bullet('تسوية التوصيل (Delivery Settlement) لكل فرع على حدة'));

// ====== 6. Admin & Task Management ======
children.push(sectionTitle('٦. الإدارة الداخلية – بديل متكامل عن Monday.com'));
children.push(normal('نظام إداري داخلي نقل الملكي بالكامل من Monday.com إلى أموالي.'));

children.push(subTitle('أ. إدارة المهام (Tasks)'));
children.push(bullet('إنشاء مهام وتكليفها لموظفين وأقسام محددة'));
children.push(bullet('نظام Checklists داخل كل مهمة (خطوات فرعية)'));
children.push(bullet('تتبع حالة المهمة: جديدة، قيد التنفيذ، مكتملة، متأخرة'));
children.push(bullet('إشعارات فورية عند تعيين مهمة جديدة'));

children.push(subTitle('ب. طلبات السلف والإجازات'));
children.push(bullet('طلب سلفة موظف مع موافقة متدرجة (مشرف → HR → محاسب)'));
children.push(bullet('طلب إجازة إلكتروني مع ربط أيام الرصيد المتبقي'));
children.push(bullet('سجل الموافقات والرفض مع التعليقات'));

children.push(subTitle('ج. التواصل الداخلي'));
children.push(bullet('رسائل داخلية بين الإداريين والموظفين'));
children.push(bullet('إشعارات قسم الموارد البشرية (HR Messages)'));
children.push(bullet('إجراءات تأديبية مرتبطة بطلبات التصحيح'));

children.push(subTitle('د. التقارير والإحصائيات'));
children.push(bullet('لوحة تحكم الإدارة (Admin Dashboard)'));
children.push(bullet('تقرير إنتاجية الموظفين'));
children.push(bullet('تقرير أداء الفروع'));

// ====== 7. AI & Chatbots ======
children.push(sectionTitle('٧. الذكاء الاصطناعي (AI) – مساعدان ذكيان'));

children.push(subTitle('أ. حسيب (Haseeb) – المحاسب الذكي'));
children.push(bullet('مساعد محاسبي ذكي يفهم اللغة العربية الطبيعية'));
children.push(bullet('إنشاء قيود وفواتير وسندات من خلال المحادثة الصوتية/النصية'));
children.push(bullet('تعديل المعاملات الموجودة: مثلاً عدل فاتورة وأضف خصم'));
children.push(bullet('إنشاء جهات اتصال (Contacts) تلقائياً عند ذكر اسم جديد'));
children.push(bullet('واجهة صوتية: تسجيل صوتي مثل واتساب مع موجة صوتية مرئية'));

children.push(subTitle('ب. سامي (Sami) – مساعد المبيعات'));
children.push(bullet('بوت مبيعات باللهجة الفلسطينية (Palestinian Arabic Dialect)'));
children.push(bullet('زر عائم ثلاثي الأبعاد زجاجي (3D Glass Floating Button)'));
children.push(bullet('التقاط عملاء محتملين (Lead Capture) مع حفظ البيانات في CRM'));
children.push(bullet('إجابة استفسارات العملاء عن المنتجات والأسعار'));

// ====== 8. Integrations ======
children.push(sectionTitle('٨. التكاملات والربط الخارجي (Integrations)'));
children.push(bullet('ربط كامل مع نظام Wheels للتوصيل (Webhooks + API)'));
children.push(bullet('ربط Yeastar P550 PBX لمركز الاتصال'));
children.push(bullet('ربط ZKTeco K40 لجهاز البصمة والحضور'));
children.push(bullet('Print Bridge v6.3.7 لطباعة POS على طابعات حرارية محلية'));
children.push(bullet('نظام مزامنة أسعار الصرف من مصادر متعددة'));
children.push(bullet('نظام إشعارات فوري (Realtime) عبر Supabase لجميع الأقسام'));

// ====== 9. Reports & Analytics ======
children.push(sectionTitle('٩. التقارير ولوحات المعلومات'));
children.push(bullet('كشف حساب (Account Statement) تفصيلي + ملخص مع تحليل التقادم'));
children.push(bullet('ميزان المراجعة (Trial Balance) مجمع وشامل'));
children.push(bullet('قائمة الدخل (Income Statement) والميزانية العمومية (Balance Sheet)'));
children.push(bullet('تقرير المبيعات حسب المنتج والربحية'));
children.push(bullet('تقرير المخزون والتبعات (Stock Movements)'));
children.push(bullet('تقرير التقادم (Debt Aging): 30-60-90-120+ يوم'));
children.push(bullet('لوحة تحكم E-commerce Analytics لطلبات qamar'));
children.push(bullet('تصدير جميع التقارير PDF/Excel'));

// ====== 10. Security & Audit ======
children.push(sectionTitle('١٠. الأمان والمراقبة (Security & Audit)'));
children.push(bullet('عزل متعدد المستأجرين (Multi-tenant Isolation) عبر company_id'));
children.push(bullet('Row Level Security (RLS) على كل الجداول'));
children.push(bullet('نظام صلاحيات RBAC بـ 8 أدوار (Admin, Accountant, Cashier...)'));
children.push(bullet('سجل تدقيق (Audit Log) لكل تعديل على البيانات المالية'));
children.push(bullet('منع الحذف الفعلي (Soft Delete) مع الحفاظ على السجل التاريخي'));
children.push(bullet('تشفير كلمات المرور وبيانات الجلسات'));

// Footer
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 600 },
  children: [new TextRun({ text: '────────────────────────────────────────', size: 20, color: 'CCCCCC', font: 'Arial' })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 100 },
  children: [new TextRun({ text: 'نظام أموالي – الحل المحاسبي والإداري المتكامل', size: 18, color: '888888', font: 'Arial' })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 50 },
  children: [new TextRun({ text: 'amwali.app', size: 18, color: '888888', font: 'Arial' })]
}));

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: 'Arial', color: '0D1B2E' },
        paragraph: { spacing: { before: 400, after: 200 }, alignment: AlignmentType.RIGHT } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }
      }
    },
    children,
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('/mnt/documents/malaki-features.docx', buf);
  console.log('Done!');
});
