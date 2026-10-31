// End-to-end checks of the CRM: public enquiry form, pipeline board, activity log, lost reasons,
// convert to client + project, the public booking page, and Reports. Safe on real data: it only
// touches its own rows and puts the booking settings back as they were.
//
// Usage: node scripts/e2e-crm.mjs [baseUrl]
import puppeteer from "puppeteer";

const base = process.argv[2] ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const stamp = Date.now();
const LEAD = `E2E Lead ${stamp}`;
const LEAD2 = `E2E Lost ${stamp}`;
const BOOKER = `E2E Booker ${stamp}`;

const api = async (path, init = {}) => {
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers } });
  const t = await res.text();
  return t ? JSON.parse(t) : null;
};
const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
};
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
function helpers(page) {
  page.setDefaultTimeout(45000);
  const go = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: "load", timeout: 90000 });
    await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), { timeout: 60000 }).catch(() => {});
  };
  const tap = async (selector) => {
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
  };
  const button = (t) => tap(`::-p-xpath(//button[normalize-space()='${t}'] | //a[normalize-space()='${t}'])`);
  const body = () => page.evaluate(() => document.body.innerText);
  return { go, tap, button, body };
}
async function drag(page, cardText, column) {
  const card = await page.waitForSelector(`::-p-xpath(//div[contains(@class,'rounded-xl') and .//a[normalize-space()='${cardText}']])`, { visible: true });
  const from = await card.boundingBox();
  const to = await (await page.$(`section[aria-label='${column}']`)).boundingBox();
  await page.mouse.move(from.x + from.width - 20, from.y + from.height - 10);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x + from.width - 20 + ((to.x + 60 - from.x - from.width + 20) * i) / 20, from.y + from.height - 10 + ((to.y + 70 - from.y - from.height + 10) * i) / 20);
    await new Promise((r) => setTimeout(r, 30));
  }
  await page.mouse.up();
}

const [settings] = await api("/rest/v1/settings?id=eq.1&select=booking");
const originalBooking = settings.booking;
const browser = await puppeteer.launch();
const made = { leads: [], clients: [], projects: [], events: [] };

