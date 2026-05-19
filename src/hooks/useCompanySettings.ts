import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface CompanySettings {
  id?: string;
  user_id?: string;
  // Company Info
  company_name: string;
  logo_url: string;
  address: string;
  city: string;
  phone: string;
  phone2: string;
  email: string;
  website: string;
  tax_number: string;
  commercial_register: string;
  licensed_dealer_number: string;
  // Currency
  base_currency: string;
  extra_currencies: string[];
  exchange_rate_source: string;
  calendar_type: string;
  fiscal_year_start: number;
  // Default Accounts
  default_revenue_account: string;
  default_expense_account: string;
  default_cash_account: string;
  default_bank_account: string;
  default_receivable_account: string;
  default_payable_account: string;
  // Tax
  vat_enabled: boolean;
  vat_rate: number;
  vat_inclusive: boolean;
  vat_sales_account: string;
  vat_purchases_account: string;
  income_tax_enabled: boolean;
  income_tax_rate: number;
  // Document Numbering
  invoice_prefix: string;
  receipt_prefix: string;
  payment_prefix: string;
  journal_prefix: string;
  purchase_order_prefix: string;
  reset_numbering_yearly: boolean;
  // Period
  period_lock_mode: string;
  last_locked_period: string;
  // Invoice
  default_payment_terms: string;
  default_invoice_currency: string;
  default_invoice_language: string;
  invoice_default_notes: string;
  show_bank_on_invoice: boolean;
  show_tax_on_invoice: boolean;
  allow_invoice_edit_after_approval: boolean;
  allow_discount: boolean;
  max_discount_percent: number;
  e_invoice_enabled: boolean;
  // Invoice Template
  invoice_header_layout: string;
  invoice_primary_color: string;
  invoice_show_signature: boolean;
  invoice_show_tax_summary: boolean;
  invoice_show_amount_words: boolean;
  invoice_show_due_date: boolean;
  invoice_footer_message: string;
  // POS
  pos_name: string;
  pos_branch_id: string;
  pos_payment_methods: string[];
  pos_require_shift: boolean;
  pos_default_opening_balance: number;
  pos_deficit_alert: boolean;
  pos_deficit_threshold: number;
  pos_receipt_size: string;
  pos_auto_print: boolean;
  pos_show_tax: boolean;
  pos_receipt_copies: number;
  pos_auto_update_stock: boolean;
  pos_warn_out_of_stock: boolean;
  pos_prevent_zero_stock: boolean;
  pos_day_cutoff_hour: number;
  pos_disable_cogs: boolean;
  pos_disable_stock_deduction: boolean;
  pos_require_device_fingerprint: boolean;
  pos_allow_order_transfer: boolean;
  pos_require_cash_box: boolean;
  pos_show_return_policy: boolean;
  pos_return_policy_days: number;
  pos_kitchen_ticket_size: string;
  pos_kitchen_auto_print: boolean;
  // POS — KDS & Customer Display
  pos_kds_enabled: boolean;
  pos_customer_display_enabled: boolean;
  pos_voice_call_enabled: boolean;
  pos_voice_language: string;
  pos_voice_template: string;
  pos_ready_auto_hide_seconds: number;
  pos_call_repeat_seconds: number;
  pos_call_number_strategy: string;
  pos_kds_auto_preparing: boolean;
  // Print
  primary_color: string;
  invoice_font: string;
  paper_size: string;
  show_logo_on_invoice: boolean;
  show_address_on_invoice: boolean;
  print_decorative_ornaments: boolean;
  invoice_footer: string;
  // Inventory
  inventory_costing_method: string;
  inventory_default_unit: string;
  inventory_low_stock_alert: boolean;
  inventory_default_min_qty: number;
  inventory_default_max_qty: number;
  inventory_expiry_alert: boolean;
  inventory_expiry_days: number;
  inventory_auto_barcode: boolean;
  inventory_allow_no_barcode: boolean;
  // HR
  hr_work_days_per_week: number;
  hr_daily_hours: number;
  hr_shift_start: string;
  hr_shift_end: string;
  hr_late_grace_minutes: number;
  hr_require_qr: boolean;
  hr_require_gps: boolean;
  hr_annual_leave_days: number;
  hr_sick_leave_days: number;
  hr_carry_over_leave: boolean;
  hr_salary_day: number;
  hr_salary_currency: string;
  hr_social_security: boolean;
  // Security
  security_session_timeout: number;
  security_warning_minutes: number;
  security_2fa_enabled: boolean;
  security_passkeys_enabled: boolean;
  security_ip_restrict: boolean;
  security_allowed_ips: string;
  security_lockout_enabled: boolean;
  security_max_attempts: number;
  security_audit_log: boolean;
  security_new_device_alert: boolean;
  // Generic extra fields (notifications, integrations, AI)
  [key: string]: any;
}

