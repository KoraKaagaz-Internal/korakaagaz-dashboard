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
const FREELANCER = `sec-freelancer-${stamp}@example.com`;
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

const created = { clients: [], documents: [], users: [], projects: [], objects: [] };
// The test takes an invoice number; remember the counter so real numbering isn't disturbed.
const { data: counterBefore } = await admin.from("doc_counters").select("*").eq("doc_type", "invoice").eq("fy", "26-27").maybeSingle();
try {
  // Invite test users directly (service role), as the admin would.
  await admin.from("members").insert([
    { email: MEMBER, role: "member", invited_by: "security-test" },
    { email: VIEWER, role: "viewer", invited_by: "security-test" },
    { email: FREELANCER, role: "freelancer", invited_by: "security-test" },
  ]);

  // 1. Uninvited people cannot get an account at all.
  const { error: outsiderErr } = await admin.auth.admin.createUser({ email: OUTSIDER, email_confirm: true });
  check("uninvited sign-up is rejected", !!outsiderErr, outsiderErr?.message?.slice(0, 60));
  const { error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: OUTSIDER });
  check("uninvited magic link is rejected", !!linkErr);

  const member = await sessionFor(MEMBER);
  const viewer = await sessionFor(VIEWER);
  const freelancer = await sessionFor(FREELANCER);
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  for (const e of [MEMBER, VIEWER, FREELANCER]) {
    const { data } = await admin.from("members").select("user_id").eq("email", e).single();
    created.users.push(data.user_id);
  }

  // 2. Anonymous visitors see nothing.
  for (const t of ["documents", "clients", "payments", "settings", "bank_accounts", "audit_events", "members", "projects", "project_finance", "tasks", "task_comments", "files", "notifications"]) {
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

  // 8. Projects: freelancers see only projects they're on, and never money or clients.
  const { data: pA, error: pAErr } = await member.from("projects").insert({ name: "Sec project A", client_id: client.id }).select("id, code").single();
  check("member can create a project", !pAErr && /^KK-\d{4}$/.test(pA?.code ?? ""), pAErr?.message ?? pA?.code);
  const { data: pB } = await member.from("projects").insert({ name: "Sec project B", client_id: client.id }).select("id").single();
  created.projects.push(pA.id, pB.id);
  await member.from("project_finance").insert([{ project_id: pA.id, budget: 50000 }, { project_id: pB.id, budget: 90000 }]);
  const { error: addErr } = await member.from("project_members").insert({ project_id: pA.id, member_email: FREELANCER });
  check("member can add a freelancer to a project", !addErr, addErr?.message);

  const { data: fProjects } = await freelancer.from("projects").select("id");
  check("freelancer sees only their project", (fProjects ?? []).length === 1 && fProjects[0].id === pA.id, `${(fProjects ?? []).length} visible`);
  for (const t of ["project_finance", "clients", "documents", "payments", "items", "bank_accounts", "email_log"]) {
    const { data } = await freelancer.from(t).select("*").limit(5);
    check(`freelancer cannot read ${t}`, !data || data.length === 0);
  }
  const { data: names } = await freelancer.rpc("project_client_names", { p_ids: [pA.id, pB.id] });
  check("freelancer gets the client name of their project only", (names ?? []).length === 1 && names[0].client_name === "Security Test Co");
  const { error: fProj } = await freelancer.from("projects").insert({ name: "Freelancer project" });
  check("freelancer cannot create projects", !!fProj);
  const { error: fSelfAdd } = await freelancer.from("project_members").insert({ project_id: pB.id, member_email: FREELANCER });
  check("freelancer cannot add themselves to another project", !!fSelfAdd);
  const { data: fRename } = await freelancer.from("projects").update({ name: "renamed" }).eq("id", pA.id).select("id");
  check("freelancer cannot edit the project", !fRename || fRename.length === 0);

  const { data: tA, error: tAErr } = await freelancer.from("tasks").insert({ project_id: pA.id, title: "Retouch selects" }).select("id").single();
  check("freelancer can add a task on their project", !tAErr && !!tA, tAErr?.message);
  const { error: tBErr } = await freelancer.from("tasks").insert({ project_id: pB.id, title: "Sneaky task" });
  check("freelancer cannot add a task on another project", !!tBErr);
  const { data: tB } = await member.from("tasks").insert({ project_id: pB.id, title: "Private task" }).select("id").single();
  const { data: seeB } = await freelancer.from("tasks").select("id").eq("id", tB.id);
  check("freelancer cannot see another project's tasks", (seeB ?? []).length === 0);
  const { data: fUpd } = await freelancer.from("tasks").update({ status: "doing" }).eq("id", tA.id).select("status");
  check("freelancer can move their task", fUpd?.[0]?.status === "doing");
  const { error: phaseErr } = await freelancer.from("phases").insert({ project_id: pA.id, name: "Freelancer phase" });
  check("freelancer cannot change phases", !!phaseErr);
  const { error: cOk } = await freelancer.from("task_comments").insert({ task_id: tA.id, body: "Done the first pass" });
  check("freelancer can comment on their task", !cOk, cOk?.message);
  const { error: cSpoof } = await freelancer.from("task_comments").insert({ task_id: tA.id, body: "spoof", author_email: MEMBER });
  check("comments can't be posted as someone else", !!cSpoof);
  const { error: cB } = await freelancer.from("task_comments").insert({ task_id: tB.id, body: "hello" });
  check("freelancer cannot comment on another project's task", !!cB);

  const { error: vTask } = await viewer.from("tasks").insert({ project_id: pA.id, title: "Viewer task" });
  check("viewer cannot create tasks", !!vTask);
  const { data: vTasks } = await viewer.from("tasks").select("id").eq("project_id", pA.id);
  check("viewer can read tasks", (vTasks ?? []).length === 1);
  const { error: vComment } = await viewer.from("task_comments").insert({ task_id: tA.id, body: "viewer" });
  check("viewer cannot comment", !!vComment);

  // storage: only their project's folder
  const okPath = `projects/${pA.id}/sec-${stamp}.txt`;
  const badPath = `projects/${pB.id}/sec-${stamp}.txt`;
  const { error: upOk } = await freelancer.storage.from("files").upload(okPath, new Blob(["ok"]), { contentType: "text/plain" });
  check("freelancer can upload to their project", !upOk, upOk?.message);
  if (!upOk) created.objects.push(okPath);
  const { error: upBad } = await freelancer.storage.from("files").upload(badPath, new Blob(["no"]), { contentType: "text/plain" });
  check("freelancer cannot upload to another project", !!upBad);
  if (!upBad) created.objects.push(badPath);
  await admin.storage.from("files").upload(badPath, new Blob(["secret"]), { contentType: "text/plain", upsert: true });
  created.objects.push(badPath);
  const { data: dl } = await freelancer.storage.from("files").download(badPath);
  check("freelancer cannot download another project's file", !dl);
  const { data: anonDl } = await anon.storage.from("files").download(okPath);
  check("anon cannot download project files", !anonDl);

  // notifications are private and can't be forged
  await member.from("notifications").insert({ recipient_email: MEMBER, kind: "test", title: "private" });
  const { data: fNotes } = await freelancer.from("notifications").select("id").eq("recipient_email", MEMBER);
  check("people can't read others' notifications", (fNotes ?? []).length === 0);
  const { error: forged } = await freelancer.from("notifications").insert({ recipient_email: MEMBER, kind: "test", title: "x", actor_email: VIEWER });
  check("notifications can't be forged", !!forged);

  const { data: dir, error: dirErr } = await freelancer.rpc("team_directory");
  check("freelancer can see team names", !dirErr && (dir ?? []).some((d) => d.email === MEMBER) && !("cost_rate" in (dir?.[0] ?? {})));
  const { error: anonDir } = await anon.rpc("team_directory");
  check("anon cannot list the team", !!anonDir);
  const { data: fAudit } = await freelancer.from("audit_events").select("entity");
  check("freelancer's activity feed only shows their project's work", (fAudit ?? []).length > 0 && fAudit.every((a) => ["tasks", "task_comments", "files", "deliverables"].includes(a.entity)));

  // 9. Time: people log their own time on their projects; only the admin approves; rates stay private.
  const today = new Date().toISOString().slice(0, 10);
  const { data: fTime, error: fTimeErr } = await freelancer.from("time_entries").insert({ project_id: pA.id, task_id: tA.id, work_date: today, minutes: 90 }).select("id").single();
  check("freelancer can log time on their project", !fTimeErr && !!fTime, fTimeErr?.message);
  const { error: fTimeB } = await freelancer.from("time_entries").insert({ project_id: pB.id, work_date: today, minutes: 30 });
  check("freelancer cannot log time on another project", !!fTimeB);
  const { error: spoofTime } = await freelancer.from("time_entries").insert({ project_id: pA.id, work_date: today, minutes: 30, member_email: MEMBER });
  check("time can't be logged as someone else", !!spoofTime);
  const { data: mTime } = await member.from("time_entries").insert({ project_id: pB.id, work_date: today, minutes: 60 }).select("id").single();
  const { data: fSeesM } = await freelancer.from("time_entries").select("id").eq("id", mTime.id);
  check("freelancer cannot see other people's time", (fSeesM ?? []).length === 0);
  const { data: selfApprove } = await freelancer.from("time_entries").update({ status: "approved" }).eq("id", fTime.id).select("id");
  check("people cannot approve their own time", !selfApprove || selfApprove.length === 0);
  await freelancer.from("time_entries").update({ status: "submitted" }).eq("id", fTime.id);
  const { data: mApprove } = await member.from("time_entries").update({ status: "approved" }).eq("id", fTime.id).select("id");
  check("members cannot approve time", !mApprove || mApprove.length === 0);
  const { data: afterSubmit } = await freelancer.from("time_entries").update({ minutes: 600 }).eq("id", fTime.id).select("id");
  check("submitted time can't be changed by its owner", !afterSubmit || afterSubmit.length === 0);
  await admin.from("time_entries").update({ status: "approved" }).eq("id", fTime.id);
  const { data: fDel } = await freelancer.from("time_entries").delete().eq("id", fTime.id).select("id");
  check("approved time can't be deleted by its owner", !fDel || fDel.length === 0);
  const { error: memberEdit } = await member.from("time_entries").update({ minutes: 1 }).eq("id", fTime.id);
  check("approved time is locked for members", !!memberEdit);
  const { error: rates } = await member.rpc("admin_member_rates");
  check("members cannot read cost rates", !!rates);
  const { error: costs } = await member.rpc("admin_project_costs", {});
  check("members cannot read project costs", !!costs);
  const { error: cap } = await freelancer.rpc("team_capacity");
  check("freelancers cannot read team capacity", !!cap);
  const { error: setRate } = await member.rpc("admin_set_rates", { p_email: MEMBER, p_cost: 1, p_bill: 1, p_capacity: 40 });
  check("members cannot set rates", !!setRate);
  const { data: tok1 } = await freelancer.rpc("my_ics_token", { p_rotate: false });
  const { data: tok2 } = await member.rpc("my_ics_token", { p_rotate: false });
  check("everyone gets their own private calendar token", /^[0-9a-f]{32}$/.test(tok1 ?? "") && tok1 !== tok2);

  // 10. Calendar: freelancers see events on their projects or that they're booked on.
  const at = (h) => new Date(Date.now() + h * 3600000).toISOString();
  const { data: evA, error: evErr } = await member.from("events").insert({ type: "shoot", title: "Sec shoot A", project_id: pA.id, starts_at: at(24), ends_at: at(32) }).select("id").single();
  check("member can create an event", !evErr && !!evA, evErr?.message);
  const { data: evB } = await member.from("events").insert({ type: "shoot", title: "Sec shoot B", project_id: pB.id, starts_at: at(24), ends_at: at(32) }).select("id").single();
  const { data: evC } = await member.from("events").insert({ type: "meeting", title: "Sec meeting C", starts_at: at(48), ends_at: at(49) }).select("id").single();
  await member.from("event_people").insert({ event_id: evC.id, member_email: FREELANCER, role: "assistant" });
  const { data: fEvents } = await freelancer.from("events").select("id");
  const seen = (fEvents ?? []).map((e) => e.id);
  check("freelancer sees their project's event and their bookings only", seen.includes(evA.id) && seen.includes(evC.id) && !seen.includes(evB.id), `${seen.length} visible`);
  const { error: fEv } = await freelancer.from("events").insert({ type: "meeting", title: "x", starts_at: at(1), ends_at: at(2) });
  check("freelancer cannot create events", !!fEv);
  const { error: vEv } = await viewer.from("events").insert({ type: "meeting", title: "x", starts_at: at(1), ends_at: at(2) });
  check("viewer cannot create events", !!vEv);
  const { data: k } = await member.from("kit").insert({ name: "Sec camera", category: "Camera" }).select("id").single();
  const { data: fKit } = await freelancer.from("kit").select("id").eq("id", k.id);
  check("freelancer can see the kit list", (fKit ?? []).length === 1);
  const { error: fKitW } = await freelancer.from("kit").insert({ name: "x" });
  check("freelancer cannot change the kit list", !!fKitW);
  await admin.from("kit").delete().eq("id", k.id);

  // 11. Leave: request your own; only the admin decides; freelancers can't see others' leave.
  const { data: fLeave, error: fLeaveErr } = await freelancer.from("leave_requests").insert({ from_date: today, to_date: today }).select("id").single();
  check("freelancer can request leave", !fLeaveErr && !!fLeave, fLeaveErr?.message);
  const { error: preApproved } = await member.from("leave_requests").insert({ from_date: today, to_date: today, status: "approved" });
  check("leave can't be created already approved", !!preApproved);
  const { data: selfLeave } = await freelancer.from("leave_requests").update({ status: "approved" }).eq("id", fLeave.id).select("id");
  check("people cannot approve their own leave", !selfLeave || selfLeave.length === 0);
  const { data: mLeave } = await member.from("leave_requests").insert({ from_date: today, to_date: today }).select("id").single();
  const { data: fSeesLeave } = await freelancer.from("leave_requests").select("id").eq("id", mLeave.id);
  check("freelancer cannot see others' leave", (fSeesLeave ?? []).length === 0);
  const { data: mSeesLeave } = await member.from("leave_requests").select("id").eq("id", fLeave.id);
  check("staff can see team leave", (mSeesLeave ?? []).length === 1);
  await admin.from("leave_requests").delete().in("id", [fLeave.id, mLeave.id]);

  // 12. Expenses: freelancers file their own claims only; only the admin approves and reimburses.
  const { data: cat } = await admin.from("expense_categories").select("id").eq("name", "Props & sets").single();
  const { data: vendor, error: vErr2 } = await member.from("vendors").insert({ name: "Sec Vendor", gstin: "" }).select("id").single();
  check("member can add a vendor", !vErr2 && !!vendor, vErr2?.message);
  const { data: fVendors } = await freelancer.from("vendors").select("id");
  check("freelancer cannot see vendors", (fVendors ?? []).length === 0);
  const { data: bill, error: billErr } = await member.from("expenses").insert({ kind: "bill", vendor_id: vendor.id, category_id: cat.id, expense_date: today, taxable: 1000, total: 1180, cgst: 90, sgst: 90 }).select("id").single();
  check("member can add a bill", !billErr && !!bill, billErr?.message);
  const { data: fBills } = await freelancer.from("expenses").select("id").eq("id", bill.id);
  check("freelancer cannot see studio bills", (fBills ?? []).length === 0);
  const { error: fBill } = await freelancer.from("expenses").insert({ kind: "bill", vendor_name: "x", category_id: cat.id, expense_date: today, taxable: 1, total: 1 });
  check("freelancer cannot add a bill", !!fBill);
  const { data: claim, error: claimErr } = await freelancer.from("expenses").insert({ kind: "claim", category_id: cat.id, expense_date: today, taxable: 500, total: 500, paid_from: "member", paid_by_email: FREELANCER, approval: "submitted", project_id: pA.id }).select("id").single();
  check("freelancer can file a claim", !claimErr && !!claim, claimErr?.message);
  const { error: claimOther } = await freelancer.from("expenses").insert({ kind: "claim", category_id: cat.id, expense_date: today, taxable: 5, total: 5, paid_from: "member", paid_by_email: FREELANCER, approval: "submitted", project_id: pB.id });
  check("freelancer cannot claim against another project", !!claimOther);
  const { error: preApprovedClaim } = await freelancer.from("expenses").insert({ kind: "claim", category_id: cat.id, expense_date: today, taxable: 5, total: 5, paid_from: "member", paid_by_email: FREELANCER, approval: "approved" });
  check("claims can't be filed already approved", !!preApprovedClaim);
  const { error: selfApproveClaim } = await freelancer.from("expenses").update({ approval: "approved" }).eq("id", claim.id);
  const { data: stillSubmitted } = await admin.from("expenses").select("approval").eq("id", claim.id).single();
  check("people cannot approve their own claim", stillSubmitted.approval === "submitted", selfApproveClaim?.message);
  const { error: memberApprove } = await member.from("expenses").update({ approval: "approved" }).eq("id", claim.id);
  check("members cannot approve claims", !!memberApprove);
  const { data: mSeesClaim } = await member.from("expenses").select("id").eq("id", claim.id);
  check("staff can see team claims", (mSeesClaim ?? []).length === 1);
  await admin.from("expenses").update({ approval: "approved" }).eq("id", claim.id);
  const { error: memberPaysClaim } = await member.from("expense_payments").insert({ expense_id: claim.id, paid_on: today, amount: 500 });
  check("members cannot reimburse claims", !!memberPaysClaim);
  const { error: memberPaysBill } = await member.from("expense_payments").insert({ expense_id: bill.id, paid_on: today, amount: 100 });
  check("members can pay bills", !memberPaysBill, memberPaysBill?.message);
  const { error: fPays } = await freelancer.from("expense_payments").insert({ expense_id: claim.id, paid_on: today, amount: 500 });
  check("freelancer cannot pay themselves", !!fPays);
  const { data: fEditApproved } = await freelancer.from("expenses").update({ taxable: 9999 }).eq("id", claim.id).select("id");
  check("approved claims are locked for their owner", !fEditApproved || fEditApproved.length === 0);
  const { error: delPaid } = await member.from("expenses").delete().eq("id", bill.id);
  check("expenses with payments can't be deleted", !!delPaid);
  const receiptPath = `expenses/${claim.id}/sec-${stamp}.txt`;
  await admin.storage.from("files").upload(receiptPath, new Blob(["r"]), { contentType: "text/plain" });
  created.objects.push(receiptPath);
  const { data: vDl } = await viewer.storage.from("files").download(receiptPath);
  check("staff can open claim receipts", !!vDl);
  const otherReceipt = `expenses/${bill.id}/sec-${stamp}.txt`;
  await admin.storage.from("files").upload(otherReceipt, new Blob(["r"]), { contentType: "text/plain" });
  created.objects.push(otherReceipt);
  const { data: fDl2 } = await freelancer.storage.from("files").download(otherReceipt);
  check("freelancer cannot open studio receipts", !fDl2);
  const { error: fCat } = await freelancer.from("expense_categories").insert({ name: `Sec cat ${stamp}` });
  check("only the admin edits categories", !!fCat);
  await admin.from("expense_payments").delete().in("expense_id", [bill.id, claim.id]);
  await admin.from("expenses").delete().in("id", [bill.id, claim.id]);
  await admin.from("vendors").delete().eq("id", vendor.id);

  // 13. CRM: staff only; viewers read; freelancers and anon see nothing.
  const { data: lead, error: leadErr } = await member.from("leads").insert({ name: "Sec Lead", email: "sec-lead@example.com" }).select("id, furthest_stage").single();
  check("member can add a lead", !leadErr && !!lead, leadErr?.message);
  await member.from("leads").update({ stage: "proposal" }).eq("id", lead.id);
  await member.from("leads").update({ stage: "lost", lost_reason: "Budget" }).eq("id", lead.id);
  const { data: lostLead } = await admin.from("leads").select("furthest_stage, lost_at").eq("id", lead.id).single();
  check("a lost lead remembers how far it got", lostLead.furthest_stage === "proposal" && !!lostLead.lost_at, JSON.stringify(lostLead));
  const { data: vLeads } = await viewer.from("leads").select("id").eq("id", lead.id);
  check("viewer can read leads", (vLeads ?? []).length === 1);
  const { error: vLead } = await viewer.from("leads").insert({ name: "x" });
  check("viewer cannot add leads", !!vLead);
  const { data: fLeads } = await freelancer.from("leads").select("id");
  check("freelancer cannot see leads", (fLeads ?? []).length === 0);
  const { data: aLeads } = await anon.from("leads").select("id");
  check("anon cannot read leads", (aLeads ?? []).length === 0);
  const { error: aLeadIns } = await anon.from("leads").insert({ name: "spam" });
  check("anon cannot insert leads directly", !!aLeadIns);
  const { error: spoofAct } = await member.from("lead_activities").insert({ lead_id: lead.id, body: "x", author_email: VIEWER });
  check("lead notes can't be posted as someone else", !!spoofAct);
  await admin.from("leads").delete().eq("id", lead.id);

  // 14. Removing a member ends their access.
  await admin.from("members").delete().eq("email", VIEWER);
  const { data: afterRemoval } = await viewer.from("clients").select("id");
  check("removed member loses access immediately", (afterRemoval ?? []).length === 0);
} catch (e) {
  check("unexpected error", false, e.message);
} finally {
  if (created.objects.length) await admin.storage.from("files").remove([...new Set(created.objects)]);
  await admin.from("events").delete().like("title", "Sec %");
  await admin.from("expenses").delete().in("created_by", [MEMBER, VIEWER, FREELANCER]);
  await admin.from("vendors").delete().eq("name", "Sec Vendor");
  await admin.from("leads").delete().eq("name", "Sec Lead");
  await admin.from("leave_requests").delete().in("member_email", [MEMBER, VIEWER, FREELANCER]);
  if (created.projects.length) await admin.from("projects").delete().in("id", created.projects);
  if (created.documents.length) await admin.from("documents").delete().in("id", created.documents);
  if (created.clients.length) await admin.from("clients").delete().in("id", created.clients);
  await admin.from("notifications").delete().in("recipient_email", [MEMBER, VIEWER, FREELANCER]);
  await admin.from("members").delete().in("email", [MEMBER, VIEWER, FREELANCER]);
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
