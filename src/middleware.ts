import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Share links, their PDFs and the cron endpoint are public (each checks its own token/secret).
const PUBLIC_PATHS = ["/login", "/auth", "/d", "/print/share", "/api/share", "/api/cron", "/api/ics", "/enquire", "/book", ...(process.env.NODE_ENV === "production" ? [] : ["/dev"])];

export async function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== "production" && request.nextUrl.pathname.startsWith("/dev")) {
    return NextResponse.next({ request });
  }
  // Pass the path on so the app layout can gate whole sections by role with a real redirect
  // (redirects thrown inside a streamed page arrive late, after the loading skeleton).
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("x-path", request.nextUrl.pathname);
    return NextResponse.next({ request: { headers } });
  };
  let response = next();

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = next();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Verifies the JWT locally (ES256 public key) and refreshes the session cookie when needed.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|fonts/).*)"],
};
