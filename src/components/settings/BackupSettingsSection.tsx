import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Download, FileJson, FileSpreadsheet, Loader2, CheckCircle, Database, FileArchive, Layers } from "lucide-react";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import * as XLSX from "xlsx";

// جميع جداول بيانات المستأجر — RLS يحصر النتائج على بيانات المستخدم الحالي فقط
const BACKUP_TABLES: { key: string; label: string; scoped?: boolean }[] = [
  // المحاسبة الأساسية
  { key: "accounts", label: "شجرة الحسابات", scoped: true },
  { key: "transactions", label: "القيود المحاسبية", scoped: true },
  { key: "journal_books", label: "دفاتر اليومية", scoped: true },
  { key: "journal_templates", label: "قوالب القيود", scoped: true },
  { key: "fiscal_periods", label: "الفترات المحاسبية", scoped: true },
  { key: "opening_balance_batches", label: "دفعات الأرصدة الافتتاحية", scoped: true },
  { key: "opening_balance_entries", label: "بنود الأرصدة الافتتاحية", scoped: true },
  { key: "cost_centers", label: "مراكز التكلفة", scoped: true },
  { key: "financial_dimensions", label: "الأبعاد المالية", scoped: true },
  { key: "financial_dimension_values", label: "قيم الأبعاد المالية", scoped: true },
  // جهات الاتصال والعملاء والموردين
  { key: "contacts", label: "جهات الاتصال", scoped: true },
  { key: "suppliers", label: "الموردون" },
  // الفواتير والمبيعات
  { key: "invoices", label: "فواتير المبيعات", scoped: true },
  { key: "invoice_items", label: "بنود فواتير المبيعات" },
  { key: "purchase_invoices", label: "فواتير المشتريات", scoped: true },
  { key: "quotations", label: "عروض الأسعار", scoped: true },
  { key: "delivery_notes", label: "إشعارات التسليم", scoped: true },
  { key: "recurring_invoices", label: "الفواتير المتكررة", scoped: true },
  { key: "returns", label: "المرتجعات", scoped: true },
  { key: "return_items", label: "بنود المرتجعات" },
  // السندات والمدفوعات
  { key: "receipt_vouchers", label: "سندات القبض", scoped: true },
  { key: "vouchers", label: "سندات الصرف والقيد" },
  { key: "payment_invoice_links", label: "روابط الدفعات بالفواتير" },
  // الشيكات
  { key: "cheques", label: "الشيكات", scoped: true },
  { key: "cheque_status_history", label: "تاريخ حالات الشيكات", scoped: true },
  // البنوك والصناديق
  { key: "bank_accounts", label: "الحسابات البنكية", scoped: true },
  { key: "cash_boxes", label: "الصناديق", scoped: true },
  { key: "cash_transfers", label: "التحويلات النقدية", scoped: true },
  { key: "currencies", label: "العملات", scoped: true },
  { key: "exchange_rates", label: "أسعار الصرف", scoped: true },
  { key: "currency_conversions", label: "تحويلات العملات", scoped: true },
  // المخزون والمنتجات
  { key: "products", label: "المنتجات", scoped: true },
  { key: "item_categories", label: "تصنيفات الأصناف", scoped: true },
  { key: "product_units", label: "وحدات المنتجات", scoped: true },
  { key: "product_barcodes", label: "باركود المنتجات", scoped: true },
  { key: "product_price_tiers", label: "شرائح أسعار المنتجات", scoped: true },
  { key: "warehouses", label: "المستودعات", scoped: true },
  { key: "product_warehouse_settings", label: "إعدادات مستودع المنتج", scoped: true },
  { key: "inventory_catalog_items", label: "كتالوج أصناف الجرد" },
  { key: "batch_movements", label: "حركات الدفعات" },
  { key: "stockout_alerts", label: "تنبيهات نفاد المخزون", scoped: true },
  { key: "product_supplier_aliases", label: "أسماء الموردين للمنتجات", scoped: true },
  { key: "product_modifier_groups", label: "ربط الإضافات بالمنتجات" },
  { key: "modifier_groups", label: "مجموعات الإضافات", scoped: true },
  { key: "modifier_options", label: "خيارات الإضافات" },
  { key: "import_costs", label: "تكاليف الاستيراد" },
  { key: "import_shipment_items", label: "بنود شحنات الاستيراد" },
  { key: "stock_movements", label: "حركات المخزون" },
  { key: "stock_transfers", label: "التحويلات المخزنية", scoped: true },
  { key: "stock_transfer_items", label: "بنود التحويلات المخزنية" },
  { key: "inventory_period_counts", label: "جرد نهاية المدة", scoped: true },
  { key: "import_shipments", label: "شحنات الاستيراد", scoped: true },
  // الأصول
  { key: "assets", label: "الأصول الثابتة", scoped: true },
  { key: "asset_categories", label: "فئات الأصول", scoped: true },
  { key: "asset_depreciation_entries", label: "قيود الإهلاك", scoped: true },
  { key: "asset_disposals", label: "استبعاد الأصول", scoped: true },
  { key: "asset_maintenance", label: "صيانة الأصول", scoped: true },
  { key: "asset_transfers", label: "تحويلات الأصول", scoped: true },
  { key: "asset_revaluations", label: "إعادة تقييم الأصول", scoped: true },
  // الموارد البشرية
  { key: "employees", label: "الموظفون", scoped: true },
  { key: "departments", label: "الأقسام", scoped: true },
  { key: "job_titles", label: "المسميات الوظيفية", scoped: true },
  { key: "employee_payroll", label: "الرواتب", scoped: true },
  { key: "payroll_batches", label: "دفعات الرواتب", scoped: true },
  { key: "employee_advances", label: "السلف", scoped: true },
  { key: "employee_advance_installments", label: "أقساط السلف" },
  { key: "employee_deductions", label: "الاستقطاعات", scoped: true },
  { key: "employee_allowances", label: "البدلات", scoped: true },
  { key: "employee_loans", label: "القروض", scoped: true },
  { key: "loan_installments", label: "أقساط القروض" },
  { key: "employee_leaves", label: "الإجازات" },
  { key: "employee_forms", label: "نماذج الموظفين", scoped: true },
  { key: "employee_financial_movements", label: "الحركات المالية للموظفين", scoped: true },
  { key: "attendance_days", label: "أيام الحضور" },
  { key: "attendance_events", label: "أحداث الحضور" },
  { key: "attendance_breaks", label: "استراحات الحضور" },
  { key: "commissions", label: "العمولات", scoped: true },
  // الطلبات وخدمة العملاء
  { key: "orders", label: "الطلبات" },
  { key: "order_items", label: "بنود الطلبات" },
  { key: "order_status_log", label: "سجل حالات الطلبات" },
  { key: "call_center_orders", label: "طلبات مركز الاتصال", scoped: true },
  { key: "delivery_zones", label: "مناطق التوصيل", scoped: true },
  // نقطة البيع
  { key: "pos_orders", label: "طلبات نقطة البيع", scoped: true },
  { key: "pos_order_lines", label: "بنود طلبات POS", scoped: true },
  { key: "pos_payments", label: "مدفوعات نقطة البيع", scoped: true },
  { key: "pos_order_discounts", label: "خصومات طلبات POS", scoped: true },
  { key: "pos_sessions", label: "جلسات نقطة البيع", scoped: true },
  { key: "pos_shift_audits", label: "تدقيق العهدات", scoped: true },
  { key: "pos_shift_foreign_adjustments", label: "تسويات العملات في العهدات", scoped: true },
  { key: "pos_expenses", label: "مصاريف نقطة البيع", scoped: true },
  { key: "pos_expense_categories", label: "فئات مصاريف POS", scoped: true },
  { key: "pos_categories", label: "فئات نقطة البيع", scoped: true },
  { key: "pos_customers", label: "عملاء نقطة البيع", scoped: true },
  { key: "pos_devices", label: "أجهزة نقطة البيع", scoped: true },
  { key: "pos_terminals", label: "طرفيات نقطة البيع", scoped: true },
  { key: "pos_printers", label: "طابعات نقطة البيع", scoped: true },
  { key: "pos_users", label: "مستخدمو نقطة البيع", scoped: true },
  { key: "pos_cancel_reasons", label: "أسباب إلغاء POS", scoped: true },
  { key: "pos_inventory_movements", label: "حركات مخزون POS", scoped: true },
  { key: "pos_purchases", label: "مشتريات POS", scoped: true },
  { key: "pos_suppliers", label: "موردو POS", scoped: true },
  // الفروع والإعدادات
  { key: "branches", label: "الفروع", scoped: true },
  { key: "company_settings", label: "إعدادات الشركة", scoped: true },
  { key: "tax_settings", label: "إعدادات الضريبة", scoped: true },
  { key: "tax_ledger", label: "سجل الضريبة", scoped: true },
  // CRM
  { key: "crm_leads", label: "العملاء المحتملون", scoped: true },
  { key: "crm_opportunities", label: "الفرص البيعية", scoped: true },
  { key: "crm_activities", label: "أنشطة CRM", scoped: true },
  // المشاريع والمقاولات
  { key: "contractor_projects", label: "مشاريع المقاولات", scoped: true },
  { key: "contractor_transactions", label: "حركات المقاولات", scoped: true },
  { key: "project_contracts", label: "عقود المشاريع", scoped: true },
  // الإنتاج
  { key: "production_orders", label: "أوامر الإنتاج", scoped: true },
  { key: "production_formulas", label: "صيغ الإنتاج", scoped: true },
  // التسلسلات والوثائق
  { key: "invoice_sequences", label: "تسلسلات الفواتير", scoped: true },
  { key: "document_sequences", label: "تسلسلات المستندات", scoped: true },
  // إضافات المالية والمستندات
  { key: "voucher_lines", label: "بنود السندات" },
  { key: "journal_book_sequences", label: "تسلسلات دفاتر اليومية" },
  { key: "invoice_activity_log", label: "سجل حركة الفواتير", scoped: true },
  { key: "subledger_integrity_corrections", label: "تصحيحات الأستاذ المساعد", scoped: true },
  { key: "tax_categories", label: "فئات الضريبة", scoped: true },
  { key: "shared_statements", label: "كشوف الحساب المشاركة", scoped: true },
  { key: "delivery_note_items", label: "بنود إشعارات التسليم" },
  { key: "contact_class_policies", label: "سياسات تصنيف جهات الاتصال", scoped: true },
  { key: "document_edit_history", label: "سجل تعديل المستندات", scoped: true },
  { key: "print_documents", label: "قوالب الطباعة", scoped: true },
  // نقطة البيع — تفاصيل إضافية
  { key: "order_item_modifiers", label: "إضافات بنود الطلبات" },
  { key: "kitchen_tickets", label: "تذاكر المطبخ", scoped: true },
  { key: "kitchen_stations", label: "محطات المطبخ", scoped: true },
  { key: "kds_call_events", label: "أحداث نداء الطلبات" },
  { key: "pos_category_print_rules", label: "قواعد طباعة التصنيفات", scoped: true },
  { key: "pos_order_tracking", label: "تتبع طلبات POS", scoped: true },
  { key: "pos_order_item_tracking", label: "تتبع بنود طلبات POS", scoped: true },
  { key: "pos_price_change_log", label: "سجل تغيير الأسعار POS", scoped: true },
  { key: "pos_shift_post_close_edits", label: "تعديلات ما بعد إغلاق الوردية" },
  { key: "pos_sensitive_actions_log", label: "سجل الإجراءات الحساسة POS" },
  { key: "pos_user_permissions", label: "صلاحيات مستخدمي POS", scoped: true },
  { key: "pos_audit_log", label: "سجل تدقيق POS", scoped: true },
  { key: "pos_product_force_stations", label: "توجيه المنتجات للمحطات", scoped: true },
  { key: "pos_display_devices", label: "شاشات العرض" },
  { key: "pos_companies", label: "شركات POS", scoped: true },
  { key: "restaurant_sections", label: "أقسام المطعم", scoped: true },
  { key: "restaurant_tables", label: "طاولات المطعم", scoped: true },
  { key: "kiosk_settings", label: "إعدادات الكشك", scoped: true },
  // الموارد البشرية — إضافات
  { key: "attendance_audit_logs", label: "سجل تدقيق الحضور" },
  { key: "attendance_event_verifications", label: "توثيق بصمات الحضور", scoped: true },
  { key: "attendance_derived_gap_dismissals", label: "استثناءات فجوات الحضور" },
  { key: "correction_requests", label: "طلبات تصحيح الحضور" },
  { key: "daily_roster", label: "جدول المناوبات اليومي" },
  { key: "work_shifts", label: "الورديات", scoped: true },
  { key: "shift_templates", label: "قوالب الورديات" },
  { key: "hr_day_types", label: "أنواع أيام العمل", scoped: true },
  { key: "hr_work_week_config", label: "إعداد أسبوع العمل", scoped: true },
  { key: "hr_payroll_policies", label: "سياسات الرواتب" },
  { key: "hr_payroll_components", label: "مكونات الراتب" },
  { key: "hr_deduction_adjustments", label: "تعديلات الخصومات", scoped: true },
  { key: "hr_deduction_exclusions", label: "استثناءات الخصومات", scoped: true },
  { key: "monthly_payroll_inputs", label: "مدخلات الرواتب الشهرية" },
  { key: "payroll_settings", label: "إعدادات الرواتب" },
  { key: "employee_payroll_profile", label: "ملف راتب الموظف" },
  { key: "employee_allowed_branches", label: "فروع الموظف المسموحة", scoped: true },
  { key: "employee_hr_records", label: "سجلات الموارد البشرية", scoped: true },
  { key: "employee_policy_documents", label: "وثائق السياسات", scoped: true },
  { key: "employee_form_approvals", label: "اعتمادات النماذج" },
  { key: "employee_form_audit_log", label: "سجل تدقيق النماذج", scoped: true },
  { key: "form_templates", label: "قوالب النماذج", scoped: true },
  { key: "form_template_assignments", label: "إسناد قوالب النماذج", scoped: true },
  { key: "form_section_assignments", label: "إسناد أقسام النماذج", scoped: true },
  { key: "leave_day_reversals", label: "عكوسات أيام الإجازات", scoped: true },
  { key: "official_holidays", label: "العطل الرسمية", scoped: true },
  { key: "termination_records", label: "سجلات إنهاء الخدمة", scoped: true },
  { key: "financial_claims", label: "المطالبات المالية", scoped: true },
  { key: "hr_chat_threads", label: "محادثات الموارد البشرية" },
  { key: "hr_chat_messages", label: "رسائل محادثات الموارد البشرية" },
  { key: "training_courses", label: "الدورات التدريبية", scoped: true },
  { key: "training_lessons", label: "دروس التدريب", scoped: true },
  { key: "training_enrollments", label: "تسجيلات التدريب", scoped: true },
  { key: "training_quiz_questions", label: "أسئلة اختبارات التدريب", scoped: true },
  { key: "iso_documents", label: "وثائق ISO", scoped: true },
  { key: "iso_manuals", label: "أدلة ISO", scoped: true },
  // العملاء والولاء والتسويق
  { key: "customer_complaints", label: "شكاوى الزبائن", scoped: true },
  { key: "customer_surveys", label: "استبيانات الزبائن", scoped: true },
  { key: "customer_wallets", label: "محافظ الزبائن", scoped: true },
  { key: "loyalty_programs", label: "برامج الولاء", scoped: true },
  { key: "loyalty_members", label: "أعضاء برنامج الولاء", scoped: true },
  { key: "feedback_customers", label: "زبائن المتابعة", scoped: true },
  { key: "feedback_calls", label: "مكالمات المتابعة", scoped: true },
  { key: "marketing_campaigns", label: "الحملات التسويقية" },
  { key: "marketing_campaign_sales", label: "مبيعات الحملات" },
  { key: "historical_sales_daily", label: "المبيعات اليومية التاريخية", scoped: true },
  { key: "crm_opportunity_stage_history", label: "تاريخ مراحل الفرص", scoped: true },
  { key: "call_center_order_edits", label: "تعديلات طلبات مركز الاتصال", scoped: true },
  { key: "delivery_apps", label: "تطبيقات التوصيل", scoped: true },
  { key: "wheels_branch_config", label: "إعداد Wheels للفروع", scoped: true },
  { key: "pbx_call_events", label: "أحداث المقسم الهاتفي", scoped: true },
  // الورش والمندوبين والمشتريات
  { key: "workshops", label: "الورش", scoped: true },
  { key: "workshop_costs", label: "تكاليف الورش", scoped: true },
  { key: "workshop_payments", label: "مدفوعات الورش", scoped: true },
  { key: "workshop_material_inventory", label: "مخزون مواد الورش", scoped: true },
  { key: "sales_representatives", label: "مندوبو المبيعات", scoped: true },
  { key: "van_sales_days", label: "أيام البيع المتنقل", scoped: true },
  { key: "procurement_orders", label: "طلبات الشراء", scoped: true },
  { key: "procurement_order_items", label: "بنود طلبات الشراء" },
  { key: "procurement_items", label: "أصناف المشتريات", scoped: true },
  // المستخدمون والصلاحيات والتنبيهات
  { key: "profiles", label: "ملفات المستخدمين", scoped: true },
  { key: "user_roles", label: "أدوار المستخدمين", scoped: true },
  { key: "user_feature_permissions", label: "صلاحيات الميزات" },
  { key: "user_app_access_overrides", label: "استثناءات الوصول للتطبيقات" },
  { key: "role_permissions", label: "صلاحيات الأدوار" },
  { key: "accountant_permissions", label: "صلاحيات المحاسبين", scoped: true },
  { key: "hr_manager_permissions", label: "صلاحيات مدير الموارد البشرية", scoped: true },
  { key: "branch_manager_assignments", label: "إسناد مدراء الفروع", scoped: true },
  { key: "company_themes", label: "هوية الشركة البصرية", scoped: true },
  { key: "notification_templates", label: "قوالب الإشعارات" },
  { key: "notification_log", label: "سجل الإشعارات", scoped: true },
  { key: "notification_broadcasts", label: "إشعارات جماعية" },
  { key: "internal_messages", label: "المراسلات الداخلية", scoped: true },
  { key: "internal_message_recipients", label: "مستلمو المراسلات", scoped: true },
  { key: "internal_message_replies", label: "ردود المراسلات", scoped: true },
  { key: "tasks", label: "المهام", scoped: true },
  { key: "task_users", label: "مستخدمو المهام", scoped: true },
  { key: "custom_reports", label: "التقارير المخصصة", scoped: true },
  { key: "custom_dashboards", label: "لوحات المعلومات المخصصة", scoped: true },
  { key: "dashboard_widgets", label: "عناصر لوحات المعلومات", scoped: true },
];

