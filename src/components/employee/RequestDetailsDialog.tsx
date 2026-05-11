import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import {
  AnyRequest,
  getDetailGroups,
  getRequestTitle,
  getStatusBadge,
} from "@/lib/employeeRequestDisplay";

interface Props {
  request: AnyRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RequestDetailsDialog({ request, open, onOpenChange }: Props) {
  if (!request) return null;
  const groups = getDetailGroups(request);
  const st = getStatusBadge(request.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto p-4"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 text-base">
            <span>{getRequestTitle(request)}</span>
            <Badge variant={st.variant} className="text-[10px]">
              {st.emoji} {st.text}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {groups.map((g, gi) => (
            <section key={gi} className="rounded-lg border border-border bg-card/50">
              <div className="px-3 py-2 border-b border-border bg-muted/30">
                <h3 className="text-xs font-semibold text-foreground">{g.title}</h3>
              </div>
              <dl className="divide-y divide-border">
                {g.fields.map((f, fi) => (
                  <div key={fi} className="grid grid-cols-3 gap-2 px-3 py-2 text-xs">
                    <dt className="col-span-1 text-muted-foreground">{f.label}</dt>
                    <dd className="col-span-2 break-words whitespace-pre-wrap text-foreground">
                      {f.isUrl ? (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs"
                          asChild
                        >
                          <a href={String(f.value)} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3 w-3 ml-1" />
                            فتح المرفق
                          </a>
                        </Button>
                      ) : typeof f.value === "object" ? (
                        <code className="text-[10px]">{JSON.stringify(f.value)}</code>
                      ) : (
                        String(f.value)
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