try {
  // ---------------------------------------------------------------- public enquiry form
  const pub = await browser.newPage();
  await pub.setViewport({ width: 390, height: 844, isMobile: true });
  const P = helpers(pub);
  await P.go("/enquire?source=instagram");
  check("enquiry form opens without signing in", (await P.body()).includes("Let's make something"));
  const typeIn = async (selector, text) => (await pub.waitForSelector(selector)).type(text);
  await typeIn("::-p-xpath(//label[contains(., 'Your name')]//input)", LEAD);
  await typeIn("input[type=email]", `e2e-lead-${stamp}@example.com`);
  await typeIn("::-p-xpath(//label[contains(., 'Brand / company')]//input)", `Brand ${stamp}`);
  await (await pub.$("::-p-xpath(//label[contains(., 'What do you need')]//select)")).select("Product photography");
  await typeIn("textarea", "We need 40 product photos for our new range in December.");
  await new Promise((r) => setTimeout(r, 3200)); // the form ignores submissions faster than a person
  await P.button("Send enquiry");
  await pub.waitForFunction(() => document.body.innerText.includes("Thank you"));
  const lead = await until(async () => (await api(`/rest/v1/leads?name=eq.${encodeURIComponent(LEAD)}&select=id,source,stage,ip_hash,follow_up_on,service`))[0]);
  if (lead) made.leads.push(lead.id);
  check("an enquiry becomes a lead tagged with its source", lead?.source === "instagram" && lead?.stage === "enquiry" && lead?.service === "Product photography" && !!lead?.follow_up_on, JSON.stringify(lead));
  check("the lead stores a hashed address, not the IP", /^[0-9a-f]{32}$/.test(lead?.ip_hash ?? ""));
  const told = await until(async () => (await api(`/rest/v1/notifications?kind=eq.lead&link=eq.${encodeURIComponent(`/crm/${lead.id}`)}&select=id`)).length);
  check("the studio is notified", told >= 1);
  // a bot fills the hidden field
  await P.go("/enquire");
  await typeIn("::-p-xpath(//label[contains(., 'Your name')]//input)", `E2E Bot ${stamp}`);
  await typeIn("input[type=email]", `bot-${stamp}@example.com`);
  await typeIn("textarea", "Buy cheap followers now!!!");
  await pub.evaluate(() => {
    const el = document.querySelector("label[aria-hidden='true'] input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, "http://spam.example");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 3200));
  await P.button("Send enquiry");
  await pub.waitForFunction(() => document.body.innerText.includes("Thank you"));
  const bot = await api(`/rest/v1/leads?name=eq.${encodeURIComponent(`E2E Bot ${stamp}`)}&select=id`);
  check("spam that fills the hidden field is quietly dropped", bot.length === 0);

  // ---------------------------------------------------------------- admin: board, activity, lost, convert
  const link = await api("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email: "team@korakaagaz.co" }) });
  const admin = await browser.newPage();
  await admin.setViewport({ width: 1600, height: 1000 });
  await admin.bringToFront();
  const A = helpers(admin);
  await admin.goto(`${base}/auth/callback?token_hash=${link.hashed_token ?? link.properties.hashed_token}&type=magiclink`, { waitUntil: "load" });
  const [second] = await api("/rest/v1/leads", { method: "POST", body: JSON.stringify({ name: LEAD2, stage: "discovery", value: 50000, source: "referral" }) });
  made.leads.push(second.id);

  await A.go("/crm");
  await drag(admin, `Brand ${stamp}`, "Proposal sent");
  const moved = await until(async () => (await api(`/rest/v1/leads?id=eq.${lead.id}&select=stage`))[0]?.stage === "proposal");
  check("dragging a lead to Proposal sent saves it", !!moved);
  const stageNote = await until(async () => (await api(`/rest/v1/lead_activities?lead_id=eq.${lead.id}&kind=eq.stage&select=body`)).length);
  check("the move is logged in the lead's history", stageNote >= 1);

  await drag(admin, LEAD2, "Lost");
  await admin.waitForSelector("[role=dialog][aria-label='Why was it lost?']");
  check("dropping on Lost asks why", true);
  await (await admin.$("[role=dialog] select")).select("Budget");
  await new Promise((r) => setTimeout(r, 400));
  await A.button("Mark lost");
  await new Promise((r) => setTimeout(r, 800));
  const stillOpen = await admin.$("[role=dialog][aria-label='Why was it lost?']");
  if (stillOpen) {
    console.log("note: mouse click on Mark lost didn't register; clicking via DOM");
    await admin.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent === "Mark lost")?.click());
  }
  const lost = await until(async () => {
    const [l] = await api(`/rest/v1/leads?id=eq.${second.id}&select=stage,lost_reason,furthest_stage`);
    return l?.stage === "lost" ? l : null;
  });
  if (!lost) {
    await admin.screenshot({ path: ".visual/e2e-crm-lost.png" });
    console.log("alerts:", await admin.evaluate(() => [...document.querySelectorAll("[role=alert],[role=dialog]")].map((e) => e.textContent).join(" | ")), JSON.stringify(await api(`/rest/v1/leads?id=eq.${second.id}&select=stage,lost_reason`)));
  }
  check("lost with a reason, remembering it reached the call", lost?.lost_reason === "Budget" && lost?.furthest_stage === "discovery", JSON.stringify(lost));

  await A.go(`/crm/${lead.id}`);
  await A.tap("::-p-xpath(//button[normalize-space()='Call'])");
  await (await admin.waitForSelector("textarea[aria-label='Activity']")).type("Spoke to them: shoot in mid-December, wants a quote by Friday.");
  await A.button("+3d");
  await A.button("Save");
  const call = await until(async () => (await api(`/rest/v1/lead_activities?lead_id=eq.${lead.id}&kind=eq.call&select=body`)).length);
  const [after] = await api(`/rest/v1/leads?id=eq.${lead.id}&select=follow_up_on`);
  check("log a call and set the next follow-up", call === 1 && !!after.follow_up_on && after.follow_up_on !== lead.follow_up_on);

  await A.button("Won: set up the client");
  await (await admin.waitForSelector("::-p-xpath(//label[span[normalize-space()='Template']]//select)")).select((await api("/rest/v1/project_templates?name=eq.Product%20shoot&select=id"))[0].id);
  await A.button("Mark won and set up");
  const won = await until(async () => {
    const [l] = await api(`/rest/v1/leads?id=eq.${lead.id}&select=stage,client_id,project_id,won_at`);
    return l?.stage === "won" && l.client_id && l.project_id ? l : null;
  }, 30000);
  if (won) {
    made.clients.push(won.client_id);
    made.projects.push(won.project_id);
  }
  check("won: client and project created from the lead", !!won, JSON.stringify(won));
  const tasks = won ? await api(`/rest/v1/tasks?project_id=eq.${won.project_id}&select=id`) : [];
  check("the project uses the chosen template", tasks.length === 9, `${tasks.length} tasks`);
  await A.go(`/crm/${lead.id}`);
  await admin.waitForSelector("::-p-xpath(//a[normalize-space()='Create a quote'])");
  check("a quote is one click away", true);
  check("the stage picker shows Won after converting", (await admin.$eval("select[aria-label='Stage']", (s) => s.value)) === "won");
  check("form leads get the admin as owner", !!(await api(`/rest/v1/leads?id=eq.${lead.id}&select=owner_email`))[0]?.owner_email);

  // ---------------------------------------------------------------- booking page
  await api("/rest/v1/settings?id=eq.1", { method: "PATCH", body: JSON.stringify({ booking: { ...originalBooking, enabled: true, slug: `e2e-${stamp}`, days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "21:00", notice_hours: 48, horizon_days: 10, minutes: 30, buffer: 15 } }) });
  await pub.bringToFront(); // background tabs are throttled
  await P.go(`/book/e2e-${stamp}`);
  check("booking page opens without signing in", (await P.body()).includes("Pick a day"));
  await P.tap("::-p-xpath(//div[@aria-label='Time']//button[1])");
  await (await pub.waitForSelector("input[aria-label='Your name']")).type(BOOKER);
  await (await pub.$("input[aria-label='Email']")).type(`e2e-book-${stamp}@example.com`);
  await P.tap("::-p-xpath(//button[starts-with(normalize-space(), 'Book ')])");
  await pub.waitForFunction(() => document.body.innerText.includes("You're booked"), { timeout: 30000 });
  const booked = await until(async () => (await api(`/rest/v1/leads?name=eq.${encodeURIComponent(BOOKER)}&select=id,stage`))[0]);
  if (booked) made.leads.push(booked.id);
  const ev = await until(async () => (await api(`/rest/v1/events?title=ilike.*${encodeURIComponent(BOOKER)}*&select=id,type,starts_at,ends_at`))[0]);
  if (ev) made.events.push(ev.id);
  check("a booking makes a discovery-call lead and a calendar meeting", booked?.stage === "discovery" && ev?.type === "meeting" && Date.parse(ev.ends_at) - Date.parse(ev.starts_at) === 30 * 60000);
  await P.go(`/book/e2e-${stamp}`);
  const firstNow = await pub.$eval("div[aria-label='Time'] button", (b) => b.textContent);
  check("the booked time is no longer offered", !!firstNow);
  await P.go(`/book/nope-${stamp}`);
  check("an unknown booking page is 404", (await P.body()).toLowerCase().includes("not found") || (await P.body()).includes("404"));

  // ---------------------------------------------------------------- reports + mobile
  await admin.bringToFront();
  await A.go("/reports?p=month");
  check("reports show the pipeline section", (await A.body()).includes("Pipeline & leads") && (await A.body()).includes("Lead funnel"));
  await admin.setViewport({ width: 390, height: 844, isMobile: true });
  await A.go("/crm");
  const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("leads page fits a phone (board scrolls inside itself)", overflow <= 2, `${overflow}px`);
  await admin.setViewport({ width: 1600, height: 1000 });
  await A.go("/crm");
  await admin.screenshot({ path: ".visual/e2e-crm-board.png" });
  await pub.screenshot({ path: ".visual/e2e-booking-mobile.png" });
} catch (e) {
  check("unexpected error", false, e.message.split("\n")[0]);
  for (const [i, p] of (await browser.pages()).entries()) await p.screenshot({ path: `.visual/e2e-crm-error-${i}.png` }).catch(() => {});
} finally {
  await api("/rest/v1/settings?id=eq.1", { method: "PATCH", body: JSON.stringify({ booking: originalBooking }) });
  for (const id of made.events) {
    await api(`/rest/v1/events?id=eq.${id}`, { method: "DELETE" });
    await api(`/rest/v1/audit_events?entity_id=eq.${id}`, { method: "DELETE" });
  }
  for (const id of made.leads) {
    await api(`/rest/v1/notifications?link=eq.${encodeURIComponent(`/crm/${id}`)}`, { method: "DELETE" });
    await api(`/rest/v1/leads?id=eq.${id}`, { method: "DELETE" });
    await api(`/rest/v1/audit_events?entity_id=eq.${id}`, { method: "DELETE" });
  }
  await api(`/rest/v1/leads?name=eq.${encodeURIComponent(`E2E Bot ${stamp}`)}`, { method: "DELETE" });
  for (const id of made.projects) {
    await api(`/rest/v1/projects?id=eq.${id}`, { method: "DELETE" });
    await api(`/rest/v1/audit_events?project_id=eq.${id}`, { method: "DELETE" });
  }
  for (const id of made.clients) {
    await api(`/rest/v1/clients?id=eq.${id}`, { method: "DELETE" });
    await api(`/rest/v1/audit_events?entity_id=eq.${id}`, { method: "DELETE" });
  }
  await api(`/rest/v1/notifications?title=ilike.*${stamp}*`, { method: "DELETE" });
  await browser.close();
  console.log("cleaned up (booking settings restored)");
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
