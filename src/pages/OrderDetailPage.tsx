import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronRight, Printer, RefreshCw, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import OrderStatusTimeline from "@/components/orders/OrderStatusTimeline";

/**
 * Order details — Microsoft Dynamics 365 "Finance shell" read-only layout:
 * breadcrumb → record header (title + status) → command bar → KPI tile band →
 * FastTab-style pivot sections with dense field grids and a flat data grid.
 * Display only: no lifecycle actions (postpone / cancel), no emojis.
 */

const F = "Cairo, Tajawal, sans-serif";
const MONO = "JetBrains Mono, monospace";
const NAVY = "#0D1B2E";
const ACCENT = "#2A7B9B";

const T = {
  shell: "#F3F2F1",
  card: "#FFFFFF",
  head: "#FAFAFA",
  text: "#1B3A5C",
  muted: "rgba(27,58,92,0.62)",
  faint: "rgba(27,58,92,0.40)",
  border: "rgba(27,58,92,0.14)",
  zebra: "rgba(27,58,92,0.025)",
};

const STATUS_COLORS: Record<string, string> = {
  "جديد": "#3B82F6", "قيد المراجعة": "#6366F1", "مؤكد": "#8B5CF6",
  "قيد التصنيع": "#F59E0B", "قيد التجهيز": "#F59E0B", "جاهز للفوترة": "#8B5CF6",
  "مفوتر": "#06B6D4", "جاهز للشحن": "#14B8A6", "تم الشحن": "#22C55E",
  "تم التسليم": "#16A34A", "ملغي": "#EF4444", "مؤجل": "#EAB308",
};