type TableDef = { key: string; label: string; scoped?: boolean };
type TableRows = { key: string; label: string; rows: any[] };

// تقييد فترة التصدير: يُطبَّق فقط على الجداول الحركية الضخمة (لها created_at)
const PERIOD_FILTERABLE = new Set([
  "transactions", "pos_orders", "pos_order_lines", "pos_payments", "pos_order_discounts",
  "order_items", "orders", "order_status_log", "invoice_items", "invoices",
  "purchase_invoices", "stock_movements", "attendance_events", "attendance_days",
  "attendance_breaks", "call_center_orders", "pos_inventory_movements", "kitchen_tickets",
  "receipt_vouchers", "vouchers", "payment_invoice_links",
  "order_item_modifiers", "pos_order_tracking", "pos_order_item_tracking",
  "pos_price_change_log", "marketing_campaign_sales", "notification_log",
  "attendance_audit_logs", "kds_call_events", "voucher_lines", "leave_day_reversals",
]);

// مجمّع تنفيذ متوازٍ بسقف ثابت — يمنع إغراق الخادم مع تسريع التصدير عدة أضعاف
// جداول تفصيلية ضخمة (مئات آلاف الصفوف) — لا تحمل معلومة مستقلة عن جداولها الأم
// (الطلبات/القيود موجودة أصلاً)، ولذلك تُستثنى افتراضياً لتسريع التصدير ومنع الأخطاء.
const HEAVY_DETAIL_TABLES = new Set([
  "order_item_modifiers",
  "pos_order_tracking",
  "pos_order_item_tracking",
  "pos_price_change_log",
  "order_status_log",
  "notification_log",
  "attendance_audit_logs",
  "kds_call_events",
]);

