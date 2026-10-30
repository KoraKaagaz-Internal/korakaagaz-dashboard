// End-to-end checks of projects, tasks, files and freelancer access, through the UI.
// Safe on a workspace with real data: it only creates (and afterwards deletes) its own
// client, project, freelancer and their rows.
//
// Usage: node scripts/e2e-projects.mjs [baseUrl]
// Env (e.g. from .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import fs from "node:fs";
import puppeteer from "puppeteer";

const base = process.argv[2] ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = "team@korakaagaz.co";
if (!SUPABASE_URL || !SERVICE) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const stamp = Date.now();
const FREELANCER = `e2e-freelancer-${stamp}@example.com`;
const CLIENT = `E2E Client ${stamp}`;
const PROJECT = `E2E shoot ${stamp}`;

const api = async (path, init = {}) => {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

/** Polls until fn() returns something truthy (or the timeout passes), returning the last value. */
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 500));
  }
  return v;
}

/** Clicks an element, re-finding it if the page re-rendered underneath (loading skeleton → content). */
async function tap(page, selector) {
  for (let i = 0; ; i++) {
    try {
      const h = await page.waitForSelector(selector, { visible: true });
      await h.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await h.click();
      return;
    } catch (e) {
      if (i >= 4) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
};

async function signInUrl(email) {
  await api("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, email_confirm: true }) });
  const link = await api("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email }) });
  const hash = link.hashed_token ?? link.properties?.hashed_token;
  if (!hash) throw new Error(`generate_link failed for ${email}`);
  return `${base}/auth/callback?token_hash=${hash}&type=magiclink`;
}

function helpers(page) {
  page.setDefaultTimeout(45000);
  // wait for the streamed page to replace the loading skeleton
  const settled = () => page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), { timeout: 60000 });
  const go = async (path) => {
    const r = await page.goto(path.startsWith("http") ? path : `${base}${path}`, { waitUntil: "load", timeout: 90000 });
    await settled().catch(() => {});
    return r;
  };
  const centred = async (h) => {
    await h.evaluate((el) => el.scrollIntoView({ block: "center" }));
    return h;
  };
  const button = async (text) => centred(await page.waitForSelector(`::-p-xpath(//button[normalize-space()='${text}'] | //a[normalize-space()='${text}'])`));
  const field = async (label) => centred(await page.waitForSelector(`::-p-xpath(//label[span[normalize-space()='${label}']]//*[self::input or self::textarea or self::select])`));
  const body = () => page.evaluate(() => document.body.innerText);
  const waitText = (t) => page.waitForFunction((s) => document.body.innerText.includes(s), { timeout: 45000 }, t);
  return { go, button, field, body, waitText };
}

const browser = await puppeteer.launch();
fs.mkdirSync(".visual", { recursive: true });
const admin = await browser.newPage();
await admin.setViewport({ width: 1400, height: 1000 });
const A = helpers(admin);
let projectId, clientId;
const createdDocs = [];
const createdKit = [];

try {
  const [c] = await api("/rest/v1/clients", { method: "POST", body: JSON.stringify({ name: CLIENT, state_code: "21" }) });
  clientId = c.id;
  await api("/rest/v1/members", { method: "POST", body: JSON.stringify({ email: FREELANCER, role: "freelancer", name: "Fiona Lens", invited_by: "e2e" }) });

  await A.go(await signInUrl(ADMIN_EMAIL));
  await A.go("/projects");
  check("projects page renders for the admin", (await A.body()).includes("Projects"));

  // ------------------------------------------------------------ create from template
  await A.go(`/projects/new?client=${clientId}`);
  await tap(admin, "::-p-xpath(//button[.//div[normalize-space()='Product shoot']])");
  const name = await A.field("Project name");
  await name.click();
  await name.type(PROJECT);
  await tap(admin, `::-p-xpath(//button[normalize-space()='${"Create project"}'] | //a[normalize-space()='${"Create project"}'])`);
  await admin.waitForFunction(() => /\/projects\/[0-9a-f-]{36}/.test(location.pathname), { timeout: 60000 });
  projectId = admin.url().match(/projects\/([0-9a-f-]{36})/)[1];
  const tasks = await api(`/rest/v1/tasks?project_id=eq.${projectId}&select=id,title,status,sort`);
  check("project from the Product shoot template gets its 9 tasks", tasks.length === 9, `${tasks.length} tasks`);
  const [proj] = await api(`/rest/v1/projects?id=eq.${projectId}&select=code,client_id,due_date`);
  check("project gets a KK code, the client, and a due date from the template", /^KK-\d{4}$/.test(proj.code) && proj.client_id === clientId && !!proj.due_date, JSON.stringify(proj));
  await A.waitText("Shot list and references");
  const todoCards = await admin.$$eval("section[aria-label='To do'] [role=button]", (els) => els.length);
  check("board shows the tasks in To do", todoCards >= 9, `${todoCards} cards`);

  // ------------------------------------------------------------ drag a card to In progress
  const first = tasks.sort((a, b) => a.sort - b.sort)[0];
  await A.go(`/projects/${projectId}`);
  const card = await admin.waitForSelector(`::-p-xpath(//section[@aria-label='To do']//span[normalize-space()='${first.title}'])`, { visible: true });
  const from = await card.boundingBox();
  const target = await (await admin.$("section[aria-label='In progress']")).boundingBox();
  await admin.mouse.move(from.x + 20, from.y + 5);
  await admin.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await admin.mouse.move(from.x + 20 + ((target.x + 60 - from.x - 20) * i) / 20, from.y + 5 + ((target.y + 60 - from.y - 5) * i) / 20);
    await new Promise((r) => setTimeout(r, 30));
  }
  await admin.screenshot({ path: ".visual/e2e-drag-mid.png" });
  await admin.mouse.up();
  const moved = await until(async () => ((await api(`/rest/v1/tasks?id=eq.${first.id}&select=status`))[0].status === "doing" ? "doing" : null));
  if (!moved) await admin.screenshot({ path: ".visual/e2e-drag-fail.png" });
  check("dragging a card to In progress saves its status", moved === "doing");

  // ------------------------------------------------------------ team: add the freelancer
  await A.go(`/projects/${projectId}?tab=overview`);
  await tap(admin, "::-p-xpath(//button[contains(., 'Change team')])");
  await tap(admin, `::-p-xpath(//label[contains(., 'Fiona')]//input)`);
  await tap(admin, `::-p-xpath(//button[normalize-space()='${"Done"}'] | //a[normalize-space()='${"Done"}'])`);
  const pm = await until(async () => (await api(`/rest/v1/project_members?project_id=eq.${projectId}&member_email=eq.${encodeURIComponent(FREELANCER)}`)).length);
  check("admin adds the freelancer to the project", pm === 1);
  const added = await until(async () => (await api(`/rest/v1/notifications?recipient_email=eq.${encodeURIComponent(FREELANCER)}&kind=eq.project_added`)).length);
  check("freelancer is notified they were added", added === 1);

  // deliverable
  await (await admin.waitForSelector("input[aria-label='Deliverable name']")).type("Cut-outs");
  await tap(admin, "::-p-xpath(//section[.//h2[normalize-space()='Deliverables']]//button[normalize-space()='Add' and not(@disabled)])");
  const deliverable = await until(async () => (await api(`/rest/v1/deliverables?project_id=eq.${projectId}&name=eq.Cut-outs`)).length);
  check("add a deliverable", deliverable === 1);

  // ------------------------------------------------------------ list + task drawer
  await A.go(`/projects/${projectId}?tab=list`);
  const retouch = tasks.find((t) => t.title === "Retouching");
  await tap(admin, `input[aria-label='Mark ${retouch.title} done']`);
  const ticked = await until(async () => {
    const [t] = await api(`/rest/v1/tasks?id=eq.${retouch.id}&select=status,completed_at`);
    return t.status === "done" && t.completed_at ? t : null;
  });
  check("ticking a task in the list marks it done", !!ticked);

  const callSheet = tasks.find((t) => t.title === "Call sheet");
  await tap(admin, `::-p-xpath(//button[normalize-space()='${callSheet.title}'])`);
  await admin.waitForSelector("[role=dialog] input[aria-label='Task title']");
  check("clicking a task opens the side panel", admin.url().includes(`task=${callSheet.id}`));

  // assign the freelancer
  await tap(admin, "::-p-xpath(//div[@role='dialog']//button[contains(., 'Assign')])");
  await tap(admin, `::-p-xpath(//div[@role='dialog']//label[contains(., 'Fiona')]//input)`);
  await tap(admin, "::-p-xpath(//div[@role='dialog']//button[normalize-space()='Done'])");
  const assigned = await until(async () => (await api(`/rest/v1/task_assignees?task_id=eq.${callSheet.id}&member_email=eq.${encodeURIComponent(FREELANCER)}`)).length);
  check("assign the task to the freelancer", assigned === 1);

  // checklist + comment with a mention
  const sub = await admin.waitForSelector("[role=dialog] input[aria-label='Add checklist item']");
  await sub.type("Confirm call time with the studio");
  await admin.keyboard.press("Enter");
  await admin.waitForFunction(() => document.querySelector("[role=dialog]")?.textContent?.includes("Confirm call time"), { timeout: 30000 });
  check("add a checklist item", true);
  const box = await admin.waitForSelector("[role=dialog] textarea[aria-label='Comment']");
  await box.type("@fiona please draft this by Friday");
  await tap(admin, "::-p-xpath(//div[@role='dialog']//button[normalize-space()='Comment' and not(@disabled)])");
  await admin.waitForSelector("::-p-xpath(//div[@role='dialog']//p[contains(., 'please draft this by Friday')])");
  const mention = await until(async () => (await api(`/rest/v1/notifications?recipient_email=eq.${encodeURIComponent(FREELANCER)}&kind=eq.mention`)).length);
  check("an @mention notifies the freelancer", mention === 1, mention === 1 ? "" : JSON.stringify(await api(`/rest/v1/notifications?recipient_email=eq.${encodeURIComponent(FREELANCER)}&select=kind,title`)) + JSON.stringify(await api(`/rest/v1/task_comments?task_id=eq.${callSheet.id}&select=body`)));
  await admin.keyboard.press("Escape");

  // ------------------------------------------------------------ timer from the task panel
  await A.go(`/projects/${projectId}?tab=list&task=${callSheet.id}`);
  await tap(admin, "::-p-xpath(//div[@role='dialog']//button[contains(., 'Start timer')])");
  await admin.waitForSelector("::-p-xpath(//div[@role='status']//button[normalize-space()='Stop'])");
  check("starting a timer shows it in the header", true);
  await admin.keyboard.press("Escape"); // close the task panel; its backdrop covers the header
  await admin.waitForFunction(() => !document.querySelector("[role=dialog]"));
  await tap(admin, "::-p-xpath(//div[@role='status']//button[normalize-space()='Stop'])");
  const timed = await until(async () => {
    const r = await api(`/rest/v1/time_entries?task_id=eq.${callSheet.id}&select=minutes,timer_started_at,status`);
    return r.length && !r[0].timer_started_at ? r[0] : null;
  });
  check("stopping the timer saves at least a minute as draft", timed?.minutes >= 1 && timed?.status === "draft", JSON.stringify(timed));

  // ------------------------------------------------------------ timesheet, submit, approve
  await A.go("/time");
  const cellInput = await admin.waitForSelector(`input[aria-label^='${callSheet.title}, ']:not([disabled])`);
  const todayCell = await admin.$$eval(`input[aria-label^='${callSheet.title}, ']`, (els) => els.map((e) => e.getAttribute("aria-label")));
  void cellInput;
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const label = todayCell.find((l) => l.endsWith(today));
  const cellEl = await admin.$(`input[aria-label='${label}']`);
  await cellEl.focus();
  await admin.keyboard.down("Control");
  await admin.keyboard.press("a");
  await admin.keyboard.up("Control");
  await cellEl.evaluate((el) => (el.value = ""));
  await cellEl.type("1:30");
  await admin.screenshot({ path: ".visual/e2e-timesheet.png" });
  await cellEl.evaluate((el) => el.blur());
  const ninety = await until(async () => {
    const r = await api(`/rest/v1/time_entries?task_id=eq.${callSheet.id}&select=minutes,status`);
    return r.length === 1 && r[0].minutes === 90 ? r[0] : null;
  });
  check("typing 1:30 in the timesheet saves 90 minutes", !!ninety, JSON.stringify(await api(`/rest/v1/time_entries?task_id=eq.${callSheet.id}&select=minutes,status`)));
  await tap(admin, "::-p-xpath(//button[starts-with(normalize-space(), 'Submit week') and not(@disabled)])");
  const submitted = await until(async () => (await api(`/rest/v1/time_entries?task_id=eq.${callSheet.id}&status=eq.submitted`)).length);
  check("submit the week for approval", submitted === 1);
  await A.go("/time?tab=approve");
  await tap(admin, "::-p-xpath(//button[starts-with(normalize-space(), 'Approve selected') and not(@disabled)])");
  const approved = await until(async () => (await api(`/rest/v1/time_entries?task_id=eq.${callSheet.id}&status=eq.approved`)).length);
  check("admin approves submitted time", approved === 1);

  // ------------------------------------------------------------ invoice from time
  await api(`/rest/v1/project_finance?project_id=eq.${projectId}`, { method: "PATCH", body: JSON.stringify({ billing: "hourly", hourly_rate: 2000 }) });
  await A.go(`/projects/${projectId}?tab=time`);
  await A.waitText("1.5 h ready to bill");
  await admin.screenshot({ path: ".visual/e2e-project-time.png" });
  await tap(admin, "::-p-xpath(//button[normalize-space()='Draft invoice from approved time' and not(@disabled)])");
  await admin.waitForFunction(() => /\/documents\/[0-9a-f-]{36}\/edit/.test(location.pathname), { timeout: 60000 });
  const docId = admin.url().match(/documents\/([0-9a-f-]{36})/)[1];
  const [doc] = await api(`/rest/v1/documents?id=eq.${docId}&select=status,project_id,taxable,document_items(title,qty,unit_price)`);
  check("draft invoice from time: 1.5 h × ₹2,000 for the task", doc.status === "draft" && doc.project_id === projectId && Number(doc.taxable) === 3000 && doc.document_items[0]?.title === callSheet.title, JSON.stringify(doc));
  const linked = await api(`/rest/v1/time_entries?task_id=eq.${callSheet.id}&select=invoiced_document_id`);
  check("billed time is linked to the invoice", linked[0]?.invoiced_document_id === docId);
  createdDocs.push(docId);

  // ------------------------------------------------------------ calendar
  const [kitItem] = await api("/rest/v1/kit", { method: "POST", body: JSON.stringify({ name: `E2E camera ${stamp}`, category: "Camera" }) });
  createdKit.push(kitItem.id);
  const shootDay = new Date(Date.now() + 330 * 60000 + 3 * 86400000).toISOString().slice(0, 10);
  await A.go(`/calendar/new?date=${shootDay}`);
  await (await A.field("Title")).type(`E2E shoot day ${stamp}`);
  await (await A.field("Project")).select(projectId);
  await tap(admin, "::-p-xpath(//button[contains(., 'Book team members')])");
  await tap(admin, `::-p-xpath(//label[contains(., 'Fiona')]//input)`);
  await tap(admin, `::-p-xpath(//button[normalize-space()='${"Done"}'] | //a[normalize-space()='${"Done"}'])`);
  await tap(admin, `::-p-xpath(//label[contains(., 'E2E camera ${stamp}')]//input)`);
  await tap(admin, `::-p-xpath(//button[normalize-space()='${"Save event"}'] | //a[normalize-space()='${"Save event"}'])`);
  await admin.waitForFunction(() => /\/calendar\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 60000 });
  await admin.waitForSelector(`::-p-xpath(//h1[contains(., 'E2E shoot day ${stamp}')])`);
  const [ev] = await api(`/rest/v1/events?title=eq.${encodeURIComponent(`E2E shoot day ${stamp}`)}&select=id,project_id,event_people(member_email),event_kit(kit_id)`);
  check("create a shoot with crew and kit", ev && ev.project_id === projectId && ev.event_people[0]?.member_email === FREELANCER && ev.event_kit[0]?.kit_id === kitItem.id);
  const booked = await until(async () => (await api(`/rest/v1/notifications?recipient_email=eq.${encodeURIComponent(FREELANCER)}&kind=eq.booked`)).length);
  check("booked crew are notified", booked === 1);

  await A.go(`/calendar/new?date=${shootDay}`);
  await (await A.field("Title")).type("Clashing shoot");
  await tap(admin, `::-p-xpath(//label[contains(., 'E2E camera ${stamp}')]//input)`);
  await A.waitText("Double booking");
  check("the form warns when kit is double-booked", (await A.body()).includes(`E2E camera ${stamp}`));
  await A.go(`/calendar?date=${shootDay}`);
  check("month view shows the shoot", (await A.body()).includes(`E2E shoot day ${stamp}`));
  await admin.screenshot({ path: ".visual/e2e-calendar.png" });
  await A.go(`/calendar?view=crew&date=${shootDay}`);
  check("crew & kit view shows the booking", (await A.body()).includes(`E2E shoot day ${stamp}`));
  await admin.screenshot({ path: ".visual/e2e-crew.png", fullPage: true });

  // ------------------------------------------------------------ workload + leave
  await A.go("/team/workload");
  check("workload page lists the freelancer", (await A.body()).includes("Fiona Lens"));
  await admin.screenshot({ path: ".visual/e2e-workload.png" });

  // ------------------------------------------------------------ files
  await A.go(`/projects/${projectId}?tab=files`);
  await tap(admin, `::-p-xpath(//button[normalize-space()='${"add a Drive link"}'] | //a[normalize-space()='${"add a Drive link"}'])`);
  await (await admin.waitForSelector("input[aria-label='Link']")).type("https://drive.google.com/drive/folders/e2e-raws");
  await (await admin.waitForSelector("input[aria-label='Link name']")).type("Raw files");
  await tap(admin, `::-p-xpath(//button[normalize-space()='${"Add link"}'] | //a[normalize-space()='${"Add link"}'])`);
  await A.waitText("Raw files");
  check("add a Google Drive link", true);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  fs.writeFileSync(".visual/e2e-pixel.png", png);
  const input = await admin.$("input[type=file]");
  await input.uploadFile(".visual/e2e-pixel.png");
  const files = await until(async () => {
    const f = await api(`/rest/v1/files?project_id=eq.${projectId}&kind=eq.upload`);
    return f.length ? f : null;
  });
  check("upload a file straight to storage", files?.length === 1 && files[0].storage_path.startsWith(`projects/${projectId}/`), files ? "" : (await A.body()).match(/(.*e2e-pixel.*|.*rror.*)/)?.[0]);

  await A.go(`/projects/${projectId}?tab=timeline`);
  await A.waitText("Red line = today");
  check("timeline renders", true);
  await A.go(`/projects/${projectId}?tab=activity`);
  const activity = await A.body();
  check("activity feed shows task changes", /moved task to done/.test(activity));
  await admin.screenshot({ path: ".visual/e2e-project-activity.png" });
  await A.go(`/projects/${projectId}`);
  await admin.screenshot({ path: ".visual/e2e-board.png" });

  // ------------------------------------------------------------ freelancer view
  const ctx = await browser.createBrowserContext();
  const fl = await ctx.newPage();
  await fl.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const F = helpers(fl);
  await F.go(await signInUrl(FREELANCER));
  check("freelancer lands on My work", new URL(fl.url()).pathname === "/my-work", fl.url());
  await F.waitText(callSheet.title);
  check("My work lists the task assigned to them", true);
  await fl.screenshot({ path: ".visual/e2e-my-work-mobile.png" });
  await F.go("/documents");
  check("freelancer is kept out of billing", new URL(fl.url()).pathname === "/my-work");
  await F.go("/clients");
  check("freelancer is kept out of clients", new URL(fl.url()).pathname === "/my-work");
  await F.go("/projects?show=all");
  const fp = await F.body();
  check("freelancer sees only their project", fp.includes(PROJECT) && !/Budget ₹/.test(fp));
  await F.go(`/projects/${projectId}`);
  const tabs = await fl.$$eval("nav[aria-label='Project sections'] a", (els) => els.map((e) => e.textContent));
  check("freelancer has no Billing tab", !tabs.includes("Billing"), tabs.join(","));
  await F.go(`/projects/${projectId}?tab=overview`);
  check("freelancer doesn't see the budget", !(await F.body()).includes("Save budget") && !(await F.body()).includes("Budget\n"));
  const other = await api("/rest/v1/projects", { method: "POST", body: JSON.stringify({ name: `E2E private ${stamp}` }) });
  await F.go(`/projects/${other[0].id}`);
  check("freelancer can't open a project they're not on", (await F.body()).includes("404") || (await F.body()).toLowerCase().includes("not found"));
  await api(`/rest/v1/projects?id=eq.${other[0].id}`, { method: "DELETE" });
  await F.go("/calendar?view=week&date=" + new Date(Date.now() + 330 * 60000 + 3 * 86400000).toISOString().slice(0, 10));
  check("freelancer sees the shoot they're booked on", (await F.body()).includes(`E2E shoot day ${stamp}`));
  await F.go("/team/workload");
  check("freelancer is kept out of workload", new URL(fl.url()).pathname === "/my-work");
  await F.go("/team/leave");
  await tap(fl, `::-p-xpath(//button[normalize-space()='${"Request"}'] | //a[normalize-space()='${"Request"}'])`);
  const leave = await until(async () => (await api(`/rest/v1/leave_requests?member_email=eq.${encodeURIComponent(FREELANCER)}&select=id,status`))[0]);
  check("freelancer requests leave", leave?.status === "pending");
  await ctx.close();

  await A.go("/team/leave");
  await tap(admin, "::-p-xpath(//section[.//h2[starts-with(normalize-space(), 'Waiting for you')]]//button[normalize-space()='Approve'])");
  const decided = await until(async () => (await api(`/rest/v1/leave_requests?member_email=eq.${encodeURIComponent(FREELANCER)}&status=eq.approved`)).length);
  check("admin approves the leave", decided === 1);

  // private calendar feed
  const [fm] = await api(`/rest/v1/members?email=eq.${encodeURIComponent(FREELANCER)}&select=ics_token`);
  const feed = await fetch(`${base}/api/ics/${fm.ics_token}.ics`);
  const ics = await feed.text();
  check("calendar feed lists the shoot, the task and the leave", feed.status === 200 && ics.startsWith("BEGIN:VCALENDAR") && ics.includes(`E2E shoot day ${stamp}`) && ics.includes("Due: Call sheet") && ics.includes("Leave"), `${feed.status}`);
  const bad = await fetch(`${base}/api/ics/${"0".repeat(32)}.ics`);
  check("an unknown feed token gets 404", bad.status === 404);
} catch (e) {
  check("unexpected error", false, e.message.split("\n")[0]);
  await admin.screenshot({ path: ".visual/e2e-projects-error.png" }).catch(() => {});
} finally {
  for (const d of createdDocs) {
    await api(`/rest/v1/time_entries?invoiced_document_id=eq.${d}`, { method: "PATCH", body: JSON.stringify({ invoiced_document_id: null }) });
    await api(`/rest/v1/document_items?document_id=eq.${d}`, { method: "DELETE" });
    await api(`/rest/v1/documents?id=eq.${d}`, { method: "DELETE" });
    await api(`/rest/v1/audit_events?entity_id=eq.${d}`, { method: "DELETE" });
  }
  for (const k of createdKit) await api(`/rest/v1/kit?id=eq.${k}`, { method: "DELETE" });
  await api(`/rest/v1/leave_requests?member_email=eq.${encodeURIComponent(FREELANCER)}`, { method: "DELETE" });
  if (projectId) {
    const files = (await api(`/rest/v1/files?project_id=eq.${projectId}&kind=eq.upload&select=storage_path`)) ?? [];
    if (files.length) await api("/storage/v1/object/files", { method: "DELETE", body: JSON.stringify({ prefixes: files.map((f) => f.storage_path) }) });
    await api(`/rest/v1/projects?id=eq.${projectId}`, { method: "DELETE" });
    await api(`/rest/v1/audit_events?project_id=eq.${projectId}`, { method: "DELETE" });
  }
  if (clientId) {
    await api(`/rest/v1/clients?id=eq.${clientId}`, { method: "DELETE" });
    await api(`/rest/v1/audit_events?entity_id=eq.${clientId}`, { method: "DELETE" });
  }
  await api(`/rest/v1/notifications?recipient_email=eq.${encodeURIComponent(FREELANCER)}`, { method: "DELETE" });
  const [m] = (await api(`/rest/v1/members?email=eq.${encodeURIComponent(FREELANCER)}&select=user_id`)) ?? [];
  await api(`/rest/v1/members?email=eq.${encodeURIComponent(FREELANCER)}`, { method: "DELETE" });
  if (m?.user_id) await api(`/auth/v1/admin/users/${m.user_id}`, { method: "DELETE" });
  await browser.close();
  console.log("cleaned up");
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
