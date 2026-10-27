import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google OAuth returns ?code= (PKCE). Admin-generated links (used by tests) return ?token_hash=&type=.
// Uninvited accounts are rejected by a database trigger, which Supabase reports as error_description.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  const failure = (searchParams.get("error_description") ?? "").toLowerCase();
  if (failure) {
    const reason = failure.includes("database error") || failure.includes("not_invited") ? "not_invited" : "link";
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  }

  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  if (!ok) return NextResponse.redirect(`${origin}/login?error=link`);

  // Belt and braces: a session without a membership (e.g. removed member) is signed out.
  const { data: role } = await supabase.rpc("my_role");
  if (!role) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_invited`);
  }
  return NextResponse.redirect(`${origin}/`);
}
