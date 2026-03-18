import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTaskAuth } from "@/hooks/useTaskAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ClipboardList, LogIn } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function TaskLoginPage() {
  const { user } = useAuth();
  const { taskUser, login, loginAsOwner, loading: taskLoading } = useTaskAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);

  // Owner auto-login: if user is the main auth owner, skip login screen
  useEffect(() => {
    if (!user || taskLoading || autoLoginAttempted) return;
    if (taskUser) {
      navigate("/tasks/board", { replace: true });
      return;
    }

    // Check if this user is an owner (not an invited employee)
    const isOwner = !user.user_metadata?.role || user.user_metadata?.role === "admin";
    if (isOwner) {
      setAutoLoginAttempted(true);
      const displayName = user.user_metadata?.full_name || user.email || "المالك";
      loginAsOwner(user.id, displayName).then(result => {
        if (result.success) {
          navigate("/tasks/board", { replace: true });
        }
      });
    } else {
      setAutoLoginAttempted(true);
    }
  }, [user, taskUser, taskLoading, autoLoginAttempted, navigate, loginAsOwner]);

  // If already logged in to tasks, redirect
  useEffect(() => {
    if (taskUser && !taskLoading) {
      navigate("/tasks/board", { replace: true });
    }
  }, [taskUser, taskLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const result = await login(username, password, user.id);
    setLoading(false);
    if (result.success) {
      navigate("/tasks/board");
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }
  };

  // Show loading while auto-login is in progress
  if (!autoLoginAttempted && user) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: "#1B3A5C" }} />
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4" dir="rtl">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#1B3A5C" }}>
            <ClipboardList className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "#1B3A5C" }}>إدارة المهام</h1>
          <p className="text-sm text-muted-foreground mt-1">سجّل دخولك لمتابعة المهام والتكليفات</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label>اسم المستخدم</Label>
              <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="أدخل اسم المستخدم" required />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="أدخل كلمة المرور" required />
            </div>
            <Button type="submit" className="w-full text-white" style={{ background: "#1B3A5C" }} disabled={loading}>
              <LogIn className="w-4 h-4 ml-2" />
              {loading ? "جاري الدخول..." : "دخول"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