async function pool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// عدّ سريع (HEAD) لكل جدول — الجداول الفارغة تُستبعد فوراً بدل جلبها صفحة صفحة
async function countTable(t: TableDef, userId: string, since: string | null): Promise<number | null> {
  let q = supabase.from(t.key as any).select("id", { count: "exact", head: true });
  if (t.scoped) q = q.eq("user_id", userId);
  if (since && PERIOD_FILTERABLE.has(t.key)) q = q.gte("created_at", since);
  let { count, error } = await q;
  if (error) {
    // بعض الجداول بلا عمود id — أعد المحاولة بعدّ عام
    let q2 = supabase.from(t.key as any).select("*", { count: "exact", head: true });
    if (t.scoped) q2 = q2.eq("user_id", userId);
    if (since && PERIOD_FILTERABLE.has(t.key)) q2 = q2.gte("created_at", since);
    const r2 = await q2;
    if (r2.error) return null;
    count = r2.count;
  }
  return count ?? 0;
}

// جلب كامل جدول واحد بترتيب ثابت (بدون ORDER BY تصير الصفحات غير حتمية → تكرار/نقص صفوف)
async function fetchTable(
  t: TableDef,
  userId: string,
  since: string | null,
  knownTotal?: number | null,
): Promise<{ rows: any[]; failed: boolean }> {
  const usePeriod = !!since && PERIOD_FILTERABLE.has(t.key);

  // Keyset pagination (id > آخر قيمة) بدل OFFSET —
  // OFFSET العميق على جداول ضخمة (pos_payments/pos_order_lines) يجبر القاعدة
  // على مسح كل الصفوف السابقة في كل صفحة → "statement timeout".
  const build = (
    cursorCol: string | null,
    cursor: any,
    limit: number,
    offset: number,
  ) => {
    let q = supabase.from(t.key as any).select("*");
    if (cursorCol) {
      q = q.order(cursorCol, { ascending: true }).limit(limit);
      if (cursor != null) q = q.gt(cursorCol, cursor);
    } else {
      q = q.range(offset, offset + limit - 1);
    }
    if (t.scoped) q = q.eq("user_id", userId);
    if (usePeriod) q = q.gte("created_at", since as string);
    return q;
  };

  // اختيار عمود المؤشر: id ثم created_at ثم (بلا مؤشر) offset
  let cursorCol: string | null = "id";
  let probe = await build(cursorCol, null, 1, 0);
  if (probe.error) {
    cursorCol = "created_at";
    probe = await build(cursorCol, null, 1, 0);
    if (probe.error) cursorCol = null;
  }

  const rows: any[] = [];
  let failed = false;
  let cursor: any = null;
  let offset = 0;
  // الجداول الضخمة (مثل «إضافات بنود الطلبات» ~200 ألف صف) لها سياسات RLS
  // تستدعي دالة لكل صف، فالصفحة الكبيرة تتجاوز مهلة الاستعلام → نبدأ بصفحة صغيرة.
  // صفحة أكبر = عدد طلبات أقل بكثير؛ عند أي خطأ/مهلة نُنصّفها تلقائياً أدناه.
  let pageSize = knownTotal != null && knownTotal <= 1000 ? Math.max(knownTotal, 1) : 1000;

  for (let guard = 0; guard < 5000; guard++) {
    let page = await build(cursorCol, cursor, pageSize, offset);
    // إعادة محاولة تدريجية عند انتهاء المهلة: صفحة أصغر + مهلة انتظار قصيرة
    let attempts = 0;
    while (page.error && attempts < 6) {
      pageSize = Math.max(25, Math.floor(pageSize / 2));
      attempts++;
      await new Promise(r => setTimeout(r, 300 * attempts));
      page = await build(cursorCol, cursor, pageSize, offset);
    }
    if (page.error) {
      failed = true;
      console.warn(`[backup] page error ${t.key}:`, page.error.message);
      break;
    }
    const data = page.data || [];
    rows.push(...data);
    if (data.length < pageSize) break;
    if (cursorCol) {
      cursor = (data[data.length - 1] as any)?.[cursorCol];
      if (cursor == null) break;
    } else {
      offset += pageSize;
    }
    if (knownTotal != null && rows.length >= knownTotal + pageSize) break;
    // إفساح المجال للمتصفح كي لا تتجمّد الصفحة أثناء التصدير الطويل
    if ((guard & 7) === 7) await new Promise(r => setTimeout(r, 0));
  }

  return { rows, failed };
}

const BackupSettingsSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ table: string; done: boolean }[]>([]);
  const [phase, setPhase] = useState<string>("");
  const [months, setMonths] = useState<number>(0); // 0 = كل البيانات
  const [zipOutput, setZipOutput] = useState(true); // تنزيل الملف داخل أرشيف ZIP
  const [zipping, setZipping] = useState(false);
  // البيانات التفصيلية الضخمة — مطفأة افتراضياً
  const [includeHeavy, setIncludeHeavy] = useState(false);
  const selectedTables = includeHeavy
    ? BACKUP_TABLES
    : BACKUP_TABLES.filter(t => !HEAVY_DETAIL_TABLES.has(t.key));

  // تنزيل الملف كما هو، أو مضغوطاً داخل ZIP يحمل نفس الاسم
  const deliver = async (blob: Blob, fileName: string) => {
    if (!zipOutput) {
      saveAs(blob, fileName);
      return;
    }
    setZipping(true);
    setPhase("جارِ ضغط الملف (ZIP)...");
    try {
      const zip = new JSZip();
      zip.file(fileName, blob, { binary: true });
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      saveAs(zipBlob, fileName.replace(/\.(json|xlsx)$/i, "") + ".zip");
    } finally {
      setZipping(false);
    }
  };

  // 1) عدّ سريع متوازٍ لكل الجداول → استبعاد الفارغ.
  // 2) جلب الجداول غير الفارغة بالتوازي (سقف 4) وتسليمها للمستهلك ثم تحريرها فوراً.
  const streamTables = async (onTable: (t: TableRows) => Promise<void> | void) => {
    if (!user) return { totalRows: 0, failedTables: [] as string[], skipped: 0 };
    const since = months > 0
      ? new Date(Date.now() - months * 30.44 * 24 * 3600 * 1000).toISOString()
      : null;

    setPhase("فحص الجداول...");
    setProgress([]);
    const tables = selectedTables;
    const counts = await pool(tables, 10, t => countTable(t, user.id, since));

    const active: { t: TableDef; total: number | null }[] = [];
    let skipped = 0;
    tables.forEach((t, i) => {
      const c = counts[i];
      if (c === 0) { skipped++; return; }
      active.push({ t, total: c });
    });

    const progressList = active.map(a => ({ table: a.t.label, done: false }));
    setProgress([...progressList]);
    setPhase(`جارِ تصدير ${active.length} جدول (تم تخطي ${skipped} جدول فارغ)`);

    let totalRows = 0;
    const failedTables: string[] = [];
    let writing: Promise<void> = Promise.resolve();

    await pool(active, 4, async ({ t, total }, i) => {
      let rows: any[] = [];
      try {
        const res = await fetchTable(t, user.id, since, total);
        rows = res.rows;
        if (res.failed) failedTables.push(t.label);
      } catch (e) {
        console.warn(`[backup] error ${t.key}`, e);
        failedTables.push(t.label);
      }
      totalRows += rows.length;
      // الكتابة متسلسلة لضمان سلامة ملف JSON/ZIP رغم الجلب المتوازي
      writing = writing.then(async () => {
        await onTable({ key: t.key, label: t.label, rows });
        rows.length = 0; // تحرير فوري
        progressList[i].done = true;
        setProgress([...progressList]);
      });
      await writing;
    });

    await writing;
    return { totalRows, failedTables, skipped };
  };

  const getTimestamp = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const exportJSON = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // نبني الملف كأجزاء نصية — بدون تجميع كل البيانات في كائن/نص واحد ضخم
      // (هذا كان سبب خطأ "Invalid array length" عند الحسابات الكبيرة مثل الملكي).
      const parts: string[] = ["{"];
      const counts: Record<string, number> = {};
      let first = true;

      const { totalRows, failedTables, skipped } = await streamTables(({ key, rows }) => {
        counts[key] = rows.length;
        // تسلسل على دفعات: JSON.stringify لمصفوفة ضخمة وحدها قد يتجاوز حد النص في المتصفح
        parts.push(`${first ? "" : ","}${JSON.stringify(key)}:[`);
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500).map(r => JSON.stringify(r)).join(",");
          parts.push(i === 0 ? chunk : `,${chunk}`);
        }
        parts.push("]");
        first = false;
      });

      parts.push(
        `,"_meta":${JSON.stringify({
          exported_at: new Date().toISOString(),
          user_id: user.id,
          tables: Object.keys(counts).length,
          total_rows: totalRows,
          row_counts: counts,
        })}}`,
      );

      const blob = new Blob(parts, { type: "application/json" });
      parts.length = 0; // تحرير الذاكرة قبل الضغط
      await deliver(blob, `amwali_backup_${getTimestamp()}.json`);
      localStorage.setItem(`amwali_last_backup_${user.id}`, new Date().toISOString());

      toast({
        title: "تم تصدير النسخة الاحتياطية",
        description: `${totalRows} سجل في ${Object.keys(counts).length} جدول (تخطي ${skipped} فارغ)${failedTables.length ? ` — تعذّر جلب: ${failedTables.join("، ")}` : ""}`,
        variant: failedTables.length ? "destructive" : undefined,
      });
    } catch (err: any) {
      toast({ title: "خطأ في التصدير", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setProgress([]);
      setPhase("");
    }
  };

  // أرشيف ZIP فيه ملف CSV لكل جدول (يفتح مباشرة في Excel).
  // السبب: بناء ملف xlsx واحد بمئات آلاف الصفوف داخل المتصفح كان يستهلك
  // ذاكرة هائلة ويجمّد الصفحة ثم يفشل بـ "Invalid array length".
  const csvEscape = (v: any): string => {
    if (v == null) return "";
    let s: string;
    if (typeof v === "object") s = JSON.stringify(v);
    else s = String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rowsToCsv = (rows: any[]): string => {
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (!seen.has(k)) { seen.add(k); keys.push(k); }
      }
    }
    const parts: string[] = ["\uFEFF" + keys.join(",")];
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = rows.slice(i, i + 1000)
        .map(r => keys.map(k => csvEscape(r[k])).join(","))
        .join("\n");
      parts.push(chunk);
    }
    return parts.join("\n");
  };

  const exportExcel = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const zip = new JSZip();
      const summary: string[] = ["\uFEFFالجدول,المفتاح,عدد السجلات"];
      const used = new Set<string>();
      const fileName = (base: string) => {
        let n = base.replace(/[\\/:*?[\]"<>|]/g, "-").trim() || "table";
        let i = 2;
        while (used.has(n)) n = `${base}_${i++}`;
        used.add(n);
        return `${n}.csv`;
      };

      const { totalRows, failedTables, skipped } = await streamTables(async ({ key, label, rows }) => {
        summary.push(`${csvEscape(label)},${csvEscape(key)},${rows.length}`);
        if (rows.length === 0) return;
        zip.file(fileName(label || key), rowsToCsv(rows));
        await new Promise(r => setTimeout(r, 0)); // إفساح المجال للواجهة
      });

      zip.file("00_الملخص.csv", summary.join("\n"));

      setZipping(true);
      setPhase("جارِ ضغط الملفات (ZIP)...");
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      setZipping(false);
      saveAs(zipBlob, `amwali_backup_${getTimestamp()}.zip`);
      localStorage.setItem(`amwali_last_backup_${user.id}`, new Date().toISOString());

      toast({
        title: "تم تصدير النسخة الاحتياطية",
        description: `${totalRows} سجل (تخطي ${skipped} جدول فارغ) — أرشيف ZIP فيه ملف CSV لكل جدول${failedTables.length ? ` — تعذّر جلب: ${failedTables.join("، ")}` : ""}`,
        variant: failedTables.length ? "destructive" : undefined,
      });
    } catch (err: any) {
      toast({ title: "خطأ في التصدير", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setProgress([]);
      setPhase("");
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          النسخ الاحتياطي
        </h3>
        <p className="text-sm text-muted-foreground">
          تصدير كامل لبيانات شركتك فقط كملف محلي على جهازك — بيانات الشركات والمستخدمين الآخرين مستثناة تلقائياً بواسطة سياسات الأمان (RLS).
          يشمل جميع الحركات: القيود، الفواتير، السندات، الشيكات، المخزون، الأصول، الرواتب، نقطة البيع، والمزيد.
        </p>
      </div>

      <Separator />

      {/* فترة التصدير */}
      <div className="space-y-2">
        <p className="text-sm font-medium">فترة الحركات</p>
        <p className="text-xs text-muted-foreground">
          البيانات الأساسية (الحسابات، المنتجات، الموظفون، الإعدادات) تُصدَّر كاملة دائماً. الاختيار يحدّ الجداول الحركية الضخمة فقط (نقطة البيع، القيود، الفواتير، الحضور) — ويختصر وقت التصدير كثيراً.
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { v: 3, l: "آخر 3 أشهر" },
            { v: 12, l: "آخر سنة" },
            { v: 0, l: "كل البيانات" },
          ].map(o => (
            <Button
              key={o.v}
              type="button"
              size="sm"
              variant={months === o.v ? "default" : "outline"}
              disabled={loading}
              onClick={() => setMonths(o.v)}
            >
              {o.l}
            </Button>
          ))}
        </div>
      </div>

      {/* خيار الضغط */}
      <div className="flex items-center justify-between gap-4 border rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <FileArchive className="w-4 h-4 text-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">تحميل كملف مضغوط (ZIP)</p>
            <p className="text-xs text-muted-foreground">
              يُوضع ملف Excel أو JSON داخل أرشيف ZIP — حجم أصغر بكثير وتنزيل أسرع.
            </p>
          </div>
        </div>
        <Switch id="zip-output" checked={zipOutput} disabled={loading} onCheckedChange={setZipOutput} />
        <Label htmlFor="zip-output" className="sr-only">تحميل مضغوط</Label>
      </div>

      {/* البيانات التفصيلية الضخمة */}
      <div className="flex items-center justify-between gap-4 border rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4 text-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">تضمين البيانات التفصيلية الضخمة</p>
            <p className="text-xs text-muted-foreground">
              جداول مثل «إضافات بنود الطلبات» وسجلات التتبع والإشعارات (مئات آلاف الصفوف). مطفأ افتراضياً لأن بياناتها تفصيلية تابعة للطلبات، وتشغيله يُبطئ التصدير كثيراً.
            </p>
          </div>
        </div>
        <Switch id="heavy-tables" checked={includeHeavy} disabled={loading} onCheckedChange={setIncludeHeavy} />
        <Label htmlFor="heavy-tables" className="sr-only">البيانات التفصيلية الضخمة</Label>
      </div>

      {/* Export Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* JSON */}
        <div className="border rounded-xl p-5 space-y-3 bg-muted/20 hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <FileJson className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">تصدير JSON</p>
              <p className="text-xs text-muted-foreground">ملف منظم قابل لإعادة الاستيراد</p>
            </div>
          </div>
          <Button onClick={exportJSON} disabled={loading || zipping} className="w-full gap-2" variant="outline">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {zipOutput ? "تحميل JSON (ZIP)" : "تحميل JSON"}
          </Button>
        </div>

        {/* Excel */}
        <div className="border rounded-xl p-5 space-y-3 bg-muted/20 hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">تصدير Excel</p>
              <p className="text-xs text-muted-foreground">أرشيف ZIP: ملف CSV لكل جدول يفتح بـ Excel</p>
            </div>
          </div>
          <Button onClick={exportExcel} disabled={loading || zipping} className="w-full gap-2" variant="outline">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            تحميل Excel (ZIP)
          </Button>
        </div>
      </div>

      {/* Progress */}
      {(loading || zipping || progress.length > 0) && (
        <div className="border rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <Database className="w-4 h-4" />
            {phase || "جارِ تصدير البيانات..."}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
            {progress.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                {p.done ? (
                  <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
                ) : (
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />
                )}
                <span className={p.done ? "text-muted-foreground" : "text-foreground"}>{p.table}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Tables included */}
      <div>
        <p className="text-sm font-medium mb-3">الجداول المشمولة ({selectedTables.length})</p>
        <div className="flex flex-wrap gap-2">
          {selectedTables.map(t => (
            <Badge key={t.key} variant="secondary" className="text-xs">{t.label}</Badge>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BackupSettingsSection;
