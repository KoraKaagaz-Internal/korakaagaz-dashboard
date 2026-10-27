"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/data";
import { sendMail } from "@/lib/mail";
import type { Role } from "@/lib/types";
import { siteUrl } from "./auth";

export async function inviteMember(email: string, role: Exclude<Role, "admin">) {
  const { supabase, user } = await requireMember("admin");
  const clean = email.trim().toLowerCase();
  const { data, error } = await supabase.rpc("admin_invite", { p_email: clean, p_role: role });
  if (error) return { ok: false as const, message: error.message };

  const url = await siteUrl();
  const text = `Hi,\n\nYou've been invited to Kora Kaagaz Invoices as a ${role}.\n\nSign in with your Google account (${clean}) here:\n${url}/login\n\nOnly this email address can sign in.\n\n— ${user.email}`;
  let mail: string = "skipped";
  if (data === "invited") {
    const result = await sendMail({ to: [clean], subject: "You're invited to Kora Kaagaz Invoices", text });
    mail = result.status;
    await supabase.from("email_log").insert({ kind: "invite", to_email: clean, subject: "Invite", status: result.status, error: result.status === "failed" ? result.error : result.status === "skipped" ? result.reason : "" });
  }
  revalidatePath("/team");
  return { ok: true as const, result: data as string, mail, inviteText: text };
}

export async function changeRole(email: string, role: Exclude<Role, "admin">) {
  const { supabase } = await requireMember("admin");
  const { error } = await supabase.rpc("admin_invite", { p_email: email, p_role: role });
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/team");
  return { ok: true as const };
}

export async function removeMember(email: string) {
  const { supabase } = await requireMember("admin");
  const { error } = await supabase.rpc("admin_remove_member", { p_email: email });
  if (error) return { ok: false as const, message: error.message };
  revalidatePath("/team");
  return { ok: true as const };
}
