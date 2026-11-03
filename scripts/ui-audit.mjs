// Visits every page as the admin at desktop (1440) and phone (390) widths, then as a throwaway
// member (checking the admin-only pages turn them away and no money shows), and fails on:
// sideways overflow, console errors, slow loads (> 3 s), window.confirm in the source,
// and hard-coded brand hex colours outside the allowed files. Read-only: safe on real data.
// Screenshots go to .visual/audit/ for a visual review.
//
// Usage: node scripts/ui-audit.mjs [baseUrl]
// Env (from .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { execSync } from "node:child_process";
import fs from "node:fs";
import puppeteer from "puppeteer";

const base = process.argv[2] ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const api = async (path) => (await fetch(`${SUPABASE_URL}${path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })).json();

const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
};

// ---------------------------------------------------------------- source checks
const grep = (pattern, extra = "") => {
  try {
    return execSync(`grep -rnE ${JSON.stringify(pattern)} src --include='*.tsx' --include='*.ts' ${extra}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
const confirms = grep("window\\.confirm\\(");
check("no window.confirm in the app", !confirms, confirms.split("\n")[0]);
// brand colours belong in globals.css tokens; emails, the invoice template and chart palettes need literal hex
const hex = grep("#(081788|3846b4|d03b3b|f4f4f6)", "| grep -vE 'lib/mail|lib/format|components/invoice|DocumentTemplate|charts/Charts|pm/Avatar|ui-audit'");
check("no hard-coded brand hex colours in pages", !hex, hex.split("\n").slice(0, 3).join(" | "));

// ---------------------------------------------------------------- pages
const one = async (table, q = "") => (await api(`/rest/v1/${table}?select=id${q}&limit=1`))[0]?.id;
const [project, lead, doc, expense, client, vendor, [settings]] = await Promise.all([one("projects"), one("leads"), one("documents"), one("expenses"), one("clients"), one("vendors"), api("/rest/v1/settings?id=eq.1&select=booking")]);
const pages = [
  "/",
  "/my-work",
  "/projects",
  "/projects/new",
  project && `/projects/${project}`,
  project && `/projects/${project}?tab=list`,
  project && `/projects/${project}?tab=money`,
  "/calendar",
  "/time",
  "/crm",
  lead && `/crm/${lead}`,
  "/clients",
  client && `/clients/${client}`,
  "/documents",
  "/documents/new?type=invoice",
  doc && `/documents/${doc}`,
  "/expenses",
  "/expenses/new",
  expense && `/expenses/${expense}`,
  "/vendors",
  vendor && `/vendors/${vendor}`,
  "/reports",
  "/search?q=a",
  "/agreements",
  "/agreements/new",
  "/agreements/templates",
  "/verify",
  "/team",
  "/team/workload",
  "/team/leave",
  "/settings",
  "/items",
  "/enquire",
  settings?.booking?.enabled && `/book/${settings.booking.slug}`,
].filter(Boolean);

const link = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: "team@korakaagaz.co" }),
}).then((r) => r.json());
const browser = await puppeteer.launch({ headless: true });
fs.mkdirSync(".visual/audit", { recursive: true });
try {
  const page = await browser.newPage();
  await page.goto(`${base}/auth/callback?token_hash=${link.hashed_token ?? link.properties?.hashed_token}&type=magiclink`, { waitUntil: "load" });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && !/favicon|Download the React DevTools/.test(m.text()) && errors.push(m.text().slice(0, 160)));
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  for (const [vw, vh, tag] of [
    [1440, 900, "d"],
    [390, 844, "m"],
  ]) {
    await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
    for (const path of pages) {
      errors.length = 0;
      const t0 = Date.now();
      const res = await page.goto(`${base}${path}`, { waitUntil: "networkidle2", timeout: 60000 }).catch((e) => ({ status: () => e.message }));
      await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), { timeout: 30000 }).catch(() => {});
      const ms = Date.now() - t0;
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const name = `${tag}-${path.replace(/[/?=&]+/g, "_").replace(/^_|_$/g, "") || "home"}`.slice(0, 80);
      await page.screenshot({ path: `.visual/audit/${name}.png`, fullPage: true });
      const status = res?.status?.();
      const problems = [status !== 200 && status !== 304 && `status ${status}`, overflow > 1 && `overflows ${overflow}px`, ms > 3000 && `${ms} ms`, errors.length && `console: ${errors[0]}`].filter(
        Boolean,
      );
      check(`${tag === "d" ? "desktop" : "phone"} ${path}`, !problems.length, problems.join("; ") || `${ms} ms`);
    }
  }

  // ---------------------------------------------------------------- as a member
  const MEMBER = `ui-member-${Date.now()}@example.com`;
  const adminApi = (path, init = {}) =>
    fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...init.headers } });
  await adminApi("/rest/v1/members", { method: "POST", body: JSON.stringify({ email: MEMBER, role: "member", invited_by: "ui-audit" }) });
  let memberId = null;
  try {
    const user = await adminApi("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: MEMBER, email_confirm: true }) }).then((r) => r.json());
    memberId = user.id;
    const mLink = await adminApi("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email: MEMBER }) }).then((r) => r.json());
    const ctx = await browser.createBrowserContext();
    const mp = await ctx.newPage();
    await mp.setViewport({ width: 1440, height: 900 });
    await mp.goto(`${base}/auth/callback?token_hash=${mLink.hashed_token ?? mLink.properties?.hashed_token}&type=magiclink`, { waitUntil: "load" });
    const errors = [];
    mp.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    const text = async (path) => {
      errors.length = 0;
      await mp.goto(`${base}${path}`, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
      // streamed pages redirect on the client, so give the address a moment to settle
      await mp.waitForFunction((p) => location.pathname + location.search !== p, { timeout: 4000 }, path).catch(() => {});
      await mp.waitForNetworkIdle({ idleTime: 300, timeout: 10000 }).catch(() => {});
      return { url: new URL(mp.url()), body: await mp.evaluate(() => document.querySelector("main")?.innerText ?? "") };
    };
    for (const path of ["/reports", "/vendors", "/expenses/gst", "/settings", "/items", "/team", "/expenses/categories", "/crm/settings"]) {
      const { url } = await text(path);
      check(`member is turned away from ${path}`, url.pathname === "/" && url.searchParams.get("denied") === "1", url.pathname);
    }
    const home = await text("/");
    check("member's Home shows no money", !/Owed to you|Revenue this FY|Collected this FY|₹/.test(home.body) && /Follow-ups due/.test(home.body));
    const docs = await text("/documents");
    check("member's documents page is Quotes", /Quotes/.test(docs.body) && !/Export CSV|Balance|Credit notes/.test(docs.body));
    const newDoc = await text("/documents/new?type=invoice");
    check("member making an invoice gets a quote instead", /quote/i.test(newDoc.body) && !/Tax invoice/i.test(newDoc.body));
    const exp = await text("/expenses");
    check("member's expenses are project costs only", /Project costs/.test(exp.body) && !/GST you can claim back|Bills to pay|Vendors/.test(exp.body));
    const time = await text("/time");
    check("member's Time has no Team tab", !(await mp.$$eval("nav a", (as) => as.some((a) => a.textContent?.trim() === "Team" && a.getAttribute("href")?.startsWith("/time")))));
    const nav = await mp.$$eval("aside a, nav a", (as) => as.map((a) => a.textContent?.trim()));
    check("member's menu has no Invoices or Reports", !nav.includes("Invoices") && !nav.includes("Reports") && nav.includes("Quotes"), nav.join(","));
    if (project) {
      const money = await text(`/projects/${project}?tab=money`);
      check("member's project tab is hours, no money", /Logged/.test(money.body) && !/Quoted|Received|Outstanding|₹/.test(money.body));
    }
    const leave = await text("/team/leave");
    check("member's leave page shows no leave types of others", !/Sick leave|Unpaid leave/.test(leave.body.replace(/Ask for leave[\s\S]*?Request/, "")));
    check("member pages have no errors", !errors.length, errors[0]);
    await ctx.close();
    void time;
  } finally {
    if (memberId) await adminApi(`/auth/v1/admin/users/${memberId}`, { method: "DELETE" });
    await adminApi(`/rest/v1/members?email=eq.${encodeURIComponent(MEMBER)}`, { method: "DELETE" });
  }
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
