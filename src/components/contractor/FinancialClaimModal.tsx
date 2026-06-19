import { useState, useRef, useEffect, useCallback } from "react";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Printer, Eye, Trash2, Mail, MessageCircle } from "lucide-react";

// ── Arabic number to text ──
function numberToArabicText(num: number): string {
  if (num === 0) return "صفر";
  const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
    "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
  const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const hundreds = ["", "مئة", "مئتان", "ثلاثمئة", "أربعمئة", "خمسمئة", "ستمئة", "سبعمئة", "ثمانمئة", "تسعمئة"];

  const parts: string[] = [];
  const n = Math.floor(Math.abs(num));

  if (n >= 1000000) {
    const m = Math.floor(n / 1000000);
    if (m === 1) parts.push("مليون");
    else if (m === 2) parts.push("مليونان");
    else parts.push(numberToArabicText(m) + " ملايين");
  }
  const afterMillion = n % 1000000;
  if (afterMillion >= 1000) {
    const th = Math.floor(afterMillion / 1000);
    if (th === 1) parts.push("ألف");
    else if (th === 2) parts.push("ألفان");
    else if (th >= 3 && th <= 10) parts.push(numberToArabicText(th) + " آلاف");
    else parts.push(numberToArabicText(th) + " ألف");
  }
  const rem = afterMillion % 1000;
  if (rem > 0) {
    const h = Math.floor(rem / 100);
    const t = rem % 100;
    if (h > 0) parts.push(hundreds[h]);
    if (t > 0) {
      if (t < 20) {
        parts.push(ones[t]);
      } else {
        const o = t % 10;
        const d = Math.floor(t / 10);
        if (o > 0) parts.push(ones[o] + " و" + tens[d]);
        else parts.push(tens[d]);
      }
    }
  }

  return parts.join(" و");
}

interface Claim {
  id: string;
  claim_number: string;
  recipient_name: string;
  recipient_address: string;
  claim_date: string;
  amount: number;
  amount_text: string;
  reply_days: number;
  custom_note: string | null;
  status: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: { id: string; name: string; client_name: string | null; phone: string | null; address: string | null; budget: number; total_expenses: number; total_receipts: number };
  userId: string;
  sourceType?: "contractor" | "workshop";
  companyName: string;
  companyPhone: string;
  companyAddress: string;
  companyEmail: string;
  logoUrl: string;
}

