// Customer 360 header — name, class badge, contact channels, quick actions.
// Pure presentation; receives data from useCustomer360.

import { Phone, MessageCircle, Mail, Plus, FileText, DollarSign, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ContactSnapshot, PolicySnapshot, RiskBadge } from "../lib/policyEngine";
import CustomerPolicyBadge from "./CustomerPolicyBadge";

interface Props {
  contact: ContactSnapshot | null;
  policy: PolicySnapshot | null;
  riskBadge: RiskBadge | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  onNewOpportunity?: () => void;
  onNewActivity?: () => void;
}

export default function CustomerHeader({
  contact,
  policy,
  riskBadge,
  phone,
  email,
  whatsapp,
  onNewOpportunity,
  onNewActivity,
}: Props) {
  const navigate = useNavigate();
  if (!contact) return null;

  const waNumber = (whatsapp || phone || "").replace(/[^\d]/g, "");

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 truncate">{contact.contact_name}</h1>
            <CustomerPolicyBadge contact={contact} policy={policy} size="md" />
            {riskBadge && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border"
                style={{ background: riskBadge.bg, color: riskBadge.color, borderColor: riskBadge.border }}
                title={riskBadge.reason}
              >
                {riskBadge.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2 text-[12px] text-slate-600 flex-wrap">
            {phone && (
              <a href={`tel:${phone}`} className="flex items-center gap-1 hover:text-blue-700">
                <Phone className="h-3.5 w-3.5" />
                <span dir="ltr">{phone}</span>
              </a>
            )}
            {waNumber && (
              <a
                href={`https://wa.me/${waNumber}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-emerald-700 hover:text-emerald-800"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span>واتساب</span>
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="flex items-center gap-1 hover:text-blue-700">
                <Mail className="h-3.5 w-3.5" />
                <span dir="ltr" className="truncate max-w-[200px]">{email}</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onNewOpportunity}
          className="h-9 px-3 rounded-lg bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700 flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> فرصة جديدة
        </button>
        <button
          onClick={onNewActivity}
          className="h-9 px-3 rounded-lg bg-purple-600 text-white text-[12px] font-semibold hover:bg-purple-700 flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> إضافة متابعة
        </button>
        <button
          onClick={() => navigate(`/invoices/new?contact_id=${contact.id}`)}
          className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-[12px] font-semibold hover:bg-emerald-700 flex items-center gap-1.5"
        >
          <FileText className="h-3.5 w-3.5" /> فاتورة جديدة
        </button>
        <button
          onClick={() => navigate(`/transactions?contact_id=${contact.id}&type=receipt`)}
          className="h-9 px-3 rounded-lg bg-amber-500 text-white text-[12px] font-semibold hover:bg-amber-600 flex items-center gap-1.5"
        >
          <DollarSign className="h-3.5 w-3.5" /> تسجيل دفعة
        </button>
        <button
          onClick={() => navigate(`/contacts/${contact.id}`)}
          className="h-9 px-3 rounded-lg bg-slate-100 text-slate-700 text-[12px] font-semibold hover:bg-slate-200 flex items-center gap-1"
        >
          الملف الكامل <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => navigate(`/account-statement?contact_id=${contact.id}`)}
          className="h-9 px-3 rounded-lg bg-slate-100 text-slate-700 text-[12px] font-semibold hover:bg-slate-200"
        >
          كشف حساب
        </button>
      </div>
    </div>
  );
}
