import { Loader2 } from "lucide-react";
import ChatThreadView from "@/components/chat/ChatThreadView";
import { useHRChatThreadId } from "@/hooks/useHRChat";

export default function EmployeeChatTab({ employeeId }: { employeeId: string }) {
  const { threadId, loading, error } = useHRChatThreadId(employeeId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !threadId) {
    return (
      <div dir="rtl" className="p-8 text-center text-sm text-muted-foreground">
        تعذّر فتح المحادثة حالياً. حاول لاحقاً.
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 top-0 flex flex-col bg-background z-30"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        bottom: "calc(56px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <ChatThreadView
        threadId={threadId}
        side="employee"
        title="الموارد البشرية"
        subtitle="محادثة مباشرة"
        emptyHint="ابدأ محادثتك مع الموارد البشرية."
        className="flex-1 min-h-0"
      />
    </div>
  );
}