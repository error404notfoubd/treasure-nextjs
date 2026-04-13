import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAuthAdminClient } from "@/lib/supabase";
import { getPermissionGrants, hasPermission } from "@/lib/permission-grants";
import { PERMISSION_KEYS } from "@/lib/permissions-catalog";

const SESSION_COOKIE = "_sid";

// Get the currently authenticated user + their profile (including role).
// Requires a valid Supabase session (JWT) and a `profiles` row. `_sid` is set by `proxy.js` (Next.js Proxy)
// on dashboard routes; it may be absent on the first `/api/*` request after sign-in, so we
// still resolve the user when `getUser()` succeeds.
//
// Authorization: `requirePermission` reads `role_permission_grants` (owner bypasses matrix).
export async function getSessionUser() {
  const cookieStore = await cookies();

  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  const supabase = createServerClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Ignore in server components
          }
        },
      },
    }
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const admin = getAuthAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: profile.full_name,
    role: profile.role,
    status: profile.status || "approved",
    avatarUrl: profile.avatar_url,
    createdAt: profile.created_at,
    sessionId: sessionId ?? null,
  };
}

/** @param {string} permissionKey — must be one of PERMISSION_KEYS */
export async function requirePermission(permissionKey) {
  if (!PERMISSION_KEYS.includes(permissionKey)) {
    return { error: "Invalid authorization guard", status: 500 };
  }
  const user = await getSessionUser();
  if (!user) {
    return { error: "Unauthorized", status: 401 };
  }
  if (user.status !== "approved") {
    return { error: "Account pending approval", status: 403 };
  }
  const grants = await getPermissionGrants();
  if (!hasPermission(grants, user.role, permissionKey)) {
    return { error: "Forbidden — insufficient permissions", status: 403 };
  }
  return { user, grants };
}

export async function requireOwner() {
  const user = await getSessionUser();
  if (!user) {
    return { error: "Unauthorized", status: 401 };
  }
  if (user.status !== "approved") {
    return { error: "Account pending approval", status: 403 };
  }
  if (user.role !== "owner") {
    return { error: "Forbidden — owner only", status: 403 };
  }
  return { user };
}
