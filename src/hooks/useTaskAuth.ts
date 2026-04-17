import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  is_owner: boolean;
}

const SESSION_KEY = "task_session";
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

export function useTaskAuth() {
  const [taskUser, setTaskUser] = useState<TaskUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwnerSession, setIsOwnerSession] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const session: TaskSession = JSON.parse(raw);
        if (Date.now() < session.expires_at) {
          setTaskUser(session.user);
          setIsOwnerSession(!!session.is_owner);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setLoading(false);
  }, []);

  // Auto-login for the owner (main auth user) — no password needed
  const loginAsOwner = useCallback(async (authUserId: string, displayName: string): Promise<{ success: boolean }> => {
    try {
      // Check if owner already has any task_user record (admin or otherwise)
      const { data: existing } = await supabase
        .from("task_users")
        .select("*")
        .eq("user_id", authUserId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      let ownerTaskUser: TaskUser;

      if (existing) {
        ownerTaskUser = {
          id: existing.id,
          full_name: existing.full_name,
          username: existing.username,
          role: existing.role,
          avatar_color: existing.avatar_color,
        };
      } else {
        // Auto-create an admin task_user for the owner
        // Use a unique username to avoid conflicts (per-user owner record)
        const uniqueUsername = `owner_${authUserId.slice(0, 8)}`;
        const { data: created, error } = await supabase
          .from("task_users")
          .insert({
            user_id: authUserId,
            full_name: displayName || "المالك",
            username: uniqueUsername,
            password_hash: "OWNER_AUTH", // not used for owner login
            role: "admin",
            avatar_color: "#1B3A5C",
          })
          .select()
          .maybeSingle();

        if (error || !created) {
          console.error("[useTaskAuth] Failed to create owner task_user:", error);
          return { success: false };
        }

        ownerTaskUser = {
          id: created.id,
          full_name: created.full_name,
          username: created.username,
          role: created.role,
          avatar_color: created.avatar_color,
        };
      }

      const session: TaskSession = {
        user: ownerTaskUser,
        owner_id: authUserId,
        expires_at: Date.now() + SESSION_DURATION,
        is_owner: true,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setTaskUser(ownerTaskUser);
      setIsOwnerSession(true);
      return { success: true };
    } catch (e) {
      console.error("[useTaskAuth] loginAsOwner exception:", e);
      return { success: false };
    }
  }, []);

  // Login for employees (separate credentials)
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
        is_owner: false,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setTaskUser(data.user);
      setIsOwnerSession(false);
      return { success: true };
    } catch {
      return { success: false, error: "خطأ في الاتصال" };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setTaskUser(null);
    setIsOwnerSession(false);
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

  return { taskUser, loading, login, loginAsOwner, logout, getOwnerId, isAdmin: taskUser?.role === "admin", isOwnerSession };
}
