import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessagesSquare, Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChatThreadView from "@/components/chat/ChatThreadView";
import { useHRChatInbox } from "@/hooks/useHRChat";

export default function HRChatPage() {
  const { threads, loading } = useHRChatInbox();
  const [params, setParams] = useSearchParams();
  const active = params.get("thread");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return threads;
    return threads.filter((t) => (t.employee_name || "").includes(q));
  }, [threads, search]);

  const activeThread = threads.find((t) => t.id === active) || null;

  const openThread = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("thread", id);
    setParams(next, { replace: true });
  };

  const closeThread = () => {
    const next = new URLSearchParams(params);
    next.delete("thread");
    setParams(next, { replace: true });
  };

  return (
    <div dir="rtl" className="h-[calc(100dvh-14rem)] min-h-[420px] flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-1 pb-2 shrink-0">
        <MessagesSquare className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">مراسلة الموظفين</h1>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_1fr] gap-3">
        {/* Threads list */}
        <div
          className={[
            "border border-border rounded-xl bg-card flex flex-col min-h-0 overflow-hidden",
            active ? "hidden md:flex" : "flex",
          ].join(" ")}
        >
          <div className="p-2 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث باسم الموظف..."
                className="pr-8 h-9 text-sm"
              />
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">لا توجد محادثات.</div>
            )}
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => openThread(t.id)}
                className={[
                  "w-full text-right px-3 py-2.5 border-b border-border/60 hover:bg-muted/50 transition-colors",
                  active === t.id ? "bg-muted" : "",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">{t.employee_name}</span>
                  {t.unread_for_hr > 0 && (
                    <Badge className="bg-destructive text-destructive-foreground text-[10px] h-5 px-1.5">
                      {t.unread_for_hr}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-[11px] text-muted-foreground truncate">
                    {t.last_message_preview || "—"}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {t.last_message_at
                      ? new Date(t.last_message_at).toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit" })
                      : ""}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Conversation */}
        <div
          className={[
            "border border-border rounded-xl bg-card min-h-0 overflow-hidden",
            active ? "flex flex-col" : "hidden md:flex md:flex-col",
          ].join(" ")}
        >
          {active ? (
            <>
              <div className="md:hidden p-1 border-b border-border shrink-0">
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={closeThread}>
                  <ArrowRight className="h-4 w-4" /> رجوع
                </Button>
              </div>
              <ChatThreadView
                threadId={active}
                side="hr"
                title={activeThread?.employee_name || "محادثة"}
                subtitle="محادثة مباشرة مع الموظف"
                className="flex-1 min-h-0"
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              اختر محادثة من القائمة
            </div>
          )}
        </div>
      </div>
    </div>
  );
}