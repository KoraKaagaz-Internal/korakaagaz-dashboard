import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";

// Free, keyless ECB reference rates (Frankfurter). Falls back to manual entry if unavailable.
const SOURCES = [
  (c: string) => `https://api.frankfurter.dev/v1/latest?base=${c}&symbols=INR`,
  (c: string) => `https://api.frankfurter.app/latest?from=${c}&to=INR`,
];

export async function GET(request: NextRequest) {
  const { user } = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const currency = (request.nextUrl.searchParams.get("currency") ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || currency === "INR") return NextResponse.json({ error: "Pick a foreign currency" }, { status: 400 });
  for (const url of SOURCES) {
    try {
      const res = await fetch(url(currency), { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const json = await res.json();
      const rate = Number(json?.rates?.INR);
      if (rate > 0) return NextResponse.json({ rate, date: json.date, source: "ECB reference rate via frankfurter" });
    } catch {
      // try the next source
    }
  }
  return NextResponse.json({ error: "Couldn't fetch a rate. Enter it manually (e.g. from your bank's FIRC)." }, { status: 502 });
}