const defaultSettings: CompanySettings = {
  company_name: "",
  logo_url: "",
  address: "",
  city: "",
  phone: "",
  phone2: "",
  email: "",
  website: "",
  tax_number: "",
  commercial_register: "",
  licensed_dealer_number: "",
  base_currency: "ILS",
  extra_currencies: ["USD", "JOD"],
  exchange_rate_source: "auto",
  calendar_type: "gregorian",
  fiscal_year_start: 1,
  default_revenue_account: "4100",
  default_expense_account: "5100",
  default_cash_account: "1110",
  default_bank_account: "1120",
  default_receivable_account: "1130",
  default_payable_account: "2110",
  vat_enabled: true,
  vat_rate: 16,
  vat_inclusive: false,
  vat_sales_account: "",
  vat_purchases_account: "",
  income_tax_enabled: false,
  income_tax_rate: 5,
  invoice_prefix: "INV",
  receipt_prefix: "REC",
  payment_prefix: "PAY",
  journal_prefix: "JV",
  purchase_order_prefix: "PO",
  reset_numbering_yearly: true,
  period_lock_mode: "auto",
  last_locked_period: "",
  default_payment_terms: "cash",
  default_invoice_currency: "ILS",
  default_invoice_language: "ar",
  invoice_default_notes: "شكراً لتعاملكم معنا",
  show_bank_on_invoice: true,
  show_tax_on_invoice: true,
  allow_invoice_edit_after_approval: false,
  allow_discount: true,
  max_discount_percent: 20,
  e_invoice_enabled: false,
  invoice_header_layout: "logo_center",
  invoice_primary_color: "#1B3A5C",
  invoice_show_signature: true,
  invoice_show_tax_summary: false,
  invoice_show_amount_words: true,
  invoice_show_due_date: true,
  invoice_footer_message: "شكراً لتعاملكم معنا",
  pos_name: "نقطة البيع الرئيسية",
  pos_branch_id: "",
  pos_payment_methods: ["cash", "network", "transfer", "credit"],
  pos_require_shift: true,
  pos_default_opening_balance: 500,
  pos_deficit_alert: true,
  pos_deficit_threshold: 50,
  pos_receipt_size: "80mm",
  pos_auto_print: true,
  pos_show_tax: true,
  pos_receipt_copies: 1,
  pos_auto_update_stock: true,
  pos_warn_out_of_stock: true,
  pos_prevent_zero_stock: false,
  pos_day_cutoff_hour: 6,
  pos_disable_cogs: false,
  pos_disable_stock_deduction: false,
  pos_require_device_fingerprint: false,
  pos_allow_order_transfer: false,
  pos_require_cash_box: false,
  pos_show_return_policy: true,
  pos_return_policy_days: 7,
  pos_kitchen_ticket_size: "58mm",
  pos_kds_enabled: false,
  pos_customer_display_enabled: false,
  pos_voice_call_enabled: true,
  pos_voice_language: "ar-PS",
  pos_voice_template: "طلب رقم {n}، تفضل للاستلام",
  pos_ready_auto_hide_seconds: 300,
  pos_call_repeat_seconds: 0,
  pos_call_number_strategy: "order_number",
  pos_kds_auto_preparing: true,
  pos_kitchen_auto_print: true,
  primary_color: "#22C55E",
  invoice_font: "classic",
  paper_size: "A4",
  show_logo_on_invoice: true,
  show_address_on_invoice: true,
  print_decorative_ornaments: false,
  invoice_footer: "شكراً لتعاملكم معنا",
  // Inventory
  inventory_costing_method: "weighted_avg",
  inventory_default_unit: "piece",
  inventory_low_stock_alert: true,
  inventory_default_min_qty: 5,
  inventory_default_max_qty: 1000,
  inventory_expiry_alert: false,
  inventory_expiry_days: 30,
  inventory_auto_barcode: true,
  inventory_allow_no_barcode: true,
  // HR
  hr_work_days_per_week: 6,
  hr_daily_hours: 8,
  hr_shift_start: "08:00",
  hr_shift_end: "16:00",
  hr_late_grace_minutes: 15,
  hr_require_qr: false,
  hr_require_gps: true,
  hr_annual_leave_days: 14,
  hr_sick_leave_days: 14,
  hr_carry_over_leave: false,
  hr_salary_day: 28,
  hr_salary_currency: "ILS",
  hr_social_security: false,
  // Security
  security_session_timeout: 30,
  security_warning_minutes: 2,
  security_2fa_enabled: false,
  security_passkeys_enabled: false,
  security_ip_restrict: false,
  security_allowed_ips: "",
  security_lockout_enabled: true,
  security_max_attempts: 5,
  security_audit_log: true,
  security_new_device_alert: true,
};

