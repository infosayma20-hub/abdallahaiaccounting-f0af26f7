/**
 * Central declarative registry for granular team permissions.
 *
 * Single source of truth used by:
 *  - TeamAccountManager (create / edit accountants & HR managers)
 *  - UsersSettingsSection (Add user dialog + per-user permissions dialog)
 *  - UserPermissionsDialog
 *
 * Add a new permission ONCE here (plus the matching boolean column in
 * `accountant_permissions` / `hr_manager_permissions`) and it shows up
 * everywhere automatically.
 */

export interface PermItem {
  key: string;
  label: string;
  /** Optional hint shown under the toggle. */
  hint?: string;
}

export interface PermGroup {
  group: string;
  items: PermItem[];
}

export interface PermPreset {
  id: string;
  label: string;
  keys: string[];
}

/* ------------------------------------------------------------------ */
/*  Accountant permissions                                            */
/* ------------------------------------------------------------------ */

export const ACCOUNTANT_PERM_GROUPS: PermGroup[] = [
  { group: "السندات", items: [
    { key: "can_create_receipt", label: "إنشاء سندات قبض" },
    { key: "can_create_payment", label: "إنشاء سندات صرف" },
    { key: "can_create_journal", label: "إنشاء قيود يومية" },
    { key: "can_edit_vouchers", label: "تعديل السندات" },
    { key: "can_delete_vouchers", label: "حذف/إلغاء السندات" },
    { key: "can_create_credit_note", label: "إنشاء إشعار دائن" },
    { key: "can_create_debit_note", label: "إنشاء إشعار مدين" },
    { key: "can_create_reverse_entry", label: "إنشاء قيد عكسي (IFRS)" },
  ]},
  { group: "الفواتير", items: [
    { key: "can_create_sale_invoice", label: "إنشاء فواتير مبيعات" },
    { key: "can_create_purchase_invoice", label: "إنشاء فواتير مشتريات" },
    { key: "can_edit_invoices", label: "تعديل الفواتير" },
    { key: "can_delete_invoices", label: "حذف/إلغاء الفواتير" },
    { key: "can_manage_quotations", label: "إدارة عروض الأسعار" },
    { key: "can_manage_recurring_invoices", label: "إدارة الفواتير المتكررة" },
    { key: "can_manage_delivery_notes", label: "إدارة إرساليات المبيعات" },
    { key: "can_process_returns", label: "معالجة المرتجعات" },
  ]},
  { group: "جهات الاتصال", items: [
    { key: "can_manage_customers", label: "إدارة الزبائن" },
    { key: "can_manage_suppliers", label: "إدارة الموردين" },
    { key: "can_view_balances", label: "عرض الأرصدة" },
  ]},
  { group: "الحسابات والدفاتر", items: [
    { key: "can_manage_accounts", label: "تعريف/تعديل شجرة الحسابات" },
    { key: "can_view_ledger", label: "عرض دفتر الأستاذ" },
    { key: "can_view_trial_balance", label: "عرض ميزان المراجعة" },
    { key: "can_view_account_statement", label: "عرض كشف حساب" },
    { key: "can_manage_opening_balances", label: "إدارة الأرصدة الافتتاحية" },
    { key: "can_close_fiscal_period", label: "إغلاق/فتح الفترات المالية" },
    { key: "can_manage_cost_centers", label: "إدارة مراكز التكلفة" },
    { key: "can_manage_fixed_assets", label: "إدارة الأصول الثابتة" },
  ]},
  { group: "المنتجات والمخزون", items: [
    {
      key: "can_manage_products",
      label: "تعديل بطاقة الصنف",
      hint: "بدونها يستطيع المستخدم الاطلاع على بطاقة الصنف فقط دون إضافة أو تعديل أو حذف",
    },
    {
      key: "can_manage_inventory",
      label: "تعديل كميات المخزون",
      hint: "تسويات الكميات اليدوية من بطاقة الصنف أو شاشة المخزون",
    },
    { key: "can_transfer_stock", label: "نقل المخزون بين المستودعات" },
    { key: "can_manage_warehouses", label: "إدارة المستودعات" },
    {
      key: "can_view_all_warehouses_stock",
      label: "عرض مخزون جميع المستودعات (بدون تعديل)",
      hint: "يرى أرصدة كل المستودعات للاطلاع فقط، ويبقى التعديل محصوراً بالمستودعات المسموحة له",
    },
    {
      key: "can_manage_scoped_master_data",
      label: "إضافة زبائن/موردين/أصناف لمستودعه",
      hint: "إضافة بيانات أساسية مخصّصة لنطاق المستودع الخاص بالمستخدم",
    },
    { key: "can_manage_import_shipments", label: "إدارة الشحنات الواردة (استيراد)" },
  ]},
  { group: "الشيكات والبنوك", items: [
    { key: "can_manage_cheques", label: "إدارة الشيكات" },
    { key: "can_manage_banks", label: "إدارة الحسابات البنكية" },
    { key: "can_manage_cash_boxes", label: "إدارة الصناديق" },
    { key: "can_transfer_cash", label: "التحويلات النقدية بين الصناديق/البنوك" },
    { key: "can_endorse_cheques", label: "تظهير الشيكات" },
  ]},
  { group: "التقارير", items: [
    { key: "can_view_profit_loss", label: "قائمة الدخل" },
    { key: "can_view_balance_sheet", label: "الميزانية العمومية" },
    { key: "can_view_cash_flow", label: "قائمة التدفقات النقدية" },
    { key: "can_view_reports", label: "التقارير العامة" },
    { key: "can_export_data", label: "تصدير البيانات" },
  ]},
  { group: "الطلبيات", items: [
    { key: "can_manage_orders", label: "إدارة طلبيات الشراء" },
  ]},
  { group: "الضريبة (VAT)", items: [
    { key: "can_manage_vat", label: "إدارة ضريبة القيمة المضافة" },
    { key: "can_submit_vat", label: "تقديم إقرار VAT للسلطات" },
  ]},
  { group: "العملات والذكاء الاصطناعي", items: [
    { key: "can_manage_currencies", label: "إدارة العملات" },
    { key: "can_manage_exchange_rates", label: "إدارة أسعار الصرف" },
    { key: "can_approve_ai_drafts", label: "اعتماد مسودات حسيب AI" },
  ]},
];

