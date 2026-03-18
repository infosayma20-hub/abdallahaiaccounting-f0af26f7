import { useState } from "react";
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
  const { login } = useTaskAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const ownerId = user.id;
    const result = await login(username, password, ownerId);
    setLoading(false);
    if (result.success) {
      navigate("/tasks/board");
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }
  };

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
