import { useState, useEffect, useCallback } from "react";

interface TaskUser {
  id: string;
  full_name: string;
  username: string;
  role: string;
  avatar_color: string;
}

interface TaskSession {
  user: TaskUser;
  owner_id: string;
  expires_at: number;
}

const SESSION_KEY = "task_session";
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

export function useTaskAuth() {
  const [taskUser, setTaskUser] = useState<TaskUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const session: TaskSession = JSON.parse(raw);
        if (Date.now() < session.expires_at) {
          setTaskUser(session.user);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string, ownerId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/task-auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ username, password, owner_id: ownerId }),
        }
      );
      const data = await res.json();
      if (!data.success) return { success: false, error: data.error };

      const session: TaskSession = {
        user: data.user,
        owner_id: ownerId,
        expires_at: Date.now() + SESSION_DURATION,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setTaskUser(data.user);
      return { success: true };
    } catch {
      return { success: false, error: "خطأ في الاتصال" };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setTaskUser(null);
  }, []);

  const getOwnerId = useCallback((): string | null => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw).owner_id;
    } catch {
      return null;
    }
  }, []);

  return { taskUser, loading, login, logout, getOwnerId, isAdmin: taskUser?.role === "admin" };
}