export function useCompanySettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<CompanySettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState<CompanySettings>(defaultSettings);
  const [resolvedOwnerId, setResolvedOwnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadSettings();
    // Depend on user id only — Supabase fires onAuthStateChange (INITIAL_SESSION,
    // TOKEN_REFRESHED, …) which produces a new User object identity for the same
    // user, causing duplicate fetches on page entry and on tab focus return.
  }, [user?.id]);

  const loadSettings = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Resolve the actual data owner (for team members)
      const { data: ownerIdResult } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
      const effectiveUserId = ownerIdResult || user.id;
      setResolvedOwnerId(effectiveUserId);

      const [settingsRes, profileRes, companyRes] = await Promise.all([
        supabase.from("company_settings" as any).select("*").eq("user_id", effectiveUserId).maybeSingle(),
        supabase.from("profiles" as any).select("display_name, company_name, company_id").eq("user_id", user.id).maybeSingle(),
        supabase.from("companies" as any).select("name, logo_url, email, phone, address").eq("owner_id", effectiveUserId).maybeSingle(),
      ]);

      if (settingsRes.error) throw settingsRes.error;

      const d = (settingsRes.data as any) || {};
      const profile = profileRes.data as any;
      const company = companyRes.data as any;

      // Fallback: use company/profile data if settings fields are empty
      const loaded: CompanySettings = {
        ...defaultSettings,
        ...d,
        company_name: d.company_name || company?.name || profile?.company_name || profile?.display_name || "",
        logo_url: d.logo_url || company?.logo_url || "",
        email: d.email || company?.email || user.email || "",
        phone: d.phone || company?.phone || "",
        address: d.address || company?.address || "",
        extra_currencies: Array.isArray(d.extra_currencies) ? d.extra_currencies : defaultSettings.extra_currencies,
        pos_payment_methods: Array.isArray(d.pos_payment_methods) ? d.pos_payment_methods : defaultSettings.pos_payment_methods,
      };
      setSettings(loaded);
      setOriginalSettings(loaded);
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = useCallback((partial: Partial<CompanySettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...partial };
      setHasChanges(JSON.stringify(updated) !== JSON.stringify(originalSettings));
      return updated;
    });
  }, [originalSettings]);

  // Known DB columns — payload must only include these
  const DB_COLUMNS = new Set([
    "company_name","logo_url","address","city","phone","phone2","email","website","tax_number",
    "commercial_register","base_currency","extra_currencies","exchange_rate_source",
    "calendar_type","fiscal_year_start","default_revenue_account","default_expense_account",
    "default_cash_account","default_bank_account","default_receivable_account","default_payable_account",
    "vat_enabled","vat_rate","vat_inclusive","vat_sales_account","vat_purchases_account",
    "income_tax_enabled","income_tax_rate","invoice_prefix","receipt_prefix","payment_prefix",
    "journal_prefix","purchase_order_prefix","reset_numbering_yearly","period_lock_mode",
    "last_locked_period","default_payment_terms","default_invoice_currency","default_invoice_language",
    "invoice_default_notes","show_bank_on_invoice","show_tax_on_invoice",
    "allow_invoice_edit_after_approval","allow_discount","max_discount_percent","e_invoice_enabled",
    "pos_name","pos_branch_id","pos_payment_methods","pos_require_shift",
    "pos_default_opening_balance","pos_deficit_alert","pos_deficit_threshold","pos_receipt_size",
    "pos_auto_print","pos_show_tax","pos_receipt_copies","pos_auto_update_stock",
    "pos_warn_out_of_stock","pos_prevent_zero_stock","primary_color","invoice_font","paper_size",
    "show_logo_on_invoice","show_address_on_invoice","invoice_footer","pos_day_cutoff_hour",
    "licensed_dealer_number","pos_disable_cogs","pos_disable_stock_deduction",
     "pos_require_device_fingerprint","pos_allow_order_transfer","pos_require_cash_box",
    "pos_show_return_policy","pos_return_policy_days",
    "pos_kitchen_ticket_size","pos_kitchen_auto_print","print_decorative_ornaments",
    "hr_annual_leave_days","hr_sick_leave_days","hr_carry_over_leave","hr_salary_day",
    "hr_salary_currency","hr_social_security","hr_require_qr","hr_require_gps",
    "hr_shift_start","hr_shift_end","hr_late_grace_minutes",
    "hr_work_days_per_week","hr_daily_hours",
    "onboarding_completed","onboarding_step","business_type","has_employees",
    "employee_count_range","has_pos","pos_count","inventory_method",
    "onboarding_skipped","onboarding_completed_at",
    "invoice_header_layout","invoice_primary_color","invoice_show_signature",
    "invoice_show_tax_summary","invoice_show_amount_words","invoice_show_due_date","invoice_footer_message",
    "can_edit_posted","can_delete_posted","card_bank_account_id",
    // Inventory
    "inventory_costing_method","inventory_default_unit","inventory_low_stock_alert",
    "inventory_default_min_qty","inventory_default_max_qty","inventory_expiry_alert",
    "inventory_expiry_days","inventory_auto_barcode","inventory_allow_no_barcode",
    // Sales Reps (Van Sales)
    "rep_allow_negative_stock","rep_disable_stock_deduction",
    // Security
    "security_session_timeout","security_warning_minutes","security_2fa_enabled",
    "security_passkeys_enabled","security_ip_restrict","security_allowed_ips",
    "security_lockout_enabled","security_max_attempts","security_audit_log",
    "security_new_device_alert",
  ]);

  const saveSettings = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const ownerId = resolvedOwnerId || user.id;
      const raw = settings as any;
      const UUID_COLUMNS = new Set([
        "updated_by", "pos_branch_id", "default_bank_account", "card_bank_account_id",
      ]);
      const payload: Record<string, any> = { user_id: ownerId, updated_by: user.id || null };
      for (const key of DB_COLUMNS) {
        if (key in raw) {
          if (UUID_COLUMNS.has(key) && raw[key] === "") {
            payload[key] = null;
          } else {
            payload[key] = raw[key];
          }
        }
      }

      // Check if exists
      const { data: existing } = await supabase
        .from("company_settings" as any)
        .select("id")
        .eq("user_id", ownerId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("company_settings" as any)
          .update(payload as any)
          .eq("user_id", ownerId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_settings" as any)
          .insert(payload as any);
        if (error) throw error;
      }

      setOriginalSettings(settings);
      setHasChanges(false);
      toast({ title: "تم الحفظ", description: "تم حفظ الإعدادات بنجاح" });
    } catch (err: any) {
      console.error("Failed to save settings:", err);
      toast({ title: "خطأ", description: err.message || "فشل حفظ الإعدادات", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setSettings(defaultSettings);
    setHasChanges(true);
  };

  return { settings, loading, saving, hasChanges, updateSettings, saveSettings, resetToDefaults, loadSettings };
}
