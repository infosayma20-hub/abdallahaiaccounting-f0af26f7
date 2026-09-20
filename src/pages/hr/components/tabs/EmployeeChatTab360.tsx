import { Loader2 } from "lucide-react";
import ChatThreadView from "@/components/chat/ChatThreadView";
import { useHRChatThreadId } from "@/hooks/useHRChat";
import { useHREmployeeChatEnabled } from "@/hooks/useHREmployeeChatEnabled";

export function EmployeeChatTab360({ employeeId, employeeName }: { employeeId: string; employeeName?: string }) {
  const { threadId, loading, error } = useHRChatThreadId(employeeId);
  const { enabled: chatEnabled, loading: chatFlagLoading } = useHREmployeeChatEnabled();

  if (loading || chatFlagLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !threadId) {
    return <div className="p-8 text-center text-sm text-muted-foreground">تعذّر فتح المحادثة.</div>;
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden h-[560px]">
      <ChatThreadView
        threadId={threadId}
        side="hr"
        title={employeeName || "محادثة"}
        subtitle={chatEnabled ? "محادثة مباشرة مع الموظف" : "المراسلة متوقفة — عرض السجل فقط"}
        className="h-full"
        readOnly={!chatEnabled}
        readOnlyHint="نظام المراسلة متوقف من إعدادات الموارد البشرية. السجل للاطلاع فقط."
      />
    </div>
  );
}

export default EmployeeChatTab360;
