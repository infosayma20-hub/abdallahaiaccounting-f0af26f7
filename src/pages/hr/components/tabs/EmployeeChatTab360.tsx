import { Loader2 } from "lucide-react";
import ChatThreadView from "@/components/chat/ChatThreadView";
import { useHRChatThreadId } from "@/hooks/useHRChat";

export function EmployeeChatTab360({ employeeId, employeeName }: { employeeId: string; employeeName?: string }) {
  const { threadId, loading, error } = useHRChatThreadId(employeeId);

  if (loading) {
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
        subtitle="محادثة مباشرة مع الموظف"
        className="h-full"
      />
    </div>
  );
}

export default EmployeeChatTab360;