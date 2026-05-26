/**
 * Central registry of all in-app permissions (Phase 1).
 * Each app declares its features and each feature declares its permissions.
 * Used by:
 *  - UserAppAccessDialog → renders the override grid
 *  - usePermission hook  → derives effective state
 *  - has_feature_permission() DB RPC → server enforcement
 *
 * Adding a permission here = appears in UI immediately;
 * to make it effective, wrap the UI element with <Can> and add a server check.
 */

export interface PermissionDef {
  key: string;   // 'view', 'create', 'discount', ...
  label: string; // Arabic display
}

export interface FeatureDef {
  key: string;   // 'invoices', 'sell', 'users'
  label: string;
  permissions: PermissionDef[];
}

export interface AppPermissionsDef {
  app_key: string; // matches navigationConfig id
  label: string;
  features: FeatureDef[];
}

// shared permission shortcuts
const view   = { key: "view",   label: "مشاهدة" };
const create = { key: "create", label: "إضافة" };
const update = { key: "update", label: "تعديل" };
const del    = { key: "delete", label: "حذف" };
const print  = { key: "print",  label: "طباعة" };
const exp    = { key: "export", label: "تصدير" };
const cancel = { key: "cancel", label: "إلغاء/إبطال" };
const approve= { key: "approve",label: "اعتماد" };

export const APP_PERMISSIONS: AppPermissionsDef[] = [
  {
    app_key: "sales",
    label: "المبيعات",
    features: [
      { key: "invoices",  label: "فواتير المبيعات", permissions: [view, create, update, del, cancel, print, exp] },
      { key: "customers", label: "العملاء",          permissions: [view, create, update, del] },
    ],
  },
  {
    app_key: "purchases",
    label: "المشتريات",
    features: [
      { key: "purchase_invoices", label: "فواتير المشتريات", permissions: [view, create, update, del, cancel, print, exp] },
      { key: "suppliers",         label: "الموردون",         permissions: [view, create, update, del] },
    ],
  },
  {
    app_key: "pos",
    label: "نقطة البيع",
    features: [
      { key: "sell", label: "البيع", permissions: [
        view,
        { key: "create_order",  label: "إنشاء طلب" },
        { key: "discount",      label: "تطبيق خصم" },
        { key: "change_price",  label: "تغيير السعر" },
        { key: "refund",        label: "مرتجع" },
        { key: "open_drawer",   label: "فتح درج الكاش" },
        { key: "close_shift",   label: "إغلاق الوردية" },
        { key: "print_receipt", label: "طباعة الفاتورة" },
      ]},
      { key: "kds", label: "شاشة المطبخ", permissions: [{ key: "manage", label: "إدارة" }] },
    ],
  },
  {
    app_key: "inventory",
    label: "المخزون",
    features: [
      { key: "products",        label: "المنتجات",      permissions: [view, create, update, del] },
      { key: "stock_movements", label: "حركات المخزون", permissions: [view, { key: "adjust", label: "تسوية" }] },
    ],
  },
  {
    app_key: "finance",
    label: "المالية",
    features: [
      { key: "receipts", label: "سندات القبض",  permissions: [view, create, update, del, print] },
      { key: "payments", label: "سندات الصرف",  permissions: [view, create, update, del, print] },
      { key: "journal",  label: "دفتر اليومية", permissions: [view, create, update, del, approve] },
    ],
  },
  {
    app_key: "settings",
    label: "الإعدادات",
    features: [
      { key: "users",            label: "إدارة المستخدمين",     permissions: [{ key: "manage", label: "إدارة" }] },
      { key: "roles",            label: "إدارة الأدوار",        permissions: [{ key: "manage", label: "إدارة" }] },
      { key: "company",          label: "إعدادات الشركة",       permissions: [{ key: "update", label: "تعديل" }] },
      { key: "pos_settings",     label: "إعدادات نقطة البيع",   permissions: [{ key: "update", label: "تعديل" }] },
      { key: "app_permissions",  label: "صلاحيات التطبيقات",    permissions: [{ key: "manage", label: "إدارة" }] },
    ],
  },
  {
    app_key: "call_center_feedback",
    label: "متابعة الزبائن (كول سنتر)",
    features: [
      { key: "customers", label: "الزبائن",   permissions: [view, create, { key: "edit", label: "تعديل" }] },
      { key: "calls",     label: "المكالمات", permissions: [view, create] },
    ],
  },
];

export const getAppPermissions = (appKey: string): AppPermissionsDef | undefined =>
  APP_PERMISSIONS.find(a => a.app_key === appKey);

export const getAllPermissionKeys = (appKey: string): Array<{ feature: string; perm: string }> => {
  const app = getAppPermissions(appKey);
  if (!app) return [];
  return app.features.flatMap(f => f.permissions.map(p => ({ feature: f.key, perm: p.key })));
};