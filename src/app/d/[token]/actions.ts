"use server";

import { revalidatePath } from "next/cache";
import { createAnonClient } from "@/lib/supabase/server";

/** The client accepts or declines a quote from the share link. */
export async function respondToQuote(token: string, accept: boolean, reason: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return "unavailable";
  const supabase = createAnonClient();
  const { data } = await supabase.rpc("shared_accept_quote", { p_token: token, p_accept: accept, p_reason: reason.slice(0, 500) });
  revalidatePath(`/d/${token}`);
  return String(data ?? "unavailable");
}
