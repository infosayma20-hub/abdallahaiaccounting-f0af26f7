/**
 * Source-string dictionary (Arabic → English / Hebrew).
 *
 * The app was written with Arabic strings inline. Instead of rewriting every
 * screen, render points call `tt(arabicText)` which looks the string up here.
 * Unknown strings fall back to the original Arabic, so nothing can break.
 *
 * Add entries here to translate more of the UI — no component changes needed.
 */
import { useTranslation } from "react-i18next";
import i18n from "./config";

type Pair = { en: string; he: string };

export const DICT: Record<string, Pair> = {
  /* ───── Sections / launcher ───── */
  "الأساسية": { en: "Essentials", he: "בסיסי" },
  "— الأكثر استخداماً في شركتك": { en: "— most used in your company", he: "— הנפוצים בחברה שלך" },
  "العمليات والإدارة": { en: "Operations & Management", he: "תפעול וניהול" },
  "تطبيقات متقدمة": { en: "Advanced Apps", he: "אפליקציות מתקדמות" },
  "التطبيقات": { en: "Apps", he: "אפליקציות" },
  "جميع التطبيقات": { en: "All apps", he: "כל האפליקציות" },
  "اختر تطبيقاً للبدء": { en: "Pick an app to get started", he: "בחר אפליקציה כדי להתחיל" },
  "الكل": { en: "All", he: "הכל" },
  "المفضلة": { en: "Favorites", he: "מועדפים" },
  "جديد": { en: "New", he: "חדש" },

  /* ───── Top-level apps ───── */
  "لوحة المعلومات": { en: "Dashboard", he: "לוח מחוונים" },
  "ملخص مالي شامل وتحليلات الأداء": { en: "Full financial summary and performance analytics", he: "סיכום פיננסי מלא וניתוח ביצועים" },
  "المالية": { en: "Finance", he: "כספים" },
  "حسابات، قيود، وميزان مراجعة": { en: "Accounts, journal entries, and trial balance", he: "חשבונות, פקודות יומן ומאזן בוחן" },
  "المحاسب الذكي": { en: "AI Accountant", he: "רואה חשבון חכם" },
  "محاسبة تحليلية بالذكاء الاصطناعي": { en: "Analytical accounting powered by AI", he: "חשבונאות אנליטית מבוססת בינה מלאכותית" },
  "مقابلات بالذكاء الاصطناعي": { en: "AI Interviews", he: "ראיונות AI" },
  "أنشئ وظائف، ولّد أسئلة ذكية، وقابل المرشحين صوتياً ومرئياً بالعربية": { en: "Create jobs, generate smart questions, and interview candidates by voice and video", he: "צור משרות, הפק שאלות חכמות ורואיין מועמדים בקול ובווידאו" },
  "نماذج للطباعة": { en: "Print Templates", he: "תבניות להדפסה" },
  "أنشئ وطبع نماذج احترافية مرتبطة ببيانات شركتك": { en: "Design and print professional templates linked to your company data", he: "עצב והדפס תבניות מקצועיות המקושרות לנתוני החברה" },
  "المحاسبة الضريبية": { en: "Tax Accounting", he: "חשבונאות מס" },
  "ضريبة القيمة المضافة، التقارير الدورية، والتقديمات": { en: "VAT, periodic reports, and filings", he: "מע\"מ, דוחות תקופתיים והגשות" },
  "إدارة علاقات العملاء": { en: "CRM", he: "ניהול לקוחות" },
  "من عميل محتمل إلى صفقة مغلقة وفاتورة محصّلة": { en: "From lead to closed deal and collected invoice", he: "מליד לעסקה סגורה וחשבונית שנגבתה" },
  "المبيعات": { en: "Sales", he: "מכירות" },
  "فواتير، نقاط بيع، وزبائن": { en: "Invoices, points of sale, and customers", he: "חשבוניות, קופות ולקוחות" },
  "المشتريات": { en: "Purchases", he: "רכש" },
  "موردين، طلبيات، فواتير مشتريات، وتقارير": { en: "Suppliers, orders, purchase invoices, and reports", he: "ספקים, הזמנות, חשבוניות רכש ודוחות" },
  "نقطة البيع": { en: "Point of Sale", he: "קופה" },
  "نظام POS متكامل للمبيعات المباشرة": { en: "Full POS system for direct sales", he: "מערכת קופה מלאה למכירה ישירה" },
  "المخزون": { en: "Inventory", he: "מלאי" },
  "منتجات، مستودعات، حركات، وتقييم": { en: "Products, warehouses, movements, and valuation", he: "מוצרים, מחסנים, תנועות והערכה" },
  "البائع المتجول": { en: "Van Sales", he: "מכירות ניידות" },
  "دورة البيع الميداني، العمولات، وتقارير المندوبين": { en: "Field sales cycle, commissions, and rep reports", he: "מחזור מכירות שטח, עמלות ודוחות סוכנים" },
  "الأصول الثابتة": { en: "Fixed Assets", he: "רכוש קבוע" },
  "سجل الأصول، الاستهلاك، والصيانة": { en: "Asset register, depreciation, and maintenance", he: "מרשם נכסים, פחת ותחזוקה" },
  "إدارة الكفالات": { en: "Warranty Management", he: "ניהול אחריות" },
  "سياسات، بطاقات، مطالبات، وتعويضات الشركة الأم": { en: "Policies, cards, claims, and vendor reimbursements", he: "מדיניות, כרטיסים, תביעות והחזרים" },
  "محاسب المشاريع والمقاولات": { en: "Projects & Contracting", he: "פרויקטים וקבלנות" },
  "إدارة مشاريع المقاولات والحركات المالية": { en: "Manage contracting projects and their financials", he: "ניהול פרויקטי קבלנות והתנועות הכספיות" },
  "إدارة الورشات والمناجر": { en: "Workshops Management", he: "ניהול בתי מלאכה" },
  "إدارة ورشات العمل والمناجر وتتبع تكاليف كل ورشة": { en: "Manage workshops and track the cost of each one", he: "ניהול בתי מלאכה ומעקב עלויות" },
  "إدارة المتاجر الإلكترونية": { en: "E-Commerce", he: "חנויות מקוונות" },
  "إدارة مالية للمتاجر والصفحات الإلكترونية": { en: "Financial management for online stores and pages", he: "ניהול פיננסי לחנויות ולדפים מקוונים" },
  "إدارة المهام": { en: "Task Management", he: "ניהול משימות" },
  "تنظيم المهام، التكليفات، والمتابعة": { en: "Organize tasks, assignments, and follow-up", he: "ארגון משימות, הקצאות ומעקב" },
  "مراكز التكلفة": { en: "Cost Centers", he: "מרכזי עלות" },
  "تعريف مراكز التكلفة وتوزيع المصاريف والإيرادات": { en: "Define cost centers and allocate expenses and revenue", he: "הגדרת מרכזי עלות והקצאת הוצאות והכנסות" },
  "الإنتاج والتصنيع": { en: "Production & Manufacturing", he: "ייצור" },
  "معادلات الإنتاج (BOM)، أوامر الإنتاج، والتكلفة المعيارية مع ترحيل تلقائي للمخزون والمحاسبة": { en: "Bills of materials, production orders, and standard costing with automatic inventory and accounting posting", he: "עצי מוצר, הזמנות ייצור ותמחור תקני עם רישום אוטומטי למלאי ולהנהלת חשבונות" },
  "الإشعارات": { en: "Notifications", he: "התראות" },
  "إرسال تنبيهات للموظفين والمدراء والمحاسبين": { en: "Send alerts to employees, managers, and accountants", he: "שליחת התראות לעובדים, מנהלים ורואי חשבון" },
  "الموارد البشرية": { en: "Human Resources", he: "משאבי אנוש" },
  "لوحة قيادة، موظفون، إعدادات": { en: "Dashboard, employees, settings", he: "לוח מחוונים, עובדים, הגדרות" },
  "ورشات ودورات": { en: "Workshops & Courses", he: "סדנאות וקורסים" },
  "دورات تدريبية للموظفين ومتابعة الإنجاز": { en: "Employee training courses and progress tracking", he: "קורסי הדרכה לעובדים ומעקב התקדמות" },
  "التقارير": { en: "Reports", he: "דוחות" },
  "أرباح وخسائر، ميزانية عمومية، وتحليلات مالية": { en: "Profit and loss, balance sheet, and financial analytics", he: "רווח והפסד, מאזן וניתוח פיננסי" },
  "لوحات التحكم": { en: "Dashboards", he: "לוחות מחוונים" },
  "لوحات قابلة للتخصيص والمشاركة": { en: "Customizable and shareable dashboards", he: "לוחות הניתנים להתאמה ולשיתוף" },
  "الإعدادات": { en: "Settings", he: "הגדרות" },
  "إعدادات النظام والملف الشخصي": { en: "System and profile settings", he: "הגדרות מערכת ופרופיל" },
  "تدقيق نقطة البيع": { en: "POS Audit", he: "ביקורת קופה" },
  "مراجعة ورديات ومبيعات ومدفوعات نقطة البيع (عرض فقط)": { en: "Review POS shifts, sales, and payments (read-only)", he: "סקירת משמרות, מכירות ותשלומים בקופה (צפייה בלבד)" },
  "إدارة مالية السياحة والسفر": { en: "Travel & Tourism Finance", he: "כספי תיירות ונסיעות" },
  "حجوزات، موردون، عمولات، وأرباح": { en: "Bookings, suppliers, commissions, and profits", he: "הזמנות, ספקים, עמלות ורווחים" },
  "الاشتراكات": { en: "Subscriptions", he: "מנויים" },
  "الباقات والعروض": { en: "Plans & Offers", he: "חבילות ומבצעים" },
  "التخصيص والدعم الفني": { en: "Customization & Support", he: "התאמה ותמיכה" },
  "استيراد بيانات خارجية": { en: "Import External Data", he: "ייבוא נתונים חיצוניים" },

  /* ───── Sub-menu items ───── */
  "الصفحة الرئيسية": { en: "Home", he: "דף הבית" },
  "لوحة التحكم": { en: "Control Panel", he: "לוח בקרה" },
  "سند قبض": { en: "Receipt Voucher", he: "שובר קבלה" },
  "سند صرف": { en: "Payment Voucher", he: "שובר תשלום" },
  "سند قيد": { en: "Journal Voucher", he: "שובר יומן" },
  "سندات القبض": { en: "Receipt Vouchers", he: "שוברי קבלה" },
  "سندات الصرف": { en: "Payment Vouchers", he: "שוברי תשלום" },
  "دفتر اليومية": { en: "General Journal", he: "יומן כללי" },
  "لوحة CRM": { en: "CRM Board", he: "לוח CRM" },
  "العملاء المحتملون": { en: "Leads", he: "לידים" },
  "خط سير المبيعات": { en: "Sales Pipeline", he: "צינור מכירות" },
  "المتابعات والأنشطة": { en: "Follow-ups & Activities", he: "מעקבים ופעילויות" },
  "ملف العميل 360": { en: "Customer 360", he: "תיק לקוח 360" },
  "الفواتير": { en: "Invoices", he: "חשבוניות" },
  "الطلبيات": { en: "Orders", he: "הזמנות" },
  "إرساليات المبيعات": { en: "Delivery Notes", he: "תעודות משלוח" },
  "مردودات مبيعات": { en: "Sales Returns", he: "החזרות מכירה" },
  "إشعارات دائنة": { en: "Credit Notes", he: "הודעות זיכוי" },
  "إشعارات مدينة": { en: "Debit Notes", he: "הודעות חיוב" },
  "سياسات التصنيف": { en: "Classification Policies", he: "מדיניות סיווג" },
  "طلب مشتريات": { en: "Purchase Request", he: "בקשת רכש" },
  "فواتير المشتريات": { en: "Purchase Invoices", he: "חשבוניות רכש" },
  "مردودات مشتريات": { en: "Purchase Returns", he: "החזרות רכש" },
  "كشف حساب مورد": { en: "Supplier Statement", he: "כרטסת ספק" },
  "التقرير الأسبوعي": { en: "Weekly Report", he: "דוח שבועי" },
  "إعدادات المشتريات": { en: "Purchase Settings", he: "הגדרות רכש" },
  "ملفات الاستيراد": { en: "Import Files", he: "קבצי ייבוא" },
  "الموردون": { en: "Suppliers", he: "ספקים" },
  "خريطة الطاولات": { en: "Floor Plan", he: "מפת שולחנות" },
  "إدارة الإضافات": { en: "Modifiers", he: "ניהול תוספות" },
  "منيو QR": { en: "QR Menu", he: "תפריט QR" },
  "إعدادات KIOSK": { en: "Kiosk Settings", he: "הגדרות קיוסק" },
  "تتبع الطلبيات": { en: "Order Tracking", he: "מעקב הזמנות" },
  "المحفظة (Wallet)": { en: "Wallet", he: "ארנק" },
  "تقارير نقطة البيع": { en: "POS Reports", he: "דוחות קופה" },
  "تقارير الكول سنتر": { en: "Call Center Reports", he: "דוחות מוקד" },
  "إدارة مستخدمي POS": { en: "POS Users", he: "משתמשי קופה" },
  "المنتجات": { en: "Products", he: "מוצרים" },
  "المستودعات": { en: "Warehouses", he: "מחסנים" },
  "سندات تحويل المخزون": { en: "Stock Transfers", he: "העברות מלאי" },
  "حركات المخزون": { en: "Stock Movements", he: "תנועות מלאי" },
  "تقييم المخزون": { en: "Inventory Valuation", he: "הערכת מלאי" },
  "جرد بضاعة آخر المدة": { en: "Closing Stock Count", he: "ספירת מלאי סוגרת" },
  "دورة يوم البائع المتجول": { en: "Van Day Cycle", he: "מחזור יום מכירות" },
  "مندوبين المبيعات": { en: "Sales Reps", he: "סוכני מכירות" },
  "طلبيات المندوبين": { en: "Rep Orders", he: "הזמנות סוכנים" },
  "عمولات البائعين المتجولين": { en: "Van Commissions", he: "עמלות סוכנים" },
  "تقارير البائعين المتجولين": { en: "Van Reports", he: "דוחות סוכנים" },
  "بطاقات الكفالة": { en: "Warranty Cards", he: "כרטיסי אחריות" },
  "مطالبات الكفالة": { en: "Warranty Claims", he: "תביעות אחריות" },
  "مطالبات الشركة الأم": { en: "Vendor Claims", he: "תביעות ספק" },
  "سياسات الكفالة": { en: "Warranty Policies", he: "מדיניות אחריות" },
  "معادلات الإنتاج": { en: "Bills of Materials", he: "עצי מוצר" },
  "أوامر الإنتاج": { en: "Production Orders", he: "הזמנות ייצור" },
  "الأرباح والخسائر": { en: "Profit & Loss", he: "רווח והפסד" },
  "الميزانية العمومية": { en: "Balance Sheet", he: "מאזן" },
  "ميزان المراجعة": { en: "Trial Balance", he: "מאזן בוחן" },
  "مكتبة التقارير": { en: "Report Library", he: "ספריית דוחות" },
  "منشئ التقارير": { en: "Report Builder", he: "בונה דוחות" },
  "تقاريري المحفوظة": { en: "My Saved Reports", he: "הדוחות השמורים שלי" },
  "الحجوزات": { en: "Bookings", he: "הזמנות" },
  "حجز جديد": { en: "New Booking", he: "הזמנה חדשה" },
  "إعدادات السياحة": { en: "Travel Settings", he: "הגדרות תיירות" },

  /* ───── Common actions / buttons ───── */
  "حفظ": { en: "Save", he: "שמירה" },
  "حفظ وترحيل": { en: "Save & Post", he: "שמירה ורישום" },
  "إلغاء": { en: "Cancel", he: "ביטול" },
  "إغلاق": { en: "Close", he: "סגירה" },
  "حذف": { en: "Delete", he: "מחיקה" },
  "تعديل": { en: "Edit", he: "עריכה" },
  "إضافة": { en: "Add", he: "הוספה" },
  "بحث": { en: "Search", he: "חיפוש" },
  "تصفية": { en: "Filter", he: "סינון" },
  "مسح": { en: "Clear", he: "ניקוי" },
  "تحديث": { en: "Refresh", he: "רענון" },
  "تصدير": { en: "Export", he: "ייצוא" },
  "استيراد": { en: "Import", he: "ייבוא" },
  "طباعة": { en: "Print", he: "הדפסה" },
  "رجوع": { en: "Back", he: "חזרה" },
  "التالي": { en: "Next", he: "הבא" },
  "السابق": { en: "Previous", he: "הקודם" },
  "تأكيد": { en: "Confirm", he: "אישור" },
  "اعتماد": { en: "Approve", he: "אישור" },
  "رفض": { en: "Reject", he: "דחייה" },
  "عرض": { en: "View", he: "תצוגה" },
  "تحميل": { en: "Download", he: "הורדה" },
  "المزيد": { en: "More", he: "עוד" },
};

/** Translate an Arabic source string; falls back to the original text. */
export function tt(text?: string | null, lang?: string): string {
  if (!text) return text ?? "";
  const l = (lang || i18n.language || "ar").slice(0, 2);
  if (l === "ar") return text;
  const hit = DICT[text.trim()];
  if (!hit) return text;
  return l === "he" ? hit.he : hit.en;
}

/** Hook version — re-renders components when the language changes. */
export function useTT() {
  const { i18n: inst } = useTranslation();
  const lang = inst.language;
  return (text?: string | null) => tt(text, lang);
}
