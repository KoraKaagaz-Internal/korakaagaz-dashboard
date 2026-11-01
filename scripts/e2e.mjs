// End-to-end checks of the main flows against a running app + real Supabase project.
// Signs in as the admin with an admin-generated link (no Google needed), exercises the app
// through the UI, then deletes everything it created and resets settings.
//
// Usage: node scripts/e2e.mjs [baseUrl]
// Env (e.g. from .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
import fs from "node:fs";
import puppeteer from "puppeteer";

const base = process.argv[2] ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = "team@korakaagaz.co";
if (!SUPABASE_URL || !SERVICE) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const stamp = Date.now();
const MEMBER_EMAIL = `e2e-member-${stamp}@example.com`;
const INVITE_EMAIL = `e2e-invite-${stamp}@example.com`;

const api = async (path, init = {}) => {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
};

/** Ensures an (already invited) user exists and returns a one-time sign-in URL for the app. */
async function signInUrl(email) {
  await api("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, email_confirm: true }) });
  const link = await api("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email }) });
  const hash = link.hashed_token ?? link.properties?.hashed_token;
  if (!hash) throw new Error(`generate_link failed for ${email}: ${JSON.stringify(link).slice(0, 200)}`);
  return `${base}/auth/callback?token_hash=${hash}&type=magiclink`;
}

// Safety: this test resets the workspace when it finishes. Never run it over real data.
const existing = [
  ...((await api("/rest/v1/documents?select=id&limit=1")) ?? []),
  ...((await api("/rest/v1/clients?select=id&limit=1")) ?? []),
  ...((await api("/rest/v1/projects?select=id&limit=1")) ?? []),
];
// Real team members joined: this test deletes members, so never run it then.
const people = ((await api("/rest/v1/members?select=email")) ?? []).filter((m) => m.email !== ADMIN_EMAIL);
if (people.length) {
  console.error(`Refusing to run: ${people.length} real team member(s) exist and this test removes members. Use scripts/e2e-projects.mjs, which cleans up only its own data.`);
  process.exit(2);
}
if (existing.length && process.env.E2E_FORCE_RESET !== "1") {
  console.error(
    "Refusing to run: the workspace already has clients or documents, and this test wipes them afterwards.\nRun it against an empty project, or set E2E_FORCE_RESET=1 if this is only leftover test data.",
  );
  process.exit(2);
}

const browser = await puppeteer.launch();
fs.mkdirSync(".visual", { recursive: true });

function helpers(page) {
  page.setDefaultTimeout(60000);
  const go = (path) => page.goto(path.startsWith("http") ? path : `${base}${path}`, { waitUntil: "load", timeout: 90000 });
  const centred = async (h) => {
    await h.evaluate((el) => el.scrollIntoView({ block: "center" }));
    return h;
  };
  // the inline ConfirmButton dialog's confirm (last) button
  const confirm = async () => centred(await page.waitForSelector("::-p-xpath((//span[@role='dialog']//button)[last()])"));
  const button = async (text) => centred(await page.waitForSelector(`::-p-xpath(//button[normalize-space()='${text}'] | //a[normalize-space()='${text}'])`));
  const field = async (label) => centred(await page.waitForSelector(`::-p-xpath(//label[span[normalize-space()='${label}']]//*[self::input or self::textarea or self::select])`));
  const fill = async (h, value) => {
    await centred(h);
    await h.click();
    // Clear through the native setter so React sees it (triple-click doesn't select number inputs).
    await h.evaluate((el) => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
      setter?.call(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await h.type(String(value));
  };
  const text = (sel) => page.$eval(sel, (el) => el.textContent?.trim() ?? "");
  const waitText = (t) => page.waitForFunction((s) => document.body.innerText.includes(s), { timeout: 60000 }, t);
  return { go, button, confirm, field, fill, text, waitText };
}

async function resetWorkspace() {
  for (const t of ["payments", "email_log", "document_items", "documents", "events", "projects", "kit", "leave_requests", "items", "clients", "bank_accounts"]) {
    await api(`/rest/v1/${t}?id=not.is.null`, { method: "DELETE" });
  }
  await api("/rest/v1/doc_counters?fy=neq.x", { method: "DELETE" });
  await api("/rest/v1/settings?id=eq.1", {
    method: "PATCH",
    body: JSON.stringify({ address: "", gstin: "", pan: "", signatory_name: "", query_phone: "", require_approval: false }),
  });
  await api(`/rest/v1/members?email=neq.${ADMIN_EMAIL}`, { method: "DELETE" });
  const users = await api("/auth/v1/admin/users?per_page=200");
  for (const u of users?.users ?? []) await api(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
  await api(`/rest/v1/members?email=eq.${ADMIN_EMAIL}`, { method: "PATCH", body: JSON.stringify({ joined_at: null, name: "" }) });
  await api("/rest/v1/audit_events?id=gt.0", { method: "DELETE" });
  await api("/rest/v1/notifications?id=gt.0", { method: "DELETE" });
}
if (existing.length) await resetWorkspace();

const admin = await browser.newPage();
await admin.setViewport({ width: 1400, height: 1000 });
const A = helpers(admin);
let quoteId, invoiceId;

try {
  // ---------------------------------------------------------------- access
  await A.go("/documents");
  check("signed-out visitors go to /login", admin.url().includes("/login"));
  await A.go("/auth/callback?error=server_error&error_description=Database+error+saving+new+user");
  check("uninvited Google account sees the invitation message", (await admin.evaluate(() => document.body.innerText)).includes("isn't invited"));

  await A.go(await signInUrl(ADMIN_EMAIL));
  check(
    "admin signs in and the dashboard renders",
    new URL(admin.url()).pathname === "/" && (await admin.evaluate(() => document.body.innerText)).includes("Outstanding"),
    admin.url(),
  );

  // ---------------------------------------------------------------- settings
  await A.go("/settings");
  await A.fill(await A.field("Address"), "C-12, Sector-01, Rourkela");
  await A.fill(await A.field("GSTIN (leave empty if not registered)"), "21ABCDE1234F1ZC");
  await A.fill(await A.field("PAN"), "ABCDE1234F");
  await A.fill(await A.field("Name"), "Ashmit Kumar Nayak");
  await A.fill(await A.field("Queries phone"), "+91 98765 43210");
  await (await A.button("Save settings")).click();
  await A.waitText("Settings saved.");
  check("save business settings with a valid GSTIN", true);

  await A.fill(await A.field("Label"), "Primary");
  await A.fill(await A.field("UPI ID (prints a scan-to-pay QR)"), "9876543210@okbank");
  await A.fill(await A.field("Account number"), "0012345678");
  await A.fill(await A.field("IFSC"), "ABCD0001234");
  await A.fill(await A.field("Bank name"), "Sample Bank");
  await (await A.button("Save account")).click();
  await A.waitText("A/c 0012345678");
  check("add bank account with UPI", true);

  // ---------------------------------------------------------------- clients + item
  const addClient = async (fields) => {
    await A.go("/clients");
    await (await A.button("Add client")).click();
    for (const [label, value] of fields) await A.fill(await A.field(label), value);
    await (await A.button("Save client")).click();
    await admin.waitForSelector(`::-p-xpath(//a[normalize-space()='${fields[0][1]}'])`);
  };
  await addClient([
    ["Name", "SuperDMC"],
    ["Email (invoices and reminders go here)", "accounts@superdmc.example"],
    ["GSTIN (if registered)", "21AAPFU0939F1Z7"],
  ]);
  await addClient([
    ["Name", "Globex Ltd"],
    ["Country", "United Kingdom"],
    ["Email (invoices and reminders go here)", "ap@globex.example"],
  ]);
  const clients = await api("/rest/v1/clients?select=id,name,state_code,country");
  const superdmc = clients.find((c) => c.name === "SuperDMC");
  const globex = clients.find((c) => c.name === "Globex Ltd");
  check("clients saved; GSTIN sets the state", superdmc?.state_code === "21" && globex?.country === "United Kingdom" && globex.state_code === "", JSON.stringify(clients));

  await A.go("/items");
  await A.fill(await A.field("Name"), "UI/UX design sprint");
  await A.fill(await A.field("Rate (₹)"), "20000");
  await (await A.button("Save item")).click();
  await admin.waitForSelector("::-p-xpath(//li//div[normalize-space()='UI/UX design sprint'])");
  check("add catalog item", true);

  // ---------------------------------------------------------------- quote → share → accept
  await A.go(`/documents/new?type=quote&client=${superdmc.id}`);
  const fromItems = await admin.waitForSelector("select[aria-label='Add from items']");
  const itemValue = await admin.$eval("::-p-xpath(//select[@aria-label='Add from items']/option[contains(., 'UI/UX design sprint')])", (o) => o.value);
  await fromItems.select(itemValue);
  await admin.waitForFunction(() => document.querySelector(".kk-trow-total .kk-big")?.textContent === "23,600");
  check("quote preview: catalog item + CGST/SGST = 23,600", true);
  await (await A.button("Save and issue")).click();
  await (await A.confirm()).click();
  await admin.waitForFunction(() => /\/documents\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 60000 });
  quoteId = admin.url().split("/").at(-1).split("?")[0];
  await A.waitText("QT/26-27/001");
  check("issue quote with FY number QT/26-27/001", true);

  const shareUrl = await admin.$eval("input[readonly]", (el) => el.value);
  const client = await browser.createBrowserContext();
  const cp = await client.newPage();
  const C = helpers(cp);
  await C.go(shareUrl);
  check("client opens share link while signed out", (await cp.evaluate(() => document.body.innerText)).includes("QT/26-27/001"));
  await (await C.button("Accept quote")).click();
  await C.waitText("The quote is accepted");
  const pdfHead = await cp.evaluate(
    async (u) => {
      const r = await fetch(u);
      const b = new Uint8Array(await r.arrayBuffer());
      return String.fromCharCode(...b.slice(0, 5)) + ` ${r.status} ${b.length}`;
    },
    `${shareUrl.replace("/d/", "/api/share/")}/pdf`,
  );
  check("client downloads PDF from share link", pdfHead.startsWith("%PDF-"), pdfHead);
  await client.close();

  // ---------------------------------------------------------------- convert → invoice → pay
  await A.go(`/documents/${quoteId}`);
  const quotePage = await admin.evaluate(() => document.body.innerText);
  check("quote shows accepted + client view counted", /accepted/i.test(quotePage) && !quotePage.includes("Not opened yet"));
  await (await A.button("Convert to invoice")).click();
  await admin.waitForFunction(() => /\/edit$/.test(location.pathname), { timeout: 60000 });
  await (await A.button("Save and issue")).click();
  await (await A.confirm()).click();
  await admin.waitForFunction(() => /\/documents\/[0-9a-f-]{36}$/.test(location.pathname) && document.body.innerText.includes("KK/26-27/001"), { timeout: 60000 });
  invoiceId = admin.url().split("/").at(-1).split("?")[0];
  check("convert accepted quote to invoice KK/26-27/001", true);

  const qr = await admin.$(".kk-qr svg");
  const words = await A.text(".kk-words");
  check("invoice shows UPI QR + amount in words", !!qr && words.includes("Twenty Three Thousand Six Hundred"), words.slice(0, 80));

  const pdf = await admin.evaluate(async (id) => {
    const r = await fetch(`/api/documents/${id}/pdf`);
    const b = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, head: String.fromCharCode(...b.slice(0, 5)), bytes: Array.from(b) };
  }, invoiceId);
  fs.writeFileSync(".visual/e2e-invoice.pdf", Buffer.from(pdf.bytes));
  check("download invoice PDF", pdf.status === 200 && pdf.head === "%PDF-", `${pdf.bytes.length} bytes`);

  await (await A.button("Record payment")).click();
  await (await A.button("10% · 194J professional")).click();
  const tds = await (await A.field("TDS deducted by client")).evaluate((el) => el.value);
  check("TDS shortcut = 10% of taxable value", tds === "2000", tds);
  await A.fill(await A.field("Amount received (INR)"), "10000");
  await (await A.button("Save payment")).click();
  await A.waitText("Payment recorded");
  let bal = (await api(`/rest/v1/document_balances?id=eq.${invoiceId}&select=*`))[0];
  check("partial payment + TDS → part paid", bal.payment_status === "partial" && Number(bal.balance) === 11600, `${bal.payment_status} ${bal.balance}`);
  await A.go(`/documents/${invoiceId}`);
  await (await A.button("Record payment")).click();
  await (await A.button("Save payment")).click();
  await A.waitText("Payment recorded");
  bal = (await api(`/rest/v1/document_balances?id=eq.${invoiceId}&select=*`))[0];
  check("second payment → paid", bal.payment_status === "paid" && Number(bal.balance) === 0, `${bal.payment_status} ${bal.balance}`);

  await A.go(`/documents/${invoiceId}`);
  await (await A.button("Email")).click();
  await (await A.button("Send")).click();
  await admin.waitForFunction(() => document.body.innerText.includes("SMTP_PASS") || document.body.innerText.includes("Sent to"), { timeout: 90000 });
  const log = await api(`/rest/v1/email_log?document_id=eq.${invoiceId}&select=status`);
  check("email send is logged (skipped until Gmail is set up)", log.length === 1 && ["skipped", "sent"].includes(log[0].status), log[0]?.status);

  // ---------------------------------------------------------------- credit note + export
  await A.go(`/documents/${invoiceId}`);
  await (await A.button("Credit note")).click();
  await admin.waitForFunction(() => /\/edit$/.test(location.pathname), { timeout: 60000 });
  await (await A.button("Save and issue")).click();
  await (await A.confirm()).click();
  await admin.waitForFunction(() => document.body.innerText.includes("CN/26-27/001"), { timeout: 60000 });
  check("credit note CN/26-27/001 references the invoice", (await admin.evaluate(() => document.body.innerText)).includes("Against invoice KK/26-27/001"));

  await A.go(`/documents/new?type=invoice&client=${globex.id}`);
  await A.fill(await admin.waitForSelector("input[placeholder=Title]"), "Brand guidelines");
  await A.fill(await admin.$("input[aria-label='Unit price']"), "1000");
  await A.fill(await A.field("INR per USD"), "83.5");
  await admin.waitForFunction(() => document.querySelector(".kk-trow-total .kk-big")?.textContent === "1,180");
  await (await A.button("Save and issue")).click();
  await (await A.confirm()).click();
  await admin.waitForFunction(() => document.body.innerText.includes("KK/26-27/002"), { timeout: 60000 });
  check("export invoice in USD with IGST (no LUT yet)", (await admin.evaluate(() => document.body.innerText)).includes("EXPORT ON PAYMENT OF INTEGRATED TAX"));

  // ---------------------------------------------------------------- reports + cron
  const csv = await admin.evaluate(async () => {
    const get = async (s) => (await fetch(`/api/export/gstr1?section=${s}&from=2026-04-01&to=2027-03-31`)).text();
    return { b2b: await get("b2b"), exp: await get("exp"), cdnr: await get("cdnr"), docs: await get("docs") };
  });
  check("GSTR-1 B2B row for the invoice", csv.b2b.split("\n").filter(Boolean).length === 2 && csv.b2b.includes("KK/26-27/001"));
  check("GSTR-1 export row in INR", csv.exp.includes("WPAY") && csv.exp.includes("98530"), csv.exp.split("\n")[1]);
  check("GSTR-1 credit note + Table 13 series", csv.cdnr.includes("CN/26-27/001") && csv.docs.includes("Invoices for outward supply"));

  if (process.env.CRON_SECRET) {
    const res = await fetch(`${base}/api/cron/daily?dry=1&today=2026-12-30`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const json = await res.json();
    check("daily job dry run", res.ok && json.ok === true, JSON.stringify({ reminders: json.reminders?.length, expired: json.expired?.length }));
    const unauth = await fetch(`${base}/api/cron/daily?dry=1`);
    check("daily job rejects calls without the secret", unauth.status === 401);
  }

  // ---------------------------------------------------------------- team + approval
  await A.go("/team");
  await A.fill(await admin.waitForSelector("input[type=email]"), INVITE_EMAIL);
  await (await A.button("Invite")).click();
  await A.waitText("Invited.");
  const invited = await api(`/rest/v1/members?email=eq.${INVITE_EMAIL}&select=role`);
  check("admin invites a member from the Team page", invited[0]?.role === "member");

  await api("/rest/v1/members", { method: "POST", body: JSON.stringify({ email: MEMBER_EMAIL, role: "member", invited_by: "e2e" }) });
  await api("/rest/v1/settings?id=eq.1", { method: "PATCH", body: JSON.stringify({ require_approval: true }) });
  const memberCtx = await browser.createBrowserContext();
  const mp = await memberCtx.newPage();
  await mp.setViewport({ width: 1400, height: 1000 });
  const M = helpers(mp);
  await M.go(await signInUrl(MEMBER_EMAIL));
  await M.go("/settings");
  check("member can't open Settings", mp.url().includes("denied=1"));
  await M.go(`/documents/new?type=invoice&client=${superdmc.id}`);
  await M.fill(await mp.waitForSelector("input[placeholder=Title]"), "Retainer: October");
  await M.fill(await mp.$("input[aria-label='Unit price']"), "5000");
  await (await M.button("Save and issue")).click();
  await (await M.confirm()).click();
  await mp.waitForFunction(() => /\/documents\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 60000 });
  const pendingDoc = mp.url().split("/").at(-1).split("?")[0];
  check("member's invoice waits for approval", (await api(`/rest/v1/documents?id=eq.${pendingDoc}&select=status`))[0]?.status === "awaiting_approval");
  await memberCtx.close();

  await A.go("/");
  check("dashboard lists it under approvals", (await admin.evaluate(() => document.body.innerText)).includes("Waiting for your approval"));
  await A.go(`/documents/${pendingDoc}`);
  await (await A.button("Approve and issue")).click();
  await (await A.confirm()).click();
  await A.waitText("KK/26-27/003");
  check("admin approves → KK/26-27/003", true);
  await A.go("/");
  await admin.screenshot({ path: ".visual/e2e-dashboard.png", fullPage: true });
  check("dashboard renders", (await admin.evaluate(() => document.body.innerText)).includes("Outstanding"));
} catch (e) {
  check("unexpected error", false, e.message);
  await admin.screenshot({ path: ".visual/e2e-failure.png", fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  if (!process.env.E2E_KEEP) {
    await resetWorkspace();
    console.log("cleaned up (workspace reset to empty)");
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
