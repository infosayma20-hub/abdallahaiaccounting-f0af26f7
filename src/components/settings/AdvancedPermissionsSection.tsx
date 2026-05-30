import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ShieldAlert, FileEdit, Trash2 } from "lucide-react";
import type { CompanySettings } from "@/hooks/useCompanySettings";

interface Props {
  settings: CompanySettings;
  onChange: (partial: Partial<CompanySettings>) => void;
}

const AdvancedPermissionsSection = ({ settings, onChange }: Props) => {
  return (
    <div>
      <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
        <span className="w-1 h-5 bg-amber-500 rounded-full" />
        <ShieldAlert className="h-4 w-4 text-amber-500" />
        صلاحيات متقدمة
      </h3>

      <div className="space-y-3">
        <div className="flex items-center justify-between p-4 bg-muted/40 rounded-xl border border-border/30">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mt-0.5">
              <FileEdit className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="font-medium text-sm">تعديل المستندات المرحَّلة</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                السماح بتعديل الفواتير والسندات بعد الترحيل مباشرة
              </p>
            </div>
          </div>
          <Switch
            checked={settings.can_edit_posted ?? false}
            onCheckedChange={v => onChange({ can_edit_posted: v })}
          />
        </div>

        <div className="flex items-center justify-between p-4 bg-muted/40 rounded-xl border border-border/30">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center mt-0.5">
              <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="font-medium text-sm">حذف المستندات المرحَّلة</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                السماح بحذف أي مستند بغض النظر عن حالته
              </p>
            </div>
          </div>
          <Switch
            checked={settings.can_delete_posted ?? false}
            onCheckedChange={v => onChange({ can_delete_posted: v })}
          />
        </div>

        {(settings.can_edit_posted || settings.can_delete_posted) && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              تفعيل هذه الصلاحيات يسمح بتعديل أو حذف المستندات المرحّلة. سيتم تسجيل جميع التعديلات في سجل النشاط للمراجعة.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvancedPermissionsSection;
