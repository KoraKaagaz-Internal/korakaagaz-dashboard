"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/data";
import { checkGstin } from "@/lib/gst";
import { isValidVpa } from "@/lib/upi";

const prefix = z
  .string()
  .trim()
  .min(1)
  .max(5)
  .regex(/^[A-Za-z0-9]+$/, "Prefix: letters and digits only");

const settingsSchema = z.object({
  business_name: z.string().trim().min(1),
  legal_name: z.string().trim(),
  address: z.string().trim(),
  state_code: z
    .string()
    .trim()
    .regex(/^\d{2}$/, "Pick a state"),
  gstin: z.string().trim().toUpperCase(),
  pan: z.string().trim().toUpperCase(),
  lut_number: z.string().trim(),
  lut_fy: z.string().trim(),
  signatory_name: z.string().trim(),
  query_email: z.string().trim(),
  query_phone: z.string().trim(),
  default_currency: z.string().trim().min(3).max(3).toUpperCase(),
  default_due_days: z.coerce.number().int().min(0).max(365),
  default_sac: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "SAC must be 4–8 digits"),
  default_gst_rate: z.coerce.number().min(0).max(28),
  require_approval: z.coerce.boolean(),
  gst_filing: z.enum(["monthly", "qrmp", "none"]).default("monthly"),
  reminders_enabled: z.coerce.boolean(),
  prefixes: z.object({ invoice: prefix, quote: prefix, proforma: prefix, receipt: prefix, credit_note: prefix }),
  terms: z.record(z.string(), z.string()),
  message_templates: z.record(z.string(), z.string()),
});

export type SettingsInput = z.input<typeof settingsSchema>;

export async function saveSettings(input: SettingsInput) {
  const { supabase } = await requireMember("admin");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues.map((i) => i.message).join(", ") };
  const s = parsed.data;
  if (s.gstin) {
    const g = checkGstin(s.gstin);
    if (!g.ok) return { ok: false as const, message: `GSTIN: ${g.reason}` };
    if (g.state !== s.state_code) return { ok: false as const, message: "GSTIN state code doesn't match the business state" };
  }
  // Drop empty overrides so defaults keep applying.
  const clean = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v.trim()));
  const { error } = await supabase
    .from("settings")
    .update({ ...s, terms: clean(s.terms), message_templates: clean(s.message_templates) })
    .eq("id", 1);
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/", "layout");
  return { ok: true as const, message: "Settings saved." };
}

/** Signature/stamp image stored as a small data URL so print and share pages need no storage auth. */
export async function saveSignature(dataUrl: string | null) {
  const { supabase } = await requireMember("admin");
  if (dataUrl && (!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl) || dataUrl.length > 200_000)) {
    return { ok: false as const, message: "Use a PNG/JPG under 150 KB" };
  }
  const { error } = await supabase.from("settings").update({ signature_path: dataUrl }).eq("id", 1);
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

const bankSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1),
  account_name: z.string().trim(),
  account_no: z.string().trim(),
  ifsc: z.string().trim().toUpperCase(),
  bank_name: z.string().trim(),
  branch_address: z.string().trim(),
  swift: z.string().trim().toUpperCase(),
  iban: z.string().trim().toUpperCase(),
  upi_id: z.string().trim(),
  is_default: z.boolean(),
  opening_balance: z.coerce.number().default(0),
  opening_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .or(z.literal("").transform(() => null))
    .default(null),
});

export async function saveBankAccount(input: z.input<typeof bankSchema>) {
  const { supabase } = await requireMember("admin");
  const parsed = bankSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues.map((i) => i.message).join(", ") };
  const { id, ...b } = parsed.data;
  if (b.upi_id && !isValidVpa(b.upi_id)) return { ok: false as const, message: "UPI ID looks wrong (e.g. name@okhdfcbank)" };
  if (b.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(b.ifsc)) return { ok: false as const, message: "IFSC should look like HDFC0001234" };
  if (b.is_default) await supabase.from("bank_accounts").update({ is_default: false }).eq("is_default", true);
  const { count } = await supabase.from("bank_accounts").select("id", { count: "exact", head: true });
  if (!count) b.is_default = true; // the first account is the default
  const q = id ? supabase.from("bank_accounts").update(b).eq("id", id) : supabase.from("bank_accounts").insert(b);
  const { error } = await q;
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function deleteBankAccount(id: string) {
  const { supabase } = await requireMember("admin");
  const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

/** Timesheet approval: on = people submit weeks and the admin approves; off = hours count as logged. */
export async function setTimeApproval(on: boolean) {
  const { supabase } = await requireMember("admin");
  const { error } = await supabase.from("settings").update({ time_approval: !!on }).eq("id", 1);
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/settings");
  revalidatePath("/time");
  return { ok: true as const };
}
