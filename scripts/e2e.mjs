// End-to-end check against a running app + real Supabase project.
// Signs in with an admin-generated magic link (no email needed), exercises the
// main flows, then deletes everything it created.
//
// Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/e2e.mjs [baseUrl]
// Needs NEXT_PUBLIC_SUPABASE_URL and ALLOWED_EMAILS (first email is used), e.g. from .env.local.
import fs from "node:fs";
import puppeteer from "puppeteer";

const base = process.argv[2] ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = (process.env.ALLOWED_EMAILS ?? "").split(",")[0].trim();
if (!SUPABASE_URL || !SERVICE || !EMAIL) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_EMAILS");

const admin = (path, init = {}) =>
  fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...init.headers },
  });

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
};

const link = await (await admin("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email: EMAIL }) })).json();
const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
const userId = link.id ?? link.user?.id;
if (!tokenHash) throw new Error(`generate_link failed: ${JSON.stringify(link).slice(0, 200)}`);

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
page.setDefaultTimeout(60000);
const go = (path) => page.goto(`${base}${path}`, { waitUntil: "load", timeout: 90000 });
// Scroll to centre before clicking so the sticky action bar never covers the target.
const centred = async (handle) => {
  await handle.evaluate((el) => el.scrollIntoView({ block: "center" }));
  return handle;
};
const button = async (text) => centred(await page.waitForSelector(`::-p-xpath(//button[normalize-space()='${text}'])`));
const field = (label) =>
  page.waitForSelector(`::-p-xpath(//label[span[normalize-space()='${label}']]//*[self::input or self::textarea or self::select])`);
const fill = async (handle, value) => {
  await centred(handle);
  await handle.click({ clickCount: 3 });
  await handle.press("Backspace");
  await handle.type(String(value));
};

try {
  // 1. Signed-out visitors are redirected to /login
  await go("/invoices");
  check("signed-out redirect to /login", page.url().includes("/login"));

  // 2. Sign in through the callback
  await go(`/auth/callback?token_hash=${tokenHash}&type=magiclink`);
  check("sign in via magic link", page.url().endsWith("/invoices"), page.url());

  // 3. Settings
  await go("/settings");
  const settings = {
    upi_id: "9876543210@okbank",
    bank_account_no: "0012345678",
    bank_ifsc: "ABCD0001234",
    pan: "ABCDE1234F",
    query_email: "hello@korakaagaz.example",
    query_phone: "+91 98765 43210",
  };
  for (const [name, value] of Object.entries(settings)) await fill(await page.$(`input[name=${name}]`), value);
  await fill(await page.$("textarea[name=bank_address]"), "C-12, SECTOR-01,\nSAMPLE CITY, 100001");
  await (await button("Save settings")).click();
  await page.waitForSelector("::-p-text(Settings saved.)");
  check("save settings", true);

  // 4. Client
  await go("/clients");
  await (await button("Add client")).click();
  await fill(await field("Name"), "SuperDMC");
  await fill(await field("GSTIN"), "21ABCDE1234F1Z5");
  await (await button("Save client")).click();
  await page.waitForSelector("::-p-xpath(//li//div[normalize-space()='SuperDMC'])");
  check("create client", true);

  // 5. Invoice with two items, discount and GST
  await go("/invoices/new");
  await (await field("Saved client")).select(
    await page.$eval("::-p-xpath(//option[normalize-space()='SuperDMC'])", (o) => o.value),
  );
  await fill(await page.$("input[placeholder=Title]"), "UI/UX Design Engagement - SuperDMC");
  await fill(await page.$("textarea[placeholder=Description]"), "Redesign of 56 screens on one design system.");
  await fill(await page.$("input[aria-label='Unit price']"), 15000);
  await (await button("+ Add line item")).click();
  const titles = await page.$$("input[placeholder=Title]");
  await fill(titles[1], "Design system handoff");
  const prices = await page.$$("input[aria-label='Unit price']");
  await fill(prices[1], 5000);
  await (await field("GST")).select("cgst_sgst");
  const preview = await page.$eval(".kk-trow-total .kk-big", (el) => el.textContent);
  check("live preview total (20,000 + 18% GST)", preview === "23,600", preview);
  await (await button("Save")).click();
  await page.waitForFunction(() => /\/invoices\/[0-9a-f-]{36}\/edit$/.test(location.pathname), { timeout: 60000 });
  const invoiceId = page.url().split("/").at(-2);
  const heading = await page.$eval("h1", (el) => el.textContent);
  const firstNo = Number(heading.match(/-(\d{3,})$/)?.[1]);
  check("save invoice with auto number", /KK-\d{4}-\d{3,}$/.test(heading), heading);

  // 6. PDF
  const pdf = await page.evaluate(async (id) => {
    const r = await fetch(`/api/invoices/${id}/pdf`);
    const b = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, type: r.headers.get("content-type"), size: b.length, head: String.fromCharCode(...b.slice(0, 5)), bytes: Array.from(b) };
  }, invoiceId);
  fs.mkdirSync(".visual", { recursive: true });
  fs.writeFileSync(".visual/e2e.pdf", Buffer.from(pdf.bytes));
  check("download PDF", pdf.status === 200 && pdf.head === "%PDF-" && pdf.size > 10000, `${pdf.status} ${pdf.type} ${pdf.size} bytes`);
  const stored = await (await admin(`/rest/v1/invoices?id=eq.${invoiceId}&select=pdf_path,total,status`)).json();
  check("PDF saved to storage + totals stored", !!stored[0]?.pdf_path && Number(stored[0].total) === 23600, JSON.stringify(stored[0]));

  // 7. History, mark paid
  await go("/invoices");
  await page.waitForSelector(`::-p-xpath(//td//a[contains(., '-001')])`);
  await (await button("Mark paid")).click();
  await page.waitForSelector("::-p-xpath(//span[normalize-space()='paid'])");
  check("mark paid", true);

  // 8. Duplicate
  await (await button("Duplicate")).click();
  const nextNo = String(firstNo + 1).padStart(3, "0");
  await page.waitForFunction(
    (n) => /\/invoices\/[0-9a-f-]{36}\/edit$/.test(location.pathname) && document.querySelector("h1")?.textContent?.endsWith(`-${n}`),
    { timeout: 60000 },
    nextNo,
  );
  check("duplicate creates next number", true, await page.$eval("h1", (el) => el.textContent));

  // 9. Search + filters
  await go("/invoices?q=SuperDMC");
  const all = (await page.$$("tbody tr")).length;
  await go("/invoices?status=paid");
  const paid = (await page.$$("tbody tr")).length;
  await go("/invoices?q=nobody-matches");
  const none = (await page.$$("tbody tr")).length;
  check("search and status filter", all === 2 && paid === 1 && none === 0, `all=${all} paid=${paid} none=${none}`);

  // 10. Print page renders the template
  await go(`/print/${invoiceId}`);
  check("print page renders template", (await page.$$(".kk-page")).length === 1);
} catch (e) {
  check("unexpected error", false, e.message);
  await page.screenshot({ path: ".visual/e2e-failure.png", fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  // Clean up everything this run created so the account starts empty.
  if (userId) {
    const files = await (await admin(`/rest/v1/invoices?owner_id=eq.${userId}&select=pdf_path`)).json();
    const paths = files.map((f) => f.pdf_path).filter(Boolean);
    const steps = [
      paths.length && admin("/storage/v1/object/invoices", { method: "DELETE", body: JSON.stringify({ prefixes: paths }) }),
      admin(`/rest/v1/invoices?owner_id=eq.${userId}`, { method: "DELETE" }),
      admin(`/rest/v1/clients?owner_id=eq.${userId}`, { method: "DELETE" }),
      admin(`/rest/v1/settings?owner_id=eq.${userId}`, { method: "DELETE" }),
    ];
    const statuses = [];
    for (const step of steps) if (step) statuses.push((await step).status);
    const left = await (await admin(`/rest/v1/invoices?owner_id=eq.${userId}&select=id`)).json();
    check("cleanup removed test data", statuses.every((st) => st < 300) && left.length === 0, `statuses ${statuses.join(",")}`);
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
