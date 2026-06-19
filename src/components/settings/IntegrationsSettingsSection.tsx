import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table as UITable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, MessageCircle, Table as TableIcon, Mail, Cloud, MessageSquare, Plug, Settings as SettingsIcon, PlayCircle, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { SettingsSection } from "./shell/SettingsSection";
import type { CompanySettings } from "@/hooks/useCompanySettings";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

type IntegrationStatus = "connected" | "needs_keys" | "coming_soon";

interface IntegrationRow {
  id: string;
  name: string;
  desc: string;
  icon: typeof MessageCircle;
  key: string;
  status: IntegrationStatus;
  tip: string;
}

const integrations: IntegrationRow[] = [
  { id: "whatsapp", name: "واتساب", desc: "إرسال الفواتير والتذكيرات عبر واتساب", icon: MessageCircle, key: "integration_whatsapp", status: "needs_keys", tip: "غير مربوط — يحتاج تكامل مزود WhatsApp Business" },
  { id: "google_sheets", name: "جوجل شيتس", desc: "تصدير البيانات تلقائياً لجداول Google", icon: TableIcon, key: "integration_google_sheets", status: "coming_soon", tip: "قيد التحضير" },
  { id: "email_smtp", name: "البريد الإلكتروني (SMTP)", desc: "إرسال الفواتير والتقارير بالبريد الإلكتروني", icon: Mail, key: "integration_email_smtp", status: "needs_keys", tip: "غير مربوط — يحتاج إعدادات SMTP على الخادم" },
  { id: "cloud_backup", name: "النسخ الاحتياطي السحابي", desc: "نسخ احتياطي تلقائي يومي للبيانات", icon: Cloud, key: "integration_cloud_backup", status: "coming_soon", tip: "قيد التحضير — يتم تلقائياً عبر Lovable Cloud" },
  { id: "sms", name: "الرسائل النصية (SMS)", desc: "إرسال تذكيرات الدفع والتنبيهات عبر SMS", icon: MessageSquare, key: "integration_sms", status: "needs_keys", tip: "غير مربوط — يحتاج مزود SMS" },
];

const statusBadge = (status: IntegrationStatus) => {
  if (status === "connected")
    return <Badge variant="outline" className="text-[10px] font-normal border-emerald-500/40 text-emerald-700 dark:text-emerald-400">مربوط</Badge>;
  if (status === "needs_keys")
    return <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground border-border/60">يحتاج مفاتيح</Badge>;
  return <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground border-border/60">قيد التحضير</Badge>;
};

const IntegrationsSettingsSection = ({ settings, onChange }: Props) => {
  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-4">
      <SettingsSection
        title="الخدمات المتصلة"
        description="جميع التكاملات الخارجية وحالتها الحالية."
      >
        <div className="border border-border rounded-md overflow-hidden">
          <UITable>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-right text-xs h-9">التكامل</TableHead>
                <TableHead className="text-right text-xs h-9 hidden md:table-cell">الوصف</TableHead>
                <TableHead className="text-right text-xs h-9 w-[110px]">الحالة</TableHead>
                <TableHead className="text-right text-xs h-9 w-[200px]">إجراءات</TableHead>
                <TableHead className="text-right text-xs h-9 w-[80px]">تفعيل</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {integrations.map(item => {
                const Icon = item.icon;
                const enabled = false; // none are actually wired
                return (
                  <TableRow key={item.id}>
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium">{item.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 text-xs text-muted-foreground hidden md:table-cell">{item.desc}</TableCell>
                    <TableCell className="py-2.5">{statusBadge(item.status)}</TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button size="sm" variant="outline" className="h-7 px-2 gap-1" disabled>
                                <SettingsIcon className="h-3.5 w-3.5" />
                                <span className="text-[11px]">إعداد</span>
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{item.tip}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button size="sm" variant="outline" className="h-7 px-2 gap-1" disabled>
                                <PlayCircle className="h-3.5 w-3.5" />
                                <span className="text-[11px]">اختبار</span>
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{item.tip}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Switch checked={enabled} disabled />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{item.tip}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </UITable>
        </div>
      </SettingsSection>

      <SettingsSection
        title="واجهة برمجة التطبيقات (API)"
        description="دمج AMWALI مع أنظمتك الخارجية عبر REST API."
        action={<Badge variant="outline" className="text-[10px] font-normal text-muted-foreground border-border/60">قيد التحضير</Badge>}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Plug className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">AMWALI API</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
              <ExternalLink className="h-3 w-3" />
              التوثيق والمفاتيح ستكون متاحة قريباً
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button size="sm" variant="outline" disabled>توليد مفتاح</Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>قيد التحضير — لم يتم إصدار الـ API بعد</TooltipContent>
          </Tooltip>
        </div>
      </SettingsSection>

      <SettingsSection
        title="الاستيراد والتصدير"
        description="جدولة وصيغة التصدير الافتراضية."
        action={<Badge variant="outline" className="text-[10px] font-normal text-muted-foreground border-border/60">يتطلب Backend</Badge>}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg opacity-70">
            <div>
              <p className="font-medium text-sm">تصدير تلقائي نهاية الشهر</p>
              <p className="text-xs text-muted-foreground">قيد التحضير — يحتاج جدولة على الخادم</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Switch checked={false} disabled />
                </span>
              </TooltipTrigger>
              <TooltipContent>غير مفعّل — يحتاج Cron Job على الخادم</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="font-medium text-sm">صيغة التصدير الافتراضية</p>
              <p className="text-xs text-muted-foreground">Excel (.xlsx) أو PDF</p>
            </div>
            <div className="flex gap-2">
              {(["xlsx", "pdf"] as const).map(fmt => {
                const active = ((settings as any).integration_export_format ?? "xlsx") === fmt;
                return (
                  <Button
                    key={fmt}
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-7 px-3 text-xs"
                    onClick={() => onChange({ integration_export_format: fmt } as any)}
                  >
                    {fmt.toUpperCase()}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
    </TooltipProvider>
  );
};

export default IntegrationsSettingsSection;
