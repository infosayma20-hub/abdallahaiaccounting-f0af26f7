import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const TASK_USER_SAFE_SELECT = "id, user_id, full_name, username, role, avatar_color, is_active, last_login_at, created_at";
const DEFAULT_AVATAR_COLOR = "#1B3A5C";

export interface TaskActor {
  id: string;
  user_id: string;
  full_name: string;
  username: string;
  role: string;
  avatar_color: string;
  is_active: boolean;
}

const mapTaskActor = (record: any): TaskActor => ({
  id: record.id,
  user_id: record.user_id,
  full_name: record.full_name,
  username: record.username,
  role: record.role ?? "staff",
  avatar_color: record.avatar_color ?? DEFAULT_AVATAR_COLOR,
  is_active: record.is_active ?? true,
});

const getDisplayName = (user: User) => {
  const fullName = user.user_metadata?.full_name;

  if (typeof fullName === "string" && fullName.trim()) {
    return fullName.trim();
  }

  if (user.email) {
    return user.email.split("@")[0];
  }

  return "مستخدم";
};

const buildUsername = (user: User) => `auth_${user.id.slice(0, 8)}`;

export async function ensureTaskActor(user: User): Promise<TaskActor | null> {
  const username = buildUsername(user);

  const { data: existingByUsername, error: existingByUsernameError } = await supabase
    .from("task_users")
    .select(TASK_USER_SAFE_SELECT)
    .eq("username", username)
    .limit(1)
    .maybeSingle();

  if (existingByUsernameError) {
    console.error("[taskActor] Failed to load task actor by username:", existingByUsernameError);
  } else if (existingByUsername) {
    return mapTaskActor(existingByUsername);
  }

  const { data: existingByUserId, error: existingByUserIdError } = await supabase
    .from("task_users")
    .select(TASK_USER_SAFE_SELECT)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingByUserIdError) {
    console.error("[taskActor] Failed to load task actor by user_id:", existingByUserIdError);
  } else if (existingByUserId) {
    return mapTaskActor(existingByUserId);
  }

  const { data: createdActor, error: createdActorError } = await supabase
    .from("task_users")
    .insert({
      user_id: user.id,
      full_name: getDisplayName(user),
      username,
      password_hash: "AUTH_ONLY",
      role: "staff",
      avatar_color: DEFAULT_AVATAR_COLOR,
      is_active: true,
    })
    .select(TASK_USER_SAFE_SELECT)
    .single();

  if (!createdActorError && createdActor) {
    return mapTaskActor(createdActor);
  }

  if (createdActorError?.code === "23505") {
    const { data: fallbackActor, error: fallbackActorError } = await supabase
      .from("task_users")
      .select(TASK_USER_SAFE_SELECT)
      .eq("username", username)
      .limit(1)
      .maybeSingle();

    if (fallbackActorError) {
      console.error("[taskActor] Failed to recover existing task actor:", fallbackActorError);
      return null;
    }

    if (fallbackActor) {
      return mapTaskActor(fallbackActor);
    }
  }

  console.error("[taskActor] Failed to create task actor:", createdActorError);
  return null;
}

export function getTaskActorDisplayName(user: User | null) {
  if (!user) return "مستخدم";
  return getDisplayName(user);
}