export default function FinancialClaimModal({ open, onOpenChange, project, userId, companyName, companyPhone, companyAddress, companyEmail, logoUrl, sourceType = "contractor" }: Props) {
  const [mode, setMode] = useState<"form" | "preview" | "history">("form");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [previewClaim, setPreviewClaim] = useState<Claim | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const remaining = project.budget - project.total_expenses - project.total_receipts;

  const [form, setForm] = useState({
    recipient_name: project.client_name || "",
    recipient_address: project.address || "",
    amount: String(remaining > 0 ? remaining : 0),
    claim_date: format(new Date(), "yyyy-MM-dd"),
    reply_days: "7",
    custom_note: "",
  });

  const amountNum = parseFloat(form.amount) || 0;
  const amountText = amountNum > 0 ? numberToArabicText(amountNum) + " شيكل" : "";

  useEffect(() => {
    if (open) {
      setForm({
        recipient_name: project.client_name || "",
        recipient_address: project.address || "",
        amount: String(remaining > 0 ? remaining : 0),
        claim_date: format(new Date(), "yyyy-MM-dd"),
        reply_days: "7",
        custom_note: "",
      });
      setMode("form");
      fetchClaims();
    }
  }, [open]);

  const fetchClaims = useCallback(async () => {
    let query = supabase
      .from("financial_claims" as any)
      .select("*")
      .order("created_at", { ascending: false });
    
    if (sourceType === "workshop") {
      query = query.eq("user_id", dataOwnerId!).is("project_id", null).eq("recipient_name", project.client_name || "");
    } else {
      query = query.eq("project_id", project.id);
    }
    const { data } = await query;
    if (data) setClaims(data as any);
  }, [project.id, sourceType, userId, project.client_name]);

  const saveClaim = async () => {
    if (!form.recipient_name.trim() || amountNum <= 0) { toast.error("الاسم والمبلغ مطلوبان"); return; }
    const { data, error } = await supabase.from("financial_claims" as any).insert({
      user_id: dataOwnerId!,
      project_id: sourceType === "workshop" ? null : project.id,
      recipient_name: form.recipient_name,
      recipient_address: form.recipient_address || null,
      amount: amountNum,
      amount_text: amountText,
      claim_date: form.claim_date,
      reply_days: parseInt(form.reply_days) || 7,
      custom_note: sourceType === "workshop" 
        ? `ورشة: ${project.name}${form.custom_note ? " | " + form.custom_note : ""}`
        : (form.custom_note || null),
    } as any).select("*").single();
    if (error) { toast.error("فشل الحفظ: " + error.message); return; }
    toast.success("تم إنشاء المطالبة بنجاح");
    setPreviewClaim(data as any);
    setMode("preview");
    fetchClaims();
  };

  const deleteClaim = async (id: string) => {
    if (!confirm("حذف هذه المطالبة؟")) return;
    await supabase.from("financial_claims" as any).delete().eq("id", id);
    toast.success("تم الحذف");
    fetchClaims();
  };

  const printLetter = (claim: Claim) => {
    const w = window.open("", "_blank");
    if (!w) return;
    const fDate = (d: string) => { try { return new Date(d).toLocaleDateString("en-GB"); } catch { return d; } };
    const fNum = (n: number) => n.toLocaleString("en-US");

    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
    <title>مطالبة مالية - ${claim.claim_number}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Cairo',sans-serif; direction:rtl; color:#1a1a1a; background:#fff; }
      .page { max-width:700px; margin:0 auto; padding:40px 50px; }
      .bismillah { text-align:center; font-size:18px; font-weight:700; color:#1B3A5C; margin-bottom:6px; }
      .company-name { text-align:center; font-size:16px; font-weight:700; color:#1B3A5C; margin-bottom:16px; }
      .logo-wrap { text-align:center; margin-bottom:20px; }
      .logo-wrap img { max-height:80px; max-width:120px; object-fit:contain; }
      .date { font-size:14px; font-weight:600; margin-bottom:24px; }
      .recipient { margin-bottom:20px; line-height:2; }
      .recipient .label { font-weight:700; }
      .subject { text-align:center; font-weight:700; font-size:15px; text-decoration:underline; margin-bottom:20px; color:#1B3A5C; }
      .body-text { font-size:14px; line-height:2.2; text-align:justify; margin-bottom:16px; }
      .body-text .highlight { font-weight:700; color:#1B3A5C; }
      .body-text .amount-highlight { font-weight:700; color:#c0392b; }
      .closing { font-size:14px; margin-top:24px; }
      .signature { margin-top:40px; }
      .signature p { margin:4px 0; font-size:14px; }
      .signature .title { font-weight:700; color:#1B3A5C; }
      .footer { margin-top:40px; text-align:center; font-size:11px; color:#999; border-top:1px solid #ddd; padding-top:10px; }
      @media print { @page { size:A4; margin:20mm; } body { background:#fff; } .page { padding:0; } }
    </style></head><body><div class="page">
      <div class="bismillah">بسم الله الرحمن الرحيم</div>
      <div class="company-name">${companyName}</div>
      ${logoUrl ? `<div class="logo-wrap"><img src="${logoUrl}" alt="logo" /></div>` : ""}
      <div class="date">${fDate(claim.claim_date)}</div>
      <div class="recipient">
        <p><span class="label">السادة المحترمين:</span> ${claim.recipient_name}</p>
        ${claim.recipient_address ? `<p>${claim.recipient_address}</p>` : ""}
        <p>تحية طيبة وبعد...</p>
      </div>
      <div class="subject">الموضوع: مطالبة مالية بالرصيد المستحق</div>
      <div class="body-text">
        نأمل أن تجدك هذه الرسالة بخير. نكتب إليك لنلفت انتباهك إلى حالة حسابك لدى <span class="highlight">${companyName}</span>، ونحن نقدر العلاقة التي بنيناها مع حضرتكم ونلتزم بالعمل معاً لحل هذه المسألة.
      </div>
      <div class="body-text">
        اعتباراً من ${fDate(claim.claim_date)} تشير سجلاتنا إلى أن الرصيد المستحق بقيمة <span class="amount-highlight">[${fNum(claim.amount)}]</span> ${claim.amount_text} قد تجاوز موعد استحقاقه.
      </div>
      <div class="body-text">
        ونظراً للظروف الحالية وأهمية الحفاظ على الثقة والتعاون المتبادلين، فنحن على استعداد لمناقشة خطة الدفع التي تناسب كلا الطرفين. يرجى الاتصال بنا في أقرب وقت ممكن لإنهاء المسألة في غضون <span class="highlight">${claim.reply_days} أيام</span> من تاريخ هذه الرسالة.
      </div>
      ${claim.custom_note ? `<div class="body-text">${claim.custom_note}</div>` : ""}
      <div class="body-text">
        نحن نقدر علاقتنا ونلتزم بالعمل معاً خلال هذه الأوقات الصعبة. نشكركم على اهتمامكم السريع بهذا الموضوع العاجل.
      </div>
      <div class="closing">مع فائق الاحترام.</div>
      <div class="signature">
        <p class="title">المدير العام</p>
        <p>${companyName}</p>
        ${companyPhone ? `<p>للتواصل: ${companyPhone}</p>` : ""}
      </div>
      <div class="footer">
        رقم المراسلة: ${claim.claim_number} • المشروع: ${project.name}
        ${companyAddress ? ` • ${companyAddress}` : ""}
      </div>
    </div></body></html>`);
    w.document.close();
    /* view only — no browser print */
  };

  const sendWhatsApp = (claim: Claim) => {
    const fNum = (n: number) => n.toLocaleString("en-US");
    const msg = encodeURIComponent(
      `السلام عليكم ${claim.recipient_name}\n\nمطالبة مالية من ${companyName}\nالمبلغ المستحق: ${fNum(claim.amount)} ₪\n${claim.amount_text}\n\nيرجى التواصل معنا خلال ${claim.reply_days} أيام.\nرقم المراسلة: ${claim.claim_number}\n\nمع التحية`
    );
    const phone = project.phone?.replace(/[^0-9]/g, "") || "";
    window.open(`https://wa.me/${phone.startsWith("0") ? "972" + phone.slice(1) : phone}?text=${msg}`, "_blank");
  };

  const fDate = (d: string) => { try { return new Date(d).toLocaleDateString("en-GB"); } catch { return d; } };
  const fNum = (n: number) => n.toLocaleString("en-US");

  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    draft: { label: "مسودة", variant: "secondary" },
    sent: { label: "مُرسلة", variant: "default" },
    responded: { label: "تم الرد", variant: "outline" },
    settled: { label: "مسددة", variant: "default" },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📩 {mode === "history" ? "سجل المطالبات" : mode === "preview" ? "معاينة الخطاب" : "إنشاء خطاب مطالبة مالية"}
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 border-b pb-2">
          <Button size="sm" variant={mode === "form" ? "default" : "ghost"} onClick={() => setMode("form")}>إنشاء جديد</Button>
          <Button size="sm" variant={mode === "history" ? "default" : "ghost"} onClick={() => { setMode("history"); fetchClaims(); }}>
            السجل ({claims.length})
          </Button>
        </div>

        {/* ─── FORM MODE ─── */}
        {mode === "form" && (
          <div className="space-y-4">
            {/* Company Info Preview */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              {logoUrl && <img src={logoUrl} alt="logo" className="h-10 w-10 rounded object-contain" />}
              <div>
                <p className="font-semibold text-sm">{companyName}</p>
                <p className="text-xs text-muted-foreground">{companyAddress}</p>
              </div>
            </div>

            {/* Recipient */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">📋 بيانات المستلم</label>
              <Input placeholder="اسم المستلم *" value={form.recipient_name} onChange={e => setForm(f => ({ ...f, recipient_name: e.target.value }))} />
              <Input placeholder="العنوان" value={form.recipient_address} onChange={e => setForm(f => ({ ...f, recipient_address: e.target.value }))} />
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">💰 بيانات المطالبة</label>
              <Input type="number" placeholder="المبلغ المستحق (₪) *" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              {amountNum > 0 && (
                <div className="text-xs text-primary font-medium bg-primary/5 rounded px-3 py-1.5">
                  {amountText}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">تاريخ الخطاب</label>
                  <Input type="date" max="9999-12-31" value={form.claim_date} onChange={e => setForm(f => ({ ...f, claim_date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">مدة الرد (أيام)</label>
                  <Input type="number" value={form.reply_days} onChange={e => setForm(f => ({ ...f, reply_days: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Custom Note */}
            <div>
              <label className="text-xs font-medium text-foreground">📝 ملاحظة إضافية (اختياري)</label>
              <Textarea placeholder="ملاحظة إضافية تُضاف للخطاب..." value={form.custom_note} onChange={e => setForm(f => ({ ...f, custom_note: e.target.value }))} rows={2} />
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button onClick={saveClaim}>✅ إنشاء المطالبة</Button>
            </DialogFooter>
          </div>
        )}

        {/* ─── PREVIEW MODE ─── */}
        {mode === "preview" && previewClaim && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={() => printLetter(previewClaim)}>
                <Printer className="h-4 w-4 ml-1" /> 🖨️ طباعة
              </Button>
              {project.phone && (
                <Button size="sm" variant="outline" className="text-green-600" onClick={() => sendWhatsApp(previewClaim)}>
                  <MessageCircle className="h-4 w-4 ml-1" /> واتساب
                </Button>
              )}
            </div>

            {/* Letter Preview */}
            <div className="border rounded-lg p-6 bg-white text-sm leading-loose space-y-4" style={{ fontFamily: "'Cairo', sans-serif" }}>
              <div className="text-center font-bold text-base" style={{ color: "#1B3A5C" }}>بسم الله الرحمن الرحيم</div>
              <div className="text-center font-bold" style={{ color: "#1B3A5C" }}>{companyName}</div>
              {logoUrl && <div className="text-center"><img src={logoUrl} alt="" className="h-16 mx-auto object-contain" /></div>}
              <div className="font-semibold">{fDate(previewClaim.claim_date)}</div>
              <div>
                <p><strong>السادة المحترمين:</strong> {previewClaim.recipient_name}</p>
                {previewClaim.recipient_address && <p>{previewClaim.recipient_address}</p>}
                <p>تحية طيبة وبعد...</p>
              </div>
              <div className="text-center font-bold underline" style={{ color: "#1B3A5C" }}>الموضوع: مطالبة مالية بالرصيد المستحق</div>
              <p>نأمل أن تجدك هذه الرسالة بخير. نكتب إليك لنلفت انتباهك إلى حالة حسابك لدى <strong>{companyName}</strong>، ونحن نقدر العلاقة التي بنيناها مع حضرتكم ونلتزم بالعمل معاً لحل هذه المسألة.</p>
              <p>اعتباراً من {fDate(previewClaim.claim_date)} تشير سجلاتنا إلى أن الرصيد المستحق بقيمة <strong className="text-destructive">[{fNum(previewClaim.amount)}]</strong> {previewClaim.amount_text} قد تجاوز موعد استحقاقه.</p>
              <p>ونظراً للظروف الحالية وأهمية الحفاظ على الثقة والتعاون المتبادلين، فنحن على استعداد لمناقشة خطة الدفع التي تناسب كلا الطرفين. يرجى الاتصال بنا في أقرب وقت ممكن لإنهاء المسألة في غضون <strong>{previewClaim.reply_days} أيام</strong> من تاريخ هذه الرسالة.</p>
              {previewClaim.custom_note && <p>{previewClaim.custom_note}</p>}
              <p>نحن نقدر علاقتنا ونلتزم بالعمل معاً خلال هذه الأوقات الصعبة. نشكركم على اهتمامكم السريع بهذا الموضوع العاجل.</p>
              <p>مع فائق الاحترام.</p>
              <div className="mt-6">
                <p className="font-bold" style={{ color: "#1B3A5C" }}>المدير العام</p>
                <p>{companyName}</p>
                {companyPhone && <p>للتواصل: {companyPhone}</p>}
              </div>
              <div className="text-center text-xs text-muted-foreground border-t pt-2 mt-4">
                رقم المراسلة: {previewClaim.claim_number} • المشروع: {project.name}
              </div>
            </div>
          </div>
        )}

        {/* ─── HISTORY MODE ─── */}
        {mode === "history" && (
          <div>
            {claims.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">لا توجد مطالبات سابقة</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الرقم</TableHead>
                    <TableHead className="text-right">المستلم</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">أفعال</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.map(c => {
                    const st = statusMap[c.status] || statusMap.draft;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.claim_number}</TableCell>
                        <TableCell className="text-sm">{c.recipient_name}</TableCell>
                        <TableCell className="font-medium text-destructive">{fNum(c.amount)} ₪</TableCell>
                        <TableCell className="text-xs">{fDate(c.claim_date)}</TableCell>
                        <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setPreviewClaim(c); setMode("preview"); }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => printLetter(c)}>
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteClaim(c.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
