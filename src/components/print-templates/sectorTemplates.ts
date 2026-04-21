// Sector-based smart template library
// Each sector contains preset templates with predefined data for QUO/CON/SUP/etc.
// Users can pick a preset to instantly fill the create form.

export type Sector = "contracting" | "retail" | "services" | "maintenance";

export interface SectorInfo {
  id: Sector;
  label: string;
  description: string;
  emoji: string;
  color: string;
}

export const SECTORS: SectorInfo[] = [
  { id: "contracting", label: "مقاولات",   description: "إنشاءات وتشطيبات وأعمال هندسية", emoji: "🏗️", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "retail",      label: "تجارة",     description: "بيع بضائع ومنتجات",                emoji: "🛒",  color: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "services",    label: "خدمات",     description: "خدمات مهنية واستشارية",            emoji: "💼",  color: "bg-purple-50 text-purple-700 border-purple-200" },
  { id: "maintenance", label: "صيانة",     description: "صيانة دورية وعقود خدمة",           emoji: "🔧",  color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
];

export interface SectorPreset {
  id: string;
  templateType: string; // QUO / CON / SUP / etc.
  title: string;
  description: string;
  /** Pre-filled fields to inject into the create modal state. */
  data: Record<string, any>;
}

export const SECTOR_TEMPLATES: Record<Sector, SectorPreset[]> = {
  contracting: [
    {
      id: "ctr-quo-villa",
      templateType: "QUO",
      title: "عرض سعر فيلا سكنية",
      description: "عرض شامل لتنفيذ أعمال إنشاء فيلا (هيكل + تشطيبات)",
      data: {
        items: [
          { description: "أعمال الحفر والأساسات", quantity: 1, unit_price: 25000 },
          { description: "الهيكل الخرساني والأعمدة", quantity: 1, unit_price: 80000 },
          { description: "أعمال البناء والقصارة", quantity: 1, unit_price: 45000 },
          { description: "التشطيبات الداخلية والخارجية", quantity: 1, unit_price: 60000 },
        ],
        validity_days: 30,
        payment_terms: "30% دفعة مقدمة، 40% خلال التنفيذ، 30% عند التسليم النهائي.",
        work_description: "إنشاء فيلا سكنية مع كافة التشطيبات وفق المواصفات الفنية المرفقة.",
      },
    },
    {
      id: "ctr-con-renovation",
      templateType: "CON",
      title: "عقد ترميم وتشطيبات",
      description: "عقد لتنفيذ أعمال ترميم وتشطيب داخلي",
      data: {
        work_description: "تنفيذ كامل أعمال الترميم والتشطيبات الداخلية وفق المواصفات الفنية المتفق عليها، بما يشمل: تشطيب الجدران، الأرضيات، الكهرباء، الصحي، والدهانات.",
        execution_period: "60 يوم عمل",
        warranty_terms: "ضمان شامل لمدة 12 شهراً على المواد والتنفيذ، يشمل إصلاح أي عيوب تظهر خلال فترة الضمان على نفقتنا.",
      },
    },
    {
      id: "ctr-quo-roads",
      templateType: "QUO",
      title: "عرض أعمال طرق ورصف",
      description: "تأهيل وتعبيد طرق داخلية",
      data: {
        items: [
          { description: "أعمال الحفر والتسوية", quantity: 1, unit_price: 15000 },
          { description: "طبقة أساس مدموكة", quantity: 1, unit_price: 22000 },
          { description: "خلطة إسفلتية ساخنة", quantity: 1, unit_price: 35000 },
        ],
        validity_days: 21,
        payment_terms: "50% مقدم عند توقيع العرض، 50% بعد التسليم النهائي.",
      },
    },
  ],

  retail: [
    {
      id: "ret-quo-bulk",
      templateType: "QUO",
      title: "عرض بيع بالجملة",
      description: "عرض كميات تجارية للموزعين",
      data: {
        items: [
          { description: "صنف A — كرتون (24 قطعة)", quantity: 50, unit_price: 120 },
          { description: "صنف B — كرتون (12 قطعة)", quantity: 30, unit_price: 180 },
        ],
        discount_percent: 5,
        validity_days: 15,
        payment_terms: "نقداً عند الاستلام، أو شيك بنكي معتمد.",
      },
    },
    {
      id: "ret-sup-monthly",
      templateType: "SUP",
      title: "عقد توريد شهري",
      description: "عقد توريد بضائع بشكل شهري متكرر",
      data: {
        items: [
          { description: "بضاعة فئة 1", quantity: 100, unit_price: 0 },
          { description: "بضاعة فئة 2", quantity: 50, unit_price: 0 },
        ],
        supply_terms: "توريد شهري وفق الطلبيات المعتمدة، النقل على المورد، الفواتير شهرية وتدفع خلال 30 يوماً.",
      },
    },
    {
      id: "ret-dn-pricing",
      templateType: "DN",
      title: "إشعار مدين فرق سعر",
      description: "إضافة فرق سعر بضائع على حساب العميل",
      data: {
        reason: "فرق سعر على البضاعة المسلمة بموجب الفاتورة المرجعية، نتيجة تحديث قائمة الأسعار.",
      },
    },
  ],

  services: [
    {
      id: "svc-quo-consult",
      templateType: "QUO",
      title: "عرض خدمات استشارية",
      description: "استشارات إدارية أو محاسبية بالساعة",
      data: {
        items: [
          { description: "استشارة محاسبية شهرية", quantity: 12, unit_price: 500 },
          { description: "إعداد التقارير الفصلية", quantity: 4, unit_price: 750 },
        ],
        validity_days: 30,
        payment_terms: "أتعاب شهرية مقدماً خلال أول 5 أيام من كل شهر.",
      },
    },
    {
      id: "svc-con-annual",
      templateType: "CON",
      title: "عقد خدمات سنوي",
      description: "تقديم خدمات مهنية لمدة سنة",
      data: {
        work_description: "تقديم خدمات مهنية متخصصة وفق نطاق العمل المتفق عليه، تشمل الاستشارة، التنفيذ، والمتابعة الدورية لكامل فترة العقد.",
        execution_period: "12 شهر من تاريخ التوقيع",
        warranty_terms: "نضمن جودة الخدمة المقدمة وفق المعايير المهنية المعتمدة، ونلتزم بمعالجة أي ملاحظات خلال 7 أيام عمل.",
      },
    },
    {
      id: "svc-rcp-project",
      templateType: "RCP",
      title: "وصل تسليم مشروع",
      description: "إثبات تسليم مخرجات مشروع للعميل",
      data: {
        receive_type: "وثائق",
        condition: "سليم",
        notes: "تم تسليم كافة مخرجات المشروع المتفق عليها بحالة كاملة وسليمة، ويعد هذا الوصل مخالصة عن مرحلة التسليم.",
      },
    },
  ],

  maintenance: [
    {
      id: "mnt-con-yearly",
      templateType: "CON",
      title: "عقد صيانة سنوي",
      description: "صيانة دورية لمدة سنة كاملة",
      data: {
        work_description: "تقديم خدمة صيانة دورية شاملة (وقائية وعلاجية) للمعدات/الأنظمة المذكورة بمعدل زيارة شهرية، مع توفير قطع الغيار الأساسية ضمن العقد.",
        execution_period: "12 شهر — زيارة شهرية",
        warranty_terms: "نضمن استجابة خلال 24 ساعة لأي عطل طارئ، وضمان قطع الغيار المركبة لمدة 90 يوماً.",
      },
    },
    {
      id: "mnt-quo-emergency",
      templateType: "QUO",
      title: "عرض صيانة طارئة",
      description: "عرض إصلاح عطل عاجل",
      data: {
        items: [
          { description: "كشف وتشخيص العطل",       quantity: 1, unit_price: 150 },
          { description: "قطع غيار (تقديري)",        quantity: 1, unit_price: 0 },
          { description: "أجور التركيب والتشغيل",    quantity: 1, unit_price: 250 },
        ],
        validity_days: 7,
        payment_terms: "نقداً عند انتهاء العمل ومعاينة العميل.",
      },
    },
    {
      id: "mnt-sup-spare",
      templateType: "SUP",
      title: "عقد توريد قطع غيار",
      description: "توريد قطع غيار حسب الحاجة",
      data: {
        items: [
          { description: "قطع غيار من النوع المعتمد", quantity: 0, unit_price: 0 },
        ],
        supply_terms: "توريد قطع الغيار خلال 48 ساعة من الطلب، الأسعار وفق قائمة الأسعار المعتمدة، الدفع شهري بفاتورة موحدة.",
      },
    },
  ],
};