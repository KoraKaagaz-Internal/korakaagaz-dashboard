"use server";

import { createAnonClient } from "@/lib/supabase/server";

export async function verifyHash(hash: string): Promise<{ number: string; title: string; completed_at: string; signers: { name: string; signed_at: string }[] } | null> {
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  const { data } = await createAnonClient().rpc("verify_agreement_hash", { p_hash: hash });
  return (data as never) ?? null;
}
