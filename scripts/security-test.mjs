// Database security checks against a real Supabase project, acting as each kind of user.
// Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/security-test.mjs   (reads NEXT_PUBLIC_SUPABASE_* from env)
// Creates throwaway test users (invited first), checks access, then removes everything it made.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const stamp = Date.now();
const MEMBER = `sec-member-${stamp}@example.com`;
const VIEWER = `sec-viewer-${stamp}@example.com`;
const OUTSIDER = `sec-outsider-${stamp}@example.com`;
const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
};

async function sessionFor(email) {
  // create the (invited) user first; a magic link for a brand-new user is a signup link
  await admin.auth.admin.createUser({ email, email_confirm: true });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: vErr } = await c.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  if (vErr) throw vErr;
  return c;
}

const created = { clients: [], documents: [], users: [] };
// The test takes an invoice number; remember the counter so real numbering isn't disturbed.
const { data: counterBefore } = await admin.from("doc_counters").select("*").eq("doc_type", "invoice").eq("fy", "26-27").maybeSingle();
try {
  // Invite test users directly (service role), as the admin would.
  await admin.from("members").insert([
    { email: MEMBER, role: "member", invited_by: "security-test" },
    { email: VIEWER, role: "viewer", invited_by: "security-test" },
  ]);

  // 1. Uninvited people cannot get an account at all.
  const { error: outsiderErr } = await admin.auth.admin.createUser({ email: OUTSIDER, email_confirm: true });
  check("uninvited sign-up is rejected", !!outsiderErr, outsiderErr?.message?.slice(0, 60));
  const { error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: OUTSIDER });
  check("uninvited magic link is rejected", !!linkErr);

  const member = await sessionFor(MEMBER);
  const viewer = await sessionFor(VIEWER);
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  for (const e of [MEMBER, VIEWER]) {
    const { data } = await admin.from("members").select("user_id").eq("email", e).single();
    created.users.push(data.user_id);
  }

  // 2. Anonymous visitors see nothing.
  for (const t of ["documents", "clients", "payments", "settings", "bank_accounts", "audit_events", "members"]) {
    const { data } = await anon.from(t).select("*").limit(1);
    check(`anon cannot read ${t}`, !data || data.length === 0);
  }
  const { error: anonInvite } = await anon.rpc("admin_invite", { p_email: "x@example.com", p_role: "member" });
  check("anon cannot invite", !!anonInvite);

  // 3. Members can create; viewers can't write.
  const { data: client, error: mErr } = await member.from("clients").insert({ name: "Security Test Co", state_code: "21" }).select("id").single();
  check("member can create a client", !mErr && !!client, mErr?.message);
  if (client) created.clients.push(client.id);
  const { error: vErr } = await viewer.from("clients").insert({ name: "Viewer Co", state_code: "21" });
  check("viewer cannot create a client", !!vErr);
  const { data: vRead } = await viewer.from("clients").select("id").eq("id", client?.id ?? "");
  check("viewer can read clients", (vRead ?? []).length === 1);
  const { data: vUpd } = await viewer.from("clients").update({ name: "hacked" }).eq("id", client?.id ?? "").select("id");
  check("viewer cannot edit a client", !vUpd || vUpd.length === 0);

  // 4. Only the admin manages the team and settings.
  const { error: memInvite } = await member.rpc("admin_invite", { p_email: `sneaky-${stamp}@example.com`, p_role: "member" });
  check("member cannot invite people", !!memInvite && /admin only/.test(memInvite.message));
  const { error: viewerSelfPromote } = await viewer.rpc("admin_invite", { p_email: VIEWER, p_role: "member" });
  check("viewer cannot promote themselves", !!viewerSelfPromote);
  const { data: setUpd } = await member.from("settings").update({ business_name: "Hacked" }).eq("id", 1).select("id");
  check("member cannot change settings", !setUpd || setUpd.length === 0);
  const { error: memRemove } = await member.rpc("admin_remove_member", { p_email: "team@korakaagaz.co" });
  check("member cannot remove the admin", !!memRemove);
  const { data: memList, error: memListErr } = await member.from("members").select("*");
  check("members table isn't directly readable", !!memListErr || (memList ?? []).length === 0);

  // 5. Documents: numbering, locking, deletion rules.
  const { data: doc, error: dErr } = await member
    .from("documents")
    .insert({ doc_type: "invoice", client_snapshot: { name: "Security Test Co" }, total: 1180, taxable: 1000 })
    .select("id, share_token, status")
    .single();
  check("member can create a draft", !dErr && doc?.status === "draft", dErr?.message);
  if (doc) created.documents.push(doc.id);
  const { data: shareDraft } = await anon.rpc("shared_document", { p_token: doc.share_token, p_track: false });
  check("share link of a draft shows nothing", shareDraft === null);

  const { data: number, error: numErr } = await member.rpc("next_doc_number", { p_type: "invoice", p_date: "2026-10-27" });
  check("member gets an FY number", !numErr && /^[A-Z0-9]+\/26-27\/\d{3}$/.test(number), number ?? numErr?.message);
  const { error: viewerNum } = await viewer.rpc("next_doc_number", { p_type: "invoice", p_date: "2026-10-27" });
  check("viewer cannot take a number", !!viewerNum);
  await member.from("documents").update({ status: "issued", number: `SEC/26-27/${String(stamp).slice(-3)}`, fy: "26-27" }).eq("id", doc.id);

  const { error: lockErr } = await member.from("documents").update({ total: 1 }).eq("id", doc.id);
  check("issued document's amounts are locked", !!lockErr && /locked/.test(lockErr.message));
  const { error: itemErr } = await member.from("document_items").insert({ document_id: doc.id, position: 0, title: "sneaky" });
  check("issued document's items are locked", !!itemErr);
  const { error: delErr } = await member.from("documents").delete().eq("id", doc.id);
  check("issued document cannot be deleted", !!delErr && /cancel/.test(delErr.message));

  // 6. Share link exposes exactly one document.
  const { data: shared } = await anon.rpc("shared_document", { p_token: doc.share_token, p_track: false });
  check("share link returns its document", shared?.id === doc.id);
  check("share link hides created_by", shared && !("created_by" in shared));
  const { data: wrong } = await anon.rpc("shared_document", { p_token: "0".repeat(32), p_track: false });
  check("wrong token returns nothing", wrong === null);

  // 7. Audit log is append-only.
  const { data: audit } = await member.from("audit_events").select("id").eq("entity_id", doc.id).limit(1);
  check("audit log records the document", (audit ?? []).length === 1);
  const { data: auditUpd } = await member.from("audit_events").update({ action: "tampered" }).eq("entity_id", doc.id).select("id");
  check("audit log can't be edited", !auditUpd || auditUpd.length === 0);
  const { data: auditDel } = await member.from("audit_events").delete().eq("entity_id", doc.id).select("id");
  check("audit log can't be deleted", !auditDel || auditDel.length === 0);

  // 8. Removing a member ends their access.
  await admin.from("members").delete().eq("email", VIEWER);
  const { data: afterRemoval } = await viewer.from("clients").select("id");
  check("removed member loses access immediately", (afterRemoval ?? []).length === 0);
} catch (e) {
  check("unexpected error", false, e.message);
} finally {
  if (created.documents.length) await admin.from("documents").delete().in("id", created.documents);
  if (created.clients.length) await admin.from("clients").delete().in("id", created.clients);
  await admin.from("members").delete().in("email", [MEMBER, VIEWER]);
  for (const id of created.users.filter(Boolean)) await admin.auth.admin.deleteUser(id);
  // put the invoice counter back exactly as it was
  if (counterBefore) await admin.from("doc_counters").update({ next_seq: counterBefore.next_seq }).eq("doc_type", "invoice").eq("fy", "26-27");
  else await admin.from("doc_counters").delete().eq("doc_type", "invoice").eq("fy", "26-27");
  await admin.from("audit_events").delete().like("actor_email", "sec-%");
  console.log("cleaned up");
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