const fmt = (v: any) => (Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const OrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { settings } = useCompanySettings();
  const [order, setOrder] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceTable] = useState<string>("orders");
  const [activeTab, setActiveTab] = useState<"info" | "items" | "timeline">("info");
  const [supplierNames, setSupplierNames] = useState<Record<string, string>>({});
  const [poNumbers, setPoNumbers] = useState<Record<string, string>>({});
  const [creatingPOs, setCreatingPOs] = useState(false);

  useEffect(() => { if (id && user) fetchOrder(); /* eslint-disable-next-line */ }, [id, user]);

  const fetchOrder = async () => {
    if (!id || !user) return;
    setLoading(true);
    const { data: legacyOrder } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
    if (legacyOrder) {
      setOrder(legacyOrder);
      const { data: items } = await supabase.from("order_items").select("*").eq("order_id", id);
      const itemList = (items as any[]) || [];
      setOrderItems(itemList);

      // Resolve supplier names + linked purchase order numbers for display
      const supplierIds = [...new Set(itemList.map((i: any) => i.supplier_id).filter(Boolean))] as string[];
      if (supplierIds.length > 0) {
        const { data: sups } = await supabase.from("pos_suppliers" as any).select("id, name").in("id", supplierIds);
        setSupplierNames(Object.fromEntries(((sups as any[]) || []).map((s: any) => [s.id, s.name])));
      }
      const poIds = [...new Set(itemList.map((i: any) => i.procurement_order_id).filter(Boolean))] as string[];
      if (poIds.length > 0) {
        const { data: pos } = await supabase.from("procurement_orders" as any).select("id, order_number").in("id", poIds);
        setPoNumbers(Object.fromEntries(((pos as any[]) || []).map((p: any) => [p.id, p.order_number])));
      }
    }
    setLoading(false);
  };

  /** Group items linked to suppliers (not yet converted) and create one
   *  draft purchase order per supplier, linked back to this sales order. */
  const handleCreatePurchaseOrders = async () => {
    if (!user || !order) return;
    const pending = orderItems.filter((i: any) => i.supplier_id && !i.procurement_order_id);
    if (pending.length === 0) {
      toast.info("لا توجد بنود مرتبطة بموردين بحاجة لطلبية شراء");
      return;
    }
    setCreatingPOs(true);
    try {
      const orderRef = order.manual_ref?.trim() || order.order_number || "";
      // procurement_order_items.product_id يشير إلى دليل procurement_items (وليس products)
      // لذلك نطابق بالاسم ونتركه فارغاً إذا لم يوجد صنف مطابق في دليل المشتريات
      const { data: procItems } = await supabase
        .from("procurement_items" as any)
        .select("id, name")
        .eq("user_id", user.id);
      const procItemByName = new Map<string, string>();
      (procItems || []).forEach((p: any) => {
        const key = String(p.name || "").trim();
        if (key && !procItemByName.has(key)) procItemByName.set(key, p.id);
      });
      const bySupplier = new Map<string, any[]>();
      pending.forEach((i: any) => {
        const list = bySupplier.get(i.supplier_id) || [];
        list.push(i);
        bySupplier.set(i.supplier_id, list);
      });

      let created = 0;
      for (const [supplierId, items] of bySupplier) {
        const totalAmount = items.reduce((s: number, i: any) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);
        const { data: po, error: poErr } = await supabase
          .from("procurement_orders" as any)
          .insert({
            user_id: user.id,
            branch_id: null,
            supplier_id: supplierId,
            order_date: new Date().toISOString().split("T")[0],
            expected_delivery_date: order.delivery_date || null,
            notes: `من طلبية مبيعات ${orderRef} — ${order.customer_name || ""}`,
            total_amount: totalAmount,
            created_by: user.id,
            status: "draft",
            sales_order_id: order.id,
          } as any)
          .select("id, order_number")
          .single();
        if (poErr) throw poErr;

        const poItems = items.map((i: any) => ({
          order_id: (po as any).id,
          product_id: procItemByName.get(String(i.product_name || "").trim()) || null,
          item_name: i.product_name,
          unit: "قطعة",
          quantity: Number(i.quantity || 0),
          unit_price: Number(i.unit_price || 0),
          total_price: Number(i.quantity || 0) * Number(i.unit_price || 0),
          notes: i.fabric ? `القماش: ${i.fabric}` : null,
        }));
        const { error: itemsErr } = await supabase.from("procurement_order_items" as any).insert(poItems as any);
        if (itemsErr) {
          // تراجع: احذف رأس الطلبية حتى لا تبقى طلبية فارغة وتتكرر عند إعادة المحاولة
          await supabase.from("procurement_orders" as any).delete().eq("id", (po as any).id);
          throw itemsErr;
        }

        // Mark sales items so the same item never generates a second PO
        for (const i of items) {
          await supabase.from("order_items").update({ procurement_order_id: (po as any).id } as any).eq("id", i.id);
        }
        created++;
      }
      toast.success(`تم إنشاء ${created} طلبية شراء — يمكنك مراجعتها من صفحة طلبيات الشراء وتحويلها لفواتير`);
      fetchOrder();
    } catch (e: any) {
      toast.error("خطأ أثناء إنشاء طلبيات الشراء: " + (e?.message || ""));
    } finally {
      setCreatingPOs(false);
    }
  };

  const pendingSupplierItems = orderItems.filter((i: any) => i.supplier_id && !i.procurement_order_id).length;

  if (loading) {
    return (
      <div style={{ direction: "rtl", background: T.shell, minHeight: "100%", padding: "40px", fontFamily: F, textAlign: "center" }}>
        <p style={{ color: T.muted, fontSize: 13 }}>جارٍ تحميل سجل الطلبية…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ direction: "rtl", background: T.shell, minHeight: "100%", padding: "40px", fontFamily: F, textAlign: "center" }}>
        <p style={{ color: T.text, fontSize: 14, marginBottom: 14 }}>سجل الطلبية غير موجود</p>
        <button onClick={() => navigate("/orders")} style={{
          background: NAVY, color: "#FFF", border: "none", borderRadius: 2,
          padding: "8px 20px", fontFamily: F, fontSize: 12.5, cursor: "pointer",
        }}>العودة لقائمة الطلبيات</button>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[order.status] || ACCENT;

  const handlePrintOrder = async () => {
    const o = order;
    const paid = Number(o.paid_amount || 0);
    const remaining = Math.max(0, Number(o.total || 0) - paid);
    const companyName = (settings as any)?.company_name || "الشركة";
    const cell = (v: any) => (v === null || v === undefined || v === "" ? "—" : String(v));
    const money = (n: any) => `₪${Number(n || 0).toLocaleString()}`;

    const itemsRows = orderItems.length
      ? orderItems.map((it: any, i: number) => `
        <tr>
          <td style="text-align:center">${i + 1}</td>
          <td>${cell(it.product_name)}</td>
          <td style="text-align:center">${Number(it.quantity || 0)}</td>
          <td class="font-mono">${money(it.unit_price)}</td>
          <td class="font-mono">${money(it.discount)}</td>
          <td class="font-mono font-bold">${money(it.total ?? (Number(it.quantity || 0) * Number(it.unit_price || 0) - Number(it.discount || 0)))}</td>
          <td style="color:#64748b">${cell(it.notes)}</td>
        </tr>`).join("")
      : `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px">لا توجد بنود</td></tr>`;

    const infoBlock = (label: string, value: string, color = NAVY) => `
      <div class="info-cell">
        <div class="info-label">${label}</div>
        <div class="info-value" style="color:${color}">${value}</div>
      </div>`;

    const contentHtml = `
      <div class="print-header">
        <div>
          <div class="company-name">${companyName}</div>
          <div class="report-title">تفاصيل الطلبية</div>
        </div>
          <div style="text-align:left">
          ${o.manual_ref ? `<div style="font-size:15px;font-weight:800;color:${NAVY}">مرجع: ${cell(o.manual_ref)}</div>` : ""}
          <div style="font-size:${o.manual_ref ? 12 : 16}px;font-weight:700;color:${o.manual_ref ? "#64748b" : NAVY}">${cell(o.order_number)}</div>
          <div class="print-date">${cell(o.order_date)}</div>
        </div>
      </div>

      <div class="section-title">بيانات الزبون</div>
      <div class="info-grid">
        ${infoBlock("اسم الزبون", cell(o.customer_name))}
        ${infoBlock("الهاتف", cell(o.customer_phone))}
        ${infoBlock("العنوان", cell(o.customer_address))}
        ${infoBlock("المدينة", cell(o.customer_city))}
      </div>

      <div class="section-title">بيانات الطلب</div>
      <div class="info-grid">
        ${infoBlock("الحالة", cell(o.status))}
        ${infoBlock("حالة الدفع", cell(o.payment_status))}
        ${infoBlock("طريقة الدفع", cell(o.payment_method))}
        ${infoBlock("المصدر", cell(o.source))}
        ${infoBlock("المندوب", cell(o.agent_name))}
        ${infoBlock("تاريخ التسليم", cell(o.delivery_date))}
      </div>

      <div class="section-title">البنود</div>
      <table>
        <thead><tr>
          <th style="width:36px">#</th><th>المنتج / الوصف</th><th style="width:60px">الكمية</th>
          <th style="width:90px">السعر</th><th style="width:80px">الخصم</th>
          <th style="width:100px">الإجمالي</th><th>ملاحظة</th>
        </tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>

      <div class="totals-wrap">
        <div class="totals-box">
          <div class="tot-row"><span>المجموع الفرعي</span><span class="font-mono">${money(o.subtotal)}</span></div>
          <div class="tot-row"><span>الخصم</span><span class="font-mono">${money(o.discount)}</span></div>
          <div class="tot-row"><span>الشحن</span><span class="font-mono">${money(o.shipping_cost)}</span></div>
          <div class="tot-row grand"><span>الإجمالي</span><span class="font-mono">${money(o.total)}</span></div>
          <div class="tot-row" style="color:#059669"><span>المدفوع</span><span class="font-mono">${money(paid)}</span></div>
          <div class="tot-row" style="color:${remaining > 0 ? "#DC2626" : "#059669"}"><span>المتبقي</span><span class="font-mono">${money(remaining)}</span></div>
        </div>
      </div>

      ${o.notes ? `
      <div class="section-title">ملاحظات</div>
      <div class="notes-box">${String(o.notes).replace(/\n/g, "<br/>")}</div>` : ""}

      <div class="footer-bar">
        <div>طُبع في ${new Date().toLocaleString("ar-EG")}</div>
        <div>${companyName}</div>
      </div>
    `;

    const extraStyles = `
      .section-title { font-size:12px; font-weight:700; color:#fff; background:${NAVY}; padding:6px 10px; margin:14px 0 8px; border-radius:4px; }
      .info-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:0; border:1px solid #e2e8f0; border-radius:6px; overflow:hidden; margin-bottom:6px; }
      .info-cell { padding:8px 12px; border-left:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0; background:#fff; }
      .info-label { font-size:10px; color:#64748b; margin-bottom:2px; }
      .info-value { font-size:12px; font-weight:600; }
      .totals-wrap { display:flex; justify-content:flex-start; margin-top:12px; }
      .totals-box { min-width:280px; border:1px solid #e2e8f0; border-radius:6px; overflow:hidden; }
      .tot-row { display:flex; justify-content:space-between; padding:6px 12px; font-size:12px; border-bottom:1px solid #f1f5f9; }
      .tot-row.grand { background:${NAVY}; color:#fff; font-weight:700; font-size:13px; }
      .notes-box { border:1px solid #e2e8f0; border-radius:6px; padding:10px 12px; font-size:12px; color:#334155; background:#f8fafc; }
      .footer-bar { display:flex; justify-content:space-between; margin-top:20px; padding-top:8px; border-top:1px solid #e2e8f0; font-size:10px; color:#94a3b8; }
      @media print { @page { size: A4 portrait; margin: 12mm; } body { padding: 0 !important; } }
    `;

    const { printReport } = await import("@/lib/printUtils");
    printReport({ title: `طلبية ${o.manual_ref || o.order_number || ""}`, companyName, contentHtml: `<style>${extraStyles}</style>${contentHtml}` });
  };

  const tabs = [
    { id: "info" as const, label: "معلومات الطلبية" },
    { id: "items" as const, label: "بنود الطلبية" },
    { id: "timeline" as const, label: "سجل التتبع" },
  ];

  const tiles = [
    { label: "المجموع الفرعي", value: fmt(order.subtotal), color: T.text },
    { label: "الخصم", value: fmt(order.discount), color: "#B45309" },
    { label: "الشحن", value: fmt(order.shipping_cost), color: ACCENT },
    { label: "الإجمالي", value: fmt(order.total), color: NAVY },
    { label: "المدفوع", value: fmt(order.paid_amount), color: "#15803D" },
    { label: "المتبقي", value: fmt(order.remaining_amount), color: "#B91C1C" },
  ];

  const customerFields: [string, any][] = [
    ["العميل", order.customer_name],
    ["الهاتف", order.customer_phone],
    ["العنوان", order.customer_address],
    ["المدينة", order.customer_city],
  ];

  const commercialFields: [string, any][] = [
    ["المرجع اليدوي (رقم الطلبية)", order.manual_ref],
    ["المصدر", order.source],
    ["طريقة الدفع", order.payment_method],
    ["حالة الدفع", order.payment_status],
    ["المندوب", order.agent_name],
    ["الأولوية", order.priority],
    ["تاريخ الطلب", order.order_date ? new Date(order.order_date).toLocaleDateString("en-GB") : null],
    ["تاريخ التسليم", order.delivery_date ? new Date(order.delivery_date).toLocaleDateString("en-GB") : null],
    ["رقم التتبع", order.tracking_number],
  ];

  const section: React.CSSProperties = {
    background: T.card, border: `1px solid ${T.border}`, borderRadius: 2, marginBottom: 12,
  };
  const sectionHead: React.CSSProperties = {
    padding: "9px 14px", borderBottom: `1px solid ${T.border}`, background: T.head,
    fontSize: 12.5, fontWeight: 700, color: T.text, letterSpacing: "0.2px",
  };

  const FieldGrid = ({ rows }: { rows: [string, any][] }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ padding: "9px 14px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10.5, color: T.faint, marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600 }}>{value || "—"}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ direction: "rtl", textAlign: "right", fontFamily: F, background: T.shell, minHeight: "100%", padding: "0 0 80px" }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", fontSize: 11.5, color: T.muted }}>
        <button onClick={() => navigate("/orders")} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontFamily: F, fontSize: 11.5, padding: 0 }}>المبيعات</button>
        <ChevronRight size={11} style={{ transform: "rotate(180deg)" }} />
        <button onClick={() => navigate("/orders")} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontFamily: F, fontSize: 11.5, padding: 0 }}>الطلبيات</button>
        <ChevronRight size={11} style={{ transform: "rotate(180deg)" }} />
        <span style={{ fontFamily: MONO }}>{order.order_number || "تفاصيل"}</span>
      </div>

      {/* Record header */}
      <div style={{
        background: T.card, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
        padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 11, color: T.faint, marginBottom: 3 }}>تفاصيل الطلبية</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: T.text, margin: 0 }}>{order.customer_name || "—"}</h1>
            {order.manual_ref && (
              <span style={{
                fontFamily: MONO, fontSize: 13, fontWeight: 800, color: NAVY,
                background: "rgba(42,123,155,0.10)", border: `1px solid rgba(42,123,155,0.35)`,
                borderRadius: 2, padding: "1px 8px",
              }}>مرجع: {order.manual_ref}</span>
            )}
            <span style={{ fontFamily: MONO, fontSize: 13, color: T.muted }}>{order.order_number || ""}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: T.faint }}>الحالة</span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 2,
            background: `${statusColor}14`, border: `1px solid ${statusColor}55`, color: statusColor,
            fontSize: 12, fontWeight: 700,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }} />
            {order.status}
          </span>
        </div>
      </div>

      {/* Command bar (read-only utilities) */}
      <div style={{
        background: T.head, borderBottom: `1px solid ${T.border}`, padding: "6px 14px",
        display: "flex", alignItems: "center", gap: 4,
      }}>
        {[
          { label: "رجوع", icon: ChevronRight, onClick: () => navigate("/orders"), rotate: true },
          { label: "تحديث", icon: RefreshCw, onClick: fetchOrder },
          { label: "طباعة", icon: Printer, onClick: handlePrintOrder },
          ...(pendingSupplierItems > 0
            ? [{ label: creatingPOs ? "جاري الإنشاء..." : `إنشاء طلبيات شراء (${pendingSupplierItems})`, icon: Truck, onClick: handleCreatePurchaseOrders }]
            : []),
        ].map(({ label, icon: Icon, onClick, rotate }) => (
          <button key={label} onClick={onClick} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px",
            background: "transparent", border: "1px solid transparent", borderRadius: 2,
            color: T.text, fontFamily: F, fontSize: 12, cursor: "pointer",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(27,58,92,0.06)"; e.currentTarget.style.borderColor = T.border; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
          >
            <Icon size={13} style={rotate ? undefined : undefined} />
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "12px 14px" }}>
        {/* KPI tile band */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 1, background: T.border, border: `1px solid ${T.border}`, borderRadius: 2, marginBottom: 12 }}>
          {tiles.map((t) => (
            <div key={t.label} style={{ background: T.card, padding: "12px 14px" }}>
              <div style={{ fontSize: 10.5, color: T.faint, marginBottom: 4 }}>{t.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: t.color }}>
                {t.value} <span style={{ fontSize: 11, color: T.faint }}>ILS</span>
              </div>
            </div>
          ))}
        </div>

        {/* Pivot tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`, marginBottom: 12 }}>
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: "9px 16px", background: "transparent", border: "none", cursor: "pointer",
              fontFamily: F, fontSize: 12.5,
              color: activeTab === tab.id ? T.text : T.muted,
              fontWeight: activeTab === tab.id ? 700 : 500,
              borderBottom: `2px solid ${activeTab === tab.id ? ACCENT : "transparent"}`,
              marginBottom: -1,
            }}>{tab.label}</button>
          ))}
        </div>

        {activeTab === "info" && (
          <>
            <div style={section}>
              <div style={sectionHead}>بيانات العميل</div>
              <FieldGrid rows={customerFields} />
            </div>

            <div style={section}>
              <div style={sectionHead}>بيانات الطلب</div>
              <FieldGrid rows={commercialFields} />
            </div>

            {(order.notes || order.production_notes) && (
              <div style={section}>
                <div style={sectionHead}>ملاحظات</div>
                {order.notes && (
                  <div style={{ padding: "10px 14px", borderBottom: order.production_notes ? `1px solid ${T.border}` : "none" }}>
                    <div style={{ fontSize: 10.5, color: T.faint, marginBottom: 4 }}>ملاحظات عامة</div>
                    <div style={{ fontSize: 12.5, color: T.text, whiteSpace: "pre-wrap", lineHeight: 1.9 }}>{order.notes}</div>
                  </div>
                )}
                {order.production_notes && (
                  <div style={{ padding: "10px 14px" }}>
                    <div style={{ fontSize: 10.5, color: T.faint, marginBottom: 4 }}>ملاحظات الإنتاج</div>
                    <div style={{ fontSize: 12.5, color: T.text, whiteSpace: "pre-wrap", lineHeight: 1.9 }}>{order.production_notes}</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === "items" && (
          <div style={section}>
            <div style={sectionHead}>بنود الطلبية ({orderItems.length})</div>
            {orderItems.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", direction: "rtl", textAlign: "right" }}>
                <thead>
                  <tr style={{ background: T.head }}>
                    {["#", "المنتج", "المورد", "الكمية", "السعر", "الخصم", "الإجمالي"].map((h) => (
                      <th key={h} style={{
                        padding: "8px 12px", fontSize: 11, fontWeight: 700, color: T.muted,
                        borderBottom: `1px solid ${T.border}`, textAlign: h === "المنتج" || h === "#" || h === "المورد" ? "right" : "left",
                        whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item: any, i: number) => (
                    <tr key={item.id || i} style={{ background: i % 2 ? T.zebra : T.card }}>
                      <td style={{ padding: "8px 12px", fontSize: 11.5, color: T.faint, fontFamily: MONO, borderBottom: `1px solid ${T.border}` }}>{i + 1}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12.5, fontWeight: 600, color: T.text, borderBottom: `1px solid ${T.border}` }}>
                        {item.product_name}
                        {item.fabric && <span style={{ marginRight: 8, fontSize: 11, color: T.faint, fontWeight: 500 }}>({item.fabric})</span>}
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 11.5, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>
                        {item.supplier_id ? (
                          <span>
                            <span style={{ color: T.text, fontWeight: 600 }}>{supplierNames[item.supplier_id] || "—"}</span>
                            {item.procurement_order_id ? (
                              <span style={{ marginRight: 6, fontSize: 10, color: "#15803D", fontWeight: 700 }}>
                                ✓ شراء {poNumbers[item.procurement_order_id] || ""}
                              </span>
                            ) : (
                              <span style={{ marginRight: 6, fontSize: 10, color: "#B45309", fontWeight: 700 }}>بانتظار طلبية شراء</span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: T.faint }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: T.text, fontFamily: MONO, textAlign: "left", borderBottom: `1px solid ${T.border}` }}>{item.quantity}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: T.muted, fontFamily: MONO, textAlign: "left", borderBottom: `1px solid ${T.border}` }}>{fmt(item.unit_price)}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: T.muted, fontFamily: MONO, textAlign: "left", borderBottom: `1px solid ${T.border}` }}>{fmt(item.discount)}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12.5, fontWeight: 700, color: T.text, fontFamily: MONO, textAlign: "left", borderBottom: `1px solid ${T.border}` }}>{fmt(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: T.head }}>
                    <td colSpan={6} style={{ padding: "9px 12px", fontSize: 12, fontWeight: 700, color: T.muted }}>الإجمالي</td>
                    <td style={{ padding: "9px 12px", fontSize: 13, fontWeight: 800, color: NAVY, fontFamily: MONO, textAlign: "left" }}>
                      {fmt(orderItems.reduce((s: number, it: any) => s + (Number(it.total) || 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <div style={{ padding: "28px 14px", textAlign: "center", color: T.faint, fontSize: 12.5 }}>
                لا توجد بنود مسجلة لهذه الطلبية
              </div>
            )}
          </div>
        )}

        {activeTab === "timeline" && (
          <div style={section}>
            <div style={sectionHead}>سجل التتبع</div>
            <div style={{ padding: "14px" }}>
              <OrderStatusTimeline orderId={order.id} orderTable={sourceTable} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderDetailPage;
