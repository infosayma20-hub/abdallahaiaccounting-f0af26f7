import { Card, CardContent } from "@/components/ui/card";
import { FileText, Image as ImageIcon } from "lucide-react";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";

interface Props {
  data: Employee360Data;
}

export function DocumentsTab({ data }: Props) {
  const e = data.employee || {};
  const docs = [
    { label: "صورة الموظف", url: e.photo_url || e.avatar_url, type: "image" as const },
    { label: "صورة الهوية", url: e.id_card_url || e.national_id_image, type: "image" as const },
    { label: "العقد", url: e.contract_url, type: "file" as const },
    { label: "المؤهل العلمي", url: e.qualification_url, type: "file" as const },
    { label: "السيرة الذاتية", url: e.cv_url, type: "file" as const },
    { label: "صورة جواز السفر", url: e.passport_url, type: "image" as const },
  ].filter((d) => d.url);

  if (docs.length === 0) {
    return (
      <Card className="p-10 text-center text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">لا توجد مستندات مرفقة.</p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {docs.map((d, i) => {
        const Icon = d.type === "image" ? ImageIcon : FileText;
        return (
          <a
            key={i}
            href={d.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block group"
          >
            <Card className="p-4 transition-all hover:shadow-md hover:border-primary">
              <CardContent className="p-0 flex flex-col items-center text-center gap-2">
                <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium">{d.label}</p>
                <p className="text-[11px] text-muted-foreground">اضغط للعرض</p>
              </CardContent>
            </Card>
          </a>
        );
      })}
    </div>
  );
}
