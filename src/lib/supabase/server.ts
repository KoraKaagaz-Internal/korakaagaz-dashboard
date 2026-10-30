import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Role } from "../types";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: middleware refreshes the session instead.
        }
      },
    },
  });
}

/** Anonymous client for public share pages (only the shared_* RPCs are open to anon). */
export function createAnonClient() {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}

export interface SessionUser {
  id: string;
  email?: string;
}

/**
 * Signed-in user plus their workspace role (null when not a member), once per request.
 * getClaims() verifies the JWT locally against the project's ES256 public key (no Auth
 * round trip); the role is read from `members` on every request, so removing someone
 * still takes effect immediately.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { supabase, user: null as SessionUser | null, role: null as Role | null };
  const { data: role } = await supabase.rpc("my_role");
  const user: SessionUser = { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
  return { supabase, user: role ? user : null, role: (role as Role | null) ?? null };
});
