// End-to-end checks of expenses, vendors, claims, GST/TDS and Reports, through the UI.
// Safe on a workspace with real data: it creates (and afterwards deletes) only its own rows.
//
// Usage: node scripts/e2e-money.mjs [baseUrl]
// Env (from .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
import fs from "node:fs";
import puppeteer from "puppeteer";

const base = process.argv[2] ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = "team@korakaagaz.co";
if (!SUPABASE_URL || !SERVICE) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const stamp = Date.now();
const FREELANCER = `e2e-money-${stamp}@example.com`;
const VENDOR = `E2E Prints ${stamp}`;
const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

const api = async (path, init = {}) => {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

// a GSTIN with a valid check digit (Karnataka, a firm: 4th PAN letter F)
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function gstin(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return first14 + CHARS[(36 - (sum % 36)) % 36];
}
const GSTIN = gstin(`29AAAFE${String(stamp).slice(-4)}P1Z`);

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
async function signInUrl(email) {
  await api("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, email_confirm: true }) });
  const link = await api("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email }) });
  return `${base}/auth/callback?token_hash=${link.hashed_token ?? link.properties?.hashed_token}&type=magiclink`;
}
function helpers(page) {
  page.setDefaultTimeout(45000);
  const settled = () => page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), { timeout: 60000 }).catch(() => {});
  const go = async (path) => {
    await page.goto(path.startsWith("http") ? path : `${base}${path}`, { waitUntil: "load", timeout: 90000 });
    await settled();
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
  const button = (text) => tap(`::-p-xpath(//button[normalize-space()='${text}'] | //a[normalize-space()='${text}'])`);
  const field = (label) => page.waitForSelector(`::-p-xpath(//label[span[normalize-space()='${label}']]//*[self::input or self::textarea or self::select])`, { visible: true });
  const fill = async (label, value) => {
    const h = await field(label);
    await h.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await h.click({ clickCount: 3 });
    await h.evaluate((el) => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
      setter?.call(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await h.type(String(value));
  };
  const select = async (label, value) => (await field(label)).select(value);
  const body = () => page.evaluate(() => document.body.innerText);
  return { go, tap, button, field, fill, select, body };
}

const browser = await puppeteer.launch();
fs.mkdirSync(".visual", { recursive: true });
const admin = await browser.newPage();
await admin.setViewport({ width: 1400, height: 1000 });
const A = helpers(admin);
const made = { client: null, project: null, docs: [], expenses: [], vendor: null };

try {
  const [client] = await api("/rest/v1/clients", { method: "POST", body: JSON.stringify({ name: `E2E Money Client ${stamp}`, state_code: "21" }) });
  made.client = client.id;
  const [project] = await api("/rest/v1/projects", { method: "POST", body: JSON.stringify({ name: `E2E money project ${stamp}`, client_id: client.id }) });
  made.project = project.id;
  await api("/rest/v1/project_finance", { method: "POST", body: JSON.stringify({ project_id: project.id }) });
  await api("/rest/v1/members", { method: "POST", body: JSON.stringify({ email: FREELANCER, role: "freelancer", name: "Mona Money", invited_by: "e2e" }) });
  await api("/rest/v1/project_members", { method: "POST", body: JSON.stringify({ project_id: project.id, member_email: FREELANCER }) });
  const cats = await api("/rest/v1/expense_categories?select=id,name");
  const cat = (n) => cats.find((c) => c.name === n).id;

  await A.go(await signInUrl(ADMIN_EMAIL));

  // ---------------------------------------------------------------- vendor
  await A.go("/vendors?new=1");
  await A.fill("Name", VENDOR);
  await A.fill("GSTIN (if registered)", GSTIN);
  await A.select("TDS when paying them", "contractor");
  await A.button("Add vendor");
  const vendor = await until(async () => (await api(`/rest/v1/vendors?name=eq.${encodeURIComponent(VENDOR)}&select=id,state_code,pan,is_company`))[0]);
  if (!vendor) {
    await admin.screenshot({ path: ".visual/e2e-vendor-fail.png", fullPage: true });
    console.log("page alert:", await admin.evaluate(() => [...document.querySelectorAll("[role=alert]")].map((e) => e.textContent).join(" | ")));
  }
  made.vendor = vendor?.id;
  check("add a vendor; state and PAN come from the GSTIN; a firm is treated as a company", vendor?.state_code === "29" && vendor?.pan === GSTIN.slice(2, 12) && vendor?.is_company === true, JSON.stringify(vendor));

  // ---------------------------------------------------------------- bill with IGST, TDS, receipt, rebill
  await A.go(`/expenses/new?kind=bill&project=${project.id}`);
  await A.select("Vendor", vendor.id);
  await A.select("Category", cat("Printing"));
  await A.fill("Bill / invoice no.", `PR-${stamp}`);
  await A.fill("What for", "Lookbook printing");
  await A.fill("Amount before GST (₹)", "40000");
  await admin.waitForFunction(() => document.body.innerText.includes("IGST"));
  check("inter-state vendor shows IGST", (await A.body()).includes("₹7,200"));
  await A.tap("::-p-xpath(//summary[contains(., 'GST credit and TDS settings')])");
  await admin.waitForFunction(() => /Single bill over/.test(document.body.innerText), { timeout: 20000 });
  check("TDS is suggested for a contract bill over ₹30,000", true);
  const billable = await admin.waitForSelector("::-p-xpath(//label[contains(., 'Bill this to the client')]//input)");
  if (!(await billable.evaluate((el) => el.checked))) await billable.click();
  await A.fill("Markup %", "10");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  fs.writeFileSync(".visual/e2e-receipt.png", png);
  await (await admin.$("input[type=file]")).uploadFile(".visual/e2e-receipt.png");
  await A.button("Save");
  await admin.waitForFunction(() => /\/expenses\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 60000 });
  const billId = admin.url().match(/expenses\/([0-9a-f-]{36})/)[1];
  made.expenses.push(billId);
  const [bill] = await api(`/rest/v1/expenses?id=eq.${billId}&select=igst,cgst,total,tds_rate,tds_amount,receipt_path,billable,markup_pct,itc_status`);
  check("bill saved: IGST 7,200, total 47,200, TDS 2% = 800", Number(bill.igst) === 7200 && Number(bill.total) === 47200 && Number(bill.tds_amount) === 800 && Number(bill.tds_rate) === 2, JSON.stringify(bill));
  check("receipt uploaded to private storage", !!bill.receipt_path?.startsWith(`expenses/${billId}/`));
  check("billable with 10% markup", bill.billable && Number(bill.markup_pct) === 10);

  // pay the bill (net of TDS)
  await A.tap("::-p-xpath(//button[normalize-space()='Record payment'])");
  const paid = await until(async () => (await api(`/rest/v1/expense_balances?expense_id=eq.${billId}`))[0]?.balance === 0 || Number((await api(`/rest/v1/expense_balances?expense_id=eq.${billId}`))[0]?.balance) === 0);
  check("recording the payment clears the bill (46,400 after TDS)", !!paid);

  // ---------------------------------------------------------------- freelancer claim
  const ctx = await browser.createBrowserContext();
  const fl = await ctx.newPage();
  await fl.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const F = helpers(fl);
  await F.go(await signInUrl(FREELANCER));
  await F.go("/expenses/new?kind=claim");
  await F.fill("Paid to (shop or person)", "Ola");
  await F.select("Category", cat("Travel & cabs"));
  await F.fill("What for", "Cab to the shoot");
  await F.fill("Amount you paid (₹)", "500");
  await F.select("Project (optional)", project.id);
  await F.button("Submit claim");
  const claim = await until(async () => (await api(`/rest/v1/expenses?created_by=eq.${encodeURIComponent(FREELANCER)}&select=id,approval,kind,total,itc_status`))[0]);
  if (claim) made.expenses.push(claim.id);
  check("freelancer files a claim from a phone", claim?.kind === "claim" && claim?.approval === "submitted", JSON.stringify(claim));
  await fl.screenshot({ path: ".visual/e2e-claim-mobile.png" });
  await F.go("/expenses");
  check("freelancer can't open studio expenses", new URL(fl.url()).pathname === "/my-work");
  await ctx.close();
  const told = await until(async () => (await api(`/rest/v1/notifications?recipient_email=eq.${encodeURIComponent(ADMIN_EMAIL)}&kind=eq.claim_submitted&select=id`)).length);
  check("admin is notified of the claim", told >= 1);

  await A.go("/expenses/claims");
  await A.tap("::-p-xpath(//button[starts-with(normalize-space(), 'Approve (')])");
  const approved = await until(async () => (await api(`/rest/v1/expenses?id=eq.${claim.id}&select=approval`))[0]?.approval === "approved");
  check("admin approves the claim", !!approved);
  await A.go("/expenses/claims");
  await A.tap("::-p-xpath(//button[starts-with(normalize-space(), 'Mark paid (')])");
  const reimbursed = await until(async () => (await api(`/rest/v1/expense_payments?expense_id=eq.${claim.id}`)).length);
  check("admin reimburses it", reimbursed === 1);

  // ---------------------------------------------------------------- rebill to the client
  await A.go(`/projects/${project.id}?tab=billing`);
  await A.tap("::-p-xpath(//button[starts-with(normalize-space(), 'Draft invoice from')])");
  await admin.waitForFunction(() => /\/documents\/[0-9a-f-]{36}\/edit/.test(location.pathname), { timeout: 60000 });
  const docId = admin.url().match(/documents\/([0-9a-f-]{36})/)[1];
  made.docs.push(docId);
  const [doc] = await api(`/rest/v1/documents?id=eq.${docId}&select=status,taxable,document_items(title,unit_price)`);
  const prices = doc.document_items.map((i) => Number(i.unit_price)).sort((a, b) => a - b);
  check("re-bill: printing at cost + 10% (44,000) and the cab at full cost (blocked credit: 500)", doc.status === "draft" && prices.join(",") === "500,44000", JSON.stringify(prices));
  const linked = await api(`/rest/v1/expenses?invoiced_document_id=eq.${docId}&select=id`);
  check("re-billed expenses are linked to the invoice", linked.length === 2);

  // ---------------------------------------------------------------- GST & TDS page, 2B match, exports
  await A.go(`/expenses/gst?month=${today.slice(0, 7)}`);
  const gstText = await A.body();
  check("ITC summary counts the bill's IGST", gstText.includes("₹7,200"));
  const csv = `GSTIN of supplier,Trade/Legal name,Invoice number,Invoice Date,Taxable Value,Integrated Tax,Central Tax,State/UT Tax\n${GSTIN},E2E,PR-${stamp},${today},40000,7200,0,0\n`;
  fs.writeFileSync(".visual/e2e-2b.csv", csv);
  await (await admin.$("input[aria-label='GSTR-2B CSV']")).uploadFile(".visual/e2e-2b.csv");
  const matched = await until(async () => (await api(`/rest/v1/expenses?id=eq.${billId}&select=gstr2b`))[0]?.gstr2b === "matched");
  check("GSTR-2B upload marks the bill matched", !!matched);
  const exportText = await admin.evaluate(async (q) => (await fetch(`/api/export/purchases?${q}`)).text(), `from=${today.slice(0, 8)}01&to=${today}`);
  check("purchase register CSV includes the bill", exportText.includes(VENDOR) && exportText.includes("7200"));
  const tdsCsv = await admin.evaluate(async (q) => (await fetch(`/api/export/tds-payable?${q}`)).text(), `from=${today.slice(0, 8)}01&to=${today}`);
  check("TDS CSV lists the deduction with the PAN", tdsCsv.includes(GSTIN.slice(2, 12)) && tdsCsv.includes("800"));

  // ---------------------------------------------------------------- recurring (dry run only)
  const [rec] = await api("/rest/v1/expenses", { method: "POST", body: JSON.stringify({ kind: "receipt", vendor_name: "E2E SaaS", category_id: cat("Software & subscriptions"), expense_date: today, taxable: 1000, total: 1000, recurring: { every: "month", next: today }, created_by: ADMIN_EMAIL }) });
  made.expenses.push(rec.id);
  const cron = await fetch(`${base}/api/cron/daily?dry=1`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
  check("daily job would draft the recurring expense", (cron.recurringExpenses ?? []).some((r) => r.from === rec.id));

  // ---------------------------------------------------------------- reports
  await A.go("/reports?p=month");
  const rep = await A.body();
  const sections = ["Profit & loss", "Clients & services", "Cash & collections", "Projects & team", "GST & exports"];
  check("reports show every section", sections.every((s) => rep.includes(s)), sections.filter((s) => !rep.includes(s)).join(","));
  check("health strip shows revenue, cash and win rate", ["Revenue", "Cash in hand", "Quote win rate"].every((s) => rep.includes(s)));
  await admin.screenshot({ path: ".visual/e2e-reports.png", fullPage: true });
  await A.tap("::-p-xpath(//button[normalize-space()='View as table'])");
  await admin.waitForSelector("::-p-xpath(//button[normalize-space()='View as chart'])");
  check("a chart switches to a table", true);
  const bar = await admin.$("svg[aria-label='Column chart'] g[tabindex='0']");
  if (bar) await bar.hover();
  check("hovering a column shows a tooltip", !!bar && !!(await admin.$("div.pointer-events-none.absolute")));
  await admin.setViewport({ width: 390, height: 844, isMobile: true });
  await A.go("/reports?p=fy");
  const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("reports fit a phone without sideways scrolling", overflow <= 2, `${overflow}px`);
  await admin.screenshot({ path: ".visual/e2e-reports-mobile.png", fullPage: true });
  await admin.setViewport({ width: 1400, height: 1000 });
  await A.go("/expenses");
  check("expenses page lists this month's bill", (await A.body()).includes(VENDOR));
  await admin.screenshot({ path: ".visual/e2e-expenses.png" });

  // ---------------------------------------------------------------- project money: payment, team split, Home
  await api(`/rest/v1/project_finance?project_id=eq.${project.id}`, { method: "PATCH", body: JSON.stringify({ budget: 20000, billing: "fixed" }) });
  await A.go(`/projects/${project.id}?tab=money`);
  await admin.waitForNetworkIdle({ idleTime: 500 }).catch(() => {}); // typing before hydration is lost
  await (await admin.waitForSelector("input[aria-label='Amount received']")).type("8000");
  await admin.waitForSelector("::-p-xpath(//button[normalize-space()='Record' and not(@disabled)])");
  await A.button("Record");
  const pay = await until(async () => (await api(`/rest/v1/payments?project_id=eq.${project.id}&select=amount,document_id`))[0]);
  check("record a payment straight on a project (no invoice)", Number(pay?.amount) === 8000 && pay?.document_id === null, JSON.stringify(pay));
  check(
    "project P&L shows received and pending",
    await until(async () => /Received\s*₹\s?8,000/.test(await A.body()) && /Pending from client\s*₹\s?12,000/.test(await A.body())),
  );
  await (await admin.waitForSelector("input[aria-label='Who']")).type("E2E Teammate");
  await admin.select("select[aria-label='₹ or %']", "pct");
  await (await admin.waitForSelector("input[aria-label='Percent of fee']")).type("30");
  await A.tap("::-p-xpath(//button[starts-with(normalize-space(), 'Add')])");
  const split = await until(async () => (await api(`/rest/v1/expenses?project_id=eq.${project.id}&vendor_name=eq.E2E%20Teammate&select=id,total,expense_categories(name)`))[0]);
  if (split) made.expenses.push(split.id);
  check("add a 30% team split as ₹ of the fee", Number(split?.total) === 6000 && split?.expense_categories?.name === "Freelancer: team split", JSON.stringify(split));
  await until(async () => (await A.body()).includes("Mark paid"));
  await A.button("Mark paid");
  const splitPaid = await until(async () => (await api(`/rest/v1/expense_payments?expense_id=eq.${split?.id}&select=amount`))[0]);
  check("mark the team split paid", Number(splitPaid?.amount) === 6000, JSON.stringify(splitPaid));
  check("project shows the split paid and your share", await until(async () => /₹\s?6,000(\.00)? paid · ₹\s?0(\.00)? to pay/.test(await A.body()) && (await A.body()).includes("Your share")));
  await A.go("/");
  const home = await A.body();
  check("Home shows received, pending and team money", ["Received this FY", "Pending from clients", "To pay team", "Net this FY", "Money in vs money out"].every((x) => home.includes(x)));
  check("Home lists the project with money pending", home.includes(`E2E money project ${stamp}`));
} catch (e) {
  check("unexpected error", false, e.message.split("\n")[0]);
  await admin.screenshot({ path: ".visual/e2e-money-error.png" }).catch(() => {});
} finally {
  const exps = made.expenses.length ? await api(`/rest/v1/expenses?id=in.(${made.expenses.join(",")})&select=id,receipt_path`) : [];
  const paths = (exps ?? []).map((e) => e.receipt_path).filter(Boolean);
  if (paths.length) await api("/storage/v1/object/files", { method: "DELETE", body: JSON.stringify({ prefixes: paths }) });
  const drafts = (await api(`/rest/v1/expenses?recurring_source_id=in.(${made.expenses.join(",") || "00000000-0000-0000-0000-000000000000"})&select=id`)) ?? [];
  for (const id of [...made.expenses, ...drafts.map((d) => d.id)]) {
    await api(`/rest/v1/expense_payments?expense_id=eq.${id}`, { method: "DELETE" });
    await api(`/rest/v1/expenses?id=eq.${id}`, { method: "DELETE" });
    await api(`/rest/v1/audit_events?entity_id=eq.${id}`, { method: "DELETE" });
  }
  for (const d of made.docs) {
    await api(`/rest/v1/document_items?document_id=eq.${d}`, { method: "DELETE" });
    await api(`/rest/v1/documents?id=eq.${d}`, { method: "DELETE" });
    await api(`/rest/v1/audit_events?entity_id=eq.${d}`, { method: "DELETE" });
  }
  if (made.vendor) {
    await api(`/rest/v1/vendors?id=eq.${made.vendor}`, { method: "DELETE" });
    await api(`/rest/v1/audit_events?entity_id=eq.${made.vendor}`, { method: "DELETE" });
  }
  if (made.project) {
    await api(`/rest/v1/payments?project_id=eq.${made.project}`, { method: "DELETE" });
    await api(`/rest/v1/projects?id=eq.${made.project}`, { method: "DELETE" });
    await api(`/rest/v1/audit_events?project_id=eq.${made.project}`, { method: "DELETE" });
  }
  if (made.client) {
    await api(`/rest/v1/clients?id=eq.${made.client}`, { method: "DELETE" });
    await api(`/rest/v1/audit_events?entity_id=eq.${made.client}`, { method: "DELETE" });
  }
  await api(`/rest/v1/notifications?or=(recipient_email.eq.${encodeURIComponent(FREELANCER)},actor_email.eq.${encodeURIComponent(FREELANCER)})`, { method: "DELETE" });
  const [m] = (await api(`/rest/v1/members?email=eq.${encodeURIComponent(FREELANCER)}&select=user_id`)) ?? [];
  await api(`/rest/v1/members?email=eq.${encodeURIComponent(FREELANCER)}`, { method: "DELETE" });
  if (m?.user_id) await api(`/auth/v1/admin/users/${m.user_id}`, { method: "DELETE" });
  await browser.close();
  console.log("cleaned up");
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