/* ------------------------------------------------------------------ */
/*  HR permissions                                                    */
/* ------------------------------------------------------------------ */

export const HR_PERM_GROUPS: PermGroup[] = [
  { group: "الموظفين", items: [
    { key: "can_view_employees", label: "عرض قائمة الموظفين" },
    { key: "can_add_employees", label: "إضافة موظفين" },
    { key: "can_edit_employees", label: "تعديل بيانات الموظفين" },
    { key: "can_delete_employees", label: "حذف/أرشفة الموظفين" },
    { key: "can_view_salary_info", label: "عرض معلومات الرواتب" },
    { key: "can_view_employee_documents", label: "عرض مستندات الموظف" },
    { key: "can_edit_employee_documents", label: "تعديل/رفع مستندات الموظف" },
    { key: "can_view_employee_bank_info", label: "عرض البيانات البنكية" },
    { key: "can_view_employee_private_info", label: "عرض البيانات الشخصية الحساسة" },
  ]},
  { group: "الحضور", items: [
    { key: "can_view_attendance", label: "عرض الحضور" },
    { key: "can_manage_attendance", label: "إدارة الحضور والانصراف" },
    { key: "can_edit_attendance", label: "تعديل سجلات الحضور" },
    { key: "can_approve_attendance_corrections", label: "اعتماد طلبات تصحيح الحضور" },
    { key: "can_issue_penalties", label: "إصدار عقوبات/إنذارات" },
    { key: "can_manage_branches", label: "إدارة الأفرع" },
    { key: "can_view_gps_qr_details", label: "عرض تفاصيل GPS/QR" },
    { key: "can_export_attendance", label: "تصدير الحضور" },
  ]},
  { group: "الجدولة والورديات", items: [
    { key: "can_view_roster", label: "عرض جدول الدوام" },
    { key: "can_manage_schedule", label: "إدارة الجدول" },
    { key: "can_publish_roster", label: "نشر الجدول" },
    { key: "can_manage_shift_templates", label: "إدارة قوالب الورديات" },
    { key: "can_manage_day_types", label: "إدارة أنواع الأيام" },
  ]},
  { group: "الإجازات والطلبات", items: [
    { key: "can_view_leaves", label: "عرض الإجازات" },
    { key: "can_approve_leaves", label: "الموافقة على الإجازات" },
    { key: "can_manage_leave_policy", label: "إدارة سياسات الإجازات" },
    { key: "can_manage_holidays", label: "إدارة العطل الرسمية" },
    { key: "can_view_employee_requests", label: "عرض طلبات الموظفين" },
    { key: "can_approve_requests", label: "الموافقة/رفض طلبات الموظفين" },
    { key: "can_manage_forms", label: "إدارة نماذج الطلبات" },
  ]},
  { group: "الرواتب", items: [
    { key: "can_view_payroll", label: "عرض كشوف الرواتب" },
    { key: "can_preview_payroll", label: "معاينة كشف الرواتب" },
    { key: "can_process_payroll", label: "معالجة كشوف الرواتب" },
    { key: "can_approve_payroll", label: "اعتماد الرواتب" },
    { key: "can_pay_payroll", label: "صرف الرواتب" },
    { key: "can_manage_deductions", label: "إدارة الخصومات والبدلات" },
    { key: "can_manage_advances", label: "إدارة السلف" },
    { key: "can_manage_loans", label: "إدارة القروض" },
    { key: "can_view_staff_cost", label: "عرض إجمالي تكلفة الموظفين" },
  ]},
  { group: "التقارير", items: [
    { key: "can_view_hr_reports", label: "عرض تقارير HR العامة" },
    { key: "can_view_hr_payroll_reports", label: "تقارير الرواتب" },
    { key: "can_view_hr_attendance_reports", label: "تقارير الحضور" },
    { key: "can_view_hr_leave_reports", label: "تقارير الإجازات" },
    { key: "can_view_hr_staff_cost_reports", label: "تقارير تكلفة الموظفين" },
    { key: "can_export_hr_data", label: "تصدير بيانات HR" },
    { key: "can_print_hr_reports", label: "طباعة تقارير HR" },
  ]},
  { group: "الإعدادات وبوابة الموظفين", items: [
    { key: "can_manage_hr_settings", label: "تعديل إعدادات HR/الرواتب" },
    { key: "can_view_team_schedule_admin", label: "عرض جدول الفريق (إدارة)" },
    { key: "can_manage_team_schedule_visibility", label: "إدارة ظهور جدول الفريق" },
    { key: "can_view_employee_portal_links", label: "عرض روابط بوابة الموظفين" },
    { key: "can_reset_employee_passwords", label: "إعادة تعيين كلمات مرور الموظفين" },
  ]},
];

