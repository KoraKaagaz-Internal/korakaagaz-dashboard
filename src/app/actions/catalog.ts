"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/data";
import { checkGstin } from "@/lib/gst";
import type { CatalogItem, Client } from "@/lib/types";

const clientSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().default(""),
  cc_emails: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  address: z.string().trim().default(""),
  city: z.string().trim().default(""),
  pin: z.string().trim().default(""),
  state_code: z.string().trim().default(""),
  country: z.string().trim().min(1).default("India"),
  gstin: z.string().trim().toUpperCase().default(""),
  notes: z.string().trim().default(""),
});

export async function saveClient(input: z.input<typeof clientSchema>): Promise<{ ok: true; client: Client } | { ok: false; message: string }> {
  const { supabase } = await requireMember("member");
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((i) => i.message).join(", ") };
  const { id, ...c } = parsed.data;
  if (c.gstin) {
    const g = checkGstin(c.gstin);
    if (!g.ok) return { ok: false, message: `GSTIN: ${g.reason}` };
    c.state_code = g.state; // the GSTIN decides the state
  }
  if (c.country === "India" && !c.state_code) return { ok: false, message: "Pick the client's state (needed for place of supply)" };
  if (c.country !== "India") c.state_code = "";
  const q = id ? supabase.from("clients").update(c).eq("id", id).select("*").single() : supabase.from("clients").insert(c).select("*").single();
  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };
  revalidatePath("/clients");
  return { ok: true, client: data as Client };
}

export async function deleteClient(id: string) {
  const { supabase } = await requireMember("member");
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/clients");
  return { ok: true as const };
}

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().default(""),
  sac: z
    .string()
    .trim()
    .regex(/^(\d{4,8})?$/, "SAC must be 4–8 digits")
    .default(""),
  unit_price: z.coerce.number().min(0),
});

export async function saveItem(input: z.input<typeof itemSchema>): Promise<{ ok: true; item: CatalogItem } | { ok: false; message: string }> {
  const { supabase } = await requireMember("admin");
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((i) => i.message).join(", ") };
  const { id, ...it } = parsed.data;
  const q = id ? supabase.from("items").update(it).eq("id", id).select("*").single() : supabase.from("items").insert(it).select("*").single();
  const { data, error } = await q;
  if (error) return { ok: false, message: error.message };
  revalidatePath("/items");
  return { ok: true, item: { ...(data as CatalogItem), unit_price: Number(data.unit_price) } };
}

export async function deleteItem(id: string) {
  const { supabase } = await requireMember("admin");
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/items");
  return { ok: true as const };
}