/* ------------------------------------------------------------------ */
/*  Presets                                                           */
/* ------------------------------------------------------------------ */

export const HR_PRESETS: PermPreset[] = [
  {
    id: "attendance_only",
    label: "تشغيل الحضور فقط",
    keys: [
      "can_view_employees",
      "can_view_attendance", "can_manage_attendance", "can_edit_attendance",
      "can_approve_attendance_corrections",
      "can_view_roster",
      "can_view_employee_requests", "can_approve_requests",
    ],
  },
  {
    id: "employees_attendance",
    label: "موظفون + حضور",
    keys: [
      "can_view_employees", "can_add_employees", "can_edit_employees",
      "can_view_employee_documents",
      "can_view_attendance", "can_manage_attendance", "can_edit_attendance",
      "can_approve_attendance_corrections", "can_issue_penalties",
      "can_view_roster", "can_manage_schedule", "can_publish_roster",
      "can_view_leaves", "can_approve_leaves",
      "can_view_employee_requests", "can_approve_requests",
      "can_view_hr_reports", "can_view_hr_attendance_reports", "can_view_hr_leave_reports",
    ],
  },
  {
    id: "hr_no_payroll",
    label: "HR كامل بدون رواتب",
    keys: [
      "can_view_employees", "can_add_employees", "can_edit_employees",
      "can_view_employee_documents", "can_edit_employee_documents",
      "can_view_attendance", "can_manage_attendance", "can_edit_attendance",
      "can_approve_attendance_corrections", "can_issue_penalties",
      "can_manage_branches", "can_view_gps_qr_details",
      "can_view_roster", "can_manage_schedule", "can_publish_roster",
      "can_manage_shift_templates", "can_manage_day_types",
      "can_view_leaves", "can_approve_leaves", "can_manage_leave_policy", "can_manage_holidays",
      "can_view_employee_requests", "can_approve_requests", "can_manage_forms",
      "can_view_hr_reports", "can_view_hr_attendance_reports", "can_view_hr_leave_reports",
      "can_view_employee_portal_links",
    ],
  },
  {
    id: "hr_full",
    label: "HR كامل مع الرواتب",
    keys: [
      "can_view_employees", "can_add_employees", "can_edit_employees",
      "can_view_employee_documents", "can_edit_employee_documents",
      "can_view_employee_bank_info",
      "can_view_salary_info",
      "can_view_attendance", "can_manage_attendance", "can_edit_attendance",
      "can_approve_attendance_corrections", "can_issue_penalties",
      "can_manage_branches", "can_view_gps_qr_details", "can_export_attendance",
      "can_view_roster", "can_manage_schedule", "can_publish_roster",
      "can_manage_shift_templates", "can_manage_day_types",
      "can_view_leaves", "can_approve_leaves", "can_manage_leave_policy", "can_manage_holidays",
      "can_view_employee_requests", "can_approve_requests", "can_manage_forms",
      "can_view_payroll", "can_preview_payroll", "can_process_payroll",
      "can_approve_payroll", "can_manage_deductions", "can_manage_advances", "can_manage_loans",
      "can_view_staff_cost",
      "can_view_hr_reports", "can_view_hr_payroll_reports", "can_view_hr_attendance_reports",
      "can_view_hr_leave_reports", "can_view_hr_staff_cost_reports",
      "can_export_hr_data", "can_print_hr_reports",
      "can_manage_hr_settings",
      "can_view_team_schedule_admin", "can_manage_team_schedule_visibility",
      "can_view_employee_portal_links", "can_reset_employee_passwords",
    ],
  },
];

const ACCOUNTANT_VIEW_ONLY = [
  "can_view_balances", "can_view_ledger", "can_view_trial_balance",
  "can_view_account_statement", "can_view_profit_loss", "can_view_balance_sheet",
  "can_view_cash_flow", "can_view_reports",
];

const ACCOUNTANT_SALES_KEYS = [
  ...ACCOUNTANT_VIEW_ONLY,
  "can_create_receipt", "can_create_sale_invoice", "can_edit_invoices",
  "can_manage_customers", "can_manage_quotations", "can_manage_delivery_notes",
  "can_process_returns", "can_manage_orders",
];

const ACCOUNTANT_PURCHASES_KEYS = [
  ...ACCOUNTANT_VIEW_ONLY,
  "can_create_payment", "can_create_purchase_invoice", "can_edit_invoices",
  "can_manage_suppliers", "can_manage_orders", "can_manage_import_shipments",
];

/** Everything except destructive / owner-only toggles and product-card edits. */
const ACCOUNTANT_SENIOR_KEYS = ACCOUNTANT_PERM_GROUPS
  .flatMap(g => g.items.map(i => i.key))
  .filter(k =>
    !k.includes("delete") &&
    k !== "can_close_fiscal_period" &&
    k !== "can_submit_vat" &&
    // product card & stock edits are OFF by default — owner grants explicitly
    k !== "can_manage_products" &&
    k !== "can_manage_inventory" &&
    k !== "can_manage_warehouses",
  );

export const ACCOUNTANT_PRESETS: PermPreset[] = [
  { id: "accountant_senior", label: "محاسب أول", keys: ACCOUNTANT_SENIOR_KEYS },
  { id: "accountant_sales", label: "محاسب مبيعات", keys: ACCOUNTANT_SALES_KEYS },
  { id: "accountant_purchases", label: "محاسب مشتريات", keys: ACCOUNTANT_PURCHASES_KEYS },
  { id: "accountant_readonly", label: "اطلاع فقط", keys: ACCOUNTANT_VIEW_ONLY },
];

const HR_DEFAULT_KEYS = HR_PRESETS.find(p => p.id === "employees_attendance")!.keys;

/** Which permission table + group set applies to an app role. */
export function permissionKindForRole(role: string): "accountant" | "hr_manager" | null {
  if (role?.startsWith("accountant_")) return "accountant";
  if (role === "hr_manager") return "hr_manager";
  return null;
}

export function permGroupsForKind(kind: "accountant" | "hr_manager"): PermGroup[] {
  return kind === "accountant" ? ACCOUNTANT_PERM_GROUPS : HR_PERM_GROUPS;
}

export function permTableForKind(kind: "accountant" | "hr_manager"): string {
  return kind === "accountant" ? "accountant_permissions" : "hr_manager_permissions";
}

export function allPermKeys(kind: "accountant" | "hr_manager"): string[] {
  return permGroupsForKind(kind).flatMap(g => g.items.map(i => i.key));
}

/** Build the default permission map for a role (used when creating a user). */
export function defaultPermsForRole(role: string): Record<string, boolean> {
  const kind = permissionKindForRole(role);
  if (!kind) return {};
  const on = new Set(
    kind === "hr_manager"
      ? HR_DEFAULT_KEYS
      : (ACCOUNTANT_PRESETS.find(p => p.id === role)?.keys ?? ACCOUNTANT_VIEW_ONLY),
  );
  const map: Record<string, boolean> = {};
  allPermKeys(kind).forEach(k => { map[k] = on.has(k); });
  return map;
}

export function presetsForKind(kind: "accountant" | "hr_manager"): PermPreset[] {
  return kind === "accountant" ? ACCOUNTANT_PRESETS : HR_PRESETS;
}